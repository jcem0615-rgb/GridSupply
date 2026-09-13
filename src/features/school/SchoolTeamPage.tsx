import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/dexie'
import { put, remove } from '../../lib/db/repo'
import { nowIso, uuid, formatDateTime } from '../../lib/ids'
import { useAuth } from '../../store/auth'
import { can } from '../../lib/permissions'
import { Badge, Button, Card, Empty, Field, Input, Modal, cx } from '../../components/ui'
import { ResetPasswordDialog } from '../../components/ResetPasswordDialog'
import { MAX_SCHOOL_ADMINS, ROLE_LABEL, type AccountStatus, type Profile } from '../../types'

const TONE: Record<AccountStatus, 'ok' | 'warn' | 'bad'> = { active: 'ok', paused: 'warn', stopped: 'bad' }

const blankAdmin = (schoolId: string): Profile => ({
  id: uuid(),
  email: '',
  full_name: '',
  role: 'school_admin',
  school_id: schoolId,
  supplier_id: null,
  position_title: 'School Admin',
  status: 'active',
  created_at: nowIso(),
  password_hash: null,
  password_salt: null,
  must_change_password: false,
  password_updated_at: null,
  password_reset_by: null,
  password_reset_at: null,
})

/**
 * The Principal's own account book. A school may hold one admin, who can do
 * everything the Principal can in the workflow — but only the Principal can
 * create, edit or remove that account.
 */
export function SchoolTeamPage() {
  const me = useAuth((s) => s.profile)!
  const [editing, setEditing] = useState<Profile | null>(null)
  const [resetting, setResetting] = useState<Profile | null>(null)
  const [toDelete, setToDelete] = useState<Profile | null>(null)
  const [busy, setBusy] = useState(false)

  /* Only the admin. This page is for managing that account — the Principal
     looking at a row describing themselves is noise, and their own password is
     reached through the link below instead. */
  const team = useLiveQuery(
    async () =>
      (await db.profiles.where('school_id').equals(me.school_id!).toArray()).filter(
        (p) => p.role === 'school_admin',
      ),
    [me.school_id],
    [] as Profile[],
  )

  if (!can(me.role, 'school.staff')) {
    return (
      <Empty
        title="Only the Principal manages school accounts"
        hint="You can do everything else in the workflow — creating and removing accounts stays with the Principal."
      />
    )
  }

  const admins = team ?? []
  const atLimit = admins.length >= MAX_SCHOOL_ADMINS
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black tracking-tight text-ink-900">Admin account</h1>
          <p className="text-sm text-ink-400">
            Up to {MAX_SCHOOL_ADMINS} admin who works alongside you.
          </p>
        </div>
        <Button onClick={() => setEditing(blankAdmin(me.school_id!))} disabled={atLimit}>
          Add admin
        </Button>
      </div>

      {atLimit && (
        <p className="rounded-2xl bg-[rgba(214,158,58,0.18)] px-4 py-2.5 text-xs font-semibold text-[#6d4a0e]">
          This school already has its admin. Remove the existing one before adding another.
        </p>
      )}

      <Card title="Admin" subtitle="They see the same requests, orders and vouchers you do">
        {admins.length === 0 ? (
          <Empty
            title="No admin yet"
            hint="Add one and they can raise requests, approve them, receive deliveries and issue vouchers alongside you."
            action={<Button onClick={() => setEditing(blankAdmin(me.school_id!))}>Add admin</Button>}
          />
        ) : (
        <ul className="divide-y divide-[rgba(120,80,50,0.1)]">
          {admins.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink-900">
                  {p.full_name}
                  {p.must_change_password && (
                    <span className="ml-2 rounded-full bg-[rgba(214,158,58,0.22)] px-2 py-0.5 text-[10px] font-bold text-[#7a5310]">
                      must change password
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-ink-400">
                  <span className="font-semibold text-ink-600">{ROLE_LABEL[p.role]}</span> · {p.email}
                  {p.password_reset_at ? ` · password reset ${formatDateTime(p.password_reset_at)}` : ''}
                </p>
              </div>
              <Badge tone={TONE[p.status]}>{p.status}</Badge>
              {
                <div className="flex shrink-0 gap-1">
                  {(['active', 'paused', 'stopped'] as AccountStatus[]).map((st) => (
                    <button
                      key={st}
                      onClick={() => put('profiles', { ...p, status: st }, 'update')}
                      className={cx(
                        'rounded-lg px-2 py-1 text-[10px] font-bold uppercase transition',
                        p.status === st
                          ? 'bg-ink-900 text-white'
                          : 'border border-[rgba(120,80,50,0.2)] text-ink-400 hover:bg-[rgba(255,251,245,0.7)]',
                      )}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              }
              <div className="flex shrink-0 gap-1">
                <Button variant="secondary" onClick={() => setResetting(p)}>
                  Reset password
                </Button>
                <Button variant="ghost" onClick={() => setEditing(p)}>
                  Edit
                </Button>
                <Button variant="ghost" onClick={() => setToDelete(p)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
        )}
      </Card>

      <Card title="Your own account" subtitle={`${me.full_name} · ${ROLE_LABEL[me.role]}`}>
        <p className="text-xs text-ink-400">
          Changing your own password does not go through the reset above — that issues a temporary one for someone
          else. Set yours directly instead.
        </p>
        <Link to="/change-password" className="mt-3 inline-flex">
          <Button variant="secondary">Change my password</Button>
        </Link>
      </Card>

      <p className="text-xs text-ink-400">
        The admin can raise requests, approve them, receive deliveries and issue vouchers exactly as you can. Every
        action is stamped with who performed it, so the audit trail on each order shows whether it was you or the admin.
      </p>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing && exists(editing.id) ? 'Edit account' : 'Add school admin'}
      >
        {editing && (
          <div className="space-y-3">
            <Field label="Full name">
              <Input value={editing.full_name} onChange={(e) => setEditing({ ...editing, full_name: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={editing.email}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                placeholder="admin@school.deped.gov.ph"
              />
            </Field>
            <Field label="Position title">
              <Input
                value={editing.position_title ?? ''}
                onChange={(e) => setEditing({ ...editing, position_title: e.target.value })}
                placeholder="Administrative Officer"
              />
            </Field>
            <p className="text-[11px] text-ink-400">
              Role: <span className="font-semibold text-ink-600">{ROLE_LABEL[editing.role]}</span>
              {editing.role === 'school_admin' && ' — same workflow permissions as the Principal.'}
            </p>
            <Button full onClick={save} disabled={busy || !editing.full_name.trim() || !editing.email.trim()}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        )}
      </Modal>

      <ResetPasswordDialog target={resetting} onClose={() => setResetting(null)} />

      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title="Remove admin">
        {toDelete && (
          <>
            <p className="text-sm text-ink-600">
              Remove <span className="font-bold">{toDelete.full_name}</span>? Requests and vouchers they handled keep
              their name in the audit trail.
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
