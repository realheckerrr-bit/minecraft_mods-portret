import fs from 'node:fs/promises';
import path from 'node:path';
import { findMetadataEntry, inspectInput, readInput } from './inspect.js';
import { METADATA_PATHS, normalizeLoader } from './loaders.js';
import { writeZip } from './zip.js';
import { getLoaderVersion } from './versions.js';

const TEXT_EXTENSIONS = new Set(['.java', '.kt', '.kts', '.gradle', '.properties', '.json', '.toml', '.xml', '.yml', '.yaml', '.md', '.txt', '.mcmeta']);

function asString(value, fallback = '') {
  return value === undefined || value === null ? fallback : String(value);
}

function quoteToml(value) {
  return JSON.stringify(asString(value));
}

function safeId(value) {
  const normalized = asString(value, 'ported-mod').toLowerCase().replace(/[^a-z0-9_\-.]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'ported-mod';
}

function sourceEntrypoints(inputMetadata, from) {
  if (!inputMetadata) return {};
  if (from === 'fabric') return inputMetadata.entrypoints ?? {};
  if (from === 'quilt') return inputMetadata.quilt_loader?.entrypoints ?? {};
  return {};
}

function normalizeEntrypointsForQuilt(entrypoints) {
  if (!entrypoints || typeof entrypoints !== 'object') return {};
  const init = entrypoints.init ?? entrypoints.main;
  return init ? { init: Array.isArray(init) ? init : [init] } : {};
}

function makeFabricMetadata(identity, inputMetadata, from, minecraft, loaderVersion) {
  const metadata = {
    schemaVersion: 1,
    id: safeId(identity.id),
    version: asString(identity.version, '0.1.0'),
    name: asString(identity.name, identity.id),
    description: asString(identity.description),
    depends: {
      minecraft: minecraft,
      fabricloader: loaderVersion ? `>=${loaderVersion}` : '>=0.15.0',
    },
  };
  const entrypoints = sourceEntrypoints(inputMetadata, from);
  if (Object.keys(entrypoints).length) metadata.entrypoints = entrypoints;
  if (Array.isArray(inputMetadata?.authors)) metadata.authors = inputMetadata.authors;
  if (inputMetadata?.license) metadata.license = inputMetadata.license;
  return `${JSON.stringify(metadata, null, 2)}\n`;
}

function makeQuiltMetadata(identity, inputMetadata, from, minecraft, loaderVersion) {
  const source = inputMetadata?.quilt_loader?.metadata ?? inputMetadata ?? {};
  const contributors = source.contributors ?? (inputMetadata?.authors ? Object.fromEntries(inputMetadata.authors.map((author) => [String(author), ''])) : undefined);
  const metadata = {
    quilt_loader: {
      group: `mod.ported.${safeId(identity.id)}`,
      id: safeId(identity.id),
      version: asString(identity.version, '0.1.0'),
      metadata: {
        name: asString(identity.name, identity.id),
        description: asString(identity.description),
        license: asString(source.license, 'MIT'),
      },
      depends: [
        { id: 'quilt_loader', versions: loaderVersion ? `>=${loaderVersion}` : '>=0.26.0' },
        { id: 'minecraft', versions: minecraft },
      ],
    },
  };
  if (contributors) metadata.quilt_loader.metadata.contributors = contributors;
  const entrypoints = normalizeEntrypointsForQuilt(sourceEntrypoints(inputMetadata, from));
  if (Object.keys(entrypoints).length) metadata.quilt_loader.entrypoints = entrypoints;
  return `${JSON.stringify(metadata, null, 2)}\n`;
}

function makeTomlMetadata(identity, loader, minecraft, loaderVersion, inputMetadata) {
  const loaderMajor = loaderVersion?.includes('-') ? loaderVersion.split('-').at(-1).split('.')[0] : loaderVersion?.split('.')[0];
  const loaderRange = loaderMajor ? `[${loaderMajor},)` : '[0,)';
  const license = inputMetadata?.license ?? inputMetadata?.quilt_loader?.metadata?.license ?? 'MIT';
  const lines = [
    `modLoader="javafml"`,
    `loaderVersion=${quoteToml(loaderRange)}`,
    `license=${quoteToml(license)}`,
    `issueTrackerURL="https://github.com/realheckerrr-bit/minecraft_mods-portret/issues"`,
    '',
    '[[mods]]',
    `modId=${quoteToml(safeId(identity.id))}`,
    `version=${quoteToml(asString(identity.version, '0.1.0'))}`,
    `displayName=${quoteToml(asString(identity.name, identity.id))}`,
    `description=${quoteToml(asString(identity.description))}`,
    '',
    '[[dependencies.' + safeId(identity.id) + ']]',
    `modId="minecraft"`,
    `mandatory=true`,
    `versionRange=${quoteToml(`[${minecraft}]`)}`,
    `ordering="NONE"`,
    `side="BOTH"`,
  ];
  return `${lines.join('\n')}\n`;
}

export function createTargetMetadata({ identity, inputMetadata, from, to, minecraft, loaderVersion }) {
  if (to === 'fabric') return { path: METADATA_PATHS.fabric, content: makeFabricMetadata(identity, inputMetadata, from, minecraft, loaderVersion) };
  if (to === 'quilt') return { path: METADATA_PATHS.quilt, content: makeQuiltMetadata(identity, inputMetadata, from, minecraft, loaderVersion) };
  return { path: METADATA_PATHS[to], content: makeTomlMetadata(identity, to, minecraft, loaderVersion, inputMetadata) };
}

function rewriteText(text, from, to) {
  let output = text;
  if (from === 'forge' && to === 'neoforge') {
    output = output.replaceAll('net.minecraftforge.common.MinecraftForge', 'net.neoforged.neoforge.common.NeoForge');
    output = output.replaceAll('net.minecraftforge', 'net.neoforged');
  } else if (from === 'neoforge' && to === 'forge') {
    output = output.replaceAll('net.neoforged.neoforge.common.NeoForge', 'net.minecraftforge.common.MinecraftForge');
    output = output.replaceAll('net.neoforged', 'net.minecraftforge');
  }
  if ((from === 'fabric' && to === 'quilt') || (from === 'quilt' && to === 'fabric')) {
    output = output.replaceAll('fabric.mod.json', to === 'quilt' ? 'quilt.mod.json' : 'fabric.mod.json');
    output = output.replaceAll('quilt.mod.json', to === 'quilt' ? 'quilt.mod.json' : 'fabric.mod.json');
  }
  return output;
}

function rewriteEntries(entries, from, to, kind) {
  const output = new Map();
  let rewrittenFiles = 0;
  for (const [name, buffer] of entries) {
    if (kind === 'project' && TEXT_EXTENSIONS.has(path.extname(name).toLowerCase())) {
      const before = buffer.toString('utf8');
      const after = rewriteText(before, from, to);
      if (before !== after) rewrittenFiles += 1;
      output.set(name, Buffer.from(after));
    } else output.set(name, buffer);
  }
  return { entries: output, rewrittenFiles };
}

function removeLoaderMetadata(entries) {
  for (const metadataPath of Object.values(METADATA_PATHS)) {
    for (const entry of [...entries.keys()]) if (entry === metadataPath || entry.endsWith(`/${metadataPath}`)) entries.delete(entry);
  }
}

function targetMetadataPath(entries, sourceLoader, targetLoader) {
  const sourcePath = findMetadataEntry(entries, METADATA_PATHS[sourceLoader]);
  const prefix = sourcePath ? sourcePath.slice(0, sourcePath.length - METADATA_PATHS[sourceLoader].length) : '';
  return `${prefix}${METADATA_PATHS[targetLoader]}`;
}

function manualSteps(from, to, kind) {
  const steps = [];
  if (kind === 'jar') steps.push('Provide source code and a matching development workspace for a runtime/API port; this output only repacks metadata and does not rewrite compiled classes.');
  if (from === 'forge' && to === 'neoforge' || from === 'neoforge' && to === 'forge') steps.push('Review event bus, registries, capabilities, networking, and access-transformer calls; namespace rewriting does not guarantee API compatibility.');
  if (from === 'fabric' && (to === 'forge' || to === 'neoforge') || from === 'quilt' && (to === 'forge' || to === 'neoforge')) steps.push('Implement a native loader entrypoint and replace Fabric/Quilt lifecycle, registry, networking, and rendering APIs with the target loader APIs.');
  if ((from === 'forge' || from === 'neoforge') && (to === 'fabric' || to === 'quilt')) steps.push('Implement Fabric/Quilt initialization and replace Forge lifecycle, registry, event, networking, and rendering APIs.');
  if (from === 'quilt' && to === 'fabric' || from === 'fabric' && to === 'quilt') steps.push('Review loader-specific entrypoints and QSL/Fabric API usage; only metadata-compatible entrypoints are carried forward automatically.');
  steps.push('Run the target loader Gradle build and test on both client and dedicated server before publishing the port.');
  return steps;
}

export function renderReport({ inspection, from, to, minecraft, loaderVersion, rewrittenFiles, metadataPath, manual }) {
  const findings = inspection.findings.length ? inspection.findings.map((item) => `- **${item.severity}** ${item.code}: ${item.message}`).join('\n') : '- None';
  const steps = manual.map((step) => `- ${step}`).join('\n');
  return `# Mod-Porter report\n\n` +
    `Generated: ${new Date().toISOString()}\n\n` +
    `## Port target\n\n` +
    `- Input: ${inspection.input} (${inspection.kind})\n` +
    `- Detected loader: **${from}**\n` +
    `- Target loader: **${to}**\n` +
    `- Minecraft: **${minecraft}**\n` +
    `- Target loader version: ${loaderVersion ?? 'not resolved; use the loader default or pass one explicitly'}\n` +
    `- Generated metadata: ${metadataPath}\n` +
    `- Source text files rewritten: **${rewrittenFiles}**\n\n` +
    `## Findings\n\n${findings}\n\n` +
    `## Required review\n\n${steps}\n\n` +
    `This report is deliberately conservative: a successful metadata conversion is not proof that a compiled or source mod is runtime-compatible.\n`;
}

async function writeProjectEntries(output, entries) {
  for (const [name, buffer] of entries) {
    const destination = path.join(output, ...name.split('/'));
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, buffer);
  }
}

export async function portMod({ inputPath, outputPath, from, to, minecraft, loaderVersion, offline = false, force = false }) {
  const input = await readInput(inputPath);
  const inspection = await inspectInput(inputPath);
  const sourceLoader = from ? normalizeLoader(from) : inspection.detectedLoaders[0];
  if (!sourceLoader) throw new Error('Could not detect the input loader. Pass --from forge|neoforge|fabric|quilt.');
  const targetLoader = normalizeLoader(to);
  if (sourceLoader === targetLoader) throw new Error('Source and target loaders are the same; choose a different --to loader.');
  const output = path.resolve(outputPath);
  if (output === path.resolve(inputPath)) throw new Error('Output must be different from input.');
  if (force) await fs.rm(output, { recursive: true, force: true });
  else {
    try { if ((await fs.readdir(output)).length) throw new Error(`Output directory is not empty: ${output}. Use --force to replace it.`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await fs.mkdir(output, { recursive: true });
  const rewritten = rewriteEntries(input.entries, sourceLoader, targetLoader, input.kind);
  removeLoaderMetadata(rewritten.entries);
  const loaderVersionResolved = loaderVersion ?? await getLoaderVersion(targetLoader, minecraft, { offline });
  const targetMetadata = createTargetMetadata({ identity: inspection.identity, inputMetadata: inspection.metadata, from: sourceLoader, to: targetLoader, minecraft, loaderVersion: loaderVersionResolved });
  targetMetadata.path = targetMetadataPath(input.entries, sourceLoader, targetLoader);
  rewritten.entries.set(targetMetadata.path, Buffer.from(targetMetadata.content));
  if (input.kind === 'project') await writeProjectEntries(output, rewritten.entries);
  else await fs.writeFile(path.join(output, 'ported-mod.jar'), writeZip(rewritten.entries));
  const manual = manualSteps(sourceLoader, targetLoader, input.kind);
  const report = renderReport({ inspection, from: sourceLoader, to: targetLoader, minecraft, loaderVersion: loaderVersionResolved, rewrittenFiles: rewritten.rewrittenFiles, metadataPath: targetMetadata.path, manual });
  await fs.writeFile(path.join(output, 'PORTING_REPORT.md'), report);
  await fs.writeFile(path.join(output, 'mod-porter.json'), `${JSON.stringify({ tool: 'minecraft_mods-portret', version: '0.1.0', input: inputPath, kind: input.kind, from: sourceLoader, to: targetLoader, minecraft, loaderVersion: loaderVersionResolved, metadataPath: targetMetadata.path, rewrittenFiles: rewritten.rewrittenFiles, manualReviewRequired: true }, null, 2)}\n`);
  return { output, input: input.kind, from: sourceLoader, to: targetLoader, minecraft, loaderVersion: loaderVersionResolved, metadataPath: targetMetadata.path, rewrittenFiles: rewritten.rewrittenFiles, manualReviewRequired: true };
}

export async function verifyPort(outputPath, expectedLoader) {
  const absoluteOutput = path.resolve(outputPath);
  const manifest = JSON.parse(await fs.readFile(path.join(absoluteOutput, 'mod-porter.json'), 'utf8'));
  const target = expectedLoader ? normalizeLoader(expectedLoader) : normalizeLoader(manifest.to);
  let inspectedPath = outputPath;
  try {
    const stat = await fs.stat(path.join(absoluteOutput, 'ported-mod.jar'));
    if (stat.isFile()) inspectedPath = path.join(absoluteOutput, 'ported-mod.jar');
  } catch { /* Source-project output has no bundled JAR. */ }
  const inspection = await inspectInput(inspectedPath);
  const expectedPath = METADATA_PATHS[target];
  const input = await readInput(inspectedPath);
  const errors = [];
  if (!findMetadataEntry(input.entries, expectedPath)) errors.push(`Missing target metadata: ${expectedPath}`);
  if (inspection.detectedLoaders.length && !inspection.detectedLoaders.includes(target)) errors.push(`Detected loaders do not include expected target ${target}.`);
  return { ok: errors.length === 0, target, expectedPath, errors, inspection };
}
