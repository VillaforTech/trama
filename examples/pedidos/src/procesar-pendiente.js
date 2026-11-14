import { abrirBase } from "./storage.js";
import { procesarPendiente } from "./worker.js";

const db = abrirBase("pedidos.sqlite");
try {
  const aplico = procesarPendiente(db);
  console.log(aplico ? "Movimiento registrado" : "Sin evento aplicable");
} finally {
  db.close();
}
