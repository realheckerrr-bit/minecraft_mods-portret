import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectInput } from '../src/inspect.js';

test('detects Fabric metadata in a project', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mod-porter-'));
  await fs.writeFile(path.join(root, 'fabric.mod.json'), JSON.stringify({ id: 'demo', version: '1.0.0', depends: { minecraft: '1.20.1' } }));
  const result = await inspectInput(root);
  assert.deepEqual(result.detectedLoaders, ['fabric']);
  assert.equal(result.identity.id, 'demo');
});
