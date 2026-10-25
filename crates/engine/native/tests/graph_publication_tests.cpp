#include <tracktion_engine/tracktion_engine.h>
#include <tracktion_graph/tracktion_graph.h>
#include <iostream>
#include <new>
#include <stdexcept>

void beginAllocationGuard() noexcept;
std::size_t endAllocationGuard() noexcept;
void beginAllocationFailure(std::size_t) noexcept;
bool endAllocationFailure() noexcept;

namespace {
namespace graph = tracktion::graph;
thread_local bool processing = false;
void require(bool value,const char* message) { if(!value)throw std::runtime_error(message); }
struct Lifetime { bool destroyedInCallback = false; int destructions = 0; };
class Signal final : public graph::Node {
public:
    Signal(float value,Lifetime& lifetime):value(value),lifetime(lifetime) {}
    ~Signal() override { lifetime.destroyedInCallback |= processing; ++lifetime.destructions; }
    graph::NodeProperties getNodeProperties() override { return {true,false,1,0,0}; }
    bool isReadyToProcess() override { return true; }
private:
    void process(ProcessContext& context) override {
        for(choc::buffer::FrameCount frame=0;frame<context.numSamples;++frame)context.buffers.audio.getSample(0,frame)=value;
    }
    float value;
    Lifetime& lifetime;
};
enum class PreviousGraph { Active, Queued };
struct Player {
    Lifetime lifetime;
    graph::LockFreeMultiThreadedNodePlayer player;
    juce::AudioBuffer<float> output{1,256};
    tracktion::MidiMessageArray midi;
    std::int64_t position = 0;
    Player(bool pooled,bool sharing,PreviousGraph previous) {
        player.setNumThreads(0);
        player.enablePooledMemoryAllocations(pooled);
        player.enableNodeMemorySharing(sharing);
        player.setNode(std::make_unique<Signal>(.25f,lifetime),48000,256);
        render(.25f);
        if(previous==PreviousGraph::Queued)player.setNode(std::make_unique<Signal>(.375f,lifetime),48000,256);
    }
    void render(float expected) {
        output.clear();midi.clear();
        graph::Node::ProcessContext context{256,{position,position+256},{graph::toBufferView(output),midi}};
        processing=true;
        beginAllocationGuard();
        player.process(context);
        const auto allocations=endAllocationGuard();
        processing=false;
        require(allocations==0,"Graph callback allocated during adoption or continued playback");
        require(!lifetime.destroyedInCallback,"Graph callback destroyed a retired node");
        for(int frame=0;frame<output.getNumSamples();++frame)require(output.getSample(0,frame)==expected,"Publication failure interrupted old PCM or recovery selected the wrong graph");
        position+=256;
    }
};
std::size_t publicationAllocations(bool pooled,bool sharing,double rate,int block,PreviousGraph previous) {
    Player baseline(pooled,sharing,previous);
    auto candidate=std::make_unique<Signal>(.5f,baseline.lifetime);
    beginAllocationGuard();
    baseline.player.setNode(std::move(candidate),rate,block);
    return endAllocationGuard();
}
void failuresRetainPlayback(bool pooled,bool sharing,double rate,int block,PreviousGraph previous) {
    const auto allocations=publicationAllocations(pooled,sharing,rate,block,previous);
    std::size_t rejected = 0;
    for(std::size_t index=0;index<allocations;++index) {
        Player active(pooled,sharing,previous);
        auto* original=active.player.getNode();
        auto candidate=std::make_unique<Signal>(.5f,active.lifetime);
        beginAllocationFailure(index);
        bool failed=false;
        try { active.player.setNode(std::move(candidate),rate,block); }
        catch(const std::bad_alloc&) { failed=true; }
        const bool injected=endAllocationFailure();
        require(injected,"Publication allocation scan failed to exercise its fault point");
        if(failed) {
            ++rejected;
            if(active.player.getNode()!=original)throw std::runtime_error("Rejected graph changed the published root at allocation "+std::to_string(index));
            require(active.player.getSampleRate()==48000 && active.player.getBlockSize()==256,"Rejected graph changed the active sample format");
            for(int tick=0;tick<4;++tick)active.render(previous==PreviousGraph::Queued?.375f:.25f);
        } else {
            active.render(.5f);
        }
        active.player.setNode(std::make_unique<Signal>(.75f,active.lifetime),48000,256);
        active.render(.75f);
    }
    require(rejected>0,"Publication fault scan never exercised failure preservation");
    std::cout<<"Graph publication allocation faults: pool="<<pooled<<" sharing="<<sharing<<" queued="<<(previous==PreviousGraph::Queued)<<" format="<<rate<<'/'<<block<<" sites="<<allocations<<" rejected="<<rejected<<", old PCM and later recovery preserved\n";
}
void publicationTransfersPreparedOwnership() {
    Lifetime first,second,third;
    using Payload = Signal;
    graph::LockFreeObject<Payload> publication;
    const auto prepare=[](float value,Lifetime& lifetime) { return std::make_unique<Payload>(value,lifetime); };
    const auto publish=[&](std::unique_ptr<Payload> prepared) {
        beginAllocationGuard();
        auto retired=publication.pushNonRealTime(std::move(prepared));
        const auto allocations=endAllocationGuard();
        require(allocations==0,"Prepared ownership publication allocated");
        return retired;
    };
    const auto observe=[&](const Payload* identity) {
        processing=true;
        { const auto access=publication.getScopedAccess();require(access.get()==identity,"Prepared resource storage moved during audio adoption"); }
        processing=false;
    };
    auto firstStorage=prepare(.25f,first);auto* firstIdentity=firstStorage.get();
    require(!publish(std::move(firstStorage)),"Initial publication retired an unrelated resource");
    observe(firstIdentity);
    auto secondStorage=prepare(.5f,second);auto* secondIdentity=secondStorage.get();
    require(!publish(std::move(secondStorage)),"Active resource was destroyed before audio handoff");
    observe(secondIdentity);
    require(first.destructions==0,"Audio adoption destroyed the retired processing resource");
    auto thirdStorage=prepare(.75f,third);auto* thirdIdentity=thirdStorage.get();
    auto retired=publish(std::move(thirdStorage));
    require(retired.get()==firstIdentity && first.destructions==0,"Retired processing resource ownership was lost");
    retired.reset();
    require(first.destructions==1 && !first.destroyedInCallback,"Retired processing resource was not released once off the callback");
    observe(thirdIdentity);publication.clear();
    require(second.destructions==1 && third.destructions==1 && !second.destroyedInCallback && !third.destroyedInCallback,"Publication cleanup lost or destroyed resources on the callback");
    std::cout<<"Prepared ownership publication: zero allocation, stable storage, retired resources released once off callback\n";
}
}
int main() {
    try {
        juce::ScopedJuceInitialiser_GUI gui;
        publicationTransfersPreparedOwnership();
        for(bool pooled:{false,true})for(bool sharing:{false,true})for(auto previous:{PreviousGraph::Active,PreviousGraph::Queued}) {
            failuresRetainPlayback(pooled,sharing,48000,256,previous);
            failuresRetainPlayback(pooled,sharing,96000,512,previous);
        }
        return 0;
    } catch(const std::exception& error) { processing=false;endAllocationFailure();endAllocationGuard();std::cerr<<error.what()<<'\n';return 1; }
}
