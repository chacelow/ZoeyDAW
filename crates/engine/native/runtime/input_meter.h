#pragma once
#include "meter_bank.h"
#include <atomic>
#include <memory>
#include <mutex>
#include <vector>

namespace zp {
class InputMeterCollector final {
public:
    explicit InputMeterCollector(std::shared_ptr<MeterBank>);
    void collect();
    bool copyLatest(std::uint32_t channel, MeterPublication&);
    bool requestReset(std::span<const std::uint32_t> channels,std::uint32_t epoch,MeterReset);
    bool acquireHub() noexcept { return !hubAcquired.exchange(true,std::memory_order_acq_rel); }
    void releaseHub() noexcept { hubAcquired.store(false,std::memory_order_release); }
    bool hasHub() const noexcept { return hubAcquired.load(std::memory_order_acquire); }
    const std::shared_ptr<MeterBank> bank;
private:
    std::unique_ptr<MeterReadHandle> reader;
    std::vector<MeterPublication> cache;
    std::vector<bool> received;
    std::vector<std::uint32_t> resetEpochs;
    std::mutex cacheMutex;
    std::atomic<bool> hubAcquired {false};
};
class InputMeter final {
public:
    // Device lifecycle serializes prepare/stop with process; never call prepare inside a sample callback.
    bool prepare(std::uint32_t channels);
    void stop() noexcept;
    void process(const float* const* inputs, int channels, int frames, std::uint64_t startSample) noexcept;
    std::shared_ptr<InputMeterCollector> collector(std::uint32_t expectedDeviceEpoch);
    std::uint32_t deviceEpoch() const noexcept { return epoch.load(std::memory_order_acquire); }
    bool active() const noexcept { return running.load(std::memory_order_acquire); }
private:
    std::mutex ownerMutex;
    std::shared_ptr<MeterBank> bank;
    std::shared_ptr<InputMeterCollector> collected;
    MeterBank* audioBank = nullptr;
    std::atomic<std::uint32_t> epoch {0};
    std::atomic<bool> running {false};
};
}
