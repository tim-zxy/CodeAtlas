mod protocol;

use std::ffi::OsStr;
use std::process::ExitCode;

fn main() -> ExitCode {
    let mut arguments = std::env::args_os().skip(1);
    match (arguments.next(), arguments.next()) {
        (None, None) => protocol::serve_once(
            &mut std::io::stdin().lock(),
            &mut std::io::stdout().lock(),
            &mut std::io::stderr().lock(),
        )
        .unwrap_or_else(|_| ExitCode::from(2)),
        (Some(argument), None) if argument == OsStr::new("--smoke") => {
            eprintln!("codeatlas-native-analyzer:ready");
            ExitCode::SUCCESS
        }
        _ => {
            eprintln!("codeatlas-native-analyzer: unsupported arguments");
            ExitCode::from(2)
        }
    }
}
