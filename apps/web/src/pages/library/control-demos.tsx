import { useState } from "react"
import { useTranslation } from "@zoeymind/i18n"
import { DragPadBar, DragPadBipolar, DragPadNumber, DragPadToggle } from "@zoeymind/ui"
import { ControlSizingDemo } from "./ControlSizingDemo"
import { GallerySection, ValueEcho } from "./gallery-section"
import { ControlStateVariants } from "./control-state-variants"

export function ControlDemos() {
  const { t } = useTranslation()
  const [bpm, setBpm] = useState(140)
  const [position, setPosition] = useState(1)
  const [volume, setVolume] = useState(0.75)
  const [send, setSend] = useState(0.3)
  const [pan, setPan] = useState(0)
  const [gain, setGain] = useState(0)
  const [link, setLink] = useState(false)
  const [mute, setMute] = useState(false)
  const [solo, setSolo] = useState(true)
  const panFormat = (value: number) =>
    value === 0
      ? t("library.controls.center")
      : `${t(value > 0 ? "library.controls.right" : "library.controls.left")}${Math.round(Math.abs(value) * 50)}`
  return (
    <>
      <GallerySection id="numbers">
        <div className="gap-control-gap flex flex-wrap items-center">
          <DragPadNumber
            value={bpm}
            onChange={setBpm}
            min={20}
            max={999}
            step={0.01}
            label={t("library.controls.bpm")}
            format={value => value.toFixed(2)}
            defaultValue={120}
            sensitivity={0.0015}
          />
          <DragPadNumber
            value={position}
            onChange={setPosition}
            min={1}
            max={9999}
            step={1}
            label={t("library.controls.position")}
            defaultValue={1}
            format={value => `${Math.max(1, Math.round(value))}.1.1`}
          />
        </div>
        <ValueEcho
          pairs={[
            [t("library.controls.bpm"), bpm.toFixed(2)],
            [t("library.controls.position"), `${Math.round(position)}.1.1`],
          ]}
        />
        <ControlStateVariants kind="numbers" />
      </GallerySection>
      <GallerySection id="bars">
        <div className="gap-control-gap flex flex-wrap items-center">
          <DragPadBar
            value={volume}
            onChange={setVolume}
            min={0}
            max={1}
            step={0.001}
            label={t("library.controls.volume")}
            defaultValue={0.75}
            format={value => `${Math.round(value * 100)}`}
          />
          <DragPadBar
            value={send}
            onChange={setSend}
            min={0}
            max={1}
            step={0.001}
            label={t("library.controls.send")}
            color="var(--chart-2)"
            defaultValue={0}
            format={value => `${Math.round(value * 100)}`}
          />
        </div>
        <ValueEcho
          pairs={[
            [t("library.controls.volume"), `${Math.round(volume * 100)}%`],
            [t("library.controls.send"), `${Math.round(send * 100)}%`],
          ]}
        />
        <ControlStateVariants kind="bars" />
      </GallerySection>
      <GallerySection id="bipolar">
        <div className="gap-control-gap flex flex-wrap items-center">
          <DragPadBipolar
            value={pan}
            onChange={setPan}
            min={-1}
            max={1}
            step={0.01}
            label={t("library.controls.pan")}
            defaultValue={0}
            format={panFormat}
          />
          <DragPadBipolar
            value={gain}
            onChange={setGain}
            min={-12}
            max={12}
            step={0.1}
            label={t("library.controls.gain")}
            color="var(--chart-1)"
            defaultValue={0}
            format={value => `${value > 0 ? "+" : ""}${value.toFixed(1)}`}
          />
        </div>
        <ValueEcho
          pairs={[
            [t("library.controls.pan"), pan.toFixed(2)],
            [t("library.controls.gain"), `${gain.toFixed(1)} dB`],
          ]}
        />
        <ControlStateVariants kind="bipolar" />
      </GallerySection>
      <GallerySection id="sizing">
        <div className="gap-control-gap flex flex-wrap items-center">
          <ControlSizingDemo />
        </div>
      </GallerySection>
      <GallerySection id="toggles">
        <div className="gap-control-gap flex flex-wrap items-center">
          <DragPadToggle
            value={link}
            onChange={setLink}
            label={t("library.controls.link")}
            labelOn={t("library.state.on")}
            labelOff={t("library.state.off")}
          />
          <DragPadToggle
            value={mute}
            onChange={setMute}
            label={t("library.controls.mute")}
            labelOn={t("library.controls.muteShort")}
            labelOff={t("library.controls.muteShort")}
            color="var(--destructive)"
          />
          <DragPadToggle
            value={solo}
            onChange={setSolo}
            label={t("library.controls.solo")}
            labelOn={t("library.controls.soloShort")}
            labelOff={t("library.controls.soloShort")}
            color="var(--chart-4)"
          />
        </div>
        <ValueEcho
          pairs={[
            [t("library.controls.link"), t(link ? "library.state.on" : "library.state.off")],
            [t("library.controls.mute"), t(mute ? "library.state.on" : "library.state.off")],
            [t("library.controls.solo"), t(solo ? "library.state.on" : "library.state.off")],
          ]}
        />
        <ControlStateVariants kind="toggles" />
      </GallerySection>
    </>
  )
}
