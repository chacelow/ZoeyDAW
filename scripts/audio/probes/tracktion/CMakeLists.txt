cmake_minimum_required(VERSION 3.22)
project(TracktionProbe VERSION 1.0.0 LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
add_subdirectory(source/modules/juce juce)
add_subdirectory(source/modules tracktion)
juce_add_console_app(TracktionProbe PRODUCT_NAME "TracktionProbe")
juce_generate_juce_header(TracktionProbe)
target_sources(TracktionProbe PRIVATE main.cpp)
target_compile_definitions(TracktionProbe PRIVATE
    JUCE_USE_CURL=0 JUCE_WEB_BROWSER=0 JUCE_MODAL_LOOPS_PERMITTED=1
    JUCE_PLUGINHOST_AU=0 JUCE_PLUGINHOST_VST3=0 JUCE_PLUGINHOST_LADSPA=0
    TRACKTION_ENABLE_TIMESTRETCH_SOUNDTOUCH=1 TRACKTION_ENABLE_TIMESTRETCH_RUBBERBAND=0
    TRACKTION_ENABLE_TIMESTRETCH_ELASTIQUE=0 TRACKTION_LOG_DEVICES=0
    PROBE_COMPILER="${CMAKE_CXX_COMPILER_ID}-${CMAKE_CXX_COMPILER_VERSION}"
    PROBE_CMAKE="${CMAKE_VERSION}")
target_link_libraries(TracktionProbe PRIVATE tracktion::tracktion_engine
    tracktion::tracktion_graph tracktion::tracktion_core juce::juce_cryptography)
if(APPLE)
    target_compile_options(TracktionProbe PRIVATE -fno-aligned-allocation)
endif()
