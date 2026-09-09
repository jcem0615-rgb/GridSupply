import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { STATUS_LABEL, type OrderStatus } from '../types'

const cx = (...v: (string | false | undefined | null)[]) => v.filter(Boolean).join(' ')

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-ink-700 active:bg-ink-800 shadow-sm',
  secondary: 'bg-white text-ink-800 border border-ink-200 hover:bg-ink-50',
  ghost: 'bg-transparent text-ink-600 hover:bg-ink-100',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  accent: 'bg-accent text-white hover:brightness-95 shadow-sm',
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
    <section className={cx('rounded-2xl border border-ink-100 bg-white shadow-sm', className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
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
  'w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 outline-none placeholder:text-ink-200 focus:border-brand focus:ring-2 focus:ring-brand/15'

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...p} className={cx(inputCx, p.className)} />
)
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...p} className={cx(inputCx, 'min-h-24 resize-y', p.className)} />
)
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...p} className={cx(inputCx, 'appearance-none pr-9', p.className)} />
)

const STATUS_TONE: Record<OrderStatus, string> = {
  draft: 'bg-ink-100 text-ink-600',
  pr_submitted: 'bg-amber-100 text-amber-800',
  pr_approved: 'bg-emerald-100 text-emerald-800',
  pr_rejected: 'bg-red-100 text-red-700',
  po_issued: 'bg-sky-100 text-sky-800',
  po_accepted: 'bg-sky-100 text-sky-800',
  po_declined: 'bg-red-100 text-red-700',
  dispatched: 'bg-indigo-100 text-indigo-800',
  delivered: 'bg-teal-100 text-teal-800',
  dv_issued: 'bg-violet-100 text-violet-800',
  paid: 'bg-emerald-600 text-white',
  archived: 'bg-ink-200 text-ink-600',
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
      tone === 'neutral' && 'bg-ink-100 text-ink-600',
      tone === 'warn' && 'bg-amber-100 text-amber-800',
      tone === 'ok' && 'bg-emerald-100 text-emerald-800',
      tone === 'bad' && 'bg-red-100 text-red-700',
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        className={cx(
          'scroll-thin max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-xl sm:rounded-2xl',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <header className="sticky top-0 flex items-center justify-between border-b border-ink-100 bg-white px-5 py-4">
          <h3 className="text-sm font-bold text-ink-900">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100" aria-label="Close">
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
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-200 bg-white/60 px-6 py-14 text-center">
      <p className="text-sm font-semibold text-ink-600">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs text-ink-400">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'accent' }) {
  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <p className={cx('mt-1 text-xl font-bold tabular-nums', tone === 'accent' ? 'text-accent' : 'text-ink-900')}>
        {value}
      </p>
    </div>
  )
}

export { cx }
