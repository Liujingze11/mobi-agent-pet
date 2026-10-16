# Mobi A actor atlas — selected generation prompt

Built-in image generation tool, transparent_background=true.

Selected output: `actor-atlas-source.png` (unmodified generated PNG).

Edit target: `/home/ljz/.codex/generated_images/01a133ca-5013-7092-b4d5-e75341ee7ee1/exec-f9c147ba-c07a-4c25-8efd-cd2c8b5a45b0.png`

Identity/style reference: `/home/ljz/.codex/generated_images/01a133b4-a144-7790-9919-45f69a970dad/exec-7384e907-a1c3-412f-b08c-16752fcb7827.png`

Exact selected prompt:

```text
Use case: precise-object-edit
Asset type: transparent 4-by-4 sprite animation atlas.

Image 1 is the edit target atlas. Image 2 is the approved character identity reference. Do one narrow production repair to image 1: uniformly SHRINK all sixteen character cutouts to 80% of their existing size around each cell's fixed center anchor, keeping the SAME canvas and the SAME 4-column by 4-row cell placement. Preserve the existing aligned row and column positions and all sixteen action poses exactly. DO NOT re-layout the sheet. DO NOT vertically redistribute the rows. DO NOT alter character identity or action sequence.

Existing canvas is 1086 x 1448 pixels, exactly four equal columns of 271.5 pixels and four equal rows of 362 pixels. Keep this canvas, aspect ratio and exact regular 4-by-4 arrangement. Every cell is congruent. Each actor is a waist-up Mobi A cutout facing RIGHT from the left rear three-quarter view. The approved head is a big rounded white square with one visible small black dot eye and small side smile confined to the right edge. Smooth black outline, pure-white opaque fill. No gray shading.

Repeat the SAME alignment in every cell. After shrinking: head's approximate local bounds x=49..211, y=112..247; waist bottom local y=317; whole actor plus hands/props stays within local x=40..242 and y=108..320. Head and torso position are fixed across ALL rows and columns, except the existing very slight downward phone head tilt. Every cutout has at least 28 pixels of transparent margin to both left/right cell edges. Hands must not cross cell boundaries.

Preserve exactly these existing action sequences:
Top row: four alternating typing poses with both arms extended RIGHT; no keyboard drawn.
Second row: four right-arm mouse gestures (reach, slide, click, return); no mouse drawn.
Third row: four checking-phone poses with one small smartphone held close to chest and changing thumb taps.
Bottom row: four coffee-cup poses (at chest, lifted to right-side mouth, tilted sip, lowered to chest).
Preserve real arm and prop motions so the four frames per row are distinct.

Clean isolated transparent PNG cutouts: alpha zero outside the outlines. Remove all specks, halos, fringes, matte, and disconnected pixels outside actor outlines. Solid opaque WHITE interiors and solid opaque BLACK outlines. Tiny antialiasing only on outline edges. The transparent background has no visible fill, pattern, shading or texture. No chair, legs, feet, desk, monitor, keyboard, mouse, environment, shadow, UI, text, grid line, label or extra prop. Do not introduce a gray background; output genuine transparency.
```

Inspection: 1086 × 1448 RGBA, four columns and four rows. The tool returned the requested existing canvas size. Row placement drifts; robust per-cell foreground bounds and estimated head anchors are stored in `actor-atlas-bounds.json` for compositor alignment. Some low-alpha edge fringes and tiny detached pixels remain. Opaque interiors are typically alpha 254 rather than 255; the PNG has genuine alpha-zero background. No raster postprocessing was applied.
