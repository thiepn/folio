import { readFile } from 'node:fs/promises';

const source = JSON.parse(
  await readFile('src/platform/folio-boundary.json', 'utf8'),
);
const published = JSON.parse(
  await readFile('public/.well-known/folio-product.json', 'utf8'),
);

const failures = [];
const expectedModules = [
  'home',
  'knowledge',
  'library',
  'write',
  'notes',
  'canvas',
];
const frozenAliases = {
  folio: 'folio/home',
  knowledge: 'folio/knowledge',
  library: 'folio/library',
  manuscript: 'folio/write',
  notes: 'folio/notes',
  canvas: 'folio/canvas',
};

if (JSON.stringify(source) !== JSON.stringify(published))
  failures.push('Published Folio boundary must exactly match the source contract.');
if (source.schemaVersion !== 1)
  failures.push('schemaVersion must remain 1 during P9.');
if (source.phase !== 'P9')
  failures.push('phase must be P9.');
if (source.contractId !== 'folio-consolidation-boundary-v1')
  failures.push('Unexpected contractId.');
if (source.product !== 'folio')
  failures.push('Product must be folio.');
if (source.migrationMode !== 'federated-gradual')
  failures.push('P9 must remain a gradual federated migration.');
if (source.shell?.mayProxyExternalWrites !== false)
  failures.push('Folio shell must not proxy external-module writes in P9.');

const modules = new Map(source.modules.map((module) => [module.id, module]));
if (
  JSON.stringify(source.modules.map((module) => module.id)) !==
  JSON.stringify(expectedModules)
)
  failures.push('P9 module order/set drifted from the P8 Folio registry.');

for (const [alias, target] of Object.entries(frozenAliases)) {
  if (source.compatibility?.legacyAliases?.[alias] !== target)
    failures.push(`Frozen alias changed: ${alias} -> ${target}`);
}

for (const id of expectedModules) {
  const module = modules.get(id);
  if (!module) continue;
  if (module.canonicalRef !== `folio/${id}`)
    failures.push(`${id}: canonicalRef mismatch.`);
  if (!['active', 'staged'].includes(module.registryState))
    failures.push(`${id}: invalid registryState.`);
  if (
    module.writePolicy === 'provider-only' &&
    (!module.provider?.repo || !module.provider?.launchUrl)
  )
    failures.push(`${id}: provider-only modules require a provider.`);
}

if (modules.get('knowledge')?.provider !== null)
  failures.push('Knowledge must remain providerless/staged during P9.');
if (modules.get('knowledge')?.writePolicy !== 'disabled-until-provider-exists')
  failures.push('Knowledge writes must remain disabled during P9.');
if (modules.get('canvas')?.provider?.runtime !== 'public-realtime')
  failures.push('Canvas public/realtime runtime boundary must remain isolated.');
if (modules.get('canvas')?.writePolicy !== 'provider-only')
  failures.push('Canvas writes must stay provider-owned.');
if (modules.get('library')?.writePolicy !== 'provider-only')
  failures.push('Library writes must stay provider-owned.');
if (modules.get('write')?.writePolicy !== 'provider-only')
  failures.push('Manuscript writes must stay provider-owned.');
if (modules.get('notes')?.writePolicy !== 'provider-only')
  failures.push('Notes writes must stay provider-owned.');
if (!source.nonGoals.includes('merge databases'))
  failures.push('P9 must explicitly forbid database merging.');

if (failures.length) {
  console.error('Platform P9 Folio boundary validation failed:\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `Platform P9 Folio boundary valid: ${source.modules.length} modules / ${Object.keys(source.compatibility.legacyAliases).length} legacy aliases.`,
);
