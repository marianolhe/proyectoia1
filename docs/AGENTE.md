# Arquitectura del agente (Fase 2)

Este documento cubre lo que se agregó en el proyecto 2: el agente que recomienda películas, los MCP Servers que exponen sus herramientas y las defensas contra LLM01 y LLM07. La arquitectura del widget (Fase 1) sigue en [ARQUITECTURA.md](ARQUITECTURA.md); el paso a la Fase 2 no tocó su diseño, solo le agregó dos eventos.

## Requisitos y dónde se cumplen

| Requisito del enunciado                                | Dónde se cumple                                                                                           |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Comunicarse por el widget del proyecto 1               | `agent-server` habla el mismo contrato `ChatTransport` por WebSocket; el widget solo cambia de URL        |
| Recomendar películas con TMDB                          | `mcp-tmdb`: `tmdb_discover_movies`, `tmdb_search_movies`, `tmdb_similar_movies`, `tmdb_movie_details`     |
| Logo o atribución de TMDB                              | Pie del widget (`Attribution`), configurado en la demo y en `sdk-embed`                                   |
| Comparar con el libro y decidir si vale la pena verla  | `mcp-books`: `books_find_for_movie` y `books_compare_with_movie` (veredicto determinista en `compare.ts`) |
| Anunciar que puede hacer la comparación                | System prompt y, como garantía, `withAnnouncement` en `agent.ts` agrega el aviso en el primer turno       |
| Abrir Google Books e IMDb sin que el usuario haga clic | `tmdb_open_imdb` y `books_open_google_books` devuelven una directiva; el widget llama a `window.open`     |
| Mostrar el póster                                      | `tmdb_show_poster` devuelve una directiva de imagen; viaja como evento `message.image`                    |
| Reforzado contra LLM01 y LLM07                         | `packages/guardrails` y las capas del orquestador; ver [Seguridad](#seguridad-llm01-y-llm07)              |
| Herramientas abstraídas en MCP Servers                 | `mcp-tmdb` y `mcp-books`, servidores MCP independientes (Streamable HTTP o stdio)                         |
| Evals de uso correcto, LLM01 y LLM07                   | `packages/evals`; reporte en [docs/evals/REPORTE.md](evals/REPORTE.md)                                    |

## Diagrama de alto nivel

```mermaid
flowchart LR
  subgraph navegador["Navegador del usuario (sitio del cliente)"]
    widget["Widget AGIChat<br/>ui-react + sdk-embed<br/>póster · pestañas · atribución TMDB"]
    pestanas["Pestañas nuevas<br/>IMDb · Google Books"]
  end

  subgraph backend["Backend (contenedores sin estado)"]
    lb["Balanceador<br/>WebSocket"]
    subgraph agentes["agent-server × N réplicas"]
      orq["Orquestador<br/>ciclo ReAct + guardrails"]
    end
    subgraph mcps["MCP Servers (Streamable HTTP, sin estado)"]
      tmdb["mcp-tmdb × N<br/>caché + cupo diario"]
      books["mcp-books × N<br/>caché + cupo diario"]
    end
  end

  subgraph externos["Servicios externos"]
    llm["Modelo de lenguaje<br/>Claude u otro compatible"]
    tmdbapi["API de TMDB<br/>1,000 req/día"]
    gbapi["Google Books API<br/>1,000 req/día"]
    img["image.tmdb.org"]
  end

  widget <-->|"WebSocket: OutboundMessage + historial<br/>AgentEvent: delta · image · open_url"| lb
  lb --> orq
  orq <-->|"HTTPS"| llm
  orq <-->|"MCP: tools/list · tools/call"| tmdb
  orq <-->|"MCP: tools/list · tools/call"| books
  tmdb --> tmdbapi
  books --> gbapi
  widget -.->|"descarga el póster"| img
  widget -.->|"window.open (lista blanca)"| pestanas
```

### Por qué escala

| Decisión                               | Qué permite                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Backend sin estado**                 | El historial viaja en cada mensaje (`OutboundMessage.history`, los últimos 12 mensajes). Cualquier réplica atiende cualquier turno, no hace falta afinidad de sesión y una réplica que se reinicia no pierde conversaciones. Las réplicas del agente se agregan detrás de un balanceador de WebSocket; los MCP, que no publican puerto, se escalan directo con `docker compose up --scale mcp-tmdb=N`. |
| **MCP Servers desacoplados**           | Cada servidor se despliega, escala y falla por separado. Si Google Books se cae, el agente sigue recomendando películas (`McpToolGateway` sirve las herramientas disponibles y reintenta las demás). Otro agente de AGIChat puede reutilizar las herramientas sin tocar este código.                                                                                                                   |
| **Descubrimiento dinámico**            | El agente no tiene herramientas escritas a mano: las pide con `tools/list` y renueva el catálogo cada 5 minutos. Agregar una herramienta o un servidor nuevo es cambiar `MCP_SERVERS`, sin redesplegar el orquestador.                                                                                                                                                                                 |
| **Caché y cupo en cada MCP**           | Las APIs gratuitas dan 1,000 peticiones diarias. Un caché de 6 horas (con deduplicación de peticiones simultáneas) evita repetir consultas y `DailyBudget` corta antes de agotar el cupo, con un mensaje claro en vez de errores 429. La interfaz `TtlCache` es pequeña a propósito para cambiarla por Redis cuando haya varias réplicas.                                                              |
| **Contenedores**                       | Una sola imagen (`Dockerfile`) con los tres procesos; cada contenedor elige su proceso con `SERVICE`. Toda la configuración entra por variables de entorno. Cada servicio expone `/healthz` para el orquestador de contenedores.                                                                                                                                                                       |
| **Costos acotados por turno**          | Máximo 6 llamadas al modelo y 10 a herramientas por turno, 20 mensajes por minuto por conexión y tramas de 64 KB. Un usuario (o una inyección) no puede disparar un bucle que agote el cupo de todos.                                                                                                                                                                                                  |
| **Proveedor de modelo intercambiable** | El orquestador depende del puerto `LlmClient`. Hay dos adaptadores: Claude (SDK oficial) y cualquier API “chat completions” con plan gratuito. Cambiar de proveedor es una variable de entorno.                                                                                                                                                                                                        |

Límites conocidos: el caché vive en memoria de cada réplica de MCP (con N réplicas, el consumo del cupo crece hasta N veces en el peor caso); el límite de tasa es por conexión y no por usuario. Ambos se resuelven con un almacén compartido (Redis) sin cambiar interfaces.

## Diagrama de bajo nivel de los agentes

### Clasificación

El sistema es **un solo agente, centralizado**, del tipo _orquestador con herramientas_:

- **Centralizado:** un único orquestador decide en cada paso qué herramienta llamar y es el único que habla con el modelo. Los MCP Servers no toman decisiones ni se comunican entre sí; ejecutan herramientas deterministas.
- **No jerárquico:** no hay sub-agentes con su propio modelo. Se evaluó separar un “agente de películas” y un “agente de libros”, pero comparten casi todo el contexto (la comparación necesita la ficha de la película) y la delegación habría duplicado llamadas al modelo y superficie de inyección sin mejorar las respuestas.
- **Herramientas como servicios:** la especialización vive en los MCP Servers. Si en el futuro se necesitan varios agentes, cualquiera de ellos puede consumir los mismos servidores; la frontera MCP ya está trazada.

### Organización interna de un turno

```mermaid
flowchart TB
  entrada(["Mensaje del widget<br/>texto + historial"]) --> parse["protocol.ts<br/>valida la trama"]
  parse --> filtro{"inspectUserInput<br/>LLM01 / LLM07"}
  filtro -->|"ataque"| rechazo["Respuesta fija de rechazo<br/>sin llamar al modelo"]
  filtro -->|"permitido"| hist["sanitizeHistory<br/>descarta ataques previos"]
  hist --> modelo["LlmClient.complete<br/>system prompt + canario + herramientas"]

  modelo -->|"tool_use"| existe{"¿herramienta<br/>publicada?"}
  existe -->|"no"| errorTool["Resultado de error"]
  existe -->|"sí"| gateway["McpToolGateway.callTool"]

  gateway --> mcpT["mcp-tmdb"]
  gateway --> mcpB["mcp-books"]
  mcpT --> resultado["Resultado estructurado<br/>data + ui"]
  mcpB --> resultado

  resultado --> ui{"isAllowedUrl<br/>directivas ui"}
  ui -->|"fuera de lista"| descartada["Se descarta y se registra"]
  ui -->|"permitida"| acumuladas["Póster y pestañas<br/>pendientes"]
  resultado --> sanea["sanitizeUntrusted + wrapUntrusted<br/>&lt;datos_externos&gt;"]
  sanea --> modelo
  errorTool --> modelo

  modelo -->|"end"| md["sanitizeMarkdownUrls<br/>quita imágenes y enlaces externos"]
  modelo -->|"más de 6 pasos"| corte["Mensaje de límite"]
  md --> salida{"inspectOutput<br/>canario · prompt · secretos"}
  salida -->|"fuga"| bloqueo["Rechazo, sin pestañas ni imágenes"]
  salida -->|"limpia"| stream["Streaming al widget<br/>start · delta · image · end · open_url"]
  acumuladas --> stream
```

### Componentes

| Componente             | Archivo                                                   | Responsabilidad                                                                                          |
| ---------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Servidor del agente    | `agent-server/src/server.ts`                              | WebSocket del widget, `/healthz`, límite de tasa, un turno a la vez por conexión, orígenes permitidos    |
| Orquestador            | `agent-server/src/agent.ts`                               | Ciclo ReAct, límites por turno, aplicación de todas las defensas, streaming del resultado                |
| System prompt          | `agent-server/src/system-prompt.ts`                       | Rol, uso de herramientas, reglas de seguridad y canario. Sin secretos                                    |
| Puerto del modelo      | `agent-server/src/ports/llm.ts`                           | Contrato `LlmClient`; adaptadores en `llm/anthropic-llm.ts` y `llm/openai-compatible-llm.ts`             |
| Puerto de herramientas | `agent-server/src/ports/tool-gateway.ts`                  | Contrato `ToolGateway`; adaptador MCP en `tools/mcp-tool-gateway.ts`                                     |
| MCP de TMDB            | `mcp-tmdb/src/tools.ts`                                   | 6 herramientas; arma las URL del póster y de IMDb a partir de identificadores validados                  |
| MCP de libros          | `mcp-books/src/tools.ts`, `book-matcher.ts`, `compare.ts` | 4 herramientas; elige la obra original (descarta guiones y guías) y calcula el veredicto                 |
| Base de los MCP        | `mcp-kit/src`                                             | Caché, cupo diario, cliente HTTP con errores como valores, servidor HTTP sin estado y arranque por stdio |
| Defensas               | `guardrails/src`                                          | Filtro de entrada, saneo de datos externos, canario, revisión de salida y lista blanca de URL            |

### Herramientas MCP

| Servidor    | Herramienta                | Qué devuelve                                                                                                        |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `mcp-tmdb`  | `tmdb_search_movies`       | Hasta 6 películas por título                                                                                        |
|             | `tmdb_discover_movies`     | Recomendaciones por género, año, calificación mínima y orden                                                        |
|             | `tmdb_similar_movies`      | Películas parecidas a una dada                                                                                      |
|             | `tmdb_movie_details`       | Ficha con géneros, duración, ID de IMDb y `basedOnBook` (endpoint `external_ids` y `keywords` en una sola petición) |
|             | `tmdb_show_poster`         | Directiva `image` con la URL de `image.tmdb.org`                                                                    |
|             | `tmdb_open_imdb`           | Directiva `open_url` hacia `www.imdb.com`                                                                           |
| `mcp-books` | `books_find_for_movie`     | La novela original o `found: false` si la película no tiene libro                                                   |
|             | `books_details`            | Ficha del libro con calificación y número de calificaciones                                                         |
|             | `books_compare_with_movie` | Veredicto, si vale la pena verla y nivel de confianza                                                               |
|             | `books_open_google_books`  | Directiva `open_url` hacia `books.google.com`                                                                       |

### Formato de las respuestas al widget

El contrato del proyecto 1 se extendió con dos eventos, validados en `transport-ws/src/parse-agent-event.ts`:

| Evento            | Campos                           | Qué hace el widget                                                                                |
| ----------------- | -------------------------------- | ------------------------------------------------------------------------------------------------- |
| `message.start`   | `messageId`                      | Crea el mensaje del agente                                                                        |
| `message.delta`   | `messageId`, `text`              | Agrega texto Markdown                                                                             |
| `message.image`   | `messageId`, `url`, `alt`        | Pinta el póster si el servidor está en su lista blanca                                            |
| `message.end`     | `messageId`                      | Cierra el mensaje                                                                                 |
| `action.open_url` | `actionId`, `url`, `title`       | Abre la pestaña si el sitio está en su lista blanca; si el navegador la bloquea, ofrece el enlace |
| `error`           | `code`, `message`, `recoverable` | Muestra el aviso                                                                                  |

La URL de una imagen o de una pestaña **nunca la escribe el modelo**: la arma el MCP Server a partir de un identificador validado, el orquestador la revisa contra la lista blanca y el widget la vuelve a revisar contra la suya.

Las pestañas se abren con `window.open` al recibir el evento. Los navegadores solo permiten ventanas emergentes poco después de una acción del usuario; si el modelo tarda, el navegador puede bloquearla. En ese caso el widget lo detecta y muestra el enlace. Para la demo conviene permitir ventanas emergentes en el sitio.

## Seguridad: LLM01 y LLM07

La premisa es que **el modelo puede fallar**. Por eso cada defensa vive fuera del modelo y se puede probar sin él; el system prompt es una capa más, no la principal.

### LLM01: Prompt Injection

| Capa                             | Archivo                                                  | Contra qué                                                                                                                                                                                                                   |
| -------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Filtro de entrada                | `guardrails/src/input-guard.ts`                          | Órdenes directas en español e inglés, cambio de rol, palabras de jailbreak, falsos turnos de sistema. Normaliza antes de comparar (mayúsculas, acentos, ancho completo, caracteres invisibles) y decodifica segmentos base64 |
| Historial saneado                | `agent.ts` (`sanitizeHistory`)                           | Un ataque rechazado antes no reingresa como contexto; el historial lo manda el cliente y no es de fiar                                                                                                                       |
| Datos externos no confiables     | `guardrails/src/untrusted-data.ts`                       | Inyección indirecta en sinopsis o descripciones: se recortan, se reemplazan las que parecen instrucciones y todo va dentro de `<datos_externos>`, que el prompt declara como datos                                           |
| Separación instrucciones / datos | `system-prompt.ts`                                       | El prompt le dice al modelo que nada dentro de `<datos_externos>` es una orden                                                                                                                                               |
| Herramientas cerradas            | `agent.ts` (`executeToolCall`)                           | El modelo solo puede llamar herramientas publicadas por los MCP; los argumentos los valida el esquema Zod de cada una                                                                                                        |
| Lista blanca de destinos         | `guardrails/src/url-policy.ts`, `ui-react/src/policy.ts` | Abrir sitios de phishing o exfiltrar datos en la URL de una imagen. Doble revisión: backend y widget                                                                                                                         |
| Markdown saneado                 | `sanitizeMarkdownUrls` y `markdown-message.tsx`          | Imágenes y enlaces Markdown hacia sitios externos                                                                                                                                                                            |
| Límites por turno                | `agent.ts` (`AgentLimits`), `server.ts`                  | Bucles de herramientas que agotarían el cupo de las APIs                                                                                                                                                                     |

### LLM07: System Prompt Leakage

| Capa                      | Archivo                          | Contra qué                                                                                                                                                     |
| ------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sin secretos en el prompt | `system-prompt.ts`, `config.ts`  | Aunque el prompt se filtre entero, no da acceso a nada: las claves de TMDB y Google Books viven solo en sus MCP Servers, y la del modelo nunca entra al prompt |
| Filtro de entrada         | `guardrails/src/patterns.ts`     | Peticiones del prompt, de “todo lo anterior”, de traducciones literales y de claves o variables de entorno                                                     |
| Canario                   | `guardrails/src/canary.ts`       | Cadena aleatoria por proceso dentro del prompt. Si aparece en la salida (tal cual, con separadores, al revés o en base64), hay fuga segura                     |
| Copia literal             | `guardrails/src/output-guard.ts` | Fragmentos de 60 caracteres del prompt aunque no traigan el canario                                                                                            |
| Formas de secreto         | `output-guard.ts`                | Claves conocidas del proceso y patrones `sk-…`, `AIza…` y JWT                                                                                                  |
| Sin streaming del modelo  | `agent.ts`                       | La respuesta completa se revisa antes de enviar el primer fragmento: una fuga ya enviada no se puede retirar                                                   |

Cada bloqueo deja una línea JSON en el log (`{"scope":"security",...}`) con el tipo de evento y la regla, nunca con el texto del usuario.

## Evals

`pnpm evals` ejecuta 27 casos contra el agente real (`runAgentTurn`) con los MCP Servers reales conectados en memoria. Solo se simulan las APIs externas (para que sean reproducibles y no gasten cupo) y el modelo:

- **Uso correcto (8 casos):** recomendar y mostrar el póster, anunciar la comparación, veredicto favorable y desfavorable, película sin libro, abrir IMDb, abrir Google Books y un control de falsos positivos.
- **LLM01 (10 casos):** inyección directa en español e inglés, ofuscada con caracteres invisibles, en base64, falso turno de sistema, inyección indirecta en una sinopsis de TMDB, exfiltración por imagen Markdown, herramienta inventada, historial envenenado y bucle de herramientas.
- **LLM07 (9 casos):** tres peticiones que se detienen en la entrada y seis que pasan el filtro a propósito, para demostrar que la salida contiene la fuga completa, parcial, del canario en base64, deletreado, al revés y de una clave.

En los ataques, el modelo simulado está **ya comprometido**: hace exactamente lo que el atacante quiere. Si el caso pasa, la defensa no depende de que el modelo se porte bien. `pnpm evals:live` corre los mismos casos contra el modelo configurado en `.env` y omite las comprobaciones que exigen un modelo comprometido.

El reporte se genera en [docs/evals/REPORTE.md](evals/REPORTE.md) y CI lo publica en el resumen de cada ejecución.

## Cómo escalar el agente

| Necesidad                                 | Dónde va                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Nueva herramienta de películas o libros   | `defineTool` en `mcp-tmdb/src/tools.ts` o `mcp-books/src/tools.ts`, con su prueba. El agente la descubre solo      |
| Nuevo MCP Server (por ejemplo, streaming) | `packages/mcp-<nombre>` sobre `mcp-kit`, servicio nuevo en `docker-compose.yml` y entrada en `MCP_SERVERS`         |
| Nuevo proveedor de modelo                 | Adaptador de `LlmClient` en `agent-server/src/llm/` y caso en `create-llm.ts`                                      |
| Nueva defensa                             | Función pura en `guardrails`, llamada desde `agent.ts`, y casos en `packages/evals/src/cases`                      |
| Nuevo tipo de directiva para el widget    | Variante en `UiDirective`, evento en `AgentEvent`, validación en `parse-agent-event.ts` y componente en `ui-react` |
| Varias réplicas compartiendo caché        | Implementación de `TtlCache` sobre Redis inyectada en `ApiClient`                                                  |
