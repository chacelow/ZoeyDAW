#include "engine_session.h"
#include <algorithm>

namespace zp {
void EngineSession::bindInputs(Arrangement& a,const Request& request) {
    const bool changed=request.bpm!=a.inputState.bpm || request.numerator!=a.inputState.numerator || request.denominator!=a.inputState.denominator || request.tracks.size()!=a.inputState.tracks.size() || std::any_of(request.tracks.begin(),request.tracks.end(),[&](const Track& track) {
        const auto old=std::find_if(a.inputState.tracks.begin(),a.inputState.tracks.end(),[&](const Track& item){return item.id==track.id;});
        if(old==a.inputState.tracks.end() || old->kind!=track.kind || old->input!=track.input || old->inputChannel!=track.inputChannel || old->monitor!=track.monitor || old->armed!=track.armed || old->clips.size()!=track.clips.size())return true;
        for(size_t index=0;index<track.clips.size();++index)if(track.clips[index].start!=old->clips[index].start || track.clips[index].length!=old->clips[index].length || track.clips[index].mute!=old->clips[index].mute)return true;
        return false;
    });
    if(changed)a.inputState=request;
    for(const auto& track:request.tracks)for(const auto& clip:track.clips)if(clip.kind=="audio")
        if(const auto found=a.audioClips.find(clip.id);found!=a.audioClips.end())
            if(const bool muted=clip.mute || (track.kind=="audio" && track.input=="external" && track.monitor=="in");found->second->isMuted()!=muted)
                found->second->setMuted(muted);
    auto& transport=a.edit->getTransport();
    auto& manager=engine.getDeviceManager();
    auto* device=manager.deviceManager.getCurrentAudioDevice();
    for(int i=a.issues.size();--i>=0;)if(a.issues[i]["code"]==V("input-monitor-unavailable"))a.issues.remove(i);
    const bool wantsInput=std::any_of(request.tracks.begin(),request.tracks.end(),[](const Track& track){return track.kind=="audio" && track.input=="external";});
    if(!device || !device->isOpen() || !wantsInput) {
        monitoringAudible.store(false,std::memory_order_release);
        if(auto* context=transport.getCurrentPlaybackContext())for(auto* input:context->getAllInputs())if(!input->owner.isMidi() && !input->owner.isTrackDevice())
            for(auto target:input->getTargets()) { auto removed=input->removeTarget(target,nullptr);require(removed.wasOk(),removed.getErrorMessage()); }
        if(wantsInput)a.issues.add(issue("input-monitor-unavailable","Configure and authorize an audio input before monitoring"));
        return;
    }
    a.edit->playInStopEnabled=true;
    transport.ensureContextAllocated();
    auto* context=transport.getCurrentPlaybackContext();require(context!=nullptr,"Input monitoring requires playback context");
    te::TransportControl::ReallocationInhibitor inhibit(transport);
    bool audible=false;
    for(const auto& track:request.tracks) {
        auto* native=a.tracks.at(track.id);
        te::InputDeviceInstance* selected=nullptr;
        if(track.kind=="audio" && track.input=="external")for(auto* input:context->getAllInputs()) {
            auto* wave=dynamic_cast<te::WaveInputDevice*>(&input->owner);
            if(!wave || wave->isTrackDevice() || !wave->isEnabled())continue;
            const auto& channels=wave->getChannels();
            juce::String name(channels[0].indexInDevice+1);
            if(channels.getNumChannels()>1)name+="-"+juce::String(channels[channels.getNumChannels()-1].indexInDevice+1);
            if(name==track.inputChannel) { selected=input;break; }
        }
        for(auto* input:context->getAllInputs())if(!input->owner.isMidi() && !input->owner.isTrackDevice() && input!=selected && input->getTargets().contains(native->itemID)) {
            const auto removed=input->removeTarget(native->itemID,nullptr);require(removed.wasOk(),removed.getErrorMessage());
        }
        if(!selected) {
            if(track.kind=="audio" && track.input=="external")a.issues.add(issue("input-monitor-unavailable","Requested input channel is not enabled",{},track.id));
            continue;
        }
        if(!selected->getTargets().contains(native->itemID)) {
            const auto assigned=selected->setTarget(native->itemID,false,nullptr);
            require(assigned.has_value(),assigned?juce::String():assigned.error());require(assigned.value()!=nullptr,"Input target could not be assigned");
        }
        selected->setRecordingEnabled(native->itemID,track.armed);
        audible|=track.monitor=="in" || (track.monitor=="auto" && track.armed);
    }
    monitoringAudible.store(audible,std::memory_order_release);
    if(changed)a.edit->restartPlayback();
    a.edit->dispatchPendingUpdatesSynchronously();
}
}
