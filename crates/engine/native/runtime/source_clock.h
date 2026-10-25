#pragma once
#include <juce_core/juce_core.h>
#include <atomic>
#include <cstdint>
#include <memory>
#include <optional>
namespace tracktion { inline namespace graph { class Node; } }
namespace zp {
struct SourceBlockTime {
    std::uint64_t referenceSample, deviceSample;
    double sampleRate;
};
class SourceBlockClock final {
public:
    void publish(SourceBlockTime value) noexcept {
        version.fetch_add(1);
        reference.store(value.referenceSample);device.store(value.deviceSample);rate.store(value.sampleRate);
        updated.store(juce::Time::getMillisecondCounter());version.fetch_add(1);
    }
    std::optional<SourceBlockTime> read(std::uint32_t maxAgeMs) const noexcept {
        const auto before=version.load();if(before==0 || (before&1))return {};
        const SourceBlockTime value{reference.load(),device.load(),rate.load()};const auto time=updated.load();
        if(version.load()!=before || juce::Time::getMillisecondCounter()-time>maxAgeMs)return {};
        return value;
    }
private:
    static_assert(std::atomic<std::uint64_t>::is_always_lock_free && std::atomic<double>::is_always_lock_free);
    std::atomic<std::uint64_t> version{0},reference{0},device{0};
    std::atomic<double> rate{0};
    std::atomic<std::uint32_t> updated{0};
};
std::unique_ptr<tracktion::graph::Node> createSourceClockObserver(std::unique_ptr<tracktion::graph::Node>,
    std::shared_ptr<SourceBlockClock>,const std::atomic<std::uint64_t>&,double sampleRate);
}
