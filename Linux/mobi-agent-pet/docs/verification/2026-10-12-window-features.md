# Retire edge pinning and mini display — 2026-10-12

## Scope

User requested removing edge pinning and mini display, accepted cross-display sizing, and asked for an explanation of fullscreen. Fullscreen behavior is unchanged. Other authorized work and artwork remain.

## Changes

- Removed edge/mini switches, active profile/prefs/action fields, settings effects/translations and theme mini capability badge. Profile normalization drops retired fields without losing unrelated settings or approval configuration.
- Deleted the actual mini animation/snap runtime. Main no longer initializes, saves, restores or dispatches miniature state; render/input preloads and listeners, exit IPC, menu and theme-reload entry paths are removed.
- Removed pinning margins and overrides; ordinary drag overshoot and rest clamp remain. Old true pinning flags cannot change those bounds.
- Old mini preferences restore valid pre-mini coordinates as an ordinary pet, discard miniature fields, then use normal startup regularization. Raw mini flags cannot suppress input or restore an edge window.
- Renderer direction flips now apply to roaming without miniature state, seam clips, left-edge flips or glyph compensation. Shared optional geometry helpers and imported theme metadata remain compatibility interfaces with no application activation path.
- All three fixed modes enable keep-size-across-displays independent of legacy/Custom preferences; Custom retains its existing switch. Launch pixel size uses effective mode policy, preserving saved frozen pixel dimensions and their origin.

## Verification

- New policy/editor/config migration tests failed before implementation, then passed. Focused suite 570 passed; separate theme-runtime suite 13 passed. Tests also verify retired pinning flags and incoming mini flags cannot change normal clamp/input.
- AgentLog suite 316 passed, Manager suite 79 passed; Manager typecheck/build succeeded. Final upstream suite 6,431 passed, 22 skipped, no failures. Earlier obsolete mini/pinning assertions were removed or replaced; shared behavior coverage remains.
- Independent read-only review: 476 checks passed; no substantive defects. Covered drag, bounds, theme reload, migration, size restore and task cards.
- Private full-main Electron probe `/tmp/mobi-full-window-features-probe.cjs` exited 0: old mini=true/preferences returned to ordinary pre-mini position; no mini preload APIs or exit IPC; eight seconds of idle produced nine frames; idle pickup/drag/release worked; cards retained five-second/outside-click dismissal and window reuse. Custom editor showed 17 switches, seven states, no pin/mini controls; cross-display/fullscreen controls and saved unrelated choices remained. Result `WINDOW_FEATURES_PASS`.
- Separate edge drag probe exited 0 with `EDGE_DRAG_PASS`: release at the physical screen edge returned idle with unchanged dimensions, ordinary visual, no miniature clip or class.
- Edge/startup size probe exited 0 with `EDGE_AND_LAUNCH_SIZE_PASS`: old keepSizeAcrossDisplays=false did not override Normal; saved 200x200 pixels restored and stayed 200x200 after the edge drag.
- Native probes use isolated private preferences, disabled Agent integrations and controlled cursor/button samples. They do not move the real mouse or write user preferences. Native DBus/VAAPI/SSL diagnostics appeared without JS/assertion failures. Cross-display geometry is covered by automated fixtures; the probes did not move the actual cursor between physical monitors.

Earlier documentation of preserved mini behavior is historical and superseded by this decision.
