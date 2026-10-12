# Remove idle power saving — 2026-10-12

## Scope

Remove idle power saving and its Custom Mode switch. Preserve the independent working keep-awake function, seven states, ordinary idle playback, drag, card dismissal, quota ring, system wake recovery and saved unrelated custom settings.

## Changes

- Removed active profile/prefs fields, mode projection, settings effects/actions/translations, main/preload/IPC plumbing, renderer pause deadlines and static substitution, tick throttling/passive tracking suppression, and hidden HUD/ring destruction timers.
- Profile normalization discards legacy `lowPowerIdle`; schema validation discards `lowPowerIdleMode`. Remaining values, including keepAwake and approval mode, survive.
- System wake still restores SVG timelines and reloads tracked OBJECT documents, including bounded retries, duplicate/latest-wake handling and state-change protection.
- Cloudling's three runtime SVGs and matching source copies retain their normal RAF loops and pointer bridges after removing the pause API. Removed static replacement metadata and its obsolete accessory declaration. Artwork files remain on disk, and active accessory capability stays enabled.
- Renderer tests renamed from `renderer-low-power.test.js` to `renderer-view.test.js`; independent renderer, wardrobe, tint, wake, mini and tracking coverage retained.

## Verification

- New profile/editor/continuous playback tests failed before implementation, then passed.
- Focused runtime suite: 592 passed, no failures. Cloudling/accessory/renderer suite: 74 passed, no failures.
- `npm run test:phase2`: AgentLog 316 passed, Manager 79 passed, typecheck and build succeeded; upstream 6,463 passed, 22 skipped, no failures.
- Independent read-only review: 530 runtime checks passed, followed by 83 Cloudling checks passed; no substantive defects. All six SVG scripts executed five RAF frames in isolated DOMs, with no undefined reference errors; source copies match runtime assets.
- Private full-main Electron probe `/tmp/mobi-full-idle-power-probe.cjs`: isolated configuration with legacy idle power enabled; user preferences and mouse untouched, integrations disabled. Eight seconds of native renderer playback produced nine frames, with no SVG pause or pause style. Idle pickup entered held, drag moved by the expected 70x35 pixels and release returned idle. Task card retained five-second/outside-click dismissal and reused its window. Custom editor showed 19 switches, seven states, no idle power switch; saved keep-awake, 300-second roam interval and auto-tools mode survived.
- Probe exited 0 with `IDLE_POWER_REMOVAL_PASS`. Native DBus/SSL diagnostics appeared without JS/assertion failures.

This report supersedes earlier notes that preserved idle power saving; prior reports remain historical records.
