#pragma once

void testDeviceModel() {
    const auto reject = [](const juce::var& value) {
        bool rejected = false;
        try { zp::decodeDevices(value); }
        catch (const std::exception&) { rejected = true; }
        zp::require(rejected, "Invalid device wire value accepted");
    };
    const auto fixture = [] {
        return zp::parse(R"JSON([
            {"id":"utility-1","kind":"utility","enabled":true,"gainDb":0,"pan":0,"width":100},
            {"id":"filter-1","kind":"filter","enabled":false,"frequency":1000,"resonance":0.2},
            {"id":"delay-1","kind":"delay","enabled":true,"timeMs":250,"feedback":0.35,"mix":0.25},
            {"id":"reverb-1","kind":"reverb","enabled":true,"decay":2.5,"size":0.5,"mix":0.25}
        ])JSON");
    };
    const auto decoded = zp::decodeDevices(fixture());
    zp::require(decoded.size() == 4, "Device chain length changed");
    zp::require(decoded[0].id == "utility-1" && decoded[1].id == "filter-1"
        && decoded[2].id == "delay-1" && decoded[3].id == "reverb-1", "Device ordering changed");
    zp::require(decoded[0].enabled && !decoded[1].enabled && decoded[2].enabled && decoded[3].enabled,
        "Device bypass state changed");
    zp::require(zp::decodeDevices(juce::var(juce::Array<juce::var> {})).empty(), "Empty device chain rejected");

    struct Bound { int device; const char* key; double min, max; };
    const Bound bounds[] {
        {0, "gainDb", -60, 24}, {0, "pan", -1, 1}, {0, "width", 0, 200},
        {1, "frequency", 20, 20000}, {1, "resonance", 0, 1},
        {2, "timeMs", 1, 2000}, {2, "feedback", 0, .95}, {2, "mix", 0, 1},
        {3, "decay", .1, 20}, {3, "size", 0, 1}, {3, "mix", 0, 1}
    };
    for (const auto& bound : bounds) {
        for (double valid : {bound.min, bound.max, (bound.min + bound.max) / 2}) {
            auto value = fixture(); auto device = value[bound.device]; zp::put(device, bound.key, valid);
            const auto devices = zp::decodeDevices(value);
            const auto actual = std::visit([&](const auto& settings) -> float {
                using S = std::decay_t<decltype(settings)>;
                const juce::String key(bound.key);
                if constexpr (std::is_same_v<S, zp::UtilitySettings>) {
                    if (key == "gainDb") return settings.gainDb;
                    if (key == "pan") return settings.pan;
                    return settings.width;
                } else if constexpr (std::is_same_v<S, zp::FilterSettings>) {
                    return key == "frequency" ? settings.frequency : settings.resonance;
                } else if constexpr (std::is_same_v<S, zp::DelaySettings>) {
                    if (key == "timeMs") return settings.timeMs;
                    return key == "feedback" ? settings.feedback : settings.mix;
                } else {
                    if (key == "decay") return settings.decay;
                    return key == "size" ? settings.size : settings.mix;
                }
            }, zp::builtinSettings(devices[static_cast<size_t>(bound.device)].settings));
            zp::require(actual == static_cast<float>(valid), "Device bound value changed");
        }
        for (double invalid : {std::nextafter(bound.min, -std::numeric_limits<double>::infinity()),
                std::nextafter(bound.max, std::numeric_limits<double>::infinity()),
                std::numeric_limits<double>::quiet_NaN(), std::numeric_limits<double>::infinity(),
                -std::numeric_limits<double>::infinity()}) {
            auto value = fixture(); auto device = value[bound.device]; zp::put(device, bound.key, invalid); reject(value);
        }
        for (const juce::var& invalid : {juce::var(), juce::var("0"), juce::var(true), zp::object(), juce::var(juce::Array<juce::var> {})}) {
            auto value = fixture(); auto device = value[bound.device]; zp::put(device, bound.key, invalid); reject(value);
        }
        auto value = fixture(); value[bound.device].getDynamicObject()->removeProperty(bound.key); reject(value);
    }
    for (int index = 0; index < 4; ++index) {
        for (const auto* key : {"id", "kind", "enabled"}) {
            auto value = fixture(); value[index].getDynamicObject()->removeProperty(key); reject(value);
        }
        for (const auto* key : {"collapsed", "unexpected"}) {
            auto value = fixture(); auto device = value[index]; zp::put(device, key, false); reject(value);
        }
        for (const auto* id : {"", " ", "\t\n"}) {
            auto value = fixture(); auto device = value[index]; zp::put(device, "id", id); reject(value);
        }
        for (const auto& invalid : {juce::var(), juce::var(1), juce::var("true")}) {
            auto value = fixture(); auto device = value[index]; zp::put(device, "enabled", invalid); reject(value);
        }
        auto value = fixture(); auto device = value[index]; zp::put(device, "id", 42); reject(value);
        value = fixture(); device = value[index]; zp::put(device, "kind", "unknown"); reject(value);
        value = fixture(); device = value[index]; zp::put(device, "kind", 1); reject(value);
        value = fixture(); device = value[index]; zp::put(device, "kind", index == 0 ? "filter" : "utility"); reject(value);
        value = fixture(); device = value[index]; zp::put(device, "id", "duplicate");
        auto duplicate = fixture()[index].clone(); zp::put(duplicate, "id", "duplicate"); value.getArray()->add(duplicate); reject(value);
    }
    for (const auto& invalid : {juce::var(), juce::var(true), juce::var(1), juce::var("[]"), zp::object()}) reject(invalid);
    for (const auto& invalid : {juce::var(), juce::var(true), juce::var(1), juce::var("device"), juce::var(juce::Array<juce::var> {})})
        reject(juce::var(juce::Array<juce::var> {invalid}));
}
