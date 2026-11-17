/**
 * 漆膜模型。
 * 结构：色漆层（KM 混合光谱）+ 铝粉效应层 + 清漆层。
 * - 色漆层：配方 → 光谱反射率（见 pigments.ts）
 * - 铝粉：微面片模型，每像素一个固定朝向的薄片法线，视角变化时高光逐点跳闪
 * - 翻转效应(flip-flop)：正视亮、侧视暗，强度可调
 * - 清漆层：独立 Fresnel 镜面反射，橘皮用低频法线扰动
 */

import { Spectrum, Illuminant } from './spectral.js';
import { Pigment, mixReflectance } from './pigments.js';
import { spectrumToXYZ, xyzToLinearSrgb, RGB } from './color.js';

export interface Recipe {
  /** pigmentId -> 重量份 */
  weights: Record<string, number>;
}

export interface EffectParams {
  /** 铝粉含量 0..1 */
  metallic: number;
  /** 铝片粒径（影响闪烁锐度）0..1 */
  flakeSize: number;
  /** 翻转效应强度（正/侧面亮度差）0..1 */
  flop: number;
  /** 清漆橘皮（法线扰动幅度）0..1 */
  orangePeel: number;
}

export interface PaintSample {
  name: string;
  recipe: Recipe;
  effects: EffectParams;
}

/** 由配方算色漆层光谱反射率。 */
export function baseReflectance(sample: PaintSample, pigments: Pigment[]): Spectrum {
  const entries = pigments
    .filter((p) => (sample.recipe.weights[p.id] ?? 0) > 0)
    .map((p) => ({ pigment: p, weight: sample.recipe.weights[p.id] }));
  return mixReflectance(entries);
}

/**
 * 某光源下漆膜本体的线性 sRGB（未加清漆高光与闪烁）。
 * 每个 (配方, 光源) 组合只算一次，渲染时按像素乘明暗系数。
 */
export function bodyColorLinear(sample: PaintSample, refl: Spectrum, illum: Illuminant): RGB {
  return xyzToLinearSrgb(spectrumToXYZ(refl, illum));
}

/** 光源颜色（清漆高光/铝片闪点着色用），线性 sRGB，归一到 Y=1。 */
export function illuminantTintLinear(illum: Illuminant): RGB {
  const white = new Array<number>(31).fill(1);
  const xyz = spectrumToXYZ(white, illum);
  const s = 100 / xyz.y;
  return xyzToLinearSrgb({ x: xyz.x * s, y: xyz.y * s, z: xyz.z * s });
}

/**
 * 翻转效应亮度系数。
 * viewCos = 视线与法线夹角余弦（1=正视，0=掠射）。
 * 金属含量越高、flop 越大，侧视越暗。
 */
export function flopFactor(viewCos: number, effects: EffectParams): number {
  const grazing = Math.pow(1 - viewCos, 1.6);
  const depth = effects.flop * (0.35 + 0.65 * effects.metallic);
  return 1 - 0.75 * depth * grazing;
}

/** 清漆 Fresnel（Schlick，F0=0.04 对应 n≈1.5 的罩光清漆）。 */
export function clearcoatFresnel(cosTheta: number): number {
  const c = Math.min(Math.max(cosTheta, 0), 1);
  return 0.04 + 0.96 * Math.pow(1 - c, 5);
}
