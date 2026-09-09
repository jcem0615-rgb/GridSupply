import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/dexie'
import { useAuth } from '../../store/auth'
import { OrderList } from '../shared/OrderList'

export function SupplierOrders() {
  const profile = useAuth((s) => s.profile)!
  const orders = useLiveQuery(async () => {
    const rows = await db.orders.where('supplier_id').equals(profile.supplier_id!).reverse().sortBy('created_at')
    /* A supplier never sees a school's internal PR before the PO is issued. */
    return rows.filter((o) => !['draft', 'pr_submitted', 'pr_approved', 'pr_rejected'].includes(o.status))
  }, [profile.supplier_id], [])

  return (
    <OrderList
      orders={orders ?? []}
      title="Purchase orders"
      emptyHint="Purchase orders appear here the moment a school's BAC issues one to you."
    />
  )
}
