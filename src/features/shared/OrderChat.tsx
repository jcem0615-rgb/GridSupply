import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../lib/db/dexie'
import { useAuth } from '../../store/auth'
import { postMessage } from '../../lib/orders'
import { formatDateTime } from '../../lib/ids'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { fileToAttachment } from '../../lib/attachments'
import { ROLE_LABEL, type Message, type Role } from '../../types'
import { Button, cx } from '../../components/ui'

/**
 * One Realtime channel per order thread (docs/07). Falls back to the local
 * Dexie stream when no backend is configured, so the thread still works offline.
 */
export function OrderChat({ orderId }: { orderId: string }) {
  const profile = useAuth((s) => s.profile)!
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const messages = useLiveQuery(
    () => db.messages.where('order_id').equals(orderId).sortBy('created_at'),
    [orderId],
    [] as Message[],
  )
  const attachments = useLiveQuery(() => db.attachments.toArray(), [], [])

  useEffect(() => {
    const client = supabase
    if (!isSupabaseConfigured || !client) return
    const channel = client
      .channel(`order:${orderId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `order_id=eq.${orderId}` }, (payload) => {
        const row = payload.new as Message
        void db.messages.put(row)
      })
      .subscribe()
    return () => {
      void client.removeChannel(channel)
    }
  }, [orderId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'nearest' })
  }, [messages?.length])

  const send = async (attachmentId: string | null = null) => {
    const body = draft.trim()
    if (!body && !attachmentId) return
    setSending(true)
    try {
      await postMessage(orderId, profile, body || 'Sent an attachment', attachmentId)
      setDraft('')
    } finally {
      setSending(false)
    }
  }

  const attach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const a = await fileToAttachment(file, 'chat')
    await send(a.id)
    e.target.value = ''
  }

  return (
    /* Sized so the composer lands above the fold on a phone: opening Thread and
       seeing no way to type reads as a broken feature. dvh rather than vh so
       mobile browser chrome is accounted for. */
    <div className="flex h-[clamp(14rem,calc(100dvh-27rem),32rem)] flex-col">
      <div className="scroll-thin flex-1 space-y-3 overflow-y-auto pr-1">
        {(messages ?? []).length === 0 && (
          <p className="py-10 text-center text-xs text-ink-400">
            No messages yet. The school and the supplier both post here.
          </p>
        )}
        {(messages ?? []).map((m) => {
          if (m.kind === 'system') {
            return (
              <div key={m.id} className="flex justify-center">
                <p className="rounded-full bg-ink-100 px-3 py-1 text-center text-[11px] font-medium text-ink-400">
                  {m.body}
                </p>
              </div>
            )
          }
          const mine = m.author_id === profile.id
          const attachment = (attachments ?? []).find((a) => a.id === m.attachment_id)
          return (
            <div key={m.id} className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
              <div className={cx('max-w-[80%] rounded-2xl px-3.5 py-2', mine ? 'bg-brand text-white' : 'bg-ink-50 text-ink-900')}>
                {!mine && (
                  <p className="text-[10px] font-bold text-ink-400">
                    {m.author_name} · {ROLE_LABEL[m.author_role as Role] ?? m.author_role}
                  </p>
                )}
                {attachment && attachment.mime.startsWith('image/') && (
                  <img src={attachment.data_url} alt={attachment.name} className="mb-1.5 max-h-52 rounded-lg object-contain" />
                )}
                <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                <p className={cx('mt-0.5 text-[10px]', mine ? 'text-white/60' : 'text-ink-400')}>
                  {formatDateTime(m.created_at)}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div className="mt-3 flex items-end gap-2 border-t border-ink-100 pt-3">
        <button
          onClick={() => fileRef.current?.click()}
          className="rounded-xl border border-ink-200 p-2.5 text-ink-400 hover:bg-ink-50"
          aria-label="Attach a file"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M21.4 11.05 12.25 20.2a5.5 5.5 0 0 1-7.78-7.78l9.2-9.19a3.67 3.67 0 0 1 5.18 5.18l-9.2 9.2a1.83 1.83 0 0 1-2.59-2.6l8.5-8.49" />
          </svg>
        </button>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          rows={1}
          aria-label="Write a message" 
          placeholder="Write a message…"
          className="max-h-28 min-h-[2.75rem] flex-1 resize-none rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand"
        />
        <Button onClick={() => void send()} disabled={sending || !draft.trim()}>
          Send
        </Button>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={attach} className="hidden" />
      </div>
    </div>
  )
}
