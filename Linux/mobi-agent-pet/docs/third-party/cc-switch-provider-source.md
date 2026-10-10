# CC Switch provider source map

Pinned source: `farion1231/cc-switch@482f57b335ff15e749893990a132a9e54e4eb8e2` (v3.20.4). License: MIT; see `THIRD_PARTY_NOTICES.md`.

The preset catalog is derived from these eleven source modules under `src/config/`:

| Upstream source |
| --- |
| `claudeProviderPresets.ts` |
| `codexProviderPresets.ts` |
| `geminiProviderPresets.ts` |
| `grokBuildProviderPresets.ts` |
| `claudeDesktopProviderPresets.ts` |
| `opencodeProviderPresets.ts` |
| `openclawProviderPresets.ts` |
| `hermesProviderPresets.ts` |
| `piProviderPresets.ts` |
| `mcodeProviderPresets.ts` |
| `universalProviderPresets.ts` |

All eleven modules were evaluated at the pinned commit and their JSON-compatible preset fields were copied to `src/manager/providers/catalog/presets.json`. The catalog adds stable app-scoped IDs based on source order. Runtime normalization in `src/manager/providers/catalog.ts` keeps the source config structure and labels presets that need CC Switch's proxy or managed OAuth. The only extraction substitute was `GROK_BUILD_DEFAULT_MODEL = "grok-4.5"`, exactly matching `src/utils/grokBuildConfig.ts`; the rest of that utility requires an unrelated TOML dependency.

Provider form behavior to adapt comes from `src/components/providers/AddProviderDialog.tsx`, `src/components/providers/forms/ProviderForm.tsx`, `ProviderPresetSelector.tsx`, the ten tool-specific form modules, and their pure helpers. Each adaptation should be added to this map when copied.

| Upstream behavior | Mobi adaptation |
| --- | --- |
| `src/components/AppSwitcher.tsx`, `src/config/appConfig.tsx`, `src/icons/extracted/{claude,openai}.svg` | `src/manager/providers/ProviderAgentTabs.tsx`, `assets/*.svg` (three selected Agent entries, terminal/desktop badges, OpenAI display label) |
| `src/components/providers/AddProviderDialog.tsx`, `forms/ProviderForm.tsx`, `forms/ProviderPresetSelector.tsx` | `src/manager/providers/ProviderPage.tsx`, `forms/ProviderEditor.tsx`, `forms/ProviderPresetPicker.tsx` |
| `src/components/providers/forms/{ClaudeFormFields,CodexFormFields,GeminiFormFields,GrokBuildProviderForm,ClaudeDesktopProviderForm,OpenCodeFormFields,OpenClawFormFields,HermesFormFields,PiProviderForm,McodeProviderForm}.tsx` | `src/manager/providers/forms/ProviderFields.tsx`, `ProviderToolOptions.tsx`, `ProviderModelList.tsx`, `StructuredProviderFields.tsx` (native connection paths, protocol fields, model entries, editable preset fields and raw configuration fallback; tool-specific upstream layouts are not yet fully ported) |
| `src/lib/api/providers.ts` provider sorting and import actions | `runtime/agentlog/providers/repository.cjs`, `profile-transfer.cjs`, `src/manager/providers/ProviderPage.tsx` (public export only) |
| `src-tauri/src/live/project/claude.rs`, `src-tauri/src/live/floor.rs`, `src-tauri/src/services/provider/claude_direct.rs` | `runtime/agentlog/providers/adapters/claude.cjs` |
| `src-tauri/src/live/project/codex.rs`, `src-tauri/src/live/floor.rs` | `runtime/agentlog/providers/adapters/codex.cjs`, `codex-toml-patch.cjs` |
| `src-tauri/src/live/project/gemini.rs`, `src-tauri/src/live/floor.rs` | `runtime/agentlog/providers/adapters/gemini.cjs` |
| `src-tauri/src/live/project/grok.rs`, `src/utils/grokBuildConfig.ts` | `runtime/agentlog/providers/adapters/grokbuild.cjs` |
| `src-tauri/src/claude_desktop_config.rs` | `runtime/agentlog/providers/adapters/claude-desktop.cjs` (Mobi profile ID and direct mode) |
| `src-tauri/src/opencode_config.rs`, `openclaw_config.rs`, `hermes_config.rs`, `pi_config/mod.rs`, `mcode_config.rs` | `runtime/agentlog/providers/adapters/coexisting.cjs` |
| `src-tauri/src/services/balance.rs` | `runtime/agentlog/providers/balance-query.cjs` (fixed-host balance templates and normalization) |

Release scope and remaining form adaptations are recorded in `docs/verification/2026-10-08-provider-management-0.1.28.md`. The desktop provider smoke script uses disposable credentials and a temporary HOME to exercise persistence and native config writes through the renderer IPC.
