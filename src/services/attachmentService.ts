import { db } from '../db/database'
import type { AttachmentEntity, AttachmentKind, ContentOwnerType } from '../domain/models'
import { contentSearchService } from './contentSearchService'

export interface PortableAttachment extends Omit<AttachmentEntity, 'blob'> { dataBase64?: string }

const QUOTA_HEADROOM_BYTES = 8 * 1024 * 1024
const MAX_SINGLE_FILE_BYTES = 100 * 1024 * 1024

function fileKind(file: File): AttachmentKind {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('audio/')) return 'audio'
  return 'file'
}

async function ensureOwner(ownerType: ContentOwnerType, ownerId: string) {
  const owner = ownerType === 'task' ? await db.tasks.get(ownerId) : await db.notes.get(ownerId)
  if (!owner) throw new Error('The attachment owner no longer exists.')
}

async function assertBatchQuota(files: File[]) {
  const oversized = files.find((file) => file.size > MAX_SINGLE_FILE_BYTES)
  if (oversized) throw new Error(`“${oversized.name || 'Attachment'}” is larger than the 100 MB per-file safety limit.`)
  if (!navigator.storage?.estimate) return
  const estimate = await navigator.storage.estimate()
  if (estimate.quota == null || estimate.usage == null) return
  const remaining = Math.max(0, estimate.quota - estimate.usage)
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
  if (totalBytes + QUOTA_HEADROOM_BYTES > remaining) throw new Error('Not enough local storage remains for this attachment batch. Export a backup or remove large attachments first.')
}

async function imageMetadata(file: File) {
  if (!file.type.startsWith('image/') || typeof createImageBitmap !== 'function') return {}
  try {
    const bitmap = await createImageBitmap(file)
    const result = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return result
  } catch { return {} }
}

async function audioMetadata(file: File): Promise<{ durationSeconds?: number }> {
  if (!file.type.startsWith('audio/') || typeof document === 'undefined') return {}
  return new Promise((resolve) => {
    const audio = document.createElement('audio')
    const url = URL.createObjectURL(file)
    let settled = false
    const finish = (result: { durationSeconds?: number }) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      audio.removeAttribute('src')
      audio.load()
      URL.revokeObjectURL(url)
      resolve(result)
    }
    const timeout = window.setTimeout(() => finish({}), 5000)
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) ? { durationSeconds: audio.duration } : {})
    audio.onerror = () => finish({})
    audio.src = url
  })
}

function safeLink(value: string) {
  const url = new URL(value)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Link attachments must use http:// or https://.')
  return url.toString()
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export async function serializeAttachment(attachment: AttachmentEntity): Promise<PortableAttachment> {
  const { blob, ...metadata } = attachment
  return { ...metadata, dataBase64: blob ? bytesToBase64(new Uint8Array(await blob.arrayBuffer())) : undefined }
}

export function deserializeAttachment(attachment: PortableAttachment): AttachmentEntity {
  const { dataBase64, ...metadata } = attachment
  return { ...metadata, blob: dataBase64 !== undefined ? new Blob([base64ToBytes(dataBase64)], { type: attachment.mimeType || 'application/octet-stream' }) : undefined }
}

export const attachmentService = {
  async list(ownerType: ContentOwnerType, ownerId: string) {
    return db.attachments.where('[ownerType+ownerId]').equals([ownerType, ownerId]).sortBy('createdAt')
  },

  async addFiles(ownerType: ContentOwnerType, ownerId: string, files: File[]) {
    await ensureOwner(ownerType, ownerId)
    await assertBatchQuota(files)
    const added: AttachmentEntity[] = []
    for (const file of files) {
      const now = new Date().toISOString()
      const [dimensions, audio] = await Promise.all([imageMetadata(file), audioMetadata(file)])
      added.push({
        id: crypto.randomUUID(), ownerType, ownerId, kind: fileKind(file), name: file.name || 'Attachment', mimeType: file.type || 'application/octet-stream', size: file.size,
        blob: file, ...dimensions, ...audio, createdAt: now, updatedAt: now,
      })
    }
    await db.transaction('rw', db.attachments, async () => { await db.attachments.bulkAdd(added) })
    await contentSearchService.rebuildOwner(ownerType, ownerId)
    return added
  },

  async addLink(ownerType: ContentOwnerType, ownerId: string, value: string, name?: string) {
    await ensureOwner(ownerType, ownerId)
    const url = safeLink(value.trim())
    const now = new Date().toISOString()
    const row: AttachmentEntity = { id: crypto.randomUUID(), ownerType, ownerId, kind: 'link', name: name?.trim() || new URL(url).hostname, size: 0, url, createdAt: now, updatedAt: now }
    await db.attachments.add(row)
    await contentSearchService.rebuildOwner(ownerType, ownerId)
    return row
  },

  async remove(id: string) {
    const attachment = await db.attachments.get(id)
    if (!attachment) return
    await db.attachments.delete(id)
    await contentSearchService.rebuildOwner(attachment.ownerType, attachment.ownerId)
  },

  async cloneOwner(sourceType: ContentOwnerType, sourceId: string, targetType: ContentOwnerType, targetId: string) {
    const source = await this.list(sourceType, sourceId)
    if (!source.length) return []
    const now = new Date().toISOString()
    const copies = source.map((attachment) => ({ ...attachment, id: crypto.randomUUID(), ownerType: targetType, ownerId: targetId, createdAt: now, updatedAt: now }))
    await db.attachments.bulkAdd(copies)
    await contentSearchService.rebuildOwner(targetType, targetId)
    return copies
  },

  async cleanupOrphans() {
    const [attachments, tasks, notes] = await Promise.all([db.attachments.toArray(), db.tasks.toArray(), db.notes.toArray()])
    const taskIds = new Set(tasks.map((task) => task.id))
    const noteIds = new Set(notes.map((note) => note.id))
    const orphanIds = attachments.filter((attachment) => attachment.ownerType === 'task' ? !taskIds.has(attachment.ownerId) : !noteIds.has(attachment.ownerId)).map((attachment) => attachment.id)
    if (orphanIds.length) await db.attachments.bulkDelete(orphanIds)
    return orphanIds.length
  },

  async storageEstimate() {
    if (!navigator.storage?.estimate) return { usage: undefined, quota: undefined }
    const estimate = await navigator.storage.estimate()
    return { usage: estimate.usage, quota: estimate.quota }
  },
}
