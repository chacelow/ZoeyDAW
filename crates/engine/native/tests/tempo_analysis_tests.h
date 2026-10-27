#pragma once
void testSourceTempoAnalysis() {
    for(int kind=0;kind<15;++kind) {
        const int rate=kind>=9?8000:48000;
        const int frames=rate*(kind>=9?100:kind==4?2:10);
        juce::TemporaryFile source(".wav");auto stream=source.getFile().createOutputStream();
        zp::require(stream!=nullptr,"Cannot create tempo fixture");
        juce::StringPairArray metadata;if(kind==3 || kind==13) { metadata.set(juce::WavAudioFormat::acidTempo,"123");metadata.set(juce::WavAudioFormat::acidOneShot,"0");metadata.set(juce::WavAudioFormat::acidBeats,"20");metadata.set(juce::WavAudioFormat::acidNumerator,"4");metadata.set(juce::WavAudioFormat::acidDenominator,"4"); }
        juce::WavAudioFormat format;std::unique_ptr<juce::AudioFormatWriter> writer(format.createWriterFor(stream.release(),rate,1,24,metadata,0));
        zp::require(writer!=nullptr,"Cannot create tempo fixture writer");
        juce::AudioBuffer<float> block(1,4096);
        for(int offset=0;offset<frames;offset+=4096) {
            const int count=std::min(4096,frames-offset);
            for(int i=0;i<count;++i) {
                const int frame=offset+i;const double t=(double)frame/rate;
                double pulseTime=(double)(frame%(rate/2))/rate;
                if(kind==9 && t>=60) pulseTime=std::fmod(t-60,1.0/3);
                if(kind==11 && t>=35 && t<65) pulseTime=std::fmod(t-35,1.0/3);
                if(kind==13 && t>=60) pulseTime=std::fmod(t-60,1.0/3);
                if(kind==5) {
                    pulseTime=2;
                    const double phase=std::fmod(t,2.0);
                    for(double beat:{0.0,.375,.75,1.0,1.375,1.75})if(phase>=beat)pulseTime=std::min(pulseTime,phase-beat);
                }
                if(kind==7) {
                    pulseTime=10;
                    for(double onset:{0.0,.43,1.17,1.83,3.02,4.39,6.11,7.98,9.31})if(t>=onset)pulseTime=std::min(pulseTime,t-onset);
                }
                double envelope=kind==1?1.0:(kind==2?std::exp(-t*60):kind==6?0.0:std::exp(-pulseTime*60));
                if((kind==12 && t>=80) || (kind==14 && t>=40 && t<60))envelope=0;
                if(kind==8) {
                    envelope=0;const double phase=std::fmod(t,8.0/3);
                    for(int beat=0;beat<4;++beat) {
                        const double start=beat*2.0/3;
                        if(phase>=start)envelope+=std::exp(-(phase-start)*60);
                        if(beat%2==1 && phase>=start+2.0/9)envelope+=.55*std::exp(-(phase-start-2.0/9)*60);
                    }
                }
                block.setSample(0,i,(float)(.65*std::sin(juce::MathConstants<double>::twoPi*(kind==1?440:80)*t)*envelope));
            }
            zp::require(writer->writeFromAudioSampleBuffer(block,0,count),"Cannot write tempo fixture");
        }
        writer.reset();
        if(kind==3 || kind==13) {
            std::unique_ptr<juce::AudioFormatReader> reader(format.createReaderFor(source.getFile().createInputStream().release(),true));
            zp::require(reader && reader->metadataValues.getValue(juce::WavAudioFormat::acidTempo,{}).getDoubleValue()==123,"Authored tempo fixture did not retain its ACID chunk");
        }
        auto* encoded=zp_analyze_tempo(source.getFile().getFullPathName().toRawUTF8());
        zp::require(encoded!=nullptr,"Missing tempo analysis response");auto result=zp::parse(encoded);zp_free(encoded);
        zp::require((bool)result["ok"],"Tempo fixture analysis failed: "+result["error"].toString());auto value=result["value"];
        if(kind==0 || kind==4 || kind==10)zp::require(value["origin"].toString()=="analysis" && std::abs((double)value["bpm"]-120)<.5,"120 BPM rhythmic source was not detected, fixture "+juce::String(kind));
        else if(kind==3 || kind==13)zp::require(value["origin"].toString()=="metadata" && (double)value["bpm"]==123,"Authored source tempo metadata was ignored");
        else if(kind==5) {
            const double bpm=value["bpm"];
            zp::require(value["origin"].toString()=="analysis" && (std::abs(bpm-60)<.5 || std::abs(bpm-120)<.5),"Syncopated pattern was rejected for non-integer adjacent intervals");
        }
        else if(kind==8)zp::require(value["origin"].toString()=="unknown" && value["bpm"].isVoid(),"Triplet/straight-grid ambiguity must not become an asserted source BPM: "+juce::JSON::toString(value));
        else if(kind==9 || kind==11 || kind==12 || kind==14)zp::require(value["origin"].toString()=="unknown" && value["bpm"].isVoid(),"Variable or unverified long source fabricated a fixed BPM, fixture "+juce::String(kind)+": "+juce::JSON::toString(value));
        else zp::require(value["origin"].toString()=="unknown" && value["bpm"].isVoid(),"Nonrhythmic source fabricated a source tempo, fixture "+juce::String(kind));
        if(kind>=9)std::cout<<"Long tempo fixture "<<kind<<": "<<juce::JSON::toString(value,true)<<'\n';
    }
    juce::TemporaryFile missing(".wav");auto* encoded=zp_analyze_tempo(missing.getFile().getFullPathName().toRawUTF8());
    zp::require(encoded!=nullptr,"Missing offline analysis response");auto result=zp::parse(encoded);zp_free(encoded);
    zp::require(!(bool)result["ok"] && result["error"].toString().contains("offline"),"Offline tempo source must fail explicitly");
}
