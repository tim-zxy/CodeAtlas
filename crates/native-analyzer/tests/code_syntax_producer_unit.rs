#[path = "support/code_syntax.rs"]
mod support;
use codeatlas_native_analyzer::code_syntax::{
    decode_code_syntax_request, write_code_syntax_observation,
};
use std::{
    io::{self, Write},
    sync::atomic::AtomicBool,
    time::Instant,
};
use support::*;
#[test]
fn full_output_equals_independent_wire_oracle() {
    let c = Case::new("alias-reference-python");
    assert_eq!(c.emit().unwrap(), c.expected);
}
#[test]
fn changed_source_has_no_completed() {
    let c = Case::new("alias-reference-python");
    std::fs::write(c.dir.join("app.py"), b"changed").unwrap();
    let es = records(&c.emit().unwrap());
    assert_eq!(es.last().unwrap()["type"], "OBSERVATION_FAILED");
    assert_eq!(es.last().unwrap()["payload"]["code"], "SOURCE_CHANGED");
}
#[test]
fn cancelled_and_expired_controls_cannot_complete() {
    let c = Case::new("empty-python");
    let r = decode_code_syntax_request(&c.raw).unwrap();
    for flag in [true, false] {
        let cancel = AtomicBool::new(flag);
        let mut limits = control(&cancel, r.header());
        if !flag {
            limits.deadline = Instant::now();
        }
        let mut out = vec![];
        write_code_syntax_observation(&r, &limits, &mut out).unwrap();
        let es = records(&out);
        assert_eq!(es.len(), 1);
        assert_eq!(es[0]["type"], "REQUEST_FAILED");
        assert_eq!(
            es[0]["payload"]["code"],
            if flag { "CANCELLED" } else { "BUDGET_EXCEEDED" }
        );
    }
}
#[test]
fn event_limit_preserves_failure_slot() {
    let mut c = Case::new("alias-reference-python");
    let mut v = c.request();
    v["payload"]["resourceBudget"]["maxEvents"] = 2.into();
    c.set_request(&v);
    let es = records(&c.emit().unwrap());
    assert_eq!(es.len(), 2);
    assert_eq!(es[1]["type"], "OBSERVATION_FAILED");
    assert_eq!(es[1]["payload"]["code"], "RESOURCE_LIMIT_EXCEEDED");
}
#[test]
fn failure_may_not_fit_tiny_budget() {
    let mut c = Case::new("empty-python");
    let mut v = c.request();
    v["payload"]["resourceBudget"]["maxOutputBytes"] = 1.into();
    c.set_request(&v);
    assert!(c.emit().is_err());
}
struct Sink {
    out: Vec<u8>,
    writes: usize,
    fail: bool,
}
impl Write for Sink {
    fn write(&mut self, b: &[u8]) -> io::Result<usize> {
        self.writes += 1;
        if self.fail {
            return Err(io::Error::other("owned injected failure"));
        }
        let n = b.len().min(3);
        self.out.extend_from_slice(&b[..n]);
        Ok(n)
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
#[test]
fn short_write_settles_without_duplicate_record() {
    let c = Case::new("empty-python");
    let r = decode_code_syntax_request(&c.raw).unwrap();
    let cancel = AtomicBool::new(false);
    let mut sink = Sink {
        out: vec![],
        writes: 0,
        fail: false,
    };
    write_code_syntax_observation(&r, &control(&cancel, r.header()), &mut sink).unwrap();
    assert_eq!(sink.out, c.expected);
}
#[test]
fn failed_sink_is_never_retried() {
    let c = Case::new("empty-python");
    let r = decode_code_syntax_request(&c.raw).unwrap();
    let cancel = AtomicBool::new(false);
    let mut sink = Sink {
        out: vec![],
        writes: 0,
        fail: true,
    };
    assert!(write_code_syntax_observation(&r, &control(&cancel, r.header()), &mut sink).is_err());
    assert_eq!(sink.writes, 1);
}
#[test]
fn request_and_all_sources_share_input_budget() {
    let mut c = Case::new("alias-reference-python");
    let mut v = c.request();
    let source = std::fs::read(c.dir.join("app.py")).unwrap().len();
    loop {
        let size = c.raw.len() + source;
        v["payload"]["resourceBudget"]["maxInputBytes"] = size.into();
        c.set_request(&v);
        if c.raw.len() + source == size {
            break;
        }
    }
    assert_eq!(
        records(&c.emit().unwrap()).last().unwrap()["type"],
        "OBSERVATION_COMPLETED"
    );
    let size = v["payload"]["resourceBudget"]["maxInputBytes"]
        .as_u64()
        .unwrap();
    v["payload"]["resourceBudget"]["maxInputBytes"] = (size - 1).into();
    c.set_request(&v);
    assert_eq!(
        records(&c.emit().unwrap()).last().unwrap()["payload"]["code"],
        "RESOURCE_LIMIT_EXCEEDED"
    );
}
#[test]
fn work_is_aggregate_across_two_files_and_distinct_from_events() {
    let c = Case::new("two-python-files");
    let r = decode_code_syntax_request(&c.raw).unwrap();
    let cancel = AtomicBool::new(false);
    let second = c.dir.join("b.py");
    let saved = std::fs::read(&second).unwrap();
    std::fs::remove_file(&second).unwrap();
    // The first budget that reaches the missing second Source is first-file work+1.
    let mut low = 1;
    let mut high = r.header()["payload"]["resourceBudget"]["maxItems"]
        .as_u64()
        .unwrap() as usize;
    while low < high {
        let mid = (low + high) / 2;
        let mut limits = control(&cancel, r.header());
        limits.max_items = mid;
        let mut out = vec![];
        write_code_syntax_observation(&r, &limits, &mut out).unwrap();
        if records(&out).last().unwrap()["payload"]["code"] == "SOURCE_CHANGED" {
            high = mid;
        } else {
            low = mid + 1;
        }
    }
    let first_work = low - 1;
    assert!(first_work > 0);
    std::fs::write(&second, saved).unwrap();
    for (budget, complete) in [(first_work * 2, true), (first_work * 2 - 1, false)] {
        let mut limits = control(&cancel, r.header());
        limits.max_items = budget;
        let mut out = vec![];
        write_code_syntax_observation(&r, &limits, &mut out).unwrap();
        let es = records(&out);
        let actual = es.last().unwrap()["type"] == "OBSERVATION_COMPLETED";
        assert_eq!(actual, complete);
        if !complete {
            assert_eq!(
                es.last().unwrap()["payload"]["code"],
                "RESOURCE_LIMIT_EXCEEDED"
            );
            assert_eq!(
                es.iter().filter(|e| e["type"] == "SYNTAX_COVERAGE").count(),
                1
            );
        }
    }
}
#[test]
fn exact_event_and_output_allowances_do_not_conflate_units() {
    for field in ["maxEvents", "maxOutputBytes"] {
        let mut c = Case::new("alias-reference-python");
        let exact = if field == "maxEvents" {
            records(&c.expected).len()
        } else {
            c.expected.len()
        };
        let mut v = c.request();
        v["payload"]["resourceBudget"][field] = exact.into();
        c.set_request(&v);
        assert_eq!(
            records(&c.emit().unwrap()).last().unwrap()["type"],
            "OBSERVATION_COMPLETED"
        );
        v["payload"]["resourceBudget"][field] = (exact - 1).into();
        c.set_request(&v);
        let es = records(&c.emit().unwrap());
        assert_ne!(es.last().unwrap()["type"], "OBSERVATION_COMPLETED");
        assert_eq!(
            es.last().unwrap()["payload"]["code"],
            "RESOURCE_LIMIT_EXCEEDED"
        );
    }
}
#[test]
fn unrequested_poison_directory_is_not_scanned() {
    let c = Case::new("alias-reference-python");
    std::fs::create_dir(c.dir.join("ignored")).unwrap();
    std::fs::write(c.dir.join("ignored/poison.py"), [255, 0, 255]).unwrap();
    assert_eq!(c.emit().unwrap(), c.expected);
}
#[test]
fn serve_refuses_invalid_contract_without_echoing_source() {
    let c = Case::new("empty-python");
    let mut v = c.request();
    v["payload"]["codeContract"] = "SENTINEL".into();
    let mut raw = serde_json::to_vec(&v).unwrap();
    raw.push(b'\n');
    let cancel = AtomicBool::new(false);
    let mut out = vec![];
    codeatlas_native_analyzer::code_syntax::serve_code_syntax_request(
        &raw,
        &control(&cancel, &v),
        &mut out,
    )
    .unwrap();
    let es = records(&out);
    assert_eq!(es[0]["type"], "REQUEST_FAILED");
    assert_eq!(es[0]["payload"]["code"], "INVALID_REQUEST");
    assert!(!String::from_utf8(out).unwrap().contains("SENTINEL"));
    let mut out = vec![];
    assert!(
        codeatlas_native_analyzer::code_syntax::serve_code_syntax_request(
            b"not json\n",
            &control(&cancel, &v),
            &mut out
        )
        .is_err()
    );
    assert!(out.is_empty());
}
#[test]
fn legacy_dictionary_full_wire_stays_frozen() {
    let c = Case::new("discarded-dictionary");
    let base = fixture().join("legacy-v4");
    let (raw, expected) = instantiate(
        &std::fs::read_to_string(base.join("request.template.jsonl")).unwrap(),
        &std::fs::read_to_string(base.join("events.template.jsonl")).unwrap(),
        c.dir.to_str().unwrap(),
    );
    let request = codeatlas_native_analyzer::syntax::decode_syntax_request(&raw).unwrap();
    let cancelled = AtomicBool::new(false);
    let mut output = vec![];
    codeatlas_native_analyzer::syntax::write_syntax_observation(
        &request,
        &control(&cancelled, request.header()),
        &mut output,
    )
    .unwrap();
    assert_eq!(output, expected);
}
#[test]
fn late_cancellation_disqualifies_completed_bytes() {
    use std::sync::atomic::Ordering;
    struct CancelOnFlush<'a> {
        cancelled: &'a AtomicBool,
        bytes: Vec<u8>,
    }
    impl Write for CancelOnFlush<'_> {
        fn write(&mut self, b: &[u8]) -> io::Result<usize> {
            self.bytes.extend_from_slice(b);
            Ok(b.len())
        }
        fn flush(&mut self) -> io::Result<()> {
            self.cancelled.store(true, Ordering::Relaxed);
            Ok(())
        }
    }
    let c = Case::new("empty-python");
    let request = decode_code_syntax_request(&c.raw).unwrap();
    let cancelled = AtomicBool::new(false);
    let mut sink = CancelOnFlush {
        cancelled: &cancelled,
        bytes: vec![],
    };
    let result =
        write_code_syntax_observation(&request, &control(&cancelled, request.header()), &mut sink);
    assert!(
        result.is_err(),
        "late cancellation must disqualify completed bytes"
    );
    assert_eq!(result.unwrap_err().kind(), io::ErrorKind::Interrupted);
    // Bytes cannot be retracted; the owner must honor settlement failure,never append a second terminal.
    assert_eq!(
        records(&sink.bytes).last().unwrap()["type"],
        "OBSERVATION_COMPLETED"
    );
}
#[test]
fn wire_depth_includes_the_envelope_not_only_source_ast() {
    use serde_json::Value;
    fn tree_depth(n: tree_sitter::Node<'_>) -> usize {
        let mut c = n.walk();
        n.named_children(&mut c)
            .map(|child| 1 + tree_depth(child))
            .max()
            .unwrap_or(0)
    }
    fn json_depth(v: &Value) -> usize {
        match v {
            Value::Array(a) => a.iter().map(|v| 1 + json_depth(v)).max().unwrap_or(0),
            Value::Object(o) => o.values().map(|v| 1 + json_depth(v)).max().unwrap_or(0),
            _ => 0,
        }
    }
    let mut c = Case::new("nested-repeated-values");
    let source = std::fs::read(c.dir.join("app.py")).unwrap();
    let mut parser = tree_sitter::Parser::new();
    parser
        .set_language(&tree_sitter_python::LANGUAGE.into())
        .unwrap();
    let tree = parser.parse(&source, None).unwrap();
    let mut request = c.request();
    let budget = tree_depth(tree.root_node()).max(json_depth(&request));
    assert!(
        records(&c.expected).iter().map(json_depth).max().unwrap() > budget,
        "fixture must separate AST and wire depths"
    );
    request["payload"]["resourceBudget"]["maxDepth"] = budget.into();
    c.set_request(&request);
    let output = c.emit().unwrap();
    let last = records(&output).pop().unwrap();
    assert_eq!(last["type"], "OBSERVATION_FAILED");
    assert_eq!(last["payload"]["code"], "RESOURCE_LIMIT_EXCEEDED");
}
