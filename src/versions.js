const MINIMUM_VERSION = '1.20.1';
const MOJANG_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

export async function fetchJson(url, { timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'minecraft_mods-portret/0.1.0' } });
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export function compareMinecraftVersions(left, right) {
  const a = String(left).replace(/[^0-9.].*$/, '').split('.').map(Number);
  const b = String(right).replace(/[^0-9.].*$/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const delta = (a[i] ?? 0) - (b[i] ?? 0);
    if (delta) return delta;
  }
  return 0;
}

export function supportedManifestVersions(manifest) {
  return (manifest.versions ?? [])
    .filter((version) => version.type === 'release' && compareMinecraftVersions(version.id, MINIMUM_VERSION) >= 0)
    .map((version) => version.id)
    .sort(compareMinecraftVersions);
}

export async function getMinecraftVersions({ offline = false, fetcher = fetchJson } = {}) {
  if (offline) return { minimum: MINIMUM_VERSION, latest: null, versions: [MINIMUM_VERSION], source: 'offline fallback' };
  const manifest = await fetcher(MOJANG_MANIFEST);
  const versions = supportedManifestVersions(manifest);
  if (!versions.length) throw new Error(`Mojang's manifest contains no releases at or after ${MINIMUM_VERSION}.`);
  return { minimum: MINIMUM_VERSION, latest: versions.at(-1), versions, source: MOJANG_MANIFEST, releaseType: manifest.latest?.release };
}

export async function resolveMinecraftVersion(value, options = {}) {
  if (!value || value === 'latest') return (await getMinecraftVersions(options)).latest ?? MINIMUM_VERSION;
  const versions = await getMinecraftVersions(options);
  if (!versions.versions.includes(value)) {
    throw new Error(`Minecraft ${value} is not a release in the supported range ${MINIMUM_VERSION}..${versions.latest ?? 'latest'}.`);
  }
  return value;
}

export async function resolveMinecraftRange(value, options = {}) {
  if (!value || value === 'latest') return [await resolveMinecraftVersion(value, options)];
  const versions = await getMinecraftVersions(options);
  if (value === 'all' || value === `${MINIMUM_VERSION}:latest` || value === `${MINIMUM_VERSION}..latest`) return versions.versions;
  const delimiter = value.includes('..') ? '..' : value.includes(':') ? ':' : null;
  if (!delimiter) return [await resolveMinecraftVersion(value, options)];
  const [start, endValue] = value.split(delimiter);
  const end = endValue === 'latest' ? versions.latest : endValue;
  if (!versions.versions.includes(start) || !versions.versions.includes(end)) throw new Error(`Minecraft range ${value} is not available in Mojang's release manifest.`);
  return versions.versions.filter((version) => compareMinecraftVersions(version, start) >= 0 && compareMinecraftVersions(version, end) <= 0);
}

function lastVersion(values) {
  return values.at(-1) ?? null;
}

export async function getLoaderVersion(loader, minecraft, { offline = false, fetcher = fetchJson } = {}) {
  if (offline) return null;
  try {
    if (loader === 'fabric') {
      const rows = await fetcher(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(minecraft)}`);
      return rows.map((row) => row.loader?.version).filter(Boolean).at(0) ?? null;
    }
    if (loader === 'quilt') {
      const rows = await fetcher(`https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(minecraft)}`);
      return rows.map((row) => row.loader?.version ?? row.version).filter(Boolean).at(0) ?? null;
    }
    const url = loader === 'forge'
      ? 'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml'
      : 'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml';
    const response = await fetch(url, { headers: { 'user-agent': 'minecraft_mods-portret/0.1.0' } });
    if (!response.ok) return null;
    const xml = await response.text();
    const values = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((match) => match[1]);
    if (loader === 'forge') return lastVersion(values.filter((version) => version.startsWith(`${minecraft}-`)));
    // NeoForge's first two numeric components mirror the Minecraft release
    // without the legacy leading "1." (1.20.1 -> 20.1, 1.21.1 -> 21.1).
    const neoForgePrefix = minecraft.startsWith('1.') ? minecraft.slice(2) : minecraft;
    return lastVersion(values.filter((version) => version.startsWith(`${neoForgePrefix}.`)));
  } catch {
    return null;
  }
}

export { MINIMUM_VERSION, MOJANG_MANIFEST };
