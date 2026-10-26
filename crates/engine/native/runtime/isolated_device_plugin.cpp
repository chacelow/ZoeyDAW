#include "isolated_device_plugin.h"
#include "isolated_plugin_node.h"
#include <tracktion_engine/playback/graph/tracktion_ChannelRemappingNode.h>
#include <stdexcept>

namespace zp {
IsolatedDevicePlugin::IsolatedDevicePlugin(tracktion::PluginCreationInfo info,
    std::shared_ptr<IsolatedPluginBinding> processor, juce::String title)
    : Plugin(info), binding(std::move(processor)), name(std::move(title)) {
    if(!binding)throw std::invalid_argument("Missing prepared isolated device");
}
juce::String IsolatedDevicePlugin::getName() const { return name; }
juce::String IsolatedDevicePlugin::getSelectableDescription() { return name; }
juce::String IsolatedDevicePlugin::getPluginType() { return xmlTypeName; }
IsolatedDevicePlugin::BusLayout IsolatedDevicePlugin::getBusses() const {
    return BusLayout::singleInOut(tracktion::ChannelConfiguration::discreteChannels(int(binding->format.inputChannels)),
                                  tracktion::ChannelConfiguration::discreteChannels(int(binding->format.outputChannels)));
}
int IsolatedDevicePlugin::getNumOutputChannelsGivenInputs(int) { return int(binding->format.outputChannels); }
bool IsolatedDevicePlugin::takesMidiInput() { return true; }
bool IsolatedDevicePlugin::isSynth() { return binding->format.inputChannels==0; }
bool IsolatedDevicePlugin::producesAudioWhenNoAudioInput() { return true; }
double IsolatedDevicePlugin::getLatencySeconds() { return binding->format.latencyFrames/binding->format.sampleRate; }
void IsolatedDevicePlugin::setEnabled(bool value) {
    binding->enabled.store(value,std::memory_order_release);
    Plugin::setEnabled(value);
}
bool IsolatedDevicePlugin::matches(const ExternalSettings& settings) const {
    return state["catalogId"].toString()==settings.catalogId
        && state["pluginFormat"].toString()==settings.format
        && state["classId"].toString()==settings.classId
        && state["stateHash"].toString()==settings.stateHash;
}
bool IsolatedDevicePlugin::setEditorAuthority(std::uintptr_t context, bool active) {
    if(!binding->setEditorAuthority(context,active))return false;
    if(!active)binding->setParameters(manualParameters);
    return true;
}
void IsolatedDevicePlugin::configure(const Device& device) {
    const auto& settings=std::get<ExternalSettings>(device.settings);
    if(manualParameters!=settings.parameters) {
        binding->setParameters(settings.parameters);
        manualParameters=settings.parameters;
    }
    setEnabled(device.enabled);
}
void IsolatedDevicePlugin::initialise(const tracktion::PluginInitialisationInfo&) {
    throw std::logic_error("Isolated device requires its graph factory");
}
void IsolatedDevicePlugin::deinitialise() {
    throw std::logic_error("Isolated device lifetime belongs to its graph binding");
}
void IsolatedDevicePlugin::applyToBuffer(const tracktion::PluginRenderContext&) {
    throw std::logic_error("Isolated device requires its graph node");
}
std::unique_ptr<tracktion::graph::Node> IsolatedDevicePlugin::createNode(
    std::unique_ptr<tracktion::graph::Node> source,const tracktion::CreateNodeParams& build) {
    if(!source || build.sampleRate!=binding->format.sampleRate || build.blockSize<=0
        || uint32_t(build.blockSize)>binding->format.quantum)
        throw std::invalid_argument("Isolated device graph format differs from prepared processor");
    const auto channels=source->getNodeProperties().numberOfChannels;
    const auto expected=int(binding->format.inputChannels);
    if(expected>0 && channels!=expected) {
        if(channels<=0)throw std::invalid_argument("Isolated effect has no audio input");
        source=std::make_unique<tracktion::ChannelRemappingNode>(std::move(source),tracktion::ChannelMap::conversion(channels,expected));
    }
    return createIsolatedPluginNode(std::move(source),binding,build.processState,state["deviceId"].toString().toStdString());
}
void configureIsolatedDeviceGraph(tracktion::CreateNodeParams& params) {
    auto previous=std::move(params.createCustomPluginNode);
    params.createCustomPluginNode=[previous=std::move(previous)](tracktion::Plugin& plugin,
        const tracktion::TrackMuteState* mute,const tracktion::CreateNodeParams& build,
        std::unique_ptr<tracktion::graph::Node>& source) {
        if(auto* isolated=dynamic_cast<IsolatedDevicePlugin*>(&plugin)) {
            source=isolated->createNode(std::move(source),build);return true;
        }
        return previous?previous(plugin,mute,build,source):false;
    };
}
}
