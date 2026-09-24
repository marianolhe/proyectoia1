# AGENTS.md

Instrucciones para herramientas de codeo agéntico (Claude Code, Codex, Cursor, Copilot y similares) y para cualquier persona nueva en el repositorio. Si una instrucción de este archivo choca con lo que propone el agente, gana este archivo.

## Propósito

AGIChat SDK es un widget de chat agéntico que cualquier cliente incrusta en su sitio. En la Fase 1, el widget habla con un agente simulado (`packages/mock-server`). En la Fase 2 hablará con el agente real **sin rediseñar la interfaz**: solo cambia el adaptador que se inyecta. Toda decisión debe proteger esa propiedad.

## Stack

| Área     | Herramienta                                                                  |
| -------- | ---------------------------------------------------------------------------- |
| Lenguaje | TypeScript 5 en modo estricto (`tsconfig.base.json`)                         |
| Monorepo | pnpm workspaces (`packages/*`, `apps/*`), versión fijada en `packageManager` |
| Interfaz | React 19, `react-markdown` + `remark-gfm` + `rehype-sanitize`                |
| Pruebas  | Vitest 3 con cobertura v8, Testing Library y jsdom                           |
| Calidad  | ESLint 9 (flat config) y Prettier 3                                          |
| Build    | tsup (librerías) y Vite (demo y bundle IIFE)                                 |
| CI/CD    | GitHub Actions (`.github/workflows`)                                         |

## Comandos

Requisitos: Node 20 o superior. Active pnpm con `corepack enable`.

| Comando                             | Qué hace                                                       |
| ----------------------------------- | -------------------------------------------------------------- |
| `pnpm install`                      | Instala dependencias (en CI: `pnpm install --frozen-lockfile`) |
| `pnpm lint`                         | ESLint, incluidos los límites de arquitectura                  |
| `pnpm format` / `pnpm format:check` | Aplica o verifica Prettier                                     |
| `pnpm typecheck`                    | `tsc --noEmit` en todos los paquetes                           |
| `pnpm test`                         | Ejecuta todas las pruebas                                      |
| `pnpm test:coverage`                | Pruebas con cobertura; falla si baja de 80 %                   |
| `pnpm build`                        | Compila los paquetes de `packages/`                            |
| `pnpm mock`                         | Levanta el agente simulado en `ws://localhost:8787`            |
| `pnpm dev`                          | Levanta la demo en `http://localhost:5173`                     |
| `pnpm verify`                       | Lint, tipos, cobertura y build: lo mismo que exige CI          |

Antes de dar por terminado un cambio, ejecute `pnpm verify` y `pnpm format:check`.

## Mapa del repositorio

| Ruta                    | Rol                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/core`         | Núcleo: dominio, máquina de estados, `ChatClient` y el puerto `ChatTransport`. Sin dependencias de runtime |
| `packages/transport-ws` | Adaptador WebSocket del puerto, con reconexión exponencial                                                 |
| `packages/mock-server`  | Agente simulado: servidor WebSocket y `InBrowserMockTransport` (entrada `browser`)                         |
| `packages/ui-react`     | Componentes React del widget                                                                               |
| `packages/sdk-embed`    | Bundle IIFE `AGIChat.mount()` con Shadow DOM                                                               |
| `apps/demo`             | Vitrina de integración; no se publica como paquete                                                         |
| `docs/`                 | Arquitectura, ADR y bitácora de IA                                                                         |

La explicación completa está en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Reglas de arquitectura (qué puede importar qué)

ESLint las hace cumplir con `no-restricted-imports` en `eslint.config.mjs`. No las desactive.

| Paquete                       | Puede importar                     | No puede importar                                                    |
| ----------------------------- | ---------------------------------- | -------------------------------------------------------------------- |
| `core`                        | Nada del monorepo                  | `@agichat/*`, `react`, `react-dom`, `ws`                             |
| `ui-react`                    | `@agichat/core`, React             | `@agichat/transport-*`, `@agichat/mock-server`, `@agichat/sdk-embed` |
| `transport-*` y `mock-server` | `@agichat/core`                    | `@agichat/ui-react`, `@agichat/sdk-embed`                            |
| `sdk-embed`                   | `core`, `transport-ws`, `ui-react` | (sin restricción explícita; es la capa de composición)               |
| `apps/demo`                   | Cualquier paquete                  | (sin restricción explícita)                                          |

Consecuencias prácticas:

- La interfaz **recibe** un `ChatTransport` o un `ChatClient` por props; nunca construye un transporte.
- Un canal nuevo (HTTP con SSE, el agente real) es un paquete `packages/transport-<nombre>` que implementa `ChatTransport`. No se toca `core` ni `ui-react`.
- La composición (elegir qué adaptador usar) ocurre solo en `sdk-embed` y en `apps/demo`.

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

## Pruebas

- Cada archivo `x.ts` lleva su `x.test.ts` al lado.
- Para la interfaz use `InMemoryTransport` de `@agichat/core`: emite eventos a mano (`emit`, `respondWith`, `setStatus`, `failWith`).
- Para adaptadores, pruebe contra el servidor real: `startMockServer({ port: 0, timing: { startDelayMs: 0, deltaDelayMs: 0 } })`.
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
- Inventar secretos o tokens: los workflows solo usan `GITHUB_TOKEN`.
- Escribir comentarios aspiracionales o documentación que no refleje el código real.
