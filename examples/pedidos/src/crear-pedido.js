import { PRECIO_UNITARIO_CENTAVOS, MAX_UNIDADES } from "./config.js";
import { guardarPedidoYEvento } from "./storage.js";

export function crearPedido(db, unidades) {
  if (!Number.isInteger(unidades) || unidades < 1 || unidades > MAX_UNIDADES) {
    throw new RangeError("Las unidades deben ser un entero entre 1 y " + MAX_UNIDADES);
  }
  const importeCentavos = unidades * PRECIO_UNITARIO_CENTAVOS;
  const id = guardarPedidoYEvento(db, unidades, importeCentavos);
  return { id, unidades, importeCentavos };
}
