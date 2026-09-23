import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

/**
 * Configuracion de ESLint en formato plano (flat config).
 *
 * El bloque mas importante de este archivo no son las reglas de estilo, sino
 * los limites de arquitectura del final: convierten la regla de dependencias
 * de puertos y adaptadores en un error de compilacion de CI, en lugar de
 * dejarla a la disciplina de cada persona que contribuye.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/*.config.js',
      '**/*.config.mjs',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // ---------------------------------------------------------------------------
  // Limites de arquitectura (puertos y adaptadores)
  // ---------------------------------------------------------------------------

  {
    // El nucleo es el centro del hexagono: no conoce a nadie.
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@agichat/*'],
              message:
                'packages/core no debe importar otros paquetes del monorepo. Es el nucleo: define puertos, no consume adaptadores.',
            },
            {
              group: ['react', 'react-dom', 'ws'],
              message:
                'packages/core debe permanecer agnostico de framework y de red. Mueva esta dependencia a ui-react o a un paquete transport-*.',
            },
          ],
        },
      ],
    },
  },

  {
    // La interfaz solo habla con el nucleo, nunca con un adaptador concreto.
    files: ['packages/ui-react/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@agichat/transport-*', '@agichat/mock-server', '@agichat/sdk-embed'],
              message:
                'La interfaz no debe acoplarse a un transporte concreto. Reciba una implementacion de ChatTransport por inyeccion, para que Fase 2 no obligue a tocar componentes.',
            },
          ],
        },
      ],
    },
  },

  {
    // Los adaptadores implementan el puerto; no suben hacia la interfaz.
    files: ['packages/transport-*/**/*.ts', 'packages/mock-server/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@agichat/ui-react', '@agichat/sdk-embed'],
              message:
                'Un adaptador no debe depender de la capa de presentacion. La dependencia va siempre hacia packages/core.',
            },
          ],
        },
      ],
    },
  },

  {
    // El servidor mock es una herramienta de desarrollo: ahi si se registra por consola.
    files: ['packages/mock-server/**/*.ts', 'apps/demo/**/*.{ts,tsx}'],
    rules: {
      'no-console': 'off',
    },
  },

  {
    // Las pruebas relajan unas pocas reglas para poder construir dobles y casos limite.
    files: ['**/*.test.{ts,tsx}', '**/testing/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  prettier,
)
