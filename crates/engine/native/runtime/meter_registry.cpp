#include "engine_session.h"
#include "input_monitor.h"
#include "isolated_device_plugin.h"
#include <tracktion_graph/tracktion_graph.h>
#include <tracktion_engine/playback/graph/tracktion_EditNodeBuilder.h>
#include <algorithm>
#include <limits>
namespace zp {
V EngineSession::meterRegistry(const V& request) {
    fields(request,{"leaseId","sessionId"});
    const auto lease=text(request,"leaseId"),session=text(request,"sessionId");
    require(accepted && leases.count(lease) && accepted->session==session,"Stale meter registry owner");
    auto result=object();put(result,"sessionId",session);
    if(!arrangement || !arrangement->meterGraph)return {};
    juce::Array<V> entries;
    const auto& graph=*arrangement->meterGraph;
    put(result,"deviceEpoch",(juce::int64)graph.identity.deviceEpoch);
    put(result,"generation",(juce::int64)graph.identity.generation);
    put(result,"registryRevision",(juce::int64)graph.identity.registryRevision);
    put(result,"sampleRate",graph.sampleRate);
    if(auto* device=engine.getDeviceManager().deviceManager.getCurrentAudioDevice()) {
        const auto epoch=clock.inputMeter.deviceEpoch();
        auto collector=clock.inputMeter.collector(epoch);
        if(collector) {
            auto input=object();put(input,"deviceEpoch",(juce::int64)epoch);
            put(input,"sampleRate",device->getCurrentSampleRate());
            juce::Array<V> inputEntries;const auto active=device->getActiveInputChannels();std::uint32_t slot=0;
            const auto deviceId=configuration?configuration->inputDeviceId:device->getName();
            for(int physical=0;physical<device->getInputChannelNames().size();++physical)if(active[physical]) {
                auto entry=object();put(entry,"slotId",(juce::int64)slot++);
                put(entry,"endpointId","input/"+deviceId+"/"+juce::String(physical));
                put(entry,"ownerId",deviceId);put(entry,"kind","input");
                put(entry,"channelIndex",0);put(entry,"channelCount",1);
                put(entry,"capabilities",juce::Array<V>{"peak","rms","hold","clip"});inputEntries.add(entry);
            }
            require(static_cast<std::uint32_t>(inputEntries.size())==collector->bank->channels,"Input meter channel metadata changed");
            put(input,"entries",inputEntries);put(result,"input",input);
        }
    }
    for(const auto& endpoint:graph.endpoints())for(std::uint16_t channel=0;channel<endpoint.channelCount;++channel) {
        auto entry=object();put(entry,"slotId",(juce::int64)(endpoint.firstSlot+channel));
        put(entry,"endpointId",juce::String(endpoint.endpointId));put(entry,"ownerId",juce::String(endpoint.ownerId));put(entry,"kind",juce::String(endpoint.kind));
        put(entry,"channelIndex",channel);put(entry,"channelCount",endpoint.channelCount);
        put(entry,"capabilities",juce::Array<V>{"peak","rms","hold","clip"});
        entries.add(entry);
    }
    put(result,"entries",entries);put(result,"sources",sourceMeterRegistry());return result;
}
void EngineSession::configureMeterGraph(te::Edit& edit,te::CreateNodeParams& params) {
    configureIsolatedDeviceGraph(params);
    if(!arrangement || arrangement->edit.get()!=&edit)return;
    params.includeLegacyLevelMeters=false;
    params.wrapLiveInput=[state=arrangement->inputState,tracks=arrangement->tracks,recording=&recordingActive](te::AudioTrack& track,te::InputDeviceInstance& input,const te::CreateNodeParams& build,std::unique_ptr<te::graph::Node> node)->std::unique_ptr<te::graph::Node> {
        if(input.owner.isMidi() || input.owner.isTrackDevice())return {};
        const auto found=std::find_if(state.tracks.begin(),state.tracks.end(),[&](const Track& item){const auto native=tracks.find(item.id);return native!=tracks.end() && native->second==&track;});
        if(found==state.tracks.end())return {};
        return createInputMonitorNode(std::move(node),*found,state,build.processState,*recording);
    };
    require(meterGeneration<std::numeric_limits<std::uint32_t>::max(),"Meter graph generation exhausted");
    const auto generation=++meterGeneration;
    auto graph=std::make_shared<MeterGraph>(MeterBankIdentity{clock.inputMeter.deviceEpoch(),generation,generation},params.sampleRate,
        MeterControlSource{transportControls,transportControls->ownerEpoch(),params.positionChangePending,&recordingActive});
    auto collector=std::make_shared<std::shared_ptr<MeterGraphCollector>>();
    std::map<te::Plugin*,std::string> deviceIdentities;
    for(const auto& [id,plugin]:arrangement->devices)deviceIdentities.emplace(plugin.get(),id.toStdString());
    params.insertOptionalLastStageNodeForDevice=[graph,deviceSamples=&clock.frames,outputs=arrangement->meterOutputs,deviceIdentities=std::move(deviceIdentities),previous=std::move(params.insertOptionalLastStageNodeForDevice)](te::OutputDevice& device,const te::CreateNodeParams& build,std::unique_ptr<te::graph::Node> node) {
        if(previous)node=previous(device,build,std::move(node));
        return graph->observeOutput(std::move(node),outputs,deviceIdentities,&build.processState,deviceSamples);
    };
    params.graphBuilt=[this,graph,collector] {
        graph->seal();
        *collector=std::make_shared<MeterGraphCollector>(graph);
        retainedMeterGraphs.push_back(graph);
    };
    params.graphPosted=[this,graph,collector,owner=arrangement.get()] {
        owner->meterGraph=graph;
        owner->meterCollector=std::move(*collector);
        retireMeterGraphs();
    };
}
void EngineSession::retireMeterGraphs() {
    std::erase_if(retainedMeterGraphs,[](const auto& graph) { return graph->canRetire(); });
}
V EngineSession::telemetry(const V& v) {
    fields(v,{"leaseId"});auto out=object();auto lease=text(v,"leaseId");V sample;
    put(out,"meterReady",false);
    if(accepted && leases.count(lease)) {
        put(out,"meterReady",arrangement && arrangement->meterGraph!=nullptr);
        auto& transport=arrangement->edit->getTransport();sample=object();put(sample,"sessionId",accepted->session);put(sample,"sequence",(juce::int64)++telemetrySequence);put(sample,"appliedSequence",(juce::int64)appliedSequence);
        put(sample,"controlGeneration",decimalU64(accepted->controlGeneration));
        auto position=transport.getPosition();
        double barsPerSecond=1/accepted->secondsPerBar(),bar=1+position.inSeconds()*barsPerSecond;
        if(transport.isPlaying())if(auto* context=transport.getCurrentPlaybackContext()) {
            if(const auto pending=context->getPendingPositionChange())bar=1+pending->inSeconds()*barsPerSecond;
            else if(const auto sync=context->getSyncPoint();sync && sync->time.inSeconds()>0 && sync->beat.inBeats()>0) {
                barsPerSecond=sync->beat.inBeats()/sync->time.inSeconds()/accepted->quartersPerBar;
                bar=1+sync->beat.inBeats()/accepted->quartersPerBar+(context->getAudibleTimelineTime()-sync->time).inSeconds()*barsPerSecond;
            }
        }
        const double rate=clock.rate.load();auto pos=object();put(pos,"kind",rate>0?"sample":"musical");put(pos,"bar",bar);put(pos,"barsPerSecond",barsPerSecond);if(rate>0) { put(pos,"frame",(juce::int64)clock.frames.load());put(pos,"sampleRate",rate); }put(sample,"clock",pos);
        put(sample,"playing",transport.isPlaying() && clock.active.load() && !clock.failed.load());put(sample,"recording",transport.isRecording());
        retireMeterGraphs();
        put(out,"recordingPreview",recordingPreview(lease));
    }
    put(out,"telemetry",sample);put(out,"device",devices());juce::Array<V> issues;if(arrangement)issues=arrangement->issues;
    if(clock.failed.load())issues.add(issue("device-error","Audio output was interrupted; rendered output is silent"));put(out,"issues",issues);return out;
}
}
