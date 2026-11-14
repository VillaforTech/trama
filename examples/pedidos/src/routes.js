import { crearPedido } from "./crear-pedido.js";

export function registrarRutas(app, db) {
  app.post("/pedidos", (req, res) => {
    try {
      const pedido = crearPedido(db, req.body?.unidades);
      return res.status(201).json(pedido);
    } catch (error) {
      if (error instanceof RangeError) return res.status(422).json({ error: error.message });
      return res.status(500).json({ error: "No se pudo guardar el pedido" });
    }
  });
}
