"""Telegram controls owned and deployed by Hermes Console.

This is a user plugin, deliberately installed outside the Hermes Agent source
tree.  It keeps the native provider/model picker and inserts a provider-aware
reasoning step before committing the model switch.  It also forwards the
explicit ``/work`` command through the local Hermes Console Edge so Telegram
remains owned by the Hermes gateway instead of a competing Bot API webhook.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


_log = logging.getLogger("hermes_console_control")

# A Console command that declines is indistinguishable from one that was never
# routed: the gateway simply carries on and answers something else. Saying which
# guard declined turns "it does not work" into one grep.
def _decline(command: str, reason: str) -> None:
    _log.info("hermes-console-control: /%s not handled (%s)", command, reason)


_PENDING_TASKS: set[Any] = set()
_PLUGIN_MARKER = "_hermes_console_control_model_picker"
_PICKER_CONTEXT: dict[tuple[int, str], dict[str, Any]] = {}
_PENDING_EFFORT: dict[tuple[int, str], dict[str, Any]] = {}
_PENDING_TTL_SECONDS = 180
_DEFAULT_EDGE_URL = "http://127.0.0.1:8787"
_DEFAULT_RUNTIME_TOKEN = "hermes-console-local-runtime"


def _platform_name(source: Any) -> str:
    platform = getattr(source, "platform", "")
    return str(getattr(platform, "value", platform) or "").strip().lower()


def _reasoning_options(provider: str, model: str) -> tuple[str, ...]:
    """Mirror the provider-aware policy maintained by Hermes Console."""
    normalized_provider = (provider or "").strip().lower()
    normalized_model = (model or "").strip().lower()
    if normalized_provider in {"openai", "openai-api", "openai-codex"}:
        if re.match(r"^(?:gpt-5(?:\.[0-9]+)?|codex|o[134](?:-|$))", normalized_model):
            return ("low", "medium", "high", "xhigh")
        return ()

    if normalized_provider not in {"anthropic", "claude"}:
        return ()
    if re.search(r"claude-(?:opus|sonnet)-4[-.]6", normalized_model):
        return ("low", "medium", "high", "max")
    if re.search(r"(?:claude-fable|claude-(?:opus|sonnet)-4[-.](?:[789]|\d{2,}))", normalized_model):
        return ("low", "medium", "high", "xhigh", "max")
    if re.search(r"claude-(?:opus|sonnet|haiku)-(?:3|4[-.](?:0|1|5)|4-2025)", normalized_model):
        return ("low", "medium", "high", "xhigh")
    return ()


def _scope_label(is_session: bool) -> str:
    return "session Telegram" if is_session else "profil global"


def _effort_label(effort: str) -> str:
    return {
        "low": "Low",
        "medium": "Medium",
        "high": "High",
        "xhigh": "Extra high",
        "max": "Max",
    }.get(effort, effort)


def _work_brief(text: str) -> dict[str, str] | None:
    description = (text or "").strip()[:40_000]
    if not description:
        return None
    first_line = description.splitlines()[0].strip()
    title = (first_line or description)[:240].strip()
    return {"title": title, "description": description} if title else None


def _edge_base_url() -> str:
    base = (
        os.getenv("HERMES_CONSOLE_EDGE_URL", "").strip()
        or os.getenv("HERMES_EDGE_LOCAL_URL", "").strip()
        or _DEFAULT_EDGE_URL
    ).rstrip("/")
    parsed = urlsplit(base)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise RuntimeError("URL Edge Hermes Console invalide.")
    return base


def _edge_endpoint() -> str:
    return f"{_edge_base_url()}/v1/work/telegram"


def _mission_endpoint() -> str:
    return f"{_edge_base_url()}/v1/agents/mission/telegram"


def _agent_endpoint() -> str:
    return f"{_edge_base_url()}/v1/agents/create/telegram"


def _runtime_token() -> str:
    return (
        os.getenv("HERMES_DASHBOARD_SESSION_TOKEN", "").strip()
        or os.getenv("HERMES_RUNTIME_TOKEN", "").strip()
        or _DEFAULT_RUNTIME_TOKEN
    )


def _post_edge_command_sync(url: str, payload: dict[str, Any], rejection: str) -> dict[str, Any]:
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    token = _runtime_token()
    request = Request(
        url,
        data=body,
        method="POST",
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            "X-Hermes-Session-Token": token,
        },
    )
    try:
        with urlopen(request, timeout=15) as response:
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        try:
            error = json.loads(exc.read().decode("utf-8")).get("error")
        except Exception:
            error = None
        raise RuntimeError(str(error or rejection)) from None
    except (URLError, TimeoutError, OSError):
        raise RuntimeError("Hermes Console est inaccessible depuis le gateway.") from None
    if not isinstance(result, dict):
        raise RuntimeError("Réponse Hermes Console invalide.")
    return result


def _post_work_command_sync(payload: dict[str, Any]) -> dict[str, Any]:
    return _post_edge_command_sync(
        _edge_endpoint(), payload, "Hermes Console a refusé la création Work."
    )


def _post_mission_command_sync(payload: dict[str, Any]) -> dict[str, Any]:
    return _post_edge_command_sync(
        _mission_endpoint(), payload, "Hermes Console a refusé la mise à jour de la mission."
    )


def _post_agent_command_sync(payload: dict[str, Any]) -> dict[str, Any]:
    return _post_edge_command_sync(
        _agent_endpoint(), payload, "Hermes Console a refusé la création de l’agent."
    )


# Singulier et pluriel font la même chose. Hermes réserve nativement `/agents`
# aux runs en cours, mais dans une Console « mes agents » désigne le roster :
# faire dépendre le sens d'un « s » est un piège, pas une fonctionnalité. La vue
# native reste accessible sous son alias `/tasks`, que Hermes fournit déjà.
_AGENT_COMMANDS = ("agent", "agents")

_AGENT_USAGE = (
    "Usage :\n"
    "/agent — liste les agents Console\n"
    "/agent new <nom> — <mission>\n\n"
    "(/tasks affiche les runs Hermes en cours.)"
)


# Hermes normalizes command arguments before a plugin ever sees them
# (`MessageEvent.get_command_args`, gateway/platforms/base.py): iOS autocorrects
# `--` to an em dash, so Hermes converts it back — em dash to `--`, en dash to
# `-`. The separator we document (`—`) therefore arrives as `--`, and matching
# only the typographic dashes would silently fold the mission into the name.
# A bare `-` is deliberately NOT a separator: it is legitimate inside a name.
_AGENT_SEPARATORS = ("--", "—", "–", ":")


def _agent_brief(text: str) -> dict[str, str] | None:
    """Parse ``new <nom> — <mission>``.

    A missing separator is a name-only creation, which is legitimate — the
    mission can be set later with ``/mission``.
    """
    body = (text or "").strip()
    if not body:
        return None
    head, _, rest = body.partition(" ")
    if head.strip().lower() != "new":
        return None
    rest = rest.strip()
    if not rest:
        return None
    for separator in _AGENT_SEPARATORS:
        name, found, mission = rest.partition(separator)
        if found:
            return {"name": name.strip()[:80], "mission": mission.strip()[:500]}
    return {"name": rest[:80], "mission": ""}


async def _deliver_notice(gateway: Any, source: Any, text: str) -> None:
    deliver = getattr(gateway, "_deliver_platform_notice", None)
    if callable(deliver):
        await deliver(source, text)
        return
    adapter = getattr(gateway, "adapters", {}).get(getattr(source, "platform", None))
    if adapter is not None:
        await adapter.send(str(getattr(source, "chat_id", "") or ""), text)


def _resolve_profile(source: Any, gateway: Any) -> str:
    active_profile = getattr(gateway, "_active_profile_name", None)
    fallback_profile = active_profile() if callable(active_profile) else ""
    return str(
        getattr(source, "profile", "")
        or fallback_profile
        or os.getenv("HERMES_PROFILE", "")
        or "default"
    )


async def _handle_work_command(event: Any, gateway: Any, brief: dict[str, str]) -> None:
    source = event.source
    payload: dict[str, Any] = {
        "profile": _resolve_profile(source, gateway),
        **brief,
        "telegramUserId": str(getattr(source, "user_id", "") or ""),
        "telegramChatId": str(getattr(source, "chat_id", "") or ""),
    }
    message_id = getattr(event, "message_id", None) or getattr(source, "message_id", None)
    if message_id is not None:
        payload["telegramMessageId"] = str(message_id)
    update_id = getattr(event, "platform_update_id", None)
    if isinstance(update_id, int):
        payload["telegramUpdateId"] = update_id

    notice: str
    try:
        result = await asyncio.to_thread(_post_work_command_sync, payload)
        item = result.get("item") if isinstance(result.get("item"), dict) else {}
        run = result.get("run") if isinstance(result.get("run"), dict) else None
        key = str(item.get("key") or "").strip()
        label = f"Tâche {key}" if key else "Tâche"
        suffix = " — run lancé." if run and run.get("id") else "."
        notice = f"✅ {label} créée et assignée{suffix}"
    except Exception as exc:
        detail = str(exc).strip()[:300] or "Création Work impossible."
        notice = f"⚠️ {detail}"
    try:
        await _deliver_notice(gateway, source, notice)
    except Exception:
        # The Work mutation is already final. A failed acknowledgement must not
        # re-enter native dispatch or cause the Telegram update to be retried.
        pass


async def _handle_mission_command(event: Any, gateway: Any) -> None:
    source = event.source
    mission = (event.get_command_args() or "").strip()
    payload: dict[str, Any] = {
        "profile": _resolve_profile(source, gateway),
        "telegramUserId": str(getattr(source, "user_id", "") or ""),
        "telegramChatId": str(getattr(source, "chat_id", "") or ""),
    }
    # A bare /mission reads. Clearing stays a Console action on purpose: an empty
    # argument here is far more likely to be a slip than an intent to wipe.
    if mission:
        payload["mission"] = mission[:5_000]

    try:
        result = await asyncio.to_thread(_post_mission_command_sync, payload)
        current = str(result.get("mission") or "").strip()
        if not mission:
            notice = (
                f"🎯 Mission actuelle :\n{current}" if current
                else "🎯 Aucune mission définie. Envoie « /mission <texte> » pour en poser une."
            )
        else:
            previous = str(result.get("previous") or "").strip()
            notice = "✅ Mission mise à jour. Elle s’applique aux prochaines conversations."
            if previous:
                notice += f"\n\nAncienne mission (pour revenir en arrière) :\n{previous}"
    except Exception as exc:
        detail = str(exc).strip()[:300] or "Mise à jour de la mission impossible."
        notice = f"⚠️ {detail}"
    try:
        await _deliver_notice(gateway, source, notice)
    except Exception:
        # The mission mutation is already final upstream; a failed acknowledgement
        # must not re-enter native dispatch or retry the Telegram update.
        pass


async def _handle_agent_command(event: Any, gateway: Any, brief: dict[str, str] | None) -> None:
    source = event.source
    payload: dict[str, Any] = {
        "profile": _resolve_profile(source, gateway),
        "telegramUserId": str(getattr(source, "user_id", "") or ""),
        "telegramChatId": str(getattr(source, "chat_id", "") or ""),
    }
    if brief is not None:
        payload["name"] = brief["name"]
        payload["mission"] = brief["mission"]

    try:
        result = await asyncio.to_thread(_post_agent_command_sync, payload)
        if brief is None:
            rows = result.get("agents") if isinstance(result.get("agents"), list) else []
            current = str(result.get("current") or "")
            if not rows:
                notice = "🤖 Aucun agent. Envoie « /agent new <nom> — <mission> » pour en créer un."
            else:
                lines = []
                for row in rows:
                    if not isinstance(row, dict):
                        continue
                    marker = "▸" if str(row.get("profile") or "") == current else " "
                    state = str(row.get("runtimeState") or "")
                    suffix = "" if state == "ready" else f" ({state})"
                    lines.append(f"{marker} {row.get('name')}{suffix}")
                notice = "🤖 Agents :\n" + "\n".join(lines)
        else:
            state = str(result.get("runtimeState") or "")
            notice = f"✅ Agent « {result.get('name')} » créé."
            if state != "ready":
                detail = str(result.get("runtimeError") or "").strip()[:300]
                notice += f"\n⚠️ Runtime : {state}."
                if detail:
                    notice += f"\n{detail}"
    except Exception as exc:
        detail = str(exc).strip()[:300] or "Commande agent impossible."
        notice = f"⚠️ {detail}"
    try:
        await _deliver_notice(gateway, source, notice)
    except Exception:
        # The agent is already provisioned upstream; a failed acknowledgement must
        # not re-enter native dispatch or retry the Telegram update.
        pass


def _prune_pending() -> None:
    cutoff = time.monotonic() - _PENDING_TTL_SECONDS
    for key, value in list(_PENDING_EFFORT.items()):
        if float(value.get("created_at", 0)) < cutoff:
            _PENDING_EFFORT.pop(key, None)


def _callback_user_allowed(query: Any, pending: dict[str, Any]) -> bool:
    expected = str(pending.get("user_id") or "")
    actual = str(getattr(getattr(query, "from_user", None), "id", "") or "")
    return not expected or expected == actual


async def _show_effort_picker(
    *,
    adapter: Any,
    gateway: Any,
    query: Any,
    chat_id: str,
    state: dict[str, Any],
    model_id: str,
    provider_slug: str,
) -> None:
    from telegram import InlineKeyboardButton, InlineKeyboardMarkup

    options = _reasoning_options(provider_slug, model_id)
    if not options:
        # The Console intentionally hides reasoning for unknown/unsupported
        # pairs instead of sending an upstream parameter that may be ignored.
        await adapter._hermes_console_original_model_picker(query, f"mm:{state['model_index']}", chat_id)
        return

    session_key = str(state.get("session_key") or "")
    context = _PICKER_CONTEXT.get((id(adapter), session_key), {})
    is_session = bool(context.get("is_session"))
    source = context.get("source")
    if source is None:
        source = context.get("original_source")

    _prune_pending()
    _PENDING_EFFORT[(id(adapter), chat_id)] = {
        "created_at": time.monotonic(),
        "source": source,
        "session_key": session_key,
        "is_session": is_session,
        "model_id": model_id,
        "provider_slug": provider_slug,
        "on_model_selected": state.get("on_model_selected"),
        "user_id": str(getattr(source, "user_id", "") or ""),
    }

    rows = []
    for index in range(0, len(options), 2):
        rows.append([
            InlineKeyboardButton(
                _effort_label(effort),
                callback_data=f"mg:hc:{effort}",
            )
            for effort in options[index:index + 2]
        ])
    rows.append([
        InlineKeyboardButton("◀ Retour", callback_data="mb"),
        InlineKeyboardButton("✗ Annuler", callback_data="mx"),
    ])

    await query.edit_message_text(
        text=(
            "⚙ Configuration du modèle\n\n"
            f"Modèle : {model_id}\n"
            f"Provider : {provider_slug}\n"
            f"Portée : {_scope_label(is_session)}\n\n"
            "Choisis l’effort de raisonnement :"
        ),
        parse_mode=None,
        reply_markup=InlineKeyboardMarkup(rows),
    )
    await query.answer(text="Choisis l’effort")


async def _apply_combined_selection(
    *,
    adapter: Any,
    gateway: Any,
    query: Any,
    data: str,
    chat_id: str,
) -> None:
    effort = data.removeprefix("mg:hc:").strip().lower()
    pending_key = (id(adapter), chat_id)
    pending = _PENDING_EFFORT.get(pending_key)
    if not pending:
        await query.answer(text="Sélecteur expiré — relance /model.")
        return
    if float(pending.get("created_at", 0)) < time.monotonic() - _PENDING_TTL_SECONDS:
        _PENDING_EFFORT.pop(pending_key, None)
        adapter._model_picker_state.pop(chat_id, None)
        await query.answer(text="Sélecteur expiré — relance /model.")
        return
    if effort not in _reasoning_options(
        str(pending.get("provider_slug") or ""),
        str(pending.get("model_id") or ""),
    ):
        await query.answer(text="Effort invalide.")
        return
    if not _callback_user_allowed(query, pending):
        await query.answer(text="⛔ Ce sélecteur appartient à un autre utilisateur.")
        return

    callback = pending.get("on_model_selected")
    source = pending.get("source")
    if not callable(callback) or source is None:
        _PENDING_EFFORT.pop(pending_key, None)
        await query.answer(text="Sélecteur expiré — relance /model.")
        return

    model_id = str(pending["model_id"])
    provider_slug = str(pending["provider_slug"])
    try:
        model_result = await callback(chat_id, model_id, provider_slug)
    except Exception as exc:
        _PENDING_EFFORT.pop(pending_key, None)
        adapter._model_picker_state.pop(chat_id, None)
        await query.edit_message_text(
            text=f"Impossible de changer de modèle : {exc}",
            parse_mode=None,
            reply_markup=None,
        )
        await query.answer(text="Changement impossible")
        return

    session_key = str(pending.get("session_key") or "")
    override = (getattr(gateway, "_session_model_overrides", {}) or {}).get(session_key, {})
    switched = (
        str(override.get("model") or "") == model_id
        and str(override.get("provider") or "") == provider_slug
    )
    if not switched:
        _PENDING_EFFORT.pop(pending_key, None)
        adapter._model_picker_state.pop(chat_id, None)
        await query.edit_message_text(
            text=str(model_result or "Le changement de modèle a échoué."),
            parse_mode=None,
            reply_markup=None,
        )
        await query.answer(text="Changement impossible")
        return

    from gateway.platforms.base import MessageEvent

    reasoning_text = f"/reasoning {effort}"
    if not pending.get("is_session"):
        reasoning_text += " --global"
    reasoning_event = MessageEvent(text=reasoning_text, source=source)
    reasoning_result = await gateway._handle_reasoning_command(reasoning_event)

    _PENDING_EFFORT.pop(pending_key, None)
    adapter._model_picker_state.pop(chat_id, None)
    _PICKER_CONTEXT.pop((id(adapter), session_key), None)
    await query.edit_message_text(
        text=(
            "✅ Configuration mise à jour\n\n"
            f"Modèle : {model_id}\n"
            f"Provider : {provider_slug}\n"
            f"Effort : {_effort_label(effort)}\n"
            f"Portée : {_scope_label(bool(pending.get('is_session')))}\n\n"
            f"{reasoning_result}"
        ),
        parse_mode=None,
        reply_markup=None,
    )
    await query.answer(text="Modèle et effort appliqués")


def _patch_telegram_adapter(adapter: Any, gateway: Any) -> None:
    if getattr(adapter, _PLUGIN_MARKER, False):
        return

    original = adapter._handle_model_picker_callback
    adapter._hermes_console_original_model_picker = original

    async def wrapped(query: Any, data: str, chat_id: str) -> None:
        pending_key = (id(adapter), chat_id)
        if data.startswith("mg:hc:"):
            await _apply_combined_selection(
                adapter=adapter,
                gateway=gateway,
                query=query,
                data=data,
                chat_id=chat_id,
            )
            return

        if data.startswith(("mb", "mx")):
            _PENDING_EFFORT.pop(pending_key, None)
            current_state = adapter._model_picker_state.get(chat_id) or {}
            if data.startswith("mx"):
                _PICKER_CONTEXT.pop(
                    (id(adapter), str(current_state.get("session_key") or "")),
                    None,
                )
            await original(query, data, chat_id)
            return

        if not data.startswith(("mm:", "mc:")):
            await original(query, data, chat_id)
            return

        state = adapter._model_picker_state.get(chat_id)
        if not state:
            await original(query, data, chat_id)
            return
        try:
            model_index = int(data.split(":", 1)[1])
            model_id = state.get("model_list", [])[model_index]
        except (ValueError, IndexError, TypeError):
            await original(query, data, chat_id)
            return
        provider_slug = str(state.get("selected_provider") or "")
        options = _reasoning_options(provider_slug, str(model_id))
        if not options:
            await original(query, data, chat_id)
            return

        # Preserve Hermes' native expensive-model confirmation.  The confirmed
        # mc:<index> callback returns here and then advances to effort selection.
        if data.startswith("mm:"):
            try:
                from hermes_cli.model_cost_guard import expensive_model_warning

                warning = await asyncio.to_thread(
                    expensive_model_warning,
                    model_id,
                    provider=provider_slug,
                )
            except Exception:
                warning = None
            if warning is not None:
                await original(query, data, chat_id)
                return

        state["model_index"] = model_index
        await _show_effort_picker(
            adapter=adapter,
            gateway=gateway,
            query=query,
            chat_id=chat_id,
            state=state,
            model_id=str(model_id),
            provider_slug=provider_slug,
        )

    adapter._handle_model_picker_callback = wrapped
    setattr(adapter, _PLUGIN_MARKER, True)


def _sender_authorized(event: Any, gateway: Any, command: str) -> bool:
    """Fail-closed gate, evaluated before any work is scheduled.

    The hook runs before Hermes' native authorization, so an unproven sender
    must fall through to the normal pairing/allowlist path rather than be
    silently dropped. Being authorized here is not the authorization decision
    either: the Console re-checks the Owner role before mutating anything.
    """
    source = getattr(event, "source", None)
    authorized = getattr(gateway, "_is_user_authorized", None)
    if source is None:
        _decline(command, "event has no source")
        return False
    if not callable(authorized):
        _decline(command, "gateway has no _is_user_authorized")
        return False
    if not authorized(source):
        _decline(command, f"sender not authorized on the gateway (user_id={getattr(source, 'user_id', '?')})")
        return False
    return True


def _spawn(command: str, coro: Any) -> bool:
    """Hand the network part to the running loop, and say so if we cannot.

    `PluginManager.invoke_hook` calls hooks synchronously and keeps whatever
    they return only when it is a dict, so an `async def` hook is never awaited
    and never runs — silently. The hook is therefore sync: it decides here, and
    only the HTTP call plus the reply are scheduled.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        coro.close()
        _decline(command, "no running event loop")
        return False
    task = loop.create_task(coro)
    # Keep a reference: a task the loop is the only holder of can be collected
    # mid-flight, which would drop the command with no trace.
    _PENDING_TASKS.add(task)
    task.add_done_callback(_PENDING_TASKS.discard)
    return True


def _pre_gateway_dispatch(
    event: Any,
    gateway: Any,
    **_: Any,
) -> dict[str, str] | None:
    platform = _platform_name(getattr(event, "source", None))
    command = str(event.get_command() or "").strip().lower()
    console_command = command in _AGENT_COMMANDS or command in {"work", "mission"}

    if platform != "telegram":
        if console_command:
            _decline(command, f"platform is {platform or 'unknown'}, not telegram")
        return None

    if console_command:
        if not _sender_authorized(event, gateway, command):
            return None
        args = (event.get_command_args() or "").strip()

        if command == "work":
            brief = _work_brief(args)
            if brief is None:
                if not _spawn(command, _deliver_notice(
                    gateway,
                    event.source,
                    "Usage : /work <brief>\nLa première ligne devient le titre de la tâche.",
                )):
                    return None
                return {"action": "skip", "reason": "hermes_console_work_usage"}
            if not _spawn(command, _handle_work_command(event, gateway, brief)):
                return None
            return {"action": "skip", "reason": "hermes_console_work_command"}

        if command == "mission":
            if not _spawn(command, _handle_mission_command(event, gateway)):
                return None
            return {"action": "skip", "reason": "hermes_console_mission_command"}

        brief = _agent_brief(args) if args else None
        if args and brief is None:
            if not _spawn(command, _deliver_notice(gateway, event.source, _AGENT_USAGE)):
                return None
            return {"action": "skip", "reason": "hermes_console_agent_usage"}
        if not _spawn(command, _handle_agent_command(event, gateway, brief)):
            return None
        return {"action": "skip", "reason": "hermes_console_agent_command"}

    if command != "model":
        return None

    source = event.source
    adapter = gateway.adapters.get(source.platform)
    if adapter is None or not hasattr(adapter, "_handle_model_picker_callback"):
        return None
    _patch_telegram_adapter(adapter, gateway)

    raw_args = event.get_command_args().strip()
    try:
        from hermes_cli.model_switch import parse_model_flags

        model_input, explicit_provider, _, _, is_session = parse_model_flags(raw_args)
    except Exception:
        model_input = ""
        explicit_provider = ""
        is_session = "--session" in raw_args.split()
    if model_input or explicit_provider:
        return None

    # Called directly rather than through a thread: the picker context has to be
    # in place before native dispatch reaches the model picker, and this hook is
    # the last synchronous point where that ordering is guaranteed.
    try:
        normalized_source = gateway._normalize_source_for_session_key(source)
    except Exception:
        normalized_source = source
    session_key = gateway._session_key_for_source(normalized_source)
    _PICKER_CONTEXT[(id(adapter), session_key)] = {
        "is_session": bool(is_session),
        "source": normalized_source,
        "original_source": source,
    }
    return None


def _console_command_help(usage: str):
    """Fallback outside the gateway.

    The real handlers are the ``pre_gateway_dispatch`` hook, which needs the
    Telegram identity of the sender for the Console to authorize the request.
    Registering the commands is what puts them in the Telegram menu (built from
    ``COMMAND_REGISTRY`` plus plugin commands); these bodies only run where no
    such identity exists, e.g. the CLI.
    """
    def handler(_raw_args: str) -> str:
        return f"{usage}\n\nDisponible depuis Telegram ou la Console."
    return handler


# No args_hint anywhere: a plugin command that declares a required argument is
# dropped from the Telegram menu (`telegram_bot_commands`), and each of these
# three does something useful with no argument — list, show usage, read.
_MENU_COMMANDS = (
    ("agent", "Agents Console : liste, ou « new <nom> — <mission> »", _AGENT_USAGE),
    ("work", "Créer une tâche Console à partir d’un brief", "Usage : /work <brief>"),
    ("mission", "Lire ou remplacer la mission de l’agent", "Usage : /mission [texte]"),
)


def register(ctx: Any) -> None:
    ctx.register_hook("pre_gateway_dispatch", _pre_gateway_dispatch)
    register_command = getattr(ctx, "register_command", None)
    if not callable(register_command):
        return
    for name, description, usage in _MENU_COMMANDS:
        register_command(name, _console_command_help(usage), description=description)
