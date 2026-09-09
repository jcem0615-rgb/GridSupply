import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/dexie'
import { put } from '../../lib/db/repo'
import { resetAll } from '../../lib/db/seed'
import { formatDate } from '../../lib/ids'
import { Badge, Button, Card, Empty, Modal, cx } from '../../components/ui'
import { ROLE_LABEL, type AccountStatus } from '../../types'

const TONE: Record<AccountStatus, 'ok' | 'warn' | 'bad'> = {
  active: 'ok',
  paused: 'warn',
  stopped: 'bad',
}

export function AccountsPage() {
  const [tab, setTab] = useState<'schools' | 'suppliers' | 'people'>('schools')
  const [confirmReset, setConfirmReset] = useState(false)

  const schools = useLiveQuery(() => db.schools.toArray(), [], [])
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), [], [])
  const profiles = useLiveQuery(() => db.profiles.toArray(), [], [])

  const setStatus = async (table: 'schools' | 'suppliers' | 'profiles', id: string, status: AccountStatus) => {
    const row = await (table === 'schools'
      ? db.schools.get(id)
      : table === 'suppliers'
        ? db.suppliers.get(id)
        : db.profiles.get(id))
    if (!row) return
    await put(table, { ...row, status }, 'update')
  }

  const Controls = ({
    table,
    id,
    status,
  }: {
    table: 'schools' | 'suppliers' | 'profiles'
    id: string
    status: AccountStatus
  }) => (
    <div className="flex shrink-0 gap-1">
      {(['active', 'paused', 'stopped'] as AccountStatus[]).map((s) => (
        <button
          key={s}
          onClick={() => setStatus(table, id, s)}
          className={cx(
            'rounded-lg px-2 py-1 text-[10px] font-bold uppercase transition',
            status === s ? 'bg-ink-900 text-white' : 'border border-ink-200 text-ink-400 hover:bg-ink-50',
          )}
        >
          {s}
        </button>
      ))}
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-black tracking-tight text-ink-900">Accounts</h1>
        <Button variant="secondary" onClick={() => setConfirmReset(true)}>
          Reset demo data
        </Button>
      </div>

      <div className="flex gap-2">
        {(['schools', 'suppliers', 'people'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cx(
              'rounded-full px-3.5 py-1.5 text-xs font-bold capitalize transition',
              tab === t ? 'bg-brand text-white' : 'border border-ink-100 bg-white text-ink-400',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'schools' && (
        <Card>
          {(schools ?? []).length === 0 ? (
            <Empty title="No schools" />
          ) : (
            <ul className="divide-y divide-ink-100">
              {(schools ?? []).map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink-900">{s.name}</p>
                    <p className="truncate text-xs text-ink-400">
                      School ID {s.school_id_number} · {s.division} · joined {formatDate(s.created_at)}
                    </p>
                  </div>
                  <Badge tone={TONE[s.status]}>{s.status}</Badge>
                  <Controls table="schools" id={s.id} status={s.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'suppliers' && (
        <Card>
          <ul className="divide-y divide-ink-100">
            {(suppliers ?? []).map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink-900">{s.name}</p>
                  <p className="truncate text-xs text-ink-400">
                    TIN {s.tin} · paid until {s.subscription_paid_until ? formatDate(s.subscription_paid_until) : 'unpaid'}
                  </p>
                </div>
                <Badge tone={TONE[s.status]}>{s.status}</Badge>
                <Controls table="suppliers" id={s.id} status={s.status} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tab === 'people' && (
        <Card>
          <ul className="divide-y divide-ink-100">
            {(profiles ?? []).map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink-900">{p.full_name}</p>
                  <p className="truncate text-xs text-ink-400">
                    {ROLE_LABEL[p.role]} · {p.email}
                  </p>
                </div>
                <Badge tone={TONE[p.status]}>{p.status}</Badge>
                <Controls table="profiles" id={p.id} status={p.status} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="Reset demo data">
        <p className="text-sm text-ink-600">
          This clears every local table on this device — orders, messages, attachments and the outbox — then reloads the
          seed school, supplier and catalog.
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" onClick={() => setConfirmReset(false)} full>
            Cancel
          </Button>
          <Button
            variant="danger"
            full
            onClick={async () => {
              await resetAll()
              setConfirmReset(false)
            }}
          >
            Reset everything
          </Button>
        </div>
      </Modal>
    </div>
  )
}
