# R11 reader-layout review and verification

Scope: independent inert transfer/constructor only; base4fdcb8b. No frozen/captured file or CI changes.

Independent reviewer r11_stage_review found P2: a new target inside another protected tree could mutate retained evidence. Fixed by pre-creation two-way overlap checks covering every R1..R11 layout, PACKv1/v2, D:/workspace and the tool checkout. Synthetic path-only negative tests include R10. Reviewer rechecked the R1..R11 fix and reported no remaining blocking issue. Checkout protection is the same conservative boundary, not an execution permission change.

Fresh affected tests64/64 (new9, coordinator19, PACK15, workspace21); architecture17. Initial missing constructor RED, review-gap RED and transient escaping defect were observed and corrected. Original helper SHA0d8f8fca213c44295964335c6a210076f580aaf04c75e11af106ad91121ccd16 and coordinator SHAca58417cdc12c55f6bacabe5111769626843a0987a5f45c1ea4f8d1817eb5b1f remain unchanged. Frozen measurement code and numeric entries are not edited.

Known limits: synthetic data only; no real-reader export/import or runner job invoked. Full reader transfer, exact hosted tools/runtime, draft/private asset access, raw evidence retention and real actual22 remain separate prerequisites. Manifest/objects prove frozen bytes and topology only, not original publication provenance or package-manager equivalence. Single-writer assumption remains; no OS-level isolation or race-free hostile namespace guarantee. All incomplete owners are retained; no automatic retry or cleanup of real evidence.