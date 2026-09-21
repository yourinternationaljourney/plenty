# Local data, accounts and synchronization

## What is true in this phase

- **Local data is authoritative.** Every device keeps its own IndexedDB profiles exactly as before; the app works fully offline and without an account.
- **An account adds a private copy in Netlify Database plus receipt photos in Netlify Blobs.** It is filled and read only by explicit user actions:
  - *Import this profile into my account* (preview, then confirm). Duplicate imports of the same local profile are refused unless the user confirms overwriting; an import older than what the account already holds is refused unless confirmed.
  - *Restore from my account* into a new local profile on another device (uses the existing backup/import machinery, so the same preview and confirmation apply).
  - *Upload receipt photo to account* per receipt; processing/OCR is **not connected** and the UI says so.
- **Cross-device synchronization is not implemented.** Nothing syncs automatically; two devices can diverge and the app never merges them silently. The Settings card and the `/api/profile` response state this.

## Sync interface (documented, not implemented)

`src/16-account.js` exposes `SyncAdapter` with the contract a future synchronizer must honour:

```
SyncAdapter.status()            -> { mode: 'manual', queued: 0 }
SyncAdapter.enqueue(change)     -> queues {path, data|null, updatedAt, deviceId}; returns false in this phase (manual mode)
SyncAdapter.flush()             -> would push queued changes; no-op now
SyncAdapter.pull()              -> would fetch server changes since a cursor; no-op now
```

Design for the next phase:

1. Every local write (`writeDoc`/`deleteDoc`) also appends `{path, updatedAt, deviceId}` to a local `outbox` object store.
2. `flush()` posts the outbox to `POST /api/app-data` with `mode: 'sync'`; the server compares `updated_at` per document and keeps the newer one (last-writer-wins per document, the same rule the artifact database used), returning conflicts for documents where both sides changed.
3. `pull()` fetches documents changed since the device's cursor and applies them locally unless the local copy is newer.
4. Health documents sync only if the user opts in separately; receipt photos are never synced automatically, only uploaded on request.
5. Until all of that exists and is tested on two devices, the app must not claim synchronization.
