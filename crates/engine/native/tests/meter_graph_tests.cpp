#include "engine_session.h"
#include "device_test_support.h"
#include "meter_read.h"
#include <thread>
#include <tracktion_engine/playback/graph/tracktion_EditNodeBuilder.h>
#include <tracktion_engine/playback/graph/tracktion_TracktionEngineNode.h>
#include <algorithm>
#include <array>
#include <cmath>
#include <iostream>
#include <numbers>
#include <stdexcept>

namespace zp {
struct MixerTestAccess {
    static te::Edit& edit(EngineSession& session) { return *session.arrangement->edit; }
    static te::AudioTrack& track(EngineSession& session, const char* id) { return *session.arrangement->tracks.at(id); }
    static void configure(EngineSession& session, te::CreateNodeParams& params) { session.configureMeterGraph(edit(session),params); }
    static MeterGraphCollector& collector(EngineSession& session) { return *session.arrangement->meterCollector; }
    static const MeterGraph& graph(EngineSession& session) { return *session.arrangement->meterGraph; }
    static const auto& identities(EngineSession& session) { return session.arrangement->meterOutputs; }
    static void install(EngineSession& session,std::shared_ptr<const MeterGraph> graph,std::shared_ptr<MeterGraphCollector> collector) {
        session.arrangement->meterGraph=std::move(graph);session.arrangement->meterCollector=std::move(collector);
    }
};
}
namespace {
using namespace zp;
namespace graph = tracktion::graph;
void expect(bool passed, const char* message) { if(!passed)throw std::runtime_error(message); }
class Samples final : public graph::Node {
public:
    Samples(int channels, bool sine) : channels(channels), sine(sine) {}
    graph::NodeProperties getNodeProperties() override { return {true,false,channels,0,0}; }
    bool isReadyToProcess() override { return true; }
private:
    void process(ProcessContext& context) override {
        for(int channel=0;channel<channels;++channel)
            for(choc::buffer::FrameCount frame=0;frame<context.numSamples;++frame) {
                const auto sample=context.referenceSampleRange.getStart()+frame;
                context.buffers.audio.getSample(channel,frame)=sine
                    ? static_cast<float>(.25*std::sin(2*std::numbers::pi*sample/48.0))
                    : .25f*(channel+1);
            }
    }
    int channels;
    bool sine;
};
void process(graph::NodePlayer& player, juce::AudioBuffer<float>& audio, std::int64_t start, int count) {
    audio.clear();tracktion::engine::MidiMessageArray midi;
    graph::Node::ProcessContext context{static_cast<choc::buffer::FrameCount>(count),{start,start+count},
        {graph::toBufferView(audio).getStart(static_cast<choc::buffer::FrameCount>(count)),midi}};
    player.process(context);
}
void testSamplesAndIdentity() {
    for(const int channels:{1,2,6}) {
        auto bank=std::make_shared<MeterGraph>(MeterBankIdentity{7,11,13},48000);
        auto node=bank->wrapOutput(std::make_unique<Samples>(channels,false),"track/voice/out","voice","track-out");
        bank->seal();
        const auto& endpoint=bank->endpoints().front();
        expect(endpoint.channelCount==channels && endpoint.firstSlot==0,"Actual graph channel layout was not retained");
        expect(!MeterReadHandle::acquire(endpoint.bank,{8,11,13}),"Wrong device epoch acquired meter lane");
        expect(!MeterReadHandle::acquire(endpoint.bank,{7,12,13}),"Wrong graph acquired meter lane");
        expect(!MeterReadHandle::acquire(endpoint.bank,{7,11,14}),"Wrong registry acquired meter lane");
        MeterGraphCollector collector(bank);
        expect(!MeterReadHandle::acquire(endpoint.bank,bank->identity),"Second consumer acquired graph mailbox");
        graph::NodePlayer player;player.setNode(std::move(node),48000,512);
        juce::AudioBuffer<float> output(channels,512);process(player,output,1000,257);collector.collect();
        for(int channel=0;channel<channels;++channel) {
            const auto* publication=collector.latest("track/voice/out",static_cast<std::uint16_t>(channel));
            const auto amplitude=.25f*(channel+1);
            expect(publication && publication->available && publication->current.valid,"Missing DC publication");
            expect(publication->current.count==257 && publication->current.startSample==1000
                && publication->current.endSample==1257,"Graph tap changed actual sample interval");
            expect(std::abs(publication->current.peak-amplitude)<1e-7,"Graph DC peak mismatch");
            expect(std::abs(publication->current.sumSquares-257.0*amplitude*amplitude)<1e-7,"Graph DC energy mismatch");
            expect(std::abs(output.getSample(channel,128)-amplitude)<1e-7,"Meter node changed audible samples");
        }
        expect(!bank->canRetire(),"Live graph reported safe retirement");
        process(player,output,1257,255);collector.collect();
        const auto* next=collector.latest("track/voice/out",0);
        expect(next && next->completedValid && next->completed.count==257 && next->current.count==255,
               "Graph meter consumer did not rotate whole epochs");
        bool sealed=false;try { bank->wrapOutput(std::make_unique<Samples>(1,false),"track/new/out","new","track-out"); }
        catch(const std::logic_error&) { sealed=true; }expect(sealed,"Published graph registry remained mutable");
    }
    auto bank=std::make_shared<MeterGraph>(MeterBankIdentity{7,21,21},48000);
    auto node=bank->wrapOutput(std::make_unique<Samples>(1,true),"track/sine/out","sine","track-out");bank->seal();
    MeterGraphCollector collector(bank);graph::NodePlayer player;player.setNode(std::move(node),48000,480);
    juce::AudioBuffer<float> output(1,480);process(player,output,0,480);collector.collect();
    const auto* value=collector.latest("track/sine/out",0);
    expect(value && std::abs(std::sqrt(value->current.sumSquares/value->current.count)-.25/std::sqrt(2.0))<1e-7,
           "Graph sine energy differs from real input samples");
}
void testHubReadHandle() {
    auto bank=std::make_shared<MeterGraph>(MeterBankIdentity{4,5,6},48000);
    auto node=bank->wrapOutput(std::make_unique<Samples>(2,false),"track/hub/out","hub","track-out");bank->seal();
    auto collector=std::make_shared<MeterGraphCollector>(bank);
    expect(collector->acquireHub() && !collector->acquireHub(),"Hub ownership admitted duplicate reader");
    auto* handle=new zp_meter_read_handle(collector);
    graph::NodePlayer player;player.setNode(std::move(node),48000,256);
    juce::AudioBuffer<float> output(2,256);process(player,output,1000,256);
    const uint32_t slots[]={0,1};zp_meter_publication values[2]{};uint32_t read=0;
    std::thread hub([&]{read=zp_meter_read(handle,slots,2,values,2);});hub.join();
    expect(read==2 && values[0].available && values[0].current.frames==256 && values[0].current.start_sample==1000,
           "Hub C ABI lost actual frame range");
    expect(values[0].current.peak==.25f && values[1].current.peak==.5f && values[0].current.sum_squares==16,
           "Hub C ABI changed stereo PCM statistics");
    MeterPublication cached;expect(collector->copyLatest("track/hub/out",0,cached) && cached.current.count==256,
                                  "Legacy telemetry could not read the Hub cache");
    const uint32_t invalid=2;expect(zp_meter_read(handle,&invalid,1,values,2)==0,"Invalid Hub slot was accepted");
    handle->reading.test_and_set();expect(zp_meter_read(handle,slots,2,values,2)==0,"Concurrent Hub read was admitted");handle->reading.clear();
    const uint32_t badReset[]={0,2};
    expect(zp_meter_reset(handle,badReset,2,1,3)==0,"Partial invalid reset was accepted");
    const uint32_t duplicates[]={0,0};expect(zp_meter_reset(handle,duplicates,2,1,3)==0,"Duplicate reset slots were accepted");
    process(player,output,1256,256);expect(zp_meter_read(handle,slots,2,values,2)==2 && values[0].slot_reset_epoch==0,
                                        "Invalid reset partially cleared a valid slot");
    const uint32_t first=0;expect(zp_meter_reset(handle,&first,1,1,3)==1,"Valid selective reset was rejected");
    expect(zp_meter_read(handle,slots,2,values,2)==2 && values[0].slot_reset_epoch==0,"Reset acknowledged before audio processed");
    process(player,output,1512,256);expect(zp_meter_read(handle,slots,2,values,2)==2 && values[0].slot_reset_epoch==1 && values[1].slot_reset_epoch==0,
                                        "Selective reset changed the unaffected channel epoch");
    expect(values[1].session_peak==.5f && values[1].hold_reset_epoch==0,"Selective reset cleared the other channel latch");
    expect(zp_meter_reset(handle,&first,1,1,3)==0,"Old reset epoch was accepted twice");
    player.setNode({});collector.reset();
    expect(!bank->canRetire(),"Read handle failed to retain retired meter banks");
    expect(zp_meter_read(handle,slots,2,values,2)==2 && values[0].current.frames==256,
           "Retired read handle followed a replacement graph");
    zp_meter_release(handle);expect(bank->canRetire(),"Released Hub handle retained old meter bank");
}
void testInputHubReadHandle() {
    InputMeter input;expect(input.prepare(2),"Input bank preparation failed");
    auto collector=input.collector(input.deviceEpoch());
    expect(collector->acquireHub(),"Input Hub admission failed");
    auto* handle=new zp_meter_read_handle(collector);
    std::array<float,256> left,right;left.fill(.25f);right.fill(.5f);
    const float* channels[]={left.data(),right.data()};
    input.process(channels,2,256,1000);
    const std::uint32_t slots[]={0,1};zp_meter_publication values[2]{};
    expect(zp_meter_read(handle,slots,2,values,2)==2 && values[0].current.peak==.25f
           && values[1].current.peak==.5f && values[0].current.sum_squares==16,
           "Input C ABI did not preserve physical channel statistics");
    MeterPublication cached;
    expect(collector->copyLatest(0,cached) && cached.current.endSample==1256,
           "Input legacy consumer did not see the shared cache");
    const std::uint32_t invalid[]={0,2};
    expect(zp_meter_reset(handle,invalid,2,1,3)==0,"Input reset accepted partial invalid request");
    expect(zp_meter_reset(handle,slots,1,1,3)==1,"Input selective reset rejected");
    input.process(channels,2,256,1256);
    expect(zp_meter_read(handle,slots,2,values,2)==2 && values[0].slot_reset_epoch==1
           && values[1].slot_reset_epoch==0 && values[1].session_peak==.5f,
           "Input reset cleared an unrelated physical channel");
    input.stop();expect(input.prepare(1),"Input replacement preparation failed");
    input.process(channels,1,256,1512);
    expect(zp_meter_read(handle,slots,2,values,2)==2 && values[0].current.end_sample==1512,
           "Retired input handle followed replacement device epoch");
    zp_meter_release(handle);
    expect(!collector->hasHub(),"Released input handle retained Hub ownership");
}
void testGraphIsolationAndRetirement() {
    auto old=std::make_shared<MeterGraph>(MeterBankIdentity{2,1,1},48000);
    auto oldNode=old->wrapOutput(std::make_unique<Samples>(1,false),"track/stable/out","stable","track-out");old->seal();
    auto lookedUpBank=old->endpoints()[0].bank;
    auto reader=MeterReadHandle::acquire(lookedUpBank,old->identity);
    expect(reader!=nullptr,"Current graph identity could not acquire its lane");
    lookedUpBank.reset();
    graph::NodePlayer player;player.setNode(std::move(oldNode),48000,64);
    juce::AudioBuffer<float> mono(1,64);process(player,mono,0,64);
    MeterPublication first;expect(reader->read(0,first) && first.current.startSample==0,"Current graph sample publication missing");
    reader.reset();expect(!old->canRetire(),"Node-owned bank retired while graph still held its lane");
    reader=MeterReadHandle::acquire(old->endpoints()[0].bank,old->identity);
    expect(reader!=nullptr,"Released current graph reader could not be reacquired");
    process(player,mono,64,64);

    auto replacement=std::make_shared<MeterGraph>(MeterBankIdentity{2,2,2},48000);
    auto nextNode=replacement->wrapOutput(std::make_unique<Samples>(6,true),"track/reordered/out","reordered","track-out");
    nextNode=replacement->wrapOutput(std::move(nextNode),"track/stable/out","stable","track-out");replacement->seal();
    const auto& nextEndpoint=replacement->endpoints()[1];
    expect(nextEndpoint.endpointId==old->endpoints()[0].endpointId && nextEndpoint.firstSlot==6
        && nextEndpoint.channelCount==6 && nextEndpoint.bank!=old->endpoints()[0].bank,
        "Reordered multichannel graph reused old slot identity or audio lane");
    expect(!MeterReadHandle::acquire(nextEndpoint.bank,old->identity),"Old generation acquired replacement graph slots");
    expect(!MeterReadHandle::acquire(nextEndpoint.bank,{3,2,2}),"Old device lookup acquired replacement device bank");
    player.setNode(std::move(nextNode),48000,64);
    MeterGraphCollector nextReader(replacement);juce::AudioBuffer<float> output(6,64);
    process(player,output,128,64);nextReader.collect();

    MeterPublication retired;
    expect(reader->read(0,retired) && retired.current.startSample==64 && retired.current.count==64
        && retired.current.peak==.25f,"Bound old reader followed replacement slot instead of its retired bank");
    expect(!reader->read(1,retired),"Old mono reader exposed replacement multichannel slot");
    expect(!old->canRetire(),"Retirement ignored outstanding non-RT read handle");
    reader.reset();expect(old->canRetire(),"Old graph remained pinned after node and reader release");
    const auto* latest=nextReader.latest("track/stable/out",5);
    expect(latest && latest->current.startSample==128 && latest->current.count==64,
        "Replacement inherited old epoch state or lost its new channel mapping");
}
class ConstantPlugin final : public te::Plugin {
public:
    explicit ConstantPlugin(te::PluginCreationInfo info) : Plugin(info) {}
    juce::String getName() const override { return "Meter test sample generator"; }
    juce::String getSelectableDescription() override { return getName(); }
    juce::String getPluginType() override { return "meter-test-source"; }
    BusLayout getBusses() const override { return BusLayout::singlePassThrough(); }
    int getNumOutputChannelsGivenInputs(int channels) override { return std::max(channels,2); }
    bool producesAudioWhenNoAudioInput() override { return true; }
    void initialise(const te::PluginInitialisationInfo&) override {}
    void deinitialise() override {}
    void applyToBuffer(const te::PluginRenderContext& context) override {
        if(context.destBuffer)
            for(int channel=0;channel<context.destBuffer->getNumChannels();++channel)
                std::fill_n(context.destBuffer->getWritePointer(channel)+context.bufferStartSample,context.bufferNumSamples,.25f);
    }
};
class ConstantFactory final : public te::PluginManager::BuiltInType {
public:
    ConstantFactory() : BuiltInType("meter-test-source") {}
    te::Plugin::Ptr create(te::PluginCreationInfo info) override { return te::Plugin::Ptr(new ConstantPlugin(info)); }
};
V request() {
    auto value=parse(R"JSON({"protocolVersion":2,"sessionId":"graph-meter-test","sequence":0,"baseRevision":0,"revision":0,"stage":"open","editId":null,"controlGeneration":"0","state":{"project":{"bpm":120,"numerator":4,"denominator":4,"loop":{"enabled":false,"startBar":1,"endBar":5},"sources":[],"tracks":[{"id":"main","kind":"main","output":"external","input":"none","inputChannel":null,"outputChannel":"1-2","monitor":"off","volumeDb":0,"pan":0,"mute":false,"solo":false,"armed":false,"sends":{},"returnPost":false,"cueOutput":null,"cueVolumeDb":-18,"devices":[],"clips":[],"automation":[],"childTrackIds":[]}]},"control":{"playing":false,"recording":false,"seekBar":1,"seekGeneration":0}}})JSON");
    auto* tracks=value["state"]["project"]["tracks"].getArray();
    for(const auto* id:{"voice","other"}) {
        auto track=tracks->getReference(0).clone();put(track,"id",id);put(track,"kind","audio");put(track,"output","main");tracks->add(track);
    }
    return value;
}
void testRealTrackChain(bool muted, bool otherSolo, bool stopped, bool fenced, bool custom=false) {
    EngineSession session;auto document=request();auto tracks=document["state"]["project"]["tracks"];
    auto voice=tracks[1];put(voice,"volumeDb",-6.020599913);put(voice,"mute",muted);auto other=tracks[2];put(other,"solo",otherSolo);
    auto payload=object();put(payload,"request",document);put(payload,"leaseId","meter-test");put(payload,"stopToken",0);put(payload,"stopEpoch",0);
    expect(session.call("apply",payload)["kind"].toString()=="accepted","Offline meter fixture rejected");
    auto& edit=MixerTestAccess::edit(session);auto& track=MixerTestAccess::track(session,"voice");
    expect(track.getLevelMeterPlugin()==nullptr,"Legacy locked LevelMeterPlugin remains in track graph");
    edit.engine.getPluginManager().registerBuiltInType(std::make_unique<ConstantFactory>());
    auto source=edit.getPluginCache().createNewPlugin("meter-test-source",{});
    expect(source!=nullptr,"Actual test source plugin was not created");
    track.pluginList.insertPlugin(source,0,nullptr);
    auto legacy=edit.getPluginCache().createNewPlugin(te::LevelMeterPlugin::create());
    auto* legacyMeter=dynamic_cast<te::LevelMeterPlugin*>(legacy.get());
    expect(legacyMeter!=nullptr,"Legacy meter probe creation failed");
    track.pluginList.insertPlugin(legacy,-1,nullptr);
    te::LevelMeasurer::Client legacyClient;
    legacyMeter->measurer.addClient(legacyClient);
    session.arrangementAudible.store(!stopped);session.stopToken.store(fenced?1:0);
    graph::PlayHead playhead;graph::PlayHeadState playheadState(playhead);te::ProcessState processState(playheadState,edit.tempoSequence);
    te::CreateNodeParams params{processState};params.sampleRate=48000;params.blockSize=256;
    MixerTestAccess::configure(session,params);
    int customCalls=0;
    if(custom)params.createCustomPluginNode=[&](te::Plugin& plugin,const te::TrackMuteState*,const te::CreateNodeParams&,std::unique_ptr<graph::Node>& input) {
        if(&plugin!=source.get())return false;
        ++customCalls;input=std::make_unique<Samples>(2,false);return true;
    };
    auto node=te::createNodeForEdit(edit,params);expect(node!=nullptr,"Real edit node was not constructed");
    if(custom)expect(customCalls==1,"Custom plugin factory did not replace exactly one chain member");
    auto observerGraph=std::make_shared<MeterGraph>(MeterBankIdentity{1,99,99},48000);
    node=observerGraph->observeOutput(std::move(node),MixerTestAccess::identities(session),{});
    observerGraph->seal();auto observerCollector=std::make_shared<MeterGraphCollector>(observerGraph);
    graph::NodePlayer player;player.setNode(std::move(node),48000,256);
    MixerTestAccess::install(session,observerGraph,observerCollector);
    const auto identity=MixerTestAccess::graph(session).identity;
    expect(!session.acquireMeterGraph("foreign","graph-meter-test",identity.deviceEpoch,identity.generation,identity.registryRevision),"Foreign lease acquired project meters");
    expect(!session.acquireMeterGraph("meter-test","foreign",identity.deviceEpoch,identity.generation,identity.registryRevision),"Foreign session acquired project meters");
    expect(!session.acquireMeterGraph("meter-test","graph-meter-test",identity.deviceEpoch,identity.generation+1,identity.registryRevision),"Stale graph acquired project meters");
    auto hub=session.acquireMeterGraph("meter-test","graph-meter-test",identity.deviceEpoch,identity.generation,identity.registryRevision);
    expect(hub!=nullptr,"Current project failed meter admission");
    expect(!session.acquireMeterGraph("meter-test","graph-meter-test",identity.deviceEpoch,identity.generation,identity.registryRevision),"Second project Hub acquired meters");
    zp_meter_read_handle handle(hub);
    auto query=object();put(query,"leaseId","meter-test");put(query,"sessionId","graph-meter-test");
    const auto registry=session.call("meter_registry",query);
    expect((int)registry["generation"]==(int)identity.generation && registry["entries"].isArray(),"Registry did not describe admitted graph");
    expect(observerGraph->endpoints().size()==3,"Existing API observer did not register actual lanes");
    juce::AudioBuffer<float> audio(2,256);playhead.play();
    for(int block=0;block<16;++block) {
        const std::int64_t start=block*256;playhead.setReferenceSampleRange({start,start+256});
        processState.update(48000,{start,start+256},te::ProcessState::UpdateContinuityFlags::yes);
        process(player,audio,start,256);
        const uint32_t slot=0;zp_meter_publication sampled{};
        expect(zp_meter_read(&handle,&slot,1,&sampled,1)==1 && sampled.current.frames>0,"Project graph did not deliver native Hub samples");
    }
    const auto legacyDb=legacyClient.getAndClearAudioLevel(0).dB;
    legacyMeter->measurer.removeClient(legacyClient);
    expect(legacyDb < -90,"Disabled legacy meter still processed audio samples");
    const bool silent=muted || otherSolo || stopped || fenced;
    const auto expected=silent?0.f:.125f;
    const auto* publication=observerCollector->latest("track/voice/out",0);
    expect(publication && publication->available,"Actual track output meter did not publish");
    expect(std::abs(audio.getSample(0,255)-expected)<1e-5,"Track fader/mute/solo/fence output differs from expected samples");
    if(custom)expect(std::abs(audio.getSample(1,255)-(silent?0.f:.25f))<1e-5,"Custom plugin node did not retain the track fader and output chain");
    expect(std::abs(publication->current.peak-expected)<1e-5,"Meter factory is not post-fader/mute/solo/fence");
    if(stopped || fenced)expect(session.gateClearedFrames.load()>0,"Actual stop fence did not clear graph samples");
}
}
int main() {
    try {
        juce::ScopedJuceInitialiser_GUI gui;zp::ScopedAudioPreferences preferences;
        testSamplesAndIdentity();testGraphIsolationAndRetirement();testHubReadHandle();testInputHubReadHandle();
        testRealTrackChain(false,false,false,false);testRealTrackChain(true,false,false,false);
        testRealTrackChain(false,true,false,false);testRealTrackChain(false,false,true,false);testRealTrackChain(false,false,false,true);
        testRealTrackChain(false,false,false,false,true);testRealTrackChain(true,false,false,false,true);
        std::cout<<"Graph-owned real-sample meter, multichannel, identity, retirement, fader/mute/solo/stop fence tests passed\n";
        return 0;
    } catch(const std::exception& error) { std::cerr<<error.what()<<'\n';return 1; }
}
