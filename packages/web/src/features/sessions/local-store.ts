import type { Id, SessionEvent } from '@baton/shared'

// IndexedDB-backed local persistence for session events. By design the server
// no longer stores message content — every browser keeps its own transcript
// of the sessions it's been connected to. Cross-browser sync is not provided;
// opening the same session in a fresh browser yields an empty history.
//
// Single database, single object store keyed by an auto-incrementing local id,
// indexed by sessionId for fast per-session retrieval. The wire SessionEvent
// shape is stored verbatim, plus a client-minted `clientId` — the only stable
// identity the client can trust (the server's `id`/`sequence` reset to 0 on
// every restart), used for dedup, ordering, and React keys.

const DB_NAME = 'baton-session-events'
const DB_VERSION = 1
const STORE = 'events'
const INDEX = 'bySession'

export type StoredEvent = SessionEvent & { clientId: string }

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

export const loadEvents = async (sessionId: Id): Promise<StoredEvent[]> => {
  const db = await open()
  const tx = db.transaction(STORE, 'readonly')
  const index = tx.objectStore(STORE).index(INDEX)
  // getAll on the bySession index returns records in primary-key (autoIncrement)
  // order for a single sessionId — i.e. insertion order, which is the order
  // events arrived. We deliberately do NOT sort by `sequence`: that counter
  // resets to 0 on every server restart, so sorting by it interleaves events
  // from different runs. Arrival order is the true chronology.
  const list = (await promisify(index.getAll(IDBKeyRange.only(sessionId)))) as Array<
    SessionEvent & { clientId?: string }
  >
  // Backfill records persisted before clientId existed: a deterministic
  // per-load id, unique within the list and never colliding with a UUID. Not
  // re-persisted — purely to give legacy history stable keys for this render.
  return list.map((e, i) =>
    e.clientId ? (e as StoredEvent) : { ...e, clientId: `legacy-${sessionId}-${i}` },
  )
}

export const appendEvent = async (sessionId: Id, ev: StoredEvent): Promise<void> => {
  const db = await open()
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).add({ ...ev, sessionId })
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}
