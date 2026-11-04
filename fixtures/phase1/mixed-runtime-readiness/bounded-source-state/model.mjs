// Independent input model: no product imports, SQLite, or generated product usage.
export function loadUsage(input, state = input.state) {
  const usage = { rows: 0, serializedBytes: 0, items: 0, retainedLogicalBytes: 0 };
  const own = (v) => {
    usage.items++;
    if (v && typeof v === 'object') {
      if (!Array.isArray(v))
        for (const key of Object.keys(v)) usage.retainedLogicalBytes += Buffer.byteLength(key);
      for (const value of Object.values(v)) own(value);
    } else if (typeof v === 'string') usage.retainedLogicalBytes += Buffer.byteLength(v);
  };
  own({ inputBytes: 0, ...input.control });
  own(input.repository);
  const rows = (columns, values) => {
    // One aggregate numeric row, then two deliveries per matching record.
    usage.rows++;
    own({ n: 0, bytes: 0 });
    own([]);
    for (const value of values) {
      usage.rows++;
      own({ locator: 0, bytes: 0 });
      usage.rows++;
      own(Object.fromEntries(columns.map((k) => [k, null])));
      const bytes = Object.values(value).reduce(
        (n, v) => n + (typeof v === 'string' ? Buffer.byteLength(v) : 0),
        0,
      );
      usage.serializedBytes += bytes;
      usage.retainedLogicalBytes += bytes;
    }
  };
  usage.rows++;
  own({ n: 0 }); // numeric UTF-8 precondition, before any TEXT
  rows(['id', 'root_path'], [{ id: input.repository.id, root_path: input.repository.rootPath }]);
  rows(['repository_id'], [{ repository_id: input.repository.id }]);
  const r = state?.revision;
  rows(
    ['id', 'repository_id', 'kind', 'content_fingerprint', 'base_revision_id'],
    r
      ? [
          {
            id: r.id,
            repository_id: r.repositoryId,
            kind: r.kind,
            content_fingerprint: r.contentFingerprint,
            base_revision_id: r.baseRevisionId,
          },
        ]
      : [],
  );
  if (state) {
    own(r);
    rows(
      [
        'revision_id',
        'id',
        'repository_id',
        'path',
        'content_fingerprint',
        'role',
        'provenance',
        'content_kind',
        'language_hint',
        'sensitivity',
      ],
      state.files.map((f) => ({
        revision_id: f.revisionId,
        id: f.id,
        repository_id: f.repositoryId,
        path: f.path,
        content_fingerprint: f.contentFingerprint,
        role: f.classification.role,
        provenance: f.classification.provenance,
        content_kind: f.classification.contentKind,
        language_hint: f.languageHint,
        sensitivity: f.sensitivity,
      })),
    );
    own([]); // separate parsed file array, before allocating/mapping it
    for (const f of state.files) own(f);
    own(state);
  }
  return usage;
}
