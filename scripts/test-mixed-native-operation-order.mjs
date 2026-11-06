import test from 'node:test';
import assert from 'node:assert/strict';
import source from '../packages/source/dist/mixed-source-workflow.js';
import { setup, makeAccount } from '../packages/source/test/fixtures/mixed-source-git-double.mjs';
import { dynamicOwnerFixture } from './mixed-native-dynamic-owner-fixture.mjs';

test('final Source selection re-observes controlled Git rather than reusing the initial scan', async (t) => {
  const f = await setup(t),
    account = makeAccount(f.controller.signal),
    commands = [];
  f.state.spawnAudit = (_file, args) => commands.push(args.slice(2));
  const observed = await source.observeMixedGitWorktree(f.request, account.account, f.control),
    before = commands.length;
  await source.verifyMixedSourceSelection(f.request, observed, account.account, f.control);
  const verification = commands.slice(before);
  assert.ok(verification.length > 0);
  assert.ok(verification.some((args) => args[0] === 'rev-parse'));
  assert.ok(verification.some((args) => args[0] === 'check-ignore'));
  assert.equal(f.state.calls, f.state.closes);
  t.diagnostic('IN_MEMORY_GIT_FINAL_VERIFY=' + JSON.stringify(verification));
});
for (const finalPhase of ['SOURCE'])
  test('approved V2 refuses final GIT ' + finalPhase + ' slot after Native analysis', async (t) => {
    const f = await dynamicOwnerFixture(t, 'repo:owned'),
      surface = f.request.slots[0];
    const initial = { ...surface, launchId: 'initial-git', role: 'GIT', phase: 'SOURCE' },
      final = { ...surface, launchId: 'final-git', role: 'GIT', phase: finalPhase };
    f.request.slots = [initial, surface, final];
    await assert.rejects(f.bind(), (e) => e.code === 'INVALID_MIXED_NATIVE_DYNAMIC_OWNER');
    assert.equal(f.incoming.listenerCount('data'), 0);
    assert.equal(f.outgoing.listenerCount('drain'), 0);
    assert.deepEqual(f.messages, []);
  });

for (const mode of ['fixed-suffix', 'no-native', 'native-after', 'source-after'])
  test('final verification slot plan ' + mode, async (t) => {
    const f = await dynamicOwnerFixture(t, 'repo:owned'),
      native = f.request.slots[0],
      final = { ...native, launchId: 'final-git', role: 'GIT', phase: 'ANALYSIS' };
    f.request.slots = mode === 'no-native' ? [final] : [native, final];
    if (mode === 'native-after') f.request.slots.push({ ...native, launchId: 'late-native' });
    if (mode === 'source-after')
      f.request.slots.push({ ...final, launchId: 'late-source', phase: 'SOURCE' });
    if (mode === 'fixed-suffix') {
      const owner = await f.bind();
      assert.deepEqual(
        owner.bootstrap().slots.map((s) => [s.role, s.phase]),
        [
          ['SURFACE_V8', 'ANALYSIS'],
          ['GIT', 'ANALYSIS'],
        ],
      );
      assert.equal(owner.status().executionAuthorized, false);
    } else {
      await assert.rejects(f.bind(), (e) => e.code === 'INVALID_MIXED_NATIVE_DYNAMIC_OWNER');
      assert.equal(f.incoming.listenerCount('data'), 0);
      assert.deepEqual(f.messages, []);
    }
  });
