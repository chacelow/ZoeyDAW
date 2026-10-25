import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  readHeader,
  readRecord,
  readSource,
  writeHeader,
  writeRecord,
  writeSource,
} from "../../packages/project-core/src/realtime/protocol.generated.ts"

const { dirname, resolve } = path
const codecs = {
  header: { read: readHeader, write: writeHeader },
  record: { read: readRecord, write: writeRecord },
  source: { read: readSource, write: writeSource },
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const schema = JSON.parse(await readFile(resolve(root, "protocol/realtime.json"), "utf8"))
const temporary = await mkdtemp(resolve(tmpdir(), "zoeydaw-realtime-wire-"))
const rustName = name => name.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
const upper = name => rustName(name).toUpperCase()
const title = name => name[0].toUpperCase() + name.slice(1)
try {
  const frozen = Buffer.from(
    (await readFile(resolve(root, "protocol/fixtures/levels-v2.hex"), "utf8")).trim(),
    "hex"
  )
  const frozenView = new DataView(frozen.buffer, frozen.byteOffset, frozen.byteLength)
  assert.equal(readHeader(frozenView).seq, 9007199254740993n)
  assert.equal(readHeader(frozenView).timelineSample, -512n)
  assert.equal(readHeader(frozenView).appliedSequence, 9007199254740994n)
  assert.equal(readHeader(frozenView).ownerEpoch, 9007199254740995n)
  assert.equal(readHeader(frozenView).bar, 3.25)
  assert.equal(readHeader(frozenView).audibleBar, 3.125)
  assert.equal(readRecord(frozenView, 192).slotResetEpoch, 7)
  assert.equal(readRecord(frozenView, 192).clipCount, 9007199254740997n)
  assert.equal(readSource(frozenView, 240).sourceFrame, 44100.5)
  assert.equal(readSource(frozenView, 240).sourceRate, 44100)
  execFileSync(
    process.execPath,
    [resolve(root, "scripts/generate-realtime-protocol.mjs"), "--check"],
    { stdio: "inherit" }
  )
  let rust = `#[path = ${JSON.stringify(resolve(root, "crates/engine/src/realtime/protocol_generated.rs"))}] mod wire;\nfn main() {\n`
  rust += `let golden = std::fs::read(std::env::args().nth(2).unwrap()).unwrap(); let header = wire::WireHeader::read(&golden).unwrap(); assert_eq!(header.seq, 9007199254740993); assert_eq!(header.timeline_sample, -512); assert_eq!(header.applied_sequence, 9007199254740994); assert_eq!(header.owner_epoch, 9007199254740995); assert_eq!(header.bar, 3.25); assert_eq!(header.audible_bar, 3.125); let record = wire::WireRecord::read(&golden[192..]).unwrap(); assert_eq!(record.clip_count, 9007199254740997); assert_eq!(record.slot_reset_epoch, 7); let source = wire::WireSource::read(&golden[240..]).unwrap(); assert_eq!(source.source_rate, 44100.0);\n`
  let cpp =
    '#include "realtime_protocol.generated.h"\n#include <bit>\n#include <fstream>\n#include <vector>\n#include <cassert>\nint main(int argc,char** argv) { assert(argc == 3); std::ifstream input(argv[1],std::ios::binary); std::vector<unsigned char> bytes((std::istreambuf_iterator<char>(input)),{}); std::ifstream goldenInput(argv[2],std::ios::binary); std::vector<std::uint8_t> golden((std::istreambuf_iterator<char>(goldenInput)),{}); zp::realtime::wire::WireHeader goldenHeader; assert(zp::realtime::wire::readHeader(golden,goldenHeader)); assert(goldenHeader.seq == 9007199254740993ULL && goldenHeader.timelineSample == -512); assert(goldenHeader.appliedSequence == 9007199254740994ULL && goldenHeader.ownerEpoch == 9007199254740995ULL); assert(goldenHeader.bar == 3.25 && goldenHeader.audibleBar == 3.125); zp::realtime::wire::WireRecord goldenRecord; assert(zp::realtime::wire::readRecord(std::span(golden).subspan(192),goldenRecord)); assert(goldenRecord.clipCount == 9007199254740997ULL && goldenRecord.slotResetEpoch == 7);\n'
  const output = []
  let base = 0
  for (const [name, layout] of Object.entries(schema.layouts)) {
    const bytes = new ArrayBuffer(layout.bytes)
    const expected = {}
    let index = 0
    for (const [field, type] of layout.fields) {
      expected[field] =
        type === "u64"
          ? 9007199254740993n + BigInt(index)
          : type === "i64"
            ? -9007199254740993n
            : type.startsWith("f")
              ? index + 0.25
              : index + 1
      index += 1
    }
    codecs[name].write(new DataView(bytes), expected)
    assert.deepEqual(codecs[name].read(new DataView(bytes)), expected)
    output.push(Buffer.from(bytes))
    rust += `let bytes = std::fs::read(std::env::args().nth(1).unwrap()).unwrap(); let value = wire::Wire${title(name)}::read(&bytes[${base}..]).unwrap();\n`
    cpp += `zp::realtime::wire::Wire${title(name)} value${title(name)}; assert(zp::realtime::wire::read${title(name)}(std::span(bytes).subspan(${base}), value${title(name)})); std::vector<std::uint8_t> encoded${title(name)}(${layout.bytes}); assert(zp::realtime::wire::write${title(name)}(encoded${title(name)}, value${title(name)})); assert(std::equal(encoded${title(name)}.begin(), encoded${title(name)}.end(), bytes.begin()+${base}));\n`
    rust += `assert_eq!(std::mem::size_of::<wire::Wire${title(name)}>(), ${layout.bytes});\n`
    cpp += `static_assert(sizeof(zp::realtime::wire::Wire${title(name)}) == ${layout.bytes});\n`
    for (const [field, type, offset] of layout.fields) {
      const value = expected[field]
      rust += `assert_eq!(value.${rustName(field)}, ${value}${type});\n`
      cpp += `assert(value${title(name)}.${field} == ${value}${type === "u64" ? "ULL" : type === "i64" ? "LL" : type === "f32" ? "f" : ""});\n`
      rust += `assert_eq!(std::mem::offset_of!(wire::Wire${title(name)}, ${rustName(field)}), ${offset});\n`
      cpp += `static_assert(offsetof(zp::realtime::wire::Wire${title(name)}, ${field}) == ${offset});\n`
      const size = { u16: 2, u32: 4, u64: 8, i64: 8, f32: 4, f64: 8 }[type]
      cpp += `{ std::uint64_t bits=0; for(unsigned i=0;i<${size};++i) bits |= std::uint64_t(bytes[${base}+zp::realtime::wire::${upper(name)}_${upper(field)}+i]) << (8*i); `
      if (type === "f32") cpp += `assert(std::bit_cast<float>(std::uint32_t(bits)) == ${value}f);`
      else if (type === "f64") cpp += `assert(std::bit_cast<double>(bits) == ${value});`
      else if (type === "i64") cpp += `assert(std::bit_cast<std::int64_t>(bits) == ${value}LL);`
      else cpp += `assert(bits == ${value}ULL);`
      cpp += " }\n"
    }
    rust += `let mut encoded = [0u8; ${layout.bytes}]; value.write(&mut encoded).unwrap(); assert_eq!(encoded, bytes[${base}..${base + layout.bytes}]);\n`
    base += layout.bytes
  }
  rust += "}\n"
  cpp += "}\n"
  const fixture = resolve(temporary, "wire.bin")
  await writeFile(fixture, Buffer.concat(output))
  const frozenPath = resolve(temporary, "golden.bin")
  await writeFile(frozenPath, frozen)
  await writeFile(resolve(temporary, "check.rs"), rust)
  await writeFile(resolve(temporary, "check.cpp"), cpp)
  // Compilers come from the developer's toolchain, never protocol or project input.
  const windows = process.platform === "win32"
  const rustExecutable = resolve(temporary, windows ? "rust-check.exe" : "rust-check")
  const cppExecutable = resolve(temporary, windows ? "cpp-check.exe" : "cpp-check")

  /* eslint-disable sonarjs/no-os-command-from-path -- Developer-selected compilers, never project payloads. */
  execFileSync(
    "rustc",
    ["--edition", "2021", resolve(temporary, "check.rs"), "-o", rustExecutable],
    { stdio: "inherit" }
  )
  execFileSync(rustExecutable, [fixture, frozenPath], { stdio: "inherit" })

  execFileSync(
    windows ? "cl.exe" : "clang++",
    windows
      ? [
          "/nologo",
          "/std:c++20",
          "/EHsc",
          `/I${resolve(root, "crates/engine/native/runtime")}`,
          resolve(temporary, "check.cpp"),
          `/Fo${resolve(temporary, "check.obj")}`,
          `/Fe${cppExecutable}`,
        ]
      : [
          "-std=c++20",
          `-I${resolve(root, "crates/engine/native/runtime")}`,
          resolve(temporary, "check.cpp"),
          "-o",
          cppExecutable,
        ],
    { stdio: "inherit" }
  )
  /* eslint-enable sonarjs/no-os-command-from-path */
  execFileSync(cppExecutable, [fixture, frozenPath], { stdio: "inherit" })
  console.log(
    `Verified ${base} wire bytes across TypeScript, Rust and C++, including exact u64/i64 beyond 2^53`
  )
} finally {
  await rm(temporary, { recursive: true, force: true })
}
