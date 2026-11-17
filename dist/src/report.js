/**
 * 比色报告：多光源下的 Lab / ΔE2000 / 条件等色评估。
 */
import { ILLUMINANTS, spectrumRMSE } from './spectral.js';
import { spectrumToXYZ, xyzToLab, illuminantWhite, deltaE2000, } from './color.js';
export function buildReport(targetRefl, sampleRefl, primaryIlluminantId) {
    const rows = ILLUMINANTS.map((illum) => {
        const white = illuminantWhite(illum);
        const t = xyzToLab(spectrumToXYZ(targetRefl, illum), white);
        const s = xyzToLab(spectrumToXYZ(sampleRefl, illum), white);
        return {
            illuminant: illum,
            target: t,
            sample: s,
            dE00: deltaE2000(t, s),
            dL: s.l - t.l,
            da: s.a - t.a,
            db: s.b - t.b,
        };
    });
    const primary = rows.find((r) => r.illuminant.id === primaryIlluminantId) ?? rows[0];
    const others = rows.filter((r) => r !== primary);
    const metamerismIndex = primary.dE00 <= 1.0 ? Math.max(...others.map((r) => r.dE00)) : null;
    return {
        rows,
        primaryDE: primary.dE00,
        metamerismIndex,
        spectralRMSE: spectrumRMSE(targetRefl, sampleRefl),
    };
}
