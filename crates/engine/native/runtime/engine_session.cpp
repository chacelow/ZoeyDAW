#include "engine_session.h"
#include "audio_clips.h"
#include "builtin_device.h"
#include "isolated_device_plugin.h"
#include <tracktion_graph/tracktion_graph.h>
#include <algorithm>
#include <array>
#include <cmath>
#include <chrono>
#include <cstring>
#include <limits>
namespace zp {
namespace {
class Storage final : public te::PropertyStorage {
public:
    Storage():PropertyStorage("ZoeydawNativePlayback") {}
    juce::File getAppCacheFolder() override { const auto overridePath=juce::SystemStats::getEnvironmentVariable("ZOEYDAW_AUDIO_CACHE_PATH",{});auto f=overridePath.isNotEmpty()?juce::File(overridePath):juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory).getChildFile("Zoeydaw/playback-cache");require(f.createDirectory().wasOk(),"Cannot create audio cache");return f; }
    juce::File getAppPrefsFolder() override { return getAppCacheFolder(); }
    void removeProperty(te::SettingID id) override { values.erase((int)id); }
    V getProperty(te::SettingID id,const V& fallback) override { auto i=values.find((int)id);return i==values.end()?fallback:i->second; }
    void setProperty(te::SettingID id,const V& v) override { values[(int)id]=v; }
    std::unique_ptr<juce::XmlElement> getXmlProperty(te::SettingID id) override { return juce::parseXML(getProperty(id,{}).toString()); }
    void setXmlProperty(te::SettingID id,const juce::XmlElement& xml) override { setProperty(id,xml.toString()); }
    void removePropertyItem(te::SettingID id,juce::StringRef key) override { items.erase(juce::String((int)id)+":"+key); }
    V getPropertyItem(te::SettingID id,juce::StringRef key,const V& fallback) override { auto i=items.find(juce::String((int)id)+":"+key); return i==items.end()?fallback:i->second; }
    void setPropertyItem(te::SettingID id,juce::StringRef key,const V& v) override { items[juce::String((int)id)+":"+key]=v; }
    std::unique_ptr<juce::XmlElement> getXmlPropertyItem(te::SettingID id,juce::StringRef key) override { return juce::parseXML(getPropertyItem(id,key,{}).toString()); }
    void setXmlPropertyItem(te::SettingID id,juce::StringRef key,const juce::XmlElement& xml) override { setPropertyItem(id,key,xml.toString()); }
private:
    std::map<int,V> values;
    std::map<juce::String,V> items;
};
class Behaviour final : public te::EngineBehaviour {
public:
    std::function<void(te::Edit&,te::CreateNodeParams&)> configureGraph;
    bool muteTrackContentsWhilstRecording() override { return true; }
    std::function<juce::File(te::Track&,const juce::String&)> recordingPath;
    juce::File getFileForNewAudioRecording(te::Track& track,const juce::String& extension) override {
        require(static_cast<bool>(recordingPath),"Recording path owner missing");return recordingPath(track,extension);
    }
    void configurePlaybackGraph(te::Edit& edit,te::CreateNodeParams& params) override {
        if(configureGraph)configureGraph(edit,params);
    }
    bool autoInitialiseDeviceManager() override { return false; }
    bool shouldOpenAudioInputByDefault() override { return false; }
    bool isDescriptionOfWaveDevicesSupported() override { return true; }
    std::optional<AudioConfiguration> waveLayout;
    void describeWaveDevices(std::vector<te::WaveDeviceDescription>& descriptions,juce::AudioIODevice& device,bool input) override {
        const int count=(input?device.getInputChannelNames():device.getOutputChannelNames()).size();
        descriptions.clear();
        const auto* mono=waveLayout?(input?&waveLayout->inputMono:&waveLayout->outputMono):nullptr;
        const auto* stereo=waveLayout?(input?&waveLayout->inputStereo:&waveLayout->outputStereo):nullptr;
        for(int channel=0;channel<count;++channel)descriptions.emplace_back(juce::String(channel+1),te::ChannelConfiguration::mono(channel),mono && std::find(mono->begin(),mono->end(),channel)!=mono->end());
        for(int channel=0;channel+1<count;channel+=2)descriptions.emplace_back(juce::String(channel+1)+"-"+juce::String(channel+2),te::ChannelConfiguration::stereo(channel),stereo?std::find(stereo->begin(),stereo->end(),channel)!=stereo->end():!input && channel==0);
    }
};
class CapturePlugin final : public te::Plugin {
public:
    CapturePlugin(te::PluginCreationInfo info,std::shared_ptr<Capture> state):Plugin(info),capture(std::move(state)) {}
    juce::String getName() const override { return "Pre-device verification capture"; }
    juce::String getSelectableDescription() override { return getName(); }
    juce::String getPluginType() override { return "zoeydaw-verification-capture"; }
    BusLayout getBusses() const override { return BusLayout::singlePassThrough(); }
    int getNumOutputChannelsGivenInputs(int n) override { return std::max(2,n); }
    bool producesAudioWhenNoAudioInput() override { return true; }
    void initialise(const te::PluginInitialisationInfo&) override {}
    void deinitialise() override {}
    void applyToBuffer(const te::PluginRenderContext& rc) override {
        if(!rc.destBuffer)return;
        if(!rc.isPlaying)capture->stoppedFrames.fetch_add((uint64_t)rc.bufferNumSamples,std::memory_order_relaxed);
        const size_t begin=capture->frames.load(std::memory_order_relaxed),capacity=capture->samples.size()/2;
        const size_t count=std::min((size_t)rc.bufferNumSamples,capacity-std::min(begin,capacity));
        for(size_t i=0;i<count;++i)for(int ch=0;ch<2;++ch)capture->samples[(begin+i)*2+ch]=rc.destBuffer->getSample(std::min(ch,rc.destBuffer->getNumChannels()-1),rc.bufferStartSample+(int)i);
        capture->frames.store(begin+count,std::memory_order_release);
    }
private:
    std::shared_ptr<Capture> capture;
};
class SafetyGate final : public te::Plugin {
public:
    SafetyGate(te::PluginCreationInfo info, const std::atomic<uint64_t>& fence, const std::atomic<uint64_t>* epoch, uint64_t fixed, const std::atomic<bool>* enabled,const std::atomic<bool>* monitoring,std::atomic<uint64_t>& processed,std::atomic<uint64_t>& cleared)
        : Plugin(info), current(fence), acceptedEpoch(epoch), fixedEpoch(fixed), audible(enabled),monitoringAudible(monitoring),processedFrames(processed),clearedFrames(cleared) {}
    juce::String getName() const override { return "Playback safety fence"; }
    juce::String getSelectableDescription() override { return getName(); }
    juce::String getPluginType() override { return "zoeydaw-playback-fence"; }
    BusLayout getBusses() const override { return BusLayout::singlePassThrough(); }
    int getNumOutputChannelsGivenInputs(int n) override { return n; }
    void initialise(const te::PluginInitialisationInfo&) override {}
    void deinitialise() override {}
    void applyToBuffer(const te::PluginRenderContext& rc) override {
        if(rc.isRendering)return;
        const auto epoch=acceptedEpoch?acceptedEpoch->load(std::memory_order_acquire):fixedEpoch;
        processedFrames.fetch_add((uint64_t)rc.bufferNumSamples,std::memory_order_relaxed);
        if(rc.destBuffer && (current.load(std::memory_order_acquire)!=epoch || (audible && !audible->load(std::memory_order_acquire) && !(monitoringAudible && monitoringAudible->load(std::memory_order_acquire))))) {
            rc.destBuffer->clear(rc.bufferStartSample,rc.bufferNumSamples);
            clearedFrames.fetch_add((uint64_t)rc.bufferNumSamples,std::memory_order_relaxed);
        }
    }
private:
    const std::atomic<uint64_t>& current;
    const std::atomic<uint64_t>* acceptedEpoch;
    const uint64_t fixedEpoch;
    const std::atomic<bool>* audible;
    const std::atomic<bool>* monitoringAudible;
    std::atomic<uint64_t>& processedFrames;
    std::atomic<uint64_t>& clearedFrames;
};
class PluginFactory final : public te::PluginManager::BuiltInType {
public:
    PluginFactory(const char* type,std::function<te::Plugin::Ptr(te::PluginCreationInfo)> create):BuiltInType(type),factory(std::move(create)) {}
    te::Plugin::Ptr create(te::PluginCreationInfo info) override { return factory(info); }
private:
    std::function<te::Plugin::Ptr(te::PluginCreationInfo)> factory;
};
juce::ValueTree pluginState(const char* type) { juce::ValueTree state(te::IDs::PLUGIN);state.setProperty(te::IDs::type,type,nullptr);return state; }
void unity(te::VolumeAndPanPlugin* p) { require(p!=nullptr,"Missing volume plugin");p->setVolumeDb(0);p->setPan(0);p->setPanLaw(te::PanLawLinear); }
void tempo(te::Edit& edit,double bpm,int num,int den) { edit.tempoSequence.getTempo(0)->setBpm(bpm);edit.tempoSequence.getTimeSig(0)->setStringTimeSig(juce::String(num)+"/"+juce::String(den));unity(edit.getMasterVolumePlugin().get()); }
te::WaveOutputDevice* outputFor(te::DeviceManager& dm,const juce::String& channel) {
    auto parts=juce::StringArray::fromTokens(channel,"-","");
    if(parts.isEmpty())return dm.getDefaultWaveOutDevice();
    const int first=parts[0].getIntValue()-1,last=parts.size()>1?parts[1].getIntValue()-1:first;
    for(auto* output:dm.getWaveOutputDevices()) {
        auto& channels=output->getChannels();
        if(channels.getNumChannels()==last-first+1 && channels[0].indexInDevice==first && channels[channels.getNumChannels()-1].indexInDevice==last)return output;
    }
    return nullptr;
}
te::AuxSendPlugin* addSend(te::Edit& edit,te::AudioTrack& track,int bus,double db,int index) {
    auto p=edit.getPluginCache().createNewPlugin(te::AuxSendPlugin::xmlTypeName,{});
    auto* send=dynamic_cast<te::AuxSendPlugin*>(p.get());require(send!=nullptr,"Cannot create send");send->busNumber=bus;send->setGainDb((float)db);track.pluginList.insertPlugin(p,index,nullptr);
    return send;
}
/** A cue routed to the track's own physical output would sum the same signal twice. */
bool cueEnabled(const Track& t) {
    if(t.cueOutput.isEmpty() || t.cueOutput=="none")return false;
    if(t.output=="none")return false;
    return !(t.output=="external" && t.outputChannel==t.cueOutput);
}
void applyMixerAutomation(te::AudioTrack& track,const Track& source,const Request& request) {
    auto* volume=track.getVolumePlugin();
    volume->volParam->getCurve().clear(nullptr);volume->panParam->getCurve().clear(nullptr);
    for(const auto& lane:*source.automation.getArray()) {
        const auto& target=field(lane,"target");
        if(text(target,"kind")!="mixer")continue;
        const bool isVolume=text(target,"parameter")=="volume";
        auto parameter=isVolume?volume->volParam:volume->panParam;
        for(const auto& point:array(lane,"points")) {
            const float value=(float)number(point,"value",-1e12,1e12);
            const float curve=point.hasProperty("curve")?(float)number(point,"curve",-1,1):0;
            parameter->getCurve().addPoint(te::TimePosition::fromSeconds(request.barTime(number(point,"bar",1,1e12))),isVolume?te::decibelsToVolumeFaderPosition(value):value,curve,nullptr);
        }
    }
    volume->volParam->updateStream();volume->panParam->updateStream();
    if(volume->volParam->getCurve().getNumPoints()==0)volume->setVolumeDb((float)source.volume);
    if(volume->panParam->getCurve().getNumPoints()==0)volume->setPan((float)source.pan);
}
}
void DeviceClock::audioDeviceAboutToStart(juce::AudioIODevice* device) {
    rate.store(device->getCurrentSampleRate());lastTick=0;
    bool prepared=false;
    try { prepared=inputMeter.prepare(static_cast<std::uint32_t>(device->getActiveInputChannels().countNumberOfSetBits())); }
    catch(...) { inputMeter.stop(); }
    failed.store(!prepared);active.store(prepared);
}
void DeviceClock::audioDeviceStopped() { inputMeter.stop();active.store(false); }
void DeviceClock::audioDeviceError(const juce::String&) { inputMeter.stop();failed.store(true);active.store(false); }
void DeviceClock::audioDeviceIOCallbackWithContext(const float* const* inputs,int inputChannels,float* const* outputs,int channels,int count,const juce::AudioIODeviceCallbackContext&) {
    inputMeter.process(inputs,inputChannels,count,frames.load(std::memory_order_relaxed));
    for(int ch=0;ch<channels;++ch)if(outputs[ch])std::fill_n(outputs[ch],count,0.0f);
    const auto now=juce::Time::getHighResolutionTicks();
    if(lastTick!=0) {
        const double interval=juce::Time::highResolutionTicksToSeconds(now-lastTick);
        if(interval>maxIntervalSeconds.load(std::memory_order_relaxed))maxIntervalSeconds.store(interval,std::memory_order_relaxed);
        if(interval>count/rate.load(std::memory_order_relaxed)*1.5)lateCallbacks.fetch_add(1,std::memory_order_relaxed);
    }
    lastTick=now;frames.fetch_add((uint64_t)count,std::memory_order_relaxed);callbacks.fetch_add(1,std::memory_order_relaxed);
}
EngineSession::Arrangement::~Arrangement() {
    for(auto& job:sourceRenders)job->removeListener(this);
    if(edit)edit->getTransport().stop(false,true);
}
void EngineSession::setWaveDeviceLayout(const std::optional<AudioConfiguration>& config) {
    static_cast<Behaviour&>(engine.getEngineBehaviour()).waveLayout=config;
}
EngineSession::EngineSession():engine(std::make_unique<Storage>(),std::make_unique<te::UIBehaviour>(),std::make_unique<Behaviour>()) {
    require(juce::MessageManager::getInstance()->isThisTheMessageThread(),"Playback owner must be created on the main thread");
    static_cast<Behaviour&>(engine.getEngineBehaviour()).configureGraph=[this](te::Edit& edit,te::CreateNodeParams& params) { configureMeterGraph(edit,params); };
    static_cast<Behaviour&>(engine.getEngineBehaviour()).recordingPath=[this](te::Track& track,const juce::String& extension) { return recordingFile(track,extension); };
    auto& plugins=engine.getPluginManager();
    plugins.registerBuiltInType(std::make_unique<PluginFactory>("zoeydaw-source-envelope",createSourceEnvelope));
    plugins.registerBuiltInType(std::make_unique<PluginFactory>("zoeydaw-playback-fence",[this](te::PluginCreationInfo info) {
        const bool audition=(bool)info.state["audition"];
        return te::Plugin::Ptr(new SafetyGate(info,audition?auditionGeneration:stopToken,audition?nullptr:&arrangementEpoch,(uint64_t)(juce::int64)info.state["generation"],audition?nullptr:&arrangementAudible,audition?nullptr:&monitoringAudible,gateProcessedFrames,gateClearedFrames));
    }));
    plugins.registerBuiltInType(std::make_unique<PluginFactory>("zoeydaw-verification-capture",[this](te::PluginCreationInfo info) { return te::Plugin::Ptr(new CapturePlugin(info,(bool)info.state["preview"]?previewCapture:capture)); }));
    plugins.registerBuiltInType(std::make_unique<PluginFactory>("zoeydaw-live-midi-input",[this](te::PluginCreationInfo info) { return te::Plugin::Ptr(new LiveMidiInput(info,pendingNotes,stopToken)); }));
    plugins.registerBuiltInType(std::make_unique<PluginFactory>(BuiltinDevice::xmlTypeName,[](te::PluginCreationInfo info) { return te::Plugin::Ptr(new BuiltinDevice(info)); }));
    plugins.registerBuiltInType(std::make_unique<PluginFactory>(IsolatedDevicePlugin::xmlTypeName,[this](te::PluginCreationInfo info) {
        const auto token=static_cast<uint64_t>(static_cast<juce::int64>(info.state["pluginAdmission"]));
        const auto found=pluginAdmissions.find(token);
        require(found!=pluginAdmissions.end() && found->second.device==info.state["deviceId"].toString(),"Unknown isolated plugin admission");
        const bool applying=pluginApplyOwner && *pluginApplyOwner==std::tuple{found->second.lease,found->second.session,found->second.revision};
        require(applying || (accepted && accepted->session==found->second.session && accepted->revision==found->second.revision
            && leases.count(found->second.lease)),"Stale isolated plugin admission");
        auto plugin=te::Plugin::Ptr(new IsolatedDevicePlugin(info,found->second.binding,info.state["name"].toString()));
        pluginAdmissions.erase(found);
        return plugin;
    }));
}
EngineSession::~EngineSession() { finishRecording();if(arrangement)arrangement->edit->getTransport().removeListener(this);stopPreview();arrangement.reset();engine.getDeviceManager().deviceManager.removeAudioCallback(&clock);engine.getDeviceManager().closeDevices(); }
uint64_t EngineSession::admitPlugin(const juce::String& lease,const juce::String& session,const juce::String& device,
    uint64_t revision,zd_plugin_owned_processor processor,IsolatedPluginFormat format) {
    require(processor.context && processor.release,"Invalid owned plugin descriptor");
    std::unique_ptr<void,void(*)(void*)> pending(processor.context,processor.release);
    require(juce::MessageManager::getInstance()->isThisTheMessageThread(),"Plugin admission outside main thread");
    const bool applying=pluginApplyOwner && *pluginApplyOwner==std::tuple{lease,session,revision};
    require(applying || (accepted && leases.count(lease) && accepted->session==session && accepted->revision==revision),"Stale plugin admission owner");
    require(device.isNotEmpty() && pluginAdmissions.size()<256,"Invalid plugin admission or capacity exceeded");
    require(nextPluginAdmission<uint64_t(std::numeric_limits<juce::int64>::max()),"Plugin admission sequence exhausted");
    for(const auto& [id,entry]:pluginAdmissions)require(entry.session!=session || entry.device!=device,"Plugin admission already pending");
    const auto token=++nextPluginAdmission;
    pending.release();
    auto binding=pluginBindings.retainOwned(processor,format);
    pluginAdmissions.emplace(token,PluginAdmission{lease,session,device,revision,std::move(binding)});
    return token;
}
void EngineSession::cancelPlugin(const juce::String& lease,const juce::String& session,uint64_t token) {
    require(juce::MessageManager::getInstance()->isThisTheMessageThread(),"Plugin cancellation outside main thread");
    const auto found=pluginAdmissions.find(token);
    if(found!=pluginAdmissions.end()) {
        require(found->second.lease==lease && found->second.session==session,"Plugin admission owner mismatch");
        pluginAdmissions.erase(found);
    }
    pluginBindings.collect();
}
V EngineSession::applyPrepared(const V& payload,zd_plugin_prepared* processors,uint32_t count) {
    require(juce::MessageManager::getInstance()->isThisTheMessageThread(),"Prepared apply outside main thread");
    require(!pluginApplyOwner,"Nested prepared plugin application");
    const auto request=decode(field(payload,"request"));const auto lease=text(payload,"leaseId");
    require(count<=256,"Prepared plugin capacity exceeded");
    std::set<juce::String> devices;
    for(uint32_t index=0;index<count;++index) {
        require(processors[index].device_id!=nullptr,"Missing prepared device identity");
        const juce::String id(processors[index].device_id);
        require(devices.insert(id).second,"Duplicate prepared device identity");
        bool found=false;
        for(const auto& track:request.tracks)for(const auto& device:track.devices)
            if(device.id==id && std::holds_alternative<ExternalSettings>(device.settings))found=true;
        require(found,"Prepared processor has no authored external device");
    }
    pluginApplyOwner=std::tuple{lease,request.session,request.baseRevision};
    std::vector<uint64_t> tokens;tokens.reserve(count);
    struct Cleanup {
        EngineSession& owner;const juce::String& lease;const juce::String& session;std::vector<uint64_t>& tokens;
        ~Cleanup() { owner.pluginApplyOwner.reset();for(auto token:tokens)owner.cancelPlugin(lease,session,token); }
    } cleanup {*this,lease,request.session,tokens};
    for(uint32_t index=0;index<count;++index) {
        auto& prepared=processors[index];const auto processor=prepared.processor;prepared.processor.context=nullptr;
        tokens.push_back(admitPlugin(lease,request.session,prepared.device_id,request.baseRevision,processor,
            {prepared.sample_rate,prepared.quantum,prepared.input_channels,prepared.output_channels,prepared.latency_frames}));
    }
    return apply(payload);
}
void EngineSession::publishStopOwner(std::pair<std::string,std::string> owner) {
    { const std::lock_guard<std::mutex> lock(stopOwnerMutex);stopOwner.swap(owner); }
}
void EngineSession::publishPendingStopOwner(std::pair<std::string,std::string> owner) {
    { const std::lock_guard<std::mutex> lock(stopOwnerMutex);if(owner!=pendingStopOwner) { pendingStopOwner.swap(owner);pendingOwnerStopEpoch.store(0,std::memory_order_release); } }
}
void EngineSession::beginPendingCall(const char* lease,const char* session) {
    require(juce::MessageManager::getInstance()->isThisTheMessageThread(),"Pending playback owner outside main thread");require(lease && session && *lease && *session,"Invalid pending playback owner");publishPendingStopOwner({lease,session});
}
void EngineSession::endPendingCall() { publishPendingStopOwner({}); }
bool EngineSession::stopFenceFor(const char* lease,const char* session,uint64_t token) noexcept {
    if(!lease || !session || !*lease || !*session)return false;
    try {
        const std::lock_guard<std::mutex> lock(stopOwnerMutex);
        const bool active=stopOwner.first==lease && stopOwner.second==session;
        const bool pending=pendingStopOwner.first==lease && pendingStopOwner.second==session;
        if(pending)pendingOwnerStopEpoch.store(std::max(token,pendingOwnerStopEpoch.load(std::memory_order_relaxed)),std::memory_order_release);
        if(!active)return pending;
        auto previous=stopToken.load(std::memory_order_acquire);
        while(previous<token && !stopToken.compare_exchange_weak(previous,token,std::memory_order_acq_rel)) {}
        arrangementAudible.store(false,std::memory_order_release);monitoringAudible.store(false,std::memory_order_release);return true;
    } catch(...) { return false; }
}
void EngineSession::releaseDeviceIfIdle() {
    if(!leases.empty() || preview)return;
    engine.getDeviceManager().deviceManager.removeAudioCallback(&clock);engine.getDeviceManager().closeDevices();devicesInitialised=false;clock.rate.store(0);
}
void EngineSession::stopPreview() { stopTimer();if(preview)preview->getTransport().stop(false,true);preview.reset();previewDuration=0;previewSourceDuration=0;sourceRegistry.clearPreview(); }
double EngineSession::previewPositionSeconds() const {
    if(!preview)return 0;
    auto& transport=preview->getTransport();
    if(transport.isPlaying())if(auto* context=transport.getCurrentPlaybackContext()) {
        if(auto pending=context->getPendingPositionChange())return pending->inSeconds();
        return context->getPosition().inSeconds();
    }
    return transport.getPosition().inSeconds();
}
void EngineSession::updateCue(Arrangement& a,te::AudioTrack& track,const Track& t) {
    const bool enabled=cueEnabled(t);
    auto existing=a.cueTracks.find(t.id);
    if(!enabled) {
        if(existing==a.cueTracks.end())return;
        te::Plugin::Ptr send(a.cueSends.at(t.id));a.cueSends.erase(t.id);send->deleteFromParent();
        a.meterOutputs.erase(existing->second);a.edit->deleteTrack(existing->second);a.cueTracks.erase(existing);
        return;
    }
    if(existing!=a.cueTracks.end()) { existing->second->getVolumePlugin()->setVolumeDb((float)t.cueVolume);return; }
    auto cue=a.edit->insertNewAudioTrack(te::TrackInsertPoint::getEndOfTracks(*a.edit),nullptr);require(cue!=nullptr,"Cannot create cue track");
    cue->setName("Cue: "+t.id);unity(cue->getVolumePlugin());cue->getVolumePlugin()->setVolumeDb((float)t.cueVolume);cue->setSoloIsolate(true);a.cueTracks.emplace(t.id,cue.get());
    if(auto* meter=cue->getLevelMeterPlugin())meter->deleteFromParent();
    const auto id=t.id.toStdString();a.meterOutputs.emplace(cue.get(),MeterOutputIdentity{"cue/"+id+"/out",id,"cue"});
    const int bus=a.nextBus++;auto ret=a.edit->getPluginCache().createNewPlugin(te::AuxReturnPlugin::xmlTypeName,{});dynamic_cast<te::AuxReturnPlugin&>(*ret).busNumber=bus;cue->pluginList.insertPlugin(ret,0,nullptr);
    a.cueSends.emplace(t.id,addSend(*a.edit,track,bus,0,-1));
    cue->pluginList.insertPlugin(a.edit->getPluginCache().createNewPlugin(pluginState("zoeydaw-playback-fence")),-1,nullptr);
}
void EngineSession::updateTrackKind(Arrangement& a,te::AudioTrack& track,const Track& t) {
    auto existing=a.midiInputs.find(t.id);
    if(t.kind=="midi" && existing==a.midiInputs.end()) {
        auto input=a.edit->getPluginCache().createNewPlugin(pluginState("zoeydaw-live-midi-input"));
        auto* midi=dynamic_cast<LiveMidiInput*>(input.get());require(midi!=nullptr,"Cannot create live MIDI input");
        track.pluginList.insertPlugin(input,0,nullptr);a.midiInputs.emplace(t.id,midi);
        a.issues.add(issue("instrument-unavailable","Live MIDI reaches the native track input, but this track has no loaded native instrument",{},t.id));
    } else if(t.kind!="midi" && existing!=a.midiInputs.end()) {
        existing->second->allNotesOff();te::Plugin::Ptr removed(existing->second);a.midiInputs.erase(existing);removed->deleteFromParent();
        for(auto& [lease,notes]:heldNotes)std::erase_if(notes,[&](const auto& note){return note.second.trackId==t.id;});
        for(int index=a.issues.size();--index>=0;)if(a.issues[index]["trackId"]==V(t.id) && a.issues[index]["code"]==V("instrument-unavailable"))a.issues.remove(index);
    }
}
void EngineSession::initialiseTrack(Arrangement& a,te::AudioTrack& track,const Track& t,const Request& r) {
    track.setName(t.id);a.tracks.emplace(t.id,&track);
    if(auto* meter=track.getLevelMeterPlugin())meter->deleteFromParent();
    const std::string kind=t.kind=="main"?"master":(t.kind=="group" || t.kind=="return"?"bus":"track-out");
    const std::string prefix=kind=="master"?"master":(kind=="bus"?"bus":"track");
    const auto id=t.id.toStdString();const auto endpoint=prefix+"/"+id+"/out";
    a.meterOutputs.emplace(&track,MeterOutputIdentity{endpoint,id,kind});a.meterEndpointIds.emplace(t.id,endpoint);
    unity(track.getVolumePlugin());track.getVolumePlugin()->setVolumeDb((float)t.volume);track.getVolumePlugin()->setPan((float)t.pan);track.setMute(t.mute);track.setSolo(t.effectiveSolo);
    updateTrackKind(a,track,t);
    const int bus=a.nextBus++;a.buses.emplace(t.id,bus);
    auto plugin=a.edit->getPluginCache().createNewPlugin(te::AuxReturnPlugin::xmlTypeName,{});
    auto* ret=dynamic_cast<te::AuxReturnPlugin*>(plugin.get());require(ret!=nullptr,"Cannot create return");ret->busNumber=bus;track.pluginList.insertPlugin(plugin,0,nullptr);
    updateCue(a,track,t);
    applyMixerAutomation(track,t,r);
    track.pluginList.insertPlugin(a.edit->getPluginCache().createNewPlugin(pluginState("zoeydaw-playback-fence")),-1,nullptr);
}
void EngineSession::removeUnusedTracks(Arrangement& a,const Request& next) {
    for(auto it=a.inputSends.begin();it!=a.inputSends.end();) {
        if(std::any_of(next.tracks.begin(),next.tracks.end(),[&](const Track& track){return track.id==it->first;})) { ++it;continue; }
        te::Plugin::Ptr removed(it->second);it=a.inputSends.erase(it);removed->deleteFromParent();
    }
    for(auto it=a.tracks.begin();it!=a.tracks.end();) {
        const auto& id=it->first;
        if(std::any_of(next.tracks.begin(),next.tracks.end(),[&](const Track& track){return track.id==id;})) { ++it;continue; }
        a.sends.erase(id);a.buses.erase(id);a.meterEndpointIds.erase(id);
        a.cueSends.erase(id);
        if(auto midi=a.midiInputs.find(id);midi!=a.midiInputs.end()) { midi->second->allNotesOff();a.midiInputs.erase(midi); }
        for(auto& [lease,notes]:heldNotes)std::erase_if(notes,[&](const auto& note){return note.second.trackId==id;});
        if(auto cue=a.cueTracks.find(id);cue!=a.cueTracks.end()) {
            a.meterOutputs.erase(cue->second);a.edit->deleteTrack(cue->second);a.cueTracks.erase(cue);
        }
        for(int index=a.issues.size();--index>=0;)if(a.issues[index]["trackId"]==V(id))a.issues.remove(index);
        a.meterOutputs.erase(it->second);a.edit->deleteTrack(it->second);it=a.tracks.erase(it);
    }
}
std::unique_ptr<EngineSession::Arrangement> EngineSession::prepare(const Request& r) {
    ++arrangementBuilds;
    auto a=std::make_unique<Arrangement>();a->edit=te::Edit::createSingleTrackEdit(engine);require(a->edit!=nullptr,"Cannot create arrangement Edit");
    a->inputState=r;
    a->edit->ensureNumberOfAudioTracks((int)r.tracks.size());tempo(*a->edit,r.bpm,r.numerator,r.denominator);a->edit->clickTrackEnabled=r.metronome;
    auto tracks=te::getAudioTracks(*a->edit);
    for(size_t i=0;i<r.tracks.size();++i)initialiseTrack(*a,*tracks[(int)i],r.tracks[i],r);
    for(const auto& t:r.tracks) {
        auto* track=a->tracks.at(t.id);
        for(const auto& [id,db]:t.sends) { const auto target=std::find_if(r.tracks.begin(),r.tracks.end(),[&](const Track& other){return other.id==id;});a->sends[t.id][id]=addSend(*a->edit,*track,a->buses.at(id),db,target->returnPost?-1:track->pluginList.indexOf(track->getVolumePlugin())); }
        if(a->tracks.count(t.input)) { const auto source=std::find_if(r.tracks.begin(),r.tracks.end(),[&](const Track& src){return src.id==t.input;});if(source->output!=t.id)a->inputSends.emplace(t.id,addSend(*a->edit,*a->tracks.at(t.input),a->buses.at(t.id),0,-1)); }
        for(const auto& c:t.clips) {
            if(c.kind!="audio")continue;
            insertAudioClip(*a,*track,t,c,r);
        }
    }
    updateDevices(*a,r,nullptr);
    updateMidiClips(*a,r,nullptr);
    routeOutputs(*a,r);
    if(capture)a->edit->getMasterPluginList().insertPlugin(a->edit->getPluginCache().createNewPlugin(pluginState("zoeydaw-verification-capture")),-1,nullptr);
    return a;
}
void EngineSession::routeOutputs(Arrangement& a,const Request& r) {
    for(int i=a.issues.size();--i>=0;)if(a.issues[i]["code"]==V("output-unavailable") || a.issues[i]["code"]==V("cue-output-unavailable"))a.issues.remove(i);
    auto& dm=engine.getDeviceManager();
    for(auto& t:r.tracks) {
        auto* track=a.tracks.at(t.id);
        if(a.tracks.count(t.output))track->getOutput().setOutputToTrack(a.tracks.at(t.output));
        else if(t.output=="none")track->getOutput().setOutputToNone();
        else if(!devicesInitialised)track->getOutput().setOutputToDefaultDevice(false);
        else if(auto* output=outputFor(dm,t.outputChannel);output && output->isEnabled() && configuration && configuration->outputEnabled(output->getChannels()[0].indexInDevice,output->getChannels().getNumChannels()))track->getOutput().setOutputToDeviceID(output->getDeviceID());
        else { track->getOutput().setOutputToNone();a.issues.add(issue("output-unavailable","Requested output channel is unavailable; track is silent",{},t.id)); }
        if(cueEnabled(t)) {
            auto* cue=a.cueTracks.at(t.id);
            if(!devicesInitialised)cue->getOutput().setOutputToDefaultDevice(false);
            else if(auto* output=outputFor(dm,t.cueOutput);output && output->isEnabled() && configuration && configuration->outputEnabled(output->getChannels()[0].indexInDevice,output->getChannels().getNumChannels()))cue->getOutput().setOutputToDeviceID(output->getDeviceID());
            else { cue->getOutput().setOutputToNone();a.issues.add(issue("cue-output-unavailable","Requested cue output channel is unavailable; cue is silent",{},t.id)); }
        }
    }
}
void EngineSession::updateMixer(Arrangement& a,const Request& next,const Request& previous) {
    struct NewSend { juce::String source,target;te::Plugin::Ptr plugin;int position; };
    std::vector<NewSend> additions;
    for(const auto& track:next.tracks)for(const auto& [id,db]:track.sends) {
        const auto source=a.sends.find(track.id);
        if(source!=a.sends.end() && source->second.contains(id))continue;
        auto plugin=a.edit->getPluginCache().createNewPlugin(te::AuxSendPlugin::xmlTypeName,{});
        auto* send=dynamic_cast<te::AuxSendPlugin*>(plugin.get());require(send!=nullptr,"Cannot create send");
        send->busNumber=a.buses.at(id);send->setGainDb((float)db);
        const auto target=std::find_if(next.tracks.begin(),next.tracks.end(),[&](const Track& item){return item.id==id;});
        auto* sourceTrack=a.tracks.at(track.id);
        additions.push_back({track.id,id,plugin,target->returnPost?-1:sourceTrack->pluginList.indexOf(sourceTrack->getVolumePlugin())});
    }
    for(const auto& addition:additions) {
        a.tracks.at(addition.source)->pluginList.insertPlugin(addition.plugin,addition.position,nullptr);
        a.sends[addition.source].emplace(addition.target,static_cast<te::AuxSendPlugin*>(addition.plugin.get()));
    }
    for(const auto& target:next.tracks) {
        const auto source=std::find_if(next.tracks.begin(),next.tracks.end(),[&](const Track& track){return track.id==target.input;});
        const bool needsSend=source!=next.tracks.end() && source->output!=target.id;
        auto existing=a.inputSends.find(target.id);
        if(existing!=a.inputSends.end() && (!needsSend || existing->second->getOwnerTrack()!=a.tracks.at(source->id))) {
            te::Plugin::Ptr removed(existing->second);a.inputSends.erase(existing);removed->deleteFromParent();
        }
        if(needsSend && !a.inputSends.contains(target.id))a.inputSends.emplace(target.id,addSend(*a.edit,*a.tracks.at(source->id),a.buses.at(target.id),0,-1));
    }
    for(const auto& target:next.tracks) {
        const auto old=std::find_if(previous.tracks.begin(),previous.tracks.end(),[&](const Track& track){return track.id==target.id;});
        if(old==previous.tracks.end() || target.returnPost==old->returnPost)continue;
        for(auto& [source,sends]:a.sends)if(auto found=sends.find(target.id);found!=sends.end()) {
            te::Plugin::Ptr send(found->second);
            auto& list=a.tracks.at(source)->pluginList;
            send->removeFromParent();
            list.insertPlugin(send,target.returnPost?-1:list.indexOf(a.tracks.at(source)->getVolumePlugin()),nullptr);
        }
    }
    for(const auto& t:next.tracks) {
        const auto found=std::find_if(previous.tracks.begin(),previous.tracks.end(),[&](const Track& track){return track.id==t.id;});
        const auto& old=found==previous.tracks.end()?t:*found;
        auto* track=a.tracks.at(t.id);
        if(t.volume!=old.volume)track->getVolumePlugin()->setVolumeDb((float)t.volume);
        if(t.pan!=old.pan)track->getVolumePlugin()->setPan((float)t.pan);
        if(t.mute!=old.mute)track->setMute(t.mute);
        if(t.effectiveSolo!=old.effectiveSolo)track->setSolo(t.effectiveSolo);
        auto& sends=a.sends[t.id];
        for(auto it=sends.begin();it!=sends.end();) {
            if(t.sends.contains(it->first)) { ++it;continue; }
            te::Plugin::Ptr removed(it->second);it=sends.erase(it);removed->deleteFromParent();
        }
        for(const auto& [id,db]:t.sends)if(!old.sends.contains(id) || db!=old.sends.at(id))sends.at(id)->setGainDb((float)db);
        if(t.cueOutput!=old.cueOutput || t.cueVolume!=old.cueVolume)updateCue(a,*track,t);
        if(t.automation!=old.automation || next.bpm!=previous.bpm)applyMixerAutomation(*track,t,next);
    }
}
V EngineSession::apply(const V& v) {
    fields(v,{"request","leaseId","stopToken","stopEpoch"});auto r=decode(field(v,"request"));auto lease=text(v,"leaseId");require(lease.isNotEmpty(),"Empty playback lease");const auto token=integer(v,"stopToken"),fence=integer(v,"stopEpoch");
    const bool opening=r.stage=="open";
    if(fence<stopToken.load() || token<leaseStopTokens[lease])return result(r,false,opening?"superseded-open":"rejected");
    if((opening && ((accepted && (leases.count(lease) || r.session==accepted->session)) || r.baseRevision!=0 || r.revision!=0)) || (!opening && (!accepted || !leases.count(lease) || r.session!=accepted->session || r.sequence<=appliedSequence || r.baseRevision!=accepted->revision)))return result(r,false,"protocol");
    if(!opening && r.controlGeneration<=accepted->controlGeneration) { static_cast<Control&>(r)=static_cast<const Control&>(*accepted);r.controlGeneration=accepted->controlGeneration; }
    if(r.recording && (!r.playing || !configuration || configuration->inputDeviceId.isEmpty()))return result(r,false,"rejected");
    if(recording && (opening || !sameGraph(r,*accepted)))return result(r,false,"rejected");
    for(const auto& track:r.tracks)for(const auto& clip:track.clips)if(clip.kind=="audio") {
        const double ratio=clip.settings.warp?r.bpm/clip.settings.sourceBpm:1.0;
        require(ratio>=te::ClipConstants::speedRatioMin && ratio<=te::ClipConstants::speedRatioMax,"Tempo ratio exceeds the native time-stretcher range");
    }
    if(opening)publishPendingStopOwner({lease.toStdString(),r.session.toStdString()});
    struct ClearPending { EngineSession& owner; bool active; ~ClearPending() { if(active)owner.publishPendingStopOwner({}); } } clearPending {*this,opening};
    if(opening && fence<pendingOwnerStopEpoch.load(std::memory_order_acquire))return result(r,false,"superseded-open");
    const bool replace=opening || !accepted || !sameGraph(r,*accepted,true);
    for(const auto& track:r.tracks)for(const auto& device:track.devices)if(const auto* external=std::get_if<ExternalSettings>(&device.settings)) {
        te::Plugin* retained=nullptr;
        if(!replace && arrangement)if(const auto found=arrangement->devices.find(device.id);found!=arrangement->devices.end())retained=found->second.get();
        const auto* isolated=dynamic_cast<IsolatedDevicePlugin*>(retained);
        if(!isolated || !isolated->matches(*external)) {
            const auto admission=std::find_if(pluginAdmissions.begin(),pluginAdmissions.end(),[&](const auto& entry) {
                return entry.second.lease==lease && entry.second.session==r.session && entry.second.device==device.id && entry.second.revision==r.baseRevision;
            });
            require(admission!=pluginAdmissions.end(),"External device has no prepared admission");
        }
    }
    const bool graphChanged=replace || !sameGraph(r,*accepted);
    auto preparedSources=graphChanged?std::optional<SourceRegistry>(sourceRegistry.prepare(r)):std::nullopt;
    auto candidate=replace?prepare(r):nullptr;
    if(fence<stopToken.load() || (opening && fence<pendingOwnerStopEpoch.load(std::memory_order_acquire)))return result(r,false,opening?"superseded-open":"rejected");
    if(r.playing)openDevice();
    else if(opening) {
        loadConfiguration();
        if(configuration && configuration->inputDeviceId.isNotEmpty())try { openDevice(); }
        catch(const std::exception&) { /* Device error and input-monitor-unavailable are reported by telemetry. */ }
    }
    auto response=result(r,true);
    const auto& request=r;
    auto owner=std::make_pair(lease.toStdString(),r.session.toStdString());
    std::optional<TransportClockMutation> clockMutation;
    {
        const std::lock_guard<std::mutex> lock(stopOwnerMutex);
        if(fence<stopToken.load(std::memory_order_acquire) || (opening && fence<pendingOwnerStopEpoch.load(std::memory_order_acquire)))return result(request,false,opening?"superseded-open":"rejected");
        clockMutation.emplace(*transportControls,replace);
        stopOwner.swap(owner);
    }
    const bool seek=opening || !accepted || request.seekGeneration!=accepted->seekGeneration;
    const bool tempoChanged=accepted && request.bpm!=accepted->bpm;
    double position=request.barTime(request.seekBar);
    if(arrangement && accepted) {
        auto& previousTransport=arrangement->edit->getTransport();
        auto current=previousTransport.getPosition();
        if(previousTransport.isPlaying())if(auto* context=previousTransport.getCurrentPlaybackContext())
            current=context->getPendingPositionChange().value_or(context->getAudibleTimelineTime());
        position=request.barTime(1+current.inSeconds()/accepted->secondsPerBar());
    }
    if(candidate) { allNotesOff();if(arrangement)arrangement->edit->getTransport().stop(false,true);arrangement=std::move(candidate);routeOutputs(*arrangement,request); }
    else {
        te::TransportControl::ReallocationInhibitor inhibit(arrangement->edit->getTransport());
        if(tempoChanged) {
            auto& sequence=arrangement->edit->tempoSequence;
            auto* setting=sequence.getTempo(0);
            setting->set(setting->getStartBeat(),request.bpm,setting->getCurve(),false);
            sequence.updateTempoData();
        }
        for(const auto& track:request.tracks)if(!arrangement->tracks.contains(track.id)) {
            auto native=arrangement->edit->insertNewAudioTrack(te::TrackInsertPoint::getEndOfTracks(*arrangement->edit),nullptr);require(native!=nullptr,"Cannot create arrangement track");
            initialiseTrack(*arrangement,*native,track,request);
        }
        for(const auto& track:request.tracks) {
            const auto old=std::find_if(accepted->tracks.begin(),accepted->tracks.end(),[&](const Track& item){return item.id==track.id;});
            if(old!=accepted->tracks.end() && old->kind!=track.kind)updateTrackKind(*arrangement,*arrangement->tracks.at(track.id),track);
        }
        updateMixer(*arrangement,request,*accepted);updateEnvelopes(*arrangement,request,*accepted);
        updateDevices(*arrangement,request,&*accepted);
        updateMidiClips(*arrangement,request,&*accepted);
        bool outputChanged=false;
        for(const auto& track:request.tracks) {
            const auto old=std::find_if(accepted->tracks.begin(),accepted->tracks.end(),[&](const Track& item){return item.id==track.id;});
            if(old==accepted->tracks.end() || track.output!=old->output || track.outputChannel!=old->outputChannel || track.cueOutput!=old->cueOutput) { outputChanged=true;break; }
        }
        if(outputChanged)routeOutputs(*arrangement,request);
        removeUnusedTracks(*arrangement,request);
    }
    bindInputs(*arrangement,request);
    auto& transport=arrangement->edit->getTransport();arrangement->edit->clickTrackEnabled=request.metronome;
    if(seek || replace || request.playing!=transport.isPlaying())for(const auto& [id,device]:arrangement->devices)device->reset();
    if(replace || tempoChanged || request.loopStart!=accepted->loopStart || request.loopEnd!=accepted->loopEnd)transport.setLoopRange({te::TimePosition::fromSeconds(request.barTime(request.loopStart)),te::TimePosition::fromSeconds(request.barTime(request.loopEnd))});
    if(replace || request.loop!=accepted->loop)transport.looping=request.loop;
    if(seek || replace) { ++transportSeeks;transport.setPosition(te::TimePosition::fromSeconds(seek?request.barTime(request.seekBar):position)); }
    else if(tempoChanged && !transport.isPlaying())transport.setPosition(te::TimePosition::fromSeconds(position));
    auto previousFence=stopToken.load(std::memory_order_acquire);while(previousFence<fence && !stopToken.compare_exchange_weak(previousFence,fence,std::memory_order_acq_rel)) {}
    arrangementEpoch.store(fence,std::memory_order_release);arrangementAudible.store(request.playing,std::memory_order_release);
    if(recording && !request.recording)finishRecording();
    if(request.recording && !recording)startRecording(request);
    if(request.playing && fence>=stopToken.load()) { if(!transport.isPlaying()) { ++transportStarts;transport.play(false); } }else if(transport.isPlaying())transport.stop(false,false);
    appliedSequence=request.sequence;if(opening) { leases.clear();noteSequences.clear();noteCutoffs.clear();heldNotes.clear(); }leases.insert(lease);accepted=std::move(r);if(preparedSources)sourceRegistry=std::move(*preparedSources);
    std::erase_if(pluginAdmissions,[&](const auto& entry) {
        return entry.second.session!=accepted->session || entry.second.revision!=accepted->revision || !leases.count(entry.second.lease);
    });
    pluginBindings.collect();
    confirmRecordingPublication(*accepted);
    clockMutation->publish(*accepted,appliedSequence,stoppedTransportPosition());
    return response;
}
void EngineSession::updateTransport(const Control& next,uint64_t fence,bool seek) {
    auto& transport=arrangement->edit->getTransport();arrangement->edit->clickTrackEnabled=next.metronome;
    bindInputs(*arrangement,*accepted);
    if(seek || next.playing!=transport.isPlaying())for(const auto& [id,device]:arrangement->devices)device->reset();
    if(seek) { ++transportSeeks;transport.setPosition(te::TimePosition::fromSeconds(accepted->barTime(next.seekBar))); }
    auto previousFence=stopToken.load(std::memory_order_acquire);while(previousFence<fence && !stopToken.compare_exchange_weak(previousFence,fence,std::memory_order_acq_rel)) {}
    arrangementEpoch.store(fence,std::memory_order_release);arrangementAudible.store(next.playing,std::memory_order_release);
    if(recording && !next.recording)finishRecording();
    if(next.recording && !recording) { auto request=*accepted;static_cast<Control&>(request)=next;startRecording(request); }
    if(next.playing && fence>=stopToken.load(std::memory_order_acquire)) { if(!transport.isPlaying()) { ++transportStarts;transport.play(false); } }
    else if(transport.isPlaying())transport.stop(false,false);
}
V EngineSession::control(const V& v) {
    fields(v,{"request","leaseId","stopToken","stopEpoch"});auto r=decodeControl(field(v,"request"));const auto lease=text(v,"leaseId");const auto token=integer(v,"stopToken"),fence=integer(v,"stopEpoch");
    const auto revision=accepted?accepted->revision:0;
    if(fence<stopToken.load(std::memory_order_acquire) || token<leaseStopTokens[lease])return result(r,revision,false,"rejected");
    if(!accepted || !leases.count(lease) || r.session!=accepted->session || r.sequence<=appliedSequence)return result(r,revision,false,"protocol");
    const bool changeControl=r.controlGeneration>accepted->controlGeneration;
    if(changeControl) {
        if(r.recording && (!r.playing || !configuration || configuration->inputDeviceId.isEmpty()))return result(r,revision,false,"rejected");
        if(r.playing)openDevice();
        if(fence<stopToken.load(std::memory_order_acquire))return result(r,revision,false,"rejected");
    }
    TransportClockMutation clockMutation(*transportControls,false);
    if(!changeControl) {
        static_cast<Control&>(r)=static_cast<const Control&>(*accepted);r.controlGeneration=accepted->controlGeneration;
    } else {
        updateTransport(r,fence,r.seekGeneration!=accepted->seekGeneration);
        static_cast<Control&>(*accepted)=static_cast<const Control&>(r);accepted->controlGeneration=r.controlGeneration;
    }
    appliedSequence=r.sequence;clockMutation.publish(*accepted,appliedSequence,stoppedTransportPosition());return result(r,revision,true);
}
void EngineSession::allNotesOff() {
    if(arrangement)for(auto& [id,input]:arrangement->midiInputs)input->allNotesOff();
    heldNotes.clear();
}
V EngineSession::note(const V& v,bool overrun) {
    fields(v,{"request","leaseId","stopToken","stopEpoch"});const auto r=decodeNote(field(v,"request"));const auto lease=text(v,"leaseId");const auto token=integer(v,"stopToken"),fence=integer(v,"stopEpoch");
    if(fence<stopToken.load(std::memory_order_acquire) || token<leaseStopTokens[lease])return noteResult(r,false,"rejected");
    if(!accepted || !leases.count(lease) || r.session!=accepted->session)return noteResult(r,false,"protocol");
    if(overrun) { noteCutoffs[lease]=std::max(noteCutoffs[lease],r.sequence);noteSequences[lease]=std::max(noteSequences[lease],r.sequence);allNotesOff();return noteResult(r,false,"note-overrun"); }
    if(noteCutoffs.count(lease) && r.sequence<=noteCutoffs.at(lease))return noteResult(r,false,"rejected");
    if(noteSequences.count(lease) && r.sequence<=noteSequences.at(lease))return noteResult(r,false,"protocol");
    noteSequences[lease]=r.sequence;
    const auto input=arrangement->midiInputs.find(r.trackId);
    if(input==arrangement->midiInputs.end())return noteResult(r,false,"rejected");
    // The current Tracktion MIDI render context accepts immediate events, not future device-sample scheduling.
    if(r.requestedSample && *r.requestedSample>clock.frames.load(std::memory_order_acquire))return noteResult(r,false,"rejected");
    auto& held=heldNotes[lease];const auto existing=held.find(r.noteId);
    if((r.on && existing!=held.end()) || (!r.on && existing!=held.end() && (existing->second.trackId!=r.trackId || existing->second.pitch!=r.pitch)))return noteResult(r,false,"protocol");
    if(!r.on && existing==held.end())return noteResult(r,true);
    openDevice();arrangement->edit->getTransport().ensureContextAllocated();
    if(fence<stopToken.load(std::memory_order_acquire))return noteResult(r,false,"rejected");
    if(!input->second->enqueue({r.pitch,r.velocity,r.on,stopToken.load(std::memory_order_acquire)})) { noteCutoffs[lease]=std::max(noteCutoffs[lease],r.sequence);allNotesOff();return noteResult(r,false,"note-overrun"); }
    if(r.on)held.emplace(r.noteId,r);else held.erase(r.noteId);
    return noteResult(r,true);
}
std::shared_ptr<MeterGraphCollector> EngineSession::acquireMeterGraph(const char* lease,const char* session,std::uint32_t epoch,std::uint32_t generation,std::uint32_t registry) {
    require(juce::MessageManager::getInstance()->isThisTheMessageThread(),"Meter graph acquisition requires message thread");
    if(!lease || !session || !accepted || !leases.count(juce::String::fromUTF8(lease)) || accepted->session!=juce::String::fromUTF8(session) || !arrangement || !arrangement->meterCollector)return {};
    auto collector=arrangement->meterCollector;
    if(collector->description()->identity!=MeterBankIdentity{epoch,generation,registry})return {};
    if(!collector->acquireHub())return {};
    return collector;
}
std::shared_ptr<InputMeterCollector> EngineSession::acquireInputMeter(const char* lease,const char* session,std::uint32_t epoch) {
    require(juce::MessageManager::getInstance()->isThisTheMessageThread(),"Input meter acquisition requires message thread");
    if(!lease || !session || !accepted || !leases.count(juce::String::fromUTF8(lease)) || accepted->session!=juce::String::fromUTF8(session))return {};
    auto collector=clock.inputMeter.collector(epoch);
    if(!collector || !collector->acquireHub())return {};
    return collector;
}
V EngineSession::audition(const V& v) {
    fields(v,{"generation","path","mode","gainDb"},{"sourceBpm","projectBpm","numerator","denominator"});auto generation=integer(v,"generation");
    auto current=auditionGeneration.load();while(current<generation && !auditionGeneration.compare_exchange_weak(current,generation)){}
    require(generation==auditionGeneration.load(),"Stale audition generation");
    auto path=localFile(text(v,"path"));auto mode=text(v,"mode");require(mode=="raw" || mode=="sync","Invalid audition mode");const bool sync=mode=="sync";
    const double projectBpm=sync?number(v,"projectBpm",.000001,999):120;
    const int num=sync?(int)integer(v,"numerator"):4,den=sync?(int)integer(v,"denominator"):4;require(num>0 && den>0 && (den&(den-1))==0,"Invalid audition meter");
    const double gain=number(v,"gainDb",-160,12),sourceBpm=sync?number(v,"sourceBpm",.000001,999):projectBpm;
    require(path.existsAsFile(),"Audition file is offline");
    const auto sourceBytes=path.getSize();const auto sourceModified=path.getLastModificationTime();
    std::unique_ptr<juce::AudioFormatReader> reader(engine.getAudioFileFormatManager().readFormatManager.createReaderFor(path));require(reader!=nullptr,"Audition format is unsupported");
    const auto decodedFrames=reader->lengthInSamples;const auto decodedRate=reader->sampleRate;const auto decodedChannels=reader->numChannels;
    const double duration=decodedFrames/decodedRate;reader.reset();require(duration>0,"Audition file is empty");
    require(path.getSize()==sourceBytes && path.getLastModificationTime()==sourceModified,"Audition source changed while preparing");
    auto preparedSources=sourceRegistry.preparePreview(generation,path,decodedFrames,decodedRate,static_cast<int>(decodedChannels));
    stopPreview();previewGeneration=generation;
    auto candidate=te::Edit::createSingleTrackEdit(engine);require(candidate!=nullptr,"Cannot create preview edit");tempo(*candidate,projectBpm,num,den);auto* track=te::getAudioTracks(*candidate)[0];unity(track->getVolumePlugin());track->getVolumePlugin()->setVolumeDb((float)gain);
    const double ratio=sync?projectBpm/sourceBpm:1.0,length=duration/ratio;
    auto clip=te::insertWaveClip(*track,"Browser audition",path,{.time={te::TimePosition(),te::TimeDuration::fromSeconds(length)}},te::DeleteExistingClips::no);require(clip!=nullptr,"Cannot create preview clip");
    clip->setUsesProxy(false);clip->setAutoTempo(false);clip->setAutoPitch(false);clip->setAutoCrossfade(false);clip->setFadeIn({});clip->setFadeOut({});clip->setTimeStretchMode(sync?te::TimeStretcher::soundtouchBetter:te::TimeStretcher::disabled);clip->setSpeedRatio(ratio);clip->setPitchChange(0);clip->setLoopRange({});
    auto gateState=pluginState("zoeydaw-playback-fence");gateState.setProperty("audition",true,nullptr);gateState.setProperty("generation",(juce::int64)generation,nullptr);track->pluginList.insertPlugin(candidate->getPluginCache().createNewPlugin(gateState),-1,nullptr);
    if(previewCapture) { auto state=pluginState("zoeydaw-verification-capture");state.setProperty("preview",true,nullptr);candidate->getMasterPluginList().insertPlugin(candidate->getPluginCache().createNewPlugin(state),-1,nullptr); }
    auto& transport=candidate->getTransport();transport.setLoopRange({te::TimePosition(),te::TimeDuration::fromSeconds(length)});transport.looping=sync;transport.setPosition({});
    require(generation==auditionGeneration.load(),"Stale audition generation");openDevice();auto* output=engine.getDeviceManager().getDefaultWaveOutDevice();require(output && output->isEnabled(),"No enabled Preview output");track->getOutput().setOutputToDeviceID(output->getDeviceID());transport.play(false);
    bool waiting=false;
    if(sync && arrangement && arrangement->edit->getTransport().isPlaying()) {
        auto* context=transport.getCurrentPlaybackContext();auto* target=arrangement->edit->getTransport().getCurrentPlaybackContext();
        if(context && target) { const double barSeconds=num*4.0/den*60/projectBpm;const double now=arrangement->edit->getTransport().getPosition().inSeconds();context->syncToContext(target,te::TimePosition::fromSeconds(std::floor(now/barSeconds)*barSeconds),te::TimeDuration::fromSeconds(barSeconds));waiting=true; }
    }
    if(generation!=auditionGeneration.load()) { transport.stop(false,true);throw std::runtime_error("Stale audition generation"); }
    preview=std::move(candidate);sourceRegistry=std::move(preparedSources);previewDuration=length;previewSourceDuration=duration;previewMode=mode;startTimerHz(30);auto out=object();put(out,"generation",(juce::int64)generation);put(out,"durationSeconds",duration);put(out,"state",waiting?"waitingForBar":"playing");return out;
}
void EngineSession::timerCallback() {
    if(preview && previewGeneration!=auditionGeneration.load(std::memory_order_acquire)) {
        preview->getTransport().stop(false,false);
        sourceRegistry.clearPreview(previewGeneration);
        stopTimer();
        return;
    }
    if(preview && previewMode=="raw" && previewPositionSeconds()>=previewDuration) { preview->getTransport().stop(false,true);preview->getTransport().setPosition(te::TimePosition::fromSeconds(previewDuration));stopTimer();sourceRegistry.clearPreview(previewGeneration); }
}
V EngineSession::call(const juce::String& operation,const V& v) {
    require(juce::MessageManager::getInstance()->isThisTheMessageThread(),"Playback mutation outside main thread");
    if(operation=="apply")return apply(v);
    if(operation=="plugin_prepare_plan") {
        fields(v,{"request","leaseId"});const auto request=decode(field(v,"request"));const auto lease=text(v,"leaseId");
        const bool opening=request.stage=="open";
        require(opening || (accepted && leases.count(lease) && accepted->session==request.session && accepted->revision==request.baseRevision),"Stale plugin preparation request");
        const bool replace=opening || !accepted || !sameGraph(request,*accepted,true);
        juce::Array<V> needed;
        for(const auto& track:request.tracks)for(const auto& device:track.devices)if(const auto* settings=std::get_if<ExternalSettings>(&device.settings)) {
            const IsolatedDevicePlugin* retained=nullptr;
            if(!replace && arrangement)if(const auto found=arrangement->devices.find(device.id);found!=arrangement->devices.end())retained=dynamic_cast<IsolatedDevicePlugin*>(found->second.get());
            if(!retained || !retained->matches(*settings))needed.add(device.id);
        }
        auto out=object();put(out,"deviceIds",needed);
        if(!needed.isEmpty()) {
            loadConfiguration();const auto format=configuration?*configuration:defaultConfiguration();
            put(out,"sampleRate",format.sampleRate);put(out,"quantum",format.bufferFrames);
        }
        return out;
    }
    if(operation=="control")return control(v);
    if(operation=="note")return note(v);
    if(operation=="note_overrun")return note(v,true);
    if(operation=="all_notes_off") {
        fields(v,{"leaseId","sessionId","throughSequence"});const auto lease=text(v,"leaseId");const auto through=integer(v,"throughSequence");
        require(accepted && leases.count(lease) && accepted->session==text(v,"sessionId"),"Stale playback note owner");
        noteCutoffs[lease]=std::max(noteCutoffs[lease],through);allNotesOff();return {};
    }
    if(operation=="telemetry")return telemetry(v);
    if(operation=="meter_registry")return meterRegistry(v);
    if(operation=="devices")return devices(true);
    if(operation=="configure")return configure(v);
    if(operation=="device_capabilities")return capabilities(v);
    if(operation=="device_control_panel")return controlPanel();
    if(operation=="audition")return audition(v);
    if(operation=="midi_refresh_probe") {
        fields(v,{"enabled"});auto& devices=engine.getDeviceManager();const juce::String name="Zoeydaw playback refresh regression";
        if(boolean(v,"enabled")) { auto status=devices.createVirtualMidiDevice(name);require(status.wasOk(),status.getErrorMessage()); }
        else { auto* input=dynamic_cast<te::VirtualMidiInputDevice*>(devices.findInputDeviceWithName(name));require(input!=nullptr,"Refresh regression device was not discovered");devices.deleteVirtualMidiDevice(*input); }
        return {};
    }
    if(operation=="diagnostics") {
        auto out=object();auto stats=engine.getDeviceManager().getCPUStatistics();
        put(out,"callbackCount",(juce::int64)clock.callbacks.load());put(out,"renderedFrames",(juce::int64)clock.frames.load());put(out,"lateCallbackIntervals",(juce::int64)clock.lateCallbacks.load());put(out,"maxCallbackIntervalSeconds",clock.maxIntervalSeconds.load());
        put(out,"deviceCallbackActive",clock.active.load());put(out,"deviceCallbackFailed",clock.failed.load());put(out,"stopEpoch",(juce::int64)stopToken.load());put(out,"arrangementEpoch",(juce::int64)arrangementEpoch.load());put(out,"arrangementAudible",arrangementAudible.load());
        put(out,"arrangementBuilds",(juce::int64)arrangementBuilds);put(out,"transportSeeks",(juce::int64)transportSeeks);put(out,"transportStarts",(juce::int64)transportStarts);if(accepted)put(out,"acceptedRevision",(juce::int64)accepted->revision);
        if(accepted)put(out,"controlGeneration",decimalU64(accepted->controlGeneration));
        put(out,"pendingNotes",pendingNotes.load(std::memory_order_acquire));
        uint64_t delivered=0,panics=0;if(arrangement)for(auto& [id,input]:arrangement->midiInputs) { delivered+=input->delivered();panics+=input->panics(); }put(out,"deliveredNoteEdges",(juce::int64)delivered);put(out,"deliveredNotePanics",(juce::int64)panics);
        if(arrangement) { auto& transport=arrangement->edit->getTransport();put(out,"arrangementPlaying",transport.isPlaying());put(out,"arrangementPositionSeconds",transport.getPosition().inSeconds());if(auto* context=transport.getCurrentPlaybackContext())if(auto* playhead=context->getNodePlayHead())put(out,"nodePlayheadPlaying",playhead->isPlaying()); }
        put(out,"gateProcessedFrames",(juce::int64)gateProcessedFrames.load());put(out,"gateClearedFrames",(juce::int64)gateClearedFrames.load());if(capture) { put(out,"capturedFrames",(juce::int64)capture->frames.load());put(out,"capturedStoppedFrames",(juce::int64)capture->stoppedFrames.load()); }
        put(out,"previewPlaying",preview && preview->getTransport().isPlaying() && previewGeneration==auditionGeneration.load());put(out,"previewGeneration",(juce::int64)previewGeneration);put(out,"previewPositionSeconds",previewPositionSeconds());put(out,"previewDurationSeconds",previewDuration);if(previewCapture)put(out,"previewCapturedFrames",(juce::int64)previewCapture->frames.load());
        auto routes=object();if(arrangement)for(auto& [id,track]:arrangement->tracks)put(routes,id.toRawUTF8(),track->getOutput().getOutputDeviceID());put(out,"outputRoutes",routes);
        if(auto* device=engine.getDeviceManager().deviceManager.getCurrentAudioDevice()) { put(out,"activeOutputMask",device->getActiveOutputChannels().toString(2));put(out,"activeInputMask",device->getActiveInputChannels().toString(2)); }
        juce::Array<V> outputs;for(auto* output:engine.getDeviceManager().getWaveOutputDevices()) { auto entry=object();put(entry,"name",output->getName());put(entry,"enabled",output->isEnabled());put(entry,"first",output->getChannels()[0].indexInDevice);put(entry,"count",output->getChannels().getNumChannels());outputs.add(entry); }put(out,"waveOutputs",outputs);
        put(out,"engineDurationSamples",(juce::int64)stats.numRuns);put(out,"engineMeanSeconds",stats.meanSeconds);put(out,"engineMaxSeconds",stats.maximumSeconds);put(out,"engineMinSeconds",stats.minimumSeconds);put(out,"engineVarianceSeconds",stats.getVarianceSeconds());
        put(out,"lockDisclosure","Tracktion direct DeviceManager uses its upstream shared callback lock; no lock-free claim. Callback interval counters measure scheduling gaps, not DSP duration; engine duration statistics are upstream measured callback processing, not percentile estimates.");
        return out;
    }
    if(operation=="render") {
        fields(v,{"path","seconds","sampleRate"});require(arrangement!=nullptr,"No arrangement to render");auto output=localFile(text(v,"path"));require(!output.exists(),"Render destination already exists");
        te::Renderer::Parameters p(*arrangement->edit);p.destFile=output;p.audioFormat=engine.getAudioFileFormatManager().getWavFormat();p.bitDepth=32;p.sampleRateForAudio=number(v,"sampleRate",8000,192000);p.blockSizeForAudio=256;
        p.time={te::TimePosition(),te::TimeDuration::fromSeconds(number(v,"seconds",.001,86400))};p.canRenderInMono=false;p.mustRenderInMono=false;p.usePlugins=true;p.useMasterPlugins=true;p.shouldNormalise=false;p.shouldNormaliseByRMS=false;p.trimSilenceAtEnds=false;p.ditheringEnabled=false;p.realTimeRender=false;
        te::Renderer::RenderTask task("Native playback verification",p,nullptr,nullptr);while(task.runJob()!=juce::ThreadPoolJob::jobHasFinished){}require(task.errorMessage.isEmpty(),task.errorMessage);auto out=object();put(out,"path",output.getFullPathName());return out;
    }
    if(operation=="recording_results")return recordingResults(v);
    if(operation=="recording_ack")return acknowledgeRecording(v);
    if(operation=="release") { fields(v,{"leaseId"});const auto lease=text(v,"leaseId");if(leases.count(lease)) { finishRecording();allNotesOff(); }leases.erase(lease);noteSequences.erase(lease);noteCutoffs.erase(lease);heldNotes.erase(lease);std::erase_if(pluginAdmissions,[&](const auto& entry){return entry.second.lease==lease;});if(leases.empty()) { publishStopOwner({});if(arrangement)arrangement->edit->getTransport().removeListener(this);arrangement.reset();accepted.reset();appliedSequence=0; }pluginBindings.collect();releaseDeviceIfIdle();return {}; }
    if(operation=="stop") {
        fields(v,{"leaseId","sessionId","stopToken","stopEpoch"});const auto token=integer(v,"stopToken"),epoch=integer(v,"stopEpoch");const auto lease=text(v,"leaseId");
        leaseStopTokens[lease]=std::max(token,leaseStopTokens[lease]);
        if(accepted && leases.count(lease) && accepted->session==text(v,"sessionId") && epoch>=stopToken.load()) {
            TransportClockMutation mutation(*transportControls,false);
            finishRecording();allNotesOff();accepted->playing=false;accepted->recording=false;arrangementAudible.store(false,std::memory_order_release);monitoringAudible.store(false,std::memory_order_release);arrangement->edit->getTransport().stop(false,true);
            mutation.publish(*accepted,appliedSequence,stoppedTransportPosition());
        }
        return {};
    }
    if(operation=="audition_stop") {
        fields(v,{"generation"});const auto generation=integer(v,"generation");
        if(generation!=auditionGeneration.load())return {};
        if(generation==previewGeneration && generation==auditionGeneration.load() && preview) { stopTimer();preview->getTransport().stop(false,true);sourceRegistry.clearPreview(generation); }
        else if(generation>previewGeneration) { stopPreview();releaseDeviceIfIdle(); }
        return {};
    }
    if(operation=="audition_status" || operation=="audition_seek") {
        const bool seeking=operation=="audition_seek";
        if(seeking)fields(v,{"generation","normalized"});else fields(v,{"generation"});
        const auto generation=integer(v,"generation");
        require(preview && generation==previewGeneration && generation==auditionGeneration.load(),"Stale or unavailable audition selection");
        auto& transport=preview->getTransport();
        if(seeking) { const double position=number(v,"normalized",0,1)*previewDuration;auto resumedSources=sourceRegistry.resumePreview(generation);openDevice();transport.setPosition(te::TimePosition::fromSeconds(position));transport.play(false);sourceRegistry=std::move(resumedSources);if(previewMode=="raw")startTimerHz(30);return {}; }
        const auto position=previewPositionSeconds();
        auto out=object();put(out,"generation",(juce::int64)generation);put(out,"positionSeconds",std::clamp(position/previewDuration,0.0,1.0)*previewSourceDuration);put(out,"durationSeconds",previewSourceDuration);put(out,"playing",transport.isPlaying() && (previewMode!="raw" || position<previewDuration));return out;
    }
    if(operation=="capture_begin") {
        fields(v,{"seconds"},{"preview"});const bool audition=v.hasProperty("preview") && boolean(v,"preview");
        require(audition?(!preview || !preview->getTransport().isPlaying()):(!arrangement || !arrangement->edit->getTransport().isPlaying()),"Capture must be armed while its transport is stopped");
        if(audition)stopPreview();
        openDevice();auto buffer=std::make_shared<Capture>();buffer->rate=clock.rate.load();buffer->samples.resize((size_t)(number(v,"seconds",.01,120)*buffer->rate)*2);
        if(audition)previewCapture=std::move(buffer);else { capture=std::move(buffer);if(accepted)arrangement=prepare(*accepted); }return {};
    }
    if(operation=="capture_write") {
        fields(v,{"path"},{"preview"});const bool audition=v.hasProperty("preview") && boolean(v,"preview");auto buffer=audition?previewCapture:capture;require(buffer!=nullptr,"No capture armed");
        require(audition?(!preview || !preview->getTransport().isPlaying()):(!arrangement || !arrangement->edit->getTransport().isPlaying()),"Stop before writing capture");auto file=localFile(text(v,"path"));require(!file.exists(),"Capture file already exists");
        auto stream=file.createOutputStream();require(stream!=nullptr,"Cannot open capture output");juce::WavAudioFormat format;std::unique_ptr<juce::AudioFormatWriter> writer(format.createWriterFor(stream.release(),buffer->rate,2,24,{},0));require(writer!=nullptr,"Cannot create capture WAV");
        const size_t frames=buffer->frames.load(std::memory_order_acquire);juce::AudioBuffer<float> block(2,4096);
        for(size_t offset=0;offset<frames;offset+=4096) { int count=(int)std::min((size_t)4096,frames-offset);for(int ch=0;ch<2;++ch)for(int i=0;i<count;++i)block.setSample(ch,i,buffer->samples[(offset+i)*2+ch]);require(writer->writeFromAudioSampleBuffer(block,0,count),"Capture write failed"); }
        auto out=object();put(out,"frames",(juce::int64)frames);put(out,"sampleRate",buffer->rate);put(out,"scope","Engine output before the physical device; not a loopback capture");return out;
    }
    throw std::runtime_error("Unknown playback operation");
}
}
