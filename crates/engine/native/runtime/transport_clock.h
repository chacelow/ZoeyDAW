#pragma once
#include "playback_model.h"
#include <atomic>
#include <cstdint>
#include <functional>
#include <limits>
#include <memory>
#include <optional>
#include <stdexcept>
namespace zp {
enum class TransportClockMode : std::uint64_t { stopped, playing, recording };
struct TransportClockTarget {
    std::uint64_t version, ownerEpoch, sequence, controlGeneration;
    TransportClockMode mode;
};
class TransportClockMutation;
class TransportClockState final {
public:
    std::uint64_t ownerEpoch() const noexcept { return owner.load(); }
    std::optional<TransportClockTarget> read() const noexcept {
        const auto before=version.load();
        if(before==0 || (before&1))return {};
        TransportClockTarget target{before,owner.load(),sequence.load(),control.load(),static_cast<TransportClockMode>(mode.load())};
        if(version.load()!=before || target.ownerEpoch==0)return {};
        return target;
    }
private:
    friend class TransportClockMutation;
    friend class TransportClockWitness;
    // Atomic payloads keep failed reads data-race-free; the audio reader never retries.
    std::atomic<std::uint64_t> version{0},owner{0},sequence{0},control{0},mode{0};
};
static_assert(std::atomic<std::uint64_t>::is_always_lock_free);
class TransportClockMutation final {
public:
    TransportClockMutation(TransportClockState& state,bool newOwner) : state(state) {
        const auto previous=state.version.load();
        const auto owner=state.owner.load();
        if(previous>std::numeric_limits<std::uint64_t>::max()-3 || (newOwner && owner==std::numeric_limits<std::uint64_t>::max()))
            throw std::overflow_error("Transport observation epoch exhausted; restart the engine");
        version=previous+((previous&1)?2:1);
        state.version.store(version);
        if(newOwner)state.owner.store(owner+1);
    }
    TransportClockMutation(const TransportClockMutation&)=delete;
    TransportClockMutation& operator=(const TransportClockMutation&)=delete;
    // Without publication, the odd version keeps observations unavailable through failure recovery.
    void publish(const Request& request,std::uint64_t sequence) noexcept {
        state.sequence.store(sequence);
        state.control.store(request.controlGeneration);
        state.mode.store(static_cast<std::uint64_t>(request.recording?TransportClockMode::recording:
                                                   request.playing?TransportClockMode::playing:TransportClockMode::stopped));
        state.version.store(version+1);
    }
private:
    TransportClockState& state;
    std::uint64_t version=0;
};
struct MeterControlSource {
    std::shared_ptr<const TransportClockState> state;
    std::uint64_t ownerEpoch=0;
    std::function<bool()> positionPending;
    const std::atomic<bool>* recordingActive=nullptr;
};
class TransportClockWitness final {
public:
    explicit TransportClockWitness(MeterControlSource source) : source(std::move(source)) {}
    void beginBlock() noexcept {
        const auto version=source.state?source.state->version.load():0;
        if(version==0 || (version&1) || !source.positionPending || source.positionPending())blockVersion.reset();
        else blockVersion=version;
    }
    bool isRecording() const noexcept { return source.recordingActive && source.recordingActive->load(std::memory_order_acquire); }
    std::optional<TransportClockTarget> endBlock(bool playing,bool recording) noexcept {
        if(!blockVersion)return {};
        const auto current=source.state->read();
        if(!current || current->version!=*blockVersion || current->ownerEpoch!=source.ownerEpoch)return {};
        const auto actual=recording?TransportClockMode::recording:playing?TransportClockMode::playing:TransportClockMode::stopped;
        if(actual!=current->mode && (!adoptedGeneration || *adoptedGeneration!=current->controlGeneration))return {};
        adoptedGeneration=current->controlGeneration;
        return current;
    }
private:
    const MeterControlSource source;
    std::optional<std::uint64_t> blockVersion,adoptedGeneration;
};
}
