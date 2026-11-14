# Pedidos

Este servicio de ejemplo registra un pedido y deja pendiente un movimiento de inventario. La solicitud HTTP y el procesamiento posterior comparten una base SQLite.

## Registrar un pedido

Envía POST /pedidos con {"unidades": 3}. Cada unidad cuesta 250 centavos según la configuración del servicio. Con tres unidades, la respuesta de creación contiene un importe de 750 centavos. El identificador lo asigna la base. Una segunda solicitud válida crea otro pedido.

## Procesar el evento pendiente

El worker toma el evento más antiguo pendiente y registra un movimiento. El movimiento y la marca de procesado se escriben en una sola transacción. Un identificador único protege el movimiento ante una segunda entrega del mismo evento. Este ejemplo cubre un efecto local en SQLite.

## Probarlo en una copia local

Con Node 24 o superior, instala las dependencias con npm install. Ejecuta npm start para abrir el servicio en el puerto 3000. En otro terminal, npm run worker procesa como máximo un evento pendiente por invocación. `npm test` verifica el importe, la validación, la reversión y la reentrega. El código registra el resultado en pedidos.sqlite.
