'use client';

import { Environment, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Box3, DoubleSide, ExtrudeGeometry, Group, InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Shape, SRGBColorSpace, Vector3 } from 'three';

type BladeSettings = {
  bladeLength: number;
  rootWidth: number;
  rootNeckWidth: number;
  midWidth: number;
  tipWidth: number;
  tipRoundness: number;
  rootRoundness: number;
  thickness: number;
  bevelSize: number;
  bevelThickness: number;
  bevelSegments: number;
  radialOffset: number;
  pitchDegrees: number;
  sweepDegrees: number;
};

const initialBladeSettings: BladeSettings = {
  bladeLength: 6,
  rootWidth: 0.7,
  rootNeckWidth: 0.9,
  midWidth: 1,
  tipWidth: 0.75,
  tipRoundness: 0.08,
  rootRoundness: 0.01,
  thickness: 0.05,
  bevelSize: 0.02,
  bevelThickness: 0.04,
  bevelSegments: 2,
  radialOffset: 0.42,
  pitchDegrees: 22,
  sweepDegrees: 0,
};

export type SectionId = 'motor' | 'controller' | 'cloud';

export type MotorSceneState = 'exploded' | 'assembling' | 'assembled' | 'blade-assembly' | 'spinning' | 'showcase';

type MotorAssemblyRef = {
  elapsed: number;
  state: MotorSceneState;
  hasPlayed: boolean;
  /** 0 = fully assembled overlay, 1 = hover-exploded. Applied after intro. */
  hoverExplode: number;
};

type MotorPartEntry = {
  object: Mesh;
  assembledPosition: Vector3;
  assembledRotation: Vector3;
  explodedOffset: number;
  start: number;
  end: number;
};

function ImportedMotor({ active, assemblyRef, onReady }: { active: boolean; assemblyRef: MutableRefObject<MotorAssemblyRef>; onReady: () => void }) {
  const { scene } = useGLTF('/models/BLDC_Motor_Web_v1.glb');
  const model = useMemo(() => {
    const clone = scene.clone(true);
    const rotatingParts = new Group();
    rotatingParts.name = 'MotorRotatingParts';
    const rotatingMeshes: Mesh[] = [];
    const animationParts: MotorPartEntry[] = [];
    const assemblyOrder = [
      // The lower housing stays at its assembled position and acts as the
      // fixed anchor. PCB must explode further along -Y (past lower), not
      // toward the middle stack — otherwise it tunnels through housing_lower.
      // Target keeps ~40 unit gap between PCB max and lower min.
      ['pcb_cover_assy', -210, 0.18, 0.82],
      ['extrusion_housing', 80, 0.38, 1.02],
      ['st_assy', 190, 0.58, 1.22],
      ['housing_upper', 300, 0.78, 1.42],
      ['front_cover', 410, 0.98, 1.62],
      ['bearing', 510, 1.18, 1.82],
      ['shaft', 630, 1.38, 2.08],
    ] as const;
    const assemblyParts = new Map(assemblyOrder.map(([name, explodedCenter, start, end]) => [name, { explodedCenter, start, end }]));

    clone.traverse((object) => {
      if (!(object instanceof Mesh)) return;

      const name = object.name.toLowerCase();
      let material = new MeshStandardMaterial({
        color: '#d8d2c4',
        metalness: 0.58,
        roughness: 0.42,
      });

      if (name.includes('front_cover')) {
        material = new MeshStandardMaterial({
          color: '#171b2b',
          metalness: 0.36,
          roughness: 0.3,
        });
      } else if (name.includes('shaft')) {
        material = new MeshStandardMaterial({
          color: '#c9d0d1',
          metalness: 0.92,
          roughness: 0.15,
        });
      } else if (name.includes('bearing')) {
        material = new MeshStandardMaterial({
          color: '#d3d6d5',
          metalness: 0.9,
          roughness: 0.18,
        });
      } else if (name.includes('housing_lower')) {
        material = new MeshStandardMaterial({
          color: '#c9c2b4',
          metalness: 0.6,
          roughness: 0.44,
        });
      } else if (name.includes('pcb_cover')) {
        material = new MeshStandardMaterial({
          color: '#bdbbb2',
          metalness: 0.48,
          roughness: 0.4,
        });
      } else if (name.includes('st_assy')) {
        material = new MeshStandardMaterial({
          color: '#565d5d',
          metalness: 0.74,
          roughness: 0.32,
        });
      }

      if (name === 'shaft') {
        // SHAFT geometry is local-Y aligned. With the existing 0.54 length trim,
        // y=40 places its front end at about y=112, the Blade Hub centerline.
        object.scale.y = 0.54;
        object.position.y = 40;
      }

      object.material = material;

      if (['bearing', 'front_cover', 'shaft'].includes(name)) {
        rotatingMeshes.push(object);
      }

      const part = assemblyParts.get(name);
      if (part) {
        object.geometry.computeBoundingBox();
        const geometryCenterY = object.geometry.boundingBox
          ? (object.geometry.boundingBox.min.y + object.geometry.boundingBox.max.y) / 2
          : 0;
        const assembledCenterY = object.position.y + geometryCenterY * object.scale.y;
        animationParts.push({
          object,
          assembledPosition: object.position.clone(),
          assembledRotation: new Vector3(object.rotation.x, object.rotation.y, object.rotation.z),
          explodedOffset: part.explodedCenter - assembledCenterY,
          start: part.start,
          end: part.end,
        });
      }
    });

    rotatingMeshes.forEach((object) => rotatingParts.add(object));
    clone.add(rotatingParts);
    return { clone, rotatingParts, animationParts };
  }, [scene]);

  useEffect(() => {
    onReady();
  }, [onReady]);

  useFrame((_, delta) => {
    const { elapsed, state, hoverExplode } = assemblyRef.current;
    model.animationParts.forEach((part) => {
      const introProgress = state === 'showcase' || state === 'spinning' || state === 'blade-assembly' || state === 'assembled'
        ? 1
        : Math.max(0, Math.min(1, (elapsed - part.start) / (part.end - part.start)));
      const progress = introProgress * (1 - hoverExplode);
      const eased = progress * progress * (3 - 2 * progress);
      part.object.position.copy(part.assembledPosition);
      part.object.position.y += part.explodedOffset * (1 - eased);
      part.object.rotation.set(part.assembledRotation.x, part.assembledRotation.y, part.assembledRotation.z);
    });

    if (!active) return;

    const spinProgress = state === 'spinning'
      ? Math.max(0, Math.min(1, (elapsed - 3.35) / 1.0))
      : state === 'showcase' ? 1 : 0;
    // Keep shaft / bearing / front_cover spinning slowly with the blades while hover-exploded.
    const hoverSpinFactor = Math.max(0.28, 1 - hoverExplode * 0.72);
    const speed = 5.4 * (spinProgress * spinProgress * (3 - 2 * spinProgress)) * hoverSpinFactor;
    // The imported motor is rotated 90 degrees by its parent group, so invert
    // the local Y direction to match the fan rotor's world-space rotation.
    model.rotatingParts.rotation.y -= delta * speed;
  });

  return <primitive object={model.clone} />;
}

useGLTF.preload('/models/BLDC_Motor_Web_v1.glb');
useGLTF.preload('/models/SL_802B_Controller_Web_v1.glb');

function ImportedController() {
  const { scene } = useGLTF('/models/SL_802B_Controller_Web_v1.glb');
  const model = useMemo(() => {
    const clone = scene.clone(true);
    const controllerWhitePlastic = new MeshStandardMaterial({
      color: '#f2f2ed',
      roughness: 0.46,
      metalness: 0,
    });

    clone.traverse((object) => {
      if (!(object instanceof Mesh)) return;

      const name = object.name.toLowerCase();
      if (name === 'front_decal') {
        const originalMaterials = Array.isArray(object.material) ? object.material : [object.material];
        originalMaterials.forEach((material) => {
          const originalMaterial = material as MeshStandardMaterial;
          originalMaterial.side = DoubleSide;
          if (originalMaterial.map) originalMaterial.map.colorSpace = SRGBColorSpace;
          originalMaterial.polygonOffset = true;
          originalMaterial.polygonOffsetFactor = -2;
          originalMaterial.polygonOffsetUnits = -2;
          originalMaterial.needsUpdate = true;
        });
        return;
      }

      if (name === 'enclosure_body' || name === 'front_panel') object.material = controllerWhitePlastic;
    });

    return clone;
  }, [scene]);

  return <primitive object={model} />;
}

/** Temporary comm module: cleaned Front_Panel stood portrait until real asset arrives. */
function CommunicationPlaceholder() {
  const { scene } = useGLTF('/models/SL_802B_Controller_Web_v1.glb');
  const model = useMemo(() => {
    const root = new Group();
    root.name = 'CommModulePlaceholder';

    let panel: Mesh | undefined;
    scene.traverse((object) => {
      if (object instanceof Mesh && object.name.toLowerCase() === 'front_panel') {
        panel = object;
      }
    });
    if (!panel) return root;

    const clone = panel.clone(true);
    clone.geometry = clone.geometry.clone();
    clone.geometry.center();
    clone.material = new MeshStandardMaterial({
      color: '#eef1ec',
      roughness: 0.38,
      metalness: 0,
    });
    // Stand portrait: controller panel width (X) becomes upright height.
    clone.rotation.z = Math.PI / 2;
    root.add(clone);
    return root;
  }, [scene]);

  return <primitive object={model} />;
}

function BladeRotor({ settings, active, assemblyRef }: { settings: BladeSettings; active: boolean; assemblyRef: MutableRefObject<MotorAssemblyRef> }) {
  const rotorRef = useRef<Group>(null);
  const bladeMaterial = useMemo(() => new MeshStandardMaterial({
    color: '#a9141b',
    roughness: 0.5,
    metalness: 0.04,
    transparent: true,
    opacity: 0,
  }), []);
  const bladeGeometry = useMemo(() => {
    const {
      bladeLength,
      rootWidth,
      rootNeckWidth,
      midWidth,
      tipWidth,
      tipRoundness,
      rootRoundness,
      thickness,
      bevelSize,
      bevelThickness,
      bevelSegments,
    } = settings;

    const rootHalf = rootWidth / 2;
    const rootNeckHalf = rootNeckWidth / 2;
    const midHalf = midWidth / 2;
    const tipHalf = tipWidth / 2;

    const shape = new Shape();
    shape.moveTo(-rootHalf, 0);
    shape.quadraticCurveTo(-rootHalf - rootRoundness * 0.28, rootRoundness * 0.5, -rootNeckHalf, 0.2);
    shape.lineTo(-midHalf, bladeLength * 0.55);
    shape.lineTo(-tipHalf, bladeLength - tipRoundness);
    shape.quadraticCurveTo(-tipHalf, bladeLength, 0, bladeLength);
    shape.quadraticCurveTo(tipHalf, bladeLength, tipHalf, bladeLength - tipRoundness);
    shape.lineTo(midHalf, bladeLength * 0.55);
    shape.lineTo(rootNeckHalf, 0.2);
    shape.quadraticCurveTo(rootHalf + rootRoundness * 0.28, rootRoundness * 0.5, rootHalf, 0);
    shape.quadraticCurveTo(0, -rootRoundness * 0.22, -rootHalf, 0);
    shape.closePath();

    return new ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: true,
      bevelSegments,
      bevelSize,
      bevelThickness,
      curveSegments: 8,
    });
  }, [settings]);

  useFrame((_, delta) => {
    if (!rotorRef.current) return;
    const { elapsed, state, hoverExplode } = assemblyRef.current;
    const introAssembly = state === 'showcase' || state === 'spinning'
      ? 1
      : Math.max(0, Math.min(1, (elapsed - 2.65) / 0.7));
    const easedIntro = introAssembly * introAssembly * (3 - 2 * introAssembly);
    const easedHover = hoverExplode * hoverExplode * (3 - 2 * hoverExplode);

    // Hub + blades stay one rigid body. Intro mounts onto the shaft; hover
    // slides the whole rotor further along shaft-forward (-X, blade side).
    // Parent group scale is 0.42, so ~12.5 local ≈ ~5.25 MotorStage units —
    // comparable to the motor shaft explode travel (~4.6) and clears the body.
    rotorRef.current.position.x = -0.72 * (1 - easedIntro) - 12.5 * easedHover;

    rotorRef.current.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        material.transparent = true;
        material.opacity = easedIntro;
        material.depthWrite = easedIntro > 0.98;
        material.needsUpdate = true;
      });
    });
    bladeMaterial.opacity = easedIntro;
    bladeMaterial.needsUpdate = true;

    if (!active) return;
    const spinProgress = state === 'spinning'
      ? Math.max(0, Math.min(1, (elapsed - 3.35) / 1.0))
      : state === 'showcase' ? 1 : 0;
    const hoverSpinFactor = Math.max(0.28, 1 - hoverExplode * 0.72);
    const speed = 5.4 * (spinProgress * spinProgress * (3 - 2 * spinProgress)) * hoverSpinFactor;
    rotorRef.current.rotation.x += delta * speed;
  });

  const pitch = settings.pitchDegrees * (Math.PI / 180);
  const sweep = settings.sweepDegrees * (Math.PI / 180);

  return <group ref={rotorRef}>
    <mesh rotation={[0, 0, Math.PI / 2]} position={[0.24, 0, 0]}>
      <cylinderGeometry args={[0.43, 0.43, 0.72, 72]} />
      <meshStandardMaterial color="#98151a" roughness={0.5} metalness={0.04} />
    </mesh>
    <mesh rotation={[0, 0, Math.PI / 2]} position={[-0.14, 0, 0]}>
      <cylinderGeometry args={[0.52, 0.52, 0.24, 72]} />
      <meshStandardMaterial color="#000000" roughness={0.42} metalness={0.18} />
    </mesh>
    <mesh rotation={[0, 0, Math.PI / 2]} position={[-0.28, 0, 0]}>
      <cylinderGeometry args={[0.16, 0.16, 0.08, 48]} />
      <meshStandardMaterial color="#000000" roughness={0.38} metalness={0.22} />
    </mesh>
    {[0, 1, 2, 3, 4].map((i) => (
      <group key={i} rotation={[(Math.PI * 2 * i) / 5, 0, 0]}>
        <group rotation={[0, 0, sweep]}>
          <mesh geometry={bladeGeometry} material={bladeMaterial} position={[0.08, settings.radialOffset, -settings.thickness / 2]} rotation={[0, pitch, 0]} />
        </group>
      </group>
    ))}
  </group>;
}

type AirflowStreak = {
  x: number;
  y: number;
  z: number;
  speed: number;
  length: number;
  phase: number;
  kind: 'air' | 'dust';
};

const AIRFLOW_DUST_LEAD_IN = 0.48;
const AIRFLOW_DUST_WINDOW = 4.2;

/**
 * Exhaust causality (section 1):
 * 1) spinning → clean air streaks begin immediately
 * 2) after ~0.48s → copy dust wash starts (air leads dust)
 * 3) during dust window → dusty motes ride the same -X exhaust
 * 4) after dust clears → clean ventilation streaks sustain
 */
function AirflowStreaks({
  assemblyRef,
  active,
}: {
  assemblyRef: MutableRefObject<MotorAssemblyRef>;
  active: boolean;
}) {
  const airCount = 72;
  const dustCount = 40;
  const count = airCount + dustCount;
  const meshRef = useRef<InstancedMesh>(null);
  const materialRef = useRef<MeshBasicMaterial>(null);
  const blowClockRef = useRef(0);
  const dummy = useMemo(() => new Object3D(), []);
  const colorAir = useMemo(() => new Vector3(0.25, 0.38, 0.32), []);
  const colorDust = useMemo(() => new Vector3(0.42, 0.28, 0.16), []);
  const colorScratch = useMemo(() => new Vector3(), []);
  const streaks = useMemo<AirflowStreak[]>(
    () => Array.from({ length: count }, (_, index) => ({
      x: -0.25 - Math.random() * 6.2,
      y: (Math.random() - 0.5) * 2.9,
      z: (Math.random() - 0.5) * 2.9,
      speed: 2.6 + Math.random() * 4.2,
      length: index < airCount ? 0.75 + Math.random() * 1.2 : 0.18 + Math.random() * 0.28,
      phase: Math.random(),
      kind: (index < airCount ? 'air' : 'dust') as 'air' | 'dust',
    })),
    [airCount, count],
  );

  useFrame((_, delta) => {
    if (!meshRef.current || !materialRef.current) return;

    const { elapsed, state, hoverExplode } = assemblyRef.current;
    const blowing = active && (state === 'spinning' || state === 'showcase');
    if (blowing) blowClockRef.current += delta;
    else blowClockRef.current = 0;

    const spinProgress = state === 'spinning'
      ? Math.max(0, Math.min(1, (elapsed - 3.35) / 1.0))
      : state === 'showcase' ? 1 : 0;
    const spinEase = spinProgress * spinProgress * (3 - 2 * spinProgress);
    const dustWindowEnd = AIRFLOW_DUST_LEAD_IN + AIRFLOW_DUST_WINDOW;
    const inDustWindow = blowClockRef.current >= AIRFLOW_DUST_LEAD_IN
      && blowClockRef.current <= dustWindowEnd;
    const dustMix = inDustWindow
      ? Math.min(1, (blowClockRef.current - AIRFLOW_DUST_LEAD_IN) / 0.55)
      : blowClockRef.current > dustWindowEnd
        ? Math.max(0, 1 - (blowClockRef.current - dustWindowEnd) / 0.8)
        : 0;
    const sustain = blowClockRef.current > dustWindowEnd ? 0.74 : 1;
    const strength = blowing
      ? Math.max(0.16, spinEase * sustain * (1 - hoverExplode * 0.38))
      : 0;

    colorScratch.copy(colorAir).lerp(colorDust, dustMix * 0.85);
    materialRef.current.color.setRGB(colorScratch.x, colorScratch.y, colorScratch.z);
    materialRef.current.opacity = 0.3 + strength * (0.5 + dustMix * 0.22);

    streaks.forEach((streak, index) => {
      const isDustMote = streak.kind === 'dust';
      if (!blowing || (isDustMote && dustMix <= 0.02)) {
        dummy.scale.set(0, 0, 0);
      } else {
        const localStrength = strength * (isDustMote ? 0.75 + dustMix * 0.55 : 1);
        streak.x -= streak.speed * localStrength * delta;
        streak.phase += delta * (1.05 + localStrength * 1.5);
        if (streak.x < -8.4) {
          streak.x = -0.15 - Math.random() * 0.7;
          streak.y = (Math.random() - 0.5) * (isDustMote ? 2.2 : 2.8);
          streak.z = (Math.random() - 0.5) * (isDustMote ? 2.2 : 2.8);
          streak.phase = 0;
        }
        const travel = Math.max(0, Math.min(1, (-streak.x - 0.1) / 7.8));
        const pulse = 0.38 + 0.62 * Math.sin(streak.phase * Math.PI);
        const fade = (1 - travel * (isDustMote ? 0.55 : 0.7)) * pulse * localStrength * (isDustMote ? dustMix : 1);
        dummy.position.set(streak.x, streak.y, streak.z);
        if (isDustMote) {
          const size = (0.05 + travel * 0.04) * fade;
          dummy.scale.set(size * 1.2, size, size);
        } else {
          dummy.scale.set(
            streak.length * (0.9 + localStrength * 0.7),
            0.05 * fade,
            0.05 * fade,
          );
        }
        dummy.rotation.set(0, 0, 0);
      }
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(index, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial
        ref={materialRef}
        color="#405f51"
        transparent
        opacity={0.55}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

function PartsStudy({
  activeSection,
  onMotorPhaseChange,
  onMotorHoverChange,
}: {
  activeSection: SectionId;
  onMotorPhaseChange?: (phase: MotorSceneState) => void;
  onMotorHoverChange?: (hovered: boolean) => void;
}) {
  const studyRef = useRef<Group>(null);
  const motorBodyRef = useRef<Group>(null);
  const controllerRef = useRef<Group>(null);
  const motorAssemblyRef = useRef<MotorAssemblyRef>({
    elapsed: 0,
    state: 'exploded',
    hasPlayed: false,
    hoverExplode: 0,
  });
  const introClockRef = useRef(0);
  const motorReadyRef = useRef(false);
  const motorHoveredRef = useRef(false);
  const hoverExplodeRef = useRef(0);
  const lastReportedPhaseRef = useRef<MotorSceneState | null>(null);
  const onMotorPhaseChangeRef = useRef(onMotorPhaseChange);
  const onMotorHoverChangeRef = useRef(onMotorHoverChange);
  const [controllerScale, setControllerScale] = useState(1);

  useEffect(() => {
    onMotorPhaseChangeRef.current = onMotorPhaseChange;
  }, [onMotorPhaseChange]);

  useEffect(() => {
    onMotorHoverChangeRef.current = onMotorHoverChange;
  }, [onMotorHoverChange]);

  const reportPhase = (phase: MotorSceneState) => {
    if (lastReportedPhaseRef.current === phase) return;
    lastReportedPhaseRef.current = phase;
    onMotorPhaseChangeRef.current?.(phase);
  };

  useEffect(() => {
    if (activeSection === 'motor') {
      introClockRef.current = 0;
      motorHoveredRef.current = false;
      hoverExplodeRef.current = 0;
      motorAssemblyRef.current = {
        elapsed: 0,
        state: 'exploded',
        hasPlayed: false,
        hoverExplode: 0,
      };
      reportPhase('exploded');
      return;
    }

    motorHoveredRef.current = false;
    hoverExplodeRef.current = 0;
    motorAssemblyRef.current = {
      elapsed: 5,
      state: 'showcase',
      hasPlayed: true,
      hoverExplode: 0,
    };
    lastReportedPhaseRef.current = 'showcase';
  }, [activeSection]);

  useFrame((_, delta) => {
    if (activeSection !== 'motor' || !motorReadyRef.current) return;

    const canHoverExplode = motorAssemblyRef.current.hasPlayed;
    const hoverTarget = canHoverExplode && motorHoveredRef.current ? 1 : 0;
    hoverExplodeRef.current += (hoverTarget - hoverExplodeRef.current) * Math.min(1, delta * 5);
    if (Math.abs(hoverExplodeRef.current - hoverTarget) < 0.001) hoverExplodeRef.current = hoverTarget;

    if (motorAssemblyRef.current.hasPlayed) {
      motorAssemblyRef.current = {
        ...motorAssemblyRef.current,
        elapsed: 5,
        state: 'showcase',
        hasPlayed: true,
        hoverExplode: hoverExplodeRef.current,
      };
      reportPhase('showcase');
      return;
    }

    introClockRef.current += delta;
    const elapsed = Math.min(introClockRef.current, 5);
    const state: MotorSceneState = elapsed < 0.15
      ? 'exploded'
      : elapsed < 2.35
        ? 'assembling'
        : elapsed < 2.65
          ? 'assembled'
          : elapsed < 3.35
            ? 'blade-assembly'
            : elapsed < 4.35 ? 'spinning' : 'showcase';

    if (elapsed >= 5) {
      motorAssemblyRef.current = {
        elapsed: 5,
        state: 'showcase',
        hasPlayed: true,
        hoverExplode: hoverExplodeRef.current,
      };
      reportPhase('showcase');
      return;
    }

    motorAssemblyRef.current = {
      elapsed,
      state,
      hasPlayed: false,
      hoverExplode: 0,
    };
    reportPhase(state);
  });

  useLayoutEffect(() => {
    if (!motorBodyRef.current || !controllerRef.current) return;

    motorBodyRef.current.updateWorldMatrix(true, true);
    controllerRef.current.updateWorldMatrix(true, true);

    const motorBox = new Box3().setFromObject(motorBodyRef.current);
    const controllerBox = new Box3().setFromObject(controllerRef.current);
    const motorBodySize = motorBox.getSize(new Vector3());
    const controllerSize = controllerBox.getSize(new Vector3());
    const motorMaxDimension = Math.max(motorBodySize.x, motorBodySize.y, motorBodySize.z);
    const controllerMaxDimension = Math.max(controllerSize.x, controllerSize.y, controllerSize.z);

    if (motorMaxDimension <= 0 || controllerMaxDimension <= 0) return;
    if (controllerScale === 1) setControllerScale((motorMaxDimension * 0.95) / controllerMaxDimension);
  }, [controllerScale]);

  const setMotorHovered = (hovered: boolean) => {
    if (!motorAssemblyRef.current.hasPlayed) return;
    motorHoveredRef.current = hovered;
    onMotorHoverChangeRef.current?.(hovered);
    if (typeof document !== 'undefined') {
      document.body.style.cursor = hovered ? 'pointer' : '';
    }
  };

  useEffect(() => {
    if (activeSection !== 'motor') {
      onMotorHoverChangeRef.current?.(false);
      if (typeof document !== 'undefined') document.body.style.cursor = '';
    }
  }, [activeSection]);

  return <>
    <group ref={studyRef} name="ProductStages" position={[0.55, 0.05, 0]} rotation={[0.06, -0.3, 0]} scale={0.72}>
      <group
        name="MotorStage"
        visible={activeSection === 'motor'}
        position={[0.25, 0.15, 0]}
        onPointerOver={(event) => {
          event.stopPropagation();
          setMotorHovered(true);
        }}
        onPointerOut={(event) => {
          event.stopPropagation();
          setMotorHovered(false);
        }}
      >
        <mesh visible={false} position={[-2.4, 0, 0]} userData={{ motorHitProxy: true }}>
          <boxGeometry args={[7.2, 3.4, 3.4]} />
        </mesh>
        <group ref={motorBodyRef} rotation={[0, 0, Math.PI / 2]} scale={0.008}><ImportedMotor active={activeSection === 'motor'} assemblyRef={motorAssemblyRef} onReady={() => { motorReadyRef.current = true; }} /></group>
        <group position={[-0.76, 0, 0]} scale={0.42}><BladeRotor active={activeSection === 'motor'} assemblyRef={motorAssemblyRef} settings={initialBladeSettings} /></group>
        <AirflowStreaks assemblyRef={motorAssemblyRef} active={activeSection === 'motor'} />
      </group>

      <group name="CloudStage" visible={activeSection === 'cloud'} />
    </group>

    {/*
      Section 02 empty stage = screen area to the RIGHT of the copy column.
      Kept outside ProductStages so placement maps 1:1 to camera/screen axes.
      Camera looks at ~1.25; copy ends near screen NDC -0.2 (~world x -0.5).
    */}
    <group name="FieldStage" visible={activeSection === 'controller'} position={[1.25, 0.1, 0]} scale={0.72}>
      <group
        name="ControllerStage"
        ref={controllerRef}
        position={[-1.05, 1.45, 0]}
        rotation={[0.05, -0.16, 0]}
        scale={controllerScale}
      >
        <ImportedController />
      </group>
      <group
        name="CommunicationStage"
        position={[1.7, -1.5, 0.22]}
        rotation={[0.04, 0.22, 0]}
        scale={controllerScale * 1.15}
      >
        <CommunicationPlaceholder />
      </group>
    </group>
  </>;
}

type CameraRigProps = {
  activeSection: SectionId;
};

const CAMERA_POSES: Record<SectionId, { position: Vector3; target: Vector3 }> = {
  motor: {
    position: new Vector3(-0.15, 0.18, 9.2),
    target: new Vector3(-0.15, 0.12, 0),
  },
  controller: {
    // Center of the right empty stage (past the copy column).
    position: new Vector3(1.25, 0.05, 8.2),
    target: new Vector3(1.25, -0.12, 0),
  },
  cloud: {
    position: new Vector3(-7, 0, 8.8),
    target: new Vector3(-7, 0, 0),
  },
};

function CameraRig({ activeSection }: CameraRigProps) {
  const { camera, size } = useThree();
  const elapsedRef = useRef(0);
  const initializedRef = useRef(false);
  const transitionRef = useRef(0);
  const fromPosition = useMemo(() => new Vector3(), []);
  const fromTarget = useMemo(() => new Vector3(), []);
  const toPosition = useMemo(() => new Vector3(), []);
  const toTarget = useMemo(() => new Vector3(), []);
  const currentTarget = useMemo(() => new Vector3(), []);
  const nextPosition = useMemo(() => new Vector3(), []);
  const nextTarget = useMemo(() => new Vector3(), []);

  const getResponsivePose = (section: SectionId) => {
    const pose = CAMERA_POSES[section];
    const position = pose.position.clone();
    const target = pose.target.clone();
    if (size.width < 640) {
      position.z += 2.2;
      target.y -= 0.42;
    }
    return { position, target };
  };

  useEffect(() => {
    elapsedRef.current = 0;
    const pose = getResponsivePose(activeSection);

    if (!initializedRef.current) {
      camera.position.copy(pose.position);
      currentTarget.copy(pose.target);
      initializedRef.current = true;
    } else {
      fromPosition.copy(camera.position);
      fromTarget.copy(currentTarget);
      transitionRef.current = 0.001;
    }

    toPosition.copy(pose.position);
    toTarget.copy(pose.target);
  }, [activeSection, camera, size.width, currentTarget, fromPosition, fromTarget, toPosition, toTarget]);

  useFrame((_, delta) => {
    elapsedRef.current += delta;
    if (transitionRef.current > 0 && transitionRef.current < 1) {
      transitionRef.current = Math.min(1, transitionRef.current + delta / 1.1);
      const eased = transitionRef.current * transitionRef.current * (3 - 2 * transitionRef.current);
      nextPosition.lerpVectors(fromPosition, toPosition, eased);
      nextTarget.lerpVectors(fromTarget, toTarget, eased);
    } else {
      nextPosition.copy(toPosition);
      nextTarget.copy(toTarget);

      if (activeSection === 'motor') {
        nextPosition.x += Math.sin(elapsedRef.current * 0.16) * 0.16;
        nextPosition.y += Math.cos(elapsedRef.current * 0.14) * 0.07;
      } else if (activeSection === 'controller') {
        nextPosition.x += Math.sin(elapsedRef.current * 0.12) * 0.08;
        nextPosition.z += Math.sin(elapsedRef.current * 0.1) * 0.1;
      }
    }

    camera.position.copy(nextPosition);
    currentTarget.copy(nextTarget);
    camera.lookAt(nextTarget);
  });

  return null;
}

type FanSceneProps = {
  activeSection: SectionId;
  onMotorPhaseChange?: (phase: MotorSceneState) => void;
  onMotorHoverChange?: (hovered: boolean) => void;
};

export default function FanScene({ activeSection, onMotorPhaseChange, onMotorHoverChange }: FanSceneProps) {
  const allowMotorPointer = activeSection === 'motor';

  return (
    <div className="relative h-full w-full">
      <Canvas
        camera={{ fov: 38, position: [0, 0, 8.2] }}
        style={{ pointerEvents: allowMotorPointer ? 'auto' : 'none' }}
      >
        <color attach="background" args={['#dfece5']} />
        <ambientLight intensity={0.72} />
        <directionalLight intensity={2.8} position={[4, 5, 5]} />
        <directionalLight intensity={1.1} position={[-4, 2, 2]} color="#d9eee6" />
        <Environment preset="warehouse" />
        <PartsStudy
          activeSection={activeSection}
          onMotorPhaseChange={onMotorPhaseChange}
          onMotorHoverChange={onMotorHoverChange}
        />
        <CameraRig activeSection={activeSection} />
      </Canvas>
    </div>
  );
}
