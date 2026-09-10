import { useTranslation } from 'react-i18next'
import { isSupabaseConfigured } from '@/core/supabase/client'
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react'

/**
 * Caregiver-mode form primitives. Not patient primitives: the type floor here is
 * 14 px, density is the job, and these carry no gamosa border.
 *
 * These belong in src/ui/ alongside the shared shadcn copies. They live here
 * because src/ui/ was outside this phase's touch list; onboarding and settings
 * both import them from here, so moving them later is one find-and-replace.
 *
 * Every field is a real <label for>, every error is tied to its input with
 * aria-describedby, and no field communicates state by colour alone
 * (design.md 10).
 */

export function Field({
  id,
  label,
  hint,
  error,
  required,
  children,
}: {
  id: string
  label: string
  hint?: string
  error?: string
  required?: boolean
  children: ReactNode
}) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined

  return (
    <div className="mb-5">
      <label htmlFor={id} className="mb-1 block text-[14px] font-medium text-ink">
        {label}
        {required ? <span className="ml-1 text-madder">*</span> : null}
      </label>
      {hint ? (
        <p id={hintId} className="mb-2 max-w-[72ch] text-[13px] leading-[1.5] text-clay">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={errorId} className="mt-1 text-[13px] font-medium text-madder">
          {error}
        </p>
      ) : null}
    </div>
  )
}

const inputClass =
  'w-full rounded-[6px] border border-rule bg-paperSunk px-3 py-2 text-[15px] text-ink ' +
  'outline-none focus-visible:border-signal focus-visible:ring-2 focus-visible:ring-signal/30 ' +
  'disabled:opacity-60'

export function TextInput({
  id,
  invalid,
  describedBy,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { id: string; invalid?: boolean; describedBy?: string }) {
  return (
    <input
      id={id}
      aria-invalid={invalid ? true : undefined}
      aria-describedby={describedBy}
      className={inputClass}
      {...rest}
    />
  )
}

export function Select({
  id,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { id: string }) {
  return (
    <select id={id} className={inputClass} {...rest}>
      {children}
    </select>
  )
}

export function Checkbox({
  id,
  label,
  checked,
  onChange,
  describedBy,
}: {
  id: string
  label: ReactNode
  checked: boolean
  onChange: (next: boolean) => void
  describedBy?: string
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-[3px] h-[18px] w-[18px] shrink-0 accent-[var(--signal)]"
      />
      <label htmlFor={id} className="max-w-[72ch] text-[14px] leading-[1.55] text-ink">
        {label}
      </label>
    </div>
  )
}

/**
 * A consent toggle. It states its state in words as well as position, because a
 * record of what someone agreed to should not rest on the reader correctly
 * interpreting which end of a switch is "on".
 */
export function Toggle({
  id,
  checked,
  onChange,
  onLabel,
  offLabel,
  disabled,
  describedBy,
}: {
  id: string
  checked: boolean
  onChange: (next: boolean) => void
  onLabel: string
  offLabel: string
  disabled?: boolean
  describedBy?: string
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={
        'inline-flex items-center gap-3 rounded-[6px] border px-3 py-2 text-[14px] font-medium ' +
        'outline-none focus-visible:ring-2 focus-visible:ring-signal/40 disabled:cursor-not-allowed disabled:opacity-70 ' +
        (checked ? 'border-tea bg-teaSoft text-ink' : 'border-rule bg-paperSunk text-clay')
      }
    >
      <span
        aria-hidden="true"
        className={
          'relative h-[20px] w-[36px] rounded-full transition-colors ' +
          (checked ? 'bg-tea' : 'bg-rule')
        }
      >
        <span
          className={
            'absolute top-[2px] h-[16px] w-[16px] rounded-full bg-paperSunk transition-[left] ' +
            (checked ? 'left-[18px]' : 'left-[2px]')
          }
        />
      </span>
      {checked ? onLabel : offLabel}
    </button>
  )
}

export function PrimaryButton({
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      type="button"
      className="rounded-[6px] border border-ink bg-ink px-4 py-2 text-[14px] font-semibold text-paper outline-none focus-visible:ring-2 focus-visible:ring-signal/40 disabled:opacity-50"
      {...rest}
    >
      {children}
    </button>
  )
}

export function SecondaryButton({
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      type="button"
      className="rounded-[6px] border border-rule bg-paperSunk px-4 py-2 text-[14px] font-medium text-ink outline-none focus-visible:ring-2 focus-visible:ring-signal/40 disabled:opacity-50"
      {...rest}
    >
      {children}
    </button>
  )
}

/**
 * Caregiver error surface. rules.md 4: name what happened and the next action,
 * no apology, no vagueness, no raw error codes. Patient mode has no equivalent
 * and must never grow one.
 */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="mb-4 max-w-[72ch] rounded-[6px] border border-madder bg-paperSunk px-3 py-2 text-[14px] text-ink"
    >
      {children}
    </p>
  )
}

/**
 * A setup notice, not an error. It is shown before the form rather than after a
 * failed submit because a caregiver who cannot sign in should not have to guess
 * whether they typed the password wrong.
 */
export function NotConfiguredNotice() {
  const { t } = useTranslation()

  return (
    <p className="mb-6 max-w-[72ch] rounded-[6px] border border-brass bg-paperSunk px-3 py-3 text-[14px] leading-[1.55] text-ink">
      {t('auth.errors.notConfigured')}
    </p>
  )
}

/** The narrow single-column frame the auth screens sit in. */
export function AuthPage({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div data-mode="caregiver" className="min-h-screen bg-paper font-ui text-ink">
      <div className="mx-auto w-full max-w-[460px] px-6 py-16">
        <h1 className="mb-2 text-[28px] font-semibold tracking-[-0.01em]">{title}</h1>
        {subtitle ? (
          <p className="mb-8 max-w-[72ch] text-[14px] leading-[1.55] text-clay">{subtitle}</p>
        ) : null}
        {!isSupabaseConfigured() ? <NotConfiguredNotice /> : null}
        {children}
        {footer ? <div className="mt-8 border-t border-rule pt-5 text-[14px]">{footer}</div> : null}
      </div>
    </div>
  )
}
