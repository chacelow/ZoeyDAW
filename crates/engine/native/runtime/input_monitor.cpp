#include "input_monitor.h"
#include "playback_model.h"
#include <tracktion_engine/tracktion_engine.h>
#include <tracktion_engine/playback/graph/tracktion_TracktionEngineNode.h>
#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <vector>

namespace zp {
namespace {
enum class MonitorMode { off, automatic, in };

std::vector<juce::Range<double>> activeClipRanges(const Track& track, const Request& request) {
    std::vector<juce::Range<double>> ranges;
    ranges.reserve(track.clips.size());
    for (const auto& clip : track.clips)
        if (!clip.mute)
            ranges.emplace_back(request.barTime(clip.start),
                                request.barTime(clip.start) + clip.length * request.secondsPerBar());
    std::sort(ranges.begin(), ranges.end(), [](const auto& left, const auto& right) {
        return left.getStart() < right.getStart();
    });
    std::size_t count = 0;
    for (const auto& range : ranges) {
        if (count != 0 && range.getStart() <= ranges[count - 1].getEnd())
            ranges[count - 1].setEnd(std::max(ranges[count - 1].getEnd(), range.getEnd()));
        else
            ranges[count++] = range;
    }
    ranges.resize(count);
    return ranges;
}

class InputMonitorNode final : public tracktion::graph::Node {
public:
    InputMonitorNode(std::unique_ptr<Node> source, const Track& track, const Request& request,
                     tracktion::engine::ProcessState& state)
        : input(std::move(source)),
          mode(track.monitor == "in" ? MonitorMode::in
                                    : track.monitor == "auto" ? MonitorMode::automatic : MonitorMode::off),
          armed(track.armed), ranges(activeClipRanges(track, request)), processState(state) {
        setOptimisations({tracktion::graph::ClearBuffers::no, tracktion::graph::AllocateAudioBuffer::yes});
    }
    tracktion::graph::NodeProperties getNodeProperties() override {
        auto properties = input->getNodeProperties();
        properties.nodeID = 0;
        return properties;
    }
    std::vector<Node*> getDirectInputNodes() override { return {input.get()}; }
    bool isReadyToProcess() override { return input->hasProcessed(); }
private:
    void process(ProcessContext& context) override {
        auto source = input->getProcessedOutput();
        auto output = context.buffers.audio;
        context.buffers.midi.clear();
        if (mode == MonitorMode::off || (mode == MonitorMode::automatic && !armed)) {
            output.clear();
            return;
        }
        copy(output, source.audio);
        if (mode == MonitorMode::in || !processState.playHeadState.playHead.isPlaying()
            || ranges.empty() || output.getNumFrames() == 0)
            return;

        const auto frameCount = output.getNumFrames();
        const double startTime = (processState.timelineSampleRange.getStart()
            + (context.referenceSampleRange.getStart() - processState.referenceSampleRange.getStart()))
            / processState.sampleRate;
        const double secondsPerFrame = context.referenceSampleRange.getLength()
            / (processState.sampleRate * frameCount);
        const double endTime = startTime + frameCount * secondsPerFrame;
        auto range = std::lower_bound(ranges.begin(), ranges.end(), startTime,
            [](const auto& item, double time) { return item.getEnd() <= time; });
        for (; range != ranges.end() && range->getStart() < endTime; ++range) {
            const auto frameAt = [&](double time) {
                return static_cast<choc::buffer::FrameCount>(std::clamp(
                    std::ceil((time - startTime) / secondsPerFrame), 0.0, double(frameCount)));
            };
            const auto first = frameAt(range->getStart());
            const auto last = frameAt(range->getEnd());
            for (choc::buffer::ChannelCount channel = 0; channel < output.getNumChannels(); ++channel)
                std::fill_n(output.getChannel(channel).data.data + first, last - first, 0.f);
        }
    }
    const std::unique_ptr<Node> input;
    const MonitorMode mode;
    const bool armed;
    const std::vector<juce::Range<double>> ranges;
    tracktion::engine::ProcessState& processState;
};
}

std::unique_ptr<tracktion::graph::Node> createInputMonitorNode(
    std::unique_ptr<tracktion::graph::Node> source, const Track& track, const Request& request,
    tracktion::engine::ProcessState& state) {
    if (!source || source->getNodeProperties().hasMidi)
        throw std::invalid_argument("Input monitoring requires a native audio-only input node");
    return std::make_unique<InputMonitorNode>(std::move(source), track, request, state);
}
}
