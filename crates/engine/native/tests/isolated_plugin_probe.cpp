#include "isolated_plugin_node.h"
#include "isolated_device_plugin.h"
#include "engine_session.h"
#include <tracktion_engine/tracktion_engine.h>
#include <tracktion_engine/playback/graph/tracktion_TracktionEngineNode.h>
#include <thread>
#include <chrono>
#include <cmath>
#include <stdexcept>

namespace zp {
struct MixerTestAccess {
    static tracktion::Edit& edit(EngineSession& session) { return *session.arrangement->edit; }
    static tracktion::AudioTrack& track(EngineSession& session) { return *session.arrangement->tracks.at("main"); }
    static void configure(EngineSession& session,tracktion::CreateNodeParams& params) { session.configureMeterGraph(edit(session),params); }
    static std::shared_ptr<IsolatedPluginBinding> admitted(EngineSession& session,uint64_t token) { return session.pluginAdmissions.at(token).binding; }
    static tracktion::Plugin::Ptr device(EngineSession& session,const char* id) { return session.arrangement->devices.at(id); }
};
}

namespace {
namespace graph=tracktion::graph;
class Impulse final : public graph::Node {
public:
    graph::NodeProperties getNodeProperties() override { return {true,false,2,0,0}; }
    bool isReadyToProcess() override { return true; }
private:
    void process(ProcessContext& context) override {
        context.buffers.audio.clear();
        for(unsigned i=0;i<context.numSamples;++i) {
            const auto frame=context.referenceSampleRange.getStart()+i;
            if(frame==2065)context.buffers.audio.getSample(0,i)=.5f;
            if(frame==3103)context.buffers.audio.getSample(1,i)=-.25f;
        }
    }
};
class Notes final : public graph::Node {
public:
    graph::NodeProperties getNodeProperties() override { return {false,true,0,0,0}; }
    bool isReadyToProcess() override { return true; }
private:
    void prepareToPlay(const graph::PlaybackInitialisationInfo&) override { seed.reserve(2); }
    void process(ProcessContext& context) override {
        if(first) { seed.swapWith(context.buffers.midi);first=false; }
        for(const int64_t frame:{2065,3103})if(context.referenceSampleRange.contains(frame)) {
            auto message=frame==2065?juce::MidiMessage::noteOn(1,69,juce::uint8(100)):juce::MidiMessage::noteOff(1,69);
            context.buffers.midi.addMidiMessage(std::move(message),double(frame-context.referenceSampleRange.getStart())/48000,{});
        }
    }
    tracktion::engine::MidiMessageArray seed;
    bool first=true;
};
class ConstantSignal final : public graph::Node {
public:
    graph::NodeProperties getNodeProperties() override { return {true,false,2,0,0}; }
    bool isReadyToProcess() override { return true; }
private:
    void process(ProcessContext& context) override {
        for(unsigned channel=0;channel<2;++channel)
            for(unsigned sample=0;sample<context.numSamples;++sample)context.buffers.audio.getSample(channel,sample)=.5f;
    }
};
}
#if defined(_WIN32)
#define ZD_PROBE_EXPORT __declspec(dllexport)
#else
#define ZD_PROBE_EXPORT __attribute__((visibility("default")))
#endif
extern "C" ZD_PROBE_EXPORT int32_t zd_verify_isolated_graph(zd_plugin_owned_processor processor,uint32_t latency,uint32_t sumDry) {
    try {
        zp::IsolatedPluginBindings bindings;
        auto binding=bindings.retainOwned(processor,{48000,512,2,2,latency});
        binding->enabled.store(sumDry!=2);
        juce::ScopedJuceInitialiser_GUI gui;
        graph::PlayHead playhead;graph::PlayHeadState head(playhead);
        tracktion::tempo::Sequence tempo({{tracktion::BeatPosition::fromBeats(0),120,0}},
            {{tracktion::BeatPosition::fromBeats(0),3,8,false}},tracktion::tempo::LengthOfOneBeat::dependsOnTimeSignature);
        tracktion::engine::ProcessState state(head,tempo);playhead.setLoopRange(true,{0,36000});
        auto& status=binding->status;
        auto node=zp::createIsolatedPluginNode(std::make_unique<Impulse>(),binding,state);
        if(node->getNodeProperties().latencyNumSamples!=int(latency))return -10;
        if(sumDry==1) {
            auto sum=std::make_unique<graph::SummingNode>();
            sum->addInput(std::move(node));sum->addInput(std::make_unique<Impulse>());
            node=std::move(sum);
        }
        graph::NodePlayer player;player.setNode(std::move(node),48000,512);
        juce::AudioBuffer<float> output(2,128);tracktion::engine::MidiMessageArray midi;midi.reserve(8192);
        int impulses[2]{};
        for(int block=0;block<64;++block) {
            if(block%4==0)std::this_thread::sleep_for(std::chrono::milliseconds(15));
            const int64_t start=block*128;
            if(sumDry==3 && (block==8 || block==20))binding->setParameters({{0,block==8?.25:.75}});
            state.referenceSampleRange={start,start+128};state.timelineSampleRange={start,start+128};
            output.clear();midi.clear();
            graph::Node::ProcessContext context{128,{start,start+128},{graph::toBufferView(output),midi}};
            player.process(context);
            if(status.load()<0)return status.load();
            for(int channel=0;channel<2;++channel)for(int sample=0;sample<128;++sample) {
                const auto expectedFrame=(channel==0?2065:3103)+int64_t(latency);
                const float gain=sumDry==3?(channel==0?.25f:.75f):(sumDry==1?2.f:1.f);
                const auto expected=start+sample==expectedFrame?(channel==0?.5f:-.25f)*gain:0.f;
                if(std::abs(output.getSample(channel,sample)-expected)>1e-6)return -11;
                if(expected!=0)++impulses[channel];
            }
        }
        return impulses[0]==1 && impulses[1]==1?0:-12;
    }catch(...) { return -13; }
}
extern "C" ZD_PROBE_EXPORT int32_t zd_verify_isolated_instrument(zd_plugin_owned_processor processor,uint32_t latency) {
    try {
        zp::IsolatedPluginBindings bindings;
        auto binding=bindings.retainOwned(processor,{48000,512,0,2,latency});
        juce::ScopedJuceInitialiser_GUI gui;
        graph::PlayHead playhead;graph::PlayHeadState head(playhead);
        tracktion::tempo::Sequence tempo({{tracktion::BeatPosition::fromBeats(0),120,0}},
            {{tracktion::BeatPosition::fromBeats(0),3,8,false}},tracktion::tempo::LengthOfOneBeat::dependsOnTimeSignature);
        tracktion::engine::ProcessState state(head,tempo);playhead.setLoopRange(true,{0,36000});
        auto& status=binding->status;
        auto node=zp::createIsolatedPluginNode(std::make_unique<Notes>(),binding,state);
        graph::NodePlayer player;player.setNode(std::move(node),48000,512);
        juce::AudioBuffer<float> output(2,128);tracktion::engine::MidiMessageArray midi;midi.reserve(8192);
        double energy=0;
        for(int block=0;block<64;++block) {
            if(block%4==0)std::this_thread::sleep_for(std::chrono::milliseconds(15));
            const int64_t start=block*128;
            state.referenceSampleRange={start,start+128};state.timelineSampleRange={start,start+128};
            output.clear();midi.clear();
            graph::Node::ProcessContext context{128,{start,start+128},{graph::toBufferView(output),midi}};
            player.process(context);
            if(status.load()<0)return status.load();
            for(int channel=0;channel<2;++channel)for(int sample=0;sample<128;++sample) {
                const auto frame=start+sample;const auto value=output.getSample(channel,sample);
                if(!std::isfinite(value))return -14;
                if(frame>=2065+latency && frame<3103+latency)energy+=double(value)*value;
                else if(std::abs(value)>1e-6)return -15;
            }
        }
        return energy>.01?0:-16;
    }catch(...) { return -13; }
}

extern "C" ZD_PROBE_EXPORT int32_t zd_verify_isolated_edit(zd_plugin_owned_processor processor,uint32_t latency) {
    try {
        juce::ScopedJuceInitialiser_GUI gui;
        zp::EngineSession session;
        auto request=zp::parse(R"JSON({"protocolVersion":2,"sessionId":"isolated-edit","sequence":0,"baseRevision":0,"revision":0,"stage":"open","editId":null,"controlGeneration":"0","state":{"project":{"bpm":120,"numerator":4,"denominator":4,"loop":{"enabled":false,"startBar":1,"endBar":5},"sources":[],"tracks":[{"id":"main","kind":"main","output":"external","input":"none","inputChannel":null,"outputChannel":"1-2","monitor":"off","volumeDb":-6.020599913,"pan":0,"mute":false,"solo":false,"armed":false,"sends":{},"returnPost":false,"cueOutput":null,"cueVolumeDb":-18,"devices":[],"clips":[],"automation":[],"childTrackIds":[]}]},"control":{"playing":false,"recording":false,"seekBar":1,"seekGeneration":0}}})JSON");
        auto payload=zp::object();zp::put(payload,"request",request);zp::put(payload,"leaseId","isolated-edit");zp::put(payload,"stopToken",0);zp::put(payload,"stopEpoch",0);
        auto external=zp::parse(R"({"id":"probe-synth","kind":"external","enabled":true,"plugin":{"catalogId":"0000000000000000000000000000000000000000000000000000000000000000","format":"clap","classId":"com.studio.plughost.test-synth","name":"Real isolated synth","vendor":"fixture","version":"1","role":"instrument"},"stateRef":null,"parameters":[]})");
        auto authoredTrack=request["state"]["project"]["tracks"][0];zp::put(authoredTrack,"devices",juce::Array<zp::V>{external});
        zd_plugin_prepared prepared {"probe-synth",processor,48000,512,0,2,latency};
        if(session.applyPrepared(payload,&prepared,1)["kind"].toString()!="accepted")return -27;
        auto& edit=zp::MixerTestAccess::edit(session);
        auto plugin=zp::MixerTestAccess::device(session,"probe-synth");
        graph::PlayHead playhead;graph::PlayHeadState head(playhead);tracktion::ProcessState state(head,edit.tempoSequence);
        tracktion::CreateNodeParams params{state};params.sampleRate=48000;params.blockSize=512;
        zp::MixerTestAccess::configure(session,params);
        auto actual=params.createCustomPluginNode;
        params.createCustomPluginNode=[actual,expected=plugin.get()](tracktion::Plugin& item,const tracktion::TrackMuteState* mute,
            const tracktion::CreateNodeParams& build,std::unique_ptr<graph::Node>& source) {
            if(&item==expected)source=std::make_unique<Notes>();
            return actual(item,mute,build,source);
        };
        auto node=tracktion::createNodeForEdit(edit,params);
        if(!node)return -21;
        auto meters=std::make_shared<zp::MeterGraph>(zp::MeterBankIdentity{1,1,1},48000);
        node=meters->observeOutput(std::move(node),{},{{plugin.get(),"probe-synth"}});
        meters->seal();zp::MeterGraphCollector meterCollector(meters);
        if(meters->endpoints().size()!=1 || meters->endpoints().front().endpointId!="device/probe-synth/out"
            || meters->endpoints().front().channelCount!=2)return -26;
        graph::NodePlayer player;player.setNode(std::move(node),48000,512);
        juce::AudioBuffer<float> output(2,128);tracktion::MidiMessageArray midi;midi.reserve(8192);
        session.arrangementAudible.store(true);playhead.play();double energy=0,meterPeak=0;
        for(int block=0;block<64;++block) {
            if(block%4==0)std::this_thread::sleep_for(std::chrono::milliseconds(15));
            const int64_t start=block*128;playhead.setReferenceSampleRange({start,start+128});
            state.update(48000,{start,start+128},tracktion::ProcessState::UpdateContinuityFlags::yes);
            output.clear();midi.clear();graph::Node::ProcessContext context{128,{start,start+128},{graph::toBufferView(output),midi}};
            player.process(context);
            meterCollector.collect();
            if(const auto* value=meterCollector.latest("device/probe-synth/out",0))meterPeak=std::max(meterPeak,double(value->current.peak));
            for(int channel=0;channel<2;++channel)for(int sample=0;sample<128;++sample) {
                const auto frame=start+sample;const auto value=output.getSample(channel,sample);
                if(!std::isfinite(value))return -22;
                if(frame>=2065+latency && frame<3103+latency)energy+=double(value)*value;
                else if(std::abs(value)>1e-6)return -23;
            }
        }
        return energy>.001 && meterPeak>.001?0:-24;
    }catch(const std::exception& error) { std::fprintf(stderr,"Isolated Edit: %s\n",error.what());return -25; }
}
extern "C" ZD_PROBE_EXPORT int32_t zd_verify_isolated_automation(zd_plugin_owned_processor processor,uint32_t latency,uint32_t vst3) {
    try {
        juce::ScopedJuceInitialiser_GUI gui;
        zp::EngineSession session;
        auto request=zp::parse(R"JSON({"protocolVersion":2,"sessionId":"isolated-automation","sequence":0,"baseRevision":0,"revision":0,"stage":"open","editId":null,"controlGeneration":"0","state":{"project":{"bpm":120,"numerator":4,"denominator":4,"loop":{"enabled":false,"startBar":1,"endBar":5},"sources":[],"tracks":[{"id":"main","kind":"main","output":"external","input":"none","inputChannel":null,"outputChannel":"1-2","monitor":"off","volumeDb":0,"pan":0,"mute":false,"solo":false,"armed":false,"sends":{},"returnPost":false,"cueOutput":null,"cueVolumeDb":-18,"devices":[],"clips":[],"automation":[],"childTrackIds":[]}]},"control":{"playing":false,"recording":false,"seekBar":1,"seekGeneration":0}}})JSON");
        auto payload=zp::object();zp::put(payload,"request",request);zp::put(payload,"leaseId","isolated-automation");zp::put(payload,"stopToken",0);zp::put(payload,"stopEpoch",0);
        auto external=zp::parse(R"({"id":"probe-delay","kind":"external","enabled":true,"plugin":{"catalogId":"0000000000000000000000000000000000000000000000000000000000000000","format":"clap","classId":"com.studio.plughost.test-delay.79000001","name":"Real isolated delay","vendor":"fixture","version":"1","role":"effect"},"stateRef":null,"parameters":[{"id":"0","normalized":0.6},{"id":"9","normalized":0.5}]})");
        if(vst3) { auto identity=external["plugin"];zp::put(identity,"format","vst3");zp::put(identity,"classId","706C7567686F737444656C6179000001"); }
        auto track=request["state"]["project"]["tracks"][0];zp::put(track,"devices",juce::Array<zp::V>{external});
        auto lane=zp::parse(R"({"id":"gain-envelope","target":{"kind":"device","deviceId":"probe-delay","parameter":"0"},"points":[{"id":"first","bar":1,"value":0.25}]})");
        zp::put(track,"automation",juce::Array<zp::V>{lane});
        auto project=request["state"]["project"];auto gainPoint=lane["points"][0];auto manualValue=external["parameters"][0];
        zd_plugin_prepared prepared {"probe-delay",processor,48000,512,2,2,latency};
        const auto opened=session.applyPrepared(payload.clone(),&prepared,1);
        if(opened["kind"].toString()!="accepted")throw std::runtime_error(juce::JSON::toString(opened).toStdString());
        auto& edit=zp::MixerTestAccess::edit(session);auto plugin=zp::MixerTestAccess::device(session,"probe-delay");
        edit.getAutomationRecordManager().setReadingAutomation(true);
        graph::PlayHead playhead;graph::PlayHeadState head(playhead);tracktion::ProcessState state(head,edit.tempoSequence);
        tracktion::CreateNodeParams params{state};params.sampleRate=48000;params.blockSize=512;
        zp::MixerTestAccess::configure(session,params);auto factory=params.createCustomPluginNode;
        params.createCustomPluginNode=[factory,expected=plugin.get()](tracktion::Plugin& item,const tracktion::TrackMuteState* mute,
            const tracktion::CreateNodeParams& build,std::unique_ptr<graph::Node>& source) {
            if(&item==expected)source=std::make_unique<ConstantSignal>();
            return factory(item,mute,build,source);
        };
        graph::NodePlayer player;player.setNode(tracktion::createNodeForEdit(edit,params),48000,512);
        juce::AudioBuffer<float> output(2,256);tracktion::MidiMessageArray midi;midi.reserve(8192);
        session.arrangementAudible.store(true);playhead.play();int revision=0;
        for(int block=0;block<256;++block) {
            if(block>0 && block%32==0) {
                if(block==32)zp::put(gainPoint,"value",0.75);
                if(block==64)zp::put(manualValue,"normalized",0.8);
                if(block==96)zp::put(project,"bpm",180);
                if(block==128)zp::put(track,"automation",juce::Array<zp::V>{});
                if(block==160)zp::put(manualValue,"normalized",0.4);
                if(block==192) {
                    lane=zp::parse(R"({"id":"gain-envelope","target":{"kind":"device","deviceId":"probe-delay","parameter":"0"},"points":[{"id":"first","bar":1,"value":0.25},{"id":"last","bar":2,"value":0.75}]})");
                    zp::put(track,"automation",juce::Array<zp::V>{lane});
                }
                if(block==224)zp::put(track,"automation",juce::Array<zp::V>{});
                zp::put(request,"sequence",revision+1);zp::put(request,"baseRevision",revision);zp::put(request,"revision",revision+1);
                zp::put(request,"stage","preview");zp::put(request,"editId","automation-probe");
                const auto response=session.applyPrepared(payload.clone(),nullptr,0);
                if(response["kind"].toString()!="accepted")throw std::runtime_error(juce::JSON::toString(response).toStdString());
                session.arrangementAudible.store(true);
                ++revision;
                if(&zp::MixerTestAccess::edit(session)!=&edit || zp::MixerTestAccess::device(session,"probe-delay")!=plugin)return -32;
            }
            if(block%2==0)std::this_thread::sleep_for(std::chrono::milliseconds(15));
            const int64_t start=block*256;playhead.setReferenceSampleRange({start,start+256});
            state.update(48000,{start,start+256},tracktion::ProcessState::UpdateContinuityFlags::yes);
            output.clear();midi.clear();graph::Node::ProcessContext context{256,{start,start+256},{graph::toBufferView(output),midi}};
            player.process(context);
            if(block%32>=20) {
                for(int channel=0;channel<2;++channel)for(int sample=0;sample<256;++sample) {
                    const auto eventSample=(start+sample-(int64_t(latency)-480))/128*128-int64_t(latency);
                    const float ramp=float(.125+.25*std::clamp(double(eventSample)/64000.0,0.0,1.0));
                    const float expected=block<32?.125f:block<128?.375f:block<160?.4f:block<192?.2f:block<224?ramp:.2f;
                    if(std::abs(output.getSample(channel,sample)-expected)>1e-5) {
                        std::fprintf(stderr,"Automation PCM block %d sample %d: %.8f expected %.8f\n",block,sample,output.getSample(channel,sample),expected);return -33;
                    }
                }
            }
        }
        return 0;
    }catch(const std::exception& error) { std::fprintf(stderr,"Isolated automation: %s\n",error.what());return -34; }
}
