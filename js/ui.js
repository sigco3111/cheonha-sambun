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
  canvas: null, ctx: null,
  zoom: 1, ZOOM_MIN: 0.4, ZOOM_MAX: 2.5,
  fx: [], threatTiles: null, _fxRunning: false,
  delay: (ms) => new Promise(r => setTimeout(r, Game.fast || Game.auto ? 30 : ms / Game.speed)),

  save() {
    if (!this.army || !Object.keys(this.army).length) { console.warn('[save 차단] 군단 데이터가 비어 있어 기존 세이브를 보호합니다'); return; } // 비정상 상태에서 원본 세이브 덮어쓰기 방지
    localStorage.setItem('cheonha3_save', JSON.stringify({
      army: this.army, inventory: this.inventory, gold: this.gold, stageIndex: this.stageIndex, cycle: this.cycle, battlesCleared: this.battlesCleared,
    }));
  },
  load() {
    const s = localStorage.getItem('cheonha3_save');
    if (!s) return false;
    const d = JSON.parse(s);
    const NEED = ['liu_bei', 'guan_yu', 'zhang_fei', 'jian_yong', 'sun_qian', 'mi_zhu'];
    if (!d.army || NEED.some(id => !d.army[id])) { // 손상 세이브: 원본을 바꾸지 않고 로드하지 않음 (자동 복구/초기화는 하지 않음)
      console.warn('[load 차단] 세이브의 군단 데이터가 비어 있거나 누락됐습니다');
      this._corruptSave = true; this.renderTitle();
      return false;
    }
    this.army = d.army; this.inventory = d.inventory; this.gold = d.gold; this.stageIndex = d.stageIndex;
    this.cycle = d.cycle || 1;
    // 구세이브(battlesCleared 없음): 신규 전투 추가 전 기준(6전)으로 누적 승리 수를 복원해 상점 로테이션 연속성 유지
    this.battlesCleared = (d.battlesCleared != null) ? d.battlesCleared : (this.stageIndex + (this.cycle - 1) * 6);
    return true;
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
      warn.textContent = '저장 데이터의 군단 정보가 비어 있어 이어하기를 중단했습니다. 원본 저장은 변경하지 않았습니다. 새 게임을 시작하면 기존 저장 위에 덮어씁니다.';
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
  },

  startBattle() {
    if (!this.army || !Object.keys(this.army).length) { console.warn('[출진 차단] 군단 데이터가 없어 전투를 시작하지 않습니다'); this._corruptSave = !!localStorage.getItem('cheonha3_save'); this.renderTitle(); return; } // 무변경 차단
    this._autoNote = null; this._equipBackup = null;
    this.battle = new Battle(STAGES[this.stageIndex], this.army, this.cycle);
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
    this.showBanner(`${this.battle.stage.name} · 아군 턴 1`);
    if (this.auto) this.autoLoop();
  },

  // ----- 정비 화면 -----
  renderBase() {
    this.show('screen-base');
    document.getElementById('base-gold').textContent = this.gold;
    const ore = this.inventory.filter(i => i.id === 'ore').length;
    document.getElementById('base-ore').textContent = ore;
    const list = document.getElementById('base-units');
    list.innerHTML = '';
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
    spLine.appendChild(document.createTextNode('특별 품목(전투마다 교체): '));
    spLine.appendChild(spBtn);
    const spNote = document.createElement('span');
    spNote.className = 'dim';
    spNote.textContent = ` 다음: ${ITEMS[nextId].name}`;
    spLine.appendChild(document.createTextNode(' '));
    spLine.appendChild(spNote);
    shop.appendChild(spLine);
    list.appendChild(shop);
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
      const promo = CLASSES[a.cls].promoTo;
      const es = equipStats(a);
      const pseudo = { cls: a.cls, tactics: CHARS[id].tactics || [], perk: a.perk };
      const cardSprite = CHAR_SPRITES.includes(id) ? `char_${id}` : (SPRITE_FILE[CLASSES[a.cls].sprite] || CLASSES[a.cls].sprite);
      div.innerHTML = `<div class="card-top"><img class="card-sprite" src="assets/units/${cardSprite}_0_0.png" alt="">
        <div class="card-body"><b>${CHARS[id].name}</b> Lv.${a.level} ${CLASSES[a.cls].name}<br>
        <span class="dim">HP ${a.maxHp} 공 ${Math.round(a.atk + es.atk)} 방 ${Math.round(a.def + es.def)} 지 ${Math.round(a.int)} 속 ${Math.round(a.spd)}${es.atk || es.def ? ` (장비 공+${es.atk} 방+${es.def})` : ''}</span><br>
        <span class="dim">${eq}</span>
        <span class="unit-trait">${this.traitText(pseudo)}</span>
        ${promo ? `<br><span class="dim promo-hint">전직 → ${CLASSES[promo].name}: Lv.${CLASSES[a.cls].promoLevel} + 전직 지침서 (${a.level >= CLASSES[a.cls].promoLevel ? (this.inventory.some(i => i.id === 'manual') ? '가능' : '지침서 부족') : '레벨 부족'})</span>` : ''}</div></div>`;
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
      if (promo && a.level >= CLASSES[a.cls].promoLevel && this.inventory.some(i => i.id === 'manual')) {
        const btnP = document.createElement('button'); btnP.textContent = `전직 → ${CLASSES[promo].name}`;
        btnP.onclick = () => {
          this.inventory.splice(this.inventory.findIndex(i => i.id === 'manual'), 1);
          a.cls = promo; a.atk += 3; a.def += 3; a.maxHp += 10; a.maxMp += 5;
          this.save(); this.renderBase();
        };
        actions.appendChild(btnP);
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
      row.innerHTML = `<b>${it.name}${e.up ? '+'+e.up : ''}</b> ${statName}+${statNow} → +${statNow + 2} (${cost}골드 + 철광석 1) `;
      const btn = document.createElement('button');
      btn.textContent = '강화';
      const oreIdx = this.inventory.findIndex(i => i.id === 'ore');
      btn.disabled = (e.up || 0) >= it.maxUp || this.gold < cost || oreIdx < 0;
      if (btn.disabled) {
        const why = (e.up || 0) >= it.maxUp ? '최대 강화' : (this.gold < cost ? '골드 부족' : '철광석 부족');
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
    // 이동 범위
    if (this.selected && !this.selected.done) {
      ctx.fillStyle = 'rgba(60,120,220,0.35)';
      for (const [x, y] of this.moveTiles) ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      // 공격 가능 적
      ctx.fillStyle = 'rgba(220,60,60,0.4)';
      const afterTiles = [...this.moveTiles, [this.selected.x, this.selected.y]];
      const c = classOf(this.selected);
      for (const e of b.alive('enemy')) {
        if (afterTiles.some(([x, y]) => Math.abs(x - e.x) + Math.abs(y - e.y) >= c.rMin && Math.abs(x - e.x) + Math.abs(y - e.y) <= c.rMax))
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
    const parts = [`이동 ${c.move + (u.perk === 'mob' ? 1 : 0)}`, `사거리 ${c.rMin === c.rMax ? c.rMax : c.rMin + '~' + c.rMax}`];
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
    if (!b || b.over || b.phase !== 'player' || this.auto) return;
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
      if (this.battle.log[this.battle.log.length - 1].includes('보물창고')) this.log(this.battle.log[this.battle.log.length - 1]);
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
    for (const [mx, my] of reach) {
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
        const d = Math.abs(x - mx) + Math.abs(y - my);
        if (d >= c.rMin && d <= c.rMax) tiles.add(x + ',' + y);
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
      btn.textContent = `${t.name} (MP ${t.mp})`;
      btn.disabled = u.mp < t.mp;
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
      this.save();
      setTimeout(() => {
        const surv = b.alive('player').map(u => `${u.name}(${u.hp}/${u.maxHp})`).join(' · ');
        document.getElementById('result-title').textContent = '승리!';
        document.getElementById('btn-retry').style.display = 'none'; // 승리 후에는 재도전 없음 (다음 전투로 진행)
        document.getElementById('btn-result-next').textContent = '다음';
        document.getElementById('result-text').innerHTML =
          `${b.over.reason}<br><span class="dim">턴 ${b.turn}/${b.stage.maxTurns} · 격파 ${b.foeKills.length} · 생존: ${surv}</span><br>` +
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
