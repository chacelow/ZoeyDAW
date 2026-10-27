#pragma once
#include "playback_model.h"

namespace zp {
juce::File recordingRoot();
juce::File recordingJournal(const juce::String& id);
void writeRecordingJournal(const V& result,const juce::String& state,const juce::String& error,const V& targets);
V readRecordingJournal(const juce::String& id);
V listRecordingJournals();
}
