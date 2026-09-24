# ADR 0004: distribución embebible como IIFE con Shadow DOM

- **Estado:** aceptada
- **Código:** `packages/sdk-embed/src/mount.tsx`, `packages/sdk-embed/vite.config.ts`

## Contexto

Muchos clientes no usan React, y sus sitios tienen hojas de estilo propias que pueden alterar un widget ajeno o verse alteradas por él.

## Decisión

`@agichat/sdk-embed` compila un bundle IIFE (`agichat.js`) que incluye React y expone `window.AGIChat.mount(options)`. `mount` crea un nodo anfitrión, le adjunta un Shadow DOM, inyecta los estilos del widget en un `<style>` interno y devuelve `{ unmount() }`. Los equipos con React pueden usar `@agichat/ui-react` directamente.

## Alternativas consideradas

| Alternativa                     | Por qué se descartó                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| iframe                          | Aísla aún más, pero complica el tamaño dinámico, la comunicación con la página y la accesibilidad |
| CSS con prefijo, sin Shadow DOM | El prefijo `agc-` evita choques de nombres, pero no protege de reglas globales del anfitrión      |
| Bundle ESM con React externo    | Obliga al cliente a tener React en la versión correcta                                            |

## Consecuencias

- La integración es una sola etiqueta `<script>`; el ejemplo está en `packages/sdk-embed/examples/embed.html`.
- El bundle pesa cerca de 125 kB comprimido, porque incluye React.
- Vite emite además `dist/sdk-embed.css`, que el integrador no necesita, porque los estilos viajan dentro del bundle.

## Rol de la IA

- **Qué propuso el agente:** [COMPLETAR POR EL EQUIPO]
- **Qué decidió el equipo y por qué:** [COMPLETAR POR EL EQUIPO]
