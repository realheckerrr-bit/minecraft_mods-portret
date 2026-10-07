export const LOADERS = Object.freeze(['neoforge', 'forge', 'fabric', 'quilt']);

const aliases = new Map([
  ['neo', 'neoforge'],
  ['neoforge', 'neoforge'],
  ['neoforged', 'neoforge'],
  ['forge', 'forge'],
  ['fml', 'forge'],
  ['fabric', 'fabric'],
  ['fabricmc', 'fabric'],
  ['quilt', 'quilt'],
]);

export function normalizeLoader(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  const loader = aliases.get(normalized);
  if (!loader) throw new Error(`Unsupported loader "${value}". Use one of: ${LOADERS.join(', ')}.`);
  return loader;
}

export const METADATA_PATHS = Object.freeze({
  fabric: 'fabric.mod.json',
  quilt: 'quilt.mod.json',
  forge: 'META-INF/mods.toml',
  neoforge: 'META-INF/neoforge.mods.toml',
});

export const LOADER_DOCS = Object.freeze({
  fabric: 'https://fabricmc.net/wiki/documentation:fabric_mod_json',
  quilt: 'https://github.com/QuiltMC/quilt-loader/blob/main/src/main/resources/quilt_loader.schema.json',
  forge: 'https://docs.minecraftforge.net/en/latest/gettingstarted/modfiles/',
  neoforge: 'https://docs.neoforged.net/docs/gettingstarted/modfiles/',
});

export function isLoader(value) {
  try { normalizeLoader(value); return true; } catch { return false; }
}
