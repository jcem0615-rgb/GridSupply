import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/dexie'
import { useAuth } from '../../store/auth'
import { OrderList } from '../shared/OrderList'

export function SchoolOrders() {
  const profile = useAuth((s) => s.profile)!
  const orders = useLiveQuery(
    () => db.orders.where('school_id').equals(profile.school_id!).reverse().sortBy('created_at'),
    [profile.school_id],
    [],
  )
  return (
    <OrderList
      orders={orders ?? []}
      title="Purchase requests"
      emptyHint="Requests from this school appear here once a Purchase Request is drafted."
    />
  )
}
