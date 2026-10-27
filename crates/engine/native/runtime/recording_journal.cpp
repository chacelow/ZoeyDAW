#include "recording_journal.h"

namespace zp {
juce::File recordingRoot() {
    const auto path=juce::SystemStats::getEnvironmentVariable("ZOEYDAW_RECORDING_PATH",{});
    return path.isEmpty()?juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory).getChildFile("Zoeydaw/recordings"):juce::File(path);
}
juce::File recordingJournal(const juce::String& id) {
    require(!id.isEmpty(),"Invalid recording recovery identity");
    require(juce::Uuid(id).toString()==id,"Invalid recording recovery identity");
    return recordingRoot().getChildFile(id).getChildFile("take.json");
}
void writeRecordingJournal(const V& result,const juce::String& state,const juce::String& error,const V& targets) {
    const auto file=recordingJournal(text(result,"recordingId"));
    require(file.getParentDirectory().createDirectory().wasOk(),"Cannot create recording recovery directory");
    auto value=object();put(value,"version",1);put(value,"state",state);put(value,"error",error);put(value,"result",result);put(value,"targets",targets);
    const auto encoded=juce::JSON::toString(value);require(encoded.getNumBytesAsUTF8()<=1024*1024,"Recording journal exceeds capacity");
    juce::TemporaryFile temporary(file);
    {
        auto stream=temporary.getFile().createOutputStream();require(stream && stream->openedOk(),"Cannot create recording journal");
        require(stream->writeText(encoded,false,false,nullptr),"Cannot write recording journal");
        stream->flush();require(stream->getStatus().wasOk(),"Cannot sync recording journal");
    }
    require(temporary.overwriteTargetFileWithTemporary(),"Cannot publish recording journal");
}
V readRecordingJournal(const juce::String& id) {
    const auto file=recordingJournal(id);require(file.existsAsFile() && file.getSize()<=1024*1024,"Recording journal is missing or oversized");
    const auto value=juce::JSON::parse(file);fields(value,{"version","state","error","result","targets"});
    require(integer(value,"version")==1 && text(field(value,"result"),"recordingId")==id,"Recording journal identity mismatch");
    const auto state=text(value,"state");require(state=="recording" || state=="complete" || state=="failed" || state=="published","Invalid recording journal state");return value;
}
V listRecordingJournals() {
    juce::Array<V> entries;
    for(const auto& directory:recordingRoot().findChildFiles(juce::File::findDirectories,false)) {
        const auto id=directory.getFileName();if(juce::Uuid(id).toString()!=id)continue;
        const auto file=directory.getChildFile("take.json");if(!file.existsAsFile())continue;
        try {
            const auto journal=readRecordingJournal(id);const auto& result=field(journal,"result");
            if(array(result,"files").isEmpty())continue;
            auto entry=object();put(entry,"recordingId",id);put(entry,"state",text(journal,"state"));put(entry,"error",field(journal,"error"));
            put(entry,"fileCount",array(result,"files").size());put(entry,"sourceBpm",field(result,"sourceBpm"));entries.add(entry);
        }catch(const std::exception& error) {
            auto entry=object();put(entry,"recordingId",id);put(entry,"state","unreadable");put(entry,"error",juce::String(error.what()));put(entry,"fileCount",0);put(entry,"sourceBpm",V());entries.add(entry);
        }
        require(entries.size()<=256,"Recording recovery list exceeds capacity");
    }
    return entries;
}
}
