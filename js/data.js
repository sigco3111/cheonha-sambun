// 천하삼분(가칭) - 데이터 정의. 전부 오리지널 수치.
'use strict';

const TERRAIN = {
  plain:     { name: '평지',   def: 0,  heal: 0,   costs: { infantry:1, cavalry:1, archer:1, strategist:1, navy:2 } },
  grass:     { name: '초원',   def: 5,  heal: 0,   costs: { infantry:1, cavalry:1, archer:1, strategist:1, navy:2 } },
  forest:    { name: '숲',     def: 15, heal: 0,   costs: { infantry:2, cavalry:3, archer:2, strategist:2, navy:3 } },
  mountain:  { name: '산',     def: 20, heal: 0,   costs: { infantry:3, cavalry:-1, archer:3, strategist:3, navy:-1 } },
  river:     { name: '강',     def: 0,  heal: 0,   costs: { infantry:4, cavalry:-1, archer:4, strategist:4, navy:1 } },
  bridge:    { name: '다리',   def: 5,  heal: 0,   costs: { infantry:1, cavalry:1, archer:1, strategist:1, navy:1 } },
  swamp:     { name: '습지',   def: -5, heal: 0,   costs: { infantry:3, cavalry:4, archer:3, strategist:3, navy:1 } },
  wasteland: { name: '황무지', def: 5,  heal: 0,   costs: { infantry:2, cavalry:2, archer:2, strategist:2, navy:3 } },
  castle:    { name: '성내',   def: 20, heal: 0.1, costs: { infantry:1, cavalry:2, archer:1, strategist:1, navy:3 } },
  wall:      { name: '성벽',   def: 0,  heal: 0,   costs: { infantry:-1, cavalry:-1, archer:-1, strategist:-1, navy:-1 } },
  gate:      { name: '관문',   def: 15, heal: 0,   costs: { infantry:1, cavalry:1, archer:1, strategist:1, navy:2 } },
  village:   { name: '마을',   def: 10, heal: 0.2, costs: { infantry:1, cavalry:1, archer:1, strategist:1, navy:2 } },
  barracks:  { name: '병영',   def: 10, heal: 0.2, costs: { infantry:1, cavalry:1, archer:1, strategist:1, navy:2 } },
  treasure:  { name: '보물창고', def: 10, heal: 0, costs: { infantry:1, cavalry:1, archer:1, strategist:1, navy:2 } },
};

const CLASSES = {
  infantry:   { name: '단병',   cat: 'infantry',   move: 4, rMin: 1, rMax: 1, counter: true,  promoTo: 'infantry2',   promoLevel: 10, sprite: 'infantry' },
  infantry2:  { name: '장병',   cat: 'infantry',   move: 4, rMin: 1, rMax: 1, counter: true,  promoTo: 'infantry3', promoAlt: 'infantry3b', promoLevel: 20, sprite: 'infantry' },
  infantry3:  { name: '근위병', cat: 'infantry',   move: 4, rMin: 1, rMax: 1, counter: true,  promoTo: null, sprite: 'infantry' },
  cavalry:    { name: '경기병', cat: 'cavalry',    move: 6, rMin: 1, rMax: 1, counter: true,  promoTo: 'cavalry2',    promoLevel: 10, sprite: 'cavalry' },
  cavalry2:   { name: '중기병', cat: 'cavalry',    move: 6, rMin: 1, rMax: 1, counter: true,  promoTo: 'cavalry3', promoAlt: 'cavalry3b', promoLevel: 20, sprite: 'cavalry' },
  cavalry3:   { name: '정예기병', cat: 'cavalry',  move: 6, rMin: 1, rMax: 1, counter: true,  promoTo: null, sprite: 'cavalry' },
  archer:     { name: '궁수',   cat: 'archer',     move: 4, rMin: 2, rMax: 3, counter: false, promoTo: 'archer2',     promoLevel: 10, sprite: 'archer' },
  archer2:    { name: '장궁병', cat: 'archer',     move: 4, rMin: 2, rMax: 4, counter: false, promoTo: 'archer3', promoAlt: 'archer3b', promoLevel: 20, sprite: 'archer' },
  archer3:    { name: '연노병', cat: 'archer',     move: 4, rMin: 2, rMax: 4, counter: false, promoTo: null, sprite: 'archer' },
  strategist: { name: '모사',   cat: 'strategist', move: 4, rMin: 1, rMax: 2, counter: false, promoTo: 'strategist2', promoLevel: 10, sprite: 'strategist' },
  strategist2:{ name: '군사',   cat: 'strategist', move: 4, rMin: 1, rMax: 2, counter: false, promoTo: 'strategist3', promoLevel: 20, sprite: 'strategist' },
  strategist3:{ name: '책사',   cat: 'strategist', move: 4, rMin: 1, rMax: 2, counter: false, promoTo: null, sprite: 'strategist' },
  // 수군(3막 적벽~): 강 비용 1의 수상 특화 궁병 계열. 상성표(MATCHUP)에 없어 중립. 전직 없음.
  navy:       { name: '수군',   cat: 'navy',       move: 5, rMin: 2, rMax: 3, counter: false, promoTo: null, sprite: 'navy' },
  // 3단계 분기 전직(보병·기병·궁병): promoBonus 없는 클래스는 PROMO_BONUS_DEFAULT 적용.
  // 롤백 구조: 이 클래스 정의들은 영구 유지(기존 저장의 cls 참조 보존). 롤백은 promoTo 단일화로 선택지만 닫는다.
  infantry3b: { name: '돌격병', cat: 'infantry',   move: 4, rMin: 1, rMax: 1, counter: true,  promoTo: null, promoBonus: { atk: 6, def: 1, hp: 14, mp: 3 }, sprite: 'infantry' },
  cavalry3b:  { name: '철기병', cat: 'cavalry',    move: 6, rMin: 1, rMax: 1, counter: true,  promoTo: null, promoBonus: { atk: 1, def: 6, hp: 16, mp: 3 }, sprite: 'cavalry' },
  archer3b:   { name: '대궁수', cat: 'archer',     move: 3, rMin: 2, rMax: 5, counter: false, promoTo: null, promoBonus: { atk: 4, def: 0, hp: 0, mp: 0 }, sprite: 'archer' },
};

const PROMO_BONUS_DEFAULT = { atk: 3, def: 3, hp: 10, mp: 5 };
// 전직 선택지: 문자열|배열 모두 허용(하위호환)
// 회차 시작 자원 해금: 업적이 회차 시작 시 소규모 자원을 해금(원기획 "클리어 등급과 업적이 숨겨진 장수·병종·시작 자원을 해금"). 회차당 1회(bonusCycle 이력). 누락 시 다음 브리핑에서 1회 보완하며 보완 시점 업적 기준.
const ACH_START_BONUS = {
  nine:     { gold: 500 },                                  // 아홉 전투 정복
  flawless: { items: ['bean', 'bean'] },                    // 불사의 군단
  smith:    { items: ['ore', 'ore', 'ore', 'ore', 'ore'] }, // 대장의 손길
};
function startBonusFor(ach) { // 해금된 업적 -> 이번 회차 시작 보상 목록(라벨 포함)
  const out = [];
  for (const id of Object.keys(ACH_START_BONUS)) {
    if (!ach || !ach[id]) continue;
    const b = ACH_START_BONUS[id];
    if (b.gold) out.push({ gold: b.gold, label: `골드 +${b.gold}` });
    if (b.items) {
      const cnt = {};
      for (const it of b.items) cnt[it] = (cnt[it] || 0) + 1;
      out.push({ items: b.items, label: Object.keys(cnt).map(k => `${ITEMS[k].name} ×${cnt[k]}`).join('·') });
    }
  }
  return out;
}

function promoOptions(clsId) { const c = CLASSES[clsId]; if (!c) return []; const p = c.promoTo; const base = p ? (Array.isArray(p) ? p : [p]) : []; if (c.promoAlt) base.push(c.promoAlt); return base; } // promoTo는 구 ui 호환용 문자열 유지, promoAlt는 신 ui 전용 분기

// 전투 변형(날씨): 2회차부터 결정론 배정 — 같은 회차·같은 전투는 항상 같은 날씨, 저장 없이 파생
function weatherFor(stageId, cycle) { return (cycle >= 2 && (stageId + cycle) % 3 === 0) ? 'rain' : null; }
const WEATHER = { rain: { name: '비', note: '화계 불가 · 궁병 사거리 -1(양측)' } };
// 전투 변형(증원): 2회차부터 일부 전투(v1: 제2·8·9전)에 지정 턴 적 증원 출현 — 날씨(%3==0)와 회전 배정해 전투당 변형 최대 1종, 결정론(저장 추가 없음)
// 세력별 테이블: 스테이지 id가 세력 간에 겹치므로(유비 1-9·조조 1-3) 세력 키로 분리 — 공용 의도 항목만 같은 좌표를 세력별로 복제
const REINFORCEMENTS = {
  liu: {
    2: { atTurn: 3, dir: '동쪽', units: [ { char: 'soldier_i', x: 11, y: 3 }, { char: 'soldier_i', x: 11, y: 5 } ] },
    8: { atTurn: 3, dir: '동쪽', units: [ { char: 'soldier_i', x: 11, y: 3 }, { char: 'soldier_i', x: 12, y: 3 } ] },
    9: { atTurn: 4, dir: '남동쪽', units: [ { char: 'lu_soldier', x: 11, y: 6 }, { char: 'lu_soldier', x: 12, y: 6 } ] },
  },
  cao: { // 조조 ② 연주 탈환: 여포군 측 증원 — 유비 테이블의 soldier_i(황건/잡병)를 섞지 않는다
    2: { atTurn: 3, dir: '동쪽', units: [ { char: 'lu_soldier', x: 11, y: 3 }, { char: 'lu_soldier', x: 11, y: 5 } ] },
    4: { atTurn: 4, dir: '동쪽', units: [ { char: 'yuan_soldier', x: 12, y: 2 }, { char: 'yuan_soldier', x: 12, y: 5 } ] }, // 조조 ④ 관도: 원소군 예비대
  },
};
REINFORCEMENTS[2] = REINFORCEMENTS.liu[2]; REINFORCEMENTS[8] = REINFORCEMENTS.liu[8]; REINFORCEMENTS[9] = REINFORCEMENTS.liu[9]; // 구 엔진 호환 별칭: 구 engine이 REINFORCEMENTS[id]를 직접 읽어도 유비 항목으로 안전 동작(같은 객체 참조 — 이중 관리 아님). 신 엔진은 세력 네임스페이스만 읽는다
function reinforceFor(stageId, cycle, faction) {
  if (cycle < 2 || (stageId + cycle) % 3 !== 1) return null; // 비는 %3==0, 변형 없음은 %3==2
  const table = REINFORCEMENTS[faction || 'liu'] || null; // 세력 테이블 없으면 변형 없음(유비 폴백 금지 — 타 세력 전장 오염 방지)
  return (table && table[stageId]) || null;
}
// 전투 변형(거점 사수): 2회차부터 일부 전투(v1: 제8·9전)에 방어 목표 — 적이 거점 타일을 점거하면 패배. 날씨(%3==0)·증원(%3==1)과 회전 배정해 전투당 변형 최대 1종, 결정론
const DEFENSE_POINTS = {
  liu: {
    8: { x: 1, y: 3, name: '서쪽 관문' },
    9: { x: 2, y: 2, name: '북쪽 마을' },
  },
  cao: {}, // 조조군은 공격측 전장이라 거점 사수 미적용 — 별도 설계 전까지 의도적 비움
};
function defenseFor(stageId, cycle, faction) {
  if (cycle < 2 || (stageId + cycle) % 3 !== 2) return null;
  const table = DEFENSE_POINTS[faction || 'liu'] || null;
  return (table && table[stageId]) || null;
}

// 전투 변형(배치 변주): 2회차부터 일부 전투(v1: 제3·5·7전)에 아군 초기 배치 변형 — 거점사수 슬롯(%3==2) 중 거점 미등록 전투에만 배정해 날씨(%3==0)·증원(%3==1)과 전투당 변형 최대 1종 유지, 결정론(저장 추가 없음)
// v1은 아군 좌표만 변형(적 배치·char 집합·commander 동일). 좌표는 전 병종 통과 가능 지형만 사용 — 선택 편성의 대체 장수 병종이 달라도 엔진이 유닛별 통행 가능·점유를 재확인하고 부적합 시 해당 유닛만 기존(v1) 좌표로 되돌림
const DEPLOY_VARIANTS = {
  liu: {
    3: [ { name: '북쪽 전개', players: { liu_bei: [1,3], guan_yu: [2,2], zhang_fei: [2,4], jian_yong: [0,3], sun_qian: [0,5], mi_zhu: [1,2] } } ],
    5: [ { name: '북쪽 전개', players: { liu_bei: [1,3], guan_yu: [2,2], zhang_fei: [2,4], jian_yong: [0,3], sun_qian: [0,5], mi_zhu: [1,2] } } ],
    7: [ { name: '남쪽 전개', players: { liu_bei: [1,6], guan_yu: [2,7], zhang_fei: [2,5], jian_yong: [1,5], sun_qian: [3,7], mi_zhu: [1,4] } } ],
  },
  cao: { // 조조 ③ 하비 포위: 남쪽 문 돌파 축의 전개 — 좌표는 조조 ③ 맵의 평지·연결성 기준(엔진이 통행·점유 재검증, 부적합 시 원본 폴백)
    3: [ { name: '남쪽 전개', players: { cao_cao: [1,6], xiahou_dun: [2,7], xiahou_yuan: [3,7], cao_ren: [1,7], yue_jin: [2,6], xun_yu: [1,5] } } ],
    4: [ { name: '북쪽 전개', players: { cao_cao: [1,2], xiahou_dun: [2,1], xiahou_yuan: [3,2], cao_ren: [1,1], yue_jin: [2,2], xun_yu: [1,3] } } ], // 조조 ④ 관도: 북쪽 다리 축 선점 — 좌표는 ④ 맵의 평지 기준
  },
};
function deployVarFor(stageId, cycle, faction) {
  if (cycle < 2 || (stageId + cycle) % 3 !== 2) return null; // 거점사수 슬롯
  const f = faction || 'liu';
  const dp = DEFENSE_POINTS[f] || {};
  if (dp[stageId]) return null; // 거점이 있는 전투는 거점사수 유지
  const vs = (DEPLOY_VARIANTS[f] || {})[stageId];
  return (vs && vs.length) ? vs[(stageId + cycle) % vs.length] : null;
}

const TACTICS = {
  fire:  { name: '화계', mp: 12, power: 45, range: 3, area: 1, kind: 'damage' },
  cheer: { name: '고무', mp: 8,  power: 20, range: 2, area: 1, kind: 'morale' },
  heal:  { name: '치유', mp: 10, power: 60, range: 2, area: 0, kind: 'heal' },
  intimidate: { name: '위협', mp: 15, power: 15, range: 2, area: 1, kind: 'demoralize' },
};

const ITEMS = {
  dagger:    { name: '단검',       slot: 'weapon', atk: 3,  price: 200,  maxUp: 5 },
  iron_sword:{ name: '철검',       slot: 'weapon', atk: 6,  price: 600,  maxUp: 5 },
  spear:     { name: '철창',       slot: 'weapon', atk: 7,  price: 800,  maxUp: 5 },
  bow:       { name: '장궁',       slot: 'weapon', atk: 6,  price: 600,  maxUp: 5 },
  fan:       { name: '책략부채',   slot: 'weapon', atk: 4,  price: 500,  maxUp: 5 },
  leather:   { name: '가죽 갑옷',  slot: 'armor',  def: 3,  price: 250,  maxUp: 5 },
  iron_armor:{ name: '철 갑옷',    slot: 'armor',  def: 6,  price: 700,  maxUp: 5 },
  jade:      { name: '옥패',       slot: 'acc',    morale: 10, price: 400, maxUp: 0 },
  scroll:    { name: '족자',       slot: 'acc',    mp: 10,  price: 400,  maxUp: 0 },
  amulet:    { name: '호신부',      slot: 'acc',    regen: 0.08, price: 600,  maxUp: 0 },
  heavy_blade:{ name: '중검',      slot: 'weapon', atk: 9, price: 1000, maxUp: 5 },
  famed_sword:{ name: '명검',      slot: 'weapon', atk: 5, morale: 10, price: 900, maxUp: 5 },
  plate:     { name: '판금 갑옷',  slot: 'armor',  def: 8, price: 950, maxUp: 5 },
  bean:      { name: '콩',         use: { hp: 30 },  price: 50 },
  rice:      { name: '쌀',         use: { hp: 80 },  price: 120 },
  meat:      { name: '고기',       use: { hp: 150 }, price: 250 },
  tonic:     { name: '각성제',     use: { mp: 30 },  price: 150 },
  manual:    { name: '전직 지침서', use: { promo: true }, price: 1000 },
  counter_blade:{ name: '백병도',  slot: 'weapon', atk: 5, counter: 0.25, price: 1200, maxUp: 5 },
  bulwark:   { name: '철벽갑',      slot: 'armor',  def: 4, tacDef: 0.3, price: 1100, maxUp: 5 },
  training_charm:{ name: '수련패',  slot: 'acc',    exp: 0.25, price: 900, maxUp: 0 },
  ore:       { name: '철광석',     material: true, price: 100 },
};

// 장수 정의 (성장 오리지널)
const CHARS = {
  liu_bei:  { name: '유비',   cls: 'infantry',   hp: 92, mp: 30, atk: 24, def: 20, int: 22, spd: 18, morale: 100, tactics: ['cheer'] },
  guan_yu:  { name: '관우',   cls: 'cavalry',    hp: 105, mp: 20, atk: 32, def: 24, int: 16, spd: 20, morale: 100 },
  zhang_fei:{ name: '장비',   cls: 'cavalry',    hp: 110, mp: 15, atk: 34, def: 22, int: 10, spd: 19, morale: 100, tactics: ['intimidate'] },
  jian_yong:{ name: '간옹',   cls: 'strategist', hp: 78, mp: 55, atk: 14, def: 15, int: 30, spd: 16, morale: 100, tactics: ['fire','heal'] },
  sun_qian: { name: '손건',   cls: 'archer',     hp: 84, mp: 25, atk: 26, def: 17, int: 18, spd: 22, morale: 100 },
  mi_zhu:   { name: '미축',   cls: 'strategist', hp: 76, mp: 50, atk: 13, def: 14, int: 28, spd: 15, morale: 100, tactics: ['heal','cheer'] },
  // 합류 장수(오리지널 IF 설정 — 실제 역사의 합류 전례가 아니라 이 게임의 가상 분기)
  guan_hai: { name: '관해', cls: 'infantry',   hp: 98, mp: 15, atk: 29, def: 21, int: 9,  spd: 18, morale: 95 },
  taishi_ci:{ name: '태사자', cls: 'archer',    hp: 86, mp: 15, atk: 29, def: 14, int: 10, spd: 24, morale: 90 }, // 손건과 교환관계: 공+3·속+2 vs 방-3·지-8·MP-10·사기-10(단순 상위호환 아님)
  zhou_cang:{ name: '주창', cls: 'cavalry',     hp: 100, mp: 20, atk: 30, def: 23, int: 14, spd: 22, morale: 95 }, // 장비와 교환관계: 방+1·지+4·속+3·MP+5 vs HP-10·공-4·사기-5(단순 상위호환 아님)
  // 조조군 (세력 슬라이스 — 스탯은 유비군 대응 초안, 균형 미검증. 지모·MP를 낮추고 물리 능력을 올린 방향)
  cao_cao:    { name: '조조',   cls: 'infantry',   hp: 95, mp: 35, atk: 24, def: 21, int: 24, spd: 17, morale: 100, tactics: ['intimidate'] },
  xiahou_dun: { name: '하후돈', cls: 'cavalry',    hp: 108, mp: 15, atk: 33, def: 23, int: 9,  spd: 21, morale: 100 },
  xiahou_yuan:{ name: '하후연', cls: 'cavalry',    hp: 100, mp: 15, atk: 31, def: 20, int: 11, spd: 23, morale: 100 },
  cao_ren:    { name: '조인',   cls: 'infantry',   hp: 100, mp: 20, atk: 23, def: 24, int: 14, spd: 16, morale: 100 },
  yue_jin:    { name: '악진',   cls: 'archer',     hp: 82, mp: 25, atk: 26, def: 16, int: 12, spd: 23, morale: 100 },
  xun_yu:     { name: '순욱',   cls: 'strategist', hp: 74, mp: 60, atk: 12, def: 13, int: 33, spd: 15, morale: 100, tactics: ['fire','heal'] },
  // 적 장수
  cheng:    { name: '정원지', cls: 'infantry',   hp: 95, mp: 10, atk: 25, def: 18, int: 8,  spd: 14, morale: 90 },
  deng:     { name: '등무',   cls: 'infantry',   hp: 88, mp: 10, atk: 22, def: 16, int: 8,  spd: 13, morale: 85 },
  pei:      { name: '배원소', cls: 'archer',     hp: 82, mp: 12, atk: 24, def: 15, int: 10, spd: 18, morale: 85 },
  zhang_jue:{ name: '장각',   cls: 'strategist', hp: 120, mp: 70, atk: 18, def: 20, int: 34, spd: 16, morale: 100, tactics: ['fire'] },
  hua_xiong:{ name: '화웅',   cls: 'cavalry',    hp: 135, mp: 15, atk: 36, def: 26, int: 10, spd: 22, morale: 100 },
  lu_bu:    { name: '여포',   cls: 'cavalry',    hp: 170, mp: 20, atk: 44, def: 30, int: 8,  spd: 26, morale: 100 },
  li_ru:    { name: '이유',   cls: 'strategist', hp: 85, mp: 60, atk: 15, def: 16, int: 32, spd: 15, morale: 95, tactics: ['fire','heal'] },
  dong_zhuo:{ name: '동탁',   cls: 'infantry',   hp: 200, mp: 20, atk: 42, def: 34, int: 12, spd: 10, morale: 100 },
  li_jue:   { name: '이각',   cls: 'cavalry',    hp: 120, mp: 10, atk: 34, def: 24, int: 8,  spd: 20, morale: 90 },
  guo_si:   { name: '곽사',   cls: 'archer',     hp: 95,  mp: 10, atk: 30, def: 18, int: 10, spd: 19, morale: 90 },
  soldier_i:{ name: '황건 보병', cls: 'infantry', hp: 70, mp: 5, atk: 19, def: 14, int: 5, spd: 12, morale: 80 },
  soldier_a:{ name: '황건 궁수', cls: 'archer',   hp: 62, mp: 5, atk: 20, def: 12, int: 5, spd: 14, morale: 80 },
  soldier_c:{ name: '동탁 기병', cls: 'cavalry',  hp: 85, mp: 5, atk: 25, def: 18, int: 5, spd: 17, morale: 85 },
  dong_elite:{ name: '동탁 친위병', cls: 'infantry', hp: 95, mp: 5, atk: 28, def: 22, int: 5, spd: 14, morale: 88 },
  chen_gong:{ name: '진궁',   cls: 'strategist', hp: 90, mp: 65, atk: 16, def: 17, int: 33, spd: 15, morale: 95, tactics: ['fire','heal'] },
  lu_bu_siege:{ name: '여포', cls: 'cavalry', hp: 150, mp: 20, atk: 36, def: 26, int: 8, spd: 26, morale: 85 }, // 하비 포위전 전용: 수공·장기 포위로 지친 상태(198 설정). 본래 스탯의 여포는 ②연주·유비 루트에서 그대로 사용
  lu_elite: { name: '여포 친위기병', cls: 'cavalry',  hp: 95, mp: 5, atk: 29, def: 21, int: 5, spd: 18, morale: 90 },
  lu_soldier:{ name: '여포군 보병', cls: 'infantry', hp: 78, mp: 5, atk: 23, def: 16, int: 5, spd: 14, morale: 85 },
  lu_archer:{ name: '여포군 궁수', cls: 'archer',   hp: 70, mp: 5, atk: 25, def: 14, int: 5, spd: 16, morale: 85 },
  yuan_shao:{ name: '원소', cls: 'infantry',   hp: 165, mp: 30, atk: 29, def: 24, int: 20, spd: 13, morale: 100, tactics: ['cheer'] }, // 명문 출신 총대장 설정 — 실측 보스 결전이 조조-원소 소모전(조조 타격 1-6/피격 16-27, 순욱 치유 의존)으로 변동성이 커 공·방 하향
  yan_liang:{ name: '안량', cls: 'cavalry',    hp: 135, mp: 10, atk: 35, def: 24, int: 8,  spd: 23, morale: 95 }, // 여포(44)·화웅(36) 아래의 강장 수치 — 39 초안은 문추와의 동시 집중 시 조조가 2-3라운드에 붕괴하는 실측 패턴
  wen_chou: { name: '문추', cls: 'cavalry',    hp: 130, mp: 10, atk: 34, def: 23, int: 8,  spd: 23, morale: 95 },
  ju_shou:  { name: '저수', cls: 'strategist', hp: 90,  mp: 65, atk: 16, def: 17, int: 34, spd: 15, morale: 95, tactics: ['heal'] }, // 관도 설정상 원소측 간언 참모 — 화계 일격에 지휘관이 무너지는 실측 패배 경로(저수 화계 70) 제거, 치유 지원형으로 보스전 지연
  yuan_elite:{ name: '원소 친위병', cls: 'infantry', hp: 100, mp: 5, atk: 30, def: 23, int: 5, spd: 14, morale: 90 },
  yuan_soldier:{ name: '원소군 보병', cls: 'infantry', hp: 82, mp: 5, atk: 24, def: 17, int: 5, spd: 14, morale: 85 },
  // ── 조조 2부 · 북방 평정(204~207): 정사 실재 인물(출처 ko.wikipedia 업_전투/백랑산_전투), 스탯은 기존 동급 장수 체계 — 기존 클래스 스프라이트 재사용으로 신규 아트 없음 ──
  shen_pei:  { name: '심배', cls: 'infantry',  hp: 185, mp: 10, atk: 36, def: 30, int: 20, spd: 13, morale: 95 }, // 5전 보스 — 정사상 업 성 수비 사령(성내 방어·회복 이점 위치 배치)
  yuan_shang:{ name: '원상', cls: 'cavalry',   hp: 120, mp: 10, atk: 31, def: 22, int: 12, spd: 21, morale: 90 }, // 업 구원군(정사상 구원 시도 실재, 시간차 합류는 게임 각색) — 백랑산 지휘관 명단에도 포함
  tadun:     { name: '답돈', cls: 'cavalry',   hp: 200, mp: 10, atk: 40, def: 24, int: 8,  spd: 24, morale: 95 }, // 6전 보스 — 오환 족장(정사)
  // ── 유비 2부 · 박망파(정사, 연대 미명기)/장판(208, 정사) — 정사 실재 인물, 스탯은 기존 동급 장수 체계 · 기존 스프라이트 재사용 ──
  xiahou_dun_bowang:{ name: '하후돈', cls: 'cavalry',  hp: 260, mp: 15, atk: 46, def: 28, int: 9,  spd: 22, morale: 95 }, // 10전 보스 — 정사상 유비의 복병에 진입해 패한 추격 지휘관(적 버전은 _bowang 접미, lu_bu_siege 패턴)
  yu_jin:   { name: '우금', cls: 'infantry',  hp: 190, mp: 10, atk: 38, def: 29, int: 12, spd: 14, morale: 90 }, // 박망파 하후돈과 동행(정사)
  li_dian:  { name: '이전', cls: 'infantry',  hp: 170, mp: 10, atk: 34, def: 27, int: 18, spd: 14, morale: 90 }, // 추격 만류 후 구원(정사) — 시간차 합류 시점은 각색
  cao_elite_c:{ name: '조조군 정예기병', cls: 'cavalry', hp: 150, mp: 5, atk: 40, def: 22, int: 5, spd: 23, morale: 90 }, // 장판 급습 추격대(정사상 정예 기병 5천의 게임 각색)
  cao_soldier:{ name: '조조군 보병', cls: 'infantry', hp: 120, mp: 5, atk: 30, def: 22, int: 5, spd: 14, morale: 85 }, // 유비 2부 — 10전에 황건 병종이 섞이던 표기 결함 수정
  cao_archer:{ name: '조조군 궁수', cls: 'archer', hp: 100, mp: 5, atk: 32, def: 18, int: 5, spd: 16, morale: 85 },
  zhao_yun: { name: '조운',   cls: 'cavalry',    hp: 102, mp: 20, atk: 31, def: 23, int: 14, spd: 23, morale: 95 }, // 관우(공32/방24)와 주창(공30/방23) 사이 — 기존 아군 기병 실측 기준
  zhuge_liang:{ name: '제갈량', cls: 'strategist', hp: 78, mp: 42, atk: 11, def: 13, int: 36, spd: 15, morale: 95, tactics: ['fire','heal'] }, // 최고 지력 — 저수(int 34) 위, 화계·치유 보유(적벽 화계 서사)
  cao_navy: { name: '조조군 수군', cls: 'navy',   hp: 110, mp: 5, atk: 34, def: 18, int: 5, spd: 17, morale: 85 }, // 조조군 궁수(hp100/atk32) 약간 상향 — 수상 방어선
  shu_soldier:{ name: '유비군 보병', cls: 'infantry', hp: 100, mp: 5, atk: 27, def: 20, int: 5, spd: 13, morale: 85 }, // 조조군 보병(cao_soldier 120/30/22) 하향 — 조조 3부 적 잡병
  shu_archer: { name: '유비군 궁수', cls: 'archer',   hp: 85,  mp: 5, atk: 29, def: 16, int: 5, spd: 15, morale: 85 }, // 형주 남군 궁수(jing_archer) 동급
  liu_bei_chibi:{ name: '유비', cls: 'infantry', hp: 175, mp: 25, atk: 36, def: 28, int: 24, spd: 18, morale: 100, tactics: ['cheer'] }, // 적벽 퇴각전 추격대 지휘 보스 — 조조 적벽 보스(cao_cao_chibi 185/38/30) 약간 하향
  ma_chao:    { name: '마초', cls: 'cavalry',  hp: 170, mp: 15, atk: 37, def: 26, int: 10, spd: 24, morale: 100, tactics: ['intimidate'] }, // 위남 대전 보스 — 금성의 무위(정사 서열감), 조조 적벽 보스(cao_cao_chibi 185/38/30) 약간 하향
  han_sui:    { name: '한수', cls: 'cavalry',  hp: 130, mp: 15, atk: 33, def: 22, int: 16, spd: 20, morale: 90 }, // 정사 실재 — 위남 패주(보스 아님, 퇴각 가능)
  cheng_yi:   { name: '성의', cls: 'infantry', hp: 120, mp: 10, atk: 30, def: 22, int: 8,  spd: 15, morale: 85 }, // 정사 실재 — 위남에서 전사(斬成宜)
  li_kan:     { name: '이감', cls: 'infantry', hp: 115, mp: 10, atk: 29, def: 21, int: 8,  spd: 15, morale: 85 }, // 정사 실재 — 위남에서 전사(斬李堪)
  guanzhong_c:{ name: '관중 기병', cls: 'cavalry', hp: 95, mp: 5, atk: 28, def: 19, int: 5, spd: 18, morale: 85 },
  cao_cao_chibi:{ name: '조조', cls: 'infantry',   hp: 185, mp: 35, atk: 38, def: 30, int: 26, spd: 16, morale: 100, tactics: ['intimidate'] }, // 적벽 보스 — 심배(hp185/def30) 동급 후반 보스. 초기 220/40/32는 AUTO 실측 전패로 하향
  wuhuan_c:  { name: '오환 돌격기병', cls: 'cavalry', hp: 100, mp: 5, atk: 32, def: 18, int: 4, spd: 22, morale: 90 }, // 백랑산 오환 기병 돌격의 게임 각색 편성

  yuan_archer:{ name: '원소군 궁수', cls: 'archer',  hp: 74, mp: 5, atk: 26, def: 15, int: 5, spd: 16, morale: 85 },
};

// 스테이지: 오리지널 맵/배치/대사. 맵 문자 -> TERRAIN 키
const MAP_CHARS = { '.':'plain', ',':'grass', 'F':'forest', 'M':'mountain', '~':'river', '=':'bridge', 'S':'swamp', 'W':'wasteland', 'C':'castle', '#':'wall', 'G':'gate', 'V':'village', 'B':'barracks', 'T':'treasure' };

const STAGES = [
  {
    id: 1, name: '제1전 · 탁현의 맹세', maxTurns: 20,
    briefing: '황건의 난이 일어났다. 도원에서 의를 맺은 유비·관우·장비가 의병을 이끌고 탁현 밖 황건적 선봉을 맞는다. 첫 전투, 전열을 가다듬어라.',
    victory: '적 전멸', defeat: '유비 전사 또는 턴 초과',
    fastWin: { turns: 5, gold: 250 },
    map: [
      'MMMMMMMMMMMM',
      'M..FF....WWM',
      '..FFF.....WM',
      ',,....==..~M',
      ',,.~~~~==..M',
      ',,.~~~~....M',
      'M....FF....M',
      'M.W...FF..VM',
      'M.WW....B..M',
      'MMMMMMMMMMMM',
    ],
    players: [
      { char: 'liu_bei', x: 1, y: 4, commander: true },
      { char: 'guan_yu', x: 2, y: 3 },
      { char: 'zhang_fei', x: 2, y: 5 },
      { char: 'jian_yong', x: 1, y: 3 },
      { char: 'sun_qian', x: 1, y: 5 },
    ],
    enemies: [
      { char: 'cheng', x: 9, y: 4, boss: true, ai: 'hold' },
      { char: 'soldier_i', x: 8, y: 3, ai: 'aggressive' },
      { char: 'soldier_i', x: 8, y: 5, ai: 'aggressive' },
      { char: 'soldier_a', x: 9, y: 6, ai: 'hold' },
      { char: 'soldier_i', x: 7, y: 4, ai: 'aggressive' },
    ],
    rewards: { gold: 500, items: ['bean','bean','ore','manual'], exp: 30 },
  },
  {
    id: 2, name: '제2전 · 광종 공방', maxTurns: 24,
    briefing: '황건의 본거지 광종. 강을 사이에 두고 적진이 버틴다. 다리를 확보하고 배원소의 궁수진을 무너뜨려라. 남쪽 적 보급고를 점령하면 추가 전리품을 얻는다(승리 시 획득).',
    victory: '적 전멸', defeat: '유비 전사 또는 턴 초과',
    fastWin: { turns: 14, gold: 400 }, // AUTO 자연 완주 9표본 9~10턴(통상 9) + 여유 — ①5턴/③6턴 사이 골드
    treasure: { x: 10, y: 8, gold: 500, items: ['ore'] },
    map: [
      'MMMMMMMMMMMMMM',
      'M..FF...~~~WWM',
      '..FFF..~~~~.WM',
      ',,....~~~....M',
      ',,.~~~~..==..M',
      ',,.~~~~~~....M',
      'M....~~~.....M',
      'M.W...==..F..M',
      'M.WW......TV.M',
      'M...F....F...M',
      'M..F...V.....M',
      'MMMMMMMMMMMMMM',
    ],
    players: [
      { char: 'liu_bei', x: 1, y: 4, commander: true },
      { char: 'guan_yu', x: 2, y: 3 },
      { char: 'zhang_fei', x: 2, y: 5 },
      { char: 'jian_yong', x: 1, y: 3 },
      { char: 'sun_qian', x: 1, y: 5 },
      { char: 'mi_zhu', x: 0, y: 4 },
    ],
    enemies: [
      { char: 'pei', x: 11, y: 4, boss: true, ai: 'hold', holdUntil: 6 },
      { char: 'deng', x: 9, y: 3, ai: 'aggressive' },
      { char: 'soldier_i', x: 9, y: 5, ai: 'aggressive' },
      { char: 'soldier_a', x: 10, y: 2, ai: 'hold', holdUntil: 6 },
      { char: 'soldier_a', x: 10, y: 6, ai: 'hold', holdUntil: 6 },
      { char: 'soldier_i', x: 8, y: 4, ai: 'aggressive' },
      { char: 'soldier_i', x: 10, y: 8, ai: 'aggressive' },
    ],
    rewards: { gold: 800, items: ['rice','ore','ore','iron_sword'], exp: 45 },
  },
  {
    id: 3, name: '제3전 · 사수관의 화웅', maxTurns: 26,
    briefing: '반동탁 연합군이 결성됐다. 관문 앞을 지키는 맹장 화웅이 연합군 선봉을 연파하고 있다. 유비 일행이 돌파구를 연다. 화웅을 쓰러뜨리면 장신구 호신부(턴 시작 HP 회복)를 얻는다.',
    victory: '화웅 격파', defeat: '유비 전사 또는 턴 초과', bossChar: 'hua_xiong',
    bossDrop: 'amulet',
    fastWin: { turns: 6, gold: 600 },
    map: [
      'MMMMMMMMMMMMMM',
      'MM..FF..W.GMMM',
      'M..FFF...WW#MM',
      '..FFFF....W#CM',
      ',,...==...W#CM',
      ',,.~~~~...W#BM',
      ',..FFF....W#MM',
      'M....FF..WWW#M',
      'MM...WWWWW.GMM',
      'MMMMMMMMMMMMMM',
    ],
    players: [
      { char: 'liu_bei', x: 1, y: 4, commander: true },
      { char: 'guan_yu', x: 2, y: 3 },
      { char: 'zhang_fei', x: 2, y: 5 },
      { char: 'jian_yong', x: 0, y: 4 },
      { char: 'sun_qian', x: 1, y: 6 },
      { char: 'mi_zhu', x: 1, y: 3 },
    ],
    enemies: [
      { char: 'hua_xiong', x: 11, y: 4, boss: true, ai: 'hold' },
      { char: 'li_ru', x: 11, y: 3, ai: 'hold' },
      { char: 'soldier_c', x: 9, y: 2, ai: 'aggressive' },
      { char: 'soldier_c', x: 9, y: 6, ai: 'aggressive' },
      { char: 'soldier_i', x: 7, y: 3, ai: 'aggressive' },
      { char: 'soldier_i', x: 7, y: 5, ai: 'aggressive' },
      { char: 'soldier_a', x: 10, y: 5, ai: 'hold' },
    ],
    rewards: { gold: 1200, items: ['iron_armor','ore','ore','tonic','manual'], exp: 60 },
  },
  {
    id: 4, name: '제4전 · 호로관의 귀신', maxTurns: 28,
    briefing: '마침내 호로관. 관 앞에 선 자는 천하의 여포다. 무리한 정면 승부는 금물. 지형을 쓰고, 사기를 모으고, 귀신을 꺾어라. 관 북쪽 무기고를 점령하면 추가 전리품을 얻는다(승리 시 획득).',
    victory: '여포 격파', defeat: '유비 전사 또는 턴 초과', bossChar: 'lu_bu',
    fastWin: { turns: 6, gold: 700 }, // AUTO 자연 완주 9표본 3~4턴(통상 3) + 여유 — ③600/⑥800 사이 골드
    treasure: { x: 10, y: 1, gold: 600, items: ['manual'] },
    map: [
      'MMMMMMMMMMMMMM',
      'M..FF....WTGMM',
      'M..FFF...WW#MM',
      '..FFFF....W#CM',
      ',,...==...W#CM',
      ',,.~~~~...W#MM',
      ',..FFF....W#MM',
      'M....FF..WWW#M',
      'MM..WWWWWW.GMM',
      'MMMMMMMMMMMMMM',
    ],
    players: [
      { char: 'liu_bei', x: 1, y: 4, commander: true },
      { char: 'guan_yu', x: 2, y: 3 },
      { char: 'zhang_fei', x: 2, y: 5 },
      { char: 'jian_yong', x: 0, y: 4 },
      { char: 'sun_qian', x: 1, y: 6 },
      { char: 'mi_zhu', x: 1, y: 3 },
    ],
    enemies: [
      { char: 'lu_bu', x: 11, y: 4, boss: true, ai: 'aggressive' },
      { char: 'li_ru', x: 12, y: 3, ai: 'hold' },
      { char: 'soldier_c', x: 9, y: 2, ai: 'aggressive' },
      { char: 'soldier_c', x: 9, y: 6, ai: 'aggressive' },
      { char: 'soldier_c', x: 8, y: 4, ai: 'aggressive' },
      { char: 'soldier_a', x: 10, y: 5, ai: 'hold' },
      { char: 'soldier_i', x: 10, y: 3, ai: 'aggressive' },
    ],
    rewards: { gold: 2000, items: ['spear','ore','ore','ore','meat'], exp: 90 },
  },
  {
    id: 5, name: '제5전 · 낙양 공성전', maxTurns: 30,
    briefing: '호로관이 무너지고 동탁은 낙양에서 최후의 저항을 준비한다. 성벽을 관문으로 돌파하고, 성내의 이점을 지닌 동탁을 꺾어라. 보물창고를 점령하면 추가 전리품을 얻는다(승리 시 획득).',
    victory: '동탁 격파', defeat: '유비 전사 또는 턴 초과', bossChar: 'dong_zhuo',
    fastWin: { turns: 12, gold: 700 }, // AUTO 자연 완주 9표본 통상 6~8턴(드문 정체 17턴 1회) + 여유 — ⑥⑦과 동일 목표
    treasure: { x: 12, y: 2, gold: 800, items: ['jade'] },
    map: [
      'MMMMMMMMMMMMMM',
      'M..FF....W#CCM',
      'M..FFF...W#CTM',
      '..FFFF...WGCCM',
      ',,...==..W#CCM',
      ',,.~~~~..W#CCM',
      ',..FFF...W#CCM',
      'M....FF..WGCCM',
      'MM...WWW.W#CCM',
      'MMMMMMMMMMMMMM',
    ],
    players: [
      { char: 'liu_bei', x: 1, y: 4, commander: true },
      { char: 'guan_yu', x: 2, y: 3 },
      { char: 'zhang_fei', x: 2, y: 5 },
      { char: 'jian_yong', x: 0, y: 4 },
      { char: 'sun_qian', x: 1, y: 6 },
      { char: 'mi_zhu', x: 1, y: 3 },
    ],
    enemies: [
      { char: 'dong_zhuo', x: 11, y: 4, boss: true, ai: 'guard' },
      { char: 'guo_si', x: 12, y: 3, ai: 'guard' },
      { char: 'li_jue', x: 8, y: 2, ai: 'aggressive' },
      { char: 'soldier_c', x: 8, y: 4, ai: 'aggressive' },
      { char: 'soldier_c', x: 8, y: 6, ai: 'aggressive' },
      { char: 'soldier_i', x: 7, y: 3, ai: 'aggressive' },
      { char: 'soldier_i', x: 7, y: 5, ai: 'aggressive' },
      { char: 'soldier_a', x: 12, y: 5, ai: 'hold' },
    ],
    rewards: { gold: 3000, items: ['iron_armor','ore','ore','ore','meat','meat','manual'], exp: 120 },
  },
  {
    id: 6, name: '제6전 · 왕성 탈환', maxTurns: 28,
    briefing: '동탁이 쓰러진 뒤, 잔당 이각·곽사가 친위병을 모아 왕성을 점거했다. 두 관문을 돌파해 성내로 진입하고 이각을 토벌하라. 성내 보물창고를 점령하면 추가 전리품을 얻는다(선택, 승리 시 획득).',
    victory: '이각 격파', defeat: '유비 전사 또는 턴 초과', bossChar: 'li_jue',
    bossDrop: 'scroll',
    fastWin: { turns: 12, gold: 800 },
    treasure: { x: 12, y: 2, gold: 1000, items: ['amulet'] },
    map: [
      'MMMMMMMMMMMMMM',
      'M,,..~~~..#CCM',
      'M,,..~=~..#CTM',
      'M.FF.~=~..GCCM',
      'M.FF.~~~..#CCM',
      'M,...===..#CCM',
      'M..S......GCCM',
      'MW...FF...#CCM',
      'MM....WW..#CCM',
      'MMMMMMMMMMMMMM',
    ],
    players: [
      { char: 'liu_bei', x: 1, y: 4, commander: true },
      { char: 'guan_yu', x: 2, y: 3 },
      { char: 'zhang_fei', x: 2, y: 5 },
      { char: 'jian_yong', x: 0, y: 4 },
      { char: 'sun_qian', x: 1, y: 6 },
      { char: 'mi_zhu', x: 1, y: 3 },
    ],
    enemies: [
      { char: 'li_jue', x: 12, y: 4, boss: true, ai: 'guard' },
      { char: 'guo_si', x: 11, y: 2, ai: 'guard' },
      { char: 'li_ru', x: 12, y: 5, ai: 'hold' },
      { char: 'dong_elite', x: 11, y: 3, ai: 'aggressive' },
      { char: 'dong_elite', x: 11, y: 6, ai: 'aggressive' },
      { char: 'soldier_c', x: 11, y: 5, ai: 'aggressive' },
      { char: 'soldier_c', x: 12, y: 6, ai: 'aggressive' },
      { char: 'soldier_a', x: 11, y: 1, ai: 'hold' },
    ],
    rewards: { gold: 3500, items: ['rice','rice','ore','ore','tonic','manual'], exp: 150 },
  },
  {
    id: 7, name: '제7전 · 곽사의 최후', maxTurns: 30,
    briefing: '이각이 쓰러지고 곽사가 동탁 잔당을 긁어모아 장안 외곽에 웅거했다. 강을 건너 성채로 진격해 최후의 발악을 꺾어라. 성채 서쪽 보물창고를 점령하면 추가 전리품을 얻는다(선택, 승리 시 획득).',
    victory: '곽사 격파', defeat: '유비 전사 또는 턴 초과', bossChar: 'guo_si',
    bossDrop: 'jade',
    fastWin: { turns: 12, gold: 900 },
    treasure: { x: 9, y: 2, gold: 1200, items: ['manual'] },
    map: [
      'MMMMMMMMMMMMMM',
      'M,,..~~~..#CCM',
      'M,.F.~=~.T#CCM',
      'M,.F.~=~..GCCM',
      'M,,..~~~..#CCM',
      'M..FF.~=..GCCM',
      'M.FF..~=...CCM',
      'M..F...~~~.CCM',
      'MWW....~~.VVMM',
      'MMMMMMMMMMMMMM',
    ],
    players: [
      { char: 'liu_bei', x: 1, y: 5, commander: true },
      { char: 'guan_yu', x: 2, y: 4 },
      { char: 'zhang_fei', x: 2, y: 6 },
      { char: 'jian_yong', x: 1, y: 6 },
      { char: 'sun_qian', x: 1, y: 7 },
      { char: 'mi_zhu', x: 1, y: 4 },
    ],
    enemies: [
      { char: 'guo_si', x: 12, y: 3, boss: true, ai: 'guard' },
      { char: 'li_ru', x: 11, y: 6, ai: 'hold' },
      { char: 'dong_elite', x: 10, y: 3, ai: 'aggressive' },
      { char: 'dong_elite', x: 10, y: 6, ai: 'aggressive' },
      { char: 'soldier_c', x: 9, y: 4, ai: 'aggressive' },
      { char: 'soldier_c', x: 9, y: 5, ai: 'aggressive' },
      { char: 'soldier_a', x: 12, y: 2, ai: 'hold' },
    ],
    rewards: { gold: 4000, items: ['rice','rice','ore','ore','tonic','manual'], exp: 170 },
  },
  {
    id: 8, name: '제8전 · 소패의 기습', maxTurns: 30,
    briefing: '곽사가 쓰러지고 천하는 군웅할거로 들어섰다. 소패에 머무는 유비를 호로관의 패장 여포가 기습해 왔다. 성을 등지고 역습을 받아쳐 천하의 귀신을 다시 꺾어라. 북동 보급고를 점령하면 추가 전리품을 얻는다(선택, 승리 시 획득).',
    victory: '여포 격파', defeat: '유비 전사 또는 턴 초과', bossChar: 'lu_bu',
    bossDrop: 'training_charm',
    fastWin: { turns: 12, gold: 1000 },
    treasure: { x: 12, y: 1, gold: 1400, items: ['manual'] },
    map: [
      'MMMMMMMMMMMMMM',
      'M......FF.F.TM',
      'M.CC....FF...M',
      'MGCC..~~..~..M',
      'M.CC..~~..~..M',
      'M.....==..~..M',
      'M.FF..==.....M',
      'M.FF..~~..F..M',
      'M..V..~~..FF.M',
      'MMMMMMMMMMMMMM',
    ],
    players: [
      { char: 'liu_bei', x: 2, y: 3, commander: true },
      { char: 'guan_yu', x: 3, y: 4 },
      { char: 'zhang_fei', x: 3, y: 2 },
      { char: 'jian_yong', x: 1, y: 4 },
      { char: 'sun_qian', x: 2, y: 5 },
      { char: 'mi_zhu', x: 1, y: 3 },
    ],
    enemies: [
      { char: 'lu_bu', x: 11, y: 4, boss: true, ai: 'aggressive' },
      { char: 'soldier_c', x: 9, y: 3, ai: 'aggressive' },
      { char: 'soldier_c', x: 9, y: 5, ai: 'aggressive' },
      { char: 'soldier_c', x: 12, y: 4, ai: 'aggressive' },
      { char: 'soldier_a', x: 11, y: 2, ai: 'hold', holdUntil: 4 },
      { char: 'soldier_a', x: 11, y: 6, ai: 'hold', holdUntil: 4 },
      { char: 'soldier_i', x: 9, y: 4, ai: 'aggressive' },
      { char: 'soldier_i', x: 12, y: 7, ai: 'aggressive' },
    ],
    rewards: { gold: 4500, items: ['meat','ore','ore','tonic','manual'], exp: 190 },
  },
  {
    id: 9, name: '제9전 · 하비의 함락', maxTurns: 30,
    briefing: '소패를 빼앗긴 유비는 조조와 손잡고 여포가 웅거한 하비를 포위했다. 궁지에 몰린 천하의 귀신은 성 안에서 마지막 결전을 준비한다. 서쪽 관문이나 남쪽 문을 돌파해 성으로 밀고 들어가 여포를 끝장내라. 남쪽 보급고를 점령하면 추가 전리품을 얻는다(선택, 승리 시 획득).',
    victory: '여포 격파', defeat: '유비 전사 또는 턴 초과', bossChar: 'lu_bu',
    bossDrop: 'plate',
    fastWin: { turns: 14, gold: 1200 },
    treasure: { x: 10, y: 6, gold: 1600, items: ['manual'] },
    map: [
      'MMMMMMMMMMMMMM',
      'M...F....#CC#M',
      'M.V..~~..#CC#M',
      'M....~~..GCC#M',
      'M.FF.==..#CC#M',
      'M.FF.~~..##G#M',
      'M....~~...T..M',
      'M..B.....FF..M',
      'M......FF....M',
      'MMMMMMMMMMMMMM',
    ],
    players: [
      { char: 'liu_bei', x: 2, y: 4, commander: true },
      { char: 'guan_yu', x: 3, y: 3 },
      { char: 'zhang_fei', x: 3, y: 5 },
      { char: 'jian_yong', x: 1, y: 3 },
      { char: 'sun_qian', x: 2, y: 6 },
      { char: 'mi_zhu', x: 1, y: 5 },
    ],
    enemies: [
      { char: 'lu_bu', x: 10, y: 2, boss: true, ai: 'aggressive' },
      { char: 'chen_gong', x: 11, y: 1, ai: 'hold' },
      { char: 'lu_elite', x: 10, y: 4, ai: 'aggressive' },
      { char: 'lu_elite', x: 11, y: 4, ai: 'aggressive' },
      { char: 'lu_soldier', x: 10, y: 3, ai: 'aggressive' },
      { char: 'lu_archer', x: 11, y: 2, ai: 'hold' },
      { char: 'lu_archer', x: 11, y: 3, ai: 'hold' },
      { char: 'lu_soldier', x: 10, y: 7, ai: 'hold', holdUntil: 6 },
    ],
    rewards: { gold: 5000, items: ['meat','ore','ore','tonic','manual'], exp: 210 },
  },
];
// 조조군 전역 3전 (세력 슬라이스). 전투 자체는 실제 역사(192 연주 황건 토벌·194~195 연주 탈환·198 하비)를 근거로 하되, 맵·배치·목표·대사는 창작.
// ③하비 포위는 유비군 제9전과 같은 전투를 조조군 측 시점으로 다루며, 맵 지형은 공유하고 배치·브리핑만 조조군 기준으로 작성.
const CAO_STAGES = [
  {
    id: 1, name: '제1전 · 연주 황건 토벌', maxTurns: 20,
    briefing: '192년, 연주로 밀려든 황건 잔당 수십만을 조조가 토벌에 나선다. 이들을 격파하고 항복을 받아내면 정예 청주병의 씨앗이 된다. 강줄기를 건너 적진을 와해하라.',
    victory: '적 전멸', defeat: '조조 전사 또는 턴 초과',
    fastWin: { turns: 6, gold: 250 },
    map: [
      'MMMMMMMMMMMM',
      'M..FF....WWM',
      'M..FF..~~~.M',
      ',,...~~~~..M',
      ',,.~~~~..F.M',
      ',,.~~...FF.M',
      'M...~..F...M',
      'M.W......V.M',
      'M.WW...F...M',
      'MMMMMMMMMMMM',
    ],
    players: [
      { char: 'cao_cao', x: 1, y: 4, commander: true },
      { char: 'xiahou_dun', x: 2, y: 3 },
      { char: 'xiahou_yuan', x: 2, y: 5 },
      { char: 'cao_ren', x: 1, y: 3 },
      { char: 'yue_jin', x: 1, y: 5 },
      { char: 'xun_yu', x: 0, y: 4 },
    ],
    enemies: [
      { char: 'cheng', x: 9, y: 4, boss: true, ai: 'hold' },
      { char: 'deng', x: 8, y: 3, ai: 'aggressive' },
      { char: 'soldier_i', x: 8, y: 5, ai: 'aggressive' },
      { char: 'soldier_a', x: 9, y: 6, ai: 'hold' },
      { char: 'soldier_i', x: 7, y: 4, ai: 'aggressive' },
      { char: 'soldier_a', x: 9, y: 2, ai: 'hold' },
    ],
    rewards: { gold: 500, items: ['bean','ore','manual'], exp: 30 },
  },
  {
    id: 2, name: '제2전 · 연주 탈환', maxTurns: 24,
    briefing: '195년, 진궁·장막의 배반으로 연주 대부분이 여포에게 넘어갔다. 서주 원정에서 되돌아온 조조가 복양 들판에서 여포군과 맞붙는다. 기병의 기동을 살려 측면을 찌르고 진궁의 계략을 끊어라.',
    victory: '적 전멸', defeat: '조조 전사 또는 턴 초과',
    fastWin: { turns: 7, gold: 400 },
    map: [
      'MMMMMMMMMMMMMM',
      'M...F....B...M',
      'M....FF..FF..M',
      ',,..F..~~..F.M',
      ',,....~~==...M',
      'M..FF..~~..B.M',
      'M....FF..FF..M',
      'M.V...~~.F...M',
      'M.....~~..F..M',
      'MMMMMMMMMMMMMM',
    ],
    players: [
      { char: 'cao_cao', x: 1, y: 4, commander: true },
      { char: 'xiahou_dun', x: 2, y: 3 },
      { char: 'xiahou_yuan', x: 2, y: 5 },
      { char: 'cao_ren', x: 1, y: 3 },
      { char: 'yue_jin', x: 1, y: 5 },
      { char: 'xun_yu', x: 0, y: 4 },
    ],
    enemies: [ // 여포는 5턴까지 진영 유지(복양에서 출진하는 설정) — 3전 전역의 초반 성장 곡선에서 AUTO조차 지휘관이 4턴에 무너지는 것을 실측으로 확인하고 조정
      { char: 'lu_bu', x: 10, y: 4, boss: true, ai: 'hold', holdUntil: 5 },
      { char: 'chen_gong', x: 11, y: 4, ai: 'hold' },
      { char: 'lu_elite', x: 9, y: 3, ai: 'aggressive' },
      { char: 'lu_elite', x: 9, y: 5, ai: 'aggressive' },
      { char: 'lu_soldier', x: 10, y: 2, ai: 'aggressive' },
      { char: 'lu_archer', x: 10, y: 6, ai: 'hold' },
      { char: 'lu_archer', x: 11, y: 2, ai: 'hold' },
    ],
    rewards: { gold: 800, items: ['rice','ore','iron_sword'], exp: 45 },
  },
  {
    id: 3, name: '제3전 · 하비 포위', maxTurns: 30,
    briefing: '198년, 조조는 유비와 손잡고 여포가 웅거한 하비를 포위했다. 기수와 사수의 물을 끌어와 성을 적시는 수공이 시작된다. 서쪽 관문이나 남쪽 문을 돌파해 성으로 밀고 들어가 천하의 귀신을 끝장내라. 남쪽 보급고를 점령하면 추가 전리품을 얻는다(선택, 승리 시 획득).',
    victory: '여포 격파', defeat: '조조 전사 또는 턴 초과', bossChar: 'lu_bu_siege',
    bossDrop: 'plate',
    fastWin: { turns: 14, gold: 1200 },
    treasure: { x: 10, y: 6, gold: 1600, items: ['manual'] },
    map: [
      'MMMMMMMMMMMMMM',
      'M...F....#CC#M',
      'M.V..~~..#CC#M',
      'M....~~..GCC#M',
      'M.FF.==..#CC#M',
      'M.FF.~~..##G#M',
      'M....~~...T..M',
      'M..B.....FF..M',
      'M......FF....M',
      'MMMMMMMMMMMMMM',
    ],
    players: [
      { char: 'cao_cao', x: 2, y: 4, commander: true },
      { char: 'xiahou_dun', x: 3, y: 3 },
      { char: 'xiahou_yuan', x: 3, y: 5 },
      { char: 'cao_ren', x: 1, y: 3 },
      { char: 'yue_jin', x: 2, y: 6 },
      { char: 'xun_yu', x: 1, y: 5 },
    ],
    enemies: [ // 유비군 제9전보다 수비대 축소(8→6) + 여포는 4턴 대기: 수공으로 성이 물러질 때까지의 시간을 두는 설정 — 3전 전역의 성장 곡선에 맞춘 난이도 조정
      { char: 'lu_bu_siege', x: 10, y: 2, boss: true, ai: 'hold', holdUntil: 4 },
      { char: 'chen_gong', x: 11, y: 1, ai: 'hold' },
      { char: 'lu_elite', x: 10, y: 4, ai: 'aggressive' },
      { char: 'lu_soldier', x: 10, y: 3, ai: 'aggressive' },
      { char: 'lu_archer', x: 11, y: 2, ai: 'hold' },
      { char: 'lu_soldier', x: 10, y: 7, ai: 'hold', holdUntil: 6 },
    ],
    rewards: { gold: 3000, items: ['meat','ore','tonic','manual'], exp: 150 },
  },
  {
    id: 4, name: '제4전 · 관도 대전', maxTurns: 28,
    briefing: '200년, 북중원의 패자 원소가 대군을 이끌고 남하해 관도에서 조조군과 맞선다. 병력은 절대 열세. 선봉 안량·문추의 돌격을 꺾고 북쪽 보급고를 빼앗아 원소 본대의 허를 찔러라. 보급고 점령은 선택이며 승리 시 전리품을 얻는다.',
    victory: '원소군 격퇴', defeat: '조조 전사 또는 턴 초과', bossChar: 'yuan_shao',
    bossDrop: 'bulwark',
    fastWin: { turns: 16, gold: 1500 },
    treasure: { x: 11, y: 3, gold: 2500, items: ['rice','rice'] }, // 오소 보급기지 습격(200)의 전과를 반영한 선택 목표
    map: [
      'MMMMMMMMMMMMMM',
      'M..F...~~..BBM',
      'M....V.~~..B.M',
      'M.....~~...T.M',
      'M.BB.~~=~~...M',
      'M.BB.~~...FF.M',
      'M.....~~..F..M',
      'M..FF.~~..V..M',
      'M.V...~~...F.M',
      'MMMMMMMMMMMMMM',
    ],
    players: [ // 서쪽 관도 진지의 조조군
      { char: 'cao_cao', x: 1, y: 4, commander: true },
      { char: 'xiahou_dun', x: 3, y: 3 },
      { char: 'xiahou_yuan', x: 2, y: 6 },
      { char: 'cao_ren', x: 1, y: 5 },
      { char: 'yue_jin', x: 1, y: 6 },
      { char: 'xun_yu', x: 1, y: 3 },
    ],
    enemies: [ // 10만 대군 설정: 적 7 vs 아군 6의 수적 열세(초안 8기는 친위병 2기째가 조조 집중 타격 과다로 축소 — ③ 하비의 수비대 축소 조정과 같은 실측 근거). 안량·문추 선봉 돌격은 백마 전투 전초전을 관도 전역에 압축한 게임 처리(브리핑 문구와 함께 설계 문서에 명시)
      { char: 'yan_liang', x: 9, y: 3, ai: 'aggressive' }, // 선봉 즉시 돌격(백마 압축 설정)
      { char: 'wen_chou', x: 9, y: 6, ai: 'aggressive' },
      { char: 'yuan_elite', x: 10, y: 4, ai: 'aggressive' },
      { char: 'yuan_archer', x: 11, y: 4, ai: 'hold' },
      { char: 'yuan_archer', x: 12, y: 6, ai: 'hold' },
      { char: 'ju_shou', x: 12, y: 3, ai: 'hold' },
      { char: 'yuan_shao', x: 12, y: 4, boss: true, ai: 'hold', holdUntil: 5 }, // 본진 대기 — 선봉이 먼저 부딪히는 설정
    ],
    rewards: { gold: 4000, items: ['meat','ore','tonic','manual'], exp: 200 },
  },
];

// ═══ 조조군 2부 전역 · 북방 평정(204~207) ═══
// 역사 구분: 두 전투 모두 정사 실재·조조 승리(출처 ko.wikipedia 업_전투·백랑산_전투, 설계 문서 /tmp/cheonha3-cao2-design.md에 URL 보존). 연의 인용 없음 — 단, 편성 규모·승리조건·구원군 합류 시점·기병 돌격 배치는 게임 각색이며 각 주석과 브리핑에 그 사실을 명시.
// 해금: FACTIONS.cao는 4전 유지. 완주 화면의 명시 선택('북방 원정 계속')이 route 'cao_p2'를 기록할 때만 stages()가 이 배열을 결합 — 미언락 세이브는 stages 4 유지로 기존 4전 완주 의미·엔딩 기록 불변. 레벨 앵커 stage.id 5/6으로 관도(4) 직후와 자연 연결.
const CAO_STAGES2 = [
  {
    id: 5, name: '제5전 · 업 포위전', maxTurns: 26,
    briefing: '204년(건안 9년), 원소 사후 다투는 원씨 형제의 본거지 업을 포위한다(정사 실재 전투). 수비 사령 심배가 성을 굳게 지키고, 원상의 구원군이 시간차로 다가온다 — 합류 시점과 편성·승리조건은 게임 각색. 성내의 이점을 지닌 심배를 격파하라. 보물창고는 선택이며 승리 시 전리품을 얻는다.',
    victory: '심배 격파', defeat: '조조 전사 또는 턴 초과', bossChar: 'shen_pei',
    bossDrop: 'plate',
    fastWin: { turns: 14, gold: 1200 },
    treasure: { x: 12, y: 2, gold: 1500, items: ['rice','jade'] }, // 업 성내 물자(선택 목표, 게임 각색)
    map: [ // 낙양 공성전(유비 ⑤)과 같은 성곽 구조 재사용 — 업은 정사상 견고한 성(출처 동일)
      'MMMMMMMMMMMMMM',
      'M..FF....W#CCM',
      'M..FFF...W#CTM',
      '..FFFF...WGCCM',
      ',,...==..W#CCM',
      ',,.~~~~..W#CCM',
      ',..FFF...W#CCM',
      'M....FF..WGCCM',
      'MM...WWW.W#CCM',
      'MMMMMMMMMMMMMM',
    ],
    players: [ // 서쪽 포위진의 조조군
      { char: 'cao_cao', x: 1, y: 4, commander: true },
      { char: 'xiahou_dun', x: 2, y: 3 },
      { char: 'xiahou_yuan', x: 2, y: 5 },
      { char: 'cao_ren', x: 1, y: 5 },
      { char: 'yue_jin', x: 1, y: 6 },
      { char: 'xun_yu', x: 1, y: 3 },
    ],
    enemies: [ // 심배 성내 수비(정사상 업 수비 사령) — 편성 규모는 게임 각색
      { char: 'shen_pei', x: 11, y: 4, boss: true, ai: 'guard' },
      { char: 'yuan_elite', x: 11, y: 3, ai: 'guard' },
      { char: 'yuan_elite', x: 11, y: 5, ai: 'guard' },
      { char: 'yuan_archer', x: 12, y: 3, ai: 'hold' },
      { char: 'yuan_soldier', x: 8, y: 4, ai: 'aggressive' }, // 성문 앞 견제
    ],
    reinforce: { atTurn: 6, dir: '동쪽', units: [ { char: 'yuan_shang', x: 12, y: 6 }, { char: 'yuan_soldier', x: 12, y: 5 } ] }, // 원상 구원군(원씨군 병종 유지 — 조조군 병종 교체는 이전 구원군만 해당)(정사상 구원 시도 실재 — 6턴 합류 시점은 게임 각색) — 스토리 증원: 회차 무관 항상 출현
    rewards: { gold: 3500, items: ['meat','ore','tonic','manual'], exp: 180 },
  },
  {
    id: 6, name: '제6전 · 백랑산 결전', maxTurns: 24,
    briefing: '207년, 도망친 원상·원희를 비호하는 오환의 족장 답돈을 토벌하러 북방으로 진군한다(정사 실재 전투). 곽가는 병으로 역주에 남아 이 전투에 함께하지 못하며, 그 부고는 전투 후 귀환길에 전해진다(정사). 산지 사이로 돌격하는 오환 기병을 끊고 답돈을 격파하면 북방이 평정된다. 편성 규모·승리조건·기병 돌격 배치는 게임 각색이다.',
    victory: '답돈 격파', defeat: '조조 전사 또는 턴 초과', bossChar: 'tadun',
    bossDrop: 'jade',
    fastWin: { turns: 14, gold: 1500 },
    map: [ // 산지·황무지 축 야전 — 요서 백랑산 지형의 게임 각색(기병은 산 통행 불가라 완만한 초원 축이 결전로)
      'MMMMMMMMMMMMMM',
      'M....,,,....VM',
      'M..MM,,F.....M',
      'M.MMM,,,..,,.M',
      '...,,,,,,....M',
      'M.,,,MM..,,..M',
      'M..,,,F.,,..MM',
      'M...,,,,.MM..M',
      'MM..,,,,.....M',
      'MMMMMMMMMMMMMM',
    ],
    players: [ // 서쪽 진군로의 조조군
      { char: 'cao_cao', x: 1, y: 4, commander: true },
      { char: 'xiahou_dun', x: 2, y: 3 },
      { char: 'xiahou_yuan', x: 1, y: 5 },
      { char: 'cao_ren', x: 1, y: 6 },
      { char: 'yue_jin', x: 1, y: 3 },
      { char: 'xun_yu', x: 1, y: 2 },
    ],
    enemies: [ // 답돈 본대+원상(정사 지휘관 명단) — 돌격 배치·규모는 게임 각색
      { char: 'wuhuan_c', x: 8, y: 2, ai: 'aggressive' },
      { char: 'wuhuan_c', x: 8, y: 6, ai: 'aggressive' },
      { char: 'wuhuan_c', x: 10, y: 4, ai: 'aggressive' },
      { char: 'wuhuan_c', x: 9, y: 3, ai: 'aggressive' }, // C안: 돌격 압박 +1기
      { char: 'tadun', x: 11, y: 4, boss: true, ai: 'hold', holdUntil: 4 }, // 오환 본진 대기 후 반격
      { char: 'yuan_shang', x: 12, y: 3, ai: 'hold' },
    ],
    rewards: { gold: 4500, items: ['meat','ore','tonic','manual'], exp: 220 },
  },
];

// ═══ 유비군 2부 전역 · 박망파~장판 ═══
// 역사 구분(전투·화계·지휘자 분리): 박망파는 정사 실재 — 복병+자기 진영 소각 위장퇴각(自燒屯偽遁)은 유비의 계책(정사 촉지 권2 선주전 §19, 위지 권18 이전전 §5–6), 제갈량 지휘 대화공은 연의 창작이라 사용하지 않음. 연대는 진수 본문 미명기라 특정 연도 단정 안 함. 장판(208)은 정사상 유비 패퇴 — 승리조건 '후퇴로 확보(hold)' 자체가 게임 각색임을 브리핑에 명시. 장비의 다리 수비(據水斷橋)는 정사 기록. 출처 URL은 /tmp/cheonha3-liu2-design.md에 보존.
// 해금: FACTIONS.liu는 9전 유지, route 'liu_p2' 언락 시에만 stages()가 결합 — 미언락 세이브 9전 완주 의미·엔딩 불변. 레벨 앵커 stage.id 10/11로 9전 직후와 자연 연결.
const LIU_STAGES2 = [
  {
    id: 10, name: '제10전 · 박망파의 복병', maxTurns: 24,
    briefing: '조조가 원소를 꺾은 뒤(연대는 정사에 밝히지 않음), 유표의 명으로 박망에서 하후돈·우금의 남하를 막는다(정사 실재 전투). 복병을 숨기고 진영을 불태워 거짓으로 물러나 적을 끌어들이는 것은 정사에 기록된 유비의 계책이다 — 제갈량이 지휘하는 대화공은 연의 창작이다. 좁은 숲길로 깊이 들어온 하후돈을 격퇴하라. 추격을 만류했던 이전의 구원군이 시간차로 합류한다(합류 시점은 게임 각색).',
    victory: '하후돈 격퇴', defeat: '유비 전사 또는 턴 초과', bossChar: 'xiahou_dun_bowang',
    bossDrop: 'famed_sword',
    fastWin: { turns: 14, gold: 1300 },
    map: [ // 박망파 복병 지형 — 좁은 숲길(정사 이전의 언급: 길이 좁고 초목이 깊음)의 게임 각색
      'MMMMMMMMMMMMMM',
      'M..FF....FF..M',
      'M.FFFF..FFFF.M',
      '...FF....FF...',
      ',,...,,,,....,',
      ',,.FF....FF..M',
      'M..FFF..FFF..M',
      'M...FF..FF...M',
      'MM..........MM',
      'MMMMMMMMMMMMMM',
    ],
    players: [ // 서쪽 매복진의 유비군
      { char: 'liu_bei', x: 1, y: 4, commander: true },
      { char: 'guan_yu', x: 1, y: 3 },
      { char: 'zhang_fei', x: 2, y: 5 },
      { char: 'jian_yong', x: 0, y: 3 },
      { char: 'sun_qian', x: 1, y: 6 },
      { char: 'mi_zhu', x: 1, y: 5 },
    ],
    enemies: [ // 하후돈 선봉 돌진(정사상 추격) — 편성 규모는 게임 각색
      { char: 'xiahou_dun_bowang', x: 9, y: 4, boss: true, ai: 'aggressive' },
      { char: 'yu_jin', x: 10, y: 3, ai: 'aggressive' },
      { char: 'cao_elite_c', x: 9, y: 6, ai: 'aggressive' },
      { char: 'cao_soldier', x: 11, y: 4, ai: 'aggressive' },
      { char: 'cao_archer', x: 11, y: 6, ai: 'hold' },
    ],
    reinforce: { atTurn: 5, dir: '동쪽', units: [ { char: 'li_dian', x: 12, y: 5 }, { char: 'cao_soldier', x: 12, y: 6 } ] }, // 이전 구원군(정사상 구원 실재 — 5턴 합류 시점은 게임 각색) — 스토리 증원
    rewards: { gold: 3800, items: ['meat','ore','tonic','manual'], exp: 190 },
  },
  {
    id: 11, name: '제11전 · 장판 후퇴전', maxTurns: 12, victoryType: 'hold', // hold: 12턴 생존·방어 성공이 승리(후퇴로 확보)
    briefing: '208년, 조조의 정예 기병이 밤낮없이 추격해 장판에서 따라잡힌다(정사 실재 전투). 정사에서 이 싸움은 유비의 패퇴다 — 목표는 적을 멸하는 것이 아니라 후퇴로를 지켜 12턴을 버티는 것이며, 이 승리조건 자체가 게임 각색이다. 장비가 다리를 지키며 추격을 멈춘 기록(정사)처럼 다리 서쪽을 방어하라. 추격대를 모두 격퇴해도 후퇴로는 확보된다. 후속 추격대가 7턴경 합류한다(시점은 게임 각색). 조조 본대는 아직 도착하지 않았다.',
    victory: '후퇴로 확보(12턴 방어 또는 추격대 격퇴)', defeat: '유비 전사', // hold형: 턴 한도 도달 생존 또는 추격대 전멸 모두 승리 — 패배는 지휘관 전사뿐. 두 경로를 브리핑과 판정 양쪽에 일치시킴
    map: [ // 장판 수계 축 — 다리 2칸이 유일한 결전로(장비 거수교 기록 반영)
      'MMMMMMMMMMMMMM',
      'M......~~~...M',
      'M..,..~~~.,..M',
      'M......=.....M',
      'M,,,...=.....M',
      'M.,....~~~...M',
      'M..,...~~~,..M',
      'M....,....,..M',
      'MM...,......MM',
      'MMMMMMMMMMMMMM',
    ],
    players: [ // 다리 서쪽 방어진의 유비군 — 장비는 다리 앞 배치(정사 거수교 기록)
      { char: 'liu_bei', x: 3, y: 4, commander: true },
      { char: 'guan_yu', x: 4, y: 3 },
      { char: 'zhang_fei', x: 5, y: 4 },
      { char: 'jian_yong', x: 3, y: 3 },
      { char: 'sun_qian', x: 3, y: 5 },
      { char: 'mi_zhu', x: 2, y: 4 },
    ],
    enemies: [ // 동쪽 급습 추격대(정사상 정예 기병의 게임 각색 — 조조 본대는 미등장, 브리핑 명시)
      { char: 'cao_elite_c', x: 10, y: 3, ai: 'aggressive' },
      { char: 'cao_elite_c', x: 10, y: 4, ai: 'aggressive' },
      { char: 'cao_elite_c', x: 11, y: 4, ai: 'aggressive' },
      { char: 'cao_elite_c', x: 10, y: 5, ai: 'aggressive' },
      { char: 'cao_elite_c', x: 11, y: 2, ai: 'aggressive' },
      { char: 'cao_elite_c', x: 11, y: 6, ai: 'aggressive' }, // L안: 추격대 +1기(홀드 압박)
    ],
    reinforce: { atTurn: 7, dir: '동쪽', units: [ { char: 'cao_elite_c', x: 12, y: 3 }, { char: 'cao_elite_c', x: 12, y: 5 } ] }, // 후속 추격대(조조 본대 전위의 게임 각색) — 스토리 증원: 조기 전멸을 못 한 방어측에 12턴까지 압박 유지
    rewards: { gold: 4200, items: ['meat','ore','tonic','manual'], exp: 210 },
  },
];
// 유비 3부 — 12전 적벽 대전. 해금: route 'liu_p3' 언락(2부 완주 후 명시 선택) 시에만 stages()가 결합 — 미언락 세이브 11전 완주 의미·엔딩 불변
const LIU_STAGES3 = [
  {
    id: 12, name: '제12전 · 적벽 대전', maxTurns: 24, bossChar: 'cao_cao_chibi',
    briefing: '208년 겨울, 장판에서 물러난 유비는 손권과 연합해 적벽에서 조조의 대군과 대치한다(정사 실재 전투 — 삼국지 선주전 "與曹公戰於赤壁，大破之，焚其舟船"). 정사에서 조조군은 화계와 역병으로 붕괴했다. 전장의 강과 다리 배치, 수군 편성은 게임 각색이며 오군 동맹군은 별도 부대로 등장하지 않는다(브리핑 서사 표현). 조운·제갈량은 정사상 이 시점 이미 유비 휘하(장판 기록) — 합류 표현만 각색. 강을 지키는 수군을 뚫고 북쪽의 조조를 격퇴하라.',
    victory: '조조 격퇴', defeat: '유비 전사 또는 턴 초과',
    map: [ // 적벽 수계 — 강 2열+다리 2개가 결전로(화계 연출 공간은 강, 각색)
      'MMMMMMMMMMMMMM',
      'M............M',
      'M..,.......,.M',
      'M.,......,...M',
      'M~~=~~~~~~=~~M',
      'M~~=~~~~~~=~~M',
      'M..,.,...,..,M',
      'M.,.....,,...M',
      'M..,......,..M',
      'MMMMMMMMMMMMMM',
    ],
    players: [ // 남쪽 연합군 전위 — 유비 고정 지휘관
      { char: 'liu_bei', x: 2, y: 7, commander: true },
      { char: 'guan_yu', x: 3, y: 6 },
      { char: 'zhang_fei', x: 3, y: 8 },
      { char: 'zhao_yun', x: 4, y: 7 },
      { char: 'zhuge_liang', x: 1, y: 7 },
      { char: 'jian_yong', x: 2, y: 8 },
    ],
    enemies: [ // 수군 방어선(강, 게임 각색) + 북쪽 조조 본대 — 11→8기 축소·보스 하향(220→185): AUTO 실측 L14~18 전패(유비 전사 경로) 기반, 동일 진입 스냅샷 비교로 조정: AUTO 실측 L14~18 전패(유비 전사 경로) 기반, 동일 진입 스냅샷 비교로 조정
      { char: 'cao_navy', x: 6, y: 4, ai: 'aggressive' },
      { char: 'cao_navy', x: 8, y: 5, ai: 'aggressive' },
      { char: 'cao_archer', x: 9, y: 3 },
      { char: 'cao_soldier', x: 4, y: 2 },
      { char: 'cao_soldier', x: 10, y: 2 },
      { char: 'yu_jin', x: 5, y: 1 },
      { char: 'li_dian', x: 9, y: 1 },
      { char: 'cao_cao_chibi', x: 7, y: 1, ai: 'hold', holdUntil: 4 }, // 후방 지휘 — 초반 돌출 방지
    ],
    rewards: { gold: 4600, items: ['ore','tonic','manual','rice'], exp: 230 },
  },
];

// 조조 3부 — 7전 적벽 퇴각전. 해금: route 'cao_p3' 언락(2부 완주 후 명시 선택) 시에만 stages()가 결합 — 미언락 세이브 6전 완주 의미·엔딩 불변
const CAO_STAGES3 = [
  {
    id: 7, name: '제7전 · 적벽 퇴각전', maxTurns: 24, bossChar: 'liu_bei_chibi',
    briefing: '208년 겨울, 적벽에서 유비·손권 연합군에 패한 조조는 역병이 도는 군을 이끌고 북으로 물러난다(정사 실재 전투 — 삼국지 무제기 "公至赤壁，與備戰，不利。於是大疫…乃引軍還", 추격은 선주전 "先主與吳軍水陸並進，追到南郡"). 정사에서 조조의 퇴각 자체는 성공했다. 후퇴로를 덮치는 추격대와의 이 전투 전개·편성·승리조건은 게임 각색이다. 강을 건너오는 관우·장비·조운의 추격을 뿌리치고 유비를 격퇴해 퇴각로를 확보하라.',
    victory: '유비 격퇴(후퇴로 확보)', defeat: '조조 전사 또는 턴 초과',
    map: [ // 적벽 수계 퇴각로 — 강 2열+다리 2개(유비 12전과 같은 수계, 공수 전환은 게임 각색)
      'MMMMMMMMMMMMMM',
      'M..,......,..M',
      'M.,.....,,...M',
      'M..,.,...,..,M',
      'M~~=~~~~~~=~~M',
      'M~~=~~~~~~=~~M',
      'M.,......,...M',
      'M..,.......,.M',
      'M............M',
      'MMMMMMMMMMMMMM',
    ],
    players: [ // 북쪽 퇴각로의 조조군
      { char: 'cao_cao', x: 6, y: 1, commander: true },
      { char: 'xiahou_dun', x: 5, y: 2 },
      { char: 'xiahou_yuan', x: 7, y: 2 },
      { char: 'cao_ren', x: 4, y: 1 },
      { char: 'yue_jin', x: 8, y: 1 },
      { char: 'xun_yu', x: 6, y: 2 },
    ],
    enemies: [ // 남쪽에서 강을 건너오는 유비군 추격대(정사상 추격 주체는 유비) — 편성 규모·화계 없는 육로 추격은 게임 각색
      { char: 'guan_yu', x: 3, y: 7, ai: 'aggressive' },
      { char: 'zhang_fei', x: 4, y: 8, ai: 'aggressive' },
      { char: 'zhao_yun', x: 10, y: 7, ai: 'aggressive' },
      { char: 'shu_soldier', x: 2, y: 6, ai: 'aggressive' },
      { char: 'shu_soldier', x: 11, y: 6, ai: 'aggressive' },
      { char: 'shu_archer', x: 8, y: 6, ai: 'aggressive' },
      { char: 'liu_bei_chibi', x: 6, y: 8, boss: true, ai: 'hold', holdUntil: 4 }, // 추격대 지휘 — 초반 돌출 방지
    ],
    rewards: { gold: 4600, items: ['ore','tonic','manual','rice'], exp: 230 },
  },
  {
    id: 8, name: '제8전 · 위남 대전', maxTurns: 24, bossChar: 'ma_chao',
    briefing: '211년 가을, 관중의 마초·한수 연합이 위수 남쪽에 주둔해 동진하는 조조군과 맞선다(정사 실재 전투 — 삼국지 무제기 "秋七月，公西征…超等屯渭南…大破之，斬成宜、李堪等"). 정사에서 조조는 이 싸움을 크게 이겼고 성의·이감이 죽었으며 마초·한수는 물러났다. 전투 전개·편성·승리조건은 게임 각색이다. 기병이 달리는 넓은 들에서 마초의 서량 기병을 격퇴하라.',
    victory: '마초 격퇴', defeat: '조조 전사 또는 턴 초과',
    map: [ // 위남 들판 — 기병 기동전의 게임 각색(북쪽 위수, 넓은 초원이 결전로)
      'MMMMMMMMMMMMMM',
      'M~~~~~~~~~~~~M',
      'M.,,,,,,,,,,.M',
      'M.,,,,,,,,,,.M',
      'M.,,,,,,,,,,.M',
      'M.,,,,,,,,,,.M',
      'M.,,,,,,,,,,.M',
      'M.,,,,,,,,,,.M',
      'M............M',
      'MMMMMMMMMMMMMM',
    ],
    players: [ // 동쪽에서 진군하는 조조군
      { char: 'cao_cao', x: 11, y: 4, commander: true },
      { char: 'xiahou_dun', x: 10, y: 3 },
      { char: 'xiahou_yuan', x: 10, y: 5 },
      { char: 'cao_ren', x: 11, y: 5 },
      { char: 'yue_jin', x: 11, y: 3 },
      { char: 'xun_yu', x: 12, y: 4 },
    ],
    enemies: [ // 서쪽 위남 주둔 연합군(정사 지휘관: 마초·한수·성의·이감) — 편성 규모·돌격 배치는 게임 각색
      { char: 'ma_chao', x: 2, y: 4, boss: true, ai: 'aggressive' },
      { char: 'han_sui', x: 2, y: 5, ai: 'aggressive' },
      { char: 'cheng_yi', x: 3, y: 3, ai: 'aggressive' },
      { char: 'li_kan', x: 3, y: 6, ai: 'aggressive' },
      { char: 'guanzhong_c', x: 4, y: 2, ai: 'aggressive' },
      { char: 'guanzhong_c', x: 4, y: 7, ai: 'aggressive' },
      { char: 'guanzhong_c', x: 5, y: 4, ai: 'aggressive' },
    ],
    rewards: { gold: 4700, items: ['ore','tonic','manual','rice'], exp: 240 },
  },
];

function buildMap(pattern) {
  return pattern.map(row => row.split('').map(ch => MAP_CHARS[ch] || 'plain'));
}

const SHOP = ['heavy_blade', 'famed_sword', 'plate', 'counter_blade', 'bulwark', 'training_charm', 'bean', 'rice', 'meat', 'tonic']; // 정비 상점 판매 품목 (장비 + 소모품 — 회복 도구의 구매 경로)


// 세력 정의. 새 세력 추가 시 need(필수 군단)·stages(전역 목록)·roster(초기 편성)를 함께 정의.
const FACTIONS = {
  liu: {
    name: '유비군',
    need: ['liu_bei', 'guan_yu', 'zhang_fei', 'jian_yong', 'sun_qian', 'mi_zhu'], // 손상 가드 기준 필수 장수
    roster: ['liu_bei', 'guan_yu', 'zhang_fei', 'jian_yong', 'sun_qian', 'mi_zhu'], // 새 게임 초기 군단
    stages: STAGES, // 기존 9전 그대로
    initEquip: { liu_bei: 'iron_sword', guan_yu: 'spear', zhang_fei: 'spear', sun_qian: 'bow', jian_yong: 'fan' }, // 새 게임 초기 장비 (미축은 무장 없음 — 기존 동작 유지)
  },
  cao: {
    name: '조조군',
    need: ['cao_cao', 'xiahou_dun', 'xiahou_yuan', 'cao_ren', 'yue_jin', 'xun_yu'],
    roster: ['cao_cao', 'xiahou_dun', 'xiahou_yuan', 'cao_ren', 'yue_jin', 'xun_yu'],
    stages: CAO_STAGES, // 조조군 전역 4전
    initEquip: { cao_cao: { weapon: 'iron_sword', armor: 'leather' }, xiahou_dun: 'spear', xiahou_yuan: 'spear', yue_jin: 'bow', xun_yu: 'fan' }, // 유비군과 동일 규칙: 지휘관 검·기병 창·궁수 활·모사 부채, 조인은 무장 없음(미축 대응) + 조조군 전용: 지휘관 가죽 갑옷 — 3전 단축 전역은 ③에서 강적이 바로 나와 무장만으로는 지휘관 생존이 불안정(실측 패배 경로 = 무방비 지휘관 전사). 유비군 규칙은 변경하지 않음
  },
};
