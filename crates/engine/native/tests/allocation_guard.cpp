#include <cstdlib>
#include <new>
#include <cstddef>

namespace {
thread_local bool guarded = false;
thread_local std::size_t allocations = 0;
void* allocate(std::size_t size) {
    if (guarded) ++allocations;
    if (auto* result = std::malloc(size == 0 ? 1 : size)) return result;
    throw std::bad_alloc();
}
}
void beginAllocationGuard() noexcept { allocations = 0; guarded = true; }
std::size_t endAllocationGuard() noexcept { guarded = false; return allocations; }
void* operator new(std::size_t size) { return allocate(size); }
void* operator new[](std::size_t size) { return allocate(size); }
void operator delete(void* pointer) noexcept { std::free(pointer); }
void operator delete[](void* pointer) noexcept { std::free(pointer); }
void operator delete(void* pointer, std::size_t) noexcept { std::free(pointer); }
void operator delete[](void* pointer, std::size_t) noexcept { std::free(pointer); }
