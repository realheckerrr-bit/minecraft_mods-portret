import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { portMod, verifyPort } from '../src/port.js';
import { readZip, writeZip } from '../src/zip.js';

test('ports a normal Forge resource layout to NeoForge', async () => {
  const fixture = path.resolve('test/fixtures/forge-project');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mod-porter-port-'));
  const output = path.join(root, 'out');
  const result = await portMod({ inputPath: fixture, outputPath: output, to: 'neoforge', minecraft: '1.20.1', offline: true });
  assert.equal(result.metadataPath, 'src/main/resources/META-INF/neoforge.mods.toml');
  const metadata = await fs.readFile(path.join(output, result.metadataPath), 'utf8');
  const source = await fs.readFile(path.join(output, 'src/main/java/demo/Demo.java'), 'utf8');
  assert.match(metadata, /modId="demo"/);
  assert.match(source, /net\.neoforged\.neoforge\.common\.NeoForge/);
  assert.equal((await verifyPort(output)).ok, true);
});

test('repackages a JAR and leaves compiled entries intact', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mod-porter-jar-'));
  const input = path.join(root, 'demo.jar');
  const output = path.join(root, 'out');
  await fs.writeFile(input, writeZip(new Map([
    ['fabric.mod.json', Buffer.from(JSON.stringify({ id: 'demo', version: '1.0.0', name: 'Demo', depends: { minecraft: '1.20.1' } }))],
    ['demo/Demo.class', Buffer.from([0xca, 0xfe, 0xba, 0xbe])],
  ])));
  await portMod({ inputPath: input, outputPath: output, to: 'quilt', minecraft: '1.20.1', offline: true });
  const jar = readZip(await fs.readFile(path.join(output, 'ported-mod.jar')));
  assert.ok(jar.has('quilt.mod.json'));
  assert.deepEqual(jar.get('demo/Demo.class'), Buffer.from([0xca, 0xfe, 0xba, 0xbe]));
  assert.equal((await verifyPort(output)).ok, true);
});

test('honors an explicit source loader when a universal JAR has multiple metadata files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mod-porter-multi-'));
  const input = path.join(root, 'multi');
  const output = path.join(root, 'out');
  await fs.mkdir(input);
  await fs.writeFile(path.join(input, 'fabric.mod.json'), JSON.stringify({ id: 'fabric_identity', version: '1.0.0', depends: { minecraft: '1.20.1' } }));
  await fs.writeFile(path.join(input, 'quilt.mod.json'), JSON.stringify({ quilt_loader: { id: 'quilt_identity', version: '1.0.0', metadata: { name: 'Quilt identity' } } }));
  await portMod({ inputPath: input, outputPath: output, from: 'fabric', to: 'quilt', minecraft: '1.20.1', offline: true });
  const metadata = JSON.parse(await fs.readFile(path.join(output, 'quilt.mod.json'), 'utf8'));
  assert.equal(metadata.quilt_loader.id, 'fabric_identity');
});
