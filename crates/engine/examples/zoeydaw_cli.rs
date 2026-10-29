fn main() {
    if let Err(error) = zoeydaw_engine::cli::run(std::env::args().skip(1)) {
        eprintln!("zoeydaw: {error}");
        std::process::exit(1);
    }
}
