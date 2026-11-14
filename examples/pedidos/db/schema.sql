PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pedidos (
  id INTEGER PRIMARY KEY,
  unidades INTEGER NOT NULL CHECK (unidades >= 1),
  importe_centavos INTEGER NOT NULL CHECK (importe_centavos >= 0)
);

CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY,
  pedido_id INTEGER NOT NULL UNIQUE REFERENCES pedidos(id),
  procesado INTEGER NOT NULL DEFAULT 0 CHECK (procesado IN (0, 1))
);

CREATE TABLE IF NOT EXISTS movimientos (
  evento_id INTEGER PRIMARY KEY REFERENCES outbox(id),
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id)
);
