void testSegmentedWarpSdk() {
    constexpr int rate=48000,frames=rate*4;
    juce::TemporaryFile source(".wav");juce::WavAudioFormat wav;
    auto stream=source.getFile().createOutputStream();require(stream!=nullptr,"Cannot create segmented Warp source");
    std::unique_ptr<juce::AudioFormatWriter> writer(wav.createWriterFor(stream.release(),rate,1,24,{},0));
    require(writer!=nullptr,"Cannot encode segmented Warp source");juce::AudioBuffer<float> samples(1,frames);
    for(int i=0;i<frames;++i)samples.setSample(0,i,.1f*(1+i/rate)*std::sin(2*juce::MathConstants<double>::pi*1000*i/rate));
    require(writer->writeFromAudioSampleBuffer(samples,0,frames),"Cannot write segmented Warp PCM");writer.reset();
    EngineSession session;MixerTestAccess::initialiseHostedInput(session);auto request=fadeFixture(source.getFile());auto clip=request["state"]["project"]["tracks"][1]["clips"][0];
    for(const auto* key:{"fadeInBars","fadeOutBars","fadeInOffsetBars","fadeOutOffsetBars"})put(clip,key,0);
    auto settings=clip["audioSettings"];put(settings,"warp",true);put(settings,"warpMode","re-pitch");
    put(settings,"warpMarkers",parse(R"([{"id":"a","sourceBar":1,"targetBar":0.5},{"id":"b","sourceBar":2,"targetBar":2}])"));
    accepted(apply(session,request),0);
    auto* native=MixerTestAccess::audioClip(session,"fade-clip");
    MixerTestAccess::edit(session)->dispatchPendingUpdatesSynchronously();
    juce::TemporaryFile output(".wav");auto render=object();put(render,"path",output.getFile().getFullPathName());put(render,"seconds",4);put(render,"sampleRate",rate);session.call("render",render);
    std::unique_ptr<juce::AudioFormatReader> reader(wav.createReaderFor(output.getFile().createInputStream().release(),true));require(reader!=nullptr,"Cannot inspect segmented Warp output");
    for(const auto [seconds,expected]:std::initializer_list<std::pair<double,double>>{{.3,.1},{.8,.2},{1.5,.3},{3.5,.4}}) {
        juce::AudioBuffer<float> actual(2,256);require(reader->read(&actual,0,256,(juce::int64)(seconds*rate),true,true),"Cannot read segmented Warp PCM");
        const double rms=actual.getRMSLevel(0,0,256),expectedRms=expected/std::sqrt(2.0);
        require(std::abs(rms-expectedRms)<.03,"Segmented SDK Warp PCM at "+juce::String(seconds)+": "+juce::String(rms)+" expected "+juce::String(expectedRms));
    }
    put(settings,"warp",false);next(request,1,0,1,"commit");accepted(apply(session,request),1);
    require(MixerTestAccess::audioClip(session,"fade-clip")==native,"Warp toggle replaced native Clip");
    juce::TemporaryFile raw(".wav");put(render,"path",raw.getFile().getFullPathName());session.call("render",render);
    std::unique_ptr<juce::AudioFormatReader> rawReader(wav.createReaderFor(raw.getFile().createInputStream().release(),true));
    juce::AudioBuffer<float> actual(2,256);require(rawReader && rawReader->read(&actual,0,256,38400,true,true),"Cannot read Warp bypass");
    require(std::abs(actual.getRMSLevel(0,0,256)-.1/std::sqrt(2.0))<.02,"Warp off did not bypass authored map");
    put(settings,"warp",true);put(settings,"warpMarkers",parse(R"([{"id":"a","sourceBar":1,"targetBar":1},{"id":"b","sourceBar":2,"targetBar":2}])"));
    next(request,2,1,2,"commit");accepted(apply(session,request),2);
    require(MixerTestAccess::audioClip(session,"fade-clip")==native,"Marker edit replaced retained Clip");
    juce::TemporaryFile changed(".wav");put(render,"path",changed.getFile().getFullPathName());session.call("render",render);
    std::unique_ptr<juce::AudioFormatReader> changedReader(wav.createReaderFor(changed.getFile().createInputStream().release(),true));
    require(changedReader && changedReader->read(&actual,0,256,38400,true,true),"Cannot read edited Warp map");
    require(std::abs(actual.getRMSLevel(0,0,256)-.1/std::sqrt(2.0))<.02,"Edited Warp marker map did not change actual PCM");
    put(settings,"warpMarkers",juce::Array<V>{});next(request,3,2,3,"commit");accepted(apply(session,request),3);
    require(MixerTestAccess::audioClip(session,"fade-clip")==native && !native->getWarpTime(),"Removing markers did not restore uniform Warp on retained Clip");
    int sequence=4;
    for(const auto* mode:{"soundtouch","signalsmith","signalsmith-formant","re-pitch"}) {
        put(settings,"warpMode",mode);put(settings,"warpMarkers",parse(R"([{"id":"a","sourceBar":1,"targetBar":0.5},{"id":"b","sourceBar":2,"targetBar":2}])"));
        next(request,sequence++,3,3,"preview");accepted(apply(session,request),3);
        juce::TemporaryFile modeOutput(".wav");put(render,"path",modeOutput.getFile().getFullPathName());session.call("render",render);
        std::unique_ptr<juce::AudioFormatReader> modeReader(wav.createReaderFor(modeOutput.getFile().createInputStream().release(),true));
        require(modeReader && modeReader->read(&actual,0,256,72000,true,true),"Cannot inspect segmented Warp mode");
        const auto rms=actual.getRMSLevel(0,0,256);
        require(std::abs(rms-.3/std::sqrt(2.0))<.04,"Segmented Warp mode lost source interval: "+juce::String(mode)+" rms="+juce::String(rms));
    }
    auto command=parse(R"({"protocolVersion":2,"sessionId":"live-mixer-regression","sequence":100,"controlGeneration":"1","control":{"playing":true,"recording":false,"seekBar":1.05,"seekGeneration":1}})");
    accepted(session.call("control",envelope(command)),3);
    auto* edit=MixerTestAccess::edit(session);edit->dispatchPendingUpdatesSynchronously();
    juce::MidiBuffer midi;
    for(int block=0;block<24;++block) {
        juce::MessageManager::getInstance()->runDispatchLoopUntil(6);actual.clear();midi.clear();MixerTestAccess::hosted(session).processBlock(actual,midi);
    }
    const auto graph=MixerTestAccess::sourceGraph(session,*edit);
    require(graph && graph->playheads.contains(native->itemID),"Segmented Warp produced no source playhead");
    const auto observation=graph->playheads.at(native->itemID)->getObservation(1000);
    require(observation && observation->position.inSeconds()>.4 && observation->position.inSeconds()<.5,"Source observation reported target time instead of warped file time");
    std::cout<<"Segmented Warp source observation seconds="<<observation->position.inSeconds()<<"\n";
    auto project=request["state"]["project"];put(project,"launcher",parse(R"({"scenes":[{"id":"warp-scene"}],"quantization":"none"})"));
    auto audio=project["tracks"][1];auto slot=copy(clip);slot.getDynamicObject()->removeProperty("startBar");put(slot,"id","warp-slot");
    auto placement=object();put(placement,"sceneId","warp-scene");put(placement,"clip",slot);put(audio,"clipSlots",juce::Array<V>{placement});put(audio,"clips",juce::Array<V>{});
    next(request,101,3,4,"commit");accepted(apply(session,request),4);
    put(command,"sequence",102);put(command,"controlGeneration","2");put(command,"quantize",false);put(command,"command",parse(R"({"kind":"scene","sceneId":"warp-scene"})"));
    accepted(session.call("control",envelope(command)),4);edit->dispatchPendingUpdatesSynchronously();
    for(int block=0;block<144;++block) { juce::MessageManager::getInstance()->runDispatchLoopUntil(3);actual.clear();midi.clear();MixerTestAccess::hosted(session).processBlock(actual,midi); }
    require(std::abs(actual.getRMSLevel(0,0,256)-.2/std::sqrt(2.0))<.025,"Session Warp slot did not play the mapped source interval");
    std::cout<<"SDK segmented Warp source-to-target mapping rendered actual PCM\n";
}
