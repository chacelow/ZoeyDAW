#pragma once
#include <stdint.h>

typedef struct zp_waveform_cancellation {
    const void* context;
    int32_t (*is_cancelled)(const void*);
} zp_waveform_cancellation;
