'use client'
export function LogoutButton() {
  return <button className="text-sm underline" onClick={async () => {
    const response = await fetch('/api/auth/logout', { method: 'POST' })
    if (response.ok) window.location.assign('/login')
  }}>Sign out</button>
}
