'use strict';
// ============================================================
//  RIFT WARDENS TD — game data (towers, creeps, relics, talents)
// ============================================================

// WC3-style damage vs armor matrix
const DMG_TABLE = {
  pierce: { light: 1.5, medium: 0.75, heavy: 0.9, fortified: 0.4 },
  siege:  { light: 0.6, medium: 1.3,  heavy: 1.0, fortified: 1.5 },
  magic:  { light: 1.0, medium: 0.9,  heavy: 1.6, fortified: 0.5 },
  chaos:  { light: 1.0, medium: 1.0,  heavy: 1.0, fortified: 1.0 },
};
const ARMOR_NAMES = { light: 'Light', medium: 'Medium', heavy: 'Heavy', fortified: 'Fortified' };
const DMG_NAMES = { pierce: 'Pierce', siege: 'Siege', magic: 'Magic', chaos: 'Chaos' };
const DMG_COLORS = { pierce: '#e8d27a', siege: '#e8914a', magic: '#8ab8ff', chaos: '#c77dff' };

const LVL_DMG = [1, 1.75, 3];
const LVL_RANGE = [0, 0.25, 0.5];
const RANKS = [8, 25, 60, 120, 250, 500]; // kills needed for veterancy ranks
const RANK_DMG = 0.08;

// Command-card hotkeys follow the WC3 grid layout:  Q W E R / A S D F / Z X C V
const TOWERS = {
  arrow: {
    name: 'Arrow Tower', hk: 'Q', cost: 12, type: 'pierce', dmg: 7, range: 3.2, rate: 0.65,
    proj: 'arrow', pspeed: 750, air: true,
    desc: 'Cheap, fast single-target archers. Pierce: crushes Light armor, weak vs Fortified.',
    branches: [
      { id: 'sniper', name: 'Sniper Nest', desc: '+2.5 range, x3 damage, slower. 25% chance to crit for x3. Defaults to Strongest target.',
        mod: { dmgMul: 3, rangeAdd: 2.5, rateMul: 1.7, crit: 0.25, critMul: 3, target: 'strong' } },
      { id: 'volley', name: 'Volley Tower', desc: 'Looses arrows at up to 4 targets at once and fires 20% faster.',
        mod: { multishot: 4, rateMul: 0.8 } },
    ],
  },
  cannon: {
    name: 'Cannon Tower', hk: 'W', cost: 25, type: 'siege', dmg: 16, range: 2.8, rate: 1.5,
    proj: 'ball', pspeed: 400, splash: 1.0, air: false,
    desc: 'Splash damage to ground units. Siege: great vs Medium & Fortified. Cannot hit air.',
    branches: [
      { id: 'mortar', name: 'Mortar Pit', desc: 'x1.8 damage, +2 range, +70% splash radius. Slightly slower.',
        mod: { dmgMul: 1.8, rangeAdd: 2, splashMul: 1.7, rateMul: 1.3 } },
      { id: 'concuss', name: 'Concussion Battery', desc: 'Fires 80% faster. 20% chance to stun everything in the blast.',
        mod: { rateMul: 0.55, stunChance: 0.2, stun: 0.6 } },
    ],
  },
  frost: {
    name: 'Frost Spire', hk: 'E', cost: 30, type: 'magic', dmg: 5, range: 2.8, rate: 1.0,
    proj: 'shard', pspeed: 550, slow: 0.4, slowDur: 2.0, air: true,
    desc: 'Ice shards slow enemies by 40%. Magic: great vs Heavy armor.',
    branches: [
      { id: 'blizzard', name: 'Blizzard Spire', desc: 'Pulses frost that hits and slows EVERY enemy in range.',
        mod: { pulse: true, slowAdd: 0.1, rateMul: 1.2, dmgMul: 1.5 } },
      { id: 'shatter', name: 'Shatter Spire', desc: 'x4 damage. Hit enemies become Brittle: +30% damage taken from ALL sources.',
        mod: { dmgMul: 4, brittle: 0.3 } },
    ],
  },
  storm: {
    name: 'Storm Pylon', hk: 'R', cost: 45, type: 'magic', dmg: 20, range: 3.0, rate: 1.4,
    chain: 3, falloff: 0.75, air: true,
    desc: 'Chain lightning arcs between 3 enemies. Magic damage.',
    branches: [
      { id: 'tempest', name: 'Tempest Pylon', desc: 'Lightning chains to 4 more enemies and loses less power per jump.',
        mod: { chainAdd: 4, falloff: 0.88 } },
      { id: 'obelisk', name: 'Arcane Obelisk', desc: 'Single huge bolt: x3 damage, +0.7 range. Each hit shreds 2 armor (stacks to 10).',
        mod: { dmgMul: 3, chainSet: 1, shred: 2, rangeAdd: 0.7 } },
    ],
  },
  poison: {
    name: 'Venom Totem', hk: 'A', cost: 35, type: 'chaos', dmg: 2, range: 2.8, rate: 0.9,
    proj: 'glob', pspeed: 480, dot: 6, dotDur: 4, maxStacks: 3, air: true,
    desc: 'Stacking poison (3 stacks). Chaos damage ignores armor types.',
    branches: [
      { id: 'plague', name: 'Plague Totem', desc: 'Double poison damage. Poisoned enemies spread poison when they die.',
        mod: { dotMul: 2, spread: true } },
      { id: 'venom', name: 'Viper Totem', desc: 'Poison stacks up to 8 times, +40% poison, fires 40% faster.',
        mod: { stacksAdd: 5, dotMul: 1.4, rateMul: 0.7 } },
    ],
  },
  shrine: {
    name: 'War Shrine', hk: 'S', cost: 60, aura: true, auraDmg: 0.15, auraRate: 0.10,
    desc: 'Aura: the 8 surrounding towers deal +15% damage and attack 10% faster. Does not attack.',
    branches: [
      { id: 'banner', name: 'War Banner', desc: 'Aura damage bonus +30% more.', mod: { auraDmgAdd: 0.3 } },
      { id: 'haste', name: 'Haste Totem', desc: 'Aura attack speed bonus +30% more.', mod: { auraRateAdd: 0.3 } },
    ],
  },
  market: {
    name: 'Goblin Market', hk: 'D', cost: 70, income: [8, 15, 25],
    desc: 'Pays gold at the start of every wave and +0.5% interest. Upgrade for more income.',
    branches: [
      { id: 'bank', name: 'Gilded Bank', desc: '25 gold per wave, +3% interest and +40 interest cap.', mod: { incomeSet: 25, interestAdd: 0.03, capAdd: 40 } },
      { id: 'mine', name: 'Gold Mine', desc: '55 gold per wave. Pure greed.', mod: { incomeSet: 55 } },
    ],
  },
  wall: {
    name: 'Barricade', hk: 'F', cost: 3, wall: true,
    desc: 'Dirt-cheap block for building mazes. Longer maze = more time to kill. Does not attack.',
  },
};
const TOWER_ORDER = ['arrow', 'cannon', 'frost', 'storm', 'poison', 'shrine', 'market', 'wall'];

const CREEPS = {
  grunt:    { name: 'Rotling',      hp: 1.0,  spd: 1.0,  armor: 'medium',    av: 1, bounty: 1,   r: 11, gap: 0.8, desc: 'Shambling undead.' },
  runner:   { name: 'Dire Wolf',    hp: 0.55, spd: 1.75, armor: 'light',     av: 0, bounty: 0.8, r: 10, gap: 0.45, desc: 'Very fast.' },
  golem:    { name: 'Stone Golem',  hp: 2.6,  spd: 0.62, armor: 'heavy',     av: 4, bounty: 2,   r: 14, gap: 1.3, desc: 'Slow and heavily armored.' },
  bat:      { name: 'Cave Bat',     hp: 0.6,  spd: 1.25, armor: 'light',     av: 0, bounty: 1,   r: 9,  gap: 0.55, flying: true, desc: 'Flying: ignores your maze!' },
  shaman:   { name: 'Bog Shaman',   hp: 0.9,  spd: 0.95, armor: 'medium',    av: 1, bounty: 1.5, r: 11, gap: 0.9, heal: true, desc: 'Heals nearby allies.' },
  splitter: { name: 'Ooze',         hp: 1.3,  spd: 0.85, armor: 'medium',    av: 0, bounty: 1,   r: 13, gap: 1.1, split: 'oozeling', desc: 'Splits into 2 Oozelings on death.' },
  oozeling: { name: 'Oozeling',     hp: 0.35, spd: 1.3,  armor: 'light',     av: 0, bounty: 0.3, r: 7,  gap: 0.3, desc: 'Tiny and quick.' },
  knight:   { name: 'Dread Knight', hp: 1.9,  spd: 1.05, armor: 'heavy',     av: 3, bounty: 2,   r: 12, gap: 0.9, slowImmune: true, desc: 'Warded: immune to slows and stuns.' },
  boss:     { name: 'Colossus',     hp: 26,   spd: 0.55, armor: 'fortified', av: 5, bounty: 25,  r: 20, gap: 3,   boss: true, leak: 5, lumber: 3, desc: 'BOSS. Fortified armor. Costs 5 lives if it escapes.' },
  drake:    { name: 'Bone Drake',   hp: 18,   spd: 0.75, armor: 'fortified', av: 4, bounty: 25,  r: 18, gap: 3,   boss: true, flying: true, leak: 5, lumber: 3, desc: 'FLYING BOSS. Fortified armor.' },
};

const BOSS_NAMES = {
  boss: ['Gorrak the Devourer', 'The Iron Colossus', 'Malgrith the Undying', 'Old Grumblegut', 'The Hollow King'],
  drake: ['Vex, Bone Drake', 'Skyrot the Ancient', 'Morvane, Ash Wing'],
};

const WAVE_KINDS = {
  grunt:    { name: 'Rotling Horde',   groups: [['grunt', 1]] },
  runner:   { name: 'Dire Wolf Pack',  groups: [['runner', 1.4]] },
  golem:    { name: 'Stone Golems',    groups: [['golem', 0.5]] },
  bat:      { name: 'Bat Swarm',       groups: [['bat', 1.1]] },
  splitter: { name: 'Ooze Tide',       groups: [['splitter', 0.6]] },
  shaman:   { name: 'Bog Coven',       groups: [['grunt', 0.7], ['shaman', 0.3]], mix: true },
  knight:   { name: 'Dread Knights',   groups: [['knight', 0.6]] },
  mixed:    { name: 'Warband',         groups: null, mix: true },
};
const EARLY_WAVES = ['grunt', 'grunt', 'runner', 'grunt', 'golem', 'bat', 'splitter', 'shaman', 'runner', 'BOSS',
                     'knight', 'grunt', 'bat', 'golem', 'splitter', 'runner', 'shaman', 'knight', 'mixed', 'BOSS'];
const WAVE_POOL = ['grunt', 'runner', 'golem', 'bat', 'splitter', 'shaman', 'knight', 'mixed', 'mixed'];

const AFFIXES = {
  armored:  { name: 'Armored',      color: '#b0b8c0', desc: '+4 armor' },
  hasted:   { name: 'Hasted',       color: '#ffd166', desc: '+35% movement speed' },
  regen:    { name: 'Regenerating', color: '#7dff9a', desc: 'Regenerates 2% HP per second' },
  swarm:    { name: 'Swarm',        color: '#ff9f7d', desc: 'Twice as many, but 45% weaker' },
  warded:   { name: 'Warded',       color: '#9ad0ff', desc: 'Immune to slows and stuns' },
  titanic:  { name: 'Titanic',      color: '#ff6b6b', desc: '+60% HP, -15% speed, +50% bounty' },
};

const SPELLS = {
  meteor: { name: 'Meteor', hk: 'Z', icon: '☄️', cd: 45, desc: 'Call down a meteor dealing massive Chaos damage in an area (hits air too). Scales with wave.' },
  nova:   { name: 'Frost Nova', hk: 'X', icon: '❄️', cd: 70, desc: 'Freeze the battlefield: every enemy is slowed by 60% for 4s.' },
  midas:  { name: 'Midas Touch', hk: 'C', icon: '🪙', cd: 100, desc: 'For 15 seconds, all kills give DOUBLE gold.' },
};

// Relics drafted every 5 waves (roguelike boons)
const RELICS = [
  { id: 'arrowheads', icon: '🏹', name: 'Barbed Arrowheads', max: 3, desc: 'Arrow Towers deal +40% damage.', apply: m => { m.dmg.arrow = (m.dmg.arrow || 0) + 0.4; } },
  { id: 'powder', icon: '💥', name: 'Black Powder', max: 3, desc: 'Cannon Towers +30% damage and +25% splash radius.', apply: m => { m.dmg.cannon = (m.dmg.cannon || 0) + 0.3; m.splash += 0.25; } },
  { id: 'winter', icon: '🧊', name: 'Eternal Winter', max: 2, desc: 'Slows last 50% longer and are 10% stronger.', apply: m => { m.slowDur += 0.5; m.slowAdd += 0.1; } },
  { id: 'ore', icon: '⚡', name: 'Conductive Ore', max: 3, desc: 'Storm Pylons chain to 2 more enemies.', apply: m => { m.chain += 2; m.dmg.storm = (m.dmg.storm || 0) + 0.1; } },
  { id: 'virulence', icon: '🧪', name: 'Virulence', max: 3, desc: 'Poison deals +50% damage.', apply: m => { m.dot += 0.5; } },
  { id: 'accountant', icon: '📜', name: 'Goblin Accountant', max: 3, desc: '+2% interest and +25 interest cap.', apply: m => { m.interest += 0.02; m.interestCap += 25; } },
  { id: 'bounty', icon: '💰', name: 'Bounty Hunter', max: 3, desc: 'Kills give +25% gold.', apply: m => { m.bounty += 0.25; } },
  { id: 'masons', icon: '🧱', name: 'Masonry Guild', max: 2, desc: 'Towers and upgrades cost 12% less.', apply: m => { m.cost += 0.12; } },
  { id: 'deadeye', icon: '🎯', name: 'Deadeye', max: 3, desc: 'All towers gain 10% chance to critically strike for x2.5.', apply: m => { m.crit += 0.1; } },
  { id: 'overclock', icon: '⚙️', name: 'Overclock', max: 3, desc: 'All towers attack 12% faster.', apply: m => { m.rate += 0.12; } },
  { id: 'eagle', icon: '🦅', name: 'Eagle Eye', max: 2, desc: 'All towers +0.5 range.', apply: m => { m.range += 0.5; } },
  { id: 'fortify', icon: '🏰', name: 'Fortify the Gate', max: 3, desc: 'Gain +8 lives immediately.', apply: (m, G) => { G.lives += 8; } },
  { id: 'lumber', icon: '🪵', name: 'Lumber Camp', max: 3, desc: 'Gain +3 lumber immediately (for tower specializations).', apply: (m, G) => { G.lumber += 3; } },
  { id: 'arcane', icon: '🔮', name: 'Arcane Focus', max: 2, desc: 'Spell cooldowns -30%, Meteor +50% damage.', apply: m => { m.spellCd += 0.3; m.meteor += 0.5; } },
  { id: 'salvage', icon: '♻️', name: 'Salvage Rights', max: 1, desc: 'Selling towers refunds 100% of gold spent.', apply: m => { m.refund = 1; } },
  { id: 'slayer', icon: '🗡️', name: 'Giant Slayer', max: 2, desc: 'Towers deal +30% damage to bosses.', apply: m => { m.giant += 0.3; } },
  { id: 'cloud', icon: '☠️', name: 'Venom Cloud', max: 1, desc: 'ALL poisoned enemies spread poison on death.', apply: m => { m.spread = true; } },
  { id: 'glacial', icon: '❄️', name: 'Glacial Shards', max: 1, desc: 'Slowed enemies take +20% damage from all sources.', apply: m => { m.glacial = 0.2; } },
  { id: 'warchest', icon: '👑', name: 'Royal Treasury', max: 3, desc: 'Gain 150 gold immediately.', apply: (m, G) => { G.gold += 150; } },
  { id: 'fury', icon: '🔥', name: 'Battle Fury', max: 3, desc: 'All towers deal +15% damage.', apply: m => { m.dmgAll += 0.15; } },
];

// Permanent meta-progression bought with Honor
const TALENTS = [
  { id: 'gold', icon: '💰', name: 'War Chest', max: 5, desc: '+20 starting gold per rank.', cost: r => 2 + r * 3 },
  { id: 'lives', icon: '❤️', name: 'Stone Walls', max: 5, desc: '+3 starting lives per rank.', cost: r => 2 + r * 3 },
  { id: 'interest', icon: '📈', name: 'Compound Interest', max: 4, desc: '+0.5% interest per rank.', cost: r => 4 + r * 4 },
  { id: 'dmg', icon: '⚔️', name: 'Veteran Crews', max: 5, desc: 'All towers +4% damage per rank.', cost: r => 3 + r * 4 },
  { id: 'spells', icon: '🔮', name: 'Arcane Study', max: 3, desc: 'Spell cooldowns -8% per rank.', cost: r => 4 + r * 4 },
  { id: 'lumber', icon: '🪵', name: 'Lumber Mill', max: 3, desc: '+1 starting lumber per rank.', cost: r => 5 + r * 5 },
  { id: 'draft', icon: '🃏', name: 'Treasure Maps', max: 1, desc: 'Relic drafts offer 4 choices instead of 3.', cost: r => 20 },
  { id: 'reroll', icon: '🎲', name: 'Fortune Teller', max: 2, desc: '+1 free relic re-roll per game per rank.', cost: r => 8 + r * 8 },
];

const DIFFS = {
  normal:    { name: 'Normal',    hp: 1.0,  lives: 20, gold: 90, interestMul: 1,   honor: 1,   desc: 'The classic defense.' },
  hard:      { name: 'Hard',      hp: 1.35, lives: 15, gold: 80, interestMul: 1,   honor: 1.6, desc: '+35% creep HP, 15 lives. x1.6 Honor.' },
  nightmare: { name: 'Nightmare', hp: 1.8,  lives: 10, gold: 75, interestMul: 0.5, honor: 2.5, desc: '+80% HP, 10 lives, half interest. x2.5 Honor.' },
};

const FINAL_WAVE = 40;
const BUILD_TIME = 15;
