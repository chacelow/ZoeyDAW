#pragma once
#include "meter_bank.h"
#include <tracktion_graph/tracktion_graph.h>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace tracktion::inline engine { class Track; class Plugin; }

namespace zp {
struct MeterOutputIdentity {
    std::string endpointId, ownerId, kind;
};

struct GraphMeterEndpoint {
    std::string endpointId, ownerId, kind;
    std::uint32_t firstSlot = 0;
    std::uint16_t channelCount = 0;
    std::shared_ptr<MeterBank> bank;
};

// Construction/sealing and reference retirement are confined to the message thread.
class MeterGraph final {
public:
    MeterGraph(MeterBankIdentity identity, double sampleRate);
    std::unique_ptr<tracktion::graph::Node> observeOutput(
        std::unique_ptr<tracktion::graph::Node>,
        const std::map<tracktion::engine::Track*, MeterOutputIdentity>&,
        const std::map<tracktion::engine::Plugin*, std::string>& devices);
    std::unique_ptr<tracktion::graph::Node> wrapOutput(std::unique_ptr<tracktion::graph::Node>,
                                                      std::string endpointId, std::string ownerId,
                                                      std::string kind);
    void seal();
    const std::vector<GraphMeterEndpoint>& endpoints() const noexcept { return entries; }
    bool canRetire() const noexcept;
    const MeterBankIdentity identity;
    const double sampleRate;
private:
    friend class MeterGraphCollector;
    bool sealed = false;
    std::uint32_t slots = 0;
    std::vector<GraphMeterEndpoint> entries;
    std::map<std::string, tracktion::graph::Node*> observedOutputs;
};

// Temporary JSON compatibility collector; replace its ownership with the Rust Hub in step 3.
// All callers read the same cached publications, never acquire another mailbox consumer.
class MeterGraphCollector final {
public:
    explicit MeterGraphCollector(std::shared_ptr<const MeterGraph>);
    void collect();
    const MeterPublication* latest(const std::string& endpointId, std::uint16_t channel) const noexcept;
private:
    std::shared_ptr<const MeterGraph> graph;
    std::vector<std::unique_ptr<MeterReadHandle>> readers;
    std::vector<MeterPublication> cache;
    std::vector<bool> received;
};
}
