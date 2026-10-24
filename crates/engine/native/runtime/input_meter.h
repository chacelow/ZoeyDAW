#pragma once
#include "meter_bank.h"
#include <atomic>
#include <memory>
#include <mutex>

namespace zp {
class InputMeter final {
public:
    // Device lifecycle serializes prepare/stop with process; never call prepare inside a sample callback.
    bool prepare(std::uint32_t channels);
    void stop() noexcept;
    void process(const float* const* inputs, int channels, int frames, std::uint64_t startSample) noexcept;
    std::unique_ptr<MeterReadHandle> acquire(std::uint32_t expectedDeviceEpoch);
    std::uint32_t deviceEpoch() const noexcept { return epoch.load(std::memory_order_acquire); }
    bool active() const noexcept { return running.load(std::memory_order_acquire); }
private:
    std::mutex ownerMutex;
    std::shared_ptr<MeterBank> bank;
    MeterBank* audioBank = nullptr;
    std::atomic<std::uint32_t> epoch {0};
    std::atomic<bool> running {false};
};
}
