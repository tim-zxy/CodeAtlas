use std::ffi::OsStr;

fn main() {
    let mut arguments = std::env::args_os().skip(1);
    let smoke_requested =
        arguments.next().as_deref() == Some(OsStr::new("--smoke")) && arguments.next().is_none();

    if smoke_requested {
        eprintln!("codeatlas-native-analyzer:ready");
        return;
    }

    eprintln!("codeatlas native analyzer behavior is not implemented in P0-W0-001");
    std::process::exit(2);
}
