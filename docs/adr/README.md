# Registro de decisiones de arquitectura (ADR)

Cada ADR documenta una decisión que hoy está reflejada en el código: su contexto, la decisión, las alternativas y las consecuencias. La sección «Rol de la IA» la completa el equipo con lo que realmente ocurrió.

| ADR                                          | Decisión                                                         | Estado   |
| -------------------------------------------- | ---------------------------------------------------------------- | -------- |
| [0001](0001-puerto-como-flujo-de-eventos.md) | El puerto `ChatTransport` es un flujo de eventos, no una promesa | Aceptada |
| [0002](0002-dos-maquinas-de-estado.md)       | Conexión y conversación son dos máquinas de estado separadas     | Aceptada |
| [0003](0003-monorepo-pnpm-sin-turborepo.md)  | Monorepo con pnpm workspaces, sin Turborepo                      | Aceptada |
| [0004](0004-shadow-dom-con-iife.md)          | Distribución embebible como IIFE con Shadow DOM                  | Aceptada |
| [0005](0005-sanitizacion-de-markdown.md)     | Markdown del agente renderizado con sanitización en dos barreras | Aceptada |

Para una decisión nueva, copie el formato de cualquier ADR con el siguiente número.
