#include "meter_bank.h"
#include <array>
#include <atomic>
#include <cmath>
#include <iostream>
#include <thread>
#include <cstdlib>
#include <new>

thread_local bool checkingAudioAllocations = false;
std::atomic<std::uint64_t> audioAllocations {0};
void* operator new(std::size_t size) {
    if (checkingAudioAllocations) audioAllocations.fetch_add(1, std::memory_order_relaxed);
    if (auto* result = std::malloc(size ? size : 1)) return result;
    throw std::bad_alloc();
}
void operator delete(void* value) noexcept { std::free(value); }
void* operator new[](std::size_t size) { return ::operator new(size); }
void operator delete[](void* value) noexcept { ::operator delete(value); }

int main() {
    constexpr std::uint64_t blocks = 100000, blockSize = 32;
    auto bank = std::make_shared<zp::MeterBank>(zp::MeterBankIdentity{1, 1, 1}, 1);
    auto reader = zp::MeterReadHandle::acquire(bank, bank->identity);
    std::atomic<bool> finished {false};
    std::thread audio([&] {
        std::array<float, blockSize> samples;
        samples.fill(.25f);
        checkingAudioAllocations = true;
        for (std::uint64_t block = 0; block < blocks; ++block) bank->tap(0)->process(samples, block * blockSize);
        finished.store(true, std::memory_order_release);
        checkingAudioAllocations = false;
    });
    std::uint64_t epoch = 0, counted = 0, total = 0;
    double energy = 0, totalEnergy = 0;
    bool valid = true;
    const auto consume = [&](const zp::MeterEpoch& value) {
        if (value.id < epoch) return;
        if (value.id != epoch) {
            valid = valid && (epoch == 0 || value.id == epoch + 1);
            epoch = value.id;
            counted = 0;
            energy = 0;
        }
        valid = valid && value.count >= counted && value.sumSquares >= energy;
        total += value.count - counted;
        totalEnergy += value.sumSquares - energy;
        counted = value.count;
        energy = value.sumSquares;
    };
    zp::MeterPublication result;
    do {
        if (!reader->read(0, result)) continue;
        if (result.completedValid) consume(result.completed);
        consume(result.current);
    } while (!finished.load(std::memory_order_acquire) || total < blocks * blockSize);
    audio.join();
    valid = valid && total == blocks * blockSize && std::abs(totalEnergy - total * .0625) < 1e-9;
    valid = valid && audioAllocations.load(std::memory_order_relaxed) == 0;
    if (!valid) return 1;
    std::cout << "Conserved " << total << " samples and " << totalEnergy << " squared energy across " << epoch << " epochs\n";
}
