// No-op scene implementing the Scene API (2D mode / fallback when the 3D layer fails).
export function createScene() {
  const noop = () => {};
  return {
    isStub: true,
    setMode: noop,
    setRank: noop,
    setQuality: noop,
    setStill: noop,
    playReplay: () => Promise.resolve(),
    celebrate: noop,
    dispose: noop,
    on: noop,
  };
}
export default createScene;
