#include "engine_session.h"
#include <algorithm>

namespace zp {
namespace {
te::LaunchQType launchQuantization(const juce::String& value) {
    static constexpr std::pair<const char*,te::LaunchQType> types[] {
        {"none",te::LaunchQType::none}, {"eightBars",te::LaunchQType::eightBars},
        {"fourBars",te::LaunchQType::fourBars}, {"twoBars",te::LaunchQType::twoBars},
        {"bar",te::LaunchQType::bar}, {"half",te::LaunchQType::half},
        {"quarter",te::LaunchQType::quarter}, {"eighth",te::LaunchQType::eighth},
        {"sixteenth",te::LaunchQType::sixteenth}
    };
    for(const auto& [name,type]:types)if(value==name)return type;
    throw std::invalid_argument("Invalid launch quantization");
}
}

void EngineSession::updateLauncherLayout(Arrangement& a,const Request& request) {
    auto& list=a.edit->getSceneList();
    for(auto* scene:list.getScenes()) {
        const auto id=scene->state["zoeydawSceneId"].toString();
        if(std::find(request.scenes.begin(),request.scenes.end(),id)!=request.scenes.end())continue;
        const auto index=scene->getIndex();
        for(const auto& [trackId,track]:a.tracks) {
            auto slots=track->getClipSlotList().getClipSlots();
            if(index>=slots.size())continue;
            if(auto* clip=slots[index]->getClip()) {
                const auto clipId=clip->getName();
                a.envelopes.erase(clipId);a.audioClips.erase(clipId);a.midiClips.erase(clipId);
            }
        }
        list.deleteScene(*scene);
    }
    for(size_t index=0;index<request.scenes.size();++index) {
        auto scenes=list.getScenes();
        const auto found=std::find_if(scenes.begin(),scenes.end(),[&](auto* scene){return scene->state["zoeydawSceneId"].toString()==request.scenes[index];});
        if(found==scenes.end()) {
            auto* scene=list.insertScene((int)index);scene->state.setProperty("zoeydawSceneId",request.scenes[index],nullptr);
        } else if((*found)->getIndex()!=(int)index)list.moveScene((*found)->getIndex(),(int)index);
    }
    a.edit->getLaunchQuantisation().type=launchQuantization(request.launchQuantization);
}

te::ClipOwner& EngineSession::clipOwner(Arrangement& a,const Track& track,const Clip& clip,const Request& request) {
    auto* native=a.tracks.at(track.id);
    if(clip.scene.isEmpty())return *native;
    const auto scene=std::find(request.scenes.begin(),request.scenes.end(),clip.scene);
    require(scene!=request.scenes.end(),"Missing slot scene");
    return *native->getClipSlotList().getClipSlots()[(int)std::distance(request.scenes.begin(),scene)];
}

bool EngineSession::validLaunch(const LaunchCommand& command) const {
    if(!accepted || !arrangement)return false;
    if(command.kind==LaunchCommand::Kind::arrangement || command.kind==LaunchCommand::Kind::stopAll)return true;
    if(command.kind==LaunchCommand::Kind::scene)return std::find(accepted->scenes.begin(),accepted->scenes.end(),command.scene)!=accepted->scenes.end();
    const auto track=std::find_if(accepted->tracks.begin(),accepted->tracks.end(),[&](const Track& track){return track.id==command.track && (track.kind=="audio" || track.kind=="midi");});
    if(track==accepted->tracks.end())return false;
    if(command.kind==LaunchCommand::Kind::stopTrack)return true;
    return std::any_of(track->clips.begin(),track->clips.end(),[&](const Clip& clip){return clip.scene==command.scene;});
}

void EngineSession::launch(const LaunchCommand& command) {
    auto& edit=*arrangement->edit;
    std::optional<te::MonotonicBeat> position;
    if(command.quantize && edit.getTransport().isPlaying() && command.kind!=LaunchCommand::Kind::arrangement) {
        const auto q=launchQuantization(accepted->launchQuantization);
        if(q!=te::LaunchQType::none) {
            auto* context=edit.getTransport().getCurrentPlaybackContext();
            const auto sync=context?context->getSyncPoint():std::nullopt;
            require(sync.has_value(),"No audio sync point for quantized launch");
            const auto beat=te::getNext(q,edit.tempoSequence,sync->beat);
            position=te::MonotonicBeat { sync->monotonicBeat.v+(beat-sync->beat) };
        }
    }
    for(const auto& track:accepted->tracks) {
        if(track.kind!="audio" && track.kind!="midi")continue;
        if((command.kind==LaunchCommand::Kind::clip || command.kind==LaunchCommand::Kind::stopTrack) && track.id!=command.track)continue;
        auto* native=arrangement->tracks.at(track.id);
        bool hadPlayingClip=false;
        for(const auto& clip:track.clips) {
            if(clip.scene.isEmpty())continue;
            te::Clip* instance=nullptr;
            if(clip.kind=="audio") { const auto found=arrangement->audioClips.find(clip.id);if(found!=arrangement->audioClips.end())instance=found->second; }
            else { const auto found=arrangement->midiClips.find(clip.id);if(found!=arrangement->midiClips.end())instance=found->second; }
            if(!instance)continue;
            if(auto handle=instance->getLaunchHandle()) {
                hadPlayingClip=hadPlayingClip || handle->getPlayingStatus()==te::LaunchHandle::PlayState::playing;
                if((command.kind==LaunchCommand::Kind::clip || command.kind==LaunchCommand::Kind::scene) && clip.scene==command.scene)handle->play(position);
                else handle->stop(position);
            }
        }
        if(command.kind==LaunchCommand::Kind::arrangement)native->playSlotClips=false;
        else if(hadPlayingClip)native->playSlotClips=true;
    }
}

V EngineSession::launcherSnapshot() const {
    if(!accepted || !arrangement)return {};
    auto snapshot=object();put(snapshot,"sessionId",accepted->session);put(snapshot,"sequence",(juce::int64)appliedSequence);
    juce::Array<V> tracks;
    const bool transportPlaying=arrangement->edit->getTransport().isPlaying();
    for(const auto& track:accepted->tracks) {
        if(track.kind!="audio" && track.kind!="midi")continue;
        auto native=arrangement->tracks.find(track.id);if(native==arrangement->tracks.end())continue;
        auto item=object();put(item,"trackId",track.id);bool anyPlaying=false;
        juce::Array<V> slots;
        for(const auto& clip:track.clips) {
            if(clip.scene.isEmpty())continue;
            auto slot=object();put(slot,"sceneId",clip.scene);put(slot,"clipId",clip.id);put(slot,"playing",false);put(slot,"queued",V());
            te::Clip* instance=nullptr;
            if(clip.kind=="audio") { const auto found=arrangement->audioClips.find(clip.id);if(found!=arrangement->audioClips.end())instance=found->second; }
            else { const auto found=arrangement->midiClips.find(clip.id);if(found!=arrangement->midiClips.end())instance=found->second; }
            if(instance)if(auto handle=instance->getLaunchHandle()) {
                const bool playing=handle->getPlayingStatus()==te::LaunchHandle::PlayState::playing;
                anyPlaying=anyPlaying || playing;put(slot,"playing",transportPlaying && playing);
                if(auto queued=handle->getQueuedStatus();queued && (*queued==te::LaunchHandle::QueueState::playQueued || playing))
                    put(slot,"queued",*queued==te::LaunchHandle::QueueState::playQueued?"play":"stop");
            }
            slots.add(slot);
        }
        put(item,"source",native->second->playSlotClips.get() || anyPlaying?"launcher":"arrangement");
        put(item,"slots",slots);tracks.add(item);
    }
    put(snapshot,"tracks",tracks);return snapshot;
}
}
