import test from 'node:test';
import assert from 'node:assert/strict';
import { compareMinecraftVersions, supportedManifestVersions, resolveMinecraftRange } from '../src/versions.js';

test('compares Minecraft numeric release identifiers', () => {
  assert.equal(compareMinecraftVersions('1.20.1', '1.20.1'), 0);
  assert.ok(compareMinecraftVersions('1.21.1', '1.20.6') > 0);
  assert.ok(compareMinecraftVersions('26.1.1', '1.21.11') > 0);
});

test('filters Mojang manifest to releases from 1.20.1', () => {
  const versions = supportedManifestVersions({ versions: [
    { id: '1.20.0', type: 'release' }, { id: '1.20.1', type: 'release' },
    { id: '1.21.1', type: 'release' }, { id: '24w01a', type: 'snapshot' },
  ] });
  assert.deepEqual(versions, ['1.20.1', '1.21.1']);
});

test('resolves an explicit range without network access when supplied a fake fetcher', async () => {
  const fake = async () => ({ latest: { release: '1.21.1' }, versions: [
    { id: '1.20.1', type: 'release' }, { id: '1.20.2', type: 'release' }, { id: '1.21.1', type: 'release' },
  ] });
  const result = await resolveMinecraftRange('1.20.1..latest', { fetcher: fake });
  assert.deepEqual(result, ['1.20.1', '1.20.2', '1.21.1']);
});
