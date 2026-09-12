// A NOT NULL violation aborts the entire D1 batch, including an order insert.
// This avoids triggers, unsupported by the hosting migration statement splitter.
export const reserveSql = `UPDATE commerce_products SET stock = CASE WHEN published=1 AND stock>=? AND price_cents=? AND NOT EXISTS (SELECT 1 FROM commerce_settings WHERE commerce_settings.owner=commerce_products.owner AND commerce_settings.store=commerce_products.store AND stock_integration_enabled=1) THEN stock-? ELSE NULL END WHERE owner=? AND store=? AND id=?`;
// The mode switch and the no-open-local-orders check are a single write.
export const enableIntegrationSql = `INSERT INTO commerce_settings(owner,store,stock_integration_enabled) SELECT ?,?,1 WHERE NOT EXISTS (SELECT 1 FROM commerce_orders WHERE owner=? AND store=? AND inventory_mode='standalone' AND status NOT IN ('COMPLETED','CANCELLED')) ON CONFLICT(owner,store) DO UPDATE SET stock_integration_enabled=1 WHERE NOT EXISTS (SELECT 1 FROM commerce_orders WHERE owner=? AND store=? AND inventory_mode='standalone' AND status NOT IN ('COMPLETED','CANCELLED'))`;
// Release is guarded by the previous order revision/status inside the same batch.
// A replay or concurrent cancellation cannot match after the first commit.
export const releaseSql = `UPDATE commerce_products SET stock=stock+? WHERE owner=? AND store=? AND id=? AND EXISTS (SELECT 1 FROM commerce_orders WHERE id=? AND owner=? AND store=? AND revision=? AND status=?)`;
