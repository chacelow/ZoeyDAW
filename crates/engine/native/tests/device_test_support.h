#pragma once
#include "playback_model.h"
#include <cstdlib>
namespace zp {
class ScopedAudioPreferences final {
public:
    ScopedAudioPreferences():previousConfig(juce::SystemStats::getEnvironmentVariable("ZOEYDAW_AUDIO_CONFIG_PATH",{})),previousCache(juce::SystemStats::getEnvironmentVariable("ZOEYDAW_AUDIO_CACHE_PATH",{})),cache(temporary.getFile().getSiblingFile(temporary.getFile().getFileName()+"-cache")) {
        set("ZOEYDAW_AUDIO_CONFIG_PATH",temporary.getFile().getFullPathName());set("ZOEYDAW_AUDIO_CACHE_PATH",cache.getFullPathName());
    }
    ~ScopedAudioPreferences() { set("ZOEYDAW_AUDIO_CONFIG_PATH",previousConfig);set("ZOEYDAW_AUDIO_CACHE_PATH",previousCache);cache.deleteRecursively(); }
    juce::File file() const { return temporary.getFile(); }
    static void set(const char* name,const juce::String& value) {
#if JUCE_WINDOWS
        _putenv_s(name,value.toRawUTF8());
#else
        if(value.isEmpty())unsetenv(name);else setenv(name,value.toRawUTF8(),1);
#endif
    }
private:
    juce::String previousConfig,previousCache;
    juce::TemporaryFile temporary {".json"};
    juce::File cache;
};
}
