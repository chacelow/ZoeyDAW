#pragma once
#include "../../../plugin-abi/include/processor.h"
#include "realtime_snapshot.h"
#include "device_model.h"
#include <atomic>
#include <memory>
#include <thread>
#include <vector>

namespace zp {
struct IsolatedPluginFormat {
    double sampleRate;
    uint32_t quantum, inputChannels, outputChannels, latencyFrames;
};

class IsolatedPluginBinding final {
public:
    IsolatedPluginBinding(zd_plugin_callback, IsolatedPluginFormat, void (*release)(void*));
    ~IsolatedPluginBinding();
    IsolatedPluginBinding(const IsolatedPluginBinding&) = delete;
    IsolatedPluginBinding& operator=(const IsolatedPluginBinding&) = delete;
    int32_t process(zd_plugin_block&) noexcept;
    int32_t latchFault(int32_t) noexcept;
    void setParameters(const std::vector<ExternalParameter>&);
    const IsolatedPluginFormat format;
    std::atomic<int32_t> status {0};
    std::atomic<bool> enabled {true};
private:
    const zd_plugin_callback callback;
    std::atomic_flag processing = ATOMIC_FLAG_INIT;
    void (*release)(void*);
    struct ManualParameters { uint32_t count=0;std::array<zd_plugin_automation,4096> values {}; };
    RealtimeSnapshot<ManualParameters> manual;
    ManualParameters pendingManual;
    bool manualPending=false;
};

// The control thread keeps the last reference until every graph has released its binding.
class IsolatedPluginBindings final {
public:
    IsolatedPluginBindings();
    ~IsolatedPluginBindings();
    IsolatedPluginBindings(const IsolatedPluginBindings&) = delete;
    IsolatedPluginBindings& operator=(const IsolatedPluginBindings&) = delete;
    IsolatedPluginBindings(IsolatedPluginBindings&&) = delete;
    IsolatedPluginBindings& operator=(IsolatedPluginBindings&&) = delete;
    std::shared_ptr<IsolatedPluginBinding> retain(zd_plugin_callback, IsolatedPluginFormat, void (*release)(void*));
    std::shared_ptr<IsolatedPluginBinding> retainOwned(zd_plugin_owned_processor, IsolatedPluginFormat);
    void collect();
    size_t size() const noexcept { return bindings.size(); }
private:
    void requireOwner() const;
    const std::thread::id owner;
    std::vector<std::shared_ptr<IsolatedPluginBinding>> bindings;
};
}
