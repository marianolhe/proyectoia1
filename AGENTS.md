# AGENTS.md

Instrucciones para herramientas de codeo agéntico (Claude Code, Codex, Cursor, Copilot y similares) y para cualquier persona nueva en el repositorio. Si una instrucción de este archivo choca con lo que propone el agente, gana este archivo.

## Propósito

AGIChat es un widget de chat agéntico que cualquier cliente incrusta en su sitio (Fase 1) y un agente que recomienda películas, las compara con su libro y abre IMDb o Google Books (Fase 2). El widget habla con el agente por el puerto `ChatTransport`; las herramientas del agente viven en MCP Servers independientes. Toda decisión debe proteger dos propiedades: la interfaz no conoce al agente, y el agente no conoce a los MCP Servers más que por el protocolo.

## Stack

| Área     | Herramienta                                                                    |
| -------- | ------------------------------------------------------------------------------ |
| Lenguaje | TypeScript 5 en modo estricto (`tsconfig.base.json`)                           |
| Monorepo | pnpm workspaces (`packages/*`, `apps/*`), versión fijada en `packageManager`   |
| Interfaz | React 19, `react-markdown` + `remark-gfm` + `rehype-sanitize`                  |
| Pruebas  | Vitest 3 con cobertura v8, Testing Library y jsdom                             |
| Calidad  | ESLint 9 (flat config) y Prettier 3                                            |
| Build    | tsup (librerías) y Vite (demo y bundle IIFE)                                   |
| CI/CD    | GitHub Actions (`.github/workflows`)                                           |
| Agente   | `@anthropic-ai/sdk` (o API chat completions), `@modelcontextprotocol/sdk`, Zod |
| Backend  | Node 20+, `ws`, Docker (`Dockerfile`, `docker-compose.yml`)                    |

## Comandos

Requisitos: Node 20 o superior. Active pnpm con `corepack enable`.

| Comando                                         | Qué hace                                                       |
| ----------------------------------------------- | -------------------------------------------------------------- |
| `pnpm install`                                  | Instala dependencias (en CI: `pnpm install --frozen-lockfile`) |
| `pnpm lint`                                     | ESLint, incluidos los límites de arquitectura                  |
| `pnpm format` / `pnpm format:check`             | Aplica o verifica Prettier                                     |
| `pnpm typecheck`                                | `tsc --noEmit` en todos los paquetes                           |
| `pnpm test`                                     | Ejecuta todas las pruebas                                      |
| `pnpm test:coverage`                            | Pruebas con cobertura; falla si baja de 80 %                   |
| `pnpm build`                                    | Compila los paquetes de `packages/`                            |
| `pnpm mock`                                     | Levanta el agente simulado en `ws://localhost:8787`            |
| `pnpm dev`                                      | Levanta la demo en `http://localhost:5173`                     |
| `pnpm verify`                                   | Lint, tipos, cobertura y build: lo mismo que exige CI          |
| `pnpm evals`                                    | Evals del agente sin conexión; escribe `docs/evals/`           |
| `pnpm agent`, `pnpm mcp:tmdb`, `pnpm mcp:books` | Levantan el backend sin Docker (tras `pnpm build`)             |
| `docker compose up --build`                     | Levanta el backend completo                                    |

Antes de dar por terminado un cambio, ejecute `pnpm verify`, `pnpm format:check` y, si tocó el agente o las defensas, `pnpm evals`.

## Mapa del repositorio

| Ruta                    | Rol                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/core`         | Núcleo: dominio, máquina de estados, `ChatClient` y el puerto `ChatTransport`. Sin dependencias de runtime |
| `packages/transport-ws` | Adaptador WebSocket del puerto, con reconexión exponencial                                                 |
| `packages/mock-server`  | Agente simulado: servidor WebSocket y `InBrowserMockTransport` (entrada `browser`)                         |
| `packages/ui-react`     | Componentes React del widget                                                                               |
| `packages/sdk-embed`    | Bundle IIFE `AGIChat.mount()` con Shadow DOM                                                               |
| `apps/demo`             | Vitrina de integración; no se publica como paquete                                                         |
| `packages/guardrails`   | Defensas LLM01 y LLM07. Lógica pura, sin dependencias                                                      |
| `packages/mcp-kit`      | Base de los MCP Servers: caché, cupo diario, cliente HTTP, servidor HTTP sin estado y stdio                |
| `packages/mcp-tmdb`     | MCP Server de películas                                                                                    |
| `packages/mcp-books`    | MCP Server de libros y comparación                                                                         |
| `packages/agent-server` | Orquestador del agente, adaptadores del modelo, cliente MCP y servidor WebSocket                           |
| `packages/evals`        | Evals de uso correcto, LLM01 y LLM07                                                                       |
| `docs/`                 | Arquitectura, ADR y bitácora de IA                                                                         |

La explicación completa está en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) (widget) y [docs/AGENTE.md](docs/AGENTE.md) (agente).

## Reglas de arquitectura (qué puede importar qué)

ESLint las hace cumplir con `no-restricted-imports` en `eslint.config.mjs`. No las desactive.

| Paquete                       | Puede importar                     | No puede importar                                                    |
| ----------------------------- | ---------------------------------- | -------------------------------------------------------------------- |
| `core`                        | Nada del monorepo                  | `@agichat/*`, `react`, `react-dom`, `ws`                             |
| `ui-react`                    | `@agichat/core`, React             | `@agichat/transport-*`, `@agichat/mock-server`, `@agichat/sdk-embed` |
| `transport-*` y `mock-server` | `@agichat/core`                    | `@agichat/ui-react`, `@agichat/sdk-embed`                            |
| `sdk-embed`                   | `core`, `transport-ws`, `ui-react` | (sin restricción explícita; es la capa de composición)               |
| `apps/demo`                   | Cualquier paquete                  | (sin restricción explícita)                                          |
| `guardrails`                  | Nada del monorepo                  | `@agichat/*`                                                         |
| `mcp-tmdb`, `mcp-books`       | `@agichat/mcp-kit`                 | Cualquier otro `@agichat/*`                                          |
| `agent-server`                | `core`, `guardrails`               | `mcp-tmdb`, `mcp-books`, `ui-react`, `sdk-embed`                     |
| `evals`                       | Cualquier paquete                  | (es el banco de pruebas de todo el sistema)                          |

Consecuencias prácticas:

- La interfaz **recibe** un `ChatTransport` o un `ChatClient` por props; nunca construye un transporte.
- Un canal nuevo (HTTP con SSE, el agente real) es un paquete `packages/transport-<nombre>` que implementa `ChatTransport`. No se toca `core` ni `ui-react`.
- La composición (elegir qué adaptador usar) ocurre solo en `sdk-embed` y en `apps/demo`.
- El agente descubre las herramientas con `tools/list`. Una herramienta nueva se agrega con `defineTool` en su MCP Server; no se escribe nada en `agent-server`.
- Un MCP Server no depende del agente ni de otro MCP Server: otro agente debe poder usarlo solo.

## Convenciones de código

- Imports relativos con extensión `.js` (`import { x } from './x.js'`), aunque el archivo sea `.ts` o `.tsx`.
- `import type` para lo que solo es tipo (`consistent-type-imports` lo exige).
- Propiedades `readonly` en interfaces de datos y opciones; estado privado con `#campo`.
- Sin `any` (`no-explicit-any` es error). Para datos externos use `unknown` y valide campo por campo, como en `parse-agent-event.ts` y `protocol.ts`.
- `index.ts` **solo reexporta**. La lógica va en archivos propios con nombre descriptivo.
- Identificadores en inglés; comentarios, documentación y mensajes visibles en español.
- Los comentarios explican **por qué**, no qué. No escriba comentarios sobre funciones que todavía no existen.
- CSS: toda clase lleva el prefijo `agc-` y todo color o tamaño sale de una variable `--agc-*` definida en `.agc-widget`.
- Textos visibles: solo en `packages/ui-react/src/labels.ts`; los componentes los reciben por props.
- Errores esperables se devuelven como resultado (`SendResult`) o como evento `error` del transporte, no como excepción hacia React.

## Reglas del agente y de seguridad

- Ninguna clave va en el system prompt. Las de TMDB y Google Books viven solo en su MCP Server; `agent-server` no las recibe.
- Una URL que se abre o se pinta sola la arma un MCP Server a partir de un identificador validado. Nunca la escribe el modelo.
- Todo resultado de herramienta pasa por `sanitizeUntrusted` y `wrapUntrusted` antes de volver al modelo.
- Toda respuesta pasa por `sanitizeMarkdownUrls` e `inspectOutput` antes de enviarse. Por eso el backend no transmite los tokens del modelo en vivo.
- Un destino nuevo (servidor de imágenes o sitio que se abre) se agrega en las dos listas blancas: `guardrails/src/url-policy.ts` y `ui-react/src/policy.ts`.
- Una defensa nueva lleva su caso en `packages/evals/src/cases`, con un modelo simulado ya comprometido.
- Los MCP Servers devuelven `ToolOutcome` (`{ ok, data, ui }` o `{ ok: false, error }`), nunca lanzan hacia el agente.

## Pruebas

- Cada archivo `x.ts` lleva su `x.test.ts` al lado.
- Para la interfaz use `InMemoryTransport` de `@agichat/core`: emite eventos a mano (`emit`, `respondWith`, `setStatus`, `failWith`).
- Para adaptadores, pruebe contra el servidor real: `startMockServer({ port: 0, timing: { startDelayMs: 0, deltaDelayMs: 0 } })`.
- Para los MCP Servers, inyecte `fetch` en la fábrica (`createTmdbServerFactory(config, fetch)`) y conecte con `InMemoryTransport` de `@modelcontextprotocol/sdk`. Los dobles de cada API están en `src/testing/`.
- Para el agente, use los dobles de `agent-server/src/testing/doubles.ts` o `inMemoryConnector` con los MCP reales. Nunca llame a una API real en una prueba.
- Inyecte el tiempo (`now`, `wait`, `timing`) en lugar de usar temporizadores falsos.
- Cada `index.ts` tiene un `index.test.ts` que fija la API pública.
- Umbral: 80 % global en líneas, ramas, funciones y sentencias (`vitest.config.ts`). El objetivo del equipo es 95 % o más.
- No agregue exclusiones de cobertura nuevas sin justificarlas en `docs/ARQUITECTURA.md`.

## Flujo de trabajo (GitHub Flow)

1. Parta de `main` actualizado y cree una rama corta: `feature/…`, `fix/…`, `docs/…`, `ci/…`, `chore/…`.
2. Commits en Conventional Commits, en español y en imperativo: `feat(transport-ws): agregar reconexion exponencial`.
3. Abra un Pull Request hacia `main` con la plantilla de `.github/pull_request_template.md`.
4. CI debe quedar en verde y otro integrante debe aprobar antes de integrar.
5. Borre la rama después de integrar.

## Lo que un agente NO debe hacer

- Hacer push directo a `main`, reescribir historia publicada o integrar PR sin revisión humana.
- Usar `any`, `@ts-ignore` o `eslint-disable` para silenciar un error en lugar de corregirlo.
- Poner lógica en `index.ts`.
- Importar un transporte, el mock o `sdk-embed` desde `ui-react`, o React o `ws` desde `core`.
- Agregar `rehype-raw` o `dangerouslySetInnerHTML` sin pasar por `rehype-sanitize`.
- Relajar los umbrales de cobertura o excluir archivos para subir el porcentaje.
- Agregar dependencias sin uso o librerías de estado en `core`.
- Inventar secretos o tokens: los workflows solo usan `GITHUB_TOKEN`. Las claves de TMDB, Google Books y del modelo van en `.env`, que no se versiona.
- Poner una clave en el system prompt, transmitir tokens del modelo sin revisar la salida o abrir una URL escrita por el modelo.
- Importar un MCP Server desde `agent-server` o desactivar una defensa para que pase un eval.
- Escribir comentarios aspiracionales o documentación que no refleje el código real.
