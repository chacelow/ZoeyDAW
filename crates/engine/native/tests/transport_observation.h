#pragma once
#include "playback_bridge.h"
#include "playback_model.h"
#include <memory>

inline zp::V observeNativeTransport(zp_session* session,const char* lease,const char* owner) {
    auto query=zp::object();zp::put(query,"leaseId",lease);zp::put(query,"sessionId",owner);
    const auto json=juce::JSON::toString(query).toStdString();
    std::unique_ptr<char,decltype(&zp_free)> response(zp_call(session,"meter_registry",json.c_str()),zp_free);
    zp::require(response!=nullptr,"Missing native transport registry response");
    const auto envelope=zp::parse(response.get());zp::require((bool)envelope["ok"],"Native transport registry rejected owner");
    const auto registry=envelope["value"],graph=registry["graph"];
    auto output=zp::object(),clock=zp::object();zp::put(output,"sessionId",registry["sessionId"]);
    std::unique_ptr<zp_meter_read_handle,decltype(&zp_meter_release)> reader(nullptr,zp_meter_release);
    if(graph["kind"].toString()=="prepared") {
        reader.reset(zp_meter_acquire(session,lease,owner,(uint32_t)(int)registry["deviceEpoch"],(uint32_t)(int)registry["generation"],(uint32_t)(int)registry["registryRevision"]));
        zp_meter_clock value{};zp::require(reader && zp_meter_read_clock(reader.get(),&value)==1,"Native audio clock is not ready");
        zp::require(value.control_valid==1,"Audio clock has no adopted control identity");
        zp::put(output,"appliedSequence",(juce::int64)value.applied_sequence);zp::put(output,"controlGeneration",zp::decimalU64(value.control_generation));
        zp::put(output,"playing",value.playing==1);zp::put(output,"recording",value.recording==1);
        zp::put(clock,"kind","sample");zp::put(clock,"frame",(juce::int64)value.device_sample);zp::put(clock,"sampleRate",graph["sampleRate"]);
        zp::put(clock,"bar",value.audible_valid?value.audible_bar:value.bar);zp::put(clock,"barsPerSecond",value.audible_valid?value.audible_bars_per_second:value.bars_per_second);
    } else {
        const auto epoch=std::stoull(graph["ownerEpoch"].toString().toStdString());
        reader.reset(zp_idle_meter_acquire(session,lease,owner,epoch));zp_stopped_clock value{};
        zp::require(reader && zp_meter_read_stopped_clock(reader.get(),&value)==1,"Native stopped clock is not ready");
        zp::put(output,"appliedSequence",(juce::int64)value.applied_sequence);zp::put(output,"controlGeneration",zp::decimalU64(value.control_generation));
        zp::put(output,"playing",false);zp::put(output,"recording",false);
        zp::put(clock,"kind","musical");zp::put(clock,"bar",value.bar);zp::put(clock,"barsPerSecond",value.bars_per_second);
    }
    zp::put(output,"clock",clock);return output;
}
