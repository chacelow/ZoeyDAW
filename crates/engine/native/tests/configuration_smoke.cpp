#include "playback_bridge.h"
#include "audio_configuration.h"
#include "device_test_support.h"
#include <juce_events/juce_events.h>
#include <juce_audio_formats/juce_audio_formats.h>
#include <iostream>
#include <memory>
namespace {
using zp::V;
V obj(std::initializer_list<std::pair<const char*,V>> values) { auto out=zp::object();for(const auto& [key,value]:values)zp::put(out,key,value);return out; }
V envelope(zp_session* session,const char* operation,const V& value) { auto* raw=zp_call(session,operation,juce::JSON::toString(value).toRawUTF8());zp::require(raw!=nullptr,"Missing native response");auto out=zp::parse(raw);zp_free(raw);return out; }
V invoke(zp_session* session,const char* operation,const V& value=zp::object()) { auto out=envelope(session,operation,value);zp::require((bool)out["ok"],out["error"].toString());return out["value"]; }
using Session=std::unique_ptr<zp_session,decltype(&zp_destroy)>;
Session create() { char* error=nullptr;Session session(zp_create(&error),zp_destroy);if(!session) { auto message=error?juce::String::fromUTF8(error):"Cannot create audio owner";zp_free(error);throw std::runtime_error(message.toStdString()); }return session; }
void frames(zp_session* session) {
    const auto before=(juce::int64)invoke(session,"diagnostics")["renderedFrames"];const double deadline=juce::Time::getMillisecondCounterHiRes()+2500;
    while((juce::int64)invoke(session,"diagnostics")["renderedFrames"]<before+2048) { zp::require(juce::Time::getMillisecondCounterHiRes()<deadline,"Actual device callbacks stopped");juce::MessageManager::getInstance()->runDispatchLoopUntil(10); }
}
juce::String encoded(const V& value) { return juce::JSON::toString(value); }
struct Restore final {
    zp_session* session;V baseline;bool armed=true;
    void restore() { invoke(session,"configure",baseline);armed=false; }
    ~Restore() { if(armed)try { restore(); }catch(const std::exception& error) { std::cerr<<"CRITICAL: physical audio baseline could not be restored: "<<error.what()<<std::endl; } }
};
struct PreferenceFailure final {
    juce::String previous=juce::SystemStats::getEnvironmentVariable("ZOEYDAW_AUDIO_CONFIG_PATH",{});
    explicit PreferenceFailure(const juce::File& existingFile) { zp::ScopedAudioPreferences::set("ZOEYDAW_AUDIO_CONFIG_PATH",existingFile.getChildFile("impossible.json").getFullPathName()); }
    ~PreferenceFailure() { zp::ScopedAudioPreferences::set("ZOEYDAW_AUDIO_CONFIG_PATH",previous); }
};
V arrangement() {
    return zp::parse(R"JSON({"protocolVersion":2,"sessionId":"audio-configuration-smoke","sequence":0,"baseRevision":0,"revision":0,"stage":"open","editId":null,"controlGeneration":"0","state":{"project":{"bpm":120,"numerator":4,"denominator":4,"loop":{"enabled":false,"startBar":1,"endBar":33},"sources":[],"tracks":[{"id":"main","kind":"main","output":"external","input":"none","inputChannel":null,"outputChannel":"1-2","monitor":"off","volumeDb":-160,"pan":0,"mute":true,"solo":false,"armed":false,"sends":{},"returnPost":false,"cueOutput":null,"cueVolumeDb":-18,"devices":[],"clips":[],"automation":[],"childTrackIds":[]}]},"control":{"playing":true,"recording":false,"seekBar":1,"seekGeneration":0}}})JSON");
}
void rejectRetaining(zp_session* session,const V& bad,const V& baseline,const juce::File& preferences) {
    const auto persisted=preferences.loadFileAsString();const auto response=envelope(session,"configure",bad);zp::require(!(bool)response["ok"],"Unsupported configuration unexpectedly succeeded");const auto state=invoke(session,"devices");
    zp::require(encoded(state["configuration"])==encoded(baseline),"Rejected configuration changed acknowledged settings");zp::require(preferences.loadFileAsString()==persisted,"Rejected configuration overwrote preferences");zp::require((double)state["sampleRate"]==(double)baseline["sampleRate"] && (int)state["bufferFrames"]==(int)baseline["bufferFrames"],"Rejected configuration changed actual audio setup");frames(session);
}
}
int main(int argc,char** argv) {
    try {
        juce::ScopedJuceInitialiser_GUI gui;zp::ScopedAudioPreferences preferences;auto session=create();auto initial=invoke(session.get(),"devices");
        zp::require(initial["state"].toString()=="closed" && (juce::int64)invoke(session.get(),"diagnostics")["callbackCount"]==0,"Enumeration opened audio hardware");
        auto caps=initial["capabilities"];
        if(argc>1) { bool found=false;for(const auto& entry:*initial["outputDevices"].getArray())if(entry["id"].toString()==argv[1]) { caps=invoke(session.get(),"device_capabilities",obj({{"host",entry["host"]},{"inputDeviceId",V()},{"outputDeviceId",entry["id"]}}));found=true;break; }zp::require(found,"Requested output ID was not enumerated"); }
        auto query=obj({{"host",caps["host"]},{"inputDeviceId",V()},{"outputDeviceId",caps["outputDeviceId"]}});caps=invoke(session.get(),"device_capabilities",query);
        zp::require((juce::int64)invoke(session.get(),"diagnostics")["callbackCount"]==0,"Capability probing opened audio hardware");
        const int channels=caps["outputChannelNames"].getArray()->size();zp::require(channels>0 && (double)caps["defaultSampleRate"]>0 && (int)caps["defaultBufferFrames"]>0,"No supported physical baseline available; refusing to guess a device rate");
        auto baseline=obj({{"host",caps["host"]},{"inputDeviceId",V()},{"outputDeviceId",caps["outputDeviceId"]},{"sampleRate",caps["defaultSampleRate"]},{"bufferFrames",caps["defaultBufferFrames"]},{"inputMono",juce::Array<V>()},{"inputStereo",juce::Array<V>()},{"outputMono",channels<2?V(juce::Array<V>{0}):V(juce::Array<V>())},{"outputStereo",channels>=2?V(juce::Array<V>{0}):V(juce::Array<V>())}});
        auto actual=invoke(session.get(),"configure",baseline);Restore restore{session.get(),baseline};
        zp::require(actual["state"].toString()=="ready" && (double)actual["sampleRate"]==(double)baseline["sampleRate"] && (int)actual["bufferFrames"]==(int)baseline["bufferFrames"],"Actual driver baseline differs from acknowledged request");zp::require((int)actual["inputChannels"]==0 && actual["inputDeviceId"].isVoid(),"Output-only configuration enabled microphone capture");frames(session.get());
        auto request=arrangement();invoke(session.get(),"apply",obj({{"request",request},{"leaseId","config-smoke"},{"stopToken",0},{"stopEpoch",0}}));
        juce::TemporaryFile source(".wav");juce::WavAudioFormat wav;auto stream=source.getFile().createOutputStream();zp::require(stream!=nullptr,"Cannot create preview fixture");std::unique_ptr<juce::AudioFormatWriter> writer(wav.createWriterFor(stream.release(),(double)baseline["sampleRate"],1,16,{},0));zp::require(writer!=nullptr,"Cannot create preview writer");juce::AudioBuffer<float> silence(1,4096);silence.clear();for(int i=0;i<1024;++i)zp::require(writer->writeFromAudioSampleBuffer(silence,0,4096),"Cannot write preview fixture");writer.reset();
        invoke(session.get(),"audition",obj({{"generation",10},{"path",source.getFile().getFullPathName()},{"mode","raw"},{"gainDb",-160}}));frames(session.get());auto before=invoke(session.get(),"diagnostics");
        auto altered=juce::JSON::parse(encoded(baseline));bool alternate=false;for(const auto& size:*caps["bufferSizes"].getArray())if((int)size!=(int)baseline["bufferFrames"]) { zp::put(altered,"bufferFrames",size);alternate=true;break; }
        zp::require(alternate,"Device reports only one buffer size; cannot exercise a real supported buffer change");invoke(session.get(),"configure",altered);frames(session.get());auto after=invoke(session.get(),"diagnostics");
        zp::require((bool)after["arrangementPlaying"] && (bool)after["previewPlaying"] && (juce::int64)after["previewGeneration"]==10 && (double)after["previewPositionSeconds"]>=(double)before["previewPositionSeconds"],"Buffer change lost independent arrangement/Preview state");
        restore.restore();restore.armed=true;frames(session.get());
        for(const char* key:{"host","outputDeviceId","sampleRate","bufferFrames","outputMono","outputStereo"}) {
            auto bad=juce::JSON::parse(encoded(baseline));const juce::String field(key);
            if(field=="host")zp::put(bad,key,"unsupported-test-host");else if(field=="outputDeviceId")zp::put(bad,key,"missing-test-device");else if(field=="sampleRate")zp::put(bad,key,12345);else if(field=="bufferFrames")zp::put(bad,key,123);else zp::put(bad,key,juce::Array<V>{9999});rejectRetaining(session.get(),bad,baseline,preferences.file());
        }
        const auto persisted=preferences.file().loadFileAsString();
        { PreferenceFailure failure(preferences.file());const auto rejected=envelope(session.get(),"configure",altered);zp::require(!(bool)rejected["ok"],"Persistence failure unexpectedly committed audio settings"); }
        actual=invoke(session.get(),"devices");zp::require(encoded(actual["configuration"])==encoded(baseline) && (int)actual["bufferFrames"]==(int)baseline["bufferFrames"] && preferences.file().loadFileAsString()==persisted,"Post-open persistence failure did not roll back hardware and preferences");frames(session.get());zp::require((bool)invoke(session.get(),"diagnostics")["previewPlaying"],"Rollback lost independent Preview");
        auto mono=juce::JSON::parse(encoded(baseline));zp::put(mono,"outputMono",juce::Array<V>{channels-1});zp::put(mono,"outputStereo",juce::Array<V>());actual=invoke(session.get(),"configure",mono);frames(session.get());after=invoke(session.get(),"diagnostics");
        zp::require((int)actual["outputChannels"]==1 && after["activeOutputMask"].toString()==zp::AudioConfiguration::decode(mono).outputMask().toString(2),"Enabled output mask did not reach physical IO");zp::require(after["outputRoutes"]["main"].toString()=="(none)","Disabled stereo route was silently re-enabled");zp::require((bool)after["previewPlaying"],"Mono reconfiguration lost independent Preview");
        restore.restore();restore.armed=true;
        zp::require(zp_stop_fence_for(session.get(),"config-smoke","audio-configuration-smoke",1)!=0,"Active configuration smoke owner could not stop");zp_audition_fence(session.get(),11);invoke(session.get(),"configure",altered);frames(session.get());after=invoke(session.get(),"diagnostics");zp::require(!(bool)after["arrangementPlaying"] && !(bool)after["previewPlaying"],"Configuration revived stale stop epoch or audition generation");
        restore.restore();session.reset();auto restored=create();const auto closed=invoke(restored.get(),"devices");zp::require(closed["state"].toString()=="closed" && encoded(closed["configuration"])==encoded(baseline),"Persisted configuration was not restored lazily without hardware");
        invoke(restored.get(),"apply",obj({{"request",arrangement()},{"leaseId","config-smoke-restored"},{"stopToken",0},{"stopEpoch",0}}));frames(restored.get());actual=invoke(restored.get(),"devices");zp::require(encoded(actual["configuration"])==encoded(baseline) && (double)actual["sampleRate"]==(double)baseline["sampleRate"] && (int)actual["bufferFrames"]==(int)baseline["bufferFrames"],"First playback did not restore acknowledged preferences exactly");
        std::cout<<"Actual capability/configuration smoke passed; baseline restored, sample rate unchanged; driver-reported latency frames input="<<(int)actual["inputLatencyFrames"]<<" output="<<(int)actual["outputLatencyFrames"]<<". Input permission/capture not exercised; no loopback claim.\n";return 0;
    }catch(const std::exception& error) { std::cerr<<error.what()<<std::endl;return 1; }
}
