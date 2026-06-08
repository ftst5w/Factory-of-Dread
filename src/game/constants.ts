import { LevelConfig, Palette } from './types';

export const CELL = 4;
export const WALL_H = 4;
export const PLAYER_H = 1.65;
export const CROUCH_H = 0.9;
export const PLAYER_R = 0.35;
export const WALK_SPEED = 4.0;
export const SPRINT_MULT = 1.7;
export const CROUCH_MULT = 0.5;
export const MAX_STAMINA = 5.0;
export const STAMINA_REGEN = 0.7;
export const STAMINA_DRAIN = 1.0;
export const MOUSE_SENS = 0.0022;
export const MAX_BATTERY = 100;
export const BATTERY_DRAIN_RATE = 2.0; // % per minute
export const LEVER_COUNT = 6;
export const EXIT_KEYS_REQUIRED = 5;
export const DRAWER_COUNT = 12;
export const POTION_SPEED_MULT = 1.6;
export const POTION_DURATION = 15.0; // seconds

export const MONSTER_KILL_DIST = 1.4;
export const ADMIN_FLY_SPEED = 20.0;

export const LEVELS: LevelConfig[] = [
  { name: 'LEVEL 1 — INTAKE',    grid: 13, openness: 0.10, monsterSpeed: 3.2, monsterAccel: 1.2, hidingSpots: 6, sightRange: 22, hearRange: 14, fovDeg: 90 },
  { name: 'LEVEL 2 — CONVEYORS', grid: 17, openness: 0.06, monsterSpeed: 3.8, monsterAccel: 1.6, hidingSpots: 4, sightRange: 28, hearRange: 18, fovDeg: 100 },
  { name: 'LEVEL 3 — THE PIT',   grid: 21, openness: 0.03, monsterSpeed: 4.6, monsterAccel: 2.0, hidingSpots: 2, sightRange: 34, hearRange: 22, fovDeg: 110 }
];

export const PALETTES: Palette[] = [
  { fur: 0x1c2638, furAlt: 0x0d1422, claws: 0x080c14, mouthInner: 0x4a0000, teeth: 0xfff0d8, eyeWhite: 0xf5ecd0, pupil: 0x000000, eyeGlow: 0x4488ff, foot: 0x331515 },
  { fur: 0x2a3520, furAlt: 0x141a0a, claws: 0x0c0c04, mouthInner: 0x301800, teeth: 0xeed8a8, eyeWhite: 0xfff3c0, pupil: 0x000000, eyeGlow: 0x88ff44, foot: 0x442200 },
  { fur: 0x4a1818, furAlt: 0x200505, claws: 0x100303, mouthInner: 0x000000, teeth: 0xddccaa, eyeWhite: 0xff8866, pupil: 0x000000, eyeGlow: 0xff2828, foot: 0x150505 }
];
