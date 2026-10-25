namespace transaction_probe {
namespace graph = tracktion::graph;
class SignalRenderer {
public:
    explicit SignalRenderer(te::Edit& edit):playHeadState(playHead),processState(playHeadState,edit.tempoSequence) {
        player.setNumThreads(0);playHead.play();replace(edit);
    }
    std::unique_ptr<graph::Node> build(te::Edit& edit) {
        te::CreateNodeParams params{processState};params.sampleRate=48000;params.blockSize=256;params.forRendering=true;params.includeLegacyLevelMeters=false;
        return te::createNodeForEdit(edit,params);
    }
    void replace(te::Edit& edit) { player.setNode(build(edit),48000,256); }
    double render(int blocks) {
        for(int block=0;block<blocks;++block) {
            const juce::Range<std::int64_t> range{position,position+256};playHead.setReferenceSampleRange(range);
            processState.update(48000,range,te::ProcessState::UpdateContinuityFlags::yes);
            output.clear();midi.clear();player.process({256,range,{graph::toBufferView(output),midi}});position+=256;
        }
        return output.getRMSLevel(0,0,256);
    }
private:
    graph::PlayHead playHead;
    graph::PlayHeadState playHeadState;
    te::ProcessState processState;
public:
    graph::LockFreeMultiThreadedNodePlayer player;
private:
    juce::AudioBuffer<float> output{2,256};
    te::MidiMessageArray midi;
    std::int64_t position=0;
};
void run() {
    juce::TemporaryFile source(".wav");juce::WavAudioFormat wav;
    auto stream=source.getFile().createOutputStream();require(stream!=nullptr,"Cannot create transaction signal");
    std::unique_ptr<juce::AudioFormatWriter> writer(wav.createWriterFor(stream.release(),48000,1,24,{},0));require(writer!=nullptr,"Cannot write transaction signal");
    juce::AudioBuffer<float> samples(1,192000);std::fill_n(samples.getWritePointer(0),samples.getNumSamples(),.25f);
    require(writer->writeFromAudioSampleBuffer(samples,0,samples.getNumSamples()),"Cannot populate transaction signal");writer.reset();
    EngineSession session;auto request=fadeFixture(source.getFile());
    auto clip=request["state"]["project"]["tracks"][1]["clips"][0];
    for(const auto* key:{"fadeInBars","fadeOutBars","fadeInOffsetBars","fadeOutOffsetBars"})put(clip,key,0);
    auto audio=request["state"]["project"]["tracks"][1];
    put(audio,"devices",parse(R"([{"id":"transaction-utility","kind":"utility","enabled":true,"gainDb":0,"pan":0,"width":100}])"));
    accepted(apply(session,request),0);auto* canonical=MixerTestAccess::edit(session);
    auto* fader=MixerTestAccess::track(session,"audio")->getVolumePlugin();
    {
        SignalRenderer active(*canonical);const auto baseline=active.render(64);
        fader->setVolumeDb(-6.020599913f);const auto beforePublication=active.render(64);
        require(std::abs(baseline-.25)<1e-5 && std::abs(beforePublication-.125)<1e-5,"Cannot measure live Edit parameter visibility");
        std::cout<<"Live Edit model: old graph PCM "<<baseline<<" -> "<<beforePublication<<" before replacement publication\n";
    }
    fader->setVolumeDb(0);
    auto previous=MixerTestAccess::candidate(session,decode(request));
    decltype(previous) candidate,retained;
    SignalRenderer active(*previous->edit);const auto baseline=active.render(64);
    auto changed=copy(request);auto changedTrack=changed["state"]["project"]["tracks"][1];put(changedTrack,"volumeDb",-6.020599913);
    candidate=MixerTestAccess::candidate(session,decode(changed));
    const auto whilePrepared=active.render(32);
    require(std::abs(baseline-.25)<1e-5 && std::abs(whilePrepared-.25)<1e-5,"Candidate Edit mutation leaked into old PCM");
    const bool recreated=previous->devices.at("transaction-utility").get()!=candidate->devices.at("transaction-utility").get();
    auto graph=active.build(*candidate->edit);beginAllocationFailure(0);bool rejected=false;
    try { active.player.setNode(std::move(graph),48000,256); }catch(const std::bad_alloc&) { rejected=true; }
    const bool injected=endAllocationFailure();require(injected && rejected,"Candidate allocation failure was not exercised");
    const auto afterRejection=active.render(32);require(std::abs(afterRejection-.25)<1e-5,"Rejected candidate interrupted old PCM");
    active.replace(*candidate->edit);const auto adopted=active.render(64);
    require(std::abs(adopted-.125)<1e-5 && MixerTestAccess::edit(session)==canonical,"Candidate did not adopt on the original renderer clock");
    std::cout<<"Isolated Edit model: old PCM "<<baseline<<" -> prepared "<<whilePrepared<<" -> rejected "<<afterRejection<<" -> adopted "<<adopted<<"; unchanged Device recreated="<<recreated<<'\n';
    auto retainedRequest=copy(changed);auto retainedDevice=retainedRequest["state"]["project"]["tracks"][1]["devices"][0];put(retainedDevice,"gainDb",-6.020599913);
    retained=MixerTestAccess::candidate(session,decode(retainedRequest));
    auto* oldProcessor=dynamic_cast<BuiltinDevice*>(candidate->devices.at("transaction-utility").get());
    auto* newProcessor=dynamic_cast<BuiltinDevice*>(retained->devices.at("transaction-utility").get());
    require(oldProcessor && newProcessor && newProcessor->reuseProcessingStateFrom(*oldProcessor),"Candidate did not retain the compatible processor");
    auto retainedGraph=active.build(*retained->edit);
    const auto retainedPreparation=active.render(32);require(std::abs(retainedPreparation-.125)<1e-5,"Retained processor preparation leaked candidate parameters");
    active.player.setNode(std::move(retainedGraph),48000,256);const auto retainedAdoption=active.render(64);
    require(std::abs(retainedAdoption-.0625)<1e-5,"Retained processor candidate did not adopt its isolated gain");
    std::cout<<"Retained processing model: old PCM "<<retainedPreparation<<" -> adopted "<<retainedAdoption<<", one renderer clock and separate wrapper parameters\n";
    testBuiltinProcessingStateReuse(*canonical);
}
}
