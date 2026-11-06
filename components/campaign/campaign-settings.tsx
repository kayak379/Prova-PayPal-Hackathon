'use client'

import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Label, inputClass, Pressable } from '../kit'
import { campaignSpent, usd } from '@/lib/format'
import { useStore } from '@/lib/store'
import type { Campaign } from '@/lib/types'

export function CampaignSettings({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  const { folders, updateCampaign, deleteCampaign } = useStore()
  const [name, setName] = useState(campaign.name)
  const [budget, setBudget] = useState(String(campaign.budget))
  const [folderId, setFolderId] = useState(campaign.folderId)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  async function removeCampaign() {
    if (busy) return
    setBusy(true); setError('')
    try {
      await deleteCampaign(campaign.id)
      onClose()
      router.replace('/dashboard')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not delete campaign.'); setBusy(false) }
  }
  const spent = campaignSpent(campaign)

  async function saveCampaign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const amount = Number(budget)
    if (!name.trim()) {
      setError('Enter a campaign name.')
      return
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount < spent) {
      setError(`Budget must be greater than zero and at least ${usd(spent)} already deployed.`)
      return
    }
    if (!folders.some((folder) => folder.id === folderId)) {
      setError('Choose a folder.')
      return
    }
    setBusy(true)
    try { await updateCampaign(campaign.id, { name: name.trim(), budget: amount, folderId }) } catch { setBusy(false); return }
    onClose()
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={saveCampaign}>
      <div>
        <Label htmlFor="campaign-name">Campaign name</Label>
        <input
          autoFocus
          id="campaign-name"
          required
          maxLength={160}
          className={inputClass}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="campaign-budget">Budget (USD)</Label>
        <input
          id="campaign-budget"
          type="number"
          required
          min={Math.max(0.01, spent)}
          step="0.01"
          className={inputClass}
          value={budget}
          onChange={(event) => setBudget(event.target.value)}
        />
        <p className="mt-2 text-xs text-muted-foreground">Already deployed: {usd(spent)}</p>
      </div>
      <div>
        <Label htmlFor="campaign-folder">Folder</Label>
        <select
          id="campaign-folder"
          required
          className={inputClass}
          value={folderId}
          onChange={(event) => setFolderId(event.target.value)}
        >
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>{folder.name}</option>
          ))}
        </select>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Pressable type="button" variant="secondary" disabled={busy} onClick={onClose}>Cancel</Pressable>
        <Pressable type="submit" disabled={busy || confirmDelete}>{busy && !confirmDelete ? 'Saving…' : 'Save changes'}</Pressable>
      </div>
      <div className="border-t border-border pt-5">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive"><Trash2 className="size-4" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Delete campaign</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Remove this campaign from your workspace. Existing payments will not be cancelled or refunded.</p>
          </div>
        </div>
        {confirmDelete ? (
          <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 p-4" role="group" aria-label="Confirm campaign deletion">
            <p className="text-sm leading-relaxed">Delete <span className="font-medium break-words">{campaign.name}</span>?</p>
            <div className="mt-4 flex justify-end gap-2">
              <Pressable type="button" size="sm" variant="secondary" disabled={busy} onClick={() => setConfirmDelete(false)}>Keep campaign</Pressable>
              <Pressable type="button" size="sm" disabled={busy} onClick={removeCampaign} className="bg-destructive text-white hover:bg-destructive/90">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} {busy ? 'Deleting…' : 'Confirm delete'}
              </Pressable>
            </div>
          </div>
        ) : <button type="button" disabled={busy} onClick={() => setConfirmDelete(true)} className="mt-4 inline-flex h-10 items-center gap-2 rounded-full border border-destructive/20 px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive disabled:opacity-50">Delete campaign</button>}
      </div>
    </form>
  )
}
