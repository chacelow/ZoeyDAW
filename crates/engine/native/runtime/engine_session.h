#pragma once
#include "playback_model.h"
#include "audio_configuration.h"
#include "input_meter.h"
#include "meter_graph.h"
#include "source_registry.h"
#include "live_midi_input.h"
#include "isolated_plugin_binding.h"
#include <tracktion_engine/tracktion_engine.h>
#include <atomic>
#include <memory>
#include <mutex>
#include <optional>
namespace zp {
namespace te = tracktion;
struct Capture {
    std::vector<float> samples;
    std::atomic<size_t> frames {0};
    std::atomic<uint64_t> stoppedFrames {0};
    double rate = 0;
};
class DeviceClock final : public juce::AudioIODeviceCallback {
public:
    InputMeter inputMeter;
    std::atomic<uint64_t> frames {0}, callbacks {0}, lateCallbacks {0};
    std::atomic<double> rate {0}, maxIntervalSeconds {0};
    std::atomic<bool> active {false}, failed {false};
    void audioDeviceIOCallbackWithContext(const float* const*, int, float* const*, int, int, const juce::AudioIODeviceCallbackContext&) override;
    void audioDeviceAboutToStart(juce::AudioIODevice*) override;
    void audioDeviceStopped() override;
    void audioDeviceError(const juce::String&) override;
private:
    int64_t lastTick = 0;
};
class EngineSession final : private juce::Timer, private te::TransportControl::Listener {
public:
    EngineSession();
    ~EngineSession();
    bool stopFenceFor(const char* lease, const char* session, uint64_t token) noexcept;
    void beginPendingCall(const char* lease, const char* session);
    void endPendingCall();
    V call(const juce::String&, const V&);
    uint64_t admitPlugin(const juce::String& lease,const juce::String& session,const juce::String& device,
                         uint64_t revision,zd_plugin_owned_processor,IsolatedPluginFormat);
    void cancelPlugin(const juce::String& lease,const juce::String& session,uint64_t token);
    V applyPrepared(const V&,zd_plugin_prepared*,uint32_t count);
    std::atomic<uint64_t> stopToken {0}, auditionGeneration {0};
    std::atomic<bool> arrangementAudible {false};
    std::atomic<bool> monitoringAudible {false};
    std::atomic<uint64_t> arrangementEpoch {0};
    std::atomic<uint64_t> gateProcessedFrames {0}, gateClearedFrames {0};
private:
    friend struct MixerTestAccess;
    struct Arrangement : private te::RenderManager::Job::Listener {
        std::unique_ptr<te::Edit> edit;
        std::map<juce::String,te::AudioTrack*> tracks;
        std::map<juce::String,te::AudioTrack*> cueTracks;
        std::map<juce::String,te::AuxSendPlugin*> cueSends;
        std::map<juce::String,std::map<juce::String,te::AuxSendPlugin*>> sends;
        std::map<juce::String,int> buses;
        int nextBus = 0;
        std::map<juce::String,te::AuxSendPlugin*> inputSends;
        std::map<juce::String,te::Plugin*> envelopes;
        std::map<juce::String,te::AudioClipBase*> audioClips;
        std::map<juce::String,te::MidiClip*> midiClips;
        std::map<juce::String,LiveMidiInput*> midiInputs;
        std::map<juce::String,te::Plugin::Ptr> devices;
        std::map<te::Track*, MeterOutputIdentity> meterOutputs;
        std::map<juce::String, std::string> meterEndpointIds;
        std::shared_ptr<const MeterGraph> meterGraph;
        std::unique_ptr<MeterGraphCollector> meterCollector;
        juce::Array<V> issues;
        Request inputState {};
        void observeSourceRender(te::AudioClipBase&);
        void releaseUnusedSourceRenders();
        void jobFinished(te::RenderManager::Job&, bool) override;
        std::vector<te::RenderManager::Job::Ptr> sourceRenders;
        std::unique_ptr<te::TransportControl::ReallocationInhibitor> sourceRenderInhibitor;
        ~Arrangement();
    };
    std::vector<std::shared_ptr<const MeterGraph>> retainedMeterGraphs;
    juce::ScopedJuceInitialiser_GUI gui;
    std::atomic<int> pendingNotes {0};
    IsolatedPluginBindings pluginBindings;
    struct PluginAdmission {
        juce::String lease,session,device;
        uint64_t revision;
        std::shared_ptr<IsolatedPluginBinding> binding;
    };
    uint64_t nextPluginAdmission=0;
    std::map<uint64_t,PluginAdmission> pluginAdmissions;
    std::optional<std::tuple<juce::String,juce::String,uint64_t>> pluginApplyOwner;
    te::Engine engine;
    DeviceClock clock;
    std::unique_ptr<Arrangement> arrangement;
    std::unique_ptr<te::Edit> preview;
    std::shared_ptr<Capture> capture;
    std::shared_ptr<Capture> previewCapture;
    std::optional<Request> accepted;
    SourceRegistry sourceRegistry;
    std::set<juce::String> leases;
    std::map<juce::String,uint64_t> leaseStopTokens;
    std::mutex stopOwnerMutex;
    std::pair<std::string,std::string> stopOwner, pendingStopOwner;
    std::atomic<uint64_t> pendingOwnerStopEpoch {0};
    void publishStopOwner(std::pair<std::string,std::string>);
    void publishPendingStopOwner(std::pair<std::string,std::string>);
    std::map<juce::String,uint64_t> noteSequences, noteCutoffs;
    std::map<juce::String,std::map<juce::String,NoteRequest>> heldNotes;
    juce::String deviceError, previewMode;
    uint64_t appliedSequence=0, telemetrySequence=0, previewGeneration=0;
    uint64_t arrangementBuilds=0, transportSeeks=0, transportStarts=0;
    std::uint32_t meterGeneration = 0;
    bool devicesInitialised=false, preferencesLoaded=false;
    std::optional<AudioConfiguration> configuration;
    V configurationCapabilities;
    juce::Array<V> deviceInventory, inputInventory, hostInventory;
    double previewDuration=0, previewSourceDuration=0;
    struct Recording {
        juce::String id, session, lease;
        double sourceBpm=120, secondsPerBar=2;
        V result;
        juce::String error;
        std::optional<uint64_t> publishedRevision;
    };
    std::optional<Recording> recording;
    std::map<juce::String,Recording> closedRecordings;
    juce::File recordingFile(te::Track&, const juce::String&);
    void startRecording(const Request&);
    void finishRecording();
    void recordingFinished(te::InputDeviceInstance&,te::EditItemID,const juce::ReferenceCountedArray<te::Clip>&) override;
    void recordingStopped(te::SyncPoint,bool) override;
    V recordingResults(const V&);
    V acknowledgeRecording(const V&);
    void confirmRecordingPublication(const Request&);
    V apply(const V&);
    V control(const V&);
    V note(const V&, bool overrun = false);
    void allNotesOff();
    void updateTransport(const Control&, uint64_t fence, bool seek);
    V telemetry(const V&);
    V audition(const V&);
    V devices(bool refresh = false);
    V configure(const V&);
    V capabilities(const V&);
    V controlPanel();
    void refreshDevices();
    void loadConfiguration();
    AudioConfiguration defaultConfiguration();
    void applyConfiguration(const AudioConfiguration&, bool persist, bool requestPermission);
    void activateConfiguration(const AudioConfiguration&);
    void applyChannelLayout(const AudioConfiguration&);
    void routePreview();
    void openDevice();
    void stopPreview();
    double previewPositionSeconds() const;
    void releaseDeviceIfIdle();
    void routeOutputs(Arrangement&, const Request&);
    void updateMixer(Arrangement&, const Request&, const Request&);
    void updateEnvelopes(Arrangement&, const Request&, const Request&);
    std::unique_ptr<Arrangement> prepare(const Request&);
    void insertAudioClip(Arrangement&, te::AudioTrack&, const Track&, const Clip&, const Request&);
    void initialiseTrack(Arrangement&, te::AudioTrack&, const Track&, const Request&);
    void updateCue(Arrangement&, te::AudioTrack&, const Track&);
    void updateTrackKind(Arrangement&, te::AudioTrack&, const Track&);
    void removeUnusedTracks(Arrangement&, const Request&);
    void updateDevices(Arrangement&, const Request&, const Request*);
    void updateMidiClips(Arrangement&, const Request&, const Request*);
    void bindInputs(Arrangement&, const Request&);
    void configureMeterGraph(te::Edit&, te::CreateNodeParams&);
    void retireMeterGraphs();
    void timerCallback() override;
};
}
