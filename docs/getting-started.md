# Your first investigation / Tu primera investigación

Trama helps you answer a question about a repository and check whether you can explain the answer yourself. You do not need to configure AI before exploring the code. The [browser demo](https://villafortech.github.io/trama/) uses fictional examples; the Mac app opens your own authorized repositories.

## English: five-minute walkthrough

1. **Open a repository.** In the Mac app, choose **Abrir carpeta** for a local checkout, or **Conectar GitHub** for an authorized GitHub repository. To learn the interface first, choose **Pedidos**, then **Probar con un ejemplo**. Installation instructions are in the [README](../README.md#install-on-mac).
2. **Choose one behavior.** In **Recorrido**, use **Empezar el recorrido**, select a suggested functionality, or resume with **Retomar mi lectura**. For Pedidos, start with the request to `/pedidos`. Keep one question in mind: “If the worker processes the same event twice, can inventory change twice?”
3. **Predict, then inspect.** Write what you expect in **Tu predicción**, choose **Contrastar con el código**, and open the cited source. Follow the next step. Separate what the code establishes from what would require configuration or an execution. If a prerequisite is missing, record the question in your notebook or request an explanation through your configured model.
4. **Inspect connections when you need context.** Open **Conexiones de código**. Start with folders, open the relevant group, or search for a file. Select a file to inspect its dependencies and dependents. Use the list when it is easier to read than the canvas. The counts and omitted-result notices describe the current view, not the entire runtime system.
5. **Try a changed case.** Open **Practicar**, write your reasoning before revealing the reference answer, and assess what you could justify. Record unresolved questions in **Mi cuaderno**. Your place and notes are saved with the captured revision; return later and attempt another case without the prior answer visible.

A useful stopping point is a short explanation containing the trigger, relevant components, transformed values, resulting state, one failure case, and source references. A finished screen is not proof of understanding.

## Español: recorrido de cinco minutos

1. **Abre un repositorio.** En Mac, usa **Abrir carpeta** para un proyecto clonado o **Conectar GitHub** para un repositorio al que tengas acceso. Para conocer primero la interfaz, selecciona **Pedidos** y pulsa **Probar con un ejemplo**. La instalación está en el [README en español](../README.es.md#instalar-en-mac).
2. **Elige un comportamiento.** En **Recorrido**, pulsa **Empezar el recorrido**, elige una funcionalidad sugerida o vuelve con **Retomar mi lectura**. En Pedidos puedes empezar por la solicitud a `/pedidos`. Conserva una pregunta concreta: «Si el worker procesa el mismo evento dos veces, ¿puede cambiar dos veces el inventario?».
3. **Predice y abre la evidencia.** Escribe en **Tu predicción**, pulsa **Contrastar con el código** y abre la referencia. Sigue el siguiente paso. Distingue lo que establece el código de lo que depende de la configuración o una ejecución. Si necesitas un conocimiento previo, deja la duda en el cuaderno o solicita una explicación con tu modelo configurado.
4. **Recupera el contexto con las conexiones.** Abre **Conexiones de código**. Empieza por las carpetas, entra en el grupo relevante o busca un archivo. Selecciona uno para revisar sus dependencias y los archivos que dependen de él. Usa la lista si te resulta más legible que el lienzo. Los contadores y avisos de omisiones describen esa vista; no certifican el sistema en ejecución completo.
5. **Resuelve una variante.** En **Practicar**, escribe antes de mostrar la respuesta de referencia y evalúa qué pudiste justificar. Guarda las dudas en **Mi cuaderno**. La posición y las notas se conservan con la revisión del código; vuelve después e intenta otro caso sin leer la explicación anterior.

Puedes cerrar una investigación cuando consigas explicar el desencadenante, las responsabilidades, los valores transformados, el estado resultante y un caso de fallo, con fuentes localizables. Si todavía falta algo, registrarlo también es un resultado útil.

## A large map does not mean “read everything”

Begin with the part relevant to the question. Folder groups reduce visual detail; a file's neighborhood helps follow one dependency at a time. Search is useful when you know an entry point such as a route, configuration file, or worker. Use the breadcrumbs to return to the larger context.

Trama's source relationships describe visible structure. Dynamic dispatch, dependency injection, runtime configuration, generated code, external services, and message delivery may require additional evidence. An import edge does not establish a call sequence. The current importer also has explicit file and text limits; inspect the capture's coverage before concluding that something is absent.

## If you are stuck

| What you see                                    | Next action                                                                                                                                           |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Too many suggested functionalities              | Start from one input or result you recognize; search for its route, file, or symbol.                                                                  |
| Too many graph connections                      | Narrow to a folder or a selected file's neighborhood; inspect direct connections before expanding farther.                                            |
| No relationship for a file you expected         | Check import coverage and language support, then open the declaration or use **Código y fuentes**. Absence in the graph is not proof of independence. |
| A plausible explanation without enough evidence | Open its references, record the missing assumption, and state what observation would settle it.                                                       |
| A model is not connected                        | Continue exploration and practice, or open **Ajustes** to connect ChatGPT, an API, or a local model.                                                  |
| The code has changed                            | Use the project's **Revisiones** action to capture and compare changes before resuming.                                                               |

For help, use [SUPPORT.md](../SUPPORT.md). Share a public or synthetic reproduction rather than private source or an exported investigation.
