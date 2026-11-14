import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

export function abrirBase(ruta) {
  const db = new DatabaseSync(ruta);
  db.exec(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
  return db;
}

export function guardarPedidoYEvento(db, unidades, importeCentavos) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const registro = db.prepare("INSERT INTO pedidos (unidades, importe_centavos) VALUES (?, ?)").run(unidades, importeCentavos);
    const id = Number(registro.lastInsertRowid);
    db.prepare("INSERT INTO outbox (pedido_id) VALUES (?)").run(id);
    db.exec("COMMIT");
    return id;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
