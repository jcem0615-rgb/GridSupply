import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/dexie'
import { useAuth } from '../../store/auth'
import { ROLE_LABEL, ROLE_PORTAL, type Profile } from '../../types'
import { Button, Card, Field, Input, cx } from '../../components/ui'
import { isSupabaseConfigured } from '../../lib/supabase'

const PORTAL_TONE = {
  school: 'bg-brand-soft text-brand',
  supplier: 'bg-accent-soft text-accent',
  owner: 'bg-ink-100 text-ink-600',
} as const

export function LoginPage() {
  const navigate = useNavigate()
  const signInAs = useAuth((s) => s.signInAs)
  const signInWithPassword = useAuth((s) => s.signInWithPassword)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const profiles = useLiveQuery(() => db.profiles.toArray(), [], [] as Profile[])

  const go = async (p: Profile) => {
    await signInAs(p.id)
    navigate(`/${ROLE_PORTAL[p.role]}`)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const err = await signInWithPassword(email.trim(), password)
    setBusy(false)
    if (err) return setError(err)
    const profile = useAuth.getState().profile
    if (profile) navigate(`/${ROLE_PORTAL[profile.role]}`)
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-brand to-ink-700 px-4 py-10">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-8 text-center text-white">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-lg font-black backdrop-blur">
            GS
          </div>
          <h1 className="text-2xl font-black tracking-tight">GridSupply</h1>
          <p className="mt-1 text-sm text-white/70">
            DepEd school supply procurement — Purchase Request to BIR Form 2307.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Card title="Sign in" subtitle={isSupabaseConfigured ? 'Supabase Auth' : 'No backend configured — local accounts'}>
            <form onSubmit={submit} className="space-y-4">
              <Field label="Email">
                <Input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@school.deped.gov.ph"
                  required
                />
              </Field>
              <Field label="Password">
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isSupabaseConfigured ? '••••••••' : 'not checked in local mode'}
                />
              </Field>
              {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
              <Button type="submit" full disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </Card>

          <Card title="Demo accounts" subtitle="One tap to enter any role and portal — no password required">
            <ul className="space-y-2">
              {(profiles ?? []).map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => go(p)}
                    className="flex w-full items-center gap-3 rounded-xl border border-ink-100 px-3 py-2.5 text-left transition hover:border-brand hover:bg-brand-soft/40"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-bold text-ink-600">
                      {p.full_name
                        .split(' ')
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join('')}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink-900">{p.full_name}</span>
                      <span className="block truncate text-[11px] text-ink-400">{ROLE_LABEL[p.role]}</span>
                    </span>
                    {p.must_change_password ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                        reset
                      </span>
                    ) : (
                      <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', PORTAL_TONE[ROLE_PORTAL[p.role]])}>
                        {ROLE_PORTAL[p.role]}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}
