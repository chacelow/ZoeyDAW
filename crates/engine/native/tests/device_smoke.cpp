#include "playback_bridge.h"
#include "device_test_support.h"
#include <juce_events/juce_events.h>
#include <juce_audio_formats/juce_audio_formats.h>
#include <cmath>
#include <iostream>
#include <memory>
#include <stdexcept>
namespace {
using V=juce::var;
void require(bool condition,const juce::String& message) { if(!condition)throw std::runtime_error(message.toStdString()); }
V obj(std::initializer_list<std::pair<const char*,V>> properties) {
    V value(new juce::DynamicObject());for(auto& [key,item]:properties)value.getDynamicObject()->setProperty(key,item);return value;
}
void set(V& value,const char* key,const V& item) { value.getDynamicObject()->setProperty(key,item); }
V invoke(zp_session* session,const char* operation,const V& payload) {
    char* raw=zp_call(session,operation,juce::JSON::toString(payload,true).toRawUTF8());require(raw!=nullptr,"Native response allocation failed");
    auto envelope=juce::JSON::parse(juce::String::fromUTF8(raw));zp_free(raw);
    require((bool)envelope["ok"],envelope["error"].toString());return envelope["value"];
}
V diagnostics(zp_session* session) { return invoke(session,"diagnostics",obj({})); }
void waitFrames(zp_session* session,juce::int64 frames) {
    auto initial=diagnostics(session);const auto target=(juce::int64)initial["renderedFrames"]+frames;
    const auto deadline=juce::Time::getMillisecondCounterHiRes()+2000+frames/48.0;
    while((juce::int64)diagnostics(session)["renderedFrames"]<target) {
        require(juce::Time::getMillisecondCounterHiRes()<deadline,"Actual device sample clock stopped");
        juce::MessageManager::getInstance()->runDispatchLoopUntil(10);
    }
}
void expectFailure(zp_session* session,const char* operation,const V& payload,const char* message) {
    bool failed=false;try { invoke(session,operation,payload); }catch(const std::exception&) { failed=true; }require(failed,message);
}
void inspectCapture(const juce::File& file,bool silentTail) {
    juce::AudioFormatManager formats;formats.registerBasicFormats();std::unique_ptr<juce::AudioFormatReader> reader(formats.createReaderFor(file));
    require(reader && reader->lengthInSamples>=4096,"Actual native capture contains too few samples");
    juce::AudioBuffer<float> buffer((int)reader->numChannels,4096);float peak=0;
    for(juce::int64 position=0;position<reader->lengthInSamples;position+=4096) {
        const int count=(int)std::min<juce::int64>(4096,reader->lengthInSamples-position);
        require(reader->read(&buffer,0,count,position,true,true),"Cannot inspect capture samples");peak=std::max(peak,buffer.getMagnitude(0,count));
    }
    require(peak>1e-5f,"Actual native capture is silent throughout");
    if(silentTail) {
        require(reader->read(&buffer,0,2048,reader->lengthInSamples-2048,true,true),"Cannot inspect post-fence capture");
        require(buffer.getMagnitude(0,2048)<=1e-6f,"Urgent generation/stop fence did not silence actual rendered output");
    }
}
void inspectSilentRange(const juce::File& file,juce::int64 begin,juce::int64 end,const char* scenario) {
    juce::AudioFormatManager formats;formats.registerBasicFormats();std::unique_ptr<juce::AudioFormatReader> reader(formats.createReaderFor(file));
    require(reader && end>begin && reader->lengthInSamples>=end,juce::String(scenario)+" capture range was not retained");
    juce::AudioBuffer<float> block((int)reader->numChannels,4096);
    for(auto position=begin;position<end;position+=4096) {
        const int count=(int)std::min<juce::int64>(4096,end-position);require(reader->read(&block,0,count,position,true,true),"Cannot inspect silence capture");
        require(block.getMagnitude(0,count)<=1e-6f,juce::String(scenario)+" did not silence capture at frame "+juce::String(position)+" in ["+juce::String(begin)+", "+juce::String(end)+"); peak="+juce::String(block.getMagnitude(0,count),9));
    }
}
double rangeRms(const juce::File& file,juce::int64 begin,juce::int64 end) {
    juce::AudioFormatManager formats;formats.registerBasicFormats();std::unique_ptr<juce::AudioFormatReader> reader(formats.createReaderFor(file));
    require(reader && end>begin && reader->lengthInSamples>=end,"Live mixer capture range was not retained");
    juce::AudioBuffer<float> block((int)reader->numChannels,4096);double energy=0;
    for(auto position=begin;position<end;position+=4096) {
        const int count=(int)std::min<juce::int64>(4096,end-position);require(reader->read(&block,0,count,position,true,true),"Cannot inspect live mixer capture");
        for(int channel=0;channel<block.getNumChannels();++channel)for(int i=0;i<count;++i) { const double sample=block.getSample(channel,i);energy+=sample*sample; }
    }
    return std::sqrt(energy/((end-begin)*block.getNumChannels()));
}
}
int main(int argc,char** argv) {
    try {
        require(argc==4,"Usage: zoeydaw_playback_smoke REQUEST.json NEW_CAPTURE.wav SECONDS (real output; also writes raw/sync preview WAVs)");
        juce::ScopedJuceInitialiser_GUI gui;
        zp::ScopedAudioPreferences preferences;
        auto request=juce::JSON::parse(juce::File::getCurrentWorkingDirectory().getChildFile(argv[1]));require(request.isObject() && (int)request["protocolVersion"]==2,"Expected strict v2 BackendDocumentRequest JSON");
        auto control=request["state"]["control"],project=request["state"]["project"];
        const double seconds=juce::String(argv[3]).getDoubleValue(),bpm=(double)project["bpm"];
        const double barSeconds=(double)project["numerator"]*4/(double)project["denominator"]*60/bpm;
        require(seconds>0 && seconds<=60 && barSeconds>0 && barSeconds<=10,"Smoke requires seconds in (0,60] and bar duration at most 10 seconds");
        auto* sources=project["sources"].getArray();require(sources && !sources->isEmpty(),"Smoke fixture needs a real registered audio source");
        const auto source=sources->getReference(0);const auto sourcePath=source["uri"].toString();
        require((double)source["frames"]/(double)source["sampleRate"]>=1,"Smoke audio source must be at least one second long");
        double sourceBpm=bpm;
        for(auto& track:*project["tracks"].getArray())for(auto& clip:*track["clips"].getArray())if(clip["kind"].toString()=="audio" && clip["sourceId"]==source["id"])sourceBpm=(double)clip["audioSettings"]["sourceBpm"];
        for(auto& track:*project["tracks"].getArray())if(track["kind"].toString()=="main")set(track,"volumeDb",-18);
        auto midiTrack=project["tracks"][0].clone();set(midiTrack,"id","device-smoke-live-midi");set(midiTrack,"kind","midi");
        juce::String mainId;for(auto& track:*project["tracks"].getArray())if(track["kind"].toString()=="main")mainId=track["id"].toString();
        set(midiTrack,"output",mainId);set(midiTrack,"input","none");set(midiTrack,"monitor","off");set(midiTrack,"mute",false);set(midiTrack,"solo",false);set(midiTrack,"armed",false);set(midiTrack,"cueOutput",V());set(midiTrack,"clips",juce::Array<V>());set(midiTrack,"automation",juce::Array<V>());set(midiTrack,"sends",obj({}));set(midiTrack,"childTrackIds",juce::Array<V>());project["tracks"].getArray()->add(midiTrack);
        auto destinationTrack=midiTrack.clone();set(destinationTrack,"id","device-smoke-destination");set(destinationTrack,"kind","audio");set(destinationTrack,"volumeDb",-24);project["tracks"].getArray()->add(destinationTrack);
        auto sendReturn=midiTrack.clone();set(sendReturn,"id","device-smoke-return");set(sendReturn,"kind","return");set(sendReturn,"volumeDb",0);project["tracks"].getArray()->add(sendReturn);
        auto groupTrack=midiTrack.clone();set(groupTrack,"id","device-smoke-group");set(groupTrack,"kind","group");project["tracks"].getArray()->add(groupTrack);
        set(control,"playing",false);set(control,"recording",false);set(request,"stage","open");set(request,"sequence",0);set(request,"baseRevision",0);set(request,"revision",0);
        char* error=nullptr;std::unique_ptr<zp_session,decltype(&zp_destroy)> session(zp_create(&error),zp_destroy);
        if(!session) { auto message=error?juce::String::fromUTF8(error):"Cannot create native engine";zp_free(error);throw std::runtime_error(message.toStdString()); }
        juce::String lease="device-smoke";
        int sequenceOffset=0;
        auto apply=[&](int sequence,int base,int revision,const char* stage) {
            set(request,"sequence",sequence+sequenceOffset);set(request,"baseRevision",base);set(request,"revision",revision);set(request,"stage",stage);set(request,"controlGeneration",juce::String(sequence+sequenceOffset));
            auto result=invoke(session.get(),"apply",obj({{"request",request},{"leaseId",lease},{"stopToken",0},{"stopEpoch",0}}));require(result["kind"].toString()=="accepted","Native apply rejected smoke stage");
        };
        auto sendControl=[&](int sequence) {
            auto command=obj({{"protocolVersion",2},{"sessionId",request["sessionId"]},{"sequence",sequence+sequenceOffset},{"controlGeneration",juce::String(sequence+sequenceOffset)},{"control",control}});
            auto result=invoke(session.get(),"control",obj({{"request",command},{"leaseId",lease},{"stopToken",0},{"stopEpoch",0}}));require(result["kind"].toString()=="accepted","Native narrow control rejected smoke stage");
        };
        auto telemetry=[&] { auto sample=invoke(session.get(),"telemetry",obj({{"leaseId",lease}}));require(sample["telemetry"].isObject(),"Current playback owner lost telemetry");return sample["telemetry"]; };
        auto output=juce::File::getCurrentWorkingDirectory().getChildFile(argv[2]);
        apply(0,0,0,"open");invoke(session.get(),"capture_begin",obj({{"seconds",120}}));
        const auto beforePlay=diagnostics(session.get());set(control,"playing",true);sendControl(1);
        const auto afterPlay=diagnostics(session.get());for(const auto* key:{"arrangementBuilds","transportSeeks"})require((juce::int64)beforePlay[key]==(juce::int64)afterPlay[key],"Narrow Play rebuilt or sought arrangement");
        auto device=invoke(session.get(),"devices",obj({}));const double rate=(double)device["sampleRate"];require(rate>0,"No actual device sample rate");
        std::cout<<"After play apply: "<<juce::JSON::toString(diagnostics(session.get()),true)<<std::endl;
        waitFrames(session.get(),(juce::int64)(seconds*rate));auto initialTelemetry=telemetry();
        const auto beforeNotes=diagnostics(session.get());
        auto edge=obj({{"trackId","device-smoke-live-midi"},{"noteId","short-live-note"},{"pitch",60},{"velocity",100},{"on",true}});
        for(int sequence=1;sequence<=2;++sequence) {
            set(edge,"on",sequence==1);auto note=obj({{"protocolVersion",2},{"sessionId",request["sessionId"]},{"sequence",sequence},{"note",edge}});
            require(invoke(session.get(),"note",obj({{"request",note},{"leaseId",lease},{"stopToken",0},{"stopEpoch",0}}))["kind"].toString()=="accepted","Actual native MIDI edge rejected");
        }
        waitFrames(session.get(),4096);const auto afterNotes=diagnostics(session.get());require((int)afterNotes["deliveredNoteEdges"]==2 && (int)afterNotes["pendingNotes"]==0,"Real device graph dropped short MIDI edges");
        invoke(session.get(),"all_notes_off",obj({{"leaseId",lease},{"sessionId",request["sessionId"]},{"throughSequence",3}}));waitFrames(session.get(),4096);const auto afterPanic=diagnostics(session.get());
        require((int)afterPanic["deliveredNotePanics"]>0 && (bool)afterPanic["arrangementPlaying"],"All-notes-off stopped transport or missed actual MIDI callback");
        for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})require((juce::int64)beforeNotes[key]==(juce::int64)afterPanic[key],"MIDI edge/panic rebuilt or moved transport");
        require((int)telemetry()["appliedSequence"]==1,"Independent MIDI sequence changed document/control fence");
        set(edge,"on",true);auto delayed=obj({{"protocolVersion",2},{"sessionId",request["sessionId"]},{"sequence",3},{"note",edge}});
        require(invoke(session.get(),"note",obj({{"request",delayed},{"leaseId",lease},{"stopToken",0},{"stopEpoch",0}}))["kind"].toString()=="rejected","Delayed note survived panic high-water after audio ACK");
        for(int sequence=4;sequence<=5;++sequence) { set(edge,"on",sequence==4);set(delayed,"sequence",sequence);require(invoke(session.get(),"note",obj({{"request",delayed},{"leaseId",lease},{"stopToken",0},{"stopEpoch",0}}))["kind"].toString()=="accepted","New post-cutoff MIDI edge rejected"); }
        waitFrames(session.get(),4096);require((int)diagnostics(session.get())["deliveredNoteEdges"]==4,"Post-cutoff MIDI edges did not reach actual device graph");
        invoke(session.get(),"all_notes_off",obj({{"leaseId",lease},{"sessionId",request["sessionId"]},{"throughSequence",6}}));
        for(int sequence=7;sequence<=8;++sequence) { set(edge,"on",sequence==7);set(delayed,"sequence",sequence);require(invoke(session.get(),"note",obj({{"request",delayed},{"leaseId",lease},{"stopToken",0},{"stopEpoch",0}}))["kind"].toString()=="accepted","Pending audio panic falsely rejected new-generation native MIDI"); }
        waitFrames(session.get(),4096);require((int)diagnostics(session.get())["deliveredNoteEdges"]==6 && (bool)telemetry()["playing"],"Immediate post-panic MIDI edges were dropped or stopped playback");
        std::cout<<"Actual initial playback: "<<juce::JSON::toString(initialTelemetry,true)<<std::endl;
        std::cout<<"After initial device frames: "<<juce::JSON::toString(diagnostics(session.get()),true)<<std::endl;
        require((bool)initialTelemetry["playing"],"Arrangement did not play through actual device");
        invoke(session.get(),"midi_refresh_probe",obj({{"enabled",true}}));waitFrames(session.get(),4096);
        require((bool)telemetry()["playing"] && (bool)diagnostics(session.get())["nodePlayheadPlaying"],"Adding a virtual MIDI device stopped actual arrangement playback");
        invoke(session.get(),"midi_refresh_probe",obj({{"enabled",false}}));waitFrames(session.get(),4096);
        require((bool)telemetry()["playing"] && (bool)diagnostics(session.get())["nodePlayheadPlaying"],"Removing a virtual MIDI device stopped actual arrangement playback");
        std::cout<<"MIDI device refresh preserves actual transport/playhead state"<<std::endl;
        const auto beforeSeek=diagnostics(session.get());set(control,"seekBar",1.5);set(control,"seekGeneration",1);sendControl(2);waitFrames(session.get(),2048);
        const auto afterSeek=diagnostics(session.get());for(const auto* key:{"arrangementBuilds","transportStarts"})require((juce::int64)beforeSeek[key]==(juce::int64)afterSeek[key],"Narrow Seek rebuilt or restarted arrangement");
        double seekPosition=(double)telemetry()["clock"]["bar"];require(seekPosition>=1.5 && seekPosition<1.75,"Actual seek did not move the native transport");
        auto loop=project["loop"];set(loop,"enabled",true);set(loop,"startBar",1);set(loop,"endBar",2);set(control,"seekBar",1.95);set(control,"seekGeneration",2);apply(3,0,1,"commit");
        waitFrames(session.get(),(juce::int64)(barSeconds*.2*rate));double loopPosition=(double)telemetry()["clock"]["bar"];require(loopPosition>=1 && loopPosition<1.6,"Native loop did not wrap at its boundary");
        waitFrames(session.get(),4096);
        const auto mixerBaseline=diagnostics(session.get());
        const auto highGainBegin=(juce::int64)mixerBaseline["capturedFrames"];
        waitFrames(session.get(),(juce::int64)(barSeconds*rate));
        const auto highGainEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        double previousPosition=(double)diagnostics(session.get())["arrangementPositionSeconds"],advancedSeconds=0;
        for(int update=0;update<60;++update) {
            for(auto& track:*project["tracks"].getArray())if(track["kind"].toString()=="main")set(track,"volumeDb",-18-24.0*(update+1)/60);
            apply(4+update,1,1,"preview");waitFrames(session.get(),(juce::int64)(rate*.02));
            const auto state=diagnostics(session.get());const double position=(double)state["arrangementPositionSeconds"];
            double delta=position-previousPosition;if(delta<-barSeconds*.5)delta+=barSeconds;
            require(delta>=-.03,"Live volume drag sought the transport backwards");advancedSeconds+=std::max(0.0,delta);previousPosition=position;
            require((bool)state["arrangementPlaying"] && (bool)state["nodePlayheadPlaying"] && (bool)telemetry()["playing"],"Live volume drag froze actual playback");
            for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})require((juce::int64)state[key]==(juce::int64)mixerBaseline[key],"Live volume drag reset native transport/graph: "+juce::String(key));
            require((int)state["acceptedRevision"]==1 && (int)telemetry()["appliedSequence"]==4+update,"Live mixer accepted revision/sequence diverged");
        }
        require(advancedSeconds>.8,"Actual playhead did not continuously advance during 60 mixer updates");sequenceOffset=60;
        waitFrames(session.get(),4096);const auto lowGainBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),(juce::int64)(barSeconds*rate));const auto lowGainEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        V fadeClip;
        for(auto& track:*project["tracks"].getArray())for(auto& clip:*track["clips"].getArray())if(clip["kind"].toString()=="audio" && clip["sourceId"]==source["id"] && !((bool)clip["mute"]))fadeClip=clip;
        require(fadeClip.isObject(),"Live fade smoke requires an unmuted clip using the registered real source");
        const auto fadeOriginal=fadeClip.clone();const double fadeLength=(double)fadeClip["lengthBars"];
        const auto fadeBaseline=diagnostics(session.get());previousPosition=(double)fadeBaseline["arrangementPositionSeconds"];advancedSeconds=0;
        for(int update=0;update<60;++update) {
            const double progress=(update+1)/60.0;
            set(fadeClip,"fadeInBars",fadeLength*(.05+.15*progress));set(fadeClip,"fadeOutBars",fadeLength*(.2-.15*progress));
            set(fadeClip,"fadeInOffsetBars",fadeLength*.025*progress);set(fadeClip,"fadeOutOffsetBars",fadeLength*.025*progress);
            set(fadeClip,"fadeInCurve",-.8+1.6*progress);set(fadeClip,"fadeOutCurve",.8-1.6*progress);
            set(fadeClip,"fadeInCurvePosition",.2+.6*progress);set(fadeClip,"fadeOutCurvePosition",.8-.6*progress);
            apply(4+update,1,1,"preview");waitFrames(session.get(),(juce::int64)(rate*.02));
            const auto state=diagnostics(session.get());const double position=(double)state["arrangementPositionSeconds"];
            double delta=position-previousPosition;if(delta<-barSeconds*.5)delta+=barSeconds;
            require(delta>=-.03,"Live fade drag sought the transport backwards");advancedSeconds+=std::max(0.0,delta);previousPosition=position;
            require((bool)state["arrangementPlaying"] && (bool)state["nodePlayheadPlaying"] && (bool)telemetry()["playing"],"Live fade drag froze actual playback");
            for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})require((juce::int64)state[key]==(juce::int64)fadeBaseline[key],"Live fade drag reset native transport/graph: "+juce::String(key));
            require((int)state["acceptedRevision"]==1 && (int)telemetry()["appliedSequence"]==64+update,"Live fade accepted revision/sequence diverged");
        }
        require(advancedSeconds>.8,"Actual playhead did not advance during 60 fade updates");
        for(const auto* key:{"fadeInBars","fadeOutBars","fadeInOffsetBars","fadeOutOffsetBars","fadeInCurve","fadeOutCurve","fadeInCurvePosition","fadeOutCurvePosition"})set(fadeClip,key,fadeOriginal[key]);
        apply(64,1,1,"cancel");sequenceOffset=121;
        const auto fadeRestored=diagnostics(session.get());for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})require((juce::int64)fadeRestored[key]==(juce::int64)fadeBaseline[key],"Cancelling live fades reset native transport/graph: "+juce::String(key));
        std::cout<<"60 actual-device fade updates and cancel preserved graph/transport; advanced "<<advancedSeconds<<" seconds"<<std::endl;
        const auto clipParameterBaseline=diagnostics(session.get());
        const auto clipBaseBegin=(juce::int64)clipParameterBaseline["capturedFrames"];
        waitFrames(session.get(),(juce::int64)(barSeconds*rate));const auto clipBaseEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        set(fadeClip,"gainDb",-12);apply(4,1,1,"preview");waitFrames(session.get(),4096);
        const auto clipGainBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),(juce::int64)(barSeconds*rate));const auto clipGainEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        set(fadeClip,"mute",true);apply(5,1,1,"preview");waitFrames(session.get(),4096);
        const auto clipMuteBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),(juce::int64)(barSeconds*rate));const auto clipMuteEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        set(fadeClip,"gainDb",fadeOriginal["gainDb"]);set(fadeClip,"mute",fadeOriginal["mute"]);apply(6,1,1,"cancel");sequenceOffset+=3;
        for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})require((juce::int64)diagnostics(session.get())[key]==(juce::int64)clipParameterBaseline[key],"Clip gain/mute update rebuilt or restarted actual graph");
        const auto placementBaseline=diagnostics(session.get());
        int placementSequence=4;
        for(const auto* field:{"startBar","lengthBars","sourceOffsetBars"}) {
            set(fadeClip,field,(double)fadeOriginal[field]+.01);
            apply(placementSequence++,1,1,"preview");waitFrames(session.get(),4096);
            const auto state=diagnostics(session.get());
            require((bool)state["arrangementPlaying"] && (bool)state["nodePlayheadPlaying"],"Clip placement stopped device playback");
            for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})require((juce::int64)state[key]==(juce::int64)placementBaseline[key],"Clip placement replaced Edit or restarted transport");
        }
        for(const auto* field:{"startBar","lengthBars","sourceOffsetBars"})set(fadeClip,field,fadeOriginal[field]);
        apply(placementSequence,1,1,"cancel");sequenceOffset+=4;
        std::cout<<"Actual-device clip move/trim/source-offset updates retained Edit and transport"<<std::endl;
        juce::Array<V>* sourceClips=nullptr;
        for(auto& track:*project["tracks"].getArray())for(auto& clip:*track["clips"].getArray())if(clip["id"]==fadeClip["id"])sourceClips=track["clips"].getArray();
        require(sourceClips!=nullptr,"Cross-track source clip missing");
        for(int i=sourceClips->size();--i>=0;)if(sourceClips->getReference(i)["id"]==fadeClip["id"])sourceClips->remove(i);
        destinationTrack["clips"].getArray()->add(fadeClip);
        apply(4,1,1,"preview");waitFrames(session.get(),4096);
        const auto crossBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),(juce::int64)(barSeconds*rate));const auto crossEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        destinationTrack["clips"].getArray()->clear();sourceClips->add(fadeClip);
        apply(5,1,1,"cancel");sequenceOffset+=2;waitFrames(session.get(),4096);
        for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})require((juce::int64)diagnostics(session.get())[key]==(juce::int64)placementBaseline[key],"Cross-track movement restarted playback");
        for(int i=sourceClips->size();--i>=0;)if(sourceClips->getReference(i)["id"]==fadeClip["id"])sourceClips->remove(i);
        const auto retainedSources=project["sources"].clone();set(project,"sources",juce::Array<V>{});
        apply(4,1,1,"preview");waitFrames(session.get(),4096);
        const auto deletedBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),(juce::int64)(barSeconds*rate));const auto deletedEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        set(project,"sources",retainedSources);sourceClips->add(fadeClip);apply(5,1,1,"cancel");sequenceOffset+=2;waitFrames(session.get(),4096);
        const auto restoredBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),(juce::int64)(barSeconds*rate));const auto restoredEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})require((juce::int64)diagnostics(session.get())[key]==(juce::int64)placementBaseline[key],"Clip deletion/restoration restarted playback");
        auto liveSettings=fadeClip["audioSettings"];const auto originalSettings=liveSettings.clone();
        set(liveSettings,"transpose",12);apply(4,1,1,"preview");waitFrames(session.get(),(juce::int64)(rate*.3));
        const auto pitchBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),(juce::int64)(rate*.3));const auto pitchEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        std::cout<<"Pitch capture interval frames "<<pitchBegin<<" "<<pitchEnd<<" sampleRate "<<rate<<std::endl;
        for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})require((juce::int64)diagnostics(session.get())[key]==(juce::int64)placementBaseline[key],"Pitch adjustment replaced Edit or restarted transport");
        set(liveSettings,"transpose",originalSettings["transpose"]);apply(5,1,1,"cancel");sequenceOffset+=2;waitFrames(session.get(),4096);
        set(fadeClip,"sourceOffsetBars",(double)fadeOriginal["sourceOffsetBars"]+.001);set(liveSettings,"endMarkerBars",.0001);apply(4,1,1,"preview");waitFrames(session.get(),4096);
        const auto markerBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),4096);const auto markerEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})require((juce::int64)diagnostics(session.get())[key]==(juce::int64)placementBaseline[key],"Source marker adjustment replaced Edit or restarted transport");
        set(fadeClip,"sourceOffsetBars",fadeOriginal["sourceOffsetBars"]);
        set(liveSettings,"loop",true);set(liveSettings,"loopStartBars",.25);set(liveSettings,"loopLengthBars",.5);
        apply(5,1,1,"preview");waitFrames(session.get(),4096);
        const auto sourceLoopBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),4096);const auto sourceLoopEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})require((juce::int64)diagnostics(session.get())[key]==(juce::int64)placementBaseline[key],"Clip loop adjustment replaced Edit or restarted transport");
        for(const auto* key:{"loop","loopStartBars","loopLengthBars"})set(liveSettings,key,originalSettings[key]);
        sequenceOffset+=1;
        set(liveSettings,"endMarkerBars",originalSettings["endMarkerBars"]);apply(5,1,1,"cancel");sequenceOffset+=2;waitFrames(session.get(),4096);
        const auto markerRestoreBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),4096);const auto markerRestoreEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        set(liveSettings,"warp",true);set(liveSettings,"warpMode","re-pitch");set(liveSettings,"sourceBpm",bpm/2);
        apply(4,1,1,"preview");waitFrames(session.get(),(juce::int64)(rate*.3));
        const auto repitchBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),(juce::int64)(rate*.3));const auto repitchEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        std::cout<<"Repitch capture interval frames "<<repitchBegin<<" "<<repitchEnd<<" sampleRate "<<rate<<std::endl;
        for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})require((juce::int64)diagnostics(session.get())[key]==(juce::int64)placementBaseline[key],"Warp mode adjustment replaced Edit or restarted transport");
        set(liveSettings,"warp",false);apply(5,1,1,"preview");waitFrames(session.get(),(juce::int64)(rate*.3));
        const auto rawBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),(juce::int64)(rate*.3));const auto rawEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        std::cout<<"Warp-off capture interval frames "<<rawBegin<<" "<<rawEnd<<" sampleRate "<<rate<<std::endl;
        for(const auto* key:{"warp","warpMode","sourceBpm"})set(liveSettings,key,originalSettings[key]);
        apply(6,1,1,"cancel");sequenceOffset+=3;waitFrames(session.get(),4096);
        set(liveSettings,"reverse",true);apply(4,1,1,"preview");
        set(liveSettings,"reverse",false);apply(5,1,1,"cancel");sequenceOffset+=2;
        waitFrames(session.get(),4096);
        const auto reverseRequested=(juce::int64)diagnostics(session.get())["capturedFrames"];
        set(liveSettings,"reverse",true);apply(4,1,1,"preview");waitFrames(session.get(),(juce::int64)(rate*1.0));
        const auto reverseBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),(juce::int64)(rate*.3));const auto reverseEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        std::cout<<"Reverse capture interval frames "<<reverseRequested<<" "<<reverseBegin<<" "<<reverseEnd<<" sampleRate "<<rate<<std::endl;
        for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})require((juce::int64)diagnostics(session.get())[key]==(juce::int64)placementBaseline[key],"Reverse adjustment replaced Edit or restarted transport");
        set(liveSettings,"reverse",originalSettings["reverse"]);apply(5,1,1,"cancel");sequenceOffset+=2;waitFrames(session.get(),4096);
        const auto reverseRestoreBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),4096);const auto reverseRestoreEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        V routedTrack;for(auto& track:*project["tracks"].getArray())for(auto& clip:*track["clips"].getArray())if(clip["id"]==fadeClip["id"])routedTrack=track;
        require(routedTrack.isObject(),"Routing smoke source track missing");
        const auto originalOutput=routedTrack["output"];
        set(routedTrack,"output","none");apply(4,1,1,"preview");waitFrames(session.get(),4096);
        const auto routeNoneBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),4096);const auto routeNoneEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})require((juce::int64)diagnostics(session.get())[key]==(juce::int64)placementBaseline[key],"Output route change replaced Edit or restarted transport");
        set(routedTrack,"output","device-smoke-destination");apply(5,1,1,"preview");waitFrames(session.get(),4096);
        const auto routeTrackBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),4096);const auto routeTrackEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        set(routedTrack,"output",originalOutput);apply(6,1,1,"cancel");sequenceOffset+=3;waitFrames(session.get(),4096);
        const auto originalSends=routedTrack["sends"].clone();
        set(routedTrack,"output","none");set(routedTrack,"sends",obj({{"device-smoke-return",-6.020599913}}));
        apply(4,1,1,"preview");waitFrames(session.get(),4096);
        const auto sendBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),4096);const auto sendEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})require((juce::int64)diagnostics(session.get())[key]==(juce::int64)placementBaseline[key],"Adding send replaced Edit or restarted transport");
        const auto sourceVolume=routedTrack["volumeDb"];
        set(routedTrack,"volumeDb",(double)sourceVolume-12);apply(5,1,1,"preview");waitFrames(session.get(),4096);
        const auto preSendBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),4096);const auto preSendEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        set(sendReturn,"returnPost",true);apply(6,1,1,"preview");waitFrames(session.get(),4096);
        const auto postSendBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),4096);const auto postSendEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})require((juce::int64)diagnostics(session.get())[key]==(juce::int64)placementBaseline[key],"Send pre/post change replaced Edit or restarted playback");
        set(sendReturn,"returnPost",false);set(routedTrack,"volumeDb",sourceVolume);apply(7,1,1,"cancel");sequenceOffset+=3;
        set(routedTrack,"sends",obj({}));apply(5,1,1,"preview");waitFrames(session.get(),4096);
        const auto sendRemovedBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),4096);const auto sendRemovedEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        set(routedTrack,"output",originalOutput);set(routedTrack,"sends",originalSends);apply(6,1,1,"cancel");sequenceOffset+=3;waitFrames(session.get(),4096);
        set(routedTrack,"output","none");set(destinationTrack,"input",routedTrack["id"]);apply(4,1,1,"preview");waitFrames(session.get(),4096);
        const auto inputRouteBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),4096);const auto inputRouteEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})require((juce::int64)diagnostics(session.get())[key]==(juce::int64)placementBaseline[key],"Inter-track input replaced Edit or restarted playback");
        set(routedTrack,"output",destinationTrack["id"]);apply(5,1,1,"preview");waitFrames(session.get(),4096);
        const auto bothRoutesBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),4096);const auto bothRoutesEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        set(destinationTrack,"input","none");set(routedTrack,"output",originalOutput);apply(6,1,1,"cancel");sequenceOffset+=3;waitFrames(session.get(),4096);
        project["tracks"].getArray()->move(0,project["tracks"].getArray()->size()-1);
        apply(4,1,1,"preview");waitFrames(session.get(),4096);
        for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})require((juce::int64)diagnostics(session.get())[key]==(juce::int64)placementBaseline[key],"Track reordering replaced Edit or restarted playback");
        const auto reorderedBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),4096);const auto reorderedEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        set(routedTrack,"volumeDb",(double)sourceVolume-6.020599913);apply(5,1,1,"preview");waitFrames(session.get(),4096);
        const auto reorderedGainBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),4096);const auto reorderedGainEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        set(routedTrack,"volumeDb",sourceVolume);
        project["tracks"].getArray()->move(project["tracks"].getArray()->size()-1,0);
        apply(6,1,1,"cancel");sequenceOffset+=3;waitFrames(session.get(),4096);
        for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})require((juce::int64)diagnostics(session.get())[key]==(juce::int64)placementBaseline[key],"Reordered mixer update or cancel restarted playback");
        const auto originalAutomation=routedTrack["automation"].clone();
        auto automationPoint=obj({{"id","smoke-volume-point"},{"bar",1},{"value",(double)sourceVolume-6.020599913}});
        auto automationLane=obj({{"id","smoke-volume"},{"target",obj({{"kind","mixer"},{"parameter","volume"}})},{"points",juce::Array<V>{automationPoint}}});
        set(routedTrack,"automation",juce::Array<V>{automationLane});apply(4,1,1,"preview");waitFrames(session.get(),4096);
        for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})require((juce::int64)diagnostics(session.get())[key]==(juce::int64)placementBaseline[key],"Automation insertion replaced Edit or restarted playback");
        const auto automationBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),4096);const auto automationEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        set(automationPoint,"value",(double)sourceVolume-12.041199826);apply(5,1,1,"preview");waitFrames(session.get(),4096);
        const auto automationEditBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),4096);const auto automationEditEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        set(routedTrack,"automation",originalAutomation);apply(6,1,1,"cancel");sequenceOffset+=3;waitFrames(session.get(),4096);
        const auto automationCancelBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),4096);const auto automationCancelEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})require((juce::int64)diagnostics(session.get())[key]==(juce::int64)placementBaseline[key],"Automation edit/cancel restarted playback");
        set(groupTrack,"solo",true);set(groupTrack,"childTrackIds",juce::Array<V>{routedTrack["id"]});apply(4,1,1,"preview");waitFrames(session.get(),4096);
        for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})require((juce::int64)diagnostics(session.get())[key]==(juce::int64)placementBaseline[key],"Group membership change replaced Edit or restarted playback");
        const auto groupMemberBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),4096);const auto groupMemberEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        set(groupTrack,"childTrackIds",juce::Array<V>{});apply(5,1,1,"preview");waitFrames(session.get(),4096);
        const auto groupRemovedBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),4096);const auto groupRemovedEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        set(groupTrack,"solo",false);apply(6,1,1,"cancel");sequenceOffset+=3;waitFrames(session.get(),4096);
        const auto groupCancelBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),4096);const auto groupCancelEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})require((juce::int64)diagnostics(session.get())[key]==(juce::int64)placementBaseline[key],"Group membership removal/cancel restarted playback");
        auto addedTrack=destinationTrack.clone();set(addedTrack,"id","device-smoke-added");set(addedTrack,"volumeDb",-12.041199826);
        project["tracks"].getArray()->add(addedTrack);set(routedTrack,"output",addedTrack["id"]);apply(4,1,1,"preview");waitFrames(session.get(),4096);
        for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})require((juce::int64)diagnostics(session.get())[key]==(juce::int64)placementBaseline[key],"Track insertion replaced Edit or restarted playback");
        const auto addedTrackBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),4096);const auto addedTrackEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        project["tracks"].getArray()->removeLast();set(routedTrack,"output",originalOutput);apply(5,1,1,"cancel");sequenceOffset+=2;waitFrames(session.get(),4096);
        const auto removedTrackBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),4096);const auto removedTrackEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})require((juce::int64)diagnostics(session.get())[key]==(juce::int64)placementBaseline[key],"Track removal restarted playback");
        set(destinationTrack,"kind","midi");apply(4,1,1,"preview");waitFrames(session.get(),4096);
        for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})require((juce::int64)diagnostics(session.get())[key]==(juce::int64)placementBaseline[key],"Track kind conversion replaced Edit or restarted playback");
        set(destinationTrack,"kind","audio");apply(5,1,1,"cancel");sequenceOffset+=2;waitFrames(session.get(),4096);
        auto authoredMidi=juce::JSON::parse(R"({"id":"device-smoke-midi-clip","kind":"midi","startBar":1,"lengthBars":2,"sourceOffsetBars":0,"mute":false,"loopBars":1,"notes":[{"id":"note","pitch":67,"startBeat":1,"lengthBeats":0.5,"velocity":93}]})");
        set(midiTrack,"clips",juce::Array<V>{authoredMidi});apply(4,1,1,"preview");waitFrames(session.get(),4096);
        auto authoredNote=authoredMidi["notes"][0];set(authoredNote,"pitch",70);set(authoredNote,"velocity",101);set(authoredMidi,"sourceOffsetBars",.25);apply(5,1,1,"preview");waitFrames(session.get(),4096);
        set(midiTrack,"clips",juce::Array<V>{});apply(6,1,1,"cancel");sequenceOffset+=3;waitFrames(session.get(),4096);
        for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})require((juce::int64)diagnostics(session.get())[key]==(juce::int64)placementBaseline[key],"Authored MIDI insertion/edit/removal restarted device playback");
        const auto originalCue=routedTrack["cueOutput"],originalCueVolume=routedTrack["cueVolumeDb"];
        double cueToMainGain=0;for(const auto& track:*project["tracks"].getArray())if(track["kind"].toString()=="main")cueToMainGain=std::pow(10.0,(-18-(double)track["volumeDb"])/20.0);
        set(routedTrack,"output","none");set(routedTrack,"cueOutput","1-2");set(routedTrack,"cueVolumeDb",-18);apply(4,1,1,"preview");waitFrames(session.get(),4096);
        for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})require((juce::int64)diagnostics(session.get())[key]==(juce::int64)placementBaseline[key],"Cue insertion replaced Edit or restarted playback");
        const auto cueBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),4096);const auto cueEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        set(routedTrack,"cueOutput",V());apply(5,1,1,"preview");waitFrames(session.get(),4096);
        const auto cueRemovedBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),4096);const auto cueRemovedEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        set(routedTrack,"output",originalOutput);set(routedTrack,"cueOutput",originalCue);set(routedTrack,"cueVolumeDb",originalCueVolume);apply(6,1,1,"cancel");sequenceOffset+=3;waitFrames(session.get(),4096);
        const auto originalDevices=routedTrack["devices"].clone();
        auto utility=obj({{"id","smoke-utility"},{"kind","utility"},{"enabled",true},{"gainDb",-6.020599913},{"pan",0},{"width",100}});
        set(routedTrack,"devices",juce::Array<V>{utility});apply(4,1,1,"preview");waitFrames(session.get(),4096);
        const auto deviceGainBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),4096);const auto deviceGainEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        set(utility,"gainDb",-12.041199826);apply(5,1,1,"preview");waitFrames(session.get(),4096);
        const auto deviceEditBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),4096);const auto deviceEditEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        set(utility,"enabled",false);apply(6,1,1,"preview");waitFrames(session.get(),4096);
        const auto deviceBypassBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),4096);const auto deviceBypassEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        set(utility,"enabled",true);
        auto deviceAutomationPoint=obj({{"id","point"},{"bar",1},{"value",-18.06179974}});
        auto deviceAutomationTarget=obj({{"kind","device"},{"deviceId","smoke-utility"},{"parameter","gainDb"}});
        auto deviceAutomationLane=obj({{"id","smoke-device-lane"},{"target",deviceAutomationTarget},{"points",juce::Array<V>{deviceAutomationPoint}}});
        set(routedTrack,"automation",juce::Array<V>{deviceAutomationLane});
        apply(7,1,1,"preview");waitFrames(session.get(),4096);
        const auto deviceAutomationBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),4096);const auto deviceAutomationEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        set(routedTrack,"automation",originalAutomation);apply(8,1,1,"preview");waitFrames(session.get(),4096);
        const auto deviceAutomationRemovedBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        waitFrames(session.get(),4096);const auto deviceAutomationRemovedEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        set(routedTrack,"devices",originalDevices);apply(9,1,1,"cancel");sequenceOffset+=6;waitFrames(session.get(),4096);
        for(const auto* key:{"arrangementBuilds","transportSeeks","transportStarts"})require((juce::int64)diagnostics(session.get())[key]==(juce::int64)placementBaseline[key],"Device insertion/edit/bypass/removal restarted playback");
        for(auto& track:*project["tracks"].getArray())if(track["kind"].toString()=="main") { set(track,"mute",true);set(track,"volumeDb",-160); }
        set(loop,"enabled",false);apply(4,1,2,"commit");waitFrames(session.get(),4096);
        const auto mutedCaptureBegin=(juce::int64)diagnostics(session.get())["capturedFrames"];
        auto audition=obj({{"generation",1},{"path",sourcePath},{"mode","raw"},{"sourceBpm",V()},{"projectBpm",bpm*1.37},{"numerator",project["numerator"]},{"denominator",project["denominator"]},{"gainDb",-18}});
        invoke(session.get(),"capture_begin",obj({{"seconds",2},{"preview",true}}));zp_audition_fence(session.get(),1);
        auto raw=invoke(session.get(),"audition",audition);require(raw["state"].toString()=="playing","Raw audition unexpectedly quantized");waitFrames(session.get(),(juce::int64)(.3*rate));
        require((bool)telemetry()["playing"] && (bool)diagnostics(session.get())["previewPlaying"],"Raw audition reset arrangement playback");
        auto rawStatus=invoke(session.get(),"audition_status",obj({{"generation",1}}));
        const double sourceDuration=(double)source["frames"]/(double)source["sampleRate"];
        require(std::abs((double)rawStatus["durationSeconds"]-sourceDuration)<.001,"Browser preview duration followed project tempo instead of source");
        require((double)rawStatus["positionSeconds"]>=.2 && (double)rawStatus["positionSeconds"]<.6,"Browser native progress is not original-speed source time");
        invoke(session.get(),"audition_stop",obj({{"generation",1}}));
        auto stoppedStatus=invoke(session.get(),"audition_status",obj({{"generation",1}}));require(!(bool)stoppedStatus["playing"],"Browser stop did not stop its transport");
        invoke(session.get(),"audition_seek",obj({{"generation",1},{"normalized",.5}}));
        auto restarted=invoke(session.get(),"audition_status",obj({{"generation",1}}));require((bool)restarted["playing"] && std::abs((double)restarted["positionSeconds"]-sourceDuration*.5)<.1,"Raw waveform click failed to seek/start after stop");
        invoke(session.get(),"audition_seek",obj({{"generation",1},{"normalized",1.0}}));waitFrames(session.get(),4096);
        auto ended=invoke(session.get(),"audition_status",obj({{"generation",1}}));require(!(bool)ended["playing"] && std::abs((double)ended["positionSeconds"]-sourceDuration)<.05,"Raw preview end lost original source position");
        invoke(session.get(),"audition_seek",obj({{"generation",1},{"normalized",.25}}));waitFrames(session.get(),2048);
        auto resumed=invoke(session.get(),"audition_status",obj({{"generation",1}}));require((bool)resumed["playing"] && (double)resumed["positionSeconds"]>=sourceDuration*.25,"Raw waveform click failed to start after end");
        auto replacement=juce::JSON::parse(juce::JSON::toString(audition));set(replacement,"generation",2);zp_audition_fence(session.get(),2);
        invoke(session.get(),"audition",replacement);waitFrames(session.get(),2048);
        const auto replacementPosition=(double)invoke(session.get(),"audition_status",obj({{"generation",2}}))["positionSeconds"];
        invoke(session.get(),"audition_stop",obj({{"generation",1}}));invoke(session.get(),"audition_stop",obj({{"generation",3}}));
        expectFailure(session.get(),"audition",audition,"Old preview selection replaced its new owner");
        expectFailure(session.get(),"audition_seek",obj({{"generation",1},{"normalized",.5}}),"Old preview seek changed its new owner");
        waitFrames(session.get(),2048);auto replacementStatus=invoke(session.get(),"audition_status",obj({{"generation",2}}));
        std::cout<<"Replacement preview before="<<replacementPosition<<" after="<<juce::JSON::toString(replacementStatus,true)<<" diagnostics="<<juce::JSON::toString(diagnostics(session.get()),true)<<std::endl;
        require((bool)replacementStatus["playing"] && (double)replacementStatus["positionSeconds"]>replacementPosition,"Old or unreserved preview stop interrupted replacement");
        zp_audition_fence(session.get(),3);auto staleAudition=juce::JSON::parse(juce::JSON::toString(audition));set(staleAudition,"generation",2);
        expectFailure(session.get(),"audition",staleAudition,"Stale preview generation started");waitFrames(session.get(),4096);require(!(bool)diagnostics(session.get())["previewPlaying"],"New preview generation left old audio active");
        expectFailure(session.get(),"audition_seek",obj({{"generation",1},{"normalized",.5}}),"Late raw seek revived superseded preview");
        expectFailure(session.get(),"audition_status",obj({{"generation",1}}),"Late raw status accepted a superseded preview");
        const auto mutedCaptureEnd=(juce::int64)diagnostics(session.get())["capturedFrames"];
        auto missing=juce::JSON::parse(juce::JSON::toString(audition));set(missing,"generation",3);set(missing,"path",output.getSiblingFile("missing-audition-source.wav").getFullPathName());expectFailure(session.get(),"audition",missing,"Offline audition fabricated a fallback");
        auto rawOutput=output.getSiblingFile(output.getFileNameWithoutExtension()+"-raw-preview.wav");invoke(session.get(),"capture_write",obj({{"path",rawOutput.getFullPathName()},{"preview",true}}));inspectCapture(rawOutput,true);
        for(auto& track:*project["tracks"].getArray())if(track["kind"].toString()=="main") { set(track,"mute",false);set(track,"volumeDb",-18); }
        apply(5,2,3,"commit");set(audition,"sourceBpm",sourceBpm);set(audition,"projectBpm",bpm);
        invoke(session.get(),"capture_begin",obj({{"seconds",barSeconds+3},{"preview",true}}));set(audition,"generation",4);set(audition,"mode","sync");zp_audition_fence(session.get(),4);
        auto sync=invoke(session.get(),"audition",audition);require(sync["state"].toString()=="waitingForBar","Sync audition did not quantize against the running arrangement");waitFrames(session.get(),(juce::int64)((barSeconds+.3)*rate));
        require((bool)telemetry()["playing"] && (bool)diagnostics(session.get())["previewPlaying"],"Sync audition reset arrangement playback");
        invoke(session.get(),"audition_seek",obj({{"generation",4},{"normalized",.5}}));auto syncPosition=diagnostics(session.get());require(std::abs((double)syncPosition["previewPositionSeconds"]-(double)syncPosition["previewDurationSeconds"]*.5)<.15,"Sync preview seek failed");waitFrames(session.get(),4096);
        zp_audition_fence(session.get(),5);invoke(session.get(),"audition_stop",obj({{"generation",5}}));auto syncOutput=output.getSiblingFile(output.getFileNameWithoutExtension()+"-sync-preview.wav");invoke(session.get(),"capture_write",obj({{"path",syncOutput.getFullPathName()},{"preview",true}}));inspectCapture(syncOutput,false);
        require((bool)telemetry()["playing"],"Stopping audition stopped the arrangement");
        sequenceOffset=0;
        const auto oldLease=lease;request=juce::JSON::parse(juce::JSON::toString(request));control=request["state"]["control"];set(request,"sessionId","device-smoke-replacement");set(control,"seekBar",1);set(control,"seekGeneration",0);lease="device-smoke-replacement";apply(0,0,0,"open");
        invoke(session.get(),"release",obj({{"leaseId",oldLease}}));waitFrames(session.get(),4096);require((bool)telemetry()["playing"] && telemetry()["sessionId"].toString()=="device-smoke-replacement","Releasing the old backend stopped its replacement");
        auto beforeFence=diagnostics(session.get());const auto capturedBefore=(juce::int64)beforeFence["capturedFrames"],clearedBefore=(juce::int64)beforeFence["gateClearedFrames"];
        require(zp_stop_fence_for(session.get(),lease.toRawUTF8(),request["sessionId"].toString().toRawUTF8(),1)!=0,"Active smoke owner could not stop");const auto deadline=juce::Time::getMillisecondCounterHiRes()+2000;V afterFence;
        do { juce::MessageManager::getInstance()->runDispatchLoopUntil(10);afterFence=diagnostics(session.get()); }while((juce::int64)afterFence["capturedFrames"]<capturedBefore+4096 && juce::Time::getMillisecondCounterHiRes()<deadline);
        require((juce::int64)afterFence["capturedFrames"]>=capturedBefore+4096,"Capture failed to observe actual post-fence buffers");require((juce::int64)afterFence["gateClearedFrames"]>clearedBefore,"Native graph did not process the urgent stop fence");
        invoke(session.get(),"stop",obj({{"leaseId",lease},{"sessionId",request["sessionId"]},{"stopToken",1},{"stopEpoch",1}}));
        std::cout<<juce::JSON::toString(invoke(session.get(),"capture_write",obj({{"path",output.getFullPathName()}})),true)<<std::endl;inspectCapture(output,true);inspectSilentRange(output,mutedCaptureBegin,mutedCaptureEnd,"Main mute");
        const double highRms=rangeRms(output,highGainBegin,highGainEnd),lowRms=rangeRms(output,lowGainBegin,lowGainEnd);
        require(highRms>1e-6 && lowRms>1e-8 && lowRms<highRms*.2,"60 in-place volume updates did not audibly reduce actual captured output");
        const double clipBaseRms=rangeRms(output,clipBaseBegin,clipBaseEnd),clipGainRms=rangeRms(output,clipGainBegin,clipGainEnd);
        require(clipBaseRms>1e-8 && clipGainRms>1e-9 && clipGainRms<clipBaseRms*.35,"Live clip gain failed to reduce actual audio");
        const double crossRms=rangeRms(output,crossBegin,crossEnd);
        require(crossRms>clipBaseRms*.04 && crossRms<clipBaseRms*.09,"Cross-track move did not apply destination fader to actual audio");
        std::cout<<"Cross-track destination -24dB applied to actual output; RMS "<<clipBaseRms<<" -> "<<crossRms<<std::endl;
        inspectSilentRange(output,clipMuteBegin,clipMuteEnd,"Clip mute");
        inspectSilentRange(output,deletedBegin,deletedEnd,"Clip deletion");
        inspectSilentRange(output,markerBegin,markerEnd,"Source End marker");
        const double markerRestoredRms=rangeRms(output,markerRestoreBegin,markerRestoreEnd);
        require(markerRestoredRms>clipBaseRms*.8 && markerRestoredRms<clipBaseRms*1.2,"Cancelling source marker did not restore actual sound");
        std::cout<<"Source End marker silenced output and cancel restored RMS "<<markerRestoredRms<<std::endl;
        const double sourceLoopRms=rangeRms(output,sourceLoopBegin,sourceLoopEnd);
        require(sourceLoopRms>clipBaseRms*.8 && sourceLoopRms<clipBaseRms*1.2,"Clip source loop did not resume actual source audio");
        std::cout<<"Source loop retained transport and produced RMS "<<sourceLoopRms<<std::endl;
        const double reverseRms=rangeRms(output,reverseBegin,reverseEnd),reverseRestoredRms=rangeRms(output,reverseRestoreBegin,reverseRestoreEnd);
        require(reverseRms>clipBaseRms*.8 && reverseRms<clipBaseRms*1.2 && reverseRestoredRms>clipBaseRms*.8 && reverseRestoredRms<clipBaseRms*1.2,"Reverse or cancellation failed to produce actual audio");
        std::cout<<"Reverse prepared output RMS "<<reverseRms<<"; cancel restored "<<reverseRestoredRms<<std::endl;
        inspectSilentRange(output,routeNoneBegin,routeNoneEnd,"Disconnected output");
        const double routeRms=rangeRms(output,routeTrackBegin,routeTrackEnd);
        require(routeRms>clipBaseRms*.04 && routeRms<clipBaseRms*.09,"Output routing did not apply destination track gain");
        std::cout<<"Output routing none/track/cancel retained playback; destination RMS "<<routeRms<<std::endl;
        const double sendRms=rangeRms(output,sendBegin,sendEnd);
        std::cout<<"Send measured RMS "<<sendRms<<" baseline "<<clipBaseRms<<" interval "<<sendBegin<<" "<<sendEnd<<std::endl;
        require(sendRms>clipBaseRms*.45 && sendRms<clipBaseRms*.55,"Native send did not apply its -6dB gain");
        const double preSendRms=rangeRms(output,preSendBegin,preSendEnd),postSendRms=rangeRms(output,postSendBegin,postSendEnd);
        require(preSendRms>sendRms*.9 && preSendRms<sendRms*1.1,"Pre-fader send followed track volume");
        require(postSendRms>sendRms*.22 && postSendRms<sendRms*.28,"Post-fader send did not follow track volume");
        std::cout<<"Send Pre/Post with -12dB track fader RMS "<<preSendRms<<" -> "<<postSendRms<<std::endl;
        const double inputRouteRms=rangeRms(output,inputRouteBegin,inputRouteEnd),bothRoutesRms=rangeRms(output,bothRoutesBegin,bothRoutesEnd);
        require(inputRouteRms>clipBaseRms*.04 && inputRouteRms<clipBaseRms*.09,"Inter-track input did not reach destination fader");
        require(bothRoutesRms>inputRouteRms*.9 && bothRoutesRms<inputRouteRms*1.1,"Configuring both route sides doubled the signal");
        std::cout<<"Inter-track input and both-side routing RMS "<<inputRouteRms<<" -> "<<bothRoutesRms<<std::endl;
        const double reorderedRms=rangeRms(output,reorderedBegin,reorderedEnd);
        require(reorderedRms>clipBaseRms*.9 && reorderedRms<clipBaseRms*1.1,"Track reorder changed audible gain or routing");
        const double reorderedGainRms=rangeRms(output,reorderedGainBegin,reorderedGainEnd);
        require(reorderedGainRms>clipBaseRms*.45 && reorderedGainRms<clipBaseRms*.55,"Reordered fader update targeted the wrong track");
        std::cout<<"Track reorder preserved RMS "<<reorderedRms<<"; reordered -6dB fader RMS "<<reorderedGainRms<<std::endl;
        const double automationRms=rangeRms(output,automationBegin,automationEnd),automationEditRms=rangeRms(output,automationEditBegin,automationEditEnd),automationCancelRms=rangeRms(output,automationCancelBegin,automationCancelEnd);
        require(automationRms>clipBaseRms*.45 && automationRms<clipBaseRms*.55,"Inserted automation did not apply -6dB");
        require(automationEditRms>clipBaseRms*.22 && automationEditRms<clipBaseRms*.28,"Edited automation did not apply -12dB");
        require(automationCancelRms>clipBaseRms*.9 && automationCancelRms<clipBaseRms*1.1,"Removing automation did not restore authored fader");
        std::cout<<"Automation insertion/edit/cancel RMS "<<automationRms<<" -> "<<automationEditRms<<" -> "<<automationCancelRms<<std::endl;
        const double groupMemberRms=rangeRms(output,groupMemberBegin,groupMemberEnd),groupCancelRms=rangeRms(output,groupCancelBegin,groupCancelEnd);
        require(groupMemberRms>clipBaseRms*.9 && groupMemberRms<clipBaseRms*1.1,"Joining soloed group did not preserve member output");
        inspectSilentRange(output,groupRemovedBegin,groupRemovedEnd,"Solo group membership removal");
        require(groupCancelRms>clipBaseRms*.9 && groupCancelRms<clipBaseRms*1.1,"Cancelling group solo did not restore output");
        std::cout<<"Group membership/solo removal/cancel RMS "<<groupMemberRms<<" -> silence -> "<<groupCancelRms<<std::endl;
        const double addedTrackRms=rangeRms(output,addedTrackBegin,addedTrackEnd),removedTrackRms=rangeRms(output,removedTrackBegin,removedTrackEnd);
        require(addedTrackRms>clipBaseRms*.22 && addedTrackRms<clipBaseRms*.28,"New track did not apply destination gain");
        require(removedTrackRms>clipBaseRms*.9 && removedTrackRms<clipBaseRms*1.1,"Track deletion did not restore original route");
        std::cout<<"Track insertion/routing/deletion RMS "<<addedTrackRms<<" -> "<<removedTrackRms<<std::endl;
        const double deviceGainRms=rangeRms(output,deviceGainBegin,deviceGainEnd),deviceEditRms=rangeRms(output,deviceEditBegin,deviceEditEnd),deviceBypassRms=rangeRms(output,deviceBypassBegin,deviceBypassEnd);
        require(deviceGainRms>clipBaseRms*.45 && deviceGainRms<clipBaseRms*.55,"Inserted Utility did not apply -6dB");
        require(deviceEditRms>clipBaseRms*.22 && deviceEditRms<clipBaseRms*.28,"Utility edit did not apply -12dB");
        require(deviceBypassRms>clipBaseRms*.9 && deviceBypassRms<clipBaseRms*1.1,"Utility bypass did not restore dry output");
        std::cout<<"Utility insertion/edit/bypass RMS "<<deviceGainRms<<" -> "<<deviceEditRms<<" -> "<<deviceBypassRms<<std::endl;
        const double deviceAutomationRms=rangeRms(output,deviceAutomationBegin,deviceAutomationEnd),deviceAutomationRemovedRms=rangeRms(output,deviceAutomationRemovedBegin,deviceAutomationRemovedEnd);
        require(deviceAutomationRms>clipBaseRms*.11 && deviceAutomationRms<clipBaseRms*.14,"Device automation did not apply -18dB");
        require(deviceAutomationRemovedRms>clipBaseRms*.22 && deviceAutomationRemovedRms<clipBaseRms*.28,"Removing device automation did not restore manual -12dB");
        std::cout<<"Device automation/manual restoration RMS "<<deviceAutomationRms<<" -> "<<deviceAutomationRemovedRms<<std::endl;
        const double cueRms=rangeRms(output,cueBegin,cueEnd);
        std::cout<<"Cue measured RMS "<<cueRms<<" baseline "<<clipBaseRms<<" interval "<<cueBegin<<" "<<cueEnd<<std::endl;
        require(cueRms>clipBaseRms*cueToMainGain*.9 && cueRms<clipBaseRms*cueToMainGain*1.1,"Cue output did not bypass Main attenuation");
        inspectSilentRange(output,cueRemovedBegin,cueRemovedEnd,"Cue removal");
        std::cout<<"Cue insertion/removal RMS "<<cueRms<<" -> silence"<<std::endl;
        inspectSilentRange(output,sendRemovedBegin,sendRemovedEnd,"Send removal");
        std::cout<<"Send add/remove/cancel retained playback; send RMS "<<sendRms<<std::endl;
        const double restoredRms=rangeRms(output,restoredBegin,restoredEnd);
        require(restoredRms>clipBaseRms*.9 && restoredRms<clipBaseRms*1.1,"Undo deletion did not restore actual audio");
        std::cout<<"Clip deletion silenced output; undo restored RMS "<<restoredRms<<" without replacing Edit"<<std::endl;
        std::cout<<"Existing LiveClipLevel gain/mute preserved graph; RMS "<<clipBaseRms<<" -> "<<clipGainRms<<" -> silence"<<std::endl;
        std::cout<<"60 continuous mixer updates preserved graph/transport/revision; pre-device RMS "<<highRms<<" -> "<<lowRms<<std::endl;
        std::cout<<juce::JSON::toString(diagnostics(session.get()),true)<<std::endl;
        invoke(session.get(),"release",obj({{"leaseId",lease}}));
        std::cout<<"Actual device playback/seek/loop/original-speed Browser preview/status/stop+end seek/Main mute independence/generic sync/generation fences/lease replacement/urgent stop passed; captures are pre-device, not loopback"<<std::endl;
        return 0;
    }catch(const std::exception& exception) { std::cerr<<exception.what()<<std::endl;return 1; }
}
