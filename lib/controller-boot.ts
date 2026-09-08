/** Camera lerp to section 02 is 1.1s; hold a beat after arrival before power. */
export const CONTROLLER_CAMERA_MOVE_S = 1.1;
export const CONTROLLER_SETTLE_HOLD_S = 1.3;

export const CONTROLLER_POWER_START_S = CONTROLLER_SETTLE_HOLD_S;
export const CONTROLLER_POWER_END_S = CONTROLLER_POWER_START_S + 0.44;

export const CONTROLLER_BOOT_DIGIT_STARTS = [1.8, 2.08, 2.36] as const;
export const CONTROLLER_BOOT_DIGIT_DURATION = 0.28;
export const CONTROLLER_BOOT_FAN_START = 2.6;
export const CONTROLLER_BOOT_STATUS_START = 3.56;
export const CONTROLLER_BOOT_SHOWCASE_AT = 4.28;

/** Copy types only after the rocker has finished turning on. */
export const CONTROLLER_TYPE_START_MS = Math.round(CONTROLLER_POWER_END_S * 1000 + 60);
export const CONTROLLER_TYPE_STEP_MS = 72;
export const CONTROLLER_TYPE_LINE_GAP_MS = 90;
