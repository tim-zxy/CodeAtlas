CREATE TABLE revision_sets (
  id TEXT PRIMARY KEY CHECK (length(id) > 0),
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  frozen INTEGER NOT NULL DEFAULT 0 CHECK (frozen IN (0, 1))
) STRICT;

CREATE INDEX idx_revision_sets_created ON revision_sets(workspace_id, created_at);

CREATE TABLE revision_set_items (
  revision_set_id TEXT NOT NULL REFERENCES revision_sets(id) ON DELETE CASCADE,
  repository_id TEXT NOT NULL REFERENCES repositories(repository_id),
  revision_id TEXT NOT NULL CHECK (length(revision_id) > 0),
  revision_fingerprint TEXT NOT NULL CHECK (length(revision_fingerprint) > 0),
  PRIMARY KEY (revision_set_id, repository_id)
) STRICT;

CREATE INDEX idx_revision_set_items_revision
  ON revision_set_items(repository_id, revision_id, revision_fingerprint);

CREATE TRIGGER trg_frozen_revision_set_update
BEFORE UPDATE ON revision_sets
WHEN OLD.frozen = 1
BEGIN
  SELECT RAISE(ABORT, 'revision set is frozen');
END;

CREATE TRIGGER trg_frozen_revision_set_delete
BEFORE DELETE ON revision_sets
WHEN OLD.frozen = 1
BEGIN
  SELECT RAISE(ABORT, 'revision set is frozen');
END;

CREATE TRIGGER trg_frozen_revision_set_item_insert
BEFORE INSERT ON revision_set_items
WHEN (SELECT frozen FROM revision_sets WHERE id = NEW.revision_set_id) = 1
BEGIN
  SELECT RAISE(ABORT, 'revision set is frozen');
END;

CREATE TRIGGER trg_frozen_revision_set_item_update
BEFORE UPDATE ON revision_set_items
WHEN (SELECT frozen FROM revision_sets WHERE id = OLD.revision_set_id) = 1
  OR (SELECT frozen FROM revision_sets WHERE id = NEW.revision_set_id) = 1
BEGIN
  SELECT RAISE(ABORT, 'revision set is frozen');
END;

CREATE TRIGGER trg_frozen_revision_set_item_delete
BEFORE DELETE ON revision_set_items
WHEN (SELECT frozen FROM revision_sets WHERE id = OLD.revision_set_id) = 1
BEGIN
  SELECT RAISE(ABORT, 'revision set is frozen');
END;
