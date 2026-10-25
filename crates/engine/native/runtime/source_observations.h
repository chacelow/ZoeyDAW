#pragma once
#include "source_registry.h"
#include "realtime_protocol.generated.h"
#include <tracktion_engine/tracktion_engine.h>
#include <atomic>
#include <memory>
#include <span>
namespace zp {
struct SourceObservationBinding {
    SourceMapping mapping;
    std::shared_ptr<tracktion::AudioClipPlayhead> playhead;
};
struct SourceObservationRegistry {
    juce::String session;
    std::uint32_t graphGeneration = 0;
    std::vector<SourceObservationBinding> bindings;
};
struct SourceObservationState {
    std::atomic<std::shared_ptr<const SourceObservationRegistry>> current;
    std::uint32_t read(const juce::String& session, std::uint32_t graphGeneration,
                       std::uint64_t deviceSample, double deviceRate, bool arrangementPlaying,
                       std::span<realtime::wire::WireSource> output) const noexcept;
};
}
