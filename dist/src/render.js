/**
 * Canvas 渲染：
 * 1) 漆膜比色面板 —— 逐像素：清漆 Fresnel 高光（橘皮法线扰动）+ 铝片微面片闪烁 + 翻转效应
 * 2) 光谱反射率曲线图 —— 目标 vs 当前配方
 */
import { flopFactor, clearcoatFresnel } from './paint.js';
import { linearToSrgb } from './color.js';
import { WAVELENGTHS, N_BANDS } from './spectral.js';
/* ---------- 确定性噪声（同一漆样同一像素结果稳定，换视角连续变化） ---------- */
function hash2(x, y, seed) {
    let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
}
/** 平滑值噪声，用于橘皮。 */
function valueNoise(x, y, scale, seed) {
    const fx = x / scale, fy = y / scale;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const v00 = hash2(x0, y0, seed);
    const v10 = hash2(x0 + 1, y0, seed);
    const v01 = hash2(x0, y0 + 1, seed);
    const v11 = hash2(x0 + 1, y0 + 1, seed);
    return (v00 * (1 - sx) * (1 - sy) +
        v10 * sx * (1 - sy) +
        v01 * (1 - sx) * sy +
        v11 * sx * sy);
}
function normalize(v) {
    const l = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / l, y: v.y / l, z: v.z / l };
}
/**
 * 把一块漆渲染到 canvas。
 * 微面片闪烁：每像素一个固定薄片法线；视角变化 → 半角向量变化 → 不同像素亮起。
 */
export function renderPanel(canvas, input) {
    const ctx = canvas.getContext('2d');
    if (!ctx)
        return;
    const w = canvas.width, h = canvas.height;
    const img = ctx.createImageData(w, h);
    const data = img.data;
    const { effects } = input.sample;
    const viewRad = (input.viewDeg * Math.PI) / 180;
    const view = normalize({ x: Math.sin(viewRad), y: 0, z: Math.cos(viewRad) });
    const light = normalize({ x: -0.38, y: -0.5, z: 0.78 });
    const half = normalize({
        x: view.x + light.x, y: view.y + light.y, z: view.z + light.z,
    });
    const viewCos = Math.max(view.z, 0.05);
    const flop = flopFactor(viewCos, effects);
    // 铝片参数：粒径越大闪点越疏越锐
    const flakeSharp = 300 + 3200 * effects.flakeSize;
    const flakeCell = Math.max(2, Math.round(6 - 4 * effects.flakeSize)); // 闪点晶格尺寸(px)
    const peelAmp = effects.orangePeel * 0.22; // 法线扰动幅度
    const seed = input.seed;
    const body = input.bodyLinear;
    const tint = input.tintLinear;
    for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
            // --- 清漆层：橘皮法线扰动（两个倍频的低频噪声） ---
            const nx = (valueNoise(px, py, 9, seed) - 0.5) * 2 * peelAmp +
                (valueNoise(px, py, 23, seed + 7) - 0.5) * peelAmp;
            const ny = (valueNoise(px, py, 9, seed + 13) - 0.5) * 2 * peelAmp +
                (valueNoise(px, py, 23, seed + 29) - 0.5) * peelAmp;
            const n = normalize({ x: nx, y: ny, z: 1 });
            const ndl = Math.max(n.x * light.x + n.y * light.y + n.z * light.z, 0);
            const ndh = Math.max(n.x * half.x + n.y * half.y + n.z * half.z, 0);
            const ndv = Math.max(n.x * view.x + n.y * view.y + n.z * view.z, 0);
            // --- 色漆层本体：朗伯明暗 × 翻转系数 ---
            const shade = (0.72 + 0.28 * ndl) * flop;
            let r = body.r * shade;
            let g = body.g * shade;
            let b = body.b * shade;
            // --- 铝粉微面片闪烁 ---
            if (input.sample.effects.metallic > 0.001) {
                const cx = Math.floor(px / flakeCell), cy = Math.floor(py / flakeCell);
                const presence = hash2(cx, cy, seed + 101);
                if (presence < effects.metallic * 0.55) {
                    // 薄片法线：围绕漆膜法线随机倾斜（最大约 25°）
                    const az = hash2(cx, cy, seed + 102) * Math.PI * 2;
                    const tilt = hash2(cx, cy, seed + 103) * 0.44;
                    const fn = normalize({
                        x: Math.sin(tilt) * Math.cos(az),
                        y: Math.sin(tilt) * Math.sin(az),
                        z: Math.cos(tilt),
                    });
                    const fdh = Math.max(fn.x * half.x + fn.y * half.y + fn.z * half.z, 0);
                    const glint = Math.pow(fdh, flakeSharp) * effects.metallic * 2.2;
                    // 闪点略染光源色，侧视时整体衰减
                    const att = 0.35 + 0.65 * flop;
                    r += glint * tint.r * att;
                    g += glint * tint.g * att;
                    b += glint * tint.b * att;
                }
            }
            // --- 清漆层：独立 Fresnel 镜面反射（不染色，取光源色） ---
            const fres = clearcoatFresnel(ndv);
            const glossLobe = Math.pow(ndh, 700) * 1.4;
            const spec = fres * (glossLobe + 0.035);
            r += spec * tint.r;
            g += spec * tint.g;
            b += spec * tint.b;
            // --- 线性 → sRGB，写像素 ---
            const i = (py * w + px) * 4;
            data[i] = Math.round(Math.min(Math.max(linearToSrgb(r), 0), 1) * 255);
            data[i + 1] = Math.round(Math.min(Math.max(linearToSrgb(g), 0), 1) * 255);
            data[i + 2] = Math.round(Math.min(Math.max(linearToSrgb(b), 0), 1) * 255);
            data[i + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
}
export function renderSpectrumChart(canvas, series, illum) {
    const ctx = canvas.getContext('2d');
    if (!ctx)
        return;
    const w = canvas.width, h = canvas.height;
    const padL = 40, padR = 12, padT = 14, padB = 26;
    const iw = w - padL - padR, ih = h - padT - padB;
    const styles = getComputedStyle(canvas);
    const fg = styles.color || '#ccc';
    ctx.clearRect(0, 0, w, h);
    const xOf = (lambda) => padL + ((lambda - 400) / 300) * iw;
    const yOf = (v) => padT + (1 - v) * ih;
    // 光源 SPD 淡背景（归一化）
    if (illum) {
        const maxS = Math.max(...illum.spd);
        ctx.beginPath();
        ctx.moveTo(xOf(400), yOf(0));
        for (let i = 0; i < N_BANDS; i++) {
            ctx.lineTo(xOf(WAVELENGTHS[i]), yOf(illum.spd[i] / maxS));
        }
        ctx.lineTo(xOf(700), yOf(0));
        ctx.closePath();
        ctx.fillStyle = 'rgba(128,128,128,0.12)';
        ctx.fill();
    }
    // 网格与坐标
    ctx.strokeStyle = 'rgba(128,128,128,0.25)';
    ctx.fillStyle = fg;
    ctx.font = '10px system-ui, sans-serif';
    ctx.lineWidth = 1;
    for (let v = 0; v <= 1.0001; v += 0.2) {
        ctx.beginPath();
        ctx.moveTo(padL, yOf(v));
        ctx.lineTo(w - padR, yOf(v));
        ctx.stroke();
        ctx.fillText(v.toFixed(1), 8, yOf(v) + 3);
    }
    for (let l = 400; l <= 700; l += 50) {
        ctx.beginPath();
        ctx.moveTo(xOf(l), padT);
        ctx.lineTo(xOf(l), h - padB);
        ctx.stroke();
        ctx.fillText(String(l), xOf(l) - 10, h - 8);
    }
    ctx.fillText('λ/nm', w - 44, h - 8);
    // 曲线
    for (const s of series) {
        ctx.beginPath();
        for (let i = 0; i < N_BANDS; i++) {
            const x = xOf(WAVELENGTHS[i]);
            const y = yOf(Math.min(Math.max(s.spectrum[i], 0), 1));
            if (i === 0)
                ctx.moveTo(x, y);
            else
                ctx.lineTo(x, y);
        }
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2;
        ctx.setLineDash(s.dashed ? [5, 4] : []);
        ctx.stroke();
        ctx.setLineDash([]);
    }
}
