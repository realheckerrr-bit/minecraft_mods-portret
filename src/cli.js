#!/usr/bin/env node
import fs from 'node:fs/promises';
import { inspectInput } from './inspect.js';
import { LOADERS, normalizeLoader } from './loaders.js';
import { portMod, verifyPort } from './port.js';
import { getMinecraftVersions, resolveMinecraftRange } from './versions.js';

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift() ?? 'help';
  const options = { _: [] };
  while (args.length) {
    const token = args.shift();
    if (!token.startsWith('-')) { options._.push(token); continue; }
    const name = token.replace(/^-+/, '').replaceAll('-', '_');
    if (name === 'help' || name === 'json' || name === 'offline' || name === 'force') options[name] = true;
    else options[name] = args.shift();
  }
  return { command, options };
}

function usage() {
  return `mod-porter — Minecraft mod loader/version porting workbench

Usage:
  mod-porter analyze <project-or-jar> [--json]
  mod-porter versions [--offline] [--json]
  mod-porter port --input <project-or-jar> --to <loader> --minecraft <version|latest|start..end> --output <dir> [options]
  mod-porter verify <output-dir> [--loader <loader>] [--json]

Loaders: ${LOADERS.join(', ')}
Minecraft versions: release 1.20.1 through the current release in Mojang's manifest.

Port options:
  --from <loader>       Override automatic source-loader detection.
  --loader-version <v>  Pin the target loader version instead of resolving it.
  --offline             Skip network lookups; use conservative metadata defaults.
  --force               Replace an existing output directory.

Examples:
  mod-porter analyze ./my-mod.jar
  mod-porter port --input ./my-mod --to fabric --minecraft 1.20.1 --output ./port-output
  mod-porter port --input ./my-mod --to quilt --minecraft 1.20.1..latest --output ./port-output --force
`;
}

function print(value, json = false) {
  if (json) console.log(JSON.stringify(value, null, 2));
  else if (typeof value === 'string') console.log(value);
  else console.log(JSON.stringify(value, null, 2));
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (options.help || command === 'help') { console.log(usage()); return; }
  if (command === 'versions') {
    const result = await getMinecraftVersions({ offline: options.offline });
    print(result, options.json);
    return;
  }
  if (command === 'analyze') {
    const input = options.input ?? options._[0];
    if (!input) throw new Error('analyze requires a project directory or JAR.');
    print(await inspectInput(input), options.json);
    return;
  }
  if (command === 'port') {
    if (!options.input || !options.to || !options.output) throw new Error('port requires --input, --to, and --output.');
    const versions = await resolveMinecraftRange(options.minecraft ?? 'latest', { offline: options.offline });
    const outputRoot = options.output;
    const results = [];
    for (const minecraft of versions) {
      const output = versions.length === 1 ? outputRoot : `${outputRoot}/${minecraft}`;
      results.push(await portMod({ inputPath: options.input, outputPath: output, from: options.from, to: normalizeLoader(options.to), minecraft, loaderVersion: options.loader_version, offline: options.offline, force: options.force }));
    }
    print({ count: results.length, results }, options.json);
    return;
  }
  if (command === 'verify') {
    const input = options.input ?? options._[0];
    if (!input) throw new Error('verify requires an output directory.');
    const result = await verifyPort(input, options.loader);
    print(result, options.json);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  throw new Error(`Unknown command ${command}.\n\n${usage()}`);
}

main().catch((error) => {
  console.error(`mod-porter: ${error.message}`);
  process.exitCode = 1;
});
