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
    ranges.reserve(static_cast<std::size_t>(std::count_if(track.clips.begin(),track.clips.end(),[](const Clip& clip){return !clip.mute && clip.scene.isEmpty();})));
    for (const auto& clip : track.clips)
        if (!clip.mute && clip.scene.isEmpty())
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
                     tracktion::engine::ProcessState& state, const std::atomic<bool>& recording, tracktion::engine::AudioTrack* sourceTrack)
        : input(std::move(source)),
          mode(track.monitor == "in" ? MonitorMode::in
                                    : track.monitor == "auto" ? MonitorMode::automatic : MonitorMode::off),
          armed(track.armed), ranges(activeClipRanges(track, request)), processState(state), recordingActive(recording), launcherTrack(sourceTrack) {
        if(sourceTrack) {
            const auto nativeSlots=sourceTrack->getClipSlotList().getClipSlots();
            slots.reserve(static_cast<std::size_t>(std::count_if(nativeSlots.begin(),nativeSlots.end(),[](auto* slot){return slot->getClip()!=nullptr;})));
            for(auto* slot:nativeSlots)if(auto* clip=slot->getClip())
                if(auto handle=clip->getLaunchHandle())slots.push_back({std::move(handle),!clip->isMuted()});
        }
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
        if (mode == MonitorMode::in || recordingActive.load(std::memory_order_acquire)
            || !processState.playHeadState.playHead.isPlaying() || output.getNumFrames() == 0)
            return;

        const auto frameCount = output.getNumFrames();
        const auto clear=[&](choc::buffer::FrameCount first,choc::buffer::FrameCount last) {
            for(choc::buffer::ChannelCount channel=0;channel<output.getNumChannels();++channel)
                std::fill_n(output.getChannel(channel).data.data+first,last-first,0.f);
        };
        auto arrangementFrames=launcherTrack && launcherTrack->playSlotClips.get()?0u:frameCount;
        if(!slots.empty()) {
            const auto& sync=processState.getSyncRange();
            const double beatSpan=(sync.end.monotonicBeat.v-sync.start.monotonicBeat.v).inBeats();
            const double referenceFrames=(double)processState.referenceSampleRange.getLength();
            const double startBeat=sync.start.monotonicBeat.v.inBeats()+beatSpan*(context.referenceSampleRange.getStart()-processState.referenceSampleRange.getStart())/referenceFrames;
            const double blockBeats=beatSpan*context.referenceSampleRange.getLength()/referenceFrames;
            const auto eventFrame=[&](const std::optional<tracktion::engine::MonotonicBeat>& beat) {
                return beat?static_cast<choc::buffer::FrameCount>(std::clamp(std::ceil((beat->v.inBeats()-startBeat)*frameCount/blockBeats),0.0,(double)frameCount)):0u;
            };
            bool launcherPlayingAtStart=false;
            for(const auto& slot:slots) {
                const bool playing=slot.handle->getPlayingStatus()==tracktion::engine::LaunchHandle::PlayState::playing;
                auto first=playing?0u:frameCount,last=playing?frameCount:0u;
                bool playingAtStart=playing;
                if(const auto queued=slot.handle->getQueuedStatus()) {
                    const auto at=eventFrame(slot.handle->getQueuedEventPosition());
                    if(*queued==tracktion::engine::LaunchHandle::QueueState::playQueued) {
                        if(!playing)first=at;
                        last=frameCount;arrangementFrames=std::min(arrangementFrames,at);
                        if(at==0)playingAtStart=true;
                    } else {
                        if(playing)last=at;
                        if(at==0)playingAtStart=false;
                    }
                }
                launcherPlayingAtStart=launcherPlayingAtStart || playingAtStart;
                if(slot.audible && last>first)clear(first,last);
            }
            if(launcherPlayingAtStart)arrangementFrames=0;
        }
        if(arrangementFrames==0 || ranges.empty())return;
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
            const auto first=std::min(frameAt(range->getStart()),arrangementFrames);
            const auto last=std::min(frameAt(range->getEnd()),arrangementFrames);
            clear(first,last);
        }
    }
    const std::unique_ptr<Node> input;
    const MonitorMode mode;
    const bool armed;
    const std::vector<juce::Range<double>> ranges;
    tracktion::engine::ProcessState& processState;
    const std::atomic<bool>& recordingActive;
    struct Slot { std::shared_ptr<tracktion::engine::LaunchHandle> handle;bool audible; };
    std::vector<Slot> slots;
    const tracktion::engine::AudioTrack::Ptr launcherTrack;
};
}

std::unique_ptr<tracktion::graph::Node> createInputMonitorNode(
    std::unique_ptr<tracktion::graph::Node> source, const Track& track, const Request& request,
    tracktion::engine::ProcessState& state, const std::atomic<bool>& recordingActive, tracktion::engine::AudioTrack* launcherTrack) {
    if (!source || source->getNodeProperties().hasMidi)
        throw std::invalid_argument("Input monitoring requires a native audio-only input node");
    return std::make_unique<InputMonitorNode>(std::move(source), track, request, state, recordingActive, launcherTrack);

}
}
