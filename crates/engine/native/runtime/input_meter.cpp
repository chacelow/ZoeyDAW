#include "input_meter.h"
#include <algorithm>
#include <limits>
#include <stdexcept>

namespace zp {
InputMeterCollector::InputMeterCollector(std::shared_ptr<MeterBank> state)
    : bank(std::move(state)),reader(MeterReadHandle::acquire(bank,bank->identity)),
      cache(bank->channels),received(bank->channels,false),resetEpochs(bank->channels,0) {
    if(!reader)throw std::logic_error("Input meter already has a consumer");
}
void InputMeterCollector::collect() {
    const std::lock_guard lock(cacheMutex);
    for(std::uint32_t channel=0;channel<bank->channels;++channel)
        if(reader->read(channel,cache[channel]))received[channel]=true;
}
bool InputMeterCollector::copyLatest(std::uint32_t channel,MeterPublication& result) {
    const std::lock_guard lock(cacheMutex);
    if(channel>=cache.size() || !received[channel])return false;
    result=cache[channel];return true;
}
bool InputMeterCollector::requestReset(std::span<const std::uint32_t> channels,std::uint32_t epoch,MeterReset kind) {
    const std::lock_guard lock(cacheMutex);
    if(epoch==0 || (kind!=MeterReset::hold && kind!=MeterReset::clip && kind!=MeterReset::all))return false;
    for(std::size_t index=0;index<channels.size();++index) {
        const auto channel=channels[index];
        if(channel>=resetEpochs.size() || epoch<=resetEpochs[channel])return false;
        for(std::size_t prior=0;prior<index;++prior)if(channels[prior]==channel)return false;
    }
    for(const auto channel:channels) {
        if(!bank->tap(channel)->requestReset(epoch,kind))return false;
        resetEpochs[channel]=epoch;
    }
    return true;
}
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
std::shared_ptr<InputMeterCollector> InputMeter::collector(std::uint32_t expectedDeviceEpoch) {
    const std::lock_guard lock(ownerMutex);
    if(!bank || bank->identity.deviceEpoch!=expectedDeviceEpoch)return {};
    if(!collected || collected->bank!=bank)collected=std::make_shared<InputMeterCollector>(bank);
    return collected;
}
}
