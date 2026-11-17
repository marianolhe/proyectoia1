# ADR 0006: un agente centralizado con herramientas en MCP Servers

- **Estado:** aceptada
- **Código:** `packages/agent-server/src/agent.ts`, `packages/mcp-tmdb`, `packages/mcp-books`, `packages/agent-server/src/tools/mcp-tool-gateway.ts`

## Contexto

El agente debe recomendar películas (TMDB), compararlas con su libro (Google Books), mostrar pósters y abrir sitios. El enunciado pide abstraer las herramientas en MCP Servers porque otros agentes podrían usarlas más adelante. Había que decidir cuántos agentes usar y dónde poner la lógica.

## Decisión

Un solo orquestador con un modelo de lenguaje decide qué herramienta usar en cada paso (ciclo ReAct). Las herramientas viven en dos MCP Servers independientes, uno por fuente de datos. El orquestador las descubre con `tools/list` y no tiene ninguna escrita a mano. La lógica que debe ser determinista (elegir el libro correcto, calcular el veredicto, armar URL) vive en las herramientas, no en el modelo.

## Alternativas consideradas

| Alternativa                                                     | Por qué se descartó                                                                                                                                                          |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jerárquico: supervisor + agente de películas + agente de libros | La comparación necesita la ficha de la película dentro del agente de libros; delegar duplica llamadas al modelo, latencia y superficie de inyección sin mejorar la respuesta |
| Herramientas como funciones dentro del backend                  | Más simple, pero incumple el requisito de MCP y obliga a redesplegar el agente por cada herramienta nueva                                                                    |
| Un solo MCP Server con todas las herramientas                   | Acopla dos APIs con cupos y fallos distintos: si Google Books se cae, se pierde también TMDB                                                                                 |
| Veredicto película/libro decidido por el modelo                 | No es reproducible ni comprobable con pruebas, y otro agente obtendría otra respuesta                                                                                        |

## Consecuencias

- La clasificación es **centralizada**: un único punto de decisión. Es más fácil de razonar, de asegurar y de probar.
- Cada MCP Server escala y falla por separado. `McpToolGateway` sirve las herramientas disponibles y reintenta las caídas.
- Los MCP Servers también corren por stdio, así que cualquier cliente MCP (Claude Desktop, un IDE, otro agente) puede usarlos.
- Si algún día hace falta más de un agente, la frontera ya está trazada: los nuevos consumen los mismos servidores.
- ESLint prohíbe que `agent-server` importe un MCP Server y que un MCP Server importe algo que no sea `mcp-kit`.

## Rol de la IA

- **Qué propuso el agente:** [COMPLETAR POR EL EQUIPO]
- **Qué decidió el equipo y por qué:** [COMPLETAR POR EL EQUIPO]
