#pragma once
V envelope(const V& request) {
    auto out=object();put(out,"request",request);put(out,"leaseId","mixer-test");put(out,"stopToken",0);put(out,"stopEpoch",0);return out;
}
void testNarrowControl() {
    EngineSession session;auto document=fixture();accepted(apply(session,document),0);auto* edit=MixerTestAccess::edit(session);
    const auto before=session.call("diagnostics",object());
    auto command=parse(R"({"protocolVersion":2,"sessionId":"live-mixer-regression","sequence":1,"controlGeneration":"9007199254740993","control":{"playing":false,"recording":false,"seekBar":3,"seekGeneration":1}})");
    auto response=session.call("control",envelope(command));accepted(response,0);require(response["controlGeneration"].toString()=="9007199254740993","Control ACK truncated generation");
    const auto after=session.call("diagnostics",object());
    require(MixerTestAccess::edit(session)==edit && (int)after["arrangementBuilds"]==(int)before["arrangementBuilds"] && (int)after["transportStarts"]==(int)before["transportStarts"] && (int)after["transportSeeks"]==(int)before["transportSeeks"]+1,"Narrow seek prepared/restarted graph or missed seek");
    put(command,"sequence",2);put(command,"controlGeneration","9007199254740994");accepted(session.call("control",envelope(command)),0);
    require((int)session.call("diagnostics",object())["transportSeeks"]==(int)after["transportSeeks"],"Unchanged seekGeneration moved transport");
    next(document,3,0,1,"commit");auto track=document["state"]["project"]["tracks"][1];put(track,"volumeDb",-12);response=apply(session,document);accepted(response,1);
    require(response["controlGeneration"].toString()=="9007199254740994" && MixerTestAccess::request(session).seekBar==3,"Stale document overwrote newer transport control");
    put(command,"sequence",4);put(command,"controlGeneration","0");auto control=command["control"];put(control,"playing",true);put(control,"seekBar",9);put(control,"seekGeneration",2);response=session.call("control",envelope(command));accepted(response,1);
    require(response["controlGeneration"].toString()=="9007199254740994" && !MixerTestAccess::request(session).playing && MixerTestAccess::request(session).seekBar==3,"Old control generation revived stale Play/Seek");
    put(command,"sequence",5);put(command,"controlGeneration","9007199254740995");put(control,"playing",false);put(control,"recording",true);
    require(session.call("control",envelope(command))["kind"].toString()=="rejected","Unsupported recording control was silently accepted");
    auto query=object();put(query,"leaseId","mixer-test");const auto telemetry=session.call("telemetry",query);
    require(telemetry["device"]["state"].toString()=="closed","Stopped/stale controls acquired audio hardware");
    put(query,"sessionId","live-mixer-regression");const auto registry=session.meterRegistry(query);
    const auto owner=std::stoull(registry["graph"]["ownerEpoch"].toString().toStdString());
    auto state=session.acquireIdleMeter("mixer-test","live-mixer-regression",owner);require(state!=nullptr,"Missing stopped control reader");
    zp_meter_read_handle reader(state,owner);zp_stopped_clock stopped{};
    require(zp_meter_read_stopped_clock(&reader,&stopped)==1 && stopped.applied_sequence==4 && stopped.control_generation==9007199254740994ULL,"Control fence diverged from stopped observation");
    put(command,"sequence",6);put(command,"controlGeneration","9007199254740996");put(control,"recording",false);put(control,"seekGeneration",1);put(control,"seekBar",3);put(control,"metronome",true);
    accepted(session.call("control",envelope(command)),1);
    require(edit->clickTrackEnabled.get(),"Metronome control did not enable native click track");
    put(control,"metronome",false);put(command,"sequence",7);put(command,"controlGeneration","9007199254740997");
    accepted(session.call("control",envelope(command)),1);
    require(!edit->clickTrackEnabled.get(),"Metronome control did not disable native click track");
    for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})require((juce::int64)session.call("diagnostics",object())[key]==(juce::int64)after[key],"Control/document reconciliation changed graph or transport");
    auto invalid=command.clone();put(invalid,"project",object());bool rejected=false;try { session.call("control",envelope(invalid)); }catch(const std::exception&) { rejected=true; }require(rejected,"Narrow control decoded a document payload");
}
class MidiProbe final : public te::Plugin {
public:
    explicit MidiProbe(te::PluginCreationInfo info):Plugin(info) {}
    juce::String getName() const override { return "Native test MIDI receiver"; }
    juce::String getSelectableDescription() override { return getName(); }
    juce::String getPluginType() override { return "native-test-midi-probe"; }
    BusLayout getBusses() const override { return BusLayout::singlePassThrough(); }
    int getNumOutputChannelsGivenInputs(int n) override { return std::max(2,n); }
    bool takesMidiInput() override { return true; }
    bool isSynth() override { return true; }
    bool producesAudioWhenNoAudioInput() override { return true; }
    void initialise(const te::PluginInitialisationInfo&) override {}
    void deinitialise() override {}
    void applyToBuffer(const te::PluginRenderContext& context) override {
        ++callbacks;if(!context.bufferForMidiMessages)return;
        for(const auto& message:*context.bufferForMidiMessages) {
            if(message.isAllNotesOff()) { active=false;++panics; }
            if(message.isNoteOnOrOff() && count<static_cast<int>(received.size())) {
                received[static_cast<size_t>(count++)]={message.getNoteNumber(),message.getVelocity(),message.isNoteOn()};active=message.isNoteOn();
            }
        }
        if(context.destBuffer && active)for(int channel=0;channel<context.destBuffer->getNumChannels();++channel)
            for(int frame=0;frame<context.bufferNumSamples;++frame)context.destBuffer->setSample(channel,context.bufferStartSample+frame,.25f);
    }
    struct Received { int pitch=0,velocity=0;bool on=false; };
    std::array<Received,8192> received {};
    int count=0,panics=0,callbacks=0;
    bool active=false;
};
class MidiProbeFactory final : public te::PluginManager::BuiltInType {
public:
    MidiProbeFactory():BuiltInType("native-test-midi-probe") {}
    te::Plugin::Ptr create(te::PluginCreationInfo info) override { return te::Plugin::Ptr(new MidiProbe(info)); }
};
void testStoppedMidiMonitoring() {
    EngineSession session;MixerTestAccess::initialiseHostedInput(session);
    auto document=fixture();auto trackModel=document["state"]["project"]["tracks"][1];
    put(trackModel,"kind","midi");put(trackModel,"monitor","auto");put(trackModel,"armed",true);
    accepted(apply(session,document),0);
    auto& input=MixerTestAccess::midi(session,"audio");auto& edit=*MixerTestAccess::edit(session);auto* track=MixerTestAccess::track(session,"audio");
    edit.engine.getPluginManager().registerBuiltInType(std::make_unique<MidiProbeFactory>());
    auto plugin=edit.getPluginCache().createNewPlugin("native-test-midi-probe",{});track->pluginList.insertPlugin(plugin,track->pluginList.indexOf(&input)+1,nullptr);
    namespace graph=tracktion::graph;graph::PlayHead playhead;graph::PlayHeadState head(playhead);te::ProcessState state(head,edit.tempoSequence);
    te::CreateNodeParams params{state};params.sampleRate=48000;params.blockSize=256;
    auto node=te::createNodeForEdit(edit,params);require(node!=nullptr,"Stopped MIDI graph missing");
    graph::NodePlayer player;player.setNode(std::move(node),48000,256);playhead.play();
    juce::AudioBuffer<float> output(2,256);te::MidiMessageArray midi;
    require(input.enqueue({60,100,true,0}),"Stopped MIDI note rejected");
    playhead.setReferenceSampleRange({0,256});state.update(48000,{0,256},te::ProcessState::UpdateContinuityFlags::yes);
    output.clear();graph::Node::ProcessContext context{256,{0,256},{graph::toBufferView(output),midi}};player.process(context);
    require(output.getRMSLevel(0,0,256)>.01f,"Armed stopped MIDI instrument produced no output");
    require(session.stopFenceFor("mixer-test","live-mixer-regression",1),"Stopped MIDI fence failed");
    playhead.setReferenceSampleRange({256,512});state.update(48000,{256,512},te::ProcessState::UpdateContinuityFlags::yes);
    output.clear();midi.clear();graph::Node::ProcessContext stopped{256,{256,512},{graph::toBufferView(output),midi}};player.process(stopped);
    require(output.getRMSLevel(0,0,256)<1e-6f,"Stopped MIDI output survived its stop fence");
}
void testLiveMidiGraph() {
    EngineSession session;auto document=fixture();auto midiTrack=document["state"]["project"]["tracks"][1];put(midiTrack,"kind","midi");accepted(apply(session,document),0);
    auto& input=MixerTestAccess::midi(session,"audio");auto& edit=*MixerTestAccess::edit(session);auto* track=MixerTestAccess::track(session,"audio");
    edit.engine.getPluginManager().registerBuiltInType(std::make_unique<MidiProbeFactory>());
    auto probePlugin=edit.getPluginCache().createNewPlugin("native-test-midi-probe",{});auto* probe=dynamic_cast<MidiProbe*>(probePlugin.get());require(probe!=nullptr,"Cannot create actual MIDI receiver");
    track->pluginList.insertPlugin(probePlugin,track->pluginList.indexOf(&input)+1,nullptr);
    namespace graph=tracktion::graph;graph::PlayHead playhead;graph::PlayHeadState playheadState(playhead);
    te::ProcessState processState(playheadState,edit.tempoSequence);te::CreateNodeParams params{processState};params.sampleRate=48000;params.blockSize=256;
    auto node=te::createNodeForEdit(edit,params);require(node!=nullptr,"Actual MIDI input graph missing");graph::NodePlayer player;player.setNode(std::move(node),48000,256);playhead.play();
    juce::AudioBuffer<float> audio(2,256);te::MidiMessageArray midi;int64_t start=0;
    const auto process=[&] {
        playhead.setReferenceSampleRange({start,start+256});processState.update(48000,{start,start+256},te::ProcessState::UpdateContinuityFlags::yes);audio.clear();midi.clear();
        graph::Node::ProcessContext context{256,{start,start+256},{graph::toBufferView(audio),midi}};player.process(context);start+=256;
    };
    require(input.enqueue({60,100,true,0}) && input.enqueue({60,0,false,0}),"Short note edges could not enter bounded input");process();
    require(probe->callbacks>0 && probe->count==2 && probe->received[0].on && !probe->received[1].on && probe->received[0].pitch==60 && probe->received[0].velocity==100 && !probe->active,"Actual downstream plugin lost/reordered short note on/off");
    const auto before=session.call("diagnostics",object());
    for(int edge=0;edge<LiveMidiInput::capacity;++edge)require(input.enqueue({61,edge%2?0:127,edge%2==0,0}),"Bounded queue rejected below4096");
    require(!input.enqueue({62,1,true,0}) && MixerTestAccess::pending(session)==4096,"Queue exceeded4096 pending events");
    auto note=parse(R"({"protocolVersion":2,"sessionId":"live-mixer-regression","sequence":1,"note":{"trackId":"audio","noteId":"overflow","pitch":60,"velocity":100,"on":true}})");
    const auto overrun=session.call("note_overrun",envelope(note));require(overrun["code"].toString()=="note-overrun","Overflow did not report explicit note-overrun");process();
    require(probe->panics==16 && !probe->active && MixerTestAccess::pending(session)==0,"Full queue lost guaranteed all-notes-off panic");
    const auto after=session.call("diagnostics",object());for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts","acceptedRevision"})require((juce::int64)before[key]==(juce::int64)after[key],"MIDI panic stopped or revised arrangement");
    require(MixerTestAccess::request(session).sequence==0,"Independent note sequence overwrote document sequence");
    put(note,"sequence",2);auto edge=note["note"];put(edge,"requestedSample","18446744073709551615");require(session.call("note",envelope(note))["kind"].toString()=="rejected","Unsupported future sample silently injected immediately");
    require(session.call("note",envelope(note))["code"].toString()=="protocol","Duplicate note sequence accepted");
    for(int i=0;i<4096;++i)require(input.enqueue({63,i%2?0:100,i%2==0,0}),"Reliable queue lost capacity after panic");process();require(probe->count==4098 && !probe->active,"Actual full graph lost a queued note edge");
    require(input.enqueue({64,100,true,0}),"Unable to enqueue stop-fence note");require(session.stopFenceFor("mixer-test","live-mixer-regression",1),"Active note owner fence failed");process();
    require(probe->count==4098 && probe->panics==32 && !probe->active,"Stop fence allowed queued old note or lost all-notes-off");
    require(!session.stopFenceFor("retired","old-session",2),"Wrong owner fenced live MIDI graph");
    auto panic=object();put(panic,"leaseId","mixer-test");put(panic,"sessionId","live-mixer-regression");put(panic,"throughSequence",10);session.call("all_notes_off",panic);process();
    auto late=parse(R"({"protocolVersion":2,"sessionId":"live-mixer-regression","sequence":9,"note":{"trackId":"audio","noteId":"unknown-off","pitch":65,"velocity":0,"on":false}})");
    auto latePayload=envelope(late);put(latePayload,"stopToken",1);put(latePayload,"stopEpoch",1);
    require(session.call("note",latePayload)["kind"].toString()=="rejected","Delayed pre-panic note survived cutoff after audio ACK");
    NoteRequest held;held.noteId="held-A";held.trackId="audio";held.pitch=65;held.on=true;MixerTestAccess::hold(session,held);require(input.enqueue({65,100,true,1}),"Could not seed held native note");process();const auto heldEdges=probe->count;
    put(late,"sequence",11);require(session.call("note",latePayload)["kind"].toString()=="accepted","Post-cutoff note sequence rejected");process();
    require(probe->active && probe->count==heldEdges && MixerTestAccess::heldCount(session)==1,"Unknown noteId off released another held note with the same pitch");
    auto wrongOwner=panic.clone();put(wrongOwner,"sessionId","stale-session");put(wrongOwner,"throughSequence",100);bool wrongRejected=false;try { session.call("all_notes_off",wrongOwner); }catch(const std::exception&) { wrongRejected=true; }require(wrongRejected,"Stale owner changed note cutoff");
    put(late,"sequence",12);require(session.call("note",latePayload)["kind"].toString()=="accepted","Wrong-owner panic raised active owner's cutoff");
    put(panic,"throughSequence",5);session.call("all_notes_off",panic);process();require(!probe->active,"All-notes-off did not clear actual held voice");
    put(late,"sequence",10);require(session.call("note",latePayload)["kind"].toString()=="rejected","Lower panic high-water regressed cutoff");
    put(late,"sequence",13);require(session.call("note",latePayload)["kind"].toString()=="accepted","Higher note blocked after panic ACK");
    require(input.enqueue({66,100,true,1}),"Cannot enqueue reordered-overrun probe");const auto beforeReordered=probe->count;put(late,"sequence",4);
    require(session.call("note_overrun",latePayload)["code"].toString()=="note-overrun","Reordered overflow skipped owner-valid cleanup");process();require(probe->count==beforeReordered && !probe->active,"Reordered overflow failed to clear pending MIDI");
    put(late,"sequence",14);require(session.call("note",latePayload)["kind"].toString()=="accepted","New notes remained rejected after reordered overflow");
    track->setMute(true);process();process();const auto beforeMutedEdges=probe->count,beforeMutedPanics=probe->panics;
    require(input.enqueue({70,100,true,1}),"Muted producer could not enqueue old-generation note");input.allNotesOff();
    require(input.enqueue({71,99,true,1}) && input.enqueue({71,0,false,1}),"Pending panic falsely rejected new-generation on/off");
    process();require(input.queued()==3 && MixerTestAccess::pending(session)==3,"Muted graph unexpectedly consumed paused live input");
    track->setMute(false);process();
    require(input.queued()==0 && MixerTestAccess::pending(session)==0 && probe->panics==beforeMutedPanics+16,"Unmute failed to drain panic and queued generations");
    require(probe->count==beforeMutedEdges+2 && probe->received[static_cast<size_t>(beforeMutedEdges)].pitch==71 && probe->received[static_cast<size_t>(beforeMutedEdges)].velocity==99 && probe->received[static_cast<size_t>(beforeMutedEdges)].on && !probe->received[static_cast<size_t>(beforeMutedEdges+1)].on && !probe->active,"Unmute replayed old-generation note or lost/reordered new-generation on/off");
    session.beginPendingCall("replacement","new-session");require(session.stopFenceFor("replacement","new-session",2),"Pending replacement stop unrecognized");
    require(session.stopToken.load()==1,"Pending replacement stop muted active graph");
    auto replacement=document.clone();put(replacement,"sessionId","new-session");auto pending=envelope(replacement);put(pending,"leaseId","replacement");put(pending,"stopToken",1);put(pending,"stopEpoch",1);auto* original=MixerTestAccess::edit(session);
    const auto pendingCancelled=session.call("apply",pending);require(pendingCancelled["kind"].toString()=="rejected" && pendingCancelled["code"].toString()=="superseded-open" && MixerTestAccess::edit(session)==original,"Stopped pending replacement did not report superseded-open before mutation");
    session.endPendingCall();require(!session.stopFenceFor("replacement","new-session",3),"Retired pending owner kept stop authority");
    EngineSession unopened;unopened.beginPendingCall("mixer-test","live-mixer-regression");require(unopened.stopFenceFor("mixer-test","live-mixer-regression",1),"First pending owner stop rejected");
    const auto initialCancelled=apply(unopened,document);require(initialCancelled["kind"].toString()=="rejected" && initialCancelled["code"].toString()=="superseded-open" && unopened.call("diagnostics",object())["acceptedRevision"].isVoid(),"Stopped first pending open did not report superseded-open");unopened.endPendingCall();
    auto retried=document.clone();put(retried,"sequence",1);accepted(apply(unopened,retried,1),0);
    require(MixerTestAccess::request(unopened).sequence==1,"Fresh open retry reset its wire sequence");
    put(retried,"sequence",2);const auto replay=apply(unopened,retried,1);require(replay["kind"].toString()=="rejected" && replay["code"].toString()=="protocol" && MixerTestAccess::request(unopened).sequence==1,"Accepted session allowed open replay");
    const auto staleOpening=apply(unopened,document);require(staleOpening["kind"].toString()=="rejected" && staleOpening["code"].toString()=="superseded-open","Initial opening stop-fence branch returned generic rejection");
    auto stoppedDocument=document.clone();next(stoppedDocument,2,0,1,"commit");require(apply(unopened,stoppedDocument)["code"].toString()=="rejected","Non-opening stop-fence rejection incorrectly requested open retry");
    EngineSession recordingOwner;auto recording=document.clone();auto recordingControl=recording["state"]["control"];put(recordingControl,"recording",true);require(apply(recordingOwner,recording)["code"].toString()=="rejected","Generic recording rejection incorrectly requested open retry");
}
void testAuthoredMidiClip() {
    EngineSession session;auto document=fixture();auto project=document["state"]["project"];put(project,"numerator",3);put(project,"denominator",8);
    auto track=project["tracks"][1];put(track,"kind","midi");put(track,"cueOutput",V());put(track,"sends",object());
    auto clip=parse(R"({"id":"authored-midi","kind":"midi","startBar":1,"lengthBars":2,"sourceOffsetBars":0,"mute":false,"loopBars":1,"notes":[{"id":"n","pitch":67,"startBeat":1,"lengthBeats":0.5,"velocity":93}]})");
    put(track,"clips",juce::Array<V>{clip});accepted(apply(session,document),0);
    auto& edit=*MixerTestAccess::edit(session);auto* native=MixerTestAccess::track(session,"audio");
    edit.engine.getPluginManager().registerBuiltInType(std::make_unique<MidiProbeFactory>());
    auto receiver=edit.getPluginCache().createNewPlugin("native-test-midi-probe",{});auto* probe=static_cast<MidiProbe*>(receiver.get());native->pluginList.insertPlugin(receiver,native->pluginList.indexOf(native->getVolumePlugin()),nullptr);
    namespace graph=tracktion::graph;graph::PlayHead playhead;graph::PlayHeadState playheadState(playhead);te::ProcessState state(playheadState,edit.tempoSequence);
    te::CreateNodeParams params{state};params.sampleRate=48000;params.blockSize=256;
    graph::NodePlayer player;player.setNode(te::createNodeForEdit(edit,params),48000,256);playhead.play();session.arrangementAudible.store(true);
    juce::AudioBuffer<float> audio(2,256);te::MidiMessageArray midi;
    std::vector<int> onBlocks,offBlocks;int observed=0;
    for(int64_t start=0;start<72000;start+=256) {
        playhead.setReferenceSampleRange({start,start+256});state.update(48000,{start,start+256},te::ProcessState::UpdateContinuityFlags::yes);audio.clear();midi.clear();
        graph::Node::ProcessContext context{256,{start,start+256},{graph::toBufferView(audio),midi}};player.process(context);
        while(observed<probe->count) { const auto& event=probe->received[static_cast<size_t>(observed++)];require(event.pitch==67,"Authored MIDI pitch changed");if(event.on) { require(event.velocity==93,"Authored MIDI velocity changed");onBlocks.push_back((int)start); }else offBlocks.push_back((int)start); }
    }
    require(onBlocks.size()==2 && offBlocks.size()==2,"Authored MIDI loop did not deliver two complete notes");
    require(std::abs(onBlocks[0]-12000)<256 && std::abs(offBlocks[0]-18000)<256 && std::abs(onBlocks[1]-48000)<256 && std::abs(offBlocks[1]-54000)<256,"MIDI meter beats or loop timing changed");
    require(!probe->active,"Authored MIDI loop left a stuck note");
    auto* retained=native->getClips()[0];auto baseline=copy(document);
    document=copy(document);project=document["state"]["project"];track=project["tracks"][1];clip=track["clips"][0];
    auto note=clip["notes"][0];put(note,"pitch",70);put(note,"velocity",101);put(clip,"sourceOffsetBars",.25);put(clip,"lengthBars",1);
    next(document,1,0,1,"commit");accepted(apply(session,document),1);
    require(MixerTestAccess::edit(session)==&edit && native->getClips()[0]==retained,"MIDI editing replaced Clip or Edit");
    probe->count=0;probe->active=false;playhead.setReferenceSampleRange({0,256});playhead.setPosition(0);player.setNode(te::createNodeForEdit(edit,params),48000,256);session.arrangementAudible.store(true);
    onBlocks.clear();offBlocks.clear();observed=0;
    for(int64_t start=0;start<36000;start+=256) {
        playhead.setReferenceSampleRange({start,start+256});state.update(48000,{start,start+256},te::ProcessState::UpdateContinuityFlags::yes);audio.clear();midi.clear();
        graph::Node::ProcessContext context{256,{start,start+256},{graph::toBufferView(audio),midi}};player.process(context);
        while(observed<probe->count) { const auto& event=probe->received[static_cast<size_t>(observed++)];require(event.pitch==70,"MIDI edit did not change pitch");if(event.on) { require(event.velocity==101,"MIDI edit did not change velocity");onBlocks.push_back((int)start); }else offBlocks.push_back((int)start); }
    }
    require(onBlocks.size()==1 && offBlocks.size()==1 && std::abs(onBlocks[0]-3000)<256 && std::abs(offBlocks[0]-9000)<256,"Trimmed MIDI source offset did not shift scheduled notes");
    auto destination=copy(track);put(destination,"id","midi-destination");put(destination,"clips",juce::Array<V>{});project["tracks"].getArray()->add(destination);
    put(track,"clips",juce::Array<V>{});put(destination,"clips",juce::Array<V>{clip});next(document,2,1,2,"commit");accepted(apply(session,document),2);
    require(retained->getTrack()==MixerTestAccess::track(session,"midi-destination") && MixerTestAccess::edit(session)==&edit,"MIDI cross-track move replaced its owner");
    next(baseline,3,2,3,"commit");accepted(apply(session,baseline),3);
    require(native->getClips()[0]==retained && MixerTestAccess::edit(session)==&edit,"MIDI move undo failed to retain Clip");
    auto muted=copy(baseline);auto mutedTrack=muted["state"]["project"]["tracks"][1];auto mutedClip=mutedTrack["clips"][0];put(mutedClip,"mute",true);
    next(muted,4,3,4,"commit");accepted(apply(session,muted),4);
    probe->count=0;probe->active=false;playhead.setReferenceSampleRange({0,256});playhead.setPosition(0);player.setNode(te::createNodeForEdit(edit,params),48000,256);session.arrangementAudible.store(true);
    for(int64_t start=0;start<36000;start+=256) {
        playhead.setReferenceSampleRange({start,start+256});state.update(48000,{start,start+256},te::ProcessState::UpdateContinuityFlags::yes);audio.clear();midi.clear();
        graph::Node::ProcessContext context{256,{start,start+256},{graph::toBufferView(audio),midi}};player.process(context);
    }
    require(probe->count==0 && native->getClips()[0]==retained,"Muted MIDI clip emitted notes or replaced identity");
    auto deleted=copy(muted);auto deletedTrack=deleted["state"]["project"]["tracks"][1];put(deletedTrack,"clips",juce::Array<V>{});next(deleted,5,4,5,"commit");accepted(apply(session,deleted),5);
    require(MixerTestAccess::edit(session)==&edit && native->getClips().isEmpty(),"MIDI deletion retained clip or replaced Edit");
    next(baseline,6,5,6,"commit");accepted(apply(session,baseline),6);
    require(MixerTestAccess::edit(session)==&edit && native->getClips().size()==1 && !native->getClips()[0]->isMuted(),"MIDI deletion undo did not restore authored clip");
    auto extended=copy(baseline);auto extendedTrack=extended["state"]["project"]["tracks"][1];auto extendedClip=extendedTrack["clips"][0];put(extendedClip,"sourceOffsetBars",-.75);put(extendedClip,"lengthBars",1);
    next(extended,7,6,7,"commit");accepted(apply(session,extended),7);
    probe->count=0;probe->active=false;playhead.setReferenceSampleRange({0,256});playhead.setPosition(0);player.setNode(te::createNodeForEdit(edit,params),48000,256);session.arrangementAudible.store(true);
    onBlocks.clear();offBlocks.clear();observed=0;
    for(int64_t start=0;start<36000;start+=256) {
        playhead.setReferenceSampleRange({start,start+256});state.update(48000,{start,start+256},te::ProcessState::UpdateContinuityFlags::yes);audio.clear();midi.clear();
        graph::Node::ProcessContext context{256,{start,start+256},{graph::toBufferView(audio),midi}};player.process(context);
        while(observed<probe->count) { const auto& event=probe->received[static_cast<size_t>(observed++)];if(event.on)onBlocks.push_back((int)start);else offBlocks.push_back((int)start); }
    }
    require(onBlocks.size()==1 && offBlocks.size()==1 && std::abs(onBlocks[0]-3000)<256 && std::abs(offBlocks[0]-9000)<256,"Negative source offset did not preserve repeating MIDI phase");
}
void testRepeatedMidiMuteTransitions() {
    namespace graph=tracktion::graph;
    for(bool looping:{true,false}) {
        graph::PlayHead playHead;graph::PlayHeadState head(playHead);playHead.play();
        te::tempo::Sequence tempo({{{},120,1}},{{{},4,4,false}},te::tempo::LengthOfOneBeat::isAlwaysACrotchet);
        te::ProcessState process(head,tempo);auto levels=std::make_shared<te::ClipLevel>();juce::ValueTree properties("CLIP");
        levels->dbGain.referTo(properties,te::IDs::volDb,nullptr,0.0f);levels->mute.referTo(properties,te::IDs::mute,nullptr,false);
        juce::MidiMessageSequence sequence;const double unit=looping?1.0:.5;
        sequence.addEvent(juce::MidiMessage::noteOn(1,60,juce::uint8(100)).withTimeStamp(0));
        sequence.addEvent(juce::MidiMessage::noteOff(1,60).withTimeStamp(8*unit));
        sequence.addEvent(juce::MidiMessage::noteOn(1,62,juce::uint8(90)).withTimeStamp(unit));
        sequence.addEvent(juce::MidiMessage::noteOff(1,62).withTimeStamp(9*unit));sequence.updateMatchedPairs();
        std::unique_ptr<graph::Node> node;
        if(looping)node.reset(new te::LoopingMidiNode({sequence},{1,2},false,{te::BeatPosition(),te::BeatPosition::fromBeats(16)},
            {te::BeatPosition(),te::BeatPosition::fromBeats(16)},te::BeatDuration(),te::LiveClipLevel(levels),process,te::EditItemID(),te::QuantisationType(),nullptr,0));
        else node=std::make_unique<tracktion::engine::MidiNode>(std::vector<juce::MidiMessageSequence>{sequence},te::MidiList::TimeBase::seconds,
            juce::Range<int>{1,2},false,juce::Range<double>{0,8},te::LiveClipLevel(levels),process,te::EditItemID());
        graph::LockFreeMultiThreadedNodePlayer player;player.setNumThreads(0);player.setNode(std::move(node),48000,6000);
        juce::AudioBuffer<float> output(1,6000);te::MidiMessageArray midi;
        const auto render=[&](int block) {
            const juce::Range<int64_t> reference{block*6000,(block+1)*6000};process.update(48000,reference,te::ProcessState::UpdateContinuityFlags::yes);
            output.clear();midi.clear();player.process({6000,reference,{graph::toBufferView(output),midi}});
        };
        const auto hasEvent=[&](int pitch,bool on) { return std::any_of(midi.begin(),midi.end(),[&](const auto& message) { return message.getNoteNumber()==pitch && (on?message.isNoteOn():message.isNoteOff()); }); };
        render(0);require(hasEvent(60,true),"MIDI mute fixture did not start the first held note");
        levels->mute=true;render(1);require(hasEvent(60,false),"First MIDI mute did not release its held note");
        levels->mute=false;render(2);render(3);render(4);require(hasEvent(62,true),"Unmuted MIDI fixture did not start the second held note");
        levels->mute=true;render(5);require(hasEvent(62,false),looping?"Second looping MIDI mute left a held note active":"Second classic MIDI mute left a held note active");
    }
    std::cout<<"Repeated MIDI mute: classic and looping nodes release held notes on both mute transitions\n";
}
