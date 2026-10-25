#pragma once
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
typedef struct zp_meter_read_handle zp_meter_read_handle;
typedef struct zp_meter_epoch {
    uint64_t id, start_sample, end_sample, frames, clip_count;
    double sum_squares;
    float peak, display_peak;
    uint32_t hold_reset_epoch, valid;
} zp_meter_epoch;
typedef struct zp_meter_publication {
    zp_meter_epoch completed, current;
    float session_peak;
    uint32_t completed_valid;
    uint64_t clip_count;
    uint32_t slot_reset_epoch, hold_reset_epoch, available, reserved;
} zp_meter_publication;
typedef struct zp_meter_clock {
    uint64_t reference_sample, device_sample;
    int64_t timeline_sample;
    double timeline_beat, tempo_bpm;
    uint32_t frames, playing;
} zp_meter_clock;
/* One serialized non-audio Hub reader per handle. Release only off the audio thread. */
uint32_t zp_meter_read(zp_meter_read_handle*, const uint32_t* slots, uint32_t count,
                       zp_meter_publication* output, uint32_t capacity);
uint32_t zp_meter_reset(zp_meter_read_handle*,const uint32_t* slots,uint32_t count,uint32_t epoch,uint32_t kind);
uint32_t zp_meter_read_clock(zp_meter_read_handle*,zp_meter_clock*);
uint32_t zp_meter_read_sources(zp_meter_read_handle*,uint64_t device_sample,double device_rate,uint32_t arrangement_playing,
                              void* output,uint32_t capacity);
void zp_meter_release(zp_meter_read_handle*);
#ifdef __cplusplus
}
#endif
