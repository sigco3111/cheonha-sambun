// 렌더링 + 화면 상태기계
'use strict';

const TILE = 48;
const IMG = { terrain: {}, units: {} };
const TERRAIN_KEYS = Object.keys(TERRAIN);
const UNIT_SPRITES = ['infantry','cavalry','archer','strategist','enemy_infantry','enemy_cavalry','enemy_archer','enemy_strategist'];
// Sprite files renamed on GitHub (web UI upload prefixed them); map sprite keys to actual file basenames.
const SPRITE_FILE = {cavalry:'1-cavalry', archer:'2-archer', strategist:'1-strategist', enemy_cavalry:'4-enemy_cavalry', enemy_archer:'5-enemy_archer', enemy_strategist:'6-enemy_strategist', infantry:'new_infantry', enemy_infantry:'new_enemy_infantry'};
// Individual commander sprites (allied officers); fallback to class sprite when absent.
const CHAR_SPRITES = ['liu_bei','guan_yu','zhang_fei','jian_yong','sun_qian','mi_zhu','cheng','deng','pei','zhang_jue','hua_xiong','lu_bu','li_ru','dong_zhuo','li_jue','guo_si','cao_cao','xiahou_dun','xiahou_yuan','cao_ren','yue_jin','xun_yu','yuan_shao','yan_liang','wen_chou','ju_shou'];

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
  factionId: 'liu', route: [], endingHistory: {}, clearMarks: {}, // 세력·전역 분기 이력·엔딩 이력·장별 루트 기록 (구 세이브는 폴백)
  records: { wins: 0, bestTurns: {}, noDeath: {}, grades: {}, ach: {} }, // 명예 기록(보상 없음): 누적 승리·최단 턴·무사망·최고 등급·업적
  canvas: null, ctx: null,
  zoom: 1, ZOOM_MIN: 0.4, ZOOM_MAX: 2.5,
  fx: [], threatTiles: null, _fxRunning: false,
  delay: (ms) => new Promise(r => setTimeout(r, Game.fast || Game.auto ? 30 : ms / Game.speed)),

  armyComplete(a, fId) { return !!a && this.faction(fId).need.every(id => !!a[id]); }, // 정상 군단 완전성 술어 (save/load/startBattle 공통) — factionId가 누락·미지값이어도 유비 기준으로 폴백해 가드 우회 불가
  commanderId() { const st = this.stages()[this.stageIndex]; const p = st && st.players && st.players[0]; return p ? p.char : 'liu_bei'; }, // 현재 전투의 지휘관 슬롯 장수 (유비군 9전·조조군 4전 모두 players[0]이 지휘관)
  faction(fId) { // 세력 정의 조회(기본: 현재 상태). FACTIONS 미로드(구 data 혼합)·미지 factionId 모두 유비 사양으로 폴백
    const F = (typeof FACTIONS !== 'undefined') ? FACTIONS : null;
    const id = (fId !== undefined) ? fId : this.factionId;
    return (F && F[id]) || (F && F.liu) || { name: '유비군', need: ['liu_bei', 'guan_yu', 'zhang_fei', 'jian_yong', 'sun_qian', 'mi_zhu'], roster: ['liu_bei', 'guan_yu', 'zhang_fei', 'jian_yong', 'sun_qian', 'mi_zhu'], stages: STAGES, initEquip: { liu_bei: 'iron_sword', guan_yu: 'spear', zhang_fei: 'spear', sun_qian: 'bow', jian_yong: 'fan' } }; // FACTIONS 부재(구 data 혼합) 폴백도 initArmy에 필요한 전체 사양을 갖춤
  },
  hasRoute(id) { return (this.route || []).some(r => r && r.id === id); }, // 전역 분기 이력 조회 (구 세이브 route 없음 → false)
  stages() { // 현재 세력의 전역 목록 — 기존 STAGES 직접 참조 대신 이 경로 사용
    const base = this.faction().stages;
    // 2부 연장(조조 북방 평정 / 유비 박망파·장판): 완주 후 명시 언락(route '<세력>_p2')이 있을 때만 연장 — 미언락 세이브는 1부 그대로라 완주 의미·엔딩 기록 불변 (2부 데이터 미정의면 아무 변화 없음)
    const p2 = this.factionId === 'cao' ? (typeof CAO_STAGES2 !== 'undefined' ? CAO_STAGES2 : null)
             : this.factionId === 'liu' ? (typeof LIU_STAGES2 !== 'undefined' ? LIU_STAGES2 : null) : null;
    if (p2 && p2.length && this.hasRoute(this.factionId + '_p2')) return base.concat(p2);
    return base;
  },
  save() {
    if (!this.armyComplete(this.army)) { console.warn('[save 차단] 군단 데이터가 불완전해 기존 세이브를 보호합니다'); return; } // 비정상 상태에서 원본 세이브 덮어쓰기 방지
    localStorage.setItem('cheonha3_save', JSON.stringify({
      army: this.army, inventory: this.inventory, gold: this.gold, stageIndex: this.stageIndex, cycle: this.cycle, battlesCleared: this.battlesCleared, deploySel: this.deploySel,
      records: this.records, bonusCycle: this.bonusCycle || 0, epilogue: this.epilogue || null, epilogueHistory: this.epilogueHistory || {},
      factionId: this.factionId || 'liu', route: this.route || [], endingHistory: this.endingHistory || {}, clearMarks: this.clearMarks || {}, // 미지 factionId는 로드 시 보존된 값이 그대로 기록됨
    }));
  },
  load() {
    const s = localStorage.getItem('cheonha3_save');
    if (!s) return false;
    const d = JSON.parse(s);
    const fId = d.factionId || 'liu'; // 구 세이브(필드 없음)만 'liu'. 미지 값은 변환하지 않고 보존 — 저장 시 원래 값이 그대로 기록되어 미지 세력 군단을 유비로 자동 재저장하지 않는다
    if (!this.armyComplete(d.army, fId)) { // 손상 세이브: 원본을 바꾸지 않고 로드하지 않음 (자동 복구/초기화는 하지 않음). 검사는 세이브 자신의 세력 기준, 실패 시 현재 상태 불변
      console.warn('[load 차단] 세이브의 군단 데이터가 비어 있거나 누락됐습니다');
      this._corruptSave = true; this.renderTitle();
      return false;
    }
    this.factionId = fId;
    this.army = d.army; this.inventory = d.inventory; this.gold = d.gold; this.stageIndex = d.stageIndex;
    this.deploySel = (d.deploySel && Array.isArray(d.deploySel.picks)) ? d.deploySel : null; // 구 세이브(필드 없음)는 기본 편성
    this.cycle = d.cycle || 1;
    this.epilogue = d.epilogue || null; this.epilogueHistory = d.epilogueHistory || {};
    this.route = Array.isArray(d.route) ? d.route : []; this.endingHistory = (d.endingHistory && typeof d.endingHistory === 'object') ? d.endingHistory : {};
    this.clearMarks = (d.clearMarks && typeof d.clearMarks === 'object') ? d.clearMarks : {}; // 구 세이브(필드 없음)는 미기록 — 과거 완주를 추정해 채우지 않음
    this.bonusCycle = d.bonusCycle || 0; // 구세이브(필드 없음)는 0. 미지급 회차는 브리핑에서 1회 보완
    // 구세이브(battlesCleared 없음): 신규 전투 추가 전 기준(6전)으로 누적 승리 수를 복원해 상점 로테이션 연속성 유지
    this.battlesCleared = (d.battlesCleared != null) ? d.battlesCleared : (this.stageIndex + (this.cycle - 1) * 6);
    const dr = d.records; // 구세이브(records 없음)는 빈 기록으로 시작 — 기존 진행은 그대로
    this.records = (dr && typeof dr === 'object') ? { wins: dr.wins || 0, bestTurns: dr.bestTurns || {}, noDeath: dr.noDeath || {}, grades: dr.grades || {}, ach: dr.ach || {}, support: dr.support || null, deaths: (typeof dr.deaths === 'number') ? dr.deaths : undefined, swiftThis: (dr.swiftThis && typeof dr.swiftThis === 'object' && typeof dr.swiftThis.c === 'number' && dr.swiftThis.ids && typeof dr.swiftThis.ids === 'object') ? dr.swiftThis : null, defeats: (dr.defeats && typeof dr.defeats === 'object' && typeof dr.defeats.c === 'number' && typeof dr.defeats.n === 'number' && Array.isArray(dr.defeats.ids)) ? dr.defeats : null } // defeats: 패배 이력 — 형태 검증 후 보존(구 세이브·오염 값은 null → 다음 패배 시 재생성)
: { wins: 0, bestTurns: {}, noDeath: {}, grades: {}, ach: {}, support: null, deaths: 0 }; // swiftThis: 형태 검증 후 보존(구 세이브·오염 값은 null → 다음 승리 시 현재 회차로 재생성)

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

  initArmy(factionId) { // 명시적 새 게임 확정 경로에서만 호출 — load()는 어떤 경우에도 호출하지 않음(손상 세이브 자동 대체 금지)
    const f = (typeof FACTIONS !== 'undefined' && FACTIONS[factionId]) ? factionId : 'liu';
    this.factionId = f;
    this.army = {}; // 명시적 새 게임은 이전 런의 군단(합류 IF 장수·다른 세력)을 남기지 않고 초기화 — load()는 이 경로를 거치지 않음
    for (const id of this.faction().roster) {
      const c = CHARS[id];
      this.army[id] = {
        charId: id, cls: c.cls, level: 1, exp: 0,
        maxHp: c.hp, maxMp: c.mp, atk: c.atk, def: c.def, int: c.int, spd: c.spd,
        equip: { weapon: null, armor: null, acc: null },
      };
    }
    // 초기 장비는 세력 정의(FACTIONS.initEquip)에서 가져옴. 미지 세력·구 data 혼합(FACTIONS 부재)은 유비 기준 폴백 — 기존 유비 새 게임과 동일 결과. 군단에 없는 id는 건너뜀(저장 차단 가드와 무관하게 무해)
    const LIU_INIT_EQ = { liu_bei: 'iron_sword', guan_yu: 'spear', zhang_fei: 'spear', sun_qian: 'bow', jian_yong: 'fan' };
    const initEq = this.faction(f).initEquip || ((typeof FACTIONS !== 'undefined' && FACTIONS.liu && FACTIONS.liu.initEquip) || LIU_INIT_EQ);
    for (const [id, w] of Object.entries(initEq)) { // 값은 무기 id 문자열(기존) 또는 { weapon, armor } 객체 — 세력 정의 확장, 구 데이터는 문자열 그대로
      if (!this.army[id]) continue;
      if (typeof w === 'string') { this.army[id].equip.weapon = { id: w, up: 0 }; }
      else { if (w.weapon) this.army[id].equip.weapon = { id: w.weapon, up: 0 }; if (w.armor) this.army[id].equip.armor = { id: w.armor, up: 0 }; if (w.acc) this.army[id].equip.acc = { id: w.acc, up: 0 }; }
    }
    this.inventory = [{ id: 'leather', up: 0 }, { id: 'leather', up: 0 }, { id: 'bean', up: 0 }, { id: 'bean', up: 0 }, { id: 'ore', up: 0 }];
    this.gold = 500;
  },

  resetRun() { // 새 게임: 진행 상태 전체 초기화 — 회차/누적 승리/기록이 이전 런에서 넘어오면 적 레벨 스케일·상점 로테이션이 어긋남
    this.stageIndex = 0; this.cycle = 1; this.battlesCleared = 0;
    this.records = { wins: 0, bestTurns: {}, noDeath: {}, grades: {}, ach: {}, deaths: 0 };
    this.deploySel = null; this.epilogue = null; this.epilogueHistory = {};
    this.route = []; this.endingHistory = {}; this.clearMarks = {}; // factionId는 새 게임 흐름이 initArmy에서 먼저 설정
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
    if (this.factionId !== 'liu') return []; // 관해·태사자·주창 IF 합류는 유비군 전역 전용 — 다른 세력 루트에 유비 IF를 섞지 않는다
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
  deploySlots() { return this.stages()[this.stageIndex].players; },
  defaultDeploy() { return this.deploySlots().map(p => p.char).filter(id => this.army[id]); },
  // 유효 선택(유비 선두 고정·보유만·슬롯 수 정확). 저장 선택이 현재 슬롯과 어긋나면 자동 보정하고 그 내용을 corrected에 돌려줌
  deploySelection() {
    const slots = this.deploySlots().length;
    const def = this.defaultDeploy();
    const stored = (this.deploySel && Array.isArray(this.deploySel.picks)) ? this.deploySel : null;
    let corrected = false;
    const dropped = [], added = [];
    const picks = [];
    const cmd = this.commanderId(); // 지휘관 고정 슬롯(세력 공통 규칙, 유비 전용 하드코딩 아님)
    if (!stored) { for (const id of def) { if (id !== cmd && this.army[id] && !picks.includes(id)) picks.push(id); } }
    else {
      for (const id of stored.picks) { if (id !== cmd && this.army[id] && !picks.includes(id)) picks.push(id); }
      if (stored.stage !== this.stageIndex) { // 스테이지가 달라져 슬롯 수가 어긋날 때만 자동 보정(제외/보충된 장수를 이름으로 표시), 같은 스테이지의 사용자 선택은 그대로 존중
        if (picks.length > slots - 1) { dropped.push(...picks.splice(slots - 1)); }
        for (const id of [...def, ...Object.keys(this.army)]) { if (picks.length >= slots - 1) break; if (id !== cmd && !picks.includes(id)) { picks.push(id); added.push(id); } }
        corrected = true;
      }
    }
    const sel = [cmd, ...picks];
    const valid = sel.length === slots && sel.every(id => this.army[id]);
    return { sel, valid, corrected, dropped, added };
  },

  // 업적 뼈대(다회차 장치, 명예 전용·보상 없음): 조건은 전부 저장된 기록/군단 상태로 검증 — 후속 증분에서 숨겨진 장수·병종 해금의 연결점
  checkAchievements() {
    if (!this.records.ach) this.records.ach = {};
    const defs = [
      { id: 'first_s', name: '무결의 첫걸음', desc: '어떤 전투든 S 등급 달성', ok: () => Object.values(this.records.grades || {}).some(g => g.g === 'S') },
      { id: 'nine', name: '아홉 전투 정복', desc: '제1전~제9전 모두 클리어', ok: () => this.factionId === 'liu' && this.stages().every(st => (this.records.grades || {})[st.id]) }, // 유비군 9전 전용 업적 — 다른 세력 전역 길이와 무관
      { id: 'flawless', name: '불사의 군단', desc: '모든 전투를 무사망으로 클리어한 기록 보유', ok: () => this.stages().every(st => ((this.records.noDeath || {})[st.id] || 0) > 0) },
      { id: 'smith', name: '대장의 손길', desc: '장비 +5 강화 달성', ok: () => Object.values(this.army || {}).some(a => Object.values(a.equip || {}).some(e => e && (e.up || 0) >= 5)) },
      { id: 'swift', name: '질풍신뢰', desc: '신속 목표 내 클리어 기록 보유', ok: () => this.stages().some(st => { const bt = (this.records.bestTurns || {})[st.id]; const t = (bt && typeof bt === 'object') ? bt.t : bt; return t != null && st.fastWin && t <= st.fastWin.turns; }) },
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
    const st = this.stages()[this.stageIndex];
    if (!st) { this.renderComplete(); return; }
    this.show('screen-briefing');
    document.getElementById('brief-title').textContent = st.name;
    document.getElementById('brief-text').textContent = st.briefing;
    // 전역 확장 이어하기 안내: 이전 완주 기록(엔딩 이력)이 있는데 아직 남은 전투가 있으면 — 확장 전 완주 세이브가 추가 전투로 이어지는 상태. 기존 엔딩 보존을 명시
    let ex = document.getElementById('brief-extended');
    if (!ex) { ex = document.createElement('div'); ex.id = 'brief-extended'; ex.className = 'dim'; const bt = document.getElementById('brief-text'); bt.parentNode.insertBefore(ex, bt.nextSibling); }
    ex.textContent = ((this.endingHistory || {})[this.cycle] && this.stageIndex < this.stages().length)
      ? '이전 완주 이후 추가된 전투입니다. 이전 완주의 엔딩 기록은 보존되며 이번 전투 결과로 변경되지 않습니다.' : '';
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
      const cmdName = CHARS[this.commanderId()].name;
      head.innerHTML = `<b>출전 편성</b> <span class="dim">${dep.sel.length}/${slots}명 · ${cmdName} 고정</span>`
        + (dep.corrected ? ' <span class="dim">· 스테이지 규모가 달라 자동 조정됨'
          + (dep.dropped && dep.dropped.length ? ` — 제외: ${dep.dropped.map(id => CHARS[id].name).join(',')}` : '')
          + (dep.added && dep.added.length ? ` — 보충: ${dep.added.map(id => CHARS[id].name).join(',')}` : '') + '</span>' : '')
        + (!dep.valid ? ` <span style="color:#e08a8a">출전 인원이 ${slots}명이 되어야 출진할 수 있습니다</span>` : '');
      dp.appendChild(head);
      const fixed = document.createElement('button'); fixed.textContent = `✓ ${cmdName} Lv${this.army[this.commanderId()].level} (고정)`; fixed.disabled = true; fixed.className = 'primary';
      dp.appendChild(fixed); dp.appendChild(document.createTextNode(' '));
      const picks = dep.sel.slice(1);
      for (const id of Object.keys(this.army)) {
        if (id === this.commanderId()) continue;
        const a = this.army[id]; const on = picks.includes(id);
        const b = document.createElement('button');
        b.textContent = (on ? '✓ ' : '') + `${CHARS[id].name} Lv${a.level}`;
        if (on) b.className = 'primary';
        b.onclick = () => {
          const cur = this.deploySelection().sel.slice(1);
          const i = cur.indexOf(id);
          if (i >= 0) cur.splice(i, 1);
          else {
            if (cur.length >= this.deploySlots().length - 1) { alert(`출전은 ${cmdName} 포함 ${this.deploySlots().length}명까지입니다. 먼저 다른 장수를 빼 주세요.`); return; }
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
      // 인원 미달이면 출전 버튼 비활성 + 버튼 바로 위에 부족 인원 안내 (무효 편성 차단 엔진 가드는 startBattle에 그대로 유지)
      const bd = document.getElementById('btn-deploy');
      if (bd) {
        bd.disabled = !dep.valid;
        let bn = document.getElementById('deploy-block-note');
        if (!dep.valid) {
          if (!bn) { bn = document.createElement('div'); bn.id = 'deploy-block-note'; bn.className = 'dim'; bd.parentNode.insertBefore(bn, bd); }
          bn.textContent = `출전 인원이 ${slots}명이 되어야 출진할 수 있습니다 (현재 ${dep.sel.length}/${slots}명)`;
          bn.style.display = '';
        } else if (bn) bn.style.display = 'none';
      }
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
    if (this.stageIndex >= this.stages().length) { this.startEpilogue(); return; }
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
    const ex=document.getElementById('epilogue-exit');if(ex)ex.style.display='none';
    const dep = this.deploySelection();
    if (!dep.valid) { alert(`출전 편성이 맞지 않습니다(${dep.sel.length}/${this.deploySlots().length}명). 브리핑에서 출전 인원을 맞춰 주세요.`); this.renderBriefing(); return; } // 무효 편성 출진 차단
    const st0 = this.stages()[this.stageIndex];
    const stageEff = dep.sel.every((id, i) => st0.players[i] && st0.players[i].char === id) ? st0
      : { ...st0, players: st0.players.map((slot, i) => ({ ...slot, char: dep.sel[i] })) }; // 기본 편성이면 원본 그대로(기존 동작과 완전 동일)
    this._autoNote = null; this._equipBackup = null;
    this.turnGuard = 0; // 전투별 안전 상한. 이전 전투의 자동 진행 횟수를 넘겨받지 않는다.
    this.battle = new Battle(stageEff, this.army, this.cycle, { deploymentVariant: true, faction: (typeof FACTIONS !== 'undefined' && FACTIONS[this.factionId]) ? this.factionId : 'liu' }); // 세력별 변형 테이블 키 — 미지/구 세이브는 유비(전역 목록 폴백과 동일 규칙)
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
    recDiv.innerHTML = `<b>기록</b> <span class="dim">누적 승리 ${rc.wins} · ${this.cycle}회차 · 이 기능 도입 이후 플레이부터 집계 · 전투 기록 · 회차마다 적 레벨이 달라 회차가 다른 최단 턴끼리는 단순 비교 불가 · 신속 목표 판정은 승리한 전투의 턴만 집계(재도전 후 승리도 인정, 패배한 전투는 집계하지 않음)</span><br>` +
      this.stages().map(st => {
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
    // 1) 장착 중인 것까지 전부 풀에 모으기 — 단 지휘관의 착용 방어구는 유지(패배 조건 = 지휘관 전사라 방어구 재배정에서 지휘관이 밀리면 안 됨. 유비군은 지휘관 초기 방어구가 없어 기존 배정 결과와 동일)
    const pool = [];
    const cmdr = this.commanderId();
    for (const id of ids) {
      const a = this.army[id];
      for (const sl of ['weapon', 'armor', 'acc']) {
        if (id === cmdr && sl === 'armor' && a.equip[sl]) continue; // 지휘관 방어구는 풀링·재배정 제외
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
    // 3) 방어구: 지휘관 착용 갑옷은 유지하되 상위 갑옷이 있으면 교체(구 갑옷은 풀로 — 상향 흐름 보장·소실 없음). 이후 미착용 유닛에 방어 높은 순 배정
    {
      const cmdUnit = this.army[cmdr];
      if (cmdUnit && cmdUnit.equip.armor) {
        const better = pool.filter(e => ITEMS[e.id].slot === 'armor' && val(e) > val(cmdUnit.equip.armor)).sort((x, y) => val(y) - val(x))[0];
        if (better) { const old = cmdUnit.equip.armor; cmdUnit.equip.armor = better; pool.splice(pool.indexOf(better), 1); pool.push(old); }
      }
      const units = ids.map(id => this.army[id]).filter(u => !u.equip.armor).sort((a, b) => b.def - a.def); // 이미 착용 중인 유닛(유지 대상 지휘관)은 건너뜀 — 덮어쓰기로 착용 갑옷이 사라지지 않게
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
      // 현재 장착 상태를 표시하는 자리표시 옵션 — 장착 중인데 '(비우기)'가 보이는 오해 방지
      const curTxt = cur ? `현재: ${ITEMS[cur.id].name}${cur.up ? '+' + cur.up : ''}` : '비어 있음';
      // 같은 장비는 개수로 묶어 표시 (선택 시 첫 번째 실물을 장착)
      const seen = {};
      const opts = [];
      this.inventory.forEach((it, i) => {
        if (ITEMS[it.id].slot !== slot) return;
        const k = it.id + '|' + (it.up || 0);
        if (seen[k] !== undefined) { opts[seen[k]].n++; return; }
        seen[k] = opts.length;
        opts.push({ i, n: 1, label: `${ITEMS[it.id].name}${it.up ? '+' + it.up : ''} (${this.itemStatText(it)})` });
      });
      sel.innerHTML = `<option value="__keep" selected disabled>${curTxt} (변경하려면 선택)</option><option value="">(비우기)</option>` +
        opts.map(o => `<option value="${o.i}">${o.label}${o.n > 1 ? ' ×' + o.n : ''}</option>`).join('');
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
    hint.textContent = b.epilogueTrial ? 'IF 후일담 시험전: 수동·자동 도구 사용 불가 · 본전역 소모/성장/전투보상 없음' : '자동전투: HP 40% 미만 아군은 HP 회복 도구 1개를 자동 사용합니다(그 유닛의 행동 소비 · HP 도구만)';
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
    this.selected = null; this.moveTiles = []; this.showUnitInfo(null); this.renderBattle(); // 선택 해제 시 카드도 닫아 전장 크기 복귀
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
      row.innerHTML = `<span class="td-txt">${row.innerHTML}</span>`; // flex 행에서 텍스트 조각이 개별 아이템으로 쪼개져 단어 중간 줄바꿈되는 것 방지
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
      hintEl.textContent = `대상 선택 — 타일 수치는 비회심 범위(회심 시 표시의 ×1.5) · 회심률 ${critPct}% · 반격은 조건부일 수 있음 · ▲상성우세/▼열세 ×1.15/×0.85`;
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
    if (this.battle && this.battle.epilogueTrial) { this.log('후일담 시험전에서는 도구를 쓰지 않습니다. 본전역 소지품은 보존됩니다.'); this.closeMenu(); this.menuFor = null; return; }
    const m = document.getElementById('action-menu');
    m.innerHTML = '';
    const usable = this.inventory.map((it, i) => ({ ...it, idx: i })).filter(it => ITEMS[it.id].use && !ITEMS[it.id].use.promo);
    if (!usable.length) { this.log('사용할 도구가 없습니다.'); this.closeMenu(); this.menuFor = null; return; }
    // 같은 도구는 개수로 묶어 표시 — 종류별 중복 버튼 나열로 메뉴가 전장 밖까지 넘치는 것 방지
    const groups = [];
    for (const it of usable) {
      const g = groups.find(g => g.id === it.id);
      if (g) g.count++; else groups.push({ ...it, count: 1 });
    }
    for (const it of groups) {
      const btn = document.createElement('button');
      const use = ITEMS[it.id].use;
      const eff = use.hp ? `HP ${use.hp} 회복` : use.mp ? `MP ${use.mp} 회복` : '';
      let effTxt = eff;
      // 실수 소모 방지: 모든 효과가 회복이고 해당 수치가 이미 가득 차 있으면 비활성 (부가 효과가 있는 도구는 차단하지 않음)
      const recovOnly = Object.keys(use).every(k => k === 'hp' || k === 'mp');
      const hpNeedless = use.hp && u.hp >= u.maxHp;
      const mpNeedless = use.mp && u.mp >= u.maxMp;
      if (recovOnly && ((use.hp && !use.mp && hpNeedless) || (use.mp && !use.hp && mpNeedless) || (use.hp && use.mp && hpNeedless && mpNeedless))) {
        btn.disabled = true;
        effTxt = (eff ? eff + ' · ' : '') + '회복 불필요';
      }
      btn.innerHTML = `${ITEMS[it.id].name} ×${it.count}` + (effTxt ? `<br><span class="im-eff">${effTxt}</span>` : '');
      btn.onclick = () => {
        this.inventory.splice(it.idx, 1);
        this.battle.useItem(u, it.id, u);
        u.done = true;
        this.closeMenu(); this.menuFor = null; this.restoreMenuButtons();
        this.log(this.battle.log[this.battle.log.length - 1]);
        this.renderBattle(); this.showUnitInfo(u); this.afterAction(); // 카드 HP/MP도 즉시 갱신
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
    if (this.battle !== b || b._finished) return;
    for (const e of b.alive('enemy')) {
      if (b.over) break;
      const before = this.snapshotHp();
      b.aiAct(e);
      this.diffHp(before);
      const last = b.log[b.log.length - 1];
      if (last && last !== this._lastLogged) { this.log(last); this._lastLogged = last; }
      this.renderBattle();
      await this.delay(160);
      if (this.battle !== b || b._finished) return;
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
    if (!b || b._autoRunning) return;
    b._autoRunning = true;
    try {
    this.cancelTargeting();
    while (!b.over && this.auto && this.battle === b) {
      // 플레이어 페이즈 자동
      for (const u of b.alive('player')) {
        if (b.over || !this.auto || this.battle !== b) break;
        if (u.done) continue;
        const before = this.snapshotHp();
        b.aiAct(u);
        this.diffHp(before);
        u.done = true;
        const last = b.log[b.log.length - 1];
        if (last && last !== this._lastLogged) { this.log(last); this._lastLogged = last; }
        this.renderBattle();
        await this.delay(this.fast ? 20 : 120);
        if (this.battle !== b || b._finished) return;
      }
      if (b.over || !this.auto || this.battle !== b) break;
      await this.runEnemyPhase();
      if (this.battle !== b || b._finished) return;
      if (this.turnGuard++ > 200) break;
    }
    if (b.over && this.battle === b) this.finishBattle();
    } finally { b._autoRunning = false; }
  },
  turnGuard: 0,

  finishBattle() {
    const b = this.battle;
    if (!b || !b.over || b._finished) return; // 중복 호출 가드 (자동전투 적 페이즈 종료 시 autoLoop 경유 이중 호출 방지)
    b._finished = true;
    this.log(b.over.reason);
    if (b.epilogueTrial) { this.finishEpilogue(b); return; }
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
      this.records.deaths = (this.records.deaths || 0) + deadCnt; // 이번 회차 누적 전사자 — 완주 엔딩 분기(성과) 판정용. 구 세이브(필드 없음)는 0 취급
      // 클리어 등급(다회차 장치 뼈대, 명예 전용·보상 없음): S=무사망+신속목표 내, A=무사망 또는 신속목표 내, B=사망 2 이하, C=그 외
      if (!this.records.grades) this.records.grades = {};
      const fwT = b.stage.fastWin ? b.stage.fastWin.turns : null;
      // 신속 완주 축 회차별 누적: 이번 회차의 신속 목표 내 승리만 기록(역대 최고 기록과 무관하게 현재 회차 실제 승리로 판정)
      if (!this.records.swiftThis || this.records.swiftThis.c !== this.cycle) this.records.swiftThis = { c: this.cycle, ids: {} };
      if (fwT != null && b.turn <= fwT) this.records.swiftThis.ids[sidRec] = 1;
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
          `${b.over.reason}<br><span class="dim">턴 ${Math.min(b.turn, b.stage.maxTurns)}/${b.stage.maxTurns} · 격파 ${b.foeKills.length} · 생존: ${surv}</span><br>` +
          `<b>클리어 등급 ${b.clearGrade}</b> <span class="dim">(무사망+신속 S · S 달성은 업적 해금 조건)</span><br>` +
          ((b.newAch && b.newAch.length) ? `<b>업적 달성: ${b.newAch.map(a => a.name).join(', ')}</b><br>` : '') +
          `보상: ${goldGain}골드 · ${r.items.map(i => ITEMS[i].name).join(', ') || '없음'} · 경험치 ${r.exp}` + lootText + fastText + dropText;
        this.show('screen-result');
      }, this.auto ? 100 : 800);
    } else {
      // 패배 이력(회차별): '패퇴 후 재기' 엔딩 판정의 근거 — 본전역 전투만 기록(IF 후일담 시험전은 위에서 분기). 보상·승리 집계와 무관한 기록 추가로 기존 판정 불변
      const drc = (this.records ||= {});
      if (!drc.defeats || drc.defeats.c !== this.cycle) drc.defeats = { c: this.cycle, n: 0, ids: [] };
      drc.defeats.n++; if (!drc.defeats.ids.includes(b.stage.id)) drc.defeats.ids.push(b.stage.id);
      this.save();
      setTimeout(() => {
        document.getElementById('result-title').textContent = '패배...';
        document.getElementById('btn-retry').style.display = '';
        document.getElementById('result-text').innerHTML =
          `${b.over.reason}<br><span class="dim">턴 ${Math.min(b.turn, b.stage.maxTurns)}/${b.stage.maxTurns} · 격파 ${b.foeKills.length}</span><br>다시 도전하세요.`;
        document.getElementById('btn-result-next').textContent = '브리핑으로 돌아가기';
        this.show('screen-result');
      }, this.auto ? 100 : 800);
    }
  },

  // 선택형 IF 후일담: 본전역을 복원하지 않는다. 복제 군단으로 만든 시험전만 폐기한다.
  startEpilogue() {
    if (this.stageIndex !== this.stages().length || !this.armyComplete(this.army)) return;
    if (this.battle && this.battle.epilogueTrial && !this.battle._finished && !this.battle.over) return;
    if (!this.epilogue || this.epilogue.c !== this.cycle || this.epilogue.status !== 'ready') return;
    const base = this.stages()[this.stages().length - 1]; // 세력 전역의 마지막 전투 (유비군 = 제9전 · 조조군 = 제4전)
    const isLiu=this.factionId==='liu';
    let stage;
    if (isLiu) stage = { ...base, id: base.id, trialId: 101, name: 'IF 후일담 · 하비의 탈출로', // stage.id는 본전역 마지막 전투(⑨) 유지 — 적 레벨 앵커 폭주(id 101→레벨101 실측 붕괴) 방지, 구 engine 혼합 캐시에서도 동일 계산
      briefing: '오리지널 가상 후일담: 여포 격파 뒤 남겨진 백성을 호위하기 위해 유비군이 다시 성문으로 향한다. 흩어진 잔군을 제압하고 탈출로를 연다. 실제 역사 재현이 아닌 이 게임의 가상 선택이다.',
      victory: '잔군 전멸', defeat: '유비 전사 또는 턴 초과', bossChar: null, bossDrop: null,
      treasure: null, fastWin: null, rewards: { gold:0, items:[], exp:0 },
      enemies: [ { char:'lu_elite',x:10,y:4,ai:'aggressive'},{char:'lu_soldier',x:10,y:3,ai:'aggressive'},
        {char:'lu_soldier',x:10,y:7,ai:'aggressive'},{char:'lu_archer',x:11,y:2,ai:'hold'} ],
    };
    else { // 조조군 후일담 '원소 추격' — 엔딩 기록(무결/신속)에 따라 브리핑 문구만 분기(난도·보상 동일). 원소 격파는 가상: 실제로는 관도 패전 후 도주·수습 뒤 202년 병사
      const eh=(this.endingHistory||{})[this.cycle];
      const perf=eh&&eh.id==='flawless'&&eh.swift?'무결·신속으로 관도를 끝낸 군단':(eh&&(eh.id==='flawless'||eh.swift)?'완주의 기세로 관도를 끝낸 군단':'관도의 승리를 거둔 군단');
      stage = { ...base, id: base.id, trialId: 102, name: 'IF 후일담 · 원소 추격', // stage.id는 ④ 유지(위와 동일)
      briefing: `오리지널 가상 후일담: ${perf}이 도주하는 원소를 쫓는다. 퇴로를 지키는 잔당을 뿌리치고 원소를 사로잡아 전역을 완결하라. 실제 역사 재현이 아닌 이 게임의 가상 선택이다.`,
      victory: '원소 격파', defeat: '조조 전사 또는 턴 초과', bossChar: 'yuan_shao', bossDrop: null,
      treasure: null, fastWin: null, rewards: { gold:0, items:[], exp:0 },
      enemies: [ { char:'yuan_soldier',x:7,y:2,ai:'aggressive'},{char:'yuan_soldier',x:7,y:7,ai:'aggressive'}, // 선봉 보병(④ 예비대 재사용): 조조 경로가 친위병보다 선봉을 먼저 잡도록
        {char:'yuan_elite',x:9,y:4,ai:'hold',holdUntil:3}, // 시험전은 autoItem 무효(무소모 규칙)라 ④ 친위병 2기 편성은 힐 없는 종단 군단이 감당 불가(실측 3~4턴 조조 격파) → 1기로 축소
        {char:'yuan_archer',x:11,y:2,ai:'hold'},{char:'yuan_shao',x:12,y:4,boss:true,ai:'hold',holdUntil:5} ],
    }; }
    const trialArmy = JSON.parse(JSON.stringify(this.army));
    this.battle = new Battle(stage, trialArmy, this.cycle);
    this.battle.epilogueTrial = true;
    this.battle.weather = null; this.battle.pendingReinforce = null; this.battle.defense = null;
    this.battle.autoItem = () => false;
    this.turnGuard = 0; this.selected = null; this.moveTiles = [];
    this.restoreMenuButtons(); this.show('screen-battle'); this.setupCanvas(); this.renderBattle(); this.updateHud();
    document.getElementById('battle-log').innerHTML = '';
    this.log(stage.briefing); this.log('소모 없는 별도 시험전: 도구 사용 불가. 본전역 성장·장비·재화·업적은 바뀌지 않습니다.');
    this.showBanner('IF 후일담 · 소모 없는 시험전 · 아군 턴 1');
    let exit = document.getElementById('epilogue-exit');
    if (!exit) { exit=document.createElement('button');exit.id='epilogue-exit';document.getElementById('screen-battle').appendChild(exit); }
    exit.textContent='후일담 중단 (소모 없음)';exit.style.display='';
    exit.onclick=()=>{ const b=this.battle; if(!b.epilogueTrial || b._finished)return; b.over={win:false,reason:'후일담 중단'};this.finishBattle(); };
    if (this.auto) this.autoLoop();
  },
  finishEpilogue(b) {
    const exit=document.getElementById('epilogue-exit');if(exit)exit.style.display='none';
    // 승리 일반분기의 드랍/경험치/기록/상점회전/군단반영을 전혀 호출하지 않는다.
    const won=!!b.over.win;
    this.epilogue={c:this.cycle,id:(this.epilogue&&this.epilogue.id)||'escape',status:won?'cleared':'ready',last:won?'승리':b.over.reason}; // 시험전 id 보존(세력별 이력 분리) — 미보유 구 세이브만 escape 폴백
    if(won) { this.epilogueHistory=this.epilogueHistory||{};this.epilogueHistory[this.cycle]={id:(this.epilogue&&this.epilogue.id)||'escape',turn:b.turn}; }
    this.save();
    document.getElementById('result-title').textContent=won?'IF 후일담 완주':'IF 후일담 종료';
    const isYuanHunt=((this.epilogue&&this.epilogue.id)||'escape')==='yuan_hunt';
    document.getElementById('result-text').textContent=won
      ? (isYuanHunt
        ? '원소를 사로잡은 조조군이 전역의 마침표를 찍었다. (오리지널 가상 엔딩: 실제로 원소는 관도 패전 후 도주해 202년에 병사) 보상·경험치·도구 소모 없음. 별도 후일담 기록만 저장합니다.'
        : '탈출로가 열리고 백성들이 성을 빠져나갔다. 유비군은 정복보다 구원을 택한 기억을 남겼다. (오리지널 가상 엔딩) 보상·경험치·도구 소모 없음. 별도 후일담 기록만 저장합니다.')
      : b.over.reason+' · 본전역은 변하지 않았습니다. 재도전하거나 공통 전역 완주로 마칠 수 있습니다. 보상·경험치·도구 소모 없음.';
    document.getElementById('btn-retry').style.display=won?'none':'';
    document.getElementById('btn-result-next').textContent='완주 화면으로';
    this.show('screen-result');
  },
  renderComplete() {
    const nc = document.getElementById('btn-next-cycle');
    const isLiu = this.factionId === 'liu';
    if (nc) { nc.disabled = false; nc.textContent = '다음 회차 시작 (미완주 후일담 생략)'; }
    const current=this.epilogue&&this.epilogue.c===this.cycle?this.epilogue:null;
    const cleared=current&&current.status==='cleared';
    const lastName = this.stages()[this.stages().length - 1].name.split('·')[1].trim(); // 유비도 2부 연장 시엔 마지막 전투명(장판)을 엔딩 문구에 사용 — 미연장 유비는 기존 '하비' 문구 유지
    const EPI_LABEL={escape:'하비의 탈출로',yuan_hunt:'원소 추격'}; // 후일담 시험전 표시명 — 세력별 시험전(유비 escape/조조 yuan_hunt)
    document.getElementById('complete-title').textContent = `${this.cycle}회차 클리어!`;
    document.getElementById('complete-text').textContent =
      `${this.stages().length}개 공통 전투를 모두 클리어했습니다. 군단·장비·소지품을 유지한 채 ${this.cycle + 1}회차를 시작할 수 있습니다.`
      +(cleared?` IF 후일담 완주: ${current.id==='yuan_hunt'?'원소를 사로잡은':'백성의 탈출로를 연'} 가상 엔딩을 별도 기록했습니다.`:` 공통 전역 엔딩: ${isLiu && !this.hasRoute('liu_p2') ? '하비' : lastName}의 싸움이 끝나고 군단은 다음 여정을 준비합니다.`);
    // 성과 기반 엔딩 분기 첫 단계: 이번 회차 누적 전사자 0이면 무결 완주 — 세력 전역 엔딩 이력에 기록(분기 엔딩의 기초)
    // 엔딩 기록: 이번 회차 누적 전사자 0이면 무결 — 단, 같은 회차에 이미 기록된 엔딩은 보존(전역 확장으로 추가된 전투를 이어가도 완료 시점에 사용자에게 표시된 기존 엔딩을 덮어쓰지 않음). deaths 미상(구 세이브)은 통상 완주 폴백 — 무결을 미검증으로 주장하지 않음
    (this.endingHistory ||= {});
    const prev = this.endingHistory[this.cycle];
    if (prev && prev.id) {
    // 이전 완주 기록 보유 시 '보존' 표시: 같은 회차에 완주 화면이 두 번 뜨는 경우(1부 완주 → 2부 연장 → 재완주, 또는 확장 전 완주 세이브 이어하기) 첫 표시에서 기록된 엔딩을 이후 추가 전투 결과로 덮어쓰지 않는 정책 — 자연 주행에서도 정상 도달하는 경로
      document.getElementById('complete-text').textContent += ` 엔딩 기록: 이전 완주의 ${prev.id === 'flawless' ? '무결 완주' : '통상 완주'} 기록 보존 — 이후 추가된 전투를 포함한 이번 완주 결과로는 변경하지 않습니다.`; // 세력 공통 일반 문구 — 확장 시점 하드코딩(제3전/제4전)은 2부 연장 뒤 낡은 서술이 되어 폐기
    } else {
      const endingId = (typeof this.records.deaths === 'number' && this.records.deaths === 0) ? 'flawless' : 'standard';
      const allFw = this.stages().every(st => !!st.fastWin); // 신속 목표가 정의되지 않은 전투가 있는 세력은 신속 축 비활성(미주장)
      const swiftNow = allFw && !!(this.records.swiftThis && this.records.swiftThis.c === this.cycle) && this.stages().every(st => this.records.swiftThis.ids[st.id]);
      const comeback = !!(this.records.defeats && this.records.defeats.c === this.cycle && this.records.defeats.n > 0); // 패퇴 후 재기: 이번 회차 실제 패배 후 재도전으로 완주한 경우에만(first-wins — 보존 분기는 갱신하지 않음)
      this.endingHistory[this.cycle] = { faction: this.factionId, id: endingId, swift: swiftNow, comeback };
      this.save();
      document.getElementById('complete-text').textContent += endingId === 'flawless' ? ' 엔딩 기록: 무결 완주(승리한 전투에서 전사자 0 · 패배/재도전 전투는 집계하지 않음).' : ' 엔딩 기록: 통상 완주.';
      if (swiftNow) document.getElementById('complete-text').textContent += ' 신속 완주 달성(이번 회차 모든 전투를 신속 목표 턴 내 승리 · 재도전 후 승리도 인정, 패배한 전투의 턴은 집계하지 않음).';
      if (comeback) document.getElementById('complete-text').textContent += ' 패퇴 후 재기(이번 회차 패배 후 재도전으로 완주).';
    }
    // 장별 루트 기록(회차별 합집합): 실제 완주 화면 도달로만 기록 — '통일'은 최종 루트 미구현으로 기록하지 않음. 보존 분기에서도 누적(1부 완주 → 2부 재완주 시 2부 추가)
    const cm = (this.clearMarks ||= {}); const cur = (cm[this.cycle] ||= []);
    const addMark = id => { if (!cur.includes(id)) cur.push(id); };
    addMark(this.factionId + '_p1');
    if (this.hasRoute(this.factionId + '_p2')) addMark(this.factionId + '_p2');
    this.save();
    document.getElementById('complete-text').textContent += ' 루트 기록: ' + cur.map(m => m.endsWith('_p2') ? '2부' : '1부').join('·') + ' 완주.';
    // 2부 연장 선택(세력 공통): 미언락(route '<세력>_p2' 없음) 완주 화면에만 노출 — 명시 선택 시에만 2부가 stages에 결합되고, 미선택 세이브는 1부 완주 의미·엔딩 기록이 그대로 유지됨. 후일담과 무관한 별도 선택
    const P2 = isLiu
      ? { def: (typeof LIU_STAGES2 !== 'undefined' ? LIU_STAGES2 : null), btn: '형주의 시련 계속 · 2부 (제10전 박망파 ~ 제11전 장판)',
          note: '정사 실재 전투 2종(박망파 · 장판 208). 박망파의 화계는 유비의 위장퇴각 계책(정사)이며 제갈량 지휘 화공은 연의 창작, 장판의 후퇴로 확보 승리조건은 게임 각색입니다. 계속해도 기존 완주·엔딩 기록은 보존됩니다.' }
      : { def: (typeof CAO_STAGES2 !== 'undefined' ? CAO_STAGES2 : null), btn: '북방 원정 계속 · 2부 (제5전 업 포위 ~ 제6전 백랑산)',
          note: '정사 실재 전투 2종(업 포위전 204 · 백랑산 결전 207). 편성·승리조건·증원 시점 등은 게임 각색입니다. 계속해도 기존 완주·엔딩 기록은 보존됩니다.' };
    const p2id = this.factionId + '_p2';
    const p2existing = document.getElementById('cao-part2-choice');
    if (this.stageIndex === this.stages().length && P2.def && P2.def.length && !this.hasRoute(p2id)) {
      let p2 = p2existing;
      if (!p2) { p2 = document.createElement('div'); p2.id = 'cao-part2-choice'; document.getElementById('complete-text').after(p2); }
      p2.style.display = '';
      p2.innerHTML = '';
      const n2 = document.createElement('p'); n2.className = 'dim';
      n2.textContent = P2.note;
      p2.appendChild(n2);
      const b2 = document.createElement('button'); b2.id = 'btn-cao-part2'; b2.textContent = P2.btn;
      b2.onclick = () => { if (this.hasRoute(p2id)) return; this.route.push({ c: this.cycle, id: p2id }); this.save(); this.renderBriefing(); }; // 중복 클릭·잔재 호출 안전: route 중복 push는 화면 숨김이 아니라 핸들러에서 방지
      p2.appendChild(b2);
    } else if (p2existing) p2existing.style.display = 'none'; // 언락 후 재완주·미대상 화면에서는 이전 렌더 잔재 숨김 — 중복 언락 버튼 노출·route 중복 push 방지
    // 선택형 IF 후일담 패널은 양 세력 공통 — 시험전 내용만 세력별(유비 하비의 탈출로 / 조조 원소 추격)
    let panel=document.getElementById('epilogue-choice');
    if(!panel){panel=document.createElement('div');panel.id='epilogue-choice';document.getElementById('complete-text').after(panel);}
    panel.innerHTML='';
    const note=document.createElement('p');note.className='dim';
    note.textContent=`선택형 IF 후일담 첫 단계(가상 설정). 소모 없는 별도 시험전: 군단은 복제본으로 출전하고 도구는 수동·자동 모두 사용 불가. 승리·실패·중단·재도전은 본전역의 골드·소지품·장비·경험치·${this.stages().length}전 기록·업적·상점회전을 바꾸지 않습니다. 전투 중 새로고침하면 전투는 저장되지 않아 처음부터 재도전합니다. 다음 회차 시작은 미완주 후일담을 생략합니다.`;
    panel.appendChild(note);
    if(!cleared){
      const trialId=isLiu?'escape':'yuan_hunt';
      const begin=document.createElement('button');begin.id='btn-epilogue';begin.textContent=current&&current.status==='ready'?'IF 후일담 재도전':`IF 후일담 선택 · ${EPI_LABEL[trialId]}`;
      begin.onclick=()=>{if(this.stageIndex!==this.stages().length)return;this.epilogue={c:this.cycle,id:trialId,status:'ready'};this.save();this.startEpilogue();};panel.appendChild(begin);
    }
    const history=this.epilogueHistory||{};const cycles=Object.keys(history);
    if(cycles.length){const h=document.createElement('p');h.textContent='별도 후일담 완주 기록: '+cycles.map(c=>c+'회차 '+(EPI_LABEL[history[c].id]||'후일담')+' '+history[c].turn+'턴').join(' / ');panel.appendChild(h);}
    this.show('screen-complete');
  },
};
