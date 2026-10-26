#include "engine_session.h"
#include "isolated_device_plugin.h"
#include <algorithm>
namespace zp {
struct EngineSession::PluginConfiguration {
    enum class State { prepared, installed } state=State::prepared;
    std::vector<std::pair<juce::String,te::Plugin::Ptr>> previous;
    void install(EngineSession& owner) {
        state=State::installed;
        for(const auto& [id,plugin]:previous) { plugin->removeFromParent();owner.arrangement->devices.erase(id); }
        owner.updateDevices(*owner.arrangement,*owner.accepted,&*owner.accepted);
    }
    void restore(EngineSession& owner) {
        if(state!=State::installed)return;
        for(const auto& [id,plugin]:previous) {
            if(const auto current=owner.arrangement->devices.find(id);current!=owner.arrangement->devices.end())current->second->deleteFromParent();
            owner.arrangement->devices[id]=plugin;
        }
        owner.updateDevices(*owner.arrangement,*owner.accepted,&*owner.accepted);
        state=State::prepared;
    }
};
namespace {
juce::AudioIODeviceType& hostType(juce::AudioDeviceManager& manager,const juce::String& host) {
    for(auto* type:manager.getAvailableDeviceTypes())if(type->getTypeName()==host)return *type;
    throw std::runtime_error(("Unknown audio host: "+host).toStdString());
}
juce::String deviceName(juce::AudioIODeviceType& type,const juce::String& id,bool input) {
    if(id.isEmpty())return {};
    for(const auto& name:type.getDeviceNames(input))if(audioDeviceId(type.getTypeName(),name)==id)return name;
    throw std::runtime_error((juce::String("Unavailable audio ")+(input?"input: ":"output: ")+id).toStdString());
}
juce::String nullableDevice(const V& query,const char* key) {
    const auto& value=field(query,key);require(value.isVoid() || (value.isString() && value.toString().isNotEmpty()),juce::String("Invalid ")+key);return value.isVoid()?juce::String():value.toString();
}
V queryFor(const AudioConfiguration& config) {
    auto query=object();put(query,"host",config.host);put(query,"inputDeviceId",config.inputDeviceId.isEmpty()?V():V(config.inputDeviceId));put(query,"outputDeviceId",config.outputDeviceId.isEmpty()?V():V(config.outputDeviceId));return query;
}
V names(const juce::StringArray& source) { juce::Array<V> out;for(const auto& value:source)out.add(value);return out; }
void validateChannels(const std::vector<int>& mono,const std::vector<int>& stereo,int count) {
    for(int channel:mono)require(channel<count,"Mono audio channel is unavailable");
    for(int channel:stereo)require(channel%2==0 && channel+1<count,"Stereo audio channel pair is unavailable");
}
juce::XmlElement setupXml(const AudioConfiguration& config,juce::AudioIODeviceType& type) {
    juce::XmlElement xml("DEVICESETUP");xml.setAttribute("deviceType",config.host);xml.setAttribute("audioInputDeviceName",deviceName(type,config.inputDeviceId,true));xml.setAttribute("audioOutputDeviceName",deviceName(type,config.outputDeviceId,false));
    xml.setAttribute("audioDeviceRate",config.sampleRate);xml.setAttribute("audioDeviceBufferSize",config.bufferFrames);xml.setAttribute("audioDeviceInChans",config.inputMask().toString(2));xml.setAttribute("audioDeviceOutChans",config.outputMask().toString(2));return xml;
}
void verifyActual(juce::AudioDeviceManager& manager,const AudioConfiguration& config) {
    auto* device=manager.getCurrentAudioDevice();require(device && device->isOpen(),"Audio driver did not open the requested device");
    const auto setup=manager.getAudioDeviceSetup();
    require(manager.getCurrentAudioDeviceType()==config.host,"Audio driver changed the requested host");
    auto& type=hostType(manager,config.host);
    require(setup.inputDeviceName==deviceName(type,config.inputDeviceId,true) && setup.outputDeviceName==deviceName(type,config.outputDeviceId,false),"Audio driver substituted the requested device pair");
    require(device->getCurrentSampleRate()==config.sampleRate,"Audio driver substituted the requested sample rate");
    require(device->getCurrentBufferSizeSamples()==config.bufferFrames,"Audio driver substituted the requested buffer size");
    require(device->getActiveInputChannels()==config.inputMask() && device->getActiveOutputChannels()==config.outputMask(),"Audio driver substituted the requested channel masks");
}
}
void EngineSession::refreshDevices() {
    auto& manager=engine.getDeviceManager().deviceManager;deviceInventory.clear();inputInventory.clear();hostInventory.clear();
    for(auto* type:manager.getAvailableDeviceTypes()) {
        type->scanForDevices();bool panel=false;
        for(bool input:{false,true})for(const auto& name:type->getDeviceNames(input)) {
            std::unique_ptr<juce::AudioIODevice> probe(type->createDevice(type->getDeviceNames(false).contains(name)?name:juce::String(),type->getDeviceNames(true).contains(name)?name:juce::String()));
            auto entry=object();put(entry,"id",audioDeviceId(type->getTypeName(),name));put(entry,"name",name);put(entry,"host",type->getTypeName());
            put(entry,"inputChannels",probe?probe->getInputChannelNames().size():0);put(entry,"outputChannels",probe?probe->getOutputChannelNames().size():0);
            (input?inputInventory:deviceInventory).add(entry);panel=panel || (probe && probe->hasControlPanel());
        }
        auto host=object();put(host,"id",type->getTypeName());put(host,"name",type->getTypeName());put(host,"separateInputOutput",type->hasSeparateInputsAndOutputs());put(host,"controlPanel",panel);hostInventory.add(host);
    }
}
V EngineSession::capabilities(const V& query) {
    fields(query,{"host","inputDeviceId","outputDeviceId"});auto& type=hostType(engine.getDeviceManager().deviceManager,text(query,"host"));type.scanForDevices();
    const auto inputId=nullableDevice(query,"inputDeviceId"),outputId=nullableDevice(query,"outputDeviceId");
    require(type.hasSeparateInputsAndOutputs() || inputId.isEmpty() || outputId.isEmpty() || inputId==outputId,"This audio host does not support separate input and output devices");
    const auto input=deviceName(type,inputId,true),output=deviceName(type,outputId,false);
    auto out=object();put(out,"host",type.getTypeName());put(out,"inputDeviceId",inputId.isEmpty()?V():V(inputId));put(out,"outputDeviceId",outputId.isEmpty()?V():V(outputId));put(out,"separateInputOutput",type.hasSeparateInputsAndOutputs());
    juce::Array<V> rates,buffers;juce::StringArray inputs,outputs;double rate=0;int frames=0;bool panel=false;
    if(input.isNotEmpty() || output.isNotEmpty()) {
        std::unique_ptr<juce::AudioIODevice> probe(type.createDevice(output,input));require(probe!=nullptr,"Audio host cannot inspect the requested device pair");
        inputs=probe->getInputChannelNames();outputs=probe->getOutputChannelNames();
        for(double value:probe->getAvailableSampleRates())if(std::isfinite(value) && value>0)rates.addIfNotAlreadyThere(value);
        for(int value:probe->getAvailableBufferSizes())if(value>0)buffers.addIfNotAlreadyThere(value);
        rate=probe->getCurrentSampleRate();frames=probe->getDefaultBufferSize();
        if(const auto hardware=audioHardwareDefaults(type.getTypeName(),output)) { rate=hardware->sampleRate;frames=hardware->bufferFrames; }
        if(!rates.contains(rate))rate=0;if(!buffers.contains(frames))frames=0;panel=probe->hasControlPanel();
    }
    put(out,"inputChannelNames",names(inputs));put(out,"outputChannelNames",names(outputs));put(out,"sampleRates",rates);put(out,"bufferSizes",buffers);put(out,"defaultSampleRate",rate);put(out,"defaultBufferFrames",frames);put(out,"controlPanel",panel);return out;
}
void EngineSession::loadConfiguration() {
    if(preferencesLoaded)return;preferencesLoaded=true;auto file=audioConfigurationFile();if(!file.existsAsFile())return;
    try { configuration=AudioConfiguration::decode(juce::JSON::parse(file)); }
    catch(const std::exception& error) { deviceError="Saved audio configuration is invalid: "+juce::String(error.what()); }
}
AudioConfiguration EngineSession::defaultConfiguration() {
    auto& manager=engine.getDeviceManager().deviceManager;manager.getAvailableDeviceTypes();
    // Closing the device clears the current type, so a later reopen must select one again.
    auto* type=manager.getCurrentDeviceTypeObject();
    if(type==nullptr) {
        const auto& types=manager.getAvailableDeviceTypes();
        if(!types.isEmpty()) { manager.setCurrentAudioDeviceType(types[0]->getTypeName(),true);type=manager.getCurrentDeviceTypeObject(); }
    }
    require(type!=nullptr,"No audio host is available");type->scanForDevices();const auto outputs=type->getDeviceNames(false);const int index=type->getDefaultDeviceIndex(false);require(index>=0 && index<outputs.size(),"No default audio output is available");
    AudioConfiguration config;config.host=type->getTypeName();config.outputDeviceId=audioDeviceId(config.host,outputs[index]);const auto caps=capabilities(queryFor(config));
    config.sampleRate=(double)caps["defaultSampleRate"];config.bufferFrames=(int)caps["defaultBufferFrames"];const auto count=caps["outputChannelNames"].getArray()->size();require(count>0,"Default audio output has no channels");if(count>=2)config.outputStereo.push_back(0);else config.outputMono.push_back(0);return config;
}
void EngineSession::applyChannelLayout(const AudioConfiguration& config) {
    auto& dm=engine.getDeviceManager();auto* device=dm.deviceManager.getCurrentAudioDevice();require(device!=nullptr,"Missing configured audio device");
    setWaveDeviceLayout(config);
    te::WaveDeviceDescriptionList layout;layout.deviceName=device->getName();
    for(bool input:{false,true}) {
        const int count=(input?device->getInputChannelNames():device->getOutputChannelNames()).size();auto& descriptions=input?layout.inputs:layout.outputs;
        const auto& mono=input?config.inputMono:config.outputMono;const auto& stereo=input?config.inputStereo:config.outputStereo;
        for(int channel=0;channel<count;++channel)descriptions.emplace_back(juce::String(channel+1),te::ChannelConfiguration::mono(channel),std::find(mono.begin(),mono.end(),channel)!=mono.end());
        for(int channel=0;channel+1<count;channel+=2)descriptions.emplace_back(juce::String(channel+1)+"-"+juce::String(channel+2),te::ChannelConfiguration::stereo(channel),std::find(stereo.begin(),stereo.end(),channel)!=stereo.end());
    }
    dm.applyWaveDeviceLayout(layout.toXML());dm.dispatchPendingUpdates();
    te::WaveOutputDevice* preferred=nullptr;
    for(auto* output:dm.getWaveOutputDevices())if(output->isEnabled()) { if(!preferred)preferred=output;if(output->getChannels().getNumChannels()==2) { preferred=output;break; } }
    require(preferred!=nullptr,"Configured audio output layout has no enabled route");dm.setDefaultWaveOutDevice(preferred->getDeviceID());
}
void EngineSession::activateConfiguration(const AudioConfiguration& config) {
    auto& dm=engine.getDeviceManager();auto& manager=dm.deviceManager;auto& type=hostType(manager,config.host);
    if(!devicesInitialised) {
        juce::XmlElement closed("DEVICESETUP");closed.setAttribute("deviceType",config.host);closed.setAttribute("audioDeviceInChans","0");closed.setAttribute("audioDeviceOutChans","0");
        engine.getPropertyStorage().setXmlProperty(te::SettingID::audio_device_setup,closed);dm.initialise(0,0);devicesInitialised=true;manager.addAudioCallback(&clock);
    }
    const auto xml=setupXml(config,type);const auto error=manager.initialise(0,0,&xml,false);require(error.isEmpty(),error);verifyActual(manager,config);applyChannelLayout(config);
}
V EngineSession::validateConfiguration(const AudioConfiguration& candidate) {
    const auto caps=capabilities(queryFor(candidate));
    require(caps["sampleRates"].getArray()->contains(V(candidate.sampleRate)),"Unsupported audio sample rate for this device pair");require(caps["bufferSizes"].getArray()->contains(V(candidate.bufferFrames)),"Unsupported audio buffer size for this device pair");
    validateChannels(candidate.inputMono,candidate.inputStereo,caps["inputChannelNames"].getArray()->size());validateChannels(candidate.outputMono,candidate.outputStereo,caps["outputChannelNames"].getArray()->size());
    return caps;
}
void EngineSession::applyConfiguration(const AudioConfiguration& candidate,bool persist,bool requestPermission,PluginConfiguration* plugins) {
    const auto caps=validateConfiguration(candidate);
    if(candidate.inputDeviceId.isNotEmpty())requireAudioInputPermission(requestPermission);
    if(recording)finishRecording();
    const auto previous=configuration;const auto previousCaps=configurationCapabilities;auto& manager=engine.getDeviceManager().deviceManager;
    const bool wasOpen=manager.getCurrentAudioDevice() && manager.getCurrentAudioDevice()->isOpen();
    const bool playing=arrangement && arrangement->edit->getTransport().isPlaying() && arrangementAudible.load();const auto epoch=arrangementEpoch.load();
    const bool previewPlaying=preview && preview->getTransport().isPlaying();const auto generation=previewGeneration;
    const double position=arrangement?arrangement->edit->getTransport().getPosition().inSeconds():0,previewPosition=preview?preview->getTransport().getPosition().inSeconds():0;
    if(arrangement)arrangement->edit->getTransport().stop(false,true);if(preview)preview->getTransport().stop(false,true);
    if(plugins && arrangement)arrangement->edit->getTransport().freePlaybackContext();
    auto restoreTransports=[&] {
        if(arrangement && accepted) { routeOutputs(*arrangement,*accepted);bindInputs(*arrangement,*accepted);auto& transport=arrangement->edit->getTransport();transport.setPosition(te::TimePosition::fromSeconds(position));if(playing && epoch==arrangementEpoch.load() && epoch==stopToken.load() && arrangementAudible.load())transport.play(false); }
        if(preview && generation==previewGeneration && generation==auditionGeneration.load()) { routePreview();auto& transport=preview->getTransport();transport.setPosition(te::TimePosition::fromSeconds(previewPosition));if(previewPlaying)transport.play(false); }
    };
    try {
        if(plugins)plugins->install(*this);
        activateConfiguration(candidate);configuration=candidate;configurationCapabilities=caps;restoreTransports();
        if(persist) { const auto target=audioConfigurationFile();require(target.getParentDirectory().createDirectory().wasOk(),"Cannot create audio preferences directory");juce::TemporaryFile temporary(target);require(temporary.getFile().replaceWithText(juce::JSON::toString(candidate.value())),"Cannot write audio preferences");require(temporary.overwriteTargetFileWithTemporary(),"Cannot atomically save audio preferences"); }
        preferencesLoaded=true;deviceError.clear();
    }catch(const std::exception& failure) {
        const juce::String message=failure.what();configuration=previous;configurationCapabilities=previousCaps;
        setWaveDeviceLayout(previous);
        if(arrangement)arrangement->edit->getTransport().stop(false,true);if(preview)preview->getTransport().stop(false,true);
        if(plugins && arrangement)arrangement->edit->getTransport().freePlaybackContext();
        try {
            if(plugins)plugins->restore(*this);
            if(wasOpen && previous) { activateConfiguration(*previous);restoreTransports(); }
            else { manager.closeAudioDevice();clock.rate.store(0);if(!wasOpen)releaseDeviceIfIdle(); }
        }catch(const std::exception& rollback) {
            manager.closeAudioDevice();clock.rate.store(0);deviceError="Audio configuration failed: "+message+"; rollback also failed: "+juce::String(rollback.what());throw std::runtime_error(deviceError.toStdString());
        }
        deviceError.clear();throw std::runtime_error(("Audio configuration rejected; previous configuration restored: "+message).toStdString());
    }
}
void EngineSession::openDevice() {
    auto* device=engine.getDeviceManager().deviceManager.getCurrentAudioDevice();if(device && device->isOpen() && !clock.failed.load())return;
    loadConfiguration();if(!configuration && deviceError.isNotEmpty())throw std::runtime_error(deviceError.toStdString());
    try { applyConfiguration(configuration?*configuration:defaultConfiguration(),!configuration,false); }
    catch(const std::exception& error) { deviceError=error.what();throw; }
}
void EngineSession::routePreview() {
    if(!preview)return;auto* output=engine.getDeviceManager().getDefaultWaveOutDevice();
    for(auto* track:te::getAudioTracks(*preview))if(output && output->isEnabled())track->getOutput().setOutputToDeviceID(output->getDeviceID());else track->getOutput().setOutputToNone();
}
V EngineSession::configure(const V& value) {
    auto candidate=AudioConfiguration::decode(value);
    require(configurationPlan(candidate)["kind"].toString()=="direct","External plugins require prepared audio configuration");
    applyConfiguration(candidate,true,true);return devices();
}
V EngineSession::configurationPlan(const AudioConfiguration& candidate) {
    loadConfiguration();
    auto out=object();put(out,"kind","direct");juce::Array<V> devices;
    if(accepted && arrangement)for(const auto& track:accepted->tracks)for(const auto& device:track.devices) {
        const auto* settings=std::get_if<ExternalSettings>(&device.settings);if(!settings)continue;
        const auto plugin=arrangement->devices.find(device.id);
        auto* isolated=plugin==arrangement->devices.end()?nullptr:dynamic_cast<IsolatedDevicePlugin*>(plugin->second.get());
        require(isolated!=nullptr,"External device is not prepared");
        if(isolated->retainsFormat(candidate.sampleRate,uint32_t(candidate.bufferFrames)))continue;
        require(!isolated->editorOwnsParameters(),"Close and apply plugin editors before changing audio format");
        auto item=object();put(item,"deviceId",device.id);put(item,"catalogId",settings->catalogId);put(item,"context",decimalU64(isolated->processorContext()));
        juce::Array<V> parameters;for(const auto& parameter:settings->parameters) { auto entry=object();put(entry,"id",decimalU64(parameter.id));put(entry,"normalized",parameter.normalized);parameters.add(entry); }
        put(item,"parameters",parameters);devices.add(item);
    }
    if(devices.isEmpty())return out;
    validateConfiguration(candidate);
    put(out,"kind","plugins");put(out,"sessionId",accepted->session);put(out,"revision",juce::int64(accepted->revision));put(out,"sequence",juce::int64(accepted->sequence));
    put(out,"previousConfiguration",configuration?configuration->value():V());put(out,"sampleRate",candidate.sampleRate);put(out,"quantum",candidate.bufferFrames);put(out,"devices",devices);return out;
}
V EngineSession::configurePrepared(const V& payload,zd_plugin_prepared* processors,uint32_t count) {
    require(juce::MessageManager::getInstance()->isThisTheMessageThread(),"Prepared configuration outside main thread");
    require(!pluginApplyOwner,"Nested prepared plugin configuration");
    fields(payload,{"request","plan","leaseId","sessionId"});const auto& plan=field(payload,"plan");
    fields(plan,{"kind","sessionId","revision","sequence","previousConfiguration","sampleRate","quantum","devices"});
    const auto lease=text(payload,"leaseId"),session=text(payload,"sessionId");
    require(accepted && arrangement && leases.count(lease) && accepted->session==session && session==text(plan,"sessionId")
        && accepted->revision==integer(plan,"revision") && accepted->sequence==integer(plan,"sequence"),"Stale plugin configuration owner");
    const auto candidate=AudioConfiguration::decode(field(payload,"request"));const auto& old=field(plan,"previousConfiguration");
    require(configuration.has_value()==!old.isVoid() && (!configuration || *configuration==AudioConfiguration::decode(old)),"Audio configuration changed during preparation");
    require(text(plan,"kind")=="plugins" && number(plan,"sampleRate",8000,768000)==candidate.sampleRate
        && integer(plan,"quantum")==uint64_t(candidate.bufferFrames),"Prepared audio format differs from request");
    const auto& planned=array(plan,"devices");require(count>0 && count<=256 && count==uint32_t(planned.size()) && processors,"Invalid prepared configuration batch");
    std::vector<uint64_t> tokens;tokens.reserve(count);
    struct Cleanup {
        EngineSession& owner;const juce::String& lease;const juce::String& session;std::vector<uint64_t>& tokens;
        ~Cleanup() { owner.pluginApplyOwner.reset();for(auto token:tokens)owner.cancelPlugin(lease,session,token); }
    } cleanup {*this,lease,session,tokens};
    PluginConfiguration replacements;replacements.previous.reserve(count);std::set<juce::String> ids;
    for(uint32_t index=0;index<count;++index) {
        const auto& prepared=processors[index];require(prepared.device_id,"Missing prepared device identity");const juce::String id(prepared.device_id);
        require(ids.insert(id).second,"Duplicate prepared device identity");
        const auto entry=std::find_if(planned.begin(),planned.end(),[&](const auto& item){return text(item,"deviceId")==id;});require(entry!=planned.end(),"Unexpected prepared device");
        const auto found=arrangement->devices.find(id);auto* isolated=found==arrangement->devices.end()?nullptr:dynamic_cast<IsolatedDevicePlugin*>(found->second.get());
        require(isolated && isolated->processorContext()==decimalU64(*entry,"context") && !isolated->editorOwnsParameters(),"Plugin configuration instance changed");
        require(prepared.sample_rate==candidate.sampleRate && prepared.quantum==uint32_t(candidate.bufferFrames),"Prepared processor format differs from device request");
        replacements.previous.emplace_back(id,found->second);
    }
    size_t needed=0;for(const auto& [id,plugin]:arrangement->devices)if(auto* isolated=dynamic_cast<IsolatedDevicePlugin*>(plugin.get()))
        if(!isolated->retainsFormat(candidate.sampleRate,uint32_t(candidate.bufferFrames))) { ++needed;require(ids.count(id),"Missing prepared device"); }
    require(needed==count,"Prepared device list is stale");
    pluginApplyOwner=std::tuple{lease,session,accepted->revision};
    for(uint32_t index=0;index<count;++index) {
        auto& prepared=processors[index];const auto processor=prepared.processor;prepared.processor.context=nullptr;
        tokens.push_back(admitPlugin(lease,session,prepared.device_id,accepted->revision,processor,
            {prepared.sample_rate,prepared.quantum,prepared.input_channels,prepared.output_channels,prepared.latency_frames}));
    }
    applyConfiguration(candidate,true,true,&replacements);return devices();
}
V EngineSession::controlPanel() {
    auto* device=engine.getDeviceManager().deviceManager.getCurrentAudioDevice();require(device && device->hasControlPanel(),"The selected audio driver has no available control panel");require(device->showControlPanel(),"Audio driver control panel could not be opened");return devices(true);
}
V EngineSession::devices(bool refresh) {
    loadConfiguration();if(refresh || hostInventory.isEmpty())refreshDevices();auto& manager=engine.getDeviceManager().deviceManager;auto* device=manager.getCurrentAudioDevice();const bool open=device && device->isOpen();auto out=object();
    juce::String host=configuration?configuration->host:(manager.getCurrentDeviceTypeObject()?manager.getCurrentDeviceTypeObject()->getTypeName():juce::String());
    V caps=refresh?V():configurationCapabilities;
    try { if(!caps.isObject()) { if(configuration)caps=capabilities(queryFor(*configuration));else if(host.isNotEmpty()) { auto query=object();put(query,"host",host);put(query,"inputDeviceId",{});put(query,"outputDeviceId",{});auto& type=hostType(manager,host);const auto outputs=type.getDeviceNames(false);const int index=type.getDefaultDeviceIndex(false);if(index>=0 && index<outputs.size())put(query,"outputDeviceId",audioDeviceId(host,outputs[index]));caps=capabilities(query); }configurationCapabilities=caps; } }
    catch(const std::exception& error) { deviceError=error.what();caps=configurationCapabilities; }
    if(!caps.isObject()) { caps=object();put(caps,"host",host);put(caps,"inputDeviceId",configuration && configuration->inputDeviceId.isNotEmpty()?V(configuration->inputDeviceId):V());put(caps,"outputDeviceId",configuration?V(configuration->outputDeviceId):V());for(auto key:{"inputChannelNames","outputChannelNames","sampleRates","bufferSizes"})put(caps,key,juce::Array<V>());put(caps,"defaultSampleRate",0);put(caps,"defaultBufferFrames",0);put(caps,"separateInputOutput",false);put(caps,"controlPanel",false); }
    const bool failed=clock.failed.load() || deviceError.isNotEmpty();put(out,"state",failed?"error":open?"ready":"closed");put(out,"host",open?device->getTypeName():host);
    const auto setup=manager.getAudioDeviceSetup();put(out,"deviceId",open?V(audioDeviceId(device->getTypeName(),setup.outputDeviceName)):V());put(out,"deviceName",open?V(setup.outputDeviceName):V());put(out,"sampleRate",open?device->getCurrentSampleRate():0.0);put(out,"bufferFrames",open?device->getCurrentBufferSizeSamples():0);put(out,"outputChannels",open?device->getActiveOutputChannels().countNumberOfSetBits():0);
    put(out,"inputDeviceId",open && setup.inputDeviceName.isNotEmpty()?V(audioDeviceId(device->getTypeName(),setup.inputDeviceName)):V());put(out,"inputDeviceName",open && setup.inputDeviceName.isNotEmpty()?V(setup.inputDeviceName):V());put(out,"inputChannels",open?device->getActiveInputChannels().countNumberOfSetBits():0);put(out,"inputLatencyFrames",open?device->getInputLatencyInSamples():0);put(out,"outputLatencyFrames",open?device->getOutputLatencyInSamples():0);
    put(out,"hosts",hostInventory);put(out,"devices",deviceInventory);put(out,"inputDevices",inputInventory);put(out,"outputDevices",deviceInventory);put(out,"configuration",configuration?configuration->value():V());put(out,"capabilities",caps);put(out,"error",failed?V(deviceError.isNotEmpty()?deviceError:"Audio device callback reported an error"):V());return out;
}
}
