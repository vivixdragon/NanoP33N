'use strict';
// ============================================================
//  UI: drawing loop, input, HUD, command card, modals
// ============================================================

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const $ = id => document.getElementById(id);
const fmt = n => n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(Math.floor(n));
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

let menuBg = null, menuTime = 0;

// ---------- layout scaling ----------
function fit() {
  const wrap = $('wrap');
  const s = Math.min(window.innerWidth / 1280, window.innerHeight / 868);
  wrap.style.transform = `scale(${s})`;
  wrap.style.left = Math.max(0, (window.innerWidth - 1280 * s) / 2) + 'px';
  wrap.style.top = Math.max(0, (window.innerHeight - 868 * s) / 2) + 'px';
}
window.addEventListener('resize', fit);

// ---------- tower icons ----------
const ICONS = {};
function makeIcons() {
  for (const k of TOWER_ORDER) {
    const c = document.createElement('canvas'); c.width = 56; c.height = 56;
    const x = c.getContext('2d');
    drawTowerBody(x, k, 28, 28, 52, { level: 1, ang: -0.6, time: 1 });
    ICONS[k] = c.toDataURL();
  }
}

// ---------- drawing ----------
function draw() {
  ctx.save();
  if (!G) { drawMenuBg(); ctx.restore(); return; }
  if (G.shake > 0) ctx.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake);
  ctx.drawImage(G.bg, 0, 0);
  const tm = G.time;

  // grid in build mode
  if (G.buildType) {
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= COLS; x++) { ctx.moveTo(x * T + 0.5, 0); ctx.lineTo(x * T + 0.5, MAP_H); }
    for (let y = 0; y <= ROWS; y++) { ctx.moveTo(0, y * T + 0.5); ctx.lineTo(MAP_W, y * T + 0.5); }
    ctx.stroke();
  }

  // creep path preview
  drawPathLine(G.pathPts, G.buildType ? 0.55 : 0.22, '#ffe08a', tm);

  drawPortal(ctx, (SPAWN.x + 0.5) * T, (SPAWN.y + 0.5) * T, T, tm);
  drawGate(ctx, (EXIT.x + 0.5) * T, (EXIT.y + 0.5) * T, T, tm, G.gateHurt);

  // selected range / auras
  const sel = G.selected;
  if (sel && sel.kind === 'tower') {
    const t = sel.ref;
    if (t.s.range) drawRange(t.px, t.py, t.s.range, 'rgba(255,230,140,');
    if (t.type === 'shrine') { ctx.fillStyle = 'rgba(255,180,60,0.12)'; ctx.fillRect((t.x - 1) * T, (t.y - 1) * T, T * 3, T * 3); }
  }

  // towers
  for (const t of G.towers) {
    let rx = 0, ry = 0;
    if (t.recoil > 0 && (t.type === 'cannon')) { rx = -Math.cos(t.ang) * t.recoil * 20; ry = -Math.sin(t.ang) * t.recoil * 20; }
    drawTowerBody(ctx, t.type, t.px + rx, t.py + ry, T, { level: Math.min(3, t.level), branch: t.branch, ang: t.ang, time: tm, rank: t.rank });
    if (t.auraD > 0) { ctx.fillStyle = 'rgba(255,170,60,0.9)'; ctx.beginPath(); ctx.arc(t.px + T * 0.38, t.py + T * 0.38, 2.5, 0, 7); ctx.fill(); }
    if (sel && sel.kind === 'tower' && sel.ref === t) {
      ctx.strokeStyle = '#7dff7d'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(t.px, t.py + 4, T * 0.55, T * 0.45, 0, 0, 7); ctx.stroke();
    }
  }

  // ground creeps then air
  for (const c of G.creeps) if (!c.flying) drawCreep(ctx, c, tm);
  // projectiles
  for (const p of G.projs) drawProj(p);
  for (const c of G.creeps) if (c.flying) drawCreep(ctx, c, tm);
  if (sel && sel.kind === 'creep' && !sel.ref.dead) {
    const c = sel.ref; ctx.strokeStyle = '#ff5a5a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(c.x, c.y + c.r * 0.5, c.r + 4, (c.r + 4) * 0.6, 0, 0, 7); ctx.stroke();
  }

  // fx
  for (const f of G.fx) drawFx(f);
  for (const p of G.parts) {
    ctx.globalAlpha = 1 - p.t / p.life; ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  for (const t of G.texts) {
    ctx.globalAlpha = Math.min(1, 2 * (1 - t.t / t.life));
    ctx.font = `bold ${t.size}px "Trebuchet MS", sans-serif`;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3; ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;

  // build ghost
  if (G.buildType && G.hover) {
    const { x, y } = G.hover;
    if (x >= 0 && y >= 0 && x < COLS && y < ROWS) {
      const chk = buildCheck(x, y);
      const afford = G.gold >= costOf(G.buildType);
      const px = (x + 0.5) * T, py = (y + 0.5) * T;
      if (chk.ok) drawPathLine(tracePath(chk.dist), 0.5, '#8affff', tm, true);
      ctx.globalAlpha = 0.6;
      drawTowerBody(ctx, G.buildType, px, py, T, { level: 1, time: tm, ang: -Math.PI / 2 });
      ctx.globalAlpha = 1;
      ctx.fillStyle = chk.ok && afford ? 'rgba(80,255,80,0.25)' : 'rgba(255,40,40,0.35)';
      ctx.fillRect(x * T, y * T, T, T);
      const d = TOWERS[G.buildType];
      if (d.range) drawRange(px, py, (d.range + G.mods.range) * T, chk.ok ? 'rgba(140,255,140,' : 'rgba(255,120,120,');
      if (d.aura) { ctx.strokeStyle = 'rgba(255,180,60,0.6)'; ctx.setLineDash([4, 4]); ctx.strokeRect((x - 1) * T, (y - 1) * T, T * 3, T * 3); ctx.setLineDash([]); }
    }
  }
  // spell targeting
  if (G.castMode === 'meteor' && G.mouse) {
    drawRange(G.mouse.x, G.mouse.y, T * 1.6, 'rgba(255,120,40,');
  }
  // full-screen flashes
  ctx.restore();
  if (G.midasT > 0) {
    ctx.strokeStyle = `rgba(255,215,80,${0.35 + 0.15 * Math.sin(tm * 6)})`; ctx.lineWidth = 8; ctx.strokeRect(4, 4, MAP_W - 8, MAP_H - 8);
  }
  if (G.gateHurt > 0) {
    const g = ctx.createRadialGradient(MAP_W / 2, MAP_H / 2, MAP_H * 0.4, MAP_W / 2, MAP_H / 2, MAP_W * 0.6);
    g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(255,0,0,${G.gateHurt * 0.35})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, MAP_W, MAP_H);
  }
  if (G.paused && !G.modal && !G.over) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, MAP_W, MAP_H);
    ctx.fillStyle = '#ffe9a0'; ctx.font = 'bold 48px Cinzel, Georgia, serif'; ctx.textAlign = 'center';
    ctx.fillText('PAUSED', MAP_W / 2, MAP_H / 2);
    ctx.font = '16px "Trebuchet MS", sans-serif'; ctx.fillStyle = '#ddd';
    ctx.fillText('Press Space or P to resume — you can still build and upgrade while paused', MAP_W / 2, MAP_H / 2 + 34);
  }
}

function drawMenuBg() {
  if (!menuBg) menuBg = buildBackground(COLS, ROWS, T, null, [], mulberry32(7));
  ctx.drawImage(menuBg, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, MAP_W, MAP_H);
  drawPortal(ctx, (SPAWN.x + 0.5) * T, (SPAWN.y + 0.5) * T, T, menuTime);
  drawGate(ctx, (EXIT.x + 0.5) * T, (EXIT.y + 0.5) * T, T, menuTime, 0);
}

function drawPathLine(pts, alpha, color, tm, thin) {
  if (!pts || pts.length < 2) return;
  ctx.save();
  ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = thin ? 2 : 3;
  ctx.setLineDash([6, 10]); ctx.lineDashOffset = -tm * 30;
  ctx.beginPath(); ctx.moveTo(pts[0][0] * T, pts[0][1] * T);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * T, pts[i][1] * T);
  ctx.stroke(); ctx.restore();
}

function drawRange(x, y, r, rgba) {
  ctx.fillStyle = rgba + '0.08)'; ctx.strokeStyle = rgba + '0.6)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

function drawProj(p) {
  ctx.save(); ctx.translate(p.x, p.y);
  switch (p.kind) {
    case 'arrow':
      ctx.rotate(p.ang || 0);
      ctx.strokeStyle = p.crit ? '#ff9a6a' : '#e8d8a8'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(5, 0); ctx.stroke();
      ctx.fillStyle = '#ccc'; ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(3, -3); ctx.lineTo(3, 3); ctx.fill();
      break;
    case 'ball': {
      const tot = p.travelled + Math.hypot(p.lx - p.x, p.ly - p.y);
      const h = Math.sin(Math.min(1, p.travelled / (tot || 1)) * Math.PI) * Math.min(30, tot * 0.25);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 4, 4, 2, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(0, -h, 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#666'; ctx.beginPath(); ctx.arc(-1.5, -h - 1.5, 1.5, 0, 7); ctx.fill();
      break;
    }
    case 'shard':
      ctx.rotate(p.ang || 0);
      ctx.fillStyle = '#d8f0ff'; ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -3); ctx.lineTo(-3, 0); ctx.lineTo(-5, 3); ctx.fill();
      ctx.fillStyle = 'rgba(150,210,255,0.4)'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, 7); ctx.fill();
      break;
    case 'glob':
      ctx.fillStyle = '#7be04a'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(120,255,80,0.35)'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, 7); ctx.fill();
      break;
  }
  ctx.restore();
}

function drawFx(f) {
  const k = f.t / f.life;
  switch (f.kind) {
    case 'ring':
      ctx.strokeStyle = `rgba(${f.color},${1 - k})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r0 + (f.r1 - f.r0) * k, 0, 7); ctx.stroke();
      if (f.fill) { ctx.fillStyle = `rgba(${f.color},${0.15 * (1 - k)})`; ctx.fill(); }
      break;
    case 'bolt':
      ctx.strokeStyle = f.color; ctx.globalAlpha = 1 - k; ctx.lineWidth = f.width; ctx.shadowColor = '#a080ff'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.moveTo(f.pts[0][0], f.pts[0][1]);
      for (const p of f.pts) ctx.lineTo(p[0], p[1]);
      ctx.stroke(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      break;
    case 'boom': {
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * (0.4 + k * 0.6));
      g.addColorStop(0, `rgba(255,240,180,${(1 - k) * 0.9})`); g.addColorStop(0.5, `rgba(255,140,40,${(1 - k) * 0.7})`); g.addColorStop(1, 'rgba(120,30,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill();
      if (f.big) { ctx.strokeStyle = `rgba(255,200,120,${1 - k})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * k * 1.3, 0, 7); ctx.stroke(); }
      break;
    }
    case 'meteor': {
      const fall = Math.min(1, f.t / 0.6);
      const sx = f.x - 260 * (1 - fall), sy = f.y - 420 * (1 - fall);
      ctx.strokeStyle = `rgba(255,140,40,${0.6})`; ctx.lineWidth = 10;
      ctx.beginPath(); ctx.moveTo(sx - 60, sy - 100); ctx.lineTo(sx, sy); ctx.stroke();
      ctx.fillStyle = '#ffdd88'; ctx.beginPath(); ctx.arc(sx, sy, 12, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,80,40,0.8)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.arc(f.x, f.y, T * 1.6, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      break;
    }
    case 'flash':
      ctx.fillStyle = `rgba(${f.color},${0.35 * (1 - k)})`; ctx.fillRect(0, 0, MAP_W, MAP_H);
      break;
    case 'heal':
      ctx.fillStyle = `rgba(120,255,140,${1 - k})`; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('+', f.x, f.y - 14 - k * 14);
      break;
  }
}

// ---------- input ----------
function mapPos(e) {
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (MAP_W / r.width), y: (e.clientY - r.top) * (MAP_H / r.height) };
}

cv.addEventListener('pointermove', e => {
  if (!G) return;
  const p = mapPos(e); G.mouse = p;
  G.hover = { x: Math.floor(p.x / T), y: Math.floor(p.y / T) };
});
cv.addEventListener('pointerleave', () => { if (G) { G.hover = null; G.mouse = null; } });
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  Sfx.init();
  if (!G || G.over || G.modal) return;
  const p = mapPos(e); G.mouse = p;
  const cx = Math.floor(p.x / T), cy = Math.floor(p.y / T);
  G.hover = { x: cx, y: cy };
  if (e.button === 2) { cancelModes(); return; }
  if (G.castMode) {
    if (castSpell(G.castMode, p.x, p.y)) G.castMode = null;
    renderCmd(); return;
  }
  if (G.buildType) {
    const t = buildTower(G.buildType, cx, cy);
    if (t && !(e.shiftKey || G.buildType === 'wall' || G.shiftDown)) {
      G.buildType = null; select({ kind: 'tower', ref: t });
    }
    renderCmd(); return;
  }
  // select creep?
  let best = null, bd = 22 * 22;
  for (const c of G.creeps) {
    const yy = c.flying ? c.y - 10 : c.y;
    const d = (c.x - p.x) ** 2 + (yy - p.y) ** 2;
    if (d < Math.max(bd, c.r * c.r * 1.5)) { bd = d; best = c; }
  }
  const t = (cx >= 0 && cy >= 0 && cx < COLS && cy < ROWS) ? G.towerAt[idx(cx, cy)] : null;
  if (t) select({ kind: 'tower', ref: t });
  else if (best) select({ kind: 'creep', ref: best });
  else select(null);
});

function cancelModes() {
  if (!G) return;
  if (G.buildType || G.castMode) { G.buildType = null; G.castMode = null; }
  else select(null);
  renderCmd();
}

function select(s) { G.selected = s; renderCmd(); renderInfo(); }

window.addEventListener('keydown', e => {
  if (e.key === 'Shift' && G) G.shiftDown = true;
  if (!G || e.repeat) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  Sfx.init();
  if (G.modal || G.over) {
    if (G.modal === 'draft' && /^[1-4]$/.test(e.key)) { const b = document.querySelectorAll('.relic-card')[+e.key - 1]; if (b) b.click(); }
    return;
  }
  const k = e.key.toUpperCase();
  if (k === 'ESCAPE') { cancelModes(); return; }
  if (k === ' ' || k === 'P') { e.preventDefault(); togglePause(); return; }
  if (k === 'N') { sendWave(); return; }
  if (k === '1' || k === '2' || k === '3') { setSpeed(+k); return; }
  if (k === 'DELETE' || k === 'BACKSPACE') { if (G.selected && G.selected.kind === 'tower') { sellTower(G.selected.ref); select(null); } return; }
  const btn = document.querySelector(`#cmd .cbtn[data-hk="${k}"]`);
  if (btn && !btn.classList.contains('empty')) { e.preventDefault(); btn.click(); }
});
window.addEventListener('keyup', e => { if (e.key === 'Shift' && G) G.shiftDown = false; });

function togglePause() { if (!G || G.over) return; G.paused = !G.paused; updateTopBar(true); }
function setSpeed(s) { if (!G) return; G.speed = s; updateTopBar(true); }
function sendWave() {
  if (!G || G.over || G.modal) return;
  if (!G.endless && G.wave >= FINAL_WAVE) { uiError('The final wave is already here!'); return; }
  startWave(true);
}

// ---------- command card ----------
let cmdKey = '', hoverHk = null;
function cmdButtons() {
  const B = [];
  const sel = G.selected;
  if (sel && sel.kind === 'tower') {
    const t = sel.ref, d = TOWERS[t.type];
    if (!d.wall) {
      if (t.level < 3) {
        const c = upgradeCost(t);
        B.push({ hk: 'Q', icon: ICONS[t.type], label: 'Upgrade', cost: c, ok: G.gold >= c, badge: 'Lv' + (t.level + 1),
          tip: `<b>Upgrade to Level ${t.level + 1}</b><br>Damage x${(LVL_DMG[t.level] / LVL_DMG[t.level - 1]).toFixed(2)}, +range, stronger effects.`, act: () => upgradeTower(t) });
      } else if (t.branch == null && d.branches) {
        const c = branchCost(t);
        d.branches.forEach((b, i) => B.push({
          hk: i === 0 ? 'Q' : 'W', icon: ICONS[t.type], label: b.name, cost: c.gold, lumber: c.lumber, ok: G.gold >= c.gold && G.lumber >= c.lumber, special: true,
          tip: `<b>${b.name}</b> <span class="gold">(Specialization)</span><br>${b.desc}<br><i>Choose one — permanent.</i>`, act: () => specializeTower(t, i),
        }));
      }
      if (t.s.attacks) B.push({ hk: 'E', emoji: '🎯', label: 'Target: ' + TARGET_NAMES[t.target], tip: '<b>Targeting priority</b><br>Cycle between First, Last, Strongest and Closest.', act: () => { t.target = TARGET_MODES[(TARGET_MODES.indexOf(t.target) + 1) % 4]; } });
    }
    const refund = Math.floor(t.spent * G.mods.refund);
    B.push({ hk: 'Z', emoji: '💲', label: 'Sell', tip: `<b>Sell</b> (Del)<br>Refund <span class="gold">${refund}</span> gold (${Math.round(G.mods.refund * 100)}%).`, act: () => { sellTower(t); select(null); } });
    B.push({ hk: 'V', emoji: '↩️', label: 'Back', tip: '<b>Back</b> (Esc)', act: () => select(null) });
  } else if (sel && sel.kind === 'creep') {
    B.push({ hk: 'V', emoji: '↩️', label: 'Back', tip: '<b>Back</b> (Esc)', act: () => select(null) });
  } else {
    for (const k of TOWER_ORDER) {
      const d = TOWERS[k], c = costOf(k);
      let extra = '';
      if (d.type) extra = `<br><span class="dim">${DMG_NAMES[d.type]} damage · ${d.dmg} dmg · range ${d.range}${d.air === false ? ' · Ground only' : ''}</span>`;
      B.push({ hk: d.hk, icon: ICONS[k], label: d.name, cost: c, ok: G.gold >= c, active: G.buildType === k,
        tip: `<b>${d.name}</b><br>${d.desc}${extra}<br><span class="dim">Hold Shift to build several.</span>`, act: () => { G.castMode = null; G.buildType = G.buildType === k ? null : k; } });
    }
    for (const id of ['meteor', 'nova', 'midas']) {
      const s = SPELLS[id], cd = G.spellCd[id];
      B.push({ hk: s.hk, emoji: s.icon, label: s.name, cd: cd > 0 ? cd / spellCooldown(id) : 0, cdText: cd > 0 ? Math.ceil(cd) : '', ok: cd <= 0, active: G.castMode === id,
        tip: `<b>${s.name}</b> <span class="dim">(cooldown ${Math.round(spellCooldown(id))}s)</span><br>${s.desc}${id === 'meteor' ? `<br>Deals <span class="gold">${Math.round(meteorDamage())}</span> damage.` : ''}`,
        act: () => {
          if (G.spellCd[id] > 0) { uiError('Spell is not ready yet.'); return; }
          G.buildType = null;
          if (id === 'meteor') G.castMode = G.castMode === 'meteor' ? null : 'meteor';
          else castSpell(id);
        } });
    }
    const bonus = earlyBonus();
    B.push({ hk: 'V', emoji: '⚔️', label: 'Next Wave', tip: `<b>Send Next Wave</b> (N)<br>Call the next wave now${bonus ? ` for <span class="gold">+${bonus}</span> bonus gold` : ''}. Waves can overlap!`, act: sendWave });
  }
  return B;
}

const GRID_KEYS = ['Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F', 'Z', 'X', 'C', 'V'];
function renderCmd() {
  if (!G) return;
  const B = cmdButtons();
  const el = $('cmd');
  el.innerHTML = '';
  for (const hk of GRID_KEYS) {
    const b = B.find(x => x.hk === hk);
    const d = document.createElement('div');
    d.className = 'cbtn' + (b ? '' : ' empty');
    d.dataset.hk = hk;
    if (b) {
      if (b.ok === false) d.classList.add('na');
      if (b.active) d.classList.add('active');
      if (b.special) d.classList.add('special');
      d.innerHTML = (b.icon ? `<img src="${b.icon}" alt="">` : `<span class="emo">${b.emoji}</span>`) +
        `<span class="hk">${hk}</span>` +
        (b.cost != null ? `<span class="cost">${b.cost}</span>` : '') +
        (b.badge ? `<span class="badge">${b.badge}</span>` : '') +
        (b.cd ? `<span class="cdov" style="height:${b.cd * 100}%"></span><span class="cdt">${b.cdText}</span>` : '');
      d.addEventListener('click', () => { Sfx.init(); Sfx.play('click'); b.act(); renderCmd(); renderInfo(); updateTopBar(true); });
      d.addEventListener('mouseenter', () => { hoverHk = hk; showTip(d, b); });
      d.addEventListener('mouseleave', () => { hoverHk = null; hideTip(); });
    }
    el.appendChild(d);
  }
  cmdKey = cmdSignature();
  // keep the tooltip in sync with whatever button is now under the cursor
  const hb = hoverHk && B.find(x => x.hk === hoverHk);
  if (hb) showTip(null, hb); else hideTip();
}
function cmdSignature() {
  if (!G) return '';
  const sel = G.selected;
  let s = (sel ? sel.kind + (sel.ref.id) + (sel.ref.level || '') + (sel.ref.branch ?? '') + (sel.ref.target || '') : 'none') + '|' + G.buildType + '|' + G.castMode;
  // affordability and cooldown state
  s += '|' + cmdButtons().map(b => (b.ok ? 1 : 0) + ':' + (b.cdText || '') + ':' + (b.cost || '')).join(',');
  return s;
}

function showTip(el, b) {
  const tip = $('tooltip');
  let costLine = '';
  if (b.cost != null) costLine = `<div class="tcost"><span class="gold">● ${b.cost}</span>${b.lumber ? ` <span class="lumber">▲ ${b.lumber} lumber</span>` : ''} <span class="dim">[${b.hk}]</span></div>`;
  else costLine = `<div class="tcost"><span class="dim">Hotkey [${b.hk}]</span></div>`;
  tip.innerHTML = b.tip + costLine;
  tip.style.display = 'block';
}
function hideTip() { $('tooltip').style.display = 'none'; }

// ---------- info panel ----------
function statRow(k, v) { return `<div class="srow"><span>${k}</span><b>${v}</b></div>`; }
function renderInfo() {
  if (!G) return;
  const el = $('info');
  const sel = G.selected;
  if (sel && sel.kind === 'tower') {
    const t = sel.ref, d = TOWERS[t.type], s = t.s;
    const name = t.branch != null ? d.branches[t.branch].name : d.name;
    let rows = '';
    if (s.attacks) {
      rows += statRow('Damage', `${Math.round(s.dmg)} <span style="color:${DMG_COLORS[s.dtype]}">${DMG_NAMES[s.dtype]}</span>`);
      rows += statRow('Attack', `${s.rate.toFixed(2)}s`);
      rows += statRow('Range', (s.range / T).toFixed(1));
      rows += statRow('DPS (est)', Math.round(s.dps));
      if (s.splash) rows += statRow('Splash', (s.splash / T).toFixed(1));
      if (s.slow) rows += statRow('Slow', `${Math.round(s.slow * 100)}% / ${s.slowDur.toFixed(1)}s`);
      if (s.chain) rows += statRow('Chain', `${s.chain} targets`);
      if (s.dot) rows += statRow('Poison', `${Math.round(s.dot)}/s × ${s.maxStacks}`);
      if (s.crit) rows += statRow('Crit', `${Math.round(s.crit * 100)}% x${s.critMul}`);
      if (s.multishot > 1) rows += statRow('Targets', s.multishot);
      if (!s.air) rows += statRow('Air', 'Cannot hit');
      rows += statRow('Kills', `${t.kills} <span class="dim">(rank ${t.rank})</span>`);
      rows += statRow('Damage dealt', fmt(t.dmgDone));
      const next = RANKS[t.rank];
      if (next) rows += statRow('Next rank', `${next - t.kills} kills`);
    }
    if (s.auraD != null) { rows += statRow('Aura damage', `+${Math.round(s.auraD * 100)}%`); rows += statRow('Aura speed', `+${Math.round(s.auraR * 100)}%`); }
    if (s.income != null) { rows += statRow('Income/wave', `${s.income} gold`); rows += statRow('Interest', `+${(s.interest * 100).toFixed(1)}%`); }
    if (t.auraD) rows += statRow('Shrine buff', `+${Math.round(t.auraD * 100)}% dmg, +${Math.round(t.auraR * 100)}% spd`);
    el.innerHTML = `<div class="ihead"><img src="${ICONS[t.type]}" class="portrait"><div><div class="iname">${name}</div>
      <div class="isub">${t.branch != null ? 'Specialized' : d.wall ? 'Wall' : 'Level ' + t.level}${t.rank ? ' · ' + '★'.repeat(t.rank) : ''}</div></div></div>
      <div class="stats">${rows || `<div class="dim">${d.desc}</div>`}</div>`;
  } else if (sel && sel.kind === 'creep') {
    const c = sel.ref, d = CREEPS[c.type];
    if (c.dead) { select(null); return; }
    const armorRed = Math.round(100 * (0.06 * Math.max(0, c.armor - c.shred)) / (1 + 0.06 * Math.max(0, c.armor - c.shred)));
    let rows = statRow('Health', `${fmt(Math.max(0, c.hp))} / ${fmt(c.maxHp)}`);
    rows += statRow('Armor', `${ARMOR_NAMES[c.armorType]} ${c.armor - c.shred} <span class="dim">(-${armorRed}%)</span>`);
    rows += statRow('Speed', (c.spd / T / BASE_SPEED).toFixed(2) + 'x');
    rows += statRow('Bounty', c.bounty + ' gold');
    const best = Object.keys(DMG_TABLE).sort((a, b) => DMG_TABLE[b][c.armorType] - DMG_TABLE[a][c.armorType])[0];
    rows += statRow('Weak to', `<span style="color:${DMG_COLORS[best]}">${DMG_NAMES[best]}</span>`);
    const tags = [];
    if (c.flying) tags.push('Flying'); if (c.slowImmune) tags.push('Slow-immune'); if (c.heal) tags.push('Healer');
    if (c.split) tags.push('Splits'); if (c.boss) tags.push('Boss');
    for (const a of c.affixes) tags.push(AFFIXES[a].name);
    el.innerHTML = `<div class="ihead"><div class="portrait creepp">${creepEmoji(c.type)}</div><div><div class="iname">${esc(c.bossName || c.name)}</div>
      <div class="isub">Wave ${c.wave}${tags.length ? ' · ' + tags.join(', ') : ''}</div></div></div><div class="stats">${rows}</div>
      <div class="dim small">${d.desc}</div>`;
  } else {
    const relics = Object.keys(G.relics).map(id => { const r = RELICS.find(x => x.id === id); return `<span class="relic" title="${esc(r.name + ' x' + G.relics[id] + ': ' + r.desc)}">${r.icon}${G.relics[id] > 1 ? `<sub>${G.relics[id]}</sub>` : ''}</span>`; }).join('');
    const ii = interestInfo();
    el.innerHTML = `<div class="iname">Rift Command</div>
      <div class="stats">
        ${statRow('Maze length', `${G.pathLen} tiles`)}
        ${statRow('Interest', `${(ii.rate * 100).toFixed(1)}% (cap ${ii.cap})`)}
        ${statRow('Market income', `${marketIncome()} / wave`)}
        ${statRow('Kills', G.stats.kills)}
        ${statRow('Towers', G.towers.length)}
      </div>
      <div class="relics">${relics || '<span class="dim small">Relics are drafted every 5 waves.</span>'}</div>`;
  }
}
function creepEmoji(t) { return { grunt: '🧟', runner: '🐺', golem: '🗿', bat: '🦇', shaman: '🧙', splitter: '🟢', oozeling: '🟢', knight: '🛡️', boss: '👹', drake: '🐉' }[t] || '👾'; }

// ---------- top bar ----------
let topKey = '';
function updateTopBar(force) {
  if (!G) return;
  const ii = interestInfo();
  const bonus = earlyBonus();
  const timer = G.timer == null ? '—' : Math.ceil(Math.max(0, G.timer)) + 's';
  const key = [Math.floor(G.gold), G.lumber, G.lives, G.wave, timer, ii.amt, bonus, G.speed, G.paused, Sfx.muted, G.endless].join('|');
  if (key === topKey && !force) return;
  topKey = key;
  $('tGold').textContent = fmt(G.gold);
  $('tLumber').textContent = G.lumber;
  $('tLives').textContent = G.lives;
  $('tWave').textContent = G.endless ? `${G.wave} ∞` : `${G.wave}/${FINAL_WAVE}`;
  $('tInterest').textContent = `+${ii.amt}`;
  $('tTimer').textContent = G.firstWave ? `Starts in ${timer}` : `Next in ${timer}`;
  $('sendBtn').innerHTML = bonus > 0 ? `Send Wave <span class="gold">+${bonus}</span>` : 'Send Wave';
  $('sendBtn').disabled = !G.endless && G.wave >= FINAL_WAVE;
  for (const b of document.querySelectorAll('.spd')) b.classList.toggle('on', +b.dataset.s === G.speed);
  $('pauseBtn').textContent = G.paused ? '▶' : '❚❚';
  $('muteBtn').textContent = Sfx.muted ? '🔇' : '🔊';
  $('tLives').parentElement.classList.toggle('low', G.lives <= 5);
}

// ---------- wave intel (minimap slot) ----------
function uiRefreshIntel() {
  if (!G) return;
  const el = $('intel');
  let html = '<div class="intel-title">Wave Intel</div>';
  for (let w = G.wave + 1; w <= G.wave + 3; w++) {
    if (!G.endless && w > FINAL_WAVE) break;
    const wd = getWave(w);
    const types = wd.groups.map(([t, n]) => `${creepEmoji(t)}${n}`).join(' ');
    const armor = [...new Set(wd.groups.map(([t]) => ARMOR_NAMES[CREEPS[t].armor]))].join('/');
    html += `<div class="intel-row${wd.boss ? ' boss' : ''}"><div class="iw">${w}</div><div class="it"><div class="in">${esc(wd.name)}</div>
      <div class="id">${types} · ${armor}${wd.flying ? ' · <span class="air">AIR</span>' : ''}${wd.affixes.map(a => `<span class="aff" style="color:${AFFIXES[a].color}" title="${AFFIXES[a].desc}">${AFFIXES[a].name}</span>`).join('')}</div></div></div>`;
  }
  if (!G.endless && G.wave >= FINAL_WAVE) html += '<div class="intel-row"><div class="it dim">Survive the final wave!</div></div>';
  el.innerHTML = html;
}

// ---------- messages & banner ----------
function uiMessage(text, color = '#fff') {
  const box = $('msgs');
  const d = document.createElement('div');
  d.className = 'msg'; d.textContent = text; d.style.color = color;
  box.appendChild(d);
  while (box.children.length > 5) box.removeChild(box.firstChild);
  setTimeout(() => d.classList.add('fade'), 3500);
  setTimeout(() => d.remove(), 4500);
}
function uiError(text) { uiMessage(text, '#ffd34a'); Sfx.play('error'); }
function uiBanner(title, sub, boss) {
  const b = $('banner');
  b.innerHTML = `<div class="bt">${esc(title)}</div><div class="bs">${esc(sub)}</div>`;
  b.className = 'show' + (boss ? ' boss' : '');
  clearTimeout(uiBanner.t);
  uiBanner.t = setTimeout(() => { b.className = ''; }, 2600);
}

// ---------- modals ----------
function showModal(html, cls = '') {
  const m = $('modal');
  m.innerHTML = `<div class="panel ${cls}">${html}</div>`;
  m.classList.remove('hidden');
  hideTip();
}
function hideModal() { $('modal').classList.add('hidden'); $('modal').innerHTML = ''; }

function uiShowDraft() {
  if (!G || G.over) return;
  G.modal = 'draft';
  const choices = relicChoices();
  const cards = choices.map((r, i) => `<button class="relic-card" data-i="${i}"><div class="rk">${i + 1}</div><div class="ri">${r.icon}</div>
    <div class="rn">${r.name}</div><div class="rd">${r.desc}</div>${G.relics[r.id] ? `<div class="rs">Owned: ${G.relics[r.id]}/${r.max}</div>` : ''}</button>`).join('');
  showModal(`<h2>Choose a Relic</h2><p class="dim">The Rift yields its treasures. Choose one boon for this run.</p>
    <div class="relic-row">${cards}</div>
    ${G.rerolls > 0 ? `<button class="btn small" id="reroll">🎲 Re-roll (${G.rerolls} left)</button>` : ''}`, 'draft');
  Sfx.play('relic');
  document.querySelectorAll('.relic-card').forEach(b => b.addEventListener('click', () => {
    takeRelic(choices[+b.dataset.i]);
    G.draftQueue--;
    G.modal = null; hideModal(); renderInfo(); renderCmd();
    if (G.draftQueue > 0) setTimeout(uiShowDraft, 200);
  }));
  const rr = $('reroll');
  if (rr) rr.addEventListener('click', () => { G.rerolls--; uiShowDraft(); });
}

function uiEndScreen(won) {
  G.modal = 'end';
  const s = G.stats;
  const best = META.best[G.diff] || 0;
  showModal(`<h1 class="${won ? 'win' : 'lose'}">${won ? 'VICTORY' : 'DEFEAT'}</h1>
    <p>${won ? 'The Rift Lords have fallen. The realm is safe... for now.' : `The gate has fallen on wave ${G.wave}.`}</p>
    <div class="endstats">
      ${statRow('Difficulty', G.D.name)}${statRow('Waves cleared', G.cleared)}${statRow('Best wave', best)}
      ${statRow('Kills', s.kills)}${statRow('Bosses slain', s.bossKills)}${statRow('Gold earned', fmt(s.gold))}${statRow('Towers built', s.built)}
    </div>
    <div class="honor">+${G.honorEarned} Honor <span class="dim">(total ${META.honor})</span></div>
    <div class="btnrow">
      ${won ? '<button class="btn gold" id="endless">Continue: Endless Mode</button>' : ''}
      <button class="btn" id="again">Play Again</button>
      <button class="btn" id="tomenu">Main Menu</button>
    </div>`, 'end');
  if (won) $('endless').addEventListener('click', () => { hideModal(); continueEndless(); });
  $('again').addEventListener('click', () => startGame(G.diff));
  $('tomenu').addEventListener('click', showMenu);
}

function showMenu() {
  G = null;
  $('hud').classList.add('menu'); $('topbar').classList.add('menu');
  const diffs = Object.entries(DIFFS).map(([id, d]) => `<button class="btn diff" data-d="${id}"><div class="dn">${d.name}</div>
    <div class="dd">${d.desc}</div><div class="db">Best: wave ${META.best[id] || 0}</div></button>`).join('');
  showModal(`<h1 class="title">RIFT WARDENS</h1><div class="subtitle">A Tower Defense of the Shattered Realm</div>
    <div class="diffs">${diffs}</div>
    <div class="btnrow">
      <button class="btn" id="talentsBtn">⚜ Talents <span class="gold">(${META.honor} Honor)</span></button>
      <button class="btn" id="howBtn">How to Play</button>
    </div>
    <div class="dim small">Games played: ${META.games} · Victories: ${META.wins} · Lifetime kills: ${META.kills}</div>`, 'menu');
  document.querySelectorAll('.diff').forEach(b => b.addEventListener('click', () => { Sfx.init(); startGame(b.dataset.d); }));
  $('talentsBtn').addEventListener('click', showTalents);
  $('howBtn').addEventListener('click', showHow);
}

function showTalents() {
  const rows = TALENTS.map(t => {
    const r = talent(t.id), maxed = r >= t.max, cost = t.cost(r);
    return `<div class="talent"><div class="ti">${t.icon}</div><div class="tt"><div class="tn">${t.name} <span class="pips">${'◆'.repeat(r)}${'◇'.repeat(t.max - r)}</span></div><div class="dim small">${t.desc}</div></div>
      <button class="btn small tb" data-id="${t.id}" ${maxed || META.honor < cost ? 'disabled' : ''}>${maxed ? 'MAX' : cost + ' Honor'}</button></div>`;
  }).join('');
  showModal(`<h2>Talents</h2><p>Honor: <span class="gold">${META.honor}</span> <span class="dim small">— earned by clearing waves. Permanent upgrades for every run.</span></p>
    <div class="talents">${rows}</div><div class="btnrow"><button class="btn" id="back">Back</button></div>`, 'talents');
  document.querySelectorAll('.tb').forEach(b => b.addEventListener('click', () => {
    const t = TALENTS.find(x => x.id === b.dataset.id), r = talent(t.id), cost = t.cost(r);
    if (META.honor >= cost && r < t.max) { META.honor -= cost; META.talents[t.id] = r + 1; saveMeta(); Sfx.init(); Sfx.play('upgrade'); showTalents(); }
  }));
  $('back').addEventListener('click', showMenu);
}

function showHow() {
  showModal(`<h2>How to Play</h2><div class="how">
    <p><b>Mazing:</b> Creeps walk from the purple Rift (left) to your Gate (right). Build towers anywhere — creeps path around them. You can never fully block the path, so build long winding mazes! The dotted line shows their route. Flying creeps ignore your maze.</p>
    <p><b>Damage vs Armor:</b> Pierce shreds Light, Siege smashes Medium & Fortified, Magic melts Heavy, Chaos ignores armor types. Check the Wave Intel panel and plan ahead.</p>
    <p><b>Economy:</b> At the start of each wave you earn <span class="gold">interest</span> on banked gold (capped). Calling a wave early with <b>N</b> pays a bonus. Goblin Markets pay every wave.</p>
    <p><b>Upgrades:</b> Towers have 3 levels, then a permanent <b>Specialization</b> choice costing <span class="lumber">Lumber</span> (earned every 5 waves and from bosses). Towers gain veterancy ranks from kills.</p>
    <p><b>Relics:</b> Every 5 waves cleared, draft one of several powerful run-wide boons.</p>
    <p><b>Honor:</b> Every run earns Honor for permanent Talents. Higher difficulty = more Honor.</p>
    <p><b>Hotkeys:</b> Q W E R / A S D F / Z X C V match the command card · <b>Shift</b>+click builds multiple · <b>Esc</b>/right-click cancels · <b>Space</b> pause · <b>N</b> next wave · <b>1/2/3</b> game speed · <b>Del</b> sell.</p>
    </div><div class="btnrow"><button class="btn" id="back">Back</button></div>`, 'how');
  $('back').addEventListener('click', showMenu);
}

function showPauseMenu() {
  if (!G || G.over) return;
  G.paused = true; G.modal = 'pause';
  showModal(`<h2>Menu</h2><div class="btnrow col">
    <button class="btn" id="resume">Resume</button>
    <button class="btn" id="restart">Restart</button>
    <button class="btn" id="quit">Surrender (keep Honor)</button></div>`, 'pause');
  $('resume').addEventListener('click', () => { G.modal = null; G.paused = false; hideModal(); updateTopBar(true); });
  $('restart').addEventListener('click', () => startGame(G.diff));
  $('quit').addEventListener('click', () => { hideModal(); G.modal = null; endGame(false); });
}

function startGame(diff) {
  hideModal();
  newGame(diff);
  $('hud').classList.remove('menu'); $('topbar').classList.remove('menu');
  renderCmd(); renderInfo(); uiRefreshIntel(); updateTopBar(true);
  $('msgs').innerHTML = '';
  uiBanner('Prepare your defenses', 'Wave 1 begins soon — build a maze!', false);
}

// ---------- main loop ----------
let lastT = performance.now(), uiAcc = 0;
function frame(now) {
  const rdt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  menuTime += rdt;
  if (G && !G.paused && !G.modal && !G.over) {
    G.acc += rdt * G.speed;
    let n = 0;
    while (G.acc >= STEP && n < 12) { update(STEP); G.acc -= STEP; n++; if (G.over) break; }
    if (n >= 12) G.acc = 0;
  }
  draw();
  if (G) {
    updateTopBar();
    uiAcc += rdt;
    if (uiAcc > 0.2) {
      uiAcc = 0;
      if (cmdSignature() !== cmdKey) renderCmd();
      renderInfo();
    }
    if (G.lastIntelWave !== G.wave) { G.lastIntelWave = G.wave; uiRefreshIntel(); }
  }
  requestAnimationFrame(frame);
}

// ---------- boot ----------
function boot() {
  fit();
  makeIcons();
  $('sendBtn').addEventListener('click', () => { Sfx.init(); sendWave(); });
  document.querySelectorAll('.spd').forEach(b => b.addEventListener('click', () => setSpeed(+b.dataset.s)));
  $('pauseBtn').addEventListener('click', togglePause);
  $('muteBtn').addEventListener('click', () => { Sfx.init(); Sfx.toggle(); updateTopBar(true); });
  $('menuBtn').addEventListener('click', showPauseMenu);
  $('cmd').addEventListener('mouseleave', () => { hoverHk = null; hideTip(); });
  showMenu();
  requestAnimationFrame(frame);
}

// testing hook
window.__td = { get G() { return G; }, startGame, buildTower, upgradeTower, specializeTower, startWave, update, takeRelic, RELICS };
boot();
