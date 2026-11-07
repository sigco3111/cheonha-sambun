// 신 UI 전용 보조 스크립트: 접기/펼치기 + 장수 카드 리치화 (표시층만, 게임 로직·저장 무관)
(function(){
  const setup=(sel)=>{
    const el=document.querySelector(sel); if(!el||el.dataset.ui2)return;
    el.dataset.ui2='1'; el.classList.add('ui2-clamp');
    const btn=document.createElement('button'); btn.className='ui2-more'; btn.type='button';
    btn.textContent='더 보기 ▾';
    btn.addEventListener('click',()=>{const open=el.classList.toggle('ui2-clamp');btn.textContent=open?'더 보기 ▾':'접기 ▴';});
    el.insertAdjacentElement('afterend',btn);
  };
  const run=()=>{['#brief-text','#epilogue-choice .dim','#support-box .dim'].forEach(setup)};
  new MutationObserver(run).observe(document.body,{childList:true,subtree:true}); run();
  const log=document.getElementById('battle-log');
  if(log){
    const wrap=document.createElement('div'); wrap.id='ui2-logwrap';
    const tgl=document.createElement('button'); tgl.type='button'; tgl.id='ui2-log-toggle'; tgl.textContent='전투 로그 펼치기 ▾';
    tgl.addEventListener('click',()=>{const open=wrap.classList.toggle('open');tgl.textContent=open?'전투 로그 접기 ▴':'전투 로그 펼치기 ▾';if(!open)log.scrollTop=log.scrollHeight;});
    log.insertAdjacentElement('beforebegin',wrap); wrap.appendChild(tgl); wrap.appendChild(log);
    new MutationObserver(()=>{if(!wrap.classList.contains('open'))log.scrollTop=log.scrollHeight}).observe(log,{childList:true,subtree:true});
    log.scrollTop=log.scrollHeight;}
  const hint=document.querySelector('#battle-top .dim');
  if(hint){hint.title='탭하면 전체 보기';hint.addEventListener('click',()=>hint.classList.toggle('ui2-open'));}

  // ── 장수 카드 리치화: Game.showUnitInfo 표시 결과만 대체 (계산값은 원래 코드와 동일한 소스 사용) ──
  const bar=(cls,val,max,low)=>{
    const pct=Math.max(0,Math.min(100,Math.round(val/max*100)));
    return `<div class="uc-bar ${cls}${low?' low':''}"><i style="width:${pct}%"></i><span>${val}/${max}</span></div>`;
  };
  const richCard=function(u){
    const el=document.getElementById('unit-info');
    const es=equipStats(u);
    const cid=u.charId||u.id;
    const file=(typeof CHAR_SPRITES!=='undefined'&&CHAR_SPRITES.includes(cid))?`char_${cid}`:(SPRITE_FILE[CLASSES[u.cls].sprite]||CLASSES[u.cls].sprite);
    const sideCls=u.side==='enemy'?'uc-enemy':'uc-ally';
    const stat=(label,v)=>`<div class="uc-stat"><b>${Math.round(v)}</b><s>${label}</s></div>`;
    const morale=Math.min(100,u.morale+(es.morale||0));
    const moraleTxt=es.morale&&morale!==u.morale?`${u.morale}(장비 포함 ${morale})`:`${u.morale}`;
    el.innerHTML=`<div class="uc ${sideCls}">
      <img class="uc-portrait" src="assets/units/${file}_0_0.png" alt="">
      <div class="uc-main">
        <div><span class="uc-name">${u.name}<span class="uc-lv">Lv.${u.level}</span></span><span class="uc-cls">${CLASSES[u.cls].name}</span></div>
        ${bar('uc-hp',u.hp,u.maxHp,u.hp/u.maxHp<0.35)}
        ${bar('uc-mp',u.mp,u.maxMp)}
        <div class="uc-morale">사기 ${moraleTxt}</div>
      </div></div>
      <button type="button" class="uc-more">상세 보기 ▾</button>
      <div class="uc-detail" hidden><div class="uc-stats">${stat('공격',u.atk+es.atk)}${stat('방어',u.def+es.def)}${stat('지략',u.int)}${stat('속도',u.spd)}</div>
      <div class="uc-trait">${this.traitText(u)}</div></div>`;
    const more=el.querySelector('.uc-more');
    if(more)more.addEventListener('click',()=>{const d=el.querySelector('.uc-detail');const open=d.hidden;d.hidden=!open;more.textContent=open?'접기 ▴':'상세 보기 ▾';});
  };
  const wrap=()=>{
    if(typeof Game==='undefined'||Game._ui2Card)return;
    const orig=Game.showUnitInfo.bind(Game);
    Game.showUnitInfo=function(u){
      const el=document.getElementById('unit-info');
      if(!u){el.innerHTML='';return;}
      try{richCard.call(this,u);}catch(e){orig(u);}
    };
    Game._ui2Card=true;
  };
  wrap(); document.addEventListener('DOMContentLoaded',wrap);


  // ── 전투 목표 표시줄: stage.victory/defeat 텍스트만 표시 (게임 로직 무관) ──
  const objBar=()=>{
    const main=document.getElementById('battle-main'); if(!main||document.getElementById('ui2-obj'))return;
    const bar=document.createElement('div'); bar.id='ui2-obj';
    main.insertAdjacentElement('beforebegin',bar);
    const upd=()=>{
      const b=(typeof Game!=='undefined')&&Game.battle;
      if(!b||!b.stage||Game.screen!=='screen-battle'){bar.style.display='none';return;}
      bar.style.display='';
      bar.textContent='목표: '+b.stage.victory+' · 패배: '+b.stage.defeat;
    };
    const hud=document.getElementById('hud-turn');
    if(hud)new MutationObserver(upd).observe(hud,{childList:true,characterData:true,subtree:true});
    new MutationObserver(upd).observe(main,{childList:true});
    upd();
  };
  objBar(); document.addEventListener('DOMContentLoaded',objBar);

  // ── 턴 배지 진영 색 ──
  const paint=()=>{
    const t=document.getElementById('hud-turn'); if(!t)return;
    const apply=()=>{t.classList.toggle('ui2-ally',/아군/.test(t.textContent));t.classList.toggle('ui2-enemy',/적군/.test(t.textContent));};
    new MutationObserver(apply).observe(t,{childList:true,characterData:true,subtree:true}); apply();
  };
  paint(); document.addEventListener('DOMContentLoaded',paint);

  // ── 장수 초상 칩: 편성 버튼·대상 행에 초상 추가 (이름→charId 매칭, 표시만) ──
  const picOf=(id)=>{
    if(typeof CHARS==='undefined'||!CHARS[id])return null;
    const cls=(typeof Game!=='undefined'&&Game.army&&Game.army[id])?Game.army[id].cls:CHARS[id].cls;
    const file=(typeof CHAR_SPRITES!=='undefined'&&CHAR_SPRITES.includes(id))?`char_${id}`:(SPRITE_FILE[CLASSES[cls].sprite]||CLASSES[cls].sprite);
    return `assets/units/${file}_0_0.png`;
  };
  const addPic=(el,id,cls)=>{
    if(el.dataset.ui2pic)return; const src=picOf(id); if(!src)return;
    el.dataset.ui2pic='1';
    const img=document.createElement('img'); img.className=cls; img.src=src; img.alt='';
    el.prepend(img);
  };
  const decorate=()=>{
    if(typeof CHARS==='undefined')return;
    const dp=document.getElementById('brief-deploy');
    if(dp)dp.querySelectorAll('button').forEach(b=>{
      const id=Object.keys(CHARS).find(k=>b.textContent.includes(CHARS[k].name));
      if(id)addPic(b,id,'ui2-chip-pic');
    });
    const td=document.getElementById('target-detail');
    if(td)td.querySelectorAll('.td-row').forEach(r=>{
      const id=Object.keys(CHARS).find(k=>{const h=r.querySelector('b');return h&&h.textContent===CHARS[k].name});
      if(id)addPic(r,id,'ui2-row-pic');
    });
  };
  new MutationObserver(decorate).observe(document.body,{childList:true,subtree:true});
  decorate(); document.addEventListener('DOMContentLoaded',decorate);

  // ── 결과 화면: 보상·성과 시각 구분 (기존 innerHTML을 섹션 카드로 재배치, 파싱 실패 시 원형 유지) ──
  const GC={S:'#c9a227',A:'#b8bfc8',B:'#b08d57',C:'#8a8078'};
  const groupResult=()=>{
    const el=document.getElementById('result-text');
    if(!el||!el.innerHTML||el.innerHTML.includes('rs-line'))return; // 이미 그룹화됨
    const html=el.innerHTML;
    if(!/클리어 등급|다시 도전하세요|후일담|본전역/.test(html))return; // 알 수 없는 형식은 손대지 않음
    const parts=html.split(/<br\s*\/?>/i).filter(x=>x.trim());
    if(!parts.length)return;
    let out='';let grouped=false;
    for(const part of parts){
      const gm=part.match(/클리어 등급\s*([SABC])/);
      if(gm){out+=`<div class="rs-grade"><span class="rs-badge" style="background:${GC[gm[1]]}">${gm[1]}</span><span>클리어 등급 <span class="dim">(무사망+신속 S · S 달성은 업적 해금 조건)</span></span></div>`;grouped=true;continue}
      if(/^보상:/.test(part.replace(/<[^>]+>/g,''))){out+=`<div class="rs-reward">${part}</div>`;grouped=true;continue}
      if(part.includes('업적 달성')){out+=`<div class="rs-ach">${part}</div>`;grouped=true;continue}
      out+=`<div class="rs-line">${part}</div>`;
    }
    if(!grouped)return;
    el.innerHTML=out;
  };
  const rt=document.getElementById('result-text');
  if(rt)new MutationObserver(groupResult).observe(rt,{childList:true,characterData:true,subtree:true});
  document.addEventListener('DOMContentLoaded',groupResult);

  // ── 전투 로그 색상 구분 (표시층: 클래스만 부여) ──
  const wrapLog=()=>{
    if(typeof Game==='undefined'||Game._ui2Log)return;
    const orig=Game.log.bind(Game);
    Game.log=function(msg){
      const el=document.getElementById('battle-log');
      const before=el&&el.firstChild;
      orig(msg);
      const line=el&&el.firstChild;
      if(!line||line===before)return;
      if(/격파|승리|완주/.test(msg))line.className='lg-win';
      else if(/쓰러졌|패배|함락|초과|전멸\.\.\./.test(msg))line.className='lg-lose';
      else if(/회복|치유/.test(msg))line.className='lg-heal';
      else if(/화계|고무|위협|책략/.test(msg))line.className='lg-tactic';
      else if(/사기/.test(msg))line.className='lg-morale';
    };
    Game._ui2Log=true;
  };
  wrapLog(); document.addEventListener('DOMContentLoaded',wrapLog);

  // ── 정비 기록·업적 접기 (표시층: 본문을 토글 뒤로 이동, 기본 접힘) ──
  const collapseBaseRecords=()=>{
    const rec=document.getElementById('base-records');
    if(!rec||rec._ui2rec)return;
    rec._ui2rec=true;
    const body=document.createElement('div');
    body.className='ui2-rec-body';
    while(rec.firstChild)body.appendChild(rec.firstChild);
    const btn=document.createElement('button');
    btn.className='ui2-rec-toggle';btn.type='button';
    const setLbl=()=>{btn.textContent=(body.style.display==='none'?'기록·업적 보기 ▾':'기록·업적 접기 ▴');};
    body.style.display='none';
    btn.onclick=()=>{body.style.display=body.style.display==='none'?'':'none';setLbl();};
    setLbl();
    rec.appendChild(btn);rec.appendChild(body);
  };
  const wrapBase=()=>{
    if(typeof Game==='undefined'||Game._ui2Base)return;
    const orig=Game.renderBase.bind(Game);
    Game.renderBase=function(){orig();collapseBaseRecords();};
    Game._ui2Base=true;
  };
  // ── 정비 판매 접기 (표시층) ──
  const collapseBaseSell=()=>{
    const sell=document.getElementById('base-sell');
    if(!sell||sell._ui2sell)return;
    sell._ui2sell=true;
    const body=document.createElement('div');
    body.className='ui2-rec-body';
    while(sell.firstChild)body.appendChild(sell.firstChild);
    const btn=document.createElement('button');
    btn.className='ui2-rec-toggle';btn.type='button';
    const setLbl=()=>{btn.textContent=(body.style.display==='none'?'판매 보기 ▾':'판매 접기 ▴');};
    body.style.display='none';
    btn.onclick=()=>{body.style.display=body.style.display==='none'?'':'none';setLbl();};
    setLbl();
    sell.appendChild(btn);sell.appendChild(body);
  };
  const wrapBase2=()=>{
    if(typeof Game==='undefined'||Game._ui2Base2)return;
    const orig=Game.renderBase.bind(Game);
    Game.renderBase=function(){orig();collapseBaseSell();};
    Game._ui2Base2=true;
  };
  wrapBase(); document.addEventListener('DOMContentLoaded',wrapBase);
  wrapBase2(); document.addEventListener('DOMContentLoaded',wrapBase2);
  // ── 정비 카드 전직 설명 정리 (표시층): 앞 빈 줄(<br>) 제거 + 긴 설명은 토글 뒤로 ──
  const tidyPromoHints=()=>{
    document.querySelectorAll('#base-units .promo-hint').forEach(h=>{
      if(h._ui2promo)return;
      h._ui2promo=true;
      const br=h.previousSibling;
      if(br&&br.nodeName==='BR')br.remove(); // 블록 특기 행 뒤의 빈 줄 제거
      const usable=/가능/.test(h.textContent)&&!/부족/.test(h.textContent);
      const body=document.createElement('div');
      body.className='ui2-promo-body';
      h.parentNode.insertBefore(body,h);
      body.appendChild(h);
      const btn=document.createElement('button');
      btn.className='ui2-promo-toggle';btn.type='button';
      if(usable)btn.classList.add('ui2-ready');
      const setLbl=()=>{btn.textContent=(body.style.display==='none'?'전직 정보 보기 ▾':'전직 정보 접기 ▴');};
      body.style.display=usable?'':'none'; // 지금 전직 가능하면 펼침, 조건 미충족 설명은 접힘
      btn.onclick=()=>{body.style.display=body.style.display==='none'?'':'none';setLbl();};
      setLbl();
      body.parentNode.insertBefore(btn,body);
    });
  };
  const wrapBase3=()=>{
    if(typeof Game==='undefined'||Game._ui2Base3)return;
    const orig=Game.renderBase.bind(Game);
    Game.renderBase=function(){orig();tidyPromoHints();};
    Game._ui2Base3=true;
  };
  wrapBase3(); document.addEventListener('DOMContentLoaded',wrapBase3);
})();
