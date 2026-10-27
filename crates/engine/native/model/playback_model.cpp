#include "playback_model.h"
#include <limits>
namespace zp {
V object() { return V(new juce::DynamicObject()); }
void put(V& v, const char* key, const V& value) { v.getDynamicObject()->setProperty(key, value); }
void require(bool ok, const juce::String& message) { if (!ok) throw std::runtime_error(message.toStdString()); }
V parse(const char* json) {
    require(json != nullptr, "Missing JSON");
    V v; auto status = juce::JSON::parse(juce::String::fromUTF8(json), v);
    require(status.wasOk(), status.getErrorMessage()); return v;
}
void fields(const V& v, std::initializer_list<const char*> required, std::initializer_list<const char*> optional) {
    auto* o = v.getDynamicObject(); require(o != nullptr, "Expected object");
    for (auto* key : required) require(o->hasProperty(key), juce::String("Missing field: ") + key);
    for (auto& prop : o->getProperties()) {
        bool known = false;
        for (auto* key : required) known |= prop.name == juce::Identifier(key);
        for (auto* key : optional) known |= prop.name == juce::Identifier(key);
        require(known, "Unknown field: " + prop.name.toString());
    }
}
const V& field(const V& v, const char* key) { require(v.getDynamicObject() && v.hasProperty(key), juce::String("Missing field: ") + key); return v.getDynamicObject()->getProperty(key); }
juce::String text(const V& v, const char* key) { auto& x = field(v, key); require(x.isString(), juce::String("Expected string: ") + key); return x.toString(); }
double number(const V& v, const char* key, double min, double max) {
    auto& x = field(v, key); require(x.isDouble() || x.isInt() || x.isInt64(), juce::String("Expected number: ") + key);
    const double n = x; require(std::isfinite(n) && n >= min && n <= max, juce::String("Number out of range: ") + key); return n;
}
uint64_t integer(const V& v, const char* key) { auto n = number(v, key, 0, 9007199254740991.0); require(std::floor(n) == n, "Expected integer"); return (uint64_t)n; }
uint64_t decimalU64(const V& v, const char* key) {
    const auto s=text(v,key);require(s.isNotEmpty() && (s.length()==1 || s[0]!='0'),"Invalid decimal u64");
    uint64_t n=0;
    for(auto c:s) { require(c>='0' && c<='9',"Invalid decimal u64");const auto digit=static_cast<uint64_t>(c-'0');require(n<=(std::numeric_limits<uint64_t>::max()-digit)/10,"Decimal u64 overflow");n=n*10+digit; }
    return n;
}
juce::String decimalU64(uint64_t n) { return juce::String(std::to_string(n)); }
bool boolean(const V& v, const char* key) { auto& x = field(v, key); require(x.isBool(), juce::String("Expected boolean: ") + key); return x; }
const juce::Array<V>& array(const V& v, const char* key) { auto* a = field(v, key).getArray(); require(a != nullptr, juce::String("Expected array: ") + key); return *a; }
juce::File localFile(const juce::String& path) {
    if (path.startsWithIgnoreCase("file:")) { juce::URL url(path); require(url.isLocalFile(), "Only local audio files are supported"); return url.getLocalFile(); }
    require(juce::File::isAbsolutePath(path), "Audio source must be an absolute local path"); return juce::File(path);
}
static juce::String nullable(const V& v, const char* key) { return field(v,key).isVoid() ? juce::String() : text(v,key); }
static bool oneOf(const juce::String& s, std::initializer_list<const char*> values) { for (auto* value : values) if (s == value) return true; return false; }
static Settings settings(const V& v) {
    fields(v, {"warp","warpMode","sourceBpm","transpose","detune","reverse","loop","loopStartBars","loopLengthBars","startMarkerBars","endMarkerBars"});
    Settings s;
    s.warp=boolean(v,"warp"); s.mode=text(v,"warpMode"); require(oneOf(s.mode,{"soundtouch","signalsmith","signalsmith-formant","re-pitch"}),"Invalid warp mode");
    s.sourceBpm=number(v,"sourceBpm",.000001,999); s.transpose=number(v,"transpose",-48,48); s.detune=number(v,"detune",-50,50);
    require(std::floor(s.transpose)==s.transpose && std::floor(s.detune)==s.detune,"Pitch values must be integers");
    s.reverse=boolean(v,"reverse"); s.loop=boolean(v,"loop"); s.loopStart=number(v,"loopStartBars",0,1e12); s.loopLength=number(v,"loopLengthBars",1e-12,1e12);
    s.markerStart=number(v,"startMarkerBars",0,1e12); s.markerEnd=number(v,"endMarkerBars",0,1e12); require(s.markerEnd>s.markerStart,"Invalid source markers"); return s;
}
static Control control(const V& v) {
    fields(v,{"playing","recording","seekBar","seekGeneration"},{"metronome"});
    Control c;c.playing=boolean(v,"playing");c.recording=boolean(v,"recording");c.seekBar=number(v,"seekBar",1,1e12);c.seekGeneration=integer(v,"seekGeneration");if(v.hasProperty("metronome"))c.metronome=boolean(v,"metronome");return c;
}
ControlRequest decodeControl(const V& v) {
    fields(v,{"protocolVersion","sessionId","sequence","controlGeneration","control"},{"command","quantize"});require(integer(v,"protocolVersion")==2,"Unsupported protocol");
    ControlRequest r;static_cast<Control&>(r)=control(field(v,"control"));r.session=text(v,"sessionId");require(r.session.isNotEmpty(),"Empty session");r.sequence=integer(v,"sequence");r.controlGeneration=decimalU64(v,"controlGeneration");
    if(v.hasProperty("command")) {
        const auto& command=field(v,"command");const auto kind=text(command,"kind");LaunchCommand launch;
        if(kind=="clip") { fields(command,{"kind","trackId","sceneId"});launch.kind=LaunchCommand::Kind::clip;launch.track=text(command,"trackId");launch.scene=text(command,"sceneId"); }
        else if(kind=="scene") { fields(command,{"kind","sceneId"});launch.kind=LaunchCommand::Kind::scene;launch.scene=text(command,"sceneId"); }
        else if(kind=="stopTrack") { fields(command,{"kind","trackId"});launch.kind=LaunchCommand::Kind::stopTrack;launch.track=text(command,"trackId"); }
        else if(kind=="stopAll" || kind=="arrangement") { fields(command,{"kind"});launch.kind=kind=="stopAll"?LaunchCommand::Kind::stopAll:LaunchCommand::Kind::arrangement; }
        else require(false,"Invalid launch command");
        if(kind=="clip" || kind=="scene")require(launch.scene.isNotEmpty(),"Empty launch scene identity");
        if(kind=="clip" || kind=="stopTrack")require(launch.track.isNotEmpty(),"Empty launch track identity");
        launch.quantize=boolean(v,"quantize");r.launch=std::move(launch);
    } else require(!v.hasProperty("quantize"),"Quantize requires a launch command");
    return r;
}
NoteRequest decodeNote(const V& v) {
    fields(v,{"protocolVersion","sessionId","sequence","note"});require(integer(v,"protocolVersion")==2,"Unsupported protocol");
    NoteRequest r;r.session=text(v,"sessionId");require(r.session.isNotEmpty(),"Empty session");r.sequence=integer(v,"sequence");require(r.sequence>0,"Note sequence must be positive");
    const auto& n=field(v,"note");fields(n,{"trackId","noteId","pitch","velocity","on"},{"requestedSample"});r.trackId=text(n,"trackId");r.noteId=text(n,"noteId");require(r.trackId.isNotEmpty() && r.noteId.isNotEmpty(),"Empty note identity");
    const auto pitch=integer(n,"pitch"),velocity=integer(n,"velocity");require(pitch<=127 && velocity<=127,"Invalid MIDI note");r.pitch=static_cast<int>(pitch);r.velocity=static_cast<int>(velocity);r.on=boolean(n,"on");if(n.hasProperty("requestedSample"))r.requestedSample=decimalU64(n,"requestedSample");return r;
}
Request decode(const V& v) {
    fields(v,{"protocolVersion","sessionId","sequence","baseRevision","revision","stage","editId","controlGeneration","state"});
    require(integer(v,"protocolVersion")==2,"Unsupported protocol"); Request r;
    r.session=text(v,"sessionId"); require(r.session.isNotEmpty(),"Empty session"); r.sequence=integer(v,"sequence"); r.baseRevision=integer(v,"baseRevision"); r.revision=integer(v,"revision");r.controlGeneration=decimalU64(v,"controlGeneration");
    r.stage=text(v,"stage"); require(oneOf(r.stage,{"open","commit","preview","cancel","recover"}),"Invalid stage"); r.editId=nullable(v,"editId");
    auto& state=field(v,"state"); fields(state,{"project","control"}); auto& p=field(state,"project"); fields(p,{"bpm","numerator","denominator","loop","sources","tracks"},{"launcher"});
    if(p.hasProperty("launcher")) {
        const auto& launcher=field(p,"launcher");fields(launcher,{"scenes","quantization"});
        r.launchQuantization=text(launcher,"quantization");require(oneOf(r.launchQuantization,{"none","eightBars","fourBars","twoBars","bar","half","quarter","eighth","sixteenth"}),"Invalid launch quantization");
        const auto& scenes=array(launcher,"scenes");require(scenes.size()<=256,"Too many scenes");std::set<juce::String> sceneIds;
        for(const auto& scene:scenes) { fields(scene,{"id"});const auto id=text(scene,"id");require(id.isNotEmpty() && sceneIds.insert(id).second,"Invalid scene identity");r.scenes.push_back(id); }
    }
    r.bpm=number(p,"bpm",.000001,999); r.numerator=(int)integer(p,"numerator"); r.denominator=(int)integer(p,"denominator");
    require(r.numerator>=1 && r.numerator<=32 && oneOf(juce::String(r.denominator),{"1","2","4","8","16","32"}),"Invalid time signature"); r.quartersPerBar=r.numerator*4.0/r.denominator;
    auto& loop=field(p,"loop"); fields(loop,{"enabled","startBar","endBar"}); r.loop=boolean(loop,"enabled"); r.loopStart=number(loop,"startBar",1,1e12); r.loopEnd=number(loop,"endBar",1,1e12); require(r.loopEnd>r.loopStart,"Invalid project loop");
    static_cast<Control&>(r)=control(field(state,"control"));
    for (auto& s:array(p,"sources")) {
        fields(s,{"id","uri","sha256","frames","sampleRate","channels"}); Source src;
        src.id=text(s,"id"); src.file=localFile(text(s,"uri")); src.sha=text(s,"sha256"); src.frames=(int64_t)integer(s,"frames"); src.rate=number(s,"sampleRate",1,768000); src.channels=(int)integer(s,"channels");
        require(src.id.isNotEmpty() && src.sha.length()==64 && src.channels>=1 && src.channels<=64 && src.frames>0,"Invalid audio source metadata"); require(r.sources.emplace(src.id,src).second,"Duplicate source ID");
    }
    std::set<juce::String> ids, clipIds, deviceIds;
    for (auto& t:array(p,"tracks")) {
        fields(t,{"id","kind","output","input","inputChannel","outputChannel","monitor","volumeDb","pan","mute","solo","armed","sends","returnPost","cueOutput","cueVolumeDb","clips","automation","childTrackIds","devices"},{"clipSlots"}); Track tr;
        tr.id=text(t,"id"); require(tr.id.isNotEmpty() && ids.insert(tr.id).second,"Duplicate track ID"); tr.kind=text(t,"kind"); require(oneOf(tr.kind,{"audio","midi","group","return","main"}),"Invalid track kind");
        tr.output=text(t,"output"); tr.input=text(t,"input"); tr.inputChannel=nullable(t,"inputChannel"); tr.outputChannel=nullable(t,"outputChannel"); tr.cueOutput=nullable(t,"cueOutput");
        tr.monitor=text(t,"monitor"); require(oneOf(tr.monitor,{"in","auto","off"}),"Invalid monitoring mode");
        tr.volume=number(t,"volumeDb",-160,24); tr.pan=number(t,"pan",-1,1); tr.cueVolume=number(t,"cueVolumeDb",-160,24); tr.mute=boolean(t,"mute"); tr.solo=boolean(t,"solo"); tr.armed=boolean(t,"armed"); tr.returnPost=boolean(t,"returnPost");
        tr.devices=decodeDevices(field(t,"devices"));
        for(const auto& device:tr.devices)require(deviceIds.insert(device.id).second,"Duplicate device ID across tracks");
        for(auto& child:array(t,"childTrackIds")) { require(child.isString(),"Invalid child track ID"); tr.children.push_back(child.toString()); }
        auto& sends=field(t,"sends"); require(sends.isObject(),"Invalid sends"); for(auto& send:sends.getDynamicObject()->getProperties()) { double db=number(sends,send.name.toString().toRawUTF8(),-160,24); tr.sends.emplace(send.name.toString(),db); }
        const auto appendClip=[&](const V& x,const juce::String& scene) {
            Clip cl; cl.id=text(x,"id"); require(cl.id.isNotEmpty() && clipIds.insert(cl.id).second,"Duplicate clip ID"); cl.kind=text(x,"kind");cl.scene=scene;
            require(scene.isEmpty() || !x.hasProperty("startBar"),"Slot content cannot contain arrangement placement");
            cl.start=scene.isEmpty()?number(x,"startBar",1,1e12):1; cl.length=number(x,"lengthBars",1e-12,1e12); cl.offset=number(x,"sourceOffsetBars",-1e12,1e12); cl.mute=boolean(x,"mute"); cl.data=x;
            if(cl.kind=="audio") {
                require(tr.kind=="audio","Audio clip belongs to a non-audio track");
                fields(x,{"id","kind","lengthBars","sourceOffsetBars","mute","sourceId","gainDb","audioSettings","fadeInBars","fadeOutBars","fadeInOffsetBars","fadeOutOffsetBars","fadeInCurve","fadeOutCurve","fadeInCurvePosition","fadeOutCurvePosition"},{"startBar"});
                cl.source=nullable(x,"sourceId"); cl.gain=number(x,"gainDb",-160,24); cl.settings=settings(field(x,"audioSettings"));
                cl.fadeIn=number(x,"fadeInBars",0,cl.length); cl.fadeOut=number(x,"fadeOutBars",0,cl.length); cl.fadeInOffset=number(x,"fadeInOffsetBars",0,cl.length); cl.fadeOutOffset=number(x,"fadeOutOffsetBars",0,cl.length);
                cl.fadeInCurve=number(x,"fadeInCurve",-1,1); cl.fadeOutCurve=number(x,"fadeOutCurve",-1,1); cl.fadeInPosition=number(x,"fadeInCurvePosition",.1,.9); cl.fadeOutPosition=number(x,"fadeOutCurvePosition",.1,.9);
                require(cl.fadeInOffset+cl.fadeIn+cl.fadeOutOffset+cl.fadeOut<=cl.length+1e-9,"Overlapping fade bounds");
            } else if(cl.kind=="midi") {
                require(tr.kind=="midi","MIDI clip belongs to a non-MIDI track"); fields(x,{"id","kind","lengthBars","sourceOffsetBars","mute","notes","loopBars"},{"startBar"}); number(x,"loopBars",1e-12,1e12);
                for(auto& n:array(x,"notes")) { fields(n,{"pitch","startBeat","lengthBeats","velocity"},{"id"}); auto pitch=number(n,"pitch",0,127); require(std::floor(pitch)==pitch,"Invalid MIDI pitch"); number(n,"startBeat",0,1e12); number(n,"lengthBeats",1e-12,1e12); number(n,"velocity",0,127); }
            } else require(false,"Invalid clip kind");
            tr.clips.push_back(std::move(cl));
        };
        for(const auto& clip:array(t,"clips"))appendClip(clip,{});
        if(t.hasProperty("clipSlots")) {
            std::set<juce::String> slots;
            for(const auto& slot:array(t,"clipSlots")) {
                fields(slot,{"sceneId","clip"});const auto scene=text(slot,"sceneId");
                require(std::find(r.scenes.begin(),r.scenes.end(),scene)!=r.scenes.end() && slots.insert(scene).second,"Invalid slot scene");
                appendClip(field(slot,"clip"),scene);
            }
        }
        tr.automation=field(t,"automation");
        for(auto& lane:array(t,"automation")) {
            fields(lane,{"id","target","points"}); text(lane,"id"); auto& target=field(lane,"target"); auto kind=text(target,"kind");
            if(kind=="mixer") { fields(target,{"kind","parameter"}); require(oneOf(text(target,"parameter"),{"volume","pan"}),"Invalid mixer automation"); }
            else {
                require(kind=="device","Invalid automation target");fields(target,{"kind","deviceId","parameter"});
                const auto id=text(target,"deviceId"),parameter=text(target,"parameter");
                const auto device=std::find_if(tr.devices.begin(),tr.devices.end(),[&](const Device& item){return item.id==id;});
                require(device!=tr.devices.end(),"Unknown device automation target");
                if(const auto* external=std::get_if<ExternalSettings>(&device->settings)) {
                    const auto nativeId=decimalU64(target,"parameter");
                    require(std::any_of(external->parameters.begin(),external->parameters.end(),[&](const auto& item){return item.id==nativeId;}),"Unknown external automation parameter");
                    for(const auto& point:array(lane,"points"))number(point,"value",0,1);
                } else {
                    const auto parameters=deviceParameters(device->settings);
                    const auto spec=std::find_if(parameters.begin(),parameters.end(),[&](const DeviceParameterSpec& item){return parameter==item.id;});
                    require(spec!=parameters.end(),"Unknown device automation parameter");
                    for(const auto& point:array(lane,"points"))number(point,"value",spec->minimum,spec->maximum);
                }
            }
            double previous=-1; for(auto& point:array(lane,"points")) { fields(point,{"id","bar","value"},{"curve"}); text(point,"id"); double bar=number(point,"bar",1,1e12); require(bar>=previous,"Unsorted automation points"); previous=bar; number(point,"value",-1e12,1e12); if(point.hasProperty("curve")) number(point,"curve",-1,1); }
        }
        r.tracks.push_back(std::move(tr));
    }
    std::map<juce::String,Track*> tracks; int mains=0;
    for(auto& t:r.tracks) { tracks[t.id]=&t; mains+=t.kind=="main"; } require(mains==1,"Project must have one main track");
    for(auto& t:r.tracks) {
        require(oneOf(t.input,{"none","external","all"}) || tracks.count(t.input),"Unknown input route");
        require(oneOf(t.output,{"none","external"}) || tracks.count(t.output),"Unknown output route");
        if(tracks.count(t.output)) require(t.output!=t.id && tracks.at(t.output)->kind!="midi","Invalid output route");
        for(auto& [id,db]:t.sends) require(tracks.count(id) && tracks.at(id)->kind=="return" && id!=t.id,"Invalid return route");
        for(auto& id:t.children) require(t.kind=="group" && tracks.count(id) && id!=t.id,"Invalid group membership");
    }
    std::map<juce::String,std::vector<juce::String>> edges;
    for(auto& t:r.tracks) { if(tracks.count(t.output))edges[t.id].push_back(t.output);for(auto& [id,db]:t.sends)edges[t.id].push_back(id);if(tracks.count(t.input))edges[t.input].push_back(t.id); }
    std::map<juce::String,int> visiting;
    std::function<void(const juce::String&)> visit=[&](const juce::String& id) { require(visiting[id]!=1,"Routing cycle");if(visiting[id]==2)return;visiting[id]=1;for(auto& target:edges[id])visit(target);visiting[id]=2; };
    for(auto& t:r.tracks)visit(t.id);
    for(auto& t:r.tracks)t.effectiveSolo=t.solo;
    for(size_t pass=0;pass<r.tracks.size();++pass) {
        bool changed=false;
        for(auto& t:r.tracks)if(t.effectiveSolo)for(auto& child:t.children) {
            auto* track=tracks.at(child);
            if(!track->effectiveSolo) { track->effectiveSolo=true;changed=true; }
        }
        if(!changed)break;
    }
    return r;
}
static bool liveClipField(const juce::Identifier& name) {
    const auto& field=name.toString();
    return field=="gainDb" || field=="mute" || field=="fadeInBars" || field=="fadeOutBars" || field=="fadeInOffsetBars" || field=="fadeOutOffsetBars" || field=="fadeInCurve" || field=="fadeOutCurve" || field=="fadeInCurvePosition" || field=="fadeOutCurvePosition";
}
static bool equivalent(const V& a,const V& b,bool ignoreLiveClipFields=false,bool allowClipPlacement=false) {
    if(auto* lhs=a.getDynamicObject()) {
        auto* rhs=b.getDynamicObject();if(!rhs)return false;
        const auto& properties=lhs->getProperties();if(properties.size()!=rhs->getProperties().size())return false;
        for(auto& property:properties) {
            if(ignoreLiveClipFields && liveClipField(property.name))continue;
            if(ignoreLiveClipFields && allowClipPlacement && (property.name.toString()=="startBar" || property.name.toString()=="lengthBars" || property.name.toString()=="sourceOffsetBars"))continue;
            if(ignoreLiveClipFields && allowClipPlacement && property.name.toString()=="audioSettings") {
                const auto* left=property.value.getDynamicObject();const auto* right=rhs->getProperty(property.name).getDynamicObject();
                if(!left || !right || left->getProperties().size()!=right->getProperties().size())return false;
                for(const auto& setting:left->getProperties()) {
                    if(setting.name.toString()=="transpose" || setting.name.toString()=="detune" || setting.name.toString()=="startMarkerBars" || setting.name.toString()=="endMarkerBars" || setting.name.toString()=="loop" || setting.name.toString()=="loopStartBars" || setting.name.toString()=="loopLengthBars" || setting.name.toString()=="warp" || setting.name.toString()=="warpMode" || setting.name.toString()=="sourceBpm" || setting.name.toString()=="reverse")continue;
                    if(!right->hasProperty(setting.name) || !equivalent(setting.value,right->getProperty(setting.name)))return false;
                }
                continue;
            }
            if(!rhs->hasProperty(property.name) || !equivalent(property.value,rhs->getProperty(property.name)))return false;
        }
        return true;
    }
    if(auto* lhs=a.getArray()) {
        auto* rhs=b.getArray();if(!rhs || lhs->size()!=rhs->size())return false;
        for(int i=0;i<lhs->size();++i)if(!equivalent(lhs->getReference(i),rhs->getReference(i)))return false;
        return true;
    }
    return a==b;
}
bool sameGraph(const Request& a,const Request& b,bool allowClipPlacement) {
    if((!allowClipPlacement && a.bpm!=b.bpm) || a.numerator!=b.numerator || a.denominator!=b.denominator || (!allowClipPlacement && (a.sources.size()!=b.sources.size() || a.tracks.size()!=b.tracks.size())))return false;
    for(const auto& [id,lhs]:a.sources) {
        const auto found=b.sources.find(id);
        if(found==b.sources.end()) { if(allowClipPlacement)continue;return false; }
        const auto& rhs=found->second;
        if(lhs.file!=rhs.file || lhs.sha!=rhs.sha || lhs.frames!=rhs.frames || lhs.rate!=rhs.rate || lhs.channels!=rhs.channels)return false;
    }
    for(const auto& lhs:a.tracks) {
        const auto found=std::find_if(b.tracks.begin(),b.tracks.end(),[&](const Track& track){return track.id==lhs.id;});
        if(found==b.tracks.end()) {
            if(!allowClipPlacement || lhs.kind=="main")return false;
            for(const auto& clip:lhs.clips)for(const auto& oldTrack:b.tracks)for(const auto& old:oldTrack.clips)if(clip.id==old.id) {
                if(clip.kind=="midi" && old.kind=="midi")continue;
                if(old.kind!="audio" || a.sources.contains(clip.source)!=b.sources.contains(clip.source) || !equivalent(clip.data,old.data,true,true))return false;
            }
            continue;
        }
        const auto& rhs=*found;
        if(lhs.kind!=rhs.kind && (!allowClipPlacement || !oneOf(lhs.kind,{"audio","midi"}) || !oneOf(rhs.kind,{"audio","midi"})))return false;
        if(lhs.id!=rhs.id || (!allowClipPlacement && (lhs.output!=rhs.output || lhs.outputChannel!=rhs.outputChannel || lhs.returnPost!=rhs.returnPost || lhs.children!=rhs.children || lhs.cueOutput!=rhs.cueOutput || lhs.input!=rhs.input || lhs.inputChannel!=rhs.inputChannel || lhs.monitor!=rhs.monitor || lhs.armed!=rhs.armed)) || (!allowClipPlacement && (lhs.sends.size()!=rhs.sends.size() || lhs.clips.size()!=rhs.clips.size())))return false;
        if(!allowClipPlacement) {
            if(lhs.devices.size()!=rhs.devices.size())return false;
            for(size_t index=0;index<lhs.devices.size();++index)if(lhs.devices[index].id!=rhs.devices[index].id || lhs.devices[index].settings.index()!=rhs.devices[index].settings.index())return false;
        }
        if(!allowClipPlacement && !equivalent(lhs.automation,rhs.automation))return false;
        if(!allowClipPlacement) { auto rhsSend=rhs.sends.begin();for(auto& [id,gain]:lhs.sends)if(id!=(rhsSend++)->first)return false; }
        for(size_t clip=0;clip<lhs.clips.size();++clip) {
            const auto& left=lhs.clips[clip];
            const Clip* rightClip=clip<rhs.clips.size()?&rhs.clips[clip]:nullptr;
            if(allowClipPlacement && (!rightClip || left.id!=rightClip->id)) {
                rightClip=nullptr;
                for(const auto& oldTrack:b.tracks) {
                    const auto found=std::find_if(oldTrack.clips.begin(),oldTrack.clips.end(),[&](const Clip& candidate){return candidate.id==left.id;});
                    if(found!=oldTrack.clips.end()) { rightClip=&*found;break; }
                }
                if(!rightClip)continue;
            }
            const auto& right=*rightClip;
            if(left.scene.isEmpty()!=right.scene.isEmpty())return false;
            if(allowClipPlacement && left.kind=="midi" && right.kind=="midi")continue;
            if(!allowClipPlacement && left.scene!=right.scene)return false;
            if(left.kind=="audio" && a.sources.contains(left.source)!=b.sources.contains(left.source))return false;
            if(!equivalent(left.data,right.data,left.kind=="audio" && right.kind=="audio",allowClipPlacement))return false;
        }
    }
    return true;
}
V result(const ControlRequest& r,uint64_t revision,bool accepted,const char* code) { auto v=object();put(v,"kind",accepted?"accepted":"rejected");put(v,"sessionId",r.session);put(v,"sequence",(juce::int64)r.sequence);put(v,"controlGeneration",decimalU64(r.controlGeneration));if(accepted)put(v,"revision",(juce::int64)revision);else put(v,"code",code);return v; }
V result(const Request& r,bool accepted,const char* code) { return result(r,r.revision,accepted,code); }
V noteResult(const NoteRequest& r,bool accepted,const char* code) { auto v=object();put(v,"kind",accepted?"accepted":"rejected");put(v,"sessionId",r.session);put(v,"sequence",(juce::int64)r.sequence);if(!accepted)put(v,"code",code);return v; }
V issue(const char* code,const juce::String& message,const juce::String& source,const juce::String& track,const juce::String& clip) { auto v=object();put(v,"code",code);put(v,"message",message);if(source.isNotEmpty())put(v,"sourceId",source);if(track.isNotEmpty())put(v,"trackId",track);if(clip.isNotEmpty())put(v,"clipId",clip);return v; }
}
