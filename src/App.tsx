import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react';
import { GameEngine } from './game/GameEngine';
import { GameState } from './game/types';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, Play, RefreshCw, X, Eye, Zap, Volume2, Maximize, MousePointer2, AlertTriangle, Flame, ChevronDown, Sparkles, Hand } from 'lucide-react';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [gameState, setGameState] = useState<GameState>('menu');
  const [hudData, setHudData] = useState<any>({
    stamina: 5,
    leversActivated: 0,
    levelIndex: 0,
    battery: 100,
  });
  const [isPaused, setIsPaused] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [isMobile, setIsMobile] = useState(false);
  const [joystickVisual, setJoystickVisual] = useState<{ x: number, y: number, dx: number, dy: number, show: boolean }>({
    x: 0,
    y: 0,
    dx: 0,
    dy: 0,
    show: false
  });

  const lookTouchIdRef = useRef<number | null>(null);
  const lastLookPosRef = useRef({ x: 0, y: 0 });
  const joystickTouchIdRef = useRef<number | null>(null);
  const joystickCenterRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(
        window.matchMedia('(pointer: coarse)').matches || 
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      );
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (canvasRef.current && !engineRef.current) {
      engineRef.current = new GameEngine(canvasRef.current, (data) => {
        setHudData(data);
        setGameState(data.gameState);
      });

      const animate = () => {
        if (engineRef.current) {
             // Continue updating if not paused OR if in a non-playing state like 'dying'
             if (!isPaused || engineRef.current.gameState !== 'playing') {
                engineRef.current.update();
             } else {
                // Just render but don't update time-dependent logic if strictly paused
                engineRef.current.renderer.render(engineRef.current.scene, engineRef.current.camera);
             }
        }
        requestAnimationFrame(animate);
      };
      animate();
    }

    const handlePointerLockChange = () => {
      if (isMobile) return;
      const isLocked = document.pointerLockElement === canvasRef.current;
      if (!isLocked && engineRef.current?.gameState === 'playing') {
        setIsPaused(true);
      }
    };

    if (engineRef.current) {
        engineRef.current.setAudioPaused(isPaused);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        if (engineRef.current?.gameState === 'playing') {
          setIsPaused(prev => !prev);
          if (document.pointerLockElement) document.exitPointerLock();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
    };
  }, [isPaused, isMobile]);

  const startGame = () => {
    engineRef.current?.initAudio();
    engineRef.current?.startLevel(0);
    setGameState('playing');
    setIsPaused(false);
    if (!isMobile) canvasRef.current?.requestPointerLock();
  };

  const resumeGame = () => {
    setIsPaused(false);
    if (!isMobile) canvasRef.current?.requestPointerLock();
  };

  const restartLevel = () => {
    engineRef.current?.startLevel(hudData.levelIndex);
    setIsPaused(false);
    if (!isMobile) canvasRef.current?.requestPointerLock();
  };

  const handleCanvasClick = () => {
    if (gameState === 'playing' && !isPaused && !isMobile) {
      canvasRef.current?.requestPointerLock();
    }
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden font-mono text-slate-200 uppercase tracking-wider">
      <canvas 
        ref={canvasRef} 
        onClick={handleCanvasClick}
        className="w-full h-full block cursor-none transition-filter duration-300" 
        style={{
          filter: hudData.deathProgress > 0 
            ? `contrast(1.5) brightness(${0.5 + Math.random() * 0.5}) saturate(0) blur(${hudData.deathProgress * 4}px)` 
            : 'none',
          transform: hudData.deathProgress > 0 
            ? `scale(${1 + hudData.deathProgress * 0.1}) translate(${(Math.random() - 0.5) * 50 * hudData.deathProgress}px, ${(Math.random() - 0.5) * 50 * hudData.deathProgress}px)`
            : 'none'
        }}
      />

      {/* Pause Button for Mobile & Desktop click convenience */}
      {gameState === 'playing' && !isPaused && (
        <button 
          onClick={() => {
            setIsPaused(true);
            if (document.pointerLockElement) document.exitPointerLock();
          }}
          onTouchStart={(e) => {
            e.stopPropagation();
            setIsPaused(true);
            if (document.pointerLockElement) document.exitPointerLock();
          }}
          className="absolute top-6 left-1/2 -translate-x-1/2 z-40 pointer-events-auto px-4 py-1.5 border border-slate-800 bg-black/70 hover:border-red-600 hover:text-red-500 text-[10px] text-slate-400 font-semibold tracking-widest rounded transition-all active:scale-90 flex items-center gap-1.5 animate-pulse"
        >
          <span className="w-1.5 h-1.5 bg-red-600 rounded-full" />
          PAUSE DETECTED
        </button>
      )}

      {/* Mobile Touch Overlay */}
      {isMobile && gameState === 'playing' && !isPaused && (
        <>
          {/* Full screen Drag Lookout Overlay */}
          <div 
            className="absolute inset-0 z-15 touch-none select-none pointer-events-auto"
            onTouchStart={(e) => {
              for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];
                if (touch.clientX < window.innerWidth / 2) {
                  if (joystickTouchIdRef.current === null) {
                    joystickTouchIdRef.current = touch.identifier;
                    joystickCenterRef.current = { x: touch.clientX, y: touch.clientY };
                    setJoystickVisual({ x: touch.clientX, y: touch.clientY, dx: 0, dy: 0, show: true });
                  }
                } else {
                  if (lookTouchIdRef.current === null) {
                    lookTouchIdRef.current = touch.identifier;
                    lastLookPosRef.current = { x: touch.clientX, y: touch.clientY };
                  }
                }
              }
            }}
            onTouchMove={(e) => {
              for (let i = 0; i < e.touches.length; i++) {
                const touch = e.touches[i];
                if (touch.identifier === joystickTouchIdRef.current) {
                  const dx = touch.clientX - joystickCenterRef.current.x;
                  const dy = touch.clientY - joystickCenterRef.current.y;
                  const dist = Math.hypot(dx, dy);
                  const maxRadius = 55;
                  const angle = Math.atan2(dy, dx);
                  const moveX = dist > maxRadius ? Math.cos(angle) * maxRadius : dx;
                  const moveY = dist > maxRadius ? Math.sin(angle) * maxRadius : dy;
                  
                  if (engineRef.current) {
                    engineRef.current.touchMX = moveX / maxRadius;
                    engineRef.current.touchMZ = moveY / maxRadius;
                  }
                  setJoystickVisual(prev => ({ ...prev, dx: moveX, dy: moveY }));
                } else if (touch.identifier === lookTouchIdRef.current) {
                  const dx = touch.clientX - lastLookPosRef.current.x;
                  const dy = touch.clientY - lastLookPosRef.current.y;
                  
                  if (engineRef.current) {
                    engineRef.current.mouseDX += dx * 1.8;
                    engineRef.current.mouseDY += dy * 1.8;
                  }
                  lastLookPosRef.current = { x: touch.clientX, y: touch.clientY };
                }
              }
            }}
            onTouchEnd={(e) => {
              for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];
                if (touch.identifier === joystickTouchIdRef.current) {
                  joystickTouchIdRef.current = null;
                  if (engineRef.current) {
                    engineRef.current.touchMX = 0;
                    engineRef.current.touchMZ = 0;
                  }
                  setJoystickVisual({ x: 0, y: 0, dx: 0, dy: 0, show: false });
                } else if (touch.identifier === lookTouchIdRef.current) {
                  lookTouchIdRef.current = null;
                }
              }
            }}
            onTouchCancel={(e) => {
              for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];
                if (touch.identifier === joystickTouchIdRef.current) {
                  joystickTouchIdRef.current = null;
                  if (engineRef.current) {
                    engineRef.current.touchMX = 0;
                    engineRef.current.touchMZ = 0;
                  }
                  setJoystickVisual({ x: 0, y: 0, dx: 0, dy: 0, show: false });
                } else if (touch.identifier === lookTouchIdRef.current) {
                  lookTouchIdRef.current = null;
                }
              }
            }}
          />

          {/* Visual Joystick Ring */}
          {joystickVisual.show && (
            <div 
              className="fixed pointer-events-none z-50 rounded-full border border-slate-700/60 bg-slate-950/45 backdrop-blur-[2px] flex items-center justify-center shadow-[inset_0_0_8px_rgba(0,0,0,0.8)]"
              style={{
                left: joystickVisual.x - 55,
                top: joystickVisual.y - 55,
                width: 110,
                height: 110,
              }}
            >
              <div 
                className="absolute w-12 h-12 bg-red-650/80 border border-red-500 rounded-full shadow-[0_0_12px_rgba(239,68,68,0.5)] flex items-center justify-center"
                style={{
                  transform: `translate(${joystickVisual.dx}px, ${joystickVisual.dy}px)`
                }}
              >
                <div className="w-3.5 h-3.5 rounded-full bg-slate-200/40" />
              </div>
            </div>
          )}

          {/* Tactical Action Buttons Panel - Bottom Right Area */}
          <div className="absolute right-6 bottom-6 z-35 pointer-events-none flex flex-col items-end gap-4">
            {/* Top row of secondary action buttons */}
            <div className="flex gap-3 pointer-events-auto">
              {/* Flashlight button */}
              <ActionBtn 
                icon={<Zap size={18} className={hudData.isFlashlightOn ? "text-yellow-400 fill-yellow-400" : "text-slate-400"} />}
                onTouchStart={() => {
                  if (engineRef.current) engineRef.current.toggleFlashlight();
                }}
                className={`w-12 h-12 ${hudData.isFlashlightOn ? "bg-yellow-950/40 border-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.3)]" : "bg-black/80 border-slate-800 text-slate-400"}`}
              />

              {/* Use Potion button */}
              <ActionBtn 
                icon={<Sparkles size={18} className="text-cyan-400" />}
                onTouchStart={() => {
                  if (engineRef.current) engineRef.current.usePotion();
                }}
                className={`w-12 h-12 ${hudData.potionsHeld > 0 ? "bg-cyan-950/40 border-cyan-500 text-cyan-200 shadow-[0_0_8px_rgba(34,211,238,0.3)]" : "bg-black/80 border-slate-900 text-slate-600 opacity-40 hover:opacity-100"}`}
              />
            </div>

            {/* Main Row: Sprint, Crouch, Interact */}
            <div className="flex items-center gap-3 pointer-events-auto">
              {/* Crouch button */}
              <ActionBtn 
                icon={<ChevronDown size={18} className="text-slate-300" />}
                onTouchStart={() => {
                  if (engineRef.current) engineRef.current.keys['ControlLeft'] = true;
                }}
                onTouchEnd={() => {
                  if (engineRef.current) engineRef.current.keys['ControlLeft'] = false;
                }}
                className={`w-12 h-12 ${engineRef.current?.keys['ControlLeft'] ? "bg-slate-800/80 border-slate-400 border-2" : "bg-black/80 border-slate-800"} text-slate-300`}
              />

              {/* Sprint button */}
              <ActionBtn 
                icon={<Flame size={18} className="text-orange-450" />}
                onTouchStart={() => {
                  if (engineRef.current) engineRef.current.keys['ShiftLeft'] = true;
                }}
                onTouchEnd={() => {
                  if (engineRef.current) engineRef.current.keys['ShiftLeft'] = false;
                }}
                className={`w-12 h-12 ${engineRef.current?.keys['ShiftLeft'] ? "bg-orange-850 border-orange-405 border-2" : "bg-black/80 border-slate-900"} ${hudData.stamina > 0 ? "text-orange-200" : "text-slate-600 opacity-45"}`}
              />

              {/* INTERACT Button - Larger */}
              <ActionBtn 
                icon={<Hand size={22} className="text-red-400" />}
                onTouchStart={() => {
                  if (engineRef.current) engineRef.current.tryInteract();
                }}
                className="w-15 h-15 bg-red-950/40 border border-red-500 rounded-full flex items-center justify-center animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.3)]"
              />
            </div>
          </div>
        </>
      )}

      {/* Death Effects Overlay */}
      <AnimatePresence>
        {hudData.deathProgress > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 pointer-events-none mix-blend-overlay overflow-hidden"
          >
            {/* Chromatic Aberration Simulation */}
            <div 
              className="absolute inset-0 bg-red-500/20 mix-blend-screen"
              style={{ transform: `translate(${hudData.deathProgress * 20}px, 0)` }}
            />
            <div 
              className="absolute inset-0 bg-blue-500/20 mix-blend-screen"
              style={{ transform: `translate(${-hudData.deathProgress * 20}px, 0)` }}
            />
            
            {/* Static/Noise */}
            <div 
              className="absolute inset-0 opacity-[0.15]"
              style={{ 
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                transform: `scale(${1.2 + Math.random() * 0.1})`,
                filter: `brightness(${Math.random() > 0.5 ? 1.5 : 0.5})`
              }}
            />

            {/* Red vignette */}
            <div 
              className="absolute inset-0 bg-radial-[at_center] from-transparent via-red-950/20 to-red-950/80" 
              style={{ opacity: hudData.deathProgress }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Crosshair */}
      {gameState === 'playing' && !isPaused && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10">
          <div className="w-1 h-1 bg-white/60 rounded-full shadow-[0_0_4px_rgba(0,0,0,0.8)]" />
        </div>
      )}

      {/* HUD */}
      {gameState === 'playing' && (
        <div className="absolute inset-0 pointer-events-none p-8 flex flex-col justify-between z-20">
          <div className="flex justify-between items-start">
                <div className="space-y-2">
              <div className="text-red-500 font-bold text-sm">
                {hudData.leversActivated >= 6 && hudData.keysHeld >= 5 ? 'OBJECTIVE: REACH THE EXIT' : 'OBJECTIVES:'}
              </div>
              <div className={`text-xl ${hudData.leversActivated >= 6 ? 'text-green-400' : 'text-yellow-400'}`}>
                LEVERS: {hudData.leversActivated} / 6
              </div>
              <div className={`text-xl ${hudData.keysHeld >= 5 ? 'text-green-400' : 'text-yellow-400'}`}>
                KEYS: {hudData.keysHeld} / 5
              </div>
              <div className="text-xs text-slate-500">FLOOR {hudData.levelIndex + 1}</div>
            </div>

            <div className="flex flex-col items-end gap-4">
                {/* Minimap */}
                {hudData.grid && (
                    <div className="w-24 h-24 bg-slate-900/90 border border-slate-600 p-1 flex items-center justify-center">
                        <div 
                            className="bg-slate-800 grid"
                            style={{ 
                                gridTemplateColumns: `repeat(${hudData.gridSize}, 1fr)`,
                                width: '100%',
                                height: '100%'
                            }}
                        >
                            {hudData.grid.map((row: number[], y: number) => (
                                row.map((cell: number, x: number) => {
                                    const isPlayer = hudData.playerPos[0] === x && hudData.playerPos[1] === y;
                                    const isMonster = hudData.monsterPos && hudData.monsterPos[0] === x && hudData.monsterPos[1] === y;
                                    const isDrawer = hudData.drawers?.find((d: any) => d.grid[0] === x && d.grid[1] === y && !d.searched);
                                    const isVent = hudData.vents?.find((v: any) => v.grid[0] === x && v.grid[1] === y);
                                    const isExit = hudData.exitPos && hudData.exitPos[0] === x && hudData.exitPos[1] === y;
                                    return (
                                        <div 
                                            key={`${x}-${y}`}
                                            className={`
                                                relative
                                                ${cell === 1 ? 'bg-slate-500' : 'bg-transparent'}
                                                ${isPlayer ? 'bg-blue-600/40 z-10' : ''}
                                                ${isMonster ? 'bg-red-500/60 z-10 scale-110' : ''}
                                                ${isExit ? (hudData.isExitOpen ? 'bg-green-500/60 z-10 animate-pulse' : 'bg-red-900/60 z-10') : ''}
                                                ${isVent ? (isVent.locked ? 'bg-red-500/30' : 'bg-cyan-900/40') : ''}
                                            `}
                                        >
                                            {isPlayer && (
                                                <div 
                                                    className="absolute inset-0 flex items-center justify-center translate-y-[-1px]"
                                                    style={{ transform: `rotate(${-hudData.playerYaw}rad)` }}
                                                >
                                                    <div className="w-0 h-0 border-l-[3px] border-r-[3px] border-b-[5px] border-l-transparent border-r-transparent border-b-blue-400" />
                                                </div>
                                            )}
                                            {isMonster && (
                                                <div className="absolute inset-x-0.5 inset-y-0.5 bg-red-600 animate-ping opacity-75 rounded-full" />
                                            )}
                                            {isDrawer && (
                                                <div className="absolute inset-x-0.5 inset-y-0.5 bg-yellow-900/60 rounded-full" />
                                            )}
                                            {isVent && (
                                                <div className={`absolute inset-x-0.5 inset-y-0.5 border-2 ${isVent.locked ? 'border-red-500 animate-pulse' : 'border-cyan-400 animate-pulse'} rounded-sm`} />
                                            )}
                                        </div>
                                    );
                                })
                            ))}
                        </div>
                    </div>
                )}

                {/* Monster Warning */}
                <AnimatePresence>
                {hudData.monsterDist < 15 && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="flex flex-col items-end"
                    >
                        <div className="w-8 h-8 relative mb-2">
                            <motion.div 
                                animate={{ scale: [1, 1.2, 1] }}
                                transition={{ repeat: Infinity, duration: hudData.monsterDist < 6 ? 0.3 : 0.8 }}
                                className="absolute inset-0 bg-red-600 rounded-full blur-md opacity-50"
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <AlertTriangle className="text-white w-4 h-4" />
                            </div>
                        </div>
                        {hudData.monsterState === 'chase' && (
                            <div className="text-red-600 font-black text-xs animate-pulse text-right">STALKER AGGRO</div>
                        )}
                        {hudData.monsterState === 'investigate' && (
                            <div className="text-yellow-600 font-bold text-[10px] text-right">STALKER SEARCHING</div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
          </div>
        </div>

        {/* Admin Menu [F-ADMIN] */}
        {hudData.isAdminMode && hudData.showAdminMenu && (
        <div className="absolute top-1/2 left-8 -translate-y-1/2 bg-black/80 border border-red-900/50 p-4 w-48 space-y-4 pointer-events-auto z-50 font-mono">
            <div className="text-red-500 text-xs font-bold border-b border-red-900/30 pb-1 flex items-center gap-2">
                <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse" />
                SYSTEM OVERRIDE
            </div>
            <div className="space-y-3">
                <button 
                    onClick={() => engineRef.current?.setAdminOption('noclip', !hudData.isNoclip)}
                    className={`w-full py-1 text-[10px] border flex justify-between px-2 ${hudData.isNoclip ? 'bg-red-900/40 border-red-500 text-red-200' : 'bg-slate-900/40 border-slate-700 text-slate-400'}`}
                >
                    <span>NOCLIP</span>
                    <span>{hudData.isNoclip ? '[ ON ]' : '[ OFF ]'}</span>
                </button>
                <button 
                    onClick={() => engineRef.current?.setAdminOption('invincible', !hudData.isInvincible)}
                    className={`w-full py-1 text-[10px] border flex justify-between px-2 ${hudData.isInvincible ? 'bg-red-900/40 border-red-500 text-red-200' : 'bg-slate-900/40 border-slate-700 text-slate-400'}`}
                >
                    <span>GOD MODE</span>
                    <span>{hudData.isInvincible ? '[ ON ]' : '[ OFF ]'}</span>
                </button>
            </div>
            <div className="text-[9px] text-slate-500 italic">
                Press CTRL+ALT to hide
            </div>
        </div>
        )}

        <div className="flex flex-col items-center space-y-4">
             {/* Interaction Prompt */}
             <AnimatePresence>
                {hudData.leversActivated >= 6 && hudData.keysHeld >= 5 && hudData.isExitOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="absolute top-32 left-1/2 -translate-x-1/2 bg-green-900/40 border border-green-500/50 px-6 py-3 text-center pointer-events-none"
                    >
                        <div className="text-green-400 font-bold text-lg tracking-[0.2em]">ELEVATOR UNLOCKED</div>
                        <div className="text-green-400/70 text-[10px]">LOCATE THE EXIT AREA ON YOUR MAP</div>
                    </motion.div>
                )}

                {(hudData.nearLever || hudData.nearLocker || hudData.nearDrawer || hudData.nearVent) && !hudData.isHiding && (
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="bg-black/70 border border-slate-600 px-4 py-2 text-sm flex items-center gap-3"
                    >
                        <span className="bg-slate-700 px-2 py-0.5 border border-slate-400">{isMobile ? 'TAP' : 'E'}</span>
                        <span>
                            {hudData.nearLever ? 'ACTIVATE LEVER' : 
                             hudData.nearVent ? (hudData.nearVentLocked ? 'UNLOCK VENT (1 KEY)' : 'SQUEEZE THROUGH VENT') :
                             hudData.nearDrawer ? 'SEARCH DRAWER' : 'HIDE'}
                        </span>
                    </motion.div>
                )}
                {hudData.isHiding && (
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-black/70 border border-slate-600 px-4 py-2 text-sm flex items-center gap-3"
                    >
                        <span className="bg-slate-700 px-2 py-0.5 border border-slate-400">{isMobile ? 'TAP' : 'E'}</span>
                        <span>EXIT LOCKER</span>
                    </motion.div>
                )}
             </AnimatePresence>

            {/* Resources */}
            <div className="flex gap-8 items-end">
                <div className="flex flex-col items-center gap-1">
                    <div className="w-24 h-1.5 bg-black/60 border border-slate-700 overflow-hidden relative">
                         <motion.div 
                            className={`h-full ${hudData.speedBoostTimer > 0 ? 'bg-cyan-400' : 'bg-slate-700'}`}
                            animate={{ width: `${(hudData.potionsHeld / 5) * 100}%` }}
                        />
                        {hudData.speedBoostTimer > 0 && (
                            <motion.div 
                                className="absolute inset-0 bg-cyan-400/20"
                                animate={{ opacity: [0, 1, 0] }}
                                transition={{ repeat: Infinity, duration: 1 }}
                            />
                        )}
                    </div>
                    <span className="text-[10px] text-slate-500">POTIONS (1): {hudData.potionsHeld}</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                    <div className="w-48 h-1.5 bg-black/60 border border-slate-700 overflow-hidden">
                        <motion.div 
                            className={`h-full ${hudData.stamina < 1 ? 'bg-red-500' : 'bg-blue-400'}`}
                            animate={{ width: `${(hudData.stamina / 5) * 100}%` }}
                        />
                    </div>
                    <span className="text-[10px] text-slate-500">STAMINA</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                    <div className="w-32 h-1.5 bg-black/60 border border-slate-700 overflow-hidden flex items-center px-0.5">
                        <motion.div 
                            className="h-2/3 bg-yellow-500"
                            animate={{ width: `${hudData.battery}%` }}
                        />
                    </div>
                    <span className="text-[10px] text-slate-500">FLASHLIGHT (F)</span>
                </div>
            </div>
          </div>
        </div>
      )}

      {/* Hiding Overlays */}
      <AnimatePresence>
        {hudData.isHiding && (
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-15 pointer-events-none"
            >
                <div className="absolute inset-0 bg-black/85" />
                <div className="absolute inset-0 opacity-40 bg-[repeating-linear-gradient(0deg,transparent_0,transparent_18px,#000_18px,#000_22px)]" />
            </motion.div>
        )}
      </AnimatePresence>

      {/* Main Menu */}
      {gameState === 'menu' && (
        <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(ellipse_at_center,#1a0808_0%,#000_70%)] z-50">
          <div className="text-center space-y-8 max-w-2xl px-6">
            <h1 className="text-7xl font-bold text-red-700 tracking-widest animate-pulse shadow-red-900 border-b-2 border-red-900 pb-4">
              FACTORY OF DREAD
            </h1>
            <h2 className="text-xl text-slate-400 tracking-[0.4em]">ESCAPE OR BE TAKEN</h2>
            
            {isMobile ? (
              <div className="grid grid-cols-2 gap-6 text-left py-8 border-y border-slate-800 text-slate-400 text-xs">
                  <div><span className="bg-slate-900 px-1.5 border border-slate-600 mr-2 text-slate-200">JOYSTICK</span> MOVE</div>
                  <div><span className="bg-slate-900 px-1.5 border border-slate-600 mr-2 text-slate-200">DRAG RIGHT</span> LOOK</div>
                  <div><span className="bg-slate-900 px-1.5 border border-slate-600 mr-2 text-slate-200">FLAME BUTTON</span> SPRINT</div>
                  <div><span className="bg-slate-900 px-1.5 border border-slate-600 mr-2 text-slate-200">ARROW BUTTON</span> CROUCH</div>
                  <div><span className="bg-slate-900 px-1.5 border border-slate-600 mr-2 text-slate-200">ZAP BUTTON</span> FLASHLIGHT</div>
                  <div><span className="bg-slate-900 px-1.5 border border-slate-600 mr-2 text-slate-200">HAND BUTTON</span> INTERACT</div>
                  <div><span className="bg-slate-900 px-1.5 border border-slate-600 mr-2 text-slate-200">SPARKLE</span> USE POTION</div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-6 text-left py-8 border-y border-slate-800 text-slate-400 text-xs">
                  <div><span className="bg-slate-900 px-1.5 border border-slate-600 mr-2 text-slate-200">W A S D</span> MOVE</div>
                  <div><span className="bg-slate-900 px-1.5 border border-slate-600 mr-2 text-slate-200">MOUSE</span> LOOK</div>
                  <div><span className="bg-slate-900 px-1.5 border border-slate-600 mr-2 text-slate-200">SHIFT</span> SPRINT</div>
                  <div><span className="bg-slate-900 px-1.5 border border-slate-600 mr-2 text-slate-200">CTRL</span> CROUCH</div>
                  <div><span className="bg-slate-900 px-1.5 border border-slate-600 mr-2 text-slate-200">F</span> FLASHLIGHT</div>
                  <div><span className="bg-slate-900 px-1.5 border border-slate-600 mr-2 text-slate-200">E</span> INTERACT</div>
                  <div><span className="bg-slate-900 px-1.5 border border-slate-600 mr-2 text-slate-200">1</span> USE POTION</div>
              </div>
            )}

            <p className="text-slate-500 text-[10px] leading-relaxed">
                Activate 6 levers AND find 5 keys in drawers to unlock the elevator. 
                Search drawers for speed potions (Press 1 to use). 
                Vents allow shortcuts but some require a Key to open.
                The Stalker is FASTER when he sees you. Stay out of sight.
            </p>

            <button 
                onClick={startGame}
                className="px-12 py-4 border-2 border-red-700 text-red-600 text-xl font-bold hover:bg-red-700 hover:text-black transition-all group relative overflow-hidden"
            >
                <div className="absolute inset-0 bg-red-600 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                <span className="relative z-10">INITIATE DESCENT</span>
            </button>
          </div>
        </div>
      )}

      {/* Pause Menu */}
      <AnimatePresence>
        {isPaused && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-[100]"
          >
            <h2 className="text-4xl text-slate-400 mb-12 flex items-center gap-4">
              <div className="w-1 h-1 bg-red-600 rotate-45" /> PAUSED <div className="w-1 h-1 bg-red-600 rotate-45" />
            </h2>
            <div className="flex flex-col gap-4 w-64">
              <MenuBtn onClick={resumeGame} icon={<Play size={18}/>} label="RESUME" />
              <MenuBtn onClick={restartLevel} icon={<RefreshCw size={18}/>} label="RESTART FLOOR" />
              <MenuBtn onClick={() => setShowSettings(true)} icon={<Settings size={18}/>} label="SETTINGS" />
              <MenuBtn onClick={() => window.location.reload()} icon={<X size={18}/>} label="QUIT TO MENU" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Death Screen */}
      {gameState === 'dead' && (
        <div className="absolute inset-0 bg-black flex flex-col items-center justify-center z-[110]">
           <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center space-y-12"
           >
             <h1 className="text-8xl font-black text-red-950/40 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 select-none">TAKEN</h1>
             <h2 className="text-5xl font-bold text-red-700 tracking-widest relative z-10">YOU WERE CAUGHT</h2>
             <p className="text-slate-500 italic">The shadows claimed another soul.</p>
             <button 
                onClick={restartLevel}
                className="px-12 py-4 border-2 border-slate-700 text-slate-300 hover:border-red-700 hover:text-red-600 transition-colors"
                id="retry-btn"
             >
                RETRY FLOOR {hudData.levelIndex + 1}
             </button>
           </motion.div>
        </div>
      )}

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center z-[120] p-12"
            >
                <div className="w-full max-w-xl space-y-12">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                        <h2 className="text-2xl flex items-center gap-4 text-slate-400">
                             <Settings /> SYSTEM CONFIGURATION
                        </h2>
                        <button onClick={() => setShowSettings(false)} className="hover:text-red-500 transition-colors">
                            <X size={32} />
                        </button>
                    </div>

                    <div className="space-y-8">
                        <SettingItem label="MOUSE SENSITIVITY" icon={<MousePointer2 size={16}/>} value="50%" />
                        <SettingItem label="FIELD OF VIEW" icon={<Eye size={16}/>} value="90" />
                        <SettingItem label="BRIGHTNESS" icon={<Zap size={16}/>} value="1.0" />
                        <SettingItem label="AUDIO VOLUME" icon={<Volume2 size={16}/>} value="80%" />
                        <SettingItem label="DISPLAY MODE" icon={<Maximize size={16}/>} value="FULLSCREEN" />
                    </div>

                    <p className="text-[10px] text-slate-600 leading-relaxed pt-8 border-t border-slate-900">
                        Warning: Modifying system parameters may affect survival probability. 
                        Sensory damping is not recommended for novice operatives.
                    </p>
                </div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuBtn({ onClick, icon, label }: { onClick: () => void, icon: ReactNode, label: string }) {
    return (
        <button 
            onClick={onClick}
            className="flex items-center gap-4 px-6 py-3 border border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-slate-100 hover:border-slate-500 transition-all text-sm group"
        >
            <span className="opacity-40 group-hover:opacity-100 group-hover:text-red-500 transition-all">{icon}</span>
            {label}
        </button>
    )
}

function SettingItem({ label, icon, value }: { label: string, icon: ReactNode, value: string }) {
    return (
        <div className="flex justify-between items-center group">
            <div className="flex items-center gap-4">
                <span className="text-slate-600 group-hover:text-slate-400 transition-colors">{icon}</span>
                <span className="text-sm">{label}</span>
            </div>
            <div className="flex items-center gap-4">
                <span className="text-xs text-red-900/50">◄</span>
                <span className="text-sm min-w-16 text-center text-slate-400">{value}</span>
                <span className="text-xs text-red-900/50">►</span>
            </div>
        </div>
    )
}

function ActionBtn({ 
  icon, 
  onTouchStart, 
  onTouchEnd, 
  className = "" 
}: { 
  icon: ReactNode; 
  onTouchStart: (e: TouchEvent) => void; 
  onTouchEnd?: (e: TouchEvent) => void; 
  className?: string;
}) {
  return (
    <button
      onTouchStart={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onTouchStart(e);
      }}
      onTouchEnd={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (onTouchEnd) onTouchEnd(e);
      }}
      className={`active:scale-95 transition-transform flex items-center justify-center border font-mono select-none rounded-full backdrop-blur-[2px] ${className}`}
    >
      {icon}
    </button>
  );
}
