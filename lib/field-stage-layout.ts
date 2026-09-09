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

/** Pair-local slots on mobile, still a mild top-left / bottom-right. */
export const CONTROLLER_LAYOUT_MOBILE = {
  controller: { x: -0.28, y: 0.32 },
  communication: { x: 0.3, y: -0.36 },
} as const;

export const CONTROL_PAIR_PAD = 0.88;
/** Raise the pair in the band; perspective + diagonal AABB otherwise sit low. */
export const CONTROL_PAIR_Y_LIFT_HY = 0.34;

export function controllerCameraPose(mobile: boolean, center?: Vector3) {
  if (mobile) {
    const c = center ?? new Vector3(0, 0.08, 0);
    return {
      position: new Vector3(c.x, c.y + 0.02, 9.55),
      target: new Vector3(c.x, c.y, 0),
    };
  }
  return {
    position: new Vector3(0, 0.14, 8),
    target: new Vector3(0, 0.04, 0),
  };
}

export function fitPairToBand(
  boxSize: Vector3,
  boxCenter: Vector3,
  band: FieldPlacement,
): { position: Vector3; scale: number } {
  const scale = Math.min(
    (2 * band.hx * CONTROL_PAIR_PAD) / Math.max(boxSize.x, 1e-4),
    (2 * band.hy * CONTROL_PAIR_PAD) / Math.max(boxSize.y, 1e-4),
  );
  return {
    scale,
    position: new Vector3(
      band.center.x - boxCenter.x * scale,
      band.center.y - boxCenter.y * scale + band.hy * CONTROL_PAIR_Y_LIFT_HY,
      0,
    ),
  };
}

/** High diagonal view so the front screen and a side screen are both pickable. */
export function cloudCameraPose(mobile: boolean, center: Vector3) {
  if (mobile) {
    return {
      position: new Vector3(0.5, 0.88, 2.72),
      target: new Vector3(0, -0.32, 0.04),
    };
  }
  return {
    position: new Vector3(center.x + 0.2, center.y + 1.28, 5.05),
    // Look below and left so the face sits in the open stage, not along the lower edge.
    target: new Vector3(center.x - 0.4, center.y - 0.48, 0.04),
  };
}

export function fallbackInsets(
  width: number,
  height: number,
  mobile: boolean,
  rem: number,
  cloud = false,
): FieldInsets {
  if (mobile) {
    return {
      left: rem,
      right: rem,
      top: (cloud ? 4.85 : 5.35) * rem,
      bottom: (5.1 + (cloud ? 14.8 : 9.75)) * rem,
    };
  }
  const blur = width >= 1024 ? (cloud ? 30 : 44) : width >= 640 ? (cloud ? 28 : 40) : cloud ? 26 : 36;
  return {
    left: Math.min(width * 0.92, blur * rem),
    right: 3.5 * rem,
    top: 5.5 * rem,
    bottom: 6.5 * rem,
  };
}

function readCssPx(style: CSSStyleDeclaration, name: string, fallbackPx: number, rem: number) {
  const raw = style.getPropertyValue(name).trim();
  if (!raw || raw.startsWith('calc(')) return fallbackPx;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return fallbackPx;
  if (raw.endsWith('rem')) return value * rem;
  return value;
}

export function readFieldInsets(width: number, height: number, mobile: boolean, cloud = false): FieldInsets {
  const rem =
    typeof document === 'undefined'
      ? 16
      : Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const fallback = fallbackInsets(width, height, mobile, rem, cloud);
  if (typeof document === 'undefined') return fallback;
  const main = document.querySelector('main');
  if (!main) return fallback;
  const style = getComputedStyle(main);
  return {
    left: readCssPx(style, '--field-inset-left', fallback.left, rem),
    right: readCssPx(style, '--field-inset-right', fallback.right, rem),
    top: readCssPx(style, '--field-inset-top', fallback.top, rem),
    bottom: readCssPx(style, '--field-inset-bottom', fallback.bottom, rem),
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

export function controllerLayoutCamera(width: number, height: number, mobile: boolean, center?: Vector3) {
  const pose = controllerCameraPose(mobile, center);
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
  mobile = false,
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
  const layout = mobile ? CONTROLLER_LAYOUT_MOBILE : CONTROLLER_LAYOUT;
  return {
    center,
    hx,
    hy,
    controller: new Vector3(
      center.x + layout.controller.x * hx,
      center.y + layout.controller.y * hy,
      0,
    ),
    communication: new Vector3(
      center.x + layout.communication.x * hx,
      center.y + layout.communication.y * hy,
      0.12,
    ),
  };
}

export function computeFieldPlacement(
  width: number,
  height: number,
  mobile: boolean,
  cloud = false,
): FieldPlacement {
  const insets = readFieldInsets(width, height, mobile, cloud);
  const rect = safeRectFromInsets(width, height, insets);
  if (!cloud) {
    if (mobile) {
      let center = new Vector3(0, 0.1, 0);
      let placement = fieldPlacementFromRect(
        controllerLayoutCamera(width, height, true, center),
        width,
        height,
        rect,
        true,
      );
      for (let i = 0; i < 2; i += 1) {
        center = placement.center;
        placement = fieldPlacementFromRect(
          controllerLayoutCamera(width, height, true, center),
          width,
          height,
          rect,
          true,
        );
      }
      return placement;
    }
    const camera = controllerLayoutCamera(width, height, false);
    return fieldPlacementFromRect(camera, width, height, rect, false);
  }

  const seed = cloudCameraPose(mobile, new Vector3(0, 0.12, 0));
  const camera = new PerspectiveCamera(mobile ? 42 : 38, width / Math.max(1, height), 0.1, 80);
  camera.position.copy(seed.position);
  camera.lookAt(seed.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const first = fieldPlacementFromRect(camera, width, height, rect, mobile);
  const refined = cloudCameraPose(mobile, first.center);
  camera.position.copy(refined.position);
  camera.lookAt(refined.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return fieldPlacementFromRect(camera, width, height, rect, mobile);
}
