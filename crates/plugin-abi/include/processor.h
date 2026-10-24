#pragma once
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    uint32_t offset;
    uint32_t port;
    uint8_t bytes[3];
    uint8_t reserved;
} zd_plugin_midi;

typedef struct {
    uint32_t slot;
    uint32_t offset;
    uint64_t parameter;
    double value;
} zd_plugin_automation;

typedef struct {
    int64_t sample_position;
    double beat_position;
    double tempo;
    double bar_start;
    int32_t bar_number;
    uint16_t numerator;
    uint16_t denominator;
    uint32_t flags;
    double loop_start;
    double loop_end;
    int64_t loop_sample_start;
    int64_t loop_sample_end;
} zd_plugin_transport;

typedef struct {
    const float* const* inputs;
    float* const* outputs;
    const zd_plugin_midi* midi;
    const zd_plugin_automation* automation;
    zd_plugin_midi* produced;
    const zd_plugin_transport* transport;
    uint32_t frames;
    uint32_t input_channels;
    uint32_t output_channels;
    uint32_t midi_count;
    uint32_t automation_count;
    uint32_t produced_capacity;
    uint32_t produced_count;
} zd_plugin_block;

/* One audio caller. Owner and all buffers remain alive until the call returns.
   Channel buffers are disjoint; outputs never alias inputs or event storage.
   Status: 0 buffered, 1 processed, 2 fallback, -1 format, -2 capacity,
   -3 event, -4 transport, -5 processing, -6 unsupported output event, -7 concurrent entry.
   Transport flags: bit0 playing, bit1 beat, bit2 tempo, bit3 bar, bit4 meter, bit5 loop. */
typedef int32_t (*zd_plugin_process)(void*, zd_plugin_block*);
typedef struct {
    void* context;
    zd_plugin_process process;
} zd_plugin_callback;

/* Ownership transfers once, including failed admission. Release on the control thread
   only after all graph references retire; never copy an owning descriptor. */
typedef struct {
    void* context;
    zd_plugin_process process;
    void (*release)(void*);
} zd_plugin_owned_processor;

typedef struct {
    const char* device_id;
    zd_plugin_owned_processor processor;
    double sample_rate;
    uint32_t quantum, input_channels, output_channels, latency_frames;
} zd_plugin_prepared;

#ifdef __cplusplus
}
#endif
