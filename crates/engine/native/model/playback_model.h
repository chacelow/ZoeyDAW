#pragma once
#include "device_model.h"
#include <juce_core/juce_core.h>
#include <cmath>
#include <map>
#include <optional>
#include <set>
#include <stdexcept>
#include <vector>
namespace zp {
using V = juce::var;
V object();
void put(V&, const char*, const V&);
void require(bool, const juce::String&);
V parse(const char*);
void fields(const V&, std::initializer_list<const char*> required, std::initializer_list<const char*> optional = {});
const V& field(const V&, const char*);
juce::String text(const V&, const char*);
double number(const V&, const char*, double min, double max);
uint64_t integer(const V&, const char*);
uint64_t decimalU64(const V&, const char*);
juce::String decimalU64(uint64_t);
bool boolean(const V&, const char*);
const juce::Array<V>& array(const V&, const char*);
juce::File localFile(const juce::String&);
struct Settings {
    bool warp, reverse, loop;
    juce::String mode;
    double sourceBpm, transpose, detune, loopStart, loopLength, markerStart, markerEnd;
};
struct Clip {
    juce::String id, kind, source, scene;
    double start, length, offset, gain = 0;
    bool mute;
    Settings settings {};
    double fadeIn = 0, fadeOut = 0, fadeInOffset = 0, fadeOutOffset = 0;
    double fadeInCurve = 0, fadeOutCurve = 0, fadeInPosition = .5, fadeOutPosition = .5;
    V data;
};
struct Source { juce::String id; juce::File file; juce::String sha; int64_t frames; double rate; int channels; };
struct Track {
    juce::String id, kind, output, input, inputChannel, outputChannel, monitor, cueOutput;
    double volume, pan, cueVolume;
    bool mute, solo, armed, returnPost;
    bool effectiveSolo = false;
    std::vector<juce::String> children;
    std::map<juce::String, double> sends;
    std::vector<Clip> clips;
    std::vector<Device> devices;
    V automation;
};
struct Control {
    uint64_t seekGeneration = 0;
    double seekBar = 1;
    bool playing = false, recording = false, metronome = false;
};
struct LaunchCommand {
    enum class Kind { clip, scene, stopTrack, stopAll, arrangement } kind;
    juce::String track, scene;
    bool quantize = true;
};
struct ControlRequest : Control {
    juce::String session;
    uint64_t sequence = 0, controlGeneration = 0;
    std::optional<LaunchCommand> launch;
};
struct NoteRequest {
    juce::String session, trackId, noteId;
    uint64_t sequence = 0;
    std::optional<uint64_t> requestedSample;
    int pitch = 0, velocity = 0;
    bool on = false;
};
struct TempoSection {
    double bar=1,bpm=120;
    bool operator==(const TempoSection&) const = default;
};
struct Request : ControlRequest {
    juce::String stage, editId;
    uint64_t baseRevision = 0, revision = 0;
    double bpm, quartersPerBar, loopStart, loopEnd;
    int numerator, denominator;
    bool loop;
    std::map<juce::String, Source> sources;
    std::vector<Track> tracks;
    std::vector<juce::String> scenes;
    juce::String launchQuantization = "bar";
    std::vector<TempoSection> tempo;
    bool sameTempo(const Request& other) const { return bpm==other.bpm && tempo==other.tempo; }
    double tempoAt(double bar) const {
        double value=tempo.empty()?bpm:tempo.front().bpm;
        for(const auto& section:tempo) { if(section.bar>bar)break;value=section.bpm; }return value;
    }
    double secondsPerBar() const { return quartersPerBar * 60.0 / bpm; }
    double barTime(double bar) const {
        double position=1,seconds=0,value=tempo.empty()?bpm:tempo.front().bpm;
        for(const auto& section:tempo) { if(section.bar>=bar)break;seconds+=(section.bar-position)*quartersPerBar*60/value;position=section.bar;value=section.bpm; }
        return seconds+(bar-position)*quartersPerBar*60/value;
    }
    double timeBar(double seconds) const {
        double position=1,elapsed=0,value=tempo.empty()?bpm:tempo.front().bpm;
        for(const auto& section:tempo) { const auto next=elapsed+(section.bar-position)*quartersPerBar*60/value;if(next>seconds)break;elapsed=next;position=section.bar;value=section.bpm; }
        return position+(seconds-elapsed)*value/(quartersPerBar*60);
    }
    double barDuration(double start,double length) const { return barTime(start+length)-barTime(start); }
};
Request decode(const V&);
ControlRequest decodeControl(const V&);
NoteRequest decodeNote(const V&);
bool sameGraph(const Request&, const Request&, bool allowClipPlacement = false);
V result(const Request&, bool accepted, const char* code = "rejected");
V result(const ControlRequest&, uint64_t revision, bool accepted, const char* code = "rejected");
V noteResult(const NoteRequest&, bool accepted, const char* code = "rejected");
V issue(const char* code, const juce::String& message, const juce::String& source = {}, const juce::String& track = {}, const juce::String& clip = {});
}
