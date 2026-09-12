import { useState } from 'react'
import { resetPassword, resetRefusalReason } from '../lib/accounts'
import { useAuth } from '../store/auth'
import { Button, Modal } from './ui'
import type { Profile } from '../types'

/**
 * Shows the generated password exactly once. Nothing stores the plaintext, so
 * closing this dialog without copying it means issuing another reset.
 */
export function ResetPasswordDialog({
  target,
  onClose,
}: {
  target: Profile | null
  onClose: () => void
}) {
  const actor = useAuth((s) => s.profile)!
  const [temp, setTemp] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const refusal = target ? resetRefusalReason(actor, target) : null

  const close = () => {
    setTemp(null)
    setError(null)
    setCopied(false)
    setEmailSent(false)
    onClose()
  }

  const run = async () => {
    if (!target) return
    setBusy(true)
    setError(null)
    try {
      const result = await resetPassword(actor, target.id)
      setTemp(result.tempPassword)
      setEmailSent(result.emailSent)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={!!target} onClose={close} title="Reset password">
      {target && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-bold text-ink-900">{target.full_name}</p>
            <p className="text-xs text-ink-400">{target.email}</p>
          </div>

          {refusal ? (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{refusal}</p>
          ) : temp ? (
            <>
              <div className="rounded-xl border border-ink-200 bg-ink-50 p-4 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Temporary password</p>
                <p className="mt-1 select-all font-mono text-xl font-black tracking-widest text-ink-900">{temp}</p>
              </div>
              <p className="text-xs text-ink-400">
                Shown once and stored only as a hash — if you lose it, issue another reset. {target.full_name.split(' ')[0]}{' '}
                will be asked to choose a new password on their next sign-in.
              </p>
              {emailSent && (
                <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                  A reset link was also emailed to {target.email}.
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  full
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(temp)
                      setCopied(true)
                    } catch {
                      /* Clipboard is blocked in some contexts; the text is selectable above. */
                      setCopied(false)
                    }
                  }}
                >
                  {copied ? 'Copied ✓' : 'Copy'}
                </Button>
                <Button full onClick={close}>
                  Done
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-600">
                This immediately invalidates the current password and issues a temporary one for you to hand over.
              </p>
              {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}
              <div className="flex gap-2">
                <Button variant="secondary" full onClick={close}>
                  Cancel
                </Button>
                <Button full onClick={run} disabled={busy}>
                  {busy ? 'Resetting…' : 'Reset password'}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
