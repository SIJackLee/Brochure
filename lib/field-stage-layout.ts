import { PerspectiveCamera, Plane, Raycaster, Vector2, Vector3, type Camera } from 'three';

export type FieldInsets = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type CanvasRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type FieldPlacement = {
  center: Vector3;
  hx: number;
  hy: number;
  controller: Vector3;
  communication: Vector3;
};

/** Offsets from the safe-rect center, in half-width / half-height units. */
export const CONTROLLER_LAYOUT = {
  controller: { x: -0.42, y: 0.38 },
  communication: { x: 0.46, y: -0.42 },
} as const;

export function controllerCameraPose(mobile: boolean) {
  if (mobile) {
    return {
      position: new Vector3(0, 0.04, 8.7),
      target: new Vector3(0, -0.06, 0),
    };
  }
  return {
    position: new Vector3(0, 0.14, 8),
    target: new Vector3(0, 0.04, 0),
  };
}

export function fallbackInsets(width: number, height: number, mobile: boolean, rem: number): FieldInsets {
  if (mobile) {
    return {
      left: rem,
      right: rem,
      top: 5.35 * rem,
      bottom: (5.1 + 9.75) * rem,
    };
  }
  const blur = width >= 1024 ? 44 * rem : width >= 640 ? 40 * rem : 36 * rem;
  return {
    left: Math.min(width * 0.92, blur),
    right: 3.5 * rem,
    top: 5.5 * rem,
    bottom: 6.5 * rem,
  };
}

function readCssPx(style: CSSStyleDeclaration, name: string, fallbackPx: number) {
  const raw = style.getPropertyValue(name).trim();
  if (!raw) return fallbackPx;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallbackPx;
}

export function readFieldInsets(width: number, height: number, mobile: boolean): FieldInsets {
  const rem =
    typeof document === 'undefined'
      ? 16
      : Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const fallback = fallbackInsets(width, height, mobile, rem);
  if (typeof document === 'undefined') return fallback;
  const main = document.querySelector('main');
  if (!main) return fallback;
  const style = getComputedStyle(main);
  return {
    left: readCssPx(style, '--field-inset-left', fallback.left),
    right: readCssPx(style, '--field-inset-right', fallback.right),
    top: readCssPx(style, '--field-inset-top', fallback.top),
    bottom: readCssPx(style, '--field-inset-bottom', fallback.bottom),
  };
}

export function safeRectFromInsets(width: number, height: number, insets: FieldInsets): CanvasRect {
  const left = Math.max(0, insets.left);
  const top = Math.max(0, insets.top);
  const right = Math.max(0, insets.right);
  const bottom = Math.max(0, insets.bottom);
  return {
    left,
    top,
    width: Math.max(48, width - left - right),
    height: Math.max(48, height - top - bottom),
  };
}

export function controllerLayoutCamera(width: number, height: number, mobile: boolean) {
  const pose = controllerCameraPose(mobile);
  const camera = new PerspectiveCamera(mobile ? 42 : 38, width / Math.max(1, height), 0.1, 80);
  camera.position.copy(pose.position);
  camera.lookAt(pose.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

const raycaster = new Raycaster();
const ndc = new Vector2();
const hit = new Vector3();
const stagePlane = new Plane(new Vector3(0, 0, 1), 0);

function unprojectZ0(camera: Camera, canvasX: number, canvasY: number, canvasW: number, canvasH: number) {
  ndc.set((canvasX / canvasW) * 2 - 1, -(canvasY / canvasH) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const didHit = raycaster.ray.intersectPlane(stagePlane, hit);
  return didHit ? hit.clone() : new Vector3();
}

export function fieldPlacementFromRect(
  camera: Camera,
  canvasW: number,
  canvasH: number,
  rect: CanvasRect,
): FieldPlacement {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const center = unprojectZ0(camera, cx, cy, canvasW, canvasH);
  const left = unprojectZ0(camera, rect.left, cy, canvasW, canvasH);
  const right = unprojectZ0(camera, rect.left + rect.width, cy, canvasW, canvasH);
  const top = unprojectZ0(camera, cx, rect.top, canvasW, canvasH);
  const bottom = unprojectZ0(camera, cx, rect.top + rect.height, canvasW, canvasH);
  const hx = Math.max(0.4, Math.abs(right.x - left.x) / 2);
  const hy = Math.max(0.4, Math.abs(top.y - bottom.y) / 2);
  return {
    center,
    hx,
    hy,
    controller: new Vector3(
      center.x + CONTROLLER_LAYOUT.controller.x * hx,
      center.y + CONTROLLER_LAYOUT.controller.y * hy,
      0,
    ),
    communication: new Vector3(
      center.x + CONTROLLER_LAYOUT.communication.x * hx,
      center.y + CONTROLLER_LAYOUT.communication.y * hy,
      0.12,
    ),
  };
}

export function computeFieldPlacement(width: number, height: number, mobile: boolean): FieldPlacement {
  const camera = controllerLayoutCamera(width, height, mobile);
  const insets = readFieldInsets(width, height, mobile);
  const rect = safeRectFromInsets(width, height, insets);
  return fieldPlacementFromRect(camera, width, height, rect);
}
