# ADR 0005: Markdown del agente con sanitización en dos barreras

- **Estado:** aceptada
- **Código:** `packages/ui-react/src/components/markdown-message.tsx`, `packages/ui-react/src/components/markdown-message.test.tsx`

## Contexto

El enunciado pide que los mensajes del agente lleguen como Markdown y se rendericen bien. Ese contenido viene de un sistema que el sitio del cliente no controla: un agente manipulado podría devolver HTML o enlaces `javascript:` para ejecutar código en la página del cliente (XSS).

## Decisión

`MarkdownMessage` usa `react-markdown` con `remark-gfm` (tablas, listas de tareas, tachado) y `rehype-sanitize`:

1. `react-markdown` no interpreta HTML crudo y limpia URL peligrosas.
2. `rehype-sanitize` aplica una lista blanca. Si alguien agrega `rehype-raw` más adelante, el HTML sigue pasando por ella.

Los enlaces abren en otra pestaña con `rel="noopener noreferrer"`. El texto del usuario se muestra literal y nunca se interpreta como Markdown.

## Alternativas consideradas

| Alternativa                                      | Por qué se descartó                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `marked` + `dangerouslySetInnerHTML` + DOMPurify | Funciona, pero inserta HTML como cadena y depende de no olvidar nunca el sanitizador |
| Texto plano                                      | No cumple el requisito de renderizar Markdown                                        |

## Consecuencias

- El mock incluye un escenario `xss-probe` («muestrame html») con `<script>`, `onerror` y `javascript:`. Las pruebas verifican que nada de eso llega vivo al DOM, también cuando el contenido llega troceado por streaming.
- El Markdown se vuelve a procesar con cada fragmento; los plugins se definen fuera del componente para no reconstruir el pipeline.

## Rol de la IA

- **Qué propuso el agente:** [COMPLETAR POR EL EQUIPO]
- **Qué decidió el equipo y por qué:** [COMPLETAR POR EL EQUIPO]
