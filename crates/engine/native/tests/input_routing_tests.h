void testHostedInputRouting() {
    EngineSession session;MixerTestAccess::initialiseHostedInput(session);
    auto request=fixture();auto project=request["state"]["project"];auto main=project["tracks"][0];
    auto first=copy(main);put(first,"id","input-in");put(first,"kind","audio");put(first,"output","main");put(first,"input","external");put(first,"inputChannel","1");put(first,"monitor","in");
    auto second=copy(first);put(second,"id","input-off");put(second,"monitor","off");put(project,"tracks",juce::Array<V>{main,first,second});
    accepted(apply(session,request),0);auto* edit=MixerTestAccess::edit(session);
    auto settle=[&] { edit->dispatchPendingUpdatesSynchronously();edit->getTransport().ensureContextAllocated(true); };
    settle();require(!edit->getTransport().isPlaying(),"Stopped monitoring started transport");
    auto query=object();put(query,"leaseId","mixer-test");put(query,"sessionId","live-mixer-regression");
    const auto registry=session.call("meter_registry",query);
    const auto inputEpoch=static_cast<std::uint32_t>(static_cast<juce::int64>(registry["input"]["deviceEpoch"]));
    require(registry["input"]["entries"].isArray() && registry["input"]["entries"].size()==1,"Hosted input registry lost physical channel mapping");
    require(!session.acquireInputMeter("foreign","live-mixer-regression",inputEpoch),"Foreign lease acquired input bank");
    require(!session.acquireInputMeter("mixer-test","foreign",inputEpoch),"Foreign session acquired input bank");
    auto inputCollector=session.acquireInputMeter("mixer-test","live-mixer-regression",inputEpoch);
    require(inputCollector!=nullptr,"Current session failed input admission");
    require(!session.acquireInputMeter("mixer-test","live-mixer-regression",inputEpoch),"Second input Hub admitted");
    zp_meter_read_handle inputHandle(inputCollector);
    std::uint64_t inputSample=0;
    juce::AudioBuffer<float> audio(2,256);juce::MidiBuffer midi;
    const auto process=[&](float input,float expected) {
        for(int block=0;block<8;++block) {
            audio.clear();midi.clear();std::fill_n(audio.getWritePointer(0),256,input);
            MixerTestAccess::feedHostedInputMeter(session,audio,inputSample);
            MixerTestAccess::hosted(session).processBlock(audio,midi);
            const std::uint32_t slot=0;zp_meter_publication value;
            require(zp_meter_read(&inputHandle,&slot,1,&value,1)==1 && value.current.peak>=std::abs(input),"Stopped input did not reach admitted Hub reader");
            inputSample+=256;
        }
        for(int channel=0;channel<2;++channel)for(int sample=0;sample<256;++sample)require(std::abs(audio.getSample(channel,sample)-expected)<1e-5,"Hosted input monitor output mismatch: "+juce::String(audio.getSample(channel,sample))+" expected "+juce::String(expected));
    };
    process(.25f,.25f);
    put(second,"monitor","in");next(request,1,0,1,"commit");accepted(apply(session,request),1);settle();process(.25f,.5f);
    put(first,"monitor","off");put(second,"monitor","off");next(request,2,1,2,"commit");accepted(apply(session,request),2);settle();process(.25f,0);
    put(first,"monitor","auto");put(first,"armed",true);next(request,3,2,3,"commit");accepted(apply(session,request),3);settle();process(.25f,.25f);
    put(first,"armed",false);next(request,4,3,4,"commit");accepted(apply(session,request),4);settle();process(.25f,0);
    put(first,"monitor","in");next(request,5,4,5,"commit");accepted(apply(session,request),5);settle();process(-.125f,-.125f);
    edit->getTransport().freePlaybackContext();edit->getTransport().ensureContextAllocated(true);process(.25f,.25f);
    require(session.stopFenceFor("mixer-test","live-mixer-regression",1),"Hosted monitoring fence rejected valid owner");process(.25f,0);
    next(request,6,5,6,"commit");require(apply(session,request)["kind"].toString()=="rejected","Stale document restored fenced input");process(.25f,0);
    accepted(apply(session,request,1),6);settle();process(.25f,.25f);
    auto automatic=copy(request);auto automaticTrack=automatic["state"]["project"]["tracks"][1];put(automaticTrack,"monitor","auto");put(automaticTrack,"armed",true);
    auto interval=parse(R"({"id":"input-clip-interval","kind":"audio","startBar":2,"lengthBars":1,"sourceOffsetBars":0,"mute":false,"sourceId":null,"gainDb":0,"audioSettings":{"warp":false,"warpMode":"soundtouch","sourceBpm":120,"transpose":0,"detune":0,"reverse":false,"loop":false,"loopStartBars":0,"loopLengthBars":1,"startMarkerBars":0,"endMarkerBars":1},"fadeInBars":0,"fadeOutBars":0,"fadeInOffsetBars":0,"fadeOutOffsetBars":0,"fadeInCurve":0,"fadeOutCurve":0,"fadeInCurvePosition":0.5,"fadeOutCurvePosition":0.5})");
    put(automaticTrack,"clips",juce::Array<V>{interval});next(automatic,7,6,7,"commit");accepted(apply(session,automatic,1),7);settle();process(.25f,.25f);
    auto command=parse(R"({"protocolVersion":2,"sessionId":"live-mixer-regression","sequence":8,"controlGeneration":"8","control":{"playing":true,"recording":false,"seekBar":2.5,"seekGeneration":1}})");
    auto controlPayload=object();put(controlPayload,"request",command);put(controlPayload,"leaseId","mixer-test");put(controlPayload,"stopToken",1);put(controlPayload,"stopEpoch",1);
    accepted(session.call("control",controlPayload),7);settle();process(.25f,0);
    auto control=command["control"];put(control,"seekBar",3.5);put(control,"seekGeneration",2);put(command,"sequence",9);put(command,"controlGeneration","9");accepted(session.call("control",controlPayload),7);process(.25f,.25f);
    put(control,"playing",false);put(control,"seekBar",2.5);put(control,"seekGeneration",3);put(command,"sequence",10);put(command,"controlGeneration","10");accepted(session.call("control",controlPayload),7);process(.25f,.25f);
    require(MixerTestAccess::edit(session)==edit,"Input mode or arm changes replaced Edit");
    require(session.acquireInputMeter("mixer-test","live-mixer-regression",inputEpoch)==nullptr,
            "Track updates replaced input collector ownership");
    MeterPublication retainedInput;
    require(inputCollector->copyLatest(0,retainedInput) && retainedInput.sessionPeak==.25f,
            "Track graph updates cleared independent input peak history");
}
