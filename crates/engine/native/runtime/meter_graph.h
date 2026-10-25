#pragma once
#include "meter_bank.h"
#include "transport_clock.h"
#include <tracktion_graph/tracktion_graph.h>
#include <map>
#include <memory>
#include <string>
#include <vector>
#include <mutex>

namespace tracktion::inline engine { class Track; class Plugin; struct ProcessState; }

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

struct MeterClockObservation {
    std::uint64_t referenceSample = 0, deviceSample = 0;
    std::int64_t timelineSample = 0;
    double timelineBeat = 0, tempoBpm = 0;
    std::uint32_t frames = 0, playing = 0;
    std::uint64_t controlGeneration = 0, appliedSequence = 0;
    double bar = 0, barsPerSecond = 0;
    std::uint64_t ownerEpoch = 0;
    std::uint32_t controlValid = 0, recording = 0;
};
struct MeterClockBank {
    RealtimeSnapshot<MeterClockObservation> mailbox;
};

// Construction/sealing and reference retirement are confined to the message thread.
class MeterGraph final {
public:
    MeterGraph(MeterBankIdentity identity, double sampleRate, MeterControlSource controls = {});
    std::unique_ptr<tracktion::graph::Node> observeOutput(
        std::unique_ptr<tracktion::graph::Node>,
        const std::map<tracktion::engine::Track*, MeterOutputIdentity>&,
        const std::map<tracktion::engine::Plugin*, std::string>& devices,
        tracktion::engine::ProcessState* processState = nullptr,
        const std::atomic<std::uint64_t>* deviceSamples = nullptr);
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
    const MeterControlSource controls;
    bool sealed = false;
    std::uint32_t slots = 0;
    std::vector<GraphMeterEndpoint> entries;
    std::map<std::string, tracktion::graph::Node*> observedOutputs;
    std::shared_ptr<MeterClockBank> clock = std::make_shared<MeterClockBank>();
    bool clockWriterAssigned = false;
};

// One graph publication cache; the Rust Hub owns its serialized mailbox consumption.
// All callers read the same cached publications, never acquire another mailbox consumer.
class MeterGraphCollector final {
public:
    explicit MeterGraphCollector(std::shared_ptr<const MeterGraph>);
    void collect();
    const MeterPublication* latest(const std::string& endpointId, std::uint16_t channel) const noexcept;
    bool copyLatest(std::uint32_t slot, MeterPublication& result);
    bool copyLatest(const std::string& endpointId, std::uint16_t channel, MeterPublication& result);
    bool requestReset(std::span<const std::uint32_t> slots,std::uint32_t epoch,MeterReset kind);
    bool readClock(MeterClockObservation& result);
    std::shared_ptr<const MeterGraph> description() const noexcept { return graph; }
    bool acquireHub() noexcept { return !hubAcquired.exchange(true,std::memory_order_acq_rel); }
    void releaseHub() noexcept { hubAcquired.store(false,std::memory_order_release); }
    bool hasHub() const noexcept { return hubAcquired.load(std::memory_order_acquire); }
private:
    std::shared_ptr<const MeterGraph> graph;
    std::vector<std::unique_ptr<MeterReadHandle>> readers;
    std::vector<MeterPublication> cache;
    std::vector<bool> received;
    std::vector<std::uint32_t> requestedResetEpochs;
    std::mutex cacheMutex;
    std::atomic<bool> hubAcquired {false};
};
}
