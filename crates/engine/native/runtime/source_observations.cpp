#include "source_observations.h"
#include "engine_session.h"
#include <tracktion_engine/playback/graph/tracktion_EditNodeBuilder.h>
#include "realtime_protocol.generated.h"
#include <algorithm>
#include <cmath>
#include <limits>
namespace zp {
static_assert(sizeof(realtime::wire::WireSource) == realtime::wire::SOURCE_BYTES);
void EngineSession::configureSourcePlayheads(te::Edit& edit,te::CreateNodeParams& params) {
    if(params.forRendering)return;
    std::erase_if(sourcePlayheadGraphs,[&](const auto& item) {
        return item.first!=&edit && (!arrangement || item.first!=arrangement->edit.get()) && item.first!=preview.get();
    });
    auto graph=std::make_shared<SourcePlayheadGraph>();
    const auto slot=sourcePlayheadGraphs.try_emplace(&edit).first;
    if(!arrangement || arrangement->edit.get()!=&edit) {
        graph->previewClock=std::make_shared<SourceBlockClock>();
        params.wrapPlaybackGraph=[anchor=graph->previewClock,samples=&clock.frames,rate=params.sampleRate,
            previous=std::move(params.wrapPlaybackGraph)](std::unique_ptr<te::graph::Node> node) {
            if(previous)node=previous(std::move(node));
            return createSourceClockObserver(std::move(node),anchor,*samples,rate);
        };
    }
    params.audioClipPlayhead=[graph](te::AudioClipBase& clip) {
        auto playhead=std::make_shared<te::AudioClipPlayhead>();
        graph->playheads[clip.itemID]=playhead;
        return playhead;
    };
    params.graphPosted=[graph,slot,previous=std::move(params.graphPosted)] {
        if(previous)previous();
        slot->second=graph;
    };
}
V EngineSession::sourceMeterRegistry(std::uint32_t generation) {
    std::erase_if(sourcePlayheadGraphs,[&](const auto& item) {
        return item.first!=arrangement->edit.get() && item.first!=preview.get();
    });
    const auto& mappings = sourceRegistry.mappings();
    const auto graphFor=[&](te::Edit* edit)->std::shared_ptr<const SourcePlayheadGraph> {
        const auto found=sourcePlayheadGraphs.find(edit);
        return found==sourcePlayheadGraphs.end()?nullptr:found->second;
    };
    const auto arrangementGraph=graphFor(arrangement->edit.get()),previewGraph=graphFor(preview.get());
    const auto previous = sourceObservations->current.load();
    const bool unchanged = previous && previous->session == accepted->session
        && previous->graphGeneration == generation && previous->bindings.size() == mappings.size()
        && previous->arrangementGraph == arrangementGraph && previous->previewGraph == previewGraph
        && std::equal(mappings.begin(), mappings.end(), previous->bindings.begin(),
                      [](const auto& mapping, const auto& binding) { return mapping == binding.mapping; });
    if (!unchanged) {
        auto next = std::make_shared<SourceObservationRegistry>();
        next->session = accepted->session;
        next->graphGeneration = generation;
        next->arrangementGraph=arrangementGraph;
        next->previewGraph=previewGraph;
        next->bindings.reserve(mappings.size());
        for (const auto& mapping : mappings) {
            std::shared_ptr<te::AudioClipPlayhead> playhead;
            const auto& graph=mapping.preview?previewGraph:arrangementGraph;
            te::EditItemID clipId;
            if(mapping.preview) {
                if(preview)for(auto* track:te::getAudioTracks(*preview))
                    for(auto* clip:track->getClips())if(dynamic_cast<te::AudioClipBase*>(clip))clipId=clip->itemID;
            } else if(const auto clip=arrangement->audioClips.find(juce::String(mapping.clipId));clip!=arrangement->audioClips.end())clipId=clip->second->itemID;
            if(graph)if(const auto found=graph->playheads.find(clipId);found!=graph->playheads.end())playhead=found->second;
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
                                          std::uint64_t referenceSample, std::uint64_t deviceSample, double deviceRate, bool arrangementPlaying,
                                          std::span<realtime::wire::WireSource> output) const noexcept {
    using namespace realtime::wire;
    const auto registry = current.load();
    if (!registry || registry->session != session || registry->graphGeneration != generation
        || registry->bindings.size() > std::numeric_limits<std::uint32_t>::max()
        || output.size() != registry->bindings.size()) return 0;
    constexpr std::uint32_t maxAgeMs = 50;
    const auto previewTime=registry->previewGraph && registry->previewGraph->previewClock
        ?registry->previewGraph->previewClock->read(maxAgeMs):std::nullopt;
    size_t offset = 0;
    for (const auto& binding : registry->bindings) {
        const auto& mapping = binding.mapping;
        const auto anchor=mapping.preview?previewTime:
            (std::isfinite(deviceRate) && deviceRate>0?std::optional<SourceBlockTime>({referenceSample,deviceSample,deviceRate}):std::nullopt);
        WireSource record{mapping.clipHandle, mapping.sourceHandle, 0, mapping.sourceRate,
                          deviceSample, mapping.sourceGeneration, (std::uint32_t)SOURCE_FLAGS_UNAVAILABLE,
                          0, 0};
        if (anchor && (mapping.preview || arrangementPlaying) && binding.playhead) if (const auto observation = binding.playhead->getObservation(maxAgeMs)) {
            const double frame = observation->position.inSeconds() * mapping.sourceRate;
            if (std::isfinite(frame) && frame >= 0 && observation->referenceSample >= 0 && observation->sampleRate == anchor->sampleRate
                && static_cast<std::uint64_t>(observation->referenceSample) <= anchor->referenceSample) {
                const auto age = anchor->referenceSample - static_cast<std::uint64_t>(observation->referenceSample);
                if (age <= anchor->deviceSample && age <= std::ceil(anchor->sampleRate * maxAgeMs / 1000.0)) {
                    record.sourceFrame = frame;
                    record.observedDeviceSample = anchor->deviceSample-age;
                    record.positionAgeSamples = static_cast<std::uint32_t>(age);
                    record.flags = (std::uint32_t)SOURCE_FLAGS_VALID;
                }
            }
        }
        output[offset++] = record;
    }
    return (std::uint32_t)offset;
}
}
