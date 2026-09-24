## Qué cambia y por qué

<!-- Una o dos frases: el problema y la solución. Enlace el issue si existe (Closes #N). -->

## Decisiones de diseño

<!-- Alternativas consideradas y por qué se eligió esta. Si la propuso un agente de IA, indique qué aceptó, qué cambió y qué rechazó el equipo. -->

## Cómo probarlo

<!-- Pasos concretos para que el revisor lo verifique en local. -->

## Checklist del autor

<!-- Las marca quien abre el PR antes de pedir revisión. -->

- [ ] `pnpm lint` y `pnpm format:check` pasan en local
- [ ] `pnpm typecheck` pasa en local
- [ ] `pnpm test:coverage` pasa en local y la cobertura sigue por encima de 80 %
- [ ] Agregué o actualicé pruebas para el cambio
- [ ] Actualicé la documentación afectada (README, AGENTS.md, docs/)
- [ ] Respeté los límites entre paquetes de AGENTS.md

## Checklist del revisor

<!-- NO las marque como autor. Solo las marca otro integrante al aprobar el PR. -->

- [ ] Revisado por otro integrante del equipo
- [ ] Las decisiones de arquitectura están validadas y son coherentes con docs/ARQUITECTURA.md
- [ ] Probé el cambio en local o revisé la evidencia de CI
