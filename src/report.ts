/**
 * 比色报告：多光源下的 Lab / ΔE2000 / 条件等色评估。
 */

import { Spectrum, Illuminant, ILLUMINANTS, spectrumRMSE } from './spectral.js';
import {
  Lab, spectrumToXYZ, xyzToLab, illuminantWhite, deltaE2000,
} from './color.js';

export interface IlluminantReport {
  illuminant: Illuminant;
  target: Lab;
  sample: Lab;
  dE00: number;
  dL: number;
  da: number;
  db: number;
}

export interface MatchReport {
  rows: IlluminantReport[];
  /** 主光源（当前渲染光源）下的 ΔE00 */
  primaryDE: number;
  /** 条件等色指数：主光源下匹配（ΔE≤1）时，其余光源下最大 ΔE00；主光源不匹配时为 null */
  metamerismIndex: number | null;
  /** 两条反射率光谱的 RMSE（光谱层面差异，与光源无关） */
  spectralRMSE: number;
}

export function buildReport(
  targetRefl: Spectrum,
  sampleRefl: Spectrum,
  primaryIlluminantId: string
): MatchReport {
  const rows: IlluminantReport[] = ILLUMINANTS.map((illum) => {
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
  const metamerismIndex =
    primary.dE00 <= 1.0 ? Math.max(...others.map((r) => r.dE00)) : null;

  return {
    rows,
    primaryDE: primary.dE00,
    metamerismIndex,
    spectralRMSE: spectrumRMSE(targetRefl, sampleRefl),
  };
}
