#pragma once
#include "playback_model.h"
#include "waveform_cancellation.h"
#include "waveform_response.h"
namespace zp {
V waveform(const juce::String&, uint32_t, const zp_waveform_cancellation&);
void waveformRange(const juce::String&, uint64_t startFrame, uint64_t frameCount, uint32_t columns, uint32_t framesPerBin, const zp_waveform_cancellation&, void* context, zp_waveform_allocate);
V analyzeTempo(const juce::String&);
}
