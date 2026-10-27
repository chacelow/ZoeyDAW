#include "engine_session.h"
#include "isolated_device_plugin.h"
#include <algorithm>

namespace zp {
V EngineSession::apply(const V& v) {
    fields(v,{"request","leaseId","stopToken","stopEpoch"});auto r=decode(field(v,"request"));auto lease=text(v,"leaseId");require(lease.isNotEmpty(),"Empty playback lease");const auto token=integer(v,"stopToken"),fence=integer(v,"stopEpoch");
    const bool opening=r.stage=="open";
    if(fence<stopToken.load() || token<leaseStopTokens[lease])return result(r,false,opening?"superseded-open":"rejected");
    if((opening && ((accepted && (leases.count(lease) || r.session==accepted->session)) || r.baseRevision!=0 || r.revision!=0)) || (!opening && (!accepted || !leases.count(lease) || r.session!=accepted->session || r.sequence<=appliedSequence || r.baseRevision!=accepted->revision)))return result(r,false,"protocol");
    if(!opening && r.controlGeneration<=accepted->controlGeneration) { static_cast<Control&>(r)=static_cast<const Control&>(*accepted);r.controlGeneration=accepted->controlGeneration; }
    if(r.recording && (!r.playing || !configuration || configuration->inputDeviceId.isEmpty()))return result(r,false,"rejected");
    if(recording && (opening || !sameGraph(r,*accepted)))return result(r,false,"rejected");
    for(const auto& track:r.tracks)for(const auto& clip:track.clips)if(clip.kind=="audio") {
        const auto validateRatio=[&](double bpm) {
            const double ratio=clip.settings.warp?bpm/clip.settings.sourceBpm:1.0;
            require(ratio>=te::ClipConstants::speedRatioMin && ratio<=te::ClipConstants::speedRatioMax,"Tempo ratio exceeds the native time-stretcher range");
        };
        validateRatio(r.bpm);for(const auto& section:r.tempo)validateRatio(section.bpm);
    }
    if(opening)publishPendingStopOwner({lease.toStdString(),r.session.toStdString()});
    struct ClearPending { EngineSession& owner; bool active; ~ClearPending() { if(active)owner.publishPendingStopOwner({}); } } clearPending {*this,opening};
    if(opening && fence<pendingOwnerStopEpoch.load(std::memory_order_acquire))return result(r,false,"superseded-open");
    const bool replace=opening || !accepted || !sameGraph(r,*accepted,true);
    for(const auto& track:r.tracks)for(const auto& device:track.devices)if(const auto* external=std::get_if<ExternalSettings>(&device.settings)) {
        te::Plugin* retained=nullptr;
        if(!replace && arrangement)if(const auto found=arrangement->devices.find(device.id);found!=arrangement->devices.end())retained=found->second.get();
        const auto* isolated=dynamic_cast<IsolatedDevicePlugin*>(retained);
        if(!isolated || !isolated->matches(*external)) {
            const auto admission=std::find_if(pluginAdmissions.begin(),pluginAdmissions.end(),[&](const auto& entry) {
                return entry.second.lease==lease && entry.second.session==r.session && entry.second.device==device.id && entry.second.revision==r.baseRevision;
            });
            require(admission!=pluginAdmissions.end(),"External device has no prepared admission");
        }
    }
    const bool graphChanged=replace || !sameGraph(r,*accepted);
    auto preparedSources=graphChanged?std::optional<SourceRegistry>(sourceRegistry.prepare(r)):std::nullopt;
    auto candidate=replace?prepare(r):nullptr;
    if(fence<stopToken.load() || (opening && fence<pendingOwnerStopEpoch.load(std::memory_order_acquire)))return result(r,false,opening?"superseded-open":"rejected");
    if(r.playing)openDevice();
    else if(opening) {
        loadConfiguration();
        if(configuration && configuration->inputDeviceId.isNotEmpty())try { openDevice(); }
        catch(const std::exception&) { /* Device error and input-monitor-unavailable are reported by telemetry. */ }
    }
    auto response=result(r,true);
    const auto& request=r;
    auto owner=std::make_pair(lease.toStdString(),r.session.toStdString());
    std::optional<TransportClockMutation> clockMutation;
    {
        const std::lock_guard<std::mutex> lock(stopOwnerMutex);
        if(fence<stopToken.load(std::memory_order_acquire) || (opening && fence<pendingOwnerStopEpoch.load(std::memory_order_acquire)))return result(request,false,opening?"superseded-open":"rejected");
        clockMutation.emplace(*transportControls,replace);
        stopOwner.swap(owner);
    }
    const bool seek=opening || !accepted || request.seekGeneration!=accepted->seekGeneration;
    const bool tempoChanged=accepted && !request.sameTempo(*accepted);
    double position=request.barTime(request.seekBar);
    if(arrangement && accepted) {
        auto& previousTransport=arrangement->edit->getTransport();
        auto current=previousTransport.getPosition();
        if(previousTransport.isPlaying())if(auto* context=previousTransport.getCurrentPlaybackContext())
            current=context->getPendingPositionChange().value_or(context->getAudibleTimelineTime());
        position=request.barTime(accepted->timeBar(current.inSeconds()));
    }
    if(candidate) { allNotesOff();if(arrangement)arrangement->edit->getTransport().stop(false,true);arrangement=std::move(candidate);routeOutputs(*arrangement,request); }
    else {
        te::TransportControl::ReallocationInhibitor inhibit(arrangement->edit->getTransport());
        if(tempoChanged)updateTempo(*arrangement,request);
        for(const auto& track:request.tracks)if(!arrangement->tracks.contains(track.id)) {
            auto native=arrangement->edit->insertNewAudioTrack(te::TrackInsertPoint::getEndOfTracks(*arrangement->edit),nullptr);require(native!=nullptr,"Cannot create arrangement track");
            initialiseTrack(*arrangement,*native,track,request);
        }
        for(const auto& track:request.tracks) {
            const auto old=std::find_if(accepted->tracks.begin(),accepted->tracks.end(),[&](const Track& item){return item.id==track.id;});
            if(old!=accepted->tracks.end() && old->kind!=track.kind)updateTrackKind(*arrangement,*arrangement->tracks.at(track.id),track);
        }
        updateLauncherLayout(*arrangement,request);
        updateMixer(*arrangement,request,*accepted);updateEnvelopes(*arrangement,request,*accepted);
        updateDevices(*arrangement,request,&*accepted);
        updateMidiClips(*arrangement,request,&*accepted);
        bool outputChanged=false;
        for(const auto& track:request.tracks) {
            const auto old=std::find_if(accepted->tracks.begin(),accepted->tracks.end(),[&](const Track& item){return item.id==track.id;});
            if(old==accepted->tracks.end() || track.output!=old->output || track.outputChannel!=old->outputChannel || track.cueOutput!=old->cueOutput) { outputChanged=true;break; }
        }
        if(outputChanged)routeOutputs(*arrangement,request);
        removeUnusedTracks(*arrangement,request);
    }
    bindInputs(*arrangement,request);
    auto& transport=arrangement->edit->getTransport();arrangement->edit->clickTrackEnabled=request.metronome;
    if(seek || replace || request.playing!=transport.isPlaying())for(const auto& [id,device]:arrangement->devices)device->reset();
    if(replace || tempoChanged || request.loopStart!=accepted->loopStart || request.loopEnd!=accepted->loopEnd)transport.setLoopRange({te::TimePosition::fromSeconds(request.barTime(request.loopStart)),te::TimePosition::fromSeconds(request.barTime(request.loopEnd))});
    if(replace || request.loop!=accepted->loop)transport.looping=request.loop;
    if(!request.playing && transport.isPlaying())transport.stop(false,false);
    if(seek || replace) { ++transportSeeks;transport.setPosition(te::TimePosition::fromSeconds(seek?request.barTime(request.seekBar):position)); }
    else if(tempoChanged && !transport.isPlaying())transport.setPosition(te::TimePosition::fromSeconds(position));
    auto previousFence=stopToken.load(std::memory_order_acquire);while(previousFence<fence && !stopToken.compare_exchange_weak(previousFence,fence,std::memory_order_acq_rel)) {}
    arrangementEpoch.store(fence,std::memory_order_release);arrangementAudible.store(request.playing,std::memory_order_release);
    if(recording && !request.recording)finishRecording();
    if(request.recording && !recording)startRecording(request);
    if(request.playing && fence>=stopToken.load()) { if(!transport.isPlaying()) { ++transportStarts;transport.play(false); } }else if(transport.isPlaying())transport.stop(false,false);
    appliedSequence=request.sequence;if(opening) { leases.clear();noteSequences.clear();noteCutoffs.clear();heldNotes.clear(); }leases.insert(lease);accepted=std::move(r);if(preparedSources)sourceRegistry=std::move(*preparedSources);
    std::erase_if(pluginAdmissions,[&](const auto& entry) {
        return entry.second.session!=accepted->session || entry.second.revision!=accepted->revision || !leases.count(entry.second.lease);
    });
    pluginBindings.collect();
    confirmRecordingPublication(*accepted);
    clockMutation->publish(*accepted,appliedSequence,stoppedTransportPosition());
    return response;
}
}
