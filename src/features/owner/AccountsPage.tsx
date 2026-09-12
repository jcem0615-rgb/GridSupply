import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/dexie'
import { put, remove } from '../../lib/db/repo'
import { resetAll } from '../../lib/db/seed'
import { formatDate, nowIso, uuid } from '../../lib/ids'
import { useAuth } from '../../store/auth'
import { Badge, Button, Card, Empty, Field, Input, Modal, Select, cx } from '../../components/ui'
import { ResetPasswordDialog } from '../../components/ResetPasswordDialog'
import { ROLE_LABEL, type AccountStatus, type Profile, type Role, type School, type Supplier } from '../../types'

type Tab = 'schools' | 'suppliers' | 'people'

const TONE: Record<AccountStatus, 'ok' | 'warn' | 'bad'> = {
  active: 'ok',
  paused: 'warn',
  stopped: 'bad',
}

const ROLES: Role[] = ['owner', 'principal', 'supplier_owner', 'supplier_employee']

const blankSchool = (): School => ({
  id: uuid(),
  name: '',
  school_id_number: '',
  division: '',
  district: '',
  address: '',
  tin: '',
  logo_url: null,
  hero_url: null,
  status: 'active',
  created_at: nowIso(),
})

const blankSupplier = (): Supplier => ({
  id: uuid(),
  name: '',
  owner_name: '',
  tin: '',
  address: '',
  contact_number: '',
  vat_registered: true,
  logo_url: null,
  hero_url: null,
  status: 'active',
  subscription_paid_until: null,
  created_at: nowIso(),
})

const blankProfile = (): Profile => ({
  id: uuid(),
  email: '',
  full_name: '',
  role: 'principal',
  school_id: null,
  supplier_id: null,
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

export function AccountsPage() {
  const me = useAuth((s) => s.profile)!
  const [tab, setTab] = useState<Tab>('schools')
  const [confirmReset, setConfirmReset] = useState(false)
  const [school, setSchool] = useState<School | null>(null)
  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [person, setPerson] = useState<Profile | null>(null)
  const [toDelete, setToDelete] = useState<{ table: Tab; id: string; name: string } | null>(null)
  const [resetting, setResetting] = useState<Profile | null>(null)
  const [busy, setBusy] = useState(false)

  const schools = useLiveQuery(() => db.schools.toArray(), [], [])
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), [], [])
  const profiles = useLiveQuery(() => db.profiles.toArray(), [], [])
  const orders = useLiveQuery(() => db.orders.toArray(), [], [])

  const exists = (list: { id: string }[] | undefined, id: string) => (list ?? []).some((x) => x.id === id)

  const setStatus = async (table: 'schools' | 'suppliers' | 'profiles', id: string, status: AccountStatus) => {
    const row =
      table === 'schools'
        ? await db.schools.get(id)
        : table === 'suppliers'
          ? await db.suppliers.get(id)
          : await db.profiles.get(id)
    if (!row) return
    await put(table, { ...row, status }, 'update')
  }

  const save = async (table: 'schools' | 'suppliers' | 'profiles', row: { id: string }, isNew: boolean) => {
    setBusy(true)
    try {
      await put(table, row, isNew ? 'insert' : 'update')
      setSchool(null)
      setSupplier(null)
      setPerson(null)
    } finally {
      setBusy(false)
    }
  }

  /**
   * A tenant with orders is never deleted — the orders carry the audit trail
   * for real money. Pausing or stopping the account is the reversible action
   * that achieves the same thing.
   */
  const blockers = (t: Tab, id: string) => {
    if (t === 'schools') {
      return {
        orders: (orders ?? []).filter((o) => o.school_id === id).length,
        people: (profiles ?? []).filter((p) => p.school_id === id).length,
      }
    }
    if (t === 'suppliers') {
      return {
        orders: (orders ?? []).filter((o) => o.supplier_id === id).length,
        people: (profiles ?? []).filter((p) => p.supplier_id === id).length,
      }
    }
    return { orders: 0, people: 0 }
  }

  const doDelete = async () => {
    if (!toDelete) return
    setBusy(true)
    try {
      if (toDelete.table === 'people') {
        await remove('profiles', toDelete.id)
      } else {
        const table = toDelete.table === 'schools' ? 'schools' : 'suppliers'
        /* Cascade the tenant's people; orders are already proven absent. */
        const key = toDelete.table === 'schools' ? 'school_id' : 'supplier_id'
        for (const p of (profiles ?? []).filter((x) => x[key as 'school_id'] === toDelete.id)) {
          await remove('profiles', p.id)
        }
        await remove(table, toDelete.id)
      }
      setToDelete(null)
    } finally {
      setBusy(false)
    }
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

  const RowActions = ({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) => (
    <div className="flex shrink-0 gap-1">
      <Button variant="secondary" onClick={onEdit}>
        Edit
      </Button>
      <Button variant="ghost" onClick={onDelete}>
        Delete
      </Button>
    </div>
  )

  const addLabel = { schools: 'Add school', suppliers: 'Add supplier', people: 'Add person' }[tab]
  const onAdd = () => {
    if (tab === 'schools') setSchool(blankSchool())
    else if (tab === 'suppliers') setSupplier(blankSupplier())
    else setPerson(blankProfile())
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black tracking-tight text-ink-900">Accounts</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setConfirmReset(true)}>
            Reset demo data
          </Button>
          <Button onClick={onAdd}>{addLabel}</Button>
        </div>
      </div>

      <div className="flex gap-2">
        {(['schools', 'suppliers', 'people'] as Tab[]).map((t) => (
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
            <Empty title="No schools" hint="Add a school to onboard it onto the platform." action={<Button onClick={onAdd}>Add school</Button>} />
          ) : (
            <ul className="divide-y divide-ink-100">
              {(schools ?? []).map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink-900">{s.name}</p>
                    <p className="truncate text-xs text-ink-400">
                      School ID {s.school_id_number || '—'} · {s.division || '—'} · joined {formatDate(s.created_at)}
                    </p>
                  </div>
                  <Badge tone={TONE[s.status]}>{s.status}</Badge>
                  <Controls table="schools" id={s.id} status={s.status} />
                  <RowActions
                    onEdit={() => setSchool(s)}
                    onDelete={() => setToDelete({ table: 'schools', id: s.id, name: s.name })}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'suppliers' && (
        <Card>
          {(suppliers ?? []).length === 0 ? (
            <Empty title="No suppliers" action={<Button onClick={onAdd}>Add supplier</Button>} />
          ) : (
            <ul className="divide-y divide-ink-100">
              {(suppliers ?? []).map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink-900">{s.name}</p>
                    <p className="truncate text-xs text-ink-400">
                      TIN {s.tin || '—'} · paid until{' '}
                      {s.subscription_paid_until ? formatDate(s.subscription_paid_until) : 'unpaid'}
                    </p>
                  </div>
                  <Badge tone={TONE[s.status]}>{s.status}</Badge>
                  <Controls table="suppliers" id={s.id} status={s.status} />
                  <RowActions
                    onEdit={() => setSupplier(s)}
                    onDelete={() => setToDelete({ table: 'suppliers', id: s.id, name: s.name })}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'people' && (
        <Card>
          <ul className="divide-y divide-ink-100">
            {(profiles ?? []).map((p) => (
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
                    {p.password_updated_at ? ' · password set' : ' · no password set'}
                  </p>
                </div>
                <Badge tone={TONE[p.status]}>{p.status}</Badge>
                <Controls table="profiles" id={p.id} status={p.status} />
                <Button variant="secondary" onClick={() => setResetting(p)}>
                  Reset password
                </Button>
                <RowActions
                  onEdit={() => setPerson(p)}
                  onDelete={() => setToDelete({ table: 'people', id: p.id, name: p.full_name })}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ResetPasswordDialog target={resetting} onClose={() => setResetting(null)} />

      {/* ---- School editor ---- */}
      <Modal open={!!school} onClose={() => setSchool(null)} title={exists(schools, school?.id ?? '') ? 'Edit school' : 'Add school'}>
        {school && (
          <div className="space-y-3">
            <Field label="School name">
              <Input value={school.name} onChange={(e) => setSchool({ ...school, name: e.target.value })} placeholder="Bagong Silang Elementary School" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="School ID">
                <Input value={school.school_id_number} onChange={(e) => setSchool({ ...school, school_id_number: e.target.value })} placeholder="104721" />
              </Field>
              <Field label="TIN">
                <Input value={school.tin} onChange={(e) => setSchool({ ...school, tin: e.target.value })} placeholder="000-123-456-00000" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Division">
                <Input value={school.division} onChange={(e) => setSchool({ ...school, division: e.target.value })} placeholder="Division of Caloocan City" />
              </Field>
              <Field label="District">
                <Input value={school.district} onChange={(e) => setSchool({ ...school, district: e.target.value })} placeholder="District III" />
              </Field>
            </div>
            <Field label="Address">
              <Input value={school.address} onChange={(e) => setSchool({ ...school, address: e.target.value })} />
            </Field>
            <Button full disabled={busy || !school.name.trim()} onClick={() => save('schools', school, !exists(schools, school.id))}>
              {busy ? 'Saving…' : 'Save school'}
            </Button>
          </div>
        )}
      </Modal>

      {/* ---- Supplier editor ---- */}
      <Modal open={!!supplier} onClose={() => setSupplier(null)} title={exists(suppliers, supplier?.id ?? '') ? 'Edit supplier' : 'Add supplier'}>
        {supplier && (
          <div className="space-y-3">
            <Field label="Business name">
              <Input value={supplier.name} onChange={(e) => setSupplier({ ...supplier, name: e.target.value })} placeholder="Northgate School Supplies Trading" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Proprietor">
                <Input value={supplier.owner_name} onChange={(e) => setSupplier({ ...supplier, owner_name: e.target.value })} />
              </Field>
              <Field label="TIN">
                <Input value={supplier.tin} onChange={(e) => setSupplier({ ...supplier, tin: e.target.value })} />
              </Field>
            </div>
            <Field label="Address">
              <Input value={supplier.address} onChange={(e) => setSupplier({ ...supplier, address: e.target.value })} />
            </Field>
            <Field label="Contact number">
              <Input value={supplier.contact_number} onChange={(e) => setSupplier({ ...supplier, contact_number: e.target.value })} placeholder="0917-555-0142" />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={supplier.vat_registered}
                onChange={(e) => setSupplier({ ...supplier, vat_registered: e.target.checked })}
                className="h-4 w-4 accent-[#0f3d2e]"
              />
              VAT-registered
            </label>
            <Button full disabled={busy || !supplier.name.trim()} onClick={() => save('suppliers', supplier, !exists(suppliers, supplier.id))}>
              {busy ? 'Saving…' : 'Save supplier'}
            </Button>
          </div>
        )}
      </Modal>

      {/* ---- Person editor ---- */}
      <Modal open={!!person} onClose={() => setPerson(null)} title={exists(profiles, person?.id ?? '') ? 'Edit person' : 'Add person'}>
        {person && (
          <div className="space-y-3">
            <Field label="Full name">
              <Input value={person.full_name} onChange={(e) => setPerson({ ...person, full_name: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input type="email" value={person.email} onChange={(e) => setPerson({ ...person, email: e.target.value })} />
            </Field>
            <Field label="Role">
              <Select
                value={person.role}
                onChange={(e) => {
                  /* A profile belongs to exactly one tenant — clear the other. */
                  const role = e.target.value as Role
                  setPerson({
                    ...person,
                    role,
                    school_id: role === 'principal' ? person.school_id : null,
                    supplier_id: role.startsWith('supplier') ? person.supplier_id : null,
                  })
                }}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </Field>
            {person.role === 'principal' && (
              <Field label="School">
                <Select value={person.school_id ?? ''} onChange={(e) => setPerson({ ...person, school_id: e.target.value || null })}>
                  <option value="">Select a school…</option>
                  {(schools ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {person.role.startsWith('supplier') && (
              <Field label="Supplier">
                <Select value={person.supplier_id ?? ''} onChange={(e) => setPerson({ ...person, supplier_id: e.target.value || null })}>
                  <option value="">Select a supplier…</option>
                  {(suppliers ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Position title">
              <Input value={person.position_title ?? ''} onChange={(e) => setPerson({ ...person, position_title: e.target.value })} placeholder="School Principal IV" />
            </Field>
            <Button
              full
              disabled={
                busy ||
                !person.full_name.trim() ||
                !person.email.trim() ||
                (person.role === 'principal' && !person.school_id) ||
                (person.role.startsWith('supplier') && !person.supplier_id)
              }
              onClick={() => save('profiles', person, !exists(profiles, person.id))}
            >
              {busy ? 'Saving…' : 'Save person'}
            </Button>
          </div>
        )}
      </Modal>

      {/* ---- Delete confirmation ---- */}
      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title="Delete account">
        {toDelete && (() => {
          const b = blockers(toDelete.table, toDelete.id)
          const isSelf = toDelete.table === 'people' && toDelete.id === me.id
          const blocked = b.orders > 0 || isSelf
          return (
            <>
              <p className="text-sm text-ink-600">
                Delete <span className="font-bold">{toDelete.name}</span>?
              </p>
              {isSelf && (
                <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                  You cannot delete the account you are signed in as.
                </p>
              )}
              {b.orders > 0 && (
                <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                  This account has {b.orders} transaction{b.orders === 1 ? '' : 's'} on record. Purchase orders and
                  vouchers are an audit trail for public funds, so the account cannot be deleted. Set it to{' '}
                  <b>stopped</b> instead — that revokes access and is reversible.
                </p>
              )}
              {!blocked && b.people > 0 && (
                <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                  {b.people} user account{b.people === 1 ? '' : 's'} belong to it and will be deleted too.
                </p>
              )}
              <div className="mt-4 flex gap-2">
                <Button variant="secondary" full onClick={() => setToDelete(null)}>
                  Cancel
                </Button>
                <Button variant="danger" full disabled={busy || blocked} onClick={doDelete}>
                  Delete
                </Button>
              </div>
            </>
          )
        })()}
      </Modal>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="Reset demo data">
        <p className="text-sm text-ink-600">
          This clears every local table on this device — orders, messages, attachments and the outbox — then reloads the
          seed school, supplier, catalog and payment methods.
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
