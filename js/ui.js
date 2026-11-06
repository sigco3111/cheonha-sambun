// 렌더링 + 화면 상태기계
'use strict';

const TILE = 48;
const IMG = { terrain: {}, units: {} };
const TERRAIN_KEYS = Object.keys(TERRAIN);
const UNIT_SPRITES = ['infantry','cavalry','archer','strategist','enemy_infantry','enemy_cavalry','enemy_archer','enemy_strategist'];
// Sprite files renamed on GitHub (web UI upload prefixed them); map sprite keys to actual file basenames.
const SPRITE_FILE = {cavalry:'1-cavalry', archer:'2-archer', strategist:'1-strategist', enemy_cavalry:'4-enemy_cavalry', enemy_archer:'5-enemy_archer', enemy_strategist:'6-enemy_strategist', infantry:'new_infantry', enemy_infantry:'new_enemy_infantry'};
// Individual commander sprites (allied officers); fallback to class sprite when absent.
const CHAR_SPRITES = ['liu_bei','guan_yu','zhang_fei','jian_yong','sun_qian','mi_zhu','cheng','deng','pei','zhang_jue','hua_xiong','lu_bu','li_ru','dong_zhuo','li_jue','guo_si'];

function loadImages(cb) {
  let total = TERRAIN_KEYS.length + UNIT_SPRITES.length + CHAR_SPRITES.length; let done = 0;
  const check = () => { if (++done >= total) cb(); };
  for (const k of TERRAIN_KEYS) { const im = new Image(); im.onload = check; im.onerror = check; im.src = `assets/terrain/${k}.png`; IMG.terrain[k] = im; }
  for (const k of UNIT_SPRITES) { const im = new Image(); im.onload = check; im.onerror = check; im.src = `assets/units/${SPRITE_FILE[k] || k}_0_0.png`; IMG.units[k] = im; }
  for (const k of CHAR_SPRITES) { const im = new Image(); im.onload = check; im.onerror = check; im.src = `assets/units/char_${k}_0_0.png`; (IMG.chars ||= {})[k] = im; }
}

function spriteFor(u) {
  if (IMG.chars && IMG.chars[u.charId] && IMG.chars[u.charId].naturalWidth) return IMG.chars[u.charId];
  const c = CLASSES[u.cls];
  let key = c.sprite;
  if (u.side === 'enemy') key = 'enemy_' + c.cat;
  return IMG.units[key] || IMG.units.infantry;
}

const Game = {
  screen: 'title',
  battle: null,
  army: {},          // charId -> persistent state
  inventory: [],     // [{id, up}]
  gold: 500,
  selected: null, moveTiles: [], menuFor: null,
  auto: false, fast: false, speed: 1,
  stageIndex: 0, cycle: 1, battlesCleared: 0,
  records: { wins: 0, bestTurns: {}, noDeath: {}, grades: {}, ach: {} }, // 명예 기록(보상 없음): 누적 승리·최단 턴·무사망·최고 등급·업적
  canvas: null, ctx: null,
  zoom: 1, ZOOM_MIN: 0.4, ZOOM_MAX: 2.5,
  fx: [], threatTiles: null, _fxRunning: false,
  delay: (ms) => new Promise(r => setTimeout(r, Game.fast || Game.auto ? 30 : ms / Game.speed)),

  armyComplete(a) { const NEED = ['liu_bei', 'guan_yu', 'zhang_fei', 'jian_yong', 'sun_qian', 'mi_zhu']; return !!a && NEED.every(id => !!a[id]); }, // 정상 군단 완전성 술어 (save/load/startBattle 공통)
  save() {
    if (!this.armyComplete(this.army)) { console.warn('[save 차단] 군단 데이터가 불완전해 기존 세이브를 보호합니다'); return; } // 비정상 상태에서 원본 세이브 덮어쓰기 방지
    localStorage.setItem('cheonha3_save', JSON.stringify({
      army: this.army, inventory: this.inventory, gold: this.gold, stageIndex: this.stageIndex, cycle: this.cycle, battlesCleared: this.battlesCleared, deploySel: this.deploySel,
      records: this.records, bonusCycle: this.bonusCycle || 0, epilogue: this.epilogue || null, epilogueHistory: this.epilogueHistory || {},
    }));
  },
  load() {
    const s = localStorage.getItem('cheonha3_save');
    if (!s) return false;
    const d = JSON.parse(s);
    if (!this.armyComplete(d.army)) { // 손상 세이브: 원본을 바꾸지 않고 로드하지 않음 (자동 복구/초기화는 하지 않음)
      console.warn('[load 차단] 세이브의 군단 데이터가 비어 있거나 누락됐습니다');
      this._corruptSave = true; this.renderTitle();
      return false;
    }
    this.army = d.army; this.inventory = d.inventory; this.gold = d.gold; this.stageIndex = d.stageIndex;
    this.deploySel = (d.deploySel && Array.isArray(d.deploySel.picks)) ? d.deploySel : null; // 구 세이브(필드 없음)는 기본 편성
    this.cycle = d.cycle || 1;
    this.epilogue = d.epilogue || null; this.epilogueHistory = d.epilogueHistory || {};
    this.bonusCycle = d.bonusCycle || 0; // 구세이브(필드 없음)는 0. 미지급 회차는 브리핑에서 1회 보완
    // 구세이브(battlesCleared 없음): 신규 전투 추가 전 기준(6전)으로 누적 승리 수를 복원해 상점 로테이션 연속성 유지
    this.battlesCleared = (d.battlesCleared != null) ? d.battlesCleared : (this.stageIndex + (this.cycle - 1) * 6);
    const dr = d.records; // 구세이브(records 없음)는 빈 기록으로 시작 — 기존 진행은 그대로
    this.records = (dr && typeof dr === 'object') ? { wins: dr.wins || 0, bestTurns: dr.bestTurns || {}, noDeath: dr.noDeath || {}, grades: dr.grades || {}, ach: dr.ach || {}, support: dr.support || null } : { wins: 0, bestTurns: {}, noDeath: {}, grades: {}, ach: {}, support: null };
    return true;
  },
  applyCycleBonus() { // 업적 시작 보상: 회차별 지급 이력(bonusCycle)으로 중복 없이 회차당 1회 보장. 구 data 혼합 시 보류(전파 후 자동 재시도)
    if (typeof startBonusFor !== 'function') return false;
    if ((this.bonusCycle || 0) === this.cycle) return false;
    const grants = startBonusFor(this.records && this.records.ach);
    for (const g of grants) {
      if (g.gold) this.gold += g.gold;
      if (g.items) for (const it of g.items) this.inventory.push({ id: it, up: 0 });
    }
    this._cycleBonus = grants.map(g => g.label);
    this.bonusCycle = this.cycle;
    this.save();
    return grants.length > 0;
  },

  initArmy() {
    for (const id of ['liu_bei','guan_yu','zhang_fei','jian_yong','sun_qian','mi_zhu']) {
      const c = CHARS[id];
      this.army[id] = {
        charId: id, cls: c.cls, level: 1, exp: 0,
        maxHp: c.hp, maxMp: c.mp, atk: c.atk, def: c.def, int: c.int, spd: c.spd,
        equip: { weapon: null, armor: null, acc: null },
      };
    }
    this.army.liu_bei.equip.weapon = { id: 'iron_sword', up: 0 };
    this.army.guan_yu.equip.weapon = { id: 'spear', up: 0 };
    this.army.zhang_fei.equip.weapon = { id: 'spear', up: 0 };
    this.army.sun_qian.equip.weapon = { id: 'bow', up: 0 };
    this.army.jian_yong.equip.weapon = { id: 'fan', up: 0 };
    this.inventory = [{ id: 'leather', up: 0 }, { id: 'leather', up: 0 }, { id: 'bean', up: 0 }, { id: 'bean', up: 0 }, { id: 'ore', up: 0 }];
    this.gold = 500;
  },

  resetRun() { // 새 게임: 진행 상태 전체 초기화 — 회차/누적 승리/기록이 이전 런에서 넘어오면 적 레벨 스케일·상점 로테이션이 어긋남
    this.stageIndex = 0; this.cycle = 1; this.battlesCleared = 0;
    this.records = { wins: 0, bestTurns: {}, noDeath: {}, grades: {}, ach: {} };
    this.deploySel = null; this.epilogue = null; this.epilogueHistory = {};
  },

  // 회차 시작 지원(선택지 해금의 첫 선택 단계): 업적이 옵션을 해금, 회차 첫 전투 브리핑에서 택1. 중간 회차 세이브는 다음 회차부터 대상(소급·마이그레이션 없음)
  supportOptions() {
    const defs = [
      { id: 'gold', ach: 'new_cycle', achName: '새로운 천하', label: '군자금 800골드', apply: () => { this.gold += 800; } },
      { id: 'ore', ach: 'smith', achName: '대장의 손길', label: '철광석 3개', apply: () => { for (let i = 0; i < 3; i++) this.inventory.push({ id: 'ore', up: 0 }); } },
      { id: 'food', ach: 'veteran', achName: '백전노장', label: '식량 꾸러미(쌀 2·콩 2)', apply: () => { this.inventory.push({ id: 'rice', up: 0 }, { id: 'rice', up: 0 }, { id: 'bean', up: 0 }, { id: 'bean', up: 0 }); } },
      { id: 'scroll', ach: 'first_s', achName: '무결의 첫걸음', label: '족자 1개(MP+10 장신구)', apply: () => { this.inventory.push({ id: 'scroll', up: 0 }); } },
    ];
    return defs.map(d => ({ ...d, unlocked: !!(this.records.ach || {})[d.ach] }));
  },

  supportAvailable() { return this.cycle >= 2 && this.stageIndex === 0 && !(this.records.support && this.records.support.c === this.cycle) && this.supportOptions().some(x => x.unlocked); },

  claimSupport(id) {
    // 원자적 수령: 조건 재검증 → 적용 → 기록 → 저장을 동기 실행으로 한 번에 (새로고침·더블클릭·브리핑 재진입 중복 지급 방지)
    if (!this.supportAvailable()) return;
    const o = this.supportOptions().find(x => x.id === id && x.unlocked);
    if (!o) return;
    o.apply();
    this.records.support = { c: this.cycle, id };
    this.save();
    this.renderBriefing();
  },

  // 합류 장수(오리지널 IF): 업적 해금 시 1회만 군단 편입 — 합류 레벨·초기 능력·초기 장비는 편입 순간 확정 저장(재로드/화면 재진입으로 재상승 없음)
  checkJoiners() {
    const joined = [];
    if ((this.records.ach || {}).nine && !this.army.guan_hai && Object.keys(this.army).length >= 6) {
      const lv = Math.max(1, Math.round(Object.values(this.army).reduce((sum, a) => sum + a.level, 0) / Object.keys(this.army).length));
      const c = CHARS.guan_hai, g = lv - 1; // gainExp와 같은 성장 계수를 편입 시 1회만 적용
      this.army.guan_hai = {
        charId: 'guan_hai', cls: c.cls, level: lv, exp: 0,
        maxHp: c.hp + 4 * g, maxMp: c.mp + 2 * g, atk: c.atk + 1.6 * g, def: c.def + 1.3 * g, int: c.int + 1.4 * g, spd: c.spd + 1.1 * g,
        equip: { weapon: { id: 'iron_sword', up: 0 }, armor: null, acc: null }, // 초기 장비 고정
      };
      joined.push('guan_hai');
      this.save();
    }
    if ((this.records.ach || {}).swift && !this.army.taishi_ci && Object.keys(this.army).length >= 6) {
      const lv = Math.max(1, Math.round(Object.values(this.army).reduce((sum, a) => sum + a.level, 0) / Object.keys(this.army).length));
      const c = CHARS.taishi_ci, g = lv - 1; // 관해와 같은 1회 편입 규칙(성장 계수 편입 시 1회만)
      this.army.taishi_ci = {
        charId: 'taishi_ci', cls: c.cls, level: lv, exp: 0,
        maxHp: c.hp + 4 * g, maxMp: c.mp + 2 * g, atk: c.atk + 1.6 * g, def: c.def + 1.3 * g, int: c.int + 1.4 * g, spd: c.spd + 1.1 * g,
        equip: { weapon: { id: 'bow', up: 0 }, armor: null, acc: null }, // 초기 장비 고정
      };
      joined.push('taishi_ci');
      this.save();
    }
    if ((this.records.ach || {}).veteran && !this.army.zhou_cang && Object.keys(this.army).length >= 6) {
      const lv = Math.max(1, Math.round(Object.values(this.army).reduce((sum, a) => sum + a.level, 0) / Object.keys(this.army).length));
      const c = CHARS.zhou_cang, g = lv - 1; // 관해·태사자와 같은 1회 편입 규칙
      this.army.zhou_cang = {
        charId: 'zhou_cang', cls: c.cls, level: lv, exp: 0,
        maxHp: c.hp + 4 * g, maxMp: c.mp + 2 * g, atk: c.atk + 1.6 * g, def: c.def + 1.3 * g, int: c.int + 1.4 * g, spd: c.spd + 1.1 * g,
        equip: { weapon: { id: 'spear', up: 0 }, armor: null, acc: null }, // 초기 장비 고정
      };
      joined.push('zhou_cang');
      this.save();
    }
    return joined;
  },

  // 편성(출전 선택): stage.players를 슬롯(좌표·지휘관) 목록으로 보고 선택 장수를 순서대로 매핑. 유비는 지휘관 슬롯 고정
  deploySlots() { return STAGES[this.stageIndex].players; },
  defaultDeploy() { return this.deploySlots().map(p => p.char).filter(id => this.army[id]); },
  // 유효 선택(유비 선두 고정·보유만·슬롯 수 정확). 저장 선택이 현재 슬롯과 어긋나면 자동 보정하고 그 내용을 corrected에 돌려줌
  deploySelection() {
    const slots = this.deploySlots().length;
    const def = this.defaultDeploy();
    const stored = (this.deploySel && Array.isArray(this.deploySel.picks)) ? this.deploySel : null;
    let corrected = false;
    const dropped = [], added = [];
    const picks = [];
    if (!stored) { for (const id of def) { if (id !== 'liu_bei' && this.army[id] && !picks.includes(id)) picks.push(id); } }
    else {
      for (const id of stored.picks) { if (id !== 'liu_bei' && this.army[id] && !picks.includes(id)) picks.push(id); }
      if (stored.stage !== this.stageIndex) { // 스테이지가 달라져 슬롯 수가 어긋날 때만 자동 보정(제외/보충된 장수를 이름으로 표시), 같은 스테이지의 사용자 선택은 그대로 존중
        if (picks.length > slots - 1) { dropped.push(...picks.splice(slots - 1)); }
        for (const id of [...def, ...Object.keys(this.army)]) { if (picks.length >= slots - 1) break; if (id !== 'liu_bei' && !picks.includes(id)) { picks.push(id); added.push(id); } }
        corrected = true;
      }
    }
    const sel = ['liu_bei', ...picks];
    const valid = sel.length === slots && sel.every(id => this.army[id]);
    return { sel, valid, corrected, dropped, added };
  },

  // 업적 뼈대(다회차 장치, 명예 전용·보상 없음): 조건은 전부 저장된 기록/군단 상태로 검증 — 후속 증분에서 숨겨진 장수·병종 해금의 연결점
  checkAchievements() {
    if (!this.records.ach) this.records.ach = {};
    const defs = [
      { id: 'first_s', name: '무결의 첫걸음', desc: '어떤 전투든 S 등급 달성', ok: () => Object.values(this.records.grades || {}).some(g => g.g === 'S') },
      { id: 'nine', name: '아홉 전투 정복', desc: '제1전~제9전 모두 클리어', ok: () => STAGES.every(st => (this.records.grades || {})[st.id]) },
      { id: 'flawless', name: '불사의 군단', desc: '모든 전투를 무사망으로 클리어한 기록 보유', ok: () => STAGES.every(st => ((this.records.noDeath || {})[st.id] || 0) > 0) },
      { id: 'smith', name: '대장의 손길', desc: '장비 +5 강화 달성', ok: () => Object.values(this.army || {}).some(a => Object.values(a.equip || {}).some(e => e && (e.up || 0) >= 5)) },
      { id: 'swift', name: '질풍신뢰', desc: '신속 목표 내 클리어 기록 보유', ok: () => STAGES.some(st => { const bt = (this.records.bestTurns || {})[st.id]; const t = (bt && typeof bt === 'object') ? bt.t : bt; return t != null && st.fastWin && t <= st.fastWin.turns; }) },
      { id: 'veteran', name: '백전노장', desc: '누적 승리 20회', ok: () => (this.records.wins || 0) >= 20 },
      { id: 'new_cycle', name: '새로운 천하', desc: '2회차 진입', ok: () => this.cycle >= 2 },
    ];
    const got = [];
    for (const d of defs) {
      if (this.records.ach[d.id]) continue;
      if (d.ok()) { this.records.ach[d.id] = { c: this.cycle }; got.push(d); }
    }
    return got;
  },

  showTerrainInfo(x, y) { // 탭한 타일의 지형 정보(이름·방어 보정·회복) — 이동 비용은 병종마다 달라 유닛 선택 시 이동 범위로 이미 표시
    const el = document.getElementById('hud-terrain');
    if (!el || !this.battle) return;
    const key = this.battle.map[y] && this.battle.map[y][x];
    const t = key && TERRAIN[key];
    if (!t) { el.textContent = ''; return; }
    const parts = [t.name];
    if (t.def) parts.push(`방어 ${t.def > 0 ? '+' : ''}${t.def}`);
    if (t.heal) parts.push(`매턴 회복 ${Math.round(t.heal * 100)}%`);
    el.textContent = parts.join(' · ');
  },

  show(id) {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'flex';
    this.screen = id;
    document.body.classList.toggle('in-battle', id === 'screen-battle');
  },

  // ----- 타이틀/브리핑/정비 -----
  renderTitle() {
    this.show('screen-title');
    const hasSave = !!localStorage.getItem('cheonha3_save');
    document.getElementById('btn-continue').style.display = (hasSave && !this._corruptSave) ? 'block' : 'none';
    let warn = document.getElementById('title-warn');
    if (this._corruptSave) {
      if (!warn) { warn = document.createElement('div'); warn.id = 'title-warn'; warn.className = 'dim'; document.getElementById('screen-title').appendChild(warn); }
      warn.textContent = '저장 데이터의 군단 정보가 불완전하여 이어하기를 중단했습니다. 원본 저장은 변경하지 않았습니다. 새 게임을 시작하면 기존 저장 위에 덮어씁니다.';
    } else if (warn) warn.remove();
  },

  renderBriefing() {
    const st = STAGES[this.stageIndex];
    if (!st) { this.renderComplete(); return; }
    this.show('screen-briefing');
    document.getElementById('brief-title').textContent = st.name;
    document.getElementById('brief-text').textContent = st.briefing;
    document.getElementById('brief-conditions').textContent = (this.cycle > 1 ? `${this.cycle}회차 · ` : '') + `승리: ${st.victory} / 패배: ${st.defeat} / 제한 ${st.maxTurns}턴` + (st.bossChar ? ' / 보스는 퇴각하지 않음' : '')
      + (st.fastWin ? ` / ${st.fastWin.turns}턴 내 승리 시 +${st.fastWin.gold}골드` : '');
    { const w = weatherFor(st.id, this.cycle); if (w) document.getElementById('brief-conditions').textContent += ` / 날씨: ${WEATHER[w].name} — ${WEATHER[w].note}`; }
    { const rf = reinforceFor(st.id, this.cycle); if (rf) document.getElementById('brief-conditions').textContent += ` / 증원 예고: ${rf.atTurn}턴째 적 ${rf.units.length}기 ${rf.dir}에서 도착`; }
    { const df = defenseFor(st.id, this.cycle); if (df) document.getElementById('brief-conditions').textContent += ` / 방어 목표: ${df.name} 사수(적 점거 시 패배)`; }
    { const dep = this.deploySelection();
      const effective = { ...st, players: st.players.map((p,i) => ({ ...p, char: dep.sel[i] })) };
      const dv = dep.valid && typeof deploymentFor === 'function' ? deploymentFor(effective, this.army, this.cycle).variant : null;
      if (dv) document.getElementById('brief-conditions').textContent += ` / 배치 변주: ${dv.name}(아군 초기 배치 변형)`;
    }
    // 회차별 시작 보상 이력 보정: 구 main 인라인 지급 흔적(_cycleBonus 설정됨)은 이력만 보존해 중복 방지, 아니면 미지급 회차 1회 보완(신구 혼합 창 누락 포함)
    if (this._cycleBonus && this._cycleBonus.length && (this.bonusCycle || 0) !== this.cycle) this.bonusCycle = this.cycle;
    else this.applyCycleBonus();
    this.checkAchievements();
    // 합류 장수(오리지널 IF) — 해금 시 1회만 편입, 배너 표시
    const jn = document.getElementById('brief-join');
    if (jn) {
      const joined = this.checkJoiners();
      jn.innerHTML = joined.length ? `<b>오리지널 IF</b> · ${joined.map(id => `${CHARS[id].name}(이)가 군단에 합류했습니다(이 게임의 가상 설정) · 합류 Lv ${this.army[id].level}로 고정 저장`).join(' / ')} · 아래 출전 편성에서 선택 가능` : '';
    }
    // 회차 시작 자원 해금 표시(회차 시작 또는 누락분 보완으로 이번 세션에 실제 지급된 보상)
    let bn = document.getElementById('brief-bonus');
    if (!bn && jn && jn.parentNode) { bn = document.createElement('div'); bn.id = 'brief-bonus'; jn.parentNode.insertBefore(bn, jn.nextSibling); }
    if (bn) bn.innerHTML = (this._cycleBonus && this._cycleBonus.length) ? (this.stageIndex === 0 ? `<b>업적 시작 보상</b> · ${this._cycleBonus.join(' / ')}` : `<b>회차 보상 추가 지급</b> · ${this._cycleBonus.join(' / ')}`) : ''; // _cycleBonus는 이번 세션에서 실제 지급된 때만 설정(트랜지언트) — 회차 도중 보완도 내역을 표시
    // 출전 편성: 보유 장수 중 스테이지 슬롯 수만큼 사용자가 직접 선택. 유비는 지휘관 슬롯 고정. 기본=기존 고정 순서(미선택 시 기존과 동일한 전투)
    const dp = document.getElementById('brief-deploy');
    if (dp) {
      dp.innerHTML = '';
      const dep = this.deploySelection();
      const slots = this.deploySlots().length;
      const head = document.createElement('div');
      head.innerHTML = `<b>출전 편성</b> <span class="dim">${dep.sel.length}/${slots}명 · 유비 고정</span>`
        + (dep.corrected ? ' <span class="dim">· 스테이지 규모가 달라 자동 조정됨'
          + (dep.dropped && dep.dropped.length ? ` — 제외: ${dep.dropped.map(id => CHARS[id].name).join(',')}` : '')
          + (dep.added && dep.added.length ? ` — 보충: ${dep.added.map(id => CHARS[id].name).join(',')}` : '') + '</span>' : '')
        + (!dep.valid ? ` <span style="color:#e08a8a">출전 인원이 ${slots}명이 되어야 출진할 수 있습니다</span>` : '');
      dp.appendChild(head);
      const fixed = document.createElement('button'); fixed.textContent = `✓ 유비 Lv${this.army.liu_bei.level} (고정)`; fixed.disabled = true; fixed.className = 'primary';
      dp.appendChild(fixed); dp.appendChild(document.createTextNode(' '));
      const picks = dep.sel.slice(1);
      for (const id of Object.keys(this.army)) {
        if (id === 'liu_bei') continue;
        const a = this.army[id]; const on = picks.includes(id);
        const b = document.createElement('button');
        b.textContent = (on ? '✓ ' : '') + `${CHARS[id].name} Lv${a.level}`;
        if (on) b.className = 'primary';
        b.onclick = () => {
          const cur = this.deploySelection().sel.slice(1);
          const i = cur.indexOf(id);
          if (i >= 0) cur.splice(i, 1);
          else {
            if (cur.length >= this.deploySlots().length - 1) { alert(`출전은 유비 포함 ${this.deploySlots().length}명까지입니다. 먼저 다른 장수를 빼 주세요.`); return; }
            cur.push(id);
          }
          this.deploySel = { stage: this.stageIndex, picks: cur };
          this.save(); this.renderBriefing();
        };
        dp.appendChild(b); dp.appendChild(document.createTextNode(' '));
      }
      const rst = document.createElement('button'); rst.textContent = '기본 편성으로';
      rst.onclick = () => { this.deploySel = null; this.save(); this.renderBriefing(); };
      dp.appendChild(rst);
    }
    // 회차 시작 지원(택1): 업적 해금 옵션만 표시. 첫 전투 브리핑에서만 받을 수 있고 출진 시 미선택은 포기 확정
    const sp = document.getElementById('brief-support');
    if (sp) {
      sp.innerHTML = '';
      this.checkAchievements(); // 2회차 진입 업적은 정비 화면 전이라도 여기서 확정
      const taken = this.records.support && this.records.support.c === this.cycle ? this.records.support : null;
      if (this.cycle >= 2 && this.stageIndex === 0) {
        if (taken) {
          const o = this.supportOptions().find(x => x.id === taken.id);
          sp.innerHTML = `<span class="dim">이번 회차 지원: ${taken.id === 'none' ? '받지 않음' : (o ? o.label + ' 수령 완료' : '수령 완료')}</span>`;
        } else {
          const opts = this.supportOptions();
          if (opts.some(o => o.unlocked)) {
            sp.innerHTML = '<b>회차 시작 지원</b> <span class="dim">택1 · 이번 회차만 · 출진하면 더는 받을 수 없음</span><br>';
            for (const o of opts) {
              if (o.unlocked) {
                const btn = document.createElement('button');
                btn.textContent = o.label;
                btn.onclick = () => { // 수령 전 1회 확인(즉시 소모 아님, 확인 시에만 획득 확정)
                  if (document.getElementById('support-claim-confirm')) return;
                  const div = document.createElement('div');
                  div.id = 'support-claim-confirm';
                  const msg = document.createElement('span'); msg.className = 'dim';
                  msg.textContent = `「${o.label}」을(를) 받습니다. 이번 회차 다른 지원은 받을 수 없습니다.`;
                  const yes = document.createElement('button'); yes.textContent = '받기'; yes.className = 'primary';
                  const no = document.createElement('button'); no.textContent = '취소';
                  no.onclick = () => div.remove();
                  yes.onclick = () => { div.remove(); this.claimSupport(o.id); };
                  const row = document.createElement('div'); row.className = 'btnrow';
                  row.appendChild(yes); row.appendChild(no);
                  div.appendChild(msg); div.appendChild(row);
                  sp.appendChild(div);
                };
                sp.appendChild(btn);
                sp.appendChild(document.createTextNode(' '));
              } else {
                const lock = document.createElement('div');
                lock.className = 'dim';
                lock.textContent = `🔒 ${o.label} — 업적 「${o.achName}」 해금 시`;
                sp.appendChild(lock);
              }
            }
          }
        }
      }
    }
  },

  startBattle() {
    if (!this.armyComplete(this.army)) { console.warn('[출진 차단] 군단 데이터가 불완전해 전투를 시작하지 않습니다'); this._corruptSave = !!localStorage.getItem('cheonha3_save'); this.renderTitle(); return; } // 무변경 차단
    if (this.supportAvailable()) { // 회차 지원 미수령 출진: 1회 확인 후 이번 회차 포기 확정
      const sp = document.getElementById('brief-support');
      if (sp && !document.getElementById('support-decline-confirm')) {
        const div = document.createElement('div');
        div.id = 'support-decline-confirm';
        div.innerHTML = '<span class="dim">이번 회차 지원을 받지 않고 출진합니다. 이후 이 회차에서는 받을 수 없습니다.</span> ';
        const ok = document.createElement('button'); ok.textContent = '지원 없이 출진'; ok.className = 'primary';
        const no = document.createElement('button'); no.textContent = '취소';
        no.onclick = () => div.remove();
        ok.onclick = () => { div.remove(); this.records.support = { c: this.cycle, id: 'none' }; this.save(); this.startBattle(); };
        const row = document.createElement('div'); row.className = 'btnrow';
        row.appendChild(ok); row.appendChild(no);
        div.appendChild(row);
        sp.appendChild(div);
        return;
      }
    }
    const dep = this.deploySelection();
    if (!dep.valid) { alert(`출전 편성이 맞지 않습니다(${dep.sel.length}/${this.deploySlots().length}명). 브리핑에서 출전 인원을 맞춰 주세요.`); this.renderBriefing(); return; } // 무효 편성 출진 차단
    const st0 = STAGES[this.stageIndex];
    const stageEff = dep.sel.every((id, i) => st0.players[i] && st0.players[i].char === id) ? st0
      : { ...st0, players: st0.players.map((slot, i) => ({ ...slot, char: dep.sel[i] })) }; // 기본 편성이면 원본 그대로(기존 동작과 완전 동일)
    this._autoNote = null; this._equipBackup = null;
    this.battle = new Battle(stageEff, this.army, this.cycle, { deploymentVariant: true });
    // 자동전투 시 HP 40% 미만 아군이 회복 도구를 스스로 사용 (부족분에 맞는 최소 도구)
    this.battle.autoItem = (u) => {
      const cand = this.inventory.map((it, i) => ({ it, i }))
        .filter(x => ITEMS[x.it.id].use && ITEMS[x.it.id].use.hp);
      if (!cand.length) return false;
      const missing = u.maxHp - u.hp;
      cand.sort((a, b) => ITEMS[a.it.id].use.hp - ITEMS[b.it.id].use.hp);
      const pick = cand.find(x => ITEMS[x.it.id].use.hp >= missing) || cand[cand.length - 1];
      this.inventory.splice(pick.i, 1);
      this.battle.useItem(u, pick.it.id, u);
      this.log(this.battle.log[this.battle.log.length - 1]);
      return true;
    };
    this.selected = null; this.moveTiles = [];
    this.show('screen-battle');
    this.setupCanvas();
    this.renderBattle();
    this.updateHud();
    document.getElementById('battle-log').innerHTML = '';
    this.log(this.battle.stage.briefing);
    const bp = [this.battle.stage.name];
    if (this.battle.weather) bp.push('날씨: ' + WEATHER[this.battle.weather].name + '(' + WEATHER[this.battle.weather].note + ')');
    if (this.battle.deployVar) bp.push('배치 변주: ' + this.battle.deployVar.name);
    if (this.battle.pendingReinforce) bp.push(`증원 예고: ${this.battle.pendingReinforce.atTurn}턴`);
    if (this.battle.defense) bp.push(`방어: ${this.battle.defense.name}`);
    this.showBanner(bp.join(' · ') + ' · 아군 턴 1');
    if (this.auto) this.autoLoop();
  },

  // ----- 정비 화면 -----
  renderBase() {
    this.show('screen-base');
    // 정비 진입 시점에도 업적 평가 — 강화 +5·2회차 진입처럼 전투 밖 행동의 업적이 다음 승리까지 지연되지 않게
    const baseNewAch = this.checkAchievements();
    const baseJoined = this.checkJoiners();
    document.getElementById('base-gold').textContent = this.gold;
    const ore = this.inventory.filter(i => i.id === 'ore').length;
    document.getElementById('base-ore').textContent = ore;
    const list = document.getElementById('base-units');
    list.innerHTML = '';
    if (baseNewAch.length) { // innerHTML 초기화 이후에 넣어야 배너가 지워지지 않음
      const banner = document.createElement('div');
      banner.id = 'ach-banner';
      banner.innerHTML = '<b>업적 달성: ' + baseNewAch.map(a => a.name).join(', ') + '</b> <span class="dim">(해금 내역은 아래 업적에서 확인)</span>';
      list.prepend(banner);
    }
    if (baseJoined.length) {
      const jb = document.createElement('div');
      jb.className = 'ach-banner';
      jb.innerHTML = `<b>오리지널 IF · ${baseJoined.map(id => CHARS[id].name).join('·')} 합류</b> <span class="dim">(가상 설정 · 합류 Lv ${baseJoined.map(id => this.army[id].level).join('/')} 고정 저장 · 브리핑 출전 편성에서 선택)</span>`;
      list.prepend(jb);
    }
    // 소지품 한눈에 보기
    const inv = document.createElement('div');
    inv.id = 'inv-list';
    if (this.inventory.length) {
      const grouped = {};
      for (const e of this.inventory) {
        const key = e.id + (e.up ? '+' + e.up : '');
        grouped[key] = (grouped[key] || 0) + 1;
      }
      inv.innerHTML = '<b>소지품</b> ' + Object.entries(grouped)
        .map(([k, n]) => `${ITEMS[k.replace(/\+\d+$/, '')].name}${k.includes('+') ? k.slice(k.indexOf('+')) : ''}×${n}`)
        .join(' · ');
    } else inv.innerHTML = '<b>소지품</b> 없음';
    const autoBtn = document.createElement('button');
    autoBtn.id = 'btn-autoequip';
    autoBtn.textContent = '자동 장착';
    autoBtn.title = '보유 장비를 능력치 순으로 자동 배정';
    autoBtn.onclick = () => this.autoEquip();
    inv.appendChild(document.createTextNode(' '));
    inv.appendChild(autoBtn);
    list.appendChild(inv);
    // 상점: 트레이드오프 장비 판매 (골드 소비처)
    const shop = document.createElement('div');
    shop.id = 'base-shop';
    shop.innerHTML = '<b>상점</b> ';
    for (const id of SHOP) {
      const it = ITEMS[id];
      const btn = document.createElement('button');
      btn.textContent = `${it.name} (${this.itemStatText({ id, up: 0 })}) ${it.price}골드`;
      btn.disabled = this.gold < it.price;
      btn.onclick = () => {
        if (this.gold < it.price) return;
        this.gold -= it.price;
        this.inventory.push({ id, up: 0 });
        this.save(); this.renderBase();
      };
      shop.appendChild(btn);
      shop.appendChild(document.createTextNode(' '));
    }
    // 특별 품목 로테이션: 전투·회차마다 1종씩 교체 (규칙적 — 다음 품목 예고)
    const ROT = ['jade', 'scroll', 'amulet', 'manual'];
    const rotIdx = this.battlesCleared % ROT.length; // 누적 승리 수 — 신규 전투 추가(STAGES.length 변동)에도 기존 세이브의 예고와 어긋나지 않음
    const spId = ROT[rotIdx], nextId = ROT[(rotIdx + 1) % ROT.length];
    const sp = ITEMS[spId];
    const spBtn = document.createElement('button');
    spBtn.textContent = `${sp.name} (${this.itemStatText({ id: spId, up: 0 })}) ${sp.price}골드`;
    spBtn.disabled = this.gold < sp.price;
    spBtn.onclick = () => {
      if (this.gold < sp.price) return;
      this.gold -= sp.price;
      this.inventory.push({ id: spId, up: 0 });
      this.save(); this.renderBase();
    };
    const spLine = document.createElement('div');
    spLine.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:8px 0;'; // 좁은 화면에서 라벨-버튼 밀착 방지
    spLine.appendChild(document.createTextNode('특별 품목(전투마다 교체):'));
    spLine.appendChild(spBtn);
    const spNote = document.createElement('span');
    spNote.className = 'dim';
    spNote.textContent = ` 다음: ${ITEMS[nextId].name}`;
    spLine.appendChild(document.createTextNode(' '));
    spLine.appendChild(spNote);
    shop.appendChild(spLine);
    list.appendChild(shop);
    // 기록: 전투별 최단 턴·무사망 클리어 (보상 없는 갱신 목표)
    const recDiv = document.createElement('div');
    recDiv.id = 'base-records';
    const rc = this.records || { wins: 0, bestTurns: {}, noDeath: {} };
    const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    recDiv.innerHTML = `<b>기록</b> <span class="dim">누적 승리 ${rc.wins} · ${this.cycle}회차 · 이 기능 도입 이후 플레이부터 집계 · 전투 기록 · 회차마다 적 레벨이 달라 회차가 다른 최단 턴끼리는 단순 비교 불가</span><br>` +
      STAGES.map(st => {
        const bt = rc.bestTurns[st.id];
        const nd = rc.noDeath[st.id] || 0;
        const gd = (rc.grades || {})[st.id];
        const btTxt = bt == null ? '—' : (typeof bt === 'object' ? `${bt.t}턴(${bt.c}회차)` : `${bt}턴`);
        return `${esc(st.name)} — 등급 ${gd ? gd.g + '(' + gd.c + '회차)' : '—'} · 최단 ${btTxt} · 무사망 ${nd}회`;
      }).join('<br>');
    const ACH_LIST = [
      ['first_s', '무결의 첫걸음', 'S 등급 달성'], ['nine', '아홉 전투 정복', '제1전~제9전 모두 클리어'],
      ['flawless', '불사의 군단', '모든 전투 무사망 클리어 기록'], ['smith', '대장의 손길', '장비 +5 강화'],
      ['swift', '질풍신뢰', '신속 목표 내 클리어'], ['veteran', '백전노장', '누적 승리 20회'], ['new_cycle', '새로운 천하', '2회차 진입'],
    ];
    const ach = rc.ach || {};
    const unlockNotes = {
      first_s: '회차 지원 선택지: 족자 1개',
      nine: '관해 합류(가상 설정) · 회차 시작 골드 +500',
      flawless: '회차 시작 콩 ×2',
      smith: '회차 지원 선택지: 철광석 3개 · 회차 시작 철광석 ×5',
      swift: '태사자 합류(가상 설정)',
      veteran: '주창 합류(가상 설정) · 회차 지원 선택지: 쌀2·콩2',
      new_cycle: '회차 지원 선택지: 군자금 800골드',
    };
    recDiv.innerHTML += '<br><b>업적</b> <span class="dim">장수 합류·회차 지원·시작 자원 해금 조건. 회차 지원은 첫 전투에서 택1, 시작 자원은 별도 지급. 구버전 이행 시 회차 도중 추가 지급될 수 있습니다.</span><br>' +
      ACH_LIST.map(([id, name, desc]) => ach[id]
        ? `✓ ${esc(name)} - ${esc(desc)} (${ach[id].c}회차)<br><span class="dim">해금: ${esc(unlockNotes[id])}</span>`
        : `<span class="dim">· ${esc(name)} - ${esc(desc)}<br>해금 조건 충족 시: ${esc(unlockNotes[id])}</span>`).join('<br>');
    list.appendChild(recDiv);
    // 판매: 불필요 소지품을 반값에 처분 (전직 지침서는 진행 필수라 제외, 강화비는 환불 없음)
    const sell = document.createElement('div');
    sell.id = 'base-sell';
    sell.innerHTML = '<b>판매</b> <span class="dim">1회 1개 · 가격은 기본가의 50% · 강화비는 돌려받지 못합니다</span> ';
    const SELL_EXCLUDE = new Set(['manual']);
    const groups = {};
    this.inventory.forEach((e, i) => { const k = e.id + '|' + (e.up || 0); (groups[k] = groups[k] || []).push(i); });
    const sellKeys = Object.keys(groups).filter(k => !SELL_EXCLUDE.has(k.split('|')[0]) && (ITEMS[k.split('|')[0]].price || 0) > 0);
    if (!sellKeys.length) sell.innerHTML += '<span class="dim">판매 가능한 소지품 없음</span>';
    for (const k of sellKeys) {
      const [id, up] = k.split('|');
      const it = ITEMS[id];
      const price = Math.floor(it.price / 2);
      const btn = document.createElement('button');
      btn.textContent = `${it.name}${+up ? '+' + up : ''} 1개 판매 +${price}골드 (보유 ${groups[k].length})`;
      btn.onclick = () => {
        const i = this.inventory.findIndex(e => e.id === id && (e.up || 0) === +up);
        if (i < 0) return;
        this.inventory.splice(i, 1);
        this.gold += price;
        this.save(); this.renderBase();
      };
      sell.appendChild(btn);
      sell.appendChild(document.createTextNode(' '));
    }
    list.appendChild(sell);
    if (this._autoNote) {
      const note = document.createElement('div');
      note.className = 'dim auto-note';
      note.textContent = this._autoNote + ' ';
      if (this._equipBackup) {
        const undo = document.createElement('button');
        undo.textContent = '되돌리기';
        undo.onclick = () => this.undoAutoEquip();
        note.appendChild(undo);
      }
      list.appendChild(note);
    }
    for (const id of Object.keys(this.army)) {
      const a = this.army[id];
      const div = document.createElement('div');
      div.className = 'unit-card';
      const eq = ['weapon','armor','acc'].map(s => {
        const e = a.equip[s];
        return e ? `${ITEMS[e.id].name}${e.up ? '+' + e.up : ''}` : '-';
      }).join(' / ');
      const _po = (typeof promoOptions === 'function') ? promoOptions : (id) => { const p = CLASSES[id] && CLASSES[id].promoTo; return p ? (Array.isArray(p) ? p : [p]) : []; }; // 구 data 혼합 폴백
      const _pbd = (typeof PROMO_BONUS_DEFAULT !== 'undefined') ? PROMO_BONUS_DEFAULT : { atk: 3, def: 3, hp: 10, mp: 5 };
      const promoList = _po(a.cls);
      const es = equipStats(a);
      const pseudo = { cls: a.cls, tactics: CHARS[id].tactics || [], perk: a.perk };
      const cardSprite = CHAR_SPRITES.includes(id) ? `char_${id}` : (SPRITE_FILE[CLASSES[a.cls].sprite] || CLASSES[a.cls].sprite);
      div.innerHTML = `<div class="card-top"><img class="card-sprite" src="assets/units/${cardSprite}_0_0.png" alt="">
        <div class="card-body"><b>${CHARS[id].name}</b> Lv.${a.level} ${CLASSES[a.cls].name}<br>
        <span class="dim">HP ${a.maxHp} 공 ${Math.round(a.atk + es.atk)} 방 ${Math.round(a.def + es.def)} 지 ${Math.round(a.int)} 속 ${Math.round(a.spd)}${es.atk || es.def ? ` (장비 공+${es.atk} 방+${es.def})` : ''}</span><br>
        <span class="dim">${eq}</span>
        <span class="unit-trait">${this.traitText(pseudo)}</span>
        ${promoList.length ? `<br><span class="dim promo-hint">${promoList.length > 1 ? '전직 선택' : '전직'} → ${promoList.map(p => {
          const tb = { ..._pbd, ...(CLASSES[p].promoBonus || {}) };
          const diffs = [`공+${tb.atk}`, `방+${tb.def}`, `HP+${tb.hp}`, `MP+${tb.mp}`];
          if (CLASSES[p].move !== CLASSES[a.cls].move) diffs.push(`이동 ${CLASSES[p].move}`);
          if (CLASSES[p].rMin !== CLASSES[a.cls].rMin || CLASSES[p].rMax !== CLASSES[a.cls].rMax) diffs.push(`사거리 ${CLASSES[p].rMin}~${CLASSES[p].rMax}`);
          return `${CLASSES[p].name}(${diffs.join(' ')})`;
        }).join(' / ')}: Lv.${CLASSES[a.cls].promoLevel} + 전직 지침서 (${a.level >= CLASSES[a.cls].promoLevel ? (this.inventory.some(i => i.id === 'manual') ? '가능' : '지침서 부족') : '레벨 부족'})</span>` : ''}</div></div>`;
      // 성장 특기: Lv.3부터 1회 선택(변경 불가) — 카드 정보 아래 전폭 행, 확정/취소 2단계로 오조작 방지
      const perkRow = document.createElement('div');
      perkRow.className = 'perk-row';
      if (a.perk) {
        const perkSpan = document.createElement('span');
        perkSpan.className = 'dim';
        perkSpan.textContent = '특기: ' + { atk: '공격(물리 피해 +8%)', def: '수비(받는 물리 피해 -8%)', mob: '기동(이동 +1)' }[a.perk];
        perkRow.appendChild(perkSpan);
      } else if (a.level >= 3) {
        const mkPerk = (pid, label) => {
          const pb = document.createElement('button');
          pb.textContent = label;
          pb.onclick = () => {
            perkRow.innerHTML = '';
            const warn = document.createElement('span');
            warn.className = 'dim perk-note';
            warn.textContent = `${label} — 확정하면 변경할 수 없습니다.`;
            const ok = document.createElement('button');
            ok.textContent = '확정';
            ok.className = 'primary';
            ok.onclick = () => { a.perk = pid; this.save(); this.renderBase(); };
            const no = document.createElement('button');
            no.textContent = '취소';
            no.onclick = () => this.renderBase();
            perkRow.appendChild(warn);
            perkRow.appendChild(ok);
            perkRow.appendChild(no);
          };
          return pb;
        };
        perkRow.appendChild(mkPerk('atk', '특기 공격(물리 피해+8%)'));
        perkRow.appendChild(mkPerk('def', '특기 수비(받는 물리피해-8%)'));
        perkRow.appendChild(mkPerk('mob', '특기 기동(이동 +1)'));
        const perkNote = document.createElement('span');
        perkNote.className = 'dim perk-note';
        perkNote.textContent = '1회 선택 · 변경 불가';
        perkRow.appendChild(perkNote);
      }
      if (a.perk || a.level >= 3) div.appendChild(perkRow);
      const actions = document.createElement('div');
      actions.className = 'card-actions';
      const btnEquip = document.createElement('button'); btnEquip.textContent = '장착';
      btnEquip.onclick = () => this.renderEquip(id);
      actions.appendChild(btnEquip);
      const btnUp = document.createElement('button'); btnUp.textContent = '강화';
      btnUp.onclick = () => this.renderUpgrade(id);
      actions.appendChild(btnUp);
      if (promoList.length && a.level >= CLASSES[a.cls].promoLevel && this.inventory.some(i => i.id === 'manual')) {
        for (const p of promoList) {
          const tb = { ..._pbd, ...(CLASSES[p].promoBonus || {}) };
          const btnP = document.createElement('button'); btnP.textContent = `전직 → ${CLASSES[p].name}`;
          btnP.onclick = () => {
            if (promoList.length > 1 && !confirm(`${CLASSES[p].name}(으)로 전직합니다. 되돌릴 수 없습니다.`)) return; // 분기 선택은 확정 확인
            this.inventory.splice(this.inventory.findIndex(i => i.id === 'manual'), 1);
            a.cls = p; a.atk += tb.atk; a.def += tb.def; a.maxHp += tb.hp; a.maxMp += tb.mp;
            this.save(); this.renderBase();
          };
          actions.appendChild(btnP);
        }
      }
      div.appendChild(actions);
      list.appendChild(div);
    }
  },

  autoEquip() {
    const ids = Object.keys(this.army);
    // 되돌리기용 스냅샷 (연속 실행해도 최초 상태 유지)
    if (!this._equipBackup) this._equipBackup = JSON.stringify({
      equip: Object.fromEntries(ids.map(id => [id, this.army[id].equip])),
      inventory: this.inventory,
    });
    // 1) 장착 중인 것까지 전부 풀에 모으기
    const pool = [];
    for (const id of ids) {
      const a = this.army[id];
      for (const sl of ['weapon', 'armor', 'acc']) {
        if (a.equip[sl]) { pool.push(a.equip[sl]); a.equip[sl] = null; }
      }
    }
    pool.push(...this.inventory.filter(e => ITEMS[e.id].slot));
    this.inventory = this.inventory.filter(e => !ITEMS[e.id].slot);
    const val = (e) => { const it = ITEMS[e.id]; return (it.atk || it.def || 0) + (e.up || 0) * 2; };
    const cnt = { weapon: 0, armor: 0, acc: 0 };
    // 2) 무기: 공격 높은 장수부터. 같은 값이면 병종에 맞는 무기 우선(궁수=장궁, 모사=책략부채)
    for (const u of ids.map(id => this.army[id]).sort((a, b) => b.atk - a.atk)) {
      const cands = pool.filter(e => ITEMS[e.id].slot === 'weapon');
      if (!cands.length) break;
      const cat = CLASSES[u.cls].cat;
      let best = null, bs = -1;
      for (const e of cands) {
        const flavor = (cat === 'archer' && e.id === 'bow') || (cat === 'strategist' && e.id === 'fan');
        const sc = val(e) * 100 + (flavor ? 10 : 0);
        if (sc > bs) { bs = sc; best = e; }
      }
      u.equip.weapon = best; cnt.weapon++;
      pool.splice(pool.indexOf(best), 1);
    }
    // 3) 방어구: 방어 높은 장수부터 좋은 갑옷
    {
      const units = ids.map(id => this.army[id]).sort((a, b) => b.def - a.def);
      const items = pool.filter(e => ITEMS[e.id].slot === 'armor').sort((x, y) => val(y) - val(x));
      for (let i = 0; i < Math.min(units.length, items.length); i++) {
        units[i].equip.armor = items[i]; cnt.armor++;
        pool.splice(pool.indexOf(items[i]), 1);
      }
    }
    // 4) 장신구: 모사는 MP 족자 우선, 나머지는 남은 것 순서대로
    const accs = pool.filter(e => ITEMS[e.id].slot === 'acc');
    const take = (pred, unit) => {
      const i = accs.findIndex(pred);
      if (i >= 0) { unit.equip.acc = accs[i]; cnt.acc++; pool.splice(pool.indexOf(accs[i]), 1); accs.splice(i, 1); }
    };
    for (const id of ids) {
      const a = this.army[id];
      if (CLASSES[a.cls].cat === 'strategist') take(e => !!ITEMS[e.id].mp, a);
    }
    for (const id of ids) {
      const a = this.army[id];
      if (!a.equip.acc) take(() => true, a);
    }
    // 5) 남은 것은 소지품으로
    this.inventory.push(...pool);
    this._autoNote = `자동 장착 완료: 무기 ${cnt.weapon} · 방어구 ${cnt.armor} · 장신구 ${cnt.acc} 배정`;
    this.save();
    this.renderBase();
  },

  undoAutoEquip() {
    if (!this._equipBackup) return;
    const b = JSON.parse(this._equipBackup);
    for (const [id, eq] of Object.entries(b.equip)) if (this.army[id]) this.army[id].equip = eq;
    this.inventory = b.inventory;
    this._equipBackup = null;
    this._autoNote = '자동 장착을 되돌렸습니다.';
    this.save();
    this.renderBase();
  },

  renderEquip(charId) {
    const a = this.army[charId];
    const list = document.getElementById('base-units');
    list.innerHTML = `<h3>${CHARS[charId].name} 장착</h3>`;
    for (const slot of ['weapon','armor','acc']) {
      const row = document.createElement('div');
      row.className = 'equip-row';
      const cur = a.equip[slot];
      row.innerHTML = `<b>${{weapon:'무기',armor:'방어구',acc:'장신구'}[slot]}</b>: ${cur ? ITEMS[cur.id].name + (cur.up ? '+'+cur.up : '') + ` <span class="dim">(${this.itemStatText(cur)})</span>` : '없음'} `;
      const sel = document.createElement('select');
      sel.innerHTML = `<option value="">(비우기)</option>` + this.inventory
        .map((it, i) => ITEMS[it.id].slot === slot ? `<option value="${i}">${ITEMS[it.id].name}${it.up ? '+'+it.up : ''} — ${this.itemStatText(it)}</option>` : '')
        .join('');
      sel.onchange = () => {
        if (cur) this.inventory.push(cur);
        const v = sel.value;
        a.equip[slot] = v === '' ? null : this.inventory.splice(+v, 1)[0];
        this.save(); this.renderEquip(charId);
      };
      row.appendChild(sel);
      list.appendChild(row);
    }
    const back = document.createElement('button'); back.textContent = '돌아가기';
    back.onclick = () => this.renderBase();
    list.appendChild(back);
  },

  renderUpgrade(charId) {
    const a = this.army[charId];
    const list = document.getElementById('base-units');
    list.innerHTML = `<h3>${CHARS[charId].name} 강화</h3><p class="dim">골드 ${this.gold} / 철광석 ${this.inventory.filter(i=>i.id==='ore').length}</p>`;
    for (const slot of ['weapon','armor']) {
      const e = a.equip[slot];
      const row = document.createElement('div');
      if (!e) { row.innerHTML = `<b>${slot==='weapon'?'무기':'방어구'}</b>: 없음`; list.appendChild(row); continue; }
      const it = ITEMS[e.id];
      const cost = 150 * ((e.up || 0) + 1);
      const statName = it.atk ? '공' : '방';
      const statNow = (it.atk || it.def) + (e.up || 0) * 2;
      const maxed = (e.up || 0) >= it.maxUp;
      row.innerHTML = maxed
        ? `<b>${it.name}${e.up ? '+'+e.up : ''}</b> ${statName}+${statNow} (최대 강화) ` // 최대치에서 불가능한 다음 단계 미리보기·비용을 보이지 않음
        : `<b>${it.name}${e.up ? '+'+e.up : ''}</b> ${statName}+${statNow} → +${statNow + 2} (${cost}골드 + 철광석 1) `;
      const btn = document.createElement('button');
      btn.textContent = '강화';
      const oreIdx = this.inventory.findIndex(i => i.id === 'ore');
      btn.disabled = (e.up || 0) >= it.maxUp || this.gold < cost || oreIdx < 0;
      if (btn.disabled && !maxed) { // 최대 강화는 본문에 이미 표기 — 사유는 골드/철광석 부족만
        const why = this.gold < cost ? '골드 부족' : '철광석 부족';
        row.insertAdjacentHTML('beforeend', `<span class="upgrade-note">${why}</span>`);
      }
      btn.onclick = () => {
        this.gold -= cost;
        this.inventory.splice(this.inventory.findIndex(i => i.id === 'ore'), 1);
        e.up = (e.up || 0) + 1;
        this.save(); this.renderUpgrade(charId);
      };
      row.appendChild(btn);
      list.appendChild(row);
    }
    const back = document.createElement('button'); back.textContent = '돌아가기';
    back.onclick = () => this.renderBase();
    list.appendChild(back);
  },

  // ----- 전투 화면 -----
  setupCanvas() {
    const b = this.battle;
    this.canvas = document.getElementById('battle-canvas');
    this.canvas.width = b.w * TILE; this.canvas.height = b.h * TILE;
    this.ctx = this.canvas.getContext('2d');
    this.initView();
  },

  // ----- 보기 (확대/축소/패닝) -----
  readView() {
    try {
      const v = JSON.parse(localStorage.getItem('cheonha3_view') || 'null');
      if (v && v.zoom > 0) return v.zoom;
    } catch (e) {}
    return null;
  },

  readSpeed() {
    try {
      const v = JSON.parse(localStorage.getItem('cheonha3_view') || 'null');
      if (v && [1, 2, 3].includes(v.speed)) return v.speed;
    } catch (e) {}
    return 1;
  },

  cycleSpeed() {
    this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1;
    try {
      const prev = JSON.parse(localStorage.getItem('cheonha3_view') || '{}') || {};
      prev.speed = this.speed;
      localStorage.setItem('cheonha3_view', JSON.stringify(prev));
    } catch (e) {}
    const b = document.getElementById('btn-speed');
    if (b) b.textContent = this.speed + 'x';
    this.log('전투 속도 ' + this.speed + 'x');
  },

  initView() {
    const wrap = document.getElementById('battle-wrap');
    const fitW = (wrap.clientWidth - 4) / this.canvas.width;
    const fitH = (this.availHeight(wrap) - 4) / this.canvas.height;
    let z = this.readView();
    if (!z) {
      // 좁은 화면(모바일)은 전체 축소 대신 100% 타일 + 패닝으로 시작
      z = fitW < 0.8 ? 1 : Math.min(1.5, fitW, fitH);
    }
    this.setZoom(z, false);
    wrap.scrollLeft = 0; wrap.scrollTop = 0;
    if (!this._viewInit) {
      this._viewInit = true;
      wrap.addEventListener('scroll', () => this.positionHint());
    }
  },

  positionHint() { // 힌트를 배틀 뷰포트(보이는 영역) 상단에 고정 — 팬/줌과 무관하게 전체 문장 표시
    const hint = document.getElementById('target-hint');
    if (hint.style.display !== 'block') return;
    const wrap = document.getElementById('battle-wrap');
    hint.style.left = (wrap.scrollLeft + 6) + 'px';
    hint.style.top = (wrap.scrollTop + 6) + 'px';
    hint.style.width = Math.max(120, wrap.clientWidth - 12) + 'px';
  },

  setZoom(z, keepCenter = true) {
    const wrap = document.getElementById('battle-wrap');
    const cv = this.canvas;
    if (!cv) return;
    z = Math.max(this.ZOOM_MIN, Math.min(this.ZOOM_MAX, Math.round(z * 100) / 100));
    const oldZ = this.zoom || 1;
    const cx = (wrap.scrollLeft + wrap.clientWidth / 2) / oldZ;
    const cy = (wrap.scrollTop + wrap.clientHeight / 2) / oldZ;
    this.zoom = z;
    cv.style.width = (cv.width * z) + 'px';
    cv.style.height = (cv.height * z) + 'px';
    if (keepCenter) {
      wrap.scrollLeft = cx * z - wrap.clientWidth / 2;
      wrap.scrollTop = cy * z - wrap.clientHeight / 2;
    }
    if (this.menuFor) { this.closeMenu(); this.menuFor = null; this.restoreMenuButtons(); }
    this.updateZoomLabel();
    this.positionHint();
    try {
      const prev = JSON.parse(localStorage.getItem('cheonha3_view') || '{}') || {};
      prev.zoom = z;
      localStorage.setItem('cheonha3_view', JSON.stringify(prev));
    } catch (e) {}
  },

  availHeight(wrap) {
    const mh = parseFloat(getComputedStyle(wrap).maxHeight);
    return isFinite(mh) ? mh : wrap.clientHeight;
  },

  fitZoom() {
    const wrap = document.getElementById('battle-wrap');
    const fitW = (wrap.clientWidth - 4) / this.canvas.width;
    const fitH = (this.availHeight(wrap) - 4) / this.canvas.height;
    this.setZoom(Math.min(fitW, fitH), false);
    wrap.scrollLeft = 0; wrap.scrollTop = 0;
  },

  updateZoomLabel() {
    const el = document.getElementById('zoom-label');
    if (el) el.textContent = Math.round(this.zoom * 100) + '%';
  },

  renderBattle() {
    const b = this.battle, ctx = this.ctx;
    if (!b) return;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
      const im = IMG.terrain[b.map[y][x]];
      if (im && im.complete) ctx.drawImage(im, x * TILE, y * TILE, TILE, TILE);
      else { ctx.fillStyle = '#9a9'; ctx.fillRect(x * TILE, y * TILE, TILE, TILE); }
    }
    if (b.defense) { ctx.strokeStyle = '#ffd24d'; ctx.lineWidth = 3; ctx.strokeRect(b.defense.x * TILE + 1.5, b.defense.y * TILE + 1.5, TILE - 3, TILE - 3); ctx.fillStyle = '#ffd24d'; ctx.font = 'bold 12px sans-serif'; ctx.fillText('수', b.defense.x * TILE + 18, b.defense.y * TILE + 17); } // 거점 사수 표시
    // 이동 범위
    if (this.selected && !this.selected.done) {
      ctx.fillStyle = 'rgba(60,120,220,0.35)';
      for (const [x, y] of this.moveTiles) ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      // 공격 가능 적
      ctx.fillStyle = 'rgba(220,60,60,0.4)';
      const afterTiles = [...this.moveTiles, [this.selected.x, this.selected.y]];
      const [sr0, sr1] = b.rngOf(this.selected);
      for (const e of b.alive('enemy')) {
        if (afterTiles.some(([x, y]) => Math.abs(x - e.x) + Math.abs(y - e.y) >= sr0 && Math.abs(x - e.x) + Math.abs(y - e.y) <= sr1))
          ctx.fillRect(e.x * TILE, e.y * TILE, TILE, TILE);
      }
    }
    // 적 위협 범위 (선택된 적의 이동+공격 커버리지)
    if (this.threatTiles) {
      ctx.fillStyle = 'rgba(230,140,40,0.28)';
      for (const [x, y] of this.threatTiles) ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    }
    // 유닛
    const now = performance.now();
    for (const u of b.units) {
      if (u.hp <= 0 || u.routed) continue;
      const im = spriteFor(u);
      let ox = 0, oy = 0;
      const lu = u._lunge;
      if (lu) {
        const k = Math.min(1, (now - lu.t0) / lu.dur);
        const amp = k < 0.5 ? k * 2 : (1 - k) * 2;   // 갔다 복귀
        ox = lu.dx * amp; oy = lu.dy * amp;
        if (k >= 1) u._lunge = null;
      }
      if (im && im.complete) ctx.drawImage(im, u.x * TILE + ox, u.y * TILE + oy, TILE, TILE);
      else { ctx.fillStyle = u.side === 'player' ? '#36c' : '#c33'; ctx.beginPath(); ctx.arc(u.x*TILE+24+ox, u.y*TILE+24+oy, 18, 0, 7); ctx.fill(); }
      const fl = u._flash;
      if (fl) {
        const k = (now - fl.t0) / fl.dur;
        if (k >= 1) u._flash = null;
        else if (Math.floor(k * 6) % 2 === 0) { ctx.fillStyle = 'rgba(255,60,40,0.4)'; ctx.fillRect(u.x*TILE, u.y*TILE, TILE, TILE); }
      }
      if (u.done) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(u.x*TILE, u.y*TILE, TILE, TILE); }
      // HP 바
      ctx.fillStyle = '#000a'; ctx.fillRect(u.x*TILE+4, u.y*TILE+42, 40, 5);
      ctx.fillStyle = u.side === 'player' ? '#4c4' : '#e55';
      ctx.fillRect(u.x*TILE+4, u.y*TILE+42, 40 * (u.hp / u.maxHp), 5);
      // 사기 (우상단 배지 — 스프라이트와 겹침 최소화)
      ctx.fillStyle = '#000b'; ctx.fillRect(u.x*TILE+29, u.y*TILE+2, 19, 11);
      ctx.fillStyle = '#fd4'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(u.morale, u.x*TILE+38.5, u.y*TILE+11);
      ctx.textAlign = 'left';
      if (u.commander || u.boss) { ctx.fillStyle = '#000b'; ctx.fillRect(u.x*TILE+2, u.y*TILE+2, 22, 11); ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.fillText(u.boss ? '적장' : '주군', u.x*TILE+4, u.y*TILE+11); }
    }
    // 대상 선택 모드: 비대상 타일 디밍으로 대상·라벨 강조
    if (this.pendingTargets && this.menuFor) {
      const tset = new Set(this.pendingTargets.map(t => t.x + ',' + t.y));
      ctx.fillStyle = 'rgba(8,8,14,0.38)';
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++)
        if (!tset.has(x + ',' + y)) ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    }
    // 책략 대상 예측 (대상 선택 모드) — 화계 피해/치유 회복량/고무 사기 상승, 결정적 단일값
    if (this.pendingKind && this.pendingKind.startsWith('tactic:') && this.pendingTargets && this.menuFor) {
      const tid = this.pendingKind.slice(7), tc = TACTICS[tid];
      for (const v of this.pendingTargets) {
        let txt = null, color = '#ffe08a';
        if (tc.kind === 'damage' && v.side !== this.menuFor.side) { txt = `${tc.name} ${tacticDamage(this.menuFor, v)}`; color = '#ffb08a'; }
        else if (tc.kind === 'heal' && v.side === this.menuFor.side) { txt = `${tc.name} +${Math.min(v.maxHp - v.hp, Math.round(tc.power + this.menuFor.int))}`; color = '#a8e0a8'; }
        else if (tc.kind === 'morale' && v.side === this.menuFor.side) { txt = `${tc.name} +${Math.min(100 - v.morale, tc.power)}`; color = '#a8c8ff'; }
        else if (tc.kind === 'demoralize' && v.side !== this.menuFor.side) { txt = `${tc.name} 사기-${Math.min(v.morale, tc.power)}`; color = '#e8a0e8'; }
        if (!txt) continue;
        const bx = v.x * TILE, by = v.y * TILE;
        ctx.fillStyle = 'rgba(20,20,30,0.88)';
        ctx.fillRect(bx + 1, by + 1, TILE - 2, 14);
        ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
        ctx.fillStyle = color;
        ctx.fillText(txt, bx + TILE / 2, by + 11);
        ctx.textAlign = 'left';
      }
    }
    // 공격 대상 예측 프리뷰 (대상 선택 모드) — 디밍·유닛 위에 그림
    if (this.pendingKind === 'attack' && this.pendingTargets && this.menuFor) {
      for (const t of this.pendingTargets) {
        const f = b.forecastAttack(this.menuFor, t);
        const bx = t.x * TILE, by = t.y * TILE;
        const bh = f.counter ? 25 : 14;
        ctx.fillStyle = 'rgba(20,20,30,0.88)';
        ctx.fillRect(bx + 1, by + 1, TILE - 2, bh);
        ctx.textAlign = 'center';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = f.mu > 0 ? '#9ae6a0' : f.mu < 0 ? '#ff9a9a' : '#ffe08a';
        ctx.fillText(`${f.mu > 0 ? '▲' : f.mu < 0 ? '▼' : ''}${f.min}~${f.max}`, bx + TILE / 2, by + 12);
        if (f.counter) {
          ctx.font = 'bold 8px sans-serif';
          ctx.fillStyle = f.counter.certain ? '#ff9a9a' : '#ffc46b';
          ctx.fillText(`반격 ${f.counter.min}~${f.counter.max}${f.counter.certain ? '' : '?'}`, bx + TILE / 2, by + 22);
        }
        ctx.textAlign = 'left';
      }
    }
    // 부유 텍스트 (피해/회복/상태)
    this.fx = this.fx.filter(f => now - f.t0 < f.dur);
    for (const f of this.fx) {
      const k = (now - f.t0) / f.dur;
      ctx.globalAlpha = 1 - k * k;
      ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3;
      const fy = f.y * TILE + 16 - k * 22;
      ctx.strokeText(f.text, f.x * TILE + TILE / 2, fy);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x * TILE + TILE / 2, fy);
      ctx.globalAlpha = 1;
    }
    if (this.fx.length || b.units.some(u => u._lunge || u._flash)) this.scheduleFxFrame();
  },

  scheduleFxFrame() {
    if (this._fxRunning) return;
    this._fxRunning = true;
    requestAnimationFrame(() => {
      this._fxRunning = false;
      if (this.screen === 'screen-battle' && this.battle) this.renderBattle();
    });
  },

  popText(x, y, text, color) {
    this.fx.push({ x, y, text, color, t0: performance.now(), dur: this.fast || this.auto ? 500 : 900 / this.speed });
  },

  unitAnim(u, kind, tx, ty) {
    const now = performance.now();
    if (kind === 'lunge' && tx !== undefined) {
      const dx = Math.sign(tx - u.x), dy = Math.sign(ty - u.y);
      u._lunge = { dx: dx * 12, dy: dy * 12, t0: now, dur: this.fast || this.auto ? 120 : 220 / this.speed };
    }
    if (kind === 'flash') u._flash = { t0: now, dur: this.fast || this.auto ? 200 : 420 / this.speed };
  },

  snapshotHp() {
    const m = {};
    for (const u of this.battle.units) m[u.uid || u.charId + u.x + ',' + u.y] = u.hp;
    return m;
  },

  diffHp(before) {
    for (const u of this.battle.units) {
      const key = u.uid || u.charId + u.x + ',' + u.y;
      const d = u.hp - (before[key] !== undefined ? before[key] : u.hp);
      if (d < 0) { this.popText(u.x, u.y, String(d), '#ff6a5e'); this.unitAnim(u, 'flash'); }
      else if (d > 0) this.popText(u.x, u.y, '+' + d, '#7de87d');
    }
  },

  updateHud() {
    const b = this.battle;
    document.getElementById('hud-stage').textContent = b.stage.name;
    document.getElementById('hud-turn').textContent = `턴 ${b.turn}/${b.stage.maxTurns} · ${b.phase === 'player' ? '아군' : '적군'}`;
    document.getElementById('btn-auto').textContent = this.auto ? '자동전투 끄기' : '자동전투';
    let hint = document.getElementById('hud-autoitem-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'hud-autoitem-hint';
      hint.className = 'dim';
      hint.style.cssText = 'flex-basis:100%;font-size:12px;';
      document.getElementById('battle-top').appendChild(hint);
    }
    hint.textContent = '자동전투: HP 40% 미만 아군은 HP 회복 도구 1개를 자동 사용합니다(그 유닛의 행동 소비 · HP 도구만)';
  },

  log(msg) {
    const el = document.getElementById('battle-log');
    const line = document.createElement('div');
    line.textContent = msg;
    el.prepend(line);
    while (el.children.length > 30) el.lastChild.remove();
  },

  itemStatText(e) {
    const it = ITEMS[e.id];
    const up = e.up || 0;
    const parts = [];
    if (it.atk) parts.push(`공+${it.atk + up * 2}`);
    if (it.def) parts.push(`방+${it.def + up * 2}`);
    if (it.morale) parts.push(`사기+${it.morale}`);
    if (it.mp) parts.push(`MP+${it.mp}`);
    if (it.regen) parts.push(`턴 시작 HP ${Math.round(it.regen * 100)}% 회복`);
    if (it.counter) parts.push(`반격 피해 +${Math.round(it.counter * 100)}%`);
    if (it.tacDef) parts.push(`받는 책략 피해 -${Math.round(it.tacDef * 100)}%`);
    if (it.exp) parts.push(`경험치 +${Math.round(it.exp * 100)}%(행동·승리 보상)`);
    if (it.use && it.use.hp) parts.push(`HP${it.use.hp} 회복`);
    if (it.use && it.use.mp) parts.push(`MP${it.use.mp} 회복`);
    if (it.use && it.use.promo) parts.push('전직용');
    if (it.material) parts.push('강화 재료');
    return parts.join(' ');
  },

  traitText(u) {
    const c = CLASSES[u.cls];
    const [er0, er1] = this.battle ? this.battle.rngOf(u) : [c.rMin, c.rMax];
    const parts = [`이동 ${c.move + (u.perk === 'mob' ? 1 : 0)}`, `사거리 ${er0 === er1 ? er1 : er0 + '~' + er1}${this.battle && this.battle.weather === 'rain' && c.cat === 'archer' ? '(비)' : ''}`];
    parts.push(c.counter ? '반격 가능' : '반격 불가');
    const blocked = Object.keys(TERRAIN).filter(t => t !== 'wall' && (TERRAIN[t].costs[c.cat] || 0) < 0).map(t => TERRAIN[t].name);
    if (blocked.length) parts.push(blocked.join('·') + ' 진입 불가');
    if (u.tactics && u.tactics.length) parts.push('책략 ' + u.tactics.map(t => TACTICS[t].name).join('·'));
    return parts.join(' · ');
  },

  showBanner(text) {
    const el = document.getElementById('turn-banner');
    if (!el) return;
    el.textContent = text;
    el.style.display = 'block';
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => { el.style.display = 'none'; }, 300);
    }, this.fast || this.auto ? 500 : 1100 / this.speed);
  },

  showUnitInfo(u) {
    const el = document.getElementById('unit-info');
    if (!u) { el.innerHTML = ''; return; }
    const es = equipStats(u);
    el.innerHTML = `<b>${u.name}</b> Lv.${u.level} ${CLASSES[u.cls].name}<br>
      HP ${u.hp}/${u.maxHp} MP ${u.mp}/${u.maxMp} 사기 ${u.morale}${es.morale && Math.min(100, u.morale + es.morale) !== u.morale ? `(장비 포함 ${Math.min(100, u.morale + es.morale)})` : ''}<br>
      공 ${Math.round(u.atk + es.atk)} 방 ${Math.round(u.def + es.def)} 지 ${Math.round(u.int)} 속 ${Math.round(u.spd)}
      <span class="unit-trait">${this.traitText(u)}</span>`;
  },

  async onTileClick(x, y) {
    const b = this.battle;
    if (!b || b.over) return;
    this.showTerrainInfo(x, y);
    if (b.phase !== 'player' || this.auto) return;
    const u = b.unitAt(x, y);
    if (this.menuFor) return; // 메뉴 처리는 버튼이
    if (u && u.side === 'player' && !u.done) {
      if (this.selected === u) { // 제자리 행동: 선택된 유닛을 다시 누르면 메뉴 오픈
        this.moveTiles = [];
        this.renderBattle();
        this.openMenu(u);
        return;
      }
      this.selected = u;
      this.moveTiles = b.moveRange(u);
      this.showUnitInfo(u);
      this.renderBattle();
      return;
    }
    if (this.selected && this.moveTiles.some(([tx, ty]) => tx === x && ty === y)) {
      this.selected.x = x; this.selected.y = y;
      this.battle.checkTreasure(this.selected);
      const lastLog = this.battle.log[this.battle.log.length - 1]; // 로그가 비어 있으면(전투 첫 이동) 건너뜀 — 미가드 시 TypeError로 행동 메뉴가 열리지 않음
      if (lastLog && lastLog.includes('보물창고')) this.log(lastLog);
      this.moveTiles = [];
      this.renderBattle();
      await this.delay(120);
      this.openMenu(this.selected);
      return;
    }
    if (u) {
      this.showUnitInfo(u);
      if (u.side === 'enemy') this.threatTiles = this.threatRange(u);
      else this.threatTiles = null;
      this.renderBattle();
      return;
    }
    this.threatTiles = null;
    this.selected = null; this.moveTiles = []; this.renderBattle();
  },

  threatRange(u) {
    const b = this.battle;
    const c = classOf(u);
    const tiles = new Set();
    const reach = [...b.moveRange(u), [u.x, u.y]];
    const [tr0, tr1] = b.rngOf(u);
    for (const [mx, my] of reach) {
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
        const d = Math.abs(x - mx) + Math.abs(y - my);
        if (d >= tr0 && d <= tr1) tiles.add(x + ',' + y);
      }
    }
    return [...tiles].map(k => k.split(',').map(Number));
  },

  openMenu(u) {
    this.menuFor = u;
    const m = document.getElementById('action-menu');
    m.style.display = 'flex';
    // 확대/패닝 상태에서도 유닛 옆, 지금 보이는 영역 안에 배치
    const wrap = document.getElementById('battle-wrap');
    const z = this.zoom;
    const mw = m.offsetWidth || 150, mh = m.offsetHeight || 170;
    const vL = wrap.scrollLeft, vT = wrap.scrollTop;
    const vR = vL + wrap.clientWidth, vB = vT + wrap.clientHeight;
    let left = (u.x + 1) * TILE * z + 6;
    if (left + mw > vR - 4) left = u.x * TILE * z - mw - 6;
    left = Math.max(vL + 4, Math.min(left, vR - mw - 4));
    let top = u.y * TILE * z + 4;
    top = Math.max(vT + 4, Math.min(top, vB - mh - 4));
    m.style.left = left + 'px';
    m.style.top = top + 'px';
    document.getElementById('menu-attack').disabled = this.battle.targetsFor(u).length === 0;
    document.getElementById('menu-tactic').disabled = u.tactics.length === 0;
  },



  cancelTargeting() { // 대상 선택 모드 해제: 힌트·상세 패널·보류 상태 모두 제거
    this.pendingTargets = null; this.pendingKind = null;
    const hint = document.getElementById('target-hint');
    if (hint) hint.style.display = 'none';
    const td = document.getElementById('target-detail');
    if (td) { td.style.display = 'none'; td.innerHTML = ''; }
  },
  renderTargetDetail() { // 캔버스 밖 상세 예측 패널: 큰 글씨 + 행 탭으로 대상 선택(터치 보조)
    const el = document.getElementById('target-detail');
    if (!this.pendingTargets || !this.menuFor) { el.style.display = 'none'; el.innerHTML = ''; return; }
    const u = this.menuFor, b = this.battle;
    el.innerHTML = '<div class="td-head">대상 행을 누르면 바로 실행됩니다</div>';
    for (const t of this.pendingTargets) {
      const row = document.createElement('div');
      row.className = 'td-row';
      if (this.pendingKind === 'attack') {
        const f = b.forecastAttack(u, t);
        const muTxt = f.mu > 0 ? '<span class="td-mu-up">▲상성우세</span> ' : f.mu < 0 ? '<span class="td-mu-down">▼상성열세</span> ' : '';
        const ctr = f.counter
          ? `반격 ${f.counter.min}~${f.counter.max}${f.counter.certain ? '(확정)' : '(조건부)'}`
          : '반격 없음(최소 피해로 격파 가능)';
        row.innerHTML = `<b>${t.name}</b> ${muTxt}— 피해 <b>${f.min}~${f.max}</b> · 회심 시 최대 ${f.critMax} · 회심률 ${f.critPct}% · ${ctr}`;
      } else if (this.pendingKind && this.pendingKind.startsWith('tactic:')) {
        const tid = this.pendingKind.slice(7), tc = TACTICS[tid];
        let txt = null;
        if (tc.kind === 'damage' && t.side !== u.side) txt = `${tc.name} 피해 ${tacticDamage(u, t)}`;
        else if (tc.kind === 'heal' && t.side === u.side) txt = `${tc.name} 회복 +${Math.min(t.maxHp - t.hp, Math.round(tc.power + u.int))}`;
        else if (tc.kind === 'morale' && t.side === u.side) txt = `${tc.name} 사기 +${Math.min(100 - t.morale, tc.power)}`;
        else if (tc.kind === 'demoralize' && t.side !== u.side) {
          const isBoss = this.battle.stage.bossChar === t.charId; // 실제 퇴각 면역 술어와 동일
          const delta = Math.min(t.morale, tc.power);
          txt = delta > 0 ? `${tc.name} 사기 -${delta}` : `${tc.name} 효과 없음(사기 0)`;
          if (isBoss) txt += ' (보스 퇴각 면역)';
          else if (t.morale <= tc.power && delta > 0) txt += ' (퇴각)';
        }
        if (!txt) continue;
        row.innerHTML = `<b>${t.name}</b> — ${txt}`;
      } else continue;
      row.onclick = () => this.onTargetClick(t.x, t.y);
      el.appendChild(row);
    }
    el.style.display = el.children.length ? 'block' : 'none';
  },

  closeMenu() { this.menuFor = null; document.getElementById('action-menu').style.display = 'none'; },

  async menuAction(kind) {
    const u = this.menuFor;
    if (!u) return;
    const b = this.battle;
    if (kind === 'wait') {
      u.done = true; this.closeMenu(); this.selected = null; this.renderBattle(); this.afterAction(); return;
    }
    if (kind === 'attack') {
      const targets = b.targetsFor(u);
      if (targets.length === 1) { this.doAttack(u, targets[0]); return; }
      this.pendingTargets = targets; this.pendingKind = 'attack';
      this.closeMenuKeep();
      this.log('대상을 선택하세요.');
      const hintEl = document.getElementById('target-hint');
      const critPct = b.forecastAttack(u, targets[0]).critPct; // 회심률은 공격자 사기 기준으로 모든 대상 동일
      hintEl.textContent = `대상 선택 — 타일 수치는 비회심 범위(회심 시 표시의 ×1.5) · 회심률 ${critPct}% · 반격?은 조건부 · ▲상성우세/▼열세 ×1.15/×0.85`;
      hintEl.style.display = 'block';
      this.positionHint();
      this.renderBattle(); // 예측 프리뷰 표시
      this.renderTargetDetail();
      return;
    }
    if (kind === 'tactic') {
      this.showTacticMenu(u); return;
    }
    if (kind === 'item') {
      this.showItemMenu(u); return;
    }
  },

  closeMenuKeep() { document.getElementById('action-menu').style.display = 'none'; },

  showTacticMenu(u) {
    const m = document.getElementById('action-menu');
    m.innerHTML = '';
    for (const tid of u.tactics) {
      const t = TACTICS[tid];
      const btn = document.createElement('button');
      const rainBlocked = this.battle && this.battle.weather === 'rain' && tid === 'fire';
      btn.textContent = `${t.name} (MP ${t.mp})` + (rainBlocked ? ' · 비로 불가' : '');
      btn.disabled = rainBlocked || u.mp < t.mp;
      btn.onclick = () => {
        // 사거리 내 대상 선택
        const foes = this.battle.units.filter(v => v.hp > 0 && !v.routed &&
          Math.abs(v.x - u.x) + Math.abs(v.y - u.y) <= t.range);
        const validFactions = (t.kind === 'damage' || t.kind === 'demoralize') ? foes.filter(v => v.side !== u.side) : foes.filter(v => v.side === u.side);
        if (!validFactions.length) { this.log('대상이 없습니다.'); this.closeMenu(); this.menuFor = null; return; }
        if (t.kind === 'damage' || t.kind === 'demoralize' || validFactions.length > 1) {
          this.pendingTargets = validFactions; this.pendingKind = 'tactic:' + tid;
          this.closeMenuKeep();
          this.log('대상을 선택하세요.');
          const hintEl = document.getElementById('target-hint');
          const areaTxt = t.area > 0 ? `클릭 중심 십자 ${t.area}칸 범위` : '단일 대상';
          const sideTxt = t.kind === 'damage' ? '의 적 피해 · 아군 피해 없음 · 표시는 해당 대상 기준'
            : t.kind === 'demoralize' ? '의 적 사기 감소 · 사기 0이면 퇴각(보스 제외) · 표시는 해당 대상 기준'
            : t.kind === 'morale' ? '의 아군 사기 상승 · 표시는 해당 대상 기준' : ' 회복';
          hintEl.textContent = `대상 선택 — ${t.name}: ${areaTxt}${sideTxt}`;
          hintEl.style.display = 'block';
          this.positionHint();
          this.renderBattle(); // 디밍 표시
          this.renderTargetDetail();
        } else {
          this.doTactic(u, tid, validFactions[0].x, validFactions[0].y);
        }
      };
      m.appendChild(btn);
    }
    const cancel = document.createElement('button'); cancel.textContent = '취소';
    cancel.onclick = () => { this.closeMenu(); this.menuFor = null; this.restoreMenuButtons(); };
    m.appendChild(cancel);
  },

  restoreMenuButtons() {
    const m = document.getElementById('action-menu');
    m.innerHTML = `
      <button id="menu-attack">공격</button>
      <button id="menu-tactic">책략</button>
      <button id="menu-item">도구</button>
      <button id="menu-wait">대기</button>
      <button id="menu-cancel">취소</button>`;
    document.getElementById('menu-attack').onclick = () => this.menuAction('attack');
    document.getElementById('menu-tactic').onclick = () => this.menuAction('tactic');
    document.getElementById('menu-item').onclick = () => this.menuAction('item');
    document.getElementById('menu-wait').onclick = () => this.menuAction('wait');
    document.getElementById('menu-cancel').onclick = () => { this.closeMenu(); this.menuFor = null; };
  },

  showItemMenu(u) {
    const m = document.getElementById('action-menu');
    m.innerHTML = '';
    const usable = this.inventory.map((it, i) => ({ ...it, idx: i })).filter(it => ITEMS[it.id].use && !ITEMS[it.id].use.promo);
    if (!usable.length) { this.log('사용할 도구가 없습니다.'); this.closeMenu(); this.menuFor = null; return; }
    for (const it of usable) {
      const btn = document.createElement('button');
      btn.textContent = ITEMS[it.id].name;
      btn.onclick = () => {
        this.inventory.splice(it.idx, 1);
        this.battle.useItem(u, it.id, u);
        u.done = true;
        this.closeMenu(); this.menuFor = null; this.restoreMenuButtons();
        this.log(this.battle.log[this.battle.log.length - 1]);
        this.renderBattle(); this.afterAction();
      };
      m.appendChild(btn);
    }
    const cancel = document.createElement('button'); cancel.textContent = '취소';
    cancel.onclick = () => { this.closeMenu(); this.menuFor = null; this.restoreMenuButtons(); };
    m.appendChild(cancel);
  },

  async onTargetClick(x, y) {
    const b = this.battle;
    const u = this.menuFor;
    const t = this.pendingTargets.find(v => v.x === x && v.y === y);
    if (!t || !u) return;
    const kind = this.pendingKind;
    this.cancelTargeting();
    if (kind === 'attack') this.doAttack(u, t);
    else if (kind.startsWith('tactic:')) this.doTactic(u, kind.slice(7), t.x, t.y);
  },

  async doAttack(u, t) {
    const b = this.battle;
    this.closeMenu(); this.menuFor = null;
    this.threatTiles = null;
    const before = this.snapshotHp();
    this.unitAnim(u, 'lunge', t.x, t.y);
    const evs = b.attack(u, t);
    this.diffHp(before);
    this.log(b.log[b.log.length - 1]);
    this.flashUnit(t);
    u.done = true;
    this.renderBattle();
    await this.delay(200);
    this.afterAction();
  },

  async doTactic(u, tid, x, y) {
    const b = this.battle;
    this.closeMenu(); this.menuFor = null; this.restoreMenuButtons();
    this.threatTiles = null;
    const before = this.snapshotHp();
    b.useTactic(u, tid, x, y);
    this.diffHp(before);
    this.log(b.log[b.log.length - 1]);
    u.done = true;
    this.renderBattle();
    await this.delay(200);
    this.afterAction();
  },

  flashUnit(u) {
    // 간단 플래시는 renderBattle 재호출로 대체
  },

  afterAction() {
    const b = this.battle;
    this.updateHud();
    this.renderBattle();
    if (b.over) { this.finishBattle(); return; }
    if (this.auto) return; // autoLoop가 진행
    if (b.alive('player').every(u => u.done)) this.runEnemyPhase();
  },

  async runEnemyPhase() {
    const b = this.battle;
    if (b.over || b.phase !== 'player') return;
    this.cancelTargeting();
    b.endPhase(); // -> enemy
    this.updateHud(); this.renderBattle();
    this.showBanner(`적군 턴`);
    await this.delay(250);
    for (const e of b.alive('enemy')) {
      if (b.over) break;
      const before = this.snapshotHp();
      b.aiAct(e);
      this.diffHp(before);
      const last = b.log[b.log.length - 1];
      if (last && last !== this._lastLogged) { this.log(last); this._lastLogged = last; }
      this.renderBattle();
      await this.delay(160);
    }
    b.endPhase(); // -> player, turn++
    b.checkTurnLimit();
    this._lastLogged = null;
    this.updateHud(); this.renderBattle();
    if (!b.over) this.showBanner(`아군 턴 ${b.turn}`);
    if (b.over) this.finishBattle();
  },

  async autoLoop() {
    const b = this.battle;
    this.cancelTargeting();
    while (!b.over) {
      // 플레이어 페이즈 자동
      for (const u of b.alive('player')) {
        if (b.over) break;
        if (u.done) continue;
        const before = this.snapshotHp();
        b.aiAct(u);
        this.diffHp(before);
        u.done = true;
        const last = b.log[b.log.length - 1];
        if (last && last !== this._lastLogged) { this.log(last); this._lastLogged = last; }
        this.renderBattle();
        await this.delay(this.fast ? 20 : 120);
      }
      if (b.over) break;
      await this.runEnemyPhase();
      if (this.turnGuard++ > 200) break;
    }
    if (b.over) this.finishBattle();
  },
  turnGuard: 0,

  finishBattle() {
    const b = this.battle;
    if (b._finished) return; // 중복 호출 가드 (자동전투 적 페이즈 종료 시 autoLoop 경유 이중 호출 방지)
    b._finished = true;
    this.log(b.over.reason);
    if (b.over.win) {
      // 보상
      const r = b.stage.rewards;
      const goldGain = Math.round(r.gold * (1 + 0.5 * (this.cycle - 1)));
      this.gold += goldGain;
      for (const id of r.items) this.inventory.push({ id, up: 0 });
      for (const u of b.alive('player')) {
        const a = this.army[u.charId];
        if (a) {
          a.level = u.level; a.cls = u.cls;
          const emul = 1 + (equipStats(u).exp || 0); // 수련패: 승리 보상 경험치에도 동일 적용
          a.exp = u.exp + Math.round(r.exp * emul);
          a.maxHp = u.maxHp; a.maxMp = u.maxMp; a.atk = u.atk; a.def = u.def; a.int = u.int; a.spd = u.spd;
          while (a.exp >= 100) { a.exp -= 100; a.level++; a.maxHp += 4; a.maxMp += 2; a.atk += 1.6; a.def += 1.3; a.int += 1.4; a.spd += 1.1; }
          a.equip = u.equip;
        }
      }
      // 격파한 적 드랍: 철광석 확률
      for (const k of b.foeKills) if (Math.random() < 0.5) this.inventory.push({ id: 'ore', up: 0 });
      // 보물창고 점령 전리품 (승리 시에만 지급 — 패배·재도전 중복 지급 방지)
      let lootText = '';
      if (b.lootClaimed && b.stage.treasure) {
        const t = b.stage.treasure;
        const lootGold = Math.round((t.gold || 0) * (1 + 0.5 * (this.cycle - 1))); // 기본 보상과 동일한 회차 스케일
        this.gold += lootGold;
        for (const id of (t.items || [])) this.inventory.push({ id, up: 0 });
        lootText = ` + 보물창고 전리품(${lootGold}골드${(t.items || []).length ? ' · ' + t.items.map(i => ITEMS[i].name).join(', ') : ''})`;
      }
      // 보스 드랍: 해당 스테이지 보스 격파 시 장신구 1개 (승리 분기 1회 지급)
      let dropText = '';
      if (b.stage.bossDrop) {
        this.inventory.push({ id: b.stage.bossDrop, up: 0 });
        dropText = ` + 보스 드랍(${ITEMS[b.stage.bossDrop].name})`;
      }
      // 신속 승리 보너스: 목표 턴 내 승리 시 추가 골드 (미달 불이익 없음, 승리 분기 1회 지급)
      let fastText = '';
      if (b.stage.fastWin && b.turn <= b.stage.fastWin.turns) {
        const fwGold = Math.round(b.stage.fastWin.gold * (1 + 0.5 * (this.cycle - 1)));
        this.gold += fwGold;
        fastText = ` + 신속 승리 보너스(${fwGold}골드)`;
      }
      this.stageIndex++;
      this.battlesCleared++; // 승리 분기 1회 — 패배·재도전 시 불변
      // 명예 기록 갱신(승리 분기 1회): 최단 턴은 최소값, 무사망은 전원 생존 시에만
      if (!this.records) this.records = { wins: 0, bestTurns: {}, noDeath: {} };
      this.records.wins++;
      const sidRec = b.stage.id;
      const prevBt = this.records.bestTurns[sidRec];
      const prevT = (prevBt && typeof prevBt === 'object') ? prevBt.t : prevBt; // 구형식(숫자) 호환
      if (prevT == null || b.turn < prevT) this.records.bestTurns[sidRec] = { t: b.turn, c: this.cycle }; // 회차별 적 레벨이 달라 달성 회차를 함께 보존
      const deadCnt = b.units.filter(u => u.side === 'player' && (u.hp <= 0 || u.routed)).length;
      if (deadCnt === 0) this.records.noDeath[sidRec] = (this.records.noDeath[sidRec] || 0) + 1;
      // 클리어 등급(다회차 장치 뼈대, 명예 전용·보상 없음): S=무사망+신속목표 내, A=무사망 또는 신속목표 내, B=사망 2 이하, C=그 외
      if (!this.records.grades) this.records.grades = {};
      const fwT = b.stage.fastWin ? b.stage.fastWin.turns : null;
      const grade = (deadCnt === 0 && fwT != null && b.turn <= fwT) ? 'S' : (deadCnt === 0 || (fwT != null && b.turn <= fwT)) ? 'A' : deadCnt <= 2 ? 'B' : 'C';
      const GRANK = { S: 3, A: 2, B: 1, C: 0 };
      const prevG = this.records.grades[sidRec];
      if (!prevG || GRANK[grade] > GRANK[prevG.g]) this.records.grades[sidRec] = { g: grade, c: this.cycle };
      b.clearGrade = grade;
      const newAch = this.checkAchievements();
      b.newAch = newAch;
      this.save();
      setTimeout(() => {
        const surv = b.alive('player').map(u => `${u.name}(${u.hp}/${u.maxHp})`).join(' · ');
        document.getElementById('result-title').textContent = '승리!';
        document.getElementById('btn-retry').style.display = 'none'; // 승리 후에는 재도전 없음 (다음 전투로 진행)
        document.getElementById('btn-result-next').textContent = '다음';
        document.getElementById('result-text').innerHTML =
          `${b.over.reason}<br><span class="dim">턴 ${b.turn}/${b.stage.maxTurns} · 격파 ${b.foeKills.length} · 생존: ${surv}</span><br>` +
          `<b>클리어 등급 ${b.clearGrade}</b> <span class="dim">(무사망+신속 S · S 달성은 업적 해금 조건)</span><br>` +
          ((b.newAch && b.newAch.length) ? `<b>업적 달성: ${b.newAch.map(a => a.name).join(', ')}</b><br>` : '') +
          `보상: ${goldGain}골드 · ${r.items.map(i => ITEMS[i].name).join(', ') || '없음'} · 경험치 ${r.exp}` + lootText + fastText + dropText;
        this.show('screen-result');
      }, this.auto ? 100 : 800);
    } else {
      setTimeout(() => {
        document.getElementById('result-title').textContent = '패배...';
        document.getElementById('btn-retry').style.display = '';
        document.getElementById('result-text').innerHTML =
          `${b.over.reason}<br><span class="dim">턴 ${b.turn}/${b.stage.maxTurns} · 격파 ${b.foeKills.length}</span><br>다시 도전하세요.`;
        document.getElementById('btn-result-next').textContent = '브리핑으로 돌아가기';
        this.show('screen-result');
      }, this.auto ? 100 : 800);
    }
  },

  renderComplete() {
    const nc = document.getElementById('btn-next-cycle');
    if (nc) nc.disabled = false;
    document.getElementById('complete-title').textContent = `${this.cycle}회차 클리어!`;
    document.getElementById('complete-text').textContent =
      `${STAGES.length}개 전투를 모두 클리어했습니다. 군단·장비·소지품을 유지한 채 더 강해진 적과 ${this.cycle + 1}회차를 시작할 수 있습니다.`;
    this.show('screen-complete');
  },
};
