# Mobi B actor atlas — exact generation prompt

Built-in image generation tool, transparent_background=true. One edit call, no repairs or raster postprocessing.

Edit target: `/home/ljz/Jingze/OPC/mobi-agent-pet/Linux/mobi-agent-pet/runtime/clawd/assets/dashboard-office/actor-atlas.png`

Character reference: `/home/ljz/Jingze/OPC/mobi-agent-pet/Linux/mobi-agent-pet/docs/verification/2026-10-09-mobi-characters.png`

Exact prompt:

```text
Use case: precise-object-edit
Asset type: transparent 4-by-4 office animation sprite atlas, Mobi B variant.

Image 1 is the EXACT EDIT TARGET: the final Mobi A atlas. Image 2 is a character design reference: Mobi B is the CENTER character, the simple circular white head. Edit image 1 in place, changing ONLY each of the sixteen heads from Mobi A into Mobi B. Preserve all other pixels/geometry as closely as possible.

Mobi B identity: circular white head, smooth black circular outline, one tiny black dot eye visible near the RIGHT side in this rear three-quarter right-facing pose, tiny neutral/curved mouth near the right edge. Add one very small curved arc of hair near the upper-left head outline. The hair is a modest short black curve, not a hairstyle. White fill is opaque, no gray shading. Adapt the reference's CENTER circular character to the SAME left-side rear 3/4 seated orientation facing RIGHT as the target atlas. Never turn toward the viewer or mirror left. Keep the same neck attachment point. Replace each rounded-square head with a circular head of comparable visual size and preserve its right-edge face direction. Head shape can extend upward as needed to become circular, but do not reposition the body.

CRITICAL INVARIANTS: preserve the original transparent 1086 x 1448 PNG canvas, EXACT four equal columns and four equal rows, the same sixteen actors in the same cells, same body scale, same torso shape/waist line, all arm and hand shapes/positions, phones/cups and their positions, and every original action pose. Do NOT relayout, resize, crop, recenter, vertically redistribute or reorder the sheet. Keep the canvas and cell coordinates fixed. The actor bodies must stay where image 1 places them. Only the head silhouette and face/hair may change.

Four rows remain exactly: row 1 typing four alternating hand poses without keyboard; row 2 mouse gestures without mouse; row 3 checking held phone with thumb taps; row 4 coffee cup chest / mouth / tilted sip / lowered. Keep all 16 motion frames distinct. Preserve waist-up crop, no legs.

Output genuine RGBA transparency. Background alpha zero; preserve opaque white actor/prop interiors and smooth black outlines, with antialiasing only on drawing edges. No background, gray matte, checkerboard, scenery, chair, desk, monitor, keyboard, mouse object, shadows, UI, text, labels, grid lines or watermark. Image 2 labels and its beige background must NOT appear. This is the same exact atlas with only all sixteen heads changed into circular Mobi B heads.
```

Inspection: see `actor-mobi-b-bounds.json` for actual dimensions, all 16 frame bounds, and estimated head anchors. Genuine alpha-zero background; low-alpha edge fringes remain and most white interior pixels are near-opaque alpha 254. Source/runtime PNG copies are identical to the generated output.
