'use client'

import { useState } from 'react'
import { Modal } from '../modal'
import { inputClass, Label, Pressable } from '../kit'
import { useStore } from '@/lib/store'
import { proactiveDefaults } from '@/lib/proactive'

export function ProactiveSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Modal open={open} onClose={onClose} title="Proactive response settings">
    <ProactiveSettingsForm onClose={onClose} />
  </Modal>
}

function ProactiveSettingsForm({ onClose }: { onClose: () => void }) {
  const { settings, folders, updateSettings } = useStore()
  const [form, setForm] = useState(() => ({ proactive: settings.proactive ?? proactiveDefaults(folders[0]?.id) }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    try {
      await updateSettings({ ...settings, proactive: form.proactive })
      onClose()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save response settings.')
      setSaving(false)
    }
  }

  return <form onSubmit={submit} className="flex flex-col gap-4">
    <div className="rounded-xl bg-muted/50 p-3 text-sm">
      <p className="font-medium">Default shipping address</p>
      <p className="mt-1 text-muted-foreground">{settings.address || 'Set your shipping address in account settings before enabling proactive responses.'}</p>
      <p className="mt-1 text-xs text-muted-foreground">Manage this address in account settings.</p>
    </div>
      <fieldset disabled={saving} className="flex flex-col gap-3 rounded-2xl border border-border p-4">
        <legend className="px-1 text-sm font-medium">Proactive campaigns</legend>
        <label className="flex items-center gap-3 text-sm font-medium">
          <input type="checkbox" checked={form.proactive.enabled} onChange={e => setForm({ ...form, proactive: { ...form.proactive, enabled: e.target.checked } })} />
          Prepare campaigns for nearby disasters
        </label>
        <p className="text-xs text-muted-foreground">Prova prepares supply plans automatically. You review the supplies and approve every payment. Uses your default U.S. shipping address.</p>
        {settings.shippingLocation?.address === settings.address && <p className="text-xs text-muted-foreground">Matched address: {settings.shippingLocation.matchedAddress}</p>}
        {form.proactive.enabled && settings.shippingLocation?.address !== settings.address && <p className="text-xs text-muted-foreground">Your address will be verified when you save.</p>}
        <div className="grid grid-cols-2 gap-3">
          {([
            ['radiusMiles', 'Radius (miles)', 12500, 'any'],
            ['budget', 'Budget per response ($)', 1000000000, '0.01'],
            ['people', 'People to supply', 1000000, '1'],
            ['days', 'Response duration (days)', 365, '1'],
          ] as const).map(([key, label, max, step]) => <div key={key}>
            <Label htmlFor={`proactive-${key}`}>{label}</Label>
            <input id={`proactive-${key}`} className={inputClass} type="number" min={key === 'budget' || key === 'radiusMiles' ? 0.01 : 1} max={max} step={step} required
              value={form.proactive[key]} onChange={e => setForm({ ...form, proactive: { ...form.proactive, [key]: Number(e.target.value) } })} />
          </div>)}
        </div>
        <div>
          <Label htmlFor="proactive-folder">Destination folder</Label>
          <select id="proactive-folder" className={inputClass} value={form.proactive.folderId} required={form.proactive.enabled}
            onChange={e => setForm({ ...form, proactive: { ...form.proactive, folderId: e.target.value } })}>
            {!folders.length && <option value="">Create a folder first</option>}
            {folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
          </select>
        </div>
        <p className="text-xs text-muted-foreground">People and duration are planning assumptions, not confirmed disaster impact. Turning this off stops new responses; existing campaigns stay available.</p>
      </fieldset>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Pressable type="submit" disabled={saving} className="w-full">{saving ? 'Saving and verifying address…' : 'Save settings'}</Pressable>
  </form>
}
