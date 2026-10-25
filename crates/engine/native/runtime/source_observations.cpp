#include "source_observations.h"
#include "engine_session.h"
#include "realtime_protocol.generated.h"
#include <algorithm>
#include <cmath>
#include <limits>
namespace zp {
static_assert(sizeof(realtime::wire::WireSource) == realtime::wire::SOURCE_BYTES);
V EngineSession::sourceMeterRegistry() {
    const auto& mappings = sourceRegistry.mappings();
    const auto generation = arrangement->meterGraph->identity.generation;
    const auto previous = sourceObservations->current.load();
    const bool unchanged = previous && previous->session == accepted->session
        && previous->graphGeneration == generation && previous->bindings.size() == mappings.size()
        && std::equal(mappings.begin(), mappings.end(), previous->bindings.begin(),
                      [](const auto& mapping, const auto& binding) { return mapping == binding.mapping; });
    if (!unchanged) {
        auto next = std::make_shared<SourceObservationRegistry>();
        next->session = accepted->session;
        next->graphGeneration = generation;
        next->bindings.reserve(mappings.size());
        for (const auto& mapping : mappings) {
            std::shared_ptr<te::AudioClipPlayhead> playhead;
            if (mapping.preview) {
                if (preview) for (auto* track : te::getAudioTracks(*preview))
                    for (auto* clip : track->getClips())
                        if (auto* audio = dynamic_cast<te::AudioClipBase*>(clip)) playhead = audio->getPlayhead();
            } else if (const auto clip = arrangement->audioClips.find(juce::String(mapping.clipId));
                       clip != arrangement->audioClips.end()) {
                playhead = clip->second->getPlayhead();
            }
            next->bindings.push_back({mapping, std::move(playhead)});
        }
        sourceObservations->current.store(std::move(next));
    }
    juce::Array<V> entries;
    entries.ensureStorageAllocated((int)mappings.size());
    for (const auto& mapping : mappings) {
        auto entry = object();
        put(entry, "clipHandle", (juce::int64)mapping.clipHandle);
        put(entry, "clipId", juce::String(mapping.clipId));
        put(entry, "sourceHandle", (juce::int64)mapping.sourceHandle);
        put(entry, "sourceId", juce::String(mapping.sourceId));
        put(entry, "sourceGeneration", (juce::int64)mapping.sourceGeneration);
        put(entry, "sourceRate", mapping.sourceRate);
        put(entry, "owner", mapping.preview ? "preview" : "arrangement");
        entries.add(std::move(entry));
    }
    return entries;
}
std::uint32_t SourceObservationState::read(const juce::String& session, std::uint32_t generation,
                                          std::uint64_t deviceSample, double deviceRate, bool arrangementPlaying,
                                          std::span<realtime::wire::WireSource> output) const noexcept {
    using namespace realtime::wire;
    const auto registry = current.load();
    if (!registry || registry->session != session || registry->graphGeneration != generation
        || !std::isfinite(deviceRate) || deviceRate <= 0
        || registry->bindings.size() > std::numeric_limits<std::uint32_t>::max()
        || output.size() != registry->bindings.size()) return 0;
    constexpr std::uint32_t maxAgeMs = 50;
    const double ageSamples = std::ceil(deviceRate * maxAgeMs / 1000.0);
    if (ageSamples > std::numeric_limits<std::uint32_t>::max()) return 0;
    size_t offset = 0;
    for (const auto& binding : registry->bindings) {
        const auto& mapping = binding.mapping;
        WireSource record{mapping.clipHandle, mapping.sourceHandle, 0, mapping.sourceRate,
                          deviceSample, mapping.sourceGeneration, (std::uint32_t)SOURCE_FLAGS_UNAVAILABLE,
                          (std::uint32_t)ageSamples, 0};
        if ((mapping.preview || arrangementPlaying) && binding.playhead) if (const auto position = binding.playhead->getPosition(maxAgeMs)) {
            const double frame = position->inSeconds() * mapping.sourceRate;
            if (std::isfinite(frame) && frame >= 0) {
                record.sourceFrame = frame;
                record.flags = (std::uint32_t)SOURCE_FLAGS_VALID;
            }
        }
        output[offset++] = record;
    }
    return (std::uint32_t)offset;
}
}
