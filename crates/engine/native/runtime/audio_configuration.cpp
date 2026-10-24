#include "audio_configuration.h"
#include <algorithm>
#include <limits>
namespace zp {
namespace {
juce::String nullableId(const V& v,const char* key) {
    const auto& value=field(v,key);
    require(value.isVoid() || (value.isString() && value.toString().isNotEmpty()),juce::String("Invalid ")+key);
    return value.isVoid()?juce::String():value.toString();
}
std::vector<int> channels(const V& v,const char* key) {
    std::vector<int> result;
    for(const auto& value:array(v,key)) {
        require(value.isInt() || value.isInt64() || value.isDouble(),juce::String("Invalid channel in ")+key);
        const double n=(double)value;
        require(std::isfinite(n) && n>=0 && n<=65535 && n==std::floor(n),juce::String("Invalid channel in ")+key);
        require(std::find(result.begin(),result.end(),(int)n)==result.end(),juce::String("Duplicate channel in ")+key);
        result.push_back((int)n);
    }
    std::sort(result.begin(),result.end());
    return result;
}
V list(const std::vector<int>& values) { juce::Array<V> out;for(int value:values)out.add(value);return out; }
juce::BigInteger mask(const std::vector<int>& mono,const std::vector<int>& stereo) {
    juce::BigInteger bits;for(int channel:mono)bits.setBit(channel);for(int channel:stereo)bits.setRange(channel,2,true);return bits;
}
}
juce::String audioDeviceId(const juce::String& host,const juce::String& name) { return host+"::"+name; }
juce::File audioConfigurationFile() {
    auto overridePath=juce::SystemStats::getEnvironmentVariable("ZOEYDAW_AUDIO_CONFIG_PATH",{});
    return overridePath.isNotEmpty()?juce::File(overridePath):juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory).getChildFile("Zoeydaw/audio-device.json");
}
AudioConfiguration AudioConfiguration::decode(const V& v) {
    fields(v,{"host","inputDeviceId","outputDeviceId","sampleRate","bufferFrames","inputMono","inputStereo","outputMono","outputStereo"});
    AudioConfiguration config;config.host=text(v,"host");require(config.host.isNotEmpty(),"Missing audio host");
    config.inputDeviceId=nullableId(v,"inputDeviceId");config.outputDeviceId=nullableId(v,"outputDeviceId");
    require(config.outputDeviceId.isNotEmpty(),"An audio output device is required");
    config.sampleRate=number(v,"sampleRate",1,std::numeric_limits<int>::max());
    const auto frames=integer(v,"bufferFrames");require(frames>0 && frames<=std::numeric_limits<int>::max(),"Invalid audio buffer size");config.bufferFrames=(int)frames;
    config.inputMono=channels(v,"inputMono");config.inputStereo=channels(v,"inputStereo");config.outputMono=channels(v,"outputMono");config.outputStereo=channels(v,"outputStereo");
    require(config.inputDeviceId.isNotEmpty() || (config.inputMono.empty() && config.inputStereo.empty()),"Input channels require an input device");
    require(!config.outputMask().isZero(),"At least one audio output channel must be enabled");
    return config;
}
V AudioConfiguration::value() const {
    auto out=object();put(out,"host",host);put(out,"inputDeviceId",inputDeviceId.isEmpty()?V():V(inputDeviceId));put(out,"outputDeviceId",outputDeviceId.isEmpty()?V():V(outputDeviceId));put(out,"sampleRate",sampleRate);put(out,"bufferFrames",bufferFrames);
    put(out,"inputMono",list(inputMono));put(out,"inputStereo",list(inputStereo));put(out,"outputMono",list(outputMono));put(out,"outputStereo",list(outputStereo));return out;
}
juce::BigInteger AudioConfiguration::inputMask() const { return mask(inputMono,inputStereo); }
juce::BigInteger AudioConfiguration::outputMask() const { return mask(outputMono,outputStereo); }
bool AudioConfiguration::outputEnabled(int first,int count) const {
    const auto& values=count==1?outputMono:outputStereo;
    return (count==1 || count==2) && std::find(values.begin(),values.end(),first)!=values.end();
}
#if !JUCE_MAC
void requireAudioInputPermission(bool requestIfUndetermined) {
    juce::ignoreUnused(requestIfUndetermined);
}
std::optional<AudioHardwareDefaults> audioHardwareDefaults(const juce::String&,const juce::String&) { return {}; }
#endif
}
