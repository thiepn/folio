import type { Transaction } from 'dexie'

/** Phase 15 adds calendar import provenance only; existing entity rows require no transformation. */
export async function migrateV10ToV11(_tx: Transaction) {
  // Intentionally empty. Dexie creates the new calendarImportBatches table.
}
