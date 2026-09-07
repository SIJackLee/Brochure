'use client';

import { Environment, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Box3, DoubleSide, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Shape, SRGBColorSpace, Vector3 } from 'three';

const darkGreen = '#0d554f';
const metal = '#747b78';
const red = '#c64031';
const black = '#202725';

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

export type SectionId = 'motor' | 'controller' | 'communication' | 'cloud';

const coolingRibShape = new Shape();
coolingRibShape.moveTo(0, -0.86);
coolingRibShape.lineTo(0.06, -0.9);
coolingRibShape.lineTo(0.13, -0.8);
coolingRibShape.lineTo(0.18, -0.66);
coolingRibShape.lineTo(0.18, 0.66);
coolingRibShape.lineTo(0.13, 0.8);
coolingRibShape.lineTo(0.06, 0.9);
coolingRibShape.lineTo(0, 0.86);
coolingRibShape.closePath();

function FanHousing() {
  return <group rotation={[Math.PI / 2, 0, 0]}><mesh><cylinderGeometry args={[1.28, 1.28, 0.72, 64, 1, true]} /><meshStandardMaterial color={darkGreen} roughness={0.44} metalness={0.12} side={2} /></mesh><mesh position={[0, 0.38, 0]}><torusGeometry args={[1.28, 0.12, 16, 64]} /><meshStandardMaterial color="#164943" roughness={0.4} metalness={0.2} /></mesh><mesh position={[0, -0.38, 0]}><torusGeometry args={[1.28, 0.1, 16, 64]} /><meshStandardMaterial color="#164943" roughness={0.4} metalness={0.2} /></mesh></group>;
}

function Motor() {
  return <group rotation={[Math.PI / 2, 0, 0]}>
    <mesh><cylinderGeometry args={[0.52, 0.52, 1.86, 64]} /><meshStandardMaterial color="#858e8a" roughness={0.4} metalness={0.52} /></mesh>
    {Array.from({ length: 28 }, (_, i) => { const angle = (Math.PI * 2 * i) / 28; const x = Math.cos(angle); const z = Math.sin(angle); return <mesh key={i} position={[x * 0.535, 0, z * 0.535]} rotation={[0, -angle, 0]}><extrudeGeometry args={[coolingRibShape, { depth: 0.055, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.008, bevelThickness: 0.006, curveSegments: 3 }]} /><meshStandardMaterial color="#68716d" roughness={0.34} metalness={0.62} /></mesh>; })}
    <mesh position={[0, -1.04, 0]}><cylinderGeometry args={[0.66, 0.66, 0.2, 64]} /><meshStandardMaterial color="#4c5551" roughness={0.3} metalness={0.65} /></mesh>
    <mesh position={[0, 1.04, 0]}><cylinderGeometry args={[0.64, 0.64, 0.2, 64]} /><meshStandardMaterial color="#9da5a1" roughness={0.34} metalness={0.58} /></mesh>
    <mesh position={[0, 1.19, 0]}><cylinderGeometry args={[0.47, 0.47, 0.12, 48]} /><meshStandardMaterial color="#626b67" roughness={0.3} metalness={0.68} /></mesh>
  </group>;
}

type MotorSceneState = 'exploded' | 'assembling' | 'assembled' | 'blade-assembly' | 'spinning' | 'showcase';

type MotorAssemblyRef = {
  elapsed: number;
  state: MotorSceneState;
  hasPlayed: boolean;
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
      // fixed anchor. The remaining parts begin to its screen-left, then
      // travel along local Y into the final assembly position.
      ['pcb_cover_assy', -30, 0.18, 0.82],
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
    const { elapsed, state } = assemblyRef.current;
    model.animationParts.forEach((part) => {
      const progress = state === 'showcase' || state === 'spinning' || state === 'blade-assembly' || state === 'assembled'
        ? 1
        : Math.max(0, Math.min(1, (elapsed - part.start) / (part.end - part.start)));
      const eased = progress * progress * (3 - 2 * progress);
      part.object.position.copy(part.assembledPosition);
      part.object.position.y += part.explodedOffset * (1 - eased);
      part.object.rotation.set(part.assembledRotation.x, part.assembledRotation.y, part.assembledRotation.z);
    });

    if (!active) return;

    const spinProgress = state === 'spinning'
      ? Math.max(0, Math.min(1, (elapsed - 3.35) / 1.0))
      : state === 'showcase' ? 1 : 0;
    const speed = 1.4 * (spinProgress * spinProgress * (3 - 2 * spinProgress));
    // The imported motor is rotated 90 degrees by its parent group, so invert
    // the local Y direction to match the fan rotor's world-space rotation.
    model.rotatingParts.rotation.y -= delta * speed;
  });

  return <primitive object={model.clone} />;
}

useGLTF.preload('/models/BLDC_Motor_Web_v1.glb');
useGLTF.preload('/models/SL_802B_Controller_Web_v1.glb');

function Shaft() {
  return <group rotation={[Math.PI / 2, 0, 0]}><mesh><cylinderGeometry args={[0.12, 0.12, 1.55, 32]} /><meshStandardMaterial color="#bdc5c1" roughness={0.22} metalness={0.85} /></mesh><mesh position={[0, -0.55, 0]}><cylinderGeometry args={[0.22, 0.22, 0.22, 32]} /><meshStandardMaterial color="#646d69" roughness={0.28} metalness={0.75} /></mesh><mesh position={[0, 0.42, 0]}><cylinderGeometry args={[0.17, 0.17, 0.28, 32]} /><meshStandardMaterial color="#8f9994" roughness={0.25} metalness={0.8} /></mesh><mesh position={[0, 0.78, 0]}><cylinderGeometry args={[0.11, 0.11, 0.42, 32]} /><meshStandardMaterial color="#d1d7d3" roughness={0.18} metalness={0.9} /></mesh></group>;
}

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

    const root = clone.getObjectByName('SL802B_ROOT') ?? clone;
    const frontDecal = root.getObjectByName('Front_Decal') as Mesh | undefined;
    const frontDecalMaterial = (frontDecal
      ? Array.isArray(frontDecal.material) ? frontDecal.material[0] : frontDecal.material
      : undefined) as MeshStandardMaterial | undefined;
    console.info('[SL802B] Front_Decal original material/map', {
      material: frontDecalMaterial,
      map: frontDecalMaterial?.map ?? null,
    });

    return clone;
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
    const { elapsed, state } = assemblyRef.current;
    const assemblyProgress = state === 'showcase' || state === 'spinning'
      ? 1
      : Math.max(0, Math.min(1, (elapsed - 2.65) / 0.7));
    const easedAssembly = assemblyProgress * assemblyProgress * (3 - 2 * assemblyProgress);
    rotorRef.current.position.x = -0.72 * (1 - easedAssembly);
    // Fade the complete rotor assembly, including the red and black hub meshes.
    rotorRef.current.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        material.transparent = true;
        material.opacity = easedAssembly;
        material.depthWrite = easedAssembly > 0.98;
        material.needsUpdate = true;
      });
    });
    bladeMaterial.opacity = easedAssembly;
    bladeMaterial.needsUpdate = true;

    if (!active) return;
    const spinProgress = state === 'spinning'
      ? Math.max(0, Math.min(1, (elapsed - 3.35) / 1.0))
      : state === 'showcase' ? 1 : 0;
    const speed = 1.4 * (spinProgress * spinProgress * (3 - 2 * spinProgress));
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

function SupportArms() {
  return <group>{[0, 1, 2, 3].map((i) => <mesh key={i} position={[0, 0, 0]} rotation={[0, 0, (Math.PI * i) / 2 + Math.PI / 4]}><boxGeometry args={[0.13, 1.8, 0.14]} /><meshStandardMaterial color={black} roughness={0.32} metalness={0.58} /></mesh>)}<mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.62, 0.62, 0.14, 48]} /><meshStandardMaterial color="#303a36" roughness={0.36} metalness={0.5} /></mesh></group>;
}

function SafetyGrille() {
  return <group>{[0.48, 0.74, 1, 1.24].map((r) => <mesh key={r}><torusGeometry args={[r, 0.025, 10, 64]} /><meshStandardMaterial color={black} roughness={0.28} metalness={0.62} /></mesh>)}{Array.from({ length: 12 }, (_, i) => <mesh key={i} rotation={[0, 0, (Math.PI * i) / 12]}><boxGeometry args={[0.026, 2.52, 0.026]} /><meshStandardMaterial color={black} roughness={0.28} metalness={0.62} /></mesh>)}</group>;
}

function PartsStudy({ activeSection }: { activeSection: SectionId }) {
  const studyRef = useRef<Group>(null);
  const motorBodyRef = useRef<Group>(null);
  const controllerRef = useRef<Group>(null);
  const motorAssemblyRef = useRef<MotorAssemblyRef>({ elapsed: 0, state: 'exploded', hasPlayed: false });
  const introClockRef = useRef(0);
  const motorReadyRef = useRef(false);
  const [controllerScale, setControllerScale] = useState(1);
  const [controllerPosition, setControllerPosition] = useState<[number, number, number]>([0.45, -1.72, 0.12]);

  useEffect(() => {
    if (activeSection === 'motor') {
      introClockRef.current = 0;
      motorAssemblyRef.current = { elapsed: 0, state: 'exploded', hasPlayed: false };
      return;
    }

    motorAssemblyRef.current = { elapsed: 5, state: 'showcase', hasPlayed: true };
  }, [activeSection]);

  useFrame((_, delta) => {
    if (activeSection !== 'motor' || !motorReadyRef.current) return;

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
    motorAssemblyRef.current = { elapsed, state, hasPlayed: false };

    if (elapsed >= 5) {
      motorAssemblyRef.current = { elapsed: 5, state: 'showcase', hasPlayed: true };
    }
  });

  useLayoutEffect(() => {
    if (!studyRef.current || !motorBodyRef.current || !controllerRef.current) return;

    studyRef.current.updateWorldMatrix(true, true);
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

    const motorCenter = motorBox.getCenter(new Vector3());
    // Keep the controller as a separate product block. The gap is derived from
    // the measured motor/controller bounds so this remains stable with GLB scale.
    const horizontalGap = motorBodySize.x * 1.2;
    const verticalGap = motorBodySize.y * 0.32;
    const depthOffset = controllerSize.z * 0.1;
    const controllerWorldCenter = new Vector3(
      motorBox.max.x + horizontalGap + controllerSize.x / 2,
      motorBox.min.y - verticalGap - controllerSize.y / 2,
      motorCenter.z - depthOffset,
    );
    const controllerLocalCenter = studyRef.current.worldToLocal(controllerWorldCenter);
    setControllerPosition([controllerLocalCenter.x, controllerLocalCenter.y, controllerLocalCenter.z]);

    console.info('[SL802B] automatic scale from motor body bounds', {
      motorBodySize,
      controllerSize,
      targetRatio: 0.95,
      controllerScale,
      controllerPosition: controllerLocalCenter,
    });
  }, [controllerScale]);

  return <group ref={studyRef} name="ProductStages" position={[0.55, 0.05, 0]} rotation={[0.06, -0.3, 0]} scale={0.72}>
    <group name="MotorStage" position={[0.25, 0.15, 0]}>
      <group ref={motorBodyRef} rotation={[0, 0, Math.PI / 2]} scale={0.008}><ImportedMotor active={activeSection === 'motor'} assemblyRef={motorAssemblyRef} onReady={() => { motorReadyRef.current = true; }} /></group>
      <group position={[-0.76, 0, 0]} scale={0.42}><BladeRotor active={activeSection === 'motor'} assemblyRef={motorAssemblyRef} settings={initialBladeSettings} /></group>
    </group>
    <group name="ControllerStage" ref={controllerRef} position={controllerPosition} rotation={[0.02, -0.12, 0]} scale={controllerScale}><ImportedController /></group>
    <group name="CommunicationStage" />
    <group name="CloudStage" />
  </group>;
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
    position: new Vector3(4.15, -1.62, 6.8),
    target: new Vector3(4.07, -1.58, 0),
  },
  communication: {
    position: new Vector3(-7, 0, 8.8),
    target: new Vector3(-7, 0, 0),
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
};

export default function FanScene({ activeSection }: FanSceneProps) {
  return (
    <div className="relative h-full w-full">
      <Canvas camera={{ fov: 38, position: [0, 0, 8.2] }} style={{ pointerEvents: 'none' }}>
        <color attach="background" args={['#dfece5']} />
        <ambientLight intensity={0.72} />
        <directionalLight intensity={2.8} position={[4, 5, 5]} />
        <directionalLight intensity={1.1} position={[-4, 2, 2]} color="#d9eee6" />
        <Environment preset="warehouse" />
        <PartsStudy activeSection={activeSection} />
        <CameraRig activeSection={activeSection} />
      </Canvas>
    </div>
  );
}
