#include "audio_configuration.h"
#import <AVFoundation/AVFoundation.h>
#import <Foundation/Foundation.h>
#import <CoreAudio/CoreAudio.h>
namespace zp {
std::optional<AudioHardwareDefaults> audioHardwareDefaults(const juce::String& host,const juce::String& outputName) {
    if(host!="CoreAudio" || outputName.isEmpty())return {};
    AudioObjectPropertyAddress property{kAudioHardwarePropertyDevices,kAudioObjectPropertyScopeGlobal,kAudioObjectPropertyElementMain};UInt32 size=0;
    if(AudioObjectGetPropertyDataSize(kAudioObjectSystemObject,&property,0,nullptr,&size)!=noErr)return {};
    std::vector<AudioDeviceID> devices(size/sizeof(AudioDeviceID));
    if(AudioObjectGetPropertyData(kAudioObjectSystemObject,&property,0,nullptr,&size,devices.data())!=noErr)return {};
    for(auto device:devices) {
        property={kAudioObjectPropertyName,kAudioObjectPropertyScopeGlobal,kAudioObjectPropertyElementMain};CFStringRef name=nullptr;size=sizeof(name);
        if(AudioObjectGetPropertyData(device,&property,0,nullptr,&size,&name)!=noErr || name==nullptr)continue;
        const auto actualName=juce::String::fromCFString(name);CFRelease(name);if(actualName!=outputName)continue;
        Float64 rate=0;UInt32 frames=0;property={kAudioDevicePropertyNominalSampleRate,kAudioObjectPropertyScopeGlobal,kAudioObjectPropertyElementMain};size=sizeof(rate);
        if(AudioObjectGetPropertyData(device,&property,0,nullptr,&size,&rate)!=noErr)return {};
        property={kAudioDevicePropertyBufferFrameSize,kAudioObjectPropertyScopeGlobal,kAudioObjectPropertyElementMain};size=sizeof(frames);
        if(AudioObjectGetPropertyData(device,&property,0,nullptr,&size,&frames)!=noErr)return {};
        return AudioHardwareDefaults{rate,(int)frames};
    }
    return {};
}
void requireAudioInputPermission(bool requestIfUndetermined) {
    @autoreleasepool {
        NSString* description=[[NSBundle mainBundle] objectForInfoDictionaryKey:@"NSMicrophoneUsageDescription"];
        require([description isKindOfClass:[NSString class]] && description.length>0,"Microphone access is unavailable: NSMicrophoneUsageDescription is missing");
        const auto status=[AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio];
        if(status==AVAuthorizationStatusAuthorized)return;
        if(status==AVAuthorizationStatusNotDetermined) {
            if(requestIfUndetermined)[AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio completionHandler:^(BOOL granted) { (void)granted; }];
            throw std::runtime_error(requestIfUndetermined?"Microphone permission requested. Grant access in macOS, then Apply again; previous audio configuration is unchanged.":"Microphone permission is required. Open Audio settings and explicitly Apply the input configuration.");
        }
        throw std::runtime_error("Microphone permission denied or restricted. Enable access in macOS System Settings; previous audio configuration is unchanged.");
    }
}
}
