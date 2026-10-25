void testHostedTransportClock() {
    EngineSession session;MixerTestAccess::initialiseHostedInput(session);
    auto request=fixture();accepted(apply(session,request),0);
    auto& edit=*MixerTestAccess::edit(session);auto& transport=edit.getTransport();
    edit.dispatchPendingUpdatesSynchronously();transport.ensureContextAllocated(true);
    auto command=parse(R"({"protocolVersion":2,"sessionId":"live-mixer-regression","sequence":1,"controlGeneration":"1","control":{"playing":true,"recording":false,"seekBar":3,"seekGeneration":1}})");
    accepted(session.call("control",envelope(command)),0);
    auto query=object();put(query,"leaseId","mixer-test");
    const auto bar=[&] { return (double)session.call("telemetry",query)["telemetry"]["clock"]["bar"]; };
    juce::AudioBuffer<float> audio(2,256);juce::MidiBuffer midi;
    const auto process=[&] { for(int block=0;block<16;++block) { audio.clear();midi.clear();MixerTestAccess::hosted(session).processBlock(audio,midi); } };
    process();auto* context=transport.getCurrentPlaybackContext();require(context!=nullptr,"Playback clock has no context");
    require(!context->getPendingPositionChange(),"Hosted playback never adopted seek");
    const auto audible=context->getAudibleTimelineTime().inSeconds();
    require(audible>4.01,"Hosted audible clock did not advance beyond seek");
    require(std::abs(transport.getPosition().inSeconds()-4)<1e-8,"Clock regression unexpectedly pumped the UI timer");
    require(std::abs(bar()-(1+audible/2))<1e-8,"Arrangement telemetry reads the stalled UI timer instead of audible playback");
    auto control=command["control"];put(control,"seekBar",7);put(control,"seekGeneration",2);put(command,"sequence",2);put(command,"controlGeneration","2");accepted(session.call("control",envelope(command)),0);
    require(std::abs(bar()-7)<1e-8,"Pending seek reported the previous audible position");
    process();require(std::abs(bar()-(1+context->getAudibleTimelineTime().inSeconds()/2))<1e-8 && bar()>7,"Post-seek telemetry did not resume the audible clock");
    put(control,"playing",false);put(control,"seekBar",5);put(control,"seekGeneration",3);put(command,"sequence",3);put(command,"controlGeneration","3");accepted(session.call("control",envelope(command)),0);
    require(std::abs(bar()-5)<1e-8,"Stopped telemetry lost the exact seek position");
    put(control,"playing",true);put(command,"sequence",4);put(command,"controlGeneration","4");accepted(session.call("control",envelope(command)),0);
    process();
    int sequence=5,revision=0;
    const auto counters=session.call("diagnostics",object());
    for(const double bpm:{180.0,90.0,120.0}) {
        const double before=bar();
        const auto beforeSync=context->getSyncPoint();require(beforeSync.has_value(),"Missing processed tempo clock");
        auto project=request["state"]["project"];put(project,"bpm",bpm);next(request,sequence++,revision,revision+1,"commit");
        accepted(apply(session,request),++revision);
        require(MixerTestAccess::edit(session)==&edit && edit.getCurrentPlaybackContext()==context,
                "Live BPM replaced the playing Edit/context");
        require(std::abs(bar()-before)<1e-6,"BPM edit moved the musical playback position: "+juce::String(before,8)+" -> "+juce::String(bar(),8));
        double previousBar=bar();
        for(int block=0;block<16;++block) {
            audio.clear();midi.clear();MixerTestAccess::hosted(session).processBlock(audio,midi);
            const double currentBar=bar();
            require(currentBar>=previousBar,"Native tempo handoff retracted the audible playhead");
            previousBar=currentBar;
        }
        const auto afterSync=context->getSyncPoint();require(afterSync.has_value(),"Missing adopted tempo clock");
        require(std::abs((afterSync->beat-beforeSync->beat).inBeats()-16*256.0/48000*bpm/60)<2.0/48000,
                "Live BPM did not advance the processed audio by the new tempo");
        require(bar()>before && std::abs(bar()-before-16*256.0/48000*bpm/240)<256.0/48000,
                "Audible tempo clock diverged by more than one audio block");
        for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})
            require((juce::int64)session.call("diagnostics",object())[key]==(juce::int64)counters[key],
                    "Live BPM rebuilt or restarted playback");
    }
}
