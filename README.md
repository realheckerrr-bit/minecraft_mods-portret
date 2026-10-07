# minecraft_mods-portret

`mod-porter` is a conservative Minecraft mod-porting workbench for the four Java mod loaders:

- NeoForge
- Forge
- Fabric
- Quilt

It accepts a normal Gradle source project or a mod JAR, detects loader metadata, generates metadata for a different target loader, performs narrowly scoped source namespace rewrites where they are well-defined, and writes a reviewable `PORTING_REPORT.md`.

Minecraft support starts at **1.20.1** and follows Mojang's current release manifest at runtime. Use `latest` or a range such as `1.20.1..latest`; no fixed “latest” version is baked into the CLI.

## Important behavior

Porting a mod is not just renaming its metadata. Loader APIs, registries, lifecycle hooks, networking, rendering, mappings, and Gradle plugins can all differ. `mod-porter` intentionally reports work it cannot prove safe:

- Source projects receive metadata and limited, explicit text rewrites.
- JAR inputs are repacked with target metadata, but compiled classes are never silently rewritten.
- Every output includes a report and marks manual review as required.
- The generated artifact must still be built and tested with the target loader.

## Requirements

- Node.js 20 or newer
- Java and the target loader's Gradle toolchain for actually compiling a Minecraft project

The CLI itself has no runtime npm dependencies.

## Install and run

```text
npm install
npm test
npm start -- versions
npm start -- analyze ./my-mod
npm start -- port --input ./my-mod --to fabric --minecraft 1.20.1 --output ./port-output
npm start -- verify ./port-output
```

The package also exposes the command directly after `npm link`:

```text
mod-porter port --input ./my-mod.jar --to neoforge --minecraft latest --output ./port-output
```

For every Mojang release from 1.20.1 through the current release:

```text
npm start -- port --input ./my-mod --to quilt --minecraft 1.20.1..latest --output ./port-output --force
```

Each version is written to `./port-output/<minecraft-version>/`. Add `--offline` to skip network lookups; this uses conservative fallback loader metadata constraints and does not update the version list.

## Windows GUI and EXE

The repository also contains a desktop GUI backed by the same porting engine:

```text
npm install
npm run gui
```

To build a Windows installer and portable EXE locally:

```text
npm run dist:win
```

The artifacts are written to `dist-gui/`. The GUI provides input/output browsing, automatic or explicit source-loader selection, target loader selection, Mojang release loading, analysis, porting, verification, and a report preview. GitHub Actions builds the Windows installer and portable executable on every push to `main` and publishes them as workflow artifacts.

## Ownership and forks

The original Minecraft Mod-Porter product is owned by **realheckerrr-bit**. The included [Minecraft Mod-Porter License](./LICENSE) allows people to change, fork, merge, redistribute, and sell modified versions, as long as the original copyright and license remain visible and modified versions are identified. Forks should use a distinct product name; the original branding is not transferred.

## Commands

### `analyze`

`analyze` detects `fabric.mod.json`, `quilt.mod.json`, `META-INF/mods.toml`, and `META-INF/neoforge.mods.toml`, including the usual `src/main/resources` layout. It reports the mod identity, Minecraft constraints, loader hints, and findings.

### `port`

`port` takes `--input`, `--to`, `--minecraft`, and `--output`. `--from` is optional when supported metadata is present. `--loader-version` pins a target loader version; otherwise the CLI asks the loader's public metadata service when available.

The output preserves project files, removes old loader metadata, writes target metadata into the same resource directory, and creates:

- `PORTING_REPORT.md` — findings and required review steps
- `mod-porter.json` — machine-readable provenance
- `ported-mod.jar` — for JAR input, containing the repacked entries

### `verify`

`verify` checks that the generated output contains the requested target metadata and that the output's loader can be detected. It does not claim that Java bytecode or loader APIs compile successfully.

## Development

```text
npm test
npm run lint
```

The ZIP/JAR reader and writer are implemented with Node's standard library so the core CLI remains easy to run on Windows, macOS, and Linux.
