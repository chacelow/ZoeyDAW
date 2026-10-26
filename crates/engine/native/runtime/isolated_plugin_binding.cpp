#include "isolated_plugin_binding.h"
#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace zp {
IsolatedPluginBinding::IsolatedPluginBinding(zd_plugin_callback processor, IsolatedPluginFormat prepared,
                                           void (*dispose)(void*))
    : format(prepared), callback(processor), release(dispose) {
    if(!callback.context || !callback.process || !std::isfinite(format.sampleRate)
        || format.sampleRate<=0 || format.quantum==0 || format.quantum>4096
        || format.inputChannels>64 || format.outputChannels==0 || format.outputChannels>64)
        throw std::invalid_argument("Invalid isolated processor binding");
}
IsolatedPluginBinding::~IsolatedPluginBinding() {
    if(release)release(callback.context);
}
int32_t IsolatedPluginBinding::latchFault(int32_t code) noexcept {
    auto previous=status.load(std::memory_order_acquire);
    while(previous>=0 && !status.compare_exchange_strong(previous,code,std::memory_order_acq_rel)) {}
    return previous<0?previous:code;
}
void IsolatedPluginBinding::setParameters(const std::vector<ExternalParameter>& values) {
    if(values.size()>4096)throw std::invalid_argument("External parameter capacity exceeded");
    ManualParameters next;next.count=uint32_t(values.size());
    for(size_t index=0;index<values.size();++index)next.values[index]={0,0,values[index].id,values[index].normalized};
    manual.publish(next);
}
bool IsolatedPluginBinding::setEditorAuthority(std::uintptr_t context, bool active) noexcept {
    if(context!=reinterpret_cast<std::uintptr_t>(callback.context))return false;
    editorActive.store(active,std::memory_order_release);
    return true;
}
int32_t IsolatedPluginBinding::process(zd_plugin_block& block) noexcept {
    block.produced_count=0;
    if(const auto fault=status.load(std::memory_order_acquire);fault<0)return fault;
    if(processing.test_and_set(std::memory_order_acquire)) {
        return latchFault(-7);
    }
    struct Exit {
        std::atomic_flag& flag;
        ~Exit() { flag.clear(std::memory_order_release); }
    } exit {processing};
    if(const auto fault=status.load(std::memory_order_acquire);fault<0)return fault;
    if(block.midi_count>4096 || block.automation_count>4096-block.midi_count)return latchFault(-2);
    manualPending=manual.readLatest(pendingManual) || manualPending;
    const auto* originalAutomation=block.automation;
    if(editorActive.load(std::memory_order_acquire))manualPending=false;
    const auto originalCount=block.automation_count;
    if(manualPending && originalCount==0 && pendingManual.count<=4096-block.midi_count) {
        block.automation=pendingManual.values.data();block.automation_count=pendingManual.count;manualPending=false;
    }
    const auto result=callback.process(callback.context,&block);
    block.automation=originalAutomation;block.automation_count=originalCount;
    if(result<0) { block.produced_count=0;return latchFault(result); }
    auto previous=status.load(std::memory_order_acquire);
    if(previous>=0)status.compare_exchange_strong(previous,result,std::memory_order_acq_rel);
    const auto published=status.load(std::memory_order_acquire);
    if(published<0)block.produced_count=0;
    return published<0?published:result;
}
IsolatedPluginBindings::IsolatedPluginBindings() : owner(std::this_thread::get_id()) {}
IsolatedPluginBindings::~IsolatedPluginBindings() {
    // Outstanding graph references would move final processor destruction to an audio worker.
    if(std::this_thread::get_id()!=owner
        || std::any_of(bindings.begin(),bindings.end(),[](const auto& binding){return binding.use_count()!=1;}))
        std::terminate();
}
void IsolatedPluginBindings::requireOwner() const {
    if(std::this_thread::get_id()!=owner)throw std::logic_error("Processor retirement requires its control thread");
}
std::shared_ptr<IsolatedPluginBinding> IsolatedPluginBindings::retain(
    zd_plugin_callback callback,IsolatedPluginFormat format,void (*release)(void*)) {
    requireOwner();
    auto binding=std::make_shared<IsolatedPluginBinding>(callback,format,release);
    bindings.push_back(binding);
    return binding;
}
std::shared_ptr<IsolatedPluginBinding> IsolatedPluginBindings::retainOwned(
    zd_plugin_owned_processor processor,IsolatedPluginFormat format) {
    requireOwner();
    if(!processor.context || !processor.release)
        throw std::invalid_argument("Invalid owned processor descriptor");
    auto dispose=processor.release;
    std::unique_ptr<void,decltype(dispose)> pending(processor.context,dispose);
    auto binding=std::make_shared<IsolatedPluginBinding>(
        zd_plugin_callback{processor.context,processor.process},format,processor.release);
    pending.release();
    bindings.push_back(binding);
    return binding;
}
void IsolatedPluginBindings::collect() {
    requireOwner();
    std::erase_if(bindings,[](const auto& binding){return binding.use_count()==1;});
}
}
