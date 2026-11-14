# Informe de pedidos por región

Un pipeline pequeño de Python que convierte un CSV ficticio en un informe. Lee las filas, valida los identificadores, calcula el importe con descuento, aplica una regla de inclusión y agrega las cantidades por región. Conserva los identificadores de origen para explicar cada resultado.

## Ejecutar

Requiere Python 3.10 o posterior y utiliza únicamente la biblioteca estándar.

```sh
cd examples/data-pipeline
python3 main.py
python3 main.py --min-net 1000
python3 -m unittest discover -s tests -v
```

Con el mínimo de 500 centavos, entran cuatro pedidos y el total es 4190 centavos. Norte aporta 1250 y Sur 2940. Al subir el mínimo a 1000, quedan los dos pedidos de Sur y el total es 2940. El pedido cancelado se excluye. El pedido o5 tiene un bruto de 600 y un neto de 450, por lo que queda fuera del mínimo de 500.

## Recorrido de lectura

Empieza en `main.py`. El argumento `--min-net` sustituye el valor predeterminado de `config.py`. `run_pipeline` valida todas las filas mediante `read_orders`, aplica `include_order` y entrega las filas incluidas a `aggregate_regions`.

La fórmula `net_cents` usa enteros y redondea media unidad hacia arriba. Para 101 centavos con descuento del 50 %, devuelve 51. La validación de entrada falla ante identificadores duplicados, cantidades inválidas o descuentos fuera de 0 a 100. Un CSV válido sin pedidos produce un informe de cero.

## Preguntas para investigar

- ¿Qué filas explican los 1250 centavos de Norte?
- ¿Se aplica el mínimo antes o después del descuento?
- ¿Cambiar el mínimo modifica las filas originales?
- ¿Por qué 101 centavos al 50 % produce 51?
- ¿Qué cambia si el pedido o5 se incluye por su importe bruto?
- ¿Puede emitirse un informe parcial si la última fila contiene un error?

Las filas y sus resultados son material ficticio de aprendizaje. Trama puede leer este proyecto sin ejecutar Python.
