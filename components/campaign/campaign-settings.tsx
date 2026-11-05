'use client'

import { useState } from 'react'
import { Label, inputClass, Pressable } from '../kit'
import { campaignSpent, usd } from '@/lib/format'
import { useStore } from '@/lib/store'
import type { Campaign } from '@/lib/types'

export function CampaignSettings({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  const { folders, updateCampaign } = useStore()
  const [name, setName] = useState(campaign.name)
  const [budget, setBudget] = useState(String(campaign.budget))
  const [folderId, setFolderId] = useState(campaign.folderId)
  const [error, setError] = useState('')
  const spent = campaignSpent(campaign)

  async function saveCampaign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
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
    try { await updateCampaign(campaign.id, { name: name.trim(), budget: amount, folderId }) } catch { return }
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
        <Pressable type="button" variant="secondary" onClick={onClose}>Cancel</Pressable>
        <Pressable type="submit">Save changes</Pressable>
      </div>
    </form>
  )
}
