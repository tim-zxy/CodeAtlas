ALTER TABLE migration_probe ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
INSERT INTO migration_probe (id, value) VALUES (1, 'ready');
