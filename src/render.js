'use strict';
// ============================================================
//  Procedural rendering: terrain, towers, creeps, effects
// ============================================================

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function rrect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); }

// ---------- Terrain ----------
function buildBackground(cols, rows, T, grid, obstacles, rng) {
  const bg = document.createElement('canvas');
  bg.width = cols * T; bg.height = rows * T;
  const c = bg.getContext('2d');
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const v = Math.floor(rng() * 14) - 7;
      c.fillStyle = shade('#3e5c2c', v);
      c.fillRect(x * T, y * T, T, T);
    }
  }
  // soft blotches
  for (let i = 0; i < 160; i++) {
    const x = rng() * cols * T, y = rng() * rows * T, r = 20 + rng() * 60;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    const col = rng() < 0.5 ? 'rgba(90,120,50,0.18)' : 'rgba(30,50,20,0.18)';
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // grass tufts & flowers
  for (let i = 0; i < 900; i++) {
    const x = rng() * cols * T, y = rng() * rows * T;
    c.strokeStyle = rng() < 0.5 ? 'rgba(120,160,70,0.5)' : 'rgba(40,70,25,0.6)';
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + rng() * 3 - 1.5, y - 3 - rng() * 3); c.stroke();
  }
  for (let i = 0; i < 70; i++) {
    const x = rng() * cols * T, y = rng() * rows * T;
    c.fillStyle = ['#e6d36a', '#e88aa8', '#ffffff', '#a9c6ff'][Math.floor(rng() * 4)];
    circle(c, x, y, 1.5); c.fill();
  }
  // dirt road hints near spawn and exit
  for (const o of obstacles) drawObstacle(c, o, T);
  // vignette
  const vg = c.createRadialGradient(cols * T / 2, rows * T / 2, rows * T * 0.4, cols * T / 2, rows * T / 2, cols * T * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.38)');
  c.fillStyle = vg; c.fillRect(0, 0, cols * T, rows * T);
  return bg;
}

function drawObstacle(c, o, T) {
  const cx = (o.x + 0.5) * T, cy = (o.y + 0.5) * T;
  if (o.kind === 'rock') {
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath(); c.ellipse(cx + 3, cy + 6, T * 0.42, T * 0.25, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#7c7a73';
    c.beginPath();
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, r = T * (0.34 + ((o.seed * (i + 3)) % 1) * 0.12);
      c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.85);
    }
    c.closePath(); c.fill();
    c.strokeStyle = '#4a4843'; c.lineWidth = 2; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.15)';
    c.beginPath(); c.ellipse(cx - 5, cy - 6, T * 0.15, T * 0.08, -0.5, 0, Math.PI * 2); c.fill();
  } else {
    // tree
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath(); c.ellipse(cx + 5, cy + 8, T * 0.42, T * 0.22, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#4a3020'; c.fillRect(cx - 3, cy, 6, T * 0.4);
    const greens = ['#1f4a22', '#2b5e2b', '#3a7434'];
    for (let i = 0; i < 3; i++) {
      c.fillStyle = greens[i];
      circle(c, cx + (i - 1) * 3, cy - 4 - i * 4, T * (0.42 - i * 0.1)); c.fill();
    }
  }
}

// ---------- Towers ----------
function drawTowerBody(c, type, x, y, T, o = {}) {
  const time = o.time || 0, level = o.level || 1, branch = o.branch, ang = o.ang || 0;
  const s = T * 0.46;
  if (type === 'wall') {
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(x - s + 3, y - s + 4, s * 2, s * 2);
    const g = c.createLinearGradient(x - s, y - s, x + s, y + s);
    g.addColorStop(0, '#9a958a'); g.addColorStop(1, '#5d5950');
    c.fillStyle = g; c.fillRect(x - s, y - s, s * 2, s * 2);
    c.strokeStyle = '#3d3a34'; c.lineWidth = 1.5;
    c.strokeRect(x - s, y - s, s * 2, s * 2);
    c.beginPath();
    for (let r = 1; r < 3; r++) { c.moveTo(x - s, y - s + r * s * 2 / 3); c.lineTo(x + s, y - s + r * s * 2 / 3); }
    c.moveTo(x, y - s); c.lineTo(x, y - s / 3); c.moveTo(x - s / 2, y - s / 3); c.lineTo(x - s / 2, y + s / 3);
    c.moveTo(x + s / 2, y - s / 3); c.lineTo(x + s / 2, y + s / 3); c.moveTo(x, y + s / 3); c.lineTo(x, y + s);
    c.stroke();
    return;
  }
  // stone foundation
  c.fillStyle = 'rgba(0,0,0,0.35)'; rrect(c, x - s + 3, y - s + 5, s * 2, s * 2, 6); c.fill();
  const g = c.createLinearGradient(x - s, y - s, x + s, y + s);
  g.addColorStop(0, '#8d877a'); g.addColorStop(1, '#4e4a42');
  c.fillStyle = g; rrect(c, x - s, y - s, s * 2, s * 2, 6); c.fill();
  c.strokeStyle = branch != null ? '#e8c060' : '#2e2b26'; c.lineWidth = branch != null ? 2.5 : 1.5;
  rrect(c, x - s, y - s, s * 2, s * 2, 6); c.stroke();

  switch (type) {
    case 'arrow': {
      const roof = branch === 0 ? '#3d5a8a' : branch === 1 ? '#8a3d3d' : '#7a3b22';
      c.fillStyle = '#6b4a2b'; rrect(c, x - s * 0.72, y - s * 0.72, s * 1.44, s * 1.44, 3); c.fill();
      c.strokeStyle = '#4a321c'; c.lineWidth = 1;
      for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(x - s * 0.72, y + i * s * 0.28); c.lineTo(x + s * 0.72, y + i * s * 0.28); c.stroke(); }
      // pyramid roof
      const r = s * (branch === 0 ? 0.7 : 0.58);
      c.fillStyle = roof;
      c.beginPath(); c.moveTo(x - r, y - r); c.lineTo(x + r, y - r); c.lineTo(x + r, y + r); c.lineTo(x - r, y + r); c.closePath(); c.fill();
      c.strokeStyle = shade(roof, -40); c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(x - r, y - r); c.lineTo(x + r, y + r); c.moveTo(x + r, y - r); c.lineTo(x - r, y + r); c.stroke();
      c.fillStyle = shade(roof, 50); circle(c, x, y, 3); c.fill();
      // bow pointing at target
      const n = branch === 1 ? 4 : 1;
      for (let k = 0; k < n; k++) {
        const a = ang + (k * Math.PI * 2) / n;
        c.strokeStyle = '#d9c08a'; c.lineWidth = 2;
        c.beginPath(); c.arc(x + Math.cos(a) * s * 0.5, y + Math.sin(a) * s * 0.5, s * 0.3, a - 1.2, a + 1.2); c.stroke();
      }
      if (branch === 0) { c.strokeStyle = '#cfe3ff'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(ang) * s * 1.1, y + Math.sin(ang) * s * 1.1); c.stroke(); }
      break;
    }
    case 'cannon': {
      c.fillStyle = '#3a3a3e'; circle(c, x, y, s * 0.72); c.fill();
      c.strokeStyle = '#1e1e22'; c.lineWidth = 2; c.stroke();
      c.save(); c.translate(x, y); c.rotate(ang);
      const barrels = branch === 1 ? [-0.22, 0.22] : [0];
      const bl = branch === 0 ? s * 0.55 : s * 0.95, bw = branch === 0 ? s * 0.62 : s * 0.34;
      for (const off of barrels) {
        c.fillStyle = '#26262a'; c.fillRect(0, off * s * 2 - bw / 2, bl, bw);
        c.fillStyle = '#55555c'; c.fillRect(0, off * s * 2 - bw / 2, bl, bw * 0.3);
        c.fillStyle = '#111'; circle(c, bl, off * s * 2, bw * 0.38); c.fill();
      }
      c.restore();
      c.fillStyle = branch === 1 ? '#c98a3a' : '#5a5a60'; circle(c, x, y, s * 0.3); c.fill();
      break;
    }
    case 'frost': {
      const pulse = 0.5 + 0.5 * Math.sin(time * 3 + x);
      const glow = c.createRadialGradient(x, y, 0, x, y, s * 1.1);
      glow.addColorStop(0, `rgba(150,210,255,${0.35 + pulse * 0.25})`); glow.addColorStop(1, 'rgba(150,210,255,0)');
      c.fillStyle = glow; circle(c, x, y, s * 1.1); c.fill();
      const crystals = branch === 0 ? [[-0.35, 0.2, 0.55], [0.35, 0.2, 0.55], [0, -0.25, 0.7]] : [[0, 0, branch === 1 ? 1.0 : 0.8]];
      for (const [dx, dy, k] of crystals) {
        const cx = x + dx * s, cy = y + dy * s, h = s * k;
        c.fillStyle = branch === 1 ? '#f2fbff' : '#9fd8ff';
        c.beginPath(); c.moveTo(cx, cy - h); c.lineTo(cx + h * 0.45, cy); c.lineTo(cx, cy + h * 0.7); c.lineTo(cx - h * 0.45, cy); c.closePath(); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.6)';
        c.beginPath(); c.moveTo(cx, cy - h); c.lineTo(cx + h * 0.45, cy); c.lineTo(cx, cy); c.closePath(); c.fill();
        c.strokeStyle = '#4a8cc0'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(cx, cy - h); c.lineTo(cx + h * 0.45, cy); c.lineTo(cx, cy + h * 0.7); c.lineTo(cx - h * 0.45, cy); c.closePath(); c.stroke();
      }
      break;
    }
    case 'storm': {
      if (branch === 1) {
        c.fillStyle = '#1c1530';
        c.beginPath(); c.moveTo(x, y - s * 0.95); c.lineTo(x + s * 0.4, y); c.lineTo(x, y + s * 0.8); c.lineTo(x - s * 0.4, y); c.closePath(); c.fill();
        c.strokeStyle = '#b07dff'; c.lineWidth = 1.5; c.stroke();
        const p = 0.5 + 0.5 * Math.sin(time * 4);
        c.fillStyle = `rgba(200,150,255,${0.5 + p * 0.5})`; circle(c, x, y - s * 0.1, s * 0.15); c.fill();
      } else {
        c.fillStyle = '#5b4a7a'; circle(c, x, y, s * 0.6); c.fill();
        c.strokeStyle = '#2f2545'; c.lineWidth = 2; c.stroke();
        const orbR = s * (branch === 0 ? 0.45 : 0.36);
        const og = c.createRadialGradient(x, y, 0, x, y, orbR * 1.6);
        og.addColorStop(0, '#ffffff'); og.addColorStop(0.35, '#c3a6ff'); og.addColorStop(1, 'rgba(120,80,255,0)');
        c.fillStyle = og; circle(c, x, y, orbR * 1.6); c.fill();
        c.strokeStyle = 'rgba(220,200,255,0.9)'; c.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
          const a = time * 7 + i * 2.1;
          c.beginPath(); c.moveTo(x, y);
          c.lineTo(x + Math.cos(a) * orbR * 0.8 + Math.sin(time * 31 + i) * 3, y + Math.sin(a) * orbR * 0.8);
          c.lineTo(x + Math.cos(a) * orbR * 1.4, y + Math.sin(a) * orbR * 1.4); c.stroke();
        }
        if (branch === 0) { c.strokeStyle = '#e8c060'; c.lineWidth = 1.5; circle(c, x, y, s * 0.8); c.stroke(); }
      }
      break;
    }
    case 'poison': {
      c.fillStyle = '#2b2b26'; circle(c, x, y, s * 0.72); c.fill();
      c.strokeStyle = '#151512'; c.lineWidth = 2; c.stroke();
      const liq = branch === 0 ? '#9be04a' : branch === 1 ? '#3be0a0' : '#6fd04a';
      c.fillStyle = liq; circle(c, x, y, s * 0.55); c.fill();
      c.fillStyle = shade(liq, 60);
      for (let i = 0; i < 4; i++) {
        const t = (time * 0.9 + i * 0.25 + x * 0.01) % 1;
        const bx = x + Math.cos(i * 1.7 + x) * s * 0.3, by = y + Math.sin(i * 2.3 + y) * s * 0.25;
        c.globalAlpha = 1 - t; circle(c, bx, by, 1.5 + t * 3.5); c.fill(); c.globalAlpha = 1;
      }
      if (branch === 0) { c.fillStyle = '#e8e8d0'; circle(c, x, y - s * 0.05, 4); c.fill(); c.fillStyle = '#222'; c.fillRect(x - 2.5, y - 2, 2, 2); c.fillRect(x + 0.5, y - 2, 2, 2); }
      break;
    }
    case 'shrine': {
      c.fillStyle = '#e8e2d0';
      c.beginPath();
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8; c.lineTo(x + Math.cos(a) * s * 0.72, y + Math.sin(a) * s * 0.72); }
      c.closePath(); c.fill(); c.strokeStyle = '#a89e80'; c.lineWidth = 1.5; c.stroke();
      const fl = 0.85 + 0.15 * Math.sin(time * 8 + x);
      const fc = branch === 1 ? '#ffe066' : branch === 0 ? '#ff5050' : '#ffb040';
      const fg = c.createRadialGradient(x, y, 0, x, y, s * 0.5 * fl);
      fg.addColorStop(0, '#fff8e0'); fg.addColorStop(0.4, fc); fg.addColorStop(1, 'rgba(255,100,0,0)');
      c.fillStyle = fg; circle(c, x, y, s * 0.5 * fl); c.fill();
      if (branch === 0) { c.fillStyle = '#b02020'; c.fillRect(x + s * 0.3, y - s * 0.8, s * 0.45, s * 0.3); c.fillStyle = '#5a3a1a'; c.fillRect(x + s * 0.28, y - s * 0.85, 2, s * 0.8); }
      break;
    }
    case 'market': {
      const cols = branch === 0 ? ['#e8e2d0', '#c9b98a'] : branch === 1 ? ['#3a2d22', '#5a4632'] : ['#c03a2a', '#e8c060'];
      for (let i = 0; i < 4; i++) {
        c.fillStyle = cols[i % 2];
        c.beginPath(); c.moveTo(x, y);
        const a1 = i * Math.PI / 2 - Math.PI / 4, a2 = a1 + Math.PI / 2;
        c.lineTo(x + Math.cos(a1) * s * 0.95, y + Math.sin(a1) * s * 0.95);
        c.lineTo(x + Math.cos(a2) * s * 0.95, y + Math.sin(a2) * s * 0.95); c.closePath(); c.fill();
      }
      c.fillStyle = '#ffd34a'; c.strokeStyle = '#8a6a10'; c.lineWidth = 1;
      const coins = 1 + level + (branch != null ? 2 : 0);
      for (let i = 0; i < coins; i++) {
        const cx = x + Math.cos(i * 2.4) * s * 0.25 * (i > 0), cy = y + Math.sin(i * 2.4) * s * 0.25 * (i > 0) - 2;
        c.beginPath(); c.ellipse(cx, cy, 4.5, 3.5, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      }
      break;
    }
  }
  // level pips
  for (let i = 0; i < Math.min(3, level); i++) {
    c.fillStyle = '#ffd34a'; c.strokeStyle = '#3a2a00'; c.lineWidth = 1;
    circle(c, x - s + 5 + i * 6, y + s - 5, 2.4); c.fill(); c.stroke();
  }
  // veterancy chevrons
  if (o.rank) {
    c.strokeStyle = '#ffd34a'; c.lineWidth = 1.6;
    for (let i = 0; i < o.rank; i++) {
      const yy = y - s + 4 + i * 3.4;
      c.beginPath(); c.moveTo(x + s - 11, yy); c.lineTo(x + s - 7, yy + 2.5); c.lineTo(x + s - 3, yy); c.stroke();
    }
  }
}

// ---------- Creeps ----------
function drawCreep(c, cr, time) {
  const { x, y, r } = cr;
  const wob = Math.sin(time * 10 + cr.wobble * 10);
  const fly = cr.flying;
  const yy = fly ? y - 10 + Math.sin(time * 4 + cr.wobble * 5) * 2 : y;
  // shadow
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.beginPath(); c.ellipse(x + 2, y + r * 0.6 + (fly ? 6 : 0), r * (fly ? 0.7 : 1), r * 0.4, 0, 0, Math.PI * 2); c.fill();

  const slowed = cr.slowT > 0 && cr.slowAmt > 0;
  c.save(); c.translate(x, yy);
  switch (cr.type) {
    case 'grunt': {
      c.rotate(cr.ang);
      c.fillStyle = '#7d7a4e'; circle(c, 0, 0, r); c.fill();
      c.strokeStyle = '#3a3a20'; c.lineWidth = 2; c.stroke();
      c.fillStyle = '#5c5a36'; c.fillRect(r * 0.2, -r * 0.9 + wob, r * 0.8, r * 0.35); c.fillRect(r * 0.2, r * 0.55 - wob, r * 0.8, r * 0.35);
      c.fillStyle = '#ff3a2a'; circle(c, r * 0.45, -r * 0.3, 2); c.fill(); circle(c, r * 0.45, r * 0.3, 2); c.fill();
      break;
    }
    case 'runner': {
      c.rotate(cr.ang);
      c.fillStyle = '#6e6e78'; c.beginPath(); c.ellipse(0, 0, r * 1.3, r * 0.7, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#33333a'; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = '#55555e'; c.beginPath(); c.moveTo(r * 1.1, -r * 0.5); c.lineTo(r * 1.8, 0); c.lineTo(r * 1.1, r * 0.5); c.fill();
      c.fillStyle = '#88889a'; c.beginPath(); c.moveTo(r * 0.9, -r * 0.6); c.lineTo(r * 0.7, -r * 1.1); c.lineTo(r * 0.5, -r * 0.5); c.fill();
      c.beginPath(); c.moveTo(r * 0.9, r * 0.6); c.lineTo(r * 0.7, r * 1.1); c.lineTo(r * 0.5, r * 0.5); c.fill();
      c.strokeStyle = '#55555e'; c.lineWidth = 3; c.beginPath(); c.moveTo(-r * 1.2, 0); c.lineTo(-r * 1.9, wob * 4); c.stroke();
      c.fillStyle = '#ffdd33'; circle(c, r * 1.3, -r * 0.2, 1.5); c.fill(); circle(c, r * 1.3, r * 0.2, 1.5); c.fill();
      break;
    }
    case 'golem': {
      c.rotate(cr.ang);
      c.fillStyle = '#7a756a';
      c.beginPath();
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = r * (i % 2 ? 0.9 : 1.05); c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      c.closePath(); c.fill(); c.strokeStyle = '#3e3a32'; c.lineWidth = 2; c.stroke();
      c.strokeStyle = '#ff8a2a'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(-r * 0.4, -r * 0.3); c.lineTo(0, 0); c.lineTo(-r * 0.2, r * 0.5); c.stroke();
      c.fillStyle = '#8a857a'; circle(c, r * 0.5, -r * 0.85 + wob, r * 0.35); c.fill(); circle(c, r * 0.5, r * 0.85 - wob, r * 0.35); c.fill();
      c.fillStyle = '#ffae3a'; circle(c, r * 0.55, 0, 3); c.fill();
      break;
    }
    case 'bat': {
      const flap = Math.sin(time * 18 + cr.wobble * 20);
      c.fillStyle = '#3a2340';
      c.beginPath(); c.moveTo(0, 0); c.lineTo(-r * 2, -r * (0.4 + flap * 0.8)); c.lineTo(-r * 1.2, r * 0.2); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(0, 0); c.lineTo(r * 2, -r * (0.4 + flap * 0.8)); c.lineTo(r * 1.2, r * 0.2); c.closePath(); c.fill();
      c.fillStyle = '#5a3a62'; circle(c, 0, 0, r * 0.7); c.fill();
      c.fillStyle = '#ff4060'; circle(c, -2, -1, 1.5); c.fill(); circle(c, 2, -1, 1.5); c.fill();
      break;
    }
    case 'shaman': {
      c.fillStyle = '#3e6b3a'; circle(c, 0, 0, r); c.fill(); c.strokeStyle = '#1e3a1c'; c.lineWidth = 2; c.stroke();
      c.fillStyle = '#6a4a2a'; c.beginPath(); c.moveTo(-r * 0.7, -r * 0.3); c.lineTo(0, -r * 1.3); c.lineTo(r * 0.7, -r * 0.3); c.fill();
      c.strokeStyle = '#8a6a3a'; c.lineWidth = 2; c.beginPath(); c.moveTo(r * 0.9, r * 0.8); c.lineTo(r * 0.9, -r * 1.2); c.stroke();
      const p = 0.5 + 0.5 * Math.sin(time * 5 + cr.wobble * 9);
      c.fillStyle = `rgba(120,255,140,${0.5 + p * 0.5})`; circle(c, r * 0.9, -r * 1.3, 3.5); c.fill();
      break;
    }
    case 'splitter':
    case 'oozeling': {
      const sq = 1 + wob * 0.08;
      c.fillStyle = 'rgba(140,220,60,0.85)';
      c.beginPath(); c.ellipse(0, 0, r * sq, r / sq, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#4a7a1a'; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.4)'; circle(c, -r * 0.3, -r * 0.35, r * 0.25); c.fill();
      c.fillStyle = '#1a2a0a'; circle(c, r * 0.2, -r * 0.1, Math.max(1.2, r * 0.13)); c.fill(); circle(c, r * 0.5, -r * 0.1, Math.max(1.2, r * 0.13)); c.fill();
      break;
    }
    case 'knight': {
      c.rotate(cr.ang);
      c.fillStyle = '#3a3e4a'; circle(c, 0, 0, r); c.fill();
      c.strokeStyle = '#15171c'; c.lineWidth = 2; c.stroke();
      c.fillStyle = '#5a6070'; c.fillRect(-r * 0.2, -r * 0.6, r * 0.9, r * 1.2);
      c.fillStyle = '#7ad0ff'; c.fillRect(r * 0.45, -r * 0.4, 2, r * 0.8);
      c.strokeStyle = '#a0a8b8'; c.lineWidth = 2; c.beginPath(); c.moveTo(-r * 0.2, r * 0.9); c.lineTo(r * 1.5, r * 0.9); c.stroke();
      break;
    }
    case 'boss': {
      c.rotate(cr.ang);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, '#9a3a3a'); g.addColorStop(1, '#4a1414');
      c.fillStyle = g;
      c.beginPath();
      for (let i = 0; i < 14; i++) { const a = i * Math.PI / 7, rr = r * (i % 2 ? 0.85 : 1.15); c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      c.closePath(); c.fill(); c.strokeStyle = '#1e0808'; c.lineWidth = 2.5; c.stroke();
      c.fillStyle = '#ffcf3a'; circle(c, r * 0.45, -r * 0.3, 3.5); c.fill(); circle(c, r * 0.45, r * 0.3, 3.5); c.fill();
      c.rotate(-cr.ang);
      c.fillStyle = '#ffd34a';
      c.beginPath(); c.moveTo(-r * 0.5, -r * 0.9); c.lineTo(-r * 0.5, -r * 1.35); c.lineTo(-r * 0.25, -r * 1.1); c.lineTo(0, -r * 1.45);
      c.lineTo(r * 0.25, -r * 1.1); c.lineTo(r * 0.5, -r * 1.35); c.lineTo(r * 0.5, -r * 0.9); c.closePath(); c.fill();
      break;
    }
    case 'drake': {
      c.rotate(cr.ang);
      const flap = Math.sin(time * 6 + cr.wobble);
      c.fillStyle = 'rgba(220,210,190,0.9)';
      c.beginPath(); c.moveTo(0, 0); c.lineTo(-r * 0.4, -r * (1.8 + flap * 0.5)); c.lineTo(-r * 1.2, -r * 0.4); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(0, 0); c.lineTo(-r * 0.4, r * (1.8 + flap * 0.5)); c.lineTo(-r * 1.2, r * 0.4); c.closePath(); c.fill();
      c.fillStyle = '#d8ccb0'; c.beginPath(); c.ellipse(0, 0, r * 1.1, r * 0.45, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#6a5a40'; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = '#4ad0ff'; circle(c, r * 0.85, -2, 2.5); c.fill(); circle(c, r * 0.85, 2, 2.5); c.fill();
      break;
    }
  }
  c.restore();

  // status tints
  if (slowed) { c.fillStyle = 'rgba(140,200,255,0.35)'; circle(c, x, yy, r + 2); c.fill(); }
  if (cr.poison.length) { c.fillStyle = 'rgba(120,255,80,0.25)'; circle(c, x, yy, r + 2); c.fill(); }
  if (cr.stunT > 0) {
    c.fillStyle = '#ffe066';
    for (let i = 0; i < 3; i++) { const a = time * 6 + i * 2.1; circle(c, x + Math.cos(a) * r * 0.8, yy - r - 3 + Math.sin(a) * 2, 2); c.fill(); }
  }
  if (cr.slowImmune) { c.strokeStyle = 'rgba(150,210,255,0.55)'; c.lineWidth = 1.5; circle(c, x, yy, r + 3); c.stroke(); }
  if (cr.hitFlash > 0) { c.fillStyle = `rgba(255,255,255,${cr.hitFlash * 3})`; circle(c, x, yy, r); c.fill(); }

  // HP bar
  const bw = Math.max(18, r * 2.1), bh = cr.boss ? 5 : 3.5;
  const by = yy - r - (cr.boss ? 16 : 8);
  c.fillStyle = 'rgba(0,0,0,0.75)'; c.fillRect(x - bw / 2 - 1, by - 1, bw + 2, bh + 2);
  const f = Math.max(0, cr.hp / cr.maxHp);
  c.fillStyle = f > 0.6 ? '#3ad04a' : f > 0.3 ? '#e8c03a' : '#e83a3a';
  c.fillRect(x - bw / 2, by, bw * f, bh);
  if (cr.affixes.length) {
    for (let i = 0; i < cr.affixes.length; i++) {
      c.fillStyle = AFFIXES[cr.affixes[i]].color;
      c.fillRect(x - bw / 2 + i * 5, by - 4, 4, 2.5);
    }
  }
}

// ---------- Spawn portal & exit gate ----------
function drawPortal(c, x, y, T, time) {
  for (let i = 0; i < 4; i++) {
    const r = T * (0.55 - i * 0.11);
    c.strokeStyle = `rgba(${170 + i * 20},${60 + i * 30},255,${0.8 - i * 0.12})`;
    c.lineWidth = 3;
    c.beginPath(); c.arc(x, y, r, time * (2 + i) + i, time * (2 + i) + i + Math.PI * 1.4); c.stroke();
  }
  const g = c.createRadialGradient(x, y, 0, x, y, T * 0.5);
  g.addColorStop(0, 'rgba(230,180,255,0.9)'); g.addColorStop(1, 'rgba(90,20,160,0)');
  c.fillStyle = g; circle(c, x, y, T * 0.5); c.fill();
}

function drawGate(c, x, y, T, time, hurt) {
  c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x - T * 0.5 + 3, y - T * 0.75 + 4, T, T * 1.5);
  c.fillStyle = '#7d776a'; c.fillRect(x - T * 0.5, y - T * 0.75, T, T * 1.5);
  c.strokeStyle = '#3a362e'; c.lineWidth = 2; c.strokeRect(x - T * 0.5, y - T * 0.75, T, T * 1.5);
  for (let i = 0; i < 4; i++) { c.fillStyle = '#5d584c'; c.fillRect(x - T * 0.5 + i * T / 4 + 1, y - T * 0.85, T / 8, T * 0.12); }
  c.fillStyle = '#2a1a0e'; c.beginPath(); c.moveTo(x - T * 0.25, y + T * 0.75); c.lineTo(x - T * 0.25, y - T * 0.1);
  c.arc(x, y - T * 0.1, T * 0.25, Math.PI, 0); c.lineTo(x + T * 0.25, y + T * 0.75); c.fill();
  c.fillStyle = hurt > 0 ? `rgba(255,40,40,${hurt})` : '#1e4aa8';
  c.fillRect(x - T * 0.12, y - T * 0.7, T * 0.24, T * 0.32);
  c.fillStyle = '#ffd34a'; circle(c, x, y - T * 0.54, 3); c.fill();
}

function lightningPath(x1, y1, x2, y2, segs = 7) {
  const pts = [[x1, y1]];
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  for (let i = 1; i < segs; i++) {
    const t = i / segs, off = (Math.random() - 0.5) * Math.min(18, len * 0.25);
    pts.push([x1 + dx * t + nx * off, y1 + dy * t + ny * off]);
  }
  pts.push([x2, y2]);
  return pts;
}
