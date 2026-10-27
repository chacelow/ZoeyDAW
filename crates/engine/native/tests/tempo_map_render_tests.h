void testTempoMapRendering() {
    constexpr int rate=48000,frames=rate*6;
    juce::TemporaryFile source(".wav"),output(".wav");juce::WavAudioFormat format;
    auto stream=source.getFile().createOutputStream();zp::require(stream!=nullptr,"Cannot create tempo map audio");
    std::unique_ptr<juce::AudioFormatWriter> writer(format.createWriterFor(stream.release(),rate,1,24,{},0));
    zp::require(writer!=nullptr,"Cannot encode tempo map audio");juce::AudioBuffer<float> block(1,4096);
    for(int offset=0;offset<frames;offset+=4096) {
        const int count=std::min(4096,frames-offset);
        for(int index=0;index<count;++index)block.setSample(0,index,.1f*(1+((offset+index)/rate)));
        zp::require(writer->writeFromAudioSampleBuffer(block,0,count),"Cannot write tempo map PCM");
    }
    writer.reset();
    auto settings=obj({{"warp",false},{"warpMode","re-pitch"},{"sourceBpm",120},{"transpose",0},{"detune",0},{"reverse",false},{"loop",false},{"loopStartBars",0},{"loopLengthBars",3},{"startMarkerBars",0},{"endMarkerBars",3}});
    auto clip=obj({{"id","tempo-audio"},{"kind","audio"},{"startBar",1},{"lengthBars",3},{"sourceOffsetBars",0},{"mute",false},{"sourceId","tempo-source"},{"gainDb",0},{"audioSettings",settings},{"fadeInBars",0},{"fadeOutBars",0},{"fadeInOffsetBars",0},{"fadeOutOffsetBars",0},{"fadeInCurve",0},{"fadeOutCurve",0},{"fadeInCurvePosition",.5},{"fadeOutCurvePosition",.5}});
    auto audio=track("audio","audio","main");zp::put(audio,"clips",juce::Array<V>{clip});
    auto metadata=obj({{"id","tempo-source"},{"uri",source.getFile().getFullPathName()},{"sha256",juce::String::repeatedString("0",64)},{"frames",frames},{"sampleRate",rate},{"channels",1}});
    auto project=obj({{"bpm",120},{"numerator",4},{"denominator",4},
        {"loop",obj({{"enabled",false},{"startBar",1},{"endBar",4}})},
        {"sources",juce::Array<V>{metadata}},
        {"tracks",juce::Array<V>{audio,track("main","main","external")}}});
    zp::put(project,"tempo",juce::Array<V>{obj({{"bar",1},{"bpm",120}}),obj({{"bar",2},{"bpm",240}})});
    auto control=obj({{"playing",false},{"recording",false},{"seekBar",3},{"seekGeneration",0}});
    auto request=obj({{"protocolVersion",2},{"sessionId","tempo-map-render"},{"sequence",0},{"baseRevision",0},{"revision",0},{"stage","open"},{"editId",V()},{"controlGeneration","0"},{"state",obj({{"project",project},{"control",control}})}});
    const auto decoded=zp::decode(request);zp::require(std::abs(decoded.barTime(4)-4)<1e-12 && std::abs(decoded.timeBar(3)-3)<1e-12,"Tempo map time conversion is not invertible");
    char* error=nullptr;std::unique_ptr<zp_session,decltype(&zp_destroy)> session(zp_create(&error),zp_destroy);
    if(!session) { auto message=error?juce::String::fromUTF8(error):"No tempo engine";zp_free(error);throw std::runtime_error(message.toStdString()); }
    zp::require(invoke(session.get(),"apply",obj({{"request",request},{"leaseId","tempo-map-render"},{"stopToken",0},{"stopEpoch",0}}))["kind"].toString()=="accepted","Tempo map request rejected");
    const auto render=[&](bool warp) {
        juce::TemporaryFile destination(".wav");
        invoke(session.get(),"render",obj({{"path",destination.getFile().getFullPathName()},{"seconds",5},{"sampleRate",rate}}));
        std::unique_ptr<juce::AudioFormatReader> reader(format.createReaderFor(destination.getFile().createInputStream().release(),true));
        zp::require(reader!=nullptr,"Cannot read tempo map render");
        for(const auto [seconds,expected]:std::initializer_list<std::pair<double,double>>{{.5,.1},{2.25,.3},{2.75,warp?.4:.3},{3.25,warp?.5:.4},{4.5,0}}) {
            juce::AudioBuffer<float> actual(2,256);zp::require(reader->read(&actual,0,256,(juce::int64)(seconds*rate),true,true),"Cannot inspect tempo samples");
            double mean=0;for(int i=0;i<256;++i)mean+=actual.getSample(0,i);mean/=256;
            zp::require(std::abs(mean-expected)<.025,"Tempo map PCM mismatch at "+juce::String(seconds)+" warp="+juce::String(int(warp))+": "+juce::String(mean));
        }
    };
    render(false);
    zp::put(settings,"warp",true);zp::put(request,"stage","commit");zp::put(request,"sequence",1);zp::put(request,"revision",1);
    zp::require(invoke(session.get(),"apply",obj({{"request",request},{"leaseId","tempo-map-render"},{"stopToken",0},{"stopEpoch",0}}))["kind"].toString()=="accepted","Warp tempo map update rejected");
    render(true);
    juce::Array<V> ramp;
    for(int step=0;step<=32;++step)ramp.add(obj({{"bar",1+step/16.0},{"bpm",120+step*3.75}}));
    zp::put(project,"tempo",ramp);zp::put(request,"sequence",2);zp::put(request,"baseRevision",1);zp::put(request,"revision",2);
    zp::require(invoke(session.get(),"apply",obj({{"request",request},{"leaseId","tempo-map-render"},{"stopToken",0},{"stopEpoch",0}}))["kind"].toString()=="accepted","Tempo ramp update rejected");
    const auto rampMapping=zp::decode(request);
    juce::TemporaryFile rampOutput(".wav");
    invoke(session.get(),"render",obj({{"path",rampOutput.getFile().getFullPathName()},{"seconds",5},{"sampleRate",rate}}));
    std::unique_ptr<juce::AudioFormatReader> rampReader(format.createReaderFor(rampOutput.getFile().createInputStream().release(),true));
    zp::require(rampReader!=nullptr,"Cannot read tempo ramp output");
    for(const double seconds:{.3,.8,1.3,1.8,2.3,3.2}) {
        juce::AudioBuffer<float> actual(2,256);zp::require(rampReader->read(&actual,0,256,(juce::int64)(seconds*rate),true,true),"Cannot inspect tempo ramp PCM");
        double mean=0;for(int sample=0;sample<256;++sample)mean+=actual.getSample(0,sample);mean/=256;
        const double sourceSeconds=(rampMapping.timeBar(seconds)-1)*2;
        const double expected=.1*(1+std::floor(sourceSeconds));
        zp::require(std::abs(mean-expected)<.025,"Continuous tempo ramp did not drive warped source position: "+juce::String(mean)+" expected "+juce::String(expected));
    }
    std::cout<<"Tempo map exact bar/time inversion, unwarped original speed, warped source progression and clip end PCM passed\n";
}
