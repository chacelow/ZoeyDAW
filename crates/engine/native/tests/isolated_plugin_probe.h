#pragma once
#include "engine_session.h"
#include "isolated_device_plugin.h"

#if defined(_WIN32)
#define ZD_PROBE_EXPORT __declspec(dllexport)
#else
#define ZD_PROBE_EXPORT __attribute__((visibility("default")))
#endif

namespace zp {
struct MixerTestAccess {
    static tracktion::Edit& edit(EngineSession& session) { return *session.arrangement->edit; }
    static void configure(EngineSession& session,tracktion::CreateNodeParams& params) { session.configureMeterGraph(edit(session),params); }
    static tracktion::Plugin::Ptr device(EngineSession& session,const char* id) { return session.arrangement->devices.at(id); }
    static void addDeviceType(EngineSession& session,std::unique_ptr<juce::AudioIODeviceType> type) {
        auto& manager=session.engine.getDeviceManager().deviceManager;
        manager.getAvailableDeviceTypes();manager.addAudioDeviceType(std::move(type));
    }
    static juce::AudioIODevice* audioDevice(EngineSession& session) { return session.engine.getDeviceManager().deviceManager.getCurrentAudioDevice(); }
    static void dispatchDevices(EngineSession& session) { session.engine.getDeviceManager().dispatchPendingUpdates(); }
};
namespace probe {
class ConstantSignal final : public tracktion::graph::Node {
public:
    tracktion::graph::NodeProperties getNodeProperties() override { return {true,false,2,0,0}; }
    bool isReadyToProcess() override { return true; }
private:
    void process(ProcessContext& context) override {
        for(unsigned channel=0;channel<2;++channel)
            for(unsigned sample=0;sample<context.numSamples;++sample)context.buffers.audio.getSample(channel,sample)=.5f;
    }
};
}
}
