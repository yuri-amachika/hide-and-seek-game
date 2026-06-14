export interface Wall {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color?: string;
}

export interface Furniture {
    id: string;
    name: string;
    type: 'closet' | 'bed' | 'sofa' | 'table' | 'plant' | 'counter' | 'curtain' | 'toilet';
    x: number;
    y: number;
    width: number;
    height: number;
    canHide: boolean;
    color: string;
}

export interface Room {
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface GameGenerator {
    id: string;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface ExitGate {
    id: string;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface MapData {
    width: number;
    height: number;
    walls: Wall[];
    furniture: Furniture[];
    rooms: Room[];
    generators: GameGenerator[];
    exitGate: ExitGate;
    spawnPoints: {
        playerHider: { x: number; y: number };
        playerSeeker: { x: number; y: number };
        aiHiders: { x: number; y: number }[];
        aiSeeker: { x: number; y: number };
    };
}

export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 800;

export const gameMap: MapData = {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    rooms: [
        { name: '玄関 / 廊下', x: 450, y: 600, width: 100, height: 200 },
        { name: 'リビングルーム', x: 200, y: 250, width: 400, height: 350 },
        { name: 'キッチン / ダイニング', x: 600, y: 250, width: 200, height: 350 },
        { name: 'マスターベッドルーム', x: 200, y: 50, width: 350, height: 200 },
        { name: 'バスルーム / 洗面所', x: 550, y: 50, width: 250, height: 200 },
    ],
    walls: [
        // 外壁 (上、下、左、右)
        { id: 'w_top', x: 190, y: 40, width: 620, height: 10 },
        { id: 'w_bottom_left', x: 190, y: 600, width: 260, height: 10 },
        { id: 'w_bottom_right', x: 550, y: 600, width: 260, height: 10 },
        { id: 'w_bottom_corridor_left', x: 440, y: 600, width: 10, height: 200 },
        { id: 'w_bottom_corridor_right', x: 550, y: 600, width: 10, height: 200 },
        // 下部ゲート開口部 (x: 450 ~ 540 の幅 90 の部分をゲートとし、そこには壁を置かない)
        { id: 'w_bottom_corridor_bottom_left', x: 440, y: 790, width: 20, height: 10 },
        { id: 'w_bottom_corridor_bottom_right', x: 540, y: 790, width: 20, height: 10 },
        { id: 'w_left', x: 190, y: 40, width: 10, height: 570 },
        { id: 'w_right', x: 800, y: 40, width: 10, height: 570 },

        // 内壁（部屋の仕切り）
        // ベッドルームとバスルームの仕切り
        { id: 'w_bed_bath', x: 540, y: 40, width: 10, height: 210 },
        // ベッドルーム/バスルームとリビング/キッチンの仕切り (廊下の開口部を除く)
        { id: 'w_floor1_divider_left', x: 190, y: 240, width: 200, height: 10 },
        { id: 'w_floor1_divider_right', x: 490, y: 240, width: 320, height: 10 },
        // リビングとキッチンの仕切り (開口部あり)
        { id: 'w_liv_kit_top', x: 590, y: 240, width: 10, height: 120 },
        { id: 'w_liv_kit_bottom', x: 590, y: 450, width: 10, height: 160 },
    ],
    furniture: [
        // ベッドルーム
        { id: 'f_bed_1', name: 'ダブルベッド', type: 'bed', x: 220, y: 70, width: 120, height: 100, canHide: true, color: '#4b5563' },
        { id: 'f_closet_1', name: '大型クローゼット', type: 'closet', x: 400, y: 50, width: 120, height: 40, canHide: true, color: '#1f2937' },
        { id: 'f_plant_1', name: '観葉植物', type: 'plant', x: 200, y: 190, width: 30, height: 30, canHide: true, color: '#047857' },

        // バスルーム
        { id: 'f_tub', name: 'バスタブ', type: 'bed', x: 700, y: 60, width: 80, height: 120, canHide: true, color: '#9ca3af' },
        { id: 'f_toilet', name: 'トイレ', type: 'toilet', x: 570, y: 60, width: 40, height: 40, canHide: false, color: '#d1d5db' },

        // リビングルーム
        { id: 'f_sofa_1', name: 'L字ソファ', type: 'sofa', x: 230, y: 320, width: 140, height: 100, canHide: true, color: '#1e3a8a' },
        { id: 'f_table_1', name: 'ローテーブル', type: 'table', x: 260, y: 440, width: 80, height: 50, canHide: false, color: '#b45309' },
        { id: 'f_tv', name: 'テレビ台', type: 'counter', x: 420, y: 320, width: 30, height: 100, canHide: false, color: '#374151' },
        { id: 'f_curtain_1', name: '厚手のカーテン', type: 'curtain', x: 200, y: 500, width: 20, height: 80, canHide: true, color: '#7f1d1d' },
        { id: 'f_plant_2', name: '観葉植物（大）', type: 'plant', x: 200, y: 260, width: 40, height: 40, canHide: true, color: '#047857' },

        // キッチン
        { id: 'f_counter_1', name: 'システムキッチン', type: 'counter', x: 620, y: 250, width: 160, height: 60, canHide: false, color: '#4b5563' },
        { id: 'f_dining_table', name: 'ダイニングテーブル', type: 'table', x: 640, y: 420, width: 100, height: 100, canHide: false, color: '#854d0e' },
        { id: 'f_fridge', name: '冷蔵庫', type: 'counter', x: 740, y: 310, width: 50, height: 50, canHide: false, color: '#374151' },

        // 玄関 / 廊下
        { id: 'f_shoes', name: '下駄箱', type: 'counter', x: 450, y: 620, width: 20, height: 80, canHide: false, color: '#78350f' },
    ],
    generators: [
        { id: 'gen_1', name: '発電機 (寝室)', x: 280, y: 190, width: 50, height: 40 },
        { id: 'gen_2', name: '発電機 (リビング)', x: 500, y: 450, width: 50, height: 40 },
        { id: 'gen_3', name: '発電機 (キッチン)', x: 720, y: 450, width: 50, height: 40 }
    ],
    exitGate: {
        id: 'exit_gate',
        name: '脱出ゲート',
        x: 460,
        y: 780,
        width: 80,
        height: 15
    },
    spawnPoints: {
        playerHider: { x: 495, y: 700 }, // 玄関付近
        playerSeeker: { x: 495, y: 700 },
        aiHiders: [
            { x: 300, y: 150 }, // ベッドルーム
            { x: 650, y: 150 }, // バスルーム
            { x: 480, y: 400 }, // リビング中央
        ],
        aiSeeker: { x: 495, y: 700 }, // 玄関から侵入
    }
};
