#pragma once
#include <stdint.h>
#include "../../plugin-abi/include/processor.h"
#include "runtime/meter_read_abi.h"
#include "analysis/waveform_cancellation.h"
#include "analysis/waveform_response.h"
#ifdef __cplusplus
extern "C" {
#endif
typedef struct zp_session zp_session;
/* Session calls, creation and destruction belong to the host's main thread. */
zp_session* zp_create(char** error);
void zp_destroy(zp_session* session);
/* All returned UTF-8 buffers are owned by this module; release with zp_free. */
char* zp_call(zp_session* session, const char* operation, const char* json);
void zp_free(char* buffer);
/* Main-thread admission consumes processor on success and failure. Tokens are session-local. */
char* zp_plugin_admit(zp_session*, const char* lease, const char* owner, const char* device,
                      uint64_t revision, zd_plugin_owned_processor, double sample_rate,
                      uint32_t quantum, uint32_t inputs, uint32_t outputs, uint32_t latency);
char* zp_plugin_cancel(zp_session*, const char* lease, const char* owner, uint64_t token);
/* Consumes every supplied processor, including rejected apply and invalid payloads. */
char* zp_apply_prepared(zp_session*, const char* json, zd_plugin_prepared*, uint32_t count);
char* zp_configure_prepared(zp_session*, const char* json, zd_plugin_prepared*, uint32_t count);
/* Acquisition is message-thread-only and binds one immutable graph identity. */
zp_meter_read_handle* zp_meter_acquire(zp_session*, const char* lease, const char* owner, uint32_t device_epoch, uint32_t generation, uint32_t registry);
zp_meter_read_handle* zp_input_meter_acquire(zp_session*,const char* lease,const char* owner,uint32_t device_epoch);
zp_meter_read_handle* zp_idle_meter_acquire(zp_session*,const char* lease,const char* owner,uint64_t owner_epoch);
/* These fences do not access mutable Edit state and can be called off the main thread. */
int zp_stop_fence_for(zp_session* session, const char* lease_id, const char* session_id, uint64_t token);
/* The host registers a pending apply on the main thread before its final cancellation check. */
int zp_pending_call_begin(zp_session* session, const char* lease_id, const char* session_id);
void zp_pending_call_end(zp_session* session);
void zp_audition_fence(zp_session* session, uint64_t generation);
char* zp_waveform(const char* path, uint32_t bins, const zp_waveform_cancellation*);
/* Success is 1; failure is 0 with an optional zp_free-owned error. Output belongs to the caller. */
int zp_waveform_range(const char* path, uint64_t start_frame, uint64_t frame_count, uint32_t columns, uint32_t frames_per_bin, const zp_waveform_cancellation*, void* context, zp_waveform_allocate allocate, char** error);
char* zp_analyze_tempo(const char* path);
#ifdef __cplusplus
}
#endif
