import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

/**
 * Configuracion raiz de pruebas.
 *
 * Un solo archivo define todos los proyectos del monorepo para que el umbral de
 * cobertura se calcule de forma agregada y no por paquete: asi ninguna parte del
 * SDK puede esconderse detras del promedio de otra.
 *
 * apps/demo queda fuera del calculo a proposito. Es una vitrina de integracion,
 * no producto distribuible; incluirla inflaria el denominador y ocultaria huecos
 * reales en los paquetes que si se publican. La justificacion completa esta en
 * docs/ARQUITECTURA.md.
 */
const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url))

/**
 * Los paquetes del workspace se resuelven desde su codigo fuente y no desde
 * dist/: asi las pruebas corren en un clon limpio sin compilar antes, y un
 * cambio en core se refleja de inmediato en los paquetes que lo consumen.
 */
const WORKSPACE_ALIASES = [
  // Va primero y como expresion regular: debe capturar tambien `?inline`, y
  // el alias de '@agichat/ui-react' no puede tragarse esta subruta.
  {
    find: /^@agichat\/ui-react\/styles\.css/,
    replacement: fromRoot('./packages/ui-react/src/styles.css'),
  },
  { find: '@agichat/core', replacement: fromRoot('./packages/core/src/index.ts') },
  { find: '@agichat/transport-ws', replacement: fromRoot('./packages/transport-ws/src/index.ts') },
  { find: '@agichat/mock-server', replacement: fromRoot('./packages/mock-server/src/index.ts') },
  { find: '@agichat/ui-react', replacement: fromRoot('./packages/ui-react/src/index.ts') },
]

export default defineConfig({
  resolve: {
    alias: WORKSPACE_ALIASES,
  },
  test: {
    passWithNoTests: true,

    projects: [
      {
        extends: true,
        test: {
          name: 'core',
          root: './packages/core',
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'transport-ws',
          root: './packages/transport-ws',
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'mock-server',
          root: './packages/mock-server',
          environment: 'node',
        },
      },
      {
        extends: true,
        plugins: [react()],
        test: {
          name: 'ui-react',
          root: './packages/ui-react',
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
        },
      },
      {
        extends: true,
        plugins: [react()],
        test: {
          name: 'sdk-embed',
          root: './packages/sdk-embed',
          environment: 'jsdom',
        },
      },
    ],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['packages/*/src/**/*.{ts,tsx}'],
      exclude: [
        'apps/**',
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        // Los puertos son contratos puros (interfaces y uniones de tipos):
        // se borran al compilar, asi que no hay nada que ejecutar ni cubrir.
        '**/ports/**',
        '**/dist/**',
        '**/types.ts',
        // Punto de entrada del proceso: solo arranca el servidor real y
        // registra el resultado. No hay logica que valga probar sin
        // levantar un binario de verdad.
        '**/cli.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
})
