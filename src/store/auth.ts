import { create } from 'zustand'
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware'
import { db } from '../lib/db/dexie'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { checkPassword } from '../lib/accounts'
import type { Profile } from '../types'

const AUTH_KEY = 'gridsupply-auth'
const REMEMBER_KEY = 'gridsupply-remember'

const safe = <T,>(fn: () => T, fallback: T): T => {
  try {
    return fn()
  } catch {
    /* Private mode and locked-down browsers throw on storage access. */
    return fallback
  }
}

/**
 * Absent means remembered. Existing installs already hold a session in
 * localStorage from before this setting existed, and treating the missing flag
 * as "do not remember" would silently sign all of them out.
 */
export const isRemembered = () => safe(() => localStorage.getItem(REMEMBER_KEY) !== '0', true)

export const setRemembered = (remember: boolean) =>
  safe(() => {
    if (remember) localStorage.removeItem(REMEMBER_KEY)
    else localStorage.setItem(REMEMBER_KEY, '0')
    return true
  }, false)

const stores = () => [
  safe(() => window.localStorage, null),
  safe(() => window.sessionStorage, null),
]

/**
 * "Remember me" decides which storage holds the session, so unchecking it on a
 * shared school workstation actually ends the session when the browser closes
 * rather than only hiding a checkbox. The backing store is chosen per call —
 * `createJSONStorage` resolves its getter once, which would freeze the choice
 * made at module load.
 */
const authStorage: PersistStorage<{ profile: Profile | null }> = {
  getItem: (name) => {
    const [local, session] = stores()
    const raw = safe(() => (isRemembered() ? local : session)?.getItem(name) ?? null, null)
    if (!raw) return null
    return safe(() => JSON.parse(raw) as StorageValue<{ profile: Profile | null }>, null)
  },
  setItem: (name, value) => {
    const [local, session] = stores()
    const remember = isRemembered()
    const target = remember ? local : session
    const other = remember ? session : local
    safe(() => target?.setItem(name, JSON.stringify(value)), undefined)
    /* Drop the copy in the other store, or a persistent session could outlive
       a later "do not remember" sign-in. */
    safe(() => other?.removeItem(name), undefined)
  },
  removeItem: (name) => {
    for (const store of stores()) safe(() => store?.removeItem(name), undefined)
  },
}

interface AuthState {
  profile: Profile | null
  loading: boolean
  signInAs: (profileId: string) => Promise<void>
  signInWithPassword: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      profile: null,
      loading: false,

      /** Demo-mode sign-in: pick one of the seeded role accounts. */
      async signInAs(profileId) {
        const profile = await db.profiles.get(profileId)
        set({ profile: profile ?? null })
      },

      /**
       * Real sign-in path. Only reachable when a Supabase project is wired;
       * the profile row (role + school_id/supplier_id) is the authorization
       * record, auth.uid() is only the identity.
       */
      async signInWithPassword(email, password) {
        if (!isSupabaseConfigured || !supabase) {
          const local = await db.profiles.where('email').equals(email).first()
          if (!local) return 'No account found for that email.'
          if (local.status === 'stopped') return 'This account has been stopped.'
          /* null means no password has ever been set (a seeded demo account),
             so the picker below is the only way in for it. */
          const ok = await checkPassword(local, password)
          if (ok === false) return 'Incorrect password.'
          if (ok === null) return 'No password set for this account — use the demo picker, or ask an admin to reset it.'
          set({ profile: local })
          return null
        }
        set({ loading: true })
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) {
          set({ loading: false })
          return error.message
        }
        const { data: prof, error: profErr } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single()
        set({ loading: false, profile: (prof as Profile) ?? null })
        return profErr ? profErr.message : null
      },

      async signOut() {
        if (isSupabaseConfigured && supabase) await supabase.auth.signOut()
        set({ profile: null })
        authStorage.removeItem(AUTH_KEY)
      },

      async refresh() {
        const current = get().profile
        if (!current) return
        const fresh = await db.profiles.get(current.id)
        if (fresh) set({ profile: fresh })
      },
    }),
    { name: AUTH_KEY, storage: authStorage, partialize: (s) => ({ profile: s.profile }) },
  ),
)
