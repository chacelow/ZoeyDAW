#include "meter_bank.h"
#include <array>
#include <cmath>
#include <iostream>
#include <stdexcept>
#include <limits>

void check(bool value, const char* message) { if (!value) throw std::runtime_error(message); }
void resetRegression() {
    auto bank = std::make_shared<zp::MeterBank>(zp::MeterBankIdentity{1, 1, 1}, 1);
    auto reader = zp::MeterReadHandle::acquire(bank, bank->identity);
    auto& tap = *bank->tap(0);
    zp::MeterPublication result;
    std::array<float, 1> samples {1.25f};
    tap.process(samples, 0);
    check(tap.requestReset(1, zp::MeterReset::all), "Initial all reset refused");
    check(tap.requestReset(2, zp::MeterReset::hold), "Following hold reset refused");
    samples[0] = 0;
    tap.process(samples, 1);
    check(reader->read(0, result) && result.slotResetEpoch == 2 && result.sessionPeak == 0 && result.sessionClipCount == 0, "Coalesced reset lost earlier all request");
    samples[0] = .75f;
    tap.process(samples, 2);
    tap.requestReset(3, zp::MeterReset::clip);
    samples[0] = 0;
    tap.process(samples, 3);
    check(reader->read(0, result) && result.current.count == 2 && result.current.sumSquares == .5625 && result.current.peak == .75f, "Clip reset discarded pending energy");
    samples[0] = std::numeric_limits<float>::quiet_NaN();
    tap.process(samples, 4);
    check(reader->read(0, result) && !result.available, "Nonfinite block reported available");
    samples[0] = .25f;
    tap.process(samples, 5);
    check(reader->read(0, result) && result.available && result.current.count == 1 && result.current.sumSquares == .0625, "Clean epoch did not recover from nonfinite input");
    for (const float afterReset : {0.0f, .75f}) {
        auto delayedBank = std::make_shared<zp::MeterBank>(zp::MeterBankIdentity{1, 1, 1}, 1);
        auto delayedReader = zp::MeterReadHandle::acquire(delayedBank, delayedBank->identity);
        auto& delayed = *delayedBank->tap(0);
        std::array<float, 2> before {1.25f, .75f - afterReset};
        delayed.process(before, 0);
        delayed.requestReset(1, zp::MeterReset::hold);
        samples[0] = afterReset;
        delayed.process(samples, 2);
        check(delayedReader->read(0, result) && result.current.peak == 1.25f && result.current.displayPeak == afterReset && result.current.holdResetEpoch == 1, "Hold reset lost post-reset peak tail");
        samples[0] = 0;
        delayed.process(samples, 3);
        check(delayedReader->read(0, result) && result.completed.displayPeak == afterReset && result.current.displayPeak == 0, "Display peak did not rotate with acknowledged interval");
    }
}
int main() {
    try {
        resetRegression();
        auto bank = std::make_shared<zp::MeterBank>(zp::MeterBankIdentity{1, 2, 3}, 2);
        check(!zp::MeterReadHandle::acquire(bank, {1, 3, 3}), "Wrong generation acquired");
        auto handle = zp::MeterReadHandle::acquire(bank, {1, 2, 3});
        std::array<float, 480> dc;
        dc.fill(.25f);
        check(!zp::MeterReadHandle::acquire(bank, {1, 2, 3}), "Multiple consumers acquired SPSC bank");
        for (int block = 0; block < 120; ++block) bank->tap(0)->process(dc, block * dc.size());
        zp::MeterPublication result;
        check(handle->read(0, result), "No DC publication");
        check(result.current.count == 57600 && result.current.peak == .25f, "Delayed reader lost DC samples");
        check(std::abs(std::sqrt(result.current.sumSquares / result.current.count) - .25) < 1e-9, "Wrong DC energy");
        const auto firstEpoch = result.current.id;
        bank->tap(0)->process(dc, 57600);
        check(handle->read(0, result), "No rotated publication");
        check(result.completedValid && result.completed.id == firstEpoch && result.completed.count == 57600, "Rotation lost completed epoch");
        dc.fill(.125f);
        bank->tap(0)->process(dc, 58080);
        check(handle->read(0, result), "No subsequent peak");
        check(result.completed.peak == .25f && result.current.peak == .125f, "Smaller subsequent peak lost at epoch exchange");
        std::array<float, 480> sine;
        for (unsigned sample = 0; sample < sine.size(); ++sample) sine[sample] = std::sin(2 * 3.141592653589793 * sample / 48);
        bank->tap(1)->process(sine, 0);
        check(handle->read(1, result), "No sine publication");
        check(std::abs(std::sqrt(result.current.sumSquares / result.current.count) - std::sqrt(.5)) < 1e-7, "Wrong sine energy");
        dc.fill(0); dc[0] = 1.25f;
        bank->tap(0)->process(dc, 58560);
        dc[0] = 0;
        for (int block = 0; block < 120; ++block) bank->tap(0)->process(dc, 59040 + block * dc.size());
        check(handle->read(0, result) && result.sessionPeak == 1.25f && result.sessionClipCount == 1, "Delayed reader lost transient latch");
        check(bank->tap(0)->requestReset(7, zp::MeterReset::all), "Reset refused");
        check(!bank->tap(0)->requestReset(6, zp::MeterReset::all), "Stale reset accepted");
        bank->tap(0)->process(dc, 116640);
        check(handle->read(0, result) && result.slotResetEpoch == 7 && result.sessionPeak == 0 && result.sessionClipCount == 0, "Reset not adopted at audio block");
        bank->tap(1)->process(sine, 480);
        check(handle->read(1, result) && result.slotResetEpoch == 0 && result.sessionPeak == 1, "Selective reset cleared another slot");
        handle.reset();
        handle = zp::MeterReadHandle::acquire(bank, bank->identity);
        check(handle != nullptr, "Released consumer could not reacquire");
        bank->tap(1)->process(sine, 960);
        bank.reset();
        check(handle->read(1, result) && result.current.peak == 1, "Handle did not retain readable retired bank");
        check(!handle->read(4, result), "Out-of-range slot read");
        std::cout << "DC/sine energy, delayed transient, epoch rollover, selective reset and generation lifetime passed\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
