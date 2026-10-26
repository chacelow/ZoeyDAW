#pragma once
#include <juce_audio_devices/juce_audio_devices.h>
#include <memory>

namespace zp::probe {
inline constexpr auto configurationHost="Zoeydaw Hosted Configuration";
inline constexpr auto configurationDevice="Hosted Stereo";
struct ConfigurationDriverState { bool reject96k=false; };
class ConfigurationDevice final : public juce::AudioIODevice {
public:
    explicit ConfigurationDevice(std::shared_ptr<ConfigurationDriverState> state)
        : AudioIODevice(configurationDevice,configurationHost),state(std::move(state)) {}
    ~ConfigurationDevice() override { close(); }
    juce::StringArray getOutputChannelNames() override { return {"Left","Right"}; }
    juce::StringArray getInputChannelNames() override { return {}; }
    juce::Array<double> getAvailableSampleRates() override { return {48000.0,96000.0}; }
    juce::Array<int> getAvailableBufferSizes() override { return {128,256,512}; }
    int getDefaultBufferSize() override { return 512; }
    juce::String open(const juce::BigInteger& inputs,const juce::BigInteger& outputs,double rate,int frames) override {
        close();
        if(state->reject96k && rate==96000)return "Injected hosted driver format failure";
        if(!inputs.isZero() || !getAvailableSampleRates().contains(rate) || !getAvailableBufferSizes().contains(frames))return "Unsupported hosted format";
        input=inputs;output=outputs;sampleRate=rate;bufferFrames=frames;opened=true;return {};
    }
    void close() override { stop();opened=false; }
    bool isOpen() override { return opened; }
    void start(juce::AudioIODeviceCallback* next) override {
        stop();callback=next;if(callback)callback->audioDeviceAboutToStart(this);
    }
    void stop() override {
        if(auto* previous=callback) { callback=nullptr;previous->audioDeviceStopped(); }
    }
    bool isPlaying() override { return callback!=nullptr; }
    juce::String getLastError() override { return {}; }
    int getCurrentBufferSizeSamples() override { return bufferFrames; }
    double getCurrentSampleRate() override { return sampleRate; }
    int getCurrentBitDepth() override { return 32; }
    juce::BigInteger getActiveOutputChannels() const override { return output; }
    juce::BigInteger getActiveInputChannels() const override { return input; }
    int getOutputLatencyInSamples() override { return 0; }
    int getInputLatencyInSamples() override { return 0; }
private:
    const std::shared_ptr<ConfigurationDriverState> state;
    juce::AudioIODeviceCallback* callback=nullptr;
    juce::BigInteger input,output;
    double sampleRate=48000;
    int bufferFrames=512;
    bool opened=false;
};
class ConfigurationDeviceType final : public juce::AudioIODeviceType {
public:
    explicit ConfigurationDeviceType(std::shared_ptr<ConfigurationDriverState> state)
        : AudioIODeviceType(configurationHost),state(std::move(state)) {}
    void scanForDevices() override {}
    juce::StringArray getDeviceNames(bool input=false) const override { return input?juce::StringArray():juce::StringArray{configurationDevice}; }
    int getDefaultDeviceIndex(bool input) const override { return input?-1:0; }
    int getIndexOfDevice(juce::AudioIODevice* device,bool input) const override { return !input && device && device->getTypeName()==configurationHost?0:-1; }
    bool hasSeparateInputsAndOutputs() const override { return true; }
    juce::AudioIODevice* createDevice(const juce::String& output,const juce::String& input) override {
        return output==configurationDevice && input.isEmpty()?new ConfigurationDevice(state):nullptr;
    }
private:
    const std::shared_ptr<ConfigurationDriverState> state;
};
}
