mod analyze;
mod protocol;

use std::ffi::OsStr;
use std::num::NonZeroUsize;
use std::process::ExitCode;

fn main() -> ExitCode {
    let mut arguments = std::env::args_os().skip(1);
    match (arguments.next(), arguments.next(), arguments.next()) {
        (None, None, None) => protocol::serve_once(
            &mut std::io::stdin().lock(),
            &mut std::io::stdout().lock(),
            &mut std::io::stderr(),
        )
        .unwrap_or_else(|_| ExitCode::from(2)),
        (Some(argument), None, None) if argument == OsStr::new("--smoke") => {
            eprintln!("codeatlas-native-analyzer:ready");
            ExitCode::SUCCESS
        }
        (Some(flag), Some(count), None) if flag == OsStr::new("--parse-workers") => {
            let Some(count) = count
                .to_str()
                .and_then(|count| count.parse::<usize>().ok())
                .and_then(NonZeroUsize::new)
            else {
                eprintln!("codeatlas-native-analyzer: invalid parse workers");
                return ExitCode::from(2);
            };
            protocol::serve_once_with_workers(
                &mut std::io::stdin().lock(),
                &mut std::io::stdout().lock(),
                &mut std::io::stderr(),
                count,
            )
            .unwrap_or_else(|_| ExitCode::from(2))
        }
        _ => {
            eprintln!("codeatlas-native-analyzer: unsupported arguments");
            ExitCode::from(2)
        }
    }
}
