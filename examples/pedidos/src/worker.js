export function procesarEvento(db, eventoId) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const evento = db.prepare("SELECT pedido_id, procesado FROM outbox WHERE id = ?").get(eventoId);
    if (!evento || evento.procesado === 1) {
      db.exec("COMMIT");
      return false;
    }
    db.prepare("INSERT INTO movimientos (evento_id, pedido_id) VALUES (?, ?) ON CONFLICT(evento_id) DO NOTHING").run(eventoId, evento.pedido_id);
    db.prepare("UPDATE outbox SET procesado = 1 WHERE id = ?").run(eventoId);
    db.exec("COMMIT");
    return true;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function procesarPendiente(db) {
  const evento = db.prepare("SELECT id FROM outbox WHERE procesado = 0 ORDER BY id LIMIT 1").get();
  if (!evento) return false;
  return procesarEvento(db, evento.id);
}
