-- Private schema11 read candidate. Not registered or installable on user databases.
CREATE TABLE evaluation_runs (
 workspace_id TEXT NOT NULL, id TEXT NOT NULL, run_id TEXT NOT NULL,
 snapshot_id TEXT NOT NULL, revision_set_id TEXT NOT NULL,
 report_schema TEXT NOT NULL CHECK(length(report_schema)>0),
 report_version INTEGER NOT NULL CHECK(report_version=1),
 basis_digest TEXT NOT NULL CHECK(length(basis_digest)=64 AND basis_digest NOT GLOB '*[^0-9a-f]*'),
 baseline_ref TEXT,
 status TEXT NOT NULL CHECK(status IN ('PASS','FAIL','NOT_EVALUABLE','NOT_APPLICABLE')),
 report_json TEXT NOT NULL CHECK(json_valid(report_json) AND json_type(report_json)='object'),
 PRIMARY KEY(workspace_id,id),
 UNIQUE(workspace_id,id,run_id,snapshot_id,revision_set_id),
 FOREIGN KEY(workspace_id,run_id,snapshot_id,revision_set_id) REFERENCES compilation_runs(workspace_id,id,snapshot_id,revision_set_id),
 FOREIGN KEY(workspace_id,snapshot_id,revision_set_id) REFERENCES compilation_input_snapshots(workspace_id,id,revision_set_id)
) STRICT;
CREATE TABLE evaluation_metrics (
 workspace_id TEXT NOT NULL, evaluation_id TEXT NOT NULL, metric_key TEXT NOT NULL CHECK(length(metric_key)>0),
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json)='object'),
 PRIMARY KEY(workspace_id,evaluation_id,metric_key),
 FOREIGN KEY(workspace_id,evaluation_id) REFERENCES evaluation_runs(workspace_id,id)
) STRICT;
CREATE TABLE probe_results (
 workspace_id TEXT NOT NULL, evaluation_id TEXT NOT NULL, probe_id TEXT NOT NULL CHECK(length(probe_id)>0),
 status TEXT NOT NULL CHECK(status IN ('PASS','FAIL','NOT_EVALUABLE','NOT_APPLICABLE')),
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json)='object'),
 PRIMARY KEY(workspace_id,evaluation_id,probe_id),
 FOREIGN KEY(workspace_id,evaluation_id) REFERENCES evaluation_runs(workspace_id,id)
) STRICT;
CREATE TABLE knowledge_revision_provenance (
  workspace_id TEXT NOT NULL CHECK(length(workspace_id)>0),
  revision_id TEXT NOT NULL CHECK(length(revision_id)>0),
  run_id TEXT NOT NULL CHECK(length(run_id)>0),
  snapshot_id TEXT NOT NULL CHECK(length(snapshot_id)>0),
  evaluation_id TEXT NOT NULL CHECK(length(evaluation_id)>0),
  revision_set_id TEXT NOT NULL CHECK(length(revision_set_id)>0),
  PRIMARY KEY(workspace_id,revision_id),
  FOREIGN KEY(workspace_id,revision_id,run_id,snapshot_id,evaluation_id,revision_set_id)
    REFERENCES knowledge_revisions(workspace_id,id,compilation_run_id,input_snapshot_id,evaluation_id,revision_set_id),
  FOREIGN KEY(workspace_id,run_id,snapshot_id,revision_set_id)
    REFERENCES compilation_runs(workspace_id,id,snapshot_id,revision_set_id),
  FOREIGN KEY(workspace_id,snapshot_id,revision_set_id)
    REFERENCES compilation_input_snapshots(workspace_id,id,revision_set_id),
  FOREIGN KEY(workspace_id,evaluation_id,run_id,snapshot_id,revision_set_id)
    REFERENCES evaluation_runs(workspace_id,id,run_id,snapshot_id,revision_set_id)
) STRICT;

CREATE VIRTUAL TABLE knowledge_fts USING fts5(workspace_id UNINDEXED,item_id UNINDEXED,revision_id UNINDEXED,title,summary,goal,tokenize='unicode61');
CREATE TABLE knowledge_fts_metadata (
 workspace_id TEXT NOT NULL, item_id TEXT NOT NULL, revision_id TEXT NOT NULL,
 content_digest TEXT NOT NULL CHECK(length(content_digest)=64 AND content_digest NOT GLOB '*[^0-9a-f]*'),
 PRIMARY KEY(workspace_id,item_id),
 FOREIGN KEY(workspace_id,item_id,revision_id) REFERENCES knowledge_revisions(workspace_id,item_id,id)
) STRICT;
CREATE TRIGGER read11_evaluation_runs_no_update BEFORE UPDATE ON evaluation_runs BEGIN SELECT RAISE(ABORT,'immutable history'); END;
CREATE TRIGGER read11_evaluation_runs_no_delete BEFORE DELETE ON evaluation_runs BEGIN SELECT RAISE(ABORT,'immutable history'); END;
CREATE TRIGGER read11_evaluation_runs_no_replace BEFORE INSERT ON evaluation_runs WHEN EXISTS(SELECT 1 FROM evaluation_runs WHERE workspace_id=NEW.workspace_id AND id=NEW.id) BEGIN SELECT RAISE(ABORT,'duplicate immutable key'); END;
CREATE TRIGGER read11_evaluation_metrics_no_update BEFORE UPDATE ON evaluation_metrics BEGIN SELECT RAISE(ABORT,'immutable history'); END;
CREATE TRIGGER read11_evaluation_metrics_no_delete BEFORE DELETE ON evaluation_metrics BEGIN SELECT RAISE(ABORT,'immutable history'); END;
CREATE TRIGGER read11_evaluation_metrics_no_replace BEFORE INSERT ON evaluation_metrics WHEN EXISTS(SELECT 1 FROM evaluation_metrics WHERE workspace_id=NEW.workspace_id AND evaluation_id=NEW.evaluation_id AND metric_key=NEW.metric_key) BEGIN SELECT RAISE(ABORT,'duplicate immutable key'); END;
CREATE TRIGGER read11_probe_results_no_update BEFORE UPDATE ON probe_results BEGIN SELECT RAISE(ABORT,'immutable history'); END;
CREATE TRIGGER read11_probe_results_no_delete BEFORE DELETE ON probe_results BEGIN SELECT RAISE(ABORT,'immutable history'); END;
CREATE TRIGGER read11_probe_results_no_replace BEFORE INSERT ON probe_results WHEN EXISTS(SELECT 1 FROM probe_results WHERE workspace_id=NEW.workspace_id AND evaluation_id=NEW.evaluation_id AND probe_id=NEW.probe_id) BEGIN SELECT RAISE(ABORT,'duplicate immutable key'); END;
CREATE TRIGGER read11_knowledge_revision_provenance_no_update BEFORE UPDATE ON knowledge_revision_provenance BEGIN SELECT RAISE(ABORT,'immutable history'); END;
CREATE TRIGGER read11_knowledge_revision_provenance_no_delete BEFORE DELETE ON knowledge_revision_provenance BEGIN SELECT RAISE(ABORT,'immutable history'); END;
CREATE TRIGGER read11_knowledge_revision_provenance_no_replace BEFORE INSERT ON knowledge_revision_provenance WHEN EXISTS(SELECT 1 FROM knowledge_revision_provenance WHERE workspace_id=NEW.workspace_id AND revision_id=NEW.revision_id) BEGIN SELECT RAISE(ABORT,'duplicate immutable key'); END;
CREATE TRIGGER read11_pointer_insert BEFORE INSERT ON knowledge_items WHEN NEW.published_revision_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM knowledge_revision_provenance p JOIN knowledge_revisions r ON r.workspace_id=p.workspace_id AND r.id=p.revision_id WHERE p.workspace_id=NEW.workspace_id AND p.revision_id=NEW.published_revision_id AND r.item_id=NEW.id AND r.publication_state='PUBLISHED') BEGIN SELECT RAISE(ABORT,'published provenance required'); END;
CREATE TRIGGER read11_pointer_update BEFORE UPDATE ON knowledge_items WHEN NEW.published_revision_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM knowledge_revision_provenance p JOIN knowledge_revisions r ON r.workspace_id=p.workspace_id AND r.id=p.revision_id WHERE p.workspace_id=NEW.workspace_id AND p.revision_id=NEW.published_revision_id AND r.item_id=NEW.id AND r.publication_state='PUBLISHED') BEGIN SELECT RAISE(ABORT,'published provenance required'); END;
