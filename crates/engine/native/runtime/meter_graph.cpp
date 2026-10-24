#include "meter_graph.h"
#include "isolated_plugin_node.h"
#include <tracktion_engine/tracktion_engine.h>
#include <tracktion_engine/playback/graph/tracktion_TracktionEngineNode.h>
#include <tracktion_engine/playback/graph/tracktion_PluginNode.h>
#include <tracktion_engine/playback/graph/tracktion_TrackMutingNode.h>
#include <algorithm>
#include <cmath>
#include <limits>
#include <set>
#include <stdexcept>

namespace zp {
namespace {
class MeterTapNode final : public tracktion::graph::Node {
public:
    MeterTapNode(std::unique_ptr<Node> source, std::shared_ptr<MeterBank> state)
        : input(std::move(source)), bank(std::move(state)) {
        setOptimisations({tracktion::graph::ClearBuffers::no, tracktion::graph::AllocateAudioBuffer::no});
    }
    tracktion::graph::NodeProperties getNodeProperties() override {
        auto properties = input->getNodeProperties();
        // Never reuse an old graph's lane via node identity/state transfer.
        properties.nodeID = 0;
        return properties;
    }
    std::vector<Node*> getDirectInputNodes() override { return {input.get()}; }
    bool isReadyToProcess() override { return input->hasProcessed(); }
private:
    void prepareToPlay(const tracktion::graph::PlaybackInitialisationInfo&) override {
        if (input->numOutputNodes != 1)
            throw std::logic_error("MeterTapNode requires an exclusive input edge");
    }
    void process(ProcessContext& context) override {
        auto source = input->getProcessedOutput();
        setAudioOutput(input.get(), source.audio);
        context.buffers.midi.swapWith(source.midi);
        if (context.referenceSampleRange.getStart() < 0) return;
        const auto start = static_cast<std::uint64_t>(context.referenceSampleRange.getStart());
        const auto frames = source.audio.getNumFrames();
        for (std::uint32_t channel = 0; channel < bank->channels; ++channel) {
            const auto* samples = source.audio.getChannel(channel).data.data;
            bank->tap(channel)->process({samples, frames}, start);
        }
    }
    const std::unique_ptr<Node> input;
    const std::shared_ptr<MeterBank> bank;
};

struct ObservedMeterOutput {
    tracktion::graph::Node* node;
    std::shared_ptr<MeterBank> bank;
};

class MeterOutputObserverNode final : public tracktion::graph::Node {
public:
    MeterOutputObserverNode(std::unique_ptr<Node> source, std::vector<ObservedMeterOutput> outputs)
        : root(std::move(source)), observed(std::move(outputs)), inputs{root.get()} {
        // These edges must exist before createNodeGraph counts consumers and enables in-place DSP.
        for (const auto& output : observed)
            if (std::find(inputs.begin(), inputs.end(), output.node) == inputs.end()) inputs.push_back(output.node);
        setOptimisations({tracktion::graph::ClearBuffers::no, tracktion::graph::AllocateAudioBuffer::no});
    }
    tracktion::graph::NodeProperties getNodeProperties() override {
        auto properties = root->getNodeProperties();
        properties.nodeID = 0;
        return properties;
    }
    std::vector<Node*> getDirectInputNodes() override { return inputs; }
    bool isReadyToProcess() override {
        return std::all_of(inputs.begin(), inputs.end(), [](const auto* node) { return node->hasProcessed(); });
    }
private:
    void prepareToPlay(const tracktion::graph::PlaybackInitialisationInfo&) override {
        exclusiveRoot = root->numOutputNodes == 1;
        if (!exclusiveRoot && root->getNodeProperties().hasMidi)
            throw std::logic_error("Meter output observer requires an exclusive MIDI output root");
        // A forwarded shared buffer must not become writable through this extra alias.
        setOptimisations({tracktion::graph::ClearBuffers::no, tracktion::graph::AllocateAudioBuffer::no,
                          exclusiveRoot && root->canShareOutputBuffer()
                              ? tracktion::graph::ShareOutputBuffer::yes
                              : tracktion::graph::ShareOutputBuffer::no});
    }
    void process(ProcessContext& context) override {
        if (context.referenceSampleRange.getStart() >= 0) {
            const auto start = static_cast<std::uint64_t>(context.referenceSampleRange.getStart());
            for (const auto& output : observed) {
                const auto buffers = output.node->getProcessedOutput();
                for (std::uint32_t channel = 0; channel < output.bank->channels; ++channel)
                    output.bank->tap(channel)->process(
                        {buffers.audio.getChannel(channel).data.data, buffers.audio.getNumFrames()}, start);
            }
        }
        auto source = root->getProcessedOutput();
        // setAudioOutput retains the source through downstream use, including pooled buffers.
        setAudioOutput(root.get(), source.audio);
        if (exclusiveRoot) context.buffers.midi.swapWith(source.midi);
        else context.buffers.midi.clear();
    }
    const std::unique_ptr<Node> root;
    const std::vector<ObservedMeterOutput> observed;
    std::vector<Node*> inputs;
    bool exclusiveRoot = false;
};

void validateChannelSlots(int channels, std::uint32_t slots) {
    if (channels > std::numeric_limits<std::uint16_t>::max()
        || static_cast<std::uint64_t>(slots) + channels > std::numeric_limits<std::uint32_t>::max())
        throw std::overflow_error("Meter graph slot identity exhausted");
}
}

MeterGraph::MeterGraph(MeterBankIdentity stamp, double rate) : identity(stamp), sampleRate(rate) {
    if (!std::isfinite(rate) || rate <= 0) throw std::invalid_argument("Invalid meter graph sample rate");
}
std::unique_ptr<tracktion::graph::Node> MeterGraph::observeOutput(
    std::unique_ptr<tracktion::graph::Node> root,
    const std::map<tracktion::engine::Track*, MeterOutputIdentity>& identities,
    const std::map<tracktion::engine::Plugin*, std::string>& devices) {
    if (sealed) throw std::logic_error("Meter graph registry is sealed");
    if (!root || (identities.empty() && devices.empty())) return root;
    using Node = tracktion::graph::Node;
    std::map<Node*, std::vector<Node*>> consumers;
    std::map<tracktion::engine::Track*, Node*> fences;
    std::vector<std::pair<Node*, MeterOutputIdentity>> deviceCandidates;
    tracktion::graph::visitNodes(*root, [&](Node& node) {
        for (auto* input : node.getDirectInputNodes()) consumers[input].push_back(&node);
        if(const auto* id=isolatedDeviceId(node)) {
            const auto inputs=node.getDirectInputNodes();
            if(inputs.size()!=1)throw std::logic_error("Isolated device meter requires one input node");
            deviceCandidates.push_back({inputs.front(),{"device/"+*id+"/in",*id,"device-in"}});
            deviceCandidates.push_back({&node,{"device/"+*id+"/out",*id,"device-out"}});
        }
        auto* pluginNode = dynamic_cast<tracktion::engine::PluginNode*>(&node);
        if (!pluginNode) return;
        if (auto device = devices.find(&pluginNode->getPlugin()); device != devices.end()) {
            const auto inputs = pluginNode->getDirectInputNodes();
            if (inputs.size() != 1) throw std::logic_error("Device meter requires one plugin input node");
            const auto& id = device->second;
            deviceCandidates.push_back({inputs.front(), {"device/" + id + "/in", id, "device-in"}});
            deviceCandidates.push_back({&node, {"device/" + id + "/out", id, "device-out"}});
        }
        if (pluginNode->getPlugin().getPluginType() != "zoeydaw-playback-fence") return;
        auto* owner = pluginNode->getPlugin().getOwnerTrack();
        if (identities.find(owner) == identities.end()) return;
        if (!fences.emplace(owner, &node).second)
            throw std::logic_error("Ambiguous playback fence for meter endpoint");
    }, false);

    std::map<Node*, MeterOutputIdentity> candidates;
    for (const auto& [track, fence] : fences) {
        Node* finalMute = nullptr;
        std::vector<Node*> pending{fence};
        std::set<Node*> visited;
        while (!pending.empty()) {
            auto* node = pending.back();
            pending.pop_back();
            if (!visited.insert(node).second) continue;
            if (node != fence && dynamic_cast<tracktion::engine::TrackMutingNode*>(node)) {
                if (finalMute && finalMute != node)
                    throw std::logic_error("Ambiguous final mute node for meter endpoint");
                finalMute = node;
                continue;
            }
            const auto found = consumers.find(node);
            if (found != consumers.end())
                pending.insert(pending.end(), found->second.begin(), found->second.end());
        }
        if (!finalMute) throw std::logic_error("Final mute node missing for meter endpoint");
        if (!candidates.emplace(finalMute, identities.at(track)).second)
            throw std::logic_error("Different meter endpoints resolve to the same output node");
    }
    deviceCandidates.insert(deviceCandidates.end(), candidates.begin(), candidates.end());

    std::vector<ObservedMeterOutput> observations;
    std::vector<GraphMeterEndpoint> additions;
    auto nextSlot = slots;
    for (const auto& [node, outputIdentity] : deviceCandidates) {
        const auto existingNode = observedOutputs.find(outputIdentity.endpointId);
        const auto existingEndpoint = std::find_if(entries.begin(), entries.end(), [&](const auto& entry) {
            return entry.endpointId == outputIdentity.endpointId;
        });
        if (existingNode != observedOutputs.end()) {
            if (existingNode->second != node || existingEndpoint == entries.end()
                || existingEndpoint->ownerId != outputIdentity.ownerId || existingEndpoint->kind != outputIdentity.kind)
                throw std::logic_error("Conflicting meter identity for shared output node");
            continue;
        }
        if (existingEndpoint != entries.end()
            || std::any_of(additions.begin(), additions.end(), [&](const auto& entry) {
                return entry.endpointId == outputIdentity.endpointId;
            }))
            throw std::logic_error("Different output nodes share one meter endpoint");
        const auto channels = node->getNodeProperties().numberOfChannels;
        if (channels <= 0) continue;
        validateChannelSlots(channels, nextSlot);
        auto bank = std::make_shared<MeterBank>(identity, static_cast<std::uint32_t>(channels));
        observations.push_back({node, bank});
        additions.push_back({outputIdentity.endpointId, outputIdentity.ownerId, outputIdentity.kind, nextSlot,
                             static_cast<std::uint16_t>(channels), std::move(bank)});
        nextSlot += static_cast<std::uint32_t>(channels);
    }
    if (observations.empty()) return root;
    entries.reserve(entries.size() + additions.size());
    for (std::size_t index = 0; index < additions.size(); ++index) {
        observedOutputs.emplace(additions[index].endpointId, observations[index].node);
        entries.push_back(std::move(additions[index]));
    }
    slots = nextSlot;
    return std::make_unique<MeterOutputObserverNode>(std::move(root), std::move(observations));
}
std::unique_ptr<tracktion::graph::Node> MeterGraph::wrapOutput(std::unique_ptr<tracktion::graph::Node> node,
                                                              std::string endpointId, std::string ownerId,
                                                              std::string kind) {
    if (sealed) throw std::logic_error("Meter graph registry is sealed");
    if (!node) return node;
    if (std::any_of(entries.begin(), entries.end(), [&](const auto& entry) { return entry.endpointId == endpointId; }))
        throw std::logic_error("Duplicate meter endpoint in one graph");
    const auto channels = node->getNodeProperties().numberOfChannels;
    if (channels <= 0) return node;
    validateChannelSlots(channels, slots);
    auto bank = std::make_shared<MeterBank>(identity, static_cast<std::uint32_t>(channels));
    auto result = std::make_unique<MeterTapNode>(std::move(node), bank);
    entries.push_back({std::move(endpointId), std::move(ownerId), std::move(kind), slots,
                       static_cast<std::uint16_t>(channels), std::move(bank)});
    slots += static_cast<std::uint32_t>(channels);
    return result;
}
void MeterGraph::seal() {
    if (sealed) throw std::logic_error("Meter graph sealed twice");
    sealed = true;
}
bool MeterGraph::canRetire() const noexcept {
    return std::all_of(entries.begin(), entries.end(), [](const auto& entry) { return entry.bank.use_count() == 1; });
}
MeterGraphCollector::MeterGraphCollector(std::shared_ptr<const MeterGraph> state) : graph(std::move(state)) {
    if (!graph || !graph->sealed) throw std::logic_error("Meter graph registry is not sealed");
    std::size_t count = 0;
    for (const auto& endpoint : graph->endpoints()) {
        auto reader = MeterReadHandle::acquire(endpoint.bank, graph->identity);
        if (!reader) throw std::logic_error("Meter graph already has a consumer");
        readers.push_back(std::move(reader));
        count += endpoint.channelCount;
    }
    cache.resize(count);
    received.resize(count, false);
}
void MeterGraphCollector::collect() {
    for (std::size_t endpoint = 0; endpoint < readers.size(); ++endpoint) {
        const auto& entry = graph->endpoints()[endpoint];
        for (std::uint16_t channel = 0; channel < entry.channelCount; ++channel) {
            const auto slot = entry.firstSlot + channel;
            if (readers[endpoint]->read(channel, cache[slot])) received[slot] = true;
        }
    }
}
const MeterPublication* MeterGraphCollector::latest(const std::string& endpointId, std::uint16_t channel) const noexcept {
    for (const auto& entry : graph->endpoints()) {
        if (entry.endpointId != endpointId || channel >= entry.channelCount) continue;
        const auto slot = entry.firstSlot + channel;
        return received[slot] ? &cache[slot] : nullptr;
    }
    return nullptr;
}
}
