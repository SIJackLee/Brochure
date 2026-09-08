'use client';

import { Image as DreiImage, useTexture } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { Group, MathUtils, Mesh } from 'three';
import {
  CLOUD_ASPECT,
  CLOUD_DECK_MOBILE,
  CLOUD_DECK_PC,
  CLOUD_DIM_OPACITY,
  CLOUD_DIM_SCALE,
  CLOUD_FOCUS,
  CLOUD_VIEWS,
} from '@/lib/cloud-views';
import type { FieldPlacement } from '@/lib/field-stage-layout';
import { CLOUD_FOCUS_LERP, CLOUD_INTRO_S, CLOUD_PANEL_AT_S, CLOUD_PANEL_FADE_S } from '@/lib/intro-timing';

CLOUD_VIEWS.forEach((view) => {
  useTexture.preload(view.src);
});

type CloudScreenProps = {
  placement: FieldPlacement;
  mobile: boolean;
};

function easeSmooth(t: number) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

export function CloudScreen({ placement, mobile }: CloudScreenProps) {
  const focusedRef = useRef<number | null>(null);
  const elapsedRef = useRef(0);
  const introDoneRef = useRef(false);

  useFrame((_, delta) => {
    elapsedRef.current += delta;
    introDoneRef.current = elapsedRef.current >= CLOUD_INTRO_S;
  });

  const size = useMemo(() => {
    const width = Math.min(
      placement.hx * (mobile ? 0.9 : 0.72),
      placement.hy * (mobile ? 1.08 : 0.98) * CLOUD_ASPECT,
    );
    return { width, height: width / CLOUD_ASPECT };
  }, [mobile, placement.hx, placement.hy]);

  const slots = mobile ? CLOUD_DECK_MOBILE : CLOUD_DECK_PC;

  return (
    <group position={[placement.center.x, placement.center.y, 0]} rotation={[0.04, -0.12, 0]}>
      {CLOUD_VIEWS.map((view, index) => (
        <CloudCard
          key={view.id}
          url={view.src}
          label={view.label}
          index={index}
          slot={slots[index]}
          hx={placement.hx}
          hy={placement.hy}
          size={size}
          focusedRef={focusedRef}
          elapsedRef={elapsedRef}
          introDoneRef={introDoneRef}
          onSelect={() => {
            if (!introDoneRef.current) return;
            focusedRef.current = focusedRef.current === index ? null : index;
          }}
        />
      ))}
    </group>
  );
}

type CloudCardProps = {
  url: string;
  label: string;
  index: number;
  slot: { x: number; y: number; z: number };
  hx: number;
  hy: number;
  size: { width: number; height: number };
  focusedRef: RefObject<number | null>;
  elapsedRef: RefObject<number>;
  introDoneRef: RefObject<boolean>;
  onSelect: () => void;
};

function CloudCard({
  url,
  label,
  index,
  slot,
  hx,
  hy,
  size,
  focusedRef,
  elapsedRef,
  introDoneRef,
  onSelect,
}: CloudCardProps) {
  const groupRef = useRef<Group>(null);
  const meshRef = useRef<Mesh>(null);

  const rest = useMemo(
    () => ({ x: slot.x * hx, y: slot.y * hy, z: slot.z }),
    [hx, hy, slot.x, slot.y, slot.z],
  );
  const focus = useMemo(
    () => ({ x: CLOUD_FOCUS.x * hx, y: CLOUD_FOCUS.y * hy, z: CLOUD_FOCUS.z }),
    [hx, hy],
  );

  useFrame((_, delta) => {
    const group = groupRef.current;
    const mesh = meshRef.current;
    if (!group) return;

    const appear = easeSmooth((elapsedRef.current - CLOUD_PANEL_AT_S[index]) / CLOUD_PANEL_FADE_S);
    const focused = focusedRef.current;
    const isFocus = focused === index;
    const dimmed = focused !== null && !isFocus;
    const target = isFocus ? focus : rest;
    const targetScale = (isFocus ? CLOUD_FOCUS.scale : dimmed ? CLOUD_DIM_SCALE : 1) * Math.max(appear, 0.001);
    const targetOpacity = appear * (dimmed ? CLOUD_DIM_OPACITY : 1);
    const k = 1 - Math.exp(-delta * CLOUD_FOCUS_LERP);

    group.position.x = MathUtils.lerp(group.position.x, target.x, k);
    group.position.y = MathUtils.lerp(group.position.y, target.y, k);
    group.position.z = MathUtils.lerp(group.position.z, target.z, k);
    const nextScale = MathUtils.lerp(group.scale.x, targetScale, k);
    group.scale.setScalar(nextScale);

    const material = mesh?.material as { opacity?: number; uniforms?: { opacity?: { value: number } } } | undefined;
    if (material?.uniforms?.opacity) {
      material.uniforms.opacity.value = MathUtils.lerp(material.uniforms.opacity.value, targetOpacity, k);
    } else if (material && typeof material.opacity === 'number') {
      material.opacity = MathUtils.lerp(material.opacity, targetOpacity, k);
    }

    group.visible = appear > 0.02;
  });

  const setCursor = (hovered: boolean) => {
    if (!introDoneRef.current || typeof document === 'undefined') return;
    document.body.style.cursor = hovered ? 'pointer' : '';
  };

  useEffect(() => {
    return () => {
      if (typeof document !== 'undefined') document.body.style.cursor = '';
    };
  }, []);

  return (
    <group ref={groupRef} name={label} position={[rest.x, rest.y, rest.z]} scale={0.001}>
      <DreiImage
        ref={meshRef}
        url={url}
        scale={[size.width, size.height]}
        radius={0.055}
        transparent
        toneMapped={false}
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
