void testSourceGraphPublication() {
    EngineSession session;auto request=fixture();accepted(apply(session,request),0);
    auto* edit=MixerTestAccess::edit(session);
    te::graph::PlayHead playHead;te::graph::PlayHeadState playHeadState(playHead);
    te::ProcessState process(playHeadState,edit->tempoSequence);
    const auto publish=[](te::CreateNodeParams& params) {
        beginAllocationGuard();params.graphPosted();const auto allocations=endAllocationGuard();
        require(allocations==0,"Source graph metadata publication allocated after graph became visible");
    };
    require(!MixerTestAccess::sourceGraph(session,*edit),"Stopped fixture unexpectedly published a source graph");
    std::weak_ptr<const SourcePlayheadGraph> first;
    {
        te::CreateNodeParams params{process};MixerTestAccess::configureSourceGraph(session,*edit,params);
        require(!MixerTestAccess::sourceGraph(session,*edit),"Source candidate became visible during preparation");
        publish(params);first=MixerTestAccess::sourceGraph(session,*edit);
    }
    auto original=first.lock();require(original!=nullptr,"Initial source graph was not retained");
    {
        te::CreateNodeParams cancelled{process};MixerTestAccess::configureSourceGraph(session,*edit,cancelled);
        require(MixerTestAccess::sourceGraph(session,*edit)==original,"Unpublished candidate replaced source observations");
    }
    bool rejected=false;beginAllocationFailure(0);
    try {
        te::CreateNodeParams failed{process};MixerTestAccess::configureSourceGraph(session,*edit,failed);
    } catch(const std::bad_alloc&) { rejected=true; }
    const bool injected=endAllocationFailure();
    require(injected && rejected && MixerTestAccess::sourceGraph(session,*edit)==original,"Failed source preparation replaced the published graph");
    {
        te::CreateNodeParams replacement{process};MixerTestAccess::configureSourceGraph(session,*edit,replacement);
        require(MixerTestAccess::sourceGraph(session,*edit)==original,"Replacement became visible before publication");
        publish(replacement);
        require(MixerTestAccess::sourceGraph(session,*edit)!=original,"Source graph replacement retained the previous observations");
    }
    original.reset();require(first.expired(),"Source graph replacement leaked retired observations");
    std::cout<<"Source graph publication: zero allocation, preparation failure/cancellation preserve identity, retired observations released\n";
}
