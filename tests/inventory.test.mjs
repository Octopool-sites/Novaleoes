import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  reserveSql,
  releaseSql,
  enableIntegrationSql,
} from "../lib/inventory-sql.ts";
function setup() {
  const db = new DatabaseSync(":memory:");
  db.exec(
    readFileSync(
      new URL("../drizzle/0000_flawless_tarantula.sql", import.meta.url),
      "utf8",
    ),
  );
  db.exec(
    readFileSync(
      new URL("../drizzle/0001_lame_obadiah_stane.sql", import.meta.url),
      "utf8",
    ),
  );
  for (const owner of ["a", "b"])
    db.prepare(
      "INSERT INTO commerce_products(owner,store,id,sku,name,brand,category,price_cents,stock,image,description,published) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      owner,
      "nova-leoes",
      "piece",
      "SKU",
      "Peça",
      "Marca",
      "Categoria",
      1000,
      3,
      "",
      "",
      1,
    );
  return db;
}
const stock = (db, owner = "a") =>
  db.prepare("SELECT stock FROM commerce_products WHERE owner=?").get(owner)
    .stock;
function batch(db, fn) {
  db.exec("BEGIN");
  try {
    fn();
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
function order(db, id = "o1") {
  db.prepare(
    "INSERT INTO commerce_orders(id,owner,store,idempotency,fingerprint,number,customer_name,email,phone,vehicle,note,items_json,total_cents,status,created_at,updated_at,revision) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(
    id,
    "a",
    "nova-leoes",
    "key",
    "hash",
    id,
    "Test",
    "test@example.com",
    "11999999999",
    "",
    "",
    "[]",
    2000,
    "NEW",
    "2026-09-12",
    "2026-09-12",
    0,
  );
}
test("reserve is tenant scoped", () => {
  const db = setup();
  db.prepare(reserveSql).run(2, 1000, 2, "a", "nova-leoes", "piece");
  assert.equal(stock(db), 1);
  assert.equal(stock(db, "b"), 3);
  db.close();
});
test("oversell rolls back entire transaction", () => {
  const db = setup();
  assert.throws(() =>
    batch(db, () => {
      db.prepare(reserveSql).run(2, 1000, 2, "a", "nova-leoes", "piece");
      db.prepare(reserveSql).run(2, 1000, 2, "a", "nova-leoes", "piece");
      order(db);
    }),
  );
  assert.equal(stock(db), 3);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM commerce_orders").get().n, 0);
  db.close();
});
test("stale price rejected", () => {
  const db = setup();
  assert.throws(() =>
    db.prepare(reserveSql).run(1, 1, 1, "a", "nova-leoes", "piece"),
  );
  assert.equal(stock(db), 3);
  db.close();
});
test("duplicate key rolls back second reservation", () => {
  const db = setup();
  batch(db, () => {
    db.prepare(reserveSql).run(1, 1000, 1, "a", "nova-leoes", "piece");
    order(db);
  });
  assert.throws(() =>
    batch(db, () => {
      db.prepare(reserveSql).run(1, 1000, 1, "a", "nova-leoes", "piece");
      order(db, "o2");
    }),
  );
  assert.equal(stock(db), 2);
  db.close();
});
test("cancellation releases only once even with stale revision", () => {
  const db = setup();
  db.prepare(reserveSql).run(2, 1000, 2, "a", "nova-leoes", "piece");
  order(db);
  for (let n = 0; n < 2; n++)
    batch(db, () => {
      db.prepare(releaseSql).run(
        2,
        "a",
        "nova-leoes",
        "piece",
        "o1",
        "a",
        "nova-leoes",
        0,
        "NEW",
      );
      db.prepare(
        "UPDATE commerce_orders SET status='CANCELLED',revision=1 WHERE id='o1' AND revision=0",
      ).run();
    });
  assert.equal(stock(db), 3);
  assert.equal(stock(db, "b"), 3);
  db.close();
});
test("hidden product cannot reserve", () => {
  const db = setup();
  db.exec("UPDATE commerce_products SET published=0 WHERE owner='a'");
  assert.throws(() =>
    db.prepare(reserveSql).run(1, 1000, 1, "a", "nova-leoes", "piece"),
  );
  assert.equal(stock(db), 3);
  db.close();
});

test("activating integration fences a stale standalone checkout", () => {
  const db = setup();
  db.prepare(enableIntegrationSql).run(
    "a",
    "nova-leoes",
    "a",
    "nova-leoes",
    "a",
    "nova-leoes",
  );
  assert.throws(() =>
    db.prepare(reserveSql).run(1, 1000, 1, "a", "nova-leoes", "piece"),
  );
  assert.equal(stock(db), 3);
  db.close();
});
test("an open standalone order prevents a concurrent mode switch", () => {
  const db = setup();
  order(db);
  const r = db
    .prepare(enableIntegrationSql)
    .run("a", "nova-leoes", "a", "nova-leoes", "a", "nova-leoes");
  assert.equal(r.changes, 0);
  db.close();
});
