export type FolioModuleId =
  | 'home'
  | 'knowledge'
  | 'library'
  | 'write'
  | 'notes'
  | 'canvas';

export type FolioCanonicalRef = `folio/${FolioModuleId}`;
export type FolioRegistryState = 'active' | 'staged';
export type FolioWritePolicy =
  | 'native-only'
  | 'provider-only'
  | 'disabled-until-provider-exists';

export interface FolioModuleProvider {
  repo: string;
  launchUrl: string;
  runtime: string;
  storage: string;
}

export interface FolioModuleBoundary {
  id: FolioModuleId;
  canonicalRef: FolioCanonicalRef;
  registryState: FolioRegistryState;
  provider: FolioModuleProvider | null;
  owns: readonly string[];
  transitional: readonly string[];
  writePolicy: FolioWritePolicy;
  migration: string;
}
