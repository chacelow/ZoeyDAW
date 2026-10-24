#pragma once
#include <array>
#include <atomic>
#include <type_traits>

namespace zp {
template <typename T>
class RealtimeSnapshot final {
    static_assert(std::is_trivially_copyable_v<T>);
    static_assert(std::atomic<unsigned>::is_always_lock_free);
public:
    void publish(const T& value) noexcept {
        slots[writeSlot] = value;
        writeSlot = published.exchange(writeSlot | dirty, std::memory_order_acq_rel) & indexMask;
    }

    bool readLatest(T& value) noexcept {
        if (!(published.load(std::memory_order_acquire) & dirty)) return false;
        readSlot = published.exchange(readSlot, std::memory_order_acq_rel) & indexMask;
        value = slots[readSlot];
        return true;
    }
private:
    // Producer and consumer retain disjoint slots until the exchange transfers ownership.
    static constexpr unsigned dirty = 4, indexMask = 3;
    std::array<T, 3> slots {};
    std::atomic<unsigned> published {2};
    unsigned writeSlot = 1, readSlot = 0;
};
}
