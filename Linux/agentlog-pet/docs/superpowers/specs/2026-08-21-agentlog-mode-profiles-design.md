# AgentLog Mode Profiles Design

## 1. Purpose

AgentLog provides three built-in runtime modes and one user-defined mode. A mode temporarily changes how the desktop pet and Agent notifications behave without overwriting the user's saved preferences.

Every application launch starts in Normal Mode. The previously active runtime mode is never restored after restart.

## 2. Built-in Modes

The Chinese menu names are:

- 常规模式 (Normal Mode)
- 后台模式 (Background Mode)
- 自动模式 (Automatic Mode)

The old names 休眠模式 and 极简模式 are removed from the mode menu.

| Capability | Normal Mode | Background Mode | Automatic Mode |
| --- | --- | --- | --- |
| Pet base state | Normal | Static resting state | Normal |
| Agent work animations | Follow Agent state | Off | On |
| Pet movement and interaction effects | Follow saved settings | Static; menu interaction remains | Follow saved settings |
| Completion animation | Follow saved settings | Off | On; the only completion alert |
| Sound | Follow saved settings | Off | Off |
| Tray icon flashing | Follow saved settings | Off | Off |
| Permission bubbles | Follow saved settings | Off | Off |
| Completion and waiting bubbles | Follow saved settings | Off | Off |
| Update prompts | Follow saved settings | Off | Off |
| Session HUD | Follow saved settings | Off | Off |
| Agent permission handling | Follow saved permission setting | Native Agent UI; manual decision | Automatically approve new requests |
| Project detection, recording, timing, and summary collection | Always on | Always on | Always on |

Background Mode means that AgentLog remains operational in the background without presenting alerts. It does not grant additional permission to an Agent. If an Agent needs approval, the request falls back to the Agent's native terminal or chat interface and waits for the user.

Automatic Mode means that the user temporarily delegates permission handling to AgentLog. It remains visually quiet except for normal pet work animations and a pet completion animation.

## 3. Runtime Override Model

Modes are a runtime override layer above persisted preferences.

- Normal Mode has no overrides and reads the user's saved preferences directly.
- Background Mode and Automatic Mode compute effective runtime values without writing those values back to preferences.
- Returning to Normal Mode immediately restores the behavior implied by the saved preferences.
- Changes made in Settings remain persisted even while an overriding mode is active. They become visible when the user returns to Normal Mode.

The mode controller owns the active mode and exposes effective behavior flags to the existing sound, tray, bubble, HUD, pet-state, and permission paths. Individual features must not infer a mode from unrelated flags such as do-not-disturb or mini mode.

## 4. Permission Safety

Automatic Mode requires an explicit risk confirmation.

- Each application launch starts in Normal Mode with no automatic-mode authorization.
- The first attempt to enter Automatic Mode during that application run shows a confirmation dialog.
- After confirmation, the user may leave and re-enter Automatic Mode during the same run without another dialog.
- Authorization is memory-only and expires when the application exits.
- Switching to Automatic Mode affects only permission requests received after the switch.
- A request already waiting in an Agent's native UI remains manual and is never retroactively approved.
- Leaving Automatic Mode immediately disables automatic approval for subsequent requests.

If confirmation is declined or cannot be displayed, AgentLog remains in the previous mode.

## 5. Switching Behavior

Mode changes take effect immediately and rebuild both the pet context menu and tray menu.

Entering Background Mode:

1. Stop any active tray flashing.
2. Dismiss AgentLog-owned permission, completion, waiting, and update bubbles without making a permission decision.
3. Hide the session HUD.
4. Stop future sounds and visual alerts.
5. Put the pet into its static resting state.

Entering Automatic Mode:

1. Complete the authorization flow when required.
2. Stop any active tray flashing.
3. Dismiss AgentLog-owned bubbles without making a decision on requests that predate the switch.
4. Hide the session HUD and future update prompts.
5. Keep Agent work animations and pet completion animations active.
6. Automatically approve only new permission requests while this mode remains active.

Returning to Normal Mode:

1. Remove all runtime overrides.
2. Restore sound, tray, bubble, HUD, movement, and permission behavior from saved preferences.
3. Resolve the pet's current visual state from active Agent sessions.

Project detection, event ingestion, timing, and summary collection continue during every transition.

## 6. Custom Mode Boundary

The menu keeps one Custom Mode entry and one Edit Custom Mode entry. Only one custom profile may exist.

The custom-mode editor and its exact controls are intentionally outside this design. Until that follow-up design is approved, both menu entries remain visible but disabled.

## 7. UI

The Mode submenu contains radio choices in this order:

1. 常规模式
2. 后台模式
3. 自动模式
4. 自定义模式
5. Separator
6. 编辑自定义模式…

The active built-in mode is checked. Custom entries remain disabled for now. Simplified Chinese remains the default language for a new installation, while existing language switching remains available.

## 8. Failure Handling

- A failed mode transition keeps the previous mode active and reports a localized error.
- Partial overrides must be rolled back before the menu is rebuilt.
- Permission confirmation failure never enables automatic approval.
- Closing the application clears runtime authorization regardless of shutdown path.
- Unsupported pet capabilities degrade to the nearest quiet visual state without changing notification or permission behavior.

## 9. Testing

Tests must cover:

- Every launch begins in Normal Mode.
- Mode overrides do not modify persisted user preferences.
- Returning to Normal Mode restores effective values from saved preferences.
- Background Mode suppresses all AgentLog alerts while recording and timing continue.
- Background Mode never auto-approves or auto-denies permission requests.
- Automatic Mode suppresses sound, tray flashing, bubbles, update prompts, and HUD.
- Automatic Mode retains work and completion pet animations.
- Automatic Mode requires confirmation once per run and never persists authorization.
- Only permission requests created after entering Automatic Mode can be automatically approved.
- Leaving Automatic Mode stops automatic approval immediately.
- Entering either quiet mode stops an already active tray flash.
- Tray and pet menus show the same labels, checked state, and enabled state.
- Custom Mode remains visible and disabled until its separate design is implemented.
