import { useId, useState, type InputHTMLAttributes } from 'react'
import { cx } from './ui'

const Eye = ({ off }: { off: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
    {off && <path d="M3 3l18 18" />}
  </svg>
)

/**
 * Password field with a reveal toggle.
 *
 * The toggle is type="button" so it never submits the form, and it swaps only
 * the input's `type` — the value and cursor position are untouched, so revealing
 * mid-entry does not disturb what has been typed.
 */
export function PasswordInput({
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [shown, setShown] = useState(false)
  const id = useId()

  return (
    <div className="relative">
      <input
        {...props}
        id={props.id ?? id}
        type={shown ? 'text' : 'password'}
        className={cx(
          'w-full rounded-xl border border-[rgba(120,80,50,0.18)] bg-[rgba(255,252,247,0.78)] py-2.5 pl-3.5 pr-12 text-sm text-ink-900 outline-none backdrop-blur-sm transition',
          'placeholder:text-ink-400/55 focus:border-brand/60 focus:bg-[rgba(255,252,247,0.95)] focus:ring-2 focus:ring-brand/15',
          className,
        )}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
        aria-controls={props.id ?? id}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-ink-400 transition hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <Eye off={shown} />
      </button>
    </div>
  )
}
