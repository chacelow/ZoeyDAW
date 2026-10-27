#include "engine_session.h"
#include "recording_journal.h"
#include <algorithm>
#include <cmath>

namespace zp {
juce::File EngineSession::recordingFile(te::Track& track,const juce::String& extension) {
    require(recording && arrangement && &track.edit==arrangement->edit.get(),"Recording has no active owner");
    const auto owner=std::find_if(arrangement->tracks.begin(),arrangement->tracks.end(),[&](const auto& item){return item.second==&track;});
    require(owner!=arrangement->tracks.end(),"Recording target is not an authored track");
    auto directory=recordingRoot().getChildFile(recording->id);require(directory.createDirectory().wasOk(),"Cannot create recording directory");
    const auto fileId=juce::Uuid().toString();auto file=directory.getChildFile(fileId+extension);require(!file.exists(),"Recording destination already exists");
    auto entry=object();put(entry,"fileId",fileId);put(entry,"path",file.getFullPathName());recording->result["files"].getArray()->add(entry);
    auto thumbnail=engine.getRecordingThumbnailManager().getThumbnailFor(file);
    recording->liveTracks.emplace(file.getFullPathName(),Recording::LiveTrack{owner->first,juce::Uuid().toString(),file,thumbnail});
    auto target=object();put(target,"fileId",fileId);put(target,"trackId",owner->first);put(target,"clipId",recording->liveTracks.at(file.getFullPathName()).clipId);
    auto& transport=arrangement->edit->getTransport();auto* context=transport.getCurrentPlaybackContext();
    const auto seconds=context?context->getPendingPositionChange().value_or(context->getPosition()).inSeconds():transport.getPosition().inSeconds();
    put(target,"startBar",1+seconds/recording->secondsPerBar);recording->journalTargets.getArray()->add(target);
    writeRecordingJournal(recording->result,"recording",{},recording->journalTargets);
    return file;
}
void EngineSession::startRecording(const Request& request) {
    require(!recording && arrangement,"Recording already active or no project");
    require(request.playing,"Recording requires playback");
    auto& transport=arrangement->edit->getTransport();
    if(!transport.isPlaying() && arrangement->edit->getCurrentPlaybackContext())
        transport.freePlaybackContext();
    require(closedRecordings.size()<64,"Publish pending recordings before starting another take");
    bindInputs(*arrangement,request);
    auto* context=arrangement->edit->getTransport().getCurrentPlaybackContext();require(context!=nullptr,"Recording requires configured audio input");
    bool armed=false;
    for(auto* input:context->getAllInputs())if(!input->owner.isMidi() && !input->owner.isTrackDevice())for(const auto& track:request.tracks)
        if(track.kind=="audio" && track.armed && input->getTargets().contains(arrangement->tracks.at(track.id)->itemID))armed=true;
    require(armed,"No armed audio track has an enabled input");
    Recording next;next.id=juce::Uuid().toString();next.session=request.session;{ const std::lock_guard<std::mutex> lock(stopOwnerMutex);next.lease=stopOwner.first; }next.sourceBpm=request.bpm;next.secondsPerBar=request.secondsPerBar();next.sampleRate=engine.getDeviceManager().getSampleRate();next.result=object();
    put(next.result,"recordingId",next.id);put(next.result,"sessionId",next.session);put(next.result,"sourceBpm",next.sourceBpm);put(next.result,"files",juce::Array<V>{});put(next.result,"clips",juce::Array<V>{});
    put(next.result,"secondsPerBar",next.secondsPerBar);
    writeRecordingJournal(next.result,"recording",{},next.journalTargets);
    recording=std::move(next);
    recordingActive.store(true,std::memory_order_release);
    transport.addListener(this);
    try { transport.record(false,false); }
    catch(...) {
        recordingActive.store(false,std::memory_order_release);
        transport.removeListener(this);
        if(recording) { recording->error="Native recording failed to start";try { writeRecordingJournal(recording->result,"failed",recording->error,recording->journalTargets); }catch(const std::exception& error) { recording->error+="; "+juce::String(error.what()); }closedRecordings.insert_or_assign(recording->id,std::move(*recording));recording.reset(); }
        throw;
    }
    if(!transport.isRecording()) {
        recordingActive.store(false,std::memory_order_release);
        transport.removeListener(this);
        if(recording) { recording->error="Native recording did not start";try { writeRecordingJournal(recording->result,"failed",recording->error,recording->journalTargets); }catch(const std::exception& error) { recording->error+="; "+juce::String(error.what()); }closedRecordings.insert_or_assign(recording->id,std::move(*recording));recording.reset(); }
        throw std::runtime_error("Native recording did not start; recovery files retained");
    }
}
void EngineSession::recordingFinished(te::InputDeviceInstance&,te::EditItemID target,const juce::ReferenceCountedArray<te::Clip>& clips) {
    if(!recording || !arrangement)return;
    const auto owner=std::find_if(arrangement->tracks.begin(),arrangement->tracks.end(),[&](const auto& item){return item.second->itemID==target;});
    if(owner==arrangement->tracks.end()) { recording->error="Recording target disappeared";return; }
    for(auto* clip:clips) {
        auto* audio=dynamic_cast<te::WaveAudioClip*>(clip);
        if(!audio) { recording->error="Unexpected recording clip type";continue; }
        const auto file=audio->getSourceFileReference().getFile();
        const auto* files=recording->result["files"].getArray();
        const auto found=std::find_if(files->begin(),files->end(),[&](const V& item){return item["path"].toString()==file.getFullPathName();});
        if(found==files->end()) { recording->error="Recording file identity missing";continue; }
        const auto position=clip->getPosition();auto value=object();
        const auto live=recording->liveTracks.find(file.getFullPathName());
        put(value,"clipId",live!=recording->liveTracks.end()?live->second.clipId:juce::Uuid().toString());put(value,"fileId",(*found)["fileId"]);put(value,"trackId",owner->first);
        put(value,"startBar",1+position.getStart().inSeconds()/recording->secondsPerBar);put(value,"durationBars",position.getLength().inSeconds()/recording->secondsPerBar);put(value,"sourceOffsetBars",position.getOffset().inSeconds()/recording->secondsPerBar);
        recording->result["clips"].getArray()->add(value);
        clip->removeFromParent();
    }
}
void EngineSession::recordingStopped(te::SyncPoint,bool discarded) {
    recordingActive.store(false,std::memory_order_release);
    if(!recording)return;
    if(discarded)recording->error="Recording discarded";
    if(engine.getWaveInputRecordingThread().hasFailed())recording->error="Recording writer failed or overflowed; recovery files retained";
    if(recording->result["clips"].getArray()->isEmpty() && recording->error.isEmpty())recording->error="Recording produced no complete clips";
    if(!recording->error.isEmpty())for(const auto& file:*recording->result["files"].getArray())recording->error+="\n"+file["path"].toString();
    try { writeRecordingJournal(recording->result,recording->error.isEmpty()?"complete":"failed",recording->error,recording->journalTargets); }
    catch(const std::exception& error) { recording->error+="Recording journal failed: "+juce::String(error.what()); }
    closedRecordings.insert_or_assign(recording->id,std::move(*recording));recording.reset();
}
void EngineSession::finishRecording() {
    if(!recording || !arrangement)return;
    auto& transport=arrangement->edit->getTransport();transport.stopRecording(false);transport.removeListener(this);
    if(recording)recordingStopped({},false);
}
V EngineSession::recordingPreview(const juce::String& lease) const {
    if(!accepted)return {};
    const Recording* source=nullptr;
    if(recording && recording->session==accepted->session && recording->lease==lease)source=&*recording;
    else for(const auto& [id,closed]:closedRecordings)
        if(closed.session==accepted->session && closed.lease==lease && !closed.publishedRevision && closed.error.isEmpty())source=&closed;
    if(!source)return {};
    auto preview=object();put(preview,"sessionId",source->session);put(preview,"recordingId",source->id);
    juce::Array<V> tracks;
    constexpr int maxBins=512;
    const double sampleRate=source->sampleRate;
    if(sampleRate<=0)return {};
    for(const auto& [path,live]:source->liveTracks) {
        if(!live.thumbnail || !live.thumbnail->thumb)continue;
        const auto& thumb=*live.thumbnail->thumb;
        const auto frames=thumb.getNumSamplesFinished();
        if(frames<=0 || thumb.getNumChannels()<=0)continue;
        const auto count=static_cast<int>(std::min<juce::int64>(frames,maxBins));
        const auto finished=std::find_if(source->result["clips"].getArray()->begin(),source->result["clips"].getArray()->end(),[&](const V& clip){return clip["clipId"].toString()==live.clipId;});
        const double startBar=finished!=source->result["clips"].getArray()->end()?(double)(*finished)["startBar"]:1+live.thumbnail->punchInTime.inSeconds()/source->secondsPerBar;
        const double durationBars=finished!=source->result["clips"].getArray()->end()?(double)(*finished)["durationBars"]:frames/(sampleRate*source->secondsPerBar);
        auto track=object();put(track,"trackId",live.trackId);put(track,"clipId",live.clipId);put(track,"startBar",startBar);put(track,"durationBars",durationBars);
        juce::Array<V> channels;
        for(int channel=0;channel<thumb.getNumChannels();++channel) {
            juce::Array<V> minima,maxima;
            for(int bin=0;bin<count;++bin) {
                const auto first=(frames*bin/count)/sampleRate;
                const auto last=(frames*(bin+1)/count)/sampleRate;
                float minimum=0,maximum=0;
                thumb.getApproximateMinMax(first,last,channel,minimum,maximum);
                minima.add(std::isfinite(minimum)?minimum:0.f);maxima.add(std::isfinite(maximum)?maximum:0.f);
            }
            auto values=object();put(values,"min",minima);put(values,"max",maxima);channels.add(values);
        }
        put(track,"channels",channels);tracks.add(track);
    }
    put(preview,"tracks",tracks);return preview;
}
V EngineSession::recordingResults(const V& query) {
    fields(query,{"leaseId","sessionId"});const auto lease=text(query,"leaseId"),session=text(query,"sessionId");
    require(leases.contains(lease) && accepted && accepted->session==session,"Recording results owner mismatch");
    juce::Array<V> values;
    for(const auto& [id,result]:closedRecordings)
        if(result.lease==lease && result.session==session && result.error.isEmpty())values.add(result.result);
    auto out=object();put(out,"sessionId",session);put(out,"recordings",values);return out;
}
void EngineSession::confirmRecordingPublication(const Request& request) {
    if(request.stage!="commit" && request.stage!="recover")return;
    for(auto& [id,result]:closedRecordings) {
        if(result.session!=request.session || result.publishedRevision || result.error.isNotEmpty())continue;
        bool complete=true;
        for(const auto& item:*result.result["clips"].getArray()) {
            bool included=false;for(const auto& track:request.tracks)for(const auto& clip:track.clips)if(track.id==item["trackId"].toString() && clip.id==item["clipId"].toString() && clip.source==item["fileId"].toString())included=true;
            complete&=included;
        }
        if(complete)result.publishedRevision=request.revision;
    }
}
V EngineSession::acknowledgeRecording(const V& query) {
    fields(query,{"leaseId","sessionId","recordingId","acceptedRevision"});const auto lease=text(query,"leaseId"),session=text(query,"sessionId"),id=text(query,"recordingId");const auto revision=integer(query,"acceptedRevision");
    require(leases.contains(lease) && accepted && accepted->session==session && revision<=accepted->revision,"Recording acknowledgement owner or revision mismatch");
    const auto found=closedRecordings.find(id);if(found==closedRecordings.end())return {};
    require(found->second.lease==lease && found->second.session==session && found->second.error.isEmpty(),"Recording acknowledgement mismatch");
    require(found->second.publishedRevision && revision>=*found->second.publishedRevision,"Recording not included in an accepted document");
    writeRecordingJournal(found->second.result,"published",{},found->second.journalTargets);
    closedRecordings.erase(found);return {};
}
}
