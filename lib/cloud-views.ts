export type CloudViewId = 'field' | 'chart' | 'model';

export const CLOUD_ASPECT = 16 / 9;

export const CLOUD_VIEWS = [
  { id: 'field' as const, label: 'Field', src: '/mock/iot-field.png' },
  { id: 'chart' as const, label: 'Chart', src: '/mock/iot-chart.png' },
  { id: 'model' as const, label: 'Model', src: '/mock/iot-model.png' },
] as const;

/** Local offsets from the copy-free center, in half-width / half-height units. */
export const CLOUD_DECK_PC = [
  { x: -0.44, y: 0.40, z: 0.04 },
  { x: 0.02, y: 0.02, z: 0.12 },
  { x: 0.46, y: -0.38, z: 0.22 },
] as const;

export const CLOUD_DECK_MOBILE = [
  { x: -0.36, y: 0.34, z: 0.04 },
  { x: 0.0, y: 0.0, z: 0.12 },
  { x: 0.36, y: -0.34, z: 0.22 },
] as const;

export const CLOUD_FOCUS = { x: 0.04, y: 0.03, z: 0.62, scale: 1.24 };
export const CLOUD_DIM_SCALE = 0.82;
export const CLOUD_DIM_OPACITY = 0.42;
