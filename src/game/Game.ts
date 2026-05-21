import * as THREE from 'three';

// --- CONSTANTS ---
export const CELL = 4;
export const WALL_H = 3.5;
export const PLAYER_H = 1.7;
export const CROUCH_H = 1.0;
export const PLAYER_R = 0.5;
export const WALK_SPEED = 4.5;
export const SPRINT_MULT = 1.8;
export const CROUCH_MULT = 0.5;
export const MAX_STAMINA = 5.0;
export const STAMINA_REGEN = 1.2;
export const STAMINA_DRAIN = 2.0;
export const MOUSE_SENS = 0.002;
export const MAX_BATTERY = 100.0;
export const BATTERY_DRAIN_RATE = 1.5; // % per minute
export const LEVER_COUNT = 6;
export const EXIT_KEYS_REQUIRED = 5;
export const DRAWER_COUNT = 12;
export const POTION_SPEED_MULT = 1.6;
export const POTION_DURATION = 15.0; // seconds
export const MONSTER_KILL_DIST = 1.5; // Bigger hitbox
export const ADMIN_FLY_SPEED = 20.0;

// --- TYPES ---
export type GameState = 'menu' | 'playing' | 'dying' | 'dead' | 'escaped';

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
  state: 'patrol' | 'investigate' | 'chase' | 'search';
  targetCell: [number, number] | null;
  path: [number, number][];
  pathTimer: number;
  alertTimer: number;
  suspicion: number;
  lastSeenPlayer: THREE.Vector3 | null;
  config: LevelConfig | null;
  walkPhase: number;
  footstepTimer: number;
  leftLeg?: THREE.Mesh;
  rightLeg?: THREE.Mesh;
  leftArm?: THREE.Mesh;
  rightArm?: THREE.Mesh;
  leftEyeLight?: THREE.PointLight;
  rightEyeLight?: THREE.PointLight;
}

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
  wall: number;
  floor: number;
  accent: number;
  eyeGlow: number;
}

export interface Wall {
  minX: number; maxX: number;
  minZ: number; maxZ: number;
}

export interface Lever {
  group: THREE.Group;
  handle: THREE.Mesh;
  pos: THREE.Vector3;
  activated: boolean;
  activate: () => void;
}

export interface Locker {
  group: THREE.Group;
  door: THREE.Mesh;
  pos: THREE.Vector3;
  facing: THREE.Vector3;
  interactPos: THREE.Vector3;
  insidePos: THREE.Vector3;
}

export interface Drawer {
  group: THREE.Group;
  handle: THREE.Mesh;
  body: THREE.Mesh;
  inner: THREE.Group;
  pos: THREE.Vector3;
  facing: THREE.Vector3;
  interactPos: THREE.Vector3;
  searched: boolean;
  hasKey: boolean;
  hasPotion: boolean;
  openProgress: number;
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

export interface ExitDoor {
  group: THREE.Group;
  pos: THREE.Vector3;
  open: boolean;
}

export interface LevelData {
  grid: number[][];
  gridSize: number;
  walls: Wall[];
  levers: Lever[];
  hidingSpots: Locker[];
  drawers: Drawer[];
  vents: Vent[];
  exitDoor: ExitDoor;
  lights: THREE.PointLight[];
  objects: THREE.Object3D[];
  playerStart: [number, number];
  monsterStart: [number, number];
  exitCell: [number, number];
}

// --- CONFIG ---
export const LEVELS: LevelConfig[] = [
  { name: 'LEVEL 1 — INTAKE',    grid: 13, openness: 0.10, monsterSpeed: 3.2, monsterAccel: 1.2, hidingSpots: 6, sightRange: 22, hearRange: 14, fovDeg: 90 },
  { name: 'LEVEL 2 — CONVEYORS', grid: 17, openness: 0.06, monsterSpeed: 3.8, monsterAccel: 1.6, hidingSpots: 4, sightRange: 28, hearRange: 18, fovDeg: 100 },
  { name: 'LEVEL 3 — THE PIT',   grid: 21, openness: 0.03, monsterSpeed: 4.6, monsterAccel: 2.0, hidingSpots: 2, sightRange: 34, hearRange: 22, fovDeg: 110 }
];

export const PALETTES: Palette[] = [
  { wall: 0x222222, floor: 0x111111, accent: 0x444444, eyeGlow: 0x00ffff },
  { wall: 0x2a1a0a, floor: 0x1a0a05, accent: 0x5a3a1a, eyeGlow: 0xffaa00 },
  { wall: 0x0a1a1a, floor: 0x050a10, accent: 0x1a3a5a, eyeGlow: 0xff00ff }
];

// --- ENGINE ---
export class GameEngine {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  clock: THREE.Clock;
  
  player: Player;
  monster: Monster;
  level: LevelData | null = null;
  levelIndex: number = 0;
  
  gameState: GameState = 'menu';
  stamina: number = MAX_STAMINA;
  leversActivated: number = 0;
  
  isHiding: boolean = false;
  hidingLocker: Locker | null = null;
  
  // Admin Features
  isAdminMode: boolean = false;
  isNoclip: boolean = false;
  isInvincible: boolean = false;
  showAdminMenu: boolean = false;
  
  nearLever: Lever | null = null;
  nearLocker: Locker | null = null;
  nearDrawer: Drawer | null = null;
  nearVent: Vent | null = null;
  
  keys: Record<string, boolean> = {};
  mouseDX: number = 0;
  mouseDY: number = 0;
  
  // Audio
  audioCtx: AudioContext | null = null;
  masterGain: GainNode | null = null;
  monsterGrowlGain: GainNode | null = null;
  droneGain: GainNode | null = null;
  heartbeatTimer: any = null;
  heartbeatRate: number = 1.0;
  heartbeatVolume: number = 0.5;
  
  dyingTimer: number = 0;
  
  onStateUpdate: (data: any) => void;

  constructor(canvas: HTMLCanvasElement, onStateUpdate: (data: any) => void) {
    this.onStateUpdate = onStateUpdate;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.05);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 250);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene.add(new THREE.AmbientLight(0x202030, 0.25));

    this.player = this.createPlayer();
    this.monster = this.createMonster();
    this.clock = new THREE.Clock();

    window.addEventListener('resize', this.onResize.bind(this));
    this.setupInput();
  }

  createPlayer(): Player {
    return {
      position: new THREE.Vector3(0, PLAYER_H, 0),
      velocity: new THREE.Vector3(),
      yaw: 0,
      pitch: 0,
      height: PLAYER_H,
      isCrouching: false,
      isSprinting: false,
      isFlashlightOn: true,
      flashlightBattery: MAX_BATTERY,
      footstepTimer: 0,
      keysHeld: 0,
      potionsHeld: 0,
      speedBoostTimer: 0
    };
  }

  createMonster(): Monster {
    const group = new THREE.Group();
    this.scene.add(group);
    return {
      group,
      palette: PALETTES[0],
      speed: 0,
      state: 'patrol',
      targetCell: null,
      path: [],
      pathTimer: 0,
      alertTimer: 0,
      suspicion: 0,
      lastSeenPlayer: null,
      config: null,
      walkPhase: 0,
      footstepTimer: 0
    };
  }

  setupInput() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'KeyE') this.tryInteract();
      if (e.code === 'KeyF') this.toggleFlashlight();
      if (e.code === 'Digit1') this.usePotion();
      
      // Toggle Admin Mode: CTRL + ALT
      if ((e.ctrlKey || e.metaKey) && e.altKey) {
        this.isAdminMode = true;
        this.showAdminMenu = !this.showAdminMenu;
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.gameState !== 'playing' && this.gameState !== 'dying') return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  toggleFlashlight() {
    if (this.gameState !== 'playing') return;
    this.player.isFlashlightOn = !this.player.isFlashlightOn;
    this.playClick();
  }

  usePotion() {
    if (this.gameState !== 'playing' || this.player.potionsHeld <= 0) return;
    this.player.potionsHeld--;
    this.player.speedBoostTimer = POTION_DURATION;
    this.playDrinkSound();
  }

  // --- Core Loop ---
  update() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.getElapsedTime();

    if (this.gameState === 'playing') {
      this.updatePlayer(dt);
      this.updateMonster(dt);
      this.checkInteractables();
      this.updateLights(t, dt);
      this.updateAudioHUD();
      this.updateFlashlight(dt);
      this.updateDrawerAnimations(dt);
    } else if (this.gameState === 'dying') {
      this.updateDying(dt);
      this.updateLights(t, dt);
    }

    this.renderer.render(this.scene, this.camera);
    this.broadcastStateUpdate();
  }

  updateDrawerAnimations(dt: number) {
    if (!this.level) return;
    for (const dr of this.level.drawers) {
      if (dr.searched && dr.openProgress < 1) {
        dr.openProgress = Math.min(1, dr.openProgress + dt * 4);
        dr.inner.position.set(0, 0.45, dr.openProgress * 0.4);
      }
    }
  }

  broadcastStateUpdate() {
    this.onStateUpdate({
      gameState: this.gameState,
      stamina: this.stamina,
      leversActivated: this.leversActivated,
      keysHeld: this.player.keysHeld,
      potionsHeld: this.player.potionsHeld,
      speedBoostTimer: this.player.speedBoostTimer,
      levelIndex: this.levelIndex,
      isHiding: this.isHiding,
      battery: this.player.flashlightBattery,
      isFlashlightOn: this.player.isFlashlightOn,
      nearLever: !!this.nearLever,
      nearLocker: !!this.nearLocker,
      nearDrawer: !!this.nearDrawer,
      nearVent: !!this.nearVent,
      nearVentLocked: this.nearVent?.locked || false,
      isAdminMode: this.isAdminMode,
      isNoclip: this.isNoclip,
      isInvincible: this.isInvincible,
      showAdminMenu: this.showAdminMenu,
      monsterPos: this.level ? this.worldToGrid(this.monster.group.position.x, this.monster.group.position.z) : [0, 0],
      drawers: this.level?.drawers.map(d => ({ grid: this.worldToGrid(d.pos.x, d.pos.z), searched: d.searched })) || [],
      vents: this.level?.vents.map(v => ({ grid: v.gridPos, locked: v.locked })) || [],
      monsterDist: this.monster.group.position.distanceTo(this.player.position),
      monsterState: this.monster.state,
      grid: this.level?.grid,
      gridSize: this.level?.gridSize,
      playerPos: this.level ? this.worldToGrid(this.player.position.x, this.player.position.z) : [0, 0],
      playerYaw: this.player.yaw,
      exitPos: this.level?.exitCell,
      isExitOpen: this.level?.exitDoor?.open,
      deathProgress: this.gameState === 'dying' ? (1 - this.dyingTimer / 3.0) : 0
    });
  }

  flashlight: THREE.SpotLight | null = null;
  setupFlashlight() {
    this.flashlight = new THREE.SpotLight(0xffffff, 8.0, 20, Math.PI / 6, 0.3, 1);
    this.flashlight.position.set(0, 0, 0.1);
    this.camera.add(this.flashlight);
    this.camera.add(this.flashlight.target);
    this.flashlight.target.position.set(0, 0, -1);
    this.scene.add(this.camera);
  }

  updateFlashlight(dt: number) {
    if (!this.flashlight) this.setupFlashlight();
    if (this.player.isFlashlightOn) {
      this.player.flashlightBattery -= (BATTERY_DRAIN_RATE / 60) * dt;
      if (this.player.flashlightBattery <= 0) {
        this.player.flashlightBattery = 0;
        this.player.isFlashlightOn = false;
      }
    }
    if (this.flashlight) {
      this.flashlight.visible = this.player.isFlashlightOn;
      this.flashlight.intensity = 8.0 * (this.player.flashlightBattery / 100);
    }
  }

  updatePlayer(dt: number) {
    if (this.isHiding && this.hidingLocker) {
      this.player.yaw -= this.mouseDX * MOUSE_SENS;
      this.player.pitch -= this.mouseDY * MOUSE_SENS;
      this.player.pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, this.player.pitch));
      this.mouseDX = 0; this.mouseDY = 0;
      this.camera.position.copy(this.hidingLocker.insidePos);
      this.camera.rotation.set(this.player.pitch, this.player.yaw, 0, 'YXZ');
      return;
    }

    this.player.yaw -= this.mouseDX * MOUSE_SENS;
    this.player.pitch -= this.mouseDY * MOUSE_SENS;
    this.player.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this.player.pitch));
    this.mouseDX = 0; this.mouseDY = 0;

    // Noclip Check
    if (this.isNoclip) {
        const mx = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0);
        const mz = (this.keys['KeyS'] ? 1 : 0) - (this.keys['KeyW'] ? 1 : 0);
        const rot = new THREE.Euler(this.player.pitch, this.player.yaw, 0, 'YXZ');
        const dir = new THREE.Vector3(mx, 0, mz).normalize().applyEuler(rot);
        this.player.position.addScaledVector(dir, ADMIN_FLY_SPEED * dt);
        this.camera.position.copy(this.player.position);
        this.camera.rotation.set(this.player.pitch, this.player.yaw, 0, 'YXZ');
        return;
    }

    this.player.isCrouching = !!this.keys['ControlLeft'] || !!this.keys['ControlRight'];
    const targetH = this.player.isCrouching ? CROUCH_H : PLAYER_H;
    this.player.height += (targetH - this.player.height) * Math.min(1, dt * 8);

    let mx = 0, mz = 0;
    if (this.keys['KeyW']) mz -= 1;
    if (this.keys['KeyS']) mz += 1;
    if (this.keys['KeyA']) mx -= 1;
    if (this.keys['KeyD']) mx += 1;
    const moving = (mx !== 0 || mz !== 0);

    this.player.isSprinting = !!this.keys['ShiftLeft'] && moving && this.stamina > 0 && !this.player.isCrouching;
    if (this.player.isSprinting) {
      this.stamina -= STAMINA_DRAIN * dt;
      if (this.stamina <= 0) { this.stamina = 0; this.player.isSprinting = false; }
    } else if (!moving || !this.keys['ShiftLeft']) {
      this.stamina = Math.min(MAX_STAMINA, this.stamina + STAMINA_REGEN * dt);
    }

    let speed = WALK_SPEED;
    if (this.player.isSprinting) speed *= SPRINT_MULT;
    if (this.player.isCrouching) speed *= CROUCH_MULT;
    if (this.player.speedBoostTimer > 0) {
      speed *= POTION_SPEED_MULT;
      this.player.speedBoostTimer -= dt;
    }

    if (moving) {
      const len = Math.hypot(mx, mz);
      mx /= len; mz /= len;
      const cos = Math.cos(this.player.yaw), sin = Math.sin(this.player.yaw);
      const wx = mx * cos + mz * sin;
      const wz = -mx * sin + mz * cos;
      this.player.velocity.x = wx * speed;
      this.player.velocity.z = wz * speed;
    } else {
      this.player.velocity.multiplyScalar(0.7);
    }

    // Collision
    const nx = this.player.position.x + this.player.velocity.x * dt;
    if (!this.collidesAt(nx, this.player.position.z, PLAYER_R)) this.player.position.x = nx;
    const nz = this.player.position.z + this.player.velocity.z * dt;
    if (!this.collidesAt(this.player.position.x, nz, PLAYER_R)) this.player.position.z = nz;

    this.player.position.y = this.player.height;
    let bob = 0;
    if (moving && !this.player.isCrouching) {
      const bobRate = this.player.isSprinting ? 12 : 7;
      bob = Math.sin(performance.now() * 0.001 * bobRate) * (this.player.isSprinting ? 0.06 : 0.03);
    }
    this.camera.position.set(this.player.position.x, this.player.position.y + bob, this.player.position.z);
    this.camera.rotation.set(this.player.pitch, this.player.yaw, 0, 'YXZ');

    if (moving) {
      this.player.footstepTimer -= dt;
      if (this.player.footstepTimer <= 0) {
        this.playFootstep();
        this.player.footstepTimer = this.player.isSprinting ? 0.32 : (this.player.isCrouching ? 0.75 : 0.48);
      }
    }
  }

  collidesAt(x: number, z: number, r: number) {
    if (!this.level) return false;
    // Exit door collision
    if (this.level.exitDoor && !this.level.exitDoor.open) {
      const dpos = this.level.exitDoor.group.position;
      const dx = Math.abs(x - dpos.x), dz = Math.abs(z - dpos.z);
      if (dx < 1.0 + r && dz < 0.25 + r) return true;
    }
    // Wall collision
    for (const w of this.level.walls) {
      const cx = Math.max(w.minX, Math.min(x, w.maxX));
      const cz = Math.max(w.minZ, Math.min(z, w.maxZ));
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  // --- Monster AI ---
  updateMonster(dt: number) {
    if (this.gameState !== 'playing' || !this.level || !this.monster.config) return;
    const cfg = this.monster.config;
    this.monster.pathTimer -= dt;

    const sees = this.canMonsterSeePlayer();
    const hears = this.canMonsterHearPlayer();

    // Awareness logic
    const perceptionRate = sees ? 3.0 : (hears ? 1.5 : -0.4);
    this.monster.suspicion = Math.max(0, Math.min(1, this.monster.suspicion + perceptionRate * dt));

    if (this.monster.suspicion > 0.6) {
      this.monster.state = 'chase';
      this.monster.alertTimer = 8.0;
      this.monster.lastSeenPlayer = this.player.position.clone();
    } else if (this.monster.suspicion > 0.2 && this.monster.state !== 'chase') {
      this.monster.state = 'investigate';
      if (hears || sees) this.monster.lastSeenPlayer = this.player.position.clone();
    } else if (this.monster.state === 'chase' && this.monster.suspicion < 0.4) {
      this.monster.state = 'search';
      this.monster.alertTimer = 12.0; 
    } else if (this.monster.state !== 'chase' && this.monster.alertTimer <= 0) {
        if (this.monster.state !== 'patrol') {
            this.monster.state = 'patrol';
            this.monster.targetCell = null;
        }
    }

    if (this.monster.alertTimer > 0) this.monster.alertTimer -= dt;

    const monsterCell = this.worldToGrid(this.monster.group.position.x, this.monster.group.position.z);
    let targetCell: [number, number] | null = null;

    if (this.monster.state === 'chase') {
      targetCell = this.worldToGrid(this.player.position.x, this.player.position.z);
    } else if ((this.monster.state === 'investigate' || this.monster.state === 'search') && this.monster.lastSeenPlayer) {
      targetCell = this.worldToGrid(this.monster.lastSeenPlayer.x, this.monster.lastSeenPlayer.z);
      if (this.monster.group.position.distanceTo(this.monster.lastSeenPlayer) < 1.6) this.monster.lastSeenPlayer = null;
    } else {
      if (!this.monster.targetCell || this.monster.path.length === 0 || this.monster.pathTimer < -4) {
        this.monster.targetCell = this.pickWanderTarget();
        this.monster.pathTimer = 0;
      }
      targetCell = this.monster.targetCell;
    }

    if (this.monster.pathTimer <= 0 && targetCell) {
      const path = this.bfsPath(monsterCell[0], monsterCell[1], targetCell[0], targetCell[1]);
      if (path) this.monster.path = path;
      this.monster.pathTimer = this.monster.state === 'chase' ? 0.3 : 1.0;
    }

    let targetWorld: THREE.Vector3 | null = null;
    if (this.monster.path.length > 0) {
      const next = this.monster.path[0];
      const [tx, tz] = this.gridToWorld(next[0], next[1]);
      targetWorld = new THREE.Vector3(tx, 0, tz);
      if (this.monster.group.position.distanceTo(targetWorld) < 0.6) this.monster.path.shift();
    }

    let targetSpeed = 0;
    if (this.monster.state === 'chase') targetSpeed = cfg.monsterSpeed * 2.3;
    else if (this.monster.state === 'investigate') targetSpeed = cfg.monsterSpeed * 1.1;
    else if (this.monster.state === 'search') targetSpeed = cfg.monsterSpeed * 1.3;
    else targetSpeed = cfg.monsterSpeed * 0.7;

    this.monster.speed += (targetSpeed - this.monster.speed) * Math.min(1, dt * cfg.monsterAccel);

    if (targetWorld && this.monster.speed > 0.01) {
      const dir = targetWorld.clone().sub(this.monster.group.position);
      dir.y = 0;
      if (dir.length() > 0.01) {
        dir.normalize();
        const moveX = dir.x * this.monster.speed * dt;
        const moveZ = dir.z * this.monster.speed * dt;
        
        // Sliding logic
        const nx = this.monster.group.position.x + moveX;
        const nz = this.monster.group.position.z + moveZ;
        let moved = false;
        if (!this.collidesAt(nx, this.monster.group.position.z, 0.7)) { this.monster.group.position.x = nx; moved = true; }
        if (!this.collidesAt(this.monster.group.position.x, nz, 0.7)) { this.monster.group.position.z = nz; moved = true; }
        
        if (!moved) { // Unstuck magic
            const ax = (Math.random() - 0.5) * 0.2, az = (Math.random() - 0.5) * 0.2;
            if (!this.collidesAt(this.monster.group.position.x + ax, this.monster.group.position.z + az, 0.6)) {
                this.monster.group.position.x += ax; this.monster.group.position.z += az;
            }
        }

        const targetYaw = Math.atan2(dir.x, dir.z);
        let dy = targetYaw - this.monster.group.rotation.y;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        this.monster.group.rotation.y += dy * Math.min(1, dt * 6);
      }
    }

    // Animation
    if (this.monster.speed > 0.2 && this.monster.leftLeg) {
        this.monster.walkPhase += dt * this.monster.speed * 1.8;
        this.monster.leftLeg.rotation.x = Math.sin(this.monster.walkPhase) * 0.6;
        this.monster.rightLeg.rotation.x = -Math.sin(this.monster.walkPhase) * 0.6;
        this.monster.leftArm.rotation.x = -Math.sin(this.monster.walkPhase) * 0.5;
        this.monster.rightArm.rotation.x = Math.sin(this.monster.walkPhase) * 0.5;
    }

    // Capture Check
    if (this.gameState === 'playing' && !this.isInvincible) {
      const dist = this.monster.group.position.distanceTo(this.player.position);
      const threshold = this.isHiding ? 1.0 : MONSTER_KILL_DIST;
      if (dist < threshold) this.onCaught();
    }
  }

  canMonsterSeePlayer(): boolean {
    if (!this.monster.config) return false;
    const dist = this.monster.group.position.distanceTo(this.player.position);
    if (this.isHiding) return dist < 1.2;
    
    if (dist > this.monster.config.sightRange) return false;
    
    const mFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.monster.group.quaternion);
    const pDir = this.player.position.clone().sub(this.monster.group.position).normalize();
    const dot = mFwd.dot(pDir);
    const fovCos = Math.cos((this.monster.config.fovDeg / 2) * Math.PI / 180);
    
    if (dot < fovCos && dist > 3.0) return false;
    
    // Raycast check
    const steps = Math.floor(dist * 2);
    for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const testX = this.monster.group.position.x + (this.player.position.x - this.monster.group.position.x) * t;
        const testZ = this.monster.group.position.z + (this.player.position.z - this.monster.group.position.z) * t;
        if (this.collidesAt(testX, testZ, 0.1)) return false;
    }

    if (this.player.isFlashlightOn) return true;
    if (this.player.isCrouching && dist > 10) return false;
    return true;
  }

  canMonsterHearPlayer() {
    if (!this.monster.config || this.isHiding) return false;
    let noise = 0;
    if (this.player.isSprinting) noise = 1.0;
    else if (this.player.isCrouching) noise = 0.05;
    else if (this.player.velocity.length() > 0.1) noise = 0.3;
    if (noise === 0) return false;
    return (noise * this.monster.config.hearRange) > this.monster.group.position.distanceTo(this.player.position);
  }

  // --- Pathfinding ---
  bfsPath(sx: number, sy: number, gx: number, gy: number): [number, number][] | null {
    if (!this.level) return null;
    const grid = this.level.grid, size = grid.length;
    if (sx === gx && sy === gy) return [];
    const visited = Array.from({ length: size }, () => new Uint8Array(size));
    const prev = Array.from({ length: size }, () => new Array(size).fill(null));
    const queue: [number, number][] = [[sx, sy]];
    visited[sy][sx] = 1;
    while (queue.length) {
      const cur = queue.shift()!;
      if (cur[0] === gx && cur[1] === gy) {
        const path: [number, number][] = [];
        let p: [number, number] | null = cur;
        while (p && !(p[0] === sx && p[1] === sy)) { path.push(p); p = prev[p[1]][p[0]]; }
        return path.reverse();
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cur[0] + dx, ny = cur[1] + dy;
        if (nx >= 0 && nx < size && ny >= 0 && ny < size && !visited[ny][nx] && grid[ny][nx] === 0) {
          visited[ny][nx] = 1;
          prev[ny][nx] = cur;
          queue.push([nx, ny]);
        }
      }
    }
    return null;
  }

  pickWanderTarget(): [number, number] {
    if (!this.level) return [0, 0];
    const valid: [number, number][] = [];
    for (let y = 1; y < this.level.gridSize - 1; y++) 
      for (let x = 1; x < this.level.gridSize - 1; x++)
        if (this.level.grid[y][x] === 0) valid.push([x, y]);
    return valid[Math.floor(Math.random() * valid.length)] || [1, 1];
  }

  // --- Interactions ---
  tryInteract() {
    if (this.gameState !== 'playing') return;
    if (this.isHiding && this.hidingLocker) {
      this.isHiding = false;
      this.hidingLocker.door.rotation.y = 0;
      const f = this.hidingLocker.facing;
      this.player.position.set(this.hidingLocker.group.position.x + f.x * 1, PLAYER_H, this.hidingLocker.group.position.z + f.z * 1);
      this.hidingLocker = null; this.playClick(); return;
    }
    if (this.nearVent) {
      if (!this.player.isCrouching) return;
      if (this.nearVent.locked) {
        if (this.player.keysHeld > 0) {
          this.player.keysHeld--; this.nearVent.locked = false;
          const target = this.nearVent.gridPos;
          this.level?.vents.filter(v => v.gridPos[0] === target[0] && v.gridPos[1] === target[1]).forEach(v => v.locked = false);
          this.playClick();
        }
      } else {
        this.player.position.copy(this.nearVent.destination); this.playClick();
      }
      return;
    }
    if (this.nearLever && !this.nearLever.activated) {
      this.nearLever.activate(); this.leversActivated++; this.playLeverActivate();
      this.checkEscapedCondition(); return;
    }
    if (this.nearDrawer && !this.nearDrawer.searched) {
      this.nearDrawer.searched = true;
      if (this.nearDrawer.hasKey) this.player.keysHeld++;
      if (this.nearDrawer.hasPotion) this.player.potionsHeld++;
      this.playClick(); this.checkEscapedCondition(); return;
    }
    if (this.nearLocker) {
      this.isHiding = true; this.hidingLocker = this.nearLocker;
      this.hidingLocker.door.rotation.y = -0.5; this.playClick();
    }
  }

  checkEscapedCondition() {
    if (this.leversActivated >= LEVER_COUNT && this.player.keysHeld >= EXIT_KEYS_REQUIRED && this.level) {
      this.level.exitDoor.open = true; this.playDoorOpen();
    }
  }

  checkInteractables() {
    if (!this.level || this.isHiding) return;
    let bLev = null, bLd = 2.4;
    this.level.levers.forEach(l => { if (!l.activated && l.pos.distanceTo(this.player.position) < bLd) { bLd = l.pos.distanceTo(this.player.position); bLev = l; }});
    let bLoc = null, bLoD = 1.8;
    this.level.hidingSpots.forEach(s => { if (s.interactPos.distanceTo(this.player.position) < bLoD) { bLoD = s.interactPos.distanceTo(this.player.position); bLoc = s; }});
    let bDra = null, bDd = 1.8;
    this.level.drawers.forEach(d => { if (!d.searched && d.interactPos.distanceTo(this.player.position) < bDd) { bDd = d.interactPos.distanceTo(this.player.position); bDra = d; }});
    let bVen = null, bVd = 1.4;
    this.level.vents.forEach(v => { if (v.pos.distanceTo(this.player.position) < bVd) { bVd = v.pos.distanceTo(this.player.position); bVen = v; }});
    
    this.nearLever = bLev;
    this.nearLocker = bLoc && !bLev ? bLoc : null;
    this.nearDrawer = bDra && !bLev && !bLoc ? bDra : null;
    this.nearVent = bVen && !bLev && !bLoc && !bDra ? bVen : null;

    if (this.level.exitDoor.open && this.level.exitDoor.pos.distanceTo(this.player.position) < 1.6) this.onEscaped();
  }

  // --- Level Generation ---
  startLevel(idx: number) {
    this.levelIndex = idx;
    this.level = this.buildLevel(idx);
    this.gameState = 'playing';
    this.leversActivated = 0;
    this.stamina = MAX_STAMINA;
    this.player.flashlightBattery = MAX_BATTERY;
    this.player.keysHeld = 0;
    this.player.potionsHeld = 0;
    this.player.speedBoostTimer = 0;
    this.player.isFlashlightOn = true;
    this.isHiding = false;
    this.clock.start();
  }

  buildLevel(idx: number): LevelData {
    const cfg = LEVELS[idx];
    const palette = PALETTES[idx % PALETTES.length];
    const gridSize = cfg.grid;
    const grid = this.generateGrid(gridSize, cfg.openness);
    
    this.monster.config = cfg;
    this.monster.palette = palette;
    this.monster.suspicion = 0;
    this.monster.state = 'patrol';

    // Clear previous
    if (this.level) this.level.objects.forEach(obj => this.scene.remove(obj));
    this.monster.group.children = [];

    const objects: THREE.Object3D[] = [];
    const walls: Wall[] = [];
    const levers: Lever[] = [];
    const hidingSpots: Locker[] = [];

    // Floor and Ceiling
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(gridSize * CELL, gridSize * CELL), new THREE.MeshStandardMaterial({ color: palette.floor, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor); objects.push(floor);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(gridSize * CELL, gridSize * CELL), new THREE.MeshStandardMaterial({ color: palette.floor, roughness: 0.9 }));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = WALL_H;
    this.scene.add(ceiling); objects.push(ceiling);

    const wallMat = new THREE.MeshStandardMaterial({ color: palette.wall, roughness: 0.8 });
    const worldOffset = (gridSize - 1) * CELL / 2;

    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        if (grid[y][x] === 1) {
          const wx = x * CELL - worldOffset;
          const wz = y * CELL - worldOffset;
          const wall = new THREE.Mesh(new THREE.BoxGeometry(CELL, WALL_H, CELL), wallMat);
          wall.position.set(wx, WALL_H / 2, wz);
          this.scene.add(wall); objects.push(wall);
          walls.push({ minX: wx - CELL / 2, maxX: wx + CELL / 2, minZ: wz - CELL / 2, maxZ: wz + CELL / 2 });
        }
      }
    }

    // Levers
    const floorCells = this.pickEmptyCells(grid, LEVER_COUNT + 10);
    const leverCells = floorCells.slice(0, LEVER_COUNT);
    leverCells.forEach(([cx, cy]) => {
      const [wx, wz] = this.gridToWorld(cx, cy);
      const lev = this.makeLever(wx, wz);
      this.scene.add(lev.group); objects.push(lev.group);
      levers.push(lev);
    });

    // Lockers
    const lockerCells = floorCells.slice(LEVER_COUNT, LEVER_COUNT + cfg.hidingSpots);
    lockerCells.forEach(([cx, cy]) => {
      const [wx, wz] = this.gridToWorld(cx, cy);
      const lk = this.makeLocker(wx, wz);
      this.scene.add(lk.group); objects.push(lk.group);
      hidingSpots.push(lk);
    });

    // Drawers
    const drawers: Drawer[] = [];
    const itemPool = this.shuffle([...Array(7).fill('key'), ...Array(5).fill('potion')]);
    const drawerCells = floorCells.slice(LEVER_COUNT + cfg.hidingSpots, LEVER_COUNT + cfg.hidingSpots + DRAWER_COUNT);
    drawerCells.forEach(([cx, cy], i) => {
        const [wx, wz] = this.gridToWorld(cx, cy);
        const dr = this.makeDrawer(wx, wz, 0, 1); // Simple forward facing for now
        dr.hasKey = itemPool[i] === 'key';
        dr.hasPotion = itemPool[i] === 'potion';
        this.scene.add(dr.group); objects.push(dr.group);
        drawers.push(dr);
    });

    // Vents
    const vents: Vent[] = [];
    const vCands: [number, number, number, number][] = [];
    for (let y = 1; y < gridSize - 1; y++) {
        for (let x = 1; x < gridSize - 1; x++) {
            if (grid[y][x] === 1) { // Wall cell
                if (grid[y][x - 1] === 0 && grid[y][x + 1] === 0) vCands.push([x, y, 1, 0]);
                if (grid[y - 1][x] === 0 && grid[y + 1][x] === 0) vCands.push([x, y, 0, 1]);
            }
        }
    }
    const selVents = this.shuffle(vCands).slice(0, 4);
    selVents.forEach(([vx, vy, dx, dy], i) => {
        const [wx, wz] = this.gridToWorld(vx, vy);
        const [ax, az] = this.gridToWorld(vx - dx, vy - dy);
        const [bx, bz] = this.gridToWorld(vx + dx, vy + dy);
        const locked = i < 2;
        const vA = this.makeVent(wx - dx * 0.45, wz - dy * 0.45, -dx, -dy, [vx, vy], new THREE.Vector3(bx, PLAYER_H, bz), [vx + dx, vy + dy], locked);
        const vB = this.makeVent(wx + dx * 0.45, wz + dy * 0.45, dx, dy, [vx, vy], new THREE.Vector3(ax, PLAYER_H, az), [vx - dx, vy - dy], locked);
        this.scene.add(vA.group, vB.group); objects.push(vA.group, vB.group); vents.push(vA, vB);
    });

    const exitCell: [number, number] = [0, gridSize / 2 | 0]; // Fixed side
    grid[exitCell[1]][exitCell[0]] = 0;
    const [exWx, exWz] = this.gridToWorld(exitCell[0], exitCell[1]);
    const exitDoor = this.makeExitDoor(exWx, exWz);
    this.scene.add(exitDoor.group); objects.push(exitDoor.group);

    // Monster setup
    this.buildMonsterMesh();
    const [mx, mz] = this.gridToWorld(gridSize - 2, gridSize - 2);
    this.monster.group.position.set(mx, 0, mz);

    // Player setup
    const [px, pz] = this.gridToWorld(1, 1);
    this.player.position.set(px, PLAYER_H, pz);
    this.player.yaw = Math.PI / 4;

    return { grid, gridSize, walls, levers, hidingSpots, drawers, vents, exitDoor, lights: [], objects, playerStart: [1, 1], monsterStart: [gridSize - 2, gridSize - 2], exitCell };
  }

  generateGrid(size: number, openness: number): number[][] {
    const g = Array.from({ length: size }, () => Array(size).fill(1));
    const carve = (x: number, y: number) => {
        g[y][x] = 0;
        const dirs = [[0, 2], [0, -2], [2, 0], [-2, 0]].sort(() => Math.random() - 0.5);
        dirs.forEach(([dx, dy]) => {
            const nx = x + dx, ny = y + dy;
            if (nx > 0 && nx < size - 1 && ny > 0 && ny < size - 1 && g[ny][nx] === 1) {
                g[y + dy / 2][x + dx / 2] = 0; carve(nx, ny);
            }
        });
    };
    carve(1, 1);
    for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) if (g[y][x] === 1 && Math.random() < openness) g[y][x] = 0;
    return g;
  }

  pickEmptyCells(grid: number[][], count: number): [number, number][] {
    const res: [number, number][] = [];
    outer: for (let y = 1; y < grid.length - 1; y++) {
      for (let x = 1; x < grid.length - 1; x++) {
        if (grid[y][x] === 0 && (x > 3 || y > 3)) { res.push([x, y]); if (res.length > count * 3) break outer; }
      }
    }
    return this.shuffle(res).slice(0, count);
  }

  // --- Mesh Builders ---
  makeLever(x: number, z: number): Lever {
    const group = new THREE.Group(); group.position.set(x, 0.4, z);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.4), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    group.add(base);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5), new THREE.MeshStandardMaterial({ color: 0xaa0000 }));
    handle.position.y = 0.25; handle.rotation.z = Math.PI / 4; group.add(handle);
    return { group, handle, pos: new THREE.Vector3(x, 0.4, z), activated: false, activate: () => { handle.rotation.z = -Math.PI / 4; }};
  }

  makeLocker(x: number, z: number): Locker {
    const group = new THREE.Group(); group.position.set(x, 1, z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2, 0.8), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    group.add(body);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2, 0.1), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    door.position.set(0, 0, 0.4); group.add(door);
    return { group, door, pos: new THREE.Vector3(x, 1, z), facing: new THREE.Vector3(0, 0, 1), interactPos: new THREE.Vector3(x, PLAYER_H, z + 1), insidePos: new THREE.Vector3(x, PLAYER_H, z) };
  }

  makeDrawer(x: number, z: number, dx: number, dz: number): Drawer {
    const group = new THREE.Group(); group.position.set(x, 0, z);
    const inner = new THREE.Group(); inner.position.y = 0.45; group.add(inner);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.5), new THREE.MeshStandardMaterial({ color: 0x4a3a2a }));
    body.position.y = 0.45; group.add(body);
    const innerBody = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: 0x2a1a0a }));
    inner.add(innerBody);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: 0xffaa00 }));
    handle.position.z = 0.25; inner.add(handle);
    return { group, handle, body, inner, pos: new THREE.Vector3(x, 0.45, z), facing: new THREE.Vector3(0, 0, 1), interactPos: new THREE.Vector3(x, PLAYER_H, z + 0.8), searched: false, hasKey: false, hasPotion: false, openProgress: 0 };
  }

  makeVent(x: number, z: number, dx: number, dz: number, gridPos: [number, number], destination: THREE.Vector3, destGridPos: [number, number], locked: boolean): Vent {
    const group = new THREE.Group(); group.position.set(x, 0.3, z);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.05), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    group.add(frame);
    if (locked) {
        const lock = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.1), new THREE.MeshStandardMaterial({ color: 0xff0000 }));
        lock.position.z = 0.05; group.add(lock);
    }
    // Glow for visibility
    const glow = new THREE.PointLight(locked ? 0xff0000 : 0x00ffff, 0.5, 1.5);
    glow.position.z = 0.2; group.add(glow);

    const rotY = Math.atan2(dx, dz); group.rotation.y = rotY;
    return { group, pos: new THREE.Vector3(x, 0.3, z), gridPos, facing: new THREE.Vector3(dx, 0, dz), destination, destGridPos, locked };
  }

  makeExitDoor(x: number, z: number): ExitDoor {
    const group = new THREE.Group(); group.position.set(x, WALL_H / 2, z);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, WALL_H, 0.2), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x111111 }));
    group.add(mesh);
    return { group, pos: new THREE.Vector3(x, WALL_H / 2, z), open: false };
  }

  buildMonsterMesh() {
    const p = this.monster.palette;
    const mat = new THREE.MeshStandardMaterial({ color: p.wall, roughness: 0.9 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.3), mat); torso.position.y = 1.4; this.monster.group.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), mat); head.position.y = 1.95; this.monster.group.add(head);
    const legG = new THREE.BoxGeometry(0.15, 1.0, 0.15);
    this.monster.leftLeg = new THREE.Mesh(legG, mat); this.monster.leftLeg.position.set(-0.15, 0.5, 0); this.monster.group.add(this.monster.leftLeg);
    this.monster.rightLeg = new THREE.Mesh(legG, mat); this.monster.rightLeg.position.set(0.15, 0.5, 0); this.monster.group.add(this.monster.rightLeg);
    const armG = new THREE.BoxGeometry(0.12, 0.8, 0.12);
    this.monster.leftArm = new THREE.Mesh(armG, mat); this.monster.leftArm.position.set(-0.35, 1.4, 0); this.monster.group.add(this.monster.leftArm);
    this.monster.rightArm = new THREE.Mesh(armG, mat); this.monster.rightArm.position.set(0.35, 1.4, 0); this.monster.group.add(this.monster.rightArm);
    
    this.monster.leftEyeLight = new THREE.PointLight(p.eyeGlow, 0.5, 3); this.monster.leftEyeLight.position.set(-0.1, 2.05, 0.2); this.monster.group.add(this.monster.leftEyeLight);
    this.monster.rightEyeLight = new THREE.PointLight(p.eyeGlow, 0.5, 3); this.monster.rightEyeLight.position.set(0.1, 2.05, 0.2); this.monster.group.add(this.monster.rightEyeLight);
  }

  // --- State Utils ---
  gridToWorld(gx: number, gy: number): [number, number] {
    if (!this.level) return [0, 0];
    const os = (this.level.gridSize - 1) * CELL / 2;
    return [gx * CELL - os, gy * CELL - os];
  }
  worldToGrid(wx: number, wz: number): [number, number] {
    if (!this.level) return [0, 0];
    const os = (this.level.gridSize - 1) * CELL / 2;
    return [Math.round((wx + os) / CELL), Math.round((wz + os) / CELL)];
  }
  shuffle<T>(a: T[]): T[] { return a.sort(() => Math.random() - 0.5); }

  // --- Logic Events ---
  onCaught() { this.gameState = 'dying'; this.dyingTimer = 3.0; this.playScream(); }
  onEscaped() { this.gameState = 'escaped'; }
  updateDying(dt: number) {
    this.dyingTimer -= dt;
    if (this.dyingTimer <= 0) this.gameState = 'dead';
    this.camera.position.y -= dt * 0.5;
    this.camera.rotation.z += dt * 0.5;
  }
  updateLights(t: number, dt: number) {
    if (this.monster.leftEyeLight) this.monster.leftEyeLight.intensity = (this.monster.state === 'chase' ? 1.5 : 0.5) + Math.sin(t * 10) * 0.1;
    if (this.monster.rightEyeLight) this.monster.rightEyeLight.intensity = (this.monster.state === 'chase' ? 1.5 : 0.5) + Math.cos(t * 10) * 0.1;
  }

  setAdminOption(option: 'noclip' | 'invincible', val: boolean) {
    if (option === 'noclip') this.isNoclip = val;
    if (option === 'invincible') this.isInvincible = val;
  }

  // --- Audio ---
  initAudio() {
    if (this.audioCtx) return;
    this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.masterGain = this.audioCtx.createGain(); this.masterGain.connect(this.audioCtx.destination);
    this.monsterGrowlGain = this.audioCtx.createGain(); this.monsterGrowlGain.connect(this.masterGain);
    this.startDrone();
  }
  setAudioPaused(p: boolean) { if (p) this.audioCtx?.suspend(); else this.audioCtx?.resume(); }
  startDrone() {
    if (!this.audioCtx || !this.masterGain) return;
    const osc = this.audioCtx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 40;
    const filter = this.audioCtx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 100;
    this.droneGain = this.audioCtx.createGain(); this.droneGain.gain.value = 0.15;
    osc.connect(filter); filter.connect(this.droneGain); this.droneGain.connect(this.masterGain); osc.start();
  }
  updateAudioHUD() {} 
  playFootstep() { this.playNoise(70 + Math.random() * 20, 0.05, 0.1, 'sine'); }
  playMonsterFootstep() { this.playNoise(50, 0.15, 0.2, 'square'); }
  playClick() { this.playNoise(800, 0.03, 0.1, 'triangle'); }
  playLeverActivate() { this.playNoise(200, 0.2, 0.3, 'sawtooth'); }
  playDoorOpen() { this.playNoise(100, 0.5, 0.4, 'sawtooth'); }
  playScream() { this.playNoise(150, 0.8, 1.0, 'sawtooth'); this.playNoise(250, 0.8, 1.0, 'sawtooth'); }
  playDrinkSound() { this.playNoise(400, 0.2, 0.3, 'sine'); }
  playNoise(freq: number, vol: number, dur: number, type: OscillatorType) {
    if (!this.audioCtx || !this.masterGain) return;
    const o = this.audioCtx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
    const g = this.audioCtx.createGain(); g.gain.setValueAtTime(vol, this.audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + dur);
    o.connect(g); g.connect(this.masterGain); o.start(); o.stop(this.audioCtx.currentTime + dur);
  }
}
