#include "playback_bridge.h"
#include "playback_model.h"
#include <juce_audio_formats/juce_audio_formats.h>
#include <juce_events/juce_events.h>
namespace {
using zp::V;
V invoke(zp_session* session,const char* operation,const V& payload) {
    char* raw=zp_call(session,operation,juce::JSON::toString(payload,true).toRawUTF8());zp::require(raw!=nullptr,"Missing render response");auto envelope=zp::parse(raw);zp_free(raw);zp::require((bool)envelope["ok"],envelope["error"].toString());return envelope["value"];
}
V obj(std::initializer_list<std::pair<const char*,V>> properties) { auto v=zp::object();for(auto& [key,value]:properties)zp::put(v,key,value);return v; }
V track(const char* id,const char* kind,const char* output) {
    return obj({{"id",id},{"kind",kind},{"output",output},{"input","none"},{"inputChannel",V()},{"outputChannel","1-2"},{"monitor","off"},{"volumeDb",0},{"pan",0},{"mute",false},{"solo",false},{"armed",false},{"sends",obj({})},{"returnPost",false},{"cueOutput",V()},{"cueVolumeDb",-18},{"devices",juce::Array<V>()},{"clips",juce::Array<V>()},{"automation",juce::Array<V>()},{"childTrackIds",juce::Array<V>()}});
}
void verifyLoop(double bpm,double offset=.5625) {
    juce::TemporaryFile source(".wav"),destination(".wav");
    const int rate=48000,frames=rate*4;juce::WavAudioFormat wav;
    auto stream=source.getFile().createOutputStream();zp::require(stream!=nullptr,"Cannot create loop corpus");
    std::unique_ptr<juce::AudioFormatWriter> writer(wav.createWriterFor(stream.release(),rate,1,24,{},0));zp::require(writer!=nullptr,"Cannot write loop corpus");
    juce::AudioBuffer<float> block(1,4096);
    for(int position=0;position<frames;position+=4096) { const int count=std::min(4096,frames-position);for(int i=0;i<count;++i)block.setSample(0,i,.15f*(1+((position+i)/(rate/4))%4));zp::require(writer->writeFromAudioSampleBuffer(block,0,count),"Loop corpus write failed"); }writer.reset();
    auto settings=obj({{"warp",true},{"warpMode","soundtouch"},{"sourceBpm",120},{"transpose",0},{"detune",0},{"reverse",false},{"loop",true},{"loopStartBars",.5},{"loopLengthBars",.375},{"startMarkerBars",0},{"endMarkerBars",2}});
    auto clip=obj({{"id","nonzero-source-loop"},{"kind","audio"},{"startBar",1},{"lengthBars",2},{"sourceOffsetBars",.5625},{"mute",false},{"sourceId","fixture"},{"gainDb",0},{"audioSettings",settings},{"fadeInBars",0},{"fadeOutBars",0},{"fadeInOffsetBars",0},{"fadeOutOffsetBars",0},{"fadeInCurve",.35},{"fadeOutCurve",.35},{"fadeInCurvePosition",.5},{"fadeOutCurvePosition",.5}});
    zp::put(clip,"sourceOffsetBars",offset);
    auto audio=track("audio","audio","main");zp::put(audio,"clips",juce::Array<V>{clip});
    auto sourceMetadata=obj({{"id","fixture"},{"uri",source.getFile().getFullPathName()},{"sha256",juce::String::repeatedString("0",64)},{"frames",frames},{"sampleRate",rate},{"channels",1}});
    auto project=obj({{"bpm",bpm},{"numerator",4},{"denominator",4},{"loop",obj({{"enabled",false},{"startBar",1},{"endBar",5}})},{"sources",juce::Array<V>{sourceMetadata}},{"tracks",juce::Array<V>{audio,track("main","main","external")}}});
    auto control=obj({{"playing",false},{"recording",false},{"seekBar",1},{"seekGeneration",0}});
    auto request=obj({{"protocolVersion",2},{"sessionId","source-loop-render"},{"sequence",0},{"baseRevision",0},{"revision",0},{"stage","open"},{"editId",V()},{"controlGeneration","0"},{"state",obj({{"project",project},{"control",control}})}});
    char* error=nullptr;std::unique_ptr<zp_session,decltype(&zp_destroy)> session(zp_create(&error),zp_destroy);if(!session) { auto message=error?juce::String::fromUTF8(error):"No test engine";zp_free(error);throw std::runtime_error(message.toStdString()); }
    auto accepted=invoke(session.get(),"apply",obj({{"request",request},{"leaseId","source-loop-render"},{"stopToken",0},{"stopEpoch",0}}));zp::require(accepted["kind"].toString()=="accepted","Loop render request rejected");
    invoke(session.get(),"render",obj({{"path",destination.getFile().getFullPathName()},{"seconds",1},{"sampleRate",rate}}));
    std::unique_ptr<juce::AudioFormatReader> reader(wav.createReaderFor(destination.getFile().createInputStream().release(),true));zp::require(reader!=nullptr,"Cannot inspect actual engine render");
    juce::AudioBuffer<float> actual((int)reader->numChannels,960);zp::require(reader->read(&actual,0,960,(juce::int64)(.05*rate),true,true),"Cannot inspect nonzero loop start");
    for(int channel=0;channel<actual.getNumChannels();++channel) {
        double mean=0;for(int i=0;i<actual.getNumSamples();++i)mean+=actual.getSample(channel,i);mean/=actual.getNumSamples();
        zp::require(std::abs(mean-(offset<0?.3:.15))<.035,"Source loop start/phase is wrong at project BPM "+juce::String(bpm)+"; measured "+juce::String(mean));
    }
    const auto before=invoke(session.get(),"diagnostics",obj({}));
    zp::put(settings,"loopStartBars",.125);zp::put(settings,"loopLengthBars",.125);
    zp::put(request,"stage","preview");zp::put(request,"sequence",1);
    auto updated=invoke(session.get(),"apply",obj({{"request",request},{"leaseId","source-loop-render"},{"stopToken",0},{"stopEpoch",0}}));
    zp::require(updated["kind"].toString()=="accepted","Edited loop request rejected");
    const auto after=invoke(session.get(),"diagnostics",obj({}));
    for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})zp::require(before[key]==after[key],"Source loop edit replaced Edit or reset transport");
    juce::TemporaryFile changedDestination(".wav");
    invoke(session.get(),"render",obj({{"path",changedDestination.getFile().getFullPathName()},{"seconds",1},{"sampleRate",rate}}));
    std::unique_ptr<juce::AudioFormatReader> changedReader(wav.createReaderFor(changedDestination.getFile().createInputStream().release(),true));
    zp::require(changedReader!=nullptr,"Cannot inspect changed source loop");
    for(double time:{.05,.05+.25/(bpm/120)}) {
        zp::require(changedReader->read(&actual,0,960,(juce::int64)(time*rate),true,true),"Cannot read edited loop samples");
        for(int channel=0;channel<actual.getNumChannels();++channel) {
            double mean=0;for(int i=0;i<actual.getNumSamples();++i)mean+=actual.getSample(channel,i);mean/=actual.getNumSamples();
            zp::require(std::abs(mean-.3)<.035,"Edited loop did not repeat the selected source segment; measured "+juce::String(mean));
        }
    }
    zp::put(settings,"reverse",true);zp::put(request,"sequence",2);
    auto reversed=invoke(session.get(),"apply",obj({{"request",request},{"leaseId","source-loop-render"},{"stopToken",0},{"stopEpoch",0}}));
    zp::require(reversed["kind"].toString()=="accepted","Reverse request rejected");
    const auto reversedState=invoke(session.get(),"diagnostics",obj({}));
    for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})zp::require(before[key]==reversedState[key],"Reverse edit replaced Edit or reset transport");
    juce::MessageManager::getInstance()->runDispatchLoopUntil(500);
    juce::TemporaryFile reverseDestination(".wav");
    invoke(session.get(),"render",obj({{"path",reverseDestination.getFile().getFullPathName()},{"seconds",1},{"sampleRate",rate}}));
    std::unique_ptr<juce::AudioFormatReader> reverseReader(wav.createReaderFor(reverseDestination.getFile().createInputStream().release(),true));
    zp::require(reverseReader!=nullptr,"Cannot inspect reversed loop");
    zp::require(reverseReader->read(&actual,0,960,(juce::int64)(.05*rate),true,true),"Cannot read reversed source samples");
    for(int channel=0;channel<actual.getNumChannels();++channel) {
        double mean=0;for(int i=0;i<actual.getNumSamples();++i)mean+=actual.getSample(channel,i);mean/=actual.getNumSamples();
        zp::require(std::abs(mean-.45)<.035,"Reverse did not play the reversed selected source segment; measured "+juce::String(mean));
    }
    if(offset<0) {
        zp::put(settings,"reverse",false);zp::put(settings,"loop",false);zp::put(clip,"sourceOffsetBars",-.125);zp::put(request,"sequence",3);
        zp::require(invoke(session.get(),"apply",obj({{"request",request},{"leaseId","source-loop-render"},{"stopToken",0},{"stopEpoch",0}}))["kind"].toString()=="accepted","Negative non-loop source window rejected");
        juce::TemporaryFile leadingSilence(".wav");invoke(session.get(),"render",obj({{"path",leadingSilence.getFile().getFullPathName()},{"seconds",1},{"sampleRate",rate}}));
        std::unique_ptr<juce::AudioFormatReader> signedReader(wav.createReaderFor(leadingSilence.getFile().createInputStream().release(),true));zp::require(signedReader!=nullptr,"Cannot inspect signed source window");
        for(double time:{.05,.3}) {
            zp::require(signedReader->read(&actual,0,960,(juce::int64)(time*rate),true,true),"Cannot read signed source samples");
            for(int channel=0;channel<actual.getNumChannels();++channel) {
                double mean=0;for(int i=0;i<actual.getNumSamples();++i)mean+=actual.getSample(channel,i);mean/=actual.getNumSamples();
                zp::require(std::abs(mean-(time<.25?0:.15))<.02,"Signed source window did not retain leading silence and original source alignment; measured "+juce::String(mean));
            }
        }
        zp::put(clip,"sourceOffsetBars",-4);zp::put(request,"sequence",4);
        auto reference=track("render-reference","audio","main");zp::put(reference,"volumeDb",-160);auto referenceClip=clip.clone();zp::put(referenceClip,"id","render-reference");zp::put(referenceClip,"sourceOffsetBars",0);zp::put(referenceClip,"gainDb",-160);zp::put(reference,"clips",juce::Array<V>{referenceClip});project["tracks"].getArray()->add(reference);
        zp::require(invoke(session.get(),"apply",obj({{"request",request},{"leaseId","source-loop-render"},{"stopToken",0},{"stopEpoch",0}}))["kind"].toString()=="accepted","Fully out-of-source window rejected");
        juce::TemporaryFile outside(".wav");invoke(session.get(),"render",obj({{"path",outside.getFile().getFullPathName()},{"seconds",1},{"sampleRate",rate}}));
        std::unique_ptr<juce::AudioFormatReader> outsideReader(wav.createReaderFor(outside.getFile().createInputStream().release(),true));zp::require(outsideReader!=nullptr && outsideReader->read(&actual,0,960,2400,true,true),"Cannot inspect fully out-of-source window");
        zp::require(actual.getMagnitude(0,actual.getNumSamples())<1e-6,"Fully out-of-source window must be silent; measured "+juce::String(actual.getMagnitude(0,actual.getNumSamples()),9));
    }
}
void verifyWarpAlgorithms() {
    constexpr int rate=48000;
    juce::TemporaryFile source(".wav");
    juce::WavAudioFormat wav;
    auto stream=source.getFile().createOutputStream();zp::require(stream!=nullptr,"Cannot create warp corpus");
    std::unique_ptr<juce::AudioFormatWriter> writer(wav.createWriterFor(stream.release(),rate,1,24,{},0));zp::require(writer!=nullptr,"Cannot write warp corpus");
    juce::AudioBuffer<float> block(1,4096);
    for(int position=0;position<rate*3;position+=4096) {
        const int count=std::min(4096,rate*3-position);
        for(int i=0;i<count;++i) {
            const double phase=2*juce::MathConstants<double>::pi*440*(position+i)/rate;
            block.setSample(0,i,(float)(.15*std::sin(phase)+.07*std::sin(2*phase)+.025*std::sin(3*phase)));
        }
        zp::require(writer->writeFromAudioSampleBuffer(block,0,count),"Warp corpus write failed");
    }
    writer.reset();
    auto settings=obj({{"warp",true},{"warpMode","soundtouch"},{"sourceBpm",80},{"transpose",12},{"detune",0},{"reverse",false},{"loop",true},{"loopStartBars",0},{"loopLengthBars",1},{"startMarkerBars",0},{"endMarkerBars",2}});
    auto clip=obj({{"id","warp-clip"},{"kind","audio"},{"startBar",1},{"lengthBars",2},{"sourceOffsetBars",0},{"mute",false},{"sourceId","warp-source"},{"gainDb",0},{"audioSettings",settings},{"fadeInBars",0},{"fadeOutBars",0},{"fadeInOffsetBars",0},{"fadeOutOffsetBars",0},{"fadeInCurve",0},{"fadeOutCurve",0},{"fadeInCurvePosition",.5},{"fadeOutCurvePosition",.5}});
    auto audio=track("warp-audio","audio","main");zp::put(audio,"clips",juce::Array<V>{clip});
    auto sourceMetadata=obj({{"id","warp-source"},{"uri",source.getFile().getFullPathName()},{"sha256",juce::String::repeatedString("0",64)},{"frames",rate*3},{"sampleRate",rate},{"channels",1}});
    auto project=obj({{"bpm",120},{"numerator",4},{"denominator",4},{"loop",obj({{"enabled",false},{"startBar",1},{"endBar",5}})},{"sources",juce::Array<V>{sourceMetadata}},{"tracks",juce::Array<V>{audio,track("main","main","external")}}});
    auto control=obj({{"playing",false},{"recording",false},{"seekBar",1},{"seekGeneration",0}});
    auto request=obj({{"protocolVersion",2},{"sessionId","warp-algorithm-render"},{"sequence",0},{"baseRevision",0},{"revision",0},{"stage","open"},{"editId",V()},{"controlGeneration","0"},{"state",obj({{"project",project},{"control",control}})}});
    auto reject=[&](const char* mode) {
        zp::put(settings,"warpMode",mode);
        bool rejected=false;try { zp::decode(request); }catch(const std::exception&) { rejected=true; }
        zp::require(rejected,"Unsupported native warp mode was accepted");
    };
    reject("beats");reject("complex-pro");reject("unknown");
    juce::AudioBuffer<float> previous(2,rate/2);
    for(const char* mode:{"soundtouch","signalsmith","signalsmith-formant","re-pitch"}) {
        zp::put(settings,"warpMode",mode);
        char* error=nullptr;std::unique_ptr<zp_session,decltype(&zp_destroy)> session(zp_create(&error),zp_destroy);
        if(!session) { auto message=error?juce::String::fromUTF8(error):"No test engine";zp_free(error);throw std::runtime_error(message.toStdString()); }
        zp::require(invoke(session.get(),"apply",obj({{"request",request},{"leaseId","warp-algorithm-render"},{"stopToken",0},{"stopEpoch",0}}))["kind"].toString()=="accepted","Warp mode request rejected: "+juce::String(mode));
        juce::TemporaryFile output(".wav");invoke(session.get(),"render",obj({{"path",output.getFile().getFullPathName()},{"seconds",3},{"sampleRate",rate}}));
        std::unique_ptr<juce::AudioFormatReader> reader(wav.createReaderFor(output.getFile().createInputStream().release(),true));zp::require(reader!=nullptr,"Cannot read warped output");
        juce::AudioBuffer<float> rendered(2,rate/2);
        zp::require(reader->read(&rendered,0,rendered.getNumSamples(),0,true,true),"Cannot read warp start");
        zp::require(rendered.getRMSLevel(0,rate/10,rate/10)>.015f,"Warp start or seek lost audio: "+juce::String(mode));
        const auto* samples=rendered.getReadPointer(0);
        double best=-1;int bestLag=0;
        for(int lag=32;lag<=70;++lag) {
            double correlation=0;
            for(int i=rate/10;i<rate/4;++i)correlation+=samples[i]*samples[i+lag];
            if(correlation>best) { best=correlation;bestLag=lag; }
        }
        const double frequency=double(rate)/bestLag;
        const double expected=juce::String(mode)=="re-pitch"?1320:880;
        zp::require(std::abs(frequency-expected)<20,"Warp mode rendered the wrong pitch: "+juce::String(mode)+" / "+juce::String(frequency));
        zp::require(reader->read(&rendered,0,rendered.getNumSamples(),(juce::int64)(2.1*rate),true,true),"Cannot read warp loop");
        zp::require(rendered.getRMSLevel(0,0,rate/4)>.015f,"Warp loop failed to repeat audio: "+juce::String(mode));
        if(juce::String(mode)=="signalsmith-formant") {
            double delta=0;for(int i=0;i<rendered.getNumSamples();++i)delta+=std::abs(rendered.getSample(0,i)-previous.getSample(0,i));
            zp::require(delta/rendered.getNumSamples()>.002,"Formant compensation did not distinguish Signalsmith pitch shifting");
        }
        if(juce::String(mode)=="signalsmith")previous.makeCopyOf(rendered);
    }
}
}
void testActualSourceLoopRendering() { verifyLoop(120);verifyLoop(180);verifyLoop(120,-.0625);verifyWarpAlgorithms(); }
