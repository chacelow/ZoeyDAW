#include "isolated_plugin_node.h"
#include <tracktion_engine/tracktion_engine.h>
#include <tracktion_engine/playback/graph/tracktion_TracktionEngineNode.h>
#include <iostream>
#include <stdexcept>
#include <latch>
#include <type_traits>

static_assert(!std::is_copy_constructible_v<zp::IsolatedPluginBindings>);
static_assert(!std::is_move_constructible_v<zp::IsolatedPluginBindings>);

void beginAllocationGuard() noexcept;
std::size_t endAllocationGuard() noexcept;
namespace {
namespace graph=tracktion::graph;
void require(bool value,const char* message) { if(!value)throw std::runtime_error(message); }
class Source final : public graph::Node {
public:
    graph::NodeProperties getNodeProperties() override { return {true,true,2,0,0}; }
    bool isReadyToProcess() override { return true; }
private:
    void prepareToPlay(const graph::PlaybackInitialisationInfo&) override { seed.reserve(1); }
    void process(ProcessContext& context) override {
        if(first) { seed.swapWith(context.buffers.midi);first=false; }
        for(unsigned channel=0;channel<2;++channel)
            for(unsigned sample=0;sample<context.numSamples;++sample)
                context.buffers.audio.getSample(channel,sample)=channel==0?.25f:-.5f;
        context.buffers.midi.addMidiMessage(juce::MidiMessage::noteOn(1,60,juce::uint8(100)),17.0/48000,{});
    }
    tracktion::engine::MidiMessageArray seed;
    bool first=true;
};
struct Processor {
    int calls=0;
    bool reject=false;
    int64_t timeline=0;
    static int32_t run(void* pointer,zd_plugin_block* block) {
        auto& self=*static_cast<Processor*>(pointer);++self.calls;
        if(self.reject)return -5;
        if(block->midi_count!=1 || block->midi[0].offset!=17 || block->transport->sample_position!=self.timeline)return -4;
        const auto& transport=*block->transport;
        if((transport.flags&62)!=62 || transport.numerator!=3 || transport.denominator!=8
            || std::abs(transport.tempo-120)>1e-9
            || std::abs(transport.beat_position-double(self.timeline)/24000)>1e-9
            || transport.loop_sample_start!=0 || transport.loop_sample_end!=36000
            || std::abs(transport.loop_start)>1e-9 || std::abs(transport.loop_end-1.5)>1e-9)return -4;
        for(uint32_t channel=0;channel<block->output_channels;++channel)
            for(uint32_t sample=0;sample<block->frames;++sample)
                block->outputs[channel][sample]=block->inputs[channel][sample]*.5f;
        block->produced[0]=block->midi[0];block->produced[0].bytes[1]=72;block->produced_count=1;
        return 1;
    }
};
void testBindingRetirement() {
    struct ReleaseState { int calls=0;std::thread::id thread; } released;
    zp::IsolatedPluginBindings bindings;
    auto binding=bindings.retain({&released,[](void*,zd_plugin_block*)->int32_t { return 0; }},
        {48000,512,2,2,1024},[](void* pointer) {
            auto& state=*static_cast<ReleaseState*>(pointer);
            ++state.calls;state.thread=std::this_thread::get_id();
        });
    bindings.collect();
    require(released.calls==0 && bindings.size()==1,"Active processor binding retired");
    std::thread worker([binding=std::move(binding)]() mutable { binding.reset(); });
    worker.join();
    require(released.calls==0,"Audio worker destroyed processor on graph retirement");
    bindings.collect();
    require(released.calls==1 && released.thread==std::this_thread::get_id() && bindings.size()==0,
        "Processor was not released once on its control thread");
    bindings.collect();
    require(released.calls==1,"Processor release repeated");
    bool rejected=false;
    try {
        bindings.retainOwned({&released,nullptr,[](void* pointer) {
            auto& state=*static_cast<ReleaseState*>(pointer);
            ++state.calls;state.thread=std::this_thread::get_id();
        }},{48000,512,2,2,1024});
    }catch(const std::invalid_argument&) { rejected=true; }
    require(rejected && released.calls==2 && bindings.size()==0,
        "Failed owned admission leaked or retained the processor");
}
void testExclusiveEntry() {
    struct State {
        zp::IsolatedPluginBinding* binding=nullptr;
        int calls=0;
        int32_t nested=0;
    } state;
    zp::IsolatedPluginBindings bindings;
    auto binding=bindings.retain({&state,[](void* pointer,zd_plugin_block*)->int32_t {
        auto& state=*static_cast<State*>(pointer);
        ++state.calls;
        zd_plugin_block nested {};
        nested.produced_count=42;
        state.nested=state.binding->process(nested);
        return nested.produced_count==0?1:-1;
    }},{48000,512,2,2,1024},nullptr);
    state.binding=binding.get();
    zd_plugin_block block {};
    beginAllocationGuard();
    const auto first=binding->process(block);
    const auto second=binding->process(block);
    const auto allocations=endAllocationGuard();
    require(first==-7 && second==-7 && state.nested==-7 && state.calls==1 && binding->status.load()==-7,
        "Recursive entry fault was overwritten or failed processor was called again");
    require(allocations==0,"Processor entry guard allocated");
}
void testConcurrentEntry() {
    struct State {
        std::latch entered{1}, finish{1};
        int calls=0;
    } state;
    zp::IsolatedPluginBindings bindings;
    auto binding=bindings.retain({&state,[](void* pointer,zd_plugin_block*)->int32_t {
        auto& state=*static_cast<State*>(pointer);
        if(++state.calls==1) { state.entered.count_down();state.finish.wait(); }
        return 1;
    }},{48000,512,2,2,1024},nullptr);
    int32_t first=0;
    std::thread worker([&] { zd_plugin_block block {};first=binding->process(block); });
    state.entered.wait();
    zd_plugin_block competing {};competing.produced_count=42;
    beginAllocationGuard();
    const auto rejected=binding->process(competing);
    const auto allocations=endAllocationGuard();
    state.finish.count_down();worker.join();
    const auto resumed=binding->process(competing);
    require(first==-7 && rejected==-7 && resumed==-7 && state.calls==1 && competing.produced_count==0 && binding->status.load()==-7,
        "Concurrent entry fault was overwritten by the in-flight success");
    require(allocations==0,"Contended processor entry allocated");
}
void testEditorAuthority() {
    struct State { uint32_t count=0;double value=0; } state;
    zp::IsolatedPluginBindings bindings;
    auto binding=bindings.retain({&state,[](void* pointer,zd_plugin_block* block)->int32_t {
        auto& state=*static_cast<State*>(pointer);
        state.count=block->automation_count;
        if(state.count)state.value=block->automation[0].value;
        return 1;
    }},{48000,512,2,2,0},nullptr);
    const auto context=reinterpret_cast<std::uintptr_t>(&state);
    require(!binding->setEditorAuthority(context+1,1,true),"Stale editor claimed another processor");
    zd_plugin_block block {};
    binding->setParameters({{7,.2}});
    binding->process(block);
    require(state.count==1 && state.value==.2,"Authored parameter did not reach processor");
    require(binding->setEditorAuthority(context,1,true),"Editor failed to claim its processor");
    binding->setParameters({{7,.3}});
    beginAllocationGuard();binding->process(block);const auto allocations=endAllocationGuard();
    require(allocations==0 && state.count==0,"Editor received stale manual feedback or allocated");
    zd_plugin_automation automation {0,17,7,.8};block.automation=&automation;block.automation_count=1;
    binding->process(block);
    require(state.count==1 && state.value==.8,"Editor ownership suppressed authored automation");
    block.automation=nullptr;block.automation_count=0;
    require(binding->setEditorAuthority(context,2,true),"New editor failed to claim its processor");
    require(!binding->setEditorAuthority(context,1,false),"Stale cleanup released the newer editor");
    binding->setParameters({{7,.4}});binding->process(block);
    require(state.count==0,"Stale cleanup replayed manual feedback into a newer editor");
    require(binding->setEditorAuthority(context,2,false),"Editor failed to release its processor");
    binding->process(block);
    require(state.count==0,"Discarded editor feedback replayed after close");
    binding->setParameters({{7,.6}});binding->process(block);
    require(state.count==1 && state.value==.6,"Authored parameters failed to resume after editor close");
}
}
int main() {
    try {
        juce::ScopedJuceInitialiser_GUI gui;
        testBindingRetirement();
        testExclusiveEntry();
        testConcurrentEntry();
        testEditorAuthority();
        graph::PlayHead playhead;graph::PlayHeadState head(playhead);
        tracktion::tempo::Sequence tempo({{tracktion::BeatPosition::fromBeats(0),120,0}},
            {{tracktion::BeatPosition::fromBeats(0),3,8,false}},tracktion::tempo::LengthOfOneBeat::dependsOnTimeSignature);
        tracktion::engine::ProcessState state(head,tempo);
        playhead.setLoopRange(true,{0,36000});
        Processor processor;zp::IsolatedPluginBindings bindings;
        auto binding=bindings.retain({&processor,Processor::run},{48000,512,2,2,1504},nullptr);
        auto& status=binding->status;
        auto node=zp::createIsolatedPluginNode(std::make_unique<Source>(),binding,state);
        require(node->getNodeProperties().latencyNumSamples==1504,"Bridge lost total prepared latency");
        graph::NodePlayer player;player.setNode(std::move(node),48000,512);
        juce::AudioBuffer<float> output(2,128);tracktion::engine::MidiMessageArray midi;midi.reserve(8192);
        for(int block=0;block<6;++block) {
            const int64_t reference=block*128;processor.timeline=block<3?reference:reference-1000;
            state.referenceSampleRange={reference,reference+128};state.timelineSampleRange={processor.timeline,processor.timeline+128};
            output.clear();midi.clear();
            graph::Node::ProcessContext context{128,{reference,reference+128},{graph::toBufferView(output),midi}};
            beginAllocationGuard();player.process(context);const auto allocations=endAllocationGuard();
            require(allocations==0,"Native bridge processing allocated");
            require(status.load()==1 && output.getSample(0,127)==.125f && output.getSample(1,127)==-.25f,"Bridge samples or timeline differ");
            require(midi.size()==1 && midi[0].getNoteNumber()==72 && std::abs(midi[0].getTimeStamp()-17.0/48000)<1e-10,"Bridge MIDI coordinate mismatch");
        }
        processor.reject=true;
        for(int block=6;block<8;++block) {
            output.clear();midi.clear();
            graph::Node::ProcessContext context{128,{block*128,block*128+128},{graph::toBufferView(output),midi}};
            player.process(context);
            require(status.load()==-5 && output.getMagnitude(0,128)==0 && midi.isEmpty(),"Bridge failure did not retain silent fault state");
        }
        require(processor.calls==7,"Faulted bridge kept invoking failed processor");
        binding->enabled.store(false);
        for(int block=8;block<16;++block) {
            output.clear();midi.clear();
            graph::Node::ProcessContext context{128,{block*128,block*128+128},{graph::toBufferView(output),midi}};
            beginAllocationGuard();player.process(context);const auto allocations=endAllocationGuard();
            require(allocations==0,"Bypass delay allocated in callback");
            for(int sample=0;sample<128;++sample) {
                const bool ready=block*128+sample>=1504;
                require(output.getSample(0,sample)==(ready?.25f:0.f) && output.getSample(1,sample)==(ready?-.5f:0.f),
                    "Bypass dry audio lost prepared latency");
            }
            if(block>=12)require(midi.size()==1 && midi[0].getNoteNumber()==60
                && std::abs(midi[0].getTimeStamp()-113.0/48000)<1e-10,"Bypass MIDI lost delayed identity or sample offset");
        }
        require(processor.calls==7,"Bypass retried a faulted helper");
        std::cout<<"Native bridge stereo samples, timeline jump, MIDI offsets, latency, failure latch and zero guarded allocations passed\n";
        return 0;
    }catch(const std::exception& error) { std::cerr<<error.what()<<'\n';return 1; }
}
