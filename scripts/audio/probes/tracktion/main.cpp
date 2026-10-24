#include <JuceHeader.h>
#include <tracktion_engine/tracktion_engine.h>
#include <chrono>
#include <cmath>
#include <iostream>
#include <stdexcept>
#include <sys/resource.h>

namespace te = tracktion;
using juce::File;
using juce::String;

static void require(bool ok, const String& message)
{
    if (!ok) throw std::runtime_error(message.toStdString());
}
static juce::var object() { return juce::var(new juce::DynamicObject()); }
static void put(juce::var& v, const char* key, const juce::var& value)
{
    v.getDynamicObject()->setProperty(key, value);
}
static String hash(const File& f)
{
    juce::FileInputStream stream(f);
    require(stream.openedOk(), "Cannot hash " + f.getFullPathName());
    return juce::SHA256(stream).toHexString();
}
class Storage final : public te::PropertyStorage
{
public:
    explicit Storage(File f) : PropertyStorage("TracktionOfflineProbe"), root(f) {}
    File getAppCacheFolder() override { auto f = root.getChildFile("cache"); f.createDirectory(); return f; }
    File getAppPrefsFolder() override { auto f = root.getChildFile("prefs"); f.createDirectory(); return f; }
    void removeProperty(te::SettingID) override {}
    juce::var getProperty(te::SettingID, const juce::var& d) override { return d; }
    void setProperty(te::SettingID, const juce::var&) override {}
    std::unique_ptr<juce::XmlElement> getXmlProperty(te::SettingID) override { return {}; }
    void setXmlProperty(te::SettingID, const juce::XmlElement&) override {}
    void removePropertyItem(te::SettingID, juce::StringRef) override {}
    juce::var getPropertyItem(te::SettingID, juce::StringRef, const juce::var& d) override { return d; }
    void setPropertyItem(te::SettingID, juce::StringRef, const juce::var&) override {}
    std::unique_ptr<juce::XmlElement> getXmlPropertyItem(te::SettingID, juce::StringRef) override { return {}; }
    void setXmlPropertyItem(te::SettingID, juce::StringRef, const juce::XmlElement&) override {}
private:
    File root;
};
class Behaviour final : public te::EngineBehaviour
{
public:
    bool autoInitialiseDeviceManager() override { return false; }
};
static void unity(te::VolumeAndPanPlugin* p)
{
    require(p != nullptr, "Missing engine volume plugin");
    p->smoothingRampTimeSeconds = 0;
    p->setVolumeDb(0);
    p->setPan(0);
    p->setPanLaw(te::PanLawLinear);
}
static std::unique_ptr<te::Edit> makeEdit(te::Engine& engine, const File& input, int instances, double ratio)
{
    auto edit = te::Edit::createSingleTrackEdit(engine, te::Edit::EditRole::forRendering);
    require(edit != nullptr, "Engine could not construct rendering Edit");
    edit->ensureNumberOfAudioTracks(instances);
    edit->tempoSequence.getTempo(0)->setBpm(60);
    unity(edit->getMasterVolumePlugin().get());
    auto tracks = te::getAudioTracks(*edit);
    const auto length = te::TimeDuration::fromSeconds(8.0 / ratio);
    for (int n = 0; n < instances; ++n)
    {
        auto* track = tracks[n];
        unity(track->getVolumePlugin());
        auto clip = te::insertWaveClip(*track, "source-" + String(n), input,
            { .time = { te::TimePosition::fromSeconds(0), length } }, te::DeleteExistingClips::no);
        require(clip != nullptr, "WaveAudioClip insertion failed");
        clip->setUsesProxy(false);
        clip->setAutoTempo(false);
        clip->setAutoPitch(false);
        clip->setAutoCrossfade(false);
        clip->setLoopRange({});
        clip->setFadeIn(te::TimeDuration());
        clip->setFadeOut(te::TimeDuration());
        clip->setPan(0);
        clip->setGainDB(juce::Decibels::gainToDecibels(1.0f / instances));
        clip->setPitchChange(0);
        clip->setTimeStretchMode(ratio == 1.0 ? te::TimeStretcher::disabled : te::TimeStretcher::soundtouchBetter);
        clip->setSpeedRatio(ratio);
        require(clip->getPosition().getLength() == length, "Engine clip length changed during configuration");
        const auto playback = clip->getPlaybackFile();
        require(playback.isValid(), "Engine clip playback file is unreadable: source="
            + clip->getOriginalFile().getFullPathName() + " current=" + clip->getCurrentSourceFile().getFullPathName()
            + " playback=" + playback.getFile().getFullPathName());
        require(track->isProcessing(true), "Engine track processing disabled");
        require(!track->playSlotClips.get(), "Engine track unexpectedly selects launcher clips");
    }
    return edit;
}
static juce::var inspect(te::Engine& engine, const File& input, const File& output, double ratio)
{
    auto& fm = engine.getAudioFileFormatManager().readFormatManager;
    std::unique_ptr<juce::AudioFormatReader> src(fm.createReaderFor(input)), dst(fm.createReaderFor(output));
    require(src && dst, "Cannot inspect rendered audio");
    require(dst->sampleRate == 48000 && dst->usesFloatingPointData && dst->bitsPerSample == 32,
            "Renderer output is not 48k float32");
    require(dst->numChannels == src->numChannels, "Renderer changed channel count");
    require(dst->lengthInSamples == std::llround(384000.0 / ratio), "Renderer changed expected frame count");
    juce::AudioBuffer<float> a((int) src->numChannels, 256), b((int) dst->numChannels, 256);
    double maxError = 0, errorPower = 0, peak = 0;
    std::vector<double> powers(dst->numChannels, 0), channelErrors(dst->numChannels, 0);
    for (juce::int64 pos = 0; pos < dst->lengthInSamples; pos += 256)
    {
        const auto count = (int) std::min<juce::int64>(256, dst->lengthInSamples - pos);
        require(dst->read(&b, 0, count, pos, true, dst->numChannels > 1), "Output decode failed");
        if (ratio == 1.0) require(src->read(&a, 0, count, pos, true, src->numChannels > 1), "Reference decode failed");
        for (unsigned c = 0; c < dst->numChannels; ++c)
            for (int i = 0; i < count; ++i)
            {
                const double value = b.getSample((int)c, i);
                require(std::isfinite(value), "Nonfinite engine output");
                peak = std::max(peak, std::abs(value));
                powers[c] += value * value;
                if (ratio == 1.0)
                {
                    const double e = value - a.getSample((int)c, i);
                    maxError = std::max(maxError, std::abs(e));
                    channelErrors[c] = std::max(channelErrors[c], std::abs(e));
                    errorPower += e * e;
                }
            }
    }
    auto result = object();
    put(result, "input_sha256", hash(input)); put(result, "output_sha256", hash(output));
    put(result, "output", output.getFullPathName()); put(result, "frames", dst->lengthInSamples);
    put(result, "channels", (int)dst->numChannels); put(result, "sample_rate", dst->sampleRate);
    put(result, "peak", peak); put(result, "float32", dst->usesFloatingPointData);
    juce::Array<juce::var> rms, errors;
    for (unsigned c = 0; c < dst->numChannels; ++c)
    {
        rms.add(std::sqrt(powers[c] / dst->lengthInSamples)); errors.add(channelErrors[c]);
    }
    put(result, "channel_rms", rms);
    if (ratio == 1.0)
    {
        put(result, "max_absolute_error", maxError); put(result, "channel_max_absolute_error", errors);
        put(result, "rms_error", std::sqrt(errorPower / (dst->lengthInSamples * dst->numChannels)));
        put(result, "sample_accuracy_pass_1e-5", maxError <= 1.0e-5);
    }
    else put(result, "pitch_validation", "Not claimed: parent must measure pitch on rendered waveform");
    return result;
}
static double render(te::Engine& engine, te::Edit& edit, const File& output, bool mono, double ratio)
{
    output.deleteFile();
    te::Renderer::Parameters p(edit);
    p.destFile = output;
    p.audioFormat = engine.getAudioFileFormatManager().getWavFormat();
    p.bitDepth = 32; p.sampleRateForAudio = 48000; p.blockSizeForAudio = 256;
    p.time = { te::TimePosition::fromSeconds(0), te::TimeDuration::fromSeconds(8.0 / ratio) };
    p.canRenderInMono = mono; p.mustRenderInMono = mono;
    p.usePlugins = true; p.useMasterPlugins = true;
    p.shouldNormalise = false; p.shouldNormaliseByRMS = false;
    p.trimSilenceAtEnds = false; p.ditheringEnabled = false; p.realTimeRender = false;
    const auto start = std::chrono::steady_clock::now();
    {
        te::Renderer::RenderTask task("Offline engine probe", p, nullptr, nullptr);
        while (task.runJob() != juce::ThreadPoolJob::jobHasFinished) {}
        require(task.errorMessage.isEmpty(), "Engine render failed: " + task.errorMessage);
    }
    return std::chrono::duration<double>(std::chrono::steady_clock::now() - start).count();
}
int main(int argc, char** argv)
{
    try
    {
        require(argc == 3 || (argc == 4 && String(argv[3]) == "--tempo"), "Usage: TracktionProbe CORPUS OUT [--tempo]");
        juce::ScopedJuceInitialiser_GUI juceInitialiser;
        const File corpus = File::getCurrentWorkingDirectory().getChildFile(argv[1]);
        const File out = File::getCurrentWorkingDirectory().getChildFile(argv[2]);
        require(out.createDirectory().wasOk(), "Cannot create output directory");
        te::Engine engine(std::make_unique<Storage>(out.getChildFile("engine-state")),
                          std::make_unique<te::UIBehaviour>(), std::make_unique<Behaviour>());
        auto report = object();
        put(report, "engine", "Tracktion Engine Edit/AudioTrack/WaveAudioClip/Renderer::RenderTask");
        put(report, "upstream", "877e39c0fe9f1c3e4a9d836f5f338688250875d7");
        put(report, "compiler", PROBE_COMPILER); put(report, "cmake", PROBE_CMAKE);
        put(report, "juce", String(JUCE_MAJOR_VERSION) + "." + String(JUCE_MINOR_VERSION) + "." + String(JUCE_BUILDNUMBER));
        put(report, "sample_rate", 48000); put(report, "block_frames", 256);
        put(report, "timing_scope", "RenderTask construction + graph prepare/render + float WAV write + task destruction; excludes Edit creation, hash, verification; one warmup then ten measured runs; warm filesystem cache");
        put(report, "io", "Engine file-backed WaveAudioClip readers and engine graph; probe never predecodes whole files; engine may memory-map/cache files internally; not a bounded-memory streaming certification");
        put(report, "device_initialisation", false);
        juce::Array<juce::var> results;
        for (const char* name : {"tone-440-mono.wav", "stereo-identical.wav", "stereo-antiphase.wav"})
        {
            const auto input = corpus.getChildFile(name);
            std::unique_ptr<juce::AudioFormatReader> src(engine.getAudioFileFormatManager().readFormatManager.createReaderFor(input));
            require(src && src->sampleRate == 48000 && src->lengthInSamples == 384000, "Input must be 8s / 48k: " + input.getFullPathName());
            const bool mono = src->numChannels == 1;
            require(mono || src->numChannels == 2, "Expected mono or stereo corpus");
            src.reset();
            for (const double ratio : argc == 4 ? std::vector<double>{1.0, 1.2} : std::vector<double>{1.0})
                for (int count : {1, 8, 32})
                {
                    auto edit = makeEdit(engine, input, count, ratio);
                    const auto output = out.getChildFile(input.getFileNameWithoutExtension() + "-n" + String(count) + "-r" + String(ratio, 1) + ".wav");
                    const double warmup = render(engine, *edit, output, mono, ratio);
                    juce::Array<juce::var> times;
                    for (int repetition = 0; repetition < 10; ++repetition)
                        times.add(render(engine, *edit, output, mono, ratio));
                    auto result = inspect(engine, input, output, ratio);
                    put(result, "instances", count); put(result, "gain_per_instance", 1.0 / count);
                    put(result, "tempo_ratio", ratio); put(result, "pitch_semitones", 0);
                    put(result, "warmup_wall_seconds", warmup); put(result, "wall_seconds", times);
                    results.add(result);
                    put(report, "results", results);
                    struct rusage usage{};
                    if (getrusage(RUSAGE_SELF, &usage) == 0) put(report, "process_peak_rss_bytes_macos", (juce::int64)usage.ru_maxrss);
                    require(out.getChildFile("results.json").replaceWithText(juce::JSON::toString(report)), "Cannot write results.json");
                    std::cout << input.getFileName() << " instances=" << count << " ratio=" << ratio << " " << output.getFullPathName() << std::endl;
                }
        }
        return 0;
    }
    catch (const std::exception& e) { std::cerr << e.what() << std::endl; return 1; }
}
