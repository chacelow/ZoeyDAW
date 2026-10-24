#include "source_registry.h"
#include <algorithm>
#include <cmath>
#include <set>
#include <stdexcept>

namespace zp {
namespace {
void validateMetadata(std::int64_t frames, double rate, int channels) {
    if (frames <= 0 || !std::isfinite(rate) || rate < 1 || rate > 768000 || channels < 1 || channels > 64)
        throw std::invalid_argument("Invalid source metadata");
}
void validateSource(const juce::String& id, const Source& source) {
    validateMetadata(source.frames, source.rate, source.channels);
    if (id.isEmpty() || id != source.id || source.sha.length() != 64
        || !source.sha.containsOnly("0123456789abcdefABCDEF"))
        throw std::invalid_argument("Invalid source identity");
}
}
SourceRegistry::SourceRegistry(Limits requestedLimits) : limits(requestedLimits) {
    if (limits.clipHandles == 0 || limits.sourceHandles == 0 || limits.sourceGenerations == 0)
        throw std::invalid_argument("Source registry limits must be positive");
}
std::uint32_t SourceRegistry::reserve(std::uint64_t& next, std::uint32_t maximum) {
    if (next > maximum) throw std::overflow_error("Source handle space exhausted; reopen session");
    return static_cast<std::uint32_t>(next++);
}
void SourceRegistry::installPreview(std::uint64_t generation, Identity identity) {
    const auto clipId = "preview/" + std::to_string(generation);
    auto sourceId = "temporary-preview/" + std::to_string(identity.handle);
    while (sources.count(juce::String(sourceId))) sourceId += '/';
    SourceMapping mapping{reserve(nextClip, limits.clipHandles), identity.handle, identity.generation,
                          clipId, sourceId, identity.rate, true};
    preview = Preview{generation, std::move(mapping), std::move(identity), true};
    active.push_back(preview->mapping);
}
SourceRegistry SourceRegistry::prepare(const Request& request) const {
    if (request.session.isEmpty()) throw std::invalid_argument("Empty source registry session");
    const bool sameSession = request.session == session;
    SourceRegistry next = sameSession ? *this : SourceRegistry(limits);
    next.session = request.session;
    next.active.clear();
    for (const auto& [id, source] : request.sources) {
        validateSource(id, source);
        auto prior = next.sources.find(id);
        if (prior == next.sources.end()) {
            next.sources.emplace(id, Identity{reserve(next.nextSource, limits.sourceHandles), 1,
                                 source.sha.toLowerCase(), source.rate, source.frames, source.channels, std::nullopt});
        } else if (prior->second.sha != source.sha.toLowerCase() || prior->second.rate != source.rate
                   || prior->second.frames != source.frames || prior->second.channels != source.channels) {
            if (prior->second.generation == limits.sourceGenerations)
                throw std::overflow_error("Source generation exhausted; reopen session");
            prior->second = Identity{prior->second.handle, prior->second.generation + 1,
                                    source.sha.toLowerCase(), source.rate, source.frames, source.channels, std::nullopt};
        }
    }
    std::set<juce::String> activeClipIds;
    for (const auto& track : request.tracks) {
        for (const auto& clip : track.clips) {
            if (clip.kind != "audio" || clip.source.isEmpty()) continue;
            if (clip.id.isEmpty() || clip.id.startsWith("preview/") || !activeClipIds.insert(clip.id).second)
                throw std::invalid_argument("Invalid or duplicate clip identity");
            if (request.sources.find(clip.source) == request.sources.end())
                throw std::invalid_argument("Unregistered clip source");
            const auto& source = next.sources.at(clip.source);
            auto handle = next.clips.find(clip.id);
            if (handle == next.clips.end())
                handle = next.clips.emplace(clip.id, reserve(next.nextClip, limits.clipHandles)).first;
            next.active.push_back({handle->second, source.handle, source.generation,
                                  clip.id.toStdString(), clip.source.toStdString(), source.rate, false});
        }
    }
    if (sameSession) {
        if (next.preview) {
            auto sourceId = next.preview->mapping.sourceId;
            while (next.sources.count(juce::String(sourceId))) sourceId += '/';
            next.preview->mapping.sourceId = std::move(sourceId);
            if (next.preview->active) next.active.push_back(next.preview->mapping);
        }
    } else if (preview) {
        auto identity = preview->identity;
        identity.handle = reserve(next.nextSource, limits.sourceHandles);
        identity.generation = 1;
        next.previewSources.emplace(identity.temporary->path, identity);
        next.installPreview(preview->generation, std::move(identity));
        if (!preview->active) next.clearPreview();
    }
    return next;
}
SourceRegistry SourceRegistry::preparePreview(std::uint64_t generation, const juce::File& file,
                                             std::int64_t frames, double rate, int channels) const {
    validateMetadata(frames, rate, channels);
    if (!file.existsAsFile()) throw std::invalid_argument("Preview source is missing");
    const FileStamp stamp{file.getFullPathName(), file.getSize(), file.getLastModificationTime().toMilliseconds()};
    if (stamp.path.isEmpty() || stamp.bytes <= 0)
        throw std::invalid_argument("Invalid temporary preview identity");
    if (preview && generation <= preview->generation)
        throw std::invalid_argument("Preview generation must increase; use resumePreview for the accepted clip");
    SourceRegistry next = *this;
    next.clearPreview();
    auto prior = next.previewSources.find(stamp.path);
    if (prior == next.previewSources.end()) {
        prior = next.previewSources.emplace(stamp.path, Identity{reserve(next.nextSource, limits.sourceHandles),
                      1, {}, rate, frames, channels, stamp}).first;
    } else {
        const auto& old = prior->second;
        if (old.temporary->bytes != stamp.bytes || old.temporary->modifiedMs != stamp.modifiedMs
            || old.frames != frames || old.rate != rate || old.channels != channels) {
            if (old.generation == limits.sourceGenerations)
                throw std::overflow_error("Source generation exhausted; reopen session");
            prior->second = Identity{old.handle, old.generation + 1, {}, rate, frames, channels, stamp};
        }
    }
    next.installPreview(generation, prior->second);
    return next;
}
SourceRegistry SourceRegistry::resumePreview(std::uint64_t generation) const {
    if (!preview || preview->generation != generation)
        throw std::invalid_argument("Unknown preview generation");
    SourceRegistry next = *this;
    if (!next.preview->active) {
        next.active.push_back(next.preview->mapping);
        next.preview->active = true;
    }
    return next;
}
void SourceRegistry::clearPreview() noexcept {
    active.erase(std::remove_if(active.begin(), active.end(), [](const auto& mapping) { return mapping.preview; }), active.end());
    if (preview) preview->active = false;
}
void SourceRegistry::clearPreview(std::uint64_t generation) noexcept {
    if (preview && preview->generation == generation) clearPreview();
}
}
