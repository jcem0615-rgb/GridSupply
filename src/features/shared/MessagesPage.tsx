import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '../../store/auth'
import { loadThreads, type ThreadSummary } from '../../lib/threads'
import { formatDateTime } from '../../lib/ids'
import { Card, Empty, StatusPill, cx } from '../../components/ui'
import { Pager } from '../../components/Pager'
import { usePaged } from '../../lib/usePaged'

/** One row per order thread, so the conversation is reachable without first
 *  knowing which order it belongs to. */
export function MessagesPage() {
  const profile = useAuth((s) => s.profile)!
  const [onlyUnread, setOnlyUnread] = useState(false)

  const threads = useLiveQuery(() => loadThreads(profile), [profile.id], [] as ThreadSummary[])
  const all = threads ?? []
  const rows = onlyUnread ? all.filter((t) => t.unread > 0) : all
  const paged = usePaged(rows, 12, String(onlyUnread))
  const unreadTotal = all.reduce((n, t) => n + t.unread, 0)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-black tracking-tight text-ink-900">Messages</h1>
        <p className="text-sm text-ink-400">
          One conversation per order, shared with {profile.supplier_id ? 'the school' : 'your supplier'}.
        </p>
      </div>

      <div className="flex gap-2">
        {[
          ['all', `All (${all.length})`],
          ['unread', `Unread (${unreadTotal})`],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setOnlyUnread(key === 'unread')}
            className={cx(
              'rounded-full px-3.5 py-1.5 text-xs font-bold transition',
              (key === 'unread') === onlyUnread
                ? 'bg-gradient-to-b from-[#c2643f] to-[#a24e33] text-white shadow-[0_6px_16px_-8px_rgba(140,66,38,0.8)]'
                : 'glass-quiet text-ink-600',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <Empty
          title={onlyUnread ? 'Nothing unread' : 'No conversations yet'}
          hint={
            onlyUnread
              ? 'Threads with new messages from the other party appear here.'
              : 'Every order has its own thread. Open an order and use the Thread tab to start talking.'
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-[rgba(120,80,50,0.1)]">
            {paged.rows.map((t) => (
              <li key={t.order.id}>
                <Link
                  to={`/orders/${t.order.id}?tab=thread`}
                  className="flex items-start gap-3 py-3 transition hover:bg-[rgba(255,251,245,0.5)]"
                >
                  <span
                    className={cx(
                      'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
                      t.unread > 0 ? 'bg-brand' : 'bg-transparent',
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className={cx('truncate text-sm', t.unread > 0 ? 'font-black text-ink-900' : 'font-bold text-ink-900')}>
                        {t.order.po_number ?? t.order.pr_number}
                      </span>
                      <StatusPill status={t.order.status} />
                    </p>
                    <p className="truncate text-xs text-ink-400">{t.counterpart}</p>
                    <p className={cx('mt-0.5 truncate text-xs', t.unread > 0 ? 'text-ink-700' : 'text-ink-400')}>
                      {t.lastMessage
                        ? `${t.lastMessage.kind === 'system' ? '' : `${t.lastMessage.author_name}: `}${t.lastMessage.body}`
                        : 'No messages yet'}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] text-ink-400">
                      {t.lastMessage ? formatDateTime(t.lastMessage.created_at) : ''}
                    </p>
                    {t.unread > 0 && (
                      <span className="mt-1 inline-flex min-w-5 justify-center rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-black text-white">
                        {t.unread}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <Pager paged={paged} unit="threads" />
        </Card>
      )}
    </div>
  )
}
