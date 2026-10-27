#include "waveform_cache.h"
#include <list>
#include <mutex>

namespace zp {
size_t WaveformData::bytes() const noexcept {
    size_t values=0;
    for(const auto& channel:minima)values+=channel.size();
    for(const auto& channel:maxima)values+=channel.size();
    return values*sizeof(float);
}
WaveformFileIdentity WaveformFileIdentity::read(const juce::File& file) {
    require(file.existsAsFile(),"Waveform source is offline");
    return {file.getFullPathName(),file.getSize(),file.getLastModificationTime().toMilliseconds(),file.getFileIdentifier()};
}
namespace {
struct Entry { WaveformFileIdentity source;std::shared_ptr<const WaveformData> data; };
struct Cache {
    std::mutex mutex;
    std::list<Entry> entries;
    size_t bytes=0;
    uint64_t hits=0;
};
Cache& cache() { static Cache value;return value; }
constexpr size_t maxBytes=32*1024*1024,maxEntries=64;
void invalidate(Cache& owner,const WaveformFileIdentity& source) {
    for(auto item=owner.entries.begin();item!=owner.entries.end();) {
        if(item->source.path==source.path && item->source!=source) {
            owner.bytes-=item->data->bytes();item=owner.entries.erase(item);
        }else ++item;
    }
}
}
std::shared_ptr<const WaveformData> cachedWaveformData(const WaveformFileIdentity& source,uint64_t start,uint64_t frames,uint32_t bin) {
    auto& owner=cache();const std::lock_guard lock(owner.mutex);invalidate(owner,source);
    auto best=owner.entries.end();
    for(auto item=owner.entries.begin();item!=owner.entries.end();++item) {
        const auto& data=*item->data;
        if(item->source!=source || data.bin>bin || bin%data.bin!=0 || start<data.start
            || start-data.start>data.frames || frames>data.frames-(start-data.start))continue;
        const uint64_t end=start+frames;
        if(end%data.bin!=0 && end!=data.start+data.frames)continue;
        if(best==owner.entries.end() || data.bin>best->data->bin)best=item;
    }
    if(best==owner.entries.end())return {};
    auto result=best->data;owner.entries.splice(owner.entries.end(),owner.entries,best);++owner.hits;return result;
}
void retainWaveformData(const WaveformFileIdentity& source,std::shared_ptr<const WaveformData> data) {
    const auto bytes=data->bytes();if(bytes>maxBytes)return;
    auto& owner=cache();const std::lock_guard lock(owner.mutex);invalidate(owner,source);
    for(const auto& item:owner.entries)if(item.source==source && item.data->start==data->start
        && item.data->frames==data->frames && item.data->bin==data->bin)return;
    while(!owner.entries.empty() && (owner.entries.size()>=maxEntries || bytes>maxBytes-owner.bytes)) {
        owner.bytes-=owner.entries.front().data->bytes();owner.entries.pop_front();
    }
    owner.entries.push_back({source,std::move(data)});owner.bytes+=bytes;
}
WaveformCacheStats waveformCacheStats() {
    auto& owner=cache();const std::lock_guard lock(owner.mutex);return {owner.bytes,owner.entries.size(),owner.hits};
}
}
