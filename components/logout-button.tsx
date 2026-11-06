'use client'
import { useState } from 'react'
import { LogOut, Loader2 } from 'lucide-react'
export function LogoutButton() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function signOut() {
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' })
      if (!response.ok) throw new Error('Could not sign out. Please try again.')
      window.location.assign('/login')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not sign out.'); setBusy(false) }
  }
  return <>
    <button type="button" disabled={busy} onClick={signOut} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
      {busy ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />} {busy ? 'Signing out…' : 'Sign out'}
    </button>
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
  </>
}
