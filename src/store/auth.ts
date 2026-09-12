import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { db } from '../lib/db/dexie'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { checkPassword } from '../lib/accounts'
import type { Profile } from '../types'

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
      },

      async refresh() {
        const current = get().profile
        if (!current) return
        const fresh = await db.profiles.get(current.id)
        if (fresh) set({ profile: fresh })
      },
    }),
    { name: 'gridsupply-auth', partialize: (s) => ({ profile: s.profile }) },
  ),
)
