/**
 * 色度学：光谱 → XYZ → Lab / sRGB，CIEDE2000 色差。
 * 白点取当前光源自身的白（完全漫反射体在该光源下的三刺激值），
 * 这样条件等色评估在不同光源下各自正确。
 */
import { CMF_X, CMF_Y, CMF_Z, N_BANDS, } from './spectral.js';
/** 光源白点（R=1 的理想白）。 */
export function illuminantWhite(illum) {
    return spectrumToXYZ(ones(), illum);
}
function ones() {
    return new Array(N_BANDS).fill(1);
}
/** 反射率光谱在指定光源下的三刺激值，Y 归一到理想白 = 100。 */
export function spectrumToXYZ(refl, illum) {
    let kSum = 0;
    for (let i = 0; i < N_BANDS; i++)
        kSum += illum.spd[i] * CMF_Y[i];
    const k = 100 / kSum;
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < N_BANDS; i++) {
        const s = illum.spd[i] * refl[i];
        x += s * CMF_X[i];
        y += s * CMF_Y[i];
        z += s * CMF_Z[i];
    }
    return { x: x * k, y: y * k, z: z * k };
}
const DELTA = 6 / 29;
function labF(t) {
    return t > DELTA ** 3 ? Math.cbrt(t) : t / (3 * DELTA * DELTA) + 4 / 29;
}
export function xyzToLab(xyz, white) {
    const fx = labF(xyz.x / white.x);
    const fy = labF(xyz.y / white.y);
    const fz = labF(xyz.z / white.z);
    return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}
export function labToXyz(lab, white) {
    const fy = (lab.l + 16) / 116;
    const fx = fy + lab.a / 500;
    const fz = fy - lab.b / 200;
    const inv = (f) => f > DELTA ? f ** 3 : 3 * DELTA * DELTA * (f - 4 / 29);
    return { x: white.x * inv(fx), y: white.y * inv(fy), z: white.z * inv(fz) };
}
/** XYZ（Y=100 标度）→ 线性 sRGB（0..1，未 gamma）。 */
export function xyzToLinearSrgb(xyz) {
    const x = xyz.x / 100, y = xyz.y / 100, z = xyz.z / 100;
    return {
        r: 3.2406 * x - 1.5372 * y - 0.4986 * z,
        g: -0.9689 * x + 1.8758 * y + 0.0415 * z,
        b: 0.0557 * x - 0.2040 * y + 1.0570 * z,
    };
}
export function linearToSrgb(c) {
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}
export function xyzToSrgb(xyz) {
    const lin = xyzToLinearSrgb(xyz);
    return {
        r: linearToSrgb(lin.r),
        g: linearToSrgb(lin.g),
        b: linearToSrgb(lin.b),
    };
}
/** 光谱 → 显示器 sRGB（0..1）。 */
export function spectrumToSrgb(refl, illum) {
    return xyzToSrgb(spectrumToXYZ(refl, illum));
}
/**
 * CIEDE2000 色差（kL=kC=kH=1）。
 * 实现参照 Sharma, Wu, Dalal (2005)，对其公开测试数据误差 < 0.1。
 */
export function deltaE2000(c1, c2) {
    const rad = Math.PI / 180;
    const deg = 180 / Math.PI;
    const C1 = Math.hypot(c1.a, c1.b);
    const C2 = Math.hypot(c2.a, c2.b);
    const cBar = (C1 + C2) / 2;
    const cBar7 = cBar ** 7;
    const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + 25 ** 7)));
    const a1p = c1.a * (1 + g);
    const a2p = c2.a * (1 + g);
    const C1p = Math.hypot(a1p, c1.b);
    const C2p = Math.hypot(a2p, c2.b);
    const hOf = (ap, b) => {
        const h = Math.atan2(b, ap) * deg;
        return h < 0 ? h + 360 : h;
    };
    const h1p = C1p === 0 ? 0 : hOf(a1p, c1.b);
    const h2p = C2p === 0 ? 0 : hOf(a2p, c2.b);
    const dLp = c2.l - c1.l;
    const dCp = C2p - C1p;
    let dhp;
    if (C1p * C2p === 0) {
        dhp = 0;
    }
    else {
        dhp = h2p - h1p;
        if (dhp > 180)
            dhp -= 360;
        else if (dhp < -180)
            dhp += 360;
    }
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
    const lBarP = (c1.l + c2.l) / 2;
    const cBarP = (C1p + C2p) / 2;
    let hBarP;
    if (C1p * C2p === 0) {
        hBarP = h1p + h2p;
    }
    else if (Math.abs(h1p - h2p) <= 180) {
        hBarP = (h1p + h2p) / 2;
    }
    else {
        hBarP = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
    }
    const t = 1 -
        0.17 * Math.cos((hBarP - 30) * rad) +
        0.24 * Math.cos(2 * hBarP * rad) +
        0.32 * Math.cos((3 * hBarP + 6) * rad) -
        0.2 * Math.cos((4 * hBarP - 63) * rad);
    const dTheta = 30 * Math.exp(-(((hBarP - 275) / 25) ** 2));
    const cBarP7 = cBarP ** 7;
    const rc = 2 * Math.sqrt(cBarP7 / (cBarP7 + 25 ** 7));
    const sl = 1 + (0.015 * (lBarP - 50) ** 2) / Math.sqrt(20 + (lBarP - 50) ** 2);
    const sc = 1 + 0.045 * cBarP;
    const sh = 1 + 0.015 * cBarP * t;
    const rt = -Math.sin(2 * dTheta * rad) * rc;
    const dL = dLp / sl;
    const dC = dCp / sc;
    const dH = dHp / sh;
    return Math.sqrt(dL * dL + dC * dC + dH * dH + rt * dC * dH);
}
