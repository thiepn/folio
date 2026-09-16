/**
 * Compatibility identifiers from the pre-Folio release.
 *
 * These are intentionally isolated here so Folio can migrate existing local
 * data and accept older exported JSON without exposing the retired product
 * identity anywhere in the current UI or newly generated files.
 */
export const LEGACY_DATABASE_NAME = 'obsidian-editorial-productivity'
export const LEGACY_APPEARANCE_KEY = 'obsidian-editorial:appearance:v1'
export const LEGACY_LAST_VIEW_KEY = 'obsidian-editorial:last-view:v1'
export const LEGACY_BACKUP_FORMAT = 'obsidian-editorial-backup'
export const LEGACY_IMPORT_FORMAT = 'obsidian-editorial-import'
export const LEGACY_PATCH_FORMAT = 'obsidian-editorial-patch'
