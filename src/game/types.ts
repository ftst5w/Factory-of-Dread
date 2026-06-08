import * as THREE from 'three';

export interface LevelConfig {
  name: string;
  grid: number;
  openness: number;
  monsterSpeed: number;
  monsterAccel: number;
  hidingSpots: number;
  sightRange: number;
  hearRange: number;
  fovDeg: number;
}

export interface Palette {
  fur: number;
  furAlt: number;
  claws: number;
  mouthInner: number;
  teeth: number;
  eyeWhite: number;
  pupil: number;
  eyeGlow: number;
  foot: number;
}

export type GameState = 'menu' | 'playing' | 'dying' | 'dead' | 'levelDone' | 'win';

export interface Player {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
  pitch: number;
  height: number;
  isCrouching: boolean;
  isSprinting: boolean;
  isFlashlightOn: boolean;
  flashlightBattery: number;
  footstepTimer: number;
  keysHeld: number;
  potionsHeld: number;
  speedBoostTimer: number;
}

export interface Monster {
  group: THREE.Group;
  palette: Palette;
  speed: number;
  state: 'patrol' | 'chase' | 'search' | 'investigate';
  targetCell: [number, number] | null;
  path: [number, number][];
  pathTimer: number;
  alertTimer: number;
  suspicion: number;
  lastSeenPlayer: THREE.Vector3 | null;
  config: LevelConfig | null;
  walkPhase: number;
  footstepTimer: number;
  // Body parts
  torso?: THREE.Mesh;
  head?: THREE.Mesh;
  leftArm?: THREE.Mesh;
  rightArm?: THREE.Mesh;
  leftLeg?: THREE.Mesh;
  rightLeg?: THREE.Mesh;
  leftEyeLight?: THREE.PointLight;
  rightEyeLight?: THREE.PointLight;
}

export interface Lever {
  group: THREE.Group;
  knob: THREE.Mesh;
  arm: THREE.Mesh;
  indicator: THREE.Mesh;
  indMatOff: THREE.Material;
  indMatOn: THREE.Material;
  light: THREE.PointLight;
  activated: boolean;
  pos: THREE.Vector3;
  activate: () => boolean;
}

export interface Locker {
  group: THREE.Group;
  door: THREE.Mesh;
  body: THREE.Mesh;
  pos: THREE.Vector3;
  facing: THREE.Vector3;
  interactPos: THREE.Vector3;
  insidePos: THREE.Vector3;
}

export interface ExitDoor {
  group: THREE.Group;
  door: THREE.Mesh;
  frame: THREE.Mesh;
  pos: THREE.Vector3;
  open: boolean;
  openProgress: number;
  light?: THREE.PointLight;
}

export interface Drawer {
  group: THREE.Group;
  handle: THREE.Mesh;
  body: THREE.Mesh;
  inner: THREE.Group; // Inner part that moves
  pos: THREE.Vector3;
  facing: THREE.Vector3;
  interactPos: THREE.Vector3;
  searched: boolean;
  hasKey: boolean;
  hasPotion: boolean;
  openProgress: number; // For animation
}

export interface Vent {
  group: THREE.Group;
  pos: THREE.Vector3;
  gridPos: [number, number];
  facing: THREE.Vector3;
  destination: THREE.Vector3;
  destGridPos: [number, number];
  locked: boolean;
}

export interface LevelData {
  grid: number[][];
  gridSize: number;
  walls: { minX: number; maxX: number; minZ: number; maxZ: number }[];
  levers: Lever[];
  hidingSpots: Locker[];
  drawers: Drawer[];
  vents: Vent[];
  exitDoor: ExitDoor;
  lights: { light: THREE.PointLight; fixture: THREE.Mesh | null; baseIntensity: number; flickerPhase: number; flickerRate: number; exit?: boolean }[];
  objects: THREE.Object3D[];
  playerStart: [number, number];
  monsterStart: [number, number];
  exitCell: [number, number];
}
