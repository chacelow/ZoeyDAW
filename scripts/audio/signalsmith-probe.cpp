#include <algorithm>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>
#include "signalsmith-stretch/signalsmith-stretch.h"

static std::uint16_t u16(const unsigned char *p) { return p[0] | (std::uint16_t(p[1]) << 8); }
static std::uint32_t u32(const unsigned char *p) { return u16(p) | (std::uint32_t(u16(p + 2)) << 16); }
static void put16(std::ostream &out, std::uint16_t value) {
  const char bytes[] = {char(value), char(value >> 8)};
  out.write(bytes, 2);
}
static void put32(std::ostream &out, std::uint32_t value) {
  put16(out, value);
  put16(out, value >> 16);
}

int main(int argc, char **argv) {
  try {
    if (argc != 4) throw std::runtime_error("Usage: signalsmith-probe input-pcm16.wav output-float.wav durationRatio");
    const double ratio = std::stod(argv[3]);
    if (!std::isfinite(ratio) || ratio <= 0) throw std::runtime_error("Invalid ratio");
    std::ifstream source(argv[1], std::ios::binary);
    unsigned char header[44];
    source.read(reinterpret_cast<char *>(header), 44);
    if (!source || std::string(reinterpret_cast<char *>(header), 4) != "RIFF" || std::string(reinterpret_cast<char *>(header + 36), 4) != "data" || u16(header + 20) != 1 || u16(header + 34) != 16) throw std::runtime_error("Only generated canonical PCM16 fixtures are accepted");
    const auto channels = u16(header + 22);
    const auto rate = u32(header + 24);
    if (channels == 0 || channels > 2 || rate != 48000) throw std::runtime_error("Unexpected fixture layout");
    const auto frames = u32(header + 40) / (channels * 2);
    std::vector<unsigned char> raw(frames * channels * 2);
    source.read(reinterpret_cast<char *>(raw.data()), raw.size());
    if (!source) throw std::runtime_error("Truncated fixture");
    const auto outputFrames = std::size_t(std::llround(frames * ratio));
    signalsmith::stretch::SignalsmithStretch<float> stretch;
    stretch.presetDefault(channels, rate);
    stretch.setTransposeFactor(1);
    const auto extra = stretch.inputLatency() + stretch.outputLatency() + stretch.blockSamples() * 4;
    std::vector<std::vector<float>> input(channels, std::vector<float>(frames + extra));
    std::vector<std::vector<float>> output(channels, std::vector<float>(outputFrames));
    std::vector<const float *> inputs(channels);
    std::vector<float *> outputs(channels);
    for (std::size_t channel = 0; channel < channels; channel++) {
      for (std::size_t frame = 0; frame < frames; frame++) input[channel][frame] = std::int16_t(u16(raw.data() + (frame * channels + channel) * 2)) / 32768.0f;
      inputs[channel] = input[channel].data();
      outputs[channel] = output[channel].data();
    }
    stretch.exact(inputs, frames, outputs, outputFrames);
    std::ofstream destination(argv[2], std::ios::binary);
    const auto dataBytes = std::uint32_t(outputFrames * channels * 4);
    destination.write("RIFF", 4); put32(destination, 36 + dataBytes); destination.write("WAVEfmt ", 8);
    put32(destination, 16); put16(destination, 3); put16(destination, channels); put32(destination, rate);
    put32(destination, rate * channels * 4); put16(destination, channels * 4); put16(destination, 32);
    destination.write("data", 4); put32(destination, dataBytes);
    for (std::size_t frame = 0; frame < outputFrames; frame++) {
      for (std::size_t channel = 0; channel < channels; channel++) {
        const float sample = output[channel][frame];
        destination.write(reinterpret_cast<const char *>(&sample), sizeof(sample));
      }
    }
    if (!destination) throw std::runtime_error("Output write failed");
    return 0;
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
