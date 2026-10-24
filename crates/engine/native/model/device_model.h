#pragma once
#include <juce_core/juce_core.h>
#include <span>
#include <variant>
#include <vector>

namespace zp {
struct UtilitySettings {
    float gainDb = 0, pan = 0, width = 100;
    bool operator==(const UtilitySettings&) const = default;
};
struct FilterSettings {
    float frequency = 1000, resonance = .2f;
    bool operator==(const FilterSettings&) const = default;
};
struct DelaySettings {
    float timeMs = 250, feedback = .35f, mix = .25f;
    bool operator==(const DelaySettings&) const = default;
};
struct ReverbSettings {
    float decay = 2.5f, size = .5f, mix = .25f;
    bool operator==(const ReverbSettings&) const = default;
};
using BuiltinSettings = std::variant<UtilitySettings, FilterSettings, DelaySettings, ReverbSettings>;
struct ExternalParameter {
    uint64_t id;
    double normalized;
    bool operator==(const ExternalParameter&) const = default;
};
struct ExternalSettings {
    juce::String catalogId, format, classId, name, vendor, version, role, stateHash, statePath;
    std::vector<ExternalParameter> parameters;
    bool operator==(const ExternalSettings&) const = default;
};
using DeviceSettings = std::variant<UtilitySettings, FilterSettings, DelaySettings, ReverbSettings, ExternalSettings>;
struct DeviceParameterSpec {
    const char* id;
    double minimum, maximum;
};
std::span<const DeviceParameterSpec> deviceParameters(const DeviceSettings&);
std::span<const DeviceParameterSpec> deviceParameters(const BuiltinSettings&);
BuiltinSettings builtinSettings(const DeviceSettings&);
struct Device {
    juce::String id;
    bool enabled = true;
    DeviceSettings settings;
};
std::vector<Device> decodeDevices(const juce::var&);
}
