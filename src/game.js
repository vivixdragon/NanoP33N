'use strict';
// ============================================================
//  Core simulation: map, pathing, waves, towers, combat
// ============================================================

const COLS = 32, ROWS = 16, T = 40, MAP_W = COLS * T, MAP_H = ROWS * T;
const SPAWN = { x: 0, y: 7 }, EXIT = { x: 31, y: 8 };
const BASE_SPEED = 1.6; // tiles per second
const STEP = 1 / 60;
const idx = (x, y) => y * COLS + x;

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ---------- persistent meta progression ----------
const SAVE_KEY = 'riftwardens_td_v1';
function defaultMeta() { return { honor: 0, talents: {}, best: { normal: 0, hard: 0, nightmare: 0 }, games: 0, kills: 0, wins: 0 }; }
function loadMeta() {
  try { const m = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); const d = defaultMeta(); return Object.assign(d, m, { best: Object.assign(d.best, m.best || {}) }); }
  catch (e) { return defaultMeta(); }
}
let META = loadMeta();
function saveMeta() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(META)); } catch (e) { /* private mode */ } }
const talent = id => META.talents[id] || 0;

let G = null;
let uidSeq = 1;

function baseMods() {
  return {
    dmgAll: talent('dmg') * 0.04, dmg: {}, rate: 0, range: 0, crit: 0, critMul: 2.5,
    interest: talent('interest') * 0.005, interestCap: 0, bounty: 0, cost: 0, refund: 0.75,
    chain: 0, splash: 0, slowDur: 0, slowAdd: 0, dot: 0, spread: false,
    spellCd: talent('spells') * 0.08, meteor: 0, giant: 0, glacial: 0,
  };
}

// ---------- new game ----------
function newGame(diffId) {
  const D = DIFFS[diffId];
  const seed = (Math.random() * 1e9) | 0;
  G = {
    diff: diffId, D, seed, rng: mulberry32(seed), time: 0, acc: 0,
    gold: D.gold + talent('gold') * 20, lumber: 1 + talent('lumber'), lives: D.lives + talent('lives') * 3,
    maxLivesShown: 0,
    wave: 0, cleared: 0, timer: 40, firstWave: true, endless: false,
    grid: new Uint8Array(COLS * ROWS), towerAt: new Array(COLS * ROWS).fill(null), dist: null,
    obstacles: [], towers: [], creeps: [], projs: [], fx: [], texts: [], parts: [], decals: [], pathVer: 0,
    spawners: [], waveAlive: {}, plan: [],
    mods: baseMods(), relics: {}, rerolls: talent('reroll'),
    spellCd: { meteor: 0, nova: 0, midas: 0 }, midasT: 0,
    speed: 1, paused: false, modal: null, over: false, won: false,
    selected: null, buildType: null, castMode: null, hover: null, shiftDown: false,
    shake: 0, gateHurt: 0, draftQueue: 0,
    stats: { kills: 0, leaks: 0, gold: 0, built: 0, bossKills: 0 },
    pathPts: [], pathLen: 0, honorGiven: false,
  };
  genMap();
  G.dist = computeDist(G.grid);
  updatePath();
  const prng = mulberry32(seed ^ 0x5bd1e995);
  for (let w = 1; w <= FINAL_WAVE; w++) G.plan[w] = genWave(w, prng);
  G.planRng = prng;
  G.bg = null; // built lazily by the renderer at the current display resolution
  META.games++; saveMeta();
}

function genMap() {
  const r = G.rng;
  for (let attempt = 0; attempt < 50; attempt++) {
    G.grid.fill(0); G.obstacles = [];
    const n = 16 + Math.floor(r() * 8);
    for (let i = 0; i < n; i++) {
      const x = 2 + Math.floor(r() * (COLS - 4)), y = Math.floor(r() * ROWS);
      if (G.grid[idx(x, y)]) continue;
      if (Math.abs(y - 7.5) < 1.6 && (x < 4 || x > COLS - 5)) continue;
      G.grid[idx(x, y)] = 1;
      G.obstacles.push({ x, y, kind: r() < 0.55 ? 'rock' : 'tree', seed: r() });
    }
    const d = computeDist(G.grid);
    if (d[idx(SPAWN.x, SPAWN.y)] !== Infinity) return;
  }
}

// ---------- pathing (BFS flow field from exit) ----------
function computeDist(grid) {
  const d = new Float32Array(COLS * ROWS).fill(Infinity);
  const q = new Int32Array(COLS * ROWS);
  let h = 0, t = 0;
  const e = idx(EXIT.x, EXIT.y);
  d[e] = 0; q[t++] = e;
  while (h < t) {
    const i = q[h++], x = i % COLS, y = (i / COLS) | 0, nd = d[i] + 1;
    if (x > 0 && grid[i - 1] === 0 && d[i - 1] === Infinity) { d[i - 1] = nd; q[t++] = i - 1; }
    if (x < COLS - 1 && grid[i + 1] === 0 && d[i + 1] === Infinity) { d[i + 1] = nd; q[t++] = i + 1; }
    if (y > 0 && grid[i - COLS] === 0 && d[i - COLS] === Infinity) { d[i - COLS] = nd; q[t++] = i - COLS; }
    if (y < ROWS - 1 && grid[i + COLS] === 0 && d[i + COLS] === Infinity) { d[i + COLS] = nd; q[t++] = i + COLS; }
  }
  return d;
}

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
function nextCell(x, y, dir, dist) {
  const cur = dist[idx(x, y)];
  let best = cur, bx = x, by = y, bd = dir;
  // prefer continuing straight on ties
  const order = [dir, (dir + 1) % 4, (dir + 3) % 4, (dir + 2) % 4];
  for (const k of order) {
    const nx = x + DIRS[k][0], ny = y + DIRS[k][1];
    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
    const v = dist[idx(nx, ny)];
    if (v < best) { best = v; bx = nx; by = ny; bd = k; }
  }
  return { x: bx, y: by, dir: bd };
}

function tracePath(dist) {
  const pts = [[-0.5, SPAWN.y + 0.5]];
  let x = SPAWN.x, y = SPAWN.y, dir = 0, n = 0;
  pts.push([x + 0.5, y + 0.5]);
  while (!(x === EXIT.x && y === EXIT.y) && n++ < COLS * ROWS) {
    const nc = nextCell(x, y, dir, dist);
    if (nc.x === x && nc.y === y) break;
    x = nc.x; y = nc.y; dir = nc.dir;
    pts.push([x + 0.5, y + 0.5]);
  }
  return pts;
}
function updatePath() { G.pathPts = tracePath(G.dist); G.pathLen = G.pathPts.length - 1; G.pathVer++; }

// ---------- wave generation ----------
function waveHP(w) { return 18 * Math.pow(1.115, w - 1) + 6 * (w - 1); }

function genWave(w, r) {
  let kind;
  if (w % 10 === 0) kind = 'BOSS';
  else if (w <= EARLY_WAVES.length) kind = EARLY_WAVES[w - 1];
  else {
    const prev = G.plan[w - 1] ? G.plan[w - 1].kind : '';
    do { kind = WAVE_POOL[Math.floor(r() * WAVE_POOL.length)]; } while (kind === prev);
  }
  // affixes
  const affixes = [];
  const pool = Object.keys(AFFIXES).filter(a => !(kind === 'BOSS' && a === 'swarm'));
  let nAff = 0;
  if (w >= 12 && r() < 0.5) nAff = 1;
  if (w >= 25) nAff = r() < 0.4 ? 2 : 1;
  if (w > FINAL_WAVE) nAff = 2 + (w > 60 ? 1 : 0);
  while (affixes.length < nAff) {
    const a = pool[Math.floor(r() * pool.length)];
    if (!affixes.includes(a)) affixes.push(a);
  }
  const N = 10 + Math.floor(w / 4);
  let groups = [], name, mix = false, bossName = null;
  if (kind === 'BOSS') {
    const air = (w % 20 === 0 && w % 40 !== 0);
    const final = w % 40 === 0;
    const btype = air ? 'drake' : 'boss';
    const names = BOSS_NAMES[btype];
    bossName = names[Math.floor(w / 10 - 1) % names.length];
    const extra = Math.max(0, Math.floor((w - 40) / 20));
    if (final) { groups = [['knight', 8], ['boss', 2 + extra], ['drake', 1 + extra]]; name = 'FINAL: The Rift Lords'; }
    else if (air) { groups = [['bat', Math.round(N * 0.6)], ['drake', 1 + extra]]; name = 'BOSS: ' + bossName; }
    else { groups = [['grunt', Math.round(N * 0.5)], ['boss', (w >= 30 ? 2 : 1) + extra]]; name = 'BOSS: ' + bossName; }
  } else {
    const K = WAVE_KINDS[kind];
    name = K.name; mix = !!K.mix;
    if (kind === 'mixed') {
      const opts = ['grunt', 'runner', 'golem', 'bat', 'splitter', 'shaman', 'knight'];
      const picks = [];
      while (picks.length < 3) { const p = opts[Math.floor(r() * opts.length)]; if (!picks.includes(p)) picks.push(p); }
      const mults = { grunt: 0.4, runner: 0.5, golem: 0.2, bat: 0.4, splitter: 0.25, shaman: 0.2, knight: 0.25 };
      groups = picks.map(p => [p, Math.max(2, Math.round(N * mults[p]))]);
    } else groups = K.groups.map(([t, m]) => [t, Math.max(3, Math.round(N * m))]);
  }
  if (affixes.includes('swarm')) groups = groups.map(([t, n]) => [t, CREEPS[t].boss ? n : n * 2]);
  if (affixes.length) name = affixes.map(a => AFFIXES[a].name).join(' ') + ' ' + name.replace(/^BOSS: /, '');
  if (kind === 'BOSS' && affixes.length) name = 'BOSS: ' + name;
  const flying = groups.some(([t]) => CREEPS[t].flying);
  return { w, kind, name, groups, affixes, mix, boss: kind === 'BOSS', flying };
}

function getWave(w) {
  if (!G.plan[w]) G.plan[w] = genWave(w, G.planRng);
  return G.plan[w];
}

function waveSpawnList(wd) {
  let list = [];
  const sw = wd.affixes.includes('swarm');
  if (wd.mix) {
    const pools = wd.groups.map(([t, n]) => ({ t, n }));
    let left = pools.reduce((a, p) => a + p.n, 0);
    while (left > 0) {
      for (const p of pools) if (p.n > 0) { list.push(p.t); p.n--; left--; }
    }
  } else {
    for (const [t, n] of wd.groups) for (let i = 0; i < n; i++) list.push(t);
  }
  return list.map(t => ({ type: t, gap: CREEPS[t].gap * (sw ? 0.55 : 1) }));
}

function spawnDuration(list) { return list.reduce((a, e) => a + e.gap, 0); }

// ---------- economy ----------
function interestInfo() {
  let rate = 0.04 + G.mods.interest, cap = 25 + G.wave * 4 + G.mods.interestCap;
  for (const t of G.towers) if (t.type === 'market') { rate += t.s.interest; cap += t.s.cap; }
  rate *= G.D.interestMul;
  const amt = Math.min(Math.floor(G.gold * rate), Math.floor(cap));
  return { rate, cap: Math.floor(cap), amt };
}
function marketIncome() { let s = 0; for (const t of G.towers) if (t.type === 'market') s += t.s.income; return s; }
function earlyBonus() {
  if (G.timer == null || G.timer <= 0) return 0;
  return Math.floor(G.timer * (0.6 + G.wave * 0.12));
}
function addGold(n, x, y, col = '#ffd34a') {
  n = Math.floor(n); if (n <= 0) return;
  G.gold += n; G.stats.gold += n;
  if (x != null) floatText(x, y, '+' + n, col, 11);
}

function costOf(type) { return Math.max(1, Math.round(TOWERS[type].cost * (1 - G.mods.cost))); }
function upgradeCost(t) {
  const base = TOWERS[t.type].cost;
  const m = t.level === 1 ? 1.0 : 1.75;
  return Math.round(base * m * (1 - G.mods.cost));
}
function branchCost(t) {
  return { gold: Math.round(Math.max(60, TOWERS[t.type].cost * 3.5) * (1 - G.mods.cost)), lumber: 2 };
}

// ---------- waves ----------
function startWave(early) {
  if (G.over) return;
  if (!G.endless && G.wave >= FINAL_WAVE) return;
  if (early) {
    const b = earlyBonus();
    if (b > 0) { addGold(b); uiMessage(`Called early! +${b} gold`, '#ffd34a'); }
  }
  // Interest and market income are paid as each wave begins
  const ii = interestInfo();
  if (ii.amt > 0) { addGold(ii.amt); uiMessage(`Interest: +${ii.amt} gold (${(ii.rate * 100).toFixed(1)}%)`, '#ffe9a0'); Sfx.play('interest'); }
  const inc = marketIncome();
  if (inc > 0) {
    G.gold += inc; G.stats.gold += inc;
    for (const t of G.towers) if (t.type === 'market') floatText(t.px, t.py - 12, '+' + t.s.income, '#ffd34a', 13);
  }
  G.wave++;
  G.firstWave = false;
  const wd = getWave(G.wave);
  const list = waveSpawnList(wd);
  G.waveAlive[G.wave] = list.length;
  G.spawners.push({ wave: G.wave, wd, list, i: 0, t: 0 });
  G.timer = (!G.endless && G.wave >= FINAL_WAVE) ? null : spawnDuration(list) + BUILD_TIME;
  uiBanner(`Wave ${G.wave}`, wd.name, wd.boss);
  Sfx.play(wd.boss ? 'boss' : 'horn');
  uiRefreshIntel();
}

function spawnCreep(type, wave, wd, from) {
  const d = CREEPS[type];
  const aff = wd ? wd.affixes : [];
  let hp = waveHP(wave) * d.hp * G.D.hp;
  if (aff.includes('swarm')) hp *= 0.55;
  if (aff.includes('titanic')) hp *= 1.6;
  if (from) hp = from.maxHp * 0.3;
  let bounty = (1 + wave * 0.12) * d.bounty;
  if (aff.includes('titanic')) bounty *= 1.5;
  if (aff.includes('swarm')) bounty *= 0.6;
  const c = {
    id: uidSeq++, type, name: d.name, wave, flying: !!d.flying, boss: !!d.boss,
    x: from ? from.x + (Math.random() - 0.5) * 10 : -T * 0.5, y: from ? from.y + (Math.random() - 0.5) * 10 : (SPAWN.y + 0.5) * T,
    cx: from ? from.cx : SPAWN.x, cy: from ? from.cy : SPAWN.y, tx: from ? from.tx : SPAWN.x, ty: from ? from.ty : SPAWN.y, dir: from ? from.dir : 0,
    hp, maxHp: hp, spd: d.spd * BASE_SPEED * T, armorType: d.armor, armor: d.av, r: d.r,
    bounty: Math.max(1, Math.round(bounty)), leakDmg: d.leak || 1, lumber: d.lumber || 0,
    slowT: 0, slowAmt: 0, stunT: 0, poison: [], poisonSrc: null, shred: 0, brittle: 0, brittleT: 0,
    heal: !!d.heal, healT: 1 + Math.random(), regen: 0, slowImmune: !!d.slowImmune, split: d.split,
    affixes: aff.slice(), prog: 9999, ang: 0, wobble: Math.random(), hitFlash: 0, dead: false,
  };
  if (c.boss) c.bossName = wd && wd.boss ? (wd.name.replace(/^BOSS: /, '').replace(/^FINAL: .*/, d.name)) : d.name;
  for (const a of aff) {
    if (a === 'armored') c.armor += 4;
    if (a === 'hasted') c.spd *= 1.35;
    if (a === 'regen') c.regen = 0.02;
    if (a === 'warded') c.slowImmune = true;
    if (a === 'titanic') { c.spd *= 0.85; c.r = Math.round(c.r * 1.2); }
  }
  G.creeps.push(c);
  return c;
}

function onCreepGone(c) {
  const left = --G.waveAlive[c.wave];
  if (left === 0) waveCleared(c.wave);
}

function waveCleared(w) {
  G.cleared++;
  const bonus = 8 + w * 2;
  addGold(bonus);
  uiMessage(`Wave ${w} cleared! +${bonus} gold`, '#9fe870');
  Sfx.play('clear');
  if (w % 5 === 0) {
    G.lumber += 1;
    uiMessage('+1 Lumber', '#c9a46a');
    G.draftQueue++;
  }
  if (w > (META.best[G.diff] || 0)) { META.best[G.diff] = w; saveMeta(); }
  if (!G.endless && w >= FINAL_WAVE && !G.won) { G.won = true; G.draftQueue = 0; endGame(true); return; }
  if (G.draftQueue > 0 && !G.modal) uiShowDraft();
}

function killCreep(c, src) {
  if (c.dead) return;
  c.dead = true;
  G.stats.kills++;
  const midas = G.midasT > 0 ? 2 : 1;
  const gold = Math.max(1, Math.round(c.bounty * (1 + G.mods.bounty) * midas));
  addGold(gold, c.x, c.y - 10, midas > 1 ? '#fff1a0' : '#ffd34a');
  if (c.lumber) { G.lumber += c.lumber; floatText(c.x, c.y - 26, `+${c.lumber} lumber`, '#c9a46a', 14); }
  if (c.boss) { G.stats.bossKills++; G.shake = Math.max(G.shake, 10); Sfx.play('boom'); uiMessage(`${c.bossName || c.name} has been slain!`, '#ffcf3a'); }
  const gore = CORPSE_COLORS[c.type] || '#6a1a12';
  burst(c.x, c.y, c.boss ? 40 : 10, gore, c.boss ? 4 : 2);
  addDecal({ kind: 'corpse', x: c.x, y: c.y, r: c.r, type: c.type, ang: c.ang, color: gore, seed: c.id, life: c.boss ? 20 : 9 });
  if (c.boss) smoke(c.x, c.y, 14, 2);
  Sfx.play('die');
  if (src) {
    src.kills++;
    const newRank = RANKS.filter(k => src.kills >= k).length;
    if (newRank > src.rank) {
      src.rank = newRank; calcStats(src);
      floatText(src.px, src.py - 22, `Rank ${newRank}!`, '#ffd34a', 13);
      Sfx.play('rank');
    }
  }
  if (c.split) {
    for (let i = 0; i < 2; i++) {
      G.waveAlive[c.wave]++;
      spawnCreep(c.split, c.wave, { affixes: c.affixes }, c);
    }
  }
  if (c.poison.length && (G.mods.spread || (c.poisonSrc && c.poisonSrc.s.spread))) {
    const best = c.poison.reduce((a, p) => p.dps > a.dps ? p : a, c.poison[0]);
    for (const o of G.creeps) {
      if (o.dead || o === c) continue;
      if (Math.hypot(o.x - c.x, o.y - c.y) < T * 1.6) applyPoison(o, best.dps, 3, 8, c.poisonSrc);
    }
    G.fx.push({ kind: 'ring', x: c.x, y: c.y, r0: 4, r1: T * 1.6, t: 0, life: 0.4, color: '120,255,80' });
  }
  onCreepGone(c);
}

function leakCreep(c) {
  if (c.dead) return;
  c.dead = true;
  G.lives -= c.leakDmg;
  G.stats.leaks += c.leakDmg;
  G.gateHurt = 1; G.shake = Math.max(G.shake, c.boss ? 12 : 4);
  Sfx.play('leak');
  uiMessage(c.boss ? `${c.bossName || c.name} broke through! -${c.leakDmg} lives` : `A ${c.name} got through! -${c.leakDmg}`, '#ff6b6b');
  onCreepGone(c);
  if (G.lives <= 0) { G.lives = 0; endGame(false); }
}

// ---------- damage ----------
function dealDamage(c, amount, dtype, src, opts = {}) {
  if (c.dead) return 0;
  let mult = DMG_TABLE[dtype][c.armorType];
  const armor = Math.max(0, c.armor - c.shred);
  if (dtype !== 'chaos') mult *= 1 - (0.06 * armor) / (1 + 0.06 * armor);
  if (c.brittleT > 0) mult *= 1 + c.brittle;
  if (G.mods.glacial && c.slowT > 0 && c.slowAmt > 0) mult *= 1 + G.mods.glacial;
  if (c.boss && G.mods.giant) mult *= 1 + G.mods.giant;
  const dmg = amount * mult;
  c.hp -= dmg;
  if (!opts.dot) c.hitFlash = 0.08;
  if (src) src.dmgDone += dmg;
  if (opts.crit) floatText(c.x, c.y - c.r - 6, Math.round(dmg) + '!', '#ff5a3a', 14);
  if (c.hp <= 0) killCreep(c, src);
  return dmg;
}

function applySlow(c, amt, dur) {
  if (c.slowImmune || amt <= 0) return;
  if (c.boss) amt *= 0.5;
  if (amt >= c.slowAmt || c.slowT <= 0) { c.slowAmt = amt; c.slowT = Math.max(c.slowT, dur); }
  else c.slowT = Math.max(c.slowT, dur * 0.5);
}

function applyStun(c, dur) {
  if (c.slowImmune || c.boss) return;
  c.stunT = Math.max(c.stunT, dur);
}

function applyPoison(c, dps, dur, maxStacks, src) {
  if (c.dead) return;
  if (c.poison.length < maxStacks) c.poison.push({ dps, t: dur });
  else {
    let w = 0; for (let i = 1; i < c.poison.length; i++) if (c.poison[i].t < c.poison[w].t) w = i;
    c.poison[w] = { dps: Math.max(dps, c.poison[w].dps), t: dur };
  }
  c.poisonSrc = src || c.poisonSrc;
}

// ---------- towers ----------
function calcStats(t) {
  const d = TOWERS[t.type];
  const br = t.branch != null ? d.branches[t.branch].mod : {};
  const L = Math.min(2, t.level - 1);
  const s = { dtype: d.type, air: d.air !== false, attacks: !!d.dmg };
  if (d.dmg) {
    const dm = (1 + G.mods.dmgAll + (G.mods.dmg[t.type] || 0) + t.rank * RANK_DMG) * (1 + (t.auraD || 0));
    s.dmg = d.dmg * LVL_DMG[L] * (br.dmgMul || 1) * dm;
    s.range = (d.range + LVL_RANGE[L] + (br.rangeAdd || 0) + G.mods.range) * T;
    s.rate = d.rate * (br.rateMul || 1) / (1 + G.mods.rate + (t.auraR || 0));
    s.crit = G.mods.crit + (br.crit || 0);
    s.critMul = br.critMul || G.mods.critMul;
    s.multishot = br.multishot || 1;
    s.splash = d.splash ? d.splash * (br.splashMul || 1) * (1 + G.mods.splash) * T : 0;
    s.stunChance = br.stunChance || 0; s.stun = br.stun || 0;
    s.slow = d.slow ? Math.min(0.8, d.slow + (br.slowAdd || 0) + G.mods.slowAdd + L * 0.05) : 0;
    s.slowDur = d.slowDur ? d.slowDur * (1 + G.mods.slowDur) : 0;
    s.pulse = !!br.pulse; s.brittle = br.brittle || 0;
    s.chain = d.chain ? (br.chainSet || (d.chain + (br.chainAdd || 0) + G.mods.chain)) : 0;
    s.falloff = br.falloff || d.falloff || 1;
    s.shred = br.shred || 0;
    s.dot = d.dot ? d.dot * LVL_DMG[L] * (br.dotMul || 1) * dm * (1 + G.mods.dot) : 0;
    s.dotDur = d.dotDur || 0;
    s.maxStacks = d.maxStacks ? d.maxStacks + (br.stacksAdd || 0) : 0;
    s.spread = !!br.spread;
    s.proj = d.proj; s.pspeed = d.pspeed;
    s.dps = (s.dmg * s.multishot * (1 + s.crit * (s.critMul - 1)) + (s.dot ? s.dot * Math.min(s.maxStacks, s.dotDur / s.rate) * s.rate : 0)) / s.rate;
  }
  if (d.aura) {
    s.auraD = d.auraDmg + L * 0.05 + (br.auraDmgAdd || 0);
    s.auraR = d.auraRate + L * 0.04 + (br.auraRateAdd || 0);
  }
  if (d.income) {
    s.income = br.incomeSet || d.income[L];
    s.interest = 0.005 + (br.interestAdd || 0);
    s.cap = br.capAdd || 0;
  }
  t.s = s;
}

function recalcAll() {
  for (const t of G.towers) if (t.type === 'shrine') calcStats(t);
  for (const t of G.towers) {
    if (t.type === 'shrine') continue;
    t.auraD = 0; t.auraR = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = t.x + dx, y = t.y + dy;
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
      const o = G.towerAt[idx(x, y)];
      if (o && o.type === 'shrine') { t.auraD = Math.max(t.auraD, o.s.auraD); t.auraR = Math.max(t.auraR, o.s.auraR); }
    }
    calcStats(t);
  }
}

function buildCheck(x, y) {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return { ok: false, why: 'out' };
  if (G.grid[idx(x, y)] !== 0) return { ok: false, why: 'Cannot build there.' };
  if ((x === SPAWN.x && y === SPAWN.y) || (x === EXIT.x && y === EXIT.y)) return { ok: false, why: 'Cannot build there.' };
  for (const c of G.creeps) {
    if (c.dead || c.flying) continue;
    if ((c.cx === x && c.cy === y) || (c.tx === x && c.ty === y)) return { ok: false, why: 'Something is in the way.' };
  }
  const i = idx(x, y);
  G.grid[i] = 2;
  const d = computeDist(G.grid);
  G.grid[i] = 0;
  if (d[idx(SPAWN.x, SPAWN.y)] === Infinity) return { ok: false, why: 'That would block the path!' };
  for (const c of G.creeps) {
    if (c.dead || c.flying) continue;
    if (d[idx(c.tx, c.ty)] === Infinity) return { ok: false, why: 'That would trap a creep!' };
  }
  return { ok: true, dist: d };
}

function buildTower(type, x, y) {
  const cost = costOf(type);
  if (G.gold < cost) { uiError('Not enough gold.'); return false; }
  const chk = buildCheck(x, y);
  if (!chk.ok) { if (chk.why !== 'out') uiError(chk.why); return false; }
  G.gold -= cost;
  const t = {
    id: uidSeq++, type, x, y, px: (x + 0.5) * T, py: (y + 0.5) * T, level: 1, branch: null,
    cd: 0.2, kills: 0, dmgDone: 0, rank: 0, spent: cost, target: 'first', ang: -Math.PI / 2, s: {}, built: G.time,
  };
  G.towers.push(t);
  G.grid[idx(x, y)] = 2; G.towerAt[idx(x, y)] = t;
  G.dist = chk.dist; updatePath();
  recalcAll();
  G.stats.built++;
  burst(t.px, t.py + 10, 8, '#8a7a5a', 1.5);
  Sfx.play('build');
  return t;
}

function sellTower(t) {
  const refund = Math.floor(t.spent * G.mods.refund);
  G.gold += refund;
  floatText(t.px, t.py, '+' + refund, '#ffd34a', 12);
  G.towers = G.towers.filter(o => o !== t);
  G.grid[idx(t.x, t.y)] = 0; G.towerAt[idx(t.x, t.y)] = null;
  G.dist = computeDist(G.grid); updatePath();
  recalcAll();
  if (G.selected === t) G.selected = null;
  Sfx.play('sell');
}

function upgradeTower(t) {
  const d = TOWERS[t.type];
  if (d.wall || t.level >= 3) return false;
  const c = upgradeCost(t);
  if (G.gold < c) { uiError('Not enough gold.'); return false; }
  G.gold -= c; t.spent += c; t.level++;
  recalcAll();
  burst(t.px, t.py, 12, '#ffd34a', 2);
  Sfx.play('upgrade');
  return true;
}

function specializeTower(t, b) {
  const d = TOWERS[t.type];
  if (!d.branches || t.level !== 3 || t.branch != null) return false;
  const c = branchCost(t);
  if (G.gold < c.gold) { uiError('Not enough gold.'); return false; }
  if (G.lumber < c.lumber) { uiError('Not enough lumber. Clear every 5th wave or slay bosses.'); return false; }
  G.gold -= c.gold; G.lumber -= c.lumber; t.spent += c.gold;
  t.branch = b; t.level = 4;
  if (d.branches[b].mod.target) t.target = d.branches[b].mod.target;
  recalcAll();
  burst(t.px, t.py, 25, '#ffe9a0', 3);
  G.fx.push({ kind: 'ring', x: t.px, y: t.py, r0: 5, r1: T * 1.4, t: 0, life: 0.5, color: '255,220,120' });
  Sfx.play('relic');
  uiMessage(`${d.branches[b].name} specialization unlocked!`, '#ffe9a0');
  return true;
}

const TARGET_MODES = ['first', 'last', 'strong', 'close'];
const TARGET_NAMES = { first: 'First', last: 'Last', strong: 'Strongest', close: 'Closest' };

function inRange(t, s) {
  const r2 = s.range * s.range, out = [];
  for (const c of G.creeps) {
    if (c.dead) continue;
    if (c.flying && !s.air) continue;
    if (c.x < 0) continue;
    const dx = c.x - t.px, dy = c.y - t.py;
    if (dx * dx + dy * dy <= r2) out.push(c);
  }
  return out;
}

function pickTargets(t, cands, n) {
  const m = t.target;
  const key = m === 'first' ? c => c.prog : m === 'last' ? c => -c.prog : m === 'strong' ? c => -c.hp : c => (c.x - t.px) ** 2 + (c.y - t.py) ** 2;
  if (n === 1) {
    let best = null, bv = Infinity;
    for (const c of cands) { const v = key(c); if (v < bv) { bv = v; best = c; } }
    return best ? [best] : [];
  }
  return cands.sort((a, b) => key(a) - key(b)).slice(0, n);
}

function updateTower(t, dt) {
  const s = t.s;
  if (!s.attacks) return;
  t.cd -= dt;
  if (t.recoil > 0) t.recoil -= dt;
  if (t.flashT > 0) t.flashT -= dt;
  if (t.cd > 0) return;
  const cands = inRange(t, s);
  if (!cands.length) { t.cd = 0.05; return; }
  const crit = Math.random() < s.crit;
  const dmg = s.dmg * (crit ? s.critMul : 1);
  if (s.pulse) {
    for (const c of cands) { dealDamage(c, dmg, s.dtype, t); applySlow(c, s.slow, s.slowDur); }
    G.fx.push({ kind: 'ring', x: t.px, y: t.py, r0: 8, r1: s.range, t: 0, life: 0.45, color: '160,220,255', fill: true });
    Sfx.play('frost');
  } else if (s.chain) {
    const first = pickTargets(t, cands, 1)[0];
    let cur = first, prev = { x: t.px, y: t.py - 8 }, d = dmg;
    const hit = new Set();
    for (let k = 0; k < s.chain && cur; k++) {
      hit.add(cur);
      G.fx.push({ kind: 'bolt', pts: lightningPath(prev.x, prev.y, cur.x, cur.y), t: 0, life: 0.14, width: s.chain === 1 ? 4 : 2.2, color: s.chain === 1 ? '#e0b0ff' : '#cfe0ff' });
      dealDamage(cur, d, s.dtype, t, { crit });
      if (s.shred) cur.shred = Math.min(10, cur.shred + s.shred);
      prev = cur; d *= s.falloff;
      let nb = null, nd = (T * 2.2) ** 2;
      for (const c of G.creeps) {
        if (c.dead || hit.has(c) || c.x < 0) continue;
        const dd = (c.x - prev.x) ** 2 + (c.y - prev.y) ** 2;
        if (dd < nd) { nd = dd; nb = c; }
      }
      cur = nb;
    }
    t.ang = Math.atan2(first.y - t.py, first.x - t.px);
    Sfx.play('storm');
  } else {
    const tg = pickTargets(t, cands, s.multishot);
    for (const c of tg) {
      G.projs.push({ kind: s.proj, x: t.px, y: t.py - 6, sx: t.px, sy: t.py, target: c, lx: c.x, ly: c.y, speed: s.pspeed, dmg, crit, tower: t, s, travelled: 0 });
    }
    t.ang = Math.atan2(tg[0].y - t.py, tg[0].x - t.px);
    Sfx.play(t.type);
  }
  t.recoil = 0.1;
  t.flashT = 0.08;
  t.cd = s.rate;
}

function projHit(p) {
  const s = p.s, c = p.target;
  switch (p.kind) {
    case 'arrow': if (!c.dead) dealDamage(c, p.dmg, s.dtype, p.tower, { crit: p.crit }); break;
    case 'shard':
      if (!c.dead) {
        dealDamage(c, p.dmg, s.dtype, p.tower, { crit: p.crit });
        applySlow(c, s.slow, s.slowDur);
        if (s.brittle) { c.brittle = s.brittle; c.brittleT = 3; }
        sparks(p.x, p.y, 5, '#bfe6ff');
      }
      break;
    case 'glob':
      if (!c.dead) {
        dealDamage(c, p.dmg, s.dtype, p.tower, { crit: p.crit });
        applyPoison(c, s.dot, s.dotDur, s.maxStacks, p.tower);
        sparks(p.x, p.y, 4, '#8be04a');
      }
      break;
    case 'ball': {
      const stun = s.stunChance && Math.random() < s.stunChance;
      for (const o of G.creeps) {
        if (o.dead || o.flying) continue;
        const d = Math.hypot(o.x - p.x, o.y - p.y);
        if (d <= s.splash + o.r * 0.5) {
          dealDamage(o, p.dmg * (1 - 0.5 * Math.min(1, d / s.splash)), s.dtype, p.tower, { crit: p.crit && o === c });
          if (stun) applyStun(o, s.stun);
        }
      }
      G.fx.push({ kind: 'boom', x: p.x, y: p.y, r: s.splash, t: 0, life: 0.35 });
      burst(p.x, p.y, 8, '#ffae3a', 2, true);
      smoke(p.x, p.y, s.splash > T * 1.4 ? 6 : 3, 1);
      addDecal({ kind: 'scorch', x: p.x, y: p.y, r: s.splash * 0.55, seed: p.x * 7 + p.y, life: 4 });
      if (s.splash > T * 1.4) G.shake = Math.max(G.shake, 2);
      break;
    }
  }
}

// ---------- spells ----------
function spellCooldown(id) { return SPELLS[id].cd * Math.max(0.3, 1 - G.mods.spellCd); }
function castSpell(id, x, y) {
  if (G.spellCd[id] > 0) { uiError('Spell is not ready yet.'); return false; }
  if (id === 'meteor') {
    G.fx.push({ kind: 'meteor', x, y, t: 0, life: 0.7 });
    G.pendingMeteor = G.pendingMeteor || [];
    G.pendingMeteor.push({ x, y, t: 0.6 });
  } else if (id === 'nova') {
    for (const c of G.creeps) if (!c.dead) { applySlow(c, 0.6, 4); dealDamage(c, 10 + G.wave * 3, 'magic', null); }
    G.fx.push({ kind: 'flash', color: '160,220,255', t: 0, life: 0.6 });
    Sfx.play('nova');
  } else if (id === 'midas') {
    G.midasT = 15;
    G.fx.push({ kind: 'flash', color: '255,215,80', t: 0, life: 0.5 });
    Sfx.play('midas');
    uiMessage('Midas Touch! Double gold for 15s', '#ffd34a');
  }
  G.spellCd[id] = spellCooldown(id);
  return true;
}
function meteorDamage() { return (90 + G.wave * 32) * (1 + G.mods.meteor); }

// ---------- effects ----------
function floatText(x, y, text, color, size = 12) {
  if (G.texts.length > 80) G.texts.shift();
  G.texts.push({ x, y, text, color, size, t: 0, life: 1.0 });
}
function burst(x, y, n, color, spd = 2, glow = false) {
  for (let i = 0; i < n; i++) {
    if (G.parts.length > 600) G.parts.shift();
    const a = Math.random() * Math.PI * 2, v = (0.4 + Math.random()) * spd * 40;
    G.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.4 + Math.random() * 0.4, color, size: 1.5 + Math.random() * 2.5, glow });
  }
}
function sparks(x, y, n, color) { burst(x, y, n, color, 1.2, true); }
function smoke(x, y, n, spread = 1) {
  for (let i = 0; i < n; i++) {
    if (G.parts.length > 600) G.parts.shift();
    const a = Math.random() * Math.PI * 2, v = Math.random() * 18 * spread;
    G.parts.push({ x: x + Math.cos(a) * 6 * spread, y: y + Math.sin(a) * 6 * spread, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 14, t: 0,
      life: 0.8 + Math.random() * 0.7, color: Math.random() < 0.5 ? '#3a3631' : '#59544c', size: 5 + Math.random() * 5 * spread, smoke: true });
  }
}
const CORPSE_COLORS = { splitter: '#7fc23a', oozeling: '#7fc23a', golem: '#6d675c', bat: '#4a1a3a', shaman: '#5a1a12', knight: '#2a2e38', drake: '#cfc3a8', boss: '#4a0a0a' };
function addDecal(d) {
  d.t = 0;
  G.decals.push(d);
  if (G.decals.length > 160) G.decals.shift();
}

// ---------- main update ----------
function update(dt) {
  G.time += dt;
  if (G.timer != null) {
    G.timer -= dt;
    if (G.timer <= 0) startWave(false);
  }
  // spawners
  for (const sp of G.spawners) {
    sp.t -= dt;
    while (sp.t <= 0 && sp.i < sp.list.length) {
      const e = sp.list[sp.i++];
      spawnCreep(e.type, sp.wave, sp.wd);
      sp.t += e.gap;
    }
  }
  G.spawners = G.spawners.filter(sp => sp.i < sp.list.length);

  // spells
  for (const k in G.spellCd) if (G.spellCd[k] > 0) G.spellCd[k] = Math.max(0, G.spellCd[k] - dt);
  if (G.midasT > 0) G.midasT -= dt;
  if (G.pendingMeteor) {
    for (const m of G.pendingMeteor) {
      m.t -= dt;
      if (m.t <= 0) {
        const R = T * 1.6, dmg = meteorDamage();
        for (const c of G.creeps) if (!c.dead && Math.hypot(c.x - m.x, c.y - m.y) <= R + c.r) dealDamage(c, dmg, 'chaos', null);
        G.fx.push({ kind: 'boom', x: m.x, y: m.y, r: R, t: 0, life: 0.6, big: true });
        burst(m.x, m.y, 40, '#ff7a2a', 4, true); burst(m.x, m.y, 20, '#ffd34a', 3, true);
        smoke(m.x, m.y, 16, 2.5);
        addDecal({ kind: 'scorch', x: m.x, y: m.y, r: R * 0.9, seed: m.x + m.y, life: 14 });
        G.shake = Math.max(G.shake, 14);
        Sfx.play('meteor');
      }
    }
    G.pendingMeteor = G.pendingMeteor.filter(m => m.t > 0);
  }

  // creeps
  for (const c of G.creeps) { if (!c.dead) updateCreep(c, dt); if (G.over) return; }
  // towers
  for (const t of G.towers) updateTower(t, dt);
  // projectiles
  for (const p of G.projs) {
    if (!p.target.dead) { p.lx = p.target.x; p.ly = p.target.y - (p.target.flying ? 10 : 0); }
    const dx = p.lx - p.x, dy = p.ly - p.y, d = Math.hypot(dx, dy), mv = p.speed * dt;
    if (d <= mv + 4) { p.x = p.lx; p.y = p.ly; p.done = true; if (!p.target.dead || p.kind === 'ball') projHit(p); }
    else {
      (p.trail || (p.trail = [])).push(p.x, p.y);
      if (p.trail.length > 12) p.trail.splice(0, 2);
      p.x += dx / d * mv; p.y += dy / d * mv; p.travelled += mv; p.ang = Math.atan2(dy, dx);
    }
  }
  G.projs = G.projs.filter(p => !p.done);
  G.creeps = G.creeps.filter(c => !c.dead);

  // fx
  for (const f of G.fx) f.t += dt;
  G.fx = G.fx.filter(f => f.t < f.life);
  for (const t of G.texts) { t.t += dt; t.y -= 22 * dt; }
  G.texts = G.texts.filter(t => t.t < t.life);
  for (const p of G.parts) {
    p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.smoke) { p.vx *= 0.96; p.vy *= 0.96; p.size += dt * 9; } else { p.vx *= 0.92; p.vy *= 0.92; }
  }
  for (const d of G.decals) d.t += dt;
  if (G.decals.length && G.decals[0].t > G.decals[0].life) G.decals = G.decals.filter(d => d.t < d.life);
  // rift portal motes
  if (Math.random() < dt * 14) {
    const a = Math.random() * Math.PI * 2, r = T * (0.5 + Math.random() * 0.4);
    const px = (SPAWN.x + 0.5) * T, py = (SPAWN.y + 0.5) * T;
    G.parts.push({ x: px + Math.cos(a) * r, y: py + Math.sin(a) * r, vx: -Math.sin(a) * 30 - Math.cos(a) * 20, vy: Math.cos(a) * 30 - Math.sin(a) * 20,
      t: 0, life: 0.7, color: Math.random() < 0.5 ? '#c78aff' : '#7a4aff', size: 2 + Math.random() * 2, glow: true });
  }
  G.parts = G.parts.filter(p => p.t < p.life);
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 30);
  if (G.gateHurt > 0) G.gateHurt = Math.max(0, G.gateHurt - dt * 2);
}

function updateCreep(c, dt) {
  if (c.hitFlash > 0) c.hitFlash -= dt;
  if (c.slowT > 0) { c.slowT -= dt; if (c.slowT <= 0) c.slowAmt = 0; }
  if (c.stunT > 0) c.stunT -= dt;
  if (c.brittleT > 0) c.brittleT -= dt;
  if (c.poison.length) {
    let tot = 0;
    for (const p of c.poison) { tot += p.dps; p.t -= dt; }
    c.poison = c.poison.filter(p => p.t > 0);
    dealDamage(c, tot * dt, 'chaos', c.poisonSrc, { dot: true });
    if (c.dead) return;
  }
  if (c.regen) c.hp = Math.min(c.maxHp, c.hp + c.maxHp * c.regen * dt);
  if (c.heal) {
    c.healT -= dt;
    if (c.healT <= 0) {
      c.healT = 1.5;
      for (const o of G.creeps) {
        if (o.dead || o.hp >= o.maxHp) continue;
        if (Math.hypot(o.x - c.x, o.y - c.y) < T * 2.2) {
          o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.05);
          G.fx.push({ kind: 'heal', x: o.x, y: o.y, t: 0, life: 0.6 });
        }
      }
    }
  }
  let move = c.stunT > 0 ? 0 : c.spd * (1 - c.slowAmt) * dt;
  if (c.flying) {
    const ex = (EXIT.x + 0.5) * T, ey = (EXIT.y + 0.5) * T;
    const dx = ex - c.x, dy = ey - c.y, d = Math.hypot(dx, dy);
    if (d <= move) { leakCreep(c); return; }
    c.x += dx / d * move; c.y += dy / d * move; c.ang = Math.atan2(dy, dx);
    c.prog = d / T;
    return;
  }
  let guard = 0;
  while (move > 0 && guard++ < 6) {
    const tx = (c.tx + 0.5) * T, ty = (c.ty + 0.5) * T;
    const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy);
    if (d <= move) {
      c.x = tx; c.y = ty; move -= d;
      c.cx = c.tx; c.cy = c.ty;
      if (c.cx === EXIT.x && c.cy === EXIT.y) { leakCreep(c); return; }
      const n = nextCell(c.cx, c.cy, c.dir, G.dist);
      if (n.x === c.cx && n.y === c.cy) break; // stuck (should not happen)
      c.tx = n.x; c.ty = n.y; c.dir = n.dir;
    } else {
      c.x += dx / d * move; c.y += dy / d * move;
      const ta = Math.atan2(dy, dx);
      let da = ta - c.ang; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      c.ang += da * Math.min(1, dt * 12);
      move = 0;
    }
  }
  const dd = G.dist[idx(c.tx, c.ty)];
  c.prog = (dd === Infinity ? 999 : dd) + Math.hypot((c.tx + 0.5) * T - c.x, (c.ty + 0.5) * T - c.y) / T;
}

function endGame(won) {
  if (G.over) return;
  G.over = true;
  const honor = Math.floor(G.cleared * G.D.honor) + (won ? Math.round(15 * G.D.honor) : 0);
  if (!G.honorGiven) {
    G.honorGiven = true;
    G.honorEarned = honor;
    META.honor += honor;
    META.kills += G.stats.kills;
    if (won) META.wins++;
    saveMeta();
  }
  Sfx.play(won ? 'win' : 'lose');
  uiEndScreen(won);
}

// Bank Honor for the waves cleared so far (used by quick restart). Returns the amount.
function bankHonor() {
  if (!G || G.honorGiven) return 0;
  const h = Math.floor(G.cleared * G.D.honor);
  G.honorGiven = true; G.honorEarned = h;
  META.honor += h; META.kills += G.stats.kills; saveMeta();
  return h;
}

function continueEndless() {
  G.endless = true; G.over = false; G.modal = null;
  G.timer = BUILD_TIME;
  uiMessage('ENDLESS MODE — how long can you hold?', '#ff9f7d');
}

// ---------- relic draft ----------
function relicChoices() {
  const avail = RELICS.filter(r => (G.relics[r.id] || 0) < r.max);
  const n = 3 + talent('draft');
  const out = [];
  while (out.length < n && avail.length) out.push(avail.splice(Math.floor(Math.random() * avail.length), 1)[0]);
  return out;
}
function takeRelic(r) {
  G.relics[r.id] = (G.relics[r.id] || 0) + 1;
  r.apply(G.mods, G);
  recalcAll();
  Sfx.play('relic');
  uiMessage(`Relic acquired: ${r.name}`, '#e0b0ff');
}
