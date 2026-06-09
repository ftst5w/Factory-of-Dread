import * as THREE from 'three';
import { 
  CELL, WALL_H, PLAYER_H, CROUCH_H, PLAYER_R, WALK_SPEED, SPRINT_MULT, 
  CROUCH_MULT, MAX_STAMINA, STAMINA_REGEN, STAMINA_DRAIN, MOUSE_SENS, 
  LEVER_COUNT, LEVELS, PALETTES, MAX_BATTERY, BATTERY_DRAIN_RATE,
  EXIT_KEYS_REQUIRED, DRAWER_COUNT, POTION_SPEED_MULT, POTION_DURATION,
  MONSTER_KILL_DIST, ADMIN_FLY_SPEED
} from './constants';
import { GameState, Player, Monster, LevelData, Lever, Locker, Drawer, Vent, ExitDoor, Palette, LevelConfig } from './types';

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
  
  // HUD update callback
  onStateUpdate: (data: any) => void;

  constructor(canvas: HTMLCanvasElement, onStateUpdate: (data: any) => void) {
    this.onStateUpdate = onStateUpdate;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.06);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 200);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene.add(new THREE.AmbientLight(0x202028, 0.35));

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
      
      // Admin Mode Toggle (CTRL + ALT)
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

  // --- Game Loop ---
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

      // Animate Drawers
      if (this.level) {
        for (const dr of this.level.drawers) {
          if (dr.searched && dr.openProgress < 1) {
            dr.openProgress = Math.min(1, dr.openProgress + dt * 4);
            dr.inner.position.z = dr.openProgress * 0.4;
          }
        }
      }
    } else if (this.gameState === 'dying') {
      this.updateDying(dt);
      this.updateLights(t, dt);
    }

    this.renderer.render(this.scene, this.camera);
    
    // Trigger HUD update
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
      monsterPos: this.worldToGrid(this.monster.group.position.x, this.monster.group.position.z),
      drawers: this.level?.drawers.map(d => ({ grid: this.worldToGrid(d.pos.x, d.pos.z), searched: d.searched })) || [],
      vents: this.level?.vents.map(v => ({ grid: v.gridPos, locked: v.locked })) || [],
      monsterDist: this.monster.group.position.distanceTo(this.player.position),
      monsterState: this.monster.state,
      grid: this.level?.grid,
      gridSize: this.level?.gridSize,
      playerPos: this.worldToGrid(this.player.position.x, this.player.position.z),
      playerYaw: this.player.yaw,
      exitPos: this.level?.exitCell,
      isExitOpen: this.level?.exitDoor?.open,
      deathProgress: this.gameState === 'dying' ? (1 - this.dyingTimer / 3.0) : 0
    });
  }

  flashlight: THREE.SpotLight | null = null;
  setupFlashlight() {
    this.flashlight = new THREE.SpotLight(0xffffff, 10.0, 25, Math.PI / 3, 0.5, 1);
    this.flashlight.position.set(0, 0, 0.1);
    this.camera.add(this.flashlight);
    this.camera.add(this.flashlight.target);
    this.flashlight.target.position.set(0, 0, -1);
    this.scene.add(this.camera);
    this.flashlight.visible = true;
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
      this.flashlight.intensity = 10.0 * (this.player.flashlightBattery / 100);
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
    this.player.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.player.pitch));
    this.mouseDX = 0; this.mouseDY = 0;

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

    if (this.isNoclip) {
        // Noclip movement
        const move = new THREE.Vector3();
        if (mx !== 0 || mz !== 0) {
            const rot = new THREE.Euler(this.player.pitch, this.player.yaw, 0, 'YXZ');
            const dir = new THREE.Vector3(mx, 0, mz).normalize().applyEuler(rot);
            this.player.position.addScaledVector(dir, ADMIN_FLY_SPEED * dt);
        }
        return;
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

    const newX = this.player.position.x + this.player.velocity.x * dt;
    if (!this.collidesAt(newX, this.player.position.z, PLAYER_R)) this.player.position.x = newX;
    else this.player.velocity.x = 0;
    const newZ = this.player.position.z + this.player.velocity.z * dt;
    if (!this.collidesAt(this.player.position.x, newZ, PLAYER_R)) this.player.position.z = newZ;
    else this.player.velocity.z = 0;

    this.player.position.y = this.player.height;
    let bob = 0;
    if (moving && !this.player.isCrouching) {
      const bobRate = this.player.isSprinting ? 12 : 7;
      bob = Math.sin(performance.now() * 0.001 * bobRate) * (this.player.isSprinting ? 0.05 : 0.025);
    }
    this.camera.position.set(this.player.position.x, this.player.position.y + bob, this.player.position.z);
    this.camera.rotation.set(this.player.pitch, this.player.yaw, 0, 'YXZ');

    if (moving) {
      this.player.footstepTimer -= dt;
      const interval = this.player.isSprinting ? 0.32 : (this.player.isCrouching ? 0.7 : 0.48);
      if (this.player.footstepTimer <= 0) {
        this.playFootstep();
        this.player.footstepTimer = interval;
      }
    }
  }

  collidesAt(x: number, z: number, r: number) {
    if (!this.level) return false;
    if (this.level.exitDoor && !this.level.exitDoor.open) {
      const dpos = this.level.exitDoor.group.position;
      const dx = Math.abs(x - dpos.x);
      const dz = Math.abs(z - dpos.z);
      if (dx < 1.0 + r && dz < 0.25 + r) return true;
    }
    for (const w of this.level.walls) {
      const cx = this.clamp(x, w.minX, w.maxX);
      const cz = this.clamp(z, w.minZ, w.maxZ);
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }

  // --- Monster AI ---
  updateMonster(dt: number) {
    if (this.gameState !== 'playing' || !this.level || !this.monster.config) return;
    const cfg = this.monster.config;
    this.monster.pathTimer -= dt;

    const sees = this.canMonsterSeePlayer();
    const hears = this.canMonsterHearPlayer();

    // Use alertTimer as a patience/search timer
    if (this.monster.alertTimer > 0) this.monster.alertTimer -= dt;

    // Layered Perception [F-2.1]
    const perceptionRate = sees ? 2.5 : (hears ? 1.5 : -0.5);
    this.monster.suspicion = this.clamp(this.monster.suspicion + perceptionRate * dt, 0, 1);

    if (this.monster.suspicion > 0.7) {
      this.monster.state = 'chase';
      this.monster.alertTimer = 6.0; // Increased patience
      this.monster.lastSeenPlayer = this.player.position.clone();
    } else if (this.monster.suspicion > 0.3 && this.monster.state !== 'chase') {
      this.monster.state = 'investigate';
      if (hears || sees) {
        this.monster.lastSeenPlayer = this.player.position.clone();
      }
    } else if (this.monster.state === 'chase' && this.monster.suspicion < 0.4) {
      this.monster.state = 'search';
      this.monster.alertTimer = 8.0; // Search for a decent amount of time
    } else if (this.monster.state !== 'chase' && (this.monster.suspicion < 0.1 || this.monster.alertTimer <= 0)) {
      if (this.monster.state !== 'patrol') {
        this.monster.state = 'patrol';
        this.monster.targetCell = null; // Forces picking a new wander target
      }
    }

    const monsterCell = this.worldToGrid(this.monster.group.position.x, this.monster.group.position.z);
    let targetCell: [number, number] | null = null;

    if (this.monster.state === 'chase') {
      targetCell = this.worldToGrid(this.player.position.x, this.player.position.z);
    } else if (this.monster.state === 'investigate' && this.monster.lastSeenPlayer) {
      targetCell = this.worldToGrid(this.monster.lastSeenPlayer.x, this.monster.lastSeenPlayer.z);
      if (this.monster.group.position.distanceTo(this.monster.lastSeenPlayer) < 1.5) {
        this.monster.lastSeenPlayer = null;
        this.monster.suspicion *= 0.5;
      }
    } else if (this.monster.state === 'search' && this.monster.lastSeenPlayer) {
      targetCell = this.worldToGrid(this.monster.lastSeenPlayer.x, this.monster.lastSeenPlayer.z);
      if (this.monster.group.position.distanceTo(this.monster.lastSeenPlayer) < 2) {
        this.monster.lastSeenPlayer = null;
      }
    } else {
      if (!this.monster.targetCell || this.monster.path.length === 0 || this.monster.pathTimer < -3) {
        this.monster.targetCell = this.pickWanderTarget();
        this.monster.pathTimer = 0;
      }
      targetCell = this.monster.targetCell;
    }

    if (this.monster.pathTimer <= 0 && targetCell) {
      const path = this.bfsPath(monsterCell[0], monsterCell[1], targetCell[0], targetCell[1]);
      if (path) this.monster.path = path;
      this.monster.pathTimer = this.monster.state === 'chase' ? 0.4 : 1.0;
    }

    let targetWorld: THREE.Vector3 | null = null;
    if (this.monster.path.length > 0) {
      const next = this.monster.path[0];
      const [tx, tz] = this.gridToWorld(next[0], next[1]);
      targetWorld = new THREE.Vector3(tx, 0, tz);
      if (this.monster.group.position.distanceTo(targetWorld) < 0.5) {
        this.monster.path.shift();
      }
    }

    let targetSpeed = 0;
    if (this.monster.state === 'chase') targetSpeed = cfg.monsterSpeed * 2.2; // Stalker is way faster in chase
    else if (this.monster.state === 'investigate') targetSpeed = cfg.monsterSpeed * 1.0;
    else if (this.monster.state === 'search') targetSpeed = cfg.monsterSpeed * 1.2;
    else targetSpeed = cfg.monsterSpeed * 0.6;

    this.monster.speed += (targetSpeed - this.monster.speed) * Math.min(1, dt * cfg.monsterAccel);

    if (targetWorld) {
      const dir = new THREE.Vector3().subVectors(targetWorld, this.monster.group.position);
      dir.y = 0;
      const dlen = dir.length();
      if (dlen > 0.01) {
        dir.normalize();
        const moveX = dir.x * this.monster.speed * dt;
        const moveZ = dir.z * this.monster.speed * dt;
        
        // BETTER COLLISION / SLIDING
        const nx = this.monster.group.position.x + moveX;
        const nz = this.monster.group.position.z + moveZ;
        
        let moved = false;
        if (!this.collidesAt(nx, this.monster.group.position.z, 0.7)) {
            this.monster.group.position.x = nx;
            moved = true;
        }
        if (!this.collidesAt(this.monster.group.position.x, nz, 0.7)) {
            this.monster.group.position.z = nz;
            moved = true;
        }

        // UNSTUCK: if monster hits a wall and can't move, try a small nudge
        if (!moved && this.monster.speed > 0.1) {
            const nudgeX = (Math.random() - 0.5) * 0.1;
            const nudgeZ = (Math.random() - 0.5) * 0.1;
            if (!this.collidesAt(this.monster.group.position.x + nudgeX, this.monster.group.position.z + nudgeZ, 0.7)) {
                this.monster.group.position.x += nudgeX;
                this.monster.group.position.z += nudgeZ;
            }
        }
        
        const targetYaw = Math.atan2(dir.x, dir.z);
        let curYaw = this.monster.group.rotation.y;
        let dy = targetYaw - curYaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        this.monster.group.rotation.y += dy * Math.min(1, dt * 6);
      }
    }

    if (this.monster.speed > 0.1 && this.monster.leftLeg) {
      this.monster.walkPhase += dt * this.monster.speed * 1.5;
      this.monster.leftLeg.rotation.x = Math.sin(this.monster.walkPhase) * 0.6;
      this.monster.rightLeg.rotation.x = -Math.sin(this.monster.walkPhase) * 0.6;
      this.monster.leftArm.rotation.x = -Math.sin(this.monster.walkPhase) * 0.5;
      this.monster.rightArm.rotation.x = Math.sin(this.monster.walkPhase) * 0.5;

      // Monster Footsteps
      this.monster.footstepTimer -= dt;
      if (this.monster.footstepTimer <= 0) {
        const interval = 1.2 / (this.monster.speed + 0.1);
        this.playMonsterFootstep();
        this.monster.footstepTimer = interval;
      }
    }

    if (this.monster.leftEyeLight && this.monster.rightEyeLight) {
        if (this.monster.state === 'chase') {
          this.monster.leftEyeLight.color.setHex(0xff2020);
          this.monster.rightEyeLight.color.setHex(0xff2020);
          this.monster.leftEyeLight.intensity = 1.2;
          this.monster.rightEyeLight.intensity = 1.2;
        } else {
          const g = this.monster.palette.eyeGlow;
          this.monster.leftEyeLight.color.setHex(g);
          this.monster.rightEyeLight.color.setHex(g);
          this.monster.leftEyeLight.intensity = 0.5;
          this.monster.rightEyeLight.intensity = 0.5;
        }
    }

    if (this.gameState === 'playing' && !this.isInvincible) {
      const dx = this.monster.group.position.x - this.player.position.x;
      const dz = this.monster.group.position.z - this.player.position.z;
      const catchDist = Math.hypot(dx, dz);
      // Hitbox increased from 1.3 to MONSTER_KILL_DIST (1.4 or higher)
      const threshold = this.isHiding ? 1.0 : MONSTER_KILL_DIST;
      if (catchDist < threshold) {
        this.onCaught();
      }
    }

    const dist = this.monster.group.position.distanceTo(this.player.position);
    if (this.audioCtx && this.monsterGrowlGain && this.gameState === 'playing') {
      const wobble = 1.0 + Math.sin(performance.now() * 0.005) * 0.2;
      const growlVol = Math.max(0, 1 - dist / 18) * (this.monster.state === 'chase' ? 0.25 : 0.08) * wobble;
      this.monsterGrowlGain.gain.setTargetAtTime(growlVol, this.audioCtx.currentTime, 0.2);
    } else if (this.monsterGrowlGain) {
      this.monsterGrowlGain.gain.setTargetAtTime(0, this.audioCtx?.currentTime || 0, 0.1);
    }
  }

  canMonsterSeePlayer() {
    if (!this.monster.config) return false;
    if (this.isHiding) {
      const d = this.monster.group.position.distanceTo(this.player.position);
      // Reduced from 1.4 to 1.1 to prevent "camping" loop.
      // Monster will reach investigation target (1.5m), not see you, and then move on.
      return d < 1.1; 
    }
    const cfg = this.monster.config;
    const mPos = this.monster.group.position;
    const pPos = this.player.position;
    const dx = pPos.x - mPos.x, dz = pPos.z - mPos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > cfg.sightRange) return false;

    const monsterFwd = new THREE.Vector3();
    this.monster.group.getWorldDirection(monsterFwd);
    const dirToPlayer = new THREE.Vector3(dx, 0, dz).normalize();
    const fwd2 = new THREE.Vector3(monsterFwd.x, 0, monsterFwd.z).normalize();
    const dot = fwd2.dot(dirToPlayer);
    const cosFov = Math.cos((cfg.fovDeg / 2) * Math.PI / 180);
    if (dot < cosFov && dist > 4) return false;

    const steps = Math.ceil(dist * 2);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = mPos.x + dx * t;
      const z = mPos.z + dz * t;
      if (this.collidesAt(x, z, 0.05)) return false;
    }
    
    // Flashlight makes player visible [F-1.2]
    if (this.player.isFlashlightOn) return dist < cfg.sightRange * 1.5;

    if (this.player.isCrouching && dist > 8) return false; // Fixed B-001: proper crouching visibility
    return true;
  }

  canMonsterHearPlayer() {
    if (!this.monster.config) return false;
    if (this.isHiding) return false;
    const cfg = this.monster.config;
    let noise = 0;
    if (this.player.isSprinting) noise = 1.0;
    else if (this.player.isCrouching) noise = 0.05;
    else if (this.player.velocity.length() > 0.1) noise = 0.3;

    if (noise === 0) return false;
    const dist = this.monster.group.position.distanceTo(this.player.position);
    return (noise * cfg.hearRange) > dist;
  }

  // --- Pathfinding ---
  bfsPath(sx: number, sy: number, gx: number, gy: number): [number, number][] | null {
    if (!this.level) return null;
    const grid = this.level.grid;
    const size = grid.length;
    if (sx === gx && sy === gy) return [];
    const visited = Array.from({ length: size }, () => new Array(size).fill(false));
    const prev = Array.from({ length: size }, () => new Array(size).fill(null));
    const queue: [number, number][] = [[sx, sy]];
    visited[sy][sx] = true;
    while (queue.length) {
      const qItem = queue.shift();
      if (!qItem) break;
      const [x, y] = qItem;
      if (x === gx && y === gy) {
        const path: [number, number][] = [];
        let cur: [number, number] | null = [x, y];
        while (cur && !(cur[0] === sx && cur[1] === sy)) {
          path.push(cur);
          cur = prev[cur[1]][cur[0]];
        }
        path.reverse();
        return path;
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
        if (visited[ny][nx]) continue;
        if (grid[ny][nx] !== 0) continue;
        visited[ny][nx] = true;
        prev[ny][nx] = [x, y];
        queue.push([nx, ny]);
      }
    }
    return null;
  }

  pickWanderTarget(): [number, number] {
    if (!this.level) return [0, 0];
    const size = this.level.gridSize;
    const cells: [number, number][] = [];
    for (let y = 1; y < size - 1; y++)
      for (let x = 1; x < size - 1; x++)
        if (this.level.grid[y][x] === 0) cells.push([x, y]);
    return cells[Math.floor(Math.random() * cells.length)];
  }

  // --- Interaction ---
  tryInteract() {
    if (this.gameState !== 'playing') return;
    if (this.isHiding && this.hidingLocker) {
      this.isHiding = false;
      this.hidingLocker.door.rotation.y = 0;
      const f = this.hidingLocker.facing;
      this.player.position.x = this.hidingLocker.group.position.x + f.x * 1.0;
      this.player.position.z = this.hidingLocker.group.position.z + f.z * 1.0;
      this.hidingLocker = null;
      this.playClick();
      return;
    }
    if (this.nearVent) {
      if (!this.player.isCrouching) return; 
      if (this.nearVent.locked) {
        if (this.player.keysHeld > 0) {
          this.player.keysHeld--;
          this.nearVent.locked = false;
          // Find logic to unlock both sides
          const targetGrid = this.nearVent.gridPos;
          if (this.level) {
            for (const v of this.level.vents) {
                if (v.gridPos[0] === targetGrid[0] && v.gridPos[1] === targetGrid[1]) {
                    v.locked = false;
                    // Visual feedback: remove red lock if we wanted to be fancy, 
                    // for now just state change is enough for logic
                }
            }
          }
          this.playClick();
        }
        return;
      }
      this.player.position.copy(this.nearVent.destination);
      this.playClick();
      return;
    }
    if (this.nearLever && !this.nearLever.activated) {
      this.nearLever.activate();
      this.leversActivated++;
      this.playLeverActivate();
      if (this.leversActivated >= LEVER_COUNT && this.player.keysHeld >= EXIT_KEYS_REQUIRED) {
        if (this.level) {
          this.level.exitDoor.open = true;
          this.playDoorOpen();
        }
      }
      return;
    }
    if (this.nearDrawer && !this.nearDrawer.searched) {
      this.nearDrawer.searched = true;
      if (this.nearDrawer.hasKey) this.player.keysHeld++;
      if (this.nearDrawer.hasPotion) this.player.potionsHeld++;
      this.playClick();
      if (this.leversActivated >= LEVER_COUNT && this.player.keysHeld >= EXIT_KEYS_REQUIRED) {
        if (this.level) {
          this.level.exitDoor.open = true;
          this.playDoorOpen();
        }
      }
      return;
    }
    if (this.nearLocker) {
      this.isHiding = true;
      this.hidingLocker = this.nearLocker;
      this.hidingLocker.door.rotation.y = -0.5;
      this.playClick();
    }
  }

  checkInteractables() {
    if (!this.level) return;
    if (this.gameState !== 'playing' || this.isHiding) {
      this.nearLever = null; this.nearLocker = null;
      return;
    }
    let bestLever = null, bestLD = 2.2;
    for (const lev of this.level.levers) {
      if (lev.activated) continue;
      const d = lev.pos.distanceTo(this.player.position);
      if (d < bestLD) { bestLD = d; bestLever = lev; }
    }
    let bestLocker = null, bestKD = 1.6;
    for (const lk of this.level.hidingSpots) {
      const d = lk.interactPos.distanceTo(this.player.position);
      if (d < bestKD) { bestKD = d; bestLocker = lk; }
    }
    let bestDrawer = null, bestDD = 1.6;
    for (const dr of this.level.drawers) {
      if (dr.searched) continue;
      const d = dr.interactPos.distanceTo(this.player.position);
      if (d < bestDD) { bestDD = d; bestDrawer = dr; }
    }
    let bestVent = null, bestVD = 1.2;
    for (const v of this.level.vents) {
      const d = v.pos.distanceTo(this.player.position);
      if (d < bestVD) { bestVD = d; bestVent = v; }
    }
    this.nearLever = bestLever;
    this.nearLocker = bestLocker && !bestLever ? bestLocker : null;
    this.nearDrawer = bestDrawer && !bestLever && !bestLocker ? bestDrawer : null;
    this.nearVent = bestVent && !bestLever && !bestLocker && !bestDrawer ? bestVent : null;

    if (this.level.exitDoor.open) {
      const d = this.level.exitDoor.pos.distanceTo(this.player.position);
      if (d < 1.6) this.onEscaped();
    }
  }

  setAudioPaused(paused: boolean) {
    if (!this.audioCtx) return;
    if (paused) {
      this.audioCtx.suspend();
    } else {
      this.audioCtx.resume();
    }
  }

  // --- World Generation ---
  gridToWorld(gx: number, gy: number): [number, number] {
    if (!this.level) return [0, 0];
    const offset = (this.level.gridSize - 1) * CELL / 2;
    return [gx * CELL - offset, gy * CELL - offset];
  }
  worldToGrid(wx: number, wz: number): [number, number] {
    if (!this.level) return [0, 0];
    const offset = (this.level.gridSize - 1) * CELL / 2;
    return [Math.round((wx + offset) / CELL), Math.round((wz + offset) / CELL)];
  }

  // --- Placeholder for full logic (needs to be completely filled in from the original file) ---
  // In a real implementation, I'd port all the `makeLever`, `generateGrid`, etc. methods here.
  // I will implement them now for completeness.

  generateGrid(size: number, openness: number): number[][] {
    if (size % 2 === 0) size++;
    const g = Array.from({ length: size }, () => Array(size).fill(1));
    const stack: [number, number][] = [[1, 1]];
    g[1][1] = 0;
    while (stack.length) {
      const [x, y] = stack[stack.length - 1];
      const dirs: [number, number][] = [[0, 2], [0, -2], [2, 0], [-2, 0]].sort(() => Math.random() - 0.5) as [number, number][];
      let carved = false;
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (nx > 0 && nx < size - 1 && ny > 0 && ny < size - 1 && g[ny][nx] === 1) {
          g[y + dy / 2][x + dx / 2] = 0;
          g[ny][nx] = 0;
          stack.push([nx, ny]);
          carved = true;
          break;
        }
      }
      if (!carved) stack.pop();
    }
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        if (g[y][x] === 1 && Math.random() < openness) g[y][x] = 0;
      }
    }
    return g;
  }

  buildLevel(idx: number) {
    if (this.level) {
      for (const o of this.level.objects) this.scene.remove(o);
      // F-7.3 Disposal
      this.level.objects.forEach(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      });
    }

    const cfg = LEVELS[idx];
    const grid = this.generateGrid(cfg.grid, cfg.openness);
    const size = grid.length;
    const objects: THREE.Object3D[] = [];

    this.level = {
      grid,
      gridSize: size,
      walls: [],
      levers: [],
      hidingSpots: [],
      drawers: [],
      vents: [],
      exitDoor: null as any,
      lights: [],
      objects,
      playerStart: [1, 1],
      monsterStart: [size - 2, size - 2],
      exitCell: [size - 2, size - 2]
    };

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x363330, roughness: 0.95, metalness: 0.05 });
    const wallMatRust = new THREE.MeshStandardMaterial({ color: 0x4a2a1a, roughness: 0.9, metalness: 0.1 });
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 1.0, metalness: 0.0 });
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0x0c0a08, roughness: 1.0 });

    const span = size * CELL;
    const floorGeo = new THREE.PlaneGeometry(span, span);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor); objects.push(floor);

    const ceil = new THREE.Mesh(floorGeo, ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = WALL_H;
    this.scene.add(ceil); objects.push(ceil);

    const walls: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
    const wallGeo = new THREE.BoxGeometry(CELL, WALL_H, CELL);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (grid[y][x] === 1) {
          const [wx, wz] = this.gridToWorld(x, y);
          const m = new THREE.Mesh(wallGeo, Math.random() < 0.15 ? wallMatRust : wallMat);
          m.position.set(wx, WALL_H / 2, wz);
          this.scene.add(m); objects.push(m);
          walls.push({
            minX: wx - CELL / 2, maxX: wx + CELL / 2,
            minZ: wz - CELL / 2, maxZ: wz + CELL / 2
          });
        }
      }
    }
    this.level.walls = walls;

    const openCells: [number, number][] = [];
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        if (grid[y][x] === 0) openCells.push([x, y]);
      }
    }
    this.shuffle(openCells);

    let playerStart = openCells[0];
    for (const [cx, cy] of openCells) {
      if (cx <= 2 && cy <= 2) { playerStart = [cx, cy]; break; }
    }
    this.level.playerStart = playerStart;

    let exitCell = openCells[openCells.length - 1];
    let bestDist = -1;
    for (const [cx, cy] of openCells) {
      const d = Math.abs(cx - playerStart[0]) + Math.abs(cy - playerStart[1]);
      if (d > bestDist) { bestDist = d; exitCell = [cx, cy]; }
    }
    this.level.exitCell = exitCell;

    const used = new Set([`${playerStart[0]},${playerStart[1]}`, `${exitCell[0]},${exitCell[1]}`]);
    const candidateLevers = openCells.filter(c => !used.has(`${c[0]},${c[1]}`));
    const leverCells = this.pickSpread(candidateLevers, LEVER_COUNT, 4);
    leverCells.forEach(cell => used.add(`${cell[0]},${cell[1]}`));

    const levers: Lever[] = [];
    for (const [cx, cy] of leverCells) {
      const [wx, wz] = this.gridToWorld(cx, cy);
      const lever = this.makeLever(wx, wz);
      this.scene.add(lever.group); objects.push(lever.group);
      levers.push(lever);
    }
    this.level.levers = levers;

    const hidingCandidates = openCells.filter(c => !used.has(`${c[0]},${c[1]}`));
    const hidingCells = this.pickSpread(hidingCandidates, cfg.hidingSpots, 2);
    const hidingSpots: Locker[] = [];
    for (const [cx, cy] of hidingCells) {
      const [wx, wz] = this.gridToWorld(cx, cy);
      const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      let placed = false;
      for (const [dx, dy] of this.shuffle(dirs.slice())) {
        if (cy + dy >= 0 && cy + dy < size && cx + dx >= 0 && cx + dx < size && grid[cy + dy][cx + dx] === 1) {
          const offsetX = dx * (CELL / 2 - 0.4);
          const offsetZ = dy * (CELL / 2 - 0.4);
          const locker = this.makeLocker(wx + offsetX, wz + offsetZ, dx, dy);
          this.scene.add(locker.group); objects.push(locker.group);
          hidingSpots.push(locker);
          placed = true;
          break;
        }
      }
    }
    this.level.hidingSpots = hidingSpots;

    const drawerCandidates = openCells.filter(c => !used.has(`${c[0]},${c[1]}`));
    const drawerCells = this.pickSpread(drawerCandidates, DRAWER_COUNT, 2.5);
    const drawers: Drawer[] = [];
    
    // Create a pool of items to distribute (7 keys, 5 potions for 12 drawers)
    const itemPool = this.shuffle([...Array(7).fill('key'), ...Array(5).fill('potion')]);

    for (let i = 0; i < drawerCells.length; i++) {
        const [cx, cy] = drawerCells[i];
      const [wx, wz] = this.gridToWorld(cx, cy);
      const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dy] of this.shuffle(dirs.slice())) {
        if (cy + dy >= 0 && cy + dy < size && cx + dx >= 0 && cx + dx < size && grid[cy + dy][cx + dx] === 1) {
          const offsetX = dx * (CELL / 2 - 0.3);
          const offsetZ = dy * (CELL / 2 - 0.3);
          const drawer = this.makeDrawer(wx + offsetX, wz + offsetZ, dx, dy);
          this.scene.add(drawer.group); objects.push(drawer.group);
          
          // Distribute items from pool
          const item = itemPool[i];
          if (item === 'key') drawer.hasKey = true;
          if (item === 'potion') drawer.hasPotion = true;
          
          drawers.push(drawer);
          break;
        }
      }
    }
    this.level.drawers = drawers;

    const vents: Vent[] = [];
    const ventCandidates: [number, number, number, number][] = [];
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        if (grid[y][x] === 1) {
          if (x > 0 && x < size - 1 && grid[y][x - 1] === 0 && grid[y][x + 1] === 0) ventCandidates.push([x, y, 1, 0]);
          if (y > 0 && y < size - 1 && grid[y - 1][x] === 0 && grid[y + 1][x] === 0) ventCandidates.push([x, y, 0, 1]);
        }
      }
    }
    const selectedVents = this.shuffle(ventCandidates).slice(0, 4);
    for (let i = 0; i < selectedVents.length; i++) {
      const [vx, vy, vdx, vdy] = selectedVents[i];
      const [wx, wz] = this.gridToWorld(vx, vy);
      const [ax, az] = this.gridToWorld(vx - vdx, vy - vdy);
      const [bx, bz] = this.gridToWorld(vx + vdx, vy + vdy);
      const locked = i < 2; // Locked for the first two pairs
      const ventA = this.makeVent(wx - vdx * 0.45, wz - vdy * 0.45, -vdx, -vdy, [vx, vy], new THREE.Vector3(bx, PLAYER_H, bz), [vx + vdx, vy + vdy], locked);
      const ventB = this.makeVent(wx + vdx * 0.45, wz + vdy * 0.45, vdx, vdy, [vx, vy], new THREE.Vector3(ax, PLAYER_H, az), [vx - vdx, vy - vdy], locked);
      this.scene.add(ventA.group, ventB.group);
      objects.push(ventA.group, ventB.group);
      vents.push(ventA, ventB);
    }
    this.level.vents = vents;

    const [exWx, exWz] = this.gridToWorld(exitCell[0], exitCell[1]);
    const exitDoor = this.makeExitDoor(exWx, exWz);
    this.scene.add(exitDoor.group); objects.push(exitDoor.group);

    const exitLight = new THREE.PointLight(0x00ff44, 0, 8, 2);
    exitLight.position.set(exWx, 2.5, exWz);
    this.scene.add(exitLight); objects.push(exitLight);

    this.level.exitDoor = { ...exitDoor, light: exitLight } as any;

    const lights: any[] = [];
    const lightCells = this.pickSpread(openCells, Math.floor(openCells.length / 6), 2);
    for (const [cx, cy] of lightCells) {
      const [wx, wz] = this.gridToWorld(cx, cy);
      const lightColor = Math.random() < 0.7 ? 0xfff0c0 : 0xffd0a0;
      const pl = new THREE.PointLight(lightColor, 1.0, 12, 2);
      pl.position.set(wx, WALL_H - 0.3, wz);
      this.scene.add(pl); objects.push(pl);
      const fix = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), new THREE.MeshBasicMaterial({ color: lightColor }));
      fix.position.copy(pl.position);
      this.scene.add(fix); objects.push(fix);
      lights.push({ light: pl, fixture: fix, baseIntensity: 1.0, flickerPhase: Math.random() * 100, flickerRate: 0.3 + Math.random() * 0.7 });
    }
    this.level.lights = lights;

    let monsterStart = openCells[Math.floor(openCells.length / 2)];
    let bestMD = -1;
    for (const [cx, cy] of openCells) {
      const d = Math.abs(cx - playerStart[0]) + Math.abs(cy - playerStart[1]);
      if (d > bestMD && d < bestDist) { bestMD = d; monsterStart = [cx, cy]; }
    }
    this.level.monsterStart = monsterStart;

    const [px, pz] = this.gridToWorld(playerStart[0], playerStart[1]);
    this.player.position.set(px, PLAYER_H, pz);
    this.player.velocity.set(0, 0, 0);
    this.player.yaw = 0; this.player.pitch = 0;

    const [mx, mz] = this.gridToWorld(monsterStart[0], monsterStart[1]);
    this.monster.group.position.set(mx, 0, mz);
    this.monster.group.rotation.y = 0;
    this.monster.targetCell = null;
    this.monster.path = [];
    this.monster.state = 'patrol';
    this.monster.alertTimer = 0;
    this.monster.suspicion = 0;
    this.monster.lastSeenPlayer = null;
    this.monster.config = cfg;
    this.rebuildMonsterMeshes(PALETTES[idx]);
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  pickSpread(cells: [number, number][], n: number, minDist: number): [number, number][] {
    const result: [number, number][] = [];
    const pool = cells.slice();
    this.shuffle(pool);
    for (const c of pool) {
      if (result.length >= n) break;
      let ok = true;
      for (const r of result) {
        if (Math.abs(r[0] - c[0]) + Math.abs(r[1] - c[1]) < minDist) { ok = false; break; }
      }
      if (ok) result.push(c);
    }
    return result;
  }

  makeLever(x: number, z: number): Lever {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    // Mechanical Base
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.8, roughness: 0.2 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.5), baseMat);
    group.add(base);

    const housingMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.9, roughness: 0.1 });
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.3), housingMat);
    housing.position.y = 0.3;
    group.add(housing);

    // Lever Arm
    const armMat = new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 1, roughness: 0.1 });
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 8), armMat);
    stick.position.y = 0.6;
    stick.rotation.x = -Math.PI / 4;
    group.add(stick);

    const knobMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, emissive: 0x440000 });
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), knobMat);
    knob.position.set(0, 1.0, -0.4);
    group.add(knob);

    // Indicator Light
    const lightGeo = new THREE.SphereGeometry(0.06, 8, 8);
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 2 });
    const indicator = new THREE.Mesh(lightGeo, lightMat);
    indicator.position.set(0, 0.5, 0.18);
    group.add(indicator);

    const pointLight = new THREE.PointLight(0xff0000, 0.8, 4);
    pointLight.position.copy(indicator.position);
    group.add(pointLight);

    const indMatOff = lightMat;
    const indMatOn = new THREE.MeshStandardMaterial({ color: 0x00ff44, emissive: 0x00ff44, emissiveIntensity: 2 });

    return {
      group, arm: stick, knob, indicator, indMatOff, indMatOn, light: pointLight,
      pos: new THREE.Vector3(x, 0, z),
      activated: false,
      activate: function() {
        if (this.activated) return false;
        this.activated = true;
        stick.rotation.x = Math.PI / 4;
        knob.position.set(0, 1.0, 0.4);
        knobMat.color.set(0x00cc00);
        knobMat.emissive.set(0x004400);
        this.indicator.material = this.indMatOn;
        this.light.color.set(0x00ff44);
        return true;
      }
    };
  }

  makeLocker(x: number, z: number, faceDx: number, faceDz: number): Locker {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    let rotY = 0;
    if (faceDx === 1) rotY = -Math.PI / 2;
    else if (faceDx === -1) rotY = Math.PI / 2;
    else if (faceDz === 1) rotY = Math.PI;
    else if (faceDz === -1) rotY = 0;
    group.rotation.y = rotY;
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a3540, roughness: 0.7, metalness: 0.7 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.0, 0.6), bodyMat);
    body.position.y = 1.0; group.add(body);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.95, 0.05), new THREE.MeshStandardMaterial({ color: 0x202830, roughness: 0.8, metalness: 0.6 }));
    door.position.set(0, 1.0, 0.32); group.add(door);
    const facing = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    return {
      group, door, body, pos: new THREE.Vector3(x, 1, z), facing,
      interactPos: new THREE.Vector3(x + facing.x * 1.0, PLAYER_H, z + facing.z * 1.0),
      insidePos: new THREE.Vector3(x - facing.x * 0.05, PLAYER_H * 0.85, z - facing.z * 0.05)
    };
  }

  makeDrawer(x: number, z: number, faceDx: number, faceDz: number): Drawer {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    let rotY = 0;
    if (faceDx === 1) rotY = -Math.PI / 2;
    else if (faceDx === -1) rotY = Math.PI / 2;
    else if (faceDz === 1) rotY = Math.PI;
    else if (faceDz === -1) rotY = 0;
    group.rotation.y = rotY;

    // Outer case
    const caseMat = new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.9 });
    const caseGeo = new THREE.BoxGeometry(0.82, 0.92, 0.52);
    const body = new THREE.Mesh(caseGeo, caseMat);
    body.position.y = 0.46;
    group.add(body);

    // Inner drawer (the part that moves)
    const innerGroup = new THREE.Group();
    innerGroup.position.y = 0.45;
    group.add(innerGroup);

    const innerMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.8 });
    const innerBody = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.4, 0.45), innerMat);
    innerGroup.add(innerBody);

    const frontPanel = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.45, 0.05), innerMat);
    frontPanel.position.set(0, 0, 0.25);
    innerGroup.add(frontPanel);

    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0xaa8844, metalness: 0.9, roughness: 0.1 }));
    handle.rotation.z = Math.PI / 2;
    handle.position.set(0, 0, 0.28);
    innerGroup.add(handle);

    const facing = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    return {
      group, handle, body, inner: innerGroup,
      pos: new THREE.Vector3(x, 0.45, z), facing,
      interactPos: new THREE.Vector3(x + facing.x * 0.8, PLAYER_H, z + facing.z * 0.8),
      searched: false, hasKey: false, hasPotion: false, openProgress: 0
    };
  }

  makeVent(x: number, z: number, dx: number, dz: number, gridPos: [number, number], destination: THREE.Vector3, destGridPos: [number, number], locked: boolean): Vent {
    const group = new THREE.Group();
    group.position.set(x, 0.3, z);
    let rotY = 0;
    if (dx === 1) rotY = -Math.PI / 2;
    else if (dx === -1) rotY = Math.PI / 2;
    else if (dz === 1) rotY = Math.PI;
    else if (dz === -1) rotY = 0;
    group.rotation.y = rotY;

    // Vent Frame
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.2 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.05), frameMat);
    group.add(frame);

    // Vent Grille
    const grilleMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9 });
    for (let i = -2; i <= 2; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 0.02), grilleMat);
      bar.position.y = i * 0.1;
      bar.position.z = 0.02;
      group.add(bar);
    }

    if (locked) {
        const chainGeo = new THREE.TorusGeometry(0.08, 0.02, 8, 12);
        const chainMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.9 });
        const chain = new THREE.Mesh(chainGeo, chainMat);
        chain.position.z = 0.05;
        group.add(chain);

        const lockGeo = new THREE.BoxGeometry(0.12, 0.15, 0.06);
        const lockMat = new THREE.MeshStandardMaterial({ color: 0xaa2222, emissive: 0x220000 });
        const lockMesh = new THREE.Mesh(lockGeo, lockMat);
        lockMesh.position.set(0, -0.1, 0.07);
        group.add(lockMesh);
    }

    const facing = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);

    return {
      group, pos: new THREE.Vector3(x, 0.3, z), gridPos, facing, destination, destGridPos, locked
    };
  }

  makeExitDoor(x: number, z: number): ExitDoor {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.4, 0.3), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7, metalness: 0.5 }));
    frame.position.y = 1.7; group.add(frame);
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.0, 3.0, 0.15), new THREE.MeshStandardMaterial({ color: 0x553311, roughness: 0.6, metalness: 0.3, emissive: 0x110800, emissiveIntensity: 0.3 }));
    door.position.y = 1.5; door.position.z = 0.08; group.add(door);
    return { group, door, frame, pos: new THREE.Vector3(x, 1.5, z), open: false, openProgress: 0 };
  }

  rebuildMonsterMeshes(palette: Palette) {
    while (this.monster.group.children.length) this.monster.group.remove(this.monster.group.children[0]);
    const furMatA = new THREE.MeshStandardMaterial({ color: palette.fur, roughness: 0.95, metalness: 0.05 });
    const sceleraMat = new THREE.MeshStandardMaterial({ color: palette.eyeWhite, roughness: 0.25, emissive: palette.eyeWhite, emissiveIntensity: 0.45 });
    const pupilMat = new THREE.MeshBasicMaterial({ color: palette.pupil });
    
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 2.2, 12), furMatA);
    torso.position.y = 1.7; this.monster.group.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.46, 18, 14), furMatA);
    head.position.y = 3.05; this.monster.group.add(head);
    
    const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), sceleraMat);
    leftEye.position.set(-0.20, 3.18, 0.40); this.monster.group.add(leftEye);
    const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), sceleraMat);
    rightEye.position.set(0.20, 3.18, 0.40); this.monster.group.add(rightEye);
    
    const leftPupil = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 10), pupilMat);
    leftPupil.position.set(-0.20, 3.18, 0.53); this.monster.group.add(leftPupil);
    const rightPupil = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 10), pupilMat);
    rightPupil.position.set(0.20, 3.18, 0.53); this.monster.group.add(rightPupil);
    
    const leftEyeLight = new THREE.PointLight(palette.eyeGlow, 0.4, 4, 2);
    leftEyeLight.position.set(-0.20, 3.18, 0.55); this.monster.group.add(leftEyeLight);
    const rightEyeLight = new THREE.PointLight(palette.eyeGlow, 0.4, 4, 2);
    rightEyeLight.position.set(0.20, 3.18, 0.55); this.monster.group.add(rightEyeLight);

    const leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 1.2, 8), furMatA);
    leftLeg.position.set(-0.18, 0.6, 0); this.monster.group.add(leftLeg);
    const rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 1.2, 8), furMatA);
    rightLeg.position.set(0.18, 0.6, 0); this.monster.group.add(rightLeg);
    const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.14, 2.4, 8), furMatA);
    leftArm.position.set(-0.55, 1.5, 0); this.monster.group.add(leftArm);
    const rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.14, 2.4, 8), furMatA);
    rightArm.position.set(0.55, 1.5, 0); this.monster.group.add(rightArm);

    this.monster.torso = torso; this.monster.head = head;
    this.monster.leftLeg = leftLeg; this.monster.rightLeg = rightLeg;
    this.monster.leftArm = leftArm; this.monster.rightArm = rightArm;
    this.monster.rightEyeLight = rightEyeLight;
    this.monster.palette = palette;

    // Add fur [F-7.1/B-008 - improved]
    const furMatAlt = new THREE.MeshStandardMaterial({ color: palette.furAlt, roughness: 0.95, metalness: 0.05 });
    const furMats = [furMatA, furMatA, furMatAlt];
    if (this.monster.torso) this.addFurToCylinder(this.monster.torso, 0.3, 0.4, 2.2, 80, furMats);
    if (this.monster.head) this.addFurToSphere(this.monster.head, 0.46, 100, furMats, true);
    if (this.monster.leftLeg) this.addFurToCylinder(this.monster.leftLeg, 0.13, 0.17, 1.2, 38, furMats);
    if (this.monster.rightLeg) this.addFurToCylinder(this.monster.rightLeg, 0.13, 0.17, 1.2, 38, furMats);
    if (this.monster.leftArm) this.addFurToCylinder(this.monster.leftArm, 0.10, 0.14, 2.4, 55, furMats);
    if (this.monster.rightArm) this.addFurToCylinder(this.monster.rightArm, 0.10, 0.14, 2.4, 55, furMats);
  }

  addFurToCylinder(parent: THREE.Object3D, rTop: number, rBottom: number, height: number, count: number, mats: THREE.Material[]) {
    const upY = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const t = Math.random();
        const r = rBottom + (rTop - rBottom) * t;
        const y = -height / 2 + height * t;
        const x = r * Math.cos(theta);
        const z = r * Math.sin(theta);
        const length = 0.16 + Math.random() * 0.20;
        const mat = mats[Math.floor(Math.random() * mats.length)];
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.045 + Math.random() * 0.025, length, 4), mat);
        cone.position.set(x, y, z);
        const dir = new THREE.Vector3(x, 0, z).normalize();
        const q = new THREE.Quaternion();
        q.setFromUnitVectors(upY, dir);
        cone.quaternion.copy(q);
        cone.position.addScaledVector(dir, length / 2);
        parent.add(cone);
    }
  }

  addFurToSphere(parent: THREE.Object3D, radius: number, count: number, mats: THREE.Material[], skipFace: boolean) {
    const upY = new THREE.Vector3(0, 1, 0);
    let placed = 0, attempts = 0;
    while (placed < count && attempts < count * 5) {
        attempts++;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.cos(phi);
        const z = radius * Math.sin(phi) * Math.sin(theta);
        if (skipFace && z > radius * 0.35 && y < radius * 0.55 && y > -radius * 0.4 && Math.abs(x) < radius * 0.75) continue;
        const length = 0.17 + Math.random() * 0.22;
        const mat = mats[Math.floor(Math.random() * mats.length)];
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.045 + Math.random() * 0.03, length, 4), mat);
        cone.position.set(x, y, z);
        const dir = new THREE.Vector3(x, y, z).normalize();
        const q = new THREE.Quaternion();
        q.setFromUnitVectors(upY, dir);
        cone.quaternion.copy(q);
        cone.position.addScaledVector(dir, length / 2);
        parent.add(cone);
        placed++;
    }
  }

  // --- Events ---
  dyingTimer: number = 0;
  dyingStartYaw: number = 0;
  dyingStartPitch: number = 0;
  dyingStartCamPos: THREE.Vector3 = new THREE.Vector3();

  onCaught() {
    if (this.gameState !== 'playing') return;
    this.gameState = 'dying';
    this.dyingTimer = 0;
    this.dyingStartYaw = this.player.yaw;
    this.dyingStartPitch = this.player.pitch;
    this.dyingStartCamPos.copy(this.camera.position);
    
    // Mute ambient sounds
    if (this.audioCtx) {
        const t = this.audioCtx.currentTime;
        this.droneGain?.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        this.monsterGrowlGain?.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    }
    
    this.playScream();
  }

  onEscaped() {
    this.gameState = 'levelDone';
    if (this.levelIndex >= LEVELS.length - 1) {
      this.gameState = 'win';
    } else {
      this.levelIndex++;
      this.startLevel(this.levelIndex);
    }
  }

  startLevel(idx: number) {
    this.levelIndex = idx;
    this.buildLevel(idx);
    this.leversActivated = 0;
    this.stamina = MAX_STAMINA;
    this.player.isFlashlightOn = true;
    this.player.flashlightBattery = MAX_BATTERY;
    this.isHiding = false; this.hidingLocker = null;
    this.gameState = 'playing';

    // Restore ambient sounds
    if (this.audioCtx) {
        const t = this.audioCtx.currentTime;
        this.droneGain?.gain.exponentialRampToValueAtTime(0.04, t + 1.0);
    }
  }

  setAdminOption(option: 'noclip' | 'invincible', val: boolean) {
    if (option === 'noclip') this.isNoclip = val;
    if (option === 'invincible') this.isInvincible = val;
  }

  // --- Audio ---
  initAudio() {
    if (this.audioCtx) return;
    this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.masterGain = this.audioCtx.createGain();
    this.masterGain.gain.value = 0.25; // Lowered from 0.6
    this.masterGain.connect(this.audioCtx.destination);
    
    // Smooth Drone
    const drone = this.audioCtx.createOscillator();
    this.droneGain = this.audioCtx.createGain();
    const droneFilter = this.audioCtx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 120;
    droneFilter.Q.value = 3;
    
    drone.type = 'triangle'; drone.frequency.value = 45; this.droneGain.gain.value = 0.02;
    drone.connect(droneFilter).connect(this.droneGain).connect(this.masterGain); drone.start();

    // Organic Growl
    const growl = this.audioCtx.createOscillator();
    const growlFM = this.audioCtx.createOscillator();
    const growlFMGain = this.audioCtx.createGain();
    const growlFilter = this.audioCtx.createBiquadFilter();
    
    growl.type = 'sawtooth'; 
    growl.frequency.value = 55; 
    
    growlFM.type = 'sine';
    growlFM.frequency.value = 3; // Lower modulation freq
    growlFMGain.gain.value = 15; // FM Depth
    
    growlFilter.type = 'lowpass';
    growlFilter.frequency.value = 250;
    
    growlFM.connect(growlFMGain).connect(growl.frequency);
    growlFM.start();
    
    this.monsterGrowlGain = this.audioCtx.createGain();
    this.monsterGrowlGain.gain.value = 0;
    growl.connect(growlFilter).connect(this.monsterGrowlGain).connect(this.masterGain); growl.start();
  }

  playClick() { this.playSimpleTone(180, 80, 0.08, 0.25); }
  playLeverActivate() { this.playSimpleTone(120, 60, 0.15, 0.3); }
  playScream() { this.playSimpleTone(800, 80, 0.6, 0.4); }
  playDrinkSound() { this.playSimpleTone(300, 600, 0.3, 0.4); }
  playSimpleTone(f1: number, f2: number, dur: number, vol: number) {
    if (!this.audioCtx || !this.masterGain) return;
    const t = this.audioCtx.currentTime;
    const o = this.audioCtx.createOscillator();
    const g = this.audioCtx.createGain();
    o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur * 2);
    o.connect(g).connect(this.masterGain); o.start(t); o.stop(t + dur * 2);
  }
  playFootstep() {
    let vol = 0.15;
    let cutoff = 400;
    let dur = 0.08;

    if (this.player.isSprinting) {
      vol = 0.35;
      cutoff = 600;
      dur = 0.12;
    } else if (this.player.isCrouching) {
      vol = 0.06;
      cutoff = 200;
      dur = 0.06;
    }

    this.playNoiseBuffer(cutoff, dur, vol);
  }

  playMonsterFootstep() {
    const dist = this.monster.group.position.distanceTo(this.player.position);
    const vol = Math.max(0, 1 - dist / 15) * 0.10;
    if (vol > 0.01) {
      this.playNoiseBuffer(150, 0.15, vol);
    }
  }

  playNoiseBuffer(cutoff: number, duration: number, volume: number) {
    if (!this.audioCtx || !this.masterGain) return;
    const t = this.audioCtx.currentTime;
    const buf = this.audioCtx.createBuffer(1, this.audioCtx.sampleRate * duration, this.audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) * 0.3;
    }
    const src = this.audioCtx.createBufferSource();
    src.buffer = buf;
    const filter = this.audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = this.audioCtx.createGain();
    g.gain.value = volume;
    src.connect(filter).connect(g).connect(this.masterGain);
    src.start(t);
  }

  playDoorOpen() {
    this.playNoiseBuffer(150, 1.2, 0.25);
  }

  updateAudioHUD() {
    if (this.gameState !== 'playing') {
      this.stopHeartbeat();
      return;
    }
    const dist = this.monster.group.position.distanceTo(this.player.position);
    if (dist < 15) {
      this.heartbeatRate = 0.8 + (1 - Math.min(dist, 15) / 15) * 2.2; 
      this.heartbeatVolume = 0.2 + (1 - Math.min(dist, 15) / 15) * 0.4;
      this.startHeartbeat();
    } else {
      this.stopHeartbeat();
    }
  }

  startHeartbeat() {
    if (this.heartbeatTimer) return;
    const beat = () => {
      if (!this.audioCtx || !this.masterGain || this.gameState !== 'playing') {
        this.heartbeatTimer = null;
        return;
      }
      const t = this.audioCtx.currentTime;
      const o = this.audioCtx.createOscillator();
      const g = this.audioCtx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(60, t);
      g.gain.setValueAtTime(this.heartbeatVolume, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      o.connect(g).connect(this.masterGain); o.start(t); o.stop(t + 0.16);
      
      setTimeout(() => {
        if (!this.audioCtx || !this.masterGain || this.gameState !== 'playing') return;
        const t2 = this.audioCtx.currentTime;
        const o2 = this.audioCtx.createOscillator();
        const g2 = this.audioCtx.createGain();
        o2.type = 'sine'; o2.frequency.setValueAtTime(50, t2);
        g2.gain.setValueAtTime(this.heartbeatVolume * 0.8, t2); g2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.12);
        o2.connect(g2).connect(this.masterGain); o2.start(t2); o2.stop(t2 + 0.13);
      }, 150);

      this.heartbeatTimer = setTimeout(beat, 1000 / this.heartbeatRate);
    };
    beat();
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
  updateLights(t: number, dt: number) {
     if (!this.level) return;
     this.level.lights.forEach(l => {
       l.flickerPhase += dt * l.flickerRate;
       let flick = 0.85 + Math.sin(l.flickerPhase * 7) * 0.05;
       if (Math.random() < 0.005) flick *= 0.2;
       l.light.intensity = l.baseIntensity * flick;
     });
     if (this.level.exitDoor.open) {
       if (this.level.exitDoor.openProgress < 1) {
         this.level.exitDoor.openProgress += dt * 0.6;
         this.level.exitDoor.door.rotation.y = -this.level.exitDoor.openProgress * (Math.PI / 2);
         this.level.exitDoor.door.position.x = -this.level.exitDoor.openProgress * 1.0;
       }
       // Pulsing exit light logic
       if (this.level.exitDoor.light) {
         this.level.exitDoor.light.intensity = 1.0 + Math.sin(t * 4) * 0.5;
       }
     }
  }

  lerpAngle(a: number, b: number, t: number) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  updateDying(dt: number) {
    this.dyingTimer += dt;
    const t = Math.min(1, this.dyingTimer / 1.0);
    const ease = t * t * (3 - 2 * t);

    let targetYaw = this.dyingStartYaw;
    let targetPitch = this.dyingStartPitch;
    if (this.monster.head) {
      const headPos = new THREE.Vector3();
      this.monster.head.getWorldPosition(headPos);
      const dx = headPos.x - this.dyingStartCamPos.x;
      const dy = (headPos.y + 0.1) - this.dyingStartCamPos.y;
      const dz = headPos.z - this.dyingStartCamPos.z;
      const horiz = Math.hypot(dx, dz);
      targetYaw = Math.atan2(dx, -dz);
      targetPitch = Math.atan2(dy, horiz);
    }
    const yaw = this.lerpAngle(this.dyingStartYaw, targetYaw, ease);
    const pitch = this.dyingStartPitch + (targetPitch - this.dyingStartPitch) * ease;

    const shake = ease * 0.05;
    const sYaw = (Math.random() - 0.5) * shake;
    const sPitch = (Math.random() - 0.5) * shake;
    this.camera.rotation.set(pitch + sPitch, yaw + sYaw, 0, 'YXZ');

    if (this.monster.head) {
      const hp = new THREE.Vector3();
      this.monster.head.getWorldPosition(hp);
      const pullX = (hp.x - this.dyingStartCamPos.x) * 0.15 * ease;
      const pullZ = (hp.z - this.dyingStartCamPos.z) * 0.15 * ease;
      this.camera.position.x = this.dyingStartCamPos.x + pullX;
      this.camera.position.z = this.dyingStartCamPos.z + pullZ;
    }

    if (t >= 1) {
      this.gameState = 'dead';
    }
  }
}
