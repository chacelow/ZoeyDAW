#include "meter_bank.h"
#include <utility>

namespace zp {
MeterBank::MeterBank(MeterBankIdentity identity, std::uint32_t channels)
    : identity(identity), channels(channels), taps(std::make_unique<MeterTap[]>(channels)) {}
MeterTap* MeterBank::tap(std::uint32_t slot) noexcept {
    return slot < channels ? &taps[slot] : nullptr;
}
bool MeterBank::read(std::uint32_t slot, MeterPublication& result) noexcept {
    auto* selected = tap(slot);
    return selected && selected->readLatest(result);
}
MeterReadHandle::MeterReadHandle(std::shared_ptr<MeterBank> bank) : bank(std::move(bank)) {}
MeterReadHandle::~MeterReadHandle() {
    if (bank) bank->readerAcquired.store(false, std::memory_order_release);
}
std::unique_ptr<MeterReadHandle> MeterReadHandle::acquire(std::shared_ptr<MeterBank> bank, MeterBankIdentity expected) {
    if (!bank || bank->identity != expected) return nullptr;
    auto handle = std::unique_ptr<MeterReadHandle>(new MeterReadHandle(bank));
    if (bank->readerAcquired.exchange(true, std::memory_order_acq_rel)) {
        handle->bank.reset();
        return nullptr;
    }
    return handle;
}
bool MeterReadHandle::read(std::uint32_t slot, MeterPublication& result) noexcept {
    return bank->read(slot, result);
}
}
