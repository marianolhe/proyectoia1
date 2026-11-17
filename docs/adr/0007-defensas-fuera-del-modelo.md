# ADR 0007: las defensas contra LLM01 y LLM07 viven fuera del modelo

- **Estado:** aceptada
- **Código:** `packages/guardrails`, `packages/agent-server/src/agent.ts`, `packages/ui-react/src/policy.ts`, `packages/evals`

## Contexto

El agente debe resistir inyección de prompts (LLM01) y fuga del system prompt (LLM07). Además tiene dos capacidades que un atacante querría secuestrar: abrir pestañas sin clic y pintar imágenes, que se descargan solas. Un modelo de lenguaje no garantiza seguir sus instrucciones de seguridad.

## Decisión

Se asume que el modelo puede ser engañado. Las defensas son funciones puras en `packages/guardrails`, aplicadas por el orquestador antes y después del modelo:

1. Filtro de entrada con texto normalizado y base64 decodificado.
2. Historial saneado: un ataque rechazado no reingresa.
3. Resultados de herramientas saneados y delimitados con `<datos_externos>`.
4. URL de pósters y pestañas armadas por los MCP Servers y revisadas contra una lista blanca, en el backend y otra vez en el widget.
5. Prompt sin secretos, con un canario aleatorio por proceso.
6. Revisión de la respuesta completa (canario, copia literal del prompt, formas de clave) antes de enviar el primer fragmento.

Los evals verifican las capas con un modelo simulado **ya comprometido**.

## Alternativas consideradas

| Alternativa                                    | Por qué se descartó                                                                                             |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Solo instrucciones en el system prompt         | Es la capa que más fácil se rompe; no se puede probar sin un modelo real y su resultado cambia entre modelos    |
| Un segundo modelo como clasificador de ataques | Duplica costo y latencia por mensaje y es vulnerable a lo mismo que pretende detectar; queda como mejora futura |
| Transmitir los tokens del modelo en vivo       | Mejor latencia percibida, pero una fuga detectada a mitad de la respuesta ya llegó al usuario                   |

## Consecuencias

- Las defensas se prueban en milisegundos y con certeza (100 % de líneas en `guardrails`).
- Un filtro de patrones tiene falsos negativos. Por eso los casos L04 a L09 pasan el filtro de entrada a propósito: demuestran que la salida contiene la fuga aunque la entrada no reconozca el ataque.
- La respuesta llega al widget cuando está completa; el backend la trocea para conservar el efecto de escritura.
- Agregar un destino (otro sitio que abrir) exige tocar las dos listas blancas. Es intencional.

## Rol de la IA

- **Qué propuso el agente:** [COMPLETAR POR EL EQUIPO]
- **Qué decidió el equipo y por qué:** [COMPLETAR POR EL EQUIPO]
