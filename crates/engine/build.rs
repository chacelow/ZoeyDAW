fn main() {
  let manifest = std::path::PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").expect("Cargo manifest directory"));
  let repo = manifest.join("../..");
  let vendor = repo.join("src-tauri/native/tracktion-source");
  let native = manifest.join("native");
  let source = vendor.join("modules/juce/CMakeLists.txt");
  if !source.exists() || !vendor.join("modules/CMakeLists.txt").exists() {
    panic!("Maintained Tracktion source or pinned JUCE is missing. Run node scripts/audio/setup-native-engine.mjs from the repository root before building.");
  }
  println!("cargo:rerun-if-changed={}", native.display());
  println!("cargo:rerun-if-changed={}", repo.join("scripts/audio/native-source.lock.json").display());
  println!("cargo:rerun-if-changed={}", vendor.join("modules").display());
  let output = std::path::PathBuf::from(std::env::var_os("OUT_DIR").expect("Cargo output directory"));
  let destination = cmake::Config::new(&native)
    .out_dir(output.join("maintained-tracktion"))
    .define("TRACKTION_SOURCE", &vendor)
    .profile("Release")
    .define("ZOEYDAW_PLAYBACK_SMOKE", "OFF")
    .define("ZOEYDAW_PLAYBACK_TESTS", "OFF")
    .build();
  println!("cargo:rustc-link-search=native={}", destination.join("lib").display());
  println!("cargo:rustc-link-lib=static=zoeydaw_playback");
  let target = std::env::var("CARGO_CFG_TARGET_OS").expect("Cargo target OS");
  match target.as_str() {
    "macos" => {
      println!("cargo:rustc-link-lib=c++");
      for framework in ["Accelerate", "AudioToolbox", "AVFoundation", "Cocoa", "CoreAudio", "CoreAudioKit", "CoreMIDI", "DiscRecording", "Foundation", "IOKit", "QuartzCore", "Security", "WebKit", "Metal", "MetalKit", "UserNotifications"] {
        println!("cargo:rustc-link-lib=framework={framework}");
      }
    }
    "windows" => {
      for library in ["winmm", "version", "shlwapi", "imm32", "comdlg32", "ole32", "oleaut32", "uuid", "ws2_32", "wininet", "advapi32", "shell32", "user32", "gdi32", "dwrite", "d2d1", "dxgi", "d3d11", "dwmapi", "sapi", "crypt32", "iphlpapi", "comctl32", "opengl32", "glu32"] {
        println!("cargo:rustc-link-lib={library}");
      }
    }
    _ => panic!("Native playback currently targets macOS and Windows"),
  }
}
