import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

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
export default defineConfig({
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
        '**/index.ts',
        // Los puertos son contratos puros (interfaces y uniones de tipos):
        // se borran al compilar, asi que no hay nada que ejecutar ni cubrir.
        '**/ports/**',
        '**/dist/**',
        '**/types.ts',
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
