export const DISPLAY_MODES = ['battle', 'classic'];
export const MOTION_MODES = ['full', 'simple', 'off'];
export const VISUAL_PREFERENCES_KEY = 'chess_visual_preferences_v1';

export function loadVisualPreferences(storage, prefersReducedMotion = false) {
  let saved = null;
  try { saved = JSON.parse(storage?.getItem(VISUAL_PREFERENCES_KEY) || 'null'); }
  catch (_) { /* 隐私模式或损坏数据均回退到安全默认值 */ }

  return {
    displayMode: DISPLAY_MODES.includes(saved?.displayMode) ? saved.displayMode : 'battle',
    motionMode: MOTION_MODES.includes(saved?.motionMode)
      ? saved.motionMode
      : prefersReducedMotion ? 'simple' : 'full',
    hasSavedMotionMode: MOTION_MODES.includes(saved?.motionMode),
  };
}

export function saveVisualPreferences(storage, displayMode, motionMode) {
  if (!DISPLAY_MODES.includes(displayMode) || !MOTION_MODES.includes(motionMode)) return false;
  try {
    storage?.setItem(VISUAL_PREFERENCES_KEY, JSON.stringify({ displayMode, motionMode }));
    return true;
  } catch (_) {
    return false;
  }
}

export function classicCameraFrustum(viewportWidth, viewportHeight, boardWidth, boardHeight, padding = 1.12) {
  const viewportAspect = Math.max(viewportWidth, 1) / Math.max(viewportHeight, 1);
  let viewWidth = boardWidth * padding;
  let viewHeight = boardHeight * padding;
  if (viewWidth / viewHeight < viewportAspect) viewWidth = viewHeight * viewportAspect;
  else viewHeight = viewWidth / viewportAspect;
  return {
    left: -viewWidth / 2,
    right: viewWidth / 2,
    top: viewHeight / 2,
    bottom: -viewHeight / 2,
  };
}
