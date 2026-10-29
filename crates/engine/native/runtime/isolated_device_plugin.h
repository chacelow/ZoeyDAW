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
    bool setEditorAuthority(std::uintptr_t context, uint64_t instance, bool active);
    bool canRecover(std::uintptr_t context) const noexcept;
    bool retainsFormat(double rate,uint32_t quantum) const noexcept { return binding->format.sampleRate==rate && binding->format.quantum==quantum; }
    std::uintptr_t processorContext() const noexcept { return binding->context(); }
    bool editorOwnsParameters() const noexcept { return binding->editorActive.load(std::memory_order_acquire); }
    void updateAutomation();
    uint64_t automatedParameters(size_t word) const noexcept { return automationMasks[word].load(std::memory_order_acquire); }
    uint64_t processingCallbacks() const noexcept { return binding->callbacks.load(std::memory_order_acquire); }
    uint64_t processCalls() const noexcept { return binding->processCalls.load(std::memory_order_acquire); }
    uint64_t formatMismatches() const noexcept { return binding->formatMismatches.load(std::memory_order_acquire); }
    int32_t processingStatus() const noexcept { return binding->status.load(std::memory_order_acquire); }
    uint64_t graphNodes() const noexcept { return graphNodeCreations.load(std::memory_order_acquire); }
    uint64_t graphFactoryCalls() const noexcept { return graphFactoryInvocations.load(std::memory_order_acquire); }
    void recordGraphFactoryCall() noexcept { graphFactoryInvocations.fetch_add(1,std::memory_order_relaxed); }
    double observedSampleRate() const noexcept { return binding->observedSampleRate.load(std::memory_order_acquire); }
    uint32_t observedBlockSize() const noexcept { return binding->observedBlockSize.load(std::memory_order_acquire); }
    void initialise(const tracktion::PluginInitialisationInfo&) override;
    void deinitialise() override;
    void applyToBuffer(const tracktion::PluginRenderContext&) override;
    std::unique_ptr<tracktion::graph::Node> createNode(std::unique_ptr<tracktion::graph::Node>, const tracktion::CreateNodeParams&);
private:
    std::atomic<uint64_t> graphNodeCreations {0};
    std::atomic<uint64_t> graphFactoryInvocations {0};
    const std::shared_ptr<IsolatedPluginBinding> binding;
    const juce::String name;
    std::vector<ExternalParameter> manualParameters;
    std::array<std::atomic<uint64_t>,64> automationMasks {};
    void publishManualParameters();
};
void configureIsolatedDeviceGraph(tracktion::CreateNodeParams&);
}
