#pragma once
#include "transport_clock.h"
#include <atomic>
#include <cstdint>
#include <functional>
#include <memory>
namespace tracktion::inline graph { class Node; }
namespace tracktion::inline engine { struct ProcessState; }
namespace zp {
struct MeterClockBank;
std::unique_ptr<tracktion::graph::Node> createTransportClockObserver(
    std::unique_ptr<tracktion::graph::Node>,std::shared_ptr<MeterClockBank>,
    tracktion::engine::ProcessState&,const std::atomic<std::uint64_t>&,
    MeterControlSource,std::function<double()> audiblePosition);
}
