/**
 * 色卡库：每张色卡 = 一个完整漆样（配方 + 效应参数）。
 * 色卡的颜色全部来自光谱（配方经 KM 混合得反射率曲线），不是 RGB。
 */
export const COLOR_CARDS = [
    {
        id: 'silver-met',
        name: '经典银灰金属漆',
        note: '铝粉为主，微灰底，强翻转',
        recipe: { weights: { white: 55, black: 6 } },
        effects: { metallic: 0.9, flakeSize: 0.6, flop: 0.8, orangePeel: 0.25 },
    },
    {
        id: 'gem-blue',
        name: '宝石蓝金属漆',
        note: '酞菁蓝 + 铝粉，中等闪烁',
        recipe: { weights: { blue: 38, white: 14, black: 3 } },
        effects: { metallic: 0.55, flakeSize: 0.45, flop: 0.6, orangePeel: 0.3 },
    },
    {
        id: 'flame-red',
        name: '烈焰红',
        note: '实色红，清漆橘皮明显',
        recipe: { weights: { red: 70, orange: 12, black: 2 } },
        effects: { metallic: 0.0, flakeSize: 0.3, flop: 0.0, orangePeel: 0.55 },
    },
    {
        id: 'british-green',
        name: '英伦绿',
        note: '深绿实色',
        recipe: { weights: { green: 40, black: 10, yellow: 6 } },
        effects: { metallic: 0.0, flakeSize: 0.3, flop: 0.0, orangePeel: 0.35 },
    },
    {
        id: 'champagne',
        name: '香槟金',
        note: '黄+微量红黑，细铝粉',
        recipe: { weights: { white: 60, yellow: 16, red: 3, black: 2 } },
        effects: { metallic: 0.5, flakeSize: 0.8, flop: 0.55, orangePeel: 0.2 },
    },
    {
        id: 'violet-flip',
        name: '紫罗兰效应漆',
        note: '紫+蓝，强翻转演示',
        recipe: { weights: { violet: 45, blue: 10, black: 4 } },
        effects: { metallic: 0.7, flakeSize: 0.5, flop: 0.95, orangePeel: 0.3 },
    },
    {
        id: 'pure-white',
        name: '素白',
        note: '钛白实色',
        recipe: { weights: { white: 100 } },
        effects: { metallic: 0.0, flakeSize: 0.3, flop: 0.0, orangePeel: 0.4 },
    },
    {
        id: 'jet-black',
        name: '钢琴黑',
        note: '炭黑实色，看清漆高光',
        recipe: { weights: { black: 100 } },
        effects: { metallic: 0.0, flakeSize: 0.3, flop: 0.0, orangePeel: 0.15 },
    },
];
