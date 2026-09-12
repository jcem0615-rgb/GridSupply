import { cx } from './ui'
import type { Paged } from '../lib/usePaged'

/** Renders nothing for a single page — no chrome until it earns its place. */
export function Pager<T>({ paged, unit = 'items' }: { paged: Paged<T>; unit?: string }) {
  const { page, setPage, pageCount, from, to, total } = paged
  if (pageCount <= 1) return null

  const go = (p: number) => setPage(Math.min(pageCount, Math.max(1, p)))

  /* A compact window around the current page so 40 pages don't wrap the row. */
  const windowed: number[] = []
  const start = Math.max(1, Math.min(page - 1, pageCount - 2))
  for (let p = start; p < start + 3 && p <= pageCount; p++) windowed.push(p)

  const btn = 'rounded-lg px-2.5 py-1.5 text-xs font-bold transition disabled:opacity-30'

  return (
    <nav className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-3" aria-label="Pagination">
      <p className="text-[11px] text-ink-400">
        Showing {from}–{to} of {total} {unit}
      </p>
      <div className="flex items-center gap-1">
        <button className={cx(btn, 'border border-ink-200 text-ink-600')} onClick={() => go(page - 1)} disabled={page === 1}>
          Previous
        </button>
        {start > 1 && <span className="px-1 text-xs text-ink-400">…</span>}
        {windowed.map((p) => (
          <button
            key={p}
            onClick={() => go(p)}
            aria-current={p === page ? 'page' : undefined}
            className={cx(btn, p === page ? 'bg-brand text-white' : 'border border-ink-200 text-ink-600')}
          >
            {p}
          </button>
        ))}
        {start + 3 <= pageCount && <span className="px-1 text-xs text-ink-400">…</span>}
        <button
          className={cx(btn, 'border border-ink-200 text-ink-600')}
          onClick={() => go(page + 1)}
          disabled={page === pageCount}
        >
          Next
        </button>
      </div>
    </nav>
  )
}
