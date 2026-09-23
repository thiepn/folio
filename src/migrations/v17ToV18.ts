import type { Transaction } from 'dexie'

export async function migrateV17ToV18(_tx: Transaction) {
  // D3 adds reminder definition + occurrence tables. Existing planner entities
  // are intentionally unchanged; older workspaces begin with no reminders.
}
