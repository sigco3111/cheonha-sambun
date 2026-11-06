// 전투 엔진
'use strict';

let UID = 1;
function makeUnit(charId, x, y, side, opts = {}) {
  const c = CHARS[charId];
  const lvl = opts.level || 1;
  const growth = (lvl - 1);
  return {
    uid: UID++, charId, name: c.name, cls: opts.cls || c.cls, side,
    x, y, level: lvl, exp: opts.exp || 0,
    maxHp: c.hp + growth * 4, hp: c.hp + growth * 4,
    maxMp: c.mp + growth * 2, mp: c.mp + growth * 2,
    atk: c.atk + growth * 1.6, def: c.def + growth * 1.3,
    int: c.int + growth * 1.4, spd: c.spd + growth * 1.1,
    morale: c.morale, baseMorale: c.morale,
    tactics: c.tactics || [], ai: opts.ai || 'aggressive', holdUntil: opts.holdUntil || 0,
    commander: !!opts.commander, boss: !!opts.boss,
    equip: opts.equip || { weapon: null, armor: null, acc: null },
    done: false, routed: false,
  };
}

function classOf(u) { return CLASSES[u.cls]; }
function catOf(u) { return CLASSES[u.cls].cat; }

function equipStats(u) {
  let atk = 0, def = 0, morale = 0, mp = 0, counter = 0, tacDef = 0, exp = 0;
  for (const slot of ['weapon', 'armor', 'acc']) {
    const e = u.equip[slot];
    if (!e) continue;
    const it = ITEMS[e.id];
    const up = e.up || 0;
    if (it.atk) atk += it.atk + up * 2;
    if (it.def) def += it.def + up * 2;
    if (it.morale) morale += it.morale;
    if (it.mp) mp += it.mp;
    if (it.counter) counter += it.counter;
    if (it.tacDef) tacDef += it.tacDef;
    if (it.exp) exp += it.exp;
  }
  return { atk, def, morale, mp, counter, tacDef, exp };
}

function effMorale(u) { return Math.min(100, u.morale + equipStats(u).morale); } // 장비 사기 포함 유효 사기(상한 100)

// 병종 상성: 기병>보병>궁병>기병, 모사 중립. 우세 ×1.15 / 열세 ×0.85
const MATCHUP = { cavalry: 'infantry', infantry: 'archer', archer: 'cavalry' };
function matchupMod(att, def_) {
  const a = catOf(att), d = catOf(def_);
  if (MATCHUP[a] === d) return 1.15;
  if (MATCHUP[d] === a) return 0.85;
  return 1;
}
function moraleFactor(u) { return 0.75 + (effMorale(u) / 100) * 0.5; } // 0.75~1.25

function computeDamage(att, def_, map) {
  const es = equipStats(att), ds = equipStats(def_);
  const ter = TERRAIN[map[def_.y][def_.x]];
  const base = Math.max(1, (att.atk + es.atk) * moraleFactor(att) - (def_.def + ds.def) * moraleFactor(def_) * 0.8);
  const terMod = 1 - (ter.def / 100);
  const variance = 0.9 + Math.random() * 0.2;
  let dmg = Math.round(base * matchupMod(att, def_) * terMod * variance);
  const crit = Math.random() < (effMorale(att) / 100) * 0.15 + 0.03;
  if (crit) dmg = Math.round(dmg * 1.5);
  return { dmg: Math.max(1, dmg), crit };
}

function forecastDamage(att, def_, map) { // 예상 피해(무작위 없이 결정적) — computeDamage와 동일 계수, 변동폭 0.9~1.1 양끝
  const es = equipStats(att), ds = equipStats(def_);
  const ter = TERRAIN[map[def_.y][def_.x]];
  const base = Math.max(1, (att.atk + es.atk) * moraleFactor(att) - (def_.def + ds.def) * moraleFactor(def_) * 0.8);
  const terMod = 1 - (ter.def / 100);
  const mu = matchupMod(att, def_);
  return {
    min: Math.max(1, Math.round(base * mu * terMod * 0.9)),
    max: Math.max(1, Math.round(base * mu * terMod * 1.1)),
    critPct: Math.round(((effMorale(att) / 100) * 0.15 + 0.03) * 100),
  };
}

function tacticDamage(caster, target) {
  const es = equipStats(caster);
  const raw = Math.round(30 + (caster.int + es.atk) * 1.4 - target.def * 0.5);
  const red = equipStats(target).tacDef || 0; // 철벽갑 등 책략 피해 감소
  return Math.max(1, Math.round(raw * (1 - Math.min(0.8, red))));
}

class Battle {
  constructor(stage, army, cycle = 1) {
    this.stage = stage;
    this.cycle = cycle;
    this.map = buildMap(stage.map);
    this.h = this.map.length; this.w = this.map[0].length;
    this.units = [];
    this.turn = 1;
    this.phase = 'player';
    this.log = [];
    this.over = null;
    this.kills = [];
    this.foeKills = []; // 적 격파/퇴각만 (결과 표시·드랍 보상용)
    this.lootClaimed = false; // 보물창고 점령 여부 (전리품은 승리 시에만 지급)
    for (const p of stage.players) {
      const saved = army[p.char];
      const u = makeUnit(p.char, p.x, p.y, 'player', {
        commander: p.commander,
        level: saved ? saved.level : 1,
        exp: saved ? saved.exp : 0,
        cls: saved ? saved.cls : undefined,
        equip: saved ? saved.equip : undefined,
      });
      if (saved) { u.maxHp = saved.maxHp; u.hp = saved.maxHp; u.maxMp = saved.maxMp; u.mp = saved.maxMp;
        u.atk = saved.atk; u.def = saved.def; u.int = saved.int; u.spd = saved.spd; }
      this.units.push(u);
    }
    for (const e of stage.enemies) {
      this.units.push(makeUnit(e.char, e.x, e.y, 'enemy', { boss: e.boss, ai: e.ai, holdUntil: e.holdUntil, level: stage.id + (cycle - 1) * 4 + (e.boss ? 2 : 0) }));
    }
  }

  unitAt(x, y) { return this.units.find(u => !u.routed && u.hp > 0 && u.x === x && u.y === y); }
  alive(side) { return this.units.filter(u => u.side === side && u.hp > 0 && !u.routed); }
  isBossUnit(u) { return !!(this.stage.bossChar && u.charId === this.stage.bossChar); } // 보스는 사기 0이어도 퇴각하지 않음(위력만 저하)
  checkTreasure(u) { // 보물창고: 아군이 타일에 오르면 점령(전투당 1회, 전리품은 승리 시 지급)
    const t = this.stage.treasure;
    if (!t || this.lootClaimed || u.side !== 'player' || u.hp <= 0 || u.routed) return;
    if (u.x === t.x && u.y === t.y) { this.lootClaimed = true; this.log.push(`${u.name}이(가) 보물창고를 점령했다! 전리품은 승리 후 획득.`); }
  }

  terrainCost(u, x, y) {
    const row = this.map[y];
    const t = row && TERRAIN[row[x]];
    if (!t) return -1;
    return t.costs[catOf(u)] ?? 1;
  }

  moveRange(u) {
    const mv = classOf(u).move;
    const dist = Array.from({ length: this.h }, () => Array(this.w).fill(Infinity));
    dist[u.y][u.x] = 0;
    const q = [[u.x, u.y]];
    const out = [];
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
        const c = this.terrainCost(u, nx, ny);
        if (c < 0) continue;
        const occ = this.unitAt(nx, ny);
        if (occ && occ.side !== u.side) continue;
        const nd = dist[y][x] + c;
        if (nd <= mv && nd < dist[ny][nx]) {
          dist[ny][nx] = nd;
          if (!occ) q.push([nx, ny]);
        }
      }
    }
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++)
      if (dist[y][x] <= mv && dist[y][x] > 0 && !this.unitAt(x, y)) out.push([x, y]);
    return out;
  }

  inRange(att, def_, rMin, rMax) {
    const d = Math.abs(att.x - def_.x) + Math.abs(att.y - def_.y);
    return d >= rMin && d <= rMax;
  }

  forecastAttack(att, def_) { // 공격 예측 프리뷰: 예상 피해(비회심 범위)·회심률·반격
    const f = forecastDamage(att, def_, this.map);
    const critMax = Math.round(f.max * 1.5); // 회심 포함 최대
    let counter = null;
    const cd = classOf(def_);
    if (def_.hp > f.min && cd.counter && this.inRange(def_, att, cd.rMin, cd.rMax)) {
      // 반격은 피격 후 사기로 계산: 비회심 피격 -10, 회심 피격 -18. 두 분기를 모두 포함하는 보증 범위(비회심 반격 기준)를 표시.
      const lo = forecastDamage(Object.assign({}, def_, { morale: Math.max(0, def_.morale - 18) }), att, this.map).min;
      const hi = forecastDamage(Object.assign({}, def_, { morale: Math.max(0, def_.morale - 10) }), att, this.map).max;
      const cmul = 1 + (equipStats(def_).counter || 0); // 반격 특성 반영(표시 범위가 실제를 포함하도록)
      counter = { min: Math.max(1, Math.round(lo * cmul)), max: Math.max(1, Math.round(hi * cmul)), certain: def_.hp > critMax }; // 최소피해 격파=반격 없음, 회심최대 생존=확정, 그 사이=조건부
    }
    const muSign = matchupMod(att, def_) > 1 ? 1 : matchupMod(att, def_) < 1 ? -1 : 0;
    return { ...f, critMax, counter, mu: muSign };
  }

  targetsFor(u) {
    const c = classOf(u);
    return this.alive(u.side === 'player' ? 'enemy' : 'player').filter(e => this.inRange(u, e, c.rMin, c.rMax));
  }

  attack(att, def_) {
    const { dmg, crit } = computeDamage(att, def_, this.map);
    def_.hp = Math.max(0, def_.hp - dmg);
    def_.morale = Math.max(0, def_.morale - (crit ? 18 : 10));
    let msg = `${att.name} → ${def_.name} ${dmg} 피해${crit ? ' (회심!)' : ''}`;
    const events = [{ type: 'attack', att: att.uid, def: def_.uid, dmg, crit }];
    if (def_.hp <= 0) {
      this.kill(def_, att); msg += ` ${def_.name} 격파!`;
    } else {
      if (def_.morale <= 0 && !this.isBossUnit(def_)) { def_.routed = true; msg += ` ${def_.name} 사기 붕괴로 퇴각!`; this.gainExp(att, 20); this.kills.push(def_.charId); if (def_.side === 'enemy') this.foeKills.push(def_.charId); }
      else if (classOf(def_).counter && this.inRange(def_, att, classOf(def_).rMin, classOf(def_).rMax)) {
        const r = computeDamage(def_, att, this.map);
        const cmul = 1 + (equipStats(def_).counter || 0); // 백병도 등 반격 특성
        if (cmul > 1) r.dmg = Math.max(1, Math.round(r.dmg * cmul));
        att.hp = Math.max(0, att.hp - r.dmg);
        att.morale = Math.max(0, att.morale - 6);
        msg += ` / 반격 ${r.dmg}`;
        events.push({ type: 'attack', att: def_.uid, def: att.uid, dmg: r.dmg, crit: r.crit });
        if (att.hp <= 0) { this.kill(att, def_); msg += ` ${att.name} 격파!`; }
        if (att.morale <= 0 && att.hp > 0 && !this.isBossUnit(att)) { att.routed = true; this.kills.push(att.charId); if (att.side === 'enemy') this.foeKills.push(att.charId); }
      }
    }
    this.gainExp(att, def_.hp <= 0 ? 25 : 8);
    this.log.push(msg);
    this.checkEnd();
    return events;
  }

  kill(u, by) {
    u.hp = 0;
    this.kills.push(u.charId);
    if (u.side === 'enemy') this.foeKills.push(u.charId);
    this.gainExp(by, 25);
  }

  gainExp(u, n) {
    if (u.side !== 'player') return;
    n = Math.round(n * (1 + (equipStats(u).exp || 0))); // 수련패 등 경험치 특성
    u.exp += n;
    while (u.exp >= 100) {
      u.exp -= 100; u.level++;
      u.maxHp += 4; u.maxMp += 2; u.atk += 1.6; u.def += 1.3; u.int += 1.4; u.spd += 1.1;
      u.hp = u.maxHp; u.mp = u.maxMp;
      this.log.push(`${u.name} 레벨 ${u.level} 달성!`);
    }
  }

  useTactic(u, tid, tx, ty) {
    const t = TACTICS[tid];
    if (u.mp < t.mp) return [];
    u.mp -= t.mp;
    const targets = [];
    for (const v of this.units) {
      if (v.hp <= 0 || v.routed) continue;
      const d = Math.abs(v.x - tx) + Math.abs(v.y - ty);
      if (d <= t.area) targets.push(v);
    }
    let msg = `${u.name} ${t.name}!`;
    for (const v of targets) {
      if (t.kind === 'damage' && v.side !== u.side) {
        const dmg = tacticDamage(u, v);
        v.hp = Math.max(0, v.hp - dmg);
        v.morale = Math.max(0, v.morale - 12);
        msg += ` ${v.name} ${dmg}`;
        if (v.hp <= 0) { this.kill(v, u); msg += ' 격파!'; }
        else if (v.morale <= 0 && !this.isBossUnit(v)) { v.routed = true; this.kills.push(v.charId); if (v.side === 'enemy') this.foeKills.push(v.charId); msg += ` ${v.name} 퇴각!`; }
      } else if (t.kind === 'heal' && v.side === u.side) {
        v.hp = Math.min(v.maxHp, v.hp + t.power + u.int);
        msg += ` ${v.name} 회복`;
      } else if (t.kind === 'demoralize' && v.side !== u.side) {
        v.morale = Math.max(0, v.morale - t.power);
        msg += ` ${v.name} 사기-${t.power}`;
        if (v.morale <= 0 && v.hp > 0 && !this.isBossUnit(v)) { v.routed = true; this.gainExp(u, 20); this.kills.push(v.charId); if (v.side === 'enemy') this.foeKills.push(v.charId); msg += ` ${v.name} 사기 붕괴로 퇴각!`; }
      } else if (t.kind === 'morale' && v.side === u.side) {
        v.morale = Math.min(100, v.morale + t.power);
        msg += ` ${v.name} 사기+`;
      }
    }
    this.gainExp(u, 10);
    this.log.push(msg);
    this.checkEnd();
    return [{ type: 'tactic', tid, tx, ty }];
  }

  useItem(u, itemId, target) {
    const it = ITEMS[itemId];
    if (!it || !it.use) return false;
    const t = target || u;
    if (it.use.hp) t.hp = Math.min(t.maxHp, t.hp + it.use.hp);
    if (it.use.mp) t.mp = Math.min(t.maxMp, t.mp + it.use.mp);
    this.log.push(`${u.name} ${it.name} 사용 → ${t.name}`);
    return true;
  }

  endPhase() {
    // 턴 시작 효과: 회복 지형, 사기 소폭 회복
    if (this.phase === 'enemy') {
      this.turn++;
      for (const u of this.units) {
        if (u.hp <= 0 || u.routed) continue;
        const t = TERRAIN[this.map[u.y][u.x]];
        if (t.heal) u.hp = Math.min(u.maxHp, u.hp + Math.round(u.maxHp * t.heal));
        const accIt = u.equip && u.equip.acc && ITEMS[u.equip.acc.id];
        if (accIt && accIt.regen) u.hp = Math.min(u.maxHp, u.hp + Math.round(u.maxHp * accIt.regen)); // 호신부 턴 회복
        u.morale = Math.min(100, u.morale + 3);
        u.done = false;
      }
      this.phase = 'player';
    } else {
      for (const u of this.units) if (u.side === 'player') u.done = false;
      this.phase = 'enemy';
    }
  }

  checkEnd() {
    const bossChar = this.stage.bossChar;
    if (bossChar) {
      const boss = this.units.find(u => u.charId === bossChar);
      if (boss && (boss.hp <= 0 || boss.routed)) { this.over = { win: true, reason: `${boss.name} 격파! 승리!` }; return; }
    } else if (this.alive('enemy').length === 0) { this.over = { win: true, reason: '적 전멸! 승리!' }; return; }
    const cmdr = this.units.find(u => u.commander);
    if (!cmdr || cmdr.hp <= 0 || cmdr.routed) { this.over = { win: false, reason: '유비가 쓰러졌다...' }; return; }
    if (this.alive('player').length === 0) { this.over = { win: false, reason: '전군 궤멸...' }; }
  }

  checkTurnLimit() {
    if (!this.over && this.turn > this.stage.maxTurns) this.over = { win: false, reason: '제한 턴 초과...' };
  }

  // AI 한 유닛 행동
  aiAct(u) {
    const foes = this.alive(u.side === 'player' ? 'enemy' : 'player');
    if (!foes.length) return;
    const friends = this.alive(u.side);
    // 오토 아이템: 아군 자동 행동 시 HP 40% 미만이면 회복 도구 우선 사용
    if (u.side === 'player' && this.autoItem && u.hp < u.maxHp * 0.4 && this.autoItem(u)) return;
    // 모사: 아군 치유 우선
    if (u.tactics.includes('heal') && u.mp >= TACTICS.heal.mp) {
      const hurt = friends.filter(f => f.hp < f.maxHp * 0.6 && Math.abs(f.x - u.x) + Math.abs(f.y - u.y) <= TACTICS.heal.range);
      if (hurt.length) { this.useTactic(u, 'heal', hurt[0].x, hurt[0].y); return; }
    }
    if (u.tactics.includes('cheer') && u.mp >= TACTICS.cheer.mp && Math.random() < 0.4) {
      const low = friends.filter(f => f.morale < 70 && Math.abs(f.x - u.x) + Math.abs(f.y - u.y) <= TACTICS.cheer.range);
      if (low.length) { this.useTactic(u, 'cheer', low[0].x, low[0].y); return; }
    }
    // 이미 사거리 안 적이 있으면 공격
    let targets = this.targetsFor(u);
    // 주군 보호: 아군 오토에서 유비는 위협 범위 밖에 머묾 (다른 아군이 있을 때만)
    const isLord = u.side === 'player' && u.charId === 'liu_bei' && friends.length > 1;
    const reach = f => { const cf = classOf(f); return cf.move + cf.rMax; };
    const safeAt = (x, y) => foes.every(f => Math.abs(x - f.x) + Math.abs(y - f.y) > reach(f));
    if (!targets.length && isLord && safeAt(u.x, u.y)) return;
    if (!targets.length) {
      // 이동
      if (u.ai === 'guard') return; // 수비: 사거리 밖이면 절대 이동하지 않음 (공성전 거점 수호)
      if (u.ai === 'hold' && u.morale > 30 && this.turn < (u.holdUntil || Infinity)) {
        // hold: 적이 가까이 오기 전까지 대기 (4칸 이내 적 있으면 반응). holdUntil 턴 도달 시 대기 해제(돌격)
        const near = foes.filter(f => Math.abs(f.x - u.x) + Math.abs(f.y - u.y) <= 4);
        if (!near.length) return;
      }
      const range = this.moveRange(u);
      if (range.length) {
        let pool = range;
        let lordFlee = false;
        if (isLord) {
          const safe = range.filter(([x, y]) => safeAt(x, y));
          if (safe.length) pool = safe; else lordFlee = true;
        }
        const nearest = foes.reduce((a, b) => {
          const da = Math.min(...range.map(([x, y]) => Math.abs(x - a.x) + Math.abs(y - a.y)));
          const db = Math.min(...range.map(([x, y]) => Math.abs(x - b.x) + Math.abs(y - b.y)));
          return db < da ? b : a;
        });
        let best = null, bestScore = Infinity;
        const tr = this.stage.treasure;
        const claimTile = (u.side === 'player' && tr && !this.lootClaimed) ? pool.find(([x, y]) => x === tr.x && y === tr.y) : null;
        if (claimTile) best = claimTile;
        for (const [x, y] of pool) {
          if (claimTile) break;
          const d = Math.abs(x - nearest.x) + Math.abs(y - nearest.y);
          let score;
          if (lordFlee) {
            // 안전 타일이 없으면 적과의 최소거리 최대화(도주)
            const dmin = Math.min(...foes.map(f => Math.abs(x - f.x) + Math.abs(y - f.y)));
            score = -dmin * 100 + d;
          } else {
            const c = classOf(u);
            score = (d >= c.rMin && d <= c.rMax) ? -100 + d : d;
          }
          if (score < bestScore) { bestScore = score; best = [x, y]; }
        }
        if (best) { u.x = best[0]; u.y = best[1]; this.checkTreasure(u); }
      }
      targets = this.targetsFor(u);
    }
    if (targets.length) {
      // 책략 사용 판단 (모사, 범위 밖이거나 강적 상대)
      if (u.tactics.includes('fire') && u.mp >= TACTICS.fire.mp && catOf(u) === 'strategist') {
        const t = targets[0];
        const d = Math.abs(t.x - u.x) + Math.abs(t.y - u.y);
        if (d <= TACTICS.fire.range && (t.boss || t.hp > u.atk * 2)) { this.useTactic(u, 'fire', t.x, t.y); return; }
      }
      // 위협: 사거리 내 적 2기 이상이면 사기 붕괴 노림
      if (u.tactics.includes('intimidate') && u.mp >= TACTICS.intimidate.mp) {
        const near = this.alive('enemy').filter(v => Math.abs(v.x - u.x) + Math.abs(v.y - u.y) <= TACTICS.intimidate.range);
        if (near.length >= 2) { this.useTactic(u, 'intimidate', near[0].x, near[0].y); return; }
      }
      // 가장 약한 적 공격
      const t = targets.reduce((a, b) => (b.hp < a.hp ? b : a));
      this.attack(u, t);
    } else if (u.tactics.includes('fire') && u.mp >= TACTICS.fire.mp) {
      // 사거리 내 적에게 화계
      const inR = foes.filter(f => Math.abs(f.x - u.x) + Math.abs(f.y - u.y) <= TACTICS.fire.range);
      if (inR.length) this.useTactic(u, 'fire', inR[0].x, inR[0].y);
    }
  }

  aiPhase(side) {
    for (const u of this.alive(side)) {
      if (this.over) break;
      this.aiAct(u);
    }
  }
}
