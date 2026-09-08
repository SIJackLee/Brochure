'use client';

import { Environment, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, Suspense, type MutableRefObject } from 'react';
import { Box3, DoubleSide, ExtrudeGeometry, Group, InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Shape, SRGBColorSpace, Vector3 } from 'three';
import { CloudScreen } from '@/components/cloud-stage';
import { computeFieldPlacement, controllerCameraPose } from '@/lib/field-stage-layout';
import {
  CONTROLLER_BOOT_DIGIT_DURATION,
  CONTROLLER_BOOT_DIGIT_STARTS,
  CONTROLLER_BOOT_FAN_START,
  CONTROLLER_BOOT_FAN_STEP_S,
  CONTROLLER_BOOT_STATUS_START,
  CONTROLLER_CAMERA_MOVE_S,
  CONTROLLER_POWER_END_S,
  CONTROLLER_POWER_START_S,
  CONTROLLER_SETTLE_HOLD_S,
} from '@/lib/controller-boot';
import {
  MOTOR_AIRFLOW_DUST_LEAD_S,
  MOTOR_AIRFLOW_DUST_WINDOW_S,
  MOTOR_ASSEMBLED_END_S,
  MOTOR_ASSEMBLE_END_S,
  MOTOR_BLADE_END_S,
  MOTOR_BLADE_RAMP_S,
  MOTOR_BLADE_START_S,
  MOTOR_EXPLODED_HOLD_S,
  MOTOR_INTRO_END_S,
  MOTOR_PART_WINDOWS,
  MOTOR_SPIN_END_S,
  MOTOR_SPIN_RAMP_S,
  MOTOR_SPIN_START_S,
} from '@/lib/intro-timing';

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

const CONTROLLER_MODEL_PATH = '/models/SL802B_controller_master.glb';
const COMM_MODEL_PATH = '/models/SL9001_comm_module_master.glb';
const NARROW_CANVAS_PX = 640;
/** Click-to-re-explode travel on a ~390px canvas, so PCB-to-blade stay on screen. */
const MOBILE_REEXPLODE_SCALE = 0.58;

function reexplodeScaleForWidth(width: number) {
  return width < NARROW_CANVAS_PX ? MOBILE_REEXPLODE_SCALE : 1;
}

export type SectionId = 'motor' | 'controller' | 'cloud';

export type MotorSceneState = 'exploded' | 'assembling' | 'assembled' | 'blade-assembly' | 'spinning' | 'showcase';

type ControllerLamp = {
  mesh: Mesh;
  material: MeshStandardMaterial;
};

const CONTROLLER_DIGIT_VALUES = [2, 4, 7] as const;
const CONTROLLER_ROCKER_OFF_X = 0.2;
const CONTROLLER_ROCKER_ON_X = -0.2;
/** LED_MENU_4 sits at the top of MENU = FAN 1 on the SL-802B print. */
const MENU_FAN1_INDEX = 3;
/** FAN% 10..70 are LED_FAN_01..07; 80 is LED_FAN_08 and blinks. */
const FAN_PCT_SOLID_LAST = 6;
const FAN_PCT_BLINK_INDEX = 7;
const SEVEN_SEGMENTS: Record<number, string> = {
  0: 'abcdef',
  1: 'bc',
  2: 'abdeg',
  3: 'abcdg',
  4: 'bcfg',
  5: 'acdfg',
  6: 'acdefg',
  7: 'abc',
  8: 'abcdefg',
  9: 'abcdfg',
};

function easeSmooth(t: number) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function lampify(mesh: Mesh, emissive = '#ff2f24') {
  const original = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const material = original instanceof MeshStandardMaterial
    ? original.clone()
    : new MeshStandardMaterial({ color: '#3a1010', roughness: 0.42, metalness: 0.08 });
  material.emissive.set(emissive);
  material.emissiveIntensity = 0;
  material.toneMapped = false;
  mesh.material = material;
  return { mesh, material } satisfies ControllerLamp;
}

function setLamp(lamp: ControllerLamp | undefined, intensity: number) {
  if (!lamp) return;
  const on = Math.max(0, intensity);
  lamp.material.emissiveIntensity = on;
  lamp.material.transparent = on < 0.98;
  lamp.material.opacity = Math.max(0, Math.min(1, on / 0.9));
  lamp.material.depthWrite = on > 0.6;
  lamp.mesh.visible = on > 0.03;
}

type MotorAssemblyRef = {
  elapsed: number;
  state: MotorSceneState;
  hasPlayed: boolean;
  /** 0 = fully assembled, 1 = user-toggled exploded. Applied after intro. */
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
  const { size } = useThree();
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
      ['pcb_cover_assy', -210, ...MOTOR_PART_WINDOWS[0]],
      ['extrusion_housing', 80, ...MOTOR_PART_WINDOWS[1]],
      ['st_assy', 190, ...MOTOR_PART_WINDOWS[2]],
      ['housing_upper', 300, ...MOTOR_PART_WINDOWS[3]],
      ['front_cover', 410, ...MOTOR_PART_WINDOWS[4]],
      ['bearing', 510, ...MOTOR_PART_WINDOWS[5]],
      ['shaft', 630, ...MOTOR_PART_WINDOWS[6]],
    ] as const;
    const assemblyParts = new Map<string, { explodedCenter: number; start: number; end: number }>(
      assemblyOrder.map(([name, explodedCenter, start, end]) => [name, { explodedCenter, start, end }]),
    );

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
    const hoverTravel = hoverExplode * reexplodeScaleForWidth(size.width);
    model.animationParts.forEach((part) => {
      const introProgress = state === 'showcase' || state === 'spinning' || state === 'blade-assembly' || state === 'assembled'
        ? 1
        : Math.max(0, Math.min(1, (elapsed - part.start) / (part.end - part.start)));
      const progress = introProgress * (1 - hoverTravel);
      const eased = progress * progress * (3 - 2 * progress);
      part.object.position.copy(part.assembledPosition);
      part.object.position.y += part.explodedOffset * (1 - eased);
      part.object.rotation.set(part.assembledRotation.x, part.assembledRotation.y, part.assembledRotation.z);
    });

    if (!active) return;

    const spinProgress = state === 'spinning'
      ? Math.max(0, Math.min(1, (elapsed - MOTOR_SPIN_START_S) / MOTOR_SPIN_RAMP_S))
      : state === 'showcase' ? 1 : 0;
    // Keep shaft / bearing / front_cover spinning slowly with the blades while user-exploded.
    const hoverSpinFactor = Math.max(0.28, 1 - hoverExplode * 0.72);
    const speed = 5.4 * (spinProgress * spinProgress * (3 - 2 * spinProgress)) * hoverSpinFactor;
    // The imported motor is rotated 90 degrees by its parent group, so invert
    // the local Y direction to match the fan rotor's world-space rotation.
    model.rotatingParts.rotation.y -= delta * speed;
  });

  return <primitive object={model.clone} />;
}

useGLTF.preload('/models/BLDC_Motor_Web_v1.glb');
useGLTF.preload(CONTROLLER_MODEL_PATH);
useGLTF.preload(COMM_MODEL_PATH);

function ImportedController({ active }: { active: boolean }) {
  const elapsedRef = useRef(0);
  const { scene } = useGLTF(CONTROLLER_MODEL_PATH);
  const rig = useMemo(() => {
    const clone = scene.clone(true);
    const controllerWhitePlastic = new MeshStandardMaterial({
      color: '#f2f2ed',
      roughness: 0.46,
      metalness: 0,
    });
    const digits: Array<Record<string, ControllerLamp>> = [{}, {}, {}];
    const fanLeds: ControllerLamp[] = [];
    const menuLeds: ControllerLamp[] = [];
    const settingLeds: ControllerLamp[] = [];
    let rocker: Mesh | null = null;
    let displayWindow: ControllerLamp | undefined;
    let symbolI: ControllerLamp | undefined;
    let symbolO: ControllerLamp | undefined;

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

      if (name === 'enclosure_body' || name === 'front_panel') {
        object.material = controllerWhitePlastic;
        return;
      }

      if (name === 'power_spst_rocker') {
        rocker = object;
        return;
      }

      const digitMatch = name.match(/^digit_([123])_([a-g])$/);
      if (digitMatch) {
        digits[Number(digitMatch[1]) - 1][digitMatch[2]] = lampify(object, '#ff2a22');
        return;
      }

      const fanMatch = name.match(/^led_fan_(\d+)$/);
      if (fanMatch) {
        fanLeds[Number(fanMatch[1]) - 1] = lampify(object, '#ff2f24');
        return;
      }

      const menuMatch = name.match(/^led_menu_(\d+)$/);
      if (menuMatch) {
        menuLeds[Number(menuMatch[1]) - 1] = lampify(object, '#ff3a28');
        return;
      }

      const settingMatch = name.match(/^led_setting_[lr](\d+)$/);
      if (settingMatch) {
        settingLeds.push(lampify(object, '#ff3a28'));
        return;
      }

      if (name === 'display_window_3d') {
        displayWindow = lampify(object, '#5a0808');
        return;
      }

      if (name === 'power_symbol_i') {
        symbolI = lampify(object, '#f4f0e6');
        return;
      }

      if (name === 'power_symbol_o') {
        symbolO = lampify(object, '#f4f0e6');
      }
    });

    return {
      clone,
      rocker: rocker as Mesh | null,
      digits,
      fanLeds: fanLeds.filter(Boolean),
      menuLeds: menuLeds.filter(Boolean),
      settingLeds,
      displayWindow,
      symbolI,
      symbolO,
    };
  }, [scene]);

  useEffect(() => {
    elapsedRef.current = 0;
  }, [active]);

  useFrame((_, delta) => {
    if (!active) {
      elapsedRef.current = 0;
    } else {
      elapsedRef.current += delta;
    }

    const elapsed = active ? elapsedRef.current : 0;
    const powerT = easeSmooth((elapsed - CONTROLLER_POWER_START_S) / (CONTROLLER_POWER_END_S - CONTROLLER_POWER_START_S));
    if (rig.rocker) {
      rig.rocker.rotation.x = CONTROLLER_ROCKER_OFF_X + (CONTROLLER_ROCKER_ON_X - CONTROLLER_ROCKER_OFF_X) * powerT;
    }
    setLamp(rig.symbolI, 0.15 + powerT * 1.35);
    setLamp(rig.symbolO, 0.55 * (1 - powerT));
    setLamp(rig.displayWindow, powerT * 0.55);

    rig.digits.forEach((segments, digitIndex) => {
      const digitStart = CONTROLLER_BOOT_DIGIT_STARTS[digitIndex];
      const digitT = easeSmooth((elapsed - digitStart) / CONTROLLER_BOOT_DIGIT_DURATION);
      const lit = SEVEN_SEGMENTS[CONTROLLER_DIGIT_VALUES[digitIndex]] ?? '';
      Object.entries(segments).forEach(([seg, lamp]) => {
        setLamp(lamp, lit.includes(seg) ? digitT * 2.4 : 0);
      });
    });

    const fanStep = CONTROLLER_BOOT_FAN_STEP_S;
    rig.fanLeds.forEach((lamp, index) => {
      if (index <= FAN_PCT_SOLID_LAST) {
        const onT = easeSmooth((elapsed - (CONTROLLER_BOOT_FAN_START + index * fanStep)) / 0.16);
        setLamp(lamp, onT * 2.55);
        return;
      }
      if (index === FAN_PCT_BLINK_INDEX) {
        const blinkReady = elapsed >= CONTROLLER_BOOT_FAN_START + (FAN_PCT_BLINK_INDEX * fanStep);
        if (!blinkReady) {
          setLamp(lamp, 0);
          return;
        }
        const blinkOn = (elapsed * 1.65) % 1 < 0.52;
        setLamp(lamp, blinkOn ? 2.7 : 0.06);
        return;
      }
      setLamp(lamp, 0);
    });

    const statusT = easeSmooth((elapsed - CONTROLLER_BOOT_STATUS_START) / 0.4);
    rig.menuLeds.forEach((lamp, index) => {
      setLamp(lamp, index === MENU_FAN1_INDEX ? statusT * 1.9 : 0);
    });
    rig.settingLeds.forEach((lamp) => setLamp(lamp, 0));
  });

  return <primitive object={rig.clone} />;
}

function ImportedCommModule() {
  const { scene } = useGLTF(COMM_MODEL_PATH);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.name = 'CommModule';
    const casingPlastic = new MeshStandardMaterial({
      color: '#f2f2ed',
      roughness: 0.46,
      metalness: 0,
    });

    clone.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const name = object.name.toLowerCase();

      if (name.includes('front_decal') || name.includes('front_panel_image')) {
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

      if (name.includes('casing_body') || name.includes('casing_front_panel')) {
        object.material = casingPlastic;
      }
    });

    return clone;
  }, [scene]);

  return <primitive object={model} />;
}

function BladeRotor({ settings, active, assemblyRef }: { settings: BladeSettings; active: boolean; assemblyRef: MutableRefObject<MotorAssemblyRef> }) {
  const { size } = useThree();
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
      : Math.max(0, Math.min(1, (elapsed - MOTOR_BLADE_START_S) / MOTOR_BLADE_RAMP_S));
    const easedIntro = introAssembly * introAssembly * (3 - 2 * introAssembly);
    const easedHover = hoverExplode * hoverExplode * (3 - 2 * hoverExplode);

    // Hub + blades stay one rigid body. Intro mounts onto the shaft; hover
    // slides the whole rotor further along shaft-forward (-X, blade side).
    // Parent group scale is 0.42, so ~12.5 local ≈ ~5.25 MotorStage units —
    // comparable to the motor shaft explode travel (~4.6) and clears the body.
    const bladeHoverTravel = 12.5 * reexplodeScaleForWidth(size.width);
    rotorRef.current.position.x = -0.72 * (1 - easedIntro) - bladeHoverTravel * easedHover;

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
      ? Math.max(0, Math.min(1, (elapsed - MOTOR_SPIN_START_S) / MOTOR_SPIN_RAMP_S))
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

const AIRFLOW_DUST_LEAD_IN = MOTOR_AIRFLOW_DUST_LEAD_S;
const AIRFLOW_DUST_WINDOW = MOTOR_AIRFLOW_DUST_WINDOW_S;

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
      ? Math.max(0, Math.min(1, (elapsed - MOTOR_SPIN_START_S) / MOTOR_SPIN_RAMP_S))
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
  mobileLayout,
}: {
  activeSection: SectionId;
  onMotorPhaseChange?: (phase: MotorSceneState) => void;
  onMotorHoverChange?: (hovered: boolean) => void;
  mobileLayout: boolean;
}) {
  const { size, gl } = useThree();
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
  const motorExplodedRef = useRef(false);
  const hoverExplodeRef = useRef(0);
  const lastReportedPhaseRef = useRef<MotorSceneState | null>(null);
  const onMotorPhaseChangeRef = useRef(onMotorPhaseChange);
  const onMotorHoverChangeRef = useRef(onMotorHoverChange);
  const [controllerScale, setControllerScale] = useState(1);
  const fieldPlacement = useMemo(
    () => computeFieldPlacement(size.width, size.height, mobileLayout),
    [size.width, size.height, mobileLayout],
  );

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
      motorExplodedRef.current = false;
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

    motorExplodedRef.current = false;
    hoverExplodeRef.current = 0;
    motorAssemblyRef.current = {
      elapsed: MOTOR_INTRO_END_S,
      state: 'showcase',
      hasPlayed: true,
      hoverExplode: 0,
    };
    lastReportedPhaseRef.current = 'showcase';
  }, [activeSection]);

  useFrame((_, delta) => {
    if (activeSection !== 'motor' || !motorReadyRef.current) return;

    const canHoverExplode = motorAssemblyRef.current.hasPlayed;
    const hoverTarget = canHoverExplode && motorExplodedRef.current ? 1 : 0;
    hoverExplodeRef.current += (hoverTarget - hoverExplodeRef.current) * Math.min(1, delta * 5);
    if (Math.abs(hoverExplodeRef.current - hoverTarget) < 0.001) hoverExplodeRef.current = hoverTarget;

    if (motorAssemblyRef.current.hasPlayed) {
      motorAssemblyRef.current = {
        ...motorAssemblyRef.current,
        elapsed: MOTOR_INTRO_END_S,
        state: 'showcase',
        hasPlayed: true,
        hoverExplode: hoverExplodeRef.current,
      };
      reportPhase('showcase');
      return;
    }

    introClockRef.current += delta;
    const elapsed = Math.min(introClockRef.current, MOTOR_INTRO_END_S);
    const state: MotorSceneState = elapsed < MOTOR_EXPLODED_HOLD_S
      ? 'exploded'
      : elapsed < MOTOR_ASSEMBLE_END_S
        ? 'assembling'
        : elapsed < MOTOR_ASSEMBLED_END_S
          ? 'assembled'
          : elapsed < MOTOR_BLADE_END_S
            ? 'blade-assembly'
            : elapsed < MOTOR_SPIN_END_S ? 'spinning' : 'showcase';

    if (elapsed >= MOTOR_INTRO_END_S) {
      motorAssemblyRef.current = {
        elapsed: MOTOR_INTRO_END_S,
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

  const activeSectionRef = useRef(activeSection);
  activeSectionRef.current = activeSection;

  const toggleMotorExploded = () => {
    if (activeSectionRef.current !== 'motor') return;
    if (!motorAssemblyRef.current.hasPlayed) return;
    motorExplodedRef.current = !motorExplodedRef.current;
    onMotorHoverChangeRef.current?.(motorExplodedRef.current);
  };

  useEffect(() => {
    const canvas = gl.domElement;
    const handleClick = () => toggleMotorExploded();
    canvas.addEventListener('click', handleClick);
    return () => canvas.removeEventListener('click', handleClick);
  }, [gl]);

  const setMotorCursor = (hovered: boolean) => {
    if (!motorAssemblyRef.current.hasPlayed || typeof document === 'undefined') return;
    document.body.style.cursor = hovered ? 'pointer' : '';
  };

  useEffect(() => {
    if (activeSection !== 'motor') {
      motorExplodedRef.current = false;
      onMotorHoverChangeRef.current?.(false);
      if (typeof document !== 'undefined') document.body.style.cursor = '';
    }
  }, [activeSection]);

  return <>
    <group
      ref={studyRef}
      name="ProductStages"
      position={mobileLayout ? [0.55, 0.05, 0] : [0.68, 0.04, 0]}
      rotation={[0.06, -0.3, 0]}
      scale={mobileLayout ? 0.8 : 0.90}
    >
      <group
        name="MotorStage"
        visible={activeSection === 'motor'}
        position={[0.25, 0.15, 0]}
        onPointerOver={(event) => {
          event.stopPropagation();
          setMotorCursor(true);
        }}
        onPointerOut={(event) => {
          event.stopPropagation();
          setMotorCursor(false);
        }}
      >
        <mesh position={[-2.4, 0, 0]} userData={{ motorHitProxy: true }}>
          <boxGeometry args={[8.4, 4.4, 4.2]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <group ref={motorBodyRef} rotation={[0, 0, Math.PI / 2]} scale={0.008}><ImportedMotor active={activeSection === 'motor'} assemblyRef={motorAssemblyRef} onReady={() => { motorReadyRef.current = true; }} /></group>
        <group position={[-0.76, 0, 0]} scale={0.42}><BladeRotor active={activeSection === 'motor'} assemblyRef={motorAssemblyRef} settings={initialBladeSettings} /></group>
        <AirflowStreaks assemblyRef={motorAssemblyRef} active={activeSection === 'motor'} />
      </group>
    </group>

    {/*
      Section 02: pair sits around the copy-free safe rect center.
      Controller = top-left, comm module = bottom-right of that stage.
    */}
    <group name="FieldStage" visible={activeSection === 'controller'}>
      <group
        name="ControllerStage"
        ref={controllerRef}
        position={[fieldPlacement.controller.x, fieldPlacement.controller.y, fieldPlacement.controller.z]}
        rotation={[0.08, -0.22, 0]}
        scale={controllerScale * 0.72}
      >
        <ImportedController active={activeSection === 'controller'} />
      </group>
      <group
        name="CommunicationStage"
        position={[fieldPlacement.communication.x, fieldPlacement.communication.y, fieldPlacement.communication.z]}
        rotation={[0.05, -0.38, 0]}
        scale={controllerScale * 0.72 * 0.9}
      >
        <ImportedCommModule />
      </group>
    </group>

    {activeSection === 'cloud' ? (
      <group name="CloudStage">
        <Suspense fallback={null}>
          <CloudScreen placement={fieldPlacement} mobile={mobileLayout} />
        </Suspense>
      </group>
    ) : null}
  </>;
}

type CameraRigProps = {
  activeSection: SectionId;
  mobileLayout: boolean;
};

const CAMERA_POSES: Record<SectionId, { position: Vector3; target: Vector3 }> = {
  motor: {
    position: new Vector3(0.15, 0.16, 8.95),
    target: new Vector3(0.28, 0.1, 0),
  },
  controller: controllerCameraPose(false),
  cloud: {
    position: new Vector3(-7, 0, 8.8),
    target: new Vector3(-7, 0, 0),
  },
};

function CameraRig({ activeSection, mobileLayout }: CameraRigProps) {
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
    if (section === 'controller' || section === 'cloud') {
      const pose = controllerCameraPose(mobileLayout);
      return { position: pose.position.clone(), target: pose.target.clone() };
    }

    const pose = CAMERA_POSES[section];
    const position = pose.position.clone();
    const target = pose.target.clone();
    // Dev mobile frame and real phones share a narrow canvas width.
    if (size.width < 640) {
      // Look slightly BELOW the product so it sits in the upper mid band
      // (above the fixed copy strip, below the fixed header).
      // Motor offsets keep the previous phone framing after the PC hero was scaled up.
      position.z += section === 'motor' ? 1.55 : 1.7;
      position.y -= section === 'motor' ? 0.08 : 0.1;
      target.y -= section === 'motor' ? 0.42 : 0.55;
      if (section === 'motor') {
        position.x += 0.22;
        target.x += 0.12;
      }
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
  }, [activeSection, camera, size.width, mobileLayout, currentTarget, fromPosition, fromTarget, toPosition, toTarget]);

  useFrame((_, delta) => {
    elapsedRef.current += delta;
    if (transitionRef.current > 0 && transitionRef.current < 1) {
      transitionRef.current = Math.min(1, transitionRef.current + delta / CONTROLLER_CAMERA_MOVE_S);
      const eased = transitionRef.current * transitionRef.current * (3 - 2 * transitionRef.current);
      nextPosition.lerpVectors(fromPosition, toPosition, eased);
      nextTarget.lerpVectors(fromTarget, toTarget, eased);
    } else {
      nextPosition.copy(toPosition);
      nextTarget.copy(toTarget);

      if (activeSection === 'motor') {
        nextPosition.x += Math.sin(elapsedRef.current * 0.16) * 0.16;
        nextPosition.y += Math.cos(elapsedRef.current * 0.14) * 0.07;
      } else if (activeSection === 'controller' && elapsedRef.current > CONTROLLER_SETTLE_HOLD_S) {
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
  mobileLayout?: boolean;
};

export default function FanScene({
  activeSection,
  onMotorPhaseChange,
  onMotorHoverChange,
  mobileLayout = false,
}: FanSceneProps) {
  const allowPointer = activeSection === 'motor' || activeSection === 'cloud';
  const controllerStage = activeSection === 'controller';

  return (
    <div className="relative h-full w-full">
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: mobileLayout ? 42 : 38, position: [0, 0, 8.2] }}
        style={{ pointerEvents: allowPointer ? 'auto' : 'none' }}
      >
        <color attach="background" args={[controllerStage ? '#c5c6c2' : '#dfece5']} />
        <ambientLight intensity={controllerStage ? 0.58 : 0.72} />
        <directionalLight intensity={controllerStage ? 2.2 : 2.8} position={[4, 5, 5]} />
        <directionalLight
          intensity={controllerStage ? 0.7 : 1.1}
          position={[-4, 2, 2]}
          color={controllerStage ? '#cfd4cf' : '#d9eee6'}
        />
        <Environment preset="warehouse" background={false} environmentIntensity={controllerStage ? 0.42 : 1} />
        {controllerStage ? (
          <directionalLight intensity={0.85} position={[-6, 3.2, 5]} color="#f3f3ef" />
        ) : null}
        <PartsStudy
          activeSection={activeSection}
          onMotorPhaseChange={onMotorPhaseChange}
          onMotorHoverChange={onMotorHoverChange}
          mobileLayout={mobileLayout}
        />
        <CameraRig activeSection={activeSection} mobileLayout={mobileLayout} />
      </Canvas>
    </div>
  );
}
