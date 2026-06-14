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

export const MAP_WIDTH = 1200;
export const MAP_HEIGHT = 900;

export const gameMap: MapData = {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    rooms: [
        { name: '玄関 / 廊下', x: 550, y: 700, width: 100, height: 200 },
        { name: 'リビングルーム', x: 100, y: 300, width: 690, height: 400 },
        { name: 'キッチン / ダイニング', x: 800, y: 300, width: 300, height: 400 },
        { name: 'マスターベッドルーム', x: 100, y: 50, width: 590, height: 250 },
        { name: 'バスルーム / 洗面所', x: 700, y: 50, width: 400, height: 250 },
    ],
    walls: [
        // 外壁 (上、下、左、右)
        { id: 'w_top', x: 90, y: 40, width: 1020, height: 10 },
        { id: 'w_bottom_left', x: 90, y: 700, width: 460, height: 10 },
        { id: 'w_bottom_right', x: 650, y: 700, width: 460, height: 10 },
        { id: 'w_bottom_corridor_left', x: 540, y: 700, width: 10, height: 200 },
        { id: 'w_bottom_corridor_right', x: 650, y: 700, width: 10, height: 200 },
        // 下部ゲート開口部 (x: 550 ~ 640 の幅 90 の部分をゲートとし、そこには壁を置かない)
        { id: 'w_bottom_corridor_bottom_left', x: 540, y: 890, width: 20, height: 10 },
        { id: 'w_bottom_corridor_bottom_right', x: 640, y: 890, width: 20, height: 10 },
        { id: 'w_left', x: 90, y: 40, width: 10, height: 670 },
        { id: 'w_right', x: 1100, y: 40, width: 10, height: 670 },

        // 内壁（部屋の仕切り）
        // ベッドルーム and バスルームの仕切り
        { id: 'w_bed_bath', x: 690, y: 40, width: 10, height: 260 },
        // ベッドルーム/バスルームとリビング/キッチンの仕切り (廊下の開口部を除く)
        { id: 'w_floor1_divider_left', x: 90, y: 290, width: 400, height: 10 },
        { id: 'w_floor1_divider_right_1', x: 600, y: 290, width: 100, height: 10 },
        { id: 'w_floor1_divider_right_2', x: 800, y: 290, width: 310, height: 10 },
        // リビングとキッチンの仕切り (開口部あり)
        { id: 'w_liv_kit_top', x: 790, y: 290, width: 10, height: 160 },
        { id: 'w_liv_kit_bottom', x: 790, y: 550, width: 10, height: 160 },
    ],
    furniture: [
        // ベッドルーム
        { id: 'f_bed_1', name: 'ダブルベッド', type: 'bed', x: 150, y: 100, width: 140, height: 120, canHide: true, color: '#4b5563' },
        { id: 'f_closet_1', name: '大型クローゼット', type: 'closet', x: 340, y: 50, width: 140, height: 40, canHide: true, color: '#1f2937' },
        { id: 'f_closet_2', name: '小型クローゼット', type: 'closet', x: 530, y: 50, width: 80, height: 40, canHide: true, color: '#27272a' },
        { id: 'f_plant_1', name: '観葉植物', type: 'plant', x: 100, y: 250, width: 40, height: 40, canHide: true, color: '#047857' },

        // バスルーム
        { id: 'f_tub', name: 'バスタブ', type: 'bed', x: 990, y: 50, width: 100, height: 150, canHide: true, color: '#9ca3af' },
        { id: 'f_laundry', name: 'ドラム式洗濯機', type: 'counter', x: 700, y: 50, width: 60, height: 60, canHide: true, color: '#71717a' },
        { id: 'f_toilet', name: 'トイレ', type: 'toilet', x: 850, y: 50, width: 50, height: 50, canHide: false, color: '#d1d5db' },

        // リビングルーム
        { id: 'f_sofa_1', name: 'L字ソファ', type: 'sofa', x: 180, y: 360, width: 160, height: 120, canHide: true, color: '#1e3a8a' },
        { id: 'f_bookshelf', name: '本棚', type: 'closet', x: 100, y: 520, width: 40, height: 120, canHide: true, color: '#3f3f46' },
        { id: 'f_table_1', name: 'ローテーブル', type: 'table', x: 400, y: 390, width: 100, height: 60, canHide: false, color: '#b45309' },
        { id: 'f_tv', name: 'テレビ台', type: 'counter', x: 650, y: 360, width: 40, height: 120, canHide: false, color: '#374151' },
        { id: 'f_curtain_1', name: '厚手のカーテン', type: 'curtain', x: 100, y: 320, width: 20, height: 80, canHide: true, color: '#7f1d1d' },
        { id: 'f_plant_2', name: '観葉植物（大）', type: 'plant', x: 100, y: 660, width: 40, height: 40, canHide: true, color: '#047857' },

        // キッチン
        { id: 'f_counter_1', name: 'システムキッチン', type: 'counter', x: 800, y: 300, width: 290, height: 60, canHide: false, color: '#4b5563' },
        { id: 'f_pantry', name: '食器棚', type: 'closet', x: 1050, y: 420, width: 40, height: 100, canHide: true, color: '#52525b' },
        { id: 'f_dining_table', name: 'ダイニングテーブル', type: 'table', x: 860, y: 530, width: 130, height: 100, canHide: false, color: '#854d0e' },
        { id: 'f_fridge', name: '冷蔵庫', type: 'counter', x: 800, y: 420, width: 60, height: 60, canHide: false, color: '#374151' },

        // 玄関 / 廊下
        { id: 'f_shoes', name: '下駄箱', type: 'counter', x: 550, y: 720, width: 20, height: 80, canHide: false, color: '#78350f' },
    ],
    generators: [
        { id: 'gen_1', name: '発電機 (寝室)', x: 450, y: 200, width: 50, height: 40 },
        { id: 'gen_2', name: '発電機 (リビング)', x: 450, y: 600, width: 50, height: 40 },
        { id: 'gen_3', name: '発電機 (キッチン)', x: 950, y: 450, width: 50, height: 40 }
    ],
    exitGate: {
        id: 'exit_gate',
        name: '脱出ゲート',
        x: 560,
        y: 880,
        width: 80,
        height: 15
    },
    spawnPoints: {
        playerHider: { x: 600, y: 800 },
        playerSeeker: { x: 600, y: 800 },
        aiHiders: [
            { x: 250, y: 150 }, // ベッドルーム
            { x: 900, y: 150 }, // バスルーム
            { x: 450, y: 500 }, // リビング中央
        ],
        aiSeeker: { x: 600, y: 800 }, // 玄関から侵入
    }
};
