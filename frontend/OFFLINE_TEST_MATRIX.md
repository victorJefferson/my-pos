# Offline sync — manual test matrix

Enable with `VITE_OFFLINE_MODE=true` in `frontend/.env`, restart Vite, use Neon **branch** only.

## Backend (online, flag off or on)

1. Checkout twice with the same `client_sale_id` → one sale, stock −qty once, one wallet tx. Done
2. Kill network after pay (or interrupt) and retry same key → no duplicate. Done
3. Concurrent stock: sell last unit twice → one `STOCK_INSUFFICIENT`. Done
4. Void / qty edit / delete line with same Idempotency-Key twice → no double stock restore. Done
5. Expense create + delete with Idempotency-Key replay → safe.
6. Transfer / deposit Idempotency-Key replay → balances correct once.

## Frontend offline

1. Airplane mode: checkout + expense + product edit + deposit → banner shows pending; AI blocked; purge/import/reset/store-switch blocked when pending.
2. Discard unsynced checkout → reconnect → no server sale for that `client_sale_id`.
3. Edit unsynced checkout then sync → one matching sale.
4. Two tabs open, reconnect → Web Lock → exactly one sale / one wallet.
5. Offline sell more than server stock → failed op; independent expense still syncs.
6. Offline product create then sell → product syncs first; sale uses server product id.
7. Synced sale offline void → stock/wallet restored once; retry void → no double restore.
8. Store switch blocked while pending.
9. Analytics: pending badge when queue non-empty; after sync numbers match server summary.
10. JWT expired overnight → auth required banner; ops retained until refresh succeeds.
