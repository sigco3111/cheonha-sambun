// 진입점
'use strict';

window.addEventListener('error', (e) => { document.title = 'ERR:' + e.message + ' @' + (e.filename||'').split('/').pop() + ':' + e.lineno; });
window.addEventListener('unhandledrejection', (e) => { document.title = 'REJ:' + (e.reason && e.reason.stack ? e.reason.stack.slice(0,300) : e.reason); });
window.addEventListener('load', () => {
  loadImages(() => {
    Game.renderTitle();

    document.getElementById('btn-new').onclick = () => {
      Game.initArmy();
      Game.stageIndex = 0;
      Game.save();
      Game.renderBriefing();
    };
    document.getElementById('btn-continue').onclick = () => {
      if (Game.load()) Game.renderBriefing();
    };
    document.getElementById('btn-deploy').onclick = () => Game.startBattle();
    document.getElementById('btn-base').onclick = () => Game.renderBase();
    document.getElementById('btn-base-done').onclick = () => Game.renderBriefing();
    document.getElementById('btn-result-next').onclick = () => {
      Game.restoreMenuButtons();
      Game.renderBriefing();
    };
    document.getElementById('btn-retry').onclick = () => Game.startBattle();

    document.getElementById('btn-endturn').onclick = () => Game.runEnemyPhase();
    document.getElementById('btn-auto').onclick = () => {
      Game.auto = !Game.auto;
      Game.updateHud();
      if (Game.auto) Game.autoLoop();
    };

    const canvas = document.getElementById('battle-canvas');
    canvas.addEventListener('click', (ev) => {
      const r = canvas.getBoundingClientRect();
      const x = Math.floor((ev.clientX - r.left) / (r.width / Game.battle.w));
      const y = Math.floor((ev.clientY - r.top) / (r.height / Game.battle.h));
      if (Game.pendingTargets) Game.onTargetClick(x, y);
      else Game.onTileClick(x, y);
    });

    Game.restoreMenuButtons();

    if (new URLSearchParams(location.search).get('script') === '6') { setTimeout(() => {
      try {
        const btn = document.getElementById('btn-continue');
        if (btn.style.display === 'none') throw 'no save';
        btn.click();
        const g = Game;
        const w = g.army.guan_yu.equip.weapon;
        const ok = g.stageIndex === 2 && g.gold === 1150 && g.inventory.length === 11
          && w && w.id === 'iron_sword' && w.up === 1 && g.army.guan_yu.level >= 1;
        const pre = document.createElement('pre'); pre.id='test-result';
        pre.textContent = JSON.stringify({stage:g.stageIndex, gold:g.gold, inv:g.inventory.map(i=>i.id+(i.up?'+'+i.up:'')), guan:g.army.guan_yu.equip, lv:g.army.guan_yu.level});
        document.body.appendChild(pre);
        document.title = ok ? 'SCRIPT:OK restore stage=' + g.stageIndex + ' gold=' + g.gold + ' inv=' + g.inventory.length + ' weapon=' + w.id + '+' + w.up + ' lv=' + g.army.guan_yu.level
          : 'SCRIPT:FAIL mismatch stage=' + g.stageIndex + ' gold=' + g.gold + ' inv=' + g.inventory.length + ' w=' + JSON.stringify(w);
      } catch (err) { document.title = 'SCRIPT:FAIL ' + err; }
    }, 500); }
    // 헤드리스 테스트: ?auto=1&battle=N&fast=1&result=1
    const q = new URLSearchParams(location.search);
    if (q.get('auto')) {
      Game.initArmy();
      if (q.get('level')) { // 테스트용 성장 주입
        const lv = +q.get('level');
        for (const id of Object.keys(Game.army)) {
          const a = Game.army[id];
          for (let i = 1; i < lv; i++) { a.level++; a.maxHp += 4; a.maxMp += 2; a.atk += 1.6; a.def += 1.3; a.int += 1.4; a.spd += 1.1; }
        }
      }
      Game.stageIndex = (+q.get('battle') || 1) - 1;
      if (q.get('screen') === 'base') { Game.renderBase(); return; }
      Game.auto = !q.get('deploy'); Game.fast = !!q.get('fast');
      Game.startBattle();
            if (q.get('script') === '2') { const iv = setInterval(() => {
        if (Game.screen === 'result') {
          clearInterval(iv);
          const idx = Game.battle.stageIndex;
          if (idx + 1 >= STAGES.length) { document.title = 'SCRIPT:FAIL no-next'; return; }
          Game.showBriefing(idx + 1);
          document.title = 'SCRIPT:OK next=' + Game.stageIndex + ' briefing=' + (STAGES[Game.stageIndex] ? STAGES[Game.stageIndex].name : '?');
        }
      }, 200); }
      if (q.get('script') === '1') { (async () => {
        try {
          const b = Game.battle;
          const gy = b.units.find(u => u.charId === 'guan_yu');
          await Game.onTileClick(gy.x, gy.y);           // 선택
          if (!Game.selected || Game.moveTiles.length === 0) throw 'select/move-range fail';
          const t = Game.moveTiles[0];
          await Game.onTileClick(t[0], t[1]);            // 이동 + 메뉴 오픈
          if (!Game.menuFor) throw 'menu fail';
          await Game.menuAction('wait');                 // 대기
          if (!gy.done) throw 'wait fail';
          await Game.runEnemyPhase();                    // 적 페이즈
          document.title = 'SCRIPT:OK turn=' + b.turn + ' phase=' + b.phase;
        } catch (err) { document.title = 'SCRIPT:FAIL ' + err; }
      })(); }
      if (q.get('script') === '2' || q.get('script') === '3') { const iv = setInterval(() => {
        if (Game.screen !== 'screen-result') return;
        clearInterval(iv);
        try {
          document.getElementById('btn-result-next').click();
          if (Game.screen !== 'screen-briefing') throw 'no briefing, screen=' + Game.screen;
          if (q.get('script') === '2') {
            document.title = 'SCRIPT:OK next=' + Game.stageIndex + ' name=' + STAGES[Game.stageIndex].name;
            return;
          }
          document.getElementById('btn-base').click();
          if (Game.screen !== 'screen-base') throw 'no base';
          // 장착: 관우 무기 슬롯에 보상 아이템 장착 (실제 select 경로)
          Game.renderEquip('guan_yu');
          const sel = document.querySelector('#base-units select');
          const opt = [...sel.options].find(o => o.text.includes('철검'));
          if (!opt) throw 'no iron_sword option: ' + [...sel.options].map(o=>o.text).join('|');
          const invBefore = Game.inventory.length;
          sel.value = opt.value; sel.dispatchEvent(new Event('change'));
          const w = Game.army.guan_yu.equip.weapon;
          if (!w || w.id !== 'iron_sword') throw 'equip not applied: ' + JSON.stringify(w);
          // 강화: 관우 무기 +1 (실제 버튼 경로)
          Game.renderUpgrade('guan_yu');
          const goldBefore = Game.gold;
          const btn = [...document.querySelectorAll('#base-units button')].find(b => b.textContent === '강화' && !b.disabled);
          if (!btn) throw 'no upgrade button';
          btn.click();
          const w2 = Game.army.guan_yu.equip.weapon;
          if (!(w2.up === 1 && Game.gold < goldBefore)) throw 'upgrade fail up=' + w2.up + ' gold ' + goldBefore + '->' + Game.gold;
          document.title = 'SCRIPT:OK equip=iron_sword inv ' + invBefore + '->' + Game.inventory.length + ' up=1 gold ' + goldBefore + '->' + Game.gold;
        } catch (err) { document.title = 'SCRIPT:FAIL ' + err; }
      }, 300); }
      if (q.get('script') === '4') { (async () => {
        try {
          const b = Game.battle;
          const gy = b.units.find(u => u.charId === 'guan_yu');
          const cv = document.getElementById('battle-canvas');
          const clickTile = async (x, y) => {
            const r = cv.getBoundingClientRect();
            cv.dispatchEvent(new MouseEvent('click', { bubbles: true,
              clientX: r.left + (x + 0.5) * (r.width / b.w),
              clientY: r.top + (y + 0.5) * (r.height / b.h) }));
            await new Promise(res => setTimeout(res, 50));
          };
          await clickTile(gy.x, gy.y);
          if (!Game.selected || Game.selected.charId !== 'guan_yu') throw 'pixel select fail';
          const t = Game.moveTiles[0];
          await clickTile(t[0], t[1]);
          await new Promise(res => setTimeout(res, 400));
          if (!Game.menuFor) throw 'pixel menu fail';
          document.getElementById('menu-wait').click();
          await new Promise(res => setTimeout(res, 200));
          if (!gy.done) throw 'pixel wait fail';
          document.title = 'SCRIPT:OK pixel select/move/menu/wait';
        } catch (err) { document.title = 'SCRIPT:FAIL ' + err; }
      })(); }
      if (q.get('script') === '5') { (async () => {
        try {
          Game.initArmy();
          Game.army.guan_yu.level = CLASSES[Game.army.guan_yu.cls].promoLevel;
          Game.inventory.push({ id: 'manual', up: 0 });
          Game.renderBase();
          const btn = [...document.querySelectorAll('#base-units button')].find(b => b.textContent.startsWith('전직'));
          if (!btn) throw 'no promote button';
          const before = Game.army.guan_yu.cls;
          btn.click();
          const a = Game.army.guan_yu;
          if (a.cls === before) throw 'cls unchanged';
          if (Game.inventory.some(i => i.id === 'manual')) throw 'manual not consumed';
          document.title = 'SCRIPT:OK promote ' + before + '->' + a.cls + ' atk=' + a.atk;
        } catch (err) { document.title = 'SCRIPT:FAIL ' + err; }
      })(); }
      const watch = setInterval(() => {
        if (Game.battle && Game.battle.over) {
          clearInterval(watch);
          document.title = 'RESULT:' + (Game.battle.over.win ? 'WIN' : 'LOSE') + ' turns=' + Game.battle.turn;
          const d = document.createElement('pre');
          d.id = 'test-result';
          d.textContent = JSON.stringify({
            win: Game.battle.over.win, reason: Game.battle.over.reason, turns: Game.battle.turn,
            survivors: Game.battle.alive('player').map(u => `${u.name}:${u.hp}/${u.maxHp}`),
            kills: Game.battle.kills.length,
          }, null, 1);
          document.body.appendChild(d);
        }
      }, 200);
    }
  });
});
