use super::{MAX_EVENT_COUNT, MAX_SAFE_INTEGER};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::io::Write;
use std::num::NonZeroUsize;
use std::sync::Mutex;

const MAX_DIAGNOSTIC_BYTES: usize = 1_000_000;

pub(super) enum ParseOperation {
    Analyze,
    Refresh,
}

pub(super) enum ParseOutcome {
    Succeeded,
    Partial,
    Failed,
}

pub(super) trait ParseObserver: Sync {
    fn begin(&self);
    fn started(&self, source_id: &str, slot: usize);
    fn finished(&self, source_id: &str, slot: usize, outcome: ParseOutcome);
}

pub(super) struct ParseObservation<'a, E: Write + Send> {
    state: Mutex<State<'a, E>>,
}

struct State<'a, E> {
    writer: &'a mut E,
    request_ref: String,
    worker_limit: usize,
    ordinal: u64,
    bytes: usize,
    started: u64,
    finished: u64,
    limited: bool,
    failed: bool,
    ended: bool,
    end_reserve: usize,
    begin: Option<Value>,
}

impl<'a, E: Write + Send> ParseObservation<'a, E> {
    pub(super) fn new(
        writer: &'a mut E,
        request_id: &str,
        worker_limit: NonZeroUsize,
        operation: ParseOperation,
    ) -> Self {
        let request_ref = format!(
            "{:x}",
            Sha256::digest(format!("codeatlas-parse-request-v1\x003\x00{request_id}"))
        );
        let mut state = State {
            writer,
            request_ref,
            worker_limit: worker_limit.get(),
            ordinal: 0,
            bytes: 0,
            started: 0,
            finished: 0,
            limited: false,
            failed: false,
            ended: false,
            end_reserve: 0,
            begin: None,
        };
        let mut worst = state.record("END");
        worst["ordinal"] = json!(MAX_SAFE_INTEGER);
        worst["started"] = json!(MAX_SAFE_INTEGER);
        worst["finished"] = json!(MAX_SAFE_INTEGER);
        worst["complete"] = json!(false);
        worst["reason"] = json!("LIMIT_REACHED");
        state.end_reserve = worst.to_string().len() + 1;
        let mut begin = state.record("BEGIN");
        begin["operation"] = json!(match operation {
            ParseOperation::Analyze => "ANALYZE",
            ParseOperation::Refresh => "REFRESH",
        });
        begin["workerLimit"] = json!(worker_limit.get());
        state.begin = Some(begin);
        Self {
            state: Mutex::new(state),
        }
    }

    pub(super) fn finish(&self) {
        let Ok(mut state) = self.state.lock() else {
            return;
        };
        if state.ended || state.begin.is_some() {
            return;
        }
        state.ended = true;
        let mut end = state.record("END");
        end["started"] = json!(state.started);
        end["finished"] = json!(state.finished);
        let unsettled = state.started != state.finished;
        end["complete"] = json!(!state.failed && !state.limited && !unsettled);
        end["reason"] = if state.limited {
            json!("LIMIT_REACHED")
        } else if unsettled {
            json!("UNSETTLED")
        } else {
            Value::Null
        };
        state.emit(end, true);
    }
}

impl<E: Write + Send> ParseObserver for ParseObservation<'_, E> {
    fn begin(&self) {
        let Ok(mut state) = self.state.lock() else {
            return;
        };
        if let Some(begin) = state.begin.take() {
            state.emit(begin, false);
        }
    }

    fn started(&self, source_id: &str, slot: usize) {
        let Ok(mut state) = self.state.lock() else {
            return;
        };
        if state.ended || slot >= state.worker_limit || state.started == MAX_SAFE_INTEGER {
            state.failed = true;
            return;
        }
        state.started += 1;
        let event = state.parse_record("PARSE_STARTED", source_id, slot);
        state.emit(event, false);
    }

    fn finished(&self, source_id: &str, slot: usize, outcome: ParseOutcome) {
        let Ok(mut state) = self.state.lock() else {
            return;
        };
        if state.ended || slot >= state.worker_limit || state.finished == MAX_SAFE_INTEGER {
            state.failed = true;
            return;
        }
        state.finished += 1;
        if state.finished > state.started {
            state.failed = true;
        }
        let mut event = state.parse_record("PARSE_FINISHED", source_id, slot);
        event["outcome"] = json!(match outcome {
            ParseOutcome::Succeeded => "SUCCEEDED",
            ParseOutcome::Partial => "PARTIAL",
            ParseOutcome::Failed => "FAILED",
        });
        state.emit(event, false);
    }
}

impl<E: Write> State<'_, E> {
    fn record(&self, event: &str) -> Value {
        json!({"diagnosticSchema":1,"kind":"NATIVE_PARSE_OBSERVATION",
            "requestRefSha256":self.request_ref,"ordinal":self.ordinal,"event":event})
    }

    fn parse_record(&self, event: &str, source_id: &str, slot: usize) -> Value {
        let mut record = self.record(event);
        record["sourceRefSha256"] = json!(format!(
            "{:x}",
            Sha256::digest(format!("codeatlas-parse-source-v1\x00{source_id}"))
        ));
        record["slot"] = json!(slot);
        record
    }

    fn emit(&mut self, record: Value, footer: bool) {
        if self.failed || (self.limited && !footer) {
            return;
        }
        let encoded = format!("{record}\n");
        let reserve = if footer { 0 } else { self.end_reserve };
        if self.ordinal >= MAX_SAFE_INTEGER
            || self.ordinal + if footer { 1 } else { 2 } > MAX_EVENT_COUNT
            || encoded.len() > super::MAX_LINE_BYTES
            || self
                .bytes
                .checked_add(encoded.len())
                .and_then(|n| n.checked_add(reserve))
                .is_none_or(|n| n > MAX_DIAGNOSTIC_BYTES)
        {
            self.limited = true;
            return;
        }
        if self
            .writer
            .write_all(encoded.as_bytes())
            .and_then(|_| self.writer.flush())
            .is_err()
        {
            self.failed = true;
            return;
        }
        self.bytes += encoded.len();
        self.ordinal += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lines(bytes: &[u8]) -> Vec<Value> {
        bytes
            .split(|b| *b == b'\n')
            .filter(|b| !b.is_empty())
            .map(|b| serde_json::from_slice(b).unwrap())
            .collect()
    }

    #[test]
    fn observation_capacity_loss_preserves_a_bounded_incomplete_footer() {
        let mut output = Vec::new();
        {
            let observation = ParseObservation::new(
                &mut output,
                "req",
                NonZeroUsize::new(1).unwrap(),
                ParseOperation::Analyze,
            );
            observation.begin();
            for _ in 0..10_000 {
                observation.started("private-source-id", 0);
                observation.finished("private-source-id", 0, ParseOutcome::Succeeded);
            }
            observation.finish();
            observation.finish();
        }
        assert!(output.len() <= MAX_DIAGNOSTIC_BYTES);
        let events = lines(&output);
        assert!(events.len() <= MAX_EVENT_COUNT as usize);
        for (ordinal, event) in events.iter().enumerate() {
            assert_eq!(event["ordinal"], ordinal);
        }
        let end = events.last().unwrap();
        assert_eq!(end["event"], "END");
        assert_eq!(end["complete"], false);
        assert_eq!(end["reason"], "LIMIT_REACHED");
        assert_eq!(end["started"], 10_000);
        assert_eq!(end["finished"], 10_000);
    }

    #[test]
    fn observation_unsettled_parser_cannot_claim_complete() {
        let mut output = Vec::new();
        {
            let observation = ParseObservation::new(
                &mut output,
                "req",
                NonZeroUsize::new(1).unwrap(),
                ParseOperation::Analyze,
            );
            observation.begin();
            observation.started("source", 0);
            observation.finish();
        }
        let events = lines(&output);
        assert_eq!(events.last().unwrap()["complete"], false);
        assert_eq!(events.last().unwrap()["reason"], "UNSETTLED");
    }

    #[test]
    fn observation_writer_failure_or_poison_never_yields_a_trusted_end() {
        struct Broken;
        impl Write for Broken {
            fn write(&mut self, _: &[u8]) -> std::io::Result<usize> {
                Err(std::io::Error::other("fixture writer failure"))
            }
            fn flush(&mut self) -> std::io::Result<()> {
                Ok(())
            }
        }
        let mut broken = Broken;
        let observation = ParseObservation::new(
            &mut broken,
            "req",
            NonZeroUsize::new(1).unwrap(),
            ParseOperation::Analyze,
        );
        observation.begin();
        observation.started("source", 0);
        observation.finished("source", 0, ParseOutcome::Failed);
        observation.finish();
        assert!(observation.state.lock().unwrap().failed);
        let mut output = Vec::new();
        {
            let observation = ParseObservation::new(
                &mut output,
                "req",
                NonZeroUsize::new(1).unwrap(),
                ParseOperation::Analyze,
            );
            observation.begin();
            let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let _guard = observation.state.lock().unwrap();
                panic!("fixture poisoned diagnostic owner");
            }));
            observation.finish();
        }
        assert_eq!(lines(&output).len(), 1);
    }
}
