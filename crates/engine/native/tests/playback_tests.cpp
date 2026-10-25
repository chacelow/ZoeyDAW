#include "playback_bridge.h"
#include "playback_model.h"
#include "audio_configuration.h"
#include "device_test_support.h"
#include "transport_observation.h"
#include <juce_events/juce_events.h>
#include <juce_audio_formats/juce_audio_formats.h>
#include <iostream>
#include <limits>
#include <memory>
void testActualSourceLoopRendering();
namespace {
using zp::V;
V request() {
    return zp::parse(R"JSON({"protocolVersion":2,"sessionId":"native-protocol-test","sequence":0,"baseRevision":0,"revision":0,"stage":"open","editId":null,"controlGeneration":"0","state":{"project":{"bpm":120,"numerator":3,"denominator":8,"loop":{"enabled":false,"startBar":1,"endBar":5},"sources":[],"tracks":[{"id":"main","kind":"main","output":"external","input":"none","inputChannel":null,"outputChannel":"1-2","monitor":"off","volumeDb":0,"pan":0,"mute":false,"solo":false,"armed":false,"sends":{},"returnPost":false,"cueOutput":null,"cueVolumeDb":-18,"devices":[],"clips":[],"automation":[],"childTrackIds":[]}]},"control":{"playing":false,"recording":false,"seekBar":2,"seekGeneration":0}}})JSON");
}
V invoke(zp_session* handle,const char* command,const V& value) {
    auto* response=zp_call(handle,command,juce::JSON::toString(value,true).toRawUTF8());zp::require(response!=nullptr,"Missing ABI response");auto parsed=zp::parse(response);zp_free(response);return parsed;
}
V payload(const V& r,uint64_t epoch=0,const char* lease="native-test") { auto p=zp::object();zp::put(p,"request",r);zp::put(p,"leaseId",lease);zp::put(p,"stopToken",(juce::int64)epoch);zp::put(p,"stopEpoch",(juce::int64)epoch);return p; }
void testMidiVelocityBoundary() {
    for(double velocity:{0.0,1.0,100.0,127.0}) {
        auto r=request();auto live=zp::parse(R"({"protocolVersion":2,"sessionId":"native-protocol-test","sequence":1,"note":{"trackId":"midi","noteId":"live","pitch":60,"velocity":100,"on":true}})");auto liveNote=live["note"];zp::put(liveNote,"velocity",velocity);zp::require(zp::decodeNote(live).velocity==velocity,"Live MIDI velocity changed");
        auto midi=juce::JSON::parse(juce::JSON::toString(r["state"]["project"]["tracks"][0]));zp::put(midi,"id","midi");zp::put(midi,"kind","midi");zp::put(midi,"output","main");
        auto clip=zp::parse(R"JSON({"id":"notes","kind":"midi","startBar":1,"lengthBars":1,"sourceOffsetBars":0,"mute":false,"loopBars":1,"notes":[{"id":"note","pitch":60,"startBeat":0,"lengthBeats":1,"velocity":100}]})JSON");
        auto note=clip["notes"][0];zp::put(note,"velocity",velocity);zp::put(midi,"clips",juce::Array<V>{clip});r["state"]["project"]["tracks"].getArray()->add(midi);zp::decode(r);
        for(double invalid:{-1.0,128.0}) {
            auto bad=live.clone();auto badLive=bad["note"];zp::put(badLive,"velocity",invalid);bool rejected=false;try { zp::decodeNote(bad); }catch(const std::exception&) { rejected=true; }zp::require(rejected,"Out-of-range live MIDI velocity must reject");
            bad=r.clone();auto badNote=bad["state"]["project"]["tracks"][1]["clips"][0]["notes"][0];zp::put(badNote,"velocity",invalid);rejected=false;try { zp::decode(bad); }catch(const std::exception&) { rejected=true; }zp::require(rejected,"Out-of-range authored MIDI velocity must reject");
        }
    }
}
void testV2WireBoundary() {
    const auto reject=[](auto&& operation) { bool rejected=false;try { operation(); }catch(const std::exception&) { rejected=true; }zp::require(rejected,"Invalid v2 wire value accepted"); };
    for(const auto* value:{"0","9007199254740993","18446744073709551615"}) {
        auto r=request();zp::put(r,"controlGeneration",value);const auto decoded=zp::decode(r);zp::require(zp::result(decoded,true)["controlGeneration"].toString()==value,"u64 generation lost precision");
    }
    for(const auto* value:{"","00","01","-1","+1","1.0","18446744073709551616"}) { auto r=request();zp::put(r,"controlGeneration",value);reject([&] { zp::decode(r); }); }
    for(const auto* key:{"sequence","baseRevision","revision"}) { auto r=request();zp::put(r,key,static_cast<juce::int64>(9007199254740992LL));reject([&] { zp::decode(r); }); }
    auto r=request();zp::put(r,"controlGeneration",1);reject([&] { zp::decode(r); });r=request();zp::put(r,"protocolVersion",1);reject([&] { zp::decode(r); });r=request();zp::put(r,"stage","transport");reject([&] { zp::decode(r); });
    r=request();auto legacy=r["state"]["control"];zp::put(legacy,"heldNotes",juce::Array<V>());reject([&] { zp::decode(r); });
    auto c=zp::parse(R"({"protocolVersion":2,"sessionId":"native-protocol-test","sequence":1,"controlGeneration":"18446744073709551615","control":{"playing":false,"recording":false,"seekBar":1,"seekGeneration":0}})");
    zp::require(zp::decodeControl(c).controlGeneration==std::numeric_limits<uint64_t>::max(),"Narrow control generation truncated");zp::put(c,"project",zp::object());reject([&] { zp::decodeControl(c); });
    auto n=zp::parse(R"({"protocolVersion":2,"sessionId":"native-protocol-test","sequence":1,"note":{"trackId":"midi","noteId":"live","pitch":60,"velocity":100,"on":true,"requestedSample":"18446744073709551615"}})");zp::require(*zp::decodeNote(n).requestedSample==std::numeric_limits<uint64_t>::max(),"Requested sample lost precision");
    zp::put(n,"sequence",0);reject([&] { zp::decodeNote(n); });
    zp::put(n,"sequence",static_cast<juce::int64>(9007199254740992LL));reject([&] { zp::decodeNote(n); });
}
void testSignedAudioSourceOffsets() {
    for(double offset:{-.25,-2.0,0.0,.25}) {
        auto r=request();auto audio=r["state"]["project"]["tracks"][0].clone();zp::put(audio,"id","audio");zp::put(audio,"kind","audio");zp::put(audio,"output","main");
        auto clip=zp::parse(R"({"id":"signed-audio","kind":"audio","startBar":1,"lengthBars":1,"sourceOffsetBars":0,"mute":false,"sourceId":null,"gainDb":0,"audioSettings":{"warp":false,"warpMode":"soundtouch","sourceBpm":120,"transpose":0,"detune":0,"reverse":false,"loop":false,"loopStartBars":0,"loopLengthBars":1,"startMarkerBars":0,"endMarkerBars":1},"fadeInBars":0,"fadeOutBars":0,"fadeInOffsetBars":0,"fadeOutOffsetBars":0,"fadeInCurve":0.35,"fadeOutCurve":0.35,"fadeInCurvePosition":0.5,"fadeOutCurvePosition":0.5})");
        zp::put(clip,"sourceOffsetBars",offset);zp::put(audio,"clips",juce::Array<V>{clip});r["state"]["project"]["tracks"].getArray()->add(audio);
        const auto decoded=zp::decode(r);zp::require(decoded.tracks[1].clips[0].offset==offset,"Signed audio source offset was rejected or changed");
    }
}
void testSourceTempoAnalysis() {
    const int rate=48000;
    for(int kind=0;kind<8;++kind) {
        const int frames=rate*(kind==4?2:10);
        juce::TemporaryFile source(".wav");auto stream=source.getFile().createOutputStream();
        zp::require(stream!=nullptr,"Cannot create tempo fixture");
        juce::StringPairArray metadata;if(kind==3) { metadata.set(juce::WavAudioFormat::acidTempo,"123");metadata.set(juce::WavAudioFormat::acidOneShot,"0");metadata.set(juce::WavAudioFormat::acidBeats,"20");metadata.set(juce::WavAudioFormat::acidNumerator,"4");metadata.set(juce::WavAudioFormat::acidDenominator,"4"); }
        juce::WavAudioFormat format;std::unique_ptr<juce::AudioFormatWriter> writer(format.createWriterFor(stream.release(),rate,1,24,metadata,0));
        zp::require(writer!=nullptr,"Cannot create tempo fixture writer");
        juce::AudioBuffer<float> block(1,4096);
        for(int offset=0;offset<frames;offset+=4096) {
            const int count=std::min(4096,frames-offset);
            for(int i=0;i<count;++i) {
                const int frame=offset+i;const double t=(double)frame/rate;
                double pulseTime=(double)(frame%(rate/2))/rate;
                if(kind==5) {
                    pulseTime=2;
                    const double phase=std::fmod(t,2.0);
                    for(double beat:{0.0,.375,.75,1.0,1.375,1.75})if(phase>=beat)pulseTime=std::min(pulseTime,phase-beat);
                }
                if(kind==7) {
                    pulseTime=10;
                    for(double onset:{0.0,.43,1.17,1.83,3.02,4.39,6.11,7.98,9.31})if(t>=onset)pulseTime=std::min(pulseTime,t-onset);
                }
                const double envelope=kind==1?1.0:(kind==2?std::exp(-t*60):kind==6?0.0:std::exp(-pulseTime*60));
                block.setSample(0,i,(float)(.65*std::sin(juce::MathConstants<double>::twoPi*(kind==1?440:80)*t)*envelope));
            }
            zp::require(writer->writeFromAudioSampleBuffer(block,0,count),"Cannot write tempo fixture");
        }
        writer.reset();
        if(kind==3) {
            std::unique_ptr<juce::AudioFormatReader> reader(format.createReaderFor(source.getFile().createInputStream().release(),true));
            zp::require(reader && reader->metadataValues.getValue(juce::WavAudioFormat::acidTempo,{}).getDoubleValue()==123,"Authored tempo fixture did not retain its ACID chunk");
        }
        auto* encoded=zp_analyze_tempo(source.getFile().getFullPathName().toRawUTF8());
        zp::require(encoded!=nullptr,"Missing tempo analysis response");auto result=zp::parse(encoded);zp_free(encoded);
        zp::require((bool)result["ok"],"Tempo fixture analysis failed: "+result["error"].toString());auto value=result["value"];
        if(kind==0 || kind==4)zp::require(value["origin"].toString()=="analysis" && std::abs((double)value["bpm"]-120)<.5,"120 BPM rhythmic source was not detected, fixture "+juce::String(kind));
        else if(kind==3)zp::require(value["origin"].toString()=="metadata" && (double)value["bpm"]==123,"Authored source tempo metadata was ignored");
        else if(kind==5) {
            const double bpm=value["bpm"];
            zp::require(value["origin"].toString()=="analysis" && (std::abs(bpm-60)<.5 || std::abs(bpm-120)<.5),"Syncopated pattern was rejected for non-integer adjacent intervals");
        }
        else zp::require(value["origin"].toString()=="unknown" && value["bpm"].isVoid(),"Nonrhythmic source fabricated a source tempo, fixture "+juce::String(kind));
    }
    juce::TemporaryFile missing(".wav");auto* encoded=zp_analyze_tempo(missing.getFile().getFullPathName().toRawUTF8());
    zp::require(encoded!=nullptr,"Missing offline analysis response");auto result=zp::parse(encoded);zp_free(encoded);
    zp::require(!(bool)result["ok"] && result["error"].toString().contains("offline"),"Offline tempo source must fail explicitly");
}
float waveformFixtureSample(int channel,int frame) {
    constexpr float cycle[]{.25f,-.75f,1.5f,-1.25f,.5f,-.125f,.875f,-.5f};
    const float sample=cycle[frame%8];
    return channel==0?sample:-sample*.5f+.125f;
}
V waveformRangeResponse(const juce::File& file,uint64_t start,uint64_t count,uint32_t columns,uint32_t framesPerBin=1,uint64_t generation=1) {
    std::unique_ptr<char,decltype(&zp_free)> encoded(zp_waveform_range(file.getFullPathName().toRawUTF8(),start,count,columns,framesPerBin,generation),zp_free);
    zp::require(encoded!=nullptr,"Missing waveform range response");return zp::parse(encoded.get());
}
void writeWideFloatWaveform(const juce::File& file,int channels,bool invalid=false) {
    auto stream=file.createOutputStream();zp::require(stream!=nullptr,"Cannot create multichannel waveform fixture");
    const int dataBytes=channels*8*4;
    stream->write("RIFF",4);stream->writeInt(36+dataBytes);stream->write("WAVEfmt ",8);stream->writeInt(16);
    stream->writeShort(3);stream->writeShort((short)channels);stream->writeInt(48000);stream->writeInt(48000*channels*4);
    stream->writeShort((short)(channels*4));stream->writeShort(32);stream->write("data",4);stream->writeInt(dataBytes);
    for(int frame=0;frame<8;++frame)for(int channel=0;channel<channels;++channel)stream->writeFloat(invalid?std::numeric_limits<float>::quiet_NaN():(float)(channel+1)/32);
    stream->flush();zp::require(stream->getStatus().wasOk(),"Cannot write multichannel waveform fixture");
}
void testSignedWaveformRanges() {
    constexpr int rate=48000,frames=20003;
    juce::TemporaryFile source(".wav");
    std::unique_ptr<juce::OutputStream> stream=source.getFile().createOutputStream();
    juce::WavAudioFormat format;
    auto writer=format.createWriterFor(stream,juce::AudioFormatWriterOptions{}.withSampleRate(rate).withNumChannels(2).withBitsPerSample(32).withSampleFormat(juce::AudioFormatWriterOptions::SampleFormat::floatingPoint));
    zp::require(writer!=nullptr,"Cannot create signed float waveform fixture");
    juce::AudioBuffer<float> block(2,8192);
    for(int offset=0;offset<frames;offset+=8192) {
        const int count=std::min(8192,frames-offset);
        for(int channel=0;channel<2;++channel)for(int i=0;i<count;++i)block.setSample(channel,i,waveformFixtureSample(channel,offset+i));
        zp::require(writer->writeFromAudioSampleBuffer(block,0,count),"Cannot write signed waveform fixture");
    }
    writer.reset();
    zp_waveform_range_fence(1);
    const auto verifySamples=[&](uint64_t start,uint64_t requested,uint32_t columns) {
        const auto response=waveformRangeResponse(source.getFile(),start,requested,columns);
        zp::require((bool)response["ok"],"Signed sample decode failed: "+response["error"].toString());
        const auto value=response["value"];const int count=(int)std::min<uint64_t>(requested,frames-start);
        zp::require(value["kind"].toString()=="samples" && (int)value["sampleRate"]==rate && (int)value["totalFrames"]==frames && (juce::int64)value["startFrame"]==(juce::int64)start && (int)value["frameCount"]==count,"Signed sample range metadata or near-zoom mode mismatch");
        zp::require(value["channels"].isArray() && value["channels"].size()==2,"Waveform channels must remain separate");
        for(int channel=0;channel<2;++channel) {
            zp::require(value["channels"][channel].size()==count,"Signed samples must match clamped frame count");
            for(int i=0;i<count;++i)zp::require(std::abs((double)value["channels"][channel][i]-waveformFixtureSample(channel,(int)start+i))<1e-6,"Signed sample order, polarity or over-unity amplitude changed");
        }
    };
    verifySamples(8190,8,4);
    verifySamples(0,8192,4096);
    verifySamples(frames-3,9007199254740991ULL,2);
    const auto verifyEnvelope=[&](uint64_t start,uint64_t requested,uint32_t columns,uint32_t framesPerBin=0) {
        const uint64_t count=std::min<uint64_t>(requested,frames-start);
        if(framesPerBin==0) {
            framesPerBin=2;
            while(count/framesPerBin+(count%framesPerBin!=0)>columns)framesPerBin*=2;
        }
        zp::require(start%framesPerBin==0,"Envelope fixture must use source-zero-aligned bins");
        const uint32_t bins=(uint32_t)(count/framesPerBin+(count%framesPerBin!=0));
        const auto response=waveformRangeResponse(source.getFile(),start,requested,columns,framesPerBin);
        zp::require((bool)response["ok"],"Signed envelope decode failed");const auto value=response["value"];
        zp::require(value["kind"].toString()=="envelope" && (juce::int64)value["frameCount"]==(juce::int64)count && (juce::int64)value["startFrame"]==(juce::int64)start && (juce::int64)value["framesPerBin"]==(juce::int64)framesPerBin,"Aligned envelope metadata mismatch");
        for(int channel=0;channel<2;++channel) {
            std::vector<float> low(bins,std::numeric_limits<float>::infinity()),high(bins,-std::numeric_limits<float>::infinity());
            for(uint64_t frame=0;frame<count;++frame) {
                const auto bin=(size_t)((start+frame)/framesPerBin-start/framesPerBin);const float sample=waveformFixtureSample(channel,(int)(start+frame));
                low[bin]=std::min(low[bin],sample);high[bin]=std::max(high[bin],sample);
            }
            zp::require(value["channels"][channel]["min"].size()==(int)bins && value["channels"][channel]["max"].size()==(int)bins,"Envelope IPC size must match actual aligned bin count, not columns");
            for(uint32_t bin=0;bin<bins;++bin) {
                zp::require(std::abs((double)value["channels"][channel]["min"][(int)bin]-low[bin])<1e-6 && std::abs((double)value["channels"][channel]["max"][(int)bin]-high[bin])<1e-6,"Envelope must preserve exact signed extrema without zero bias");
            }
        }
    };
    verifyEnvelope(4096,17003,7);
    verifyEnvelope(0,8193,4096);
    verifyEnvelope(12,9,5,2);
    verifyEnvelope(16,9,7,4);
    verifyEnvelope(20000,9007199254740991ULL,2,2);
    verifyEnvelope(0,frames,1,2147483648U);
    for(uint32_t binSize:{0U,3U,6U})zp::require(!(bool)waveformRangeResponse(source.getFile(),0,8,4,binSize)["ok"],"Non-power-of-two bin size must reject");
    zp::require(!(bool)waveformRangeResponse(source.getFile(),1,8,4,2)["ok"],"Unaligned source start must reject");
    zp::require(!(bool)waveformRangeResponse(source.getFile(),0,9,4,2)["ok"],"Partial final bin must count toward column budget");
    zp::require(!(bool)waveformRangeResponse(source.getFile(),0,8193,4096,1)["ok"],"Raw sample requests must not fall back to envelope");
    zp::require(!(bool)waveformRangeResponse(source.getFile(),0,9,4,1)["ok"],"Raw sample requests must honor twice-column budget");
    for(uint64_t start:{(uint64_t)frames,(uint64_t)frames+1,(uint64_t)9007199254740992ULL})zp::require(!(bool)waveformRangeResponse(source.getFile(),start,1,1)["ok"],"Out-of-source or unsafe start must reject");
    zp::require(!(bool)waveformRangeResponse(source.getFile(),0,0,1)["ok"],"Empty waveform range must reject");
    zp::require(!(bool)waveformRangeResponse(source.getFile(),0,9007199254740992ULL,1)["ok"],"Unsafe waveform frame count must reject");
    for(uint32_t columns:{0U,4097U})zp::require(!(bool)waveformRangeResponse(source.getFile(),0,1,columns)["ok"],"Invalid waveform columns must reject");
    zp_waveform_fence(700);
    verifySamples(0,8,4);
    zp_waveform_range_fence(2);
    zp::require(!(bool)waveformRangeResponse(source.getFile(),0,8,4)["ok"],"Range fence must cancel stale range requests");
    std::unique_ptr<char,decltype(&zp_free)> overview(zp_waveform(source.getFile().getFullPathName().toRawUTF8(),8,700),zp_free);
    zp::require(overview && (bool)zp::parse(overview.get())["ok"],"Range cancellation must not cancel overview requests");
    const auto current=waveformRangeResponse(source.getFile(),0,8,4,1,2);
    zp::require((bool)current["ok"],"Current range generation must remain usable");
    for(int channels:{64,65}) {
        juce::TemporaryFile wide(".wav");writeWideFloatWaveform(wide.getFile(),channels);
        const auto wideResponse=waveformRangeResponse(wide.getFile(),0,8,2,4,2);
        if(channels==65)zp::require(!(bool)wideResponse["ok"],"More than 64 source channels must reject before allocating decode buffers");
        else {
            zp::require((bool)wideResponse["ok"] && wideResponse["value"]["channels"].size()==64,"All 64 source channels must survive decoding");
            for(int channel=0;channel<64;++channel)for(int bin=0;bin<2;++bin) {
                const double expected=(double)(channel+1)/32;
                zp::require((double)wideResponse["value"]["channels"][channel]["min"][bin]==expected && (double)wideResponse["value"]["channels"][channel]["max"][bin]==expected,"Positive-only channel extrema must not acquire invented zero samples or channel copies");
            }
        }
    }
    juce::TemporaryFile invalid(".wav");writeWideFloatWaveform(invalid.getFile(),2,true);
    zp::require(!(bool)waveformRangeResponse(invalid.getFile(),0,8,4,1,2)["ok"],"Non-finite source samples must reject rather than inventing a signed line");
    zp::require(!(bool)waveformRangeResponse(invalid.getFile(),0,8,4,2,2)["ok"],"Non-finite envelope samples must reject rather than inventing extrema");
    const auto oversized=waveformRangeResponse(invalid.getFile(),0,8,1,2,2);
    zp::require(!(bool)oversized["ok"] && oversized["error"].toString().contains("bin count"),"Oversized bin plans must reject before decoding non-finite PCM");
}
void testAudioConfigurationBoundary(zp_session* session) {
    auto value=zp::parse(R"JSON({"host":"unavailable-test-host","inputDeviceId":null,"outputDeviceId":"unavailable-test-host::output","sampleRate":48000,"bufferFrames":512,"inputMono":[],"inputStereo":[],"outputMono":[2],"outputStereo":[0]})JSON");
    const auto config=zp::AudioConfiguration::decode(value);zp::require(config.outputMask().toString(2)=="111","Mono and stereo channel masks must be unioned");zp::require(config.outputEnabled(0,2) && config.outputEnabled(2,1) && !config.outputEnabled(0,1),"Mono/stereo route availability is independent");
    zp::require(!(bool)invoke(session,"configure",value)["ok"],"Unknown host must reject without opening hardware");
    auto previous=invoke(session,"devices",zp::object())["value"];zp::require(previous["configuration"].isVoid() && previous["state"].toString()=="closed","Invalid configuration must retain closed unconfigured state");
    for(const char* key:{"bufferFrames","outputMono","inputMono","deviceId"}) {
        auto invalid=juce::JSON::parse(juce::JSON::toString(value));
        if(juce::String(key)=="bufferFrames")zp::put(invalid,key,0);
        else if(juce::String(key)=="outputMono")zp::put(invalid,key,juce::Array<V>{0,0});
        else if(juce::String(key)=="inputMono")zp::put(invalid,key,juce::Array<V>{0});
        else zp::put(invalid,key,"legacy-device-request");
        bool rejected=false;try { zp::AudioConfiguration::decode(invalid); }catch(const std::exception&) { rejected=true; }zp::require(rejected,"Invalid or legacy configuration must reject: "+juce::String(key));
    }
    const auto query=zp::parse(R"JSON({"host":"unavailable-test-host","inputDeviceId":null,"outputDeviceId":null})JSON");zp::require(!(bool)invoke(session,"device_capabilities",query)["ok"],"Unknown capability host must reject");
    const auto after=invoke(session,"devices",zp::object())["value"];zp::require(after["state"].toString()=="closed" && (double)after["sampleRate"]==0 && (int)after["inputLatencyFrames"]==0 && (int)after["outputLatencyFrames"]==0,"Enumeration and capability requests must not acquire hardware");
}
void testDeviceAutomationBoundary() {
    auto r=request();auto track=r["state"]["project"]["tracks"][0];
    zp::put(track,"devices",zp::parse(R"([{"id":"utility","kind":"utility","enabled":true,"gainDb":0,"pan":0,"width":100}])"));
    zp::put(track,"automation",zp::parse(R"([{"id":"lane","target":{"kind":"device","deviceId":"utility","parameter":"gainDb"},"points":[{"id":"point","bar":1,"value":24}]}])"));
    zp::decode(r);
    for(const auto* invalid:{"missing-device","wrong-parameter","out-of-range","duplicate-device"}) {
        auto bad=r.clone();auto badTrack=bad["state"]["project"]["tracks"][0];auto target=badTrack["automation"][0]["target"];
        if(juce::String(invalid)=="missing-device")zp::put(target,"deviceId","missing");
        else if(juce::String(invalid)=="wrong-parameter")zp::put(target,"parameter","frequency");
        else if(juce::String(invalid)=="out-of-range") { auto point=badTrack["automation"][0]["points"][0];zp::put(point,"value",24.1); }
        else { auto other=badTrack.clone();zp::put(other,"id","other");zp::put(other,"kind","audio");zp::put(other,"output","main");bad["state"]["project"]["tracks"].getArray()->add(other); }
        bool rejected=false;try { zp::decode(bad); }catch(const std::exception&) { rejected=true; }
        zp::require(rejected,"Invalid device automation or cross-track device identity accepted");
    }
}
void testExternalDeviceBoundary() {
    auto value=zp::parse(R"([{"id":"external","kind":"external","enabled":true,"plugin":{"catalogId":"0000000000000000000000000000000000000000000000000000000000000000","format":"clap","classId":"fixture","name":"Fixture","vendor":"","version":"1","role":"effect"},"stateRef":null,"parameters":[{"id":"18446744073709551615","normalized":0.25}]}])");
    const auto devices=zp::decodeDevices(value);
    const auto& external=std::get<zp::ExternalSettings>(devices.front().settings);
    zp::require(external.parameters.front().id==std::numeric_limits<uint64_t>::max() && external.parameters.front().normalized==.25,"External parameter identity lost precision");
    for(const auto* invalid:{"duplicate","overflow","number","range","format"}) {
        auto bad=value.clone();auto device=bad[0];auto parameter=device["parameters"][0];
        const juce::String kind(invalid);
        if(kind=="duplicate")device["parameters"].getArray()->add(parameter.clone());
        else if(kind=="overflow")zp::put(parameter,"id","18446744073709551616");
        else if(kind=="number")zp::put(parameter,"id",42);
        else if(kind=="range")zp::put(parameter,"normalized",1.1);
        else { auto plugin=device["plugin"];zp::put(plugin,"format","unknown"); }
        bool rejected=false;try { zp::decodeDevices(bad); }catch(const std::exception&) { rejected=true; }
        zp::require(rejected,"Invalid external parameter or identity accepted");
    }
}
#include "device_model_tests.h"
}
int main() {
    try {
        juce::ScopedJuceInitialiser_GUI gui;
        zp::ScopedAudioPreferences preferences;
        testMidiVelocityBoundary();
        testV2WireBoundary();
        testSignedAudioSourceOffsets();
        testDeviceModel();
        testDeviceAutomationBoundary();
        testExternalDeviceBoundary();
        auto r=request();auto decoded=zp::decode(r);
        zp::require(std::abs(decoded.quartersPerBar-1.5)<1e-12,"Meter denominator mapping");
        zp::require(std::abs(decoded.barTime(3)-1.5)<1e-12,"One-based bar time mapping");
        zp::require(std::abs(decoded.secondsPerBar()-.75)<1e-12,"Fixed BPM seconds per bar mapping");
        char* error=nullptr;std::unique_ptr<zp_session,decltype(&zp_destroy)> handle(zp_create(&error),zp_destroy);if(!handle) { auto message=error?juce::String::fromUTF8(error):"Creation failed";zp_free(error);throw std::runtime_error(message.toStdString()); }
        testAudioConfigurationBoundary(handle.get());
        auto accepted=invoke(handle.get(),"apply",payload(r));zp::require((bool)accepted["ok"] && accepted["value"]["kind"].toString()=="accepted","Open acceptance");
        auto bad=request();zp::put(bad,"stage","commit");zp::put(bad,"sequence",1);zp::put(bad,"revision",1);auto project=bad["state"]["project"];zp::put(project,"unknown",true);
        zp::require(!(bool)invoke(handle.get(),"apply",payload(bad))["ok"],"Unknown fields must reject before mutation");
        auto query=zp::object();zp::put(query,"leaseId","native-test");auto snapshot=invoke(handle.get(),"telemetry",query)["value"];zp::require((int)observeNativeTransport(handle.get(),"native-test","native-protocol-test")["appliedSequence"]==0,"Invalid request atomic rollback");zp::require(snapshot["device"]["state"].toString()=="closed","Stopped edits must not acquire audio hardware");
        auto stale=request();zp::put(stale,"stage","commit");zp::put(stale,"sequence",1);zp::require(zp_stop_fence_for(handle.get(),"native-test","native-protocol-test",1),"Current owner stop fence rejected");
        zp::require(invoke(handle.get(),"apply",payload(stale))["value"]["kind"].toString()=="rejected","Stop epoch must reject pending apply");
        zp::require(invoke(handle.get(),"apply",payload(stale,1))["value"]["kind"].toString()=="accepted","New stop epoch remains usable");
        auto invalidRouting=request();auto tracks=invalidRouting["state"]["project"]["tracks"].getArray();auto track=tracks->getReference(0);zp::put(track,"output","missing-track");bool rejected=false;try { zp::decode(invalidRouting); }catch(const std::exception&) { rejected=true; }zp::require(rejected,"Unknown routes must reject");
        auto disconnected=request();auto disconnectedTracks=disconnected["state"]["project"]["tracks"].getArray();zp::put(disconnectedTracks->getReference(0),"mute",true);zp::require(zp::decode(disconnected).tracks[0].mute,"Track mute retained");
        invoke(handle.get(),"release",query);invoke(handle.get(),"release",query);
        auto ownerA=request();zp::put(ownerA,"sessionId","owner-A");zp::require(invoke(handle.get(),"apply",payload(ownerA,1,"lease-A"))["value"]["kind"].toString()=="accepted","Initial owner lease");
        auto badReplacement=request();zp::put(badReplacement,"sessionId","owner-B");zp::put(badReplacement,"unknown",true);zp::require(!(bool)invoke(handle.get(),"apply",payload(badReplacement,1,"lease-B"))["ok"],"Invalid replacement rejects before cutover");
        auto queryA=zp::object();zp::put(queryA,"leaseId","lease-A");zp::require(observeNativeTransport(handle.get(),"lease-A","owner-A")["sessionId"].toString()=="owner-A","Failed replacement retains old owner");
        auto ownerB=request();zp::put(ownerB,"sessionId","owner-B");zp::require(invoke(handle.get(),"apply",payload(ownerB,1,"lease-B"))["value"]["kind"].toString()=="accepted","New backend opens while old lease remains alive");
        invoke(handle.get(),"release",queryA);auto queryB=zp::object();zp::put(queryB,"leaseId","lease-B");zp::require(observeNativeTransport(handle.get(),"lease-B","owner-B")["sessionId"].toString()=="owner-B","Old lease release preserves new owner");
        zp::require(!zp_stop_fence_for(handle.get(),"lease-A","owner-A",2),"Retired owner fenced replacement");
        zp::put(ownerA,"stage","commit");zp::put(ownerA,"sequence",1);zp::require(invoke(handle.get(),"apply",payload(ownerA,1,"lease-A"))["value"]["kind"].toString()=="rejected","Retired owner cannot mutate replacement");invoke(handle.get(),"release",queryB);
        testActualSourceLoopRendering();
        testSourceTempoAnalysis();
        testSignedWaveformRanges();
        std::cout<<"Native protocol, timing, atomic rollback, stop fencing and device lease tests passed\n";
        return 0;
    }catch(const std::exception& e) { std::cerr<<e.what()<<'\n';return 1; }
}
