import { uniqueId } from "./reducers"
import { isDevice } from "./devices"
import type { Device } from "./devices"

export type RackKind = "instrument" | "audioEffect" | "midiEffect" | "drum"

export interface RackChain {
  id: string
  name: string
  devices: Device[]
  volumeDb: number
  pan: number
  mute: boolean
  solo: boolean
  selectorStart: number
  selectorEnd: number
  chokeGroup?: number
}

export interface RackMacroMapping {
  id: string
  deviceId: string
  parameter: string
  minimum: number
  maximum: number
}

export interface RackMacro {
  id: string
  name: string
  value: number
  mappings: RackMacroMapping[]
}

export interface RackVariation {
  id: string
  name: string
  values: Record<string, number>
}

export interface Rack {
  id: string
  ownerTrackId: string
  name: string
  kind: RackKind
  chains: RackChain[]
  returnChains: RackChain[]
  chainSelector: number
  selectedChainId: string | null
  selectedDrumPadId: string | null
  macros: RackMacro[]
  variations: RackVariation[]
  selectedVariationId: string | null
}

const RACK_KINDS: readonly RackKind[] = ["instrument", "audioEffect", "midiEffect", "drum"]
const normalized = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
const midiRange = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 127
const decibel = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= -160 && value <= 24
const pan = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= -1 && value <= 1
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

function uniqueIds(values: readonly { id: string }[]): boolean {
  return new Set(values.map(value => value.id)).size === values.length
}

function validChain(chain: unknown): chain is RackChain {
  if (
    !record(chain) ||
    !text(chain.id) ||
    !text(chain.name) ||
    !Array.isArray(chain.devices) ||
    !chain.devices.every(isDevice) ||
    !uniqueIds(chain.devices) ||
    !decibel(chain.volumeDb) ||
    !pan(chain.pan) ||
    typeof chain.mute !== "boolean" ||
    typeof chain.solo !== "boolean" ||
    !midiRange(chain.selectorStart) ||
    !midiRange(chain.selectorEnd) ||
    chain.selectorEnd < chain.selectorStart ||
    (chain.chokeGroup !== undefined && (!midiRange(chain.chokeGroup) || chain.chokeGroup === 0))
  ) {
    return false
  }
  return true
}

function validMacroMapping(
  mapping: unknown,
  devices: readonly Device[]
): mapping is RackMacroMapping {
  if (
    !record(mapping) ||
    !text(mapping.id) ||
    !text(mapping.deviceId) ||
    !text(mapping.parameter) ||
    !normalized(mapping.minimum) ||
    !normalized(mapping.maximum) ||
    mapping.maximum < mapping.minimum
  ) {
    return false
  }
  return devices.some(device => device.id === mapping.deviceId)
}

function validMacro(macro: unknown, devices: readonly Device[]): macro is RackMacro {
  return (
    record(macro) &&
    text(macro.id) &&
    text(macro.name) &&
    normalized(macro.value) &&
    Array.isArray(macro.mappings) &&
    macro.mappings.every(mapping => validMacroMapping(mapping, devices)) &&
    uniqueIds(macro.mappings)
  )
}

function allDevices(rack: Rack): Device[] {
  return [...rack.chains, ...rack.returnChains].flatMap(chain => chain.devices)
}

export function isRack(value: unknown): value is Rack {
  if (
    !record(value) ||
    !text(value.id) ||
    !text(value.ownerTrackId) ||
    !text(value.name) ||
    !RACK_KINDS.includes(value.kind as RackKind) ||
    !Array.isArray(value.chains) ||
    !Array.isArray(value.returnChains) ||
    !value.chains.every(validChain) ||
    !value.returnChains.every(validChain) ||
    !uniqueIds([...value.chains, ...value.returnChains]) ||
    !midiRange(value.chainSelector) ||
    (value.selectedChainId !== null &&
      (!text(value.selectedChainId) ||
        ![...value.chains, ...value.returnChains].some(
          chain => chain.id === value.selectedChainId
        ))) ||
    (value.selectedDrumPadId !== null && !text(value.selectedDrumPadId)) ||
    !Array.isArray(value.macros) ||
    !Array.isArray(value.variations) ||
    !uniqueIds(value.macros) ||
    !uniqueIds(value.variations) ||
    (value.selectedVariationId !== null &&
      (!text(value.selectedVariationId) ||
        !value.variations.some(variation => variation.id === value.selectedVariationId)))
  ) {
    return false
  }
  const rack = value as unknown as Rack
  const devices = allDevices(rack)
  return (
    uniqueIds(devices) &&
    rack.macros.every(macro => validMacro(macro, devices)) &&
    rack.variations.every(
      variation =>
        record(variation) &&
        text(variation.id) &&
        text(variation.name) &&
        record(variation.values) &&
        Object.values(variation.values).every(normalized)
    )
  )
}

export function createRack(ownerTrackId: string, kind: RackKind = "instrument"): Rack {
  return {
    id: uniqueId("rack"),
    ownerTrackId,
    name: "Rack",
    kind,
    chains: [],
    returnChains: [],
    chainSelector: 0,
    selectedChainId: null,
    selectedDrumPadId: null,
    macros: [],
    variations: [],
    selectedVariationId: null,
  }
}

export function selectRackChain(rack: Rack, chainId: string | null): Rack {
  if (
    chainId !== null &&
    ![...rack.chains, ...rack.returnChains].some(chain => chain.id === chainId)
  )
    return rack
  return rack.selectedChainId === chainId ? rack : { ...rack, selectedChainId: chainId }
}

export function setRackChainSelector(rack: Rack, value: number): Rack {
  if (!midiRange(value)) return rack
  return rack.chainSelector === value ? rack : { ...rack, chainSelector: value }
}

export function setRackMacroValue(rack: Rack, macroId: string, value: number): Rack {
  if (!normalized(value)) return rack
  const macro = rack.macros.find(item => item.id === macroId)
  if (!macro || macro.value === value) return rack
  return {
    ...rack,
    macros: rack.macros.map(item => (item.id === macroId ? { ...item, value } : item)),
  }
}
