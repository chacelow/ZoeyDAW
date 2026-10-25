class TransportBoundaryProbeNode final : public tracktion::graph::Node {
public:
    TransportBoundaryProbeNode(std::unique_ptr<Node> source,std::function<void()>& action,int latencySamples=0)
        : input(std::move(source)), action(action),latencySamples(latencySamples) {
        setOptimisations({tracktion::graph::ClearBuffers::no,tracktion::graph::AllocateAudioBuffer::no});
    }
    tracktion::graph::NodeProperties getNodeProperties() override {
        auto properties=input->getNodeProperties();properties.nodeID=0;properties.latencyNumSamples+=latencySamples;return properties;
    }
    std::vector<Node*> getDirectInputNodes() override { return {input.get()}; }
    bool isReadyToProcess() override { return input->hasProcessed(); }
private:
    void prefetchBlock(juce::Range<int64_t>) override {
        if(action) { auto current=std::move(action);action={};current(); }
    }
    void process(ProcessContext& context) override {
        auto output=input->getProcessedOutput();setAudioOutput(input.get(),output.audio);
        context.buffers.midi.clear();context.buffers.midi.mergeFrom(output.midi);
    }
    std::unique_ptr<Node> input;
    std::function<void()>& action;
    int latencySamples=0;
};

void testTransportClockAdoption() {
    EngineSession session;MixerTestAccess::initialiseHostedInput(session,0);
    MixerTestAccess::audioManager(session).addAudioCallback(&MixerTestAccess::clock(session));
    auto request=fixture();accepted(apply(session,request),0);
    auto& edit=*MixerTestAccess::edit(session);auto& transport=edit.getTransport();
    edit.dispatchPendingUpdatesSynchronously();transport.ensureContextAllocated(true);
    auto* context=transport.getCurrentPlaybackContext();require(context!=nullptr,"Missing hosted clock context");
    std::function<void()> atBoundary;
    context->setInsertOptionalLastStageNodeForDeviceCallback([&](te::OutputDevice&,const te::CreateNodeParams&,std::unique_ptr<tracktion::graph::Node> node) {
        return std::make_unique<TransportBoundaryProbeNode>(std::move(node),atBoundary,1024);
    });
    context->reallocate();
    auto command=parse(R"({"protocolVersion":2,"sessionId":"live-mixer-regression","sequence":1,"controlGeneration":"9007199254740993","control":{"playing":true,"recording":false,"seekBar":3,"seekGeneration":1}})");
    accepted(session.call("control",envelope(command)),0);
    auto query=object();put(query,"leaseId","mixer-test");put(query,"sessionId","live-mixer-regression");
    const auto registry=session.call("meter_registry",query);
    auto collector=session.acquireMeterGraph("mixer-test","live-mixer-regression",(std::uint32_t)(int)registry["deviceEpoch"],
                                             (std::uint32_t)(int)registry["generation"],(std::uint32_t)(int)registry["registryRevision"]);
    require(collector!=nullptr,"Could not acquire the hosted clock reader");
    zp_meter_read_handle reader(collector,session.sourceObservationState(),"live-mixer-regression");
    juce::AudioBuffer<float> audio(2,256);juce::MidiBuffer midi;
    const auto process=[&](int blocks=1) { for(int block=0;block<blocks;++block) { audio.clear();midi.clear();MixerTestAccess::hosted(session).processBlock(audio,midi); } };
    const auto clock=[&] { zp_meter_clock value{};require(zp_meter_read_clock(&reader,&value)==1,"Audio graph did not publish a new clock block");return value; };
    process(16);const auto first=clock();
    require(first.control_valid==1 && first.owner_epoch!=0 && first.control_generation==9007199254740993ULL
            && first.applied_sequence==1,"Processed transport clock has no adopted control identity");
    require(first.bar>3 && first.bar<3.1 && std::abs(first.bars_per_second-.5)<1e-9,"Adopted clock lost actual musical coordinates");
    require(context->getLatencySamples()>=1024,"Latency probe was not included in the actual graph");
    const double audible=1+context->getAudibleTimelineTime().inSeconds()/2;
    require(first.audible_valid==1 && std::abs(first.audible_bar-audible)<1e-8
            && std::abs(first.audible_bars_per_second-.5)<1e-9,"Clock did not observe this block's latency-compensated position");
    require(std::abs(first.bar-first.audible_bar-context->getLatencySamples()/48000.0*.5)<1e-8,
            "Clock paired a prior block's audible position with current rendered coordinates");
    process();
    auto control=command["control"];put(control,"seekBar",9);put(control,"seekGeneration",2);
    put(command,"sequence",2);put(command,"controlGeneration","9007199254740994");
    accepted(session.call("control",envelope(command)),0);
    const auto queued=clock();
    require(queued.control_valid==1 && queued.control_generation==first.control_generation
            && queued.applied_sequence==1 && queued.bar<9,"Accepted seek relabelled an older queued audio block");
    process();const auto adopted=clock();
    require(adopted.control_valid==1 && adopted.control_generation==9007199254740994ULL && adopted.applied_sequence==2
            && adopted.bar>=9 && adopted.bar<9.01,"Seek identity did not follow the block which actually processed it");
    require(adopted.audible_valid==1 && adopted.audible_bar>=9 && adopted.audible_bar<9.01,
            "Audible clock did not follow the processed seek boundary");
    std::atomic<bool> entered{false},controlDone{false};
    atBoundary=[&] {
        entered.store(true,std::memory_order_release);
        const auto until=std::chrono::steady_clock::now()+std::chrono::milliseconds(100);
        while(!controlDone.load(std::memory_order_acquire) && std::chrono::steady_clock::now()<until)std::this_thread::yield();
    };
    std::exception_ptr audioFailure;
    std::thread audioThread([&] { try { process(); }catch(...) { audioFailure=std::current_exception();entered.store(true,std::memory_order_release); } });
    struct JoinAudio {
        std::thread& thread;std::atomic<bool>& done;
        ~JoinAudio() { done.store(true,std::memory_order_release);if(thread.joinable())thread.join(); }
    } joinAudio{audioThread,controlDone};
    const auto until=std::chrono::steady_clock::now()+std::chrono::seconds(2);
    while(!entered.load(std::memory_order_acquire)) { require(std::chrono::steady_clock::now()<until,"Audio thread did not reach the clock boundary");std::this_thread::yield(); }
    put(control,"seekBar",13);put(control,"seekGeneration",3);put(command,"sequence",3);put(command,"controlGeneration","9007199254740995");
    accepted(session.call("control",envelope(command)),0);controlDone.store(true,std::memory_order_release);audioThread.join();
    if(audioFailure)std::rethrow_exception(audioFailure);
    const auto racing=clock();
    require(racing.control_valid==0 || racing.control_generation<9007199254740995ULL
            || (racing.bar>=13 && racing.bar<13.01),"A concurrent accepted seek was attached to older processed coordinates");
    process();const auto concurrent=clock();
    require(concurrent.control_valid==1 && concurrent.control_generation==9007199254740995ULL
            && concurrent.applied_sequence==3 && concurrent.bar>=13 && concurrent.bar<13.01,"Concurrent seek was not observed after audio dispatch");
    auto project=request["state"]["project"];put(project,"bpm",180);next(request,4,0,1,"commit");accepted(apply(session,request),1);
    process(4);const auto tempoClock=clock();
    require(tempoClock.control_valid==1 && tempoClock.control_generation==concurrent.control_generation
            && tempoClock.applied_sequence==4 && tempoClock.bar>=concurrent.bar
            && std::abs(tempoClock.bars_per_second-.75)<1e-9,"BPM update broke adopted transport identity or its processed rate");
    require(tempoClock.audible_valid==1 && std::abs(tempoClock.audible_bar-(1+context->getAudibleTimelineTime().inSeconds()*.75))<1e-8
            && std::abs(tempoClock.audible_bars_per_second-.75)<1e-9,"Audible clock used a prior frame or tempo after BPM adoption");
    auto invalid=command.clone();put(invalid,"sequence",5);put(invalid,"controlGeneration","9007199254740996");
    auto invalidControl=invalid["control"];put(invalidControl,"seekBar",-1);bool rejected=false;
    try { session.call("control",envelope(invalid)); }catch(const std::exception&) { rejected=true; }
    require(rejected,"Invalid seek was accepted");process();const auto afterRejected=clock();
    require(afterRejected.control_valid==1 && afterRejected.control_generation==tempoClock.control_generation
            && afterRejected.applied_sequence==4,"Rejected seek changed the audio clock identity");
    std::cout<<"Audio clock adoption: exact u64 identity, pending seek race, processed tempo and rejection fences passed\n";
}
