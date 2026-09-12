import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/dexie'
import { put, remove } from '../../lib/db/repo'
import { nowIso, uuid } from '../../lib/ids'
import { useAuth } from '../../store/auth'
import { can } from '../../lib/permissions'
import { Badge, Button, Card, Empty, Field, Input, Modal, Select, cx } from '../../components/ui'
import { ResetPasswordDialog } from '../../components/ResetPasswordDialog'
import { ROLE_LABEL, type AccountStatus, type Profile, type Role } from '../../types'

const TONE: Record<AccountStatus, 'ok' | 'warn' | 'bad'> = { active: 'ok', paused: 'warn', stopped: 'bad' }
const SUPPLIER_ROLES: Role[] = ['supplier_owner', 'supplier_employee']

const blank = (supplierId: string): Profile => ({
  id: uuid(),
  email: '',
  full_name: '',
  role: 'supplier_employee',
  school_id: null,
  supplier_id: supplierId,
  position_title: '',
  status: 'active',
  created_at: nowIso(),
  password_hash: null,
  password_salt: null,
  must_change_password: false,
  password_updated_at: null,
  password_reset_by: null,
  password_reset_at: null,
})

/** Supplier-side staff management: the owner's own account plus employees. */
export function TeamPage() {
  const me = useAuth((s) => s.profile)!
  const [editing, setEditing] = useState<Profile | null>(null)
  const [resetting, setResetting] = useState<Profile | null>(null)
  const [toDelete, setToDelete] = useState<Profile | null>(null)
  const [busy, setBusy] = useState(false)

  const team = useLiveQuery(
    () => db.profiles.where('supplier_id').equals(me.supplier_id!).toArray(),
    [me.supplier_id],
    [] as Profile[],
  )

  const isOwner = can(me.role, 'supplier.staff')
  const exists = (id: string) => (team ?? []).some((p) => p.id === id)

  const save = async () => {
    if (!editing) return
    setBusy(true)
    try {
      await put('profiles', editing, exists(editing.id) ? 'update' : 'insert')
      setEditing(null)
    } finally {
      setBusy(false)
    }
  }

  const setStatus = async (p: Profile, status: AccountStatus) => {
    await put('profiles', { ...p, status }, 'update')
  }

  if (!isOwner) {
    return (
      <Empty
        title="Not available for your role"
        hint="Only the supplier owner manages staff accounts and password resets."
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black tracking-tight text-ink-900">Team</h1>
          <p className="text-sm text-ink-400">Your staff accounts and their passwords</p>
        </div>
        <Button onClick={() => setEditing(blank(me.supplier_id!))}>Add employee</Button>
      </div>

      <Card>
        {(team ?? []).length === 0 ? (
          <Empty title="No staff yet" hint="Add an employee so they can accept orders and dispatch deliveries." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {(team ?? []).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink-900">
                    {p.full_name}
                    {p.id === me.id && <span className="ml-2 text-[10px] font-bold uppercase text-ink-400">you</span>}
                    {p.must_change_password && (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                        must change password
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-ink-400">
                    {ROLE_LABEL[p.role]} · {p.email}
                    {p.password_updated_at ? ` · password set` : ' · no password set'}
                  </p>
                </div>
                <Badge tone={TONE[p.status]}>{p.status}</Badge>
                <div className="flex shrink-0 gap-1">
                  {(['active', 'paused', 'stopped'] as AccountStatus[]).map((s) => (
                    <button
                      key={s}
                      disabled={p.id === me.id}
                      onClick={() => setStatus(p, s)}
                      className={cx(
                        'rounded-lg px-2 py-1 text-[10px] font-bold uppercase transition disabled:opacity-30',
                        p.status === s ? 'bg-ink-900 text-white' : 'border border-ink-200 text-ink-400 hover:bg-ink-50',
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="secondary" onClick={() => setResetting(p)}>
                    Reset password
                  </Button>
                  <Button variant="ghost" onClick={() => setEditing(p)}>
                    Edit
                  </Button>
                  {p.id !== me.id && (
                    <Button variant="ghost" onClick={() => setToDelete(p)}>
                      Delete
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-xs text-ink-400">
        You can reset passwords for your own staff only. School accounts are reset by the platform owner.
      </p>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing && exists(editing.id) ? 'Edit employee' : 'Add employee'}>
        {editing && (
          <div className="space-y-3">
            <Field label="Full name">
              <Input value={editing.full_name} onChange={(e) => setEditing({ ...editing, full_name: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
            </Field>
            <Field label="Role">
              <Select
                value={editing.role}
                disabled={editing.id === me.id}
                onChange={(e) => setEditing({ ...editing, role: e.target.value as Role })}
              >
                {SUPPLIER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Position title">
              <Input
                value={editing.position_title ?? ''}
                onChange={(e) => setEditing({ ...editing, position_title: e.target.value })}
                placeholder="Sales Associate"
              />
            </Field>
            <Button full onClick={save} disabled={busy || !editing.full_name.trim() || !editing.email.trim()}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        )}
      </Modal>

      <ResetPasswordDialog target={resetting} onClose={() => setResetting(null)} />

      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title="Remove employee">
        {toDelete && (
          <>
            <p className="text-sm text-ink-600">
              Remove <span className="font-bold">{toDelete.full_name}</span>? Orders they already acted on keep their
              name in the audit trail.
            </p>
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" full onClick={() => setToDelete(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                full
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    await remove('profiles', toDelete.id)
                    setToDelete(null)
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                Remove
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
