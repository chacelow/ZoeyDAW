#include "audio_configuration.h"
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <audioclient.h>
#include <mmdeviceapi.h>
#include <functiondiscoverykeys_devpkey.h>
#include <wrl/client.h>
#include <limits>
namespace zp {
namespace {
using Microsoft::WRL::ComPtr;
struct Apartment final {
    HRESULT result = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    ~Apartment() { if (SUCCEEDED(result)) CoUninitialize(); }
};
struct MixFormat final {
    WAVEFORMATEX* value = nullptr;
    ~MixFormat() { CoTaskMemFree(value); }
};
struct Property final {
    PROPVARIANT value{};
    ~Property() { PropVariantClear(&value); }
};
struct Endpoint {
    ComPtr<IMMDevice> device;
    juce::String name;
};
std::vector<Endpoint> outputEndpoints(IMMDeviceEnumerator& enumerator) {
    ComPtr<IMMDeviceCollection> collection;
    UINT count = 0;
    if (FAILED(enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE, &collection))
        || FAILED(collection->GetCount(&count))) return {};
    ComPtr<IMMDevice> defaultDevice;
    enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia, &defaultDevice);
    LPWSTR defaultId = nullptr;
    if (defaultDevice) defaultDevice->GetId(&defaultId);
    const juce::String preferred(defaultId);
    CoTaskMemFree(defaultId);
    std::vector<Endpoint> result;
    for (UINT index = 0; index < count; ++index) {
        ComPtr<IMMDevice> device;
        ComPtr<IPropertyStore> properties;
        Property property;
        if (FAILED(collection->Item(index, &device))
            || FAILED(device->OpenPropertyStore(STGM_READ, &properties))
            || FAILED(properties->GetValue(PKEY_Device_FriendlyName, &property.value))
            || property.value.vt != VT_LPWSTR) continue;
        LPWSTR id = nullptr;
        if (FAILED(device->GetId(&id))) continue;
        const bool isDefault = preferred == juce::String(id);
        CoTaskMemFree(id);
        Endpoint endpoint{std::move(device), juce::String(property.value.pwszVal)};
        if (isDefault) result.insert(result.begin(), std::move(endpoint));
        else result.push_back(std::move(endpoint));
    }
    juce::StringArray names;
    for (const auto& endpoint : result) names.add(endpoint.name);
    names.appendNumbersToDuplicates(false, false);
    for (size_t index = 0; index < result.size(); ++index) result[index].name = names[(int)index];
    return result;
}
}
std::optional<AudioHardwareDefaults> audioHardwareDefaults(const juce::String& host, const juce::String& outputName) {
    if (host != "Windows Audio" && host != "Windows Audio (Low Latency Mode)"
        && host != "Windows Audio (Exclusive Mode)") return {};
    Apartment apartment;
    if (FAILED(apartment.result) && apartment.result != RPC_E_CHANGED_MODE) return {};
    ComPtr<IMMDeviceEnumerator> enumerator;
    if (FAILED(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_INPROC_SERVER,
                                __uuidof(IMMDeviceEnumerator),
                                reinterpret_cast<void**>(enumerator.GetAddressOf())))) return {};
    for (const auto& endpoint : outputEndpoints(*enumerator.Get())) {
        if (endpoint.name != outputName) continue;
        ComPtr<IAudioClient> client;
        if (FAILED(endpoint.device->Activate(__uuidof(IAudioClient), CLSCTX_INPROC_SERVER,
                                             nullptr, reinterpret_cast<void**>(client.GetAddressOf())))) return {};
        MixFormat format;
        if (FAILED(client->GetMixFormat(&format.value)) || format.value->nSamplesPerSec == 0) return {};
        const double rate = format.value->nSamplesPerSec;
        int frames = 0;
        if (host == "Windows Audio (Low Latency Mode)") {
            ComPtr<IAudioClient3> lowLatency;
            UINT32 defaultPeriod = 0, fundamental = 0, minimum = 0, maximum = 0;
            if (FAILED(client.As(&lowLatency))
                || FAILED(lowLatency->GetSharedModeEnginePeriod(format.value, &defaultPeriod,
                                                                 &fundamental, &minimum, &maximum))
                || defaultPeriod > (UINT32)std::numeric_limits<int>::max()) return {};
            frames = (int)defaultPeriod;
        } else {
            REFERENCE_TIME defaultPeriod = 0, minimumPeriod = 0;
            if (FAILED(client->GetDevicePeriod(&defaultPeriod, &minimumPeriod))) return {};
            const double samples = rate * (double)defaultPeriod / 10000000.0;
            if (!std::isfinite(samples) || samples <= 0 || samples > std::numeric_limits<int>::max()) return {};
            frames = juce::roundToInt(samples);
        }
        if (frames <= 0) return {};
        return AudioHardwareDefaults{rate, frames};
    }
    return {};
}
}
