#pragma once
#include "device_model.h"
#include "realtime_snapshot.h"
#include <tracktion_engine/tracktion_engine.h>
#include <array>
#include <atomic>
#include <memory>

namespace zp {
class BuiltinDevice final : public tracktion::Plugin {
public:
    static constexpr const char* xmlTypeName = "zoeydaw-builtin-device";
    explicit BuiltinDevice(tracktion::PluginCreationInfo);
    ~BuiltinDevice() override;
    void configure(const Device&);
    void setAutomationMask(uint32_t) noexcept;
    const char* getDeviceKind() const noexcept;
    juce::String getName() const override;
    juce::String getSelectableDescription() override;
    juce::String getPluginType() override;
    BusLayout getBusses() const override;
    int getNumOutputChannelsGivenInputs(int) override;
    bool takesMidiInput() override;
    bool producesAudioWhenNoAudioInput() override;
    double getTailLength() const override;
    bool noTail() override;
    void initialise(const tracktion::PluginInitialisationInfo&) override;
    void deinitialise() override;
    void reset() override;
    void applyToBuffer(const tracktion::PluginRenderContext&) override;
private:
    struct Parameters { bool enabled = true; BuiltinSettings settings; };
    struct DspState;
    const size_t kind;
    RealtimeSnapshot<Parameters> parameters;
    Parameters current;
    BuiltinSettings controlSettings, effectiveSettings;
    std::array<tracktion::AutomatableParameter*, 3> settingParameters {};
    std::atomic<uint32_t> automationMask {0};
    bool haveEffectiveSettings = false;
    std::unique_ptr<DspState> dsp;
    std::atomic<uint64_t> resetGeneration {0};
    std::atomic<double> tailSeconds {0};
    uint64_t appliedResetGeneration = 0;
    void adoptParameters(bool immediate);
    void clearHistory() noexcept;
};
}
