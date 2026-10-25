#pragma once
#include "meter_read_abi.h"
#include "meter_graph.h"
#include "input_meter.h"
struct zp_meter_read_handle {
    explicit zp_meter_read_handle(std::shared_ptr<zp::MeterGraphCollector> reader) : collector(std::move(reader)) {}
    explicit zp_meter_read_handle(std::shared_ptr<zp::InputMeterCollector> reader) : input(std::move(reader)) {}
    ~zp_meter_read_handle() { if(collector)collector->releaseHub();if(input)input->releaseHub(); }
    std::shared_ptr<zp::MeterGraphCollector> collector;
    std::shared_ptr<zp::InputMeterCollector> input;
    std::atomic_flag reading = ATOMIC_FLAG_INIT;
};
