void testHostedRecording() {
    juce::TemporaryFile root;
    const auto previous=juce::SystemStats::getEnvironmentVariable("ZOEYDAW_RECORDING_PATH",{});
    struct Restore { juce::String value;juce::File path;~Restore(){ScopedAudioPreferences::set("ZOEYDAW_RECORDING_PATH",value);path.deleteRecursively();} } restore{previous,root.getFile()};
    ScopedAudioPreferences::set("ZOEYDAW_RECORDING_PATH",root.getFile().getFullPathName());
    EngineSession session;MixerTestAccess::initialiseHostedInput(session);
    auto request=fixture();auto project=request["state"]["project"];auto main=project["tracks"][0];auto target=copy(main);
    put(target,"id","record-track");put(target,"kind","audio");put(target,"input","external");put(target,"inputChannel","1");put(target,"output","main");put(target,"armed",true);put(target,"monitor","off");put(project,"tracks",juce::Array<V>{main,target});accepted(apply(session,request),0);
    auto& routedTransport=MixerTestAccess::edit(session)->getTransport();
    routedTransport.freePlaybackContext();
    require(routedTransport.getCurrentPlaybackContext()==nullptr,"Recording setup did not release its previous input context");
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
    MixerTestAccess::retainFailedRecording(session,result,"mixer-test","failed-take");
    MixerTestAccess::retainFailedRecording(session,result,"other-lease","other-failed-take");
    require(session.call("recording_results",query)["recordings"][0]["recordingId"]==result["recordingId"],"Reading recording results consumed uncommitted data");
    auto ack=query.clone();put(ack,"recordingId",result["recordingId"]);put(ack,"acceptedRevision",0);bool rejected=false;try { session.call("recording_ack",ack); }catch(const std::exception&) { rejected=true; }require(rejected,"Recording ACK accepted before document publication");
    auto failedAck=ack.clone();put(failedAck,"recordingId","failed-take");
    rejected=false;try { session.call("recording_ack",failedAck); }catch(const std::exception&) { rejected=true; }
    require(rejected && MixerTestAccess::hasRecording(session,"failed-take"),"Failed take was acknowledged or lost");
    auto telemetryQuery=object();put(telemetryQuery,"leaseId","mixer-test");
    const auto warnings=session.call("telemetry",telemetryQuery)["issues"];
    int recordingErrors=0;for(const auto& warning:*warnings.getArray())if(warning["code"].toString()=="recording-failed") {
        ++recordingErrors;require(warning["message"].toString().contains("failed-take") && warning["message"].toString().contains("Injected recording writer failure"),"Recording warning lost take identity or error");
    }
    require(recordingErrors==1,"Recording errors were hidden or leaked across lease ownership");
    require(MixerTestAccess::track(session,"record-track")->getClips().isEmpty(),"Unpublished recording leaked into native authored clips");
    const auto fileId=result["files"][0]["fileId"];auto source=object();put(source,"id",fileId);put(source,"uri",file.getFullPathName());put(source,"sha256",juce::SHA256(file).toHexString());put(source,"frames",frames);put(source,"sampleRate",48000);put(source,"channels",1);put(project,"sources",juce::Array<V>{source});
    auto clip=parse(R"({"id":"recorded","kind":"audio","startBar":1,"lengthBars":1,"sourceOffsetBars":0,"mute":false,"sourceId":null,"gainDb":0,"audioSettings":{"warp":false,"warpMode":"soundtouch","sourceBpm":120,"transpose":0,"detune":0,"reverse":false,"loop":false,"loopStartBars":0,"loopLengthBars":1,"startMarkerBars":0,"endMarkerBars":1},"fadeInBars":0,"fadeOutBars":0,"fadeInOffsetBars":0,"fadeOutOffsetBars":0,"fadeInCurve":0,"fadeOutCurve":0,"fadeInCurvePosition":0.5,"fadeOutCurvePosition":0.5})");
    const auto placement=result["clips"][0];put(clip,"id",placement["clipId"]);put(clip,"sourceId",fileId);put(clip,"startBar",placement["startBar"]);put(clip,"lengthBars",placement["durationBars"]);put(clip,"sourceOffsetBars",placement["sourceOffsetBars"]);put(target,"clips",juce::Array<V>{clip});
    next(request,3,0,1,"commit");accepted(apply(session,request),1);
    put(target,"clips",juce::Array<V>{});put(project,"sources",juce::Array<V>{});next(request,4,1,2,"commit");accepted(apply(session,request),2);
    put(ack,"acceptedRevision",1);session.call("recording_ack",ack);session.call("recording_ack",ack);
    require(session.call("recording_results",query)["recordings"].getArray()->isEmpty() && file.existsAsFile(),"Recording acknowledgement did not retire metadata without deleting audio");
    require(MixerTestAccess::hasRecording(session,"failed-take") && file.existsAsFile(),"Successful ACK retired failed recovery data");
    std::cout<<"Hosted recording finalized "<<frames<<" exact PCM frames and retained unpublished result"<<std::endl;
}

void testStoppedProjectInputActivation() {
    EngineSession session;MixerTestAccess::initialiseHostedInput(session);
    auto request=fixture();auto project=request["state"]["project"];auto main=project["tracks"][0];auto input=copy(main);
    put(input,"id","idle-input");put(input,"kind","audio");put(input,"input","external");put(input,"inputChannel","1");put(input,"output","main");put(project,"tracks",juce::Array<V>{main,input});
    accepted(apply(session,request),0);
    auto& transport=MixerTestAccess::edit(session)->getTransport();
    require(!transport.isPlaying() && MixerTestAccess::audioManager(session).getCurrentAudioDevice()->isOpen(),"Stopped project closed its configured input");
    auto* context=transport.getCurrentPlaybackContext();require(context!=nullptr,"Stopped project did not allocate input context");
    bool bound=false;for(auto* instance:context->getAllInputs())if(!instance->owner.isMidi() && !instance->owner.isTrackDevice())
        if(instance->getTargets().contains(MixerTestAccess::track(session,"idle-input")->itemID))bound=true;
    require(bound,"Stopped project input channel was not assigned before transport playback");
    EngineSession deniedSession;MixerTestAccess::initialiseHostedInput(deniedSession);MixerTestAccess::audioManager(deniedSession).closeAudioDevice();
    MixerTestAccess::useUnavailableHostedInput(deniedSession);
    accepted(apply(deniedSession,request),0);
    auto query=object();put(query,"leaseId","mixer-test");const auto report=deniedSession.call("telemetry",query);
    require(report["device"]["state"].toString()=="error" && report["device"]["error"].toString()=="Unavailable audio input: Hosted Device::missing-test-input","Unavailable saved input was not reported while keeping project open; state="+report["device"]["state"].toString()+", error="+report["device"]["error"].toString());
}

void testRecordingInputSelection() {
    for(const auto channel:{V(),V("2")}) {
        EngineSession session;MixerTestAccess::initialiseHostedInput(session,2);MixerTestAccess::disableHostedSecondInput(session);
        auto request=fixture();auto project=request["state"]["project"];auto main=project["tracks"][0];auto target=copy(main);
        put(target,"id","record-input");put(target,"kind","audio");put(target,"input","external");put(target,"inputChannel",channel);put(target,"output","main");put(target,"armed",true);
        put(project,"tracks",juce::Array<V>{main,target});accepted(apply(session,request),0);
        auto& transport=MixerTestAccess::edit(session)->getTransport();transport.freePlaybackContext();
        auto command=parse(R"({"protocolVersion":2,"sessionId":"live-mixer-regression","sequence":1,"controlGeneration":"1","control":{"playing":true,"recording":true,"seekBar":1,"seekGeneration":1}})");
        bool rejected=false;
        try { session.call("control",envelope(command)); }
        catch(const std::exception& error) { rejected=juce::String(error.what()).contains("No armed audio track has an enabled input"); }
        require(rejected && !transport.isRecording(),channel.isVoid()?"Missing input selection silently recorded":"Disabled input channel silently recorded");
    }
    juce::TemporaryFile root;
    const auto previous=juce::SystemStats::getEnvironmentVariable("ZOEYDAW_RECORDING_PATH",{});
    struct Restore { juce::String value;juce::File path;~Restore(){ScopedAudioPreferences::set("ZOEYDAW_RECORDING_PATH",value);path.deleteRecursively();} } restore{previous,root.getFile()};
    ScopedAudioPreferences::set("ZOEYDAW_RECORDING_PATH",root.getFile().getFullPathName());
    EngineSession session;MixerTestAccess::initialiseHostedInput(session,2);MixerTestAccess::enableHostedStereoInput(session);
    auto request=fixture();auto project=request["state"]["project"];auto main=project["tracks"][0];auto target=copy(main);
    put(target,"id","record-stereo");put(target,"kind","audio");put(target,"input","external");put(target,"inputChannel","1-2");put(target,"output","main");put(target,"armed",true);
    put(project,"tracks",juce::Array<V>{main,target});accepted(apply(session,request),0);
    auto& transport=MixerTestAccess::edit(session)->getTransport();transport.freePlaybackContext();
    auto command=parse(R"({"protocolVersion":2,"sessionId":"live-mixer-regression","sequence":1,"controlGeneration":"1","control":{"playing":true,"recording":true,"seekBar":1,"seekGeneration":1}})");
    accepted(session.call("control",envelope(command)),0);require(transport.isRecording(),"Enabled stereo input lost its recording target on context recreation");
    juce::AudioBuffer<float> audio(2,256);juce::MidiBuffer midi;
    for(int block=0;block<64;++block) {
        audio.clear();midi.clear();for(int frame=0;frame<256;++frame) { audio.setSample(0,frame,.125f);audio.setSample(1,frame,-.25f); }
        MixerTestAccess::hosted(session).processBlock(audio,midi);
    }
    auto control=command["control"];put(control,"playing",false);put(control,"recording",false);put(command,"sequence",2);put(command,"controlGeneration","2");accepted(session.call("control",envelope(command)),0);
    auto query=object();put(query,"leaseId","mixer-test");put(query,"sessionId","live-mixer-regression");const auto results=session.call("recording_results",query)["recordings"];
    require(results.size()==1 && results[0]["files"].size()==1,"Stereo recording did not produce an audio file");
    std::unique_ptr<juce::AudioFormatReader> reader(MixerTestAccess::edit(session)->engine.getAudioFileFormatManager().readFormatManager.createReaderFor(juce::File(results[0]["files"][0]["path"].toString())));
    require(reader && reader->numChannels==2 && reader->lengthInSamples==16384,"Enabled stereo input did not record two complete channels");
    juce::AudioBuffer<float> captured(2,16384);require(reader->read(&captured,0,16384,0,true,true),"Stereo recording file unreadable");
    for(int frame=0;frame<16384;++frame)require(std::abs(captured.getSample(0,frame)-.125f)<1e-5 && std::abs(captured.getSample(1,frame)+.25f)<1e-5,"Stereo recording diverged from the selected input channels");
}

void testMultiTrackRecordingAndMonitor() {
    juce::TemporaryFile root;
    const auto previous=juce::SystemStats::getEnvironmentVariable("ZOEYDAW_RECORDING_PATH",{});
    struct Restore { juce::String value;juce::File path;~Restore(){ScopedAudioPreferences::set("ZOEYDAW_RECORDING_PATH",value);path.deleteRecursively();} } restore{previous,root.getFile()};
    ScopedAudioPreferences::set("ZOEYDAW_RECORDING_PATH",root.getFile().getFullPathName());
    juce::TemporaryFile source(".wav");juce::WavAudioFormat wav;
    auto stream=source.getFile().createOutputStream();require(stream!=nullptr,"Cannot create monitor source");
    std::unique_ptr<juce::AudioFormatWriter> writer(wav.createWriterFor(stream.release(),48000,1,24,{},0));require(writer!=nullptr,"Cannot write monitor source");
    juce::AudioBuffer<float> tone(1,96000);tone.clear();for(int i=0;i<tone.getNumSamples();++i)tone.setSample(0,i,.75f);
    require(writer->writeFromAudioSampleBuffer(tone,0,tone.getNumSamples()),"Cannot populate monitor source");writer.reset();

    EngineSession session;MixerTestAccess::initialiseHostedInput(session,2);
    auto request=fixture();auto project=request["state"]["project"];auto main=project["tracks"][0];
    auto clip=parse(R"({"id":"monitor-clip","kind":"audio","startBar":1,"lengthBars":1,"sourceOffsetBars":0,"mute":false,"sourceId":"monitor-source","gainDb":0,"audioSettings":{"warp":false,"warpMode":"soundtouch","sourceBpm":120,"transpose":0,"detune":0,"reverse":false,"loop":false,"loopStartBars":0,"loopLengthBars":1,"startMarkerBars":0,"endMarkerBars":1},"fadeInBars":0,"fadeOutBars":0,"fadeInOffsetBars":0,"fadeOutOffsetBars":0,"fadeInCurve":0,"fadeOutCurve":0,"fadeInCurvePosition":0.5,"fadeOutCurvePosition":0.5})");
    auto sourceInfo=object();put(sourceInfo,"id","monitor-source");put(sourceInfo,"uri",source.getFile().getFullPathName());put(sourceInfo,"sha256",juce::SHA256(source.getFile()).toHexString());put(sourceInfo,"frames",96000);put(sourceInfo,"sampleRate",48000);put(sourceInfo,"channels",1);put(project,"sources",juce::Array<V>{sourceInfo});
    auto automatic=copy(main);put(automatic,"id","record-auto");put(automatic,"kind","audio");put(automatic,"input","external");put(automatic,"inputChannel","1");put(automatic,"output","main");put(automatic,"armed",true);put(automatic,"monitor","auto");put(automatic,"clips",juce::Array<V>{clip});
    auto off=copy(automatic);put(off,"id","record-off");put(off,"monitor","off");put(off,"clips",juce::Array<V>{});
    auto in=copy(automatic);put(in,"id","record-in");put(in,"inputChannel","2");put(in,"monitor","in");auto inClip=copy(clip);put(inClip,"id","in-existing");put(in,"clips",juce::Array<V>{inClip});put(in,"armed",false);
    put(project,"tracks",juce::Array<V>{main,automatic,off,in});accepted(apply(session,request),0);
    auto* edit=MixerTestAccess::edit(session);require(MixerTestAccess::audioClip(session,"in-existing")->isMuted(),"In did not suppress an existing clip on an unarmed track");
    auto query=object();put(query,"leaseId","mixer-test");const auto blank=session.call("telemetry",query);
    require(blank["recordingPreview"].isVoid(),"Idle session reported a recording preview");
    auto meterQuery=object();put(meterQuery,"leaseId","mixer-test");put(meterQuery,"sessionId","live-mixer-regression");
    const auto meterRegistry=session.call("meter_registry",meterQuery);
    require(meterRegistry["input"]["entries"].size()==2,"Hosted input registry lost physical channels");
    const auto inputEpoch=static_cast<std::uint32_t>(static_cast<juce::int64>(meterRegistry["input"]["deviceEpoch"]));
    auto inputCollector=session.acquireInputMeter("mixer-test","live-mixer-regression",inputEpoch);
    require(inputCollector!=nullptr,"Physical input meter admission failed");
    zp_meter_read_handle inputHandle(inputCollector);
    const std::uint32_t inputSlots[]={0,1};zp_meter_publication inputPeaks[2]{};
    juce::AudioBuffer<float> idleAudio(2,256);juce::MidiBuffer idleMidi;
    for(int i=0;i<256;++i) {idleAudio.setSample(0,i,.125f);idleAudio.setSample(1,i,.25f);}
    MixerTestAccess::feedHostedInputMeter(session,idleAudio);
    MixerTestAccess::hosted(session).processBlock(idleAudio,idleMidi);
    require(zp_meter_read(&inputHandle,inputSlots,2,inputPeaks,2)==2 && inputPeaks[0].current.peak>.03f && inputPeaks[1].current.peak>.1f,
            "Off mode lost physical input ghost meter with unarmed In audible");
    std::cout<<"Hosted original input peaks: "<<inputPeaks[0].current.peak<<", "<<inputPeaks[1].current.peak<<std::endl;
    put(in,"armed",true);next(request,1,0,1,"commit");accepted(apply(session,request),1);
    auto command=parse(R"({"protocolVersion":2,"sessionId":"live-mixer-regression","sequence":2,"controlGeneration":"2","control":{"playing":true,"recording":true,"seekBar":1,"seekGeneration":1}})");
    accepted(session.call("control",envelope(command)),1);require(edit->getTransport().isRecording(),"Header recording failed to start all armed inputs");
    require(!edit->engine.getWaveInputRecordingThread().hasFailed(),"Recording writer failed before hosted callback; blockSize="+juce::String(edit->engine.getDeviceManager().getBlockSize())+" overruns="+juce::String(edit->engine.getWaveInputRecordingThread().getOverrunCount()));
    juce::AudioBuffer<float> audio(2,256);juce::MidiBuffer midi;constexpr int frames=16384;
    V halfway;
    for(int start=0;start<frames;start+=256) {
        midi.clear();for(int i=0;i<256;++i) {audio.setSample(0,i,(start+i)%2?.125f:-.125f);audio.setSample(1,i,(start+i)%2?.25f:-.25f);}
        MixerTestAccess::feedHostedInputMeter(session,audio,static_cast<std::uint64_t>(start+256));
        MixerTestAccess::hosted(session).processBlock(audio,midi);
        require(!edit->engine.getWaveInputRecordingThread().hasFailed(),"Recording writer failed on hosted frame "+juce::String(start)+" blockSize="+juce::String(edit->engine.getDeviceManager().getBlockSize())+" overruns="+juce::String(edit->engine.getWaveInputRecordingThread().getOverrunCount()));
        juce::Thread::sleep(5);
        if(start+256==frames/2) {
            for(int attempt=0;attempt<60;++attempt) {
                halfway=session.call("telemetry",query)["recordingPreview"];
                if(halfway["tracks"].size()==3)break;
                juce::Thread::sleep(10);
            }
            require(halfway["tracks"].size()==3,"Native writer did not publish three in-progress thumbnails");
        }
    }
    require(audio.getMagnitude(0,0,256)>.05f && audio.getMagnitude(0,0,256)<.6f && audio.getMagnitude(1,0,256)>.05f && audio.getMagnitude(1,0,256)<.6f,
            "Recording failed to monitor actual Auto/In inputs or played authored clips over them");
    V live;for(int attempt=0;attempt<60;++attempt) {
        live=session.call("telemetry",query);if(live["recordingPreview"]["tracks"].size()==3)break;
        juce::Thread::sleep(10);
    }
    auto preview=live["recordingPreview"];require(preview["tracks"].size()==3,"Real recording thumbnail failed to expose all armed tracks");
    for(const auto& mid:*halfway["tracks"].getArray()) {
        const auto match=std::find_if(preview["tracks"].getArray()->begin(),preview["tracks"].getArray()->end(),[&](const V& final){return final["trackId"]==mid["trackId"] && final["clipId"]==mid["clipId"];});
        require(match!=preview["tracks"].getArray()->end() && (double)mid["durationBars"]>0 && (double)(*match)["durationBars"]>(double)mid["durationBars"],
                "Recording preview did not grow with real writer frames or changed its clip identity");
    }
    require(zp_meter_read(&inputHandle,inputSlots,2,inputPeaks,2)==2 && inputPeaks[0].current.peak==.125f
            && inputPeaks[1].current.peak==.25f && inputPeaks[0].current.end_sample>=frames
            && inputPeaks[1].current.end_sample>=frames,"Physical input peaks did not preserve both channels");
    for(const auto& track:*preview["tracks"].getArray()) {
        require((double)track["durationBars"]>0 && track["channels"].size()==1,"Active recorded clip geometry or channel count missing");
        const auto channels=track["channels"][0];require(channels["min"].size()>0 && channels["min"].size()<=512 && channels["min"].size()==channels["max"].size(),"Recording thumbnail bins are missing or unbounded");
        bool positive=false,negative=false;for(const auto& value:*channels["max"].getArray())positive|=(double)value>.05;for(const auto& value:*channels["min"].getArray())negative|=(double)value<-.05;
        require(positive && negative,"Recording thumbnail did not contain signed source PCM extrema");
    }
    auto control=command["control"];put(control,"recording",false);put(control,"playing",false);put(command,"sequence",3);put(command,"controlGeneration","3");accepted(session.call("control",envelope(command)),1);
    auto resultQuery=object();put(resultQuery,"leaseId","mixer-test");put(resultQuery,"sessionId","live-mixer-regression");const auto result=session.call("recording_results",resultQuery)["recordings"][0];
    require(result["files"].size()==3 && result["clips"].size()==3,"One Header record gesture did not finish three armed track takes");
    const auto retained=session.call("telemetry",query)["recordingPreview"];require(retained["tracks"].size()==3,"Unpublished recording waveform disappeared at stop");
    for(const auto& placement:*result["clips"].getArray()) {
        const auto id=placement["trackId"].toString();const auto expected=id=="record-in"?.25f:.125f;
        require(id=="record-auto" || id=="record-off" || id=="record-in","Recording routed to unexpected track");
        const auto path=std::find_if(result["files"].getArray()->begin(),result["files"].getArray()->end(),[&](const V& file){return file["fileId"]==placement["fileId"];});
        require(path!=result["files"].getArray()->end(),"Recorded placement lost file identity");
        std::unique_ptr<juce::AudioFormatReader> reader(edit->engine.getAudioFileFormatManager().readFormatManager.createReaderFor(juce::File((*path)["path"].toString())));
        require(reader && reader->lengthInSamples==frames && reader->numChannels==1,"One armed track missed simultaneous PCM capture");
        juce::AudioBuffer<float> captured(1,frames);require(reader->read(&captured,0,frames,0,true,false),"Multi-track take unreadable");
        for(int frame=0;frame<frames;++frame)require(std::abs(captured.getSample(0,frame)-(frame%2?expected:-expected))<1e-5,"Multi-track recording PCM was mixed, muted by Off, or routed to wrong input");
        bool sameId=false;for(const auto& track:*retained["tracks"].getArray())if(track["clipId"]==placement["clipId"] && track["trackId"]==placement["trackId"])sameId=true;
        require(sameId,"Recording preview clip identity changed at final publication");
    }
    put(in,"monitor","off");next(request,4,1,2,"commit");accepted(apply(session,request),2);
    require(!MixerTestAccess::audioClip(session,"in-existing")->isMuted(),"Leaving In failed to restore authored clip audio");
}

void testRecordingTransportTransitions() {
    juce::TemporaryFile root;
    const auto previous=juce::SystemStats::getEnvironmentVariable("ZOEYDAW_RECORDING_PATH",{});
    struct Restore { juce::String value;juce::File path;~Restore(){ScopedAudioPreferences::set("ZOEYDAW_RECORDING_PATH",value);path.deleteRecursively();} } restore{previous,root.getFile()};
    ScopedAudioPreferences::set("ZOEYDAW_RECORDING_PATH",root.getFile().getFullPathName());
    EngineSession session;MixerTestAccess::initialiseHostedInput(session);
    auto request=fixture();auto project=request["state"]["project"];auto main=project["tracks"][0];
    auto target=copy(main);put(target,"id","transition-track");put(target,"kind","audio");put(target,"input","external");put(target,"inputChannel","1");put(target,"output","main");put(target,"armed",true);put(target,"monitor","auto");put(project,"tracks",juce::Array<V>{main,target});
    auto opening=request["state"]["control"];put(opening,"seekBar",1);accepted(apply(session,request),0);
    auto* edit=MixerTestAccess::edit(session);auto command=parse(R"({"protocolVersion":2,"sessionId":"live-mixer-regression","sequence":1,"controlGeneration":"1","control":{"playing":true,"recording":true,"seekBar":3,"seekGeneration":1}})");
    auto query=object();put(query,"leaseId","mixer-test");put(query,"sessionId","live-mixer-regression");
    auto telemetryQuery=object();put(telemetryQuery,"leaseId","mixer-test");
    juce::AudioBuffer<float> audio(2,256);juce::MidiBuffer midi;
    const auto render=[&](int frames,float level) {
        for(int frame=0;frame<frames;frame+=256) {
            midi.clear();audio.clear();for(int i=0;i<256;++i)audio.setSample(0,i,(frame+i)%2?level:-level);
            MixerTestAccess::hosted(session).processBlock(audio,midi);
            require(!edit->engine.getWaveInputRecordingThread().hasFailed(),"Transport transition overloaded the native recording writer");
            juce::Thread::sleep(5);
        }
    };
    const auto stop=[&](int sequence) {
        auto control=command["control"];put(control,"recording",false);put(control,"playing",false);put(command,"sequence",sequence);put(command,"controlGeneration",juce::String(sequence));
        accepted(session.call("control",envelope(command)),0);
    };
    const auto verify=[&](int expectedCount,const juce::String& recordingId,int frames,float level) {
        const auto results=session.call("recording_results",query)["recordings"];
        require(results.size()==expectedCount,"Transport transition lost a recording take");
        const auto found=std::find_if(results.getArray()->begin(),results.getArray()->end(),[&](const V& take){return take["recordingId"].toString()==recordingId;});
        require(found!=results.getArray()->end(),"Transition take ID changed after finalization");
        const auto last=*found;require(last["clips"].size()==1 && last["files"].size()==1,"Transition take lost its placement or writer");
        std::unique_ptr<juce::AudioFormatReader> reader(edit->engine.getAudioFileFormatManager().readFormatManager.createReaderFor(juce::File(last["files"][0]["path"].toString())));
        require(reader && reader->lengthInSamples==frames,"Seek transition wrote a timeline-sized silence prefix or missed PCM");
        juce::AudioBuffer<float> captured(1,frames);require(reader->read(&captured,0,frames,0,true,false),"Transition take unreadable");
        for(int i=0;i<frames;++i)require(std::abs(captured.getSample(0,i)-(i%2?level:-level))<1e-5,"Transition take "+juce::String(expectedCount)+" PCM frame "+juce::String(i)+" actual "+juce::String(captured.getSample(0,i))+" expected "+juce::String(i%2?level:-level));
    };
    accepted(session.call("control",envelope(command)),0);require(edit->getTransport().isRecording(),"Forward seek failed to start recording");
    const auto forwardId=session.call("telemetry",telemetryQuery)["recordingPreview"]["recordingId"].toString();require(forwardId.isNotEmpty(),"Forward recording has no take ID");
    render(8192,.125f);stop(2);verify(1,forwardId,8192,.125f);
    auto control=command["control"];put(control,"playing",true);put(control,"recording",false);put(control,"seekBar",4);put(control,"seekGeneration",2);put(command,"sequence",3);put(command,"controlGeneration","3");accepted(session.call("control",envelope(command)),0);
    render(512,.25f);require(edit->getTransport().isPlaying() && !edit->getTransport().isRecording(),"Punch-in setup failed to play");
    put(control,"recording",true);put(command,"sequence",4);put(command,"controlGeneration","4");accepted(session.call("control",envelope(command)),0);
    require(edit->getTransport().isRecording() && edit->getTransport().isPlaying(),"Punch-in restarted or stopped playback");
    const auto punchId=session.call("telemetry",telemetryQuery)["recordingPreview"]["recordingId"].toString();require(punchId.isNotEmpty() && punchId!=forwardId,"Punch-in reused the previous take ID");
    render(8192,.375f);stop(5);verify(2,punchId,8192,.375f);
}
