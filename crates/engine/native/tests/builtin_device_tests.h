struct BuiltinDspHarness {
    static juce::ValueTree state(const char* kind) {
        juce::ValueTree result("PLUGIN");
        result.setProperty("type", zp::BuiltinDevice::xmlTypeName, nullptr);
        result.setProperty("deviceKind", kind, nullptr);
        return result;
    }
    zp::BuiltinDevice plugin;
    zp::Device device;
    double rate;
    int64_t position = 0;
    BuiltinDspHarness(tracktion::Edit& edit, const char* kind, zp::DeviceSettings settings,
                      double sampleRate = 48000, int preparedBlock = 256)
        : plugin(tracktion::PluginCreationInfo(edit, state(kind), true)),
          device {"builtin-dsp-regression", true, settings}, rate(sampleRate) {
        plugin.configure(device);
        plugin.initialise({tracktion::TimePosition(), rate, preparedBlock});
    }
    ~BuiltinDspHarness() { plugin.deinitialise(); }
    void update() { plugin.configure(device); }
    void process(juce::AudioBuffer<float>& buffer, int offset, int count, bool playing = true) {
        const auto begin = tracktion::TimePosition::fromSeconds(position / rate);
        const auto end = tracktion::TimePosition::fromSeconds((position + count) / rate);
        tracktion::PluginRenderContext context(&buffer, offset, count, nullptr, 0,
                                               tracktion::TimeRange(begin, end), playing, false, false, false);
        beginAllocationGuard();
        plugin.applyToBuffer(context);
        const auto allocations=endAllocationGuard();
        require(allocations==0,"Builtin DSP callback allocated while processing or adopting parameters");
        position += count;
    }
    template<class Input>
    std::vector<std::vector<float>> render(int frames, Input input, int channels = 2, int block = 256) {
        constexpr int guard = 7;
        juce::AudioBuffer<float> buffer(channels, block + guard * 2);
        std::vector<std::vector<float>> result(static_cast<size_t>(channels), std::vector<float>(static_cast<size_t>(frames)));
        for (int start = 0; start < frames; start += block) {
            const int count = std::min(block, frames - start);
            for (int channel = 0; channel < channels; ++channel) {
                std::fill_n(buffer.getWritePointer(channel), buffer.getNumSamples(), 333.0f);
                for (int i = 0; i < count; ++i) buffer.setSample(channel, guard + i, input(channel, start + i));
            }
            process(buffer, guard, count);
            for (int channel = 0; channel < channels; ++channel) {
                for (int i = 0; i < guard; ++i)
                    require(buffer.getSample(channel, i) == 333.0f, "Builtin overwrote buffer prefix");
                for (int i = guard + count; i < buffer.getNumSamples(); ++i)
                    require(buffer.getSample(channel, i) == 333.0f, "Builtin overwrote buffer suffix");
                for (int i = 0; i < count; ++i) {
                    const float sample = buffer.getSample(channel, guard + i);
                    require(std::isfinite(sample), "Builtin produced non-finite DSP output");
                    result[static_cast<size_t>(channel)][static_cast<size_t>(start + i)] = sample;
                }
            }
        }
        return result;
    }
    std::vector<std::vector<float>> silence(int frames, int channels = 2, int block = 256) {
        return render(frames, [](int, int) { return 0.0f; }, channels, block);
    }
};
double builtinDspEnergy(const std::vector<float>& samples, size_t first = 0) {
    double energy = 0;
    for (size_t i = first; i < samples.size(); ++i) energy += static_cast<double>(samples[i]) * samples[i];
    return energy;
}
double builtinDspDifference(const std::vector<float>& left, const std::vector<float>& right) {
    require(left.size() == right.size(), "Builtin response length mismatch");
    double difference = 0;
    for (size_t i = 0; i < left.size(); ++i) difference += std::abs(left[i] - right[i]);
    return difference;
}
void testBuiltinUtilityDsp(tracktion::Edit& edit) {
    struct Example { zp::UtilitySettings settings; float left, right; };
    const Example examples[] = {
        {{0, 0, 100}, .2f, .4f},
        {{24, 0, 100}, .2f * std::pow(10.0f, 1.2f), .4f * std::pow(10.0f, 1.2f)},
        {{-60, 0, 100}, .0002f, .0004f},
        {{0, 0, 0}, .3f, .3f},
        {{0, 0, 200}, .1f, .5f},
        {{0, -1, 100}, .2f, 0},
        {{0, 1, 100}, 0, .4f},
        {{0, .5f, 100}, .1f, .4f}
    };
    for (const auto& example : examples) {
        BuiltinDspHarness harness(edit, "utility", example.settings);
        const auto output = harness.render(513, [](int channel, int) { return channel == 0 ? .2f : channel == 1 ? .4f : -.125f; }, 3, 113);
        for (size_t i = 0; i < output[0].size(); ++i) {
            require(std::abs(output[0][i] - example.left) < .00001f && std::abs(output[1][i] - example.right) < .00001f,
                    "Utility gain/width/balanced pan mapping mismatch");
            require(output[2][i] == -.125f, "Utility modified an extra channel");
        }
    }
    BuiltinDspHarness mono(edit, "utility", zp::UtilitySettings {6, 1, 200});
    const auto output = mono.render(300, [](int, int) { return .25f; }, 1);
    require(std::abs(output[0][0] - .25f * std::pow(10.0f, .3f)) < .000001f, "Mono utility did not preserve gain-only semantics");
    BuiltinDspHarness live(edit, "utility", zp::UtilitySettings {});
    auto& settings = std::get<zp::UtilitySettings>(live.device.settings);
    settings.gainDb = 24; live.update();
    const auto changed = live.render(1024, [](int, int) { return .125f; });
    require(changed[0].front() < changed[0].back() && std::abs(changed[0].back() - .125f * std::pow(10.0f, 1.2f)) < .00001f,
            "Utility live gain update did not smooth to full +24 dB");
    auto wrong = live.device; wrong.settings = zp::DelaySettings {};
    bool rejected = false; try { live.plugin.configure(wrong); } catch (const std::invalid_argument&) { rejected = true; }
    require(rejected, "Builtin accepted a different internal settings kind");
}
double builtinFilterGain(tracktion::Edit& edit, zp::FilterSettings settings, double frequency, double rate = 48000) {
    BuiltinDspHarness harness(edit, "filter", settings, rate);
    const int frames = static_cast<int>(rate);
    const auto response = harness.render(frames, [=](int channel, int i) {
        return channel > 1 ? -.25f : static_cast<float>(.1 * std::sin(2 * juce::MathConstants<double>::pi * frequency * i / rate));
    }, 3, 127);
    double inputEnergy = 0;
    for (int i = frames / 2; i < frames; ++i) {
        const double input = .1 * std::sin(2 * juce::MathConstants<double>::pi * frequency * i / rate);
        inputEnergy += input * input;
        require(response[2][static_cast<size_t>(i)] == -.25f, "Filter modified an extra channel");
    }
    require(builtinDspDifference(response[0], response[1]) == 0, "Filter stereo channel states diverged");
    return std::sqrt(builtinDspEnergy(response[0], static_cast<size_t>(frames / 2)) / inputEnergy);
}
void testBuiltinFilterDsp(tracktion::Edit& edit) {
    const double pass = builtinFilterGain(edit, {1000, 0}, 100);
    const double stop = builtinFilterGain(edit, {1000, 0}, 8000);
    const double cutoff = builtinFilterGain(edit, {1000, 0}, 1000);
    const double resonant = builtinFilterGain(edit, {1000, 1}, 1000);
    require(pass > .98 && pass < 1.01 && stop < .02, "TPT lowpass passband/stopband response mismatch");
    require(std::abs(cutoff - .70710678) < .01 && resonant > 13 && resonant < 15,
            "Filter resonance did not use Butterworth Q times pow(20, resonance)");
    require(std::isfinite(builtinFilterGain(edit, {20000, 1}, 3000, 22050)), "Filter failed cutoff clamp below Nyquist");
    BuiltinDspHarness mono(edit, "filter", zp::FilterSettings {1000, .2f});
    const auto response = mono.render(2048, [](int, int frame) { return frame == 0 ? 1.0f : 0.0f; }, 1, 1031);
    require(builtinDspEnergy(response[0]) > .001, "Mono filter produced no response");
}
void testBuiltinDelayDsp(tracktion::Edit& edit) {
    for (const float milliseconds : {1.0f, 10.5f, 250.0f, 2000.0f}) {
        constexpr float feedback = .95f, mix = .25f;
        const int delay = static_cast<int>(std::lround(milliseconds * 48));
        BuiltinDspHarness harness(edit, "delay", zp::DelaySettings {milliseconds, feedback, mix});
        const auto output = harness.render(delay * 3 + 1, [](int channel, int frame) {
            return channel > 1 ? .375f : frame == 0 ? (channel == 0 ? 1.0f : .5f) : 0.0f;
        }, 3, 193);
        for (int frame = 0; frame <= delay * 3; ++frame) {
            float expected = frame == 0 ? 1 - mix : 0;
            if (frame == delay) expected = mix;
            if (frame == delay * 2) expected = mix * feedback;
            if (frame == delay * 3) expected = mix * feedback * feedback;
            require(std::abs(output[0][static_cast<size_t>(frame)] - expected) < .00001f &&
                    std::abs(output[1][static_cast<size_t>(frame)] - expected * .5f) < .00001f,
                    "Delay impulse time/full 2-second range/linear mix/authored feedback mismatch");
            require(output[2][static_cast<size_t>(frame)] == .375f, "Delay modified an extra channel");
        }
    }
    BuiltinDspHarness fractional(edit, "delay", zp::DelaySettings {1.01f, 0, 1});
    const auto fractionalOutput = fractional.render(128, [](int, int frame) { return frame == 0 ? 1.0f : 0.0f; }, 1);
    require(std::abs(fractionalOutput[0][48] - .52f) < .00001f && std::abs(fractionalOutput[0][49] - .48f) < .00001f,
            "Fractional delay did not linearly interpolate its tap");
    BuiltinDspHarness live(edit, "delay", zp::DelaySettings {20, .5f, 1});
    live.render(256, [](int, int frame) { return frame == 0 ? 1.0f : 0.0f; });
    std::get<zp::DelaySettings>(live.device.settings).feedback = .25f; live.update();
    const auto retained = live.silence(1700);
    require(std::abs(retained[0][960 - 256] - 1) < .00001f && std::abs(retained[0][1920 - 256] - .25f) < .00001f,
            "Delay parameter edit reset its history or failed to reach new feedback");
}
std::vector<std::vector<float>> builtinReverbImpulse(tracktion::Edit& edit, zp::ReverbSettings settings, int frames = 144000) {
    BuiltinDspHarness harness(edit, "reverb", settings);
    return harness.render(frames, [](int channel, int frame) { return frame == 0 && channel < 2 ? 1.0f : 0.0f; }, 2, 251);
}
void testBuiltinReverbDsp(tracktion::Edit& edit) {
    const auto dry = builtinReverbImpulse(edit, {2.5f, .5f, 0}, 4096);
    require(dry[0][0] == 1 && builtinDspEnergy(dry[0], 1) == 0, "Reverb mix=0 did not pass dry input exactly");
    const auto shortDecay = builtinReverbImpulse(edit, {.1f, .5f, 1});
    const auto longDecay = builtinReverbImpulse(edit, {20, .5f, 1});
    require(builtinDspEnergy(longDecay[0], 48000) > builtinDspEnergy(shortDecay[0], 48000) * 10 + 1e-8,
            "Reverb decay control did not change late-tail energy");
    const auto small = builtinReverbImpulse(edit, {2.5f, .05f, 1}, 48000);
    const auto large = builtinReverbImpulse(edit, {2.5f, 1, 1}, 48000);
    require(builtinDspDifference(small[0], large[0]) > .01, "Reverb room size did not change its impulse response");
    require(builtinDspDifference(large[0], large[1]) > .01, "Signalsmith reverb did not produce a stereo field");
    const auto partial = builtinReverbImpulse(edit, {2.5f, .5f, .4f}, 48000);
    const auto wet = builtinReverbImpulse(edit, {2.5f, .5f, 1}, 48000);
    for (size_t i = 0; i < wet[0].size(); ++i)
        require(std::abs(partial[0][i] - (wet[0][i] * .4f + (i == 0 ? .6f : 0))) < .00001f,
                "Reverb wet/dry controls did not implement linear mix");
    BuiltinDspHarness mono(edit, "reverb", zp::ReverbSettings {2.5f, .5f, 1}, 48000, 64);
    const auto monoResponse = mono.render(48000, [](int, int frame) { return frame == 0 ? 1.0f : 0.0f; }, 1, 1031);
    require(builtinDspEnergy(monoResponse[0]) > .00001, "Mono reverb promotion/downmix or oversized block processing failed");
    BuiltinDspHarness multichannel(edit, "reverb", zp::ReverbSettings {});
    const auto extra = multichannel.render(513, [](int channel, int) { return channel == 2 ? .375f : 0.0f; }, 3);
    for (const float sample : extra[2]) require(sample == .375f, "Reverb modified an extra channel");
    BuiltinDspHarness live(edit, "reverb", zp::ReverbSettings {8, .5f, 1});
    live.render(48000, [](int, int frame) { return frame == 0 ? 1.0f : 0.0f; });
    auto& settings = std::get<zp::ReverbSettings>(live.device.settings);
    settings.decay = 4; settings.size = .8f; live.update();
    require(builtinDspEnergy(live.silence(24000)[0]) > 1e-8, "Reverb parameter change cleared an existing tail");
}
void testBuiltinHistoryDsp(tracktion::Edit& edit) {
    const char* kinds[] = {"filter", "delay", "reverb"};
    const zp::DeviceSettings settings[] = {zp::FilterSettings {1000, 1}, zp::DelaySettings {20, .5f, 1}, zp::ReverbSettings {8, .5f, 1}};
    for (size_t kind = 0; kind < 3; ++kind) {
        for (int resetMode = 0; resetMode < 4; ++resetMode) {
            BuiltinDspHarness harness(edit, kinds[kind], settings[kind]);
            harness.render(256, [](int, int frame) { return frame == 0 ? 1.0f : 0.0f; });
            if (resetMode == 0) {
                harness.device.enabled = false; harness.update();
                const auto bypass = harness.render(701, [](int channel, int) { return channel == 0 ? .125f : -.25f; });
                for (size_t i = 0; i < bypass[0].size(); ++i)
                    require(bypass[0][i] == .125f && bypass[1][i] == -.25f, "Disabled builtin was not an exact dry bypass");
                harness.device.enabled = true; harness.update();
            } else if (resetMode == 1) {
                harness.plugin.reset();
            } else if (resetMode == 2) {
                harness.position += 48000;
                harness.plugin.reset();
            } else {
                juce::AudioBuffer<float> stopped(2, 256); stopped.clear(); harness.process(stopped, 0, 256, false);
                harness.plugin.reset();
            }
            const auto after = harness.silence(12000);
            require(builtinDspEnergy(after[0]) == 0 && builtinDspEnergy(after[1]) == 0,
                    "Bypass/reset/seek/stop-start leaked previous DSP history: " + juce::String(kinds[kind]) + " mode " + juce::String(resetMode));
        }
    }
    BuiltinDspHarness loop(edit, "delay", zp::DelaySettings {20, .5f, 1});
    loop.render(256, [](int, int frame) { return frame == 0 ? 1.0f : 0.0f; });
    loop.position = 0;
    const auto wrapped = loop.silence(1024);
    require(std::abs(wrapped[0][960 - 256] - 1) < .00001f, "Loop edit-time wrap incorrectly reset an existing tail");
    BuiltinDspHarness utility(edit, "utility", zp::UtilitySettings {24, 0, 200});
    utility.device.enabled = false; utility.update();
    const auto dry = utility.render(513, [](int channel, int) { return channel == 0 ? -.125f : .25f; });
    require(dry[0][0] == -.125f && dry[1][0] == .25f, "Utility bypass changed the dry signal");
}
void testBuiltinMidiDsp(tracktion::Edit& edit) {
    const char* kinds[] = {"utility", "filter", "delay", "reverb"};
    const zp::DeviceSettings settings[] = {zp::UtilitySettings {}, zp::FilterSettings {}, zp::DelaySettings {}, zp::ReverbSettings {}};
    for (size_t kind = 0; kind < 4; ++kind) {
        BuiltinDspHarness harness(edit, kinds[kind], settings[kind]);
        tracktion::MidiMessageArray midi;
        midi.addMidiMessage(juce::MidiMessage::noteOn(3, 64, static_cast<juce::uint8>(93)), .002, {});
        midi.addMidiMessage(juce::MidiMessage::noteOff(3, 64), .004, {});
        midi.isAllNotesOff = true;
        juce::AudioBuffer<float> buffer(2, 256); buffer.clear();
        for (const bool audioPresent : {false, true}) {
            const auto begin = tracktion::TimePosition();
            const auto end = tracktion::TimePosition::fromSeconds(256.0 / 48000);
            tracktion::PluginRenderContext context(audioPresent ? &buffer : nullptr, 0, 256, &midi, .125,
                                                   tracktion::TimeRange(begin, end), true, false, false, false);
            harness.plugin.applyToBuffer(context);
            require(midi.size() == 2 && midi.isAllNotesOff && midi[0].isNoteOn() && midi[0].getChannel() == 3 &&
                    midi[0].getNoteNumber() == 64 && midi[0].getVelocity() == 93 && midi[0].getTimeStamp() == .002 &&
                    midi[1].isNoteOff() && midi[1].getTimeStamp() == .004,
                    "Builtin altered MIDI messages, timestamps or panic state");
        }
    }
}
void testBuiltinAutomatedDsp(tracktion::Edit& edit) {
    struct Definition { const char* id; float minimum, maximum; };
    const Definition definitions[4][3] = {
        {{"gainDb", -60, 24}, {"pan", -1, 1}, {"width", 0, 200}},
        {{"frequency", 20, 20000}, {"resonance", 0, 1}, {"", 0, 0}},
        {{"timeMs", 1, 2000}, {"feedback", 0, .95f}, {"mix", 0, 1}},
        {{"decay", .1f, 20}, {"size", 0, 1}, {"mix", 0, 1}}
    };
    const char* kinds[] = {"utility", "filter", "delay", "reverb"};
    const zp::DeviceSettings defaults[] = {zp::UtilitySettings {}, zp::FilterSettings {}, zp::DelaySettings {}, zp::ReverbSettings {}};
    const zp::DeviceSettings targets[] = {zp::UtilitySettings {-6, .3f, 150}, zp::FilterSettings {2400, .6f},
                                           zp::DelaySettings {50, .7f, .8f}, zp::ReverbSettings {6, .8f, .7f}};
    const float values[4][3] = {{-6, .3f, 150}, {2400, .6f, 0}, {50, .7f, .8f}, {6, .8f, .7f}};
    const auto impulse = [](int channel, int frame) { return frame == 0 ? (channel == 0 ? 1.0f : .5f) : 0.0f; };
    for (size_t kind = 0; kind < 4; ++kind) {
        const int count = kind == 1 ? 2 : 3;
        BuiltinDspHarness automated(edit, kinds[kind], defaults[kind]);
        for (int i = 0; i < count; ++i) {
            const auto& definition = definitions[kind][i];
            auto parameter = automated.plugin.getAutomatableParameterByID(definition.id);
            require(parameter != nullptr && parameter->getValueRange().getStart() == definition.minimum &&
                    parameter->getValueRange().getEnd() == definition.maximum, "Builtin automation parameter ID/range mismatch");
            parameter->setParameter(values[kind][i], juce::dontSendNotification);
        }
        automated.update();
        for (int i = 0; i < count; ++i)
            require(automated.plugin.getAutomatableParameterByID(definitions[kind][i].id)->getCurrentValue() == values[kind][i],
                    "Unchanged manual tuple overwrote an automated parameter value");
        BuiltinDspHarness manual(edit, kinds[kind], defaults[kind]);
        const auto ignored = automated.render(2048, impulse);
        const auto baseline = manual.render(2048, impulse);
        require(builtinDspDifference(ignored[0], baseline[0]) < .00001 && builtinDspDifference(ignored[1], baseline[1]) < .00001,
                "Unmasked parameter currentValue overrode the authoritative manual tuple");
        automated.plugin.setAutomationMask((1u << count) - 1u);
        automated.plugin.initialise({tracktion::TimePosition(), 48000, 256});
        BuiltinDspHarness target(edit, kinds[kind], targets[kind]);
        const auto actual = automated.render(48000, impulse);
        const auto expected = target.render(48000, impulse);
        require(builtinDspDifference(actual[0], expected[0]) < .0001 && builtinDspDifference(actual[1], expected[1]) < .0001,
                "Masked Tracktion parameter values did not reach the matching DSP fields");
        automated.plugin.setAutomationMask(0);
        automated.plugin.initialise({tracktion::TimePosition(), 48000, 256});
        manual.plugin.initialise({tracktion::TimePosition(), 48000, 256});
        const auto restored = automated.render(2048, impulse);
        const auto original = manual.render(2048, impulse);
        require(builtinDspDifference(restored[0], original[0]) < .00001 && builtinDspDifference(restored[1], original[1]) < .00001,
                "Clearing automation mask failed to restore authored manual settings");
    }
}
void testBuiltinDeviceDsp(tracktion::Edit& edit) {
    testBuiltinUtilityDsp(edit);
    testBuiltinFilterDsp(edit);
    testBuiltinDelayDsp(edit);
    testBuiltinReverbDsp(edit);
    testBuiltinHistoryDsp(edit);
    testBuiltinMidiDsp(edit);
    testBuiltinAutomatedDsp(edit);
}
