'use client'

import { AnimatePresence, motion } from 'motion/react'
import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { inputClass, Label, Pressable } from './kit'
import { paypalSDK } from '@/lib/paypal-client'
import { PayPalWordmark } from './brand'
import { Modal } from './modal'
import { LogoutButton } from './logout-button'
import { useStore } from '@/lib/store'
import { proactiveDefaults } from '@/lib/proactive'

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} layoutId="settings-surface" title="Account settings">
      <SettingsForm onClose={onClose} />
    </Modal>
  )
}

function SettingsForm({ onClose }: { onClose: () => void }) {
  const { settings, folders, updateSettings } = useStore()
  const [form, setForm] = useState(() => ({ ...settings, proactive: settings.proactive ?? proactiveDefaults(folders[0]?.id) }))
  const [wallet, setWallet] = useState<{ saved: boolean; email?: string }>({ saved: false })
  const [walletBusy, setWalletBusy] = useState(false)
  const [walletError, setWalletError] = useState('')

  useEffect(() => {
    fetch('/api/paypal/vault')
      .then(r => r.json())
      .then(setWallet)
      .catch(() => setWalletError('Could not load saved PayPal account.'))
  }, [])

  async function vaultRequest(action: string, ticket?: string) {
    const response = await fetch('/api/paypal/vault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ticket }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Could not save PayPal')
    return data
  }

  async function savePayPal() {
    setWalletBusy(true)
    setWalletError('')
    try {
      const sdk = await paypalSDK()
      const setup = await vaultRequest('setup')
      const session = sdk.createPayPalSavePaymentSession({
        onApprove: async () => {
          try {
            const saved = await vaultRequest('confirm', setup.ticket)
            setWallet(saved)
            setForm(f => ({ ...f, paypalEmail: saved.email }))
            await updateSettings({ ...form, paypalEmail: saved.email })
          } catch (error) {
            setWalletError(error instanceof Error ? error.message : 'Wallet save failed')
          } finally {
            setWalletBusy(false)
          }
        },
        onCancel: () => {
          setWalletBusy(false)
          setWalletError('Saving cancelled. Your saved account was not changed.')
        },
        onError: () => {
          setWalletBusy(false)
          setWalletError('PayPal could not save this account. Please try again or contact support.')
        }
      })
      await session.start({ presentationMode: 'modal' }, Promise.resolve({ vaultSetupToken: setup.vaultSetupToken }))
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : 'Wallet save failed')
      setWalletBusy(false)
    }
  }

  async function removePayPal() {
    setWalletBusy(true)
    setWalletError('')
    try {
      setWallet(await vaultRequest('remove'))
      setForm(f => ({ ...f, paypalEmail: '' }))
      await updateSettings({ ...form, paypalEmail: '' })
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : 'Could not remove PayPal')
    } finally {
      setWalletBusy(false)
    }
  }

  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setSaveError('')
    try { await updateSettings(form) } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save settings.')
      setSaving(false)
      return
    }
    setSaved(true)
    setTimeout(onClose, 650)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <Label htmlFor="org">Name</Label>
        <input id="org" className={inputClass} value={form.orgName} onChange={(e) => setForm({ ...form, orgName: e.target.value })} required />
      </div>
      <div>
        <Label htmlFor="tax">Default tax-exempt ID</Label>
        <input id="tax" className={`${inputClass} tabular`} value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} />
      </div>
      <div>
        <Label htmlFor="addr">Default shipping address</Label>
        <textarea
          id="addr"
          rows={2}
          className={`${inputClass} h-auto resize-none py-2.5`}
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
      </div>
      <fieldset className="flex flex-col gap-3 rounded-2xl border border-border p-4">
        <legend className="px-1 text-sm font-medium">Proactive campaigns</legend>
        <label className="flex items-center gap-3 text-sm font-medium">
          <input type="checkbox" checked={form.proactive.enabled} onChange={e => setForm({ ...form, proactive: { ...form.proactive, enabled: e.target.checked } })} />
          Prepare campaigns for nearby disasters
        </label>
        <p className="text-xs text-muted-foreground">Prova prepares supply plans automatically. You review the supplies and approve every payment. Uses your default U.S. shipping address.</p>
        {form.shippingLocation?.address === form.address && <p className="text-xs text-muted-foreground">Matched address: {form.shippingLocation.matchedAddress}</p>}
        {form.proactive.enabled && form.shippingLocation?.address !== form.address && <p className="text-xs text-muted-foreground">Your address will be verified when you save.</p>}
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
      <div className="rounded-2xl border border-paypal-blue/20 bg-paypal-blue/5 p-4">
        <div className="mb-3 flex items-center justify-between"><PayPalWordmark className="text-2xl" /><span className="text-xs text-paypal-wordmark-navy">{wallet.saved ? 'Connected' : 'Not connected'}</span></div>
        <p className="mb-1 truncate text-sm font-medium">{wallet.saved ? wallet.email : 'No PayPal account saved'}</p>
        <p className="mb-4 text-xs text-muted-foreground">{wallet.saved ? 'Saved securely with PayPal for purchases you approve in Prova.' : 'Save your PayPal account once for faster future purchases. No payment is taken when saving.'}</p>
        <button type="button" disabled={walletBusy} onClick={savePayPal} className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-paypal-gold text-sm font-semibold text-paypal-navy disabled:opacity-50">{walletBusy ? 'Connecting to' : wallet.saved ? 'Change saved' : 'Save'} <PayPalWordmark className="[--paypal-wordmark-navy:#003087] [--paypal-wordmark-blue:#00539c]" /></button>
        {wallet.saved && <button type="button" disabled={walletBusy} onClick={removePayPal} className="mt-3 w-full text-xs text-muted-foreground underline">Remove saved PayPal</button>}
        {walletError && <p role="alert" className="mt-3 text-xs text-destructive">{walletError}</p>}

      </div>
      <fieldset className="flex flex-col gap-3 rounded-2xl border border-border p-4">
        <legend className="px-1 text-sm font-medium">Retailer recipients</legend>
        <p className="text-xs text-muted-foreground">Retailers are assigned an account automatically. Add a mapping to choose a specific PayPal recipient.</p>
        {(form.retailerRecipients || []).map((recipient, index) => (
          <div key={index} className="flex flex-col gap-2 rounded-xl bg-muted/40 p-3">
            <Label htmlFor={`retailer-domain-${index}`}>Retailer domain</Label>
            <input id={`retailer-domain-${index}`} className={inputClass} placeholder="example.com" value={recipient.domain} required
              onChange={e => setForm({ ...form, retailerRecipients: form.retailerRecipients!.map((entry, i) => i === index ? { ...entry, domain: e.target.value } : entry) })} />
            <Label htmlFor={`retailer-email-${index}`}>PayPal email</Label>
            <input id={`retailer-email-${index}`} className={inputClass} type="email" placeholder="retailer@example.com" value={recipient.email} required
              onChange={e => setForm({ ...form, retailerRecipients: form.retailerRecipients!.map((entry, i) => i === index ? { ...entry, email: e.target.value } : entry) })} />
            <button type="button" className="self-start text-xs text-muted-foreground underline" onClick={() => setForm({ ...form, retailerRecipients: form.retailerRecipients!.filter((_, i) => i !== index) })}>Remove retailer</button>
          </div>
        ))}
        <button type="button" className="self-start text-sm underline" onClick={() => setForm({ ...form, retailerRecipients: [...(form.retailerRecipients || []), { domain: '', email: '' }] })}>Add retailer</button>
      </fieldset>
      {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
      <Pressable disabled={walletBusy || saving} type="submit" size="lg" className="mt-2 w-full overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          {saved ? (
            <motion.span key="saved" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="inline-flex items-center gap-2">
              <Check /> Saved
            </motion.span>
          ) : (
            <motion.span key="save" exit={{ y: -16, opacity: 0 }}>
              {saving ? 'Saving and verifying address…' : 'Save'}
            </motion.span>
          )}
        </AnimatePresence>
      </Pressable>
      <div className="mt-2 border-t border-border pt-4"><LogoutButton /></div>
    </form>
  )
}
