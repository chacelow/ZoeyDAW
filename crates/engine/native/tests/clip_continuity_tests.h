void testHostedClipEditContinuity() {
    juce::TemporaryFile source(".wav");
    juce::WavAudioFormat wav;
    auto stream=source.getFile().createOutputStream();require(stream!=nullptr,"Cannot create continuity source");
    std::unique_ptr<juce::AudioFormatWriter> writer(wav.createWriterFor(stream.release(),48000,1,24,{},0));
    require(writer!=nullptr,"Cannot write continuity source");
    juce::AudioBuffer<float> tone(1,192000);
    std::fill_n(tone.getWritePointer(0),tone.getNumSamples(),.25f);
    require(writer->writeFromAudioSampleBuffer(tone,0,tone.getNumSamples()),"Cannot populate continuity source");writer.reset();
    EngineSession session;MixerTestAccess::initialiseHostedInput(session);
    auto request=fadeFixture(source.getFile());
    auto authored=request["state"]["project"]["tracks"][1]["clips"][0];
    for(const auto* key:{"fadeInBars","fadeOutBars","fadeInOffsetBars","fadeOutOffsetBars"})put(authored,key,0);
    auto destinationSeed=copy(request["state"]["project"]["tracks"][1]);
    put(destinationSeed,"id","continuity-target");put(destinationSeed,"clips",juce::Array<V>{});
    request["state"]["project"]["tracks"].getArray()->add(destinationSeed);
    auto control=request["state"]["control"];put(control,"playing",true);put(control,"seekBar",1.125);
    accepted(apply(session,request),0);
    auto* edit=MixerTestAccess::edit(session);
    auto* clip=MixerTestAccess::audioClip(session,"fade-clip");
    auto* fader=MixerTestAccess::track(session,"audio")->getVolumePlugin();
    auto* context=edit->getCurrentPlaybackContext();require(context!=nullptr,"Continuity fixture has no playback context");
    const auto counters=session.call("diagnostics",object());
    juce::AudioBuffer<float> output(2,256);juce::MidiBuffer midi;
    int measured=0;double maximumError=0;
    const auto process=[&](int blocks,bool measure) {
        for(int block=0;block<blocks;++block) {
            juce::MessageManager::getInstance()->runDispatchLoopUntil(6);
            output.clear();midi.clear();MixerTestAccess::hosted(session).processBlock(output,midi);
            if(measure) {
                ++measured;
                for(int channel=0;channel<2;++channel)for(int sample=0;sample<256;++sample)
                    maximumError=std::max(maximumError,std::abs(double(output.getSample(channel,sample))-.25));
            }
        }
    };
    process(24,false);
    require(std::abs(output.getRMSLevel(0,0,256)-.25f)<1e-5,"Continuity fixture did not establish audible baseline");
    for(int change=0;change<12;++change) {
        const double before=context->getPosition().inSeconds();
        put(authored,"startBar",1+(change%2)*.01);put(authored,"lengthBars",1.75+(change%2)*.05);
        next(request,change+1,change,change+1,"commit");accepted(apply(session,request),change+1);
        edit->dispatchPendingUpdatesSynchronously();
        process(8,true);
        require(MixerTestAccess::edit(session)==edit && MixerTestAccess::audioClip(session,"fade-clip")==clip &&
                MixerTestAccess::track(session,"audio")->getVolumePlugin()==fader && edit->getCurrentPlaybackContext()==context,
                "Clip commit replaced a retained native owner");
        require(edit->getTransport().isPlaying() && context->isPlaying(),"Clip commit stopped playback");
        require(std::abs(context->getPosition().inSeconds()-before-8*256.0/48000)<1.0/48000,
                "Clip commit changed sample-clock progression");
    }
    require(maximumError<1e-5,"Clip commits introduced an audible discontinuity");
    put(authored,"lengthBars",.1);next(request,13,12,13,"commit");accepted(apply(session,request),13);
    edit->dispatchPendingUpdatesSynchronously();process(8,false);
    require(output.getMagnitude(0,output.getNumSamples())<1e-6,"Trim beyond playhead did not silence the native clip");
    put(authored,"lengthBars",2);next(request,14,13,14,"commit");accepted(apply(session,request),14);
    edit->dispatchPendingUpdatesSynchronously();process(8,false);
    require(std::abs(output.getRMSLevel(0,0,256)-.25f)<1e-5,"Restoring clip length did not restore native output");
    const auto committed=copy(request);
    put(authored,"lengthBars",.1);next(request,15,14,14,"preview");accepted(apply(session,request),14);
    edit->dispatchPendingUpdatesSynchronously();process(8,false);
    require(output.getMagnitude(0,output.getNumSamples())<1e-6,"Trim preview did not reach actual output");
    auto cancelled=copy(committed);next(cancelled,16,14,14,"cancel");accepted(apply(session,cancelled),14);
    edit->dispatchPendingUpdatesSynchronously();process(8,true);
    auto invalid=copy(cancelled);auto invalidTrack=invalid["state"]["project"]["tracks"][1];put(invalidTrack,"pan",2);
    next(invalid,17,14,15,"commit");bool rejected=false;
    try { apply(session,invalid); } catch(const std::exception&) { rejected=true; }
    require(rejected && MixerTestAccess::request(session).revision==14,"Invalid clip transaction advanced accepted revision");
    process(8,true);
    require(maximumError<1e-5 && MixerTestAccess::edit(session)==edit &&
            MixerTestAccess::audioClip(session,"fade-clip")==clip && edit->getCurrentPlaybackContext()==context,
            "Cancel or invalid request altered the retained output owner");
    auto moved=copy(cancelled);auto tracks=moved["state"]["project"]["tracks"];
    auto origin=tracks[1];auto destination=tracks[5];
    const auto movedClip=origin["clips"][0];origin["clips"].getArray()->clear();
    destination["clips"].getArray()->add(movedClip);put(destination,"volumeDb",-6.020599913);
    next(moved,17,14,15,"commit");accepted(apply(session,moved),15);
    edit->dispatchPendingUpdatesSynchronously();process(16,false);
    require(MixerTestAccess::audioClip(session,"fade-clip")==clip && clip->getTrack()==MixerTestAccess::track(session,"continuity-target"),
            "Cross-track commit did not move the retained Clip");
    require(std::abs(output.getRMSLevel(0,0,256)-.125f)<1e-5,
            "Cross-track output did not use the destination fader");
    auto returned=copy(cancelled);next(returned,18,15,16,"commit");accepted(apply(session,returned),16);
    edit->dispatchPendingUpdatesSynchronously();process(16,true);
    require(maximumError<1e-5,"Returning retained Clip introduced a discontinuity");
    auto deleted=copy(returned);deleted["state"]["project"]["tracks"][1]["clips"].getArray()->clear();
    next(deleted,19,16,16,"preview");accepted(apply(session,deleted),16);
    edit->dispatchPendingUpdatesSynchronously();process(8,false);
    require(output.getMagnitude(0,output.getNumSamples())<1e-6,"Deleted Clip remained audible");
    next(returned,20,16,16,"cancel");accepted(apply(session,returned),16);
    edit->dispatchPendingUpdatesSynchronously();
    int restoredAt=-1;
    for(int block=0;block<16;++block) {
        process(1,false);
        if(restoredAt<0 && std::abs(output.getRMSLevel(0,0,256)-.25f)<1e-5)restoredAt=block;
    }
    require(restoredAt>=0,"Deletion cancel did not restore audible output within 16 blocks");
    process(8,true);
    require(maximumError<1e-5 && MixerTestAccess::edit(session)==edit && edit->getCurrentPlaybackContext()==context,
            "Cross-track move or recovered Clip output changed the retained playback owner");
    std::cout<<"Deletion cancel recreated Clip; stable output recovered at block "<<restoredAt<<'\n';
    int tempoSequence=21;
    for(int change=0;change<24;++change) {
        const double bpm=90+(change%8)*15;
        auto project=returned["state"]["project"];put(project,"bpm",bpm);
        next(returned,tempoSequence++,16,16,"preview");accepted(apply(session,returned),16);
        edit->dispatchPendingUpdatesSynchronously();
        process(8,true);
        require(maximumError<1e-5 && MixerTestAccess::edit(session)==edit &&
                edit->getCurrentPlaybackContext()==context && edit->getTransport().isPlaying(),
                "Continuous BPM drag interrupted actual Clip output");
    }
    const auto after=session.call("diagnostics",object());
    for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})
        require((juce::int64)after[key]==(juce::int64)counters[key],"Clip commit rebuilt Edit or explicitly restarted transport");
    std::cout<<"EngineSession document commits: "<<measured<<" continuous blocks, maximum sample error "<<maximumError<<"; trim/restore PCM passed\n";
}

void testHostedTempoWaveContinuity(const char* mode=nullptr) {
    if(!mode) {
        for(const auto* variant:{"soundtouch","signalsmith","signalsmith-formant","re-pitch"})testHostedTempoWaveContinuity(variant);
        return;
    }
    juce::TemporaryFile source(".wav");
    juce::WavAudioFormat wav;auto stream=source.getFile().createOutputStream();
    require(stream!=nullptr,"Cannot create tempo wave source");
    std::unique_ptr<juce::AudioFormatWriter> writer(wav.createWriterFor(stream.release(),48000,1,24,{},0));
    require(writer!=nullptr,"Cannot write tempo wave source");
    juce::AudioBuffer<float> tone(1,192000);
    for(int sample=0;sample<tone.getNumSamples();++sample)
        tone.setSample(0,sample,.25f*std::sin(juce::MathConstants<double>::twoPi*137*sample/48000));
    require(writer->writeFromAudioSampleBuffer(tone,0,tone.getNumSamples()),"Cannot populate tempo wave source");writer.reset();
    EngineSession session;MixerTestAccess::initialiseHostedInput(session);
    auto request=fadeFixture(source.getFile());auto project=request["state"]["project"];
    auto clip=project["tracks"][1]["clips"][0];
    for(const auto* key:{"fadeInBars","fadeOutBars","fadeInOffsetBars","fadeOutOffsetBars"})put(clip,key,0);
    auto settings=clip["audioSettings"];put(settings,"warp",true);put(settings,"warpMode",mode);
    auto control=request["state"]["control"];put(control,"playing",true);put(control,"seekBar",1.125);
    accepted(apply(session,request),0);
    auto* edit=MixerTestAccess::edit(session);
    juce::AudioBuffer<float> audio(2,256);juce::MidiBuffer midi;
    float previous=0;double maximumJump=0,energy=0;int samples=0;
    const auto process=[&](int blocks,bool measure) {
        for(int block=0;block<blocks;++block) {
            juce::MessageManager::getInstance()->runDispatchLoopUntil(6);
            audio.clear();midi.clear();MixerTestAccess::hosted(session).processBlock(audio,midi);
            for(int sample=0;sample<256;++sample) {
                const float value=audio.getSample(0,sample);
                if(measure) { maximumJump=std::max(maximumJump,std::abs(double(value-previous)));energy+=value*value;++samples; }
                previous=value;
            }
        }
    };
    process(32,false);
    for(int change=0;change<48;++change) {
        const double bpm=change<24?120+(change%2?-.5:.5):90+(change-24)*4;
        put(project,"bpm",bpm);next(request,change+1,0,0,"preview");
        accepted(apply(session,request),0);edit->dispatchPendingUpdatesSynchronously();process(8,true);
    }
    std::cout<<"BPM sine continuity ("<<mode<<"): max adjacent sample step "<<maximumJump<<", RMS "<<std::sqrt(energy/samples)<<'\n';
    require(std::sqrt(energy/samples)>.1,"Tempo wave continuity fixture became silent");
    require(maximumJump<.01,"BPM drag introduced a discontinuity into a continuous sine wave");
}
