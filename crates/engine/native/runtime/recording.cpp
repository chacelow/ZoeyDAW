#include "engine_session.h"
#include <algorithm>

namespace zp {
juce::File EngineSession::recordingFile(te::Track& track,const juce::String& extension) {
    require(recording && arrangement && &track.edit==arrangement->edit.get(),"Recording has no active owner");
    const auto overridePath=juce::SystemStats::getEnvironmentVariable("ZOEYDAW_RECORDING_PATH",{});
    auto root=overridePath.isEmpty()?juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory).getChildFile("Zoeydaw/recordings"):juce::File(overridePath);
    auto directory=root.getChildFile(recording->id);require(directory.createDirectory().wasOk(),"Cannot create recording directory");
    const auto fileId=juce::Uuid().toString();auto file=directory.getChildFile(fileId+extension);require(!file.exists(),"Recording destination already exists");
    auto entry=object();put(entry,"fileId",fileId);put(entry,"path",file.getFullPathName());recording->result["files"].getArray()->add(entry);
    return file;
}
void EngineSession::startRecording(const Request& request) {
    require(!recording && arrangement,"Recording already active or no project");
    require(request.playing,"Recording requires playback");
    require(closedRecordings.size()<64,"Publish pending recordings before starting another take");
    bindInputs(*arrangement,request);
    auto* context=arrangement->edit->getTransport().getCurrentPlaybackContext();require(context!=nullptr,"Recording requires configured audio input");
    bool armed=false;
    for(auto* input:context->getAllInputs())if(!input->owner.isMidi() && !input->owner.isTrackDevice())for(const auto& track:request.tracks)
        if(track.kind=="audio" && track.armed && input->getTargets().contains(arrangement->tracks.at(track.id)->itemID))armed=true;
    require(armed,"No armed audio track has an enabled input");
    Recording next;next.id=juce::Uuid().toString();next.session=request.session;{ const std::lock_guard<std::mutex> lock(stopOwnerMutex);next.lease=stopOwner.first; }next.sourceBpm=request.bpm;next.secondsPerBar=request.secondsPerBar();next.result=object();
    put(next.result,"recordingId",next.id);put(next.result,"sessionId",next.session);put(next.result,"sourceBpm",next.sourceBpm);put(next.result,"files",juce::Array<V>{});put(next.result,"clips",juce::Array<V>{});
    recording=std::move(next);
    auto& transport=arrangement->edit->getTransport();transport.addListener(this);
    transport.record(false,false);
    if(!transport.isRecording()) {
        transport.removeListener(this);
        if(recording) { recording->error="Native recording did not start";closedRecordings.insert_or_assign(recording->id,std::move(*recording));recording.reset(); }
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
        const auto position=clip->getPosition();auto value=object();put(value,"clipId",juce::Uuid().toString());put(value,"fileId",(*found)["fileId"]);put(value,"trackId",owner->first);
        put(value,"startBar",1+position.getStart().inSeconds()/recording->secondsPerBar);put(value,"durationBars",position.getLength().inSeconds()/recording->secondsPerBar);put(value,"sourceOffsetBars",position.getOffset().inSeconds()/recording->secondsPerBar);
        recording->result["clips"].getArray()->add(value);
        clip->removeFromParent();
    }
}
void EngineSession::recordingStopped(te::SyncPoint,bool discarded) {
    if(!recording)return;
    if(discarded)recording->error="Recording discarded";
    if(engine.getWaveInputRecordingThread().hasFailed())recording->error="Recording writer failed or overflowed; recovery files retained";
    if(recording->result["clips"].getArray()->isEmpty() && recording->error.isEmpty())recording->error="Recording produced no complete clips";
    if(!recording->error.isEmpty())for(const auto& file:*recording->result["files"].getArray())recording->error+="\n"+file["path"].toString();
    closedRecordings.insert_or_assign(recording->id,std::move(*recording));recording.reset();
}
void EngineSession::finishRecording() {
    if(!recording || !arrangement)return;
    auto& transport=arrangement->edit->getTransport();transport.stopRecording(false);transport.removeListener(this);
    if(recording)recordingStopped({},false);
}
V EngineSession::recordingResults(const V& query) {
    fields(query,{"leaseId","sessionId"});const auto lease=text(query,"leaseId"),session=text(query,"sessionId");
    require(leases.contains(lease) && accepted && accepted->session==session,"Recording results owner mismatch");
    juce::Array<V> values;
    for(const auto& [id,result]:closedRecordings)if(result.lease==lease && result.session==session) {
        require(result.error.isEmpty(),result.error);values.add(result.result);
    }
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
    closedRecordings.erase(found);return {};
}
}
