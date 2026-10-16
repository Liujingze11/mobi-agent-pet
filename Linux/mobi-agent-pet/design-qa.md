# Office scene design QA — 2026-10-13

final result: passed

Source visual truth: `runtime/clawd/assets/source/dashboard-office/approved-reference.png` (1536 × 1024).

Implementation: `docs/verification/office-scene/mobi-a-typing.png` and `overview.png`; real Electron dashboard at 1120 × 760, density 1. Current component capture follows the larger independent card dimensions. Following the user's layout revision, the illustration covers the larger tile edge to edge with proportional overscan; the status floats above it as 13px dark lettering with a subtle white outline. Following the latest user revision, the visible character name is removed and retained only as the accessible scene label. Compact window: 720 × 760, `compact.png`.

Full-view comparison: source and rendered component displayed together at `http://127.0.0.1:4176/comparison`, inspected in the Codex in-app browser. Focused inspection: native captures `mouse.png`, `coffee.png`, `phone.png`, `mobi-b.png`, `mobi-c.png` and enlarged live scene at `http://127.0.0.1:4176/`.

## Findings and fixes

- [P2, fixed] The actor's waist covered the front of the chair. A clipped foreground layer of the supplied background restores the seated depth. Recaptured all states and compared the corrected typing capture with the selected reference.
- [P2, fixed] Atlas head anchors differed between actions and characters. Registered every frame at the head using measured source coordinates, then verified typing, mouse, phone, coffee and A/B/C captures.
- [P2, fixed] The initial preview lacked the positioning class and covered its controls. Added the same `pet-scene` class as production, reloaded the browser and verified the role and Agent-state selectors.

- [P2, fixed — user revision] The previous contained illustration left margins and reduced the tile's prominence. Changed the registered scene to proportional cover, increased the overview height and left column width, and verified the final `overview-momo.png` and `compact.png`. The status overlay remains inside the scene above all animation layers.

- [P2, fixed — label refinement] Frosted white plates and drop shadows looked disconnected from the line-art office; the capsule status and rounded-rectangle name also used inconsistent shapes. Removed both plates, blur and drop shadows; matched dark text size/weight, with a thin white text outline to preserve readability over furniture. Current-run evidence: `docs/verification/office-scene/label-polish-before/` and `label-polish-after/`, inspected at desktop and compact sizes.

- [P2, fixed — name removal] The user found 莫莫 difficult to see and asked to move or remove it. Removed the visible name; kept the dynamic name as the accessible scene label. Verified the refreshed `mobi-b.png` and `compact.png`.

- [P2, fixed — separate backgrounds] The user requested separate background blocks for the office and quota. Removed the shared blue overview surface and its outer padding/border; the two existing rounded cards now stand independently with an 18px desktop gap. Verified `overview-momo.png` and `compact.png` in isolated Electron.

No remaining actionable P0/P1/P2 visual findings.

## Required fidelity surfaces

- Typography: existing application font and compact mood label; miniature monochrome code editor uses a monospace font and stays inside the monitor. Its text is decorative animation rather than a live terminal.
- Layout: selected side/rear workstation view, three neighboring coworkers, low partitions and the chair preserved. Scene keeps its 3:2 proportions while covering the tile, with a small edge crop removing the baked-in white frame. Office and quota have independent rounded surfaces, separated by an 18px desktop gap, without a shared enclosing background. Desktop overview width favors the office 1.65:1 and its height is 330–420px; compact tiles are 280–380px tall. Status floats over the office as plain text; the character name is visually hidden, with no frosted panels or letterbox gutters.
- Palette: white, black and neutral gray only within the scene. Background is lighter than the main actor. Existing dashboard colors outside the scene remain.
- Assets: generated raster backdrop and four-frame actions for each of A/B/C, plus three coworker animation rows. Transparent interiors and registered crops inspected; no substituted handcrafted illustration.
- Copy: the visible mood and accessible character name remain dynamic; the preview labels accurately describe its in-memory controls. Screen content is constrained to the monitor.

## Behavior evidence

`node --test runtime/clawd/test/dashboard*.test.js runtime/clawd/test/session-renderer-behavior.test.js`: 64 passing tests.

`scripts/verify-office-scene.cjs` in isolated Electron: all artwork loads; scene covers the tile without distortion, status floats above it and the character name remains accessible without a visible label, larger desktop/compact layouts verified; editor/terminal and NPC frames change; typing/mouse/phone/coffee render; coffee ends after 5s and stays off during a persistent wait; A/B/C swap into the foreground; leaving the overview freezes animation; compact layout works; no renderer console errors. Reduced-motion transitions and failed custom-image recovery have regression tests.

Live browser checks: all image layers loaded; changed main role from B to C and Agent state from working to waiting using the visible selectors. Scene remained aligned and controls remained available. Production screenshot evidence and browser comparison both inspected.

## Follow-up polish

- [P3] Tiny atlas alpha fringes are insignificant at overview scale; a future illustration pass can improve hand registration and silhouette detail at unusually large preview sizes.

## Implementation checklist

- [x] Selected composition implemented in the existing overview, enlarged and covering the whole tile.
- [x] Status floats over the illustration; actual theme names 莫比/莫莫/比比 remain in the accessible scene label and role selector.
- [x] Four main actions only; 35s typing / 24s mouse, idle mouse / phone.
- [x] Agent-state transitions debounce 2s and respect a minimum 8s action hold.
- [x] Coffee is a single 5s sequence, with a 120s cooldown.
- [x] NPC timing staggered; all three characters can be the main actor.
- [x] Verification and reviewed edge cases complete.
