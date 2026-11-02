'use client'

import {
  createContext,
  useEffect,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'
import { uid, campaignSpent } from './format'
import type {
  AuditEntry,
  Campaign,
  Folder,
  Order,
  Plan,
  Settings,
} from './types'

const seedFolders: Folder[] = [
  { id: 'f_hurricane', name: 'Hurricane Season 2026' },
  { id: 'f_wildfire', name: 'Wildfire Response' },
  { id: 'f_archive', name: 'Archive' },
]

type Store = {
  updateFinance: (
    id: string,
    patch: Partial<
      Pick<
        Campaign,
        | 'funding'
        | 'refunds'
        | 'financeMessages'
        | 'verification'
        | 'financeOperations'
      >
    >,
    message?: string,
  ) => void
  hydrated: boolean
  saveProposal: (id: string, request: string, proposal: Plan | null) => void
  settings: Settings
  folders: Folder[]
  campaigns: Campaign[]
  updateSettings: (s: Settings) => void
  addFolder: (name: string) => Folder
  addCampaign: (
    c: Omit<Campaign, 'id' | 'createdAt' | 'orders' | 'audit'>,
  ) => Campaign
  addOrders: (
    campaignId: string,
    orders: Order[],
    audit: Omit<AuditEntry, 'id'>[],
  ) => void
  updateCampaign: (
    id: string,
    changes: Pick<Campaign, 'name' | 'budget' | 'folderId'>,
  ) => void
  logAudit: (campaignId: string, entry: Omit<AuditEntry, 'id' | 'at'>) => void
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false)
  const [storageError, setStorageError] = useState(false)
  const [settings, setSettings] = useState<Settings>({
    paypalEmail: 'sb-ck0ck53381775@personal.example.com',
    orgName: 'Harbor Relief Alliance',
    taxId: '84-2918374',
    address: '1200 Relief Way, Houston, TX 77002',
  })
  const [folders, setFolders] = useState<Folder[]>(seedFolders)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('prova-workspace-v1')
      if (raw) {
        const data = JSON.parse(raw)
        if (
          !Array.isArray(data.campaigns) ||
          !Array.isArray(data.folders) ||
          !data.settings
        )
          throw new Error('Invalid workspace')
        setSettings({
          paypalEmail: 'sb-ck0ck53381775@personal.example.com',
          ...data.settings,
        })
        setFolders(data.folders)
        setCampaigns(data.campaigns)
      }
    } catch {
      setStorageError(true)
    }
    setHydrated(true)
  }, [])
  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(
        'prova-workspace-v1',
        JSON.stringify({ settings, folders, campaigns }),
      )
    } catch {
      setStorageError(true)
    }
  }, [hydrated, settings, folders, campaigns])
  const saveProposal = useCallback(
    (id: string, request: string, proposal: Plan | null) => {
      setCampaigns((list) =>
        list.map((c) =>
          c.id === id
            ? {
                ...c,
                request,
                proposal,
                audit:
                  proposal?.snapshot &&
                  proposal.snapshot !== c.proposal?.snapshot
                    ? [
                        ...c.audit,
                        {
                          id: uid('a_'),
                          at: Date.now(),
                          actor: 'agent' as const,
                          message:
                            'Live product proposal generated from Channel3 offers',
                        },
                      ]
                    : c.audit,
              }
            : c,
        ),
      )
    },
    [],
  )

  const updateFinance = useCallback<Store['updateFinance']>(
    (id, patch, message) => {
      setCampaigns((list) =>
        list.map((c) =>
          c.id !== id
            ? c
            : {
                ...c,
                ...patch,
                audit: message
                  ? [
                      ...c.audit,
                      {
                        id: uid('a_'),
                        at: Date.now(),
                        actor: 'paypal' as const,
                        message,
                      },
                    ]
                  : c.audit,
              },
        ),
      )
    },
    [],
  )

  const addFolder = useCallback((name: string) => {
    const folder = { id: uid('f_'), name }
    setFolders((f) => [...f, folder])
    return folder
  }, [])

  const addCampaign = useCallback<Store['addCampaign']>((c) => {
    const now = Date.now()
    const campaign: Campaign = {
      ...c,
      id: uid('c_'),
      createdAt: now,
      orders: [],
      audit: [
        {
          id: uid('a_'),
          at: now,
          actor: 'user',
          message: `Campaign created with $${c.budget.toLocaleString()} budget`,
        },
      ],
    }
    setCampaigns((list) => [campaign, ...list])
    return campaign
  }, [])

  const addOrders = useCallback<Store['addOrders']>(
    (campaignId, orders, audit) => {
      setCampaigns((list) =>
        list.map((c) =>
          c.id === campaignId &&
          !orders.every((o) => c.orders.some((old) => old.id === o.id))
            ? {
                ...c,
                orders: [
                  ...orders.filter(
                    (o) => !c.orders.some((old) => old.id === o.id),
                  ),
                  ...c.orders,
                ],
                proposal: null,
                audit: [
                  ...c.audit,
                  ...audit.map((a) => ({ ...a, id: uid('a_') })),
                ],
              }
            : c,
        ),
      )
    },
    [],
  )

  const updateCampaign = useCallback<Store['updateCampaign']>((id, changes) => {
    setCampaigns((list) =>
      list.map((c) => {
        if (c.id !== id) return c
        const spent = campaignSpent(c)
        if (
          !changes.name.trim() ||
          !Number.isFinite(changes.budget) ||
          changes.budget <= 0 ||
          changes.budget < spent
        )
          return c
        return {
          ...c,
          ...changes,
          name: changes.name.trim(),
          audit: [
            ...c.audit,
            {
              id: uid('a_'),
              at: Date.now(),
              actor: 'user' as const,
              message: `Campaign settings updated · ${changes.name.trim()} · $${changes.budget.toLocaleString()} budget · folder ${changes.folderId}`,
            },
          ],
        }
      }),
    )
  }, [])

  const logAudit = useCallback<Store['logAudit']>((campaignId, entry) => {
    setCampaigns((list) =>
      list.map((c) =>
        c.id === campaignId
          ? {
              ...c,
              audit: [...c.audit, { ...entry, id: uid('a_'), at: Date.now() }],
            }
          : c,
      ),
    )
  }, [])

  const value = useMemo(
    () => ({
      updateFinance,
      hydrated,
      saveProposal,
      settings,
      folders,
      campaigns,
      updateSettings: setSettings,
      addFolder,
      addCampaign,
      addOrders,
      updateCampaign,
      logAudit,
    }),
    [
      updateFinance,
      hydrated,
      saveProposal,
      settings,
      folders,
      campaigns,
      addFolder,
      addCampaign,
      addOrders,
      updateCampaign,
      logAudit,
    ],
  )

  return (
    <StoreContext.Provider value={value}>
      {storageError && (
        <p role="alert" className="bg-destructive/10 p-3 text-center text-sm">
          Browser storage is unavailable or damaged. Changes may not survive
          refresh.
        </p>
      )}
      {hydrated ? children : <p className="p-10">Loading workspace…</p>}
    </StoreContext.Provider>
  )
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
