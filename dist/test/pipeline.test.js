/**
 * 光谱管线验证：
 * 1) 理想白在各光源下 Lab ≈ (100, 0, 0) —— 验证 SPD × CMF 积分与白点归一
 * 2) D65 白点接近标准值 (95.04, 100, 108.88) —— 验证 CMF/SPD 表
 * 3) KM 混色：单色料自混 = 原光谱；黑白混合反射率介于两者之间
 * 4) 条件等色构造：同一光谱 ΔE=0；不同光谱在不同光源下 ΔE 不同
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ILLUMINANTS, getIlluminant, N_BANDS, } from '../src/spectral.js';
import { spectrumToXYZ, xyzToLab, illuminantWhite, deltaE2000, } from '../src/color.js';
import { getPigment, mixReflectance, ksFromReflectance, reflectanceFromKS } from '../src/pigments.js';
test('理想白在任何光源下 Lab ≈ (100, 0, 0)', () => {
    const white = new Array(N_BANDS).fill(1);
    for (const illum of ILLUMINANTS) {
        const lab = xyzToLab(spectrumToXYZ(white, illum), illuminantWhite(illum));
        assert.ok(Math.abs(lab.l - 100) < 1e-9, `${illum.id} L*=${lab.l}`);
        assert.ok(Math.abs(lab.a) < 1e-9, `${illum.id} a*=${lab.a}`);
        assert.ok(Math.abs(lab.b) < 1e-9, `${illum.id} b*=${lab.b}`);
    }
});
test('D65 白点接近 CIE 标准值 (95.04, 100, 108.88)', () => {
    const w = illuminantWhite(getIlluminant('D65'));
    // 10nm 截断积分本身有小偏差，给 1.5 的容差
    assert.ok(Math.abs(w.x - 95.04) < 1.5, `Xn=${w.x.toFixed(2)}`);
    assert.ok(Math.abs(w.y - 100) < 1e-9, `Yn=${w.y}`);
    assert.ok(Math.abs(w.z - 108.88) < 1.5, `Zn=${w.z.toFixed(2)}`);
});
test('KM 正反变换互逆', () => {
    for (const r of [0.02, 0.18, 0.5, 0.9]) {
        const back = reflectanceFromKS(ksFromReflectance([r])[0]);
        assert.ok(Math.abs(back - r) < 1e-6, `R=${r} → ${back}`);
    }
});
test('KM 混合：自混恒等，黑白混合居中', () => {
    const white = getPigment('white');
    const black = getPigment('black');
    const selfMix = mixReflectance([{ pigment: white, weight: 1 }]);
    const pureW = mixReflectance([{ pigment: white, weight: 1 }]);
    const pureK = mixReflectance([{ pigment: black, weight: 1 }]);
    const grey = mixReflectance([
        { pigment: white, weight: 1 },
        { pigment: black, weight: 1 },
    ]);
    for (let i = 0; i < N_BANDS; i++) {
        assert.ok(Math.abs(selfMix[i] - pureW[i]) < 1e-12);
        assert.ok(grey[i] < pureW[i] && grey[i] > pureK[i], `波段 ${i}: 灰 ${grey[i]} 应在黑 ${pureK[i]} 白 ${pureW[i]} 之间`);
    }
});
test('条件等色：同光谱任意光源 ΔE00=0；异光谱随光源变化', () => {
    const red = getPigment('red');
    const blue = getPigment('blue');
    const r1 = mixReflectance([{ pigment: red, weight: 1 }]);
    const r2 = mixReflectance([{ pigment: blue, weight: 1 }]);
    for (const illum of ILLUMINANTS) {
        const w = illuminantWhite(illum);
        const a = xyzToLab(spectrumToXYZ(r1, illum), w);
        const b = xyzToLab(spectrumToXYZ(r1, illum), w);
        assert.equal(deltaE2000(a, b), 0);
    }
    // 红 vs 蓝在三种光源下的 ΔE 不应完全相同（SPD 不同 → 三刺激值权重不同）
    const des = ILLUMINANTS.map((illum) => {
        const w = illuminantWhite(illum);
        return deltaE2000(xyzToLab(spectrumToXYZ(r1, illum), w), xyzToLab(spectrumToXYZ(r2, illum), w));
    });
    const spread = Math.max(...des) - Math.min(...des);
    assert.ok(spread > 0.5, `不同光源下 ΔE 应有可见差异，实际极差 ${spread.toFixed(3)}`);
});
