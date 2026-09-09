import { SECTION_CAMERA_MOVE_S } from '@/lib/intro-timing';

/** Camera lerp to section 02; power starts as the pair arrives. */
export const CONTROLLER_CAMERA_MOVE_S = SECTION_CAMERA_MOVE_S;
export const CONTROLLER_SETTLE_HOLD_S = 0.55;

export const CONTROLLER_POWER_START_S = CONTROLLER_SETTLE_HOLD_S;
export const CONTROLLER_POWER_END_S = CONTROLLER_POWER_START_S + 0.22;

export const CONTROLLER_BOOT_DIGIT_STARTS = [0.78, 0.94, 1.10] as const;
export const CONTROLLER_BOOT_DIGIT_DURATION = 0.16;
export const CONTROLLER_BOOT_FAN_START = 1.18;
export const CONTROLLER_BOOT_FAN_STEP_S = 0.065;
export const CONTROLLER_BOOT_STATUS_START = 1.72;
export const CONTROLLER_BOOT_SHOWCASE_AT = 2.15;

/** Comm LCD: blank → menu → controller-01 detail, on the same clock as the pair. */
export const COMM_LCD_ON_S = CONTROLLER_POWER_END_S + 0.08;
export const COMM_LCD_MENU_HOLD_S = 0.95;
export const COMM_LCD_DETAIL_S = COMM_LCD_ON_S + COMM_LCD_MENU_HOLD_S;

/** Copy types as soon as the rocker has finished turning on. */
export const CONTROLLER_TYPE_START_MS = Math.round(CONTROLLER_POWER_END_S * 1000 + 40);
export const CONTROLLER_TYPE_STEP_MS = 36;
export const CONTROLLER_TYPE_LINE_GAP_MS = 40;
