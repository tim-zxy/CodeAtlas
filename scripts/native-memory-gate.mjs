import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { nativeMetadataProfiles } from '../packages/runtime/dist/native-metadata-profiles.js';
import { validateNativeMemoryObservation } from './native-memory-profile.mjs';

export function recordNativeMemoryObservation(workspace, observation) {
  const directory = process.env.CODEATLAS_NATIVE_MEMORY_ARTIFACT_DIR;
  if (!directory) return;
  validateNativeMemoryObservation(observation, workspace, observation.environment);
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${workspace}-${process.pid}.json`);
  const rows = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  rows.push(observation);
  writeFileSync(file, JSON.stringify(rows, null, 2) + '\n');
}

export function checkNativeMemoryObservation(
  observation,
  profiles = nativeMetadataProfiles,
  requireProfile = process.env.CODEATLAS_REQUIRE_NATIVE_MEMORY_PROFILE === '1',
) {
  const profile = profiles.find((candidate) =>
    Object.entries(observation.environment).every(([key, value]) => candidate[key] === value),
  );
  if (!profile) {
    assert.equal(requireProfile, false, 'Required memory gate has no matching reviewed profile');
    console.log(
      'Memory reservation unavailable for this exact build/environment; no admission claimed',
    );
    return false;
  }
  assert.ok(
    Number.isSafeInteger(observation.peakResidentBytes) && observation.peakResidentBytes > 0,
  );
  assert.ok(
    observation.peakResidentBytes <= profile.reservationBytes,
    `Fresh peak ${observation.peakResidentBytes} exceeds reviewed reservation ${profile.reservationBytes}`,
  );
  return true;
}
