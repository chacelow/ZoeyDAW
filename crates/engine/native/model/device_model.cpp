#include "device_model.h"
#include "playback_model.h"
#include <set>
#include <type_traits>

namespace zp {
std::span<const DeviceParameterSpec> deviceParameters(const BuiltinSettings& settings) {
    static constexpr DeviceParameterSpec utility[] {{"gainDb",-60,24},{"pan",-1,1},{"width",0,200}};
    static constexpr DeviceParameterSpec filter[] {{"frequency",20,20000},{"resonance",0,1}};
    static constexpr DeviceParameterSpec delay[] {{"timeMs",1,2000},{"feedback",0,.95},{"mix",0,1}};
    static constexpr DeviceParameterSpec reverb[] {{"decay",.1,20},{"size",0,1},{"mix",0,1}};
    return std::visit([&](const auto& value)->std::span<const DeviceParameterSpec> {
        using S=std::decay_t<decltype(value)>;
        if constexpr(std::is_same_v<S,UtilitySettings>)return utility;
        else if constexpr(std::is_same_v<S,FilterSettings>)return filter;
        else if constexpr(std::is_same_v<S,DelaySettings>)return delay;
        else return reverb;
    },settings);
}
BuiltinSettings builtinSettings(const DeviceSettings& settings) {
    return std::visit([](const auto& value)->BuiltinSettings {
        if constexpr(std::is_same_v<std::decay_t<decltype(value)>,ExternalSettings>)
            throw std::invalid_argument("External settings are not builtin DSP settings");
        else return value;
    },settings);
}
std::span<const DeviceParameterSpec> deviceParameters(const DeviceSettings& settings) {
    if(std::holds_alternative<ExternalSettings>(settings))return {};
    return deviceParameters(builtinSettings(settings));
}
std::vector<Device> decodeDevices(const juce::var& value) {
    const auto* devices = value.getArray();
    require(devices != nullptr, "Expected devices array");
    std::vector<Device> result;
    result.reserve(static_cast<size_t>(devices->size()));
    std::set<juce::String> ids;
    for (const auto& value : *devices) {
        Device device;
        device.id = text(value, "id");
        require(device.id.trim().isNotEmpty(), "Empty device ID");
        require(ids.insert(device.id).second, "Duplicate device ID");
        device.enabled = boolean(value, "enabled");
        const auto kind = text(value, "kind");
        if (kind == "utility") {
            fields(value, {"id", "kind", "enabled", "gainDb", "pan", "width"});
            device.settings = UtilitySettings {
                static_cast<float>(number(value, "gainDb", -60, 24)),
                static_cast<float>(number(value, "pan", -1, 1)),
                static_cast<float>(number(value, "width", 0, 200))
            };
        } else if (kind == "filter") {
            fields(value, {"id", "kind", "enabled", "frequency", "resonance"});
            device.settings = FilterSettings {
                static_cast<float>(number(value, "frequency", 20, 20000)),
                static_cast<float>(number(value, "resonance", 0, 1))
            };
        } else if (kind == "delay") {
            fields(value, {"id", "kind", "enabled", "timeMs", "feedback", "mix"});
            device.settings = DelaySettings {
                static_cast<float>(number(value, "timeMs", 1, 2000)),
                static_cast<float>(number(value, "feedback", 0, .95)),
                static_cast<float>(number(value, "mix", 0, 1))
            };
        } else if (kind == "reverb") {
            fields(value, {"id", "kind", "enabled", "decay", "size", "mix"});
            device.settings = ReverbSettings {
                static_cast<float>(number(value, "decay", .1, 20)),
                static_cast<float>(number(value, "size", 0, 1)),
                static_cast<float>(number(value, "mix", 0, 1))
            };
        } else if(kind=="external") {
            fields(value,{"id","kind","enabled","plugin","stateRef","parameters"});
            const auto& plugin=field(value,"plugin");
            fields(plugin,{"catalogId","format","classId","name","vendor","version","role"});
            ExternalSettings external;
            external.catalogId=text(plugin,"catalogId");external.format=text(plugin,"format");external.classId=text(plugin,"classId");
            external.name=text(plugin,"name");external.vendor=text(plugin,"vendor");external.version=text(plugin,"version");external.role=text(plugin,"role");
            const auto hash=[](const juce::String& value) { return value.length()==64 && value.containsOnly("0123456789abcdef"); };
            require(hash(external.catalogId) && external.classId.isNotEmpty(),"Invalid external plugin identity");
            require(external.format=="clap" || external.format=="vst3" || external.format=="audioUnit","Invalid external plugin format");
            require(external.role=="effect" || external.role=="instrument","Invalid external plugin role");
            const auto& state=field(value,"stateRef");
            if(!state.isVoid()) {
                fields(state,{"sha256","path"});external.stateHash=text(state,"sha256");external.statePath=text(state,"path");
                require(hash(external.stateHash) && external.statePath.isNotEmpty(),"Invalid external plugin state reference");
            }
            const auto& parameters=array(value,"parameters");require(parameters.size()<=4096,"External parameter capacity exceeded");
            std::set<uint64_t> parameterIds;
            for(const auto& parameter:parameters) {
                fields(parameter,{"id","normalized"});const auto id=decimalU64(parameter,"id");
                require(parameterIds.insert(id).second,"Duplicate external parameter ID");
                external.parameters.push_back({id,number(parameter,"normalized",0,1)});
            }
            device.settings=std::move(external);
        } else {
            require(false, "Invalid device kind");
        }
        result.push_back(std::move(device));
    }
    return result;
}
}
