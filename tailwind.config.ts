import type { Config } from 'tailwindcss'

// Every value here resolves to a CSS variable in src/styles/tokens.css so that
// [data-mode="caregiver"] can re-point paper / ink / clay without a second palette.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        paperSunk: 'var(--paper-sunk)',
        madder: 'var(--madder)',
        madderDeep: 'var(--madder-deep)',
        brass: 'var(--brass)',
        brassSoft: 'var(--brass-soft)',
        tea: 'var(--tea)',
        teaSoft: 'var(--tea-soft)',
        ink: 'var(--ink)',
        clay: 'var(--clay)',
        rule: 'var(--rule)',
        signal: 'var(--signal)',
        // Not in the prompt's list but required by design.md: focus rings moved
        // off brass, and the Part II regional grounds.
        focus: 'var(--focus)',
        indigo: 'var(--indigo)',
        terracotta: 'var(--terracotta)',
      },
      // Patient scale, design.md 3. Base is 24 px, not 16 — the type floor for
      // this audience is 24 px and everything else is measured from it.
      fontSize: {
        prompt: ['40px', { lineHeight: '1.35', fontWeight: '600' }],
        promptLg: ['56px', { lineHeight: '1.25', fontWeight: '600' }],
        body: ['24px', { lineHeight: '1.55', fontWeight: '400' }],
        name: ['32px', { lineHeight: '1.3', fontWeight: '600' }],
        btn: ['28px', { lineHeight: '1.2', fontWeight: '600' }],
      },
      spacing: {
        // 60 px is the floor and 72 px the target: ~16 mm on a typical tablet,
        // the size at which elderly users performed best in a 220-participant
        // touchscreen study. Apple's 44 pt is the absolute floor, not the target.
        touch: '60px',
        touchLg: '72px',
      },
      fontFamily: {
        sans: ['Noto Sans', 'Noto Sans Bengali', 'Noto Sans Meetei Mayek', 'system-ui', 'sans-serif'],
        ui: ['Inter', 'Noto Sans', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        patient: '16px',
        card: '20px',
      },
      maxWidth: {
        patient: '900px',
        caregiver: '1280px',
      },
    },
  },
  plugins: [],
} satisfies Config
