// Shared mutable store — read every frame by the 3D canvas, written by the UI.
// Bypasses React render/effect timing entirely so the displayed shape can
// never drift out of sync with the selected scene.
export const sceneStore = {
  index: 0,
}
