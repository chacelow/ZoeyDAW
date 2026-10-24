#include "input_meter.h"
#include <array>
#include <iostream>
#include <stdexcept>

void require(bool condition, const char* message) { if (!condition) throw std::runtime_error(message); }
int main() {
    try {
        zp::InputMeter input;
        require(!input.active() && !input.acquire(0), "Unprepared input acquired");
        require(input.prepare(2), "Input preparation failed");
        const auto firstEpoch = input.deviceEpoch();
        auto reader = input.acquire(firstEpoch);
        require(reader != nullptr, "Input reader unavailable");
        std::array<float, 128> left, right;
        left.fill(.25f); right.fill(.5f);
        const float* channels[] = {left.data(), right.data()};
        input.process(channels, 2, 128, 0);
        zp::MeterPublication value;
        require(reader->read(0, value) && value.current.peak == .25f, "Stopped-transport input peak missing");
        require(reader->read(1, value) && value.current.peak == .5f, "Input channels mixed");
        auto unrelatedGraph = std::make_shared<zp::MeterBank>(zp::MeterBankIdentity{firstEpoch, 17, 18}, 2);
        unrelatedGraph.reset();
        input.process(channels, 2, 128, 128);
        require(reader->read(0, value) && value.sessionPeak == .25f && input.deviceEpoch() == firstEpoch, "Graph change reset input history");
        input.process(channels, 2, 128, 256);
        input.stop();
        require(!input.active(), "Stopped device remains active");
        require(input.prepare(1), "Input reprepare failed");
        require(input.deviceEpoch() == firstEpoch + 1 && !input.acquire(firstEpoch), "Old device epoch acquired new lanes");
        require(reader->read(0, value) && value.current.endSample == 384, "Retired device bank reclaimed before reader");
        auto next = input.acquire(input.deviceEpoch());
        input.process(channels, 1, 128, 384);
        require(next && next->read(0, value) && value.current.count == 128 && value.sessionPeak == .25f, "New device inherited old statistics");
        input.stop();
        input.process(channels, 1, 128, 512);
        require(!next->read(0, value), "Stopped device fabricated new samples");
        std::cout << "Input channels, stopped transport, graph independence and device epoch retirement passed\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
