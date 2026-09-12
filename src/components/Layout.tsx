import { NavLink, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { ReactNode } from 'react'
import { useAuth } from '../store/auth'
import { ROLE_LABEL, ROLE_PORTAL, type Portal } from '../types'
import { db } from '../lib/db/dexie'
import { cx } from './ui'
import { OfflineBar } from './OfflineBar'
import { InstallPrompt } from './InstallPrompt'

interface NavItem {
  to: string
  label: string
  icon: ReactNode
}

const icon = (d: string) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

const I = {
  home: icon('M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5'),
  doc: icon('M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zm0 0v5h5M9 13h6M9 17h4'),
  box: icon('M3 8 12 3l9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8'),
  card: icon('M2 7h20v11H2zM2 11h20'),
  users: icon('M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-2a4 4 0 0 0-3-3.9'),
  brush: icon('M9.5 14.5 3 21M14 3l7 7-7 4-4-4z'),
  layout: icon('M3 4h18v16H3zM3 10h18M9 10v10'),
}

const NAV: Record<Portal, NavItem[]> = {
  school: [
    { to: '/school', label: 'Dashboard', icon: I.home },
    { to: '/school/orders', label: 'Requests', icon: I.doc },
    { to: '/school/new', label: 'New PR', icon: I.box },
    { to: '/school/templates', label: 'Templates', icon: I.layout },
  ],
  supplier: [
    { to: '/supplier', label: 'Dashboard', icon: I.home },
    { to: '/supplier/orders', label: 'Orders', icon: I.doc },
    { to: '/supplier/catalog', label: 'Catalog', icon: I.box },
    { to: '/supplier/billing', label: 'Billing', icon: I.card },
    { to: '/supplier/team', label: 'Team', icon: I.users },
  ],
  owner: [
    { to: '/owner', label: 'Dashboard', icon: I.home },
    { to: '/owner/accounts', label: 'Accounts', icon: I.users },
    { to: '/owner/payments', label: 'Payments', icon: I.card },
    { to: '/owner/branding', label: 'Branding', icon: I.brush },
  ],
}

const PORTAL_LABEL: Record<Portal, string> = {
  school: 'School Portal',
  supplier: 'Supplier Portal',
  owner: 'Owner Portal',
}

export function Layout({ children }: { children: ReactNode }) {
  const profile = useAuth((s) => s.profile)
  const signOut = useAuth((s) => s.signOut)
  const navigate = useNavigate()
  const portal = profile ? ROLE_PORTAL[profile.role] : 'school'
  const items = NAV[portal]

  const tenant = useLiveQuery(async () => {
    if (!profile) return null
    if (profile.school_id) return (await db.schools.get(profile.school_id))?.name ?? null
    if (profile.supplier_id) return (await db.suppliers.get(profile.supplier_id))?.name ?? null
    return 'GridSupply Platform'
  }, [profile?.id])

  return (
    <div className="flex min-h-full flex-col">
      <div className="aurora no-print" aria-hidden />
      <div className="grain no-print" aria-hidden />

      <header className="no-print sticky top-0 z-30 border-b border-[rgba(120,80,50,0.12)] bg-[rgba(255,251,245,0.7)] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3">
          <img
            src="/icons/logo-mark.svg"
            alt="GridSupply"
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 drop-shadow-[0_4px_10px_rgba(20,60,99,0.25)]"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold leading-tight text-ink-900">{tenant ?? 'GridSupply'}</p>
            <p className="truncate text-[11px] text-ink-400">
              {PORTAL_LABEL[portal]} · {profile ? ROLE_LABEL[profile.role] : ''}
            </p>
          </div>
          <nav className="hidden items-center gap-1 md:flex">
            {items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.to.split('/').length === 2}
                className={({ isActive }) =>
                  cx(
                    'rounded-xl px-3 py-2 text-sm font-semibold transition',
                    isActive
                      ? 'bg-[rgba(180,89,58,0.13)] text-brand shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]'
                      : 'text-ink-400 hover:bg-[rgba(255,251,245,0.6)] hover:text-ink-600',
                  )
                }
              >
                {it.label}
              </NavLink>
            ))}
          </nav>
          <button
            onClick={async () => {
              await signOut()
              navigate('/login')
            }}
            className="rounded-xl px-2.5 py-2 text-xs font-semibold text-ink-400 transition hover:bg-[rgba(255,251,245,0.7)] hover:text-ink-600"
          >
            Sign out
          </button>
        </div>
      </header>

      <OfflineBar />

      <InstallPrompt />

      <main className="relative mx-auto w-full max-w-6xl flex-1 px-4 py-5 pb-32 md:pb-10">{children}</main>

      <nav className="no-print fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(0.6rem+var(--safe-bottom))] md:hidden">
        <div className="glass glass-sheen mx-auto flex max-w-lg overflow-hidden rounded-2xl">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.to.split('/').length === 2}
              className={({ isActive }) =>
                cx(
                  'flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition',
                  isActive ? 'bg-[rgba(180,89,58,0.12)] text-brand' : 'text-ink-400',
                )
              }
            >
              {it.icon}
              {it.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
