import express from "express";
import { abrirBase } from "./storage.js";
import { registrarRutas } from "./routes.js";

const db = abrirBase("pedidos.sqlite");
const app = express();
app.use(express.json());
registrarRutas(app, db);
app.listen(3000, "127.0.0.1");
