#include "isolated_plugin_probe.h"
#include "hosted_configuration_device.h"
#include "device_test_support.h"
#include <tracktion_engine/playback/graph/tracktion_TracktionEngineNode.h>
#include <chrono>
#include <cmath>
#include <thread>
#include <utility>

namespace {
namespace graph=tracktion::graph;
using zp::V;
V configuration(double rate,int quantum) {
    auto value=zp::parse(R"({"host":"Zoeydaw Hosted Configuration","inputDeviceId":null,"outputDeviceId":"hosted","sampleRate":48000,"bufferFrames":512,"inputMono":[],"inputStereo":[],"outputMono":[],"outputStereo":[0]})");
    zp::put(value,"outputDeviceId",zp::audioDeviceId(zp::probe::configurationHost,zp::probe::configurationDevice));
    zp::put(value,"sampleRate",rate);zp::put(value,"bufferFrames",quantum);return value;
}
void render(zp::EngineSession& session,double rate,uint32_t quantum,uint32_t latency) {
    auto plugin=zp::MixerTestAccess::device(session,"format-delay");
    auto* isolated=dynamic_cast<zp::IsolatedDevicePlugin*>(plugin.get());zp::require(isolated,"Prepared wrapper disappeared");
    zp::require(std::abs(isolated->getLatencySeconds()-double(latency)/rate)<1e-12,"Wrapper retained old latency seconds");
    auto& edit=zp::MixerTestAccess::edit(session);
    graph::PlayHead playhead;graph::PlayHeadState head(playhead);tracktion::ProcessState state(head,edit.tempoSequence);
    tracktion::CreateNodeParams params{state};params.sampleRate=rate;params.blockSize=int(quantum);
    auto node=isolated->createNode(std::make_unique<zp::probe::ConstantSignal>(),params);
    zp::require(node->getNodeProperties().latencyNumSamples==int(latency),"Graph retained old plugin latency");
    graph::NodePlayer player;player.setNode(std::move(node),rate,int(quantum));
    juce::AudioBuffer<float> output(2,int(quantum));tracktion::MidiMessageArray midi;midi.reserve(8192);playhead.play();
    const uint32_t warmup=(latency+quantum-1)/quantum+2;
    for(uint32_t block=0;block<warmup+8;++block) {
        std::this_thread::sleep_for(std::chrono::milliseconds(15));const int64_t start=int64_t(block)*quantum;
        playhead.setReferenceSampleRange({start,start+quantum});state.update(rate,{start,start+quantum},tracktion::ProcessState::UpdateContinuityFlags::yes);
        output.clear();midi.clear();graph::Node::ProcessContext context{quantum,{start,start+quantum},{graph::toBufferView(output),midi}};player.process(context);
        if(block>=warmup)for(int channel=0;channel<2;++channel)for(uint32_t sample=0;sample<quantum;++sample)
            zp::require(std::abs(output.getSample(channel,int(sample))-.185f)<1e-5,"Format transition lost full plugin state or PCM");
    }
}
V request() {
    return zp::parse(R"JSON({"protocolVersion":2,"sessionId":"isolated-format","sequence":0,"baseRevision":0,"revision":0,"stage":"open","editId":null,"controlGeneration":"0","state":{"project":{"bpm":120,"numerator":4,"denominator":4,"loop":{"enabled":false,"startBar":1,"endBar":5},"sources":[],"tracks":[{"id":"main","kind":"main","output":"external","input":"none","inputChannel":null,"outputChannel":"1-2","monitor":"off","volumeDb":0,"pan":0,"mute":false,"solo":false,"armed":false,"sends":{},"returnPost":false,"cueOutput":null,"cueVolumeDb":-18,"devices":[],"clips":[],"automation":[],"childTrackIds":[]}]},"control":{"playing":false,"recording":false,"seekBar":1,"seekGeneration":0}}})JSON");
}
}
extern "C" ZD_PROBE_EXPORT int32_t zd_verify_isolated_configuration(zd_plugin_owned_processor* processors,const uint32_t* latencies,uint32_t count,uint32_t vst3) {
    struct Cleanup {
        zd_plugin_owned_processor* processors;uint32_t count;
        ~Cleanup() { if(processors)for(uint32_t index=0;index<count;++index)if(processors[index].context && processors[index].release)processors[index].release(processors[index].context); }
    } cleanup {processors,count};
    try {
        zp::require(processors && latencies && count==6,"Missing format-transition processors");
        juce::ScopedJuceInitialiser_GUI gui;zp::ScopedAudioPreferences preferences;zp::EngineSession session;
        auto driver=std::make_shared<zp::probe::ConfigurationDriverState>();
        zp::MixerTestAccess::addDeviceType(session,std::make_unique<zp::probe::ConfigurationDeviceType>(driver));
        const auto baseline=configuration(48000,512),highRate=configuration(96000,256),smallBuffer=configuration(96000,128);
        session.call("configure",baseline);
        auto model=request();auto external=zp::parse(R"({"id":"format-delay","kind":"external","enabled":true,"plugin":{"catalogId":"0000000000000000000000000000000000000000000000000000000000000000","format":"clap","classId":"com.studio.plughost.test-delay.79000001","name":"Stateful format fixture","vendor":"fixture","version":"1","role":"effect"},"stateRef":null,"parameters":[{"id":"9","normalized":0.5}]})");
        if(vst3) { auto identity=external["plugin"];zp::put(identity,"format","vst3");zp::put(identity,"classId","706C7567686F737444656C6179000001"); }
        auto track=model["state"]["project"]["tracks"][0];zp::put(track,"devices",juce::Array<V>{external});
        auto envelope=zp::parse(R"({"id":"format-envelope","target":{"kind":"device","deviceId":"format-delay","parameter":"9"},"points":[{"id":"hold","bar":1,"value":0.75}]})");
        zp::put(track,"automation",juce::Array<V>{envelope});
        auto payload=zp::object();zp::put(payload,"request",model);zp::put(payload,"leaseId","isolated-format");zp::put(payload,"stopToken",0);zp::put(payload,"stopEpoch",0);
        const auto submit=[&](uint32_t index,const V& value,bool opening=false) {
            const double rate=index==0 || index>=4?48000:96000;const uint32_t quantum=index==0 || index>=4?512:index==3?128:256;
            zd_plugin_prepared prepared {"format-delay",std::exchange(processors[index],zd_plugin_owned_processor{}),rate,quantum,2,2,latencies[index]};
            struct Release { zd_plugin_prepared& value;~Release() { if(value.processor.context && value.processor.release)value.processor.release(value.processor.context); } } release {prepared};
            return opening?session.applyPrepared(value,&prepared,1):session.configurePrepared(value,&prepared,1);
        };
        zp::require(submit(0,payload.clone(),true)["kind"].toString()=="accepted","Initial format device was rejected");
        auto* edit=&zp::MixerTestAccess::edit(session);auto original=zp::MixerTestAccess::device(session,"format-delay");
        zp::put(model,"sequence",1);zp::put(model,"revision",1);zp::put(model,"stage","commit");zp::put(model,"editId","format-owner");zp::put(track,"volumeDb",-3);
        zp::require(session.applyPrepared(payload.clone(),nullptr,0)["kind"].toString()=="accepted","Pre-configuration document edit was rejected");
        render(session,48000,512,latencies[0]);
        const auto planned=[&](const V& candidate) {
            auto value=zp::object();zp::put(value,"request",candidate);zp::put(value,"plan",session.call("configuration_plan",candidate));
            zp::put(value,"leaseId","isolated-format");zp::put(value,"sessionId","isolated-format");return value;
        };
        driver->reject96k=true;bool rejected=false;
        try { submit(1,planned(highRate)); }catch(const std::exception& error) { rejected=juce::String(error.what()).contains("Injected hosted driver"); }
        driver->reject96k=false;zp::require(rejected,"Hosted driver failure did not reject prepared configuration");
        zp::require(zp::MixerTestAccess::device(session,"format-delay")==original && double(session.call("devices",zp::object())["sampleRate"])==48000,"Driver failure lost old processor or format");
        render(session,48000,512,latencies[0]);
        submit(2,planned(highRate));zp::require(&zp::MixerTestAccess::edit(session)==edit && zp::MixerTestAccess::device(session,"format-delay")!=original,"Format change replaced Edit or retained incompatible processor");
        render(session,96000,256,latencies[2]);
        submit(3,planned(smallBuffer));auto retained=zp::MixerTestAccess::device(session,"format-delay");render(session,96000,128,latencies[3]);
        auto* isolated=dynamic_cast<zp::IsolatedDevicePlugin*>(retained.get());
        zp::require(isolated->setEditorAuthority(isolated->processorContext(),99,true),"Cannot establish editor authority");
        rejected=false;try { planned(baseline); }catch(const std::exception& error) { rejected=juce::String(error.what()).contains("Close and apply"); }
        zp::require(rejected && isolated->setEditorAuthority(isolated->processorContext(),99,false),"Format change ignored open editor authority");
        const auto stale=planned(baseline);zp::put(model,"sequence",2);zp::put(model,"baseRevision",1);zp::put(model,"revision",2);zp::put(track,"volumeDb",-4);
        zp::require(session.applyPrepared(payload.clone(),nullptr,0)["kind"].toString()=="accepted","Intervening document edit was rejected");
        rejected=false;try { submit(4,stale); }catch(const std::exception& error) { rejected=juce::String(error.what()).contains("Stale plugin configuration owner"); }
        zp::require(rejected && zp::MixerTestAccess::device(session,"format-delay")==retained,"Stale format plan replaced newer document resources");
        const auto valid=planned(baseline);
        zp::ScopedAudioPreferences::set("ZOEYDAW_AUDIO_CONFIG_PATH",preferences.file().getChildFile("impossible.json").getFullPathName());
        rejected=false;try { submit(5,valid); }catch(const std::exception& error) { rejected=juce::String(error.what()).contains("audio preferences"); }
        zp::ScopedAudioPreferences::set("ZOEYDAW_AUDIO_CONFIG_PATH",preferences.file().getFullPathName());
        const auto actual=session.call("devices",zp::object());
        zp::require(rejected && zp::MixerTestAccess::device(session,"format-delay")==retained && double(actual["sampleRate"])==96000 && int(actual["bufferFrames"])==128,"Persistence failure did not restore processor and driver together");
        render(session,96000,128,latencies[3]);return 0;
    }catch(const std::exception& error) { std::fprintf(stderr,"Isolated configuration: %s\n",error.what());return -40; }
}
