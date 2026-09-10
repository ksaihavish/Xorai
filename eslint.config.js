import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// The boundary below is rules.md 2 "Boundaries", enforced rather than trusted.
// Two design systems live in one codebase; without this they fuse by Phase 6.
const patientForbidden = [
  { group: ['@/caregiver', '@/caregiver/*', '**/caregiver/*', '../caregiver/*', '../../caregiver/*'], message: 'src/patient/** may not import from src/caregiver/**. They share src/core/** and src/ui/** only. See rules.md 2 Boundaries.' },
  { group: ['lucide-react'], message: 'lucide-react is caregiver mode only. Patient icons are hand-drawn inline SVG so they carry the same 3 px stroke as the rest of the design system. See rules.md 2 Boundaries.' },
  { group: ['framer-motion'], message: 'Ambient motion is banned in patient mode. See design.md.' },
]

const caregiverForbidden = [
  { group: ['@/patient', '@/patient/*', '**/patient/*', '../patient/*', '../../patient/*'], message: 'src/caregiver/** may not import from src/patient/**. They share src/core/** and src/ui/** only. See rules.md 2 Boundaries.' },
]

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage', 'docs', '.claude'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
    },
  },

  {
    files: ['src/patient/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: patientForbidden }],
    },
  },

  {
    files: ['src/caregiver/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: caregiverForbidden }],
    },
  },

  {
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      // rules.md 1.8 permits the non-null assertion in tests only.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  {
    files: ['*.config.{js,ts}', 'scripts/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
)
