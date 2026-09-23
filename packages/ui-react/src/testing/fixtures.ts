/**
 * Contenido de prueba para los componentes.
 *
 * XSS_PROBE_MARKDOWN replica literalmente el escenario `xss-probe` de
 * packages/mock-server. Se copia en vez de importarse porque la interfaz no
 * puede depender de un adaptador (regla de ESLint), y porque la prueba de
 * sanitizacion debe seguir fallando si alguien cambia el mock por accidente.
 */
export const XSS_PROBE_MARKDOWN = `# Aviso de prueba

Este contenido incluye HTML potencialmente peligroso a proposito, para que
el cliente demuestre que su sanitizador lo neutraliza antes de renderizarlo:

<script>alert('inyectado')</script>

<img src="x" onerror="alert('inyectado')" />

[enlace sospechoso](javascript:alert('inyectado'))
`

export const GFM_MARKDOWN = `## Proximos pasos

1. Revisar el manifiesto

- [x] Ruta confirmada

| Ruta | ETA |
| --- | --- |
| Quetzal a Barrios | 9 h |

~~obsoleto~~ y **negritas**

Mas detalles en [el panel](https://agichat.example.com/tracking).
`
