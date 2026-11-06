'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import type { Campaign, CampaignDraft, FinanceDraft, Folder, Plan, Settings, Workspace, WorkspaceCommand } from './types'

const emptyWorkspace: Workspace = {
  settings: { orgName: '', taxId: '', address: '' },
  folders: [],
  campaigns: [],
  version: 0,
}

type Store = Workspace & {
  hydrated: boolean
  refresh: () => Promise<void>
  flush: () => Promise<void>
  saveFinanceDraft: (id: string, patch: FinanceDraft) => Promise<void>
  saveProposal: (id: string, request: string, proposal: Plan | null, attachment?: Campaign['requestAttachment']) => Promise<void>
  updateSettings: (settings: Settings) => Promise<void>
  addFolder: (name: string) => Promise<Folder>
  addCampaign: (draft: CampaignDraft) => Promise<Campaign>
  updateCampaign: (id: string, changes: Pick<Campaign, 'name' | 'budget' | 'folderId'>) => Promise<void>
  deleteCampaign: (id: string) => Promise<void>
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const protectedPage = pathname.startsWith('/dashboard') || pathname.startsWith('/campaigns')
  const [data, setData] = useState(emptyWorkspace)
  const current = useRef(data)
  const [hydrated, setHydrated] = useState(false)
  const [error, setError] = useState('')
  const failed = useRef<null | (() => Promise<unknown>)>(null)
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  const accept = useCallback((workspace: Workspace) => {
    current.current = workspace
    setData(workspace)
    setHydrated(true)
  }, [])

  const refresh = useCallback(async () => {
    const response = await fetch('/api/workspace', { cache: 'no-store' })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Workspace unavailable.')
    accept(result)
  }, [accept])

  useEffect(() => {
    if (protectedPage) void refresh().catch(error => setError(error.message))
  }, [protectedPage, refresh])

  const mutate = useCallback(<T = void,>(command: WorkspaceCommand): Promise<T> => {
    if ((command.kind === 'create' || command.kind === 'folder') && !command.entityId) {
      command = { ...command, entityId: crypto.randomUUID() }
    }

    const run = async (): Promise<T> => {
      const campaign = 'id' in command
        ? current.current.campaigns.find(campaign => campaign.id === command.id)
        : undefined
      const response = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...command,
          version: campaign?.version ?? current.current.version,
        }),
      })
      const result = await response.json()
      if (!response.ok) {
        await refresh().catch(() => {})
        throw new Error(result.error || 'Save failed.')
      }
      accept(result.workspace)
      setError('')
      failed.current = null
      return result.entity
    }

    // Serialize saves so each command uses the version returned by the previous one.
    const pending = queue.current.then(run)
    queue.current = pending.catch(error => {
      setError(error.message)
      failed.current = () => mutate(command)
    })
    return pending
  }, [accept, refresh])

  const flush = useCallback(async () => {
    await queue.current
    if (failed.current) throw new Error('Save failed. Retry before continuing.')
  }, [])

  const saveProposal = useCallback(async (
    id: string,
    request: string,
    proposal: Plan | null,
    attachment?: Campaign['requestAttachment'],
  ) => {
    const campaign = current.current.campaigns.find(campaign => campaign.id === id)
    if (
      campaign && campaign.request === request &&
      JSON.stringify(campaign.proposal ?? null) === JSON.stringify(proposal) &&
      JSON.stringify(campaign.requestAttachment ?? null) === JSON.stringify(attachment ?? null)
    ) return
    await mutate({ kind: 'proposal', id, request, proposal, attachment })
  }, [mutate])

  const value = useMemo<Store>(() => ({
    ...data,
    hydrated,
    refresh,
    flush,
    saveProposal,
    saveFinanceDraft: (id, patch) => mutate({ kind: 'finance', id, patch }),
    updateSettings: settings => mutate({ kind: 'settings', settings }),
    addFolder: name => mutate<Folder>({ kind: 'folder', name }),
    addCampaign: draft => mutate<Campaign>({ kind: 'create', draft }),
    updateCampaign: (id, changes) => mutate({ kind: 'campaign', id, changes }),
    deleteCampaign: id => mutate({ kind: 'delete', id }),
  }), [data, hydrated, refresh, flush, saveProposal, mutate])

  function retrySave() {
    void (failed.current ? failed.current() : refresh()).catch(error => setError(error.message))
  }

  return (
    <StoreContext.Provider value={value}>
      {protectedPage && error && (
        <div role="alert" className="bg-destructive/10 p-3 text-center text-sm">
          {error} <button className="underline" onClick={retrySave}>Retry</button>
        </div>
      )}
      {protectedPage && !hydrated ? <p className="p-10">Loading workspace…</p> : children}
    </StoreContext.Provider>
  )
}

export function useStore() {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore must be used within StoreProvider')
  return store
}
