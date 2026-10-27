#include "engine_session.h"
#include "device_test_support.h"
#include "builtin_device.h"
#include "meter_read.h"
#include <juce_audio_formats/juce_audio_formats.h>
#include <juce_cryptography/juce_cryptography.h>
#include <tracktion_graph/tracktion_graph.h>
#include <tracktion_engine/playback/graph/tracktion_EditNodeBuilder.h>
#include <tracktion_engine/playback/graph/tracktion_TracktionEngineNode.h>
#include <tracktion_engine/playback/graph/tracktion_MidiNode.h>
#include <tracktion_engine/playback/graph/tracktion_LoopingMidiNode.h>
#include <algorithm>
#include <iostream>
#include <chrono>
#include <exception>
#include <thread>
void beginAllocationGuard() noexcept;
std::size_t endAllocationGuard() noexcept;
void beginAllocationFailure(std::size_t) noexcept;
bool endAllocationFailure() noexcept;
namespace zp {
struct MixerTestAccess {
    static te::Edit* edit(EngineSession& session) { return session.arrangement->edit.get(); }
    static std::unique_ptr<EngineSession::Arrangement> candidate(EngineSession& session,const Request& request) { return session.prepare(request); }
    static te::AudioTrack* track(EngineSession& session,const char* id) { return session.arrangement->tracks.at(id); }
    static te::AudioTrack* cue(EngineSession& session,const char* id) { return session.arrangement->cueTracks.at(id); }
    static bool hasCue(EngineSession& session,const char* id) { return session.arrangement->cueTracks.count(id)!=0; }
    static te::AuxSendPlugin* send(EngineSession& session,const char* id,const char* target) { return session.arrangement->sends.at(id).at(target); }
    static te::Plugin* envelope(EngineSession& session,const char* id) { return session.arrangement->envelopes.at(id); }
    static te::AudioClipBase* audioClip(EngineSession& session,const char* id) { return session.arrangement->audioClips.at(id); }
    static LiveMidiInput& midi(EngineSession& session,const char* id) { return *session.arrangement->midiInputs.at(id); }
    static int pending(EngineSession& session) { return session.pendingNotes.load(); }
    static const Request& request(EngineSession& session) { return *session.accepted; }
    static void hold(EngineSession& session,const NoteRequest& note) { session.heldNotes["mixer-test"][note.noteId]=note; }
    static size_t heldCount(EngineSession& session) { return session.heldNotes["mixer-test"].size(); }
    static const std::vector<SourceMapping>& sources(EngineSession& session) { return session.sourceRegistry.mappings(); }
    static void configureSourceGraph(EngineSession& session,te::Edit& edit,te::CreateNodeParams& params) { session.configureSourcePlayheads(edit,params); }
    static std::shared_ptr<const SourcePlayheadGraph> sourceGraph(EngineSession& session,te::Edit& edit) { const auto found=session.sourcePlayheadGraphs.find(&edit);return found==session.sourcePlayheadGraphs.end()?nullptr:found->second; }
    static te::Plugin* device(EngineSession& session,const char* id) { return session.arrangement->devices.at(id).get(); }
    static te::HostedAudioDeviceInterface& hosted(EngineSession& session) { return session.engine.getDeviceManager().getHostedAudioDeviceInterface(); }
    static juce::AudioDeviceManager& audioManager(EngineSession& session) { return session.engine.getDeviceManager().deviceManager; }
    static DeviceClock& clock(EngineSession& session) { return session.clock; }
    static void retainFailedRecording(EngineSession& session,const V& result,const juce::String& lease,const juce::String& id) {
        EngineSession::Recording failed;failed.id=id;failed.lease=lease;failed.session=result["sessionId"].toString();failed.result=result.clone();
        put(failed.result,"recordingId",id);failed.error="Injected recording writer failure; recovery files retained";
        session.closedRecordings.emplace(id,std::move(failed));
    }
    static bool hasRecording(EngineSession& session,const juce::String& id) { return session.closedRecordings.contains(id); }
    // Hosted audio aliases input and output; feed the original PCM before Tracktion overwrites it.
    static void feedHostedInputMeter(EngineSession& session,const juce::AudioBuffer<float>& audio,std::uint64_t start=0) {
        session.clock.inputMeter.process(audio.getArrayOfReadPointers(),audio.getNumChannels(),audio.getNumSamples(),start);
    }
    static void initialiseHostedInput(EngineSession& session,int inputChannels=1) {
        auto& manager=session.engine.getDeviceManager();manager.setCpuLimitBeforeMuting(1000.0);
        te::HostedAudioDeviceInterface::Parameters parameters;parameters.sampleRate=48000;parameters.blockSize=256;parameters.inputChannels=inputChannels;parameters.outputChannels=2;
        hosted(session).initialise(parameters);hosted(session).prepareToPlay(48000,256);manager.dispatchPendingUpdates();
        auto* device=manager.deviceManager.getCurrentAudioDevice();require(device && device->isOpen(),"Hosted input unavailable");
        AudioConfiguration config;config.host="Hosted Device";config.inputDeviceId=audioDeviceId(config.host,device->getName());config.outputDeviceId=config.inputDeviceId;config.sampleRate=48000;config.bufferFrames=256;for(int channel=0;channel<inputChannels;++channel)config.inputMono.push_back(channel);config.outputStereo={0};
        session.configuration=config;session.preferencesLoaded=true;session.devicesInitialised=true;session.applyChannelLayout(config);session.clock.audioDeviceAboutToStart(manager.deviceManager.getCurrentAudioDevice());
    }
    static void useUnavailableHostedInput(EngineSession& session) {
        session.configuration->inputDeviceId=audioDeviceId("Hosted Device","missing-test-input");
        session.configuration->outputDeviceId=session.configuration->inputDeviceId;
    }
    static void enableHostedStereoInput(EngineSession& session) {
        auto config=*session.configuration;config.inputStereo={0};session.configuration=config;session.applyChannelLayout(config);
    }
    static void disableHostedSecondInput(EngineSession& session) {
        auto config=*session.configuration;config.inputMono={0};session.configuration=config;session.applyChannelLayout(config);
        const auto inputs=session.engine.getDeviceManager().getWaveInputDevices();
        const auto second=std::find_if(inputs.begin(),inputs.end(),[](auto* device) { return device->getChannels()[0].indexInDevice==1 && device->getChannels().getNumChannels()==1; });
        require(second!=inputs.end() && !(*second)->isEnabled(),"Disabled hosted input remained enabled after layout application");
    }
};
}
namespace {
using namespace zp;
V copy(const V& value) { return value.clone(); }
V fixture() {
    auto request=parse(R"JSON({"protocolVersion":2,"sessionId":"live-mixer-regression","sequence":0,"baseRevision":0,"revision":0,"stage":"open","editId":null,"controlGeneration":"0","state":{"project":{"bpm":120,"numerator":4,"denominator":4,"loop":{"enabled":false,"startBar":1,"endBar":5},"sources":[],"tracks":[{"id":"main","kind":"main","output":"external","input":"none","inputChannel":null,"outputChannel":"1-2","monitor":"off","volumeDb":0,"pan":0,"mute":false,"solo":false,"armed":false,"sends":{},"returnPost":false,"cueOutput":null,"cueVolumeDb":-18,"devices":[],"clips":[],"automation":[],"childTrackIds":[]}]},"control":{"playing":false,"recording":false,"seekBar":2,"seekGeneration":0}}})JSON");
    auto* tracks=request["state"]["project"]["tracks"].getArray();
    for(const auto* id:{"audio","return","group","nested"}) {
        auto track=copy(tracks->getReference(0));put(track,"id",id);put(track,"kind",juce::String(id)=="return"?"return":juce::String(id)=="audio"?"audio":"group");put(track,"output","main");tracks->add(track);
    }
    auto audio=tracks->getReference(1);put(audio,"sends",parse(R"({"return":-12})"));put(audio,"cueOutput","1-2");
    auto group=tracks->getReference(3);put(group,"childTrackIds",juce::Array<V>{"nested"});
    auto nested=tracks->getReference(4);put(nested,"childTrackIds",juce::Array<V>{"audio"});
    return request;
}
V apply(EngineSession& session,const V& request,uint64_t epoch=0) {
    auto payload=object();put(payload,"request",request);put(payload,"leaseId","mixer-test");put(payload,"stopToken",(juce::int64)epoch);put(payload,"stopEpoch",(juce::int64)epoch);return session.call("apply",payload);
}
void next(V& request,int sequence,int base,int revision,const char* stage="preview") {
    put(request,"sequence",sequence);put(request,"baseRevision",base);put(request,"revision",revision);put(request,"stage",stage);put(request,"editId","mixer-gesture");
}
void accepted(const V& response,int revision) { require(response["kind"].toString()=="accepted" && (int)response["revision"]==revision,"Mixer acceptance/revision mismatch"); }
void testPluginAdmissionOwnership() {
    EngineSession session;auto request=fixture();accepted(apply(session,request),0);
    struct Release { int count=0;std::thread::id thread; } released;
    const auto descriptor=[&] { return zd_plugin_owned_processor{&released,[](void*,zd_plugin_block*)->int32_t{return 0;},[](void* value){auto& owner=*static_cast<Release*>(value);++owner.count;owner.thread=std::this_thread::get_id();}}; };
    for(const auto& owner:{std::pair{"other","live-mixer-regression"},std::pair{"mixer-test","other"}}) {
        bool rejected=false;try { session.admitPlugin(owner.first,owner.second,"device",0,descriptor(),{48000,512,2,2,1024}); }
        catch(const std::exception&) { rejected=true; }
        require(rejected,"Foreign plugin owner was admitted");
    }
    require(released.count==2 && released.thread==std::this_thread::get_id(),"Rejected admission did not release exactly once on control thread");
    const auto token=session.admitPlugin("mixer-test","live-mixer-regression","device",0,descriptor(),{48000,512,2,2,1024});
    bool foreign=false;try { session.cancelPlugin("other","live-mixer-regression",token); }catch(const std::exception&) { foreign=true; }
    require(foreign && released.count==2,"Foreign cancellation released the admitted processor");
    session.cancelPlugin("mixer-test","live-mixer-regression",token);
    session.cancelPlugin("mixer-test","live-mixer-regression",token);
    require(released.count==3,"Cancellation did not release exactly once");
    session.admitPlugin("mixer-test","live-mixer-regression","stale",0,descriptor(),{48000,512,2,2,1024});
    next(request,1,0,1,"commit");accepted(apply(session,request),1);
    require(released.count==4,"New revision retained an obsolete plugin admission");
    session.admitPlugin("mixer-test","live-mixer-regression","device",1,descriptor(),{48000,512,2,2,1024});
    auto release=object();put(release,"leaseId","mixer-test");session.call("release",release);
    require(released.count==5,"Lease release leaked pending plugin admission");
}
void testLiveMixer() {
    EngineSession session;auto request=fixture();accepted(apply(session,request),0);
    const auto originalCounters=session.call("diagnostics",object());
    auto* original=MixerTestAccess::edit(session);auto* audio=MixerTestAccess::track(session,"audio");auto* volume=audio->getVolumePlugin();auto* send=MixerTestAccess::send(session,"audio","return");
    auto baseline=copy(request);auto track=request["state"]["project"]["tracks"][1];
    for(int i=1;i<=60;++i) {
        put(track,"volumeDb",-i*.25);put(track,"pan",i/100.0);put(track,"cueVolumeDb",-18-i*.1);auto sends=track["sends"];put(sends,"return",-12-i*.2);
        next(request,i,0,0);accepted(apply(session,request),0);
        require(MixerTestAccess::edit(session)==original,"Volume gesture rebuilt the Edit and reset playback");
        require(audio->getVolumePlugin()==volume && MixerTestAccess::send(session,"audio","return")==send,"Mixer gesture replaced live plugins");
        require(std::abs(volume->getVolumeDb()+i*.25)<.01 && std::abs(volume->getPan()-i/100.0)<.001,"Live volume/pan plugin did not receive gesture");
        require(std::abs(send->getGainDb()+12+i*.2)<.01,"Live send plugin did not receive gain");
        require(std::abs(MixerTestAccess::cue(session,"audio")->getVolumePlugin()->getVolumeDb()+18+i*.1)<.01,"Live cue did not receive gain");
        const auto counters=session.call("diagnostics",object());for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})require((juce::int64)counters[key]==(juce::int64)originalCounters[key],"Parameter path changed native graph/seek/start counter");
    }
    auto project=request["state"]["project"];auto tracks=project["tracks"];
    auto group=tracks[3];put(group,"solo",true);next(request,61,0,0);accepted(apply(session,request),0);
    require(audio->isSolo(false) && MixerTestAccess::track(session,"nested")->isSolo(false),"Group solo did not propagate through nested groups");
    put(group,"solo",false);put(track,"mute",true);next(request,62,0,0);accepted(apply(session,request),0);
    require(!audio->isSolo(false) && audio->isMuted(false),"Group unsolo or mute remained stale");
    next(baseline,63,0,0,"cancel");accepted(apply(session,baseline),0);require(MixerTestAccess::edit(session)==original && !audio->isMuted(false) && std::abs(volume->getVolumeDb())<.01,"Cancel did not restore mixer in-place");
    next(request,64,0,1,"commit");accepted(apply(session,request),1);next(baseline,65,1,2,"commit");accepted(apply(session,baseline),2);
    require(MixerTestAccess::edit(session)==original && std::abs(volume->getVolumeDb())<.01,"Undo-style commit rebuilt mixer");
    auto bad=copy(baseline);next(bad,66,2,3,"commit");auto badTrack=bad["state"]["project"]["tracks"][1];put(badTrack,"pan",2);bool threw=false;try { apply(session,bad); }catch(const std::exception&) { threw=true; }require(threw && MixerTestAccess::edit(session)==original && std::abs(volume->getPan())<.001,"Invalid mixer request mutated native state");
    session.stopToken.store(1);next(request,66,2,3,"commit");require(apply(session,request)["kind"].toString()=="rejected" && std::abs(volume->getVolumeDb())<.01,"Stop fence accepted a stale mixer update");
    next(baseline,66,2,3,"commit");auto changedProject=baseline["state"]["project"];put(changedProject,"bpm",121);accepted(apply(session,baseline,1),3);
    auto telemetry=object();put(telemetry,"leaseId","mixer-test");require(session.call("telemetry",telemetry)["device"]["state"].toString()=="closed","Stopped mixer updates acquired audio device");
}
void testGraphClassification() {
    const auto original=fixture();const auto decoded=decode(original);
    auto changed=copy(original);auto project=changed["state"]["project"];auto loop=project["loop"];put(loop,"enabled",true);put(loop,"endBar",8);require(sameGraph(decoded,decode(changed)),"Loop-only change rebuilt graph");
    for(const auto* fieldName:{"output","input","inputChannel","outputChannel","monitor","cueOutput","armed","returnPost","kind","childTrackIds","sends","automation","clips"}) {
        auto altered=decoded;auto& track=altered.tracks[1];const juce::String field(fieldName);
        if(field=="output")track.output="none";else if(field=="input")track.input="external";else if(field=="inputChannel")track.inputChannel="1";else if(field=="outputChannel")track.outputChannel="1";else if(field=="monitor")track.monitor="in";else if(field=="cueOutput")track.cueOutput="none";else if(field=="armed")track.armed=true;else if(field=="returnPost")track.returnPost=true;else if(field=="kind")track.kind="midi";else if(field=="childTrackIds")track.children.push_back("main");else if(field=="sends")track.sends.clear();else if(field=="automation")track.automation=parse(R"([{"id":"automation-changed"}])");else { Clip clip;clip.data=parse(R"({"id":"clip-added"})");track.clips.push_back(clip); }
        require(!sameGraph(decoded,altered),"Structural field was omitted from graph comparison: "+field);
    }
    auto altered=decoded;Clip clip;clip.data=parse(R"({"id":"existing","gainDb":0,"audioSettings":{"reverse":false},"notes":[]})");altered.tracks[1].clips.push_back(clip);auto other=altered;other.tracks[1].clips[0].data=copy(clip.data);auto settings=other.tracks[1].clips[0].data["audioSettings"];put(settings,"reverse",true);require(!sameGraph(altered,other),"Nested clip content change was missed");
    auto automated=copy(original);auto track=automated["state"]["project"]["tracks"][1];put(track,"automation",parse(R"([{"id":"volume-lane","target":{"kind":"mixer","parameter":"volume"},"points":[{"id":"p","bar":1,"value":-9}]}])"));
    EngineSession session;accepted(apply(session,automated),0);auto* edit=MixerTestAccess::edit(session);auto* parameter=MixerTestAccess::track(session,"audio")->getVolumePlugin()->volParam.get();auto curveSize=parameter->getCurve().getNumPoints();put(track,"pan",.4);next(automated,1,0,0);accepted(apply(session,automated),0);require(MixerTestAccess::edit(session)==edit && parameter->getCurve().getNumPoints()==curveSize && curveSize==1,"Mixer change discarded authored automation");
    const auto originalAutomation=track["automation"].clone();
    put(track,"automation",parse(R"([{"id":"pan-lane","target":{"kind":"mixer","parameter":"pan"},"points":[{"id":"left","bar":1,"value":-1},{"id":"right","bar":3,"value":1,"curve":0.5}]}])"));
    next(automated,2,0,1,"commit");accepted(apply(session,automated),1);
    auto* volume=MixerTestAccess::track(session,"audio")->getVolumePlugin();
    require(MixerTestAccess::edit(session)==edit && volume->volParam.get()==parameter && parameter->getCurve().getNumPoints()==0 && std::abs(volume->getVolumeDb())<.01,"Automation retarget left stale volume automation or replaced native owner");
    auto& panCurve=volume->panParam->getCurve();
    require(panCurve.getNumPoints()==2 && panCurve.getPointValue(0)==-1 && panCurve.getPointValue(1)==1 && panCurve.getPointCurve(1)==.5f && std::abs(panCurve.getPointTime(1).inSeconds()-4)<.0001,"Automation points lost value, curve or musical position");
    put(track,"automation",originalAutomation);next(automated,3,1,2,"commit");accepted(apply(session,automated),2);
    require(MixerTestAccess::edit(session)==edit && panCurve.getNumPoints()==0 && std::abs(volume->getPan()-.4)<.001 && parameter->getCurve().getNumPoints()==1 && std::abs(te::volumeFaderPositionToDB(parameter->getCurve().getPointValue(0))+9)<.01,"Undo automation retarget did not restore curves and authored pan");
}
V fadeFixture(const juce::File& source) {
    auto request=fixture();auto project=request["state"]["project"];auto tracks=project["tracks"];
    auto audio=tracks[1];put(audio,"cueOutput",V());put(audio,"sends",object());
    auto clip=parse(R"({"id":"fade-clip","kind":"audio","startBar":1,"lengthBars":2,"sourceOffsetBars":0,"mute":false,"sourceId":"fade-source","gainDb":0,"audioSettings":{"warp":false,"warpMode":"soundtouch","sourceBpm":120,"transpose":0,"detune":0,"reverse":false,"loop":false,"loopStartBars":0,"loopLengthBars":2,"startMarkerBars":0,"endMarkerBars":2},"fadeInBars":0.4,"fadeOutBars":0.4,"fadeInOffsetBars":0.1,"fadeOutOffsetBars":0.1,"fadeInCurve":0.2,"fadeOutCurve":0.2,"fadeInCurvePosition":0.4,"fadeOutCurvePosition":0.6})");
    put(audio,"clips",juce::Array<V>{clip});
    auto metadata=object();put(metadata,"id","fade-source");put(metadata,"uri",source.getFullPathName());put(metadata,"sha256",juce::String::repeatedString("0",64));put(metadata,"frames",192000);put(metadata,"sampleRate",48000);put(metadata,"channels",1);put(project,"sources",juce::Array<V>{metadata});
    return request;
}
std::vector<float> renderEnvelope(te::Plugin& plugin) {
    constexpr int frames=192000,blockSize=256;std::vector<float> result;result.reserve(frames);
    juce::AudioBuffer<float> buffer(2,blockSize);
    for(int offset=0;offset<frames;offset+=blockSize) {
        const int count=std::min(blockSize,frames-offset);
        for(int channel=0;channel<2;++channel)std::fill_n(buffer.getWritePointer(channel),count,1.0f);
        const auto begin=te::TimePosition::fromSeconds(offset/48000.0),end=te::TimePosition::fromSeconds((offset+count)/48000.0);
        te::PluginRenderContext context(&buffer,0,count,nullptr,0,te::TimeRange(begin,end),true,false,true,false);plugin.applyToBuffer(context);
        result.insert(result.end(),buffer.getReadPointer(0),buffer.getReadPointer(0)+count);
        for(int sample=0;sample<count;++sample)require(std::isfinite(buffer.getSample(0,sample)) && buffer.getSample(0,sample)==buffer.getSample(1,sample),"Envelope produced invalid or incoherent stereo samples");
    }
    return result;
}
double envelopeDifference(const std::vector<float>& a,const std::vector<float>& b) {
    require(a.size()==b.size(),"Envelope render length changed");double difference=0;for(size_t i=0;i<a.size();++i)difference+=std::abs(a[i]-b[i]);return difference/a.size();
}
void testLiveFades() {
    juce::TemporaryFile source(".wav");juce::WavAudioFormat wav;auto stream=source.getFile().createOutputStream();require(stream!=nullptr,"Cannot create fade source");
    std::unique_ptr<juce::AudioFormatWriter> writer(wav.createWriterFor(stream.release(),48000,1,24,{},0));require(writer!=nullptr,"Cannot write fade source");
    juce::AudioBuffer<float> tone(1,192000);for(int i=0;i<tone.getNumSamples();++i)tone.setSample(0,i,.25f);require(writer->writeFromAudioSampleBuffer(tone,0,tone.getNumSamples()),"Cannot populate fade source");writer.reset();
    EngineSession session;auto baseline=fadeFixture(source.getFile());accepted(apply(session,baseline),0);
    auto* edit=MixerTestAccess::edit(session);auto* envelope=MixerTestAccess::envelope(session,"fade-clip");envelope->initialise({te::TimePosition(),48000,256});
    const auto initial=renderEnvelope(*envelope);require(initial[4800]<.001f && initial[96000]>.99f && initial[187200]<.001f,"Actual Envelope did not apply baseline fade attenuation");
    const auto decoded=decode(baseline);int sequence=0,revision=0;
    const std::pair<const char*,double> changes[]={{"fadeInBars",.6},{"fadeOutBars",.6},{"fadeInOffsetBars",.2},{"fadeOutOffsetBars",.2},{"fadeInCurve",-.7},{"fadeOutCurve",-.7},{"fadeInCurvePosition",.8},{"fadeOutCurvePosition",.2}};
    for(const auto& [field,value]:changes) {
        auto request=copy(baseline);auto clip=request["state"]["project"]["tracks"][1]["clips"][0];put(clip,field,value);
        require(sameGraph(decoded,decode(request)),"Fade-only change classified as structural: "+juce::String(field));
        next(request,++sequence,revision,revision);accepted(apply(session,request),revision);
        require(MixerTestAccess::edit(session)==edit && MixerTestAccess::envelope(session,"fade-clip")==envelope,"Fade preview rebuilt Edit or Envelope: "+juce::String(field));
        const auto preview=renderEnvelope(*envelope);require(envelopeDifference(initial,preview)>.005,"Fade preview did not alter actual Envelope audio: "+juce::String(field));
        auto cancel=copy(baseline);next(cancel,++sequence,revision,revision,"cancel");accepted(apply(session,cancel),revision);
        require(MixerTestAccess::edit(session)==edit && MixerTestAccess::envelope(session,"fade-clip")==envelope,"Fade cancel rebuilt Edit or Envelope: "+juce::String(field));
        require(envelopeDifference(initial,renderEnvelope(*envelope))<1e-7,"Cancel did not restore actual fade audio: "+juce::String(field));
        next(request,++sequence,revision,revision+1,"commit");++revision;accepted(apply(session,request),revision);
        require(MixerTestAccess::edit(session)==edit && MixerTestAccess::envelope(session,"fade-clip")==envelope,"Fade commit rebuilt Edit or Envelope: "+juce::String(field));
        require(envelopeDifference(preview,renderEnvelope(*envelope))<1e-7,"Commit did not retain preview fade audio: "+juce::String(field));
        auto undo=copy(baseline);next(undo,++sequence,revision,revision+1,"commit");++revision;accepted(apply(session,undo),revision);
        require(MixerTestAccess::edit(session)==edit && MixerTestAccess::envelope(session,"fade-clip")==envelope && envelopeDifference(initial,renderEnvelope(*envelope))<1e-7,"Undo-style commit rebuilt graph or failed to restore fades: "+juce::String(field));
    }
    for(double position:{.1,.5,.9})for(double bend:{-1.0,0.0,.35,1.0}) {
        auto request=copy(baseline);auto clip=request["state"]["project"]["tracks"][1]["clips"][0];
        put(clip,"fadeInCurvePosition",position);put(clip,"fadeOutCurvePosition",position);
        put(clip,"fadeInCurve",bend);put(clip,"fadeOutCurve",bend);
        next(request,++sequence,revision,revision);accepted(apply(session,request),revision);
        const auto samples=renderEnvelope(*envelope);
        const auto inSample=static_cast<size_t>(std::llround((.1+.4*position)*2*48000));
        const auto outSample=static_cast<size_t>(std::llround((2-.1-.4+.4*position)*2*48000));
        const double anchorHeight=.5+bend*.4;
        require(std::abs(samples[inSample]-anchorHeight)<1e-6 && std::abs(samples[outSample]-(1-anchorHeight))<1e-6,
                "Audible fade did not pass through the displayed draggable control point");
        require(samples[9600]==0 && samples[48000]==1 && samples[144000]==1 && samples[182400]<1e-6,
                "Custom fade boundaries did not match visible offset/length");
    }
    auto restored=copy(baseline);next(restored,++sequence,revision,revision,"cancel");accepted(apply(session,restored),revision);
    auto* audioClip=MixerTestAccess::audioClip(session,"fade-clip");
    auto liveLevel=audioClip->getLiveClipLevel();
    const auto counters=session.call("diagnostics",object());
    for(const auto* field:{"gainDb","mute"}) {
        auto request=copy(baseline);auto authored=request["state"]["project"]["tracks"][1]["clips"][0];
        if(juce::String(field)=="gainDb")put(authored,field,-6.020599913);else put(authored,field,true);
        require(sameGraph(decoded,decode(request)),"Live clip parameter classified as structural");
        next(request,++sequence,revision,revision);accepted(apply(session,request),revision);
        require(MixerTestAccess::audioClip(session,"fade-clip")==audioClip && MixerTestAccess::edit(session)==edit,"Live clip parameter replaced native identity");
        require(std::abs(liveLevel.getGainIncludingMute()-(juce::String(field)=="gainDb"?.5f:0.f))<1e-6,"Existing live clip level did not adopt parameter");
        auto cancel=copy(baseline);next(cancel,++sequence,revision,revision,"cancel");accepted(apply(session,cancel),revision);
        require(std::abs(liveLevel.getGainIncludingMute()-1.f)<1e-6,"Clip parameter cancel did not restore live output gain");
        for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})require((juce::int64)session.call("diagnostics",object())[key]==(juce::int64)counters[key],"Clip parameter rebuilt or restarted transport");
    }
    for(const auto* field:{"sourceId","startBar","lengthBars","sourceOffsetBars","id"}) {
        auto changed=copy(baseline);auto clip=changed["state"]["project"]["tracks"][1]["clips"][0];
        if(juce::String(field)=="sourceId")put(clip,field,V());else if(juce::String(field)=="id")put(clip,field,"replacement");else put(clip,field,(double)clip[field]+.1);
        require(!sameGraph(decoded,decode(changed)),"Non-fade clip change bypassed graph rebuild: "+juce::String(field));
    }
    auto changed=copy(baseline);auto settings=changed["state"]["project"]["tracks"][1]["clips"][0]["audioSettings"];put(settings,"reverse",true);require(!sameGraph(decoded,decode(changed)),"Audio settings change bypassed graph rebuild");
    changed=copy(baseline);auto metadata=changed["state"]["project"]["sources"][0];put(metadata,"sha256",juce::String::repeatedString("1",64));require(!sameGraph(decoded,decode(changed)),"Source metadata change bypassed graph rebuild");
    for(const auto* field:{"startBar","lengthBars","sourceOffsetBars"}) {
        auto moved=copy(baseline);auto authored=moved["state"]["project"]["tracks"][1]["clips"][0];
        put(authored,field,(double)authored[field]+(juce::String(field)=="sourceOffsetBars"?.2:.1));
        next(moved,++sequence,revision,revision+1,"commit");++revision;accepted(apply(session,moved),revision);
        require(MixerTestAccess::edit(session)==edit && MixerTestAccess::audioClip(session,"fade-clip")==audioClip,
                "Moving or trimming a clip replaced the playing Edit/Clip");
        require(std::abs(audioClip->getPosition().getStart().inSeconds()-((double)authored["startBar"]-1)*2)<1e-6 &&
                std::abs(audioClip->getPosition().getLength().inSeconds()-(double)authored["lengthBars"]*2)<1e-6 &&
                std::abs(audioClip->getPosition().getOffset().inSeconds()-(double)authored["sourceOffsetBars"]*2)<1e-6,
                "Clip placement did not reach the native clip");
        require(MixerTestAccess::envelope(session,"fade-clip")==envelope,"Clip placement replaced the custom fade processor");
        const auto movedAudio=renderEnvelope(*envelope);
        if(juce::String(field)=="startBar") {
            for(size_t frame=9600;frame<movedAudio.size();++frame)
                require(std::abs(movedAudio[frame]-initial[frame-9600])<1e-5,"Moving clip did not move its complete custom fade curve");
        } else if(juce::String(field)=="lengthBars") {
            require(std::abs(movedAudio[24000]-initial[24000])<1e-6 && movedAudio[180000]>initial[180000]+.05f,
                    "Resizing clip changed fade-in or failed to move fade-out with its end");
        } else {
            require(std::abs(movedAudio[96000]-initial[96000])<1e-6 && movedAudio[176000]==0 && initial[176000]>0,
                    "Source offset did not preserve fades and apply source marker boundary");
        }
        for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})
            require((juce::int64)session.call("diagnostics",object())[key]==(juce::int64)counters[key],"Clip placement rebuilt Edit or restarted transport");
        auto undo=copy(baseline);next(undo,++sequence,revision,revision+1,"commit");++revision;accepted(apply(session,undo),revision);
        require(MixerTestAccess::audioClip(session,"fade-clip")==audioClip && audioClip->getPosition().getStart().inSeconds()==0,
                "Clip placement undo lost identity or original position");
        require(envelopeDifference(initial,renderEnvelope(*envelope))<1e-7,"Placement undo did not restore custom fade audio");
    }
    envelope->deinitialise();
    EngineSession reorderedSession;auto reordered=copy(baseline);
    auto destination=copy(reordered["state"]["project"]["tracks"][1]);put(destination,"id","destination");put(destination,"clips",juce::Array<V>{});
    reordered["state"]["project"]["tracks"].getArray()->add(destination);
    auto* clips=reordered["state"]["project"]["tracks"][1]["clips"].getArray();
    auto second=copy(clips->getReference(0));put(second,"id","second-clip");put(second,"startBar",5);put(second,"gainDb",-9);clips->add(second);
    accepted(apply(reorderedSession,reordered),0);
    auto* retainedEdit=MixerTestAccess::edit(reorderedSession);
    auto* retainedClip=MixerTestAccess::audioClip(reorderedSession,"fade-clip");
    auto* retainedSecond=MixerTestAccess::audioClip(reorderedSession,"second-clip");
    auto moved=copy(clips->getReference(0));put(moved,"startBar",1.1);clips->remove(0);clips->add(moved);
    next(reordered,1,0,1,"commit");accepted(apply(reorderedSession,reordered),1);
    require(MixerTestAccess::edit(reorderedSession)==retainedEdit && MixerTestAccess::audioClip(reorderedSession,"fade-clip")==retainedClip,
            "Web move array reordering replaced the Edit or moved clip");
    require(MixerTestAccess::audioClip(reorderedSession,"second-clip")==retainedSecond && std::abs(retainedSecond->getLiveClipLevel().getGain()-std::pow(10.f,-9.f/20))<1e-6,
            "Clip reordering changed the unrelated clip's identity or gain");
    auto* retainedEnvelope=MixerTestAccess::envelope(reorderedSession,"fade-clip");
    auto crossTrack=copy(reordered);
    auto* sourceClips=crossTrack["state"]["project"]["tracks"][1]["clips"].getArray();
    auto transferred=copy(sourceClips->getReference(1));sourceClips->remove(1);
    crossTrack["state"]["project"]["tracks"][5]["clips"].getArray()->add(transferred);
    next(crossTrack,2,1,2,"commit");accepted(apply(reorderedSession,crossTrack),2);
    require(MixerTestAccess::edit(reorderedSession)==retainedEdit && MixerTestAccess::audioClip(reorderedSession,"fade-clip")==retainedClip &&
            MixerTestAccess::envelope(reorderedSession,"fade-clip")==retainedEnvelope,"Cross-track move replaced native objects");
    require(retainedClip->getTrack()==MixerTestAccess::track(reorderedSession,"destination"),"Cross-track move did not change native owner");
    next(reordered,3,2,3,"commit");accepted(apply(reorderedSession,reordered),3);
    require(MixerTestAccess::audioClip(reorderedSession,"fade-clip")==retainedClip && retainedClip->getTrack()==MixerTestAccess::track(reorderedSession,"audio"),
            "Cross-track undo did not return the same clip");
    const auto mappingsBefore=MixerTestAccess::sources(reorderedSession);
    auto deleted=copy(reordered);deleted["state"]["project"]["tracks"][1]["clips"].getArray()->remove(1);
    next(deleted,4,3,4,"commit");accepted(apply(reorderedSession,deleted),4);
    require(MixerTestAccess::edit(reorderedSession)==retainedEdit && MixerTestAccess::audioClip(reorderedSession,"second-clip")==retainedSecond,
            "Deleting an audio clip replaced the Edit or unrelated clip");
    require(MixerTestAccess::track(reorderedSession,"audio")->getClips().size()==1,"Deleted clip still belongs to native track");
    const auto& deletedMappings=MixerTestAccess::sources(reorderedSession);
    require(std::none_of(deletedMappings.begin(),deletedMappings.end(),[](const SourceMapping& item){return item.clipId=="fade-clip";}),
            "Deleted clip retained an active source observation mapping");
    next(reordered,5,4,5,"commit");accepted(apply(reorderedSession,reordered),5);
    require(MixerTestAccess::edit(reorderedSession)==retainedEdit && MixerTestAccess::audioClip(reorderedSession,"second-clip")==retainedSecond &&
            MixerTestAccess::track(reorderedSession,"audio")->getClips().size()==2,"Undo deletion rebuilt unrelated playback or did not restore clip");
    const auto& restoredMappings=MixerTestAccess::sources(reorderedSession);
    for(const auto& mapping:mappingsBefore) {
        const auto restored=std::find_if(restoredMappings.begin(),restoredMappings.end(),[&](const SourceMapping& item){return item.clipId==mapping.clipId;});
        require(restored!=restoredMappings.end() && restored->clipHandle==mapping.clipHandle && restored->sourceHandle==mapping.sourceHandle,
                "Undo deletion changed stable clip/source observation identities");
    }
    auto empty=copy(reordered);empty["state"]["project"]["tracks"][1]["clips"].getArray()->clear();
    empty["state"]["project"]["sources"].getArray()->clear();
    next(empty,6,5,6,"commit");accepted(apply(reorderedSession,empty),6);
    require(MixerTestAccess::edit(reorderedSession)==retainedEdit && MixerTestAccess::sources(reorderedSession).empty(),
            "Web removal of the last source replaced Edit or retained source mappings");
    next(reordered,7,6,7,"commit");accepted(apply(reorderedSession,reordered),7);
    require(MixerTestAccess::edit(reorderedSession)==retainedEdit && MixerTestAccess::track(reorderedSession,"audio")->getClips().size()==2,
            "Restoring source registry rebuilt Edit instead of restoring native clips");
    auto invalidInsert=copy(reordered);auto invalidTrack=invalidInsert["state"]["project"]["tracks"][1];
    const auto oldVolume=MixerTestAccess::track(reorderedSession,"audio")->getVolumePlugin()->getVolumeDb();
    put(invalidTrack,"volumeDb",-30);
    auto invalidClip=copy(invalidTrack["clips"][0]);put(invalidClip,"id","invalid-ratio");
    auto invalidSettings=invalidClip["audioSettings"];put(invalidSettings,"warp",true);put(invalidSettings,"sourceBpm",1);
    invalidTrack["clips"].getArray()->add(invalidClip);next(invalidInsert,8,7,8,"commit");
    bool invalidRejected=false;try { apply(reorderedSession,invalidInsert); }catch(const std::exception&) { invalidRejected=true; }
    require(invalidRejected && MixerTestAccess::track(reorderedSession,"audio")->getVolumePlugin()->getVolumeDb()==oldVolume &&
            MixerTestAccess::track(reorderedSession,"audio")->getClips().size()==2 && MixerTestAccess::request(reorderedSession).revision==7,
            "Rejected clip insertion changed accepted mixer or clip state");
    auto newDestination=copy(reordered);auto* newTracks=newDestination["state"]["project"]["tracks"].getArray();
    auto newTrack=copy(newTracks->getReference(5));put(newTrack,"id","new-destination");
    auto* movingClips=newTracks->getReference(1)["clips"].getArray();auto moving=movingClips->getReference(1);movingClips->remove(1);put(newTrack,"clips",juce::Array<V>{moving});newTracks->add(newTrack);
    auto* movingNative=MixerTestAccess::audioClip(reorderedSession,"fade-clip");
    next(newDestination,8,7,8,"commit");accepted(apply(reorderedSession,newDestination),8);
    require(MixerTestAccess::edit(reorderedSession)==retainedEdit && MixerTestAccess::audioClip(reorderedSession,"fade-clip")==movingNative && movingNative->getTrack()==MixerTestAccess::track(reorderedSession,"new-destination"),"Moving audio to a newly inserted track replaced its identity");
    next(reordered,9,8,9,"commit");accepted(apply(reorderedSession,reordered),9);
    require(MixerTestAccess::edit(reorderedSession)==retainedEdit && MixerTestAccess::audioClip(reorderedSession,"fade-clip")==movingNative && movingNative->getTrack()==MixerTestAccess::track(reorderedSession,"audio"),"Deleting destination before returning clip destroyed the retained clip");
    auto converted=copy(reordered);auto convertedTrack=converted["state"]["project"]["tracks"][1];put(convertedTrack,"kind","midi");put(convertedTrack,"clips",juce::Array<V>{});
    auto* convertedNative=MixerTestAccess::track(reorderedSession,"audio");next(converted,10,9,10,"commit");accepted(apply(reorderedSession,converted),10);
    require(MixerTestAccess::edit(reorderedSession)==retainedEdit && MixerTestAccess::track(reorderedSession,"audio")==convertedNative && convertedNative->getClips().isEmpty(),"Audio-to-MIDI conversion retained clips or replaced track");
    require(MixerTestAccess::midi(reorderedSession,"audio").enqueue({60,100,true,0}),"Converted MIDI track has no live input");
    NoteRequest held;held.trackId="audio";held.noteId="conversion-note";held.on=true;MixerTestAccess::hold(reorderedSession,held);
    next(reordered,11,10,11,"commit");accepted(apply(reorderedSession,reordered),11);
    require(MixerTestAccess::edit(reorderedSession)==retainedEdit && MixerTestAccess::track(reorderedSession,"audio")==convertedNative && convertedNative->getClips().size()==2 && MixerTestAccess::heldCount(reorderedSession)==0,"MIDI-to-audio restoration lost clips or retained held notes");
}
void testTrackLifecycle() {
    EngineSession session;auto request=fixture();accepted(apply(session,request),0);
    auto* edit=MixerTestAccess::edit(session);auto* retained=MixerTestAccess::track(session,"audio");
    auto* tracks=request["state"]["project"]["tracks"].getArray();
    const int originalCount=te::getAudioTracks(*edit).size();
    auto source=copy(tracks->getReference(1));put(source,"id","added-source");put(source,"kind","midi");put(source,"sends",object());
    auto receiver=copy(tracks->getReference(1));put(receiver,"id","added-target");put(receiver,"input","added-source");put(receiver,"sends",object());put(receiver,"cueOutput",V());
    tracks->add(source);tracks->add(receiver);next(request,1,0,1,"commit");accepted(apply(session,request),1);
    require(MixerTestAccess::edit(session)==edit && MixerTestAccess::track(session,"audio")==retained && te::getAudioTracks(*edit).size()==originalCount+3,"Track insertion replaced unrelated tracks or omitted Cue");
    require(MixerTestAccess::midi(session,"added-source").enqueue({60,100,true,0}),"Added MIDI track did not accept an event");
    NoteRequest note;note.trackId="added-source";note.noteId="removed-note";note.pitch=60;note.on=true;MixerTestAccess::hold(session,note);
    auto inserted=copy(request);tracks->removeLast(2);next(request,2,1,2,"commit");accepted(apply(session,request),2);
    require(MixerTestAccess::edit(session)==edit && MixerTestAccess::track(session,"audio")==retained && te::getAudioTracks(*edit).size()==originalCount && MixerTestAccess::heldCount(session)==0,"Deleting connected tracks retained Cue, held notes or replaced unrelated owner");
    next(inserted,3,2,3,"commit");accepted(apply(session,inserted),3);
    require(MixerTestAccess::edit(session)==edit && te::getAudioTracks(*edit).size()==originalCount+3 && MixerTestAccess::midi(session,"added-source").queued()==0,"Undo track deletion reused stale MIDI state or lost Cue");
    auto audio=inserted["state"]["project"]["tracks"][1];auto* retainedCue=MixerTestAccess::cue(session,"audio");
    put(audio,"cueOutput","3-4");next(inserted,4,3,4,"commit");accepted(apply(session,inserted),4);
    require(MixerTestAccess::edit(session)==edit && MixerTestAccess::cue(session,"audio")==retainedCue,"Cue destination switch replaced the Edit or Cue track");
    put(audio,"cueOutput",V());next(inserted,5,4,5,"commit");accepted(apply(session,inserted),5);
    require(MixerTestAccess::edit(session)==edit && te::getAudioTracks(*edit).size()==originalCount+2,"Cue disable did not remove its native track");
    put(audio,"cueOutput","1-2");next(inserted,6,5,6,"commit");accepted(apply(session,inserted),6);
    require(MixerTestAccess::edit(session)==edit && te::getAudioTracks(*edit).size()==originalCount+3,"Undo Cue disable replaced Edit or failed to restore Cue");
    // A cue on the track's own physical output would sum the same signal twice.
    auto main=inserted["state"]["project"]["tracks"][0];
    put(main,"cueOutput",main["outputChannel"]);next(inserted,7,6,7,"commit");accepted(apply(session,inserted),7);
    require(!MixerTestAccess::hasCue(session,"main"),"Cue on the track's own output doubled the signal");
    put(main,"cueOutput","3-4");next(inserted,8,7,8,"commit");accepted(apply(session,inserted),8);
    require(MixerTestAccess::hasCue(session,"main"),"Cue on a separate output was not created");
}
void testDeviceChain() {
    EngineSession session;auto request=fixture();auto audio=request["state"]["project"]["tracks"][1];
    auto utility=parse(R"({"id":"utility","kind":"utility","enabled":true,"gainDb":-6,"pan":0,"width":100})");
    auto filter=parse(R"({"id":"filter","kind":"filter","enabled":true,"frequency":1000,"resonance":0.2})");
    put(audio,"devices",juce::Array<V>{utility,filter});accepted(apply(session,request),0);
    auto* edit=MixerTestAccess::edit(session);auto* track=MixerTestAccess::track(session,"audio");auto* first=MixerTestAccess::device(session,"utility");auto* second=MixerTestAccess::device(session,"filter");
    auto* send=MixerTestAccess::send(session,"audio","return");auto& list=track->pluginList;
    require(list.indexOf(first)<list.indexOf(second) && list.indexOf(second)<list.indexOf(send) && list.indexOf(send)<list.indexOf(track->getVolumePlugin()),"Device processing order bypassed pre-fader send");
    put(utility,"gainDb",24);next(request,1,0,0);accepted(apply(session,request),0);
    require(MixerTestAccess::edit(session)==edit && MixerTestAccess::device(session,"utility")==first && MixerTestAccess::device(session,"filter")==second,"Device parameter edit replaced native processing state");
    audio["devices"].getArray()->move(0,1);next(request,2,0,1,"commit");accepted(apply(session,request),1);
    require(MixerTestAccess::device(session,"utility")==first && MixerTestAccess::device(session,"filter")==second && list.indexOf(second)<list.indexOf(first) && list.indexOf(first)<list.indexOf(send),"Device reorder replaced instances or changed send tap position");
    put(audio,"devices",juce::Array<V>{filter});auto receiver=request["state"]["project"]["tracks"][2];put(receiver,"devices",juce::Array<V>{utility});
    next(request,3,1,2,"commit");accepted(apply(session,request),2);
    require(MixerTestAccess::device(session,"utility")==first && first->getOwnerTrack()==MixerTestAccess::track(session,"return"),"Cross-track device move replaced processing state");
    put(audio,"devices",juce::Array<V>{});next(request,4,2,3,"commit");accepted(apply(session,request),3);
    require(MixerTestAccess::edit(session)==edit && MixerTestAccess::device(session,"utility")==first,"Device deletion replaced unrelated processing state");
}
#include "builtin_device_tests.h"
#include "control_tests.h"
#include "transport_clock_tests.h"
#include "transport_adoption_tests.h"
#include "clip_continuity_tests.h"
#include "input_routing_tests.h"
#include "recording_queue_tests.h"
#include "recording_tests.h"
#include "edit_transaction_probe.h"
#include "source_publication_tests.h"
#include "launcher_tests.h"
}
int main(int argc,char** argv) {
    try {
        juce::ScopedJuceInitialiser_GUI gui;zp::ScopedAudioPreferences preferences;
        if(argc>1) {
            if(argc==2 && juce::String(argv[1])=="--launcher") { testSessionLauncher(1,4,4);testSessionLauncher(2,3,8);testSessionInputMonitor();return 0; }
            if(argc==2 && juce::String(argv[1])=="--midi-mute") { testRepeatedMidiMuteTransitions();return 0; }
            if(argc==2 && juce::String(argv[1])=="--recording") { testHostedRecording();return 0; }
            if(argc==2 && juce::String(argv[1])=="--source-publication") { testSourceGraphPublication();return 0; }
            if(argc==2 && juce::String(argv[1])=="--transaction-model") { transaction_probe::run();return 0; }
            if(argc==2 && juce::String(argv[1])=="--stopped-input") {
                testStoppedProjectInputActivation();std::cout<<"Focused stopped input activation passed\n";return 0;
            }
            require(argc==2 && juce::String(argv[1])=="--transport-clock","Unknown native regression selector");
            testHostedTransportClock();testTransportClockAdoption();
            std::cout<<"Focused hosted transport clock tests passed\n";return 0;
        }
        testSourceGraphPublication();
        testRepeatedMidiMuteTransitions();
        testHostedTempoWaveContinuity();testHostedClipEditContinuity();testHostedTransportClock();testTransportClockAdoption();testPluginAdmissionOwnership();testLiveMixer();testGraphClassification();testLiveFades();testTrackLifecycle();testDeviceChain();{EngineSession session;auto request=fixture();accepted(apply(session,request),0);testBuiltinDeviceDsp(*MixerTestAccess::edit(session));}testNarrowControl();testLiveMidiGraph();testAuthoredMidiClip();testHostedInputRouting();testRecordingQueue();testHostedRecording();testStoppedProjectInputActivation();testRecordingInputSelection();testMultiTrackRecordingAndMonitor();testRecordingTransportTransitions();std::cout<<"In-place mixer/fades, track/device lifecycle and DSP, MIDI scheduling, hosted input monitoring and recording tests passed\n";return 0;
    }
    catch(const std::exception& error) { std::cerr<<error.what()<<'\n';return 1; }
}
