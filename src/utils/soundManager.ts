class SoundManager {
    private ctx: AudioContext | null = null;
    private isMuted: boolean = false;
    private ambientGain: GainNode | null = null;
    private ambientNodes: (OscillatorNode | BiquadFilterNode)[] = [];
    private lastHeartbeatTime: number = 0;
    private heartbeatInterval: number = 1000; // ms

    // ループ再生される発電機の作業音のGain管理 (発電機IDごとに保持)
    private activeGenGains: { [key: string]: GainNode } = {};
    private activeGenPanners: { [key: string]: StereoPannerNode } = {};
    private activeGenOscs: { [key: string]: OscillatorNode[] } = {};

    init() {
        if (this.ctx) return;
        try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            this.ctx = new AudioContextClass();
            this.startAmbient();
        } catch (e) {
            console.error('Failed to initialize Web Audio API:', e);
        }
    }

    setMute(mute: boolean) {
        this.isMuted = mute;
        if (this.ctx && this.ambientGain) {
            this.ambientGain.gain.setValueAtTime(
                mute ? 0 : 0.04,
                this.ctx.currentTime
            );
        }
        // ループ中のすべての発電機の音をミュート
        Object.keys(this.activeGenGains).forEach(genId => {
            const gainNode = this.activeGenGains[genId];
            if (gainNode) {
                gainNode.gain.setValueAtTime(0, this.ctx?.currentTime || 0);
            }
        });
    }

    getMuted(): boolean {
        return this.isMuted;
    }

    // 空間定位＆減衰用の共通ノード作成
    private createSpatialNodes(panValue: number, volumeValue: number): { panner: StereoPannerNode; gain: GainNode } | null {
        if (!this.ctx || this.isMuted) return null;
        this.resumeContext();

        try {
            const panner = this.ctx.createStereoPanner();
            panner.pan.setValueAtTime(Math.max(-1, Math.min(1, panValue)), this.ctx.currentTime);

            const gain = this.ctx.createGain();
            // 音量減衰の適用
            gain.gain.setValueAtTime(volumeValue, this.ctx.currentTime);

            panner.connect(gain);
            gain.connect(this.ctx.destination);

            return { panner, gain };
        } catch (e) {
            // ブラウザ互換性対応 (StereoPannerNode がサポートされていない場合)
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(volumeValue, this.ctx.currentTime);
            gain.connect(this.ctx.destination);
            return { panner: null as any, gain };
        }
    }

    // 懐中電灯クリック音 (プレイヤー自身なので中央・モノラル)
    playFlashlightClick() {
        if (!this.ctx || this.isMuted) return;
        this.resumeContext();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1200, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + 0.05);

        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.05);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.05);
    }

    // 足音 (キラーや他ハイダー用: 空間定位付き)
    playFootstep(pan: number = 0, volume: number = 0.15) {
        if (!this.ctx || this.isMuted) return;
        const spatial = this.createSpatialNodes(pan, volume);
        if (!spatial) return;

        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(55, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(8, this.ctx.currentTime + 0.12);

        spatial.gain.gain.setValueAtTime(volume, this.ctx.currentTime);
        spatial.gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);

        osc.connect(spatial.panner || spatial.gain);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.12);
    }

    // キラーのうなり声 (距離や方向に連動)
    playKillerGrowl(pan: number = 0, volume: number = 0.2) {
        if (!this.ctx || this.isMuted) return;
        const spatial = this.createSpatialNodes(pan, volume);
        if (!spatial) return;

        const osc = this.ctx.createOscillator();
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(65, this.ctx.currentTime);

        // LFOでピッチを揺らす (不気味な震え)
        lfo.frequency.setValueAtTime(6, this.ctx.currentTime);
        lfoGain.gain.setValueAtTime(5, this.ctx.currentTime);

        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);

        spatial.gain.gain.setValueAtTime(0.01, this.ctx.currentTime);
        spatial.gain.gain.linearRampToValueAtTime(volume, this.ctx.currentTime + 0.1);
        spatial.gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.8);

        osc.connect(spatial.panner || spatial.gain);

        lfo.start();
        osc.start();
        lfo.stop(this.ctx.currentTime + 0.8);
        osc.stop(this.ctx.currentTime + 0.8);
    }

    // 発見された時の不協和音
    playSpotted() {
        if (!this.ctx || this.isMuted) return;
        this.resumeContext();

        const freqs = [330, 345, 490];
        freqs.forEach((freq) => {
            if (!this.ctx) return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(freq * 1.6, this.ctx.currentTime + 0.6);

            gain.gain.setValueAtTime(0.14, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.6);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start();
            osc.stop(this.ctx.currentTime + 0.6);
        });
    }

    // 発電機作業ループ音の開始
    startGeneratorSound(genId: string, pan: number, volume: number) {
        if (!this.ctx || this.isMuted) return;
        this.resumeContext();

        // 既に鳴っている場合はスキップ
        if (this.activeGenGains[genId]) {
            this.updateGeneratorSound(genId, pan, volume);
            return;
        }

        const spatial = this.createSpatialNodes(pan, volume);
        if (!spatial) return;

        // モーター低音
        const osc1 = this.ctx.createOscillator();
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(50, this.ctx.currentTime);

        const osc2 = this.ctx.createOscillator();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(101, this.ctx.currentTime); // ハーモニクス

        // バンドパスフィルターで籠もらせる
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(250, this.ctx.currentTime);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(spatial.panner || spatial.gain);

        osc1.start();
        osc2.start();

        // ノードを保持
        this.activeGenGains[genId] = spatial.gain;
        if (spatial.panner) {
            this.activeGenPanners[genId] = spatial.panner;
        }
        this.activeGenOscs[genId] = [osc1, osc2];
    }

    // 発電機作業ループ音の更新 (毎フレーム呼び出し)
    updateGeneratorSound(genId: string, pan: number, volume: number) {
        if (!this.ctx || this.isMuted) return;
        const gainNode = this.activeGenGains[genId];
        if (gainNode) {
            gainNode.gain.setValueAtTime(volume, this.ctx.currentTime);
        }
        const pannerNode = this.activeGenPanners[genId];
        if (pannerNode) {
            pannerNode.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), this.ctx.currentTime);
        }
    }

    // 発電機作業ループ音の停止
    stopGeneratorSound(genId: string) {
        const oscs = this.activeGenOscs[genId];
        if (oscs) {
            oscs.forEach(osc => {
                try {
                    osc.stop();
                } catch(e) {}
            });
            delete this.activeGenOscs[genId];
        }

        const gain = this.activeGenGains[genId];
        if (gain) {
            try {
                gain.disconnect();
            } catch(e) {}
            delete this.activeGenGains[genId];
        }

        const panner = this.activeGenPanners[genId];
        if (panner) {
            try {
                panner.disconnect();
            } catch(e) {}
            delete this.activeGenPanners[genId];
        }
    }

    // 発電機爆発音 (スキルチェック失敗)
    playGeneratorExplode(pan: number = 0, volume: number = 0.4) {
        if (!this.ctx || this.isMuted) return;
        const spatial = this.createSpatialNodes(pan, volume);
        if (!spatial) return;

        // 低周波バースト
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(90, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(15, this.ctx.currentTime + 0.5);

        // ホワイトノイズ風の高音バーストの代わりとして、高周波三角波をフィルタで揺らす
        const noiseOsc = this.ctx.createOscillator();
        noiseOsc.type = 'sawtooth';
        noiseOsc.frequency.setValueAtTime(180, this.ctx.currentTime);
        noiseOsc.frequency.exponentialRampToValueAtTime(10, this.ctx.currentTime + 0.3);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(200, this.ctx.currentTime);

        osc.connect(spatial.panner || spatial.gain);
        noiseOsc.connect(filter);
        filter.connect(spatial.panner || spatial.gain);

        spatial.gain.gain.setValueAtTime(volume, this.ctx.currentTime);
        spatial.gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.6);

        osc.start();
        noiseOsc.start();
        osc.stop(this.ctx.currentTime + 0.6);
        noiseOsc.stop(this.ctx.currentTime + 0.6);
    }

    // 発電機修理完了音
    playGeneratorComplete(pan: number = 0, volume: number = 0.3) {
        if (!this.ctx || this.isMuted) return;
        const spatial = this.createSpatialNodes(pan, volume);
        if (!spatial) return;

        // 明るいチャイム (ドミソ)
        const now = this.ctx.currentTime;
        const playTone = (freq: number, delay: number) => {
            if (!this.ctx) return;
            const osc = this.ctx.createOscillator();
            const noteGain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + delay);

            noteGain.gain.setValueAtTime(0.25 * volume, now + delay);
            noteGain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.3);

            osc.connect(noteGain);
            noteGain.connect(spatial.panner || spatial.gain);

            osc.start(now + delay);
            osc.stop(now + delay + 0.3);
        };

        playTone(523.25, 0);      // C5 (ド)
        playTone(659.25, 0.1);    // E5 (ミ)
        playTone(783.99, 0.2);    // G5 (ソ)
        playTone(1046.50, 0.3);   // C6 (高いド)
    }

    // ゲート通電 (サイレン音)
    playGatePowerOn() {
        if (!this.ctx || this.isMuted) return;
        this.resumeContext();

        const now = this.ctx.currentTime;
        // 激しいサイレン音
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(300, now);
        osc1.frequency.linearRampToValueAtTime(450, now + 0.4);
        osc1.frequency.linearRampToValueAtTime(300, now + 0.8);

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(305, now);
        osc2.frequency.linearRampToValueAtTime(455, now + 0.4);
        osc2.frequency.linearRampToValueAtTime(305, now + 0.8);

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.ctx.destination);

        osc1.start();
        osc2.start();
        osc1.stop(now + 1.2);
        osc2.stop(now + 1.2);
    }

    // 心拍音
    updateHeartbeat(distanceFactor: number) {
        if (!this.ctx || this.isMuted || distanceFactor <= 0.1) {
            return;
        }
        this.resumeContext();

        const now = Date.now();
        this.heartbeatInterval = 1200 - distanceFactor * 950;

        if (now - this.lastHeartbeatTime > this.heartbeatInterval) {
            this.playHeartbeatSound(distanceFactor);
            this.lastHeartbeatTime = now;
        }
    }

    private playHeartbeatSound(volumeFactor: number) {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        const playThump = (delay: number, pitch: number, vol: number) => {
            if (!this.ctx) return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(pitch, now + delay);
            osc.frequency.exponentialRampToValueAtTime(10, now + delay + 0.15);

            const maxVolume = 0.45 * vol * volumeFactor;
            gain.gain.setValueAtTime(maxVolume, now + delay);
            gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.15);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now + delay);
            osc.stop(now + delay + 0.15);
        };

        playThump(0, 55, 1.0);
        playThump(0.15, 52, 0.7);
    }

    // 不気味な環境音の開始
    private startAmbient() {
        if (!this.ctx) return;
        this.resumeContext();

        this.ambientGain = this.ctx.createGain();
        this.ambientGain.gain.setValueAtTime(this.isMuted ? 0 : 0.04, this.ctx.currentTime);
        this.ambientGain.connect(this.ctx.destination);

        const osc1 = this.ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(45, this.ctx.currentTime);

        const osc2 = this.ctx.createOscillator();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(46.5, this.ctx.currentTime);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(100, this.ctx.currentTime);
        filter.Q.setValueAtTime(2.0, this.ctx.currentTime);

        osc1.connect(this.ambientGain);
        osc2.connect(filter);
        filter.connect(this.ambientGain);

        osc1.start();
        osc2.start();

        setInterval(() => {
            if (this.ctx && filter) {
                const targetFreq = 80 + Math.random() * 120;
                filter.frequency.exponentialRampToValueAtTime(targetFreq, this.ctx.currentTime + 1.5);
            }
        }, 2000);

        this.ambientNodes.push(osc1, osc2, filter);
    }

    stopAmbient() {
        this.ambientNodes.forEach(node => {
            try {
                if ('stop' in node) {
                    node.stop();
                }
            } catch (e) {}
        });
        this.ambientNodes = [];

        // 全ての発電機の音も止める
        Object.keys(this.activeGenOscs).forEach(genId => {
            this.stopGeneratorSound(genId);
        });
    }

    private resumeContext() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }
}

export const soundManager = new SoundManager();
