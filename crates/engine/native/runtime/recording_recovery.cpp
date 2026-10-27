#include "engine_session.h"
#include "recording_journal.h"
#include <algorithm>

namespace zp {
V EngineSession::recordingRecoveryList() {
    auto entries=listRecordingJournals();auto* values=entries.getArray();
    values->removeIf([&](const V& entry) { return recording && recording->id==entry["recordingId"].toString(); });
    return entries;
}
V EngineSession::reclaimRecording(const V& query) {
    fields(query,{"leaseId","sessionId","recordingId"});const auto lease=text(query,"leaseId"),session=text(query,"sessionId"),id=text(query,"recordingId");
    require(leases.count(lease) && accepted && accepted->session==session && arrangement,"Recording recovery owner mismatch");
    require(!recording,"Stop recording before recovering a take");
    if(const auto found=closedRecordings.find(id);found!=closedRecordings.end())
        require(found->second.lease==lease || !leases.contains(found->second.lease),"Recording take belongs to another active lease");
    if(const auto found=closedRecordings.find(id);found!=closedRecordings.end() && found->second.reclaimed && found->second.lease==lease && found->second.session==session)return found->second.result;
    const auto journal=readRecordingJournal(id);const auto& saved=field(journal,"result");
    const double bpm=number(saved,"sourceBpm",1,999),secondsPerBar=number(saved,"secondsPerBar",1e-6,1e6);const auto& files=array(saved,"files");require(!files.isEmpty() && files.size()<=256,"Invalid recording recovery file count");
    const double destinationBar=accepted->secondsPerBar();
    Recording recovered;recovered.id=id;recovered.session=session;recovered.lease=lease;recovered.sourceBpm=bpm;recovered.reclaimed=true;
    bool alreadyPublished=true;for(const auto& file:files)alreadyPublished&=accepted->sources.count(text(file,"fileId"))!=0;
    if(alreadyPublished)recovered.publishedRevision=accepted->revision;
    recovered.journalTargets=field(journal,"targets").clone();recovered.result=saved.clone();put(recovered.result,"sessionId",session);
    juce::Array<V> clips;std::set<juce::String> fileIds;
    juce::AudioFormatManager formats;formats.registerBasicFormats();
    for(const auto& item:files) {
        fields(item,{"fileId","path"});const auto fileId=text(item,"fileId");require(fileIds.insert(fileId).second,"Duplicate recording recovery file");
        const auto file=juce::File(text(item,"path"));const auto directory=recordingJournal(id).getParentDirectory();
        require(juce::Uuid(fileId).toString()==fileId && file.getParentDirectory()==directory
            && !directory.isSymbolicLink() && !file.isSymbolicLink(),"Recording file escaped its journal directory");
        std::unique_ptr<juce::AudioFormatReader> reader(formats.createReaderFor(file));
        require(reader && reader->lengthInSamples>0 && reader->sampleRate>0,"Recovery file has no decodable audio: "+file.getFileName());
        const auto& savedClips=array(saved,"clips");bool placed=false;
        for(const auto& clip:savedClips)if(clip["fileId"].toString()==fileId) {
            number(clip,"startBar",1,1e12);const auto length=number(clip,"durationBars",1e-12,1e12),offset=number(clip,"sourceOffsetBars",0,1e12);text(clip,"clipId");text(clip,"trackId");
            const double available=reader->lengthInSamples/reader->sampleRate/secondsPerBar-offset;
            require(available>0,"Recording placement has no readable audio");
            auto bounded=clip.clone();put(bounded,"durationBars",std::min(length,available));clips.add(bounded);placed=true;
        }
        if(!placed) {
            const auto& targets=array(journal,"targets");const auto target=std::find_if(targets.begin(),targets.end(),[&](const V& value){return value["fileId"].toString()==fileId;});
            require(target!=targets.end(),"Recording recovery target is missing");
            auto clip=object();put(clip,"fileId",fileId);put(clip,"clipId",text(*target,"clipId"));put(clip,"trackId",text(*target,"trackId"));
            put(clip,"startBar",number(*target,"startBar",1,1e12));put(clip,"durationBars",reader->lengthInSamples/reader->sampleRate/secondsPerBar);put(clip,"sourceOffsetBars",0);clips.add(clip);
        }
    }
    for(auto& clip:clips) {
        if(!bool(saved["recovery"]))put(clip,"trackId","recovery:"+id+":"+text(clip,"trackId"));
        put(clip,"durationBars",double(clip["durationBars"])*secondsPerBar/destinationBar);
        put(clip,"sourceOffsetBars",double(clip["sourceOffsetBars"])*secondsPerBar/destinationBar);
    }
    put(recovered.result,"sourceBpm",accepted->bpm);put(recovered.result,"secondsPerBar",destinationBar);
    put(recovered.result,"recovery",true);put(recovered.result,"clips",clips);closedRecordings.insert_or_assign(id,std::move(recovered));
    return closedRecordings.at(id).result;
}
}
