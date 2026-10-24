#pragma once
#include <tracktion_engine/tracktion_engine.h>
#include <algorithm>
#include <array>
#include <atomic>
#include <limits>
#include <stdexcept>

namespace zp {
class LiveMidiInput final : public tracktion::Plugin {
public:
    static constexpr int capacity = 4096;
    struct Edge { int pitch = 0, velocity = 0; bool on = false; uint64_t fence = 0, panicGeneration = 0; };
    LiveMidiInput(tracktion::PluginCreationInfo info, std::atomic<int>& pending, const std::atomic<uint64_t>& stop)
        : Plugin(info), totalPending(pending), stopFence(stop), observedFence(stop.load()) {}
    ~LiveMidiInput() override { totalPending.fetch_sub(fifo.getNumReady(), std::memory_order_relaxed); }
    juce::String getName() const override { return "Live MIDI input"; }
    juce::String getSelectableDescription() override { return getName(); }
    juce::String getPluginType() override { return "zoeydaw-live-midi-input"; }
    BusLayout getBusses() const override { return BusLayout::singlePassThrough(); }
    int getNumOutputChannelsGivenInputs(int n) override { return std::max(2, n); }
    bool producesAudioWhenNoAudioInput() override { return true; }
    bool takesMidiInput() override { return true; }
    void initialise(const tracktion::PluginInitialisationInfo&) override {}
    void deinitialise() override {}
    bool enqueue(Edge edge) noexcept {
        if(totalPending.load(std::memory_order_acquire)>=capacity)return false;
        int first=0,count=0,second=0,secondCount=0;
        fifo.prepareToWrite(1,first,count,second,secondCount);
        if(count==0)return false;
        edge.panicGeneration=panicRequested.load(std::memory_order_acquire);
        edges[static_cast<size_t>(first)]=edge;
        totalPending.fetch_add(1,std::memory_order_relaxed);
        fifo.finishedWrite(1);return true;
    }
    void allNotesOff() {
        const auto generation=panicRequested.load(std::memory_order_relaxed);
        if(generation==std::numeric_limits<uint64_t>::max())throw std::overflow_error("MIDI panic generation exhausted");
        panicRequested.store(generation+1,std::memory_order_release);
    }
    int queued() const noexcept { return fifo.getNumReady(); }
    uint64_t delivered() const noexcept { return deliveredEdges.load(std::memory_order_relaxed); }
    uint64_t panics() const noexcept { return deliveredPanics.load(std::memory_order_relaxed); }
    void applyToBuffer(const tracktion::PluginRenderContext& rc) override {
        if(rc.isRendering || !rc.bufferForMidiMessages)return;
        // Tracktion finishes the current graph root before adopting/processing the next graph.
        const auto fence=stopFence.load(std::memory_order_acquire);
        const auto requestedPanic=panicRequested.load(std::memory_order_acquire);
        const bool explicitPanic=requestedPanic!=observedPanic;
        const bool clearing=explicitPanic || fence!=observedFence;
        observedFence=fence;
        int first=0,count=0,second=0,secondCount=0;
        fifo.prepareToRead(capacity,first,count,second,secondCount);
        auto& midi=*rc.bufferForMidiMessages;
        if(clearing) {
            midi.isAllNotesOff=true;
            for(int channel=1;channel<=16;++channel)midi.addMidiMessage(juce::MidiMessage::allNotesOff(channel),rc.midiBufferOffset,{});
            deliveredPanics.fetch_add(1,std::memory_order_relaxed);
        }
        int consumed=0;
        const auto append=[&](int start,int length) {
            for(int i=0;i<length;++i) {
                const auto& edge=edges[static_cast<size_t>(start+i)];
                if(edge.panicGeneration>requestedPanic || edge.fence>fence)return false;
                ++consumed;
                if(edge.fence!=fence || edge.panicGeneration!=requestedPanic)continue;
                auto message=edge.on?juce::MidiMessage::noteOn(1,edge.pitch,static_cast<juce::uint8>(edge.velocity)):juce::MidiMessage::noteOff(1,edge.pitch);
                midi.addMidiMessage(std::move(message),rc.midiBufferOffset,{});
                deliveredEdges.fetch_add(1,std::memory_order_relaxed);
            }
            return true;
        };
        if(append(first,count))append(second,secondCount);
        fifo.finishedRead(consumed);
        totalPending.fetch_sub(consumed,std::memory_order_release);
        observedPanic=requestedPanic;
    }
private:
    std::array<Edge,capacity+1> edges {};
    juce::AbstractFifo fifo {capacity+1};
    std::atomic<int>& totalPending;
    const std::atomic<uint64_t>& stopFence;
    uint64_t observedFence=0,observedPanic=0;
    std::atomic<uint64_t> panicRequested {0};
    std::atomic<uint64_t> deliveredEdges {0},deliveredPanics {0};
};
}
