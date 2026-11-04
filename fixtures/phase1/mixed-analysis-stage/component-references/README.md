# Portable component references

These exact byte copies make the existing local Runtime/Stage/Store component tests reproducible without reading private evidence inputs. provenance.json records the already sealed source and SHA-256 of every JSON/JSONL file. Original evidence, failures and historical roots remain intact; no product code regenerated expectations. In particular the early Java v2 locator/unit context adaptation followed the initial callable validator and is not represented as wholly pre-product evidence.

These are declared inputs and independent component targets, not authenticated Native runs, profile measurements or Phase1 acceptance. They supplement the existing cases; Stage66/Store43 and independent whole-operation resource gates remain open. Fixture registry IDs, case expectations and all predecessor Fixture bytes are unchanged.

Use the checked-in scripts/run-mixed-analysis-local-tests.mjs with a fresh evidence label and the four component test files. The runner confines SQLite and Node crash workers to its validated newly owned test root; .superpowers supplies output/temp storage only. This does not start CI or authorize Native execution.

JSON payloads use standard gzip transport so their original bytes can be retained without excluding files from the repository formatting gate. JSONL stays unchanged. corpus.mjs accepts only declared manifest entries, checks compressed asset digest, bounds decompression by the recorded original byte length, and checks the decompressed payload against its sealed source digest. No input or expected value is regenerated.

Reproduce the four component suites after the existing local build, using a fresh label:

```powershell
node scripts/run-mixed-analysis-local-tests.mjs portable-reproduction --test --test-concurrency=1 packages/runtime/test/mixed-analysis-validation.test.mjs packages/runtime/test/mixed-analysis.test.mjs packages/storage/test/mixed-analysis-stage.test.mjs packages/storage/test/mixed-analysis-store.test.mjs
```

The runner refuses an existing label; choose another label for a deliberate later run. It creates only ignored local evidence and temporary database paths. This command does not prove the original Stage66/Store43 acceptance or independent resource reference.
