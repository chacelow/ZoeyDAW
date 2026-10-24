#include "meter_tap.h"
#include <algorithm>
#include <cmath>
#include <limits>

namespace zp {
bool MeterTap::requestReset(std::uint32_t epoch, MeterReset reset) noexcept {
    if (epoch <= requested.epoch) return false;
    if (reset != MeterReset::hold && reset != MeterReset::clip && reset != MeterReset::all) return false;
    requested.epoch = epoch;
    if (reset == MeterReset::hold || reset == MeterReset::all) requested.hold = epoch;
    if (reset == MeterReset::clip || reset == MeterReset::all) requested.clip = epoch;
    if (reset == MeterReset::all) requested.peak = epoch;
    resets.publish(requested);
    return true;
}
bool MeterTap::readLatest(MeterPublication& result) noexcept {
    if (!mailbox.readLatest(result)) return false;
    acknowledged.store(result.current.id, std::memory_order_release);
    return true;
}
void MeterTap::process(std::span<const float> samples, std::uint64_t startSample) noexcept {
    ResetState reset;
    if (resets.readLatest(reset)) {
        if (reset.hold != applied.hold) {
            state.completed.displayPeak = 0;
            state.current.displayPeak = 0;
            state.completed.holdResetEpoch = reset.hold;
            state.current.holdResetEpoch = reset.hold;
        }
        if (reset.peak != applied.peak) state.sessionPeak = 0;
        if (reset.clip != applied.clip) state.sessionClipCount = 0;
        state.slotResetEpoch = reset.epoch;
        state.holdResetEpoch = reset.hold;
        state.clipResetEpoch = reset.clip;
        state.peakResetEpoch = reset.peak;
        applied = reset;
    }
    if (exhausted) return;
    if (state.current.id == 0 || acknowledged.load(std::memory_order_acquire) == state.current.id) {
        if (nextEpoch == std::numeric_limits<std::uint64_t>::max()) {
            exhausted = true;
            state.available = false;
            mailbox.publish(state);
            return;
        }
        if (state.current.id != 0) {
            state.completed = state.current;
            state.completedValid = true;
        }
        state.current = {};
        state.current.holdResetEpoch = applied.hold;
        state.current.id = nextEpoch++;
        state.current.startSample = startSample;
    }
    state.available = state.current.valid;
    if (samples.size() > std::numeric_limits<std::uint64_t>::max() - startSample ||
        samples.size() > std::numeric_limits<std::uint64_t>::max() - state.current.count ||
        samples.size() > std::numeric_limits<std::uint64_t>::max() - state.sessionClipCount) {
        exhausted = true;
        state.available = false;
        mailbox.publish(state);
        return;
    }
    for (const float sample : samples) {
        if (!std::isfinite(sample)) {
            state.available = false;
            state.current.valid = false;
            continue;
        }
        const float magnitude = std::abs(sample);
        state.current.peak = std::max(state.current.peak, magnitude);
        state.current.displayPeak = std::max(state.current.displayPeak, magnitude);
        state.sessionPeak = std::max(state.sessionPeak, magnitude);
        state.current.sumSquares += double(sample) * sample;
        if (magnitude >= 1) {
            ++state.current.clipCount;
            ++state.sessionClipCount;
        }
    }
    state.current.count += samples.size();
    state.current.endSample = startSample + samples.size();
    mailbox.publish(state);
}
}
