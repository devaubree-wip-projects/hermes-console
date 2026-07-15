const TTL_MS = 60 * 60 * 1000

type StoredDocument = {
  buffer: Buffer
  mime: string
  filename: string
  expiresAt: number
}

const documents = new Map<string, StoredDocument>()

function pruneExpired() {
  const now = Date.now()
  for (const [id, doc] of documents) {
    if (doc.expiresAt <= now) documents.delete(id)
  }
}

export const documentStore = {
  set(id: string, doc: Omit<StoredDocument, "expiresAt">) {
    pruneExpired()
    documents.set(id, { ...doc, expiresAt: Date.now() + TTL_MS })
  },
  get(id: string) {
    pruneExpired()
    const doc = documents.get(id)
    if (!doc || doc.expiresAt <= Date.now()) {
      documents.delete(id)
      return undefined
    }
    return doc
  },
}
