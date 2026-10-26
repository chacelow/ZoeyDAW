#include "isolated_plugin_node.h"
#include "isolated_device_plugin.h"
#include <tracktion_engine/tracktion_engine.h>
#include <tracktion_engine/playback/graph/tracktion_TracktionEngineNode.h>
#include <array>
#include <bit>
#include <cmath>
#include <limits>
#include <stdexcept>

namespace zp {
namespace {
class IsolatedPluginNode final : public tracktion::graph::Node {
public:
    IsolatedPluginNode(std::unique_ptr<Node> source, std::shared_ptr<IsolatedPluginBinding> processor,
                       tracktion::engine::ProcessState& timeline, std::string deviceId, IsolatedDevicePlugin* owner)
        : input(std::move(source)), binding(std::move(processor)),
          format(binding->format), timeline(timeline), status(binding->status), deviceId(std::move(deviceId)), automationOwner(owner) {
        if(!input)throw std::invalid_argument("Missing isolated plugin input node");
        const auto properties=input->getNodeProperties();
        if(format.inputChannels!=0 && properties.numberOfChannels!=int(format.inputChannels))
            throw std::invalid_argument("Isolated plugin input channels differ from prepared layout");
        if(format.latencyFrames>uint32_t(std::numeric_limits<int>::max()-properties.latencyNumSamples))
            throw std::invalid_argument("Isolated plugin latency overflow");
        if(automationOwner) {
            parameters.reserve(size_t(automationOwner->getNumAutomatableParameters()));
            for(auto* parameter:automationOwner->getAutomatableParameters())
                parameters.push_back({std::stoull(parameter->paramID.toStdString()),parameter});
        }
        setOptimisations({tracktion::graph::ClearBuffers::no,tracktion::graph::AllocateAudioBuffer::yes,tracktion::graph::ShareOutputBuffer::no});
    }
    tracktion::graph::NodeProperties getNodeProperties() override {
        auto properties=input->getNodeProperties();
        properties.hasAudio=true;properties.hasMidi=true;properties.numberOfChannels=int(format.outputChannels);
        properties.latencyNumSamples+=int(format.latencyFrames);properties.nodeID=0;return properties;
    }
    std::vector<Node*> getDirectInputNodes() override { return {input.get()}; }
    bool isReadyToProcess() override { return input->hasProcessed(); }
    const std::string deviceId;
private:
    void prepareToPlay(const tracktion::graph::PlaybackInitialisationInfo& info) override {
        if(info.sampleRate!=format.sampleRate || info.blockSize>int(format.quantum))
            throw std::invalid_argument("Isolated plugin graph requires format reprepare");
        midiOutput.reserve(8192);midiSeed.reserve(8192);dryMidi.reserve(8192);
        if(format.inputChannels>0) {
            dry.setLatencyNumSamples(int(format.latencyFrames));
            dry.prepareToPlay(info.sampleRate,info.blockSize,int(format.inputChannels));
            dryAudio.setSize(int(format.inputChannels),info.blockSize);
        }
        reserveOutput=true;
        automationStep=uint32_t(std::max(128,128*juce::roundToInt(info.sampleRate/44100.0)));
        automationLatency=getNodeProperties().latencyNumSamples;
    }
    void process(ProcessContext& context) override {
        auto source=input->getProcessedOutput();
        context.buffers.midi.clear();
        if(reserveOutput) { midiSeed.swapWith(context.buffers.midi);reserveOutput=false; }
        midiOutput.clear();
        const auto frames=context.numSamples;
        if(frames==0)return;
        if(frames>format.quantum || source.audio.getNumFrames()!=frames) { fail(context,-1);return; }
        const bool enabled=binding->enabled.load(std::memory_order_acquire);
        if(!prepareDry(source,context))return;
        if(failed) { context.buffers.audio.clear();applyBypass(context,enabled);return; }
        uint32_t midiCount=0;
        if(source.midi.isAllNotesOff)for(uint8_t channel=0;channel<16;++channel)
            midiInput[midiCount++]={0,0,{uint8_t(0xb0|channel),123,0},0};
        for(const auto& event:source.midi) {
            const auto size=event.getRawDataSize();
            const auto* bytes=event.getRawData();
            if(size<2 || size>3 || bytes[0]<0x80 || bytes[0]>=0xf0) { fail(context,-3);return; }
            if(midiCount==midiInput.size()) { fail(context,-2);return; }
            const auto sample=std::llround(event.getTimeStamp()*format.sampleRate);
            if(sample<0 || sample>=frames) { fail(context,-3);return; }
            midiInput[midiCount++]={uint32_t(sample),0,{bytes[0],bytes[1],uint8_t(size==3?bytes[2]:0)},0};
        }
        for(uint32_t channel=0;channel<format.inputChannels;++channel)
            inputs[channel]=source.audio.getChannel(channel).data.data;
        for(uint32_t channel=0;channel<format.outputChannels;++channel)
            outputs[channel]=context.buffers.audio.getChannel(channel).data.data;
        zd_plugin_transport transport {};
        transport.sample_position=timeline.timelineSampleRange.getStart()
            +context.referenceSampleRange.getStart()-timeline.referenceSampleRange.getStart();
        transport.flags=timeline.playHeadState.playHead.isPlaying()?1:0;
        if(const auto* sequence=timeline.getTempoSequence()) {
            tracktion::tempo::Sequence::Position position(*sequence);
            position.set(tracktion::TimePosition::fromSamples(transport.sample_position,format.sampleRate));
            const auto meter=position.getTimeSignature();
            transport.beat_position=position.getPPQTime();transport.tempo=position.getTempo();
            transport.bar_start=position.getPPQTimeOfBarStart();transport.bar_number=position.getBarsBeats().bars;
            transport.numerator=uint16_t(meter.numerator);transport.denominator=uint16_t(meter.denominator);
            transport.flags|=2|4|8|16;
            if(timeline.playHeadState.playHead.isLooping()) {
                const auto loop=timeline.playHeadState.playHead.getLoopRange();
                transport.loop_sample_start=loop.getStart();transport.loop_sample_end=loop.getEnd();
                position.set(tracktion::TimePosition::fromSamples(loop.getStart(),format.sampleRate));transport.loop_start=position.getPPQTime();
                position.set(tracktion::TimePosition::fromSamples(loop.getEnd(),format.sampleRate));transport.loop_end=position.getPPQTime();
                transport.flags|=32;
            }
        }
        uint32_t automationCount=0;
        std::array<uint64_t,64> masks;
        const auto words=(parameters.size()+63)/64;
        bool hasAutomation=false;
        for(size_t word=0;word<words;++word) { masks[word]=automationOwner->automatedParameters(word);hasAutomation|=masks[word]!=0; }
        if(hasAutomation) {
            const bool reading=automationOwner->edit.getAutomationRecordManager().isReadingAutomation();
            for(uint32_t offset=0;offset<frames;offset+=automationStep) {
                const auto time=tracktion::TimePosition::fromSamples(transport.sample_position+offset-automationLatency,format.sampleRate);
                if(reading)automationOwner->updateParameterStreams(time);
                for(size_t word=0;word<words;++word)for(auto bits=masks[word];bits;bits&=bits-1) {
                    auto& parameter=parameters[word*64+std::countr_zero(bits)];
                    const auto value=reading?parameter.value->getCurrentValue():parameter.value->getCurrentExplicitValue();
                    if(offset>0 && value==parameter.lastValue)continue;
                    parameter.lastValue=value;
                    if(automationCount==automation.size()-midiCount) { fail(context,-2);return; }
                    automation[automationCount++]={.slot=0,.offset=offset,.parameter=parameter.id,.value=std::clamp(double(value),0.0,1.0)};
                }
            }
        }
        zd_plugin_block block {inputs.data(),outputs.data(),midiInput.data(),automation.data(),midiResult.data(),&transport,
            frames,format.inputChannels,format.outputChannels,midiCount,automationCount,uint32_t(midiResult.size()),0};
        const auto result=binding->process(block);
        if(result<0 || block.produced_count>midiResult.size()) { fail(context,result<0?result:-2);applyBypass(context,enabled);return; }
        for(uint32_t index=0;index<block.produced_count;++index) {
            const auto& event=midiResult[index];
            if(event.offset>=frames || event.port!=0 || event.reserved!=0
                || event.bytes[0]<0x80 || event.bytes[0]>=0xf0 || event.bytes[1]>=0x80
                || (((event.bytes[0]&0xf0)!=0xc0 && (event.bytes[0]&0xf0)!=0xd0) && event.bytes[2]>=0x80)) { fail(context,-3);return; }
            const int size=(event.bytes[0]&0xf0)==0xc0 || (event.bytes[0]&0xf0)==0xd0?2:3;
            midiOutput.addMidiMessage(juce::MidiMessage(event.bytes,size,double(event.offset)/format.sampleRate),{});
        }
        midiOutput.swapWith(context.buffers.midi);
        applyBypass(context,enabled);
    }
    bool prepareDry(const AudioAndMidiBuffer& source,ProcessContext& context) {
        if(format.inputChannels>0) {
            dry.writeAudio(source.audio);
            dry.readAudioOverwriting(tracktion::graph::toBufferView(dryAudio).getStart(context.numSamples));
        }
        dryMidi.clear();
        if(source.midi.isAllNotesOff)dryMidi.isAllNotesOff=true;
        for(const auto& event:source.midi) {
            const auto size=event.getRawDataSize();
            if(size<2 || size>3) { fail(context,-3);return false; }
            if(delayedCount==delayed.size()) { fail(context,-2);return false; }
            const auto offset=std::llround(event.getTimeStamp()*format.sampleRate);
            if(offset<0 || offset>=context.numSamples) { fail(context,-3);return false; }
            const auto* bytes=event.getRawData();
            delayed[(delayedRead+delayedCount)%delayed.size()]={dryPosition+uint64_t(offset)+format.latencyFrames,
                {bytes[0],bytes[1],uint8_t(size==3?bytes[2]:0)},uint8_t(size)};
            ++delayedCount;
        }
        while(delayedCount>0 && delayed[delayedRead].frame<dryPosition+context.numSamples) {
            const auto& event=delayed[delayedRead];
            dryMidi.addMidiMessage(juce::MidiMessage(event.bytes.data(),event.size,double(event.frame-dryPosition)/format.sampleRate),{});
            delayedRead=(delayedRead+1)%delayed.size();--delayedCount;
        }
        dryPosition+=context.numSamples;
        return true;
    }
    void applyBypass(ProcessContext& context,bool enabled) {
        if(!enabled) {
            if(format.inputChannels==0)context.buffers.audio.clear();
            else for(uint32_t channel=0;channel<format.outputChannels;++channel)
                for(uint32_t frame=0;frame<context.numSamples;++frame)
                    context.buffers.audio.getSample(channel,frame)=dryAudio.getSample(int(std::min(channel,format.inputChannels-1)),int(frame));
            context.buffers.midi.clear();context.buffers.midi.copyFrom(dryMidi);
        }
        if(enabled!=wasEnabled)context.buffers.midi.isAllNotesOff=true;
        wasEnabled=enabled;
    }
    void fail(ProcessContext& context,int32_t code) noexcept {
        failed=true;binding->latchFault(code);
        context.buffers.audio.clear();context.buffers.midi.clear();context.buffers.midi.isAllNotesOff=true;
    }
    std::unique_ptr<Node> input;
    const std::shared_ptr<IsolatedPluginBinding> binding;
    IsolatedPluginFormat format;
    tracktion::engine::ProcessState& timeline;
    std::atomic<int32_t>& status;
    std::array<const float*,64> inputs {};
    std::array<float*,64> outputs {};
    std::array<zd_plugin_midi,4096> midiInput {};
    std::array<zd_plugin_midi,8192> midiResult {};
    juce::ReferenceCountedObjectPtr<IsolatedDevicePlugin> automationOwner;
    struct Parameter { uint64_t id;tracktion::AutomatableParameter::Ptr value;float lastValue=0; };
    std::vector<Parameter> parameters;
    std::array<zd_plugin_automation,4096> automation {};
    uint32_t automationStep=128;
    int automationLatency=0;
    tracktion::engine::MidiMessageArray midiOutput,midiSeed;
    struct DelayedMidi { uint64_t frame;std::array<uint8_t,3> bytes;uint8_t size; };
    std::array<DelayedMidi,8192> delayed {};
    size_t delayedRead=0,delayedCount=0;
    uint64_t dryPosition=0;
    tracktion::graph::LatencyProcessor dry;
    juce::AudioBuffer<float> dryAudio;
    tracktion::engine::MidiMessageArray dryMidi;
    bool wasEnabled=true;
    bool reserveOutput=false,failed=false;
};
}
std::unique_ptr<tracktion::graph::Node> createIsolatedPluginNode(
    std::unique_ptr<tracktion::graph::Node> source,std::shared_ptr<IsolatedPluginBinding> binding,
    tracktion::engine::ProcessState& timeline,std::string deviceId,IsolatedDevicePlugin* automationOwner) {
    if(!binding)throw std::invalid_argument("Missing isolated processor binding");
    return std::make_unique<IsolatedPluginNode>(std::move(source),std::move(binding),timeline,std::move(deviceId),automationOwner);
}
const std::string* isolatedDeviceId(tracktion::graph::Node& node) noexcept {
    auto* isolated=dynamic_cast<IsolatedPluginNode*>(&node);
    return isolated && !isolated->deviceId.empty()?&isolated->deviceId:nullptr;
}
}
