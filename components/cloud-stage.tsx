'use client';

import { Image as DreiImage, useTexture } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { FrontSide, Group, MathUtils, Mesh } from 'three';
import {
  CLOUD_ASPECT,
  CLOUD_FACE_COUNT,
  CLOUD_PEEK_YAW,
  CLOUD_RADIUS_RATIO,
  CLOUD_SCREEN_WIDTH_RATIO,
  CLOUD_VIEWS,
} from '@/lib/cloud-views';
import type { FieldPlacement } from '@/lib/field-stage-layout';
import {
  CLOUD_APPEAR_S,
  CLOUD_DWELL_S,
  CLOUD_LOCK_LERP,
  CLOUD_SPIN_S,
} from '@/lib/intro-timing';

CLOUD_VIEWS.forEach((view) => {
  useTexture.preload(view.src);
});

type CloudScreenProps = {
  placement: FieldPlacement;
  mobile: boolean;
};

const FACE_STEP = (Math.PI * 2) / CLOUD_FACE_COUNT;

function clamp01(t: number) {
  return Math.max(0, Math.min(1, t));
}

function easeSmooth(t: number) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function easeInOutQuart(t: number) {
  const x = clamp01(t);
  return x < 0.5 ? 8 * x * x * x * x : 1 - (-2 * x + 2) ** 4 / 2;
}

function autoAngle(elapsed: number) {
  const period = CLOUD_DWELL_S + CLOUD_SPIN_S;
  const cycle = Math.floor(elapsed / period);
  const local = elapsed - cycle * period;
  const spin = local <= CLOUD_DWELL_S ? 0 : easeInOutQuart((local - CLOUD_DWELL_S) / CLOUD_SPIN_S);
  return (cycle + spin) * FACE_STEP;
}

function nearestFaceAngle(current: number, index: number) {
  const tau = Math.PI * 2;
  const base = index * FACE_STEP;
  const k = Math.round((current - base) / tau);
  return base + k * tau;
}

export function CloudScreen({ placement, mobile }: CloudScreenProps) {
  const rootRef = useRef<Group>(null);
  const groupRef = useRef<Group>(null);
  const elapsedRef = useRef(0);
  const angleRef = useRef(0);
  const lockedRef = useRef<number | null>(null);
  const { camera } = useThree();

  const size = useMemo(() => {
    if (mobile) {
      const width = 1.92;
      return { body: width / CLOUD_SCREEN_WIDTH_RATIO, width, height: width / CLOUD_ASPECT };
    }
    const body = Math.min(placement.hx * 1.72, placement.hy * 1.52 * CLOUD_ASPECT);
    const width = body * CLOUD_SCREEN_WIDTH_RATIO;
    return { body, width, height: width / CLOUD_ASPECT };
  }, [mobile, placement.hx, placement.hy]);

  const radius = size.body * CLOUD_RADIUS_RATIO;

  useFrame((_, delta) => {
    const root = rootRef.current;
    const group = groupRef.current;
    if (!group) return;

    if (root) {
      const originX = mobile ? 0 : placement.center.x;
      root.rotation.y = Math.atan2(camera.position.x - originX, camera.position.z) + CLOUD_PEEK_YAW;
    }

    elapsedRef.current += delta;
    const appear = easeSmooth(elapsedRef.current / CLOUD_APPEAR_S);
    const locked = lockedRef.current;

    if (locked === null) {
      angleRef.current = autoAngle(elapsedRef.current);
    } else {
      const target = nearestFaceAngle(angleRef.current, locked);
      const k = 1 - Math.exp(-delta * CLOUD_LOCK_LERP);
      angleRef.current = MathUtils.lerp(angleRef.current, target, k);
    }

    group.rotation.y = -angleRef.current;
    group.scale.setScalar(Math.max(appear, 0.001));
    group.visible = appear > 0.02;
  });

  const lockFace = (index: number) => {
    lockedRef.current = index;
  };

  return (
    <group ref={rootRef} position={mobile ? [0, 0.16, 0] : [placement.center.x, placement.center.y, 0]}>
      <group ref={groupRef} scale={0.001}>
        {CLOUD_VIEWS.map((view, index) => (
          <CloudFace
            key={view.id}
            url={view.src}
            label={view.label}
            index={index}
            width={size.width}
            height={size.height}
            radius={radius}
            angleRef={angleRef}
            onSelect={() => lockFace(index)}
          />
        ))}
      </group>
    </group>
  );
}

type CloudFaceProps = {
  url: string;
  label: string;
  index: number;
  width: number;
  height: number;
  radius: number;
  angleRef: RefObject<number>;
  onSelect: () => void;
};

function CloudFace({ url, label, index, width, height, radius, angleRef, onSelect }: CloudFaceProps) {
  const meshRef = useRef<Mesh>(null);
  const yaw = index * FACE_STEP;

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const facing = Math.cos(yaw - angleRef.current);
    const targetOpacity = 0.62 + 0.38 * Math.max(0, facing);
    const k = 1 - Math.exp(-delta * 10);
    const material = mesh.material as { opacity?: number; uniforms?: { opacity?: { value: number } } } | undefined;
    if (material?.uniforms?.opacity) {
      material.uniforms.opacity.value = MathUtils.lerp(material.uniforms.opacity.value, targetOpacity, k);
    } else if (material && typeof material.opacity === 'number') {
      material.opacity = MathUtils.lerp(material.opacity, targetOpacity, k);
    }
  });

  const setCursor = (hovered: boolean) => {
    if (typeof document === 'undefined') return;
    document.body.style.cursor = hovered ? 'pointer' : '';
  };

  useEffect(() => {
    return () => {
      if (typeof document !== 'undefined') document.body.style.cursor = '';
    };
  }, []);

  return (
    <group name={label} rotation={[0, yaw, 0]}>
      <DreiImage
        ref={meshRef}
        url={url}
        position={[0, 0, radius]}
        scale={[width, height]}
        radius={0.055}
        transparent
        toneMapped={false}
        side={FrontSide}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          setCursor(true);
        }}
        onPointerOut={(event) => {
          event.stopPropagation();
          setCursor(false);
        }}
      />
    </group>
  );
}
