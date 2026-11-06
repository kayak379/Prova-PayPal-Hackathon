'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import type { AuditEntry, Campaign, Folder, Order, Plan, Settings } from './types'
type Workspace = { settings: Settings; folders: Folder[]; campaigns: Campaign[]; version: number }
const empty: Workspace = { settings: { orgName: '', taxId: '', address: '' }, folders: [], campaigns: [], version: 0 }
type Store = Workspace & {
  hydrated: boolean
  refresh: () => Promise<void>
  flush: () => Promise<void>
  updateFinance: (id: string, patch: Partial<Campaign>, message?: string) => Promise<void>
  saveProposal: (id: string, request: string, proposal: Plan | null, attachment?: Campaign['requestAttachment']) => Promise<void>
  updateSettings: (settings: Settings) => Promise<void>
  addFolder: (name: string) => Promise<Folder>
  addCampaign: (draft: Omit<Campaign, 'id' | 'createdAt' | 'orders' | 'audit'>) => Promise<Campaign>
  addOrders: (id: string, orders: Order[], audit: Omit<AuditEntry, 'id'>[]) => Promise<void>
  updateCampaign: (id: string, changes: Pick<Campaign, 'name' | 'budget' | 'folderId'>) => Promise<void>
  deleteCampaign: (id: string) => Promise<void>
  logAudit: (id: string, entry: Omit<AuditEntry, 'id' | 'at'>) => Promise<void>
}
const StoreContext = createContext<Store | null>(null)
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const protectedPage = path.startsWith('/dashboard') || path.startsWith('/campaigns')
  const [data, setData] = useState(empty)
  const current = useRef(data)
  const [hydrated, setHydrated] = useState(false)
  const [error, setError] = useState('')
  const failed = useRef<null | (() => Promise<unknown>)>(null)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const accept = useCallback((value: Workspace) => { current.current = value; setData(value); setHydrated(true) }, [])
  const refresh = useCallback(async () => {
    const response = await fetch('/api/workspace', { cache: 'no-store' })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Workspace unavailable.')
    accept(result)
  }, [accept])
  useEffect(() => { if (protectedPage) void refresh().catch(e => setError(e.message)) }, [protectedPage, refresh])
  const mutate = useCallback((command: Record<string, unknown>): Promise<any> => {
    if ((command.kind === 'create' || command.kind === 'folder') && !command.entityId) command = { ...command, entityId: crypto.randomUUID() }
    const run = async () => {
      const c = current.current.campaigns.find(c => c.id === command.id)
      const response = await fetch('/api/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...command, version: c?.version ?? current.current.version }) })
      const result = await response.json()
      if (!response.ok) { await refresh().catch(() => {}); throw new Error(result.error || 'Save failed.') }
      accept(result.workspace); setError(''); failed.current = null
      return result.entity
    }
    const pending = queue.current.then(run)
    queue.current = pending.catch(e => { setError(e.message); failed.current = () => mutate(command) })
    return pending
  }, [accept, refresh])
  const flush = useCallback(async () => { await queue.current; if (failed.current) throw new Error('Save failed. Retry before continuing.') }, [])
  const saveProposal = useCallback(async (id: string, request: string, proposal: Plan | null, attachment?: Campaign['requestAttachment']) => {
    const c = current.current.campaigns.find(c => c.id === id)
    if (c && c.request === request && JSON.stringify(c.proposal ?? null) === JSON.stringify(proposal) && JSON.stringify(c.requestAttachment ?? null) === JSON.stringify(attachment ?? null)) return
    await mutate({ kind: 'proposal', id, request, proposal, attachment })
  }, [mutate])
  const value = useMemo<Store>(() => ({
    ...data, hydrated, refresh, flush, saveProposal,
    updateFinance: async (id, patch) => { await mutate({ kind: 'finance', id, patch }) },
    updateSettings: async settings => { await mutate({ kind: 'settings', settings }) },
    addFolder: name => mutate({ kind: 'folder', name }),
    addCampaign: draft => mutate({ kind: 'create', draft }),
    addOrders: async () => { await refresh() },
    updateCampaign: async (id, changes) => { await mutate({ kind: 'campaign', id, changes }) },
    deleteCampaign: async id => { await mutate({ kind: 'delete', id }) },
    logAudit: async (id, entry) => { await mutate({ kind: 'audit', id, entry }) },
  }), [data, hydrated, refresh, flush, saveProposal, mutate])
  return <StoreContext.Provider value={value}>
    {protectedPage && error && <div role="alert" className="bg-destructive/10 p-3 text-center text-sm">{error} <button className="underline" onClick={() => { void (failed.current ? failed.current() : refresh()).catch(e => setError(e.message)) }}>Retry</button></div>}
    {protectedPage && !hydrated ? <p className="p-10">Loading workspace…</p> : children}
  </StoreContext.Provider>
}
export function useStore() { const value = useContext(StoreContext); if (!value) throw new Error('useStore must be used within StoreProvider'); return value }
