import test from 'node:test';
import assert from 'node:assert/strict';
import { readZip, writeZip } from '../src/zip.js';

test('round trips stored and deflated ZIP entries', () => {
  const original = new Map([
    ['fabric.mod.json', Buffer.from('{"id":"demo"}')],
    ['assets/demo/data.txt', Buffer.from('minecraft mod porter '.repeat(100))],
  ]);
  const restored = readZip(writeZip(original));
  assert.deepEqual([...restored.keys()], [...original.keys()]);
  for (const [name, value] of original) assert.deepEqual(restored.get(name), value);
});
