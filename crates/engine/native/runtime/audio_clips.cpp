#include "engine_session.h"
#include "audio_clips.h"
#include "realtime_snapshot.h"
#include <algorithm>
#include <cmath>

namespace zp {
namespace {
te::TimeStretcher::Mode warpProcessor(const juce::String& mode) {
    if(mode=="soundtouch")return te::TimeStretcher::soundtouchBetter;
    if(mode=="re-pitch")return te::TimeStretcher::soundtouchRepitch;
    if(mode=="signalsmith")return te::TimeStretcher::signalsmithDefault;
    if(mode=="signalsmith-formant")return te::TimeStretcher::signalsmithFormant;
    throw std::runtime_error("Invalid warp mode");
}
double audioSourceStart(double offset,double markerStart) {
    return offset<0?offset:std::max(offset,markerStart);
}
te::ClipPosition audioPosition(const Clip& clip,const Request& request) {
    const double ratio=clip.settings.warp?request.bpm/clip.settings.sourceBpm:1.0;
    const double sourceBar=request.quartersPerBar*60/clip.settings.sourceBpm;
    double offset=audioSourceStart(clip.offset,clip.settings.markerStart);
    if(clip.settings.loop)offset=std::fmod(std::fmod(offset-clip.settings.loopStart,clip.settings.loopLength)+clip.settings.loopLength,clip.settings.loopLength);
    const double length=clip.length*request.secondsPerBar();
    const double delay=std::min(length,std::max(0.0,-offset*sourceBar/ratio));
    return {.time={te::TimePosition::fromSeconds(request.barTime(clip.start)+delay),te::TimeDuration::fromSeconds(length-delay)},.offset=te::TimeDuration::fromSeconds(std::max(0.0,offset)*sourceBar/ratio)};
}
class Envelope final : public te::Plugin {
public:
    explicit Envelope(te::PluginCreationInfo info):Plugin(info) {}
    void configure(const Clip& c,const Request& r) {
        Parameters next;
        next.window={r.barTime(c.start),c.length,c.offset,c.settings.markerStart,c.settings.markerEnd,r.secondsPerBar(),r.quartersPerBar*60/c.settings.sourceBpm,c.settings.warp?r.bpm/c.settings.sourceBpm:1,c.settings.loop};
        next.fade={c.fadeIn,c.fadeOut,c.fadeInOffset,c.fadeOutOffset,c.fadeInCurve,c.fadeOutCurve,c.fadeInPosition,c.fadeOutPosition};
        parameters.publish(next);
    }
    juce::String getName() const override { return "Source window and fades"; }
    juce::String getSelectableDescription() override { return getName(); }
    juce::String getPluginType() override { return "zoeydaw-source-envelope"; }
    BusLayout getBusses() const override { return BusLayout::singlePassThrough(); }
    int getNumOutputChannelsGivenInputs(int n) override { return n; }
    void initialise(const te::PluginInitialisationInfo& i) override { rate=i.sampleRate; }
    void deinitialise() override {}
    void applyToBuffer(const te::PluginRenderContext& rc) override {
        if(!rc.destBuffer)return;
        parameters.readLatest(current);
        const auto& window=current.window;
        const auto& fade=current.fade;
        double t=rc.editTime.getStart().inSeconds()-window.start;
        for(int i=0;i<rc.bufferNumSamples;++i,t+=1/rate) {
            const double bar=t/window.barSeconds;
            double gain=1;
            if(fade.fadeIn>0)gain*=shape((bar-fade.fadeInOffset)/fade.fadeIn,fade.fadeInPosition,fade.fadeInCurve);
            if(fade.fadeOut>0)gain*=1-shape((bar-(window.length-fade.fadeOutOffset-fade.fadeOut))/fade.fadeOut,fade.fadeOutPosition,fade.fadeOutCurve);
            if(!window.loop) {
                double source=audioSourceStart(window.offset,window.markerStart)*window.sourceBarSeconds+t*window.ratio;
                if(source<window.markerStart*window.sourceBarSeconds || source>=window.markerEnd*window.sourceBarSeconds)gain=0;
            }
            for(int ch=0;ch<rc.destBuffer->getNumChannels();++ch)rc.destBuffer->getWritePointer(ch)[rc.bufferStartSample+i]*=(float)gain;
        }
    }
private:
    static double shape(double x,double position,double bend) noexcept {
        x=std::clamp(x,0.0,1.0); const double y=.5+std::clamp(bend,-1.0,1.0)*.4;
        const double p=std::clamp(position,.1,.9), ratio=p/(1-p), w=ratio*ratio*(1-y)/y;
        return x*x/(x*x+w*(1-x)*(1-x));
    }
    struct SourceWindow {
        double start=0,length=0,offset=0,markerStart=0,markerEnd=0,barSeconds=1,sourceBarSeconds=1,ratio=1;
        bool loop=false;
    };
    struct Fades {
        double fadeIn=0,fadeOut=0,fadeInOffset=0,fadeOutOffset=0,fadeInCurve=0,fadeOutCurve=0,fadeInPosition=.5,fadeOutPosition=.5;
    };
    struct Parameters { SourceWindow window; Fades fade; };
    RealtimeSnapshot<Parameters> parameters;
    Parameters current;
    double rate=48000;
};
}
te::Plugin::Ptr createSourceEnvelope(te::PluginCreationInfo info) { return te::Plugin::Ptr(new Envelope(info)); }
void EngineSession::insertAudioClip(Arrangement& a,te::AudioTrack& track,const Track& t,const Clip& c,const Request& r) {
    auto source=r.sources.find(c.source);
    if(source==r.sources.end() || !source->second.file.existsAsFile()) { a.issues.add(issue("source-offline","Audio source is unavailable; clip is silent",c.source,t.id,c.id));return; }
    const auto& src=source->second;
    std::unique_ptr<juce::AudioFormatReader> reader(engine.getAudioFileFormatManager().readFormatManager.createReaderFor(src.file));
    if(!reader) { a.issues.add(issue("source-decode","Audio source cannot be decoded; clip is silent",src.id,t.id,c.id));return; }
    if(reader->lengthInSamples!=src.frames || reader->sampleRate!=src.rate || (int)reader->numChannels!=src.channels) { a.issues.add(issue("source-changed","Audio source metadata changed; clip is silent",src.id,t.id,c.id));return; }
    const double ratio=c.settings.warp?r.bpm/c.settings.sourceBpm:1.0;
    const double authoredPitch=c.settings.transpose+c.settings.detune/100;
    require(ratio>=te::ClipConstants::speedRatioMin && ratio<=te::ClipConstants::speedRatioMax,"Tempo ratio exceeds the native time-stretcher range");
    juce::ValueTree state(te::IDs::PLUGIN);state.setProperty(te::IDs::type,"zoeydaw-source-envelope",nullptr);
    auto envelope=a.edit->getPluginCache().createNewPlugin(state);require(envelope!=nullptr,"Cannot create source envelope");
    dynamic_cast<Envelope&>(*envelope).configure(c,r);
    auto clip=te::insertWaveClip(track,c.id,src.file,{.time={te::TimePosition::fromSeconds(r.barTime(c.start)),te::TimeDuration::fromSeconds(c.length*r.secondsPerBar())}},te::DeleteExistingClips::no);
    require(clip!=nullptr,"Cannot schedule audio clip");
    clip->setUsesProxy(false);clip->setAutoTempo(c.settings.warp);clip->setAutoPitch(false);clip->setAutoCrossfade(false);clip->setFadeIn({});clip->setFadeOut({});clip->setGainDB((float)c.gain);clip->setMuted(c.mute);clip->setPan(0);
    if(c.settings.warp) {
        auto& info=clip->getLoopInfo();info.setNumerator(r.numerator);info.setDenominator(r.denominator);
        info.setNumBeats(src.frames/src.rate*c.settings.sourceBpm/60);
    }
    const bool disableStretch=!c.settings.warp && authoredPitch==0;
    clip->setTimeStretchMode(disableStretch?te::TimeStretcher::disabled:warpProcessor(c.settings.mode));
    clip->setSpeedRatio(1.0);clip->state.setProperty(te::IDs::pitchChange,disableStretch?0.0:authoredPitch,nullptr);clip->setIsReversed(c.settings.reverse);
    const double sourceBar=r.quartersPerBar*60/c.settings.sourceBpm;
    if(c.settings.loop)clip->setLoopRange({te::TimePosition::fromSeconds(c.settings.loopStart*sourceBar/ratio),te::TimeDuration::fromSeconds(c.settings.loopLength*sourceBar/ratio)});else clip->setLoopRange({});
    clip->setPosition(audioPosition(c,r));
    clip->getPluginList()->insertPlugin(envelope,0,nullptr);a.envelopes.emplace(c.id,envelope.get());a.audioClips.emplace(c.id,clip.get());
    a.observeSourceRender(*clip);
}
void EngineSession::Arrangement::observeSourceRender(te::AudioClipBase& clip) {
    auto job=edit->engine.getRenderManager().getRenderJobWithoutCreating(clip.getPlaybackFile());
    if(job && std::none_of(sourceRenders.begin(),sourceRenders.end(),[&](const auto& existing){return existing.get()==job.get();})) {
        if(!sourceRenderInhibitor)sourceRenderInhibitor=std::make_unique<te::TransportControl::ReallocationInhibitor>(edit->getTransport());
        sourceRenders.push_back(job);job->addListener(this);
    }
}
void EngineSession::Arrangement::releaseUnusedSourceRenders() {
    std::erase_if(sourceRenders,[&](const auto& job) {
        if(std::any_of(audioClips.begin(),audioClips.end(),[&](const auto& entry){return entry.second->getPlaybackFile()==job->proxy;}))return false;
        job->removeListener(this);
        return true;
    });
    if(sourceRenders.empty())sourceRenderInhibitor.reset();
}
void EngineSession::Arrangement::jobFinished(te::RenderManager::Job& job,bool completed) {
    const bool used=std::any_of(audioClips.begin(),audioClips.end(),[&](const auto& entry){return entry.second->getPlaybackFile()==job.proxy;});
    job.removeListener(this);
    std::erase_if(sourceRenders,[&](const auto& existing){return existing.get()==&job;});
    if(sourceRenders.empty())sourceRenderInhibitor.reset();
    if(!used)return;
    if(completed)edit->restartPlayback();
    else issues.add(issue("source-render-failed","Native source rendering failed; affected clips are silent"));
}
void EngineSession::updateEnvelopes(Arrangement& a,const Request& next,const Request& previous) {
    te::TransportControl::ReallocationInhibitor inhibit(a.edit->getTransport());
    const bool tempoChanged=next.bpm!=previous.bpm;
    for(size_t track=0;track<next.tracks.size();++track)for(size_t index=0;index<next.tracks[track].clips.size();++index) {
        const auto& clip=next.tracks[track].clips[index];
        if(clip.kind!="audio")continue;
        const Clip* oldClip=nullptr;
        for(const auto& oldTrack:previous.tracks) {
            const auto found=std::find_if(oldTrack.clips.begin(),oldTrack.clips.end(),[&](const Clip& candidate){return candidate.id==clip.id;});
            if(found!=oldTrack.clips.end()) { oldClip=&*found;break; }
        }
        if(!oldClip) { insertAudioClip(a,*a.tracks.at(next.tracks[track].id),next.tracks[track],clip,next);continue; }
        const auto& old=*oldClip;
        const bool loopChanged=clip.settings.loop!=old.settings.loop || clip.settings.loopStart!=old.settings.loopStart || clip.settings.loopLength!=old.settings.loopLength;
        const bool speedChanged=clip.settings.warp!=old.settings.warp || clip.settings.mode!=old.settings.mode || clip.settings.sourceBpm!=old.settings.sourceBpm;
        const bool reverseChanged=clip.settings.reverse!=old.settings.reverse;
        if(auto native=a.audioClips.find(clip.id);native!=a.audioClips.end()) {
            auto* destination=a.tracks.at(next.tracks[track].id);
            if(native->second->getTrack()!=destination)require(native->second->moveTo(*destination),"Cannot move audio clip to destination track");
            if(clip.gain!=old.gain)native->second->setGainDB((float)clip.gain);
            if(clip.mute!=old.mute)native->second->setMuted(clip.mute);
            if(reverseChanged) { native->second->setIsReversed(clip.settings.reverse);a.observeSourceRender(*native->second); }
            if(speedChanged) {
                native->second->setAutoTempo(clip.settings.warp);
                if(clip.settings.warp) {
                    const auto& source=next.sources.at(clip.source);
                    auto& info=native->second->getLoopInfo();info.setNumerator(next.numerator);info.setDenominator(next.denominator);
                    info.setNumBeats(source.frames/source.rate*clip.settings.sourceBpm/60);
                }
            }
            if(speedChanged || clip.settings.transpose!=old.settings.transpose || clip.settings.detune!=old.settings.detune) {
                const double authoredPitch=clip.settings.transpose+clip.settings.detune/100;
                const bool disableStretch=!clip.settings.warp && authoredPitch==0;
                native->second->setTimeStretchMode(disableStretch?te::TimeStretcher::disabled:warpProcessor(clip.settings.mode));
                if(speedChanged)native->second->setSpeedRatio(1.0);
                native->second->state.setProperty(te::IDs::pitchChange,disableStretch?0.0:authoredPitch,nullptr);
            }
            if(reverseChanged || loopChanged || speedChanged) {
                const double ratio=clip.settings.warp?next.bpm/clip.settings.sourceBpm:1.0;
                const double sourceBar=next.quartersPerBar*60/clip.settings.sourceBpm;
                if(clip.settings.loop)native->second->setLoopRange({te::TimePosition::fromSeconds(clip.settings.loopStart*sourceBar/ratio),te::TimeDuration::fromSeconds(clip.settings.loopLength*sourceBar/ratio)});
                else native->second->setLoopRange({});
            }
            if(tempoChanged || reverseChanged || speedChanged || loopChanged || clip.start!=old.start || clip.length!=old.length || clip.offset!=old.offset || clip.settings.markerStart!=old.settings.markerStart) {
                native->second->setPosition(audioPosition(clip,next));
            }
        }
        if(!tempoChanged && !speedChanged && !loopChanged && clip.start==old.start && clip.length==old.length && clip.offset==old.offset && clip.settings.markerStart==old.settings.markerStart && clip.settings.markerEnd==old.settings.markerEnd && clip.fadeIn==old.fadeIn && clip.fadeOut==old.fadeOut && clip.fadeInOffset==old.fadeInOffset && clip.fadeOutOffset==old.fadeOutOffset && clip.fadeInCurve==old.fadeInCurve && clip.fadeOutCurve==old.fadeOutCurve && clip.fadeInPosition==old.fadeInPosition && clip.fadeOutPosition==old.fadeOutPosition)continue;
        auto envelope=a.envelopes.find(clip.id);
        if(envelope!=a.envelopes.end())static_cast<Envelope*>(envelope->second)->configure(clip,next);
    }
    const auto retained=[&](const juce::String& id) {
        for(const auto& track:next.tracks)for(const auto& clip:track.clips)if(clip.id==id)return true;
        return false;
    };
    for(auto it=a.audioClips.begin();it!=a.audioClips.end();) {
        if(retained(it->first)) { ++it;continue; }
        te::Clip::Ptr removed(it->second);
        a.envelopes.erase(it->first);it=a.audioClips.erase(it);
        removed->removeFromParent();
    }
    for(int i=a.issues.size();--i>=0;)if(a.issues[i].hasProperty("clipId") && !retained(a.issues[i]["clipId"].toString()))a.issues.remove(i);
    a.releaseUnusedSourceRenders();
}
}
