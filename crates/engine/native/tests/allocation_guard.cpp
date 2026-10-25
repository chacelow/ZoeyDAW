#include <cstdlib>
#include <new>
#include <cstddef>

namespace {
thread_local bool guarded = false;
thread_local std::size_t allocations = 0;
thread_local bool failing = false, injected = false;
thread_local std::size_t remaining = 0;
void* allocate(std::size_t size) {
    if (guarded) ++allocations;
    if (failing && remaining-- == 0) { failing = false; injected = true; throw std::bad_alloc(); }
    if (auto* result = std::malloc(size == 0 ? 1 : size)) return result;
    throw std::bad_alloc();
}
}
void beginAllocationGuard() noexcept { allocations = 0; guarded = true; }
std::size_t endAllocationGuard() noexcept { guarded = false; return allocations; }
void beginAllocationFailure(std::size_t successfulAllocations) noexcept { remaining = successfulAllocations; injected = false; failing = true; }
bool endAllocationFailure() noexcept { failing = false; return injected; }
void* operator new(std::size_t size) { return allocate(size); }
void* operator new[](std::size_t size) { return allocate(size); }
void operator delete(void* pointer) noexcept { std::free(pointer); }
void operator delete[](void* pointer) noexcept { std::free(pointer); }
void operator delete(void* pointer, std::size_t) noexcept { std::free(pointer); }
void operator delete[](void* pointer, std::size_t) noexcept { std::free(pointer); }
