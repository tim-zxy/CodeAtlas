-- Additive W007. Old migrations and manifest remain integration-owner controlled.
CREATE UNIQUE INDEX idx_document_repository_workspace ON repositories(repository_id,workspace_id);
CREATE TABLE documents (
 id TEXT PRIMARY KEY CHECK(length(id)>0),
 workspace_id TEXT NOT NULL REFERENCES workspace(id),
 repository_id TEXT REFERENCES repositories(repository_id),
 logical_path TEXT NOT NULL CHECK(length(logical_path)>0),
 media_type TEXT NOT NULL CHECK(media_type='text/markdown'),
 source_kind TEXT NOT NULL CHECK(source_kind IN ('MARKDOWN','ADR')),
 current_revision_id TEXT,
 FOREIGN KEY(repository_id,workspace_id) REFERENCES repositories(repository_id,workspace_id),
 FOREIGN KEY(current_revision_id,id) REFERENCES document_revisions(id,document_id) DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE UNIQUE INDEX idx_document_locator ON documents(workspace_id,coalesce(repository_id,''),logical_path);
CREATE TABLE document_revisions (
 id TEXT PRIMARY KEY CHECK(length(id)>0),
 document_id TEXT NOT NULL REFERENCES documents(id),
 source_fingerprint TEXT NOT NULL CHECK(length(source_fingerprint)>0),
 parser_version TEXT NOT NULL CHECK(length(parser_version)>0),
 policy_version TEXT NOT NULL CHECK(length(policy_version)>0),
 completeness TEXT NOT NULL CHECK(completeness IN ('COMPLETE','PARTIAL')),
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json)='object'),
 UNIQUE(id,document_id),
 UNIQUE(document_id,source_fingerprint,parser_version,policy_version)
) STRICT;
CREATE TABLE document_sections (
 revision_id TEXT NOT NULL REFERENCES document_revisions(id),
 entity_id TEXT NOT NULL CHECK(length(entity_id)>0),
 parent_id TEXT,
 ordinal INTEGER NOT NULL CHECK(ordinal>=0),
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 PRIMARY KEY(revision_id,entity_id), UNIQUE(revision_id,ordinal),
 FOREIGN KEY(revision_id,parent_id) REFERENCES document_sections(revision_id,entity_id) DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE TABLE document_blocks (
 revision_id TEXT NOT NULL REFERENCES document_revisions(id),
 entity_id TEXT NOT NULL CHECK(length(entity_id)>0),
 section_id TEXT,
 ordinal INTEGER NOT NULL CHECK(ordinal>=0),
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 PRIMARY KEY(revision_id,entity_id), UNIQUE(revision_id,ordinal),
 FOREIGN KEY(revision_id,section_id) REFERENCES document_sections(revision_id,entity_id)
) STRICT;
CREATE TABLE document_links (
 revision_id TEXT NOT NULL REFERENCES document_revisions(id),
 entity_id TEXT NOT NULL CHECK(length(entity_id)>0),
 block_id TEXT NOT NULL,
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 PRIMARY KEY(revision_id,entity_id),
 FOREIGN KEY(revision_id,block_id) REFERENCES document_blocks(revision_id,entity_id)
) STRICT;
CREATE TRIGGER document_identity_update BEFORE UPDATE OF id,workspace_id,repository_id,logical_path,media_type,source_kind ON documents
BEGIN SELECT RAISE(ABORT,'document identity mapping is immutable in this slice'); END;
CREATE TRIGGER document_current_complete BEFORE UPDATE OF current_revision_id ON documents
WHEN NEW.current_revision_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM document_revisions WHERE id=NEW.current_revision_id AND document_id=NEW.id AND completeness='COMPLETE')
BEGIN SELECT RAISE(ABORT,'current document revision must be complete and owned'); END;
CREATE TRIGGER document_initial_null BEFORE INSERT ON documents WHEN NEW.current_revision_id IS NOT NULL
BEGIN SELECT RAISE(ABORT,'new document pointer must start null'); END;
CREATE TRIGGER document_revisions_immutable_update BEFORE UPDATE ON document_revisions
BEGIN SELECT RAISE(ABORT,'document history is immutable'); END;
CREATE TRIGGER document_revisions_immutable_delete BEFORE DELETE ON document_revisions
BEGIN SELECT RAISE(ABORT,'document history is immutable'); END;
CREATE TRIGGER document_sections_immutable_update BEFORE UPDATE ON document_sections
BEGIN SELECT RAISE(ABORT,'document history is immutable'); END;
CREATE TRIGGER document_sections_immutable_delete BEFORE DELETE ON document_sections
BEGIN SELECT RAISE(ABORT,'document history is immutable'); END;
CREATE TRIGGER document_blocks_immutable_update BEFORE UPDATE ON document_blocks
BEGIN SELECT RAISE(ABORT,'document history is immutable'); END;
CREATE TRIGGER document_blocks_immutable_delete BEFORE DELETE ON document_blocks
BEGIN SELECT RAISE(ABORT,'document history is immutable'); END;
CREATE TRIGGER document_links_immutable_update BEFORE UPDATE ON document_links
BEGIN SELECT RAISE(ABORT,'document history is immutable'); END;
CREATE TRIGGER document_links_immutable_delete BEFORE DELETE ON document_links
BEGIN SELECT RAISE(ABORT,'document history is immutable'); END;
