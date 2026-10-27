#include "engine_session.h"
#include "builtin_device.h"
#include "isolated_device_plugin.h"
#include <algorithm>
#include <array>
#include <cstring>

namespace zp {
namespace {
const char* deviceKind(const DeviceSettings& settings) {
    constexpr std::array names{"utility","filter","delay","reverb"};
    return names.at(settings.index());
}
}
void EngineSession::updateDevices(Arrangement& arrangement,const Request& next,const Request* previous) {
    const auto applyCurves=[&next](te::Plugin& plugin,const Track& track,const Device& device) {
        for(auto* parameter:plugin.getAutomatableParameters())parameter->getCurve().clear(nullptr);
        for(const auto& lane:*track.automation.getArray()) {
            const auto& target=field(lane,"target");
            if(text(target,"kind")!="device" || text(target,"deviceId")!=device.id)continue;
            auto parameter=plugin.getAutomatableParameterByID(text(target,"parameter"));
            require(parameter!=nullptr,"Missing native device automation parameter");
            for(const auto& point:array(lane,"points"))parameter->getCurve().addPoint(te::TimePosition::fromSeconds(next.barTime(number(point,"bar",1,1e12))),(float)number(point,"value",-1e12,1e12),point.hasProperty("curve")?(float)number(point,"curve",-1,1):0,nullptr);
        }
    };
    for(const auto& track:next.tracks)for(const auto& device:track.devices) {
        const Device* old=nullptr;
        const Track* oldOwner=nullptr;
        if(previous)for(const auto& candidate:previous->tracks) {
            auto found=std::find_if(candidate.devices.begin(),candidate.devices.end(),[&](const Device& item){return item.id==device.id;});
            if(found!=candidate.devices.end()) { old=&*found;oldOwner=&candidate;break; }
        }
        if(const auto* external=std::get_if<ExternalSettings>(&device.settings)) {
            auto existing=arrangement.devices.find(device.id);
            auto* retained=existing==arrangement.devices.end()?nullptr:dynamic_cast<IsolatedDevicePlugin*>(existing->second.get());
            const bool replaced=!retained || !retained->matches(*external);
            if(replaced) {
                const auto admissionRevision=pluginApplyOwner?std::get<2>(*pluginApplyOwner):next.baseRevision;
                const auto admission=std::find_if(pluginAdmissions.begin(),pluginAdmissions.end(),[&](const auto& entry) {
                    return entry.second.session==next.session && entry.second.device==device.id && entry.second.revision==admissionRevision;
                });
                require(admission!=pluginAdmissions.end(),"External device has no prepared admission");
                juce::ValueTree state(te::IDs::PLUGIN);state.setProperty(te::IDs::type,IsolatedDevicePlugin::xmlTypeName,nullptr);
                state.setProperty("deviceId",device.id,nullptr);state.setProperty("pluginAdmission",static_cast<juce::int64>(admission->first),nullptr);
                state.setProperty("name",external->name,nullptr);
                state.setProperty("catalogId",external->catalogId,nullptr);state.setProperty("pluginFormat",external->format,nullptr);
                state.setProperty("classId",external->classId,nullptr);state.setProperty("stateHash",external->stateHash,nullptr);
                auto plugin=arrangement.edit->getPluginCache().createNewPlugin(state);
                require(plugin!=nullptr,"Cannot create admitted external device");
                if(existing!=arrangement.devices.end())existing->second->deleteFromParent();
                arrangement.devices[device.id]=plugin;
            }
            auto& plugin=static_cast<IsolatedDevicePlugin&>(*arrangement.devices.at(device.id));
            plugin.configure(device);
            if(replaced || !old || old->settings!=device.settings || !oldOwner || oldOwner->id!=track.id || oldOwner->automation!=track.automation || (previous && !next.sameTempo(*previous))) {
                applyCurves(plugin,track,device);
                plugin.updateAutomation();
            }
            continue;
        }
        auto existing=arrangement.devices.find(device.id);
        const auto kind=deviceKind(device.settings);
        if(existing!=arrangement.devices.end() && (!dynamic_cast<BuiltinDevice*>(existing->second.get()) || std::strcmp(static_cast<BuiltinDevice&>(*existing->second).getDeviceKind(),kind)!=0)) {
            existing->second->deleteFromParent();arrangement.devices.erase(existing);existing=arrangement.devices.end();
        }
        if(existing==arrangement.devices.end()) {
            juce::ValueTree state(te::IDs::PLUGIN);state.setProperty(te::IDs::type,BuiltinDevice::xmlTypeName,nullptr);state.setProperty("deviceKind",kind,nullptr);
            auto plugin=arrangement.edit->getPluginCache().createNewPlugin(state);require(plugin!=nullptr,"Cannot create builtin device");
            arrangement.devices.emplace(device.id,plugin);
        }
        if(!old || old->enabled!=device.enabled || old->settings!=device.settings)
            static_cast<BuiltinDevice&>(*arrangement.devices.at(device.id)).configure(device);
        if(!old || old->settings.index()!=device.settings.index() || !oldOwner || oldOwner->id!=track.id || oldOwner->automation!=track.automation || (previous && !next.sameTempo(*previous))) {
            auto& plugin=static_cast<BuiltinDevice&>(*arrangement.devices.at(device.id));
            applyCurves(plugin,track,device);
            std::uint32_t mask=0;
            const auto parameters=deviceParameters(device.settings);
            for(size_t index=0;index<parameters.size();++index) {
                auto parameter=plugin.getAutomatableParameterByID(parameters[index].id);parameter->updateStream();
                if(parameter->getCurve().getNumPoints()>0)mask|=std::uint32_t{1}<<index;
            }
            plugin.setAutomationMask(mask);
        }
    }
    for(auto it=arrangement.devices.begin();it!=arrangement.devices.end();) {
        bool retained=false;
        for(const auto& track:next.tracks)if(std::any_of(track.devices.begin(),track.devices.end(),[&](const Device& device){return device.id==it->first;})) { retained=true;break; }
        if(retained) { ++it;continue; }
        it->second->deleteFromParent();it=arrangement.devices.erase(it);
    }
    for(const auto& track:next.tracks) {
        auto* native=arrangement.tracks.at(track.id);auto& list=native->pluginList;
        te::Plugin* anchor=native->getVolumePlugin();
        if(const auto sends=arrangement.sends.find(track.id);sends!=arrangement.sends.end())for(const auto& [target,send]:sends->second)
            if(list.indexOf(send)<list.indexOf(anchor))anchor=send;
        for(auto it=track.devices.rbegin();it!=track.devices.rend();++it) {
            const auto plugin=arrangement.devices.at(it->id);
            if(plugin->getOwnerTrack()!=native || list.indexOf(plugin.get())+1!=list.indexOf(anchor)) {
                plugin->removeFromParent();list.insertPlugin(plugin,list.indexOf(anchor),nullptr);
            }
            anchor=plugin.get();
        }
    }
}
}
