#pragma once
#include "playback_model.h"
namespace zp {
V waveform(const juce::String&, uint32_t, uint64_t);
V waveformRange(const juce::String&, uint64_t startFrame, uint64_t frameCount, uint32_t columns, uint32_t framesPerBin, uint64_t generation);
void waveformRangeFence(uint64_t);
V analyzeTempo(const juce::String&);
void waveformFence(uint64_t);
}
