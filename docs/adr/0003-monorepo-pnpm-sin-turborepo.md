# ADR 0003: monorepo con pnpm workspaces, sin Turborepo

- **Estado:** aceptada
- **Código:** `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts`, `eslint.config.mjs`

## Contexto

El SDK se distribuye en piezas que un integrador combina (núcleo, adaptador, interfaz React, bundle embebible), más un servidor mock y una demo. Las piezas comparten tipos y deben evolucionar juntas.

## Decisión

Un solo repositorio con pnpm workspaces (`packages/*` y `apps/*`), sin orquestador de tareas. Las configuraciones de TypeScript, ESLint, Prettier y Vitest viven en la raíz. Los paquetes se resuelven desde su código fuente en pruebas, typecheck y demo (alias en `vitest.config.ts` y `apps/demo/vite.config.ts`, y `paths` en `tsconfig.base.json`), así que no hace falta compilar antes de probar.

## Alternativas consideradas

| Alternativa            | Por qué se descartó                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------- |
| Turborepo o Nx         | Con cinco paquetes, la caché de tareas no compensa otro punto de fallo en CI            |
| Un solo paquete        | No permite que un cliente use el núcleo sin React, ni hacer cumplir límites entre capas |
| Repositorios separados | Cada cambio del contrato exigiría versionar y publicar varios repositorios a la vez     |

## Consecuencias

- `eslint.config.mjs` hace cumplir los límites entre paquetes con `no-restricted-imports`.
- La cobertura se calcula de forma agregada, con un umbral de 80 %.
- Los alias de resolución deben mantenerse en sincronía con los paquetes que se agreguen.
- `pnpm -r` compila en orden topológico, así que `core` se compila antes que quienes lo consumen.

## Rol de la IA

- **Qué propuso el agente:** [COMPLETAR POR EL EQUIPO]
- **Qué decidió el equipo y por qué:** [COMPLETAR POR EL EQUIPO]
