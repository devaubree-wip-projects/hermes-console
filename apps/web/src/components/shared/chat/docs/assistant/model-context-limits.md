# Model context limits (v1-xulux)

Référence pour le ring de contexte du composer (`ContextUsageIndicator`).
Valeurs consommées via `contextWindow` dans [`docs-model-options.ts`](./docs-model-options.ts).

Le ring compare **`inputTokens`** remontés par l’API (`messageMetadata.custom.usage`) au plafond ci-dessous.

Dernière revue : juin 2026.

## OpenAI

| ID UI | Label | Context max | Source |
|-------|-------|-------------|--------|
| `gpt-5.5` | GPT 5.5 | **272 000** (défaut ; headline 1 050 000) | [GPT-5.5](https://developers.openai.com/api/docs/models/gpt-5.5) |
| `gpt-5.4-mini` | GPT 5.4 mini | **272 000** (défaut ; headline 1 050 000) | [GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4) |
| `gpt-5.4-nano` | GPT 5.4 nano | **400 000** | idem |

**Fenêtre effective = 272K (décidé Jul 2026, vérifié).** GPT-5.5/5.4 titrent **1 050 000** tokens, mais via un appel API standard le **défaut est 272K** : le plein 1,05M est un **opt-in expérimental** (`model_context_window` + `model_auto_compact_token_limit`), et tout prompt >272K est facturé **2× input / 1,5× output**. Le backend n'active pas l'opt-in → le ring et les alertes utilisent donc **272 000** (`contextWindow` dans `docs-model-options.ts`). Repasser à `1_050_000` seulement si le backend active le mode 1M. Source : pages modèles OpenAI + deep-dive communautaire (cohérents).

## Anthropic (Claude)

| ID UI | Label | Context max | Source |
|-------|-------|-------------|--------|
| `claude-opus-4-8` | Opus 4.8 | **1 000 000** | [Claude models overview](https://platform.claude.com/docs/en/about-claude/models/overview) |
| `claude-opus-4-8-fast` | Opus 4.8 Fast | **1 000 000** | idem |
| `claude-opus-4-7` | Opus 4.7 | **200 000** | idem (génération précédente) |
| `claude-opus-4-7-fast` | Opus 4.7 Fast | **200 000** | idem |
| `claude-opus-4-6` | Opus 4.6 | **200 000** | idem |
| `claude-sonnet-4-6` | Sonnet 4.6 | **1 000 000** | idem |
| `claude-haiku-4-5` | Haiku 4.5 | **200 000** | idem |

## Google (Gemini)

| ID UI | Label | Context max | Source |
|-------|-------|-------------|--------|
| `gemini-2.5-pro` | Gemini 2.5 Pro | **1 048 576** | [Gemini 2.5 Pro](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-pro) |
| `gemini-2.5-flash` | Gemini 2.5 Flash | **1 048 576** | [Gemini 2.5 Flash](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/2-5-flash) |
| `gemini-2.0-flash` | Gemini 2.0 Flash | **1 048 576** | [Gemini 2.0 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-2.0-flash) |

## Ollama (local)

| ID UI | Label | Context max | Source / note |
|-------|-------|-------------|---------------|
| `llama3.2` | Llama 3.2 | **128 000** | Fenêtre entraînée Llama 3.2 |
| `qwen2.5-coder` | Qwen 2.5 Coder | **128 000** | [Qwen2.5-Coder README](https://github.com/QwenLM/Qwen2.5-Coder) |
| `mistral` | Mistral latest | **32 768** | Défaut courant Ollama / Mistral 7B |

Le `num_ctx` Ollama en runtime peut être inférieur (souvent 32K par défaut selon VRAM). Le ring affiche le **max théorique du modèle**, pas la config locale.

## Fallback

Modèle inconnu : **128 000** tokens (`getModelContextWindow`).

## Maintenance

Lors d’un ajout de modèle dans `constants/model.ts` :

1. Renseigner `contextWindow` dans `docs-model-options.ts`
2. Mettre à jour ce fichier
3. Ajuster le test Playwright si le modèle par défaut change (`tests/v1-xulux/reasoning.spec.ts`)
