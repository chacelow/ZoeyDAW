#include "realtime_snapshot.h"
#include "realtime_protocol.generated.h"
#include <atomic>
#include <cstdint>
#include <iostream>
#include <thread>

struct Snapshot {
    std::uint64_t sequence = 0;
    std::uint64_t inverse = 0;
    std::uint64_t lanes[8] {};
};
int main() {
    zp::RealtimeSnapshot<Snapshot> mailbox;
    Snapshot latest;
    if (mailbox.readLatest(latest)) return 1;
    constexpr std::uint64_t count = 1000000;
    std::atomic<bool> finished {false};
    std::thread writer([&] {
        for (std::uint64_t sequence = 1; sequence <= count; ++sequence) {
            Snapshot value;
            value.sequence = sequence;
            value.inverse = ~sequence;
            for (unsigned lane = 0; lane < 8; ++lane) value.lanes[lane] = sequence + lane;
            mailbox.publish(value);
        }
        finished.store(true, std::memory_order_release);
    });
    bool valid = true;
    std::uint64_t previous = 0, observations = 0;
    do {
        if (!mailbox.readLatest(latest)) continue;
        valid = valid && latest.sequence > previous && latest.inverse == ~latest.sequence;
        for (unsigned lane = 0; lane < 8; ++lane) valid = valid && latest.lanes[lane] == latest.sequence + lane;
        previous = latest.sequence;
        ++observations;
    } while (!finished.load(std::memory_order_acquire) || previous != count);
    writer.join();
    if (!valid || mailbox.readLatest(latest)) return 2;
    static_assert(zp::realtime::wire::HEADER_BYTES == 128);
    static_assert(zp::realtime::wire::RECORD_BYTES == 48);
    static_assert(zp::realtime::wire::SOURCE_BYTES == 48);
    std::cout << "Coherent snapshots: " << observations << "; final sequence: " << previous << '\n';
}
