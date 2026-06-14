import { useState, useEffect, useRef, useCallback } from 'react';
import { gameMap, Wall, Furniture, GameGenerator, ExitGate, MAP_WIDTH, MAP_HEIGHT } from '../utils/mapData';
import { soundManager } from '../utils/soundManager';

// エンティティ型定義
export interface Entity {
    x: number;
    y: number;
    angle: number;
    radius: number;
    speed: number;
}

export interface Player extends Entity {
    life: number;
    stamina: number;
    isRunning: boolean;
    isHidden: boolean;
    hiddenInFurnitureId: string | null;
    isDead: boolean;
    // 負傷ブースト（Endurance）関連
    enduranceTimer: number; // 0より大きければ一時ダッシュ＆無敵
    hitCooldown: number; // ダメージ無敵時間
}

export interface AIHider extends Entity {
    id: string;
    name: string;
    life: number;
    isHidden: boolean;
    hiddenInFurnitureId: string | null;
    isDead: boolean;
    targetFurnitureId: string | null;
    targetGeneratorId: string | null;
    state: 'patrolling' | 'seeking_spot' | 'repairing' | 'hidden' | 'fleeing' | 'caught';
    speedMultiplier: number;
    repairTimer: number;
}

export type SeekerState = 'patrolling' | 'investigating' | 'chasing' | 'searching';

export interface SeekerAI extends Entity {
    state: SeekerState;
    patrolPath: string[]; // 巡回する発電機や家具のIDリスト
    currentPatrolIndex: number;
    targetX: number;
    targetY: number;
    chaseTarget: 'player' | string | null; // player または AIHider ID
    investigateX: number;
    investigateY: number;
    investigateTimer: number;
    lastSeenX: number; // 目撃記憶 (Last Known Position)
    lastSeenY: number;
    lastSeenTimer: number;
    searchTargetFurnitureId: string | null;
    searchTimer: number;
    growlTimer: number;
    footstepTimer: number;
}

export interface GeneratorState {
    id: string;
    progress: number; // 0 ~ 100
    isCompleted: boolean;
}

export interface SkillCheckState {
    active: boolean;
    progress: number; // 針の角度 (0 ~ 360)
    targetStart: number; // 開始角度 (0 ~ 360)
    targetWidth: number; // 幅 (角度)
    generatorId: string;
}

export type GameMode = 'hider' | 'seeker';
export type GameState = 'menu' | 'hiding_phase' | 'hunting_phase' | 'game_over' | 'victory';
export type Difficulty = 'easy' | 'normal' | 'hard';

// 線分と線分の交差判定
function lineLineIntersection(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
    p4: { x: number; y: number }
): boolean {
    const det = (p2.x - p1.x) * (p4.y - p3.y) - (p4.x - p3.x) * (p2.y - p1.y);
    if (det === 0) return false;
    const lambda = ((p4.y - p3.y) * (p4.x - p1.x) + (p3.x - p4.x) * (p4.y - p1.y)) / det;
    const gamma = ((p1.y - p2.y) * (p4.x - p1.x) + (p2.x - p1.x) * (p4.y - p1.y)) / det;
    return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
}

// 線分と矩形(壁・家具)の交差判定
export function isLineObstructed(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    obstacles: (Wall | Furniture)[]
): boolean {
    for (const obs of obstacles) {
        const top = { p1: { x: obs.x, y: obs.y }, p2: { x: obs.x + obs.width, y: obs.y } };
        const bottom = { p1: { x: obs.x, y: obs.y + obs.height }, p2: { x: obs.x + obs.width, y: obs.y + obs.height } };
        const left = { p1: { x: obs.x, y: obs.y }, p2: { x: obs.x, y: obs.y + obs.height } };
        const right = { p1: { x: obs.x + obs.width, y: obs.y }, p2: { x: obs.x + obs.width, y: obs.y + obs.height } };

        if (
            lineLineIntersection(p1, p2, top.p1, top.p2) ||
            lineLineIntersection(p1, p2, bottom.p1, bottom.p2) ||
            lineLineIntersection(p1, p2, left.p1, left.p2) ||
            lineLineIntersection(p1, p2, right.p1, right.p2)
        ) {
            return true;
        }
    }
    return false;
}

// 円と矩形の衝突解決
function resolveCollision(
    circle: { x: number; y: number; radius: number },
    rect: { x: number; y: number; width: number; height: number }
): { x: number; y: number } | null {
    const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
    const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));

    const distanceX = circle.x - closestX;
    const distanceY = circle.y - closestY;
    const distanceSquared = distanceX * distanceX + distanceY * distanceY;

    if (distanceSquared < circle.radius * circle.radius) {
        const distance = Math.sqrt(distanceSquared);
        const overlap = circle.radius - distance;

        if (distance === 0) {
            return { x: circle.x, y: circle.y - circle.radius };
        }

        return {
            x: circle.x + (distanceX / distance) * overlap,
            y: circle.y + (distanceY / distance) * overlap
        };
    }
    return null;
}

export function useGameLoop() {
    // UIや画面全体の進行度を同期するための最小限のuseState
    const [gameState, setGameState] = useState<GameState>('menu');
    const [gameMode, setGameMode] = useState<GameMode>('hider');
    const [difficulty, setDifficulty] = useState<Difficulty>('normal');
    const [timer, setTimer] = useState<number>(0);
    const [score, setScore] = useState<number>(0);
    const [highScore, setHighScore] = useState<number>(() => {
        return parseInt(localStorage.getItem('hide_quickly_high_score') || '0', 10);
    });
    const [isMuted, setIsMuted] = useState<boolean>(false);

    // HUD用同期ステート
    const [playerLifeState, setPlayerLifeState] = useState<number>(3);
    const [generatorsRemaining, setGeneratorsRemaining] = useState<number>(3);
    const [gatePowerOn, setGatePowerOn] = useState<boolean>(false);

    // 毎フレーム60fpsで変更されるゲーム状態はすべてuseRefで保持 (不要なReact再レンダリングを防止)
    const playerRef = useRef<Player>({
        x: 0,
        y: 0,
        angle: 0,
        radius: 14,
        speed: 3.5,
        life: 3,
        stamina: 100,
        isRunning: false,
        isHidden: false,
        hiddenInFurnitureId: null,
        isDead: false,
        enduranceTimer: 0,
        hitCooldown: 0
    });

    const aiHidersRef = useRef<AIHider[]>([]);
    const seekerAIRef = useRef<SeekerAI>({
        x: 0,
        y: 0,
        angle: 0,
        radius: 17,
        speed: 2.8,
        state: 'patrolling',
        patrolPath: [],
        currentPatrolIndex: 0,
        targetX: 0,
        targetY: 0,
        chaseTarget: null,
        investigateX: 0,
        investigateY: 0,
        investigateTimer: 0,
        lastSeenX: 0,
        lastSeenY: 0,
        lastSeenTimer: 0,
        searchTargetFurnitureId: null,
        searchTimer: 0,
        growlTimer: 0,
        footstepTimer: 0
    });

    const generatorsRef = useRef<GeneratorState[]>([
        { id: 'gen_1', progress: 0, isCompleted: false },
        { id: 'gen_2', progress: 0, isCompleted: false },
        { id: 'gen_3', progress: 0, isCompleted: false }
    ]);

    const exitGateRef = useRef<{ progress: number; isOpen: boolean }>({
        progress: 0,
        isOpen: false
    });

    const skillCheckRef = useRef<SkillCheckState>({
        active: false,
        progress: 0,
        targetStart: 0,
        targetWidth: 0,
        generatorId: ''
    });

    const [interactiveFurniture, setInteractiveFurniture] = useState<Furniture | null>(null);
    const [interactiveGenerator, setInteractiveGenerator] = useState<GameGenerator | null>(null);
    const [interactiveGate, setInteractiveGate] = useState<ExitGate | null>(null);
    const [interactiveHider, setInteractiveHider] = useState<AIHider | null>(null);

    // 入力監視用Ref
    const keysPressed = useRef<{ [key: string]: boolean }>({});
    const joystickVec = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const mousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const requestRef = useRef<number>(0);
    const lastTimeRef = useRef<number>(0);

    const toggleMute = useCallback(() => {
        const nextMute = !isMuted;
        setIsMuted(nextMute);
        soundManager.setMute(nextMute);
    }, [isMuted]);

    useEffect(() => {
        localStorage.setItem('hide_quickly_high_score', highScore.toString());
    }, [highScore]);

    // ゲーム開始
    const startGame = (mode: GameMode, diff: Difficulty) => {
        soundManager.init();
        soundManager.setMute(isMuted);

        setGameMode(mode);
        setDifficulty(diff);
        setGameState('hiding_phase');
        setScore(0);
        setTimer(15); // 準備フェーズは15秒

        // プレイヤー初期化 (3ライフ)
        const spawnPlayer = mode === 'hider' ? gameMap.spawnPoints.playerHider : gameMap.spawnPoints.playerSeeker;
        playerRef.current = {
            x: spawnPlayer.x,
            y: spawnPlayer.y,
            angle: -Math.PI / 2,
            radius: 14,
            speed: 3.5,
            life: 3,
            stamina: 100,
            isRunning: false,
            isHidden: false,
            hiddenInFurnitureId: null,
            isDead: false,
            enduranceTimer: 0,
            hitCooldown: 0
        };
        setPlayerLifeState(3);

        // 発電機・ゲートのリセット
        generatorsRef.current = [
            { id: 'gen_1', progress: 0, isCompleted: false },
            { id: 'gen_2', progress: 0, isCompleted: false },
            { id: 'gen_3', progress: 0, isCompleted: false }
        ];
        setGeneratorsRemaining(3);
        setGatePowerOn(false);
        exitGateRef.current = { progress: 0, isOpen: false };

        skillCheckRef.current = {
            active: false,
            progress: 0,
            targetStart: 0,
            targetWidth: 0,
            generatorId: ''
        };

        // AI Hiderの初期化 (AI生存者)
        const numHiders = mode === 'seeker' ? 3 : 2;
        const availableFurniture = gameMap.furniture.filter(f => f.canHide);
        aiHidersRef.current = Array.from({ length: numHiders }).map((_, i) => {
            const spawn = gameMap.spawnPoints.aiHiders[i % gameMap.spawnPoints.aiHiders.length];
            return {
                id: `ai_hider_${i}`,
                name: `サバイバー ${i + 1}`,
                life: 3,
                x: spawn.x,
                y: spawn.y,
                angle: Math.random() * Math.PI * 2,
                radius: 14,
                speed: 3.3,
                isHidden: false,
                hiddenInFurnitureId: null,
                isDead: false,
                targetFurnitureId: availableFurniture[Math.floor(Math.random() * availableFurniture.length)]?.id || null,
                targetGeneratorId: null,
                state: 'seeking_spot',
                speedMultiplier: 0.85 + Math.random() * 0.3,
                repairTimer: 0
            };
        });

        // シーカー(キラー)AIの速度調整
        let seekerSpeed = 2.7;
        if (diff === 'easy') seekerSpeed = 2.1;
        if (diff === 'hard') seekerSpeed = 3.3;

        // 巡回パスの設定 (発電機と家具を巡回する)
        const patrolPoints = [
            ...generatorsRef.current.map(g => g.id),
            ...gameMap.furniture.filter(f => f.canHide).map(f => f.id)
        ];
        const shuffledPath = [...patrolPoints].sort(() => Math.random() - 0.5);

        seekerAIRef.current = {
            x: gameMap.spawnPoints.aiSeeker.x,
            y: gameMap.spawnPoints.aiSeeker.y,
            angle: -Math.PI / 2,
            radius: 16,
            speed: seekerSpeed,
            state: 'patrolling',
            patrolPath: shuffledPath,
            currentPatrolIndex: 0,
            targetX: gameMap.spawnPoints.aiSeeker.x,
            targetY: gameMap.spawnPoints.aiSeeker.y,
            chaseTarget: null,
            investigateX: 0,
            investigateY: 0,
            investigateTimer: 0,
            lastSeenX: 0,
            lastSeenY: 0,
            lastSeenTimer: 0,
            searchTargetFurnitureId: null,
            searchTimer: 0,
            growlTimer: 0,
            footstepTimer: 0
        };

        lastTimeRef.current = performance.now();
    };

    const returnToMenu = () => {
        setGameState('menu');
        soundManager.stopAmbient();
    };

    // 音源に対するパンとボリュームを計算するヘルパー
    const getSpatialParams = useCallback((sourceX: number, sourceY: number) => {
        const p = playerRef.current;
        const dx = sourceX - p.x;
        const dy = sourceY - p.y;
        const dist = Math.hypot(dx, dy);

        // 左右定位パン (-1:左 ~ 1:右)
        const pan = Math.max(-1, Math.min(1, dx / 250));
        // 距離による減衰 (450pxで完全に聞こえなくなる)
        const volume = Math.max(0, 1 - dist / 450);

        return { pan, volume, dist };
    }, []);

    // インタラクション判定 (隠れる、修理、ゲート開放など)
    const handleInteract = useCallback(() => {
        if (gameState !== 'hiding_phase' && gameState !== 'hunting_phase') return;

        const p = playerRef.current;
        if (gameMode === 'hider') {
            if (p.isHidden) {
                // 隠れるのをやめて出る
                const furn = gameMap.furniture.find(f => f.id === p.hiddenInFurnitureId);
                if (furn) {
                    p.x = furn.x + furn.width / 2;
                    p.y = furn.y + furn.height + 25;
                }
                p.isHidden = false;
                p.hiddenInFurnitureId = null;
                soundManager.playFlashlightClick();
            } else if (interactiveFurniture && interactiveFurniture.canHide) {
                // 家具に隠れる
                p.isHidden = true;
                p.hiddenInFurnitureId = interactiveFurniture.id;
                p.x = interactiveFurniture.x + interactiveFurniture.width / 2;
                p.y = interactiveFurniture.y + interactiveFurniture.height / 2;
                soundManager.playFlashlightClick();
            }
        } else {
            // シーカー（プレイヤー）の攻撃・捜索・破壊アクション
            if (interactiveHider) {
                // サバイバーを攻撃・捕獲
                soundManager.playSpotted();
                aiHidersRef.current = aiHidersRef.current.map(h => {
                    if (h.id === interactiveHider.id) {
                        return { ...h, isDead: true, isHidden: false, state: 'caught' as const };
                    }
                    return h;
                });
                setScore(prev => {
                    const next = prev + 500;
                    if (next > highScore) setHighScore(next);
                    return next;
                });
                setInteractiveHider(null); // 即時クリア
            } else if (interactiveGenerator) {
                // 発電機を破壊 (進行度を20%後退)
                const gen = generatorsRef.current.find(g => g.id === interactiveGenerator.id);
                if (gen && !gen.isCompleted && gen.progress > 0) {
                    gen.progress = Math.max(0, gen.progress - 20);
                    const params = getSpatialParams(interactiveGenerator.x, interactiveGenerator.y);
                    soundManager.playGeneratorExplode(params.pan, params.volume);
                }
            } else if (interactiveFurniture) {
                // 家具の捜索
                soundManager.playFlashlightClick();
                let foundAny = false;
                aiHidersRef.current = aiHidersRef.current.map(h => {
                    if (h.isHidden && h.hiddenInFurnitureId === interactiveFurniture.id) {
                        foundAny = true;
                        soundManager.playSpotted();
                        return { ...h, isHidden: false, isDead: true, state: 'caught' as const };
                    }
                    return h;
                });

                if (foundAny) {
                    setScore(prev => {
                        const next = prev + 500;
                        if (next > highScore) setHighScore(next);
                        return next;
                    });
                }
            }
        }
    }, [gameState, gameMode, interactiveFurniture, interactiveGenerator, interactiveHider, highScore, getSpatialParams]);

    // 修理進行などのキーホールド／タッチホールドアクション（ループ内で毎フレーム処理）
    // スキルチェック入力判定
    const handleSkillCheckInput = useCallback(() => {
        const sc = skillCheckRef.current;
        if (!sc.active) return;

        const currentAngle = sc.progress;
        const start = sc.targetStart;
        const end = sc.targetStart + sc.targetWidth;

        // 成功判定
        const isSuccess = currentAngle >= start && currentAngle <= end;

        if (isSuccess) {
            // 修理進行度ボーナス
            generatorsRef.current = generatorsRef.current.map(gen => {
                if (gen.id === sc.generatorId) {
                    const nextProgress = Math.min(100, gen.progress + 12);
                    if (nextProgress >= 100 && !gen.isCompleted) {
                        // 修理完了
                        const params = getSpatialParams(
                            gameMap.generators.find(g => g.id === gen.id)?.x || 0,
                            gameMap.generators.find(g => g.id === gen.id)?.y || 0
                        );
                        soundManager.playGeneratorComplete(params.pan, params.volume);
                        soundManager.stopGeneratorSound(gen.id);
                        return { ...gen, progress: 100, isCompleted: true };
                    }
                    return { ...gen, progress: nextProgress };
                }
                return gen;
            });
            // 成功サウンド
            soundManager.playFlashlightClick();
        } else {
            // 失敗: 発電機の爆発＆音感知
            generatorsRef.current = generatorsRef.current.map(gen => {
                if (gen.id === sc.generatorId) {
                    return { ...gen, progress: Math.max(0, gen.progress - 8) };
                }
                return gen;
            });

            // 爆発音 (キラーの耳に届く)
            const targetGen = gameMap.generators.find(g => g.id === sc.generatorId);
            if (targetGen) {
                const params = getSpatialParams(targetGen.x, targetGen.y);
                soundManager.playGeneratorExplode(params.pan, params.volume);

                // キラーAIに調査位置を指示 (FSM聴覚感知)
                if (gameMode === 'hider') {
                    const s = seekerAIRef.current;
                    s.state = 'investigating';
                    s.investigateX = targetGen.x + targetGen.width / 2;
                    s.investigateY = targetGen.y + targetGen.height / 2;
                    s.investigateTimer = 180; // 約3秒間そこを調べる
                }
            }
        }

        // スキルチェック終了
        sc.active = false;
    }, [gameMode, getSpatialParams]);

    // イベントリスナー設定
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            keysPressed.current[key] = true;

            if (e.key === ' ') {
                e.preventDefault();
                if (skillCheckRef.current.active) {
                    handleSkillCheckInput();
                } else {
                    handleInteract();
                }
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            keysPressed.current[key] = false;
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [handleInteract, handleSkillCheckInput]);

    // ゲーム内タイマー処理 (1秒毎)
    useEffect(() => {
        if (gameState === 'menu' || gameState === 'game_over' || gameState === 'victory') return;

        const interval = setInterval(() => {
            setTimer(prev => {
                if (prev <= 1) {
                    if (gameState === 'hiding_phase') {
                        setGameState('hunting_phase');
                        soundManager.playSpotted();
                        return 120; // 狩りフェーズは120秒 (2分)
                    } else if (gameState === 'hunting_phase') {
                        // タイムアップ: Hiderなら生き残り勝利、Seekerなら時間切れ敗北
                        if (gameMode === 'hider') {
                            setGameState('victory');
                            setScore(prevScore => {
                                const finalScore = prevScore + 1000 + (difficulty === 'hard' ? 500 : 0);
                                if (finalScore > highScore) setHighScore(finalScore);
                                return finalScore;
                            });
                        } else {
                            setGameState('game_over');
                        }
                        return 0;
                    }
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [gameState, gameMode, difficulty, highScore]);

    // 物理・AI・ゲーム状態更新 (rAF + dt)
    const updatePhysics = useCallback((dt: number) => {
        const p = playerRef.current;
        const s = seekerAIRef.current;

        // 負傷Enduranceタイマー・被撃クールダウンの減算
        if (p.enduranceTimer > 0) {
            p.enduranceTimer = Math.max(0, p.enduranceTimer - dt);
        }
        if (p.hitCooldown > 0) {
            p.hitCooldown = Math.max(0, p.hitCooldown - dt);
        }

        // スキルチェック針の回転
        const sc = skillCheckRef.current;
        if (sc.active) {
            sc.progress += 3.8 * (dt / 16.6) * (difficulty === 'hard' ? 1.3 : difficulty === 'normal' ? 1.0 : 0.85);
            if (sc.progress >= 360) {
                // 1周したら自動的に失敗判定
                sc.active = false;
                generatorsRef.current = generatorsRef.current.map(gen => {
                    if (gen.id === sc.generatorId) {
                        return { ...gen, progress: Math.max(0, gen.progress - 8) };
                    }
                    return gen;
                });
                const targetGen = gameMap.generators.find(g => g.id === sc.generatorId);
                if (targetGen) {
                    const params = getSpatialParams(targetGen.x, targetGen.y);
                    soundManager.playGeneratorExplode(params.pan, params.volume);
                    if (gameMode === 'hider') {
                        s.state = 'investigating';
                        s.investigateX = targetGen.x + targetGen.width / 2;
                        s.investigateY = targetGen.y + targetGen.height / 2;
                        s.investigateTimer = 180;
                    }
                }
            }
        }

        // 1. プレイヤー移動処理
        if (!p.isDead && !p.isHidden) {
            let dx = 0;
            let dy = 0;

            if (keysPressed.current['w'] || keysPressed.current['arrowup']) dy -= 1;
            if (keysPressed.current['s'] || keysPressed.current['arrowdown']) dy += 1;
            if (keysPressed.current['a'] || keysPressed.current['arrowleft']) dx -= 1;
            if (keysPressed.current['d'] || keysPressed.current['arrowright']) dx += 1;

            if (joystickVec.current.x !== 0 || joystickVec.current.y !== 0) {
                dx = joystickVec.current.x;
                dy = joystickVec.current.y;
            }

            const len = Math.sqrt(dx * dx + dy * dy);
            
            // 走り状態 (Shiftキー入力 または ジョイスティック全倒し)
            const isShiftPressed = keysPressed.current['shift'];
            const isJoystickRunning = len > 0.8;
            p.isRunning = (isShiftPressed || isJoystickRunning) && p.stamina > 0 && len > 0.1;

            if (len > 0) {
                // スピード算出 (負傷Enduranceブースト時は速度 5.2 に固定)
                let currentSpeed = p.speed;
                if (p.enduranceTimer > 0) {
                    currentSpeed = 5.2; // 一時的なダッシュ
                } else if (p.isRunning) {
                    currentSpeed = 4.8; // 通常走り
                    p.stamina = Math.max(0, p.stamina - 0.25 * (dt / 16.6)); // スタミナ減少
                } else {
                    p.stamina = Math.min(100, p.stamina + 0.15 * (dt / 16.6)); // スタミナ回復
                }

                const vx = (dx / len) * currentSpeed;
                const vy = (dy / len) * currentSpeed;

                p.x += vx * (dt / 16.6);
                p.y += vy * (dt / 16.6);

                if (joystickVec.current.x !== 0 || joystickVec.current.y !== 0) {
                    p.angle = Math.atan2(vy, vx);
                } else {
                    const mouseDx = mousePos.current.x - p.x;
                    const mouseDy = mousePos.current.y - p.y;
                    p.angle = Math.atan2(mouseDy, mouseDx);
                }

                // 足音の再生＆キラーへの音感知
                if (Math.random() < 0.1) {
                    soundManager.playFootstep();
                    // 走っている間は足音が大きく、キラーの耳に入る (距離 200px 以内)
                    if (p.isRunning && gameMode === 'hider') {
                        const distToKiller = Math.hypot(s.x - p.x, s.y - p.y);
                        if (distToKiller < 200) {
                            s.state = 'investigating';
                            s.investigateX = p.x;
                            s.investigateY = p.y;
                            s.investigateTimer = 120;
                        }
                    }
                }
            } else {
                p.stamina = Math.min(100, p.stamina + 0.25 * (dt / 16.6)); // 静止中スタミナ回復

                if (gameMode === 'seeker') {
                    const mouseDx = mousePos.current.x - p.x;
                    const mouseDy = mousePos.current.y - p.y;
                    p.angle = Math.atan2(mouseDy, mouseDx);
                }
            }

            // 壁/家具との衝突解決
            gameMap.walls.forEach(wall => {
                const resolved = resolveCollision({ x: p.x, y: p.y, radius: p.radius }, wall);
                if (resolved) { p.x = resolved.x; p.y = resolved.y; }
            });
            gameMap.furniture.forEach(furn => {
                const resolved = resolveCollision({ x: p.x, y: p.y, radius: p.radius }, furn);
                if (resolved) { p.x = resolved.x; p.y = resolved.y; }
            });
            gameMap.generators.forEach(gen => {
                const resolved = resolveCollision({ x: p.x, y: p.y, radius: p.radius }, gen);
                if (resolved) { p.x = resolved.x; p.y = resolved.y; }
            });

            // 境界クランプ
            p.x = Math.max(p.radius, Math.min(MAP_WIDTH - p.radius, p.x));
            p.y = Math.max(p.radius, Math.min(MAP_HEIGHT - p.radius, p.y));
        }

        // 2. 近接オブジェクトインタラクションの検出 (家具、発電機、ゲート)
        let closestFurn: Furniture | null = null;
        let minDist = 70;
        for (const furn of gameMap.furniture) {
            const dist = Math.hypot(p.x - (furn.x + furn.width / 2), p.y - (furn.y + furn.height / 2));
            if (dist < minDist) {
                minDist = dist;
                closestFurn = furn;
            }
        }
        setInteractiveFurniture(closestFurn);

        let closestGen: GameGenerator | null = null;
        let minGenDist = 55;
        for (const gen of gameMap.generators) {
            const dist = Math.hypot(p.x - (gen.x + gen.width / 2), p.y - (gen.y + gen.height / 2));
            if (dist < minGenDist) {
                minGenDist = dist;
                closestGen = gen;
            }
        }
        setInteractiveGenerator(closestGen);

        let closestGate: ExitGate | null = null;
        if (gatePowerOn) {
            const gate = gameMap.exitGate;
            const dist = Math.hypot(p.x - (gate.x + gate.width / 2), p.y - (gate.y + gate.height / 2));
            if (dist < 60) { closestGate = gate; }
        }
        setInteractiveGate(closestGate);

        let closestHider: AIHider | null = null;
        if (gameMode === 'seeker') {
            let minHiderDist = 38; // 攻撃・捕獲可能距離
            for (const h of aiHidersRef.current) {
                if (!h.isDead && !h.isHidden) {
                    const dist = Math.hypot(p.x - h.x, p.y - h.y);
                    if (dist < minHiderDist) {
                        minHiderDist = dist;
                        closestHider = h;
                    }
                }
            }
        }
        setInteractiveHider(closestHider);

        // 3. 発電機修理とゲート開閉のアクション処理 (ホールド判定)
        const isActionHeld = keysPressed.current[' '] || joystickVec.current.x !== 0 || joystickVec.current.y !== 0; // タッチ対応
        // PCの「スペース」またはタッチ「アクション」でホールド修理
        const isRepairing = isActionHeld && closestGen && !sc.active && !p.isHidden && gameMode === 'hider';

        if (isRepairing && closestGen) {
            const genId = closestGen.id;
            const gen = generatorsRef.current.find(g => g.id === genId);

            if (gen && !gen.isCompleted) {
                // 修理音ループ開始
                const params = getSpatialParams(closestGen.x, closestGen.y);
                soundManager.startGeneratorSound(genId, params.pan, params.volume);

                // 修理進捗増加
                gen.progress = Math.min(100, gen.progress + 0.12 * (dt / 16.6));

                if (gen.progress >= 100) {
                    gen.isCompleted = true;
                    soundManager.playGeneratorComplete(params.pan, params.volume);
                    soundManager.stopGeneratorSound(genId);

                    // 発電機残り個数の再計算
                    const activeGens = generatorsRef.current.filter(g => g.isCompleted).length;
                    const remaining = Math.max(0, 3 - activeGens);
                    setGeneratorsRemaining(remaining);

                    // 2台以上修理でゲート通電
                    if (activeGens >= 2) {
                        setGatePowerOn(true);
                        soundManager.playGatePowerOn();
                    }
                } else {
                    // 修理中、低確率 (0.5%) でスキルチェック起動
                    if (Math.random() < 0.005) {
                        sc.active = true;
                        sc.progress = 0;
                        sc.generatorId = genId;
                        sc.targetStart = 90 + Math.random() * 180; // ランダムターゲット角度
                        sc.targetWidth = difficulty === 'hard' ? 35 : difficulty === 'normal' ? 50 : 70;
                    }
                }
            }
        } else {
            // 修理をやめたら音を止める
            generatorsRef.current.forEach(g => {
                soundManager.stopGeneratorSound(g.id);
            });
        }

        // ゲート解放アクション
        const isOpeningGate = isActionHeld && closestGate && !p.isHidden && gameMode === 'hider' && gatePowerOn;
        if (isOpeningGate) {
            const g = exitGateRef.current;
            g.progress = Math.min(100, g.progress + 0.3 * (dt / 16.6));
            if (g.progress >= 100 && !g.isOpen) {
                g.isOpen = true;
                soundManager.playGatePowerOn(); // 合図音
            }
        }

        // ゲート脱出による勝利判定
        if (gameMode === 'hider' && exitGateRef.current.isOpen) {
            const gate = gameMap.exitGate;
            const insideGate = p.x >= gate.x && p.x <= (gate.x + gate.width) && p.y >= gate.y;
            if (insideGate) {
                setGameState('victory');
                setScore(prev => {
                    const final = prev + 1500 + p.life * 300 + timer * 10;
                    if (final > highScore) setHighScore(final);
                    return final;
                });
            }
        }

        // 4. AI Hiders (生存者AI) の自律処理 (発電機修理)
        aiHidersRef.current = aiHidersRef.current.map(h => {
            if (h.isDead) return h;

            if (gameState === 'hiding_phase') {
                // 準備フェーズ: 家具に隠れる
                if (h.targetFurnitureId) {
                    const furn = gameMap.furniture.find(f => f.id === h.targetFurnitureId);
                    if (furn) {
                        const tx = furn.x + furn.width / 2;
                        const ty = furn.y + furn.height / 2;
                        const dx = tx - h.x;
                        const dy = ty - h.y;
                        const dist = Math.hypot(dx, dy);

                        if (dist < 12) {
                            return { ...h, x: tx, y: ty, isHidden: true, hiddenInFurnitureId: furn.id, state: 'hidden' as const };
                        } else {
                            const angle = Math.atan2(dy, dx);
                            let nx = h.x + Math.cos(angle) * h.speed * h.speedMultiplier * (dt / 16.6);
                            let ny = h.y + Math.sin(angle) * h.speed * h.speedMultiplier * (dt / 16.6);
                            gameMap.walls.forEach(w => {
                                const resolved = resolveCollision({ x: nx, y: ny, radius: h.radius }, w);
                                if (resolved) { nx = resolved.x; ny = resolved.y; }
                            });
                            return { ...h, x: nx, y: ny, angle };
                        }
                    }
                }
            } else if (gameState === 'hunting_phase') {
                // 狩りフェーズ: キラーAIから逃げる or 発電機を修理する
                const distToKiller = Math.hypot(s.x - h.x, s.y - h.y);

                // キラーが近い場合は逃走
                if (distToKiller < 170 && !h.isHidden) {
                    h.state = 'fleeing';
                    h.targetGeneratorId = null;
                    const angle = Math.atan2(h.y - s.y, h.x - s.x);
                    let nx = h.x + Math.cos(angle) * h.speed * 1.15 * (dt / 16.6);
                    let ny = h.y + Math.sin(angle) * h.speed * 1.15 * (dt / 16.6);

                    gameMap.walls.forEach(w => {
                        const resolved = resolveCollision({ x: nx, y: ny, radius: h.radius }, w);
                        if (resolved) { nx = resolved.x; ny = resolved.y; }
                    });

                    return { ...h, x: nx, y: ny, angle };
                }

                // 発電機の修理活動
                if (!h.targetGeneratorId) {
                    const incompleteGens = generatorsRef.current.filter(g => !g.isCompleted);
                    if (incompleteGens.length > 0) {
                        h.targetGeneratorId = incompleteGens[Math.floor(Math.random() * incompleteGens.length)].id;
                        h.state = 'patrolling';
                    }
                }

                if (h.targetGeneratorId) {
                    const targetGen = gameMap.generators.find(g => g.id === h.targetGeneratorId);
                    const genState = generatorsRef.current.find(g => g.id === h.targetGeneratorId);

                    if (genState && genState.isCompleted) {
                        // 完了していたらリセットして次の発電機へ
                        return { ...h, targetGeneratorId: null, state: 'patrolling' };
                    }

                    if (targetGen && genState) {
                        const tx = targetGen.x + targetGen.width / 2;
                        const ty = targetGen.y + targetGen.height + 15;
                        const dx = tx - h.x;
                        const dy = ty - h.y;
                        const dist = Math.hypot(dx, dy);

                        if (dist < 15) {
                            // 修理中
                            h.state = 'repairing';
                            genState.progress = Math.min(100, genState.progress + 0.05 * (dt / 16.6)); // AI修理速度はゆっくり

                            if (genState.progress >= 100) {
                                genState.isCompleted = true;
                                const activeGens = generatorsRef.current.filter(g => g.isCompleted).length;
                                setGeneratorsRemaining(Math.max(0, 3 - activeGens));
                                if (activeGens >= 2) {
                                    setGatePowerOn(true);
                                }
                            }
                        } else {
                            // 移動
                            const angle = Math.atan2(dy, dx);
                            let nx = h.x + Math.cos(angle) * h.speed * (dt / 16.6);
                            let ny = h.y + Math.sin(angle) * h.speed * (dt / 16.6);
                            gameMap.walls.forEach(w => {
                                const resolved = resolveCollision({ x: nx, y: ny, radius: h.radius }, w);
                                if (resolved) { nx = resolved.x; ny = resolved.y; }
                            });
                            return { ...h, x: nx, y: ny, angle };
                        }
                    }
                }
            }
            return h;
        });

        // 5. AI Seeker (キラーAI) のFSM処理
        if (gameMode === 'hider' && gameState === 'hunting_phase') {
            const distToPlayer = Math.hypot(p.x - s.x, p.y - s.y);

            // 心音 (240px以下で接近警告)
            if (!p.isDead) {
                const distanceFactor = Math.max(0, 1 - distToPlayer / 240);
                soundManager.updateHeartbeat(distanceFactor);
            }

            // 空間音響 (足音とうなり声の定位・音量計算)
            const spatial = getSpatialParams(s.x, s.y);

            // 一定周期でうなり声を発する
            s.growlTimer += dt;
            if (s.growlTimer > 3500) {
                soundManager.playKillerGrowl(spatial.pan, spatial.volume);
                s.growlTimer = 0;
            }

            // 歩行足音
            s.footstepTimer += dt;
            const stepRate = s.state === 'chasing' ? 240 : 420; // 追跡中はピッチが速い
            if (s.footstepTimer > stepRate) {
                soundManager.playFootstep(spatial.pan, spatial.volume);
                s.footstepTimer = 0;
            }

            // キラーFSM状態機械
            const checkPlayerVis = checkVisibility(s, p, gameMap.walls);

            if (s.state === 'patrolling') {
                // 発電機または巡回パスに沿って移動
                if (s.patrolPath.length > 0) {
                    const pointId = s.patrolPath[s.currentPatrolIndex];
                    const targetGen = gameMap.generators.find(g => g.id === pointId);
                    const targetFurn = gameMap.furniture.find(f => f.id === pointId);

                    if (targetGen) {
                        s.targetX = targetGen.x + targetGen.width / 2;
                        s.targetY = targetGen.y + targetGen.height + 25;
                    } else if (targetFurn) {
                        s.targetX = targetFurn.x + targetFurn.width / 2;
                        s.targetY = targetFurn.y + targetFurn.height + 25;
                    }
                }

                const dx = s.targetX - s.x;
                const dy = s.targetY - s.y;
                const dist = Math.hypot(dx, dy);

                if (dist < 20) {
                    // 目標に到着、次の巡回先へ、または家具を捜索
                    const isFurniture = gameMap.furniture.some(f => f.id === s.patrolPath[s.currentPatrolIndex]);
                    if (isFurniture && Math.random() < 0.35) {
                        // 一定確率でその家具を捜索する
                        s.state = 'searching';
                        s.searchTimer = 70;
                        s.searchTargetFurnitureId = s.patrolPath[s.currentPatrolIndex];
                    } else {
                        s.currentPatrolIndex = (s.currentPatrolIndex + 1) % s.patrolPath.length;
                    }
                } else {
                    s.angle = Math.atan2(dy, dx);
                    s.x += Math.cos(s.angle) * s.speed * (dt / 16.6);
                    s.y += Math.sin(s.angle) * s.speed * (dt / 16.6);
                }

                // 追跡遷移 (視認)
                if (checkPlayerVis && !p.isHidden && !p.isDead) {
                    s.state = 'chasing';
                    s.chaseTarget = 'player';
                    soundManager.playSpotted();
                }
            } else if (s.state === 'investigating') {
                // 音源調査
                const dx = s.investigateX - s.x;
                const dy = s.investigateY - s.y;
                const dist = Math.hypot(dx, dy);

                if (dist < 25) {
                    s.investigateTimer -= dt;
                    // 周りを見回す
                    s.angle = s.angle + Math.sin(s.investigateTimer * 0.05) * 0.05;

                    if (s.investigateTimer <= 0) {
                        s.state = 'patrolling';
                    }
                } else {
                    s.angle = Math.atan2(dy, dx);
                    s.x += Math.cos(s.angle) * s.speed * 1.1 * (dt / 16.6);
                    s.y += Math.sin(s.angle) * s.speed * 1.1 * (dt / 16.6);
                }

                if (checkPlayerVis && !p.isHidden && !p.isDead) {
                    s.state = 'chasing';
                    s.chaseTarget = 'player';
                    soundManager.playSpotted();
                }
            } else if (s.state === 'chasing') {
                // 追跡中 (スピードアップ)
                let tx = p.x;
                let ty = p.y;

                if (p.isHidden) {
                    // 家具に入った場合、その家具の手前へ向かう
                    const furn = gameMap.furniture.find(f => f.id === p.hiddenInFurnitureId);
                    if (furn) {
                        tx = furn.x + furn.width / 2;
                        ty = furn.y + furn.height + 25;
                        const distToFurn = Math.hypot(tx - s.x, ty - s.y);
                        if (distToFurn < 30) {
                            s.state = 'searching';
                            s.searchTimer = 90; // 約1.5秒捜索
                            s.searchTargetFurnitureId = furn.id;
                        }
                    }
                }

                const dx = tx - s.x;
                const dy = ty - s.y;
                const dist = Math.hypot(dx, dy);

                // 攻撃（被撃）判定
                if (dist < (s.radius + p.radius) && !p.isHidden && !p.isDead && p.hitCooldown <= 0) {
                    // ダメージ処理
                    p.life -= 1;
                    setPlayerLifeState(p.life);

                    if (p.life <= 0) {
                        p.isDead = true;
                        soundManager.playSpotted();
                        setGameState('game_over');
                    } else {
                        // 負傷Endurance（5秒ダッシュ ＋ 無敵クールダウン）
                        p.enduranceTimer = 1800; // 1.8秒ダッシュ
                        p.hitCooldown = 3000;    // 3秒無敵
                        soundManager.playSpotted();
                    }
                }

                if (dist > 15) {
                    s.angle = Math.atan2(dy, dx);
                    s.x += Math.cos(s.angle) * s.speed * 1.35 * (dt / 16.6); // 追跡時速度1.35倍
                    s.y += Math.sin(s.angle) * s.speed * 1.35 * (dt / 16.6);
                }

                // 見失い判定 (3秒視界から消えたら記憶位置の家具捜索へ移行)
                if (!checkPlayerVis && !p.isHidden) {
                    s.lastSeenTimer += dt;
                    if (s.lastSeenTimer > 3000) {
                        s.state = 'searching';
                        // 記憶位置に最も近い家具を探す
                        let closestF: Furniture | null = null;
                        let minFDist = 999;
                        gameMap.furniture.forEach(f => {
                            if (f.canHide) {
                                const fdist = Math.hypot(s.lastSeenX - (f.x + f.width/2), s.lastSeenY - (f.y + f.height/2));
                                if (fdist < minFDist) { minFDist = fdist; closestF = f; }
                            }
                        });
                        s.searchTargetFurnitureId = closestF ? (closestF as Furniture).id : null;
                        s.searchTimer = 80;
                        s.lastSeenTimer = 0;
                    }
                } else {
                    s.lastSeenX = p.x;
                    s.lastSeenY = p.y;
                    s.lastSeenTimer = 0;
                }
            } else if (s.state === 'searching') {
                s.searchTimer -= dt;
                s.angle = s.angle + Math.sin(s.searchTimer * 0.05) * 0.05;

                if (s.searchTimer <= 0) {
                    // 家具調べ完了
                    if (p.isHidden && p.hiddenInFurnitureId === s.searchTargetFurnitureId) {
                        p.isDead = true;
                        soundManager.playSpotted();
                        setGameState('game_over');
                    } else {
                        // AIハイダーの捕獲判定
                        aiHidersRef.current = aiHidersRef.current.map(h => {
                            if (h.isHidden && h.hiddenInFurnitureId === s.searchTargetFurnitureId) {
                                soundManager.playSpotted();
                                return { ...h, isHidden: false, isDead: true, state: 'caught' as const };
                            }
                            return h;
                        });

                        s.state = 'patrolling';
                        s.currentPatrolIndex = (s.currentPatrolIndex + 1) % s.patrolPath.length;
                    }
                }
            }

            // キラー壁衝突
            gameMap.walls.forEach(wall => {
                const resolved = resolveCollision({ x: s.x, y: s.y, radius: s.radius }, wall);
                if (resolved) { s.x = resolved.x; s.y = resolved.y; }
            });
        }

        // 6. シーカーモード（自分が殺人鬼）のクリア判定 (全員捕らえたら勝利)
        if (gameMode === 'seeker' && gameState === 'hunting_phase') {
            const allCaught = aiHidersRef.current.every(h => h.isDead);
            if (allCaught && aiHidersRef.current.length > 0) {
                setGameState('victory');
                setScore(prev => {
                    const final = prev + timer * 150;
                    if (final > highScore) setHighScore(final);
                    return final;
                });
            }
        }
    }, [gameState, gameMode, difficulty, highScore, timer, getSpatialParams]);

    // 視認判定
    const checkVisibility = (src: Entity, target: Entity, walls: Wall[]): boolean => {
        const dx = target.x - src.x;
        const dy = target.y - src.y;
        const dist = Math.hypot(dx, dy);

        const maxDist = 240;
        if (dist > maxDist) return false;

        const angleToTarget = Math.atan2(dy, dx);
        let angleDiff = Math.abs(angleToTarget - src.angle);
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        angleDiff = Math.abs(angleDiff);

        const fov = Math.PI / 4.2; // 視野角約85度
        if (angleDiff > fov) return false;

        return !isLineObstructed(src, target, walls);
    };

    // Canvas描画ロジックの統合
    const renderCanvas = useCallback((ctx: CanvasRenderingContext2D) => {
        const p = playerRef.current;
        const s = seekerAIRef.current;

        // 全面クリア (床の色を薄茶色に変更して歩行エリアを分かりやすく)
        ctx.fillStyle = '#282420'; 
        ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

        // 1. 床と部屋の描画
        gameMap.rooms.forEach(room => {
            // 部屋エリアを暗いグレーで差別化
            ctx.fillStyle = 'rgba(20, 20, 20, 0.3)';
            ctx.fillRect(room.x, room.y, room.width, room.height);

            ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
            ctx.font = '12px Courier New';
            ctx.fillText(room.name, room.x + 10, room.y + 20);
        });

        // 2. 発電機の描画
        generatorsRef.current.forEach(genState => {
            const genData = gameMap.generators.find(g => g.id === genState.id);
            if (!genData) return;

            // 本体
            ctx.fillStyle = genState.isCompleted ? '#10b981' : '#4b5563';
            ctx.fillRect(genData.x, genData.y, genData.width, genData.height);
            ctx.strokeStyle = genState.isCompleted ? '#059669' : '#1f2937';
            ctx.lineWidth = 2;
            ctx.strokeRect(genData.x, genData.y, genData.width, genData.height);

            // 発電機のライト（明滅）
            if (genState.isCompleted) {
                ctx.fillStyle = '#10b981';
            } else {
                ctx.fillStyle = Math.sin(Date.now() * 0.008) > 0 ? '#ef4444' : '#1f2937';
            }
            ctx.beginPath();
            ctx.arc(genData.x + genData.width / 2, genData.y + 8, 4, 0, Math.PI * 2);
            ctx.fill();

            // 進捗バー
            if (genState.progress > 0 && !genState.isCompleted) {
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fillRect(genData.x - 5, genData.y - 12, genData.width + 10, 6);
                ctx.fillStyle = '#f59e0b';
                ctx.fillRect(genData.x - 5, genData.y - 12, (genData.width + 10) * (genState.progress / 100), 6);
            }
        });

        // 3. 脱出ゲートの描画
        const gate = gameMap.exitGate;
        ctx.fillStyle = gatePowerOn ? (exitGateRef.current.isOpen ? '#059669' : '#047857') : '#7f1d1d';
        ctx.fillRect(gate.x, gate.y, gate.width, gate.height);

        // ゲートのアウトライン
        ctx.strokeStyle = gatePowerOn ? '#10b981' : '#b91c1c';
        ctx.strokeRect(gate.x, gate.y, gate.width, gate.height);

        // 開口進捗バー
        if (exitGateRef.current.progress > 0 && !exitGateRef.current.isOpen) {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(gate.x, gate.y - 12, gate.width, 6);
            ctx.fillStyle = '#10b981';
            ctx.fillRect(gate.x, gate.y - 12, gate.width * (exitGateRef.current.progress / 100), 6);
        }

        // 4. 家具の描画
        gameMap.furniture.forEach(furn => {
            ctx.fillStyle = furn.color;
            ctx.fillRect(furn.x, furn.y, furn.width, furn.height);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = 1;
            ctx.strokeRect(furn.x, furn.y, furn.width, furn.height);

            if (furn.canHide && gameMode === 'hider') {
                const isClose = interactiveFurniture?.id === furn.id;
                ctx.strokeStyle = isClose ? '#3b82f6' : 'rgba(59, 130, 246, 0.15)';
                ctx.lineWidth = isClose ? 2 : 1;
                ctx.strokeRect(furn.x - 2, furn.y - 2, furn.width + 4, furn.height + 4);
            }
        });

        // 5. 壁の描画 (境界をはっきりさせるため明るいスレートグレーと白の枠線に)
        gameMap.walls.forEach(wall => {
            ctx.fillStyle = '#64748b';
            ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(wall.x, wall.y, wall.width, wall.height);
        });

        // 6. 動的視野（懐中電灯と暗闇）
        const activeSeeker = gameMode === 'seeker' ? p : s;
        if (gameState === 'hunting_phase' || (gameMode === 'seeker' && gameState === 'hiding_phase')) {
            const maskCanvas = document.createElement('canvas');
            maskCanvas.width = MAP_WIDTH;
            maskCanvas.height = MAP_HEIGHT;
            const maskCtx = maskCanvas.getContext('2d');

            if (maskCtx) {
                // 不透明度を0.96から0.72に下げ、懐中電灯外も薄暗い程度にして見やすく
                maskCtx.fillStyle = 'rgba(2, 3, 8, 0.72)'; 
                maskCtx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

                maskCtx.globalCompositeOperation = 'destination-out';

                const drawCone = (sx: number, sy: number, sa: number, range: number, fov: number) => {
                    const grad = maskCtx.createRadialGradient(sx, sy, 10, sx, sy, range);
                    grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
                    grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.85)');
                    grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.3)');
                    grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');

                    maskCtx.fillStyle = grad;
                    maskCtx.beginPath();
                    maskCtx.moveTo(sx, sy);
                    maskCtx.arc(sx, sy, range, sa - fov / 2, sa + fov / 2);
                    maskCtx.closePath();
                    maskCtx.fill();
                };

                // キラーの懐中電灯
                // プレイヤーの負傷Endurance時、キラーが非常に近い場合は懐中電灯がフリッカー（明滅）する
                const isFlickering = gameMode === 'hider' && Math.hypot(p.x - s.x, p.y - s.y) < 130 && Math.sin(Date.now() * 0.06) > 0.4;
                if (!isFlickering) {
                    drawCone(activeSeeker.x, activeSeeker.y, activeSeeker.angle, 250, Math.PI / 3.8);
                }

                // プレイヤーの周囲の極小視野
                if (gameMode === 'hider' && !p.isHidden) {
                    const pGrad = maskCtx.createRadialGradient(p.x, p.y, 5, p.x, p.y, 75);
                    pGrad.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
                    pGrad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
                    maskCtx.fillStyle = pGrad;
                    maskCtx.beginPath();
                    maskCtx.arc(p.x, p.y, 75, 0, Math.PI * 2);
                    maskCtx.fill();
                }

                ctx.drawImage(maskCanvas, 0, 0);
            }
        } else if (gameState === 'hiding_phase' && gameMode === 'hider') {
            ctx.fillStyle = 'rgba(2, 3, 8, 0.4)';
            ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
        }

        // 7. AI Hiders (サバイバーAI)
        aiHidersRef.current.forEach(h => {
            if (h.isDead) return;

            let shouldDraw = false;
            if (gameMode === 'seeker') {
                shouldDraw = checkVisibility(p, h, gameMap.walls);
            } else {
                shouldDraw = true; // 味方は常に見える
            }

            if (shouldDraw && !h.isHidden) {
                ctx.fillStyle = '#10b981';
                ctx.beginPath();
                ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(h.x, h.y);
                ctx.lineTo(h.x + Math.cos(h.angle) * 10, h.y + Math.sin(h.angle) * 10);
                ctx.stroke();

                ctx.fillStyle = '#fff';
                ctx.font = '9px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(h.name, h.x, h.y - h.radius - 5);
            }
        });

        // 8. SeekerAI (キラーAI)
        if (gameMode === 'hider' && gameState === 'hunting_phase') {
            const isVisible = checkVisibility(p, s, gameMap.walls) || (Math.hypot(p.x - s.x, p.y - s.y) < 80);
            if (isVisible) {
                ctx.fillStyle = '#ef4444';
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = 'rgba(239, 68, 68, 0.2)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(s.x, s.y);
                ctx.arc(s.x, s.y, 250, s.angle - Math.PI / 7.6, s.angle + Math.PI / 7.6);
                ctx.closePath();
                ctx.stroke();

                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(s.x, s.y);
                ctx.lineTo(s.x + Math.cos(s.angle) * 13, s.y + Math.sin(s.angle) * 13);
                ctx.stroke();

                ctx.fillStyle = '#ef4444';
                ctx.font = 'bold 10px Courier New';
                ctx.textAlign = 'center';
                ctx.fillText('KILLER', s.x, s.y - s.radius - 6);
            }
        }

        // 9. プレイヤー
        if (!p.isDead) {
            // ダメージ無敵の点滅処理
            const isInvincibleFlashing = p.hitCooldown > 0 && Math.floor(p.hitCooldown / 100) % 2 === 0;

            if (!isInvincibleFlashing) {
                if (p.isHidden) {
                    // 隠れている状態の半透明描画
                    ctx.fillStyle = 'rgba(59, 130, 246, 0.4)';
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                } else {
                    ctx.fillStyle = gameMode === 'hider' ? '#3b82f6' : '#f59e0b';
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                    ctx.fill();

                    if (gameMode === 'seeker') {
                        ctx.strokeStyle = 'rgba(245, 158, 11, 0.2)';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y);
                        ctx.arc(p.x, p.y, 250, p.angle - Math.PI / 7.6, p.angle + Math.PI / 7.6);
                        ctx.closePath();
                        ctx.stroke();
                    }

                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p.x + Math.cos(p.angle) * 11, p.y + Math.sin(p.angle) * 11);
                    ctx.stroke();

                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 10px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText('YOU', p.x, p.y - p.radius - 6);

                    // スタミナバーのCanvas内描画 (Reactステートを使わず描画し、最適化)
                    if (gameMode === 'hider') {
                        const barW = 26;
                        const barH = 3;
                        ctx.fillStyle = 'rgba(0,0,0,0.6)';
                        ctx.fillRect(p.x - barW / 2, p.y + p.radius + 6, barW, barH);
                        ctx.fillStyle = p.isRunning ? '#3b82f6' : '#10b981';
                        ctx.fillRect(p.x - barW / 2, p.y + p.radius + 6, barW * (p.stamina / 100), barH);
                    }
                }
            }
        }

        // 10. スキルチェックリングのCanvas内描画 (Reactを使わず直接Canvasに60fpsで描画)
        const sc = skillCheckRef.current;
        if (sc.active && !p.isDead) {
            ctx.save();
            ctx.translate(p.x, p.y - p.radius - 28);

            const ringRadius = 18;

            // 背景円
            ctx.strokeStyle = 'rgba(0,0,0,0.6)';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
            ctx.stroke();

            ctx.strokeStyle = '#374151';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
            ctx.stroke();

            // 成功ターゲットゾーン (グリーン)
            const radStart = (sc.targetStart * Math.PI) / 180 - Math.PI / 2;
            const radEnd = ((sc.targetStart + sc.targetWidth) * Math.PI) / 180 - Math.PI / 2;
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(0, 0, ringRadius, radStart, radEnd);
            ctx.stroke();

            // 動く針
            const needleRad = (sc.progress * Math.PI) / 180 - Math.PI / 2;
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(needleRad) * (ringRadius + 3), Math.sin(needleRad) * (ringRadius + 3));
            ctx.stroke();

            ctx.restore();
        }
    }, [gameMode, gameState, interactiveFurniture, gatePowerOn]);

    // ゲームループ(rAF)
    useEffect(() => {
        if (gameState === 'menu' || gameState === 'game_over' || gameState === 'victory') {
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
            }
            return;
        }

        const loop = (time: number) => {
            if (lastTimeRef.current === 0) lastTimeRef.current = time;
            const dt = time - lastTimeRef.current;
            lastTimeRef.current = time;

            updatePhysics(dt);

            requestRef.current = requestAnimationFrame(loop);
        };

        requestRef.current = requestAnimationFrame(loop);

        return () => {
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
            }
        };
    }, [gameState, updatePhysics]);

    return {
        gameState,
        gameMode,
        difficulty,
        timer,
        score,
        highScore,
        isMuted,
        playerLife: playerLifeState,
        generatorsRemaining,
        gatePowerOn,
        player: playerRef.current,
        seekerAI: seekerAIRef.current,
        aiHiders: aiHidersRef.current,
        generators: generatorsRef.current,
        exitGate: exitGateRef.current,
        skillCheckActive: skillCheckRef.current.active,
        interactiveFurniture,
        interactiveGenerator,
        interactiveGate,
        interactiveHider,
        joystickVec,
        mousePos,
        startGame,
        returnToMenu,
        handleInteract,
        handleSkillCheckInput,
        toggleMute,
        renderCanvas
    };
}
