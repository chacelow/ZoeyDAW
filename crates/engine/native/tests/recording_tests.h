void testHostedRecording() {
    juce::TemporaryFile root;
    const auto previous=juce::SystemStats::getEnvironmentVariable("ZOEYDAW_RECORDING_PATH",{});
    struct Restore { juce::String value;juce::File path;~Restore(){ScopedAudioPreferences::set("ZOEYDAW_RECORDING_PATH",value);path.deleteRecursively();} } restore{previous,root.getFile()};
    ScopedAudioPreferences::set("ZOEYDAW_RECORDING_PATH",root.getFile().getFullPathName());
    EngineSession session;MixerTestAccess::initialiseHostedInput(session);
    auto request=fixture();auto project=request["state"]["project"];auto main=project["tracks"][0];auto target=copy(main);
    put(target,"id","record-track");put(target,"kind","audio");put(target,"input","external");put(target,"inputChannel","1");put(target,"output","main");put(target,"armed",true);put(target,"monitor","off");put(project,"tracks",juce::Array<V>{main,target});accepted(apply(session,request),0);
    auto command=parse(R"({"protocolVersion":2,"sessionId":"live-mixer-regression","sequence":1,"controlGeneration":"1","control":{"playing":true,"recording":true,"seekBar":1,"seekGeneration":1}})");
    accepted(session.call("control",envelope(command)),0);
    auto& transport=MixerTestAccess::edit(session)->getTransport();require(transport.isRecording(),"Native recording control did not start");
    juce::AudioBuffer<float> audio(2,256);juce::MidiBuffer midi;
    constexpr int frames=16384;
    for(int start=0;start<frames;start+=256) { audio.clear();midi.clear();for(int i=0;i<256;++i)audio.setSample(0,i,(start+i)%2?.125f:-.125f);MixerTestAccess::hosted(session).processBlock(audio,midi); }
    auto control=command["control"];put(control,"playing",false);put(control,"recording",false);put(command,"sequence",2);put(command,"controlGeneration","2");accepted(session.call("control",envelope(command)),0);
    auto query=object();put(query,"leaseId","mixer-test");put(query,"sessionId","live-mixer-regression");const auto results=session.call("recording_results",query);
    require(results["recordings"].getArray() && results["recordings"].getArray()->size()==1,"Closed recording result missing");
    const auto result=results["recordings"][0];require(result["files"].getArray()->size()==1 && result["clips"].getArray()->size()==1,"Recording result lost file or placement");
    const auto file=juce::File(result["files"][0]["path"].toString());std::unique_ptr<juce::AudioFormatReader> reader(MixerTestAccess::edit(session)->engine.getAudioFileFormatManager().readFormatManager.createReaderFor(file));
    require(reader && reader->lengthInSamples==frames && reader->numChannels==1 && reader->sampleRate==48000,"Closed recording file dimensions mismatch");
    juce::AudioBuffer<float> captured(1,frames);require(reader->read(&captured,0,frames,0,true,false),"Closed recording unreadable");
    for(int i=0;i<frames;++i)require(std::abs(captured.getSample(0,i)-(i%2?.125f:-.125f))<1e-5,"Recording PCM differed from hosted input");
    require(session.call("recording_results",query)["recordings"][0]["recordingId"]==result["recordingId"],"Reading recording results consumed uncommitted data");
    auto ack=query.clone();put(ack,"recordingId",result["recordingId"]);put(ack,"acceptedRevision",0);bool rejected=false;try { session.call("recording_ack",ack); }catch(const std::exception&) { rejected=true; }require(rejected,"Recording ACK accepted before document publication");
    require(MixerTestAccess::track(session,"record-track")->getClips().isEmpty(),"Unpublished recording leaked into native authored clips");
    const auto fileId=result["files"][0]["fileId"];auto source=object();put(source,"id",fileId);put(source,"uri",file.getFullPathName());put(source,"sha256",juce::SHA256(file).toHexString());put(source,"frames",frames);put(source,"sampleRate",48000);put(source,"channels",1);put(project,"sources",juce::Array<V>{source});
    auto clip=parse(R"({"id":"recorded","kind":"audio","startBar":1,"lengthBars":1,"sourceOffsetBars":0,"mute":false,"sourceId":null,"gainDb":0,"audioSettings":{"warp":false,"warpMode":"complex","sourceBpm":120,"transpose":0,"detune":0,"reverse":false,"loop":false,"loopStartBars":0,"loopLengthBars":1,"startMarkerBars":0,"endMarkerBars":1},"fadeInBars":0,"fadeOutBars":0,"fadeInOffsetBars":0,"fadeOutOffsetBars":0,"fadeInCurve":0,"fadeOutCurve":0,"fadeInCurvePosition":0.5,"fadeOutCurvePosition":0.5})");
    const auto placement=result["clips"][0];put(clip,"id",placement["clipId"]);put(clip,"sourceId",fileId);put(clip,"startBar",placement["startBar"]);put(clip,"lengthBars",placement["durationBars"]);put(clip,"sourceOffsetBars",placement["sourceOffsetBars"]);put(target,"clips",juce::Array<V>{clip});
    next(request,3,0,1,"commit");accepted(apply(session,request),1);
    put(target,"clips",juce::Array<V>{});put(project,"sources",juce::Array<V>{});next(request,4,1,2,"commit");accepted(apply(session,request),2);
    put(ack,"acceptedRevision",1);session.call("recording_ack",ack);session.call("recording_ack",ack);
    require(session.call("recording_results",query)["recordings"].getArray()->isEmpty() && file.existsAsFile(),"Recording acknowledgement did not retire metadata without deleting audio");
    std::cout<<"Hosted recording finalized "<<frames<<" exact PCM frames and retained unpublished result"<<std::endl;
}
