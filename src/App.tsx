import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from './store/auth'
import { ROLE_PORTAL, isKnownRole, type Portal } from './types'
import { Layout } from './components/Layout'
import { LoginPage } from './features/auth/LoginPage'
import { SchoolDashboard } from './features/school/SchoolDashboard'
import { PRWizard } from './features/school/PRWizard'
import { SchoolOrders } from './features/school/SchoolOrders'
import { TemplateCustomizer } from './features/school/TemplateCustomizer'
import { SupplierDashboard } from './features/supplier/SupplierDashboard'
import { SupplierOrders } from './features/supplier/SupplierOrders'
import { CatalogPage } from './features/supplier/CatalogPage'
import { BillingPage } from './features/supplier/BillingPage'
import { OwnerDashboard } from './features/owner/OwnerDashboard'
import { AccountsPage } from './features/owner/AccountsPage'
import { PaymentsPage } from './features/owner/PaymentsPage'
import { BrandingPage } from './features/owner/BrandingPage'
import { OrderDetail } from './features/shared/OrderDetail'
import { seedIfEmpty } from './lib/db/seed'
import { startSyncLoop } from './lib/sync'

function Guard({ portal, children }: { portal: Portal; children: React.ReactNode }) {
  const profile = useAuth((s) => s.profile)
  const location = useLocation()
  if (!profile || !isKnownRole(profile.role)) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  const mine = ROLE_PORTAL[profile.role]
  if (mine !== portal) return <Navigate to={`/${mine}`} replace />
  return <Layout>{children}</Layout>
}

function AnyPortal({ children }: { children: React.ReactNode }) {
  const profile = useAuth((s) => s.profile)
  if (!profile || !isKnownRole(profile.role)) return <Navigate to="/login" replace />
  return <Layout>{children}</Layout>
}

export default function App() {
  const profile = useAuth((s) => s.profile)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void (async () => {
      await seedIfEmpty()
      /* A session persisted by an older build may name a retired role. */
      const current = useAuth.getState().profile
      if (current && !isKnownRole(current.role)) await useAuth.getState().signOut()
      startSyncLoop()
      setReady(true)
    })()
  }, [])

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-[#f6f7f6] text-sm font-semibold text-ink-400">
        Loading GridSupply…
      </div>
    )
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          profile && isKnownRole(profile.role) ? (
            <Navigate to={`/${ROLE_PORTAL[profile.role]}`} replace />
          ) : (
            <LoginPage />
          )
        }
      />

      <Route path="/school" element={<Guard portal="school"><SchoolDashboard /></Guard>} />
      <Route path="/school/orders" element={<Guard portal="school"><SchoolOrders /></Guard>} />
      <Route path="/school/new" element={<Guard portal="school"><PRWizard /></Guard>} />
      <Route path="/school/templates" element={<Guard portal="school"><TemplateCustomizer /></Guard>} />

      <Route path="/supplier" element={<Guard portal="supplier"><SupplierDashboard /></Guard>} />
      <Route path="/supplier/orders" element={<Guard portal="supplier"><SupplierOrders /></Guard>} />
      <Route path="/supplier/catalog" element={<Guard portal="supplier"><CatalogPage /></Guard>} />
      <Route path="/supplier/billing" element={<Guard portal="supplier"><BillingPage /></Guard>} />

      <Route path="/owner" element={<Guard portal="owner"><OwnerDashboard /></Guard>} />
      <Route path="/owner/accounts" element={<Guard portal="owner"><AccountsPage /></Guard>} />
      <Route path="/owner/payments" element={<Guard portal="owner"><PaymentsPage /></Guard>} />
      <Route path="/owner/branding" element={<Guard portal="owner"><BrandingPage /></Guard>} />

      <Route path="/orders/:id" element={<AnyPortal><OrderDetail /></AnyPortal>} />

      <Route
        path="*"
        element={
          <Navigate to={profile && isKnownRole(profile.role) ? `/${ROLE_PORTAL[profile.role]}` : '/login'} replace />
        }
      />
    </Routes>
  )
}
