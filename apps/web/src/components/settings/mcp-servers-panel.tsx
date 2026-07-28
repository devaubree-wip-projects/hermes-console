"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Plus, Trash2, Zap } from "lucide-react"
import { toast } from "sonner"
import { SettingsPanelHeader, SettingsSection } from "@/components/settings/settings-row"
import { Alert } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

export type McpServerView = {
  name: string
  transport?: string
  url?: string | null
  command?: string | null
  enabled?: boolean
  env?: Record<string, string>
}

export type McpCatalogView = { name: string; description?: string; installed?: boolean }

type EnvDraft = { key: string; value: string }
type TestState = { tools: string[]; failure: string | null }

/** Touch ≥ 44px sur mobile, densité habituelle du produit au-delà. */
const TOUCH = "min-h-11 sm:min-h-9"

export function McpServersPanel({
  servers,
  catalog,
  catalogAvailable,
  apiBase,
  canEdit,
}: {
  servers: McpServerView[]
  catalog: McpCatalogView[]
  catalogAvailable: boolean
  apiBase: string
  canEdit: boolean
}) {
  const router = useRouter()
  const [pending, setPending] = useState<string | null>(null)
  const [tests, setTests] = useState<Record<string, TestState>>({})
  const [needsRestart, setNeedsRestart] = useState(false)
  const [adding, setAdding] = useState(false)

  async function send(body: Record<string, unknown>, key: string) {
    setPending(key)
    try {
      const response = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = (await response.json().catch(() => null)) as Record<string, unknown> | null
      if (!response.ok) throw new Error((data?.error as string) ?? `Échec (${response.status})`)
      return data ?? {}
    } finally {
      setPending(null)
    }
  }

  async function mutate(body: Record<string, unknown>, key: string, success: string) {
    try {
      const data = await send(body, key)
      if (data.needsRestart) setNeedsRestart(true)
      if (typeof data.restartWarning === "string") toast.warning(data.restartWarning)
      toast.success(success)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Opération impossible.")
    }
  }

  async function runTest(name: string) {
    try {
      const data = await send({ action: "test", name }, `test:${name}`)
      const tools = Array.isArray(data.tools)
        ? (data.tools as Array<{ name?: string }>).map((tool) => tool.name ?? "").filter(Boolean)
        : []
      const failure = (data.failure as { message?: string } | undefined)?.message ?? null
      setTests((current) => ({ ...current, [name]: { tools, failure } }))
      if (failure) toast.error(failure)
      else toast.success(`${name} répond — ${tools.length} outil(s)`)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Test impossible."
      setTests((current) => ({ ...current, [name]: { tools: [], failure: message } }))
      toast.error(message)
    }
  }

  return (
    // Requêtes de conteneur plutôt que de viewport : ce panneau est rendu aussi
    // bien en pleine largeur qu'à côté d'une barre latérale, et doit s'adapter à
    // la place qu'on lui donne, pas à la taille de l'écran.
    <div className="@container space-y-8">
      <SettingsPanelHeader
        title="Connecteurs (MCP)"
        description="Serveurs Model Context Protocol branchés sur cet agent. Ils lui ajoutent des outils — recherche, CRM, gestion de projet — que le runtime expose sous le préfixe mcp__<serveur>__<outil>."
      />

      {!canEdit ? (
        <Alert variant="info" title="Lecture seule">
          Seul un Owner peut gérer les connecteurs de cet agent.
        </Alert>
      ) : null}

      {needsRestart ? (
        <Alert variant="warning" title="Rechargement nécessaire">
          Les sessions en cours gardent la liste d’outils figée à leur création : elles ne verront pas
          ce changement. Envoyez <code>/reload-mcp</code> à l’agent (<code>/reload_mcp</code> sur
          Telegram) pour recharger les connecteurs sans rien interrompre. Un redémarrage du gateway
          depuis la page Installations fonctionne aussi, mais coupe Telegram quelques secondes.
        </Alert>
      ) : null}

      <SettingsSection title="Connecteurs installés">
        {servers.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Aucun connecteur. Cet agent n’a que les outils intégrés du runtime.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {servers.map((server) => (
              <li key={server.name} className="flex flex-col gap-3 py-4 @md:flex-row @md:items-start @md:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium break-all">{server.name}</span>
                    <Badge variant="outline">{server.transport ?? "inconnu"}</Badge>
                    {server.enabled === false ? <Badge variant="secondary">Désactivé</Badge> : null}
                  </div>
                  <p className="text-sm break-all text-muted-foreground">
                    {server.url ?? server.command ?? "—"}
                  </p>
                  {tests[server.name]?.failure ? (
                    <p className="text-sm text-destructive">{tests[server.name].failure}</p>
                  ) : null}
                  {tests[server.name]?.tools.length ? (
                    <p className="text-sm text-muted-foreground">
                      Outils : {tests[server.name].tools.join(", ")}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2 @md:shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    className={TOUCH}
                    disabled={pending !== null}
                    onClick={() => void runTest(server.name)}
                  >
                    {pending === `test:${server.name}` ? <Loader2 className="animate-spin" /> : <Zap />}
                    Tester
                  </Button>
                  {canEdit ? (
                    <>
                      <Switch
                        checked={server.enabled !== false}
                        disabled={pending !== null}
                        aria-label={`${server.enabled === false ? "Activer" : "Désactiver"} ${server.name}`}
                        onCheckedChange={(next) =>
                          void mutate(
                            { action: "set_enabled", name: server.name, enabled: next },
                            `toggle:${server.name}`,
                            next ? `${server.name} activé` : `${server.name} désactivé`,
                          )
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        className={`${TOUCH} text-destructive`}
                        disabled={pending !== null}
                        aria-label={`Supprimer ${server.name}`}
                        onClick={() => {
                          if (!confirm(`Supprimer le connecteur « ${server.name} » ?`)) return
                          void mutate(
                            { action: "remove", name: server.name },
                            `remove:${server.name}`,
                            `${server.name} supprimé`,
                          )
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>

      {canEdit ? (
        <SettingsSection title="Ajouter un connecteur">
          {adding ? (
            <AddServerForm
              disabled={pending !== null}
              onCancel={() => setAdding(false)}
              onSubmit={async (body) => {
                await mutate({ action: "add", ...body }, "add", `${body.name} ajouté`)
                setAdding(false)
              }}
            />
          ) : (
            <Button type="button" variant="outline" className={TOUCH} onClick={() => setAdding(true)}>
              <Plus />
              Nouveau connecteur
            </Button>
          )}
        </SettingsSection>
      ) : null}

      {catalogAvailable && catalog.length ? (
        <SettingsSection title="Catalogue Nous">
          <ul className="grid gap-3 @md:grid-cols-2">
            {catalog.map((entry) => (
              <li
                key={entry.name}
                className="flex flex-col gap-2 rounded-lg border border-border p-4 @md:flex-row @md:items-center @md:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium">{entry.name}</p>
                  {entry.description ? (
                    <p className="text-sm text-muted-foreground">{entry.description}</p>
                  ) : null}
                </div>
                {canEdit ? (
                  <Button
                    type="button"
                    variant="outline"
                    className={`${TOUCH} @md:shrink-0`}
                    disabled={pending !== null}
                    onClick={() =>
                      void mutate(
                        { action: "install_catalog", name: entry.name },
                        `catalog:${entry.name}`,
                        `${entry.name} installé`,
                      )
                    }
                  >
                    Installer
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </SettingsSection>
      ) : null}
    </div>
  )
}

function AddServerForm({
  disabled,
  onCancel,
  onSubmit,
}: {
  disabled: boolean
  onCancel: () => void
  onSubmit: (body: Record<string, unknown>) => Promise<void>
}) {
  const [name, setName] = useState("")
  const [remote, setRemote] = useState(true)
  const [url, setUrl] = useState("")
  const [command, setCommand] = useState("")
  const [args, setArgs] = useState("")
  const [bearerToken, setBearerToken] = useState("")
  const [env, setEnv] = useState<EnvDraft[]>([])

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault()
        void onSubmit({
          name: name.trim(),
          ...(remote
            ? { url: url.trim(), ...(bearerToken.trim() ? { bearerToken: bearerToken.trim() } : {}) }
            : {
                command: command.trim(),
                args: args.split(/\s+/).filter(Boolean),
                env: env.filter((entry) => entry.key.trim()),
              }),
        })
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="mcp-name">Nom</Label>
        <Input
          id="mcp-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="ghostsearch"
          maxLength={64}
          required
        />
        <p className="text-xs text-muted-foreground">
          Sert de préfixe aux outils exposés : <code>mcp__{name.trim() || "<nom>"}__…</code>
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Type de serveur</legend>
        <div className="flex flex-col gap-2 @sm:flex-row">
          {[
            { value: true, label: "Distant (URL)", hint: "un serveur MCP joignable en HTTP" },
            { value: false, label: "Local (commande)", hint: "npx, uvx, python3 ou un binaire présent" },
          ].map((option) => (
            <label
              key={String(option.value)}
              className={`flex flex-1 cursor-pointer items-start gap-3 rounded-lg border p-3 ${TOUCH} ${
                remote === option.value ? "border-primary" : "border-border"
              }`}
            >
              <input
                type="radio"
                name="mcp-transport"
                className="mt-1"
                checked={remote === option.value}
                onChange={() => setRemote(option.value)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="block text-xs text-muted-foreground">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {remote ? (
        <div className="grid gap-4 @md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="mcp-url">URL</Label>
            <Input
              id="mcp-url"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://mcp.exemple.com/mcp"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mcp-token">Jeton Bearer (optionnel)</Label>
            <Input
              id="mcp-token"
              type="password"
              value={bearerToken}
              onChange={(event) => setBearerToken(event.target.value)}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">Stocké dans le profil Hermes, jamais en base.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 @md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="mcp-command">Commande</Label>
              <Input
                id="mcp-command"
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                placeholder="npx"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mcp-args">Arguments</Label>
              <Input
                id="mcp-args"
                value={args}
                onChange={(event) => setArgs(event.target.value)}
                placeholder="-y @modelcontextprotocol/server-github"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Variables d’environnement</Label>
            {env.map((entry, index) => (
              <div key={index} className="grid gap-2 @sm:grid-cols-[1fr_1fr_auto]">
                <Input
                  value={entry.key}
                  onChange={(event) =>
                    setEnv((current) =>
                      current.map((item, i) => (i === index ? { ...item, key: event.target.value } : item)),
                    )
                  }
                  placeholder="API_KEY"
                  aria-label={`Clé ${index + 1}`}
                />
                <Input
                  type="password"
                  value={entry.value}
                  onChange={(event) =>
                    setEnv((current) =>
                      current.map((item, i) => (i === index ? { ...item, value: event.target.value } : item)),
                    )
                  }
                  placeholder="valeur"
                  autoComplete="off"
                  aria-label={`Valeur ${index + 1}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  className={TOUCH}
                  aria-label={`Retirer la variable ${index + 1}`}
                  onClick={() => setEnv((current) => current.filter((_, i) => i !== index))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              className={TOUCH}
              onClick={() => setEnv((current) => [...current, { key: "", value: "" }])}
            >
              <Plus />
              Ajouter une variable
            </Button>
            <p className="text-xs text-muted-foreground">
              Les valeurs sont écrites dans le profil Hermes ; seule une référence est conservée dans la
              configuration.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 @sm:flex-row @sm:justify-end">
        <Button type="button" variant="ghost" className={TOUCH} onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" className={TOUCH} disabled={disabled || !name.trim()}>
          {disabled ? <Loader2 className="animate-spin" /> : null}
          Ajouter
        </Button>
      </div>
    </form>
  )
}
