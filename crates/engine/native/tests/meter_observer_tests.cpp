#include "engine_session.h"
#include "device_test_support.h"
#include "builtin_device.h"
#include <tracktion_engine/playback/graph/tracktion_EditNodeBuilder.h>
#include <tracktion_engine/playback/graph/tracktion_TracktionEngineNode.h>
#include <tracktion_graph/tracktion_graph/tracktion_TestUtilities.h>
#include <tracktion_graph/tracktion_graph/tracktion_TestNodes.h>
#include <algorithm>
#include <array>
#include <cmath>
#include <iostream>
#include <map>
#include <stdexcept>
#include "input_monitor_tests.h"

namespace zp {
struct MixerTestAccess {
    static te::Edit& edit(EngineSession& session) { return *session.arrangement->edit; }
    static te::AudioTrack& track(EngineSession& session, const char* id) { return *session.arrangement->tracks.at(id); }
};
}

namespace {
using namespace zp;
namespace graph = tracktion::graph;
constexpr int blockSize = 256;
constexpr double sampleRate = 48000;

void expect(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}

class ConstantPlugin final : public te::Plugin {
public:
    explicit ConstantPlugin(te::PluginCreationInfo info) : Plugin(info) {}
    juce::String getName() const override { return "Observer test sample generator"; }
    juce::String getSelectableDescription() override { return getName(); }
    juce::String getPluginType() override { return "meter-test-source"; }
    BusLayout getBusses() const override { return BusLayout::singlePassThrough(); }
    int getNumOutputChannelsGivenInputs(int channels) override { return std::max(channels, 2); }
    bool producesAudioWhenNoAudioInput() override { return true; }
    bool takesMidiInput() override { return true; }
    void initialise(const te::PluginInitialisationInfo&) override {}
    void deinitialise() override {}
    void applyToBuffer(const te::PluginRenderContext& context) override {
        if (context.destBuffer)
            for (int channel = 0; channel < context.destBuffer->getNumChannels(); ++channel)
                std::fill_n(context.destBuffer->getWritePointer(channel) + context.bufferStartSample,
                            context.bufferNumSamples, .25f);
        if(context.bufferForMidiMessages) {
            context.bufferForMidiMessages->addMidiMessage(juce::MidiMessage::noteOn(1,60,1.f),0.0,{});
            context.bufferForMidiMessages->addMidiMessage(juce::MidiMessage::noteOff(1,60),.001,{});
        }
    }
};

class ConstantFactory final : public te::PluginManager::BuiltInType {
public:
    ConstantFactory() : BuiltInType("meter-test-source") {}
    te::Plugin::Ptr create(te::PluginCreationInfo info) override {
        return te::Plugin::Ptr(new ConstantPlugin(info));
    }
};

V request(bool muted, bool otherSolo) {
    auto value = parse(R"JSON({"protocolVersion":2,"sessionId":"observer-meter-test","sequence":0,"baseRevision":0,"revision":0,"stage":"open","editId":null,"controlGeneration":"0","state":{"project":{"bpm":120,"numerator":4,"denominator":4,"loop":{"enabled":false,"startBar":1,"endBar":5},"sources":[],"tracks":[{"id":"main","kind":"main","output":"external","input":"none","inputChannel":null,"outputChannel":"1-2","monitor":"off","volumeDb":0,"pan":0,"mute":false,"solo":false,"armed":false,"sends":{},"returnPost":false,"cueOutput":null,"cueVolumeDb":-18,"devices":[],"clips":[],"automation":[],"childTrackIds":[]} ]},"control":{"playing":false,"recording":false,"seekBar":1,"seekGeneration":0}}})JSON");
    auto* tracks = value["state"]["project"]["tracks"].getArray();
    for (const auto* id : {"voice", "other"}) {
        auto track = tracks->getReference(0).clone();
        put(track, "id", id);
        put(track, "kind", "audio");
        put(track, "output", "main");
        tracks->add(track);
    }
    put(tracks->getReference(1), "volumeDb", -6.020599913);
    put(tracks->getReference(1), "mute", muted);
    put(tracks->getReference(2), "solo", otherSolo);
    return value;
}

void prepare(EngineSession& session, bool muted = false, bool otherSolo = false,
             bool stopped = false, bool fenced = false) {
    auto payload = object();
    put(payload, "request", request(muted, otherSolo));
    put(payload, "leaseId", "observer-test");
    put(payload, "stopToken", 0);
    put(payload, "stopEpoch", 0);
    expect(session.call("apply", payload)["kind"].toString() == "accepted", "Real Edit fixture was rejected");
    auto& edit = MixerTestAccess::edit(session);
    auto& track = MixerTestAccess::track(session, "voice");
    edit.engine.getPluginManager().registerBuiltInType(std::make_unique<ConstantFactory>());
    auto source = edit.getPluginCache().createNewPlugin("meter-test-source", {});
    expect(source != nullptr, "Actual sample-generating plugin could not be constructed");
    track.pluginList.insertPlugin(source, 0, nullptr);
    session.arrangementAudible.store(!stopped);
    session.stopToken.store(fenced ? 1 : 0);
}

std::map<te::Track*, MeterOutputIdentity> identities(EngineSession& session) {
    return {
        {&MixerTestAccess::track(session, "main"), {"master/main/out", "main", "master"}},
        {&MixerTestAccess::track(session, "voice"), {"track/voice/out", "voice", "track-out"}},
        {&MixerTestAccess::track(session, "other"), {"track/other/out", "other", "track-out"}}
    };
}

void assertPublication(const MeterPublication* value, std::uint64_t start,
                       std::uint64_t count, double energy, float peak) {
    expect(value && value->available && value->current.valid, "Observed real track did not publish valid samples");
    expect(value->current.startSample == start && value->current.endSample == start + count,
           "Observer changed the real sample interval");
    expect(value->current.count == count, "Observer duplicated or lost samples across output roots/epochs");
    expect(std::abs(value->current.sumSquares - energy) < 1e-6,
           "Observed energy does not conserve the actual rendered samples");
    expect(std::abs(value->current.peak - peak) < 1e-6,
           "Observed peak does not match the actual rendered samples");
}

void exerciseRealOutput(bool muted, bool otherSolo, bool stopped, bool fenced,
                        bool sharing, bool pooling, bool sharedOutputs) {
    EngineSession session;
    prepare(session, muted, otherSolo, stopped, fenced);
    auto& edit = MixerTestAccess::edit(session);
    graph::PlayHead playhead;
    graph::PlayHeadState playheadState(playhead);
    te::ProcessState processState(playheadState, edit.tempoSequence);
    te::CreateNodeParams params{processState};
    params.sampleRate = sampleRate;
    params.blockSize = blockSize;
    auto root = te::createNodeForEdit(edit, params);
    expect(root != nullptr, "Real Edit graph could not be constructed");
    auto meters = std::make_shared<MeterGraph>(MeterBankIdentity{1, 2, 3}, sampleRate);
    auto mapping = identities(session);
    if (sharedOutputs) {
        std::shared_ptr<graph::Node> shared(std::move(root));
        std::vector<std::unique_ptr<graph::Node>> outputs;
        outputs.push_back(meters->observeOutput(std::make_unique<graph::ForwardingNode>(shared, 4001), mapping, {}));
        const auto firstCount = meters->endpoints().size();
        outputs.push_back(meters->observeOutput(std::make_unique<graph::ForwardingNode>(shared, 4002), mapping, {}));
        expect(firstCount == 3 && meters->endpoints().size() == firstCount,
               "The same actual nodes in two output subtrees acquired duplicate lanes");
        root = std::make_unique<graph::BasicSummingNode>(std::move(outputs));
    } else {
        root = meters->observeOutput(std::move(root), mapping, {});
    }
    meters->seal();
    expect(meters->endpoints().size() == 3, "Observer failed to discover all actual track outputs");
    std::map<std::string, const GraphMeterEndpoint*> endpoints;
    for (const auto& endpoint : meters->endpoints()) {
        expect(endpoint.channelCount == 2, "Observer did not retain the actual stereo channel layout");
        expect(endpoints.emplace(endpoint.endpointId, &endpoint).second, "Observer published duplicate logical identities");
    }
    expect(endpoints.at("track/voice/out")->ownerId == "voice"
           && endpoints.at("track/voice/out")->kind == "track-out"
           && endpoints.at("master/main/out")->ownerId == "main"
           && endpoints.at("master/main/out")->kind == "master", "Observer lost the configured logical identities");
    MeterGraphCollector collector(meters);
    graph::LockFreeMultiThreadedNodePlayer player;
    player.setNumThreads(2);
    player.enableNodeMemorySharing(sharing);
    player.enablePooledMemoryAllocations(pooling);
    player.setNode(std::move(root), sampleRate, blockSize);
    juce::AudioBuffer<float> audio(2, blockSize);
    playhead.play();
    std::array<double, 2> energy{};
    std::array<float, 2> peak{};
    const float multiplier = sharedOutputs ? 2.f : 1.f;
    const float expected = muted || otherSolo || stopped || fenced ? 0.f : .125f;
    std::array<std::uint64_t, 2> totalCount{};
    std::array<double, 2> totalEnergy{};
    std::array<double, 2> totalMeterEnergy{};
    std::array<MeterEpoch, 2> previous{};
    for (int block = 0; block < 16; ++block) {
        const std::int64_t start = block * blockSize;
        playhead.setReferenceSampleRange({start, start + blockSize});
        processState.update(sampleRate, {start, start + blockSize}, te::ProcessState::UpdateContinuityFlags::yes);
        audio.clear();
        te::MidiMessageArray midi;
        graph::Node::ProcessContext context{blockSize, {start, start + blockSize}, {graph::toBufferView(audio), midi}};
        player.process(context);
        if(!muted && !otherSolo && !stopped && !fenced) {
            int ons=0,offs=0;
            for(const auto& message:midi) {
                if(message.isNoteOn() && message.getNoteNumber()==60)++ons;
                if(message.isNoteOff() && message.getNoteNumber()==60)++offs;
            }
            expect(ons==(sharedOutputs?2:1) && offs==ons,"Observer lost or duplicated MIDI note edges");
        }
        for (int channel = 0; channel < 2; ++channel)
            for (int frame = 0; frame < blockSize; ++frame) {
                const float sample = audio.getSample(channel, frame) / multiplier;
                energy[channel] += double(sample) * sample;
                totalEnergy[channel] += double(sample) * sample;
                peak[channel] = std::max(peak[channel], std::abs(sample));
                if (block == 15)
                    expect(std::abs(audio.getSample(channel, frame) - expected * multiplier) < 1e-5,
                           "Observer changed real post-fader/mute/solo/fence output samples");
            }
        // Deliberately leave four audio blocks unread: the mailbox must conserve all samples.
        if (block % 4 != 3) continue;
        collector.collect();
        for (int channel = 0; channel < 2; ++channel) {
            const auto* voice = collector.latest("track/voice/out", channel);
            const auto* master = collector.latest("master/main/out", channel);
            const auto intervalStart = std::uint64_t(block - 3) * blockSize;
            assertPublication(voice, intervalStart, 4 * blockSize, energy[channel], peak[channel]);
            assertPublication(master, intervalStart, 4 * blockSize, energy[channel], peak[channel]);
            assertPublication(collector.latest("track/other/out", channel), intervalStart, 4 * blockSize, 0, 0);
            if (block > 3)
                expect(voice->completedValid && voice->completed.id == previous[channel].id
                       && voice->completed.count == previous[channel].count
                       && voice->completed.sumSquares == previous[channel].sumSquares,
                       "Observer lost or altered the completed epoch while continuing the next one");
            previous[channel] = voice->current;
            totalCount[channel] += voice->current.count;
            totalMeterEnergy[channel] += voice->current.sumSquares;
            energy[channel] = 0;
            peak[channel] = 0;
        }
    }
    for (int channel = 0; channel < 2; ++channel)
        expect(totalCount[channel] == 16 * blockSize
               && std::abs(totalEnergy[channel] - totalMeterEnergy[channel]) < 1e-6,
               "Observer failed whole-render sample/energy conservation");
    if (stopped || fenced)
        expect(session.gateClearedFrames.load() > 0, "Fixture did not exercise the actual playback fence");
}

void testAmbiguousIdentity() {
    EngineSession session;
    prepare(session);
    auto& edit = MixerTestAccess::edit(session);
    graph::PlayHead playhead;
    graph::PlayHeadState playheadState(playhead);
    te::ProcessState processState(playheadState, edit.tempoSequence);
    te::CreateNodeParams params{processState};
    params.sampleRate = sampleRate;
    params.blockSize = blockSize;
    auto mapping = identities(session);
    auto meters = std::make_shared<MeterGraph>(MeterBankIdentity{1, 4, 5}, sampleRate);
    auto first = meters->observeOutput(te::createNodeForEdit(edit, params), mapping, {});
    bool rejected = false;
    try {
        auto second = meters->observeOutput(te::createNodeForEdit(edit, params), mapping, {});
    } catch (const std::logic_error&) {
        rejected = true;
    }
    expect(rejected, "Different actual output nodes silently shared a mutable logical endpoint accumulator");

    auto aliases = identities(session);
    aliases.at(&MixerTestAccess::track(session, "other")) = aliases.at(&MixerTestAccess::track(session, "voice"));
    MeterGraph aliased({1, 6, 7}, sampleRate);
    rejected = false;
    try {
        auto node = aliased.observeOutput(te::createNodeForEdit(edit, params), aliases, {});
    } catch (const std::logic_error&) {
        rejected = true;
    }
    expect(rejected, "Two different tracks were allowed to publish one logical output identity");
}
}

void testDeviceMeters(bool sharing,bool pooling,bool sharedOutputs) {
    EngineSession session;prepare(session);
    auto& edit=MixerTestAccess::edit(session);auto& track=MixerTestAccess::track(session,"voice");
    std::map<te::Plugin*,std::string> devices;
    for(const auto* id:{"first","second"}) {
        juce::ValueTree state(te::IDs::PLUGIN);state.setProperty(te::IDs::type,BuiltinDevice::xmlTypeName,nullptr);state.setProperty("deviceKind","utility",nullptr);
        auto plugin=edit.getPluginCache().createNewPlugin(state);
        static_cast<BuiltinDevice&>(*plugin).configure(Device{id,true,UtilitySettings{-6.020599913f,0,100}});
        track.pluginList.insertPlugin(plugin,track.pluginList.indexOf(track.getVolumePlugin()),nullptr);devices.emplace(plugin.get(),id);
    }
    graph::PlayHead playhead;graph::PlayHeadState playheadState(playhead);te::ProcessState processState(playheadState,edit.tempoSequence);
    te::CreateNodeParams params{processState};params.sampleRate=sampleRate;params.blockSize=blockSize;
    auto meters=std::make_shared<MeterGraph>(MeterBankIdentity{1,8,8},sampleRate);
    auto root=te::createNodeForEdit(edit,params);
    if(sharedOutputs) {
        std::shared_ptr<graph::Node> shared(std::move(root));std::vector<std::unique_ptr<graph::Node>> outputs;
        outputs.push_back(meters->observeOutput(std::make_unique<graph::ForwardingNode>(shared,5001),identities(session),devices));
        outputs.push_back(meters->observeOutput(std::make_unique<graph::ForwardingNode>(shared,5002),identities(session),devices));
        root=std::make_unique<graph::BasicSummingNode>(std::move(outputs));
    } else root=meters->observeOutput(std::move(root),identities(session),devices);
    meters->seal();
    expect(meters->endpoints().size()==7,"Device boundary endpoints missing or aliased");
    MeterGraphCollector collector(meters);graph::LockFreeMultiThreadedNodePlayer player;player.setNumThreads(2);player.enableNodeMemorySharing(sharing);player.enablePooledMemoryAllocations(pooling);player.setNode(std::move(root),sampleRate,blockSize);
    juce::AudioBuffer<float> audio(2,blockSize);playhead.play();
    for(int block=0;block<4;++block) {
        const int64_t start=block*blockSize;playhead.setReferenceSampleRange({start,start+blockSize});processState.update(sampleRate,{start,start+blockSize},te::ProcessState::UpdateContinuityFlags::yes);
        audio.clear();te::MidiMessageArray midi;graph::Node::ProcessContext context{blockSize,{start,start+blockSize},{graph::toBufferView(audio),midi}};player.process(context);
    }
    collector.collect();
    const float gain=juce::Decibels::decibelsToGain(-6.020599913f);
    const float firstOutput=.25f*gain,secondOutput=firstOutput*gain;
    for(int channel=0;channel<2;++channel) {
        assertPublication(collector.latest("device/first/in",channel),0,4*blockSize,4*blockSize*.25*.25,.25f);
        assertPublication(collector.latest("device/first/out",channel),0,4*blockSize,4*blockSize*double(firstOutput)*firstOutput,firstOutput);
        assertPublication(collector.latest("device/second/in",channel),0,4*blockSize,4*blockSize*double(firstOutput)*firstOutput,firstOutput);
        assertPublication(collector.latest("device/second/out",channel),0,4*blockSize,4*blockSize*double(secondOutput)*secondOutput,secondOutput);
        for(int frame=0;frame<blockSize;++frame)expect(std::abs(audio.getSample(channel,frame)-.03125f*(sharedOutputs?2:1))<1e-6,"Device meter observation changed actual chain output");
    }
}
int main() {
    try {
        juce::ScopedJuceInitialiser_GUI gui;
        zp::ScopedAudioPreferences preferences;
        testInputMonitorGate();
        for (bool sharing : {false, true})
            for (bool pooling : {false, true}) {
                testDeviceMeters(sharing,pooling,false);
                testDeviceMeters(sharing,pooling,true);
                exerciseRealOutput(false, false, false, false, sharing, pooling, false);
                exerciseRealOutput(true, false, false, false, sharing, pooling, false);
                exerciseRealOutput(false, true, false, false, sharing, pooling, false);
                exerciseRealOutput(false, false, true, false, sharing, pooling, false);
                exerciseRealOutput(false, false, false, true, sharing, pooling, false);
                exerciseRealOutput(false, false, false, false, sharing, pooling, true);
                exerciseRealOutput(true, false, false, false, sharing, pooling, true);
                exerciseRealOutput(false, true, false, false, sharing, pooling, true);
                exerciseRealOutput(false, false, true, false, sharing, pooling, true);
                exerciseRealOutput(false, false, false, true, sharing, pooling, true);
            }
        testAmbiguousIdentity();
        std::cout << "Existing-API output observer: real fader/mute/solo/fence, two-worker sharing/pooling, shared-node conservation and ambiguity passed\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
