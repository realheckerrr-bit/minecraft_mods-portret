const $ = (id) => document.getElementById(id);
const state = { versions: [], busy: false };

function setStatus(label, kind = 'ready') { $('status').className = `status ${kind}`; $('status').querySelector('span').textContent = label; }
function log(message) { const line = document.createElement('div'); line.className = 'log-line'; line.textContent = `${new Date().toLocaleTimeString()}  ${message}`; $('log').appendChild(line); $('log').scrollTop = $('log').scrollHeight; }
function errorMessage(error) { return error?.message ?? String(error); }
function requireInput() { const value = $('inputPath').value.trim(); if (!value) throw new Error('Choose a mod JAR or project folder first.'); return value; }
function requireOutput() { const value = $('outputPath').value.trim(); if (!value) throw new Error('Choose an output folder first.'); return value; }
function run(task) { return Promise.resolve().then(task).catch((error) => { setStatus('Needs attention', 'error'); log(`Error: ${errorMessage(error)}`); }); }

function renderAnalysis(result) {
  $('analysisEmpty').classList.add('hidden');
  const findings = (result.findings ?? []).map((item) => `<div class="finding ${item.severity === 'error' ? 'error' : ''}">${item.severity.toUpperCase()}: ${item.message}</div>`).join('');
  $('analysisResult').innerHTML = `<div class="badge-row">${(result.detectedLoaders ?? []).map((loader) => `<span class="badge">${loader}</span>`).join('') || '<span class="finding error">No supported loader metadata found.</span>'}</div><div class="summary-grid"><div class="summary-item"><span>Mod</span><strong>${result.identity?.name ?? 'Unknown'}</strong></div><div class="summary-item"><span>Identity</span><strong>${result.identity?.id ?? 'unknown-mod'}</strong></div><div class="summary-item"><span>Input</span><strong>${result.kind}</strong></div><div class="summary-item"><span>Entries</span><strong>${result.entries}</strong></div></div>${findings}`;
  $('analysisResult').classList.remove('hidden');
}

function renderResult(result, verified) {
  $('resultEmpty').classList.add('hidden');
  $('resultContent').innerHTML = `<div class="result-ok"><span>✓</span> Port output created and metadata verified</div><div class="summary-grid" style="margin-top:15px"><div class="summary-item"><span>Target</span><strong>${result.to} · ${result.minecraft}</strong></div><div class="summary-item"><span>Files rewritten</span><strong>${result.rewrittenFiles}</strong></div></div><div class="result-path">${result.output}</div><div class="report-preview">${result.report || 'Report preview unavailable.'}</div><div class="result-actions"><button id="openOutput" class="secondary">Open output folder</button><button id="verifyAgain" class="secondary">Verify again</button></div>`;
  $('resultContent').classList.remove('hidden');
  $('openOutput').addEventListener('click', () => window.modPorter.openPath(result.output));
  $('verifyAgain').addEventListener('click', () => verifyOutput(result.output));
}

async function loadVersions() {
  setStatus('Loading releases', 'busy'); log('Fetching Mojang release manifest…');
  const result = await window.modPorter.versions({});
  state.versions = result.versions ?? [];
  $('versionList').innerHTML = state.versions.map((version) => `<option value="${version}">`).join('');
  log(`Loaded ${state.versions.length} Minecraft releases; latest is ${result.latest}.`); setStatus('Ready');
}

async function analyze() { const input = requireInput(); setStatus('Analyzing', 'busy'); log(`Inspecting ${input}`); const result = await window.modPorter.analyze(input); renderAnalysis(result); log(`Detected ${result.detectedLoaders.join(', ') || 'no supported loader'} metadata for ${result.identity.id}.`); setStatus('Ready'); }
async function port() { const input = requireInput(); const output = requireOutput(); const request = { inputPath:input, outputPath:output, from:$('fromLoader').value || undefined, to:$('toLoader').value, minecraft:$('minecraftVersion').value.trim() || 'latest', loaderVersion:$('loaderVersion').value.trim() || undefined, force:false }; setStatus('Porting', 'busy'); log(`Porting ${request.minecraft} ${request.from || 'auto'} → ${request.to}…`); const result = await window.modPorter.port(request); const verified = await window.modPorter.verify({ outputPath:result.output, expectedLoader:result.to }); if (!verified.ok) throw new Error(`Output verification failed: ${verified.errors.join(' ')}`); renderResult(result, verified); log(`Created verified output at ${result.output}. Manual API review remains required.`); setStatus('Ready'); }
async function verifyOutput(output) { setStatus('Verifying', 'busy'); const result = await window.modPorter.verify({ outputPath:output, expectedLoader:$('toLoader').value }); if (result.ok) { log(`Verified ${result.target} metadata at ${output}.`); setStatus('Ready'); } else { throw new Error(result.errors.join(' ')); } }

$('browseInput').addEventListener('click', () => run(async () => { const value = await window.modPorter.browseInput(); if (value) { $('inputPath').value = value; log(`Selected input: ${value}`); } }));
$('browseOutput').addEventListener('click', () => run(async () => { const value = await window.modPorter.browseOutput(); if (value) { $('outputPath').value = value; log(`Selected output folder: ${value}`); } }));
$('loadVersions').addEventListener('click', () => run(loadVersions)); $('analyze').addEventListener('click', () => run(analyze)); $('port').addEventListener('click', () => run(port)); $('clearLog').addEventListener('click', () => { $('log').innerHTML = ''; });
window.addEventListener('DOMContentLoaded', () => { run(loadVersions); });
