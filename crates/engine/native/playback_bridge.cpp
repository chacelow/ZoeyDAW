#include "playback_bridge.h"
#include "runtime/engine_session.h"
#include "analysis/analysis.h"
#include <cstdlib>
#include <cstring>
struct zp_session { zp::EngineSession owner; };
namespace {
char* copy(const juce::String& value) noexcept {
    const size_t bytes=value.getNumBytesAsUTF8()+1;auto* buffer=static_cast<char*>(std::malloc(bytes));if(buffer)std::memcpy(buffer,value.toRawUTF8(),bytes);return buffer;
}
char* failure(const char* message) noexcept {
    try { auto v=zp::object();zp::put(v,"ok",false);zp::put(v,"error",juce::String::fromUTF8(message));return copy(juce::JSON::toString(v,true)); }catch(...) { return copy("{\"ok\":false,\"error\":\"Native playback failed\"}"); }
}
template<class F> char* answer(F&& fn) noexcept {
    try { auto value=fn();auto v=zp::object();zp::put(v,"ok",true);zp::put(v,"value",value);return copy(juce::JSON::toString(v,true)); }
    catch(const std::exception& e) { return failure(e.what()); }
    catch(...) { return failure("Unknown native playback exception"); }
}
void fence(std::atomic<uint64_t>& atomic,uint64_t token) noexcept { auto old=atomic.load();while(old<token && !atomic.compare_exchange_weak(old,token)){} }
}
extern "C" {
zp_session* zp_create(char** error) { try { if(error)*error=nullptr;return new zp_session(); }catch(const std::exception& e) { if(error)*error=copy(e.what());return nullptr; }catch(...) { if(error)*error=copy("Cannot create native playback engine");return nullptr; } }
void zp_destroy(zp_session* session) { try { delete session; }catch(...) {} }
char* zp_call(zp_session* session,const char* operation,const char* json) { return answer([&] { zp::require(session && operation,"Invalid playback handle");return session->owner.call(juce::String::fromUTF8(operation),zp::parse(json)); }); }
void zp_free(char* buffer) { std::free(buffer); }
char* zp_plugin_admit(zp_session* session,const char* lease,const char* owner,const char* device,
    uint64_t revision,zd_plugin_owned_processor processor,double rate,uint32_t quantum,uint32_t inputs,uint32_t outputs,uint32_t latency) {
    return answer([&] {
        if(!session || !lease || !owner || !device) {
            if(processor.context && processor.release)processor.release(processor.context);
            throw std::invalid_argument("Invalid plugin admission identity");
        }
        const auto token=session->owner.admitPlugin(lease,owner,device,revision,processor,{rate,quantum,inputs,outputs,latency});
        return zp::V(zp::decimalU64(token));
    });
}
char* zp_plugin_cancel(zp_session* session,const char* lease,const char* owner,uint64_t token) {
    return answer([&] { zp::require(session && lease && owner,"Invalid plugin cancellation identity");session->owner.cancelPlugin(lease,owner,token);return zp::V(); });
}
char* zp_apply_prepared(zp_session* session,const char* json,zd_plugin_prepared* processors,uint32_t count) {
    struct Cleanup {
        zd_plugin_prepared* values;uint32_t count;
        ~Cleanup() { if(values)for(uint32_t i=0;i<count;++i)if(values[i].processor.context && values[i].processor.release)values[i].processor.release(values[i].processor.context); }
    } cleanup {processors,count};
    return answer([&] {
        zp::require(session && (count==0 || processors),"Invalid prepared apply");
        return session->owner.applyPrepared(zp::parse(json),processors,count);
    });
}
int zp_stop_fence_for(zp_session* session,const char* lease,const char* owner,uint64_t token) { return session && session->owner.stopFenceFor(lease,owner,token); }
int zp_pending_call_begin(zp_session* session,const char* lease,const char* owner) { try { if(!session || !lease || !owner)return 0;session->owner.beginPendingCall(lease,owner);return 1; }catch(...) { return 0; } }
void zp_pending_call_end(zp_session* session) { try { if(session)session->owner.endPendingCall(); }catch(...) {} }
void zp_audition_fence(zp_session* session,uint64_t generation) { if(session)fence(session->owner.auditionGeneration,generation); }
void zp_waveform_fence(uint64_t generation) { zp::waveformFence(generation); }
char* zp_waveform(const char* path,uint32_t bins,uint64_t generation) { return answer([&] { zp::require(path!=nullptr,"Missing waveform path");return zp::waveform(juce::String::fromUTF8(path),bins,generation); }); }
void zp_waveform_range_fence(uint64_t generation) { zp::waveformRangeFence(generation); }
char* zp_waveform_range(const char* path,uint64_t startFrame,uint64_t frameCount,uint32_t columns,uint32_t framesPerBin,uint64_t generation) {
    return answer([&] { zp::require(path!=nullptr,"Missing waveform path");return zp::waveformRange(juce::String::fromUTF8(path),startFrame,frameCount,columns,framesPerBin,generation); });
}
char* zp_analyze_tempo(const char* path) { return answer([&] { zp::require(path!=nullptr,"Missing tempo path");return zp::analyzeTempo(juce::String::fromUTF8(path)); }); }
}
