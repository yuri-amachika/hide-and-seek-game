import { useEffect, useRef, useState } from 'react';
import { useGameLoop, GameMode, Difficulty } from './hooks/useGameLoop';
import { MAP_WIDTH, MAP_HEIGHT } from './utils/mapData';

function App() {
    const {
        gameState,
        gameMode,
        difficulty,
        timer,
        score,
        highScore,
        isMuted,
        playerLife,
        generatorsRemaining,
        gatePowerOn,
        player,
        seekerAI,
        interactiveFurniture,
        interactiveGenerator,
        interactiveGate,
        interactiveHider,
        skillCheckActive,
        joystickVec,
        mousePos,
        startGame,
        returnToMenu,
        handleInteract,
        handleSkillCheckInput,
        toggleMute,
        renderCanvas
    } = useGameLoop();

    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    // ジョイスティック用のタッチ状態
    const [joystickTouchId, setJoystickTouchId] = useState<number | null>(null);
    const [joystickStartPos, setJoystickStartPos] = useState<{ x: number; y: number } | null>(null);
    const [joystickCurPos, setJoystickCurPos] = useState<{ x: number; y: number } | null>(null);

    // 懐中電灯の右画面タッチドラッグ用のタッチ状態
    const [viewTouchId, setViewTouchId] = useState<number | null>(null);
    const [viewStartPos, setViewStartPos] = useState<{ x: number; y: number } | null>(null);

    // 難易度とモード選択のローカルステート（メニュー用）
    const [selectedMode, setSelectedMode] = useState<GameMode>('hider');
    const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>('normal');

    // キャンバスレンダリングの毎フレーム呼び出し
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;

        const render = () => {
            renderCanvas(ctx);
            animationFrameId = requestAnimationFrame(render);
        };

        render();

        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, [gameState, renderCanvas]);

    // マウス移動リスナー (PC用: 懐中電灯の向きを合わせる)
    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        // Canvasの内部解像度(1000x800)にマッピングする
        const scaleX = MAP_WIDTH / rect.width;
        const scaleY = MAP_HEIGHT / rect.height;

        mousePos.current = {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    };

    // ジョイスティックタッチイベント (左画面下部)
    const handleJoystickTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
        if (gameState !== 'hiding_phase' && gameState !== 'hunting_phase') return;

        const touch = e.changedTouches[0];
        const pageX = touch.clientX;
        const pageY = touch.clientY;

        setJoystickTouchId(touch.identifier);
        setJoystickStartPos({ x: pageX, y: pageY });
        setJoystickCurPos({ x: pageX, y: pageY });
    };

    const handleJoystickTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
        if (joystickTouchId === null || joystickStartPos === null) return;

        const touch = Array.from(e.touches).find(t => t.identifier === joystickTouchId);
        if (!touch) return;

        const curX = touch.clientX;
        const curY = touch.clientY;

        setJoystickCurPos({ x: curX, y: curY });

        // 移動ベクトルの算出とクランプ
        const dx = curX - joystickStartPos.x;
        const dy = curY - joystickStartPos.y;
        const distance = Math.hypot(dx, dy);
        const maxRadius = 45; // ジョイスティック可動範囲

        if (distance === 0) {
            joystickVec.current = { x: 0, y: 0 };
        } else {
            const factor = Math.min(distance, maxRadius) / maxRadius;
            joystickVec.current = {
                x: (dx / distance) * factor,
                y: (dy / distance) * factor
            };
        }
    };

    const handleJoystickTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
        const touch = Array.from(e.changedTouches).find(t => t.identifier === joystickTouchId);
        if (!touch) return;

        setJoystickTouchId(null);
        setJoystickStartPos(null);
        setJoystickCurPos(null);
        joystickVec.current = { x: 0, y: 0 };
    };

    // 視界（懐中電灯）タッチイベント (右画面)
    const handleViewTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
        if (gameState !== 'hiding_phase' && gameState !== 'hunting_phase') return;

        const touch = e.changedTouches[0];
        setViewTouchId(touch.identifier);
        setViewStartPos({ x: touch.clientX, y: touch.clientY });
    };

    const handleViewTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
        if (viewTouchId === null || viewStartPos === null) return;

        const touch = Array.from(e.touches).find(t => t.identifier === viewTouchId);
        if (!touch) return;

        const dx = touch.clientX - viewStartPos.x;
        const dy = touch.clientY - viewStartPos.y;

        // 移動ベクトルに変換して向き角度に反映
        if (Math.hypot(dx, dy) > 10) {
            player.angle = Math.atan2(dy, dx);
        }
    };

    const handleViewTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
        const touch = Array.from(e.changedTouches).find(t => t.identifier === viewTouchId);
        if (!touch) return;
        setViewTouchId(null);
        setViewStartPos(null);
    };

    // ダメージ被撃時の揺れ・画面グリッチ
    const isDamaged = player.hitCooldown > 0;
    // キラーがプレイヤーの隠れている家具を探索中かどうか
    const isUnderSearch = player.isHidden && seekerAI && seekerAI.state === 'searching' && seekerAI.searchTargetFurnitureId === player.hiddenInFurnitureId;

    // ライフ表示のハート配列生成
    const renderHearts = () => {
        const hearts = [];
        for (let i = 0; i < 3; i++) {
            hearts.push(
                <span 
                    key={i} 
                    className={`text-lg transition-all ${
                        i < playerLife ? 'text-red-500 animate-pulse' : 'text-zinc-700'
                    }`}
                >
                    ❤️
                </span>
            );
        }
        return hearts;
    };

    // インタラクト時のアクションテキスト決定
    const getInteractText = () => {
        if (gameMode === 'seeker') {
            if (interactiveHider) {
                return '捕まえる';
            }
            if (interactiveGenerator) {
                return '壊す';
            }
            if (interactiveFurniture) {
                return '探す';
            }
            return '';
        } else {
            if (interactiveFurniture) {
                return player.isHidden ? '出る' : '隠れる';
            }
            if (interactiveGenerator) {
                return '修理';
            }
            if (interactiveGate) {
                return '開ける';
            }
            return '';
        }
    };

    return (
        <div 
            className={`min-h-screen bg-black text-white flex flex-col items-center justify-center relative select-none overflow-hidden ${
                isDamaged ? 'damage-shake bg-red-950/20' : ''
            }`}
            style={{ 
                fontFamily: "'Courier New', Courier, monospace",
            }}
        >
            {/* Landscape 警告オーバーレイ (Portrait時に表示) */}
            <div className="landscape-warning fixed inset-0 z-[100] bg-black flex-col items-center justify-center p-8 text-center border-8 border-red-900">
                <div className="text-6xl mb-6 animate-bounce">📱🔄</div>
                <h2 className="text-3xl font-black text-red-500 mb-4 tracking-widest">画面を横向きに<br/>してください</h2>
                <p className="text-zinc-400 font-bold">Please rotate your device to landscape mode for the best experience.</p>
            </div>

            {/* CRT 走査線エフェクト */}
            <div className="scanlines"></div>

            {/* 心音脈動赤枠 (被撃時、または家具探索時) */}
            {gameState === 'hunting_phase' && gameMode === 'hider' && (isDamaged || isUnderSearch) && (
                <div 
                    className="pulse-red-border absolute inset-0 z-20 pointer-events-none"
                    style={{ '--pulse-speed': isUnderSearch ? '0.25s' : '0.4s' } as React.CSSProperties}
                ></div>
            )}

            {/* 1. メインメニュー画面 */}
            {gameState === 'menu' && (
                <div className="w-full max-w-2xl glass-panel p-4 md:p-8 rounded-2xl flex flex-col items-center border border-red-950 shadow-2xl z-30 m-2 md:m-4 max-h-[95vh] overflow-y-auto no-scrollbar">
                    <h1 
                        className="text-3xl sm:text-4xl md:text-5xl font-black text-red-600 mb-1 md:mb-2 tracking-widest relative glitch-text neon-text-red text-center"
                        data-text="HIDE QUICKLY"
                    >
                        HIDE QUICKLY
                    </h1>
                    <p className="text-gray-400 text-xs md:text-sm mb-4 md:mb-8 tracking-wider">SURVIVAL HORROR 2D</p>

                    <div className="flex flex-col md:flex-row w-full gap-4 md:gap-8 mb-4 md:mb-8">
                        {/* モード選択 */}
                        <div className="w-full md:w-1/2">
                            <label className="text-red-500 font-bold block mb-2 text-xs md:text-sm uppercase tracking-widest text-center">プレイモード</label>
                            <div className="flex flex-col gap-2 md:gap-4">
                                <button
                                    onClick={() => setSelectedMode('hider')}
                                    className={`py-3 md:py-4 px-4 rounded-xl font-black text-sm md:text-base border-2 transition-all ${
                                        selectedMode === 'hider'
                                            ? 'bg-blue-900 border-blue-400 text-white shadow-[0_0_15px_rgba(59,130,246,0.5)] scale-105'
                                            : 'bg-zinc-900 border-zinc-800 text-gray-400 hover:border-zinc-600'
                                    }`}
                                >
                                    🏃‍♂️ 生存者 (逃げる)
                                </button>
                                <button
                                    onClick={() => setSelectedMode('seeker')}
                                    className={`py-3 md:py-4 px-4 rounded-xl font-black text-sm md:text-base border-2 transition-all ${
                                        selectedMode === 'seeker'
                                            ? 'bg-amber-950 border-amber-400 text-white shadow-[0_0_15px_rgba(251,191,36,0.5)] scale-105'
                                            : 'bg-zinc-900 border-zinc-800 text-gray-400 hover:border-zinc-600'
                                    }`}
                                >
                                    🔪 殺人鬼 (探す)
                                </button>
                            </div>
                        </div>

                        {/* 難易度選択 */}
                        <div className="w-full md:w-1/2">
                            <label className="text-red-500 font-bold block mb-2 text-xs md:text-sm uppercase tracking-widest text-center">難易度</label>
                            <div className="flex flex-col gap-2">
                                {(['easy', 'normal', 'hard'] as Difficulty[]).map((diff) => (
                                    <button
                                        key={diff}
                                        onClick={() => setSelectedDifficulty(diff)}
                                        className={`py-2 md:py-3 px-3 rounded-lg text-xs md:text-sm font-bold border-2 capitalize transition-all ${
                                            selectedDifficulty === diff
                                                ? 'bg-red-950 border-red-500 text-red-100 shadow-[0_0_10px_rgba(239,68,68,0.4)] scale-105'
                                                : 'bg-zinc-900 border-zinc-800 text-gray-400 hover:border-zinc-600'
                                        }`}
                                    >
                                        {diff === 'easy' ? '🟢 イージー' : diff === 'normal' ? '🟡 ノーマル' : '🔴 ハード'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex w-full justify-between items-end mb-4 md:mb-6">
                        {/* ハイスコア */}
                        <div className="text-left">
                            <p className="text-zinc-500 text-[10px] md:text-xs tracking-wider uppercase mb-0 md:mb-1">ハイスコア</p>
                            <p className="text-lg md:text-2xl font-bold text-amber-500">{highScore} PTS</p>
                        </div>

                        {/* スタートボタン */}
                        <button
                            onClick={() => startGame(selectedMode, selectedDifficulty)}
                            className="py-4 md:py-5 px-8 md:px-12 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-black text-lg md:text-xl rounded-2xl transition-all shadow-[0_0_20px_rgba(220,38,38,0.6)] neon-text-red border-2 border-red-400 uppercase tracking-widest animate-pulse"
                        >
                            ゲーム開始
                        </button>
                    </div>

                    {/* 操作ガイド */}
                    <div className="mt-2 md:mt-6 pt-4 border-t border-zinc-800 w-full text-zinc-400 text-[10px] md:text-xs leading-relaxed hidden sm:block">
                        <p className="font-bold text-zinc-300 mb-1">🎮 操作方法:</p>
                        <p>・【移動】PC: WASD / 矢印キー | スマホ: 左下仮想スティック</p>
                        <p>・【ダッシュ】PC: Shiftキー | スマホ: スティックを大きく傾ける</p>
                        <p>・【アクション】PC: スペースキー | スマホ: 右下ボタン</p>
                    </div>
                </div>
            )}

            {/* 2. ゲームプレイ画面 */}
            {(gameState === 'hiding_phase' || gameState === 'hunting_phase') && (
                <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center z-20 overflow-hidden bg-zinc-950">

                    {/* HUD ヘッダー (絶対配置でキャンバス上部に被せる) */}
                    <div className="absolute top-2 left-2 right-2 flex items-center justify-between glass-panel px-4 py-2 rounded-xl z-40 border border-zinc-800/50 shadow-lg pointer-events-none">
                        <div className="flex items-center gap-3 md:gap-4 pointer-events-auto">
                            <span className="font-bold text-red-500 uppercase text-xs md:text-sm">
                                {gameMode === 'hider' ? '生存者' : '殺人鬼'}
                            </span>
                            <span className="text-zinc-500 hidden md:inline">|</span>
                            {gameMode === 'hider' && (
                                <div className="flex items-center gap-1">
                                    <span className="text-zinc-500 mr-1 text-[9px] md:text-[10px]">LIFES:</span>
                                    <div className="flex">{renderHearts()}</div>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-3 md:gap-6 pointer-events-auto">
                            {gameMode === 'hider' && (
                                <div className="text-center">
                                    <p className="text-[9px] md:text-[10px] text-zinc-500 mb-0">発電機</p>
                                    <p className={`text-xs md:text-sm font-bold ${gatePowerOn ? 'text-green-500 neon-text-green animate-pulse' : 'text-amber-500'}`}>
                                        {gatePowerOn ? '⚡ 脱出可' : `🔌 ${generatorsRemaining}`}
                                    </p>
                                </div>
                            )}
                            <div className="text-center">
                                <p className="text-[9px] md:text-[10px] text-zinc-500 mb-0">TIME</p>
                                <p className={`text-sm md:text-lg font-bold font-mono ${timer <= 10 ? 'text-red-500 neon-text-red blink' : 'text-white'}`}>
                                    {timer}s
                                </p>
                            </div>
                            <div className="text-center hidden sm:block">
                                <p className="text-[9px] md:text-[10px] text-zinc-500 mb-0">SCORE</p>
                                <p className="text-sm md:text-lg font-bold font-mono text-amber-400">{score}</p>
                            </div>
                            <button 
                                onClick={toggleMute}
                                className="p-2 rounded-lg bg-zinc-900/80 border border-zinc-800 hover:bg-zinc-800 pointer-events-auto w-8 h-8 md:w-10 md:h-10 flex items-center justify-center"
                            >
                                {isMuted ? '🔇' : '🔊'}
                            </button>
                        </div>
                    </div>

                    {/* HUD フェーズ表示アラート (絶対配置) */}
                    {gameState === 'hiding_phase' && gameMode === 'hider' && (
                        <div className="absolute top-16 md:top-20 left-1/2 -translate-x-1/2 w-[90%] max-w-md bg-blue-900/80 border border-blue-500 text-blue-100 px-4 py-2 rounded-lg text-center text-xs md:text-sm font-bold animate-pulse z-40 pointer-events-none shadow-lg backdrop-blur-sm">
                            準備フェーズ: マップ内の発電機を修理し、ゲートから脱出してください！
                        </div>
                    )}

                    {/* 家具探索時の警告アラート */}
                    {gameState === 'hunting_phase' && gameMode === 'hider' && isUnderSearch && (
                        <div className="absolute top-16 md:top-20 left-1/2 -translate-x-1/2 w-[90%] max-w-md bg-red-950/90 border-2 border-red-500 text-red-200 px-4 py-2 rounded-lg text-center text-xs md:text-sm font-black animate-pulse z-40 pointer-events-none shadow-[0_0_20px_rgba(239,68,68,0.5)] backdrop-blur-sm">
                            ⚠️ 殺人鬼が隠れ場所を捜索中...！
                        </div>
                    )}

                    {/* マップゲームCanvas (全画面表示) */}
                    <div className="w-full h-full relative flex items-center justify-center">
                        <canvas
                            ref={canvasRef}
                            width={MAP_WIDTH}
                            height={MAP_HEIGHT}
                            onMouseMove={handleMouseMove}
                            className="w-full h-full object-contain cursor-crosshair"
                            style={{
                                maxHeight: '100vh',
                                maxWidth: '100vw'
                            }}
                        />

                        {/* モバイル用バーチャルジョイスティック＆タッチ操作用レイヤー */}
                        <div 
                            className="absolute inset-0 z-30 touch-device-controls"
                            onTouchStart={handleViewTouchStart}
                            onTouchMove={handleViewTouchMove}
                            onTouchEnd={handleViewTouchEnd}
                        >
                            {/* ジョイスティックタッチ検出エリア (画面左下) */}
                            <div 
                                className="absolute bottom-6 left-6 w-48 h-48 rounded-full flex items-center justify-center pointer-events-auto"
                                onTouchStart={(e) => { e.stopPropagation(); handleJoystickTouchStart(e); }}
                                onTouchMove={(e) => { e.stopPropagation(); handleJoystickTouchMove(e); }}
                                onTouchEnd={(e) => { e.stopPropagation(); handleJoystickTouchEnd(e); }}
                                style={{ background: 'rgba(255,255,255,0.05)', border: '2px dashed rgba(255,255,255,0.2)' }}
                            >
                                {!joystickStartPos && (
                                    <div className="text-white/30 font-bold text-xs pointer-events-none">移動</div>
                                )}
                                {joystickStartPos && joystickCurPos && (
                                    <div className="relative w-32 h-32 rounded-full bg-zinc-900/60 border-2 border-zinc-500/40 flex items-center justify-center">
                                        <div className="w-6 h-6 rounded-full bg-zinc-500/50"></div>
                                        <div 
                                            className="absolute w-16 h-16 rounded-full bg-red-500 border-2 border-red-300 flex items-center justify-center shadow-[0_0_15px_rgba(239,68,68,0.8)]"
                                            style={{
                                                left: `calc(50% - 32px + ${Math.max(-45, Math.min(joystickCurPos.x - joystickStartPos.x, 45))}px)`,
                                                top: `calc(50% - 32px + ${Math.max(-45, Math.min(joystickCurPos.y - joystickStartPos.y, 45))}px)`,
                                            }}
                                        ></div>
                                    </div>
                                )}
                            </div>

                            {/* モバイル用アクションボタン (画面右下 - 動的ラベル) */}
                            {getInteractText() !== '' && !skillCheckActive && (
                                <button
                                    onTouchStart={(e) => {
                                        e.stopPropagation();
                                        handleInteract();
                                    }}
                                    className="absolute bottom-8 right-8 w-28 h-28 rounded-full bg-red-600 border-4 border-red-400 text-white font-black text-lg shadow-[0_0_30px_rgba(239,68,68,0.8)] flex flex-col items-center justify-center animate-bounce z-40 pointer-events-auto active:scale-90 active:bg-red-800"
                                >
                                    <span className="text-3xl mb-1">👆</span>
                                    <span>{getInteractText()}</span>
                                </button>
                            )}

                            {/* モバイル用スキルチェックタップ判定エリア (画面全体を覆う) */}
                            {skillCheckActive && (
                                <div 
                                    className="absolute inset-0 bg-black/20 z-50 flex items-center justify-center pointer-events-auto cursor-pointer"
                                    onTouchStart={(e) => {
                                        e.stopPropagation();
                                        handleSkillCheckInput();
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleSkillCheckInput();
                                    }}
                                >
                                    <div className="glass-panel px-8 py-6 rounded-2xl border-4 border-green-500 text-xl font-black text-green-400 animate-ping shadow-[0_0_30px_rgba(16,185,129,0.8)]">
                                        👆 ここをタップ！
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* PC向けアクションガイド */}
                        {!skillCheckActive && (
                            <div className="hidden lg:block">
                                {interactiveHider && gameMode === 'seeker' && (
                                    <div className="absolute top-[12%] left-1/2 -translate-x-1/2 glass-panel px-4 py-2 rounded-lg border border-red-500/30 text-xs font-bold text-center z-40">
                                        <p className="text-red-400 font-mono text-sm mb-1">{interactiveHider.name}</p>
                                        <span className="bg-red-950 px-2 py-0.5 rounded border border-red-600 text-red-200 font-mono">SPACE</span> キーで捕まえる
                                    </div>
                                )}
                                {interactiveFurniture && (
                                    <div className="absolute top-[12%] left-1/2 -translate-x-1/2 glass-panel px-4 py-2 rounded-lg border border-blue-500/30 text-xs font-bold text-center z-40">
                                        <p className="text-blue-400 font-mono text-sm mb-1">{interactiveFurniture.name}</p>
                                        <span className="bg-blue-950 px-2 py-0.5 rounded border border-blue-600 text-blue-200 font-mono">SPACE</span> キーで{gameMode === 'seeker' ? '探す' : (player.isHidden ? '出る' : '隠れる')}
                                    </div>
                                )}
                                {interactiveGenerator && (
                                    <div className="absolute top-[12%] left-1/2 -translate-x-1/2 glass-panel px-4 py-2 rounded-lg border border-amber-500/30 text-xs font-bold text-center z-40">
                                        <p className="text-amber-400 font-mono text-sm mb-1">{interactiveGenerator.name}</p>
                                        {gameMode === 'seeker' ? (
                                            <span><span className="bg-amber-950 px-2 py-0.5 rounded border border-amber-600 text-amber-200 font-mono">SPACE</span> キーで壊す</span>
                                        ) : (
                                            <span><span className="bg-amber-950 px-2 py-0.5 rounded border border-amber-600 text-amber-200 font-mono">SPACE 長押し</span> で修理</span>
                                        )}
                                    </div>
                                )}
                                {interactiveGate && gameMode === 'hider' && (
                                    <div className="absolute top-[12%] left-1/2 -translate-x-1/2 glass-panel px-4 py-2 rounded-lg border border-green-500/30 text-xs font-bold text-center z-40">
                                        <p className="text-green-400 font-mono text-sm mb-1">{interactiveGate.name}</p>
                                        <span className="bg-green-950 px-2 py-0.5 rounded border border-green-600 text-green-200 font-mono">SPACE 長押し</span> で脱出ゲートを開く
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* 3. リザルト画面 */}
            {(gameState === 'game_over' || gameState === 'victory') && (
                <div className="w-full max-w-lg glass-panel p-6 md:p-8 rounded-2xl flex flex-col items-center border shadow-2xl z-30 m-4 animate-fade-in max-h-[95vh] overflow-y-auto no-scrollbar">
                    {gameState === 'game_over' ? (
                        <>
                            <h2 
                                className="text-4xl md:text-5xl font-black text-red-600 mb-1 md:mb-2 tracking-widest glitch-text neon-text-red text-center"
                                data-text={gameMode === 'seeker' ? 'DEFEATED' : 'KILLED'}
                            >
                                {gameMode === 'seeker' ? 'DEFEATED' : 'YOU DIED'}
                            </h2>
                            <p className="text-zinc-500 text-[10px] md:text-xs mb-4 md:mb-6 uppercase tracking-widest text-center">
                                {gameMode === 'seeker' ? 'サバイバーに脱出されました' : 'キラーに排除されました'}
                            </p>
                        </>
                    ) : (
                        <>
                            <h2 
                                className="text-4xl md:text-5xl font-black text-emerald-500 mb-1 md:mb-2 tracking-widest neon-text-green text-center"
                            >
                                {gameMode === 'seeker' ? 'VICTORY' : 'ESCAPED'}
                            </h2>
                            <p className="text-zinc-500 text-[10px] md:text-xs mb-4 md:mb-6 uppercase tracking-widest text-center">
                                {gameMode === 'seeker' ? 'サバイバーを全員排除しました' : '無事に脱出しました'}
                            </p>
                        </>
                    )}

                    <div className="w-full bg-zinc-950/80 p-4 md:p-6 rounded-xl border border-zinc-800/80 text-center mb-6 md:mb-8 shadow-inner">
                        <div className="flex justify-between items-center mb-2 md:mb-3">
                            <span className="text-zinc-500 text-[10px] md:text-xs uppercase tracking-wider">プレイモード</span>
                            <span className="font-bold text-sm md:text-base text-zinc-200">
                                {gameMode === 'hider' ? '🏃 生存者' : '🔪 殺人鬼'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center mb-3 md:mb-4">
                            <span className="text-zinc-500 text-[10px] md:text-xs uppercase tracking-wider">難易度</span>
                            <span className="font-bold text-sm md:text-base text-zinc-200 uppercase">
                                {difficulty}
                            </span>
                        </div>
                        <div className="flex justify-between items-end border-t border-zinc-800 pt-3 md:pt-4">
                            <span className="text-zinc-400 text-xs md:text-sm font-bold pb-1">獲得スコア</span>
                            <span className="text-3xl md:text-4xl font-black text-amber-500 font-mono neon-text-red shadow-amber-500">{score} <span className="text-sm text-amber-600">PTS</span></span>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 md:gap-4 w-full">
                        <button
                            onClick={() => startGame(gameMode, difficulty)}
                            className="flex-1 py-4 md:py-5 px-4 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-black rounded-xl transition-all shadow-[0_0_15px_rgba(220,38,38,0.4)] border border-red-500 uppercase tracking-widest text-sm md:text-base scale-100 hover:scale-105"
                        >
                            🔄 もう一度プレイ
                        </button>
                        <button
                            onClick={returnToMenu}
                            className="flex-1 py-4 md:py-5 px-4 bg-zinc-900 border-2 border-zinc-700 hover:bg-zinc-800 text-gray-200 font-bold rounded-xl transition-all uppercase tracking-widest text-sm md:text-base scale-100 hover:scale-105"
                        >
                            🏠 メニューへ
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
