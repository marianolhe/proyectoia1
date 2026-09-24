# AGIChat SDK

[![CI](https://github.com/marianolhe/proyectoia1/actions/workflows/ci.yml/badge.svg)](https://github.com/marianolhe/proyectoia1/actions/workflows/ci.yml)
[![Deploy demo](https://github.com/marianolhe/proyectoia1/actions/workflows/deploy.yml/badge.svg)](https://github.com/marianolhe/proyectoia1/actions/workflows/deploy.yml)

SDK de widget de chat agéntico, embebible en el sitio de cualquier cliente.

La Fase 1 entrega la interfaz completa conectada a un agente simulado que responde en Markdown, con streaming token por token. La Fase 2 sustituye ese agente por el real **sin tocar la interfaz**: solo cambia el adaptador que se inyecta.

- Demo publicada: <https://marianolhe.github.io/proyectoia1/>
- Arquitectura, diagrama y estructura de carpetas: [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md)
- Reglas para herramientas agénticas y para contribuir: [AGENTS.md](AGENTS.md)
- Decisiones de arquitectura: [docs/adr](docs/adr) · Uso de IA: [docs/ia/bitacora.md](docs/ia/bitacora.md)

## Requisitos

- Node.js 20 o superior
- pnpm, activado con Corepack (la versión está fijada en `package.json`)

```bash
corepack enable
```

## Instalación

```bash
pnpm install
```

Opcional: copie `.env.example` a `.env` para que la demo use el servidor WebSocket local.

## Ejecución

En una terminal, levante el agente simulado:

```bash
pnpm mock
```

En otra terminal, levante la demo y abra <http://localhost:5173>:

```bash
pnpm dev
```

Sin `VITE_AGICHAT_WS_URL`, la demo usa el agente simulado dentro del navegador y no necesita `pnpm mock`. En la demo puede probar tres casos:

| Escriba            | Qué ocurre                                                                  |
| ------------------ | --------------------------------------------------------------------------- |
| Cualquier pregunta | Respuesta en Markdown con encabezados, listas, código, tabla, cita y enlace |
| «muestrame html»   | Contenido con `<script>` y `javascript:`, neutralizado por el sanitizador   |
| «simula un error»  | Fallo del agente con aviso recuperable                                      |

Si detiene `pnpm mock` con la demo abierta, el widget muestra «Se perdió la conexión. Reintentando…» y se reconecta solo al volver el servidor.

## Pruebas y calidad

| Comando              | Qué verifica                                            |
| -------------------- | ------------------------------------------------------- |
| `pnpm lint`          | ESLint, incluidos los límites entre paquetes            |
| `pnpm format:check`  | Formato con Prettier                                    |
| `pnpm typecheck`     | Tipos en todos los paquetes                             |
| `pnpm test`          | Pruebas unitarias e integración contra el servidor mock |
| `pnpm test:coverage` | Lo mismo, con cobertura; falla por debajo de 80 %       |
| `pnpm verify`        | Lint, tipos, cobertura y build, como en CI              |

El reporte HTML de cobertura queda en `coverage/index.html`.

## Uso del SDK

### Con React

```tsx
import { WebSocketTransport } from '@agichat/transport-ws'
import { ChatWidget } from '@agichat/ui-react'
import '@agichat/ui-react/styles.css'

const transport = new WebSocketTransport({ url: 'wss://agente.ejemplo/chat' })

export function Soporte() {
  return <ChatWidget transport={transport} />
}
```

### Sin React, con una etiqueta script

```html
<script src="agichat.js" onload="AGIChat.mount({ wsUrl: 'wss://agente.ejemplo/chat' })"></script>
```

`mount` acepta `target`, `transport`, `labels`, `avatarSrc`, `launcher` y `defaultOpen`, y devuelve `{ unmount() }`. El widget se aísla en un Shadow DOM. Hay un ejemplo completo en [packages/sdk-embed/examples/embed.html](packages/sdk-embed/examples/embed.html) (requiere `pnpm build` y `pnpm mock`).

## Integración y entrega continua

| Workflow      | Cuándo corre           | Qué hace                                                              |
| ------------- | ---------------------- | --------------------------------------------------------------------- |
| `ci.yml`      | Push y PR hacia `main` | Lint, formato, tipos, pruebas con cobertura y build en Node 20 y 22   |
| `deploy.yml`  | Push a `main`          | Publica la demo en GitHub Pages                                       |
| `release.yml` | Etiqueta `v*`          | Crea una GitHub Release con `agichat.js` y los `.tgz` de cada paquete |

## Estructura

```text
packages/core          Núcleo: estado, ChatClient y puerto ChatTransport
packages/transport-ws  Adaptador WebSocket con reconexión
packages/mock-server   Agente simulado (servidor y versión en el navegador)
packages/ui-react      Componentes React del widget
packages/sdk-embed     Bundle IIFE con Shadow DOM
apps/demo              Vitrina de integración
```

El detalle está en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Licencia

MIT
