import boundaryData from './folio-boundary.json';
import type {
  FolioCanonicalRef,
  FolioModuleBoundary,
  FolioModuleId,
} from './folio-boundary-types';

export const FOLIO_BOUNDARY = boundaryData;

const modules = new Map<FolioModuleId, FolioModuleBoundary>(
  boundaryData.modules.map((module) => [
    module.id as FolioModuleId,
    module as FolioModuleBoundary,
  ]),
);

const aliases = new Map<string, FolioCanonicalRef>(
  Object.entries(boundaryData.compatibility.legacyAliases).map(
    ([alias, target]) => [alias, target as FolioCanonicalRef],
  ),
);

export function resolveFolioModule(
  input: string,
): FolioModuleBoundary | null {
  const canonical = aliases.get(input) ?? input;
  if (!canonical.startsWith('folio/')) return null;
  const id = canonical.slice('folio/'.length) as FolioModuleId;
  const module = modules.get(id);
  return module?.canonicalRef === canonical ? module : null;
}

export function folioModuleLaunchUrl(input: string): string | null {
  return resolveFolioModule(input)?.provider?.launchUrl ?? null;
}

export function folioModuleOwns(
  input: string,
  domain: string,
): boolean {
  return resolveFolioModule(input)?.owns.includes(domain) ?? false;
}

export function mayFolioShellWrite(input: string): boolean {
  return resolveFolioModule(input)?.writePolicy === 'native-only';
}

export function isNativeFolioDomain(domain: string): boolean {
  return FOLIO_BOUNDARY.nativeDomains.includes(domain);
}
