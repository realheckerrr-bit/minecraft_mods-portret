import fs from 'node:fs/promises';
import path from 'node:path';
import { METADATA_PATHS, LOADERS, normalizeLoader } from './loaders.js';
import { readZip } from './zip.js';

const TEXT_EXTENSIONS = new Set(['.java', '.kt', '.kts', '.gradle', '.properties', '.json', '.toml', '.xml', '.yml', '.yaml', '.md', '.txt', '.mcmeta']);

async function collectDirectoryFiles(root, current = root, result = new Map()) {
  for (const entry of await fs.readdir(current, { withFileTypes: true })) {
    if (['.git', '.gradle', 'build', 'node_modules', 'out'].includes(entry.name)) continue;
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) await collectDirectoryFiles(root, absolute, result);
    else if (entry.isFile()) result.set(path.relative(root, absolute).replaceAll(path.sep, '/'), await fs.readFile(absolute));
  }
  return result;
}

export async function readInput(inputPath) {
  const absolute = path.resolve(inputPath);
  const stat = await fs.stat(absolute);
  if (stat.isDirectory()) return { kind: 'project', root: absolute, entries: await collectDirectoryFiles(absolute) };
  const buffer = await fs.readFile(absolute);
  if (!/\.(jar|zip)$/i.test(absolute)) throw new Error(`Input must be a project directory or a .jar/.zip file: ${absolute}`);
  return { kind: 'jar', root: absolute, entries: readZip(buffer) };
}

export function findMetadataEntry(entries, filename) {
  if (entries.has(filename)) return filename;
  return [...entries.keys()].filter((name) => name.endsWith(`/${filename}`)).sort((left, right) => left.length - right.length)[0] ?? null;
}

function jsonMetadata(entries, filename) {
  const entry = findMetadataEntry(entries, filename);
  const raw = entry ? entries.get(entry) : null;
  if (!raw) return null;
  try { return JSON.parse(raw.toString('utf8')); } catch { return { _parseError: `Could not parse ${filename} as JSON.` }; }
}

function tomlMetadata(entries, filename) {
  const entry = findMetadataEntry(entries, filename);
  const raw = entry ? entries.get(entry) : null;
  if (!raw) return null;
  const text = raw.toString('utf8');
  const value = (key) => {
    const match = text.match(new RegExp(`^\\s*${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s#]+))`, 'm'));
    return match ? (match[1] ?? match[2] ?? match[3]) : null;
  };
  const first = (keys) => keys.map(value).find((item) => item !== null) ?? null;
  return {
    _raw: text,
    modId: first(['modId', 'mod_id']),
    version: first(['version']),
    displayName: first(['displayName', 'display_name']),
    description: first(['description']),
    loaderVersion: first(['loaderVersion', 'loader_version']),
    minecraftVersionRange: text.match(/minecraft\s*=\s*"([^"]+)"/)?.[1] ?? null,
    dependencies: [...text.matchAll(/modId\s*=\s*"([^"]+)"/g)].map((match) => match[1]),
  };
}

function metadataForLoader(entries, loader) {
  if (loader === 'fabric') return jsonMetadata(entries, METADATA_PATHS.fabric);
  if (loader === 'quilt') return jsonMetadata(entries, METADATA_PATHS.quilt);
  return tomlMetadata(entries, METADATA_PATHS[loader]);
}

function versionsFromMetadata(loader, metadata) {
  if (!metadata || metadata._parseError) return [];
  if (loader === 'fabric' || loader === 'quilt') {
    const minecraft = metadata.depends?.minecraft;
    return minecraft ? [String(minecraft)] : [];
  }
  return metadata.minecraftVersionRange ? [metadata.minecraftVersionRange] : [];
}

function identifyMod(metadataByLoader) {
  for (const loader of ['quilt', 'fabric', 'neoforge', 'forge']) {
    const metadata = metadataByLoader[loader];
    if (!metadata || metadata._parseError) continue;
    const id = loader === 'fabric' || loader === 'quilt' ? metadata.id ?? metadata.quilt_loader?.id : metadata.modId;
    if (id) return {
      id,
      name: loader === 'quilt' ? (metadata.quilt_loader?.metadata?.name ?? id) : (metadata.name ?? metadata.displayName ?? id),
      version: loader === 'quilt' ? metadata.quilt_loader?.version : metadata.version,
      description: loader === 'quilt' ? metadata.quilt_loader?.metadata?.description : metadata.description,
    };
  }
  return { id: 'unknown-mod', name: 'Unknown mod', version: '0.0.0', description: '' };
}

function sourceHints(entries) {
  const hints = new Set();
  for (const [name, buffer] of entries) {
    if (!TEXT_EXTENSIONS.has(path.extname(name).toLowerCase())) continue;
    const text = buffer.toString('utf8');
    if (/net\.minecraftforge\b|mods\.toml/.test(text)) hints.add('forge');
    if (/net\.neoforged\b|neoforge\.mods\.toml/.test(text)) hints.add('neoforge');
    if (/net\.fabricmc\b|fabric\.mod\.json/.test(text)) hints.add('fabric');
    if (/org\.quiltmc\b|quilt\.mod\.json/.test(text)) hints.add('quilt');
  }
  return [...hints];
}

export async function inspectInput(inputPath) {
  const input = await readInput(inputPath);
  const metadataByLoader = Object.fromEntries(LOADERS.map((loader) => [loader, metadataForLoader(input.entries, loader)]));
  const detectedLoaders = LOADERS.filter((loader) => metadataByLoader[loader] !== null);
  const parsedMetadata = detectedLoaders.map((loader) => metadataByLoader[loader]).find((metadata) => !metadata?._parseError);
  const identity = identifyMod(metadataByLoader);
  const findings = [];
  if (!detectedLoaders.length) findings.push({ severity: 'error', code: 'NO_LOADER_METADATA', message: 'No supported loader metadata was found.' });
  if (detectedLoaders.length > 1) findings.push({ severity: 'warning', code: 'MULTIPLE_METADATA', message: `Found metadata for multiple loaders: ${detectedLoaders.join(', ')}.` });
  if (detectedLoaders.some((loader) => metadataByLoader[loader]?._parseError)) findings.push({ severity: 'error', code: 'INVALID_METADATA', message: 'At least one loader metadata file could not be parsed.' });
  if (input.kind === 'jar') findings.push({ severity: 'warning', code: 'COMPILED_INPUT', message: 'A JAR contains compiled bytecode. Metadata can be repacked, but API changes require source or a manually reviewed bytecode port.' });
  return {
    input: inputPath,
    kind: input.kind,
    entries: input.entries.size,
    detectedLoaders,
    sourceHints: sourceHints(input.entries),
    minecraftVersionConstraints: [...new Set(detectedLoaders.flatMap((loader) => versionsFromMetadata(loader, metadataByLoader[loader])))],
    identity,
    metadata: parsedMetadata ?? null,
    findings,
  };
}

export function metadataFor(entries, loader) {
  return metadataForLoader(entries, normalizeLoader(loader));
}

export { METADATA_PATHS };
