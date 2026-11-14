# Trama

**Un espacio de trabajo para comprender tu código en Mac.**

Trama es una aplicación de escritorio para Mac que convierte un repositorio en un espacio para investigar su arquitectura, seguir un comportamiento entre archivos y practicar cómo explicarlo por tu cuenta. Abre el proyecto con el selector de carpetas de macOS, explora sus conexiones y conserva lo aprendido junto a sus fuentes.

[Descargar para Mac](https://github.com/VillaforTech/trama/releases/latest) · [English](README.md) · [Arquitectura](docs/architecture.md) · [Investigación](docs/research.md)

![Espacio de Trama con una ruta de aprendizaje vinculada al código](docs/images/overview.png)

## Empieza por una pregunta

Heredas un servicio que registra pedidos y procesa trabajo después. Una respuesta exitosa deja abierta la pregunta de qué ocurre ante un reintento del worker. Abre el ejemplo **Pedidos**, encuentra el manejador de la solicitud y sigue la transacción y el evento pendiente. Antes de revelar el código, escribe si una segunda entrega puede generar otro movimiento y qué evidencia necesitarías para afirmarlo.

El ejemplo **Data pipeline** recorre un CSV, su validación, los descuentos, el filtrado y un informe por región. Puedes rastrear una cantidad hasta las filas que la originan y predecir el efecto de cambiar una regla. Los dos ejemplos contienen datos ficticios y pruebas ejecutables.

## Instalar en Mac

La primera versión empaquetada está dirigida a **Mac con Apple Silicon y macOS 13 o posterior**. Descarga el ZIP para Mac desde [Releases](https://github.com/VillaforTech/trama/releases/latest), descomprímelo y mueve **Trama.app** a Aplicaciones. La aplicación incluye el entorno de ejecución y puede abrirse sin instalar Node.js por separado.

Esta versión preliminar todavía no tiene firma Developer ID ni notarización de Apple. macOS puede pedirte que apruebes la descarga en **Ajustes del Sistema → Privacidad y seguridad**. Revisa el origen y la versión antes de decidir abrirla. [Guía de Apple](https://support.apple.com/es-es/102445)

Abre Trama, elige **Abrir carpeta** y selecciona un repositorio clonado. También puedes abrir un repositorio de GitHub o uno de los dos ejemplos incluidos. La exploración y la práctica básicas funcionan sin una cuenta de IA.

| Atajo | Acción                                       |
| ----- | -------------------------------------------- |
| `⌘O`  | Elegir una carpeta con el selector de macOS. |
| `⌘K`  | Abrir la navegación rápida.                  |
| `⌘,`  | Abrir ajustes.                               |

Para GitHub privado puedes usar una sesión autorizada de GitHub CLI o un token con lectura del contenido del repositorio. Con una carpeta local, Trama usa el acceso que ya tienes a sus archivos. Si usas GitHub CLI, inicia sesión con `gh auth login` antes de importar. El token queda fuera de las investigaciones guardadas.

## Ejecutar la aplicación Mac desde el código

Para desarrollar necesitas **Node.js 24 o posterior**, npm y macOS.

```sh
git clone https://github.com/VillaforTech/trama.git
cd trama
npm ci
npm run desktop
```

El comando construye la aplicación y abre su ventana Mac. Para empaquetar una versión, ejecuta `npm run dist:mac` en un Mac.

La [vista previa del navegador](https://villafortech.github.io/trama/) contiene ejemplos ficticios para conocer el recorrido. También puedes usar la interfaz local del navegador con `npm run build` y luego `npm start`, en `http://127.0.0.1:4891`.

## Qué puedes hacer

- **Explorar el conjunto.** Ir desde una arquitectura y funcionalidades sugeridas hasta un proceso con archivos y líneas concretas.
- **Seguir conexiones.** Navegar por el mapa de módulos e inspeccionar la fuente de una relación.
- **Buscar en la captura.** Encontrar símbolos y texto entre los archivos indexados.
- **Practicar razonamiento.** Escribir una predicción, contrastarla con la fuente, explicar una diferencia y resolver una variante. Conservar una autoevaluación de cada intento.
- **Consultar con fuentes.** Conectar opcionalmente un modelo local o compatible con OpenAI. Sus referencias se comprueban contra el código capturado.
- **Retomar el trabajo.** Guardar notas y posición, volver a una revisión, comparar archivos cambiados y exportar o restaurar una investigación.

## Conectar un modelo

En **Ajustes**, introduce la dirección base de una API compatible con OpenAI y el identificador de un modelo disponible. Para una instalación existente de Ollama, la dirección inicial es `http://127.0.0.1:11434/v1`. Trama requiere que el modelo ya esté instalado y disponible en ese servidor.

Comprueba la conexión y formula una pregunta dentro de una investigación. Cada consulta envía una selección acotada de fragmentos. Para un proveedor externo, la interfaz pide autorización en esa consulta. El consumo depende de tu cuenta. La API debe implementar `/chat/completions` y responder con la estructura JSON solicitada.

La credencial introducida en la interfaz permanece en la memoria del servidor. La dirección y el nombre del modelo se conservan localmente. También puedes configurar variables de entorno.

| Variable               | Uso                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `TRAMA_DATA_DIR`       | Cambiar el directorio del modo navegador local, inicialmente `~/.trama`. La aplicación Mac usa su directorio de Application Support. |
| `TRAMA_MODEL_ENDPOINT` | Dirección base de la API del modelo.                                                                                                 |
| `TRAMA_MODEL`          | Identificador del modelo.                                                                                                            |
| `TRAMA_MODEL_API_KEY`  | Credencial del proveedor desde el entorno.                                                                                           |

## Fuentes y alcance

Una referencia comprueba dónde está el fragmento citado. Determinar si sostiene la explicación requiere revisarlo. Trama muestra declaraciones visibles, relaciones inferidas y cuestiones abiertas. El mapa representa conexiones estructurales. Una traza de ejecución aporta otro tipo de evidencia.

La ruta inicial se construye mediante heurísticas de análisis del código: agrupa declaraciones, importaciones, puntos de entrada y documentación para proponer un orden de lectura. Las consultas opcionales a un modelo son otra capacidad. Importar un repositorio todavía requiere revisar las propuestas y completar lo que el análisis no puede establecer.

El análisis admite hasta 4000 archivos locales o 500 de GitHub, con 32 MB de texto y 512 KB por archivo. Muestra la cobertura incompleta y permite excluir archivos adicionales mediante `.tramaignore`. Las importaciones JavaScript y TypeScript se analizan mediante su sintaxis. Las relaciones Python se presentan como candidatas. El despacho dinámico, las configuraciones de ejecución, los servicios externos y el código generado pueden requerir fuentes adicionales.

Las revisiones de los ejercicios son autoevaluaciones. Esta versión todavía requiere una evaluación controlada de su efecto sobre el aprendizaje de software. Las [notas de investigación](docs/research.md) explican la evidencia educativa y proponen una comparación con un editor y un asistente.

## Código privado

La aplicación de escritorio ejecuta el servicio de indexación en tu Mac y conserva las fuentes y el aprendizaje en `~/Library/Application Support/Trama/data` mediante SQLite. La lectura de una carpeta construye la captura sin ejecutar el proyecto importado. Una consulta opcional a un modelo envía el contexto seleccionado al proveedor configurado. El modo de navegador local usa inicialmente `~/.trama`.

La captura y los archivos JSON exportados pueden contener código privado. Trama los guarda sin cifrado propio. Consulta el [flujo de datos y la política de seguridad](SECURITY.md) antes de usar un repositorio de tu organización. El repositorio público y la demo contienen ejemplos ficticios.

## Contribuir

```sh
npm ci
npm run desktop
npm run check
npm test
npm run build
```

Para desarrollar la interfaz con recarga automática, ejecuta `npm run dev` y abre `http://127.0.0.1:5173`. La API usa el puerto 4891. Para las pruebas del navegador, instala Chromium con `npx playwright install chromium` y ejecuta `npm run test:e2e`. La ventana Mac, el selector nativo, los menús y el inicio del paquete requieren comprobación adicional en la aplicación.

Puedes contribuir con una mejora del recorrido, una inferencia incorrecta reproducible o una tarea de aprendizaje más clara. Consulta la [guía de contribución](CONTRIBUTING.md), la [arquitectura](docs/architecture.md) y el [roadmap](docs/roadmap.md).

Las comprobaciones y sus límites están en [verificación de la versión](docs/verification.md).

## Referencias y licencia

LearnHarness sirvió como referencia conceptual para distinguir comprensión inicial, enseñanza mediante predicción y práctica independiente. Trama tiene implementación, instrucciones de modelos, ejemplos e identidad visual propios. [LearnHarness](https://github.com/amosblomqvist/learnharness)

El código original y los ejemplos usan la [licencia MIT](LICENSE). Las dependencias y los recursos de terceros conservan sus licencias. Consulta [NOTICE](NOTICE).
