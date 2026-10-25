#pragma once
#include "input_monitor.h"
#include "playback_model.h"
#include <tracktion_engine/tracktion_engine.h>
#include <tracktion_engine/playback/graph/tracktion_TracktionEngineNode.h>
#include <algorithm>
#include <stdexcept>

namespace {
namespace input_monitor_test {
namespace graph = tracktion::graph;
namespace te = tracktion::engine;

inline void require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}

class ConstantInputNode final : public graph::Node {
public:
    ConstantInputNode(int channelCount, int& calls, bool midi)
        : channels(channelCount), processCalls(calls), withMidi(midi) {}
    graph::NodeProperties getNodeProperties() override { return {true, withMidi, channels, 0, 0}; }
    std::vector<Node*> getDirectInputNodes() override { return {}; }
    bool isReadyToProcess() override { return true; }
private:
    void process(ProcessContext& context) override {
        ++processCalls;
        for (int channel = 0; channel < channels; ++channel)
            std::fill_n(context.buffers.audio.getChannel(channel).data.data,
                        context.buffers.audio.getNumFrames(), .125f * (channel + 1));
    }
    const int channels;
    int& processCalls;
    const bool withMidi;
};

inline zp::Clip clip(double start, double length, bool mute = false, double offset = 0) {
    zp::Clip value{};
    value.kind = "audio";
    value.start = start;
    value.length = length;
    value.offset = offset;
    value.mute = mute;
    return value;
}

class Fixture {
public:
    static constexpr double rate = 8;
    static constexpr int frames = 16;
    graph::PlayHead playhead;
    graph::PlayHeadState playheadState{playhead};
    te::ProcessState state{playheadState};
    zp::Request request{};
    zp::Track track{};
    int processCalls = 0;
    std::atomic<bool> recording {false};
    graph::NodePlayer player;
    juce::AudioBuffer<float> audio;
    te::MidiMessageArray midi;

    explicit Fixture(int channels = 2) : audio(channels, frames) {
        request.bpm = 120;
        request.quartersPerBar = 4;
        track.monitor = "auto";
        track.armed = true;
    }
    void build(bool withMidi = false) {
        player.setNode(zp::createInputMonitorNode(
            std::make_unique<ConstantInputNode>(audio.getNumChannels(), processCalls, withMidi),
            track, request, state, recording), rate, frames);
    }
    void render(bool playing, int64_t timelineStart = 0, int64_t referenceStart = 1000,
                int stateOffset = 0) {
        playhead.setReferenceSampleRange({referenceStart, referenceStart + frames});
        playhead.setPosition(timelineStart - stateOffset);
        if (playing) playhead.play();
        else playhead.stop();
        state.update(rate, {referenceStart, referenceStart + frames},
                     te::ProcessState::UpdateContinuityFlags::yes);
        audio.clear();
        midi.clear();
        graph::Node::ProcessContext context{
            frames, {referenceStart + stateOffset, referenceStart + stateOffset + frames},
            {graph::toBufferView(audio), midi}};
        player.process(context);
    }
    template<typename Audible>
    void expectSamples(Audible audible) const {
        for (int channel = 0; channel < audio.getNumChannels(); ++channel)
            for (int frame = 0; frame < frames; ++frame)
                require(audio.getSample(channel, frame) == (audible(frame) ? .125f * (channel + 1) : 0.f),
                        "Input monitor changed channel data or gated the wrong sample");
    }
};
}

inline void testInputMonitorGate() {
    using namespace input_monitor_test;
    for (const int channels : {1, 2, 4})
        for (const char* mode : {"off", "auto", "in"})
            for (const bool armed : {false, true})
                for (const bool playing : {false, true}) {
                    Fixture fixture(channels);
                    fixture.track.monitor = mode;
                    fixture.track.armed = armed;
                    fixture.track.clips = {clip(1, 1)};
                    fixture.request.playing = !playing;
                    fixture.build();
                    fixture.render(playing);
                    const bool audible = juce::String(mode) == "in"
                        || (juce::String(mode) == "auto" && armed && !playing);
                    fixture.expectSamples([=](int) { return audible; });
                    require(fixture.processCalls == 1,
                            "Silent monitoring stopped processing the native input dependency");
                }
    for (const bool playing : {false, true}) {
        Fixture empty;
        empty.build();
        empty.render(playing);
        empty.expectSamples([](int) { return true; });
    }
    Fixture boundaries;
    boundaries.track.clips = {
        clip(1.625, .125), clip(1.375, .25, false, 99), clip(1.25, .25),
        clip(1, 1, true), clip(1.375, .125), clip(1.25, .25)
    };
    boundaries.build();
    boundaries.track.monitor = "off";
    boundaries.track.armed = false;
    boundaries.track.clips.clear();
    boundaries.request.bpm = 60;
    boundaries.render(true);
    boundaries.expectSamples([](int frame) { return frame < 4 || frame >= 12; });
    boundaries.render(false, 6, 2000);
    boundaries.expectSamples([](int) { return true; });
    require(boundaries.processCalls == 2, "Stopped monitoring failed to drain the actual input node");

    Fixture recording;
    recording.track.clips = {clip(1, 1)};
    recording.build();
    recording.recording.store(true);
    recording.render(true);
    recording.expectSamples([](int) { return true; });
    recording.recording.store(false);
    recording.render(true, 0, 2000);
    recording.expectSamples([](int) { return false; });
    Fixture seek;
    seek.track.clips = {clip(1.25, .5, false, -12)};
    seek.build();
    seek.render(true, 3, 4096);
    seek.expectSamples([](int frame) { return frame < 1 || frame >= 9; });

    Fixture subBlock;
    subBlock.track.clips = {clip(1.25, .5)};
    subBlock.build();
    subBlock.render(true, 3, 8192, 2);
    subBlock.expectSamples([](int frame) { return frame < 1 || frame >= 9; });

    Fixture midi;
    bool rejected = false;
    try {
        midi.build(true);
    } catch (const std::invalid_argument&) {
        rejected = true;
    }
    require(rejected && midi.processCalls == 0,
            "Audio input monitor accepted a MIDI-producing source");
}
}
