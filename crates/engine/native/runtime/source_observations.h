#pragma once
#include "source_registry.h"
#include "realtime_protocol.generated.h"
#include "source_clock.h"
#include <tracktion_engine/tracktion_engine.h>
#include <atomic>
#include <memory>
#include <map>
#include <span>
namespace zp {
struct SourcePlayheadGraph {
    std::map<tracktion::EditItemID,std::shared_ptr<tracktion::AudioClipPlayhead>> playheads;
    std::shared_ptr<SourceBlockClock> previewClock;
};
struct SourceObservationBinding {
    SourceMapping mapping;
    std::shared_ptr<tracktion::AudioClipPlayhead> playhead;
};
struct SourceObservationRegistry {
    juce::String session;
    std::uint32_t graphGeneration = 0;
    std::shared_ptr<const SourcePlayheadGraph> arrangementGraph, previewGraph;
    std::vector<SourceObservationBinding> bindings;
};
struct SourceObservationState {
    std::atomic<std::shared_ptr<const SourceObservationRegistry>> current;
    std::uint32_t read(const juce::String& session, std::uint32_t graphGeneration,
                       std::uint64_t referenceSample, std::uint64_t deviceSample, double deviceRate, bool arrangementPlaying,
                       std::span<realtime::wire::WireSource> output) const noexcept;
};
}
