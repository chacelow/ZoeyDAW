#include "source_registry.h"
#include "source_observations.h"
#include <iostream>
#include <limits>
#include <stdexcept>

namespace {
void expect(bool value, const char* message) { if (!value) throw std::runtime_error(message); }
template <typename Error, typename Action>
void (expectThrows)(Action action, const char* message) {
    try { action(); } catch (const Error&) { return; }
    throw std::runtime_error(message);
}
zp::Request requestWithClips() {
    zp::Request request{};
    request.session = "session";
    request.sources.emplace("source", zp::Source{"source", juce::File(), juce::String::repeatedString("a", 64), 96000, 48000, 2});
    zp::Track track{};
    zp::Clip clip{};
    clip.id = "one"; clip.kind = "audio"; clip.source = "source";
    track.clips.push_back(clip); clip.id = "two"; track.clips.push_back(clip);
    request.tracks.push_back(track);
    return request;
}
const zp::SourceMapping& previewMapping(const zp::SourceRegistry& registry) {
    for (const auto& mapping : registry.mappings()) if (mapping.preview) return mapping;
    throw std::runtime_error("No active preview mapping");
}
bool hasPreview(const zp::SourceRegistry& registry) {
    for (const auto& mapping : registry.mappings()) if (mapping.preview) return true;
    return false;
}
void arrangementTransitions() {
    auto request = requestWithClips();
    zp::SourceRegistry registry;
    registry = registry.prepare(request);
    const auto first = registry.mappings();
    expect(first.size() == 2 && first[0].clipHandle != first[1].clipHandle
           && first[0].sourceHandle == first[1].sourceHandle, "Shared source identity incorrect");
    std::swap(request.tracks[0].clips[0], request.tracks[0].clips[1]);
    registry = registry.prepare(request);
    expect(registry.mappings()[0].clipHandle == first[1].clipHandle, "Reorder changed clip handle");
    auto clip = request.tracks[0].clips[0];
    request.tracks[0].clips.clear(); registry = registry.prepare(request);
    expect(registry.mappings().empty(), "Removed clips remain active");
    clip.id = "three"; request.tracks[0].clips.push_back(clip); registry = registry.prepare(request);
    expect(registry.mappings()[0].clipHandle > first[1].clipHandle, "Removed handle reused");
    request.sources.at("source").sha = juce::String::repeatedString("b", 64);
    auto candidate = registry.prepare(request);
    expect(registry.mappings()[0].sourceGeneration == 1, "Preparation changed accepted registry");
    expect(candidate.mappings()[0].sourceGeneration == 2
           && candidate.mappings()[0].sourceHandle == first[0].sourceHandle, "Source replacement identity incorrect");
    registry = std::move(candidate);
    request.sources.at("source").file = juce::File("/tmp/relinked.wav"); registry = registry.prepare(request);
    expect(registry.mappings()[0].sourceGeneration == 2, "Relink changed content generation");
    request.sources.at("source").sha = request.sources.at("source").sha.toUpperCase();
    registry = registry.prepare(request);
    expect(registry.mappings()[0].sourceGeneration == 2, "SHA letter case changed identity");
    request.session = "new-session"; registry = registry.prepare(request);
    expect(registry.mappings()[0].clipHandle == 1 && registry.mappings()[0].sourceGeneration == 1,
           "Session did not reset handle scope");
}
void previewTransitions() {
    juce::TemporaryFile fixture(".wav"), otherFixture(".wav");
    const auto file = fixture.getFile(), otherFile = otherFixture.getFile();
    expect(file.replaceWithText("temporary source bytes") && otherFile.replaceWithText("temporary source bytes"), "Cannot create identity fixtures");
    auto request = requestWithClips();
    request.sources.at("source").file = file;
    zp::SourceRegistry registry;
    registry = registry.prepare(request);
    auto prepared = registry.preparePreview(10, file, 96000, 48000, 2);
    expect(!hasPreview(registry), "Preview preparation mutated accepted state");
    const auto first = previewMapping(prepared);
    expect(first.clipId == "preview/10" && first.sourceId.find("temporary-preview/") == 0,
           "Preview identity is not explicitly temporary");
    expect(first.clipHandle != registry.mappings()[0].clipHandle
           && first.sourceHandle != registry.mappings()[0].sourceHandle,
           "Unfingerprinted preview shared authored content identity by path");
    registry = std::move(prepared);
    request.tracks[0].clips.pop_back(); registry = registry.prepare(request);
    expect(previewMapping(registry).clipHandle == first.clipHandle, "Document edit dropped accepted preview");
    registry = registry.preparePreview(11, file, 96000, 48000, 2);
    const auto second = previewMapping(registry);
    expect(second.clipHandle > first.clipHandle && second.sourceHandle == first.sourceHandle
           && second.sourceGeneration == first.sourceGeneration, "Identical temporary evidence did not share source");
    registry.clearPreview(10);
    expect(hasPreview(registry), "Stale stop cleared current preview");
    registry.clearPreview(11);
    expect(!hasPreview(registry) && registry.mappings().size() == 1, "Stop did not clear only preview mapping");
    prepared = registry.resumePreview(11);
    expect(!hasPreview(registry) && previewMapping(prepared).clipHandle == second.clipHandle,
           "Resume did not transactionally restore recorded identity");
    registry = std::move(prepared);
    expectThrows<std::invalid_argument>([&] { registry.resumePreview(10); }, "Stale preview resumed");
    expectThrows<std::invalid_argument>([&] { registry.preparePreview(11, file, 96000, 48000, 2); }, "Audition generation reused");
    const auto oldTime = file.getLastModificationTime();
    expect(file.replaceWithText("a longer temporary source with new bytes"), "Cannot replace identity fixture");
    registry = registry.preparePreview(12, file, 96000, 48000, 2);
    expect(previewMapping(registry).sourceHandle == second.sourceHandle
           && previewMapping(registry).sourceGeneration == 2, "Changed file size failed to advance source generation");
    expect(file.setLastModificationTime(juce::Time(oldTime.toMilliseconds() + 10000)), "Cannot set identity fixture mtime");
    registry = registry.preparePreview(13, file, 96000, 48000, 2);
    expect(previewMapping(registry).sourceGeneration == 3, "Changed mtime failed to advance source generation");
    registry = registry.preparePreview(14, file, 88200, 44100, 1);
    expect(previewMapping(registry).sourceGeneration == 4 && previewMapping(registry).sourceRate == 44100,
           "Decoded metadata replacement failed to advance identity");
    registry = registry.preparePreview(15, otherFile, 88200, 44100, 1);
    expect(previewMapping(registry).sourceHandle != second.sourceHandle, "Different path shared an unproven source");
    registry = registry.preparePreview(16, file, 88200, 44100, 1);
    expect(previewMapping(registry).sourceHandle == second.sourceHandle
           && previewMapping(registry).sourceGeneration == 4, "Returning source lost retained identity");
    const auto accepted = previewMapping(registry);
    expectThrows<std::invalid_argument>([&] { registry.preparePreview(17, file.getSiblingFile(file.getFileName() + ".missing"), 1, 48000, 2); }, "Missing preview accepted");
    expect(previewMapping(registry).clipHandle == accepted.clipHandle, "Preparation failure lost accepted mapping");
    registry.clearPreview();
    expectThrows<std::invalid_argument>([&] { registry.preparePreview(17, file, 0, 48000, 2); }, "Empty decoded preview accepted");
    expectThrows<std::invalid_argument>([&] { registry.preparePreview(17, file, 1, std::numeric_limits<double>::infinity(), 2); }, "Nonfinite decoded preview rate accepted");
    expectThrows<std::invalid_argument>([&] { registry.preparePreview(17, file, 1, 48000, 0); }, "Invalid decoded preview channels accepted");
    juce::TemporaryFile emptyFixture(".wav");
    expect(emptyFixture.getFile().create().wasOk(), "Cannot create empty fixture");
    expectThrows<std::invalid_argument>([&] { registry.preparePreview(17, emptyFixture.getFile(), 1, 48000, 1); }, "Empty preview file accepted");
    expect(!hasPreview(registry), "Failed candidate revived stopped preview mapping");
    registry = registry.resumePreview(16);
    request.session = "new-session";
    registry = registry.prepare(request);
    const auto rebound = previewMapping(registry);
    expect(registry.sessionId() == "new-session" && rebound.clipId == accepted.clipId
           && rebound.sourceGeneration == 1 && rebound.sourceRate == accepted.sourceRate,
           "Live preview was not rebound into new session");
    expect(rebound.sourceHandle != registry.mappings()[0].sourceHandle
           && rebound.clipHandle != registry.mappings()[0].clipHandle, "Rebound preview aliases new arrangement");
    registry.clearPreview(); request.session = "third-session"; registry = registry.prepare(request);
    expect(!hasPreview(registry), "New session revived stopped preview");
    registry = registry.resumePreview(16);
    expect(previewMapping(registry).clipId == accepted.clipId, "Stopped preview lost resumable identity across session");
    const auto beforeCollision = previewMapping(registry);
    auto authored = request.sources.at("source");
    authored.id = juce::String(beforeCollision.sourceId);
    request.sources.emplace(authored.id, authored);
    registry = registry.prepare(request);
    const auto afterCollision = previewMapping(registry);
    expect(afterCollision.sourceId != beforeCollision.sourceId && afterCollision.sourceHandle == beforeCollision.sourceHandle
           && afterCollision.clipHandle == beforeCollision.clipHandle && afterCollision.sourceGeneration == beforeCollision.sourceGeneration,
           "Authored source collided with existing preview identity");
    registry.clearPreview();
    authored.id = juce::String(afterCollision.sourceId);
    request.sources.emplace(authored.id, authored);
    registry = registry.prepare(request).resumePreview(16);
    expect(previewMapping(registry).sourceId != afterCollision.sourceId, "Stopped preview retained colliding identity on resume");
}
void malformedSources() {
    auto request = requestWithClips();
    zp::SourceRegistry registry;
    registry = registry.prepare(request);
    auto missing = request; missing.sources.clear();
    expectThrows<std::invalid_argument>([&] { registry.prepare(missing); }, "Historical source satisfied missing request source");
    auto bad = request; bad.sources.at("source").id = "different";
    expectThrows<std::invalid_argument>([&] { registry.prepare(bad); }, "Mismatched source key accepted");
    bad = request; bad.sources.at("source").sha = juce::String::repeatedString("z", 64);
    expectThrows<std::invalid_argument>([&] { registry.prepare(bad); }, "Malformed SHA accepted");
    bad = request; bad.sources.at("source").rate = std::numeric_limits<double>::quiet_NaN();
    expectThrows<std::invalid_argument>([&] { registry.prepare(bad); }, "Nonfinite rate accepted");
    bad = request; bad.sources.at("source").frames = 0;
    expectThrows<std::invalid_argument>([&] { registry.prepare(bad); }, "Zero frames accepted");
    bad = request; bad.sources.at("source").channels = 65;
    expectThrows<std::invalid_argument>([&] { registry.prepare(bad); }, "Invalid channels accepted");
    bad = request; bad.tracks[0].clips[1].id = "one";
    expectThrows<std::invalid_argument>([&] { registry.prepare(bad); }, "Duplicate clip identity accepted");
    bad = request; bad.tracks[0].clips[0].id = "preview/1";
    expectThrows<std::invalid_argument>([&] { registry.prepare(bad); }, "Reserved preview clip identity accepted");
    bad = request; bad.session.clear();
    expectThrows<std::invalid_argument>([&] { registry.prepare(bad); }, "Empty session accepted");
    auto unassigned = request; unassigned.tracks[0].clips[0].source.clear();
    expect(registry.prepare(unassigned).mappings().size() == 1, "Unassigned audio clip invented a source");
    expect(registry.mappings().size() == 2 && registry.mappings()[0].sourceGeneration == 1,
           "Malformed preparation mutated accepted registry");
}
void exhaustion() {
    auto request = requestWithClips();
    zp::SourceRegistry registry({2, 2, 2});
    registry = registry.prepare(request);
    request.tracks[0].clips[0].id = "three";
    expectThrows<std::overflow_error>([&] { registry.prepare(request); }, "Clip handle exhaustion wrapped/reused");
    expect(registry.mappings()[0].clipHandle == 1, "Clip exhaustion changed accepted state");
    request = requestWithClips(); request.sources.at("source").sha = juce::String::repeatedString("b", 64);
    registry = registry.prepare(request);
    request.sources.at("source").sha = juce::String::repeatedString("c", 64);
    expectThrows<std::overflow_error>([&] { registry.prepare(request); }, "Source generation exhaustion wrapped");
    zp::SourceRegistry sourceLimited({10, 1, 2}); request = requestWithClips(); sourceLimited = sourceLimited.prepare(request);
    auto extra = request.sources.at("source"); extra.id = "other"; request.sources.emplace(extra.id, extra);
    expectThrows<std::overflow_error>([&] { sourceLimited.prepare(request); }, "Source handle exhaustion wrapped");
    juce::TemporaryFile fixture(".wav"), secondFixture(".wav");
    const auto file = fixture.getFile();
    expect(file.replaceWithText("source") && secondFixture.getFile().replaceWithText("other"), "Cannot create exhaustion fixtures");
    zp::SourceRegistry previews({2, 1, 2});
    previews = previews.preparePreview(1, file, 100, 48000, 1);
    previews = previews.preparePreview(2, file, 101, 48000, 1);
    expect(previewMapping(previews).clipHandle == 2 && previewMapping(previews).sourceGeneration == 2,
           "Final allowed handle/generation was not usable");
    expectThrows<std::overflow_error>([&] { previews.preparePreview(3, file, 102, 48000, 1); }, "Preview generation exhaustion wrapped");
    expectThrows<std::overflow_error>([&] { previews.preparePreview(3, secondFixture.getFile(), 100, 48000, 1); }, "Preview source handle exhaustion wrapped");
    previews.clearPreview();
    expectThrows<std::overflow_error>([&] { previews.preparePreview(3, file, 101, 48000, 1); }, "Stopped preview clip handle recycled");
    expect(!hasPreview(previews), "Exhaustion revived stopped preview");
    expect(previewMapping(previews.resumePreview(2)).clipHandle == 2, "Exhaustion destroyed accepted resumable identity");
}
void sourceBlockObservations() {
    auto authored=zp::SourceRegistry().prepare(requestWithClips());
    auto registry=std::make_shared<zp::SourceObservationRegistry>();
    registry->session="session";registry->graphGeneration=3;
    auto playhead=std::make_shared<tracktion::AudioClipPlayhead>();
    registry->bindings.push_back({authored.mappings()[0],playhead});
    zp::SourceObservationState state;state.current.store(registry);
    zp::realtime::wire::WireSource value{};
    const auto read=[&](std::uint64_t reference=1000,std::uint64_t sample=2000,bool playing=true) {
        expect(state.read("session",3,reference,sample,48000,playing,{&value,1})==1,"Source read lost its registered identity");
        return value.flags & zp::realtime::wire::SOURCE_FLAGS_VALID;
    };
    expect(!read(),"Unprocessed source exposed a position");
    playhead->setPosition(tracktion::TimePosition::fromSeconds(1),750,48000);
    expect(read() && value.sourceFrame==48000 && value.observedDeviceSample==1750 && value.positionAgeSamples==250,
           "Source position was paired with the Hub receive block instead of its own processing sample");
    expect(!read(749),"Future source block was attached to an older output clock");
    expect(!read(4000,5000),"Expired source block remained valid at a newer output clock");
    expect(!read(1000,100),"Source timestamp underflowed the device counter");
    expect(!read(1000,2000,false),"Stopped Arrangement retained active source position");
    registry=std::make_shared<zp::SourceObservationRegistry>(*registry);registry->bindings[0].mapping.preview=true;
    auto previewGraph=std::make_shared<zp::SourcePlayheadGraph>();previewGraph->previewClock=std::make_shared<zp::SourceBlockClock>();
    previewGraph->previewClock->publish({1000,2000,48000});registry->previewGraph=previewGraph;
    state.current.store(registry);
    expect(read(1000,2000,false),"Independent Preview followed Arrangement stop");
    expect(read(0,0,false) && value.observedDeviceSample==1750,"Preview required an Arrangement sample clock");
    playhead->setPosition(tracktion::TimePosition::fromSeconds(1),750,44100);
    expect(!read(),"Device format change relabelled a source sample");
    auto replacement=std::make_shared<zp::SourceObservationRegistry>(*registry);
    replacement->bindings[0].playhead=std::make_shared<tracktion::AudioClipPlayhead>();
    state.current.store(replacement);
    playhead->setPosition(tracktion::TimePosition::fromSeconds(2),1000,48000);
    expect(!read(),"Retired graph wrote the replacement graph's source observation");
    replacement->bindings[0].playhead->setPosition(tracktion::TimePosition::fromSeconds(3),1000,48000);
    expect(read() && value.sourceFrame==144000 && value.positionAgeSamples==0,"New source graph did not publish its own sample");
    replacement->bindings[0].playhead->setPosition({},1000,48000);
    expect(!read(),"Explicit source invalidation retained the last valid position");
}
}
int main() {
    try {
        arrangementTransitions(); previewTransitions(); malformedSources(); exhaustion(); sourceBlockObservations();
        std::cout << "Source identity, temporary preview lifecycle, validation and exhaustion passed\n";
        return 0;
    } catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}
