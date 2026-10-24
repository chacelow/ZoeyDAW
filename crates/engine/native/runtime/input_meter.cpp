#include "input_meter.h"
#include <algorithm>
#include <limits>

namespace zp {
bool InputMeter::prepare(std::uint32_t channels) {
    std::lock_guard lock(ownerMutex);
    const auto previous = epoch.load(std::memory_order_relaxed);
    if (previous == std::numeric_limits<std::uint32_t>::max()) {
        audioBank = nullptr;
        running.store(false, std::memory_order_release);
        return false;
    }
    auto next = std::make_shared<MeterBank>(MeterBankIdentity{previous + 1, 0, previous + 1}, channels);
    bank = std::move(next);
    audioBank = bank.get();
    epoch.store(previous + 1, std::memory_order_release);
    running.store(true, std::memory_order_release);
    return true;
}
void InputMeter::stop() noexcept {
    running.store(false, std::memory_order_release);
}
void InputMeter::process(const float* const* inputs, int channels, int frames, std::uint64_t startSample) noexcept {
    if (!audioBank || !running.load(std::memory_order_relaxed) || frames <= 0 || channels < 0) return;
    const auto count = std::min(audioBank->channels, static_cast<std::uint32_t>(channels));
    for (std::uint32_t channel = 0; channel < count; ++channel) {
        if (inputs && inputs[channel]) audioBank->tap(channel)->process({inputs[channel], static_cast<std::size_t>(frames)}, startSample);
    }
}
std::unique_ptr<MeterReadHandle> InputMeter::acquire(std::uint32_t expectedDeviceEpoch) {
    std::lock_guard lock(ownerMutex);
    if (!bank || bank->identity.deviceEpoch != expectedDeviceEpoch) return nullptr;
    return MeterReadHandle::acquire(bank, bank->identity);
}
}
