/**
 * 颜料库 + Kubelka-Munk 单常数混色。
 * 每种颜料存 K/S（吸收/散射）曲线；混合时按浓度加权 K/S，再反解反射率：
 *   R = 1 + K/S - sqrt((K/S)^2 + 2·K/S)
 * 配方改比例 → 重新混合 → 新光谱，全部实时。
 */
import { N_BANDS } from './spectral.js';
/** 由反射率反推 K/S（单常数 KM 逆变换）。 */
export function ksFromReflectance(r) {
    return r.map((v) => {
        const c = Math.min(Math.max(v, 1e-4), 0.9999);
        return ((1 - c) * (1 - c)) / (2 * c);
    });
}
/** 由 K/S 求反射率（KM 正变换）。 */
export function reflectanceFromKS(ks) {
    return 1 + ks - Math.sqrt(ks * ks + 2 * ks);
}
/** 按浓度（任意正数权重，内部归一）混合一组颜料的 K/S，得反射率光谱。 */
export function mixReflectance(entries) {
    const active = entries.filter((e) => e.weight > 0);
    if (active.length === 0) {
        // 空配方：给中灰，避免除零
        return new Array(N_BANDS).fill(0.18);
    }
    const total = active.reduce((s, e) => s + e.weight, 0);
    const out = new Array(N_BANDS);
    for (let i = 0; i < N_BANDS; i++) {
        let ks = 0;
        for (const e of active)
            ks += (e.weight / total) * e.pigment.ks[i];
        out[i] = reflectanceFromKS(ks);
    }
    return out;
}
function flat(v) {
    return new Array(N_BANDS).fill(v);
}
/** 400–700nm / 10nm 的本色反射率曲线（合成但形态符合常见汽车漆颜料）。 */
const R_TIO2_WHITE = [
    0.88, 0.90, 0.91, 0.92, 0.930, 0.935, 0.94, 0.94, 0.94, 0.94, 0.94,
    0.94, 0.94, 0.94, 0.94, 0.94, 0.94, 0.94, 0.94, 0.94, 0.94, 0.94,
    0.94, 0.94, 0.94, 0.94, 0.94, 0.94, 0.94, 0.94, 0.94,
];
const R_CARBON_BLACK = flat(0.030).map((v, i) => v + i * 0.0004); // 微升
const R_RED = [
    0.050, 0.050, 0.050, 0.050, 0.050, 0.050, 0.060, 0.060, 0.060, 0.060,
    0.060, 0.060, 0.060, 0.060, 0.060, 0.060, 0.070, 0.100, 0.180, 0.320,
    0.480, 0.580, 0.640, 0.670, 0.680, 0.690, 0.690, 0.700, 0.700, 0.700,
    0.700,
];
const R_YELLOW = [
    0.060, 0.060, 0.060, 0.060, 0.060, 0.060, 0.060, 0.060, 0.100, 0.180,
    0.320, 0.480, 0.600, 0.680, 0.720, 0.740, 0.750, 0.760, 0.760, 0.760,
    0.760, 0.760, 0.760, 0.760, 0.760, 0.760, 0.760, 0.760, 0.760, 0.760,
    0.760,
];
const R_PHTHALO_BLUE = [
    0.200, 0.280, 0.360, 0.420, 0.450, 0.460, 0.450, 0.420, 0.360, 0.280,
    0.200, 0.130, 0.090, 0.070, 0.060, 0.050, 0.050, 0.040, 0.040, 0.040,
    0.040, 0.040, 0.040, 0.040, 0.040, 0.040, 0.040, 0.040, 0.040, 0.040,
    0.040,
];
const R_PHTHALO_GREEN = [
    0.080, 0.100, 0.120, 0.140, 0.150, 0.150, 0.160, 0.200, 0.280, 0.380,
    0.460, 0.500, 0.480, 0.420, 0.320, 0.220, 0.140, 0.090, 0.070, 0.060,
    0.050, 0.050, 0.050, 0.050, 0.050, 0.050, 0.050, 0.050, 0.050, 0.050,
    0.050,
];
const R_ORANGE = [
    0.060, 0.060, 0.060, 0.060, 0.060, 0.060, 0.060, 0.060, 0.060, 0.060,
    0.060, 0.070, 0.080, 0.100, 0.140, 0.220, 0.340, 0.480, 0.600, 0.680,
    0.720, 0.740, 0.740, 0.740, 0.740, 0.740, 0.740, 0.740, 0.740, 0.740,
    0.740,
];
const R_VIOLET = [
    0.300, 0.340, 0.320, 0.260, 0.200, 0.140, 0.100, 0.080, 0.060, 0.050,
    0.040, 0.040, 0.040, 0.040, 0.040, 0.040, 0.040, 0.050, 0.050, 0.060,
    0.070, 0.090, 0.120, 0.160, 0.200, 0.240, 0.270, 0.290, 0.300, 0.310,
    0.310,
];
export const PIGMENTS = [
    { id: 'white', name: '钛白', swatch: '#f2f2f0', ks: ksFromReflectance(R_TIO2_WHITE) },
    { id: 'black', name: '炭黑', swatch: '#1c1c1e', ks: ksFromReflectance(R_CARBON_BLACK) },
    { id: 'red', name: '大红', swatch: '#c01a20', ks: ksFromReflectance(R_RED) },
    { id: 'yellow', name: '中黄', swatch: '#e8b820', ks: ksFromReflectance(R_YELLOW) },
    { id: 'blue', name: '酞菁蓝', swatch: '#1a4f9c', ks: ksFromReflectance(R_PHTHALO_BLUE) },
    { id: 'green', name: '酞菁绿', swatch: '#1a7a4a', ks: ksFromReflectance(R_PHTHALO_GREEN) },
    { id: 'orange', name: '橙', swatch: '#d96a1e', ks: ksFromReflectance(R_ORANGE) },
    { id: 'violet', name: '紫', swatch: '#5a3a8a', ks: ksFromReflectance(R_VIOLET) },
];
export function getPigment(id) {
    const p = PIGMENTS.find((x) => x.id === id);
    if (!p)
        throw new Error(`未知颜料: ${id}`);
    return p;
}
