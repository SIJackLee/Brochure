/** All section intros finish by this time. Motor click explode/reassemble is excluded. */
export const SECTION_INTRO_S = 3;

export const SECTION_CAMERA_MOVE_S = 0.55;

/** Drive: exploded hold → assemble → blades → spin → air wash done by SECTION_INTRO_S. */
export const MOTOR_EXPLODED_HOLD_S = 0.08;
export const MOTOR_ASSEMBLE_END_S = 1.38;
export const MOTOR_ASSEMBLED_END_S = 1.52;
export const MOTOR_BLADE_END_S = 1.85;
export const MOTOR_SPIN_END_S = 2.45;
export const MOTOR_INTRO_END_S = SECTION_INTRO_S;
export const MOTOR_SPIN_START_S = MOTOR_BLADE_END_S;
export const MOTOR_BLADE_START_S = MOTOR_ASSEMBLED_END_S;
export const MOTOR_SPIN_RAMP_S = MOTOR_SPIN_END_S - MOTOR_SPIN_START_S;
export const MOTOR_BLADE_RAMP_S = MOTOR_BLADE_END_S - MOTOR_BLADE_START_S;
export const MOTOR_DUST_DELAY_SPIN_MS = 80;
export const MOTOR_DUST_DELAY_SHOWCASE_MS = 40;
export const MOTOR_AIR_WASH_S = 1.05;
export const MOTOR_AIRFLOW_DUST_LEAD_S = 0.08;
export const MOTOR_AIRFLOW_DUST_WINDOW_S = MOTOR_AIR_WASH_S;

/**
 * Part assemble windows, scaled from the original 0.18–2.08s range
 * so the last part seats at MOTOR_ASSEMBLE_END_S.
 */
export const MOTOR_PART_WINDOWS = [
  [0.10, 0.48],
  [0.22, 0.60],
  [0.34, 0.72],
  [0.46, 0.84],
  [0.58, 0.96],
  [0.70, 1.10],
  [0.82, 1.24],
] as const;

/**
 * Monitor: cylinder dwells on each of 3 faces, then spins 120° to the next.
 * All three faces are shown within SECTION_INTRO_S. Click-to-lock is excluded.
 */
export const CLOUD_INTRO_S = SECTION_INTRO_S;
export const CLOUD_FACE_COUNT = 3;
export const CLOUD_STEP_S = CLOUD_INTRO_S / CLOUD_FACE_COUNT;
export const CLOUD_SPIN_S = 0.36;
export const CLOUD_DWELL_S = CLOUD_STEP_S - CLOUD_SPIN_S;
export const CLOUD_APPEAR_S = 0.38;
export const CLOUD_LOCK_LERP = 8;
/** Section 3 exception: copy pad starts on the first spin, not after the cylinder settles. */
export const CLOUD_CHART_AT_S = CLOUD_DWELL_S;
export const CLOUD_CHART_ENTER_S = 0.62;
