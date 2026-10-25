void testBuiltinProcessingStateReuse(tracktion::Edit& edit) {
    const auto constant=[](int, int) { return .25f; };
    {
        BuiltinDspHarness active(edit,"utility",zp::UtilitySettings{});
        BuiltinDspHarness reference(edit,"utility",zp::UtilitySettings{});
        active.render(256,constant);reference.render(256,constant);
        BuiltinDspHarness candidate(edit,"utility",zp::UtilitySettings{-6.020599913f,0,100},active.plugin);
        const auto before=active.render(256,constant), expectedBefore=reference.render(256,constant);
        for(size_t channel=0;channel<2;++channel)require(builtinDspDifference(before[channel],expectedBefore[channel])<.000001,"Candidate preparation changed the active Utility state");
        reference.device.settings=zp::UtilitySettings{-6.020599913f,0,100};reference.update();
        const auto adopted=candidate.render(1024,constant), expected=reference.render(1024,constant);
        for(size_t channel=0;channel<2;++channel)require(builtinDspDifference(adopted[channel],expected[channel])<.00001,"Retained Utility did not preserve its ramp across graph adoption");
        require(std::abs(adopted[0].back()-.125f)<.000001,"Retained Utility did not reach its candidate gain");
    }
    {
        const zp::DelaySettings settings{50,.5f,1};
        BuiltinDspHarness active(edit,"delay",settings),reference(edit,"delay",settings);
        const auto impulse=[](int channel,int sample) { return sample==0?(channel==0?.25f:.5f):0.0f; };
        active.render(512,impulse);reference.render(512,impulse);
        BuiltinDspHarness candidate(edit,"delay",settings,active.plugin);
        const auto before=active.silence(512),expectedBefore=reference.silence(512);
        for(size_t channel=0;channel<2;++channel)require(builtinDspDifference(before[channel],expectedBefore[channel])<.000001,"Candidate preparation changed the active delay history");
        active.plugin.deinitialise();
        const auto tail=candidate.silence(4096),expected=reference.silence(4096);
        require(builtinDspEnergy(expected[0])>.01,"Delay reference did not retain the seeded impulse");
        for(size_t channel=0;channel<2;++channel)require(builtinDspDifference(tail[channel],expected[channel])<.000001,"Retained Delay lost its tail when the old graph released its wrapper");
        const auto continued=candidate.silence(4096),expectedContinued=reference.silence(4096);
        for(size_t channel=0;channel<2;++channel)require(builtinDspDifference(continued[channel],expectedContinued[channel])<.000001,"Retained Delay history diverged after adoption");
    }
    {
        const zp::DelaySettings settings{50,.5f,1};
        BuiltinDspHarness active(edit,"delay",settings),reference(edit,"delay",settings);
        const auto impulse=[](int,int sample) { return sample==0?.25f:0.0f; };
        active.render(512,impulse);reference.render(512,impulse);
        BuiltinDspHarness candidate(edit,"delay",settings,active.plugin);
        active.plugin.reset();active.plugin.deinitialise();reference.plugin.reset();
        const auto resetTail=candidate.silence(4096),expected=reference.silence(4096);
        for(size_t channel=0;channel<2;++channel)require(builtinDspDifference(resetTail[channel],expected[channel])<.000001 && builtinDspEnergy(resetTail[channel])==0,"Pending reset was lost when the previous graph released its wrapper");
    }
    struct Format { double rate;int block; };
    for(const auto format:{Format{96000,512},Format{48000,512}}) {
        BuiltinDspHarness active(edit,"utility",zp::UtilitySettings{}),reference(edit,"utility",zp::UtilitySettings{});
        active.render(256,constant);reference.render(256,constant);
        BuiltinDspHarness candidate(edit,"utility",zp::UtilitySettings{-6.020599913f,0,100},active.plugin,format.rate,format.block);
        const auto unaffected=active.render(256,constant),expected=reference.render(256,constant);
        for(size_t channel=0;channel<2;++channel)require(builtinDspDifference(unaffected[channel],expected[channel])<.000001,"Incompatible candidate format modified the original processor");
        const auto prepared=candidate.render(512,constant);
        for(const auto& channel:prepared)for(float sample:channel)require(std::abs(sample-.125f)<.000001,"New processor format did not use its independently prepared target");
    }
    std::cout<<"Builtin candidate processing state: Utility preparation isolated, ramp and Delay tail retained, old wrapper release isolated, incompatible formats independent\n";
}
