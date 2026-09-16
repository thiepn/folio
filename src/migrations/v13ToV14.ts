import type { Transaction } from 'dexie'

/**
 * v14 adds the reviewRecords table. Existing entity rows require no rewrite;
 * Dexie creates the new table from the v14 store declaration.
 */
export async function migrateV13ToV14(_tx: Transaction) {
  // Intentionally empty: durable review history begins from v14 onward.
}
