export type CloudViewId = 'field' | 'chart' | 'model';

export const CLOUD_ASPECT = 16 / 9;
export const CLOUD_FACE_COUNT = 3;
/** Radius to body width so three vertical faces sit without overlap. */
export const CLOUD_RADIUS_RATIO = 0.5;
export const CLOUD_SCREEN_WIDTH_RATIO = 0.94;
/** Extra yaw so a neighboring face stays visible from the diagonal camera. */
export const CLOUD_PEEK_YAW = 0.32;

export const CLOUD_VIEWS = [
  { id: 'field' as const, label: 'Field', src: '/mock/iot-field.png' },
  { id: 'chart' as const, label: 'Chart', src: '/mock/iot-chart.png' },
  { id: 'model' as const, label: 'Model', src: '/mock/iot-model.png' },
] as const;
