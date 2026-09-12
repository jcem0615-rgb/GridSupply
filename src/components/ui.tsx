import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { STATUS_LABEL, type OrderStatus } from '../types'

const cx = (...v: (string | false | undefined | null)[]) => v.filter(Boolean).join(' ')

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'

const VARIANTS: Record<Variant, string> = {
  /* A warm two-stop gradient rather than a flat fill: against blurred glass a
     solid block reads as a hole punched through the surface. */
  primary:
    'text-white shadow-[0_8px_20px_-8px_rgba(140,66,38,0.75)] bg-gradient-to-b from-[#c2643f] to-[#a24e33] hover:from-[#b25a38] hover:to-[#94452c] active:from-[#a24e33] active:to-[#8a3f28]',
  secondary: 'glass text-ink-800 hover:bg-[rgba(255,251,245,0.9)]',
  ghost: 'bg-transparent text-ink-600 hover:bg-[rgba(255,251,245,0.6)]',
  danger:
    'text-white shadow-[0_8px_20px_-8px_rgba(150,40,40,0.7)] bg-gradient-to-b from-[#c14b43] to-[#a13a33] hover:from-[#b24239] hover:to-[#93322c]',
  accent:
    'text-white shadow-[0_8px_20px_-8px_rgba(150,90,20,0.7)] bg-gradient-to-b from-[#bd7527] to-[#9a5b19] hover:from-[#ad6a22] hover:to-[#8b5116]',
}

export function Button({
  variant = 'primary',
  className,
  full,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; full?: boolean }) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-1',
        'disabled:cursor-not-allowed disabled:opacity-40',
        VARIANTS[variant],
        full && 'w-full',
        className,
      )}
    />
  )
}

export function Card({
  children,
  className,
  title,
  subtitle,
  action,
}: {
  children?: ReactNode
  className?: string
  title?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
}) {
  return (
    <section className={cx('glass glass-sheen rounded-3xl', className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-[rgba(120,80,50,0.1)] px-5 py-4">
          <div>
            <h2 className="text-sm font-bold tracking-tight text-ink-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-ink-400">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}
    </label>
  )
}

const inputCx =
  'w-full rounded-xl border border-[rgba(120,80,50,0.18)] bg-[rgba(255,252,247,0.78)] px-3.5 py-2.5 text-sm text-ink-900 outline-none backdrop-blur-sm transition placeholder:text-ink-400/55 focus:border-brand/60 focus:bg-[rgba(255,252,247,0.95)] focus:ring-2 focus:ring-brand/15'

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...p} className={cx(inputCx, p.className)} />
)
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...p} className={cx(inputCx, 'min-h-24 resize-y', p.className)} />
)
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...p} className={cx(inputCx, 'appearance-none pr-9', p.className)} />
)

/* Hues pulled toward the warm end — a cold sky-blue chip on a terracotta
   ground is the fastest way to make a palette look accidental. */
const STATUS_TONE: Record<OrderStatus, string> = {
  draft: 'bg-[rgba(125,104,87,0.14)] text-ink-600 ring-1 ring-inset ring-[rgba(125,104,87,0.18)]',
  pr_submitted: 'bg-[rgba(214,158,58,0.2)] text-[#7a5310] ring-1 ring-inset ring-[rgba(214,158,58,0.32)]',
  pr_approved: 'bg-[rgba(122,148,84,0.22)] text-[#455a24] ring-1 ring-inset ring-[rgba(122,148,84,0.34)]',
  pr_rejected: 'bg-[rgba(184,64,54,0.16)] text-[#8e2f27] ring-1 ring-inset ring-[rgba(184,64,54,0.28)]',
  po_issued: 'bg-[rgba(180,89,58,0.18)] text-[#8a3f28] ring-1 ring-inset ring-[rgba(180,89,58,0.3)]',
  po_accepted: 'bg-[rgba(180,89,58,0.18)] text-[#8a3f28] ring-1 ring-inset ring-[rgba(180,89,58,0.3)]',
  po_declined: 'bg-[rgba(184,64,54,0.16)] text-[#8e2f27] ring-1 ring-inset ring-[rgba(184,64,54,0.28)]',
  dispatched: 'bg-[rgba(150,110,150,0.2)] text-[#5e3f63] ring-1 ring-inset ring-[rgba(150,110,150,0.3)]',
  delivered: 'bg-[rgba(96,146,136,0.22)] text-[#2f5750] ring-1 ring-inset ring-[rgba(96,146,136,0.34)]',
  dv_issued: 'bg-[rgba(168,101,31,0.2)] text-[#7c4713] ring-1 ring-inset ring-[rgba(168,101,31,0.32)]',
  paid: 'bg-gradient-to-b from-[#7a9454] to-[#5f7740] text-white shadow-[0_4px_12px_-6px_rgba(70,90,45,0.8)]',
  archived: 'bg-[rgba(125,104,87,0.2)] text-ink-600 ring-1 ring-inset ring-[rgba(125,104,87,0.22)]',
}

export const StatusPill = ({ status }: { status: OrderStatus }) => (
  <span className={cx('inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold', STATUS_TONE[status])}>
    {STATUS_LABEL[status]}
  </span>
)

export const Badge = ({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warn' | 'ok' | 'bad' }) => (
  <span
    className={cx(
      'inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold',
      tone === 'neutral' && 'bg-[rgba(125,104,87,0.14)] text-ink-600',
      tone === 'warn' && 'bg-[rgba(214,158,58,0.22)] text-[#7a5310]',
      tone === 'ok' && 'bg-[rgba(122,148,84,0.24)] text-[#455a24]',
      tone === 'bad' && 'bg-[rgba(184,64,54,0.16)] text-[#8e2f27]',
    )}
  >
    {children}
  </span>
)

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(42,31,24,0.32)] p-0 backdrop-blur-md sm:items-center sm:p-4">
      <div
        className={cx(
          'scroll-thin glass-strong glass-sheen max-h-[92vh] w-full overflow-y-auto rounded-t-3xl sm:rounded-3xl',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[rgba(120,80,50,0.12)] bg-[rgba(255,251,245,0.82)] px-5 py-4 backdrop-blur-xl">
          <h3 className="text-sm font-bold text-ink-900">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-400 transition hover:bg-[rgba(125,104,87,0.12)]" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>
        <div className="px-5 py-5 pb-[calc(1.25rem+var(--safe-bottom))]">{children}</div>
      </div>
    </div>
  )
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[rgba(120,80,50,0.24)] bg-[rgba(255,250,243,0.25)] px-6 py-12 text-center">
      <p className="text-sm font-semibold text-ink-600">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs text-ink-400">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'accent' }) {
  return (
    <div className="glass glass-sheen rounded-2xl p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <p className={cx('mt-1 text-xl font-bold tabular-nums', tone === 'accent' ? 'text-accent' : 'text-ink-900')}>
        {value}
      </p>
    </div>
  )
}

export { cx }
