import { useEffect, useState } from 'react'
import { Button } from './ui'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'gridsupply-install-dismissed'

/**
 * Chrome/Edge fire `beforeinstallprompt`; iOS Safari never does, so it gets
 * the manual Share → Add to Home Screen hint instead.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [iosHint, setIosHint] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (standalone) return

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)

    const ua = navigator.userAgent
    if (/iPad|iPhone|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua)) {
      setIosHint(true)
    }
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setDeferred(null)
    setIosHint(false)
  }

  if (!deferred && !iosHint) return null

  return (
    <div className="no-print fixed inset-x-3 bottom-20 z-40 rounded-2xl border border-ink-100 bg-white p-4 shadow-lg md:left-auto md:right-4 md:w-80">
      <p className="text-sm font-bold text-ink-900">Install GridSupply</p>
      <p className="mt-1 text-xs text-ink-400">
        {iosHint
          ? 'Tap the Share button, then “Add to Home Screen” to use GridSupply offline in the field.'
          : 'Add it to your device to capture deliveries and cheques without a signal.'}
      </p>
      <div className="mt-3 flex gap-2">
        {deferred && (
          <Button
            onClick={async () => {
              await deferred.prompt()
              await deferred.userChoice
              dismiss()
            }}
            full
          >
            Install
          </Button>
        )}
        <Button variant="ghost" onClick={dismiss} full={!deferred}>
          Not now
        </Button>
      </div>
    </div>
  )
}
