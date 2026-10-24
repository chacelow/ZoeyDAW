#pragma once
#include "meter_tap.h"
#include <cstdint>
#include <memory>
#include <span>

namespace zp {
struct MeterBankIdentity {
    std::uint32_t deviceEpoch, generation, registryRevision;
    bool operator==(const MeterBankIdentity&) const = default;
};
class MeterBank final {
public:
    MeterBank(MeterBankIdentity identity, std::uint32_t channels);
    MeterTap* tap(std::uint32_t slot) noexcept;
    const MeterBankIdentity identity;
    const std::uint32_t channels;
private:
    bool read(std::uint32_t slot, MeterPublication& result) noexcept;
    std::unique_ptr<MeterTap[]> taps;
    friend class MeterReadHandle;
    std::atomic<bool> readerAcquired {false};
};
// Acquire and destroy handles only off the audio thread; the graph retains its own bank reference.
class MeterReadHandle final {
public:
    static std::unique_ptr<MeterReadHandle> acquire(std::shared_ptr<MeterBank> bank, MeterBankIdentity expected);
    bool read(std::uint32_t slot, MeterPublication& result) noexcept;
    ~MeterReadHandle();
    MeterReadHandle(const MeterReadHandle&) = delete;
    MeterReadHandle& operator=(const MeterReadHandle&) = delete;
private:
    explicit MeterReadHandle(std::shared_ptr<MeterBank> bank);
    std::shared_ptr<MeterBank> bank;
};
}
