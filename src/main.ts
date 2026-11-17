/**
 * UI 主控：色卡库 / 配方 / 光源 / 渲染比色 / 差异报告。
 * 任何输入变化 → 重算光谱 → 重渲染 → 重出报告，全部同步完成。
 */

import { ILLUMINANTS, getIlluminant, Illuminant } from './spectral.js';
import { spectrumToSrgb } from './color.js';
import { PIGMENTS } from './pigments.js';
import {
  PaintSample, EffectParams, baseReflectance, bodyColorLinear, illuminantTintLinear,
} from './paint.js';
import { COLOR_CARDS, ColorCard } from './cards.js';
import { renderPanel, renderSpectrumChart } from './render.js';
import { buildReport } from './report.js';

interface State {
  card: ColorCard;
  weights: Record<string, number>;
  effects: EffectParams;
  illuminantId: string;
  viewDeg: number;
}

const state: State = {
  card: COLOR_CARDS[1], // 默认：宝石蓝金属漆
  weights: { white: 20, blue: 30 },
  effects: { metallic: 0.4, flakeSize: 0.5, flop: 0.5, orangePeel: 0.3 },
  illuminantId: 'D65',
  viewDeg: 0,
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/* ---------- 构建 UI ---------- */

function buildIlluminantButtons(): void {
  const box = $('illuminants');
  for (const illum of ILLUMINANTS) {
    const btn = document.createElement('button');
    btn.textContent = illum.name;
    btn.dataset.id = illum.id;
    btn.className = illum.id === state.illuminantId ? 'active' : '';
    btn.onclick = () => {
      state.illuminantId = illum.id;
      box.querySelectorAll('button').forEach((b) =>
        b.classList.toggle('active', (b as HTMLButtonElement).dataset.id === illum.id)
      );
      update();
    };
    box.appendChild(btn);
  }
}

function buildCardLibrary(): void {
  const box = $('cards');
  box.innerHTML = '';
  const illum = getIlluminant(state.illuminantId);
  for (const card of COLOR_CARDS) {
    const refl = baseReflectance(card, PIGMENTS);
    const c = spectrumToSrgb(refl, illum);
    const css = `rgb(${c.r * 255 | 0},${c.g * 255 | 0},${c.b * 255 | 0})`;
    const el = document.createElement('button');
    el.className = 'card' + (card.id === state.card.id ? ' active' : '');
    el.innerHTML =
      `<span class="sw" style="background:${css}"></span>` +
      `<span class="nm">${card.name}</span><span class="nt">${card.note}</span>`;
    el.title = card.note;
    el.onclick = () => {
      state.card = card;
      // 把色卡配方复制为初始配方，方便用户在此基础上微调
      state.weights = { ...card.recipe.weights };
      state.effects = { ...card.effects };
      syncSliders();
      update();
    };
    box.appendChild(el);
  }
}

interface SliderDef {
  label: string;
  get: () => number;
  set: (v: number) => void;
  max: number;
  swatch?: string;
  fmt?: (v: number) => string;
}

const pigmentSliders: { def: SliderDef; input: HTMLInputElement; out: HTMLElement }[] = [];
const effectSliders: { def: SliderDef; input: HTMLInputElement; out: HTMLElement }[] = [];

function makeSlider(def: SliderDef, parent: HTMLElement) {
  const row = document.createElement('label');
  row.className = 'slider-row';
  const sw = def.swatch
    ? `<span class="dot" style="background:${def.swatch}"></span>`
    : '<span class="dot none"></span>';
  row.innerHTML = `${sw}<span class="lb">${def.label}</span>`;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = String(def.max);
  input.step = '1';
  input.value = String(def.get());
  const out = document.createElement('span');
  out.className = 'val';
  out.textContent = def.fmt ? def.fmt(def.get()) : String(def.get());
  input.oninput = () => {
    const v = Number(input.value);
    def.set(v);
    out.textContent = def.fmt ? def.fmt(v) : String(v);
    update();
  };
  row.appendChild(input);
  row.appendChild(out);
  parent.appendChild(row);
  return { def, input, out };
}

function buildSliders(): void {
  const pbox = $('pigment-sliders');
  for (const p of PIGMENTS) {
    pigmentSliders.push(
      makeSlider(
        {
          label: p.name,
          swatch: p.swatch,
          max: 100,
          get: () => Math.round(state.weights[p.id] ?? 0),
          set: (v) => { state.weights[p.id] = v; },
        },
        pbox
      )
    );
  }
  const ebox = $('effect-sliders');
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const defs: SliderDef[] = [
    { label: '铝粉含量', max: 100, fmt: pct,
      get: () => Math.round(state.effects.metallic * 100),
      set: (v) => { state.effects.metallic = v / 100; } },
    { label: '铝片粒径', max: 100, fmt: pct,
      get: () => Math.round(state.effects.flakeSize * 100),
      set: (v) => { state.effects.flakeSize = v / 100; } },
    { label: '翻转效应', max: 100, fmt: pct,
      get: () => Math.round(state.effects.flop * 100),
      set: (v) => { state.effects.flop = v / 100; } },
    { label: '清漆橘皮', max: 100, fmt: pct,
      get: () => Math.round(state.effects.orangePeel * 100),
      set: (v) => { state.effects.orangePeel = v / 100; } },
  ];
  for (const d of defs) effectSliders.push(makeSlider(d, ebox));
}

function syncSliders(): void {
  for (const s of [...pigmentSliders, ...effectSliders]) {
    const v = s.def.get();
    s.input.value = String(v);
    s.out.textContent = s.def.fmt ? s.def.fmt(v) : String(v);
  }
}

/* ---------- 渲染与报告 ---------- */

function currentSample(): PaintSample {
  return {
    name: '当前配方',
    recipe: { weights: { ...state.weights } },
    effects: { ...state.effects },
  };
}

let rafPending = false;

function update(): void {
  // 滑杆快速拖动时合并到每帧一次重渲染
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    renderAll();
  });
}

function renderAll(): void {
  const illum: Illuminant = getIlluminant(state.illuminantId);
  const sample = currentSample();

  const targetRefl = baseReflectance(state.card, PIGMENTS);
  const sampleRefl = baseReflectance(sample, PIGMENTS);

  const tint = illuminantTintLinear(illum);
  const targetBody = bodyColorLinear(state.card, targetRefl, illum);
  const sampleBody = bodyColorLinear(sample, sampleRefl, illum);

  renderPanel($<HTMLCanvasElement>('panel-target'), {
    sample: state.card, seed: 11, bodyLinear: targetBody, tintLinear: tint, viewDeg: state.viewDeg,
  });
  renderPanel($<HTMLCanvasElement>('panel-sample'), {
    sample, seed: 11, bodyLinear: sampleBody, tintLinear: tint, viewDeg: state.viewDeg,
  });

  renderSpectrumChart($<HTMLCanvasElement>('chart'), [
    { label: '目标', spectrum: targetRefl, color: '#e8e8e8' },
    { label: '配方', spectrum: sampleRefl, color: '#4da3ff', dashed: true },
  ], illum);

  renderReport(targetRefl, sampleRefl, illum);

  // 色卡库色点跟随当前光源（条件等色在库里就能看出来）
  buildCardLibrary();
}

function renderReport(targetRefl: number[], sampleRefl: number[], illum: Illuminant): void {
  const rep = buildReport(targetRefl, sampleRefl, state.illuminantId);

  const fmt = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2);
  let html =
    '<table><thead><tr><th>光源</th><th>ΔE₀₀</th><th>ΔL*</th><th>Δa*</th><th>Δb*</th><th>判定</th></tr></thead><tbody>';
  for (const r of rep.rows) {
    const isPrimary = r.illuminant.id === illum.id;
    const judge =
      r.dE00 <= 0.5 ? '极佳' : r.dE00 <= 1.0 ? '可接受' : r.dE00 <= 2.0 ? '勉强' : '超差';
    const cls = r.dE00 <= 1.0 ? 'ok' : r.dE00 <= 2.0 ? 'warn' : 'bad';
    html += `<tr class="${isPrimary ? 'primary' : ''}">` +
      `<td>${r.illuminant.name}${isPrimary ? '（当前）' : ''}</td>` +
      `<td class="${cls}">${r.dE00.toFixed(2)}</td>` +
      `<td>${fmt(r.dL)}</td><td>${fmt(r.da)}</td><td>${fmt(r.db)}</td>` +
      `<td class="${cls}">${judge}</td></tr>`;
  }
  html += '</tbody></table>';

  let meta = `<p>光谱 RMSE：<b>${rep.spectralRMSE.toFixed(4)}</b>（反射率曲线整体差异）</p>`;
  if (rep.metamerismIndex !== null) {
    const mi = rep.metamerismIndex;
    const cls = mi <= 1.0 ? 'ok' : mi <= 2.0 ? 'warn' : 'bad';
    meta += `<p>条件等色指数：<b class="${cls}">${mi.toFixed(2)}</b> —— ` +
      (mi <= 1.0
        ? '当前光源下匹配，换光源后依然匹配（光谱级一致）。'
        : `⚠ 当前光源下两者一致（ΔE₀₀=${rep.primaryDE.toFixed(2)}），但换光源后最大偏差 ${mi.toFixed(2)}，是典型的条件等色（同色异谱）——车间灯下会露馅。`);
  } else {
    meta += `<p>当前光源下 ΔE₀₀=${rep.primaryDE.toFixed(2)} &gt; 1，尚未匹配，谈不上条件等色——先把当前光源调准。</p>`;
  }
  meta += '</p>';

  $('report').innerHTML = html + meta;
}

/* ---------- 视角拖动 ---------- */

function bindViewDrag(): void {
  const wrap = $('panels');
  let dragging = false;
  const setView = (clientX: number) => {
    const rect = wrap.getBoundingClientRect();
    const t = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    state.viewDeg = Math.round(t * 75);
    $('view-angle').textContent = `${state.viewDeg}°`;
    update();
  };
  wrap.addEventListener('pointerdown', (e) => { dragging = true; setView(e.clientX); });
  window.addEventListener('pointermove', (e) => { if (dragging) setView(e.clientX); });
  window.addEventListener('pointerup', () => { dragging = false; });
}

/* ---------- 启动 ---------- */

buildIlluminantButtons();
buildSliders();
syncSliders();
bindViewDrag();
renderAll();
