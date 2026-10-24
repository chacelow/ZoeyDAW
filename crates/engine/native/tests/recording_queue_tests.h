void testRecordingQueue() {
    EngineSession session;MixerTestAccess::initialiseHostedInput(session);
    auto request=fixture();accepted(apply(session,request),0);auto& engine=MixerTestAccess::edit(session)->engine;
    auto& thread=engine.getWaveInputRecordingThread();
    juce::TemporaryFile destination(".wav");
    {
        te::WaveInputRecordingThread::ScopedInitialiser recording(thread);
        te::AudioFileWriter writer(te::AudioFile(engine,destination.getFile()),engine.getAudioFileFormatManager().getWavFormat(),1,48000,24,{},0);
        require(writer.isOpen(),"Recording queue fixture writer failed");
        juce::AudioBuffer<float> input(1,1024);for(int sample=0;sample<1024;++sample)input.setSample(0,sample,sample%2?.25f:-.25f);
        beginAllocationGuard();thread.addBlockToRecord(writer,input,0,1024,{});const auto allocations=endAllocationGuard();
        require(allocations==0,"Recording enqueue allocated for oversized input block");
        thread.waitForWriterToFinish(writer);require(!thread.hasFailed(),"Recording queue rejected bounded normal write");writer.closeForWriting();
    }
    std::unique_ptr<juce::AudioFormatReader> reader(engine.getAudioFileFormatManager().readFormatManager.createReaderFor(destination.getFile()));
    require(reader && reader->lengthInSamples==1024 && reader->numChannels==1 && reader->sampleRate==48000,"Recording queue changed file dimensions");
    juce::AudioBuffer<float> recorded(1,1024);require(reader->read(&recorded,0,1024,0,true,false),"Cannot read finalized recording");
    for(int sample=0;sample<1024;++sample)require(std::abs(recorded.getSample(0,sample)-(sample%2?.25f:-.25f))<1e-6,"Recording queue corrupted PCM");
    reader.reset();
    juce::TemporaryFile overflowDestination(".wav");
    {
        te::WaveInputRecordingThread::ScopedInitialiser recording(thread);
        te::AudioFileWriter writer(te::AudioFile(engine,overflowDestination.getFile()),engine.getAudioFileFormatManager().getWavFormat(),1,48000,24,{},0);
        require(writer.isOpen(),"Overflow fixture writer failed");
        juce::AudioBuffer<float> input(1,256*1024);input.clear();
        beginAllocationGuard();thread.addBlockToRecord(writer,input,0,input.getNumSamples(),{});const auto allocations=endAllocationGuard();
        require(allocations==0 && thread.hasFailed() && thread.getOverrunCount()>0,"Recording overload grew queue or lost failure state");
        thread.waitForWriterToFinish(writer);writer.closeForWriting();
    }
    require(thread.hasFailed(),"Recording failure disappeared before finalization could inspect it");
    juce::TemporaryFile failedDestination(".wav");
    {
        te::WaveInputRecordingThread::ScopedInitialiser recording(thread);
        require(!thread.hasFailed() && thread.getOverrunCount()==0,"New recording did not reset previous writer failure");
        te::AudioFileWriter writer(te::AudioFile(engine,failedDestination.getFile()),engine.getAudioFileFormatManager().getWavFormat(),1,48000,24,{},0);
        require(writer.isOpen(),"Failure fixture writer failed to open");writer.closeForWriting();
        juce::AudioBuffer<float> input(1,256);input.clear();thread.addBlockToRecord(writer,input,0,256,{});thread.waitForWriterToFinish(writer);
        require(thread.hasFailed() && thread.getOverrunCount()==0,"Disk writer failure was mistaken for complete recording");
    }
}
