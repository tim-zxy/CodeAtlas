function resolvedCall(edge) {
  return edge.providerKind === 'java.call' && edge.target?.state === 'RESOLVED';
}

export function directCallMetrics(expected, actual, criticalIds) {
  const critical = new Set(criticalIds);
  if (critical.size !== criticalIds.length) {
    throw new Error('duplicate critical direct call');
  }
  for (const id of critical) {
    const declared = expected.filter((edge) => edge.providerFactId === id);
    if (declared.length === 0) throw new Error(`missing critical direct call: ${id}`);
    if (declared.length !== 1 || !resolvedCall(declared[0])) {
      throw new Error(`critical ${id} is not an expected resolved direct call`);
    }
  }
  const expectedById = new Map(
    expected
      .filter((edge) => resolvedCall(edge) && critical.has(edge.providerFactId))
      .map((edge) => [edge.providerFactId, edge.target.target.providerFactId]),
  );
  let tp = 0;
  let fp = 0;
  const matched = new Set();
  for (const edge of actual.filter(resolvedCall)) {
    const id = edge.providerFactId;
    if (expectedById.get(id) === edge.target.target.providerFactId && !matched.has(id)) {
      tp += 1;
      matched.add(id);
    } else {
      fp += 1;
    }
  }
  const fn = expectedById.size - tp;
  const precision = tp + fp === 0 ? null : tp / (tp + fp);
  const recall = tp + fn === 0 ? null : tp / (tp + fn);
  return { tp, fp, fn, precision, recall };
}
