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
double gridSupport(const std::vector<double>& onsets,double bpm,int subdivisions,double resolution) {
    constexpr size_t bins=64;std::array<size_t,bins> phases {};
    const double frequency=bpm*subdivisions/60;
    for(double onset:onsets)++phases[std::min(bins-1,size_t(std::fmod(onset*frequency,1.0)*bins))];
    const double tolerance=std::min(.24,std::max(.08,resolution*frequency*2));
    const size_t width=2*size_t(std::ceil(tolerance*bins))+1;
    size_t count=0;for(size_t i=0;i<width;++i)count+=phases[i];
    size_t best=count;
    for(size_t start=1;start<bins;++start) {
        count-=phases[start-1];count+=phases[(start+width-1)%bins];best=std::max(best,count);
    }
    return double(best)/onsets.size();
}
V analyzeTempoWindow(juce::AudioFormatReader* reader,juce::int64 start,juce::int64 frames) {
    if(frames<reader->sampleRate*.75)return tempoResult(0,"unknown");
    const int window=std::max(1,(int)std::round(reader->sampleRate*.01));
    juce::AudioBuffer<float> block(std::min(2,(int)reader->numChannels),4096);
    std::array<float,4096> mono{};
    tracktion::TempoDetect detector(1,reader->sampleRate);
    std::vector<double> energy;energy.reserve((size_t)(frames/window+1));
    double sum=0;int accumulated=0;
    for(juce::int64 offset=0;offset<frames;offset+=4096) {
        const int count=(int)std::min<juce::int64>(4096,frames-offset);
        require(reader->read(&block,0,count,start+offset,true,block.getNumChannels()>1),"Tempo source decode failed");
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
    if(onsets.size()<3)return tempoResult(0,"unknown");
    std::vector<double> intervals;intervals.reserve(onsets.size()-1);
    for(size_t i=1;i<onsets.size();++i)intervals.push_back(onsets[i]-onsets[i-1]);
    auto sorted=intervals;std::sort(sorted.begin(),sorted.end());
    const double median=sorted[sorted.size()/2];
    double detected=detector.finishAndDetect();
    const double pulseBpm=60/median;
    const bool steady=std::all_of(intervals.begin(),intervals.end(),[median](double value){return std::abs(value-median)<=median*.08;});
    if(steady && sensible(pulseBpm))detected=pulseBpm;
    if(!sensible(detected))return tempoResult(0,"unknown");
    std::vector<double> attacks;attacks.reserve(energy.size());
    for(size_t i=0;i<energy.size();++i) {
        const size_t begin=i>20?i-20:0;
        const double baseline=i?std::accumulate(energy.begin()+begin,energy.begin()+i,0.0)/(i-begin):0;
        attacks.push_back(std::max(0.0,energy[i]-baseline));
    }
    const int period=(int)std::round(60/detected*reader->sampleRate/window);
    double support=0;
    for(int lag=std::max(1,period-2);lag<=period+2;++lag) {
        if((size_t)lag>=attacks.size()/2)continue;
        double product=0,left=0,right=0;
        for(size_t i=(size_t)lag;i<attacks.size();++i) {
            const double a=attacks[i],b=attacks[i-(size_t)lag];
            product+=a*b;left+=a*a;right+=b*b;
        }
        if(left>0 && right>0)support=std::max(support,product/std::sqrt(left*right));
    }
    if(support<.45)return tempoResult(0,"unknown");
    const double resolution=double(window)/reader->sampleRate;
    if(gridSupport(onsets,detected,4,resolution)<.8
        && (gridSupport(onsets,detected,3,resolution)>=.8 || gridSupport(onsets,detected,6,resolution)>=.8))
        return tempoResult(0,"unknown");
    return tempoResult(std::round(detected*100)/100,"analysis");
}
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
    const auto maximumFrames=(juce::int64)(reader->sampleRate*60);
    if(reader->lengthInSamples<=maximumFrames)return analyzeTempoWindow(reader.get(),0,reader->lengthInSamples);
    const auto frames=(juce::int64)(reader->sampleRate*20);
    double first=0;
    for(const auto start:{juce::int64(0),(reader->lengthInSamples-frames)/2,reader->lengthInSamples-frames}) {
        const auto result=analyzeTempoWindow(reader.get(),start,frames);
        if(result["origin"].toString()!="analysis")return tempoResult(0,"unknown");
        const double bpm=result["bpm"];
        if(first==0)first=bpm;
        else if(std::abs(bpm-first)>first*.02)return tempoResult(0,"unknown");
    }
    return tempoResult(first,"analysis");
}
}
