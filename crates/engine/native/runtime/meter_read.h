#pragma once
#include "meter_read_abi.h"
#include "meter_graph.h"
#include "input_meter.h"
#include "source_observations.h"
struct zp_meter_read_handle {
    zp_meter_read_handle(std::shared_ptr<zp::MeterGraphCollector> reader,
                         std::shared_ptr<zp::SourceObservationState> sources, juce::String owner)
        : collector(std::move(reader)), sources(std::move(sources)), session(std::move(owner)) {}
    explicit zp_meter_read_handle(std::shared_ptr<zp::InputMeterCollector> reader) : input(std::move(reader)) {}
    zp_meter_read_handle(std::shared_ptr<const zp::TransportClockState> state,std::uint64_t owner)
        : stoppedState(std::move(state)),stoppedOwner(owner) {}
    ~zp_meter_read_handle() { if(collector)collector->releaseHub();if(input)input->releaseHub(); }
    std::shared_ptr<zp::MeterGraphCollector> collector;
    std::shared_ptr<zp::InputMeterCollector> input;
    std::shared_ptr<zp::SourceObservationState> sources;
    std::shared_ptr<const zp::TransportClockState> stoppedState;
    std::uint64_t stoppedOwner=0;
    juce::String session;
    std::atomic_flag reading = ATOMIC_FLAG_INIT;
};
