#pragma once
#include <tracktion_graph/tracktion_graph.h>
#include <memory>
#include <atomic>

namespace tracktion::inline engine { struct ProcessState; class AudioTrack; }
namespace zp {
struct Track;
struct Request;
// Audio-only native inputs remain dependencies even when monitoring is silent.
// MIDI-producing sources are rejected before the graph starts processing.
std::unique_ptr<tracktion::graph::Node> createInputMonitorNode(
    std::unique_ptr<tracktion::graph::Node>, const Track&, const Request&,
    tracktion::engine::ProcessState&, const std::atomic<bool>& recordingActive, tracktion::engine::AudioTrack* launcherTrack);
}
