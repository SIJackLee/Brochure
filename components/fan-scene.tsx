'use client';

import { Environment, OrbitControls, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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

export type ShotMode = 'cinematic' | 'chapters' | 'focus';

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

function ImportedMotor() {
  const { scene } = useGLTF('/models/BLDC_Motor_Web_v1.glb');
  const model = useMemo(() => {
    const clone = scene.clone(true);
    const rotatingParts = new Group();
    rotatingParts.name = 'MotorRotatingParts';
    const rotatingMeshes: Mesh[] = [];

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

      object.material = material;

      if (['bearing', 'front_cover', 'shaft'].includes(name)) {
        rotatingMeshes.push(object);
      }
    });

    rotatingMeshes.forEach((object) => rotatingParts.add(object));
    clone.add(rotatingParts);
    return { clone, rotatingParts };
  }, [scene]);

  useFrame((_, delta) => {
    // The imported motor is rotated 90 degrees by its parent group, so invert
    // the local Y direction to match the fan rotor's world-space rotation.
    model.rotatingParts.rotation.y -= delta * 0.7;
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

function BladeRotor({ settings }: { settings: BladeSettings }) {
  const rotorRef = useRef<Group>(null);
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
    rotorRef.current.rotation.x += delta * 0.7;
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
          <mesh geometry={bladeGeometry} position={[0.08, settings.radialOffset, -settings.thickness / 2]} rotation={[0, pitch, 0]}>
            <meshStandardMaterial color="#a9141b" roughness={0.5} metalness={0.04} />
          </mesh>
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

function PartsStudy() {
  const studyRef = useRef<Group>(null);
  const motorBodyRef = useRef<Group>(null);
  const controllerRef = useRef<Group>(null);
  const [controllerScale, setControllerScale] = useState(1);
  const [controllerPosition, setControllerPosition] = useState<[number, number, number]>([0.45, -1.72, 0.12]);

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
    const horizontalGap = motorBodySize.x * 0.08;
    const verticalGap = motorBodySize.y * 0.2;
    const depthOffset = controllerSize.z * 0.1;
    const controllerWorldCenter = new Vector3(
      motorBox.max.x + horizontalGap - controllerSize.x / 2,
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

  return <group ref={studyRef} position={[0.55, 0.05, 0]} rotation={[0.06, -0.3, 0]} scale={0.72}>
    <group ref={motorBodyRef} position={[0.25, 0.15, 0]} rotation={[0, 0, Math.PI / 2]} scale={0.008}><ImportedMotor /></group>
    <group position={[-0.76, 0.15, 0]} scale={0.42}><BladeRotor settings={initialBladeSettings} /></group>
    <group ref={controllerRef} position={controllerPosition} rotation={[0.02, -0.12, 0]} scale={controllerScale}><ImportedController /></group>
  </group>;
}

type CameraRigProps = {
  mode: ShotMode;
  chapterProgress: number;
};

function CameraRig({ mode, chapterProgress }: CameraRigProps) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const elapsedRef = useRef(0);
  const motorPosition = useMemo(() => new Vector3(0.15, 0.12, 8), []);
  const controllerPosition = useMemo(() => new Vector3(0.45, -1.15, 7.8), []);
  const motorTarget = useMemo(() => new Vector3(0.15, 0.05, 0), []);
  const controllerTarget = useMemo(() => new Vector3(0.45, -1.15, 0), []);
  const nextPosition = useMemo(() => new Vector3(), []);
  const nextTarget = useMemo(() => new Vector3(), []);

  useEffect(() => {
    elapsedRef.current = 0;
    const initialPosition = mode === 'focus' ? motorPosition : new Vector3(0, 0, 8.2);
    const initialTarget = mode === 'focus' ? motorTarget : new Vector3(0, 0, 0);
    camera.position.copy(initialPosition);
    camera.lookAt(initialTarget);
    if (controlsRef.current) {
      controlsRef.current.target.copy(initialTarget);
      controlsRef.current.update();
    }
  }, [camera, mode, motorPosition, motorTarget]);

  useFrame((_, delta) => {
    elapsedRef.current += delta;

    if (mode === 'cinematic') {
      const cycle = elapsedRef.current % 18;
      const phase = cycle < 4 ? 0 : cycle < 8 ? (cycle - 4) / 4 : cycle < 14 ? 1 : 1 - (cycle - 14) / 4;
      const eased = phase * phase * (3 - 2 * phase);
      nextPosition.lerpVectors(motorPosition, controllerPosition, eased);
      nextTarget.lerpVectors(motorTarget, controllerTarget, eased);
      nextPosition.x += Math.sin(elapsedRef.current * 0.32) * 0.22;
      nextPosition.y += Math.cos(elapsedRef.current * 0.28) * 0.1;
      camera.position.lerp(nextPosition, Math.min(delta * 3.4, 1));
      camera.lookAt(nextTarget);
      if (controlsRef.current) {
        controlsRef.current.target.copy(nextTarget);
        controlsRef.current.update();
      }
    }

    if (mode === 'chapters') {
      const eased = chapterProgress * chapterProgress * (3 - 2 * chapterProgress);
      nextPosition.lerpVectors(motorPosition, controllerPosition, eased);
      nextTarget.lerpVectors(motorTarget, controllerTarget, eased);
      camera.position.lerp(nextPosition, Math.min(delta * 5, 1));
      camera.lookAt(nextTarget);
      if (controlsRef.current) {
        controlsRef.current.target.copy(nextTarget);
        controlsRef.current.update();
      }
    }

    if (mode === 'focus' && elapsedRef.current < 4) {
      const phase = Math.min(elapsedRef.current / 4, 1);
      const eased = phase * phase * (3 - 2 * phase);
      nextPosition.lerpVectors(motorPosition, controllerPosition, eased);
      nextTarget.lerpVectors(motorTarget, controllerTarget, eased);
      camera.position.lerp(nextPosition, Math.min(delta * 4, 1));
      camera.lookAt(nextTarget);
      if (controlsRef.current) {
        controlsRef.current.target.copy(nextTarget);
        controlsRef.current.update();
      }
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}
      enableZoom={mode !== 'chapters'}
      maxDistance={9}
      minDistance={5.2}
    />
  );
}

type FanSceneProps = {
  mode: ShotMode;
  chapterProgress: number;
  onChapterWheel: (deltaY: number) => void;
};

export default function FanScene({ mode, chapterProgress, onChapterWheel }: FanSceneProps) {
  return (
    <div className="relative h-full w-full" onWheel={(event) => mode === 'chapters' && onChapterWheel(event.deltaY)}>
      <Canvas camera={{ fov: 38, position: [0, 0, 8.2] }}>
        <color attach="background" args={['#dfece5']} />
        <ambientLight intensity={0.72} />
        <directionalLight intensity={2.8} position={[4, 5, 5]} />
        <directionalLight intensity={1.1} position={[-4, 2, 2]} color="#d9eee6" />
        <Environment preset="warehouse" />
        <PartsStudy />
        <CameraRig mode={mode} chapterProgress={chapterProgress} />
      </Canvas>
    </div>
  );
}
