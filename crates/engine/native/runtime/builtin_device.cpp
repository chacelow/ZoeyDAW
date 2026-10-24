#include "builtin_device.h"
#include <juce_dsp/juce_dsp.h>
#include <signalsmith-basics/reverb.h>
#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <type_traits>

namespace zp {
namespace {
constexpr const char* deviceKinds[] = {"utility", "filter", "delay", "reverb"};
size_t readKind(const juce::ValueTree& state) {
    const auto name = state["deviceKind"].toString();
    for (size_t i = 0; i < std::size(deviceKinds); ++i)
        if (name == deviceKinds[i]) return i;
    throw std::invalid_argument("Unknown builtin deviceKind: " + name.toStdString());
}
BuiltinSettings defaults(size_t kind) {
    switch (kind) {
        case 0: return UtilitySettings {};
        case 1: return FilterSettings {};
        case 2: return DelaySettings {};
        default: return ReverbSettings {};
    }
}
size_t parameterCount(size_t kind) noexcept { return kind == 1 ? 2 : 3; }
std::array<float, 3> parameterValues(const BuiltinSettings& settings) noexcept {
    return std::visit([](const auto& value) -> std::array<float, 3> {
        using T = std::decay_t<decltype(value)>;
        if constexpr (std::is_same_v<T, UtilitySettings>) return {value.gainDb, value.pan, value.width};
        else if constexpr (std::is_same_v<T, FilterSettings>) return {value.frequency, value.resonance, 0};
        else if constexpr (std::is_same_v<T, DelaySettings>) return {value.timeMs, value.feedback, value.mix};
        else return {value.decay, value.size, value.mix};
    }, settings);
}
BuiltinSettings settingsFromValues(size_t kind, const std::array<float, 3>& values) noexcept {
    switch (kind) {
        case 0: return UtilitySettings {values[0], values[1], values[2]};
        case 1: return FilterSettings {values[0], values[1]};
        case 2: return DelaySettings {values[0], values[1], values[2]};
        default: return ReverbSettings {values[0], values[1], values[2]};
    }
}
using Ramp = juce::SmoothedValue<float, juce::ValueSmoothingTypes::Linear>;
void target(Ramp& ramp, float value, bool immediate) noexcept {
    if (immediate) ramp.setCurrentAndTargetValue(value);
    else ramp.setTargetValue(value);
}
struct UtilityDsp {
    Ramp gain, pan, width;
    explicit UtilityDsp(double rate) {
        gain.reset(rate, .01); pan.reset(rate, .01); width.reset(rate, .01);
    }
    void set(const UtilitySettings& value, bool immediate) noexcept {
        target(gain, juce::Decibels::decibelsToGain(value.gainDb, -100.0f), immediate);
        target(pan, value.pan, immediate);
        target(width, value.width * .01f, immediate);
    }
    void reset() noexcept {}
    void process(float* left, float* right, int count) noexcept {
        for (int i = 0; i < count; ++i) {
            const float g = gain.getNextValue(), p = pan.getNextValue(), w = width.getNextValue();
            if (right) {
                const float mid = (left[i] + right[i]) * .5f;
                const float side = (left[i] - right[i]) * .5f * w;
                left[i] = (mid + side) * g * (1.0f - std::max(0.0f, p));
                right[i] = (mid - side) * g * (1.0f + std::min(0.0f, p));
            } else {
                // A genuinely mono bus has neither a side signal nor a left/right balance.
                left[i] *= g;
            }
        }
    }
};
struct FilterDsp {
    juce::dsp::StateVariableTPTFilter<float> filter;
    Ramp frequency, resonance;
    float maxFrequency;
    FilterDsp(double rate, int blockSize) : maxFrequency(static_cast<float>(rate * .499)) {
        filter.prepare({rate, static_cast<juce::uint32>(blockSize), 2});
        filter.setType(juce::dsp::StateVariableTPTFilterType::lowpass);
        frequency.reset(rate, .01); resonance.reset(rate, .01);
    }
    void set(const FilterSettings& value, bool immediate) noexcept {
        target(frequency, std::min(value.frequency, maxFrequency), immediate);
        target(resonance, .70710678f * std::pow(20.0f, value.resonance), immediate);
        if (immediate) {
            filter.setCutoffFrequency(frequency.getCurrentValue());
            filter.setResonance(resonance.getCurrentValue());
        }
    }
    void reset() noexcept { filter.reset(); }
    void process(float* left, float* right, int count) noexcept {
        for (int i = 0; i < count; ++i) {
            if (frequency.isSmoothing()) filter.setCutoffFrequency(frequency.getNextValue());
            if (resonance.isSmoothing()) filter.setResonance(resonance.getNextValue());
            left[i] = filter.processSample(0, left[i]);
            if (right) right[i] = filter.processSample(1, right[i]);
        }
        filter.snapToZero();
    }
};
struct DelayDsp {
    juce::dsp::DelayLine<float, juce::dsp::DelayLineInterpolationTypes::Linear> delay;
    Ramp time, feedback, mix;
    double rate;
    DelayDsp(double sampleRate, int blockSize) : rate(sampleRate) {
        delay.setMaximumDelayInSamples(static_cast<int>(std::ceil(rate * 2)));
        delay.prepare({rate, static_cast<juce::uint32>(blockSize), 2});
        time.reset(rate, .02); feedback.reset(rate, .01); mix.reset(rate, .01);
    }
    void set(const DelaySettings& value, bool immediate) noexcept {
        target(time, static_cast<float>(rate * .001 * value.timeMs), immediate);
        target(feedback, value.feedback, immediate);
        target(mix, value.mix, immediate);
    }
    void reset() noexcept { delay.reset(); }
    void process(float* left, float* right, int count) noexcept {
        for (int i = 0; i < count; ++i) {
            const float delaySamples = time.getNextValue(), fb = feedback.getNextValue(), wet = mix.getNextValue();
            delay.setDelay(delaySamples);
            const float delayedLeft = delay.popSample(0);
            const float delayedRight = delay.popSample(1);
            const float inputLeft = left[i], inputRight = right ? right[i] : inputLeft;
            delay.pushSample(0, inputLeft + delayedLeft * fb);
            delay.pushSample(1, inputRight + delayedRight * fb);
            left[i] = inputLeft * (1 - wet) + delayedLeft * wet;
            if (right) right[i] = inputRight * (1 - wet) + delayedRight * wet;
        }
    }
};
struct ReverbDsp {
    signalsmith::basics::ReverbFloat reverb;
    juce::AudioBuffer<float> scratch;
    int capacity;
    ReverbDsp(double rate, int blockSize) : scratch(2, blockSize), capacity(blockSize) {
        if (!reverb.configure(rate, blockSize, 2))
            throw std::runtime_error("Signalsmith reverb rejected stereo configuration");
        reverb.lowCutHz = std::min(80.0, rate * .1);
        reverb.highCutHz = std::min(12000.0, rate * .45);
    }
    void set(const ReverbSettings& value, bool) noexcept {
        reverb.rt20 = value.decay / 3.0;
        reverb.roomMs = 10.0 + 190.0 * value.size;
        reverb.dry = 1.0 - value.mix;
        reverb.wet = value.mix;
    }
    void reset() noexcept { reverb.reset(); }
    void process(float* left, float* right, int count) noexcept {
        for (int start = 0; start < count; start += capacity) {
            const int length = std::min(capacity, count - start);
            if (right) {
                float* channels[] = {left + start, right + start};
                reverb.process(channels, length);
            } else {
                auto* l = scratch.getWritePointer(0);
                auto* r = scratch.getWritePointer(1);
                std::copy_n(left + start, length, l);
                std::copy_n(left + start, length, r);
                float* channels[] = {l, r};
                reverb.process(channels, length);
                for (int i = 0; i < length; ++i) left[start + i] = (l[i] + r[i]) * .5f;
            }
        }
    }
};
}

struct BuiltinDevice::DspState {
    std::variant<UtilityDsp, FilterDsp, DelayDsp, ReverbDsp> processor;
    DspState(size_t kind, double rate, int blockSize) : processor(std::in_place_type<UtilityDsp>, rate) {
        switch (kind) {
            case 1: processor.emplace<FilterDsp>(rate, blockSize); break;
            case 2: processor.emplace<DelayDsp>(rate, blockSize); break;
            case 3: processor.emplace<ReverbDsp>(rate, blockSize); break;
            default: break;
        }
    }
};

BuiltinDevice::BuiltinDevice(tracktion::PluginCreationInfo info) : Plugin(info), kind(readKind(info.state)) {
    static_assert(std::is_trivially_copyable_v<Parameters>);
    static_assert(std::atomic<uint64_t>::is_always_lock_free);
    static_assert(std::atomic<double>::is_always_lock_free);
    static_assert(std::atomic<float>::is_always_lock_free);
    static_assert(std::atomic<uint32_t>::is_always_lock_free);
    current.settings = controlSettings = effectiveSettings = defaults(kind);
    const auto values = parameterValues(controlSettings);
    const auto definitions=deviceParameters(controlSettings);
    for (size_t i = 0; i < definitions.size(); ++i) {
        const auto& definition = definitions[i];
        settingParameters[i] = addParam(definition.id, definition.id, {static_cast<float>(definition.minimum), static_cast<float>(definition.maximum)});
        settingParameters[i]->setParameter(values[i], juce::dontSendNotification);
    }
}
BuiltinDevice::~BuiltinDevice() = default;
const char* BuiltinDevice::getDeviceKind() const noexcept { return deviceKinds[kind]; }
juce::String BuiltinDevice::getName() const { return juce::String(getDeviceKind()).toUpperCase().substring(0, 1) + juce::String(getDeviceKind()).substring(1); }
juce::String BuiltinDevice::getSelectableDescription() { return getName(); }
juce::String BuiltinDevice::getPluginType() { return xmlTypeName; }
BuiltinDevice::BusLayout BuiltinDevice::getBusses() const { return BusLayout::singlePassThrough(); }
int BuiltinDevice::getNumOutputChannelsGivenInputs(int count) { return count; }
bool BuiltinDevice::takesMidiInput() { return true; }
bool BuiltinDevice::producesAudioWhenNoAudioInput() { return kind != 0; }
double BuiltinDevice::getTailLength() const {
    if (automationMask.load(std::memory_order_acquire) != 0 && kind == 2) return 270;
    if (automationMask.load(std::memory_order_acquire) != 0 && kind == 3) return 20;
    return tailSeconds.load(std::memory_order_relaxed);
}
void BuiltinDevice::setAutomationMask(uint32_t mask) noexcept {
    automationMask.store(mask & ((1u << parameterCount(kind)) - 1u), std::memory_order_release);
}
void BuiltinDevice::configure(const Device& value) {
    if (value.settings.valueless_by_exception() || value.settings.index() != kind)
        throw std::invalid_argument("Builtin device kind cannot change in place");
    const auto previous = parameterValues(controlSettings);
    const auto settings=builtinSettings(value.settings);
    const auto next = parameterValues(settings);
    for (size_t i = 0; i < parameterCount(kind); ++i)
        if (previous[i] != next[i]) settingParameters[i]->setParameter(next[i], juce::dontSendNotification);
    controlSettings = settings;
    double tail = 0;
    if (const auto* delay = std::get_if<DelaySettings>(&value.settings)) {
        const double repeats = delay->feedback > 0 ? std::ceil(std::log(.001) / std::log(delay->feedback)) : 1;
        tail = delay->timeMs * .001 * repeats;
    } else if (const auto* reverb = std::get_if<ReverbSettings>(&value.settings)) {
        tail = reverb->decay;
    } else if (std::holds_alternative<FilterSettings>(value.settings)) {
        tail = 2;
    }
    tailSeconds.store(value.enabled ? tail : 0, std::memory_order_relaxed);
    parameters.publish({value.enabled, settings});
}
void BuiltinDevice::initialise(const tracktion::PluginInitialisationInfo& info) {
    if (!std::isfinite(info.sampleRate) || info.sampleRate <= 0 || info.blockSizeSamples <= 0)
        throw std::invalid_argument("Invalid builtin device sample rate or block size");
    dsp = std::make_unique<DspState>(kind, info.sampleRate, info.blockSizeSamples);
    adoptParameters(true);
    clearHistory();
    appliedResetGeneration = resetGeneration.load(std::memory_order_acquire);
}
void BuiltinDevice::deinitialise() { dsp.reset(); }
void BuiltinDevice::reset() { resetGeneration.fetch_add(1, std::memory_order_release); }
void BuiltinDevice::clearHistory() noexcept {
    std::visit([](auto& processor) { processor.reset(); }, dsp->processor);
}
bool BuiltinDevice::noTail() { return kind == 0; }
void BuiltinDevice::adoptParameters(bool immediate) {
    const bool previousEnabled = current.enabled;
    parameters.readLatest(current);
    auto values = parameterValues(current.settings);
    const auto mask = automationMask.load(std::memory_order_acquire);
    for (size_t i = 0; i < parameterCount(kind); ++i)
        if ((mask & (1u << i)) != 0) values[i] = settingParameters[i]->getCurrentValue();
    const auto next = settingsFromValues(kind, values);
    if (immediate || !haveEffectiveSettings || next != effectiveSettings) {
        switch (kind) {
            case 0: std::get<UtilityDsp>(dsp->processor).set(std::get<UtilitySettings>(next), immediate); break;
            case 1: std::get<FilterDsp>(dsp->processor).set(std::get<FilterSettings>(next), immediate); break;
            case 2: std::get<DelayDsp>(dsp->processor).set(std::get<DelaySettings>(next), immediate); break;
            case 3: std::get<ReverbDsp>(dsp->processor).set(std::get<ReverbSettings>(next), immediate); break;
        }
        effectiveSettings = next;
        haveEffectiveSettings = true;
    }
    if (previousEnabled != current.enabled) clearHistory();
}
void BuiltinDevice::applyToBuffer(const tracktion::PluginRenderContext& context) {
    if (!dsp) return;
    juce::ScopedNoDenormals noDenormals;
    adoptParameters(false);
    const auto generation = resetGeneration.load(std::memory_order_acquire);
    if (generation != appliedResetGeneration) clearHistory();
    appliedResetGeneration = generation;
    if (!current.enabled || !context.destBuffer || context.bufferNumSamples <= 0) return;
    auto& buffer = *context.destBuffer;
    const int startSample = context.bufferStartSample;
    if (startSample < 0 || startSample > buffer.getNumSamples() || buffer.getNumChannels() == 0) return;
    const int count = std::min(context.bufferNumSamples, buffer.getNumSamples() - startSample);
    if (count <= 0) return;
    auto* left = buffer.getWritePointer(0, startSample);
    auto* right = buffer.getNumChannels() > 1 ? buffer.getWritePointer(1, startSample) : nullptr;
    std::visit([&](auto& processor) { processor.process(left, right, count); }, dsp->processor);
}
}
