"use client";

import { useState } from "react";
import { Loader2Icon, RotateCcwIcon, SaveIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CONSOLE_SETTINGS,
  CONSOLE_SETTING_GROUPS,
  type ConsoleSettingDefinition,
} from "@/lib/settings/catalog";

export type InstanceSetting = {
  key: string;
  source: "database" | "environment";
  isSecret: boolean;
  value: string | null;
  defined: boolean;
};

export function InstanceSettingsPanel({
  endpoint,
  overridesDisabled,
  settings,
}: {
  endpoint: string;
  overridesDisabled: boolean;
  settings: InstanceSetting[];
}) {
  const [state, setState] = useState(settings);
  const [pending, setPending] = useState<string | null>(null);
  const byKey = new Map(state.map((setting) => [setting.key, setting]));

  async function save(definition: ConsoleSettingDefinition, value: string | null) {
    setPending(definition.key);
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: definition.key, value }),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    setPending(null);
    if (!response.ok) {
      toast.error(payload.error ?? "Enregistrement impossible.");
      return;
    }
    setState((current) => current.map((setting) => setting.key === definition.key
      ? {
        ...setting,
        source: value === null ? "environment" : "database",
        value: definition.secret ? null : value,
        defined: value === null ? setting.defined : Boolean(value),
      }
      : setting));
    toast.success(value === null
      ? "Surcharge retirée : la valeur du fichier reprend la main."
      : "Réglage enregistré.");
  }

  return <div className="grid gap-6">
    {overridesDisabled ? (
      <Alert title="Surcharges désactivées" variant="warning">
        <code>HERMES_SETTINGS_DISABLE_OVERRIDES=true</code> est actif : la Console lit
        uniquement son fichier <code>.env</code>. Les valeurs enregistrées ici sont
        conservées mais ignorées tant que cette variable n’est pas retirée.
      </Alert>
    ) : null}

    {CONSOLE_SETTING_GROUPS.map((group) => {
      const definitions = CONSOLE_SETTINGS.filter((setting) => setting.group === group.id);
      if (!definitions.length) return null;
      return <section className="grid gap-4" key={group.id}>
        <h3 className="text-sm font-medium text-muted-foreground">{group.label}</h3>
        {/* Une colonne sur mobile, deux dès la tablette : ces champs sont courts et
            se lisent par paires sur un écran large, mais tiennent mal sous 768px. */}
        <div className="grid gap-4 md:grid-cols-2">
          {definitions.map((definition) => {
            const setting = byKey.get(definition.key);
            const fromDatabase = setting?.source === "database";
            return <div className="grid gap-2" key={definition.key}>
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor={`setting-${definition.key}`}>{definition.label}</Label>
                <Badge variant={fromDatabase ? "default" : "secondary"}>
                  {fromDatabase ? "surchargée ici" : "valeur du .env"}
                </Badge>
                {definition.secret ? (
                  <Badge variant="secondary">{setting?.defined ? "défini" : "non défini"}</Badge>
                ) : null}
              </div>
              <form
                className="flex flex-wrap gap-2"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  await save(definition, String(form.get("value") ?? ""));
                }}
              >
                <Input
                  className="min-w-0 flex-1"
                  defaultValue={definition.secret ? "" : setting?.value ?? ""}
                  id={`setting-${definition.key}`}
                  name="value"
                  placeholder={definition.secret && setting?.defined
                    ? "•••••••• (saisir pour remplacer)"
                    : definition.placeholder ?? ""}
                  type={definition.secret ? "password" : "text"}
                />
                <Button disabled={pending === definition.key} size="icon" title="Enregistrer" type="submit">
                  {pending === definition.key ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
                </Button>
                {fromDatabase ? (
                  <Button
                    disabled={pending === definition.key}
                    onClick={() => save(definition, null)}
                    size="icon"
                    title="Revenir à la valeur du fichier .env"
                    type="button"
                    variant="outline"
                  >
                    <RotateCcwIcon />
                  </Button>
                ) : null}
              </form>
              <p className="text-xs text-muted-foreground">
                <code>{definition.key}</code>{definition.hint ? ` — ${definition.hint}` : ""}
              </p>
            </div>;
          })}
        </div>
      </section>;
    })}
  </div>;
}
