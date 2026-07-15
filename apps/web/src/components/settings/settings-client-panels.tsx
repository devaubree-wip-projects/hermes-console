"use client"

import { SettingsPanelHeader, SettingsRow, SettingsSection } from "@/components/settings/settings-row"
import { Switch } from "@/components/ui/switch"
import { useChatToolsStore } from "@/lib/shared/chat/chat-tools-store"

type ChatPreference =
  | "showTimestamps"
  | "compactMessages"
  | "autoScroll"
  | "wrapCode"
  | "showReasoning"
  | "showToolCalls"

function ChatPreferenceRow({
  preference,
  label,
  description,
}: {
  preference: ChatPreference
  label: string
  description: string
}) {
  const checked = useChatToolsStore((state) => state[preference])
  const setPreference = useChatToolsStore((state) => state.setChatPreference)

  return (
    <SettingsRow
      label={label}
      description={description}
      control={(
        <Switch
          checked={checked}
          onCheckedChange={(value) => setPreference(preference, value)}
          aria-label={label}
        />
      )}
    />
  )
}

export function ChatSettingsPanel() {
  return (
    <div className="space-y-8">
      <SettingsPanelHeader
        title="Chat"
        description="Réglez l’affichage des conversations sur cet appareil."
      />

      <SettingsSection title="Affichage des messages">
        <ChatPreferenceRow
          preference="showTimestamps"
          label="Afficher les heures"
          description="Affiche l’heure d’envoi à côté de chaque message."
        />
        <ChatPreferenceRow
          preference="compactMessages"
          label="Messages compacts"
          description="Réduit l’espace vertical dans les conversations denses."
        />
        <ChatPreferenceRow
          preference="autoScroll"
          label="Suivre la dernière réponse"
          description="Garde le message le plus récent visible pendant la génération."
        />
        <ChatPreferenceRow
          preference="wrapCode"
          label="Retour à la ligne dans le code"
          description="Adapte les longues lignes de code à la largeur de la conversation."
        />
      </SettingsSection>

      <SettingsSection title="Réponses de l’assistant">
        <ChatPreferenceRow
          preference="showReasoning"
          label="Afficher le raisonnement"
          description="Affiche les résumés de raisonnement fournis par le modèle."
        />
        <ChatPreferenceRow
          preference="showToolCalls"
          label="Afficher les appels d’outils"
          description="Affiche les étapes d’exécution des outils dans la conversation."
        />
      </SettingsSection>
    </div>
  )
}

export function DocumentsSettingsPanel() {
  const includeThreadTitle = useChatToolsStore((state) => state.includeThreadTitle)
  const setIncludeThreadTitle = useChatToolsStore((state) => state.setIncludeThreadTitle)

  return (
    <div className="space-y-8">
      <SettingsPanelHeader
        title="Documents"
        description="Définissez les valeurs utilisées lors des exports depuis une conversation."
      />
      <SettingsSection title="Exports">
        <SettingsRow
          label="Utiliser le titre de la conversation"
          description="Le titre courant devient le titre du document, sauf indication différente dans votre demande."
          control={(
            <Switch
              checked={includeThreadTitle}
              onCheckedChange={setIncludeThreadTitle}
              aria-label="Utiliser le titre de la conversation"
            />
          )}
        />
        <SettingsRow
          label="Formats disponibles"
          description="Les exports PDF et Word sont produits côté serveur lorsqu’un agent utilise l’outil correspondant."
          control={<span className="text-sm text-muted-foreground">PDF · Word</span>}
        />
      </SettingsSection>
    </div>
  )
}
