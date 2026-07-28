import asyncio
import importlib.util
import pathlib
import sys
import types
import unittest
from unittest.mock import patch


PLUGIN_PATH = pathlib.Path(__file__).with_name("__init__.py")
SPEC = importlib.util.spec_from_file_location("hermes_console_control_tested", PLUGIN_PATH)
PLUGIN = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(PLUGIN)


async def _dispatch(plugin, event, gateway):
    """Drive the now-synchronous hook and drain the work it scheduled.

    `PluginManager.invoke_hook` never awaits, so the hook returns immediately
    and hands the network part to the loop; tests have to wait for it.
    """
    result = plugin._pre_gateway_dispatch(event, gateway)
    pending = list(plugin._PENDING_TASKS)
    if pending:
        await asyncio.gather(*pending)
    return result


class ReasoningPolicyTests(unittest.TestCase):
    def test_openai_codex_gpt_models_expose_console_efforts(self):
        self.assertEqual(
            PLUGIN._reasoning_options("openai-codex", "gpt-5.6-luna"),
            ("low", "medium", "high", "xhigh"),
        )

    def test_claude_46_does_not_offer_xhigh(self):
        self.assertEqual(
            PLUGIN._reasoning_options("anthropic", "claude-opus-4-6"),
            ("low", "medium", "high", "max"),
        )

    def test_unknown_pairs_hide_reasoning(self):
        self.assertEqual(PLUGIN._reasoning_options("google", "gemini-2.5-pro"), ())


class _Platform:
    value = "telegram"


class _Source:
    platform = _Platform()
    user_id = "42"
    chat_id = "100"
    profile = "tenant-agent"


class _Event:
    def __init__(self, text="/model", source=None):
        self.text = text
        self.source = source or _Source()
        self.message_id = "77"
        self.platform_update_id = 88

    def get_command(self):
        return self.text.split()[0].lstrip("/")

    def get_command_args(self):
        return self.text.partition(" ")[2]


class _Button:
    def __init__(self, text, callback_data):
        self.text = text
        self.callback_data = callback_data


class _Markup:
    def __init__(self, rows):
        self.inline_keyboard = rows


class _Query:
    def __init__(self):
        self.from_user = types.SimpleNamespace(id=42)
        self.edits = []
        self.answers = []

    async def edit_message_text(self, **kwargs):
        self.edits.append(kwargs)

    async def answer(self, text=None):
        self.answers.append(text)


class _Adapter:
    def __init__(self):
        self._model_picker_state = {}
        self.original_calls = []

    async def _handle_model_picker_callback(self, query, data, chat_id):
        self.original_calls.append((data, chat_id))


class _Gateway:
    def __init__(self, adapter, authorized=True):
        self.adapters = {_Source.platform: adapter}
        self._session_model_overrides = {}
        self.reasoning_events = []
        self.authorized = authorized
        self.notices = []

    def _normalize_source_for_session_key(self, source):
        return source

    def _session_key_for_source(self, source):
        return f"telegram:{source.chat_id}:{source.user_id}"

    def _active_profile_name(self):
        return "active-profile"

    async def _handle_reasoning_command(self, event):
        self.reasoning_events.append(event.text)
        return "Effort appliqué"

    def _is_user_authorized(self, _source):
        return self.authorized

    async def _deliver_platform_notice(self, source, text):
        self.notices.append((source.chat_id, text))


class TelegramWorkFlowTests(unittest.IsolatedAsyncioTestCase):
    async def test_authorized_work_command_uses_edge_and_skips_native_dispatch(self):
        gateway = _Gateway(_Adapter())
        event = _Event("/work Corriger la pagination\nAjouter le test de régression")
        response = {
            "item": {"id": "item-1", "key": "TASK-12"},
            "run": {"id": "run-1"},
        }

        with patch.object(PLUGIN, "_post_work_command_sync", return_value=response) as post:
            result = await _dispatch(PLUGIN, event, gateway)

        self.assertEqual(result, {"action": "skip", "reason": "hermes_console_work_command"})
        payload = post.call_args.args[0]
        self.assertEqual(payload["profile"], "tenant-agent")
        self.assertEqual(payload["title"], "Corriger la pagination")
        self.assertEqual(payload["description"], "Corriger la pagination\nAjouter le test de régression")
        self.assertEqual(payload["telegramUserId"], "42")
        self.assertEqual(payload["telegramMessageId"], "77")
        self.assertEqual(payload["telegramUpdateId"], 88)
        self.assertIn("TASK-12", gateway.notices[-1][1])
        self.assertIn("run lancé", gateway.notices[-1][1])

    async def test_unauthorized_work_command_falls_through_to_native_auth(self):
        gateway = _Gateway(_Adapter(), authorized=False)
        with patch.object(PLUGIN, "_post_work_command_sync") as post:
            result = await _dispatch(PLUGIN, _Event("/work Ne doit pas partir"), gateway)
        self.assertIsNone(result)
        post.assert_not_called()
        self.assertEqual(gateway.notices, [])

    async def test_empty_work_command_returns_usage_without_calling_edge(self):
        gateway = _Gateway(_Adapter())
        with patch.object(PLUGIN, "_post_work_command_sync") as post:
            result = await _dispatch(PLUGIN, _Event("/work"), gateway)
        self.assertEqual(result, {"action": "skip", "reason": "hermes_console_work_usage"})
        post.assert_not_called()
        self.assertIn("Usage : /work", gateway.notices[-1][1])

    async def test_work_uses_gateway_active_profile_when_source_is_unstamped(self):
        gateway = _Gateway(_Adapter())
        source = _Source()
        source.profile = None
        with patch.object(
            PLUGIN,
            "_post_work_command_sync",
            return_value={"item": {"key": "TASK-1"}, "run": None},
        ) as post:
            await _dispatch(PLUGIN, _Event("/work Tester", source), gateway)
        self.assertEqual(post.call_args.args[0]["profile"], "active-profile")


class TelegramMissionFlowTests(unittest.IsolatedAsyncioTestCase):
    async def test_bare_mission_command_reads_without_sending_a_mission(self):
        gateway = _Gateway(_Adapter())
        with patch.object(
            PLUGIN,
            "_post_mission_command_sync",
            return_value={"name": "Prospection", "mission": "Qualifier les leads entrants."},
        ) as post:
            result = await _dispatch(PLUGIN, _Event("/mission"), gateway)

        self.assertEqual(result, {"action": "skip", "reason": "hermes_console_mission_command"})
        payload = post.call_args.args[0]
        self.assertNotIn("mission", payload)
        self.assertEqual(payload["profile"], "tenant-agent")
        self.assertEqual(payload["telegramUserId"], "42")
        self.assertIn("Qualifier les leads entrants.", gateway.notices[-1][1])

    async def test_mission_update_sends_the_text_and_echoes_the_previous_one(self):
        gateway = _Gateway(_Adapter())
        event = _Event("/mission Tu es un agent de prospection B2B.")
        with patch.object(
            PLUGIN,
            "_post_mission_command_sync",
            return_value={
                "name": "Prospection",
                "mission": "Tu es un agent de prospection B2B.",
                "previous": "Assistant généraliste.",
            },
        ) as post:
            result = await _dispatch(PLUGIN, event, gateway)

        self.assertEqual(result, {"action": "skip", "reason": "hermes_console_mission_command"})
        self.assertEqual(post.call_args.args[0]["mission"], "Tu es un agent de prospection B2B.")
        notice = gateway.notices[-1][1]
        self.assertIn("Mission mise à jour", notice)
        self.assertIn("Assistant généraliste.", notice)

    async def test_unauthorized_mission_command_falls_through_to_native_auth(self):
        gateway = _Gateway(_Adapter(), authorized=False)
        with patch.object(PLUGIN, "_post_mission_command_sync") as post:
            result = await _dispatch(PLUGIN, _Event("/mission Prise de contrôle"), gateway)
        self.assertIsNone(result)
        post.assert_not_called()
        self.assertEqual(gateway.notices, [])

    async def test_console_rejection_is_reported_without_touching_dispatch(self):
        gateway = _Gateway(_Adapter())
        with patch.object(
            PLUGIN,
            "_post_mission_command_sync",
            side_effect=RuntimeError("Runtime Hermes indisponible : mission inchangée."),
        ):
            result = await _dispatch(PLUGIN, _Event("/mission Nouvelle"), gateway)
        self.assertEqual(result, {"action": "skip", "reason": "hermes_console_mission_command"})
        self.assertIn("mission inchangée", gateway.notices[-1][1])


class AgentBriefTests(unittest.TestCase):
    def test_em_dash_separates_name_from_mission(self):
        self.assertEqual(
            PLUGIN._agent_brief("new Prospect B2B — Qualifie les TPE françaises."),
            {"name": "Prospect B2B", "mission": "Qualifie les TPE françaises."},
        )

    def test_colon_and_en_dash_are_accepted_too(self):
        self.assertEqual(PLUGIN._agent_brief("new Reviewer : Relit le code.")["mission"], "Relit le code.")
        self.assertEqual(PLUGIN._agent_brief("new Reviewer – Relit le code.")["mission"], "Relit le code.")

    def test_double_hyphen_is_the_separator_telegram_actually_delivers(self):
        """Hermes rewrites an em dash to `--` in command args before the plugin
        sees them (gateway/platforms/base.py). Matching only `—` folded the
        whole mission into the agent name."""
        self.assertEqual(
            PLUGIN._agent_brief("new Prospect B2B -- Qualifie les TPE."),
            {"name": "Prospect B2B", "mission": "Qualifie les TPE."},
        )

    def test_a_single_hyphen_stays_part_of_the_name(self):
        self.assertEqual(PLUGIN._agent_brief("new Prospect-B2B"), {"name": "Prospect-B2B", "mission": ""})

    def test_name_without_separator_creates_an_agent_without_mission(self):
        self.assertEqual(PLUGIN._agent_brief("new Prospect"), {"name": "Prospect", "mission": ""})

    def test_anything_but_new_is_not_a_creation(self):
        self.assertIsNone(PLUGIN._agent_brief("list"))
        self.assertIsNone(PLUGIN._agent_brief("new"))


class TelegramAgentFlowTests(unittest.IsolatedAsyncioTestCase):
    async def test_bare_agent_command_lists_without_creating(self):
        gateway = _Gateway(_Adapter())
        with patch.object(
            PLUGIN,
            "_post_agent_command_sync",
            return_value={
                "current": "tenant-agent",
                "agents": [
                    {"name": "Assistant", "profile": "tenant-agent", "runtimeState": "ready"},
                    {"name": "Prospect", "profile": "tenant-prospect", "runtimeState": "setup_required"},
                ],
            },
        ) as post:
            result = await _dispatch(PLUGIN, _Event("/agent"), gateway)

        self.assertEqual(result, {"action": "skip", "reason": "hermes_console_agent_command"})
        payload = post.call_args.args[0]
        self.assertNotIn("name", payload)
        self.assertEqual(payload["profile"], "tenant-agent")
        notice = gateway.notices[-1][1]
        self.assertIn("▸ Assistant", notice)
        self.assertIn("Prospect (setup_required)", notice)

    async def test_creation_sends_name_and_mission(self):
        gateway = _Gateway(_Adapter())
        event = _Event("/agent new Prospect B2B — Qualifie les TPE françaises.")
        with patch.object(
            PLUGIN,
            "_post_agent_command_sync",
            return_value={"name": "Prospect B2B", "runtimeState": "ready"},
        ) as post:
            result = await _dispatch(PLUGIN, event, gateway)

        self.assertEqual(result, {"action": "skip", "reason": "hermes_console_agent_command"})
        payload = post.call_args.args[0]
        self.assertEqual(payload["name"], "Prospect B2B")
        self.assertEqual(payload["mission"], "Qualifie les TPE françaises.")
        self.assertIn("Prospect B2B", gateway.notices[-1][1])

    async def test_a_half_provisioned_agent_is_reported_not_celebrated(self):
        gateway = _Gateway(_Adapter())
        with patch.object(
            PLUGIN,
            "_post_agent_command_sync",
            return_value={
                "name": "Prospect",
                "runtimeState": "setup_required",
                "runtimeError": "Runtime Hermes injoignable.",
            },
        ):
            await _dispatch(PLUGIN, _Event("/agent new Prospect"), gateway)
        notice = gateway.notices[-1][1]
        self.assertIn("setup_required", notice)
        self.assertIn("Runtime Hermes injoignable.", notice)

    async def test_plural_agents_is_the_same_command(self):
        gateway = _Gateway(_Adapter())
        with patch.object(
            PLUGIN,
            "_post_agent_command_sync",
            return_value={"current": "tenant-agent", "agents": []},
        ) as post:
            result = await _dispatch(PLUGIN, _Event("/agents"), gateway)
        self.assertEqual(result, {"action": "skip", "reason": "hermes_console_agent_command"})
        post.assert_called_once()

    async def test_malformed_argument_returns_usage_without_calling_edge(self):
        gateway = _Gateway(_Adapter())
        with patch.object(PLUGIN, "_post_agent_command_sync") as post:
            result = await _dispatch(PLUGIN, _Event("/agent supprime tout"), gateway)
        self.assertEqual(result, {"action": "skip", "reason": "hermes_console_agent_usage"})
        post.assert_not_called()
        self.assertIn("/agent new", gateway.notices[-1][1])

    async def test_unauthorized_agent_command_falls_through_to_native_auth(self):
        gateway = _Gateway(_Adapter(), authorized=False)
        with patch.object(PLUGIN, "_post_agent_command_sync") as post:
            result = await _dispatch(PLUGIN, _Event("/agent new Intrus"), gateway)
        self.assertIsNone(result)
        post.assert_not_called()
        self.assertEqual(gateway.notices, [])

    async def test_console_refusal_is_reported_without_touching_dispatch(self):
        gateway = _Gateway(_Adapter())
        with patch.object(
            PLUGIN,
            "_post_agent_command_sync",
            side_effect=RuntimeError("Seul un Owner peut créer un agent."),
        ):
            result = await _dispatch(PLUGIN, _Event("/agent new Prospect"), gateway)
        self.assertEqual(result, {"action": "skip", "reason": "hermes_console_agent_command"})
        self.assertIn("Seul un Owner", gateway.notices[-1][1])


class RegistrationTests(unittest.TestCase):
    def test_console_commands_are_registered_without_an_args_hint(self):
        """A plugin command declaring a required argument is dropped from the
        Telegram menu, and each of these does something useful with no argument."""
        registered = {}
        hooks = {}

        class _Ctx:
            def register_hook(self, name, handler):
                hooks[name] = handler

            def register_command(self, name, handler, description="", args_hint=""):
                registered[name] = {"handler": handler, "description": description, "args_hint": args_hint}

        PLUGIN.register(_Ctx())
        self.assertIn("pre_gateway_dispatch", hooks)
        self.assertEqual(sorted(registered), ["agent", "mission", "work"])
        for name, meta in registered.items():
            self.assertEqual(meta["args_hint"], "", name)
            self.assertTrue(meta["description"], name)
            self.assertIn("Usage", meta["handler"](""), name)

    def test_the_hook_is_not_a_coroutine_function(self):
        """`PluginManager.invoke_hook` does `ret = cb(**kwargs)` and keeps the
        result only when it is a dict. An `async def` hook therefore returns an
        un-awaited coroutine that is silently discarded: every Console command
        stops working, with no error and no log line."""
        self.assertFalse(asyncio.iscoroutinefunction(PLUGIN._pre_gateway_dispatch))

    def test_registration_survives_a_context_without_register_command(self):
        hooks = {}

        class _OldCtx:
            def register_hook(self, name, handler):
                hooks[name] = handler

        PLUGIN.register(_OldCtx())
        self.assertIn("pre_gateway_dispatch", hooks)


class TelegramPickerFlowTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        PLUGIN._PICKER_CONTEXT.clear()
        PLUGIN._PENDING_EFFORT.clear()
        telegram = types.ModuleType("telegram")
        telegram.InlineKeyboardButton = _Button
        telegram.InlineKeyboardMarkup = _Markup
        sys.modules["telegram"] = telegram

        gateway_base = types.ModuleType("gateway.platforms.base")
        gateway_base.MessageEvent = _Event
        sys.modules["gateway"] = types.ModuleType("gateway")
        sys.modules["gateway.platforms"] = types.ModuleType("gateway.platforms")
        sys.modules["gateway.platforms.base"] = gateway_base

    def tearDown(self):
        for name in ("telegram", "gateway.platforms.base", "gateway.platforms", "gateway"):
            sys.modules.pop(name, None)

    async def test_model_selection_is_staged_until_effort_is_selected(self):
        adapter = _Adapter()
        gateway = _Gateway(adapter)
        await _dispatch(PLUGIN, _Event(), gateway)
        session_key = "telegram:100:42"

        async def on_model_selected(_chat_id, model_id, provider_slug):
            gateway._session_model_overrides[session_key] = {
                "model": model_id,
                "provider": provider_slug,
            }
            return "Modèle appliqué"

        adapter._model_picker_state["100"] = {
            "session_key": session_key,
            "model_list": ["gpt-5.6-luna"],
            "selected_provider": "openai-codex",
            "on_model_selected": on_model_selected,
        }
        query = _Query()

        await adapter._handle_model_picker_callback(query, "mm:0", "100")

        self.assertEqual(gateway._session_model_overrides, {})
        effort_callbacks = [
            button.callback_data
            for row in query.edits[-1]["reply_markup"].inline_keyboard
            for button in row
        ]
        self.assertIn("mg:hc:high", effort_callbacks)

        await adapter._handle_model_picker_callback(query, "mg:hc:high", "100")

        self.assertEqual(
            gateway._session_model_overrides[session_key],
            {"model": "gpt-5.6-luna", "provider": "openai-codex"},
        )
        self.assertEqual(gateway.reasoning_events, ["/reasoning high --global"])
        self.assertIn("Effort : High", query.edits[-1]["text"])
        self.assertNotIn("100", adapter._model_picker_state)


if __name__ == "__main__":
    unittest.main()
