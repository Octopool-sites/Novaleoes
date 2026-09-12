ALTER TABLE commerce_orders ADD COLUMN approved_by text;
ALTER TABLE commerce_orders ADD COLUMN approved_at text;
ALTER TABLE commerce_orders ADD COLUMN approval_key text;
ALTER TABLE commerce_order_events ADD COLUMN actor text;
ALTER TABLE commerce_order_events ADD COLUMN detail text;
CREATE UNIQUE INDEX commerce_approval_key ON commerce_orders(owner,store,approval_key);
CREATE TRIGGER commerce_inventory_requires_approval
BEFORE INSERT ON commerce_inventory_jobs
WHEN NEW.action='RESERVE' AND NOT EXISTS (
 SELECT 1 FROM commerce_orders o WHERE o.id=NEW.order_id AND o.owner=NEW.owner AND o.store=NEW.store
 AND o.approved_by IS NOT NULL AND o.approved_at IS NOT NULL AND o.status='STOCK_PENDING'
)
BEGIN SELECT RAISE(ABORT, 'APPROVAL_REQUIRED'); END;
