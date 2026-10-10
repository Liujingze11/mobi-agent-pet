const { describe, it } = require("node:test");
const assert = require("node:assert");

const permission = require("../src/permission");
const { computeBubbleStackLayout, clampBubbleHeight, collectVisibleWindowBounds } = permission.__test;

// Common defaults so each test only spells out what's interesting.
const BW = 340;
const MARGIN = 8;
const GAP = 6;
const FHD = { x: 0, y: 0, width: 1920, height: 1080 };

function layout(opts) {
  return computeBubbleStackLayout({
    bubbleWidth: BW,
    margin: MARGIN,
    gap: GAP,
    ...opts,
  });
}

describe("permission bubble height clamp", () => {
  it("caps a tall measured bubble to the work area reserve", () => {
    assert.strictEqual(clampBubbleHeight(1500, 900), 876);
  });

  it("rounds fractional measured heights up before clamping", () => {
    assert.strictEqual(clampBubbleHeight(240.2, 900), 241);
  });

  it("supports an explicit reserve for product-tuned edge spacing", () => {
    assert.strictEqual(clampBubbleHeight(1500, 900, 40), 860);
  });

  it("keeps invalid natural heights at zero", () => {
    assert.strictEqual(clampBubbleHeight(0, 900), 0);
  });

  it("falls back to the natural height when work area height is unavailable", () => {
    assert.strictEqual(clampBubbleHeight(500, 0), 500);
  });
});

describe("permission bubble Orbit avoidance bounds", () => {
  it("keeps only live visible window bounds, including a fading request removed from pending state", () => {
    const rect = { x: 100, y: 200, width: 340, height: 180 };
    const makeWindow = ({ destroyed = false, visible = true, bounds = rect } = {}) => ({
      isDestroyed: () => destroyed,
      isVisible: () => visible,
      getBounds: () => bounds,
    });

    assert.deepStrictEqual(collectVisibleWindowBounds([
      makeWindow(),
      makeWindow({ visible: false }),
      makeWindow({ destroyed: true }),
      makeWindow({ bounds: { x: 0, y: 0, width: 0, height: 100 } }),
    ]), [rect]);
  });
});

describe("permission bubble stack layout", () => {
  it("stacks oldest above newest at the bottom-right with exactly N-1 gaps",()=>{
    assert.deepStrictEqual(layout({bubbleHeights:[200,200,200],workArea:FHD}),[
      {x:1572,y:460,width:340,height:200},
      {x:1572,y:666,width:340,height:200},
      {x:1572,y:872,width:340,height:200},
    ]);
  });
  it("keeps the oldest bubble visible when the stack exceeds the work area",()=>{
    const result=layout({bubbleHeights:[600,600],workArea:FHD});
    assert.strictEqual(result[0].y,8);
    assert.strictEqual(result[1].y,614);
  });
  it("anchors to the chosen display including nonzero and negative work area offsets",()=>{
    for(const wa of [{x:1920,y:0,width:1920,height:1080},{x:-1920,y:-200,width:1920,height:1080}]) {
      const result=layout({bubbleHeights:[200],workArea:wa});
      assert.deepStrictEqual(result,[{x:wa.x+1572,y:wa.y+872,width:340,height:200}]);
    }
  });
  it("returns no positions for an empty stack",()=>{
    assert.deepStrictEqual(layout({bubbleHeights:[],workArea:FHD}),[]);
  });
  it("ignores Hardware Buddy test entries when stacking visible bubbles", () => {
    const runtime = permission({
      win: { isDestroyed: () => false },
      bubbleFollowPet: false,
      getPetWindowBounds: () => ({ x: 0, y: 0, width: 80, height: 80 }),
      getNearestWorkArea: () => FHD,
      getHitRectScreen: () => null,
      getHudReservedOffset: () => 0,
    });
    const assigned = [];
    const bubble = (name) => ({
      isDestroyed: () => false,
      setBounds: (bounds) => assigned.push([name, bounds]),
    });

    runtime.addPendingPermission({ bubble: bubble("old"), measuredHeight: 200, suggestions: [] }, "test");
    runtime.addPendingPermission({
      bubble: null,
      measuredHeight: 200,
      suggestions: [],
      remoteOnly: true,
    }, "test");
    runtime.addPendingPermission({ bubble: bubble("new"), measuredHeight: 200, suggestions: [] }, "test");

    runtime.repositionBubbles();

    assert.deepStrictEqual(assigned, [
      ["old", { x: 1572, y: 666, width: 340, height: 200 }],
      ["new", { x: 1572, y: 872, width: 340, height: 200 }],
    ]);
  });
});
