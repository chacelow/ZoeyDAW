void testHostedTempoMap() {
    EngineSession session;MixerTestAccess::initialiseHostedInput(session);
    auto request=fixture();auto project=request["state"]["project"];
    put(project,"tempo",parse(R"([{"bar":1,"bpm":120},{"bar":2,"bpm":240},{"bar":3,"bpm":90}])"));
    auto loop=project["loop"];put(loop,"enabled",true);put(loop,"startBar",2);put(loop,"endBar",3);
    accepted(apply(session,request),0);auto* edit=MixerTestAccess::edit(session);auto& transport=edit->getTransport();
    const auto& mapping=MixerTestAccess::request(session);
    for(const auto bar:{1.0,1.5,2.0,2.75,3.0,5.0}) {
        const auto time=edit->tempoSequence.toTime(te::BeatPosition::fromBeats((bar-1)*4)).inSeconds();
        require(std::abs(time-mapping.barTime(bar))<1e-9,"Native tempo sequence differs from authored mapping");
    }
    require(std::abs(transport.getLoopRange().getStart().inSeconds()-2)<1e-9 && std::abs(transport.getLoopRange().getEnd().inSeconds()-3)<1e-9,"Tempo loop endpoints use fixed BPM");
    auto control=parse(R"({"protocolVersion":2,"sessionId":"live-mixer-regression","sequence":1,"controlGeneration":"1","control":{"playing":true,"recording":false,"seekBar":2.9,"seekGeneration":1}})");
    accepted(session.call("control",envelope(control)),0);edit->dispatchPendingUpdatesSynchronously();
    juce::AudioBuffer<float> audio(2,256);juce::MidiBuffer midi;
    for(int block=0;block<96;++block) { audio.clear();midi.clear();MixerTestAccess::hosted(session).processBlock(audio,midi); }
    const auto* context=transport.getCurrentPlaybackContext();require(context!=nullptr,"Tempo map lost playback context");
    const double seconds=context->getPosition().inSeconds();require(seconds>=2 && seconds<3,"Tempo loop did not wrap inside mapped endpoints");
    auto command=control["control"];put(command,"playing",false);put(command,"seekBar",4);put(command,"seekGeneration",2);put(control,"sequence",2);put(control,"controlGeneration","2");
    accepted(session.call("control",envelope(control)),0);
    require(std::abs(transport.getPosition().inSeconds()-mapping.barTime(4))<1e-9,"Stopped tempo seek used fixed BPM: actual="+juce::String(transport.getPosition().inSeconds(),10)+" expected="+juce::String(mapping.barTime(4),10));
    auto changed=copy(request);auto changedProject=changed["state"]["project"];
    put(changedProject,"tempo",parse(R"([{"bar":1,"bpm":120},{"bar":2,"bpm":180},{"bar":3,"bpm":90}])"));
    next(changed,3,0,1,"commit");accepted(apply(session,changed),1);
    require(MixerTestAccess::edit(session)==edit && std::abs(transport.getPosition().inSeconds()-MixerTestAccess::request(session).barTime(4))<1e-9,"Retained tempo edit lost stopped musical position");
    std::cout<<"Hosted tempo map sequence, loop wrap, seek and retained stopped edit passed\n";
}

void testTempoMapRecording() {
    juce::TemporaryFile root;
    const auto previous=juce::SystemStats::getEnvironmentVariable("ZOEYDAW_RECORDING_PATH",{});
    struct Restore { juce::String value;juce::File path;~Restore(){ScopedAudioPreferences::set("ZOEYDAW_RECORDING_PATH",value);path.deleteRecursively();} } restore{previous,root.getFile()};
    ScopedAudioPreferences::set("ZOEYDAW_RECORDING_PATH",root.getFile().getFullPathName());
    EngineSession session;MixerTestAccess::initialiseHostedInput(session);
    auto request=fixture();auto project=request["state"]["project"];auto main=project["tracks"][0];auto target=copy(main);
    put(target,"id","tempo-record");put(target,"kind","audio");put(target,"input","external");put(target,"inputChannel","1");put(target,"output","main");put(target,"armed",true);put(target,"monitor","off");
    put(project,"tracks",juce::Array<V>{main,target});put(project,"tempo",parse(R"([{"bar":1,"bpm":120},{"bar":1.05,"bpm":240}])"));
    accepted(apply(session,request),0);
    auto control=parse(R"({"protocolVersion":2,"sessionId":"live-mixer-regression","sequence":1,"controlGeneration":"1","control":{"playing":true,"recording":true,"seekBar":1,"seekGeneration":1}})");
    accepted(session.call("control",envelope(control)),0);
    constexpr int frames=16384;juce::AudioBuffer<float> audio(2,256);juce::MidiBuffer midi;
    for(int start=0;start<frames;start+=256) {audio.clear();midi.clear();for(int i=0;i<256;++i)audio.setSample(0,i,(start+i)%2?.125f:-.125f);MixerTestAccess::hosted(session).processBlock(audio,midi);}
    auto command=control["control"];put(command,"playing",false);put(command,"recording",false);put(control,"sequence",2);put(control,"controlGeneration","2");accepted(session.call("control",envelope(control)),0);
    auto query=object();put(query,"leaseId","mixer-test");put(query,"sessionId","live-mixer-regression");const auto results=session.call("recording_results",query);
    require(results["recordings"].size()==1,"Tempo map recording produced no result");const auto take=results["recordings"][0],clip=take["clips"][0];
    const auto file=juce::File(take["files"][0]["path"].toString());juce::AudioFormatManager formats;formats.registerBasicFormats();std::unique_ptr<juce::AudioFormatReader> reader(formats.createReaderFor(file));
    require(reader && reader->lengthInSamples==frames,"Tempo map changed recorded frame duration");
    const auto& mapping=MixerTestAccess::request(session);const double start=clip["startBar"],length=clip["durationBars"];
    require(std::abs(mapping.barDuration(start,length)-frames/48000.0)<1.0/48000,"Recorded musical placement differs from captured seconds");
    juce::AudioBuffer<float> actual(1,frames);require(reader->read(&actual,0,frames,0,true,false),"Cannot read tempo recording");
    for(int i=0;i<frames;++i)require(std::abs(actual.getSample(0,i)-(i%2?.125f:-.125f))<1e-5,"Tempo recording altered PCM");
    std::cout<<"Hosted recording across tempo change retained 16384 exact PCM frames and mapped musical duration\n";
}
