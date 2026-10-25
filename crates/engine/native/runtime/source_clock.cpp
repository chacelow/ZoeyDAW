#include "source_clock.h"
#include <tracktion_graph/tracktion_graph.h>
#include <stdexcept>
namespace zp {
namespace {
class SourceClockObserverNode final : public tracktion::graph::Node {
public:
    SourceClockObserverNode(std::unique_ptr<Node> input,std::shared_ptr<SourceBlockClock> clock,
        const std::atomic<std::uint64_t>& samples,double rate)
        : input(std::move(input)),clock(std::move(clock)),samples(samples),rate(rate) {
        setOptimisations({tracktion::graph::ClearBuffers::no,tracktion::graph::AllocateAudioBuffer::no});
    }
    tracktion::graph::NodeProperties getNodeProperties() override {
        auto result=input->getNodeProperties();result.nodeID=0;return result;
    }
    std::vector<Node*> getDirectInputNodes() override { return {input.get()}; }
    bool isReadyToProcess() override { return input->hasProcessed(); }
private:
    void prepareToPlay(const tracktion::graph::PlaybackInitialisationInfo&) override {
        if(input->numOutputNodes!=1)throw std::logic_error("Source clock requires an exclusive graph root");
    }
    void prefetchBlock(juce::Range<int64_t> reference) override {
        valid=reference.getStart()>=0;
        if(valid)time={static_cast<std::uint64_t>(reference.getStart()),samples.load(std::memory_order_relaxed),rate};
    }
    void process(ProcessContext& context) override {
        auto output=input->getProcessedOutput();setAudioOutput(input.get(),output.audio);
        context.buffers.midi.swapWith(output.midi);
        if(valid)clock->publish(time);
    }
    const std::unique_ptr<Node> input;
    const std::shared_ptr<SourceBlockClock> clock;
    const std::atomic<std::uint64_t>& samples;
    const double rate;
    SourceBlockTime time{};
    bool valid=false;
};
}
std::unique_ptr<tracktion::graph::Node> createSourceClockObserver(std::unique_ptr<tracktion::graph::Node> node,
    std::shared_ptr<SourceBlockClock> clock,const std::atomic<std::uint64_t>& samples,double rate) {
    return std::make_unique<SourceClockObserverNode>(std::move(node),std::move(clock),samples,rate);
}
}
