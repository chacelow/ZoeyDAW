#pragma once
#include "playback_model.h"
#include <optional>
namespace zp {
struct AudioConfiguration {
    juce::String host, inputDeviceId, outputDeviceId;
    double sampleRate = 0;
    int bufferFrames = 0;
    std::vector<int> inputMono, inputStereo, outputMono, outputStereo;
    static AudioConfiguration decode(const V&);
    V value() const;
    juce::BigInteger inputMask() const;
    juce::BigInteger outputMask() const;
    bool outputEnabled(int first, int count) const;
    bool operator==(const AudioConfiguration&) const = default;
};
juce::String audioDeviceId(const juce::String& host, const juce::String& name);
juce::File audioConfigurationFile();
void requireAudioInputPermission(bool requestIfUndetermined);
struct AudioHardwareDefaults { double sampleRate; int bufferFrames; };
std::optional<AudioHardwareDefaults> audioHardwareDefaults(const juce::String& host, const juce::String& outputName);
}
