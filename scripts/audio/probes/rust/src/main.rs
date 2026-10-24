use std::{error::Error, fs::{self, File}, io::{Read, BufReader}, path::Path, time::Instant};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use symphonia::core::{codecs::audio::{AudioDecoder, AudioDecoderOptions}, formats::{FormatOptions, FormatReader, TrackType, probe::Hint}, io::{MediaSourceStream, MediaSourceStreamOptions}, meta::MetadataOptions};

type Result<T, E = Box<dyn Error>> = std::result::Result<T, E>;
const RATE: u32 = 48_000;
const BLOCK: usize = 256;
const FRAMES: usize = RATE as usize * 8;
const PACKET_SAMPLES: usize = 65_536;
const IO_BYTES: usize = 65_536;
const NOT_VERIFIED: &[&str] = &[
    "Complete DAW engine, device callback deadlines, device latency, real-time scheduling",
    "Tempo/pitch preservation: NOT IMPLEMENTED (no speed substitution)",
    "One-hour real-I/O workload, random access, seek, page-cache-cold throughput",
    "Adversarial file memory limits: decoder/demuxer internal allocation is library-controlled",
    "OS peak RSS, downstream commercial licensing suitability",
];

struct Cursor {
    format: Box<dyn FormatReader>,
    decoder: Box<dyn AudioDecoder>,
    track_id: u32,
    pending: Box<[f32]>,
    pos: usize,
    len: usize,
    rate: Option<u32>,
    channels: Option<usize>,
    max_packet_samples: usize,
    decoded_frames: u64,
    eof: bool,
}
impl Cursor {
    fn open(path: &Path) -> Result<Self> {
        let stream = MediaSourceStream::new(Box::new(File::open(path)?), MediaSourceStreamOptions { buffer_len: IO_BYTES });
        let mut hint = Hint::new();
        if let Some(ext) = path.extension().and_then(|s| s.to_str()) { hint.with_extension(ext); }
        let format = symphonia::default::get_probe().probe(&hint, stream, FormatOptions::default(), MetadataOptions::default())?;
        let track = format.default_track(TrackType::Audio).ok_or("no default audio track")?;
        let track_id = track.id;
        let params = track.codec_params.as_ref().and_then(|p| p.audio()).ok_or("no audio parameters")?;
        let decoder = symphonia::default::get_codecs().make_audio_decoder(params, &AudioDecoderOptions::default())?;
        Ok(Self { format, decoder, track_id, pending: vec![0.0; PACKET_SAMPLES].into_boxed_slice(), pos: 0, len: 0, rate: None, channels: None, max_packet_samples: 0, decoded_frames: 0, eof: false })
    }
    fn refill(&mut self) -> Result<bool> {
        if self.eof { return Ok(false); }
        loop {
            let Some(packet) = self.format.next_packet()? else { self.eof = true; return Ok(false); };
            if packet.track_id != self.track_id { continue; }
            let decoded = self.decoder.decode(&packet)?;
            let rate = decoded.spec().rate();
            let channels = decoded.spec().channels().count();
            if self.rate.is_some_and(|old| old != rate) || self.channels.is_some_and(|old| old != channels) { return Err("mid-stream format change".into()); }
            self.rate = Some(rate);
            self.channels = Some(channels);
            let samples = decoded.samples_interleaved();
            if samples > PACKET_SAMPLES { return Err(format!("packet has {samples} samples, probe cap is {PACKET_SAMPLES}").into()); }
            decoded.copy_to_slice_interleaved(&mut self.pending[..samples]);
            if self.pending[..samples].iter().any(|s| !s.is_finite()) { return Err("non-finite decoded sample".into()); }
            self.pos = 0;
            self.len = samples;
            self.max_packet_samples = self.max_packet_samples.max(samples);
            self.decoded_frames += decoded.frames() as u64;
            if samples != 0 { return Ok(true); }
        }
    }
    fn fill(&mut self, dst: &mut [f32]) -> Result<()> {
        let mut written = 0;
        while written < dst.len() {
            if self.pos == self.len && !self.refill()? { return Err("early EOF in exact eight-second workload".into()); }
            let n = (dst.len() - written).min(self.len - self.pos);
            dst[written..written+n].copy_from_slice(&self.pending[self.pos..self.pos+n]);
            self.pos += n;
            written += n;
        }
        Ok(())
    }
}
fn hash(path: &Path) -> Result<String> {
    let mut file = BufReader::new(File::open(path)?);
    let mut sha = Sha256::new();
    let mut bytes = [0_u8; 65_536];
    loop { let n = file.read(&mut bytes)?; if n == 0 { break; } sha.update(&bytes[..n]); }
    Ok(format!("{:x}", sha.finalize()))
}
fn inspect(path: &Path) -> Result<bool> {
    let mut cursor = Cursor::open(path)?;
    let mut pcm_sha = Sha256::new();
    let mut peak = 0.0_f32;
    let mut sum_sq = 0.0_f64;
    let mut samples = 0_u64;
    let error = loop {
        match cursor.refill() {
            Ok(true) => for &sample in &cursor.pending[..cursor.len] {
                pcm_sha.update(sample.to_le_bytes()); peak = peak.max(sample.abs()); sum_sq += (sample as f64).powi(2); samples += 1;
            },
            Ok(false) => break None,
            Err(e) => break Some(e.to_string()),
        }
    };
    let ok = error.is_none() && samples > 0;
    println!("{}", serde_json::to_string_pretty(&json!({
        "mode":"inspect", "file":path, "status":if ok {"decoded_to_demuxer_eof"} else {"decode_failed"},
        "error":error, "frames":cursor.decoded_frames, "rate":cursor.rate, "channels":cursor.channels,
        "samples":samples, "peak":peak, "rms":if samples>0 {(sum_sq/samples as f64).sqrt()} else {0.0},
        "input_sha256":hash(path)?, "decoded_f32le_sha256":format!("{:x}",pcm_sha.finalize()),
        "max_packet_samples":cursor.max_packet_samples,
        "note":"Actually decodes every packet; EOF alone does not prove declared duration or untruncated container. Compare frames with the known corpus expectation.",
        "not_verified":NOT_VERIFIED
    }))?);
    Ok(ok)
}
fn render(input: &Path, output: &Path, readers: usize) -> Result<(f64, usize)> {
    let start = Instant::now();
    let mut cursors = (0..readers).map(|_| Cursor::open(input)).collect::<Result<Vec<_>>>()?;
    for cursor in &mut cursors { if !cursor.refill()? { return Err("empty input".into()); } }
    let channels = cursors[0].channels.ok_or("missing channel count")?;
    if channels == 0 || channels > 2 || cursors.iter().any(|c| c.rate != Some(RATE) || c.channels != Some(channels)) { return Err("mix workload requires mono/stereo 48kHz, no resampling or channel remapping".into()); }
    let spec = hound::WavSpec { channels: channels as u16, sample_rate: RATE, bits_per_sample: 32, sample_format: hound::SampleFormat::Float };
    let mut writer = hound::WavWriter::create(output, spec)?;
    let mut source = [0.0_f32; BLOCK * 2];
    let mut mixed = [0.0_f32; BLOCK * 2];
    let n = BLOCK * channels;
    let gain = 1.0 / readers as f32;
    for _ in 0..FRAMES / BLOCK {
        mixed[..n].fill(0.0);
        for cursor in &mut cursors {
            cursor.fill(&mut source[..n])?;
            for (out, sample) in mixed[..n].iter_mut().zip(&source[..n]) { *out += sample * gain; }
        }
        for sample in &mixed[..n] { writer.write_sample(*sample)?; }
    }
    writer.finalize()?;
    let max_packet = cursors.iter().map(|c| c.max_packet_samples).max().unwrap_or(0);
    Ok((start.elapsed().as_secs_f64(), max_packet))
}
fn compare(input: &Path, output: &Path) -> Result<Value> {
    let mut reference = Cursor::open(input)?;
    if !reference.refill()? { return Err("empty reference".into()); }
    let channels = reference.channels.ok_or("missing channels")?;
    let mut wav = hound::WavReader::open(output)?;
    let mut samples = wav.samples::<f32>();
    let mut block = [0.0_f32; BLOCK * 2];
    let mut max_error = 0.0_f64;
    let mut sum_sq = 0.0_f64;
    let mut peak = 0.0_f32;
    let mut n = 0;
    for _ in 0..FRAMES / BLOCK {
        reference.fill(&mut block[..BLOCK*channels])?;
        for &expected in &block[..BLOCK*channels] {
            let actual = samples.next().ok_or("short output")??;
            if !actual.is_finite() { return Err("non-finite output".into()); }
            let error = (actual as f64 - expected as f64).abs();
            max_error = max_error.max(error); sum_sq += error * error; peak = peak.max(actual.abs()); n += 1;
        }
    }
    if samples.next().is_some() { return Err("extra output samples".into()); }
    let rms_error = (sum_sq / n as f64).sqrt();
    Ok(json!({"compared_samples":n,"max_absolute_error":max_error,"rms_error":rms_error,"output_peak":peak,"tolerance":1e-6,"passed":max_error <= 1e-6}))
}
fn bench(corpus: &Path, out: &Path) -> Result<()> {
    fs::create_dir_all(out)?;
    let mut cases = Vec::new();
    let mut passed = true;
    for signal in ["tone-440-mono.wav", "stereo-identical.wav", "stereo-antiphase.wav"] {
        let input = corpus.join(signal);
        let input_hash = hash(&input)?;
        for readers in [1,8,32] {
            let output = out.join(format!("{}-{readers}.wav", input.file_stem().unwrap().to_string_lossy()));
            let (warmup, _) = render(&input, &output, readers)?;
            let mut timings = Vec::new();
            let mut max_packet = 0;
            for _ in 0..10 { let (seconds, packet) = render(&input, &output, readers)?; timings.push(seconds); max_packet = max_packet.max(packet); }
            let accuracy = compare(&input, &output)?;
            passed &= accuracy["passed"].as_bool().unwrap_or(false);
            println!("{signal}: {readers} independent readers, mean {:.6}s, max error {}", timings.iter().sum::<f64>()/10.0, accuracy["max_absolute_error"]);
            cases.push(json!({"input":input,"input_sha256":input_hash,"readers":readers,"gain_per_reader":1.0/readers as f64,"output":output,"output_sha256":hash(&output)?,"frames":FRAMES,"warmup_seconds":warmup,"wall_seconds":timings,"timed_runs":10,"max_decoded_packet_samples":max_packet,"accuracy":accuracy}));
        }
    }
    let rustc = std::process::Command::new("rustc").arg("--version").output()?;
    let cargo = std::process::Command::new("cargo").arg("--version").output()?;
    let result = json!({"implementation":"Symphonia 0.6.1 packet decode + independent file cursors + block mixer + hound float WAV writer", "scope":"offline decode/stream/mix composition only; not a complete audio engine", "status":if passed {"original_speed_accuracy_passed"} else {"accuracy_failed"},"sample_rate":RATE,"block_frames":BLOCK,"duration_seconds":8,"tempo_ratio":1.0,"tempo_pitch_preserving":"NOT IMPLEMENTED", "timing_scope":"Each wall time includes independent file opens/probe, decode, gain/mix, buffered output write and WAV finalize; excludes hashing/comparison. No fsync, no callback or cold-disk claim. Warmup once then 10 runs per configuration.","buffers":{"media_source_bytes_per_cursor":IO_BYTES,"fixed_interleaved_pcm_samples_per_cursor":PACKET_SAMPLES,"mix_and_scratch_samples":BLOCK*4,"whole_file_pcm_predecode":false,"library_internal_allocations":"Symphonia demuxer packet and decoder buffers: codec/packet-sized, not whole-file PCM; hostile-file allocation not globally capped"},"versions":{"symphonia":"0.6.1","upstream_commit":"ee35874b571a35a9a6e15d3bc9a3aaf8f11fbeee","rustc":String::from_utf8_lossy(&rustc.stdout).trim(),"cargo":String::from_utf8_lossy(&cargo.stdout).trim(),"release_profile":"opt-level=3,lto=thin,codegen-units=1"},"not_verified":NOT_VERIFIED,"cases":cases});
    fs::write(out.join("results.json"), serde_json::to_vec_pretty(&result)?)?;
    if !passed { return Err("accuracy comparison failed; see results.json".into()); }
    Ok(())
}
fn run() -> Result<bool> {
    let args: Vec<_> = std::env::args_os().collect();
    match args.get(1).and_then(|s| s.to_str()) {
        Some("inspect") if args.len()==3 => inspect(Path::new(&args[2])),
        Some("bench") if args.len()==4 => { bench(Path::new(&args[2]), Path::new(&args[3]))?; Ok(true) },
        _ => Err("usage: zoeydaw-rust-stream-probe inspect <audio-file> | bench <corpus-dir> <output-dir>".into()),
    }
}
fn main() {
    match run() { Ok(true) => (), Ok(false) => std::process::exit(1), Err(e) => { eprintln!("{}",json!({"status":"failed","error":e.to_string(),"not_verified":NOT_VERIFIED})); std::process::exit(1); } }
}
