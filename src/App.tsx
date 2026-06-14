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
            {/* CRT 走査線エフェクト */}
            <div className="scanlines"></div>

            {/* 心音脈動赤枠 (被撃時、またはスキルチェック警告時) */}
            {gameState === 'hunting_phase' && gameMode === 'hider' && isDamaged && (
                <div 
                    className="pulse-red-border absolute inset-0 z-20 pointer-events-none"
                    style={{ '--pulse-speed': '0.4s' } as React.CSSProperties}
                ></div>
            )}

            {/* 1. メインメニュー画面 */}
            {gameState === 'menu' && (
                <div className="w-full max-w-lg glass-panel p-8 rounded-2xl flex flex-col items-center border border-red-950 shadow-2xl z-30 m-4">
                    <h1 
                        className="text-4xl sm:text-5xl font-black text-red-600 mb-2 tracking-widest relative glitch-text neon-text-red"
                        data-text="HIDE QUICKLY"
                    >
                        HIDE QUICKLY
                    </h1>
                    <p className="text-gray-400 text-sm mb-8 tracking-wider">SURVIVAL HORROR 2D</p>

                    {/* モード選択 */}
                    <div className="w-full mb-6">
                        <label className="text-red-500 font-bold block mb-2 text-xs uppercase tracking-widest">プレイモードを選択</label>
                        <div className="grid grid-cols-2 gap-4">
                            <button
                                onClick={() => setSelectedMode('hider')}
                                className={`py-3 px-4 rounded-lg font-bold border transition-all ${
                                    selectedMode === 'hider'
                                        ? 'bg-blue-900 border-blue-500 text-white shadow-lg shadow-blue-900/30'
                                        : 'bg-zinc-900 border-zinc-800 text-gray-400 hover:border-zinc-700'
                                }`}
                            >
                                生存者 (隠れる/脱出)
                            </button>
                            <button
                                onClick={() => setSelectedMode('seeker')}
                                className={`py-3 px-4 rounded-lg font-bold border transition-all ${
                                    selectedMode === 'seeker'
                                        ? 'bg-amber-950 border-amber-500 text-white shadow-lg shadow-amber-950/30'
                                        : 'bg-zinc-900 border-zinc-800 text-gray-400 hover:border-zinc-700'
                                }`}
                            >
                                殺人鬼 (探す)
                            </button>
                        </div>
                    </div>

                    {/* 難易度選択 */}
                    <div className="w-full mb-8">
                        <label className="text-red-500 font-bold block mb-2 text-xs uppercase tracking-widest">難易度</label>
                        <div className="grid grid-cols-3 gap-2">
                            {(['easy', 'normal', 'hard'] as Difficulty[]).map((diff) => (
                                <button
                                    key={diff}
                                    onClick={() => setSelectedDifficulty(diff)}
                                    className={`py-2 px-3 rounded-lg text-xs font-bold border capitalize transition-all ${
                                        selectedDifficulty === diff
                                            ? 'bg-red-950 border-red-600 text-red-200'
                                            : 'bg-zinc-900 border-zinc-800 text-gray-400 hover:border-zinc-700'
                                    }`}
                                >
                                    {diff === 'easy' ? 'イージー' : diff === 'normal' ? 'ノーマル' : 'ハード'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ハイスコア */}
                    <div className="text-center mb-8">
                        <p className="text-zinc-500 text-xs tracking-wider uppercase mb-1">ハイスコア</p>
                        <p className="text-2xl font-bold text-amber-500">{highScore} PTS</p>
                    </div>

                    {/* スタートボタン */}
                    <button
                        onClick={() => startGame(selectedMode, selectedDifficulty)}
                        className="w-full py-4 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold text-lg rounded-xl transition-all shadow-lg shadow-red-900/40 neon-text-red border border-red-500 uppercase tracking-widest"
                    >
                        ゲーム開始
                    </button>

                    {/* 操作ガイド */}
                    <div className="mt-8 pt-6 border-t border-zinc-800 w-full text-zinc-500 text-[11px] leading-relaxed">
                        <p className="font-bold text-zinc-400 mb-1">🎮 操作方法:</p>
                        <p>・【移動】PC: WASD / 矢印キー | スマホ: 左下仮想スティック</p>
                        <p>・【ダッシュ】PC: Shiftキー | スマホ: スティックを大きく傾ける</p>
                        <p>・【アクション】PC: スペースキー (家具に隠れる/出る/発電機の修理/ゲート開放)</p>
                        <p>・【スキルチェック】PC: スペースキー | スマホ: 画面タップ（グリーンゾーンで）</p>
                    </div>
                </div>
            )}

            {/* 2. ゲームプレイ画面 */}
            {(gameState === 'hiding_phase' || gameState === 'hunting_phase') && (
                <div className="w-full max-w-4xl flex flex-col items-center z-20 px-2 relative">
                    {/* HUD ヘッダー */}
                    <div className="w-full flex items-center justify-between glass-panel px-4 py-3 rounded-xl mb-2 border-zinc-800 text-xs tracking-wider">
                        <div className="flex items-center gap-4">
                            <span className="font-bold text-red-500 uppercase">
                                {gameMode === 'hider' ? '生存者' : '殺人鬼'}
                            </span>
                            <span className="text-zinc-500">|</span>
                            {gameMode === 'hider' && (
                                <div className="flex items-center gap-1">
                                    <span className="text-zinc-500 mr-1 text-[10px]">LIFES:</span>
                                    {renderHearts()}
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-6">
                            {gameMode === 'hider' && (
                                <div className="text-center">
                                    <p className="text-[10px] text-zinc-500 mb-0.5">発電機残り</p>
                                    <p className={`text-sm font-bold ${gatePowerOn ? 'text-green-500 neon-text-green animate-pulse' : 'text-amber-500'}`}>
                                        {gatePowerOn ? '⚡ 脱出ゲート通電中！' : `🔌 ${generatorsRemaining} 台`}
                                    </p>
                                </div>
                            )}
                            <div className="text-center">
                                <p className="text-[10px] text-zinc-500 mb-0.5">残り時間</p>
                                <p className={`text-lg font-bold font-mono ${timer <= 10 ? 'text-red-500 neon-text-red blink' : 'text-white'}`}>
                                    {timer}s
                                </p>
                            </div>
                            <div className="text-center">
                                <p className="text-[10px] text-zinc-500 mb-0.5">スコア</p>
                                <p className="text-lg font-bold font-mono text-amber-400">{score}</p>
                            </div>
                            <button 
                                onClick={toggleMute}
                                className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800"
                            >
                                {isMuted ? '🔇' : '🔊'}
                            </button>
                        </div>
                    </div>

                    {/* HUD フェーズ表示アラート */}
                    {gameState === 'hiding_phase' && gameMode === 'hider' && (
                        <div className="w-full bg-blue-900/60 border border-blue-500 text-blue-100 px-4 py-2 rounded-lg mb-2 text-center text-xs font-bold animate-pulse">
                            準備フェーズ: マップ内の発電機を修理し、ゲートから脱出してください！
                        </div>
                    )}

                    {/* マップゲームCanvas */}
                    <div className="relative border-2 border-zinc-800 bg-zinc-950 rounded-xl overflow-hidden shadow-2xl w-full max-w-[800px] aspect-[4/3]">
                        <canvas
                            ref={canvasRef}
                            width={MAP_WIDTH}
                            height={MAP_HEIGHT}
                            onMouseMove={handleMouseMove}
                            className="w-full h-full object-contain cursor-crosshair"
                        />

                        {/* モバイル用バーチャルジョイスティック＆タッチ操作用レイヤー */}
                        <div 
                            className="absolute inset-0 z-30 md:hidden"
                            onTouchStart={handleViewTouchStart}
                            onTouchMove={handleViewTouchMove}
                            onTouchEnd={handleViewTouchEnd}
                        >
                            {/* ジョイスティックタッチ検出エリア (画面左下) */}
                            <div 
                                className="absolute bottom-4 left-4 w-40 h-40 rounded-full flex items-center justify-center pointer-events-auto"
                                onTouchStart={(e) => { e.stopPropagation(); handleJoystickTouchStart(e); }}
                                onTouchMove={(e) => { e.stopPropagation(); handleJoystickTouchMove(e); }}
                                onTouchEnd={(e) => { e.stopPropagation(); handleJoystickTouchEnd(e); }}
                                style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)' }}
                            >
                                {joystickStartPos && joystickCurPos && (
                                    <div className="relative w-24 h-24 rounded-full bg-zinc-900/50 border border-zinc-700/30 flex items-center justify-center">
                                        <div className="w-4 h-4 rounded-full bg-zinc-700/50"></div>
                                        <div 
                                            className="absolute w-12 h-12 rounded-full bg-red-600/70 border border-red-500 flex items-center justify-center shadow-lg shadow-red-900/50"
                                            style={{
                                                left: `calc(50% - 24px + ${Math.min(joystickCurPos.x - joystickStartPos.x, 45)}px)`,
                                                top: `calc(50% - 24px + ${Math.min(joystickCurPos.y - joystickStartPos.y, 45)}px)`,
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
                                    className="absolute bottom-10 right-10 w-20 h-20 rounded-full bg-red-600/90 border-2 border-red-500 text-white font-black text-[13px] shadow-2xl flex items-center justify-center animate-bounce z-40 pointer-events-auto active:scale-95"
                                >
                                    {getInteractText()}
                                </button>
                            )}

                            {/* モバイル用スキルチェックタップ判定エリア (画面右側全体) */}
                            {skillCheckActive && (
                                <div 
                                    className="absolute inset-0 bg-transparent z-50 flex items-center justify-center pointer-events-auto cursor-pointer"
                                    onTouchStart={(e) => {
                                        e.stopPropagation();
                                        handleSkillCheckInput();
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleSkillCheckInput();
                                    }}
                                >
                                    <div className="glass-panel px-4 py-2 rounded-lg border border-green-500 text-xs font-bold text-green-400 animate-pulse">
                                        画面をタップ！
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* PC向けアクションガイド */}
                        {!skillCheckActive && (
                            <>
                                {interactiveHider && gameMode === 'seeker' && (
                                    <div className="absolute top-[8%] left-1/2 -translate-x-1/2 glass-panel px-4 py-2 rounded-lg border border-red-500/30 text-xs font-bold text-center z-40 hidden md:block">
                                        <p className="text-red-400 font-mono text-sm mb-1">{interactiveHider.name}</p>
                                        <span className="bg-red-950 px-2 py-0.5 rounded border border-red-600 text-red-200 font-mono">SPACE</span> キーで捕まえる
                                    </div>
                                )}
                                {interactiveFurniture && (
                                    <div className="absolute top-[8%] left-1/2 -translate-x-1/2 glass-panel px-4 py-2 rounded-lg border border-blue-500/30 text-xs font-bold text-center z-40 hidden md:block">
                                        <p className="text-blue-400 font-mono text-sm mb-1">{interactiveFurniture.name}</p>
                                        <span className="bg-blue-950 px-2 py-0.5 rounded border border-blue-600 text-blue-200 font-mono">SPACE</span> キーで{gameMode === 'seeker' ? '探す' : (player.isHidden ? '出る' : '隠れる')}
                                    </div>
                                )}
                                {interactiveGenerator && (
                                    <div className="absolute top-[8%] left-1/2 -translate-x-1/2 glass-panel px-4 py-2 rounded-lg border border-amber-500/30 text-xs font-bold text-center z-40 hidden md:block">
                                        <p className="text-amber-400 font-mono text-sm mb-1">{interactiveGenerator.name}</p>
                                        {gameMode === 'seeker' ? (
                                            <span><span className="bg-amber-950 px-2 py-0.5 rounded border border-amber-600 text-amber-200 font-mono">SPACE</span> キーで壊す</span>
                                        ) : (
                                            <span><span className="bg-amber-950 px-2 py-0.5 rounded border border-amber-600 text-amber-200 font-mono">SPACE 長押し</span> で修理</span>
                                        )}
                                    </div>
                                )}
                                {interactiveGate && gameMode === 'hider' && (
                                    <div className="absolute top-[8%] left-1/2 -translate-x-1/2 glass-panel px-4 py-2 rounded-lg border border-green-500/30 text-xs font-bold text-center z-40 hidden md:block">
                                        <p className="text-green-400 font-mono text-sm mb-1">{interactiveGate.name}</p>
                                        <span className="bg-green-950 px-2 py-0.5 rounded border border-green-600 text-green-200 font-mono">SPACE 長押し</span> で脱出ゲートを開く
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* 3. リザルト画面 */}
            {(gameState === 'game_over' || gameState === 'victory') && (
                <div className="w-full max-w-md glass-panel p-8 rounded-2xl flex flex-col items-center border shadow-2xl z-30 m-4 animate-fade-in">
                    {gameState === 'game_over' ? (
                        <>
                            <h2 
                                className="text-4xl font-black text-red-600 mb-2 tracking-widest glitch-text neon-text-red"
                                data-text="KILLED"
                            >
                                YOU DIED
                            </h2>
                            <p className="text-zinc-500 text-xs mb-8 uppercase tracking-widest">キラーに排除されました</p>
                        </>
                    ) : (
                        <>
                            <h2 
                                className="text-4xl font-black text-emerald-500 mb-2 tracking-widest neon-text-green"
                            >
                                ESCAPED
                            </h2>
                            <p className="text-zinc-500 text-xs mb-8 uppercase tracking-widest">無事に脱出しました</p>
                        </>
                    )}

                    <div className="w-full bg-zinc-950/70 p-4 rounded-xl border border-zinc-800/50 text-center mb-8">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-zinc-500 text-xs uppercase tracking-wider">プレイしたモード</span>
                            <span className="font-bold text-sm text-zinc-200">
                                {gameMode === 'hider' ? '生存者' : '殺人鬼'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center mb-4">
                            <span className="text-zinc-500 text-xs uppercase tracking-wider">ゲーム難易度</span>
                            <span className="font-bold text-sm text-zinc-200 uppercase">
                                {difficulty}
                            </span>
                        </div>
                        <div className="flex justify-between items-center border-t border-zinc-900 pt-3">
                            <span className="text-zinc-400 text-sm font-bold">獲得スコア</span>
                            <span className="text-2xl font-black text-amber-500 font-mono">{score} PTS</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 w-full">
                        <button
                            onClick={() => startGame(gameMode, difficulty)}
                            className="py-3 px-4 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold rounded-xl transition-all shadow-md shadow-red-950/40 uppercase tracking-widest text-sm"
                        >
                            もう一度プレイ
                        </button>
                        <button
                            onClick={returnToMenu}
                            className="py-3 px-4 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-gray-300 font-bold rounded-xl transition-all uppercase tracking-widest text-sm"
                        >
                            メインメニューに戻る
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
