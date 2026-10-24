#include "analysis.h"
#include <tracktion_engine/tracktion_engine.h>
#include <tracktion_engine/timestretch/tracktion_TempoDetect.h>
#include <algorithm>
#include <array>
#include <numeric>
namespace zp {
namespace {
V tempoResult(double bpm,const char* origin) {
    auto out=object();put(out,"bpm",bpm>0?V(bpm):V());put(out,"origin",origin);return out;
}
bool sensible(double bpm) { return std::isfinite(bpm) && bpm>=30 && bpm<=300; }
}
V analyzeTempo(const juce::String& path) {
    auto file=localFile(path);require(file.existsAsFile(),"Tempo source is offline");
    juce::AudioFormatManager formats;formats.registerBasicFormats();
    std::unique_ptr<juce::AudioFormatReader> reader(formats.createReaderFor(file));
    require(reader!=nullptr,"Tempo source format is unsupported");
    require(reader->lengthInSamples>0 && std::isfinite(reader->sampleRate) && reader->sampleRate>=8000 && reader->sampleRate<=384000 && reader->numChannels>0,"Invalid tempo source audio format");
    const auto& metadata=reader->metadataValues;
    if(metadata.getValue(juce::WavAudioFormat::acidOneShot,"0")=="1")return tempoResult(0,"unknown");
    for(auto key:{juce::WavAudioFormat::acidTempo,"tempo","bpm","BPM","TBPM"}) {
        const double bpm=metadata.getValue(key,{}).getDoubleValue();
        if(sensible(bpm))return tempoResult(bpm,"metadata");
    }
    const auto frames=std::min(reader->lengthInSamples,(juce::int64)(reader->sampleRate*60));
    if(frames<reader->sampleRate*3)return tempoResult(0,"unknown");
    const int window=std::max(1,(int)std::round(reader->sampleRate*.01));
    juce::AudioBuffer<float> block(std::min(2,(int)reader->numChannels),4096);
    std::array<float,4096> mono{};
    tracktion::TempoDetect detector(1,reader->sampleRate);
    std::vector<double> energy;energy.reserve((size_t)(frames/window+1));
    double sum=0;int accumulated=0;
    for(juce::int64 offset=0;offset<frames;offset+=4096) {
        const int count=(int)std::min<juce::int64>(4096,frames-offset);
        require(reader->read(&block,0,count,offset,true,block.getNumChannels()>1),"Tempo source decode failed");
        for(int i=0;i<count;++i) {
            double squared=0;float mixed=0;
            for(int ch=0;ch<block.getNumChannels();++ch) {
                const float sample=block.getSample(ch,i);require(std::isfinite(sample),"Tempo source contains non-finite audio");
                squared+=(double)sample*sample;mixed+=sample;
            }
            mono[(size_t)i]=mixed/block.getNumChannels();sum+=squared/block.getNumChannels();
            if(++accumulated==window) { energy.push_back(sum/window);sum=0;accumulated=0; }
        }
        const float* channels[]={mono.data()};detector.processSection(channels,count);
    }
    if(energy.empty())return tempoResult(0,"unknown");
    const double peak=*std::max_element(energy.begin(),energy.end());
    if(peak<1e-8)return tempoResult(0,"unknown");
    std::vector<double> onsets;onsets.reserve(400);
    for(size_t i=1;i+1<energy.size();++i) {
        const size_t begin=i>20?i-20:0;
        const double baseline=std::accumulate(energy.begin()+begin,energy.begin()+i,0.0)/(i-begin);
        if(energy[i]>=peak*.08 && energy[i]>baseline*2 && energy[i]>energy[i-1] && energy[i]>=energy[i+1]) {
            const double seconds=(double)i*window/reader->sampleRate;
            if(onsets.empty() || seconds-onsets.back()>=.15)onsets.push_back(seconds);
        }
    }
    if(onsets.size()<6)return tempoResult(0,"unknown");
    std::vector<double> intervals;intervals.reserve(onsets.size()-1);
    for(size_t i=1;i<onsets.size();++i)intervals.push_back(onsets[i]-onsets[i-1]);
    auto sorted=intervals;std::sort(sorted.begin(),sorted.end());
    const double median=sorted[sorted.size()/2];
    double detected=detector.finishAndDetect();
    const double pulseBpm=60/median;
    if(!sensible(detected))detected=pulseBpm;
    else for(double factor:{.5,1.0,2.0})if(std::abs(detected*factor-pulseBpm)<pulseBpm*.08) { detected*=factor;break; }
    if(!sensible(detected))return tempoResult(0,"unknown");
    const double period=60/detected;
    size_t supported=0;
    for(double interval:intervals) {
        const double beats=std::round(interval/period);
        if(beats>=1 && beats<=4 && std::abs(interval-beats*period)<=std::max(.025,period*.08))++supported;
    }
    if(supported*10<intervals.size()*8)return tempoResult(0,"unknown");
    // Use the observed pulse interval to avoid detector interpolation drift on stable loops.
    const bool steady=std::all_of(intervals.begin(),intervals.end(),[median](double value){return std::abs(value-median)<=median*.08;});
    if(steady && sensible(pulseBpm))detected=pulseBpm;
    return tempoResult(std::round(detected*100)/100,"analysis");
}
}
