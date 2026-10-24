#pragma once
#include "isolated_plugin_binding.h"
#include <tracktion_graph/tracktion_graph.h>
#include <atomic>
#include <memory>
#include <string>

namespace tracktion::inline engine { struct ProcessState; }
namespace zp {
std::unique_ptr<tracktion::graph::Node> createIsolatedPluginNode(
    std::unique_ptr<tracktion::graph::Node>, std::shared_ptr<IsolatedPluginBinding>,
    tracktion::engine::ProcessState&, std::string deviceId = {});
const std::string* isolatedDeviceId(tracktion::graph::Node&) noexcept;
}
