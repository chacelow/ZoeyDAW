#include "meter_read.h"
#include <cstddef>
static_assert(sizeof(zp_meter_epoch)==64 && alignof(zp_meter_epoch)==8);
static_assert(sizeof(zp_meter_publication)==160 && alignof(zp_meter_publication)==8);
static_assert(offsetof(zp_meter_publication,current)==64 && offsetof(zp_meter_publication,clip_count)==136);
static_assert(sizeof(zp_meter_clock)==120 && alignof(zp_meter_clock)==8);
static_assert(sizeof(zp_stopped_clock)==40 && alignof(zp_stopped_clock)==8);
namespace {
zp_meter_epoch epoch(const zp::MeterEpoch& value) noexcept {
    return {value.id,value.startSample,value.endSample,value.count,value.clipCount,value.sumSquares,
            value.peak,value.displayPeak,value.holdResetEpoch,value.valid?1u:0u};
}
}
extern "C" uint32_t zp_meter_read(zp_meter_read_handle* handle,const uint32_t* slots,uint32_t count,
                                  zp_meter_publication* output,uint32_t capacity) {
    if(!handle || capacity<count || (count && (!slots || !output)))return 0;
    if(handle->reading.test_and_set(std::memory_order_acquire))return 0;
    struct Release { std::atomic_flag& flag;~Release(){flag.clear(std::memory_order_release);} } release{handle->reading};
    try {
        uint64_t available=handle->input?handle->input->bank->channels:0;
        if(handle->collector)for(const auto& endpoint:handle->collector->description()->endpoints())available+=endpoint.channelCount;
        for(uint32_t index=0;index<count;++index)if(slots[index]>=available)return 0;
        if(handle->input)handle->input->collect();else if(handle->collector)handle->collector->collect();
        for(uint32_t index=0;index<count;++index) {
            zp::MeterPublication publication;
            const bool found=handle->input?handle->input->copyLatest(slots[index],publication):handle->collector->copyLatest(slots[index],publication);
            if(!found)output[index]={};
            else output[index]={epoch(publication.completed),epoch(publication.current),publication.sessionPeak,
                publication.completedValid?1u:0u,publication.sessionClipCount,publication.slotResetEpoch,
                publication.holdResetEpoch,publication.available?1u:0u,0};
        }
        return count;
    } catch(...) { return 0; }
}
extern "C" void zp_meter_release(zp_meter_read_handle* handle) { delete handle; }
extern "C" uint32_t zp_meter_reset(zp_meter_read_handle* handle,const uint32_t* slots,uint32_t count,uint32_t epoch,uint32_t kind) {
    if(!handle || (!handle->input && !handle->collector) || (count && !slots) || handle->reading.test_and_set(std::memory_order_acquire))return 0;
    struct Release { std::atomic_flag& flag;~Release(){flag.clear(std::memory_order_release);} } release{handle->reading};
    try {
        const auto reset=static_cast<zp::MeterReset>(kind);
        return (handle->input?handle->input->requestReset({slots,count},epoch,reset):handle->collector->requestReset({slots,count},epoch,reset))?1u:0u;
    }
    catch(...) { return 0; }
}
extern "C" uint32_t zp_meter_read_clock(zp_meter_read_handle* handle,zp_meter_clock* output) {
    if(!handle || !handle->collector || !output || handle->reading.test_and_set(std::memory_order_acquire))return 0;
    struct Release { std::atomic_flag& flag;~Release(){flag.clear(std::memory_order_release);} } release{handle->reading};
    try {
        zp::MeterClockObservation value;
        if(!handle->collector->readClock(value))return 0;
        *output={value.referenceSample,value.deviceSample,value.timelineSample,value.timelineBeat,value.tempoBpm,value.frames,value.playing,
                 value.controlGeneration,value.appliedSequence,value.bar,value.barsPerSecond,value.ownerEpoch,value.controlValid,value.recording,
                 value.audibleBar,value.audibleBarsPerSecond,value.audibleValid,value.reserved};
        return 1;
    } catch(...) { return 0; }
}
extern "C" uint32_t zp_meter_read_stopped_clock(zp_meter_read_handle* handle,zp_stopped_clock* output) {
    if(!handle || !handle->stoppedState || !output || handle->reading.test_and_set(std::memory_order_acquire))return 0;
    struct Release { std::atomic_flag& flag;~Release(){flag.clear(std::memory_order_release);} } release{handle->reading};
    const auto value=handle->stoppedState->readStopped(handle->stoppedOwner);
    if(!value)return 0;
    *output={value->ownerEpoch,value->controlGeneration,value->appliedSequence,value->bar,value->barsPerSecond};
    return 1;
}
extern "C" uint32_t zp_meter_read_sources(zp_meter_read_handle* handle,uint64_t reference,uint64_t sample,double rate,uint32_t playing,
                                          void* output,uint32_t capacity) {
    if(!handle || !handle->sources || (capacity && !output)
       || handle->reading.test_and_set(std::memory_order_acquire))return 0;
    struct Release { std::atomic_flag& flag;~Release(){flag.clear(std::memory_order_release);} } release{handle->reading};
    return handle->sources->read(handle->session,handle->collector?handle->collector->description()->identity.generation:handle->sourceGeneration,
                                 reference,sample,rate,playing==1,{static_cast<zp::realtime::wire::WireSource*>(output),capacity});
}
