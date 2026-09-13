import { db } from './db/dexie'
import { put } from './db/repo'
import { nowIso } from './ids'
import { generateTempPassword, hashPassword, passwordProblem, randomSalt, verifyPassword } from './auth/password'
import { isSupabaseConfigured, supabase } from './supabase'
import type { Profile } from '../types'

/**
 * Who may reset whose password.
 *
 * The platform owner may reset anyone. A supplier owner may reset accounts
 * inside their own supplier and nothing else — a supplier resetting a school
 * Principal would hand a vendor the account that approves their own purchase
 * orders, so the tenant boundary is enforced here as well as in RLS.
 *
 * A Principal may reset accounts inside their own school. The School Admin
 * cannot reset anyone, including themselves through this path: an admin able to
 * reset the Principal could take the school's own account away from it.
 */
export function canResetPasswordFor(actor: Profile, target: Profile): boolean {
  if (actor.status !== 'active') return false
  if (actor.role === 'owner') return true
  if (actor.role === 'supplier_owner') {
    return !!actor.supplier_id && target.supplier_id === actor.supplier_id
  }
  if (actor.role === 'principal') {
    return !!actor.school_id && target.school_id === actor.school_id
  }
  return false
}

export function resetRefusalReason(actor: Profile, target: Profile): string | null {
  if (canResetPasswordFor(actor, target)) return null
  if (actor.role === 'supplier_owner' && target.school_id) {
    return 'A supplier cannot reset a school account. Ask the platform owner.'
  }
  if (actor.role === 'principal' && target.supplier_id) {
    return 'A school cannot reset a supplier account. Ask the platform owner.'
  }
  if (actor.role === 'school_admin') {
    return 'Only the Principal manages school accounts. Ask them to reset it.'
  }
  return 'You do not have permission to reset this account.'
}

export interface ResetResult {
  tempPassword: string
  emailSent: boolean
}

/**
 * Issues a temporary password. The plaintext is returned once for the admin to
 * hand over and is never persisted — only its digest is stored.
 */
export async function resetPassword(actor: Profile, targetId: string): Promise<ResetResult> {
  const target = await db.profiles.get(targetId)
  if (!target) throw new Error('Account not found')
  const refusal = resetRefusalReason(actor, target)
  if (refusal) throw new Error(refusal)

  const tempPassword = generateTempPassword()
  const salt = randomSalt()
  const password_hash = await hashPassword(tempPassword, salt)

  await put(
    'profiles',
    {
      ...target,
      password_hash,
      password_salt: salt,
      must_change_password: true,
      password_updated_at: nowIso(),
      password_reset_by: actor.id,
      password_reset_at: nowIso(),
    },
    'update',
  )

  /* With a real backend the credential lives in Supabase Auth, so also send the
     account holder a reset link they can use without the admin reading a
     password aloud. Setting another user's password outright needs the
     service_role key and belongs in an Edge Function (docs/09). */
  let emailSent = false
  if (isSupabaseConfigured && supabase && target.email) {
    const { error } = await supabase.auth.resetPasswordForEmail(target.email)
    emailSent = !error
  }

  return { tempPassword, emailSent }
}

/** Used by the forced-change screen and by a user changing their own password. */
export async function setOwnPassword(profile: Profile, newPassword: string): Promise<string | null> {
  const problem = passwordProblem(newPassword)
  if (problem) return problem

  const salt = randomSalt()
  const password_hash = await hashPassword(newPassword, salt)

  await put(
    'profiles',
    {
      ...profile,
      password_hash,
      password_salt: salt,
      must_change_password: false,
      password_updated_at: nowIso(),
    },
    'update',
  )

  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) return error.message
  }
  return null
}

/** Null when the account has no password set yet (demo accounts). */
export async function checkPassword(profile: Profile, password: string): Promise<boolean | null> {
  if (!profile.password_hash || !profile.password_salt) return null
  return verifyPassword(password, profile.password_salt, profile.password_hash)
}
