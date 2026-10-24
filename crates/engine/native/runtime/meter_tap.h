#pragma once
#include "realtime_snapshot.h"
#include <atomic>
#include <cstdint>
#include <span>

namespace zp {
struct MeterEpoch {
    std::uint64_t id = 0;
    std::uint64_t startSample = 0, endSample = 0, count = 0, clipCount = 0;
    double sumSquares = 0;
    float peak = 0;
    float displayPeak = 0;
    std::uint32_t holdResetEpoch = 0;
    bool valid = true;
};
struct MeterPublication {
    MeterEpoch completed, current;
    float sessionPeak = 0;
    std::uint64_t sessionClipCount = 0;
    std::uint32_t slotResetEpoch = 0;
    std::uint32_t holdResetEpoch = 0, clipResetEpoch = 0, peakResetEpoch = 0;
    bool completedValid = false;
    bool available = true;
};
enum class MeterReset : std::uint32_t { hold = 1, clip = 2, all = 3 };

class MeterTap final {
public:
    // One audio writer and one Hub consumer. Control reset requests are serialized by Hub.
    void process(std::span<const float> samples, std::uint64_t startSample) noexcept;
    bool requestReset(std::uint32_t epoch, MeterReset reset) noexcept;
private:
    bool readLatest(MeterPublication& result) noexcept;
    friend class MeterBank;
    static_assert(std::atomic<std::uint64_t>::is_always_lock_free);
    RealtimeSnapshot<MeterPublication> mailbox;
    MeterPublication state;
    std::atomic<std::uint64_t> acknowledged {0};
    struct ResetState {
        std::uint32_t epoch = 0, hold = 0, clip = 0, peak = 0;
    } requested, applied;
    RealtimeSnapshot<ResetState> resets;
    std::uint64_t nextEpoch = 1;
    bool exhausted = false;
};
}
