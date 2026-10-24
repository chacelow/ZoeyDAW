#pragma once
#include "isolated_plugin_binding.h"
#include <tracktion_engine/tracktion_engine.h>
#include <tracktion_engine/playback/graph/tracktion_EditNodeBuilder.h>

namespace zp {
class IsolatedDevicePlugin final : public tracktion::Plugin {
public:
    static constexpr const char* xmlTypeName = "zoeydaw-isolated-device";
    IsolatedDevicePlugin(tracktion::PluginCreationInfo, std::shared_ptr<IsolatedPluginBinding>, juce::String name);
    juce::String getName() const override;
    juce::String getSelectableDescription() override;
    juce::String getPluginType() override;
    BusLayout getBusses() const override;
    int getNumOutputChannelsGivenInputs(int) override;
    bool takesMidiInput() override;
    bool isSynth() override;
    bool producesAudioWhenNoAudioInput() override;
    double getLatencySeconds() override;
    void setEnabled(bool) override;
    void configure(const Device&);
    bool matches(const ExternalSettings&) const;
    void initialise(const tracktion::PluginInitialisationInfo&) override;
    void deinitialise() override;
    void applyToBuffer(const tracktion::PluginRenderContext&) override;
    std::unique_ptr<tracktion::graph::Node> createNode(std::unique_ptr<tracktion::graph::Node>, const tracktion::CreateNodeParams&);
private:
    const std::shared_ptr<IsolatedPluginBinding> binding;
    const juce::String name;
    std::vector<ExternalParameter> manualParameters;
};
void configureIsolatedDeviceGraph(tracktion::CreateNodeParams&);
}
