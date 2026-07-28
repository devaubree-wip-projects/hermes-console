"use client"

import { useState } from "react"
import { toast } from "sonner"
import { SettingsPanelHeader, SettingsRow, SettingsSection } from "@/components/settings/settings-row"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"

export type ToolsetItem = {
  name: string
  label: string
  description: string
  enabled: boolean
}

export function ToolsSettingsPanel({
  items,
  profile,
  apiBase,
  canEdit,
}: {
  items: ToolsetItem[]
  profile: string | null
  apiBase: string
  canEdit: boolean
}) {
  return (
    <div className="space-y-8">
      <SettingsPanelHeader
        title="Outils intégrés du runtime"
        description="Familles d’outils fournies par le runtime Hermes (shell, fichiers, etc.) pour le profil principal. Les serveurs MCP externes, eux, se gèrent dans le panneau Connecteurs."
      />
      <SettingsSection title="Toolsets disponibles">
        {items.length ? (
          items.map((item) => (
            <ToolsetRow key={item.name} item={item} profile={profile} apiBase={apiBase} canEdit={canEdit} />
          ))
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">Aucun toolset disponible.</div>
        )}
      </SettingsSection>
    </div>
  )
}

function ToolsetRow({
  item,
  profile,
  apiBase,
  canEdit,
}: {
  item: ToolsetItem
  profile: string | null
  apiBase: string
  canEdit: boolean
}) {
  const [enabled, setEnabled] = useState(item.enabled)
  const [pending, setPending] = useState(false)

  async function toggle(next: boolean) {
    if (!profile) {
      toast.error("Profil Hermes indisponible.")
      return
    }
    setEnabled(next)
    setPending(true)
    try {
      const response = await fetch(`${apiBase}/${encodeURIComponent(item.name)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next, profile }),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? `Échec (${response.status})`)
      }
      toast.success(`${item.label} ${next ? "activé" : "désactivé"}`)
    } catch (error) {
      setEnabled(!next)
      toast.error(error instanceof Error ? error.message : "Modification impossible.")
    } finally {
      setPending(false)
    }
  }

  return (
    <SettingsRow
      label={item.label}
      description={item.description}
      control={
        canEdit ? (
          <Switch
            checked={enabled}
            disabled={pending}
            onCheckedChange={toggle}
            aria-label={`${enabled ? "Désactiver" : "Activer"} ${item.label}`}
          />
        ) : (
          <Badge variant={enabled ? "outline" : "secondary"}>{enabled ? "Actif" : "Inactif"}</Badge>
        )
      }
    />
  )
}
