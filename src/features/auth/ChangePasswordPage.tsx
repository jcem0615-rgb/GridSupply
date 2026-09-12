import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../store/auth'
import { setOwnPassword } from '../../lib/accounts'
import { passwordProblem } from '../../lib/auth/password'
import { ROLE_PORTAL } from '../../types'
import { Button, Card, Field } from '../../components/ui'
import { PasswordInput } from '../../components/PasswordInput'

/** Reached when an admin reset flagged the account, or from a deliberate change. */
export function ChangePasswordPage() {
  const profile = useAuth((s) => s.profile)!
  const refresh = useAuth((s) => s.refresh)
  const navigate = useNavigate()
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const forced = profile.must_change_password

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (next !== confirm) return setError('The two passwords do not match.')
    const problem = passwordProblem(next)
    if (problem) return setError(problem)
    setBusy(true)
    const err = await setOwnPassword(profile, next)
    setBusy(false)
    if (err) return setError(err)
    await refresh()
    navigate(`/${ROLE_PORTAL[profile.role]}`)
  }

  return (
    <div className="relative min-h-full overflow-hidden bg-gradient-to-b from-[#3b2a20] via-[#5b3626] to-[#8a4530] px-4 py-12">
      <div className="aurora !z-0 opacity-80" aria-hidden />
      <div className="grain !z-0" aria-hidden />
      <div className="relative z-10 mx-auto w-full max-w-md">
        <div className="mb-6 text-center text-white">
          <h1 className="text-xl font-black tracking-tight">
            {forced ? 'Choose a new password' : 'Change your password'}
          </h1>
          <p className="mt-1 text-sm text-white/70">
            {forced
              ? 'Your password was reset by an administrator. Pick one only you know.'
              : `Signed in as ${profile.full_name}`}
          </p>
        </div>

        <Card>
          <form onSubmit={submit} className="space-y-4">
            <Field label="New password" hint="At least 8 characters, with a letter and a number.">
              <PasswordInput
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                required
              />
            </Field>
            <Field label="Confirm new password">
              <PasswordInput
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </Field>
            {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
            <Button type="submit" full disabled={busy}>
              {busy ? 'Saving…' : 'Set password'}
            </Button>
            {!forced && (
              <Button variant="ghost" full type="button" onClick={() => navigate(-1)}>
                Cancel
              </Button>
            )}
          </form>
        </Card>
      </div>
    </div>
  )
}
