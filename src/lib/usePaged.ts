import { useEffect, useMemo, useState } from 'react'

export interface Paged<T> {
  page: number
  setPage: (p: number) => void
  pageCount: number
  rows: T[]
  from: number
  to: number
  total: number
}

/**
 * Client-side pagination for lists that grow without bound — a supplier's
 * catalog, a school's order history.
 *
 * `resetKey` should carry whatever narrows the list (a search term, a status
 * filter). Without it, typing a search while on page 4 leaves the user staring
 * at page 4 of the new results, which reads as "my search returned nothing".
 */
export function usePaged<T>(items: T[], pageSize: number, resetKey?: unknown): Paged<T> {
  const [page, setPage] = useState(1)
  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  useEffect(() => {
    setPage(1)
  }, [resetKey])

  /* The list can shrink underneath us — a deleted row, an arriving sync. */
  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const current = Math.min(page, pageCount)
  const rows = useMemo(
    () => items.slice((current - 1) * pageSize, current * pageSize),
    [items, current, pageSize],
  )

  return {
    page: current,
    setPage,
    pageCount,
    rows,
    from: total === 0 ? 0 : (current - 1) * pageSize + 1,
    to: Math.min(current * pageSize, total),
    total,
  }
}
