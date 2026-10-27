#include "engine_session.h"
#include <algorithm>

namespace zp {
void EngineSession::updateMidiClips(Arrangement& a,const Request& next,const Request* previous) {
    for(const auto& track:next.tracks)for(const auto& clip:track.clips) {
        if(clip.kind!="midi")continue;
        const Clip* old=nullptr;
        if(previous)for(const auto& oldTrack:previous->tracks) {
            auto found=std::find_if(oldTrack.clips.begin(),oldTrack.clips.end(),[&](const Clip& item){return item.id==clip.id;});
            if(found!=oldTrack.clips.end()) { old=&*found;break; }
        }
        auto found=a.midiClips.find(clip.id);
        if(found==a.midiClips.end()) {
            auto native=te::insertMIDIClip(clipOwner(a,track,clip,next),clip.id,{te::TimePosition::fromSeconds(next.barTime(clip.start)),te::TimeDuration::fromSeconds(clip.length*next.secondsPerBar())});
            require(native!=nullptr,"Cannot insert MIDI clip");native->setUsesProxy(false);
            found=a.midiClips.emplace(clip.id,native.get()).first;
        }
        auto& native=*found->second;
        auto& owner=clipOwner(a,track,clip,next);if(native.getParent()!=&owner)require(native.moveTo(owner),"Cannot move MIDI clip");
        if(!old || old->kind!="midi" || old->data["notes"]!=clip.data["notes"]) {
            auto& sequence=native.getSequence();sequence.removeAllNotes(nullptr);
            for(const auto& note:array(clip.data,"notes"))sequence.addNote((int)number(note,"pitch",0,127),te::BeatPosition::fromBeats(number(note,"startBeat",0,1e12)),te::BeatDuration::fromBeats(number(note,"lengthBeats",1e-12,1e12)),(int)number(note,"velocity",0,127),0,nullptr);
        }
        const double loopBars=number(clip.data,"loopBars",1e-12,1e12);
        const bool loopChanged=!old || old->kind!="midi" || old->data["loopBars"]!=clip.data["loopBars"];
        if(loopChanged)
            native.setLoopRangeBeats({te::BeatPosition(),te::BeatDuration::fromBeats(loopBars*next.numerator)});
        if(loopChanged || (previous && next.bpm!=previous->bpm) || old->start!=clip.start || old->length!=clip.length || old->offset!=clip.offset) {
            const double offset=std::fmod(std::fmod(clip.offset,loopBars)+loopBars,loopBars);
            native.setPosition({.time={te::TimePosition::fromSeconds(next.barTime(clip.start)),te::TimeDuration::fromSeconds(clip.length*next.secondsPerBar())},.offset=te::TimeDuration::fromSeconds(offset*next.numerator/a.edit->tempoSequence.getBeatsPerSecondAt(te::TimePosition::fromSeconds(next.barTime(clip.start))))});
        }
        if(!old || old->mute!=clip.mute)native.setMuted(clip.mute);
    }
    for(auto it=a.midiClips.begin();it!=a.midiClips.end();) {
        bool retained=false;
        for(const auto& track:next.tracks)if(std::any_of(track.clips.begin(),track.clips.end(),[&](const Clip& clip){return clip.id==it->first && clip.kind=="midi";})) { retained=true;break; }
        if(retained) { ++it;continue; }
        te::Clip::Ptr removed(it->second);it=a.midiClips.erase(it);removed->removeFromParent();
    }
}
}
