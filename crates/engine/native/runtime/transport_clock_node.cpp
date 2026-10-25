#include "transport_clock_node.h"
#include "meter_graph.h"
#include <tracktion_engine/tracktion_engine.h>
#include <tracktion_engine/playback/graph/tracktion_TracktionEngineNode.h>
#include <cmath>
#include <stdexcept>
namespace zp {
namespace {
class TransportClockObserverNode final : public tracktion::graph::Node {
public:
    TransportClockObserverNode(std::unique_ptr<Node> input,std::shared_ptr<MeterClockBank> bank,
                               tracktion::engine::ProcessState& process,const std::atomic<std::uint64_t>& samples,
                               MeterControlSource controls,std::function<double()> audiblePosition)
        : input(std::move(input)),bank(std::move(bank)),processState(process),samples(samples),
          controls(std::move(controls)),audiblePosition(std::move(audiblePosition)) {
        setOptimisations({tracktion::graph::ClearBuffers::no,tracktion::graph::AllocateAudioBuffer::no});
    }
    tracktion::graph::NodeProperties getNodeProperties() override {
        auto properties=input->getNodeProperties();properties.nodeID=0;return properties;
    }
    std::vector<Node*> getDirectInputNodes() override { return {input.get()}; }
    bool isReadyToProcess() override { return input->hasProcessed(); }
private:
    void prepareToPlay(const tracktion::graph::PlaybackInitialisationInfo&) override {
        if(input->numOutputNodes!=1)throw std::logic_error("Transport clock requires the exclusive final graph root");
    }
    void prefetchBlock(juce::Range<int64_t> referenceRange) override {
        controls.beginBlock();observation={};valid=false;
        const auto* sequence=processState.getTempoSequence();
        if(referenceRange.getStart()<0 || !sequence)return;
        observation.referenceSample=static_cast<std::uint64_t>(referenceRange.getStart());
        observation.deviceSample=samples.load(std::memory_order_relaxed);
        observation.timelineSample=processState.timelineSampleRange.getStart();
        observation.playing=processState.playHeadState.playHead.isPlaying()?1u:0u;
        observation.recording=observation.playing && controls.isRecording()?1u:0u;
        tracktion::tempo::Sequence::Position position(*sequence);
        position.set(tracktion::TimePosition::fromSamples(observation.timelineSample,processState.sampleRate));
        observation.timelineBeat=position.getPPQTime();observation.tempoBpm=position.getTempo();
        const auto meter=position.getTimeSignature();const double quartersPerBar=meter.numerator*4.0/meter.denominator;
        observation.bar=1+observation.timelineBeat/quartersPerBar;observation.barsPerSecond=observation.tempoBpm/(60*quartersPerBar);
        valid=true;
    }
    void process(ProcessContext& context) override {
        auto output=input->getProcessedOutput();setAudioOutput(input.get(),output.audio);
        context.buffers.midi.swapWith(output.midi);
        if(!valid)return;
        observation.frames=context.numSamples;
        if(audiblePosition && observation.playing==1) {
            const auto seconds=audiblePosition();
            if(std::isfinite(seconds)) {
                tracktion::tempo::Sequence::Position position(*processState.getTempoSequence());
                position.set(tracktion::TimePosition::fromSeconds(seconds));
                const auto meter=position.getTimeSignature();const double quartersPerBar=meter.numerator*4.0/meter.denominator;
                observation.audibleBar=1+position.getPPQTime()/quartersPerBar;
                observation.audibleBarsPerSecond=position.getTempo()/(60*quartersPerBar);
                observation.audibleValid=1;
            }
        }
        if(const auto target=controls.endBlock(observation.playing==1,observation.recording==1)) {
            observation.controlGeneration=target->controlGeneration;observation.appliedSequence=target->sequence;
            observation.ownerEpoch=target->ownerEpoch;observation.controlValid=1;
        }
        bank->mailbox.publish(observation);
    }
    const std::unique_ptr<Node> input;
    const std::shared_ptr<MeterClockBank> bank;
    tracktion::engine::ProcessState& processState;
    const std::atomic<std::uint64_t>& samples;
    TransportClockWitness controls;
    const std::function<double()> audiblePosition;
    MeterClockObservation observation;
    bool valid=false;
};
}
std::unique_ptr<tracktion::graph::Node> createTransportClockObserver(
    std::unique_ptr<tracktion::graph::Node> node,std::shared_ptr<MeterClockBank> bank,
    tracktion::engine::ProcessState& process,const std::atomic<std::uint64_t>& samples,
    MeterControlSource controls,std::function<double()> audiblePosition) {
    return std::make_unique<TransportClockObserverNode>(std::move(node),std::move(bank),process,samples,
                                                       std::move(controls),std::move(audiblePosition));
}
}
