import type { Transaction } from 'dexie'

export async function migrateV23ToV24(_tx: Transaction) {
  // D18 adds derived sync metadata tables only. Existing planner rows remain untouched.
}
