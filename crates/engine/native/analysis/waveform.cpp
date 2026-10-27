#include "analysis.h"
#include "waveform_cache.h"
#include "waveform_protocol.generated.h"
#include <juce_audio_formats/juce_audio_formats.h>
#include <limits>
namespace zp {
namespace {
constexpr uint64_t maxSafeFrame = 9007199254740991ULL;
void validateSource(const juce::AudioFormatReader& reader) {
    require(reader.lengthInSamples>0 && std::isfinite(reader.sampleRate) && reader.sampleRate>0,"Audio source is empty or invalid");
    require((uint64_t)reader.lengthInSamples<=maxSafeFrame,"Audio source exceeds safe frame range");
    require(reader.numChannels>=1 && reader.numChannels<=64,"Audio source must contain between 1 and 64 channels");
}
}
V waveform(const juce::String& path,uint32_t bins,const zp_waveform_cancellation& cancellation) {
    require(bins>=1 && bins<=4096,"Waveform bins must be between 1 and 4096");
    require(!cancellation.is_cancelled(cancellation.context),"Waveform cancelled");
    juce::AudioFormatManager formats;formats.registerBasicFormats();
    std::unique_ptr<juce::AudioFormatReader> reader(formats.createReaderFor(localFile(path)));
    require(reader!=nullptr,"Cannot decode waveform source");validateSource(*reader);
    std::vector<float> peaks(bins,0);juce::AudioBuffer<float> block((int)reader->numChannels,8192);
    for(juce::int64 position=0;position<reader->lengthInSamples;position+=block.getNumSamples()) {
        require(!cancellation.is_cancelled(cancellation.context),"Waveform cancelled");
        int count=(int)std::min<juce::int64>(block.getNumSamples(),reader->lengthInSamples-position);
        require(reader->read(block.getArrayOfWritePointers(),block.getNumChannels(),position,count),"Audio waveform decode failed");
        for(int i=0;i<count;++i) {
            const auto bin=std::min((uint32_t)((long double)(position+i)*bins/reader->lengthInSamples),bins-1);
            for(int ch=0;ch<block.getNumChannels();++ch) { const float sample=block.getSample(ch,i);if(std::isfinite(sample))peaks[bin]=std::max(peaks[bin],std::abs(sample)); }
        }
    }
    require(!cancellation.is_cancelled(cancellation.context),"Waveform cancelled");
    juce::Array<V> values;for(float peak:peaks)values.add(peak);auto out=object();put(out,"durationSeconds",reader->lengthInSamples/reader->sampleRate);put(out,"peaks",values);return out;
}
void waveformRange(const juce::String& path,uint64_t startFrame,uint64_t requestedFrames,uint32_t columns,uint32_t framesPerBin,const zp_waveform_cancellation& cancellation,void* context,zp_waveform_allocate allocate) {
    require(startFrame<=maxSafeFrame && requestedFrames>=1 && requestedFrames<=maxSafeFrame,"Invalid waveform frame range");
    require(columns>=1 && columns<=4096,"Waveform columns must be between 1 and 4096");
    require(framesPerBin!=0 && (framesPerBin&(framesPerBin-1))==0,"Waveform frames per bin must be a positive power of two");
    require(startFrame%framesPerBin==0,"Waveform range start must align to frames per bin");
    require(!cancellation.is_cancelled(cancellation.context),"Waveform range cancelled");
    juce::AudioFormatManager formats;formats.registerBasicFormats();
    const auto file=localFile(path);const auto identity=WaveformFileIdentity::read(file);
    std::unique_ptr<juce::AudioFormatReader> reader(formats.createReaderFor(file));
    require(reader!=nullptr,"Cannot decode waveform source");validateSource(*reader);
    const auto totalFrames=(uint64_t)reader->lengthInSamples;
    require(startFrame<totalFrames,"Waveform range starts outside source");
    const auto frameCount=std::min(requestedFrames,totalFrames-startFrame);
    const bool samples=framesPerBin==1;
    const uint64_t binCount=frameCount/framesPerBin+(frameCount%framesPerBin!=0);
    if(samples)require(frameCount<=8192 && frameCount<=(uint64_t)columns*2,"Raw waveform range exceeds sample budget");
    else require(binCount<=columns,"Waveform bin count exceeds columns");
    const auto channels=(size_t)reader->numChannels;
    const size_t valuesPerChannel=samples?(size_t)frameCount:(size_t)binCount;
    auto data=cachedWaveformData(identity,startFrame,frameCount,framesPerBin);
    if(data)require(data->minima.size()==channels && (data->bin==1 || data->maxima.size()==channels),"Waveform source changed during decoding");
    if(!data || data->start!=startFrame || data->frames!=frameCount || data->bin!=framesPerBin) {
        auto next=std::make_shared<WaveformData>();next->start=startFrame;next->frames=frameCount;next->bin=framesPerBin;
        auto& minima=next->minima;auto& maxima=next->maxima;
        minima.reserve(channels);if(!samples)maxima.reserve(channels);
        for(size_t channel=0;channel<channels;++channel) {
            minima.emplace_back(valuesPerChannel,samples?0:std::numeric_limits<float>::infinity());
            if(!samples)maxima.emplace_back(valuesPerChannel,-std::numeric_limits<float>::infinity());
        }
        if(data) {
            const auto first=(startFrame-data->start)/data->bin;
            const auto count=frameCount/data->bin+(frameCount%data->bin!=0);
            const auto scale=framesPerBin/data->bin;
            for(size_t channel=0;channel<channels;++channel)for(uint64_t offset=0;offset<count;++offset) {
                if(offset%8192==0)require(!cancellation.is_cancelled(cancellation.context),"Waveform range cancelled");
                const auto low=data->minima[channel][size_t(first+offset)];
                if(samples)minima[channel][size_t(offset)]=low;
                else {
                    const auto high=data->bin==1?low:data->maxima[channel][size_t(first+offset)];const auto bin=size_t(offset/scale);
                    minima[channel][bin]=std::min(minima[channel][bin],low);maxima[channel][bin]=std::max(maxima[channel][bin],high);
                }
            }
        }else {
            juce::AudioBuffer<float> block((int)channels,(int)std::min<uint64_t>(8192,frameCount));
            for(uint64_t offset=0;offset<frameCount;offset+=(uint64_t)block.getNumSamples()) {
                require(!cancellation.is_cancelled(cancellation.context),"Waveform range cancelled");
                const int count=(int)std::min<uint64_t>((uint64_t)block.getNumSamples(),frameCount-offset);
                require(reader->read(block.getArrayOfWritePointers(),(int)channels,(juce::int64)(startFrame+offset),count),"Audio waveform decode failed");
                for(int i=0;i<count;++i) {
                    const auto bin=size_t((offset+uint64_t(i))/framesPerBin);
                    for(size_t channel=0;channel<channels;++channel) {
                        const float sample=block.getSample((int)channel,i);require(std::isfinite(sample),"Audio waveform source contains non-finite samples");
                        if(samples)minima[channel][bin]=sample;
                        else { minima[channel][bin]=std::min(minima[channel][bin],sample);maxima[channel][bin]=std::max(maxima[channel][bin],sample); }
                    }
                }
            }
        }
        require(!cancellation.is_cancelled(cancellation.context),"Waveform range cancelled");
        require(WaveformFileIdentity::read(file)==identity,"Waveform source changed during decoding");
        retainWaveformData(identity,next);data=std::move(next);
    }
    require(!cancellation.is_cancelled(cancellation.context),"Waveform range cancelled");
    namespace wire=waveform_wire;
    const auto payloadBytes=uint32_t(channels*valuesPerChannel*(samples?1:2)*sizeof(float));
    const auto bytes=uint32_t(wire::WAVEFORM_HEADER_BYTES)+payloadBytes;
    auto* output=allocate(context,bytes);require(output!=nullptr,"Cannot allocate waveform response");
    wire::WireWaveformHeader header{};
    header.magic=wire::WAVEFORM_MAGIC;header.version=wire::WAVEFORM_VERSION;header.headerBytes=wire::WAVEFORM_HEADER_BYTES;
    header.kind=samples?wire::WAVEFORM_KIND_SAMPLES:wire::WAVEFORM_KIND_ENVELOPE;
    header.channels=uint32_t(channels);header.valuesPerChannel=uint32_t(valuesPerChannel);header.framesPerBin=framesPerBin;
    header.sampleRate=reader->sampleRate;header.totalFrames=totalFrames;header.startFrame=startFrame;header.frameCount=frameCount;
    header.payloadBytes=payloadBytes;
    require(wire::writeWaveformHeader({output,bytes},header),"Cannot encode waveform header");
    size_t position=wire::WAVEFORM_HEADER_BYTES;
    for(size_t channel=0;channel<channels;++channel) {
        require(!cancellation.is_cancelled(cancellation.context),"Waveform range cancelled");
        for(const auto* plane:{&data->minima[channel],samples?nullptr:&data->maxima[channel]}) {
            if(!plane)continue;
            for(float value:*plane) { wire::detail::writeLittle(output+position,value);position+=sizeof(float); }
        }
    }
    require(!cancellation.is_cancelled(cancellation.context),"Waveform range cancelled");
    require(WaveformFileIdentity::read(file)==identity,"Waveform source changed during decoding");
}
}
