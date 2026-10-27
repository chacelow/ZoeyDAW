#pragma once
void writeSessionTone(const juce::TemporaryFile& source,int sourceChannels) {
    juce::WavAudioFormat wav;
    auto stream=source.getFile().createOutputStream();require(stream!=nullptr,"Cannot create Session source");
    std::unique_ptr<juce::AudioFormatWriter> writer(wav.createWriterFor(stream.release(),48000,static_cast<unsigned>(sourceChannels),24,{},0));
    require(writer!=nullptr,"Cannot write Session source");
    juce::AudioBuffer<float> tone(sourceChannels,192000);for(int channel=0;channel<sourceChannels;++channel)std::fill_n(tone.getWritePointer(channel),tone.getNumSamples(),.25f);
    require(writer->writeFromAudioSampleBuffer(tone,0,tone.getNumSamples()),"Cannot populate Session source");
}
void testSessionLauncher(int sourceChannels,int numerator,int denominator) {
    juce::TemporaryFile source(".wav");writeSessionTone(source,sourceChannels);
    EngineSession session;MixerTestAccess::initialiseHostedInput(session);
    auto request=fadeFixture(source.getFile());auto project=request["state"]["project"];auto audio=project["tracks"][1];
    auto metadata=project["sources"][0];put(metadata,"channels",sourceChannels);put(project,"numerator",numerator);put(project,"denominator",denominator);
    auto arranged=audio["clips"][0];put(arranged,"lengthBars",16);auto settings=arranged["audioSettings"];put(settings,"loop",true);
    for(const auto* key:{"fadeInBars","fadeOutBars","fadeInOffsetBars","fadeOutOffsetBars"})put(arranged,key,0);
    auto slotA=copy(arranged);slotA.getDynamicObject()->removeProperty("startBar");put(slotA,"id","slot-a");put(slotA,"gainDb",-6.020599913);
    auto slotB=copy(slotA);put(slotB,"id","slot-b");put(slotB,"gainDb",-12.041199826);
    auto launcher=parse(R"({"scenes":[{"id":"a"},{"id":"b"}],"quantization":"bar"})");put(project,"launcher",launcher);
    auto slots=juce::Array<V>{};
    for(const auto& [scene,clip]:{std::pair{"a",slotA},std::pair{"b",slotB}}) { auto slot=object();put(slot,"sceneId",scene);put(slot,"clip",clip);slots.add(slot); }
    put(audio,"clipSlots",slots);
    auto midiTrack=copy(audio);put(midiTrack,"id","midi-session");put(midiTrack,"kind","midi");put(midiTrack,"clips",juce::Array<V>{});
    put(midiTrack,"clipSlots",parse(R"([{"sceneId":"a","clip":{"id":"midi-slot","kind":"midi","lengthBars":1,"sourceOffsetBars":0,"mute":false,"loopBars":1,"notes":[{"id":"launch-note","pitch":64,"startBeat":0,"lengthBeats":2,"velocity":100}]}}])"));
    project["tracks"].getArray()->add(midiTrack);
    auto control=request["state"]["control"];put(control,"playing",true);put(control,"seekBar",1);
    accepted(apply(session,request),0);auto* edit=MixerTestAccess::edit(session);
    edit->engine.getPluginManager().registerBuiltInType(std::make_unique<MidiProbeFactory>());
    auto receiver=edit->getPluginCache().createNewPlugin("native-test-midi-probe",{});auto* probe=dynamic_cast<MidiProbe*>(receiver.get());
    require(probe!=nullptr,"Cannot create Session MIDI receiver");MixerTestAccess::track(session,"midi-session")->pluginList.insertPlugin(receiver,-1,nullptr);
    edit->dispatchPendingUpdatesSynchronously();
    auto* context=edit->getCurrentPlaybackContext();const auto counters=session.call("diagnostics",object());
    juce::AudioBuffer<float> output(2,256);juce::MidiBuffer midi;
    const auto process=[&](int blocks) { for(int i=0;i<blocks;++i) { juce::MessageManager::getInstance()->runDispatchLoopUntil(3);output.clear();midi.clear();MixerTestAccess::hosted(session).processBlock(output,midi); } };
    const auto level=[&](double expected,const char* reason) { const auto actual=output.getRMSLevel(0,0,256);const double tolerance=expected==0?1e-6:2e-4;require(std::abs(actual-expected)<tolerance,juce::String(reason)+": actual="+juce::String(actual,8)+", expected="+juce::String(expected,8)); };
    process(24);level(.25,"Session fixture lost Arrangement PCM");
    auto command=parse(R"({"protocolVersion":2,"sessionId":"live-mixer-regression","sequence":1,"controlGeneration":"1","control":{"playing":true,"recording":false,"seekBar":1,"seekGeneration":0},"command":{"kind":"scene","sceneId":"a"},"quantize":true})");
    accepted(session.call("control",envelope(command)),0);
    auto handle=MixerTestAccess::audioClip(session,"slot-a")->getLaunchHandle();require(handle!=nullptr,"Session audio clip has no LaunchHandle");
    require(handle->getQueuedStatus()==te::LaunchHandle::QueueState::playQueued && handle->getPlayingStatus()==te::LaunchHandle::PlayState::stopped,"Command ACK pretended audio adoption");
    process(8);level(.25,"Quantized launch cut Arrangement before the boundary");
    int blocks=0;while(handle->getPlayingStatus()!=te::LaunchHandle::PlayState::playing && blocks++<500)process(1);
    require(blocks<500,"Quantized launch never reached an audio block");
    double minimum=.25;
    for(int block=0;block<16;++block) { process(1);for(int sample=0;sample<256;++sample)minimum=std::min(minimum,(double)output.getSample(0,sample)); }
    require(minimum>.1,"Quantized launch inserted a silent gap");
    level(.125,"Launched audio did not use independent slot gain/source");
    require(probe->count>0 && probe->received[0].pitch==64 && probe->received[0].on,"Scene launch omitted actual MIDI events");
    auto query=object();put(query,"leaseId","mixer-test");auto snapshot=session.call("telemetry",query)["launcher"];
    require(snapshot["tracks"][0]["slots"][0]["playing"]==V(true),"Launcher observation missed actual adopted slot");
    put(command,"sequence",2);put(command,"quantize",false);put(command,"command",parse(R"({"kind":"clip","trackId":"audio","sceneId":"b"})"));
    accepted(session.call("control",envelope(command)),0);process(24);level(.0625,"Clip launch failed to replace the same-track slot");
    put(command,"sequence",3);put(command,"command",parse(R"({"kind":"stopTrack","trackId":"audio"})"));
    accepted(session.call("control",envelope(command)),0);process(24);level(0,"Stop track leaked Arrangement or a previous slot");
    put(command,"sequence",4);put(command,"command",parse(R"({"kind":"arrangement"})"));
    accepted(session.call("control",envelope(command)),0);process(24);level(.25,"Return to Arrangement did not restore existing PCM");
    require(MixerTestAccess::edit(session)==edit && edit->getCurrentPlaybackContext()==context,"Session performance replaced Edit or playback context");
    for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})require(counters[key]==session.call("diagnostics",object())[key],"Session performance rebuilt or restarted transport");
    auto invalid=copy(command);put(invalid,"sequence",5);put(invalid,"command",parse(R"({"kind":"scene","sceneId":"absent"})"));
    require(session.call("control",envelope(invalid))["kind"].toString()=="rejected","Unknown scene was accepted");process(8);level(.25,"Rejected launch changed current output");
    for(const auto& malformed:{parse(R"({"kind":"clip","trackId":"audio","sceneId":""})"),parse(R"({"kind":"stopTrack","trackId":""})")}) {
        auto emptyIdentity=copy(invalid);put(emptyIdentity,"command",malformed);bool rejected=false;
        try { session.call("control",envelope(emptyIdentity)); }catch(const std::exception&) { rejected=true; }
        require(rejected,"Empty launch identity crossed the native protocol boundary");
    }
    launcher["scenes"].getArray()->remove(0);audio["clipSlots"].getArray()->remove(0);put(midiTrack,"clipSlots",juce::Array<V>{});
    next(request,5,0,1,"commit");accepted(apply(session,request),1);edit->dispatchPendingUpdatesSynchronously();process(24);level(.25,"Scene deletion changed Arrangement playback");
    auto* retainedSlot=MixerTestAccess::audioClip(session,"slot-b");
    launcher["scenes"].getArray()->add(parse(R"({"id":"c"})"));auto movedSlot=audio["clipSlots"][0];put(movedSlot,"sceneId","c");
    next(request,6,1,2,"commit");accepted(apply(session,request),2);edit->dispatchPendingUpdatesSynchronously();process(16);
    require(MixerTestAccess::edit(session)==edit && MixerTestAccess::audioClip(session,"slot-b")==retainedSlot && retainedSlot->getClipSlot()->getIndex()==1,"Moving a slot replaced its retained owner or missed the destination scene");
    put(slotB,"lengthBars",1);put(slotB,"fadeInBars",.1);auto slotSettings=slotB["audioSettings"];put(slotSettings,"loop",false);put(slotSettings,"endMarkerBars",.5);
    next(request,7,2,3,"commit");accepted(apply(session,request),3);edit->dispatchPendingUpdatesSynchronously();process(16);
    put(command,"sequence",8);put(command,"command",parse(R"({"kind":"clip","trackId":"audio","sceneId":"c"})"));
    accepted(session.call("control",envelope(command)),3);
    const double blocksPerBar=48000*decode(request).secondsPerBar()/256;
    process((int)std::ceil(.05*blocksPerBar));const auto fadeLevel=output.getRMSLevel(0,0,256);
    require(fadeLevel>.02 && fadeLevel<.055,"Slot fade used global timeline time or the wrong beat unit: level="+juce::String(fadeLevel,8)+", meter="+juce::String(numerator)+"/"+juce::String(denominator));
    process((int)std::ceil(.2*blocksPerBar));level(.0625,"Slot source markers muted a newly launched local window");
    process((int)std::ceil(.35*blocksPerBar));level(0,"Slot End marker did not stop the actual source window");
    const auto processWithoutTimers=[&](int blocks) { for(int i=0;i<blocks;++i) { output.clear();midi.clear();MixerTestAccess::hosted(session).processBlock(output,midi); } };
    put(command,"sequence",9);put(command,"command",parse(R"({"kind":"arrangement"})"));accepted(session.call("control",envelope(command)),3);processWithoutTimers(8);
    put(command,"sequence",10);put(command,"command",parse(R"({"kind":"clip","trackId":"audio","sceneId":"c"})"));accepted(session.call("control",envelope(command)),3);processWithoutTimers(2);
    require(retainedSlot->getLaunchHandle()->getPlayingStatus()==te::LaunchHandle::PlayState::playing,"Immediate slot launch did not reach the audio graph");
    put(command,"sequence",11);put(command,"command",parse(R"({"kind":"stopTrack","trackId":"audio"})"));accepted(session.call("control",envelope(command)),3);processWithoutTimers(16);level(0,"Stopping an adopted slot resumed Arrangement before the UI timer");
    std::cout<<"Session actual PCM/MIDI "<<sourceChannels<<"ch "<<numerator<<"/"<<denominator<<": quantized scene, local fades/markers, slot move, stop/Arrangement and retained owner passed\n";
}

void testSessionInputMonitor() {
    juce::TemporaryFile source(".wav");writeSessionTone(source,1);
    EngineSession session;MixerTestAccess::initialiseHostedInput(session);
    auto request=fadeFixture(source.getFile());auto project=request["state"]["project"];auto audio=project["tracks"][1];
    auto clip=audio["clips"][0];put(clip,"lengthBars",16);for(const auto* key:{"fadeInBars","fadeOutBars","fadeInOffsetBars","fadeOutOffsetBars"})put(clip,key,0);
    auto settings=clip["audioSettings"];put(settings,"loop",true);
    auto slotClip=copy(clip);slotClip.getDynamicObject()->removeProperty("startBar");put(slotClip,"id","monitor-slot");put(slotClip,"gainDb",-6.020599913);
    auto slot=object();put(slot,"sceneId","scene");put(slot,"clip",slotClip);put(audio,"clipSlots",juce::Array<V>{slot});put(audio,"clips",juce::Array<V>{});
    put(project,"launcher",parse(R"({"scenes":[{"id":"scene"}],"quantization":"bar"})"));
    put(audio,"input","external");put(audio,"inputChannel","1");put(audio,"monitor","auto");put(audio,"armed",true);
    auto control=request["state"]["control"];put(control,"playing",true);put(control,"seekBar",1);accepted(apply(session,request),0);
    auto* edit=MixerTestAccess::edit(session);juce::AudioBuffer<float> output(2,256);juce::MidiBuffer midi;
    const auto process=[&](int blocks) { for(int i=0;i<blocks;++i) { juce::MessageManager::getInstance()->runDispatchLoopUntil(3);output.clear();std::fill_n(output.getWritePointer(0),256,.0625f);midi.clear();MixerTestAccess::hosted(session).processBlock(output,midi); } };
    const auto level=[&](double expected,const char* reason) { require(std::abs(output.getRMSLevel(0,0,256)-expected)<2e-4,reason); };
    process(24);level(.0625,"Unlaunched Session content incorrectly muted Auto input");
    auto command=parse(R"({"protocolVersion":2,"sessionId":"live-mixer-regression","sequence":1,"controlGeneration":"1","control":{"playing":true,"recording":false,"seekBar":1,"seekGeneration":0},"command":{"kind":"clip","trackId":"audio","sceneId":"scene"},"quantize":false})");
    accepted(session.call("control",envelope(command)),0);process(24);level(.125,"Auto input leaked into a playing Session clip");
    put(command,"sequence",2);put(command,"command",parse(R"({"kind":"stopTrack","trackId":"audio"})"));accepted(session.call("control",envelope(command)),0);process(24);level(.0625,"Stopping a Session clip failed to restore Auto input");
    put(command,"sequence",3);put(command,"command",parse(R"({"kind":"arrangement"})"));accepted(session.call("control",envelope(command)),0);
    put(audio,"clips",juce::Array<V>{clip});next(request,4,0,1,"commit");accepted(apply(session,request),1);edit->dispatchPendingUpdatesSynchronously();process(24);level(.25,"Arrangement playback failed to suppress Auto input");
    put(command,"sequence",5);put(command,"quantize",true);put(command,"command",parse(R"({"kind":"clip","trackId":"audio","sceneId":"scene"})"));accepted(session.call("control",envelope(command)),1);
    auto handle=MixerTestAccess::audioClip(session,"monitor-slot")->getLaunchHandle();int blocks=0;
    while(handle->getPlayingStatus()!=te::LaunchHandle::PlayState::playing && blocks++<500) { process(1);require(output.getMagnitude(0,256)<.27,"Auto input leaked at the quantized Arrangement/Session boundary"); }
    require(blocks<500,"Monitored Session launch never reached the audio graph");process(24);level(.125,"Quantized Session playback retained live input");
    std::cout<<"Session actual Hosted Auto input: unlaunched, playing, stopped, Arrangement and quantized boundary passed\n";
}
