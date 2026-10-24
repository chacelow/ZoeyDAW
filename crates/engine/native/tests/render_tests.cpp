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
void verifyLoop(double bpm) {
    juce::TemporaryFile source(".wav"),destination(".wav");
    const int rate=48000,frames=rate*4;juce::WavAudioFormat wav;
    auto stream=source.getFile().createOutputStream();zp::require(stream!=nullptr,"Cannot create loop corpus");
    std::unique_ptr<juce::AudioFormatWriter> writer(wav.createWriterFor(stream.release(),rate,1,24,{},0));zp::require(writer!=nullptr,"Cannot write loop corpus");
    juce::AudioBuffer<float> block(1,4096);
    for(int position=0;position<frames;position+=4096) { const int count=std::min(4096,frames-position);for(int i=0;i<count;++i)block.setSample(0,i,.15f*(1+((position+i)/(rate/4))%4));zp::require(writer->writeFromAudioSampleBuffer(block,0,count),"Loop corpus write failed"); }writer.reset();
    auto settings=obj({{"warp",true},{"warpMode","complex"},{"sourceBpm",120},{"transpose",0},{"detune",0},{"reverse",false},{"loop",true},{"loopStartBars",.5},{"loopLengthBars",.375},{"startMarkerBars",0},{"endMarkerBars",2}});
    auto clip=obj({{"id","nonzero-source-loop"},{"kind","audio"},{"startBar",1},{"lengthBars",2},{"sourceOffsetBars",.5625},{"mute",false},{"sourceId","fixture"},{"gainDb",0},{"audioSettings",settings},{"fadeInBars",0},{"fadeOutBars",0},{"fadeInOffsetBars",0},{"fadeOutOffsetBars",0},{"fadeInCurve",.35},{"fadeOutCurve",.35},{"fadeInCurvePosition",.5},{"fadeOutCurvePosition",.5}});
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
        zp::require(std::abs(mean-.15)<.035,"Source loop start/phase is wrong at project BPM "+juce::String(bpm)+"; measured "+juce::String(mean));
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
}
}
void testActualSourceLoopRendering() { verifyLoop(120);verifyLoop(180); }
