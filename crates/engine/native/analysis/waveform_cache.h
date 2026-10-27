#pragma once
#include "analysis.h"
#include <memory>
#include <vector>

namespace zp {
struct WaveformData {
    uint64_t start=0,frames=0;
    uint32_t bin=1;
    std::vector<std::vector<float>> minima,maxima;
    size_t bytes() const noexcept;
};
struct WaveformFileIdentity {
    juce::String path;
    int64_t size=0,modified=0;
    uint64_t fileId=0;
    static WaveformFileIdentity read(const juce::File&);
    bool operator==(const WaveformFileIdentity&) const = default;
};
std::shared_ptr<const WaveformData> cachedWaveformData(const WaveformFileIdentity&,uint64_t start,uint64_t frames,uint32_t bin);
void retainWaveformData(const WaveformFileIdentity&,std::shared_ptr<const WaveformData>);
struct WaveformCacheStats { size_t bytes=0,entries=0;uint64_t hits=0; };
WaveformCacheStats waveformCacheStats();
}
