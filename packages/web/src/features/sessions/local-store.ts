import type { Id, SessionEvent } from '@baton/shared'

// IndexedDB-backed local persistence for session events. By design the server
// no longer stores message content — every browser keeps its own transcript
// of the sessions it's been connected to. Cross-browser sync is not provided;
// opening the same session in a fresh browser yields an empty history.
//
// Single database, single object store keyed by an auto-incrementing local id,
// indexed by sessionId for fast per-session retrieval. The wire SessionEvent
// shape is stored verbatim so callers can pass through without translation.

const DB_NAME = 'baton-session-events'
const DB_VERSION = 1
const STORE = 'events'
const INDEX = 'bySession'

type StoredEvent = SessionEvent

// Open (or upgrade) the database. Resolved instance cached for the page.
let dbPromise: Promise<IDBDatabase> | null = null
const open = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { autoIncrement: true })
        os.createIndex(INDEX, 'sessionId', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

const promisify = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

export const loadEvents = async (sessionId: Id): Promise<SessionEvent[]> => {
  const db = await open()
  const tx = db.transaction(STORE, 'readonly')
  const index = tx.objectStore(STORE).index(INDEX)
  const list = await promisify(index.getAll(IDBKeyRange.only(sessionId)))
  return (list as StoredEvent[]).slice().sort((a, b) => a.sequence - b.sequence)
}

export const appendEvent = async (sessionId: Id, ev: SessionEvent): Promise<void> => {
  const db = await open()
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).add({ ...ev, sessionId })
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export const clearEvents = async (sessionId: Id): Promise<void> => {
  const db = await open()
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  const index = store.index(INDEX)
  const req = index.openCursor(IDBKeyRange.only(sessionId))
  await new Promise<void>((resolve, reject) => {
    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        cursor.delete()
        cursor.continue()
      } else resolve()
    }
    req.onerror = () => reject(req.error)
  })
}
