"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Loader2, ShieldAlertIcon } from "lucide-react"
import { toast } from "sonner"
import { SettingsRow, SettingsSection } from "@/components/settings/settings-row"
import { Alert } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ApprovalMode, RuntimeAccess } from "@/lib/hermes/server"

const APPROVAL_LABELS: Record<ApprovalMode, { label: string; hint: string }> = {
  manual: { label: "Manuel", hint: "Chaque action sensible demande votre validation." },
  smart: { label: "Intelligent", hint: "Hermes valide seul les actions sûres, vous demande le reste." },
  off: { label: "Désactivé (YOLO)", hint: "Toutes les commandes, y compris dangereuses, s'exécutent sans validation." },
}

export function RuntimeAccessSection({
  access,
  profile,
  configApiBase,
  toolsHref,
  mcpHref,
  canEdit,
}: {
  access: RuntimeAccess
  profile: string | null
  configApiBase: string
  toolsHref: string
  mcpHref: string
  canEdit: boolean
}) {
  if (access.offline) {
    return (
      <Alert variant="warning" title="Runtime injoignable">
        Impossible de lire l’accès machine de l’agent. Vérifiez que le runtime Hermes est démarré.
      </Alert>
    )
  }

  return (
    <div className="space-y-8">
      <MachineAccessSummary access={access} toolsHref={toolsHref} mcpHref={mcpHref} />
      {canEdit && profile ? (
        <ControlSection access={access} profile={profile} configApiBase={configApiBase} />
      ) : (
        <Alert variant="info" title="Accès en lecture seule">
          Seul un Owner peut modifier le répertoire de travail et le mode d’approbation.
        </Alert>
      )}
    </div>
  )
}

function MachineAccessSummary({
  access,
  toolsHref,
  mcpHref,
}: {
  access: RuntimeAccess
  toolsHref: string
  mcpHref: string
}) {
  const mode = access.approvalMode
  const yolo = mode === "off"
  const enabledTools = access.toolsets.filter((t) => t.enabled)
  const connectedMcp = access.mcpServers.filter((s) => s.enabled)

  return (
    <SettingsSection title="Accès machine">
      <SettingsRow
        label="Répertoire de travail"
        description="Le dossier réel que l’agent peut lire et écrire sur la machine. Tout est relatif à ce chemin."
        control={(
          <code className="block max-w-[22rem] truncate rounded-md bg-muted px-2 py-1 font-mono text-xs">
            {access.defaultCwd ?? "Résolu au démarrage"}
          </code>
        )}
      />
      {access.branch ? (
        <SettingsRow
          label="Branche git"
          description="Contexte git du répertoire de travail."
          control={<Badge variant="outline" className="font-mono">{access.branch}</Badge>}
        />
      ) : null}
      <SettingsRow
        align="center"
        label={(
          <span className="flex flex-wrap items-center gap-2">
            Mode d’approbation
            {yolo ? (
              <Badge
                variant="outline"
                className="gap-1 border-destructive/40 bg-destructive/10 text-destructive"
              >
                <ShieldAlertIcon className="size-3.5" aria-hidden />
                Validations désactivées
              </Badge>
            ) : null}
          </span>
        )}
        description={mode ? APPROVAL_LABELS[mode].hint : "Indisponible."}
        control={<Badge variant={yolo ? "secondary" : "outline"}>{mode ? APPROVAL_LABELS[mode].label : "—"}</Badge>}
      />
      <SettingsRow
        label="Familles d’outils actives"
        description={(
          <>
            Les capacités réelles de l’agent (shell, fichiers, web…).{" "}
            <Link href={toolsHref} className="underline underline-offset-2">Gérer les outils</Link>.
          </>
        )}
        control={(
          <div className="flex max-w-[22rem] flex-wrap justify-end gap-1.5">
            {enabledTools.length ? (
              enabledTools.map((t) => (
                <Badge key={t.name} variant="outline">{t.label}</Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">Aucune</span>
            )}
          </div>
        )}
      />
      <SettingsRow
        label="Connecteurs externes (MCP)"
        description={(
          <>
            Systèmes externes reliés à Hermes.{" "}
            <Link href={mcpHref} className="underline underline-offset-2">Gérer les connecteurs</Link>.
          </>
        )}
        control={(
          <div className="flex max-w-[22rem] flex-wrap justify-end gap-1.5">
            {connectedMcp.length ? (
              connectedMcp.map((s) => (
                <Badge key={s.name} variant="outline">{s.name}</Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">Aucun</span>
            )}
          </div>
        )}
      />
    </SettingsSection>
  )
}

function ControlSection({
  access,
  profile,
  configApiBase,
}: {
  access: RuntimeAccess
  profile: string
  configApiBase: string
}) {
  const router = useRouter()

  async function put(body: Record<string, unknown>) {
    const res = await fetch(configApiBase, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile, ...body }),
    })
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      throw new Error(data?.error ?? `Échec (${res.status})`)
    }
  }

  return (
    <SettingsSection title="Contrôles (Owner)">
      <CwdControl current={access.defaultCwd} put={put} onSaved={() => router.refresh()} />
      <ApprovalControl current={access.approvalMode} put={put} onSaved={() => router.refresh()} />
    </SettingsSection>
  )
}

function CwdControl({
  current,
  put,
  onSaved,
}: {
  current: string | null
  put: (body: Record<string, unknown>) => Promise<void>
  onSaved: () => void
}) {
  const [value, setValue] = useState(current ?? "")
  const [saving, setSaving] = useState(false)
  const dirty = value.trim() !== (current ?? "") && value.trim().length > 0

  async function save() {
    setSaving(true)
    try {
      await put({ defaultCwd: value.trim() })
      toast.success("Répertoire de travail mis à jour")
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec de l’enregistrement.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsRow
      label={<Label htmlFor="runtime-cwd">Répertoire de travail par défaut</Label>}
      description="Chemin absolu utilisé par les nouvelles sessions. Élargit ou restreint ce que l’agent peut atteindre."
      control={(
        <div className="flex w-full max-w-[22rem] flex-col gap-2 sm:flex-row">
          <Input
            id="runtime-cwd"
            value={value}
            spellCheck={false}
            autoComplete="off"
            placeholder="/home/user/projet"
            className="font-mono text-xs"
            onChange={(e) => setValue(e.target.value)}
          />
          <Button type="button" className="h-11 shrink-0" disabled={!dirty || saving} onClick={save}>
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Enregistrer
          </Button>
        </div>
      )}
    />
  )
}

function ApprovalControl({
  current,
  put,
  onSaved,
}: {
  current: ApprovalMode | null
  put: (body: Record<string, unknown>) => Promise<void>
  onSaved: () => void
}) {
  const [mode, setMode] = useState<ApprovalMode>(current ?? "smart")
  const [pending, setPending] = useState(false)
  const [confirmYolo, setConfirmYolo] = useState(false)

  async function commit(next: ApprovalMode) {
    const previous = mode
    setMode(next)
    setPending(true)
    try {
      await put({ approvalMode: next })
      toast.success(`Mode d’approbation : ${APPROVAL_LABELS[next].label}`)
      onSaved()
    } catch (err) {
      setMode(previous)
      toast.error(err instanceof Error ? err.message : "Échec de la mise à jour.")
    } finally {
      setPending(false)
    }
  }

  function onSelect(next: ApprovalMode) {
    if (next === mode) return
    if (next === "off") {
      setConfirmYolo(true)
      return
    }
    void commit(next)
  }

  return (
    <SettingsRow
      align="center"
      label={<Label htmlFor="runtime-approval">Mode d’approbation</Label>}
      description={APPROVAL_LABELS[mode].hint}
      control={(
        <>
          <Select value={mode} disabled={pending} onValueChange={(v) => onSelect(v as ApprovalMode)}>
            <SelectTrigger id="runtime-approval" className="w-[13rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manuel</SelectItem>
              <SelectItem value="smart">Intelligent</SelectItem>
              <SelectItem value="off">Désactivé (YOLO)</SelectItem>
            </SelectContent>
          </Select>

          <Dialog open={confirmYolo} onOpenChange={setConfirmYolo}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ShieldAlertIcon className="size-5 text-destructive" aria-hidden />
                  Désactiver toutes les validations ?
                </DialogTitle>
                <DialogDescription>
                  En mode YOLO, l’agent exécute <strong>toutes</strong> les commandes — y compris destructives
                  (suppression de fichiers, git push, envois réseau) — sans jamais vous demander de confirmation.
                  Ce réglage s’applique aux nouvelles sessions de ce profil.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">Annuler</Button>
                </DialogClose>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={pending}
                  onClick={() => {
                    setConfirmYolo(false)
                    void commit("off")
                  }}
                >
                  Désactiver les validations
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    />
  )
}
