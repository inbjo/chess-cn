import assert from 'node:assert/strict';
import {
  VISUAL_PREFERENCES_KEY,
  classicCameraFrustum,
  loadVisualPreferences,
  saveVisualPreferences,
} from '../js/visual-preferences.js';

function memoryStorage(initial = null) {
  const values = new Map(initial ? [[VISUAL_PREFERENCES_KEY, initial]] : []);
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

assert.deepEqual(loadVisualPreferences(memoryStorage(), false), {
  displayMode: 'battle', motionMode: 'full', hasSavedMotionMode: false,
});
assert.equal(loadVisualPreferences(memoryStorage(), true).motionMode, 'simple');

const storage = memoryStorage();
assert.equal(saveVisualPreferences(storage, 'classic', 'off'), true);
assert.deepEqual(loadVisualPreferences(storage, false), {
  displayMode: 'classic', motionMode: 'off', hasSavedMotionMode: true,
});
assert.equal(saveVisualPreferences(storage, 'unknown', 'full'), false);
assert.equal(loadVisualPreferences(memoryStorage('{broken'), true).motionMode, 'simple');

const portrait = classicCameraFrustum(390, 844, 24.4, 27);
assert.ok(portrait.right - portrait.left >= 24.4 * 1.12);
assert.ok(portrait.top - portrait.bottom >= 27 * 1.12);
const landscape = classicCameraFrustum(844, 390, 24.4, 27);
assert.ok(landscape.right - landscape.left >= 24.4 * 1.12);
assert.ok(landscape.top - landscape.bottom >= 27 * 1.12);

console.log('ok - 经典视图、自适应相机与动效偏好');
