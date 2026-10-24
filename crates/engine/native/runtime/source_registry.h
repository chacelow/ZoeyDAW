#pragma once
#include "playback_model.h"
#include <cstdint>
#include <limits>
#include <map>
#include <optional>
#include <string>
#include <vector>

namespace zp {
struct SourceMapping {
    std::uint32_t clipHandle, sourceHandle, sourceGeneration;
    std::string clipId, sourceId;
    double sourceRate;
    bool preview = false;
};
class SourceRegistry final {
public:
    struct Limits {
        std::uint32_t clipHandles = std::numeric_limits<std::uint32_t>::max();
        std::uint32_t sourceHandles = std::numeric_limits<std::uint32_t>::max();
        std::uint32_t sourceGenerations = std::numeric_limits<std::uint32_t>::max();
    };
    SourceRegistry() = default;
    explicit SourceRegistry(Limits);
    SourceRegistry prepare(const Request&) const;
    SourceRegistry preparePreview(std::uint64_t auditionGeneration, const juce::File&,
                                  std::int64_t decodedFrames, double decodedRate, int decodedChannels) const;
    SourceRegistry resumePreview(std::uint64_t auditionGeneration) const;
    void clearPreview() noexcept;
    void clearPreview(std::uint64_t auditionGeneration) noexcept;
    const std::vector<SourceMapping>& mappings() const noexcept { return active; }
    const juce::String& sessionId() const noexcept { return session; }
private:
    struct FileStamp {
        juce::String path;
        std::int64_t bytes, modifiedMs;
    };
    struct Identity {
        std::uint32_t handle, generation;
        juce::String sha;
        double rate;
        std::int64_t frames;
        int channels;
        std::optional<FileStamp> temporary;
    };
    struct Preview {
        std::uint64_t generation;
        SourceMapping mapping;
        Identity identity;
        bool active;
    };
    static std::uint32_t reserve(std::uint64_t&, std::uint32_t);
    void installPreview(std::uint64_t, Identity);
    Limits limits;
    juce::String session;
    std::uint64_t nextClip = 1, nextSource = 1;
    std::map<juce::String, std::uint32_t> clips;
    std::map<juce::String, Identity> sources, previewSources;
    std::optional<Preview> preview;
    std::vector<SourceMapping> active;
};
}
