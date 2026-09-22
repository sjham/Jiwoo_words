/* Jiwoo's Words 2. No account, analytics or remote progress storage. */
(() => {
'use strict';
const KEY='jiwoo-words/upgrade/v2', LEGACY='mid-vocab-box/v1';
const BUILTIN=window.JIWOO_CARDS;
const ORIGINAL_IDS=new Set(BUILTIN.slice(0,1001).map(c=>c.id));
const TOPICS={all:'모든 관심사',daily:'학교·일상',music:'재즈·음악',style:'옷·디자인',skin:'피부·제품'};
const GRADES={all:'전체 단계',1:'1단계',2:'2단계',3:'3단계',4:'숙어·표현',custom:'내 카드'};
const PARTS={n:'명사',v:'동사',adj:'형용사',adv:'부사',prep:'전치사',det:'한정사',pron:'대명사',idm:'표현',phr:'표현'};
const DEFAULTS={goal:20,rate:100,grade:'all',topic:'all',setSize:5,order:'daily',dir:'en-ko',theme:'auto',speechRate:.85,translate:false,sound:false};
const REWARDS=[{id:'r1',at:.25,name:'쥬에서 짬뽕'},{id:'r2',at:.5,name:'영화 관람권'},{id:'r3',at:.75,name:'외식 선택권'},{id:'r4',at:1,name:'에어팟 · 전체 완주'}];
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=o=>JSON.parse(JSON.stringify(o)), num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const day=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const shift=(key,n)=>{const d=new Date(key+'T12:00:00');d.setDate(d.getDate()+n);return day(d);};
const validDay=k=>/^\d{4}-\d{2}-\d{2}$/.test(k)&&day(new Date(k+'T12:00:00'))===k;
const safeId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,160}$/.test(id);
const object=o=>!!o&&typeof o==='object'&&!Array.isArray(o);
let tab='study', toastTimer, index=new Map(), lastSaved=null, blocked=false, transientUndo=null, voice=null, audioContext;
let library={q:'',status:'all',grade:'all',page:0};
function blank(){return {v:2,status:{},custom:[],daily:{},paid:[],unlocked:[],reviews:{},starred:[],stamps:[],prefs:{...DEFAULTS},session:null,game:null,updatedAt:0,revision:0};}
function normalize(o){
 if(!object(o)||!object(o.status)||!Array.isArray(o.custom)||!object(o.daily)) throw Error('학습 기록 형식이 아닙니다. 이 앱에서 받은 백업 파일을 선택해 주세요.');
 const s=blank();
 for(const [id,value] of Object.entries(o.status)) if(safeId(id)&&['repeat','done'].includes(value))s.status[id]=value;
 const seen=new Set(BUILTIN.map(c=>c.id));
 for(const c of o.custom){
  if(!object(c)||!safeId(c.id)||typeof c.en!=='string'||typeof c.ko!=='string'||!c.en.trim()||!c.ko.trim()||seen.has(c.id))throw Error('추가 카드에 잘못되거나 중복된 항목이 있습니다.');
  if(c.en.length>150||c.ko.length>500||String(c.ex||'').length>1500)throw Error('카드 내용이 너무 깁니다.');
  seen.add(c.id);s.custom.push({id:c.id,en:c.en.trim(),ko:c.ko.trim(),pos:typeof c.pos==='string'?c.pos:'',g:[0,1,2,3,4].includes(Number(c.g))?Number(c.g):0,ex:String(c.ex||''),kr:String(c.kr||''),note:String(c.note||''),topic:TOPICS[c.topic]?c.topic:'daily'});
 }
 for(const [k,r] of Object.entries(o.daily))if(validDay(k)&&object(r)&&Number.isFinite(r.n)&&r.n>=0){s.daily[k]={n:Math.floor(r.n),goal:Math.max(1,Math.floor(num(r.goal,20))),ids:Array.isArray(r.ids)?[...new Set(r.ids.filter(safeId))]:[]};}
 s.paid=Array.isArray(o.paid)?o.paid.filter(p=>object(p)&&Number.isFinite(p.ts)&&Number.isFinite(p.p)&&p.p>=0).map(p=>({ts:p.ts,p:p.p,rate:Math.max(0,num(p.rate,100))})):[];
 s.unlocked=Array.isArray(o.unlocked)?o.unlocked.filter(id=>REWARDS.some(r=>r.id===id)):[];
 if(object(o.reviews))for(const [id,r] of Object.entries(o.reviews))if(safeId(id)&&object(r)&&validDay(r.due)){s.reviews[id]={due:r.due,stage:Math.min(5,Math.max(0,Math.floor(num(r.stage)))),lastSeen:validDay(r.lastSeen)?r.lastSeen:'',lastGood:validDay(r.lastGood)?r.lastGood:''};}
 s.starred=Array.isArray(o.starred)?[...new Set(o.starred.filter(safeId))]:[];
 s.stamps=Array.isArray(o.stamps)?[...new Set(o.stamps.filter(validDay))]:[];
 const p=object(o.prefs)?o.prefs:{};
 s.prefs={...DEFAULTS,goal:[5,10,15,20,30,40].includes(Number(p.goal))?Number(p.goal):20,rate:Math.min(100000,Math.max(0,num(p.rate,100))),grade:Object.hasOwn(GRADES,String(p.grade))?String(p.grade):'all',topic:TOPICS[p.topic]?p.topic:'all',setSize:[5,10,20].includes(Number(p.setSize))?Number(p.setSize):5,order:['daily','new','repeat','done','star','all'].includes(p.order)?p.order:'daily',dir:['en-ko','ko-en'].includes(p.dir)?p.dir:'en-ko',theme:['auto','light','dark'].includes(p.theme)?p.theme:'auto',speechRate:[.65,.85,1].includes(Number(p.speechRate))?Number(p.speechRate):.85,translate:p.translate===true,sound:p.sound===true};
 s.updatedAt=Math.max(0,num(o.updatedAt));s.revision=Math.max(0,Math.floor(num(o.revision)));
 // Sessions are resumed only if every referenced card still exists.
 const valid=new Set([...BUILTIN,...s.custom].map(c=>c.id));
 if(object(o.session)&&Array.isArray(o.session.queue)&&o.session.queue.length<=80&&o.session.queue.every(id=>valid.has(id))){
  const q=o.session;s.session={queue:q.queue,idx:Math.min(q.queue.length,Math.max(0,Math.floor(num(q.idx)))),revealed:q.revealed===true,again:object(q.again)?q.again:{},initial:Math.max(1,num(q.initial,q.queue.length)),good:Math.max(0,num(q.good)),retry:Math.max(0,num(q.retry)),title:String(q.title||'오늘의 학습'),startedDay:validDay(q.startedDay)?q.startedDay:day(),completed:q.completed===true,skipped:Math.max(0,Math.floor(num(q.skipped))),stampEarned:q.stampEarned===true};
 }
 const g=o.game;
 if(object(g)&&['spell','cloze','match'].includes(g.type)&&Array.isArray(g.list)&&g.list.length>0&&g.list.length<=5&&new Set(g.list).size===g.list.length&&g.list.every(id=>valid.has(id))){
  const subset=a=>Array.isArray(a)&&a.every(id=>g.list.includes(id));
  const permutation=a=>subset(a)&&a.length===g.list.length&&new Set(a).size===a.length;
  if(g.type!=='match'||(permutation(g.left)&&permutation(g.right)&&subset(g.matched))){
   s.game={type:g.type,list:g.list,idx:Math.min(g.list.length,Math.max(0,Math.floor(num(g.idx)))),correct:Math.max(0,num(g.correct)),assisted:Math.max(0,num(g.assisted)),answered:g.answered===true,answer:String(g.answer||'').slice(0,200),hinted:g.hinted===true,result:g.result===true,results:Array.isArray(g.results)?g.results.filter(r=>object(r)&&g.list.includes(r.id)).map(r=>({id:r.id,passed:r.passed===true})):[],left:g.left||g.list,right:g.right||g.list,matched:g.matched||[],missed:subset(g.missed)?g.missed:[],selected:null,feedback:String(g.feedback||'영어와 뜻을 하나씩 골라 연결해 봐.'),complete:g.complete===true};
  }
 }
 return s;
}
let state=blank();
try{
 const raw=localStorage.getItem(KEY);lastSaved=raw;
 if(raw)state=normalize(JSON.parse(raw));
 else {
  const old=localStorage.getItem(LEGACY);
  if(old){state=normalize(JSON.parse(old));state.session=null;state.game=null;state.revision=0;}
 }
}catch(e){blocked=true;showAlert('저장된 기록을 읽지 못했습니다. 기록을 덮어쓰지 않았습니다. 설정에서 원본 기록을 내려받거나 정상 백업을 불러오세요.');}
function rebuild(){index=new Map([...BUILTIN,...state.custom].map(c=>[c.id,c]));}
rebuild();
function showAlert(text){$('#storage-alert').hidden=false;$('#storage-alert').textContent=text;}
function save(){
 if(blocked)return false;
 try{
  if(localStorage.getItem(KEY)!==lastSaved){blocked=true;showAlert('다른 창에서 기록이 바뀌었습니다. 이 창은 저장을 멈췄습니다. 새로고침한 뒤 이어서 사용해 주세요.');return false;}
  state.updatedAt=Date.now();state.revision++;const raw=JSON.stringify(state);localStorage.setItem(KEY,raw);lastSaved=raw;
  $('#save-status').textContent='이 기기에 저장됨';return true;
 }catch(e){$('#save-status').textContent='저장 실패';showAlert('기기에 저장하지 못했습니다. 현재 창을 닫기 전에 설정에서 백업 파일을 받아 주세요.');return false;}
}
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2500);}
function all(){return [...index.values()];}
function status(id){return state.status[id]||'new';}
function todayRecord(){return state.daily[day()]||{n:0,goal:state.prefs.goal,ids:[]};}
function counts(){const o={new:0,repeat:0,done:0,total:index.size};all().forEach(c=>o[status(c.id)]++);return o;}
function rewardCounts(){return {done:[...ORIGINAL_IDS].filter(id=>status(id)==='done').length,total:ORIGINAL_IDS.size};}
function isDue(c){if(status(c.id)==='new')return false;const r=state.reviews[c.id];return !r||r.due<=day();}
function credit(id){const k=day();let r=state.daily[k];if(!r)r=state.daily[k]={n:0,goal:state.prefs.goal,ids:[]};if(!r.ids.includes(id)){r.ids.push(id);r.n++;if(r.n===r.goal)toast(`지우, 오늘 ${r.goal}장 완성. 잘했어!`);}}
function review(id,good,source='study'){
 if(source!=='study')transientUndo=null;
 const k=day(),prev=state.reviews[id]||{stage:0,lastGood:'',due:k,lastSeen:''};
 const interval=[1,3,7,14,30,60];let stage=good?(prev.lastGood===k?prev.stage:Math.min(5,prev.stage+(prev.lastGood?1:0))):0;
 // A single guessed quiz answer never upgrades an unseen card to mastered.
 state.status[id]=good&&(source==='study'||status(id)==='done'||(prev.lastGood&&prev.lastGood<k))?'done':'repeat';
 state.reviews[id]={due:shift(k,good?interval[stage]:1),stage,lastSeen:k,lastGood:good?k:''};credit(id);
 for(const r of REWARDS)if(rewardCounts().done>=Math.ceil(ORIGINAL_IDS.size*r.at)&&!state.unlocked.includes(r.id))state.unlocked.push(r.id);
}
function shuffled(a){const x=a.slice();for(let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[x[i],x[j]]=[x[j],x[i]];}return x;}
function filtered(){return all().filter(c=>(state.prefs.grade==='all'||(state.prefs.grade==='custom'?state.custom.some(x=>x.id===c.id):String(c.g)===state.prefs.grade))&&(state.prefs.topic==='all'||c.topic===state.prefs.topic));}
function studyPool(order=state.prefs.order){
 const list=filtered();if(order==='new')return list.filter(c=>status(c.id)==='new');if(order==='repeat')return list.filter(c=>status(c.id)==='repeat');if(order==='done')return list.filter(c=>status(c.id)==='done');if(order==='star')return list.filter(c=>state.starred.includes(c.id));if(order==='all')return list;
 return [...list.filter(isDue).sort((a,b)=>(state.reviews[a.id]?.due||'').localeCompare(state.reviews[b.id]?.due||'')),...list.filter(c=>status(c.id)==='new')];
}
function startStudy(size=state.prefs.setSize,title='오늘의 학습'){
 if(blocked){toast('설정에서 기록 상태를 확인해 주세요.');return;}
 const pool=studyPool(),chosen=pool.slice(0,size);state.session={queue:chosen.map(c=>c.id),idx:0,revealed:false,again:{},initial:chosen.length,good:0,retry:0,title,startedDay:day(),completed:false,skipped:0,stampEarned:false};transientUndo=null;save();tab='study';render();
}
function finishSession(s){if(s.completed||!s.queue.length)return;s.completed=true;s.stampEarned=!s.skipped&&(s.good+s.retry>0);if(s.stampEarned&&!state.stamps.includes(day()))state.stamps.push(day());save();chime();}
function mark(good){const s=state.session;if(!s||s.idx>=s.queue.length||!s.revealed||blocked)return;
 transientUndo={session:clone(s),status:clone(state.status),reviews:clone(state.reviews),daily:clone(state.daily),unlocked:clone(state.unlocked),stamps:clone(state.stamps)};
 const id=s.queue[s.idx];review(id,good);if(!good&&!s.again[id]){s.again[id]=1;s.queue.splice(Math.min(s.idx+4,s.queue.length),0,id);}s[good?'good':'retry']++;s.idx++;s.revealed=false;if(s.idx===s.queue.length)finishSession(s);save();render();
}
function undo(){if(!transientUndo||blocked)return;for(const k of ['session','status','reviews','daily','unlocked','stamps'])state[k]=transientUndo[k];transientUndo=null;save();render();toast('방금 분류와 학습 기록을 되돌렸어요.');}
function bookmark(id){if(blocked)return;state.starred=state.starred.includes(id)?state.starred.filter(x=>x!==id):[...state.starred,id];save();const b=document.querySelector(`[data-star="${id}"]`);if(b){b.setAttribute('aria-pressed',state.starred.includes(id));b.textContent=state.starred.includes(id)?'북마크됨':'북마크';}}
function options(map,current){return Object.entries(map).map(([value,label])=>`<option value="${value}" ${String(current)===value?'selected':''}>${esc(label)}</option>`).join('');}
function pos(c){return c.pos.split('/').map(p=>PARTS[p]||p).join(' · ');}
function tags(c){return `<div class="badges"><span class="badge">${esc(GRADES[c.g]||'내 카드')}</span><span class="badge">${esc(pos(c))}</span><span class="badge">${esc(TOPICS[c.topic])}</span>${status(c.id)!=='new'?`<span class="badge ${status(c.id)==='done'?'good':'bad'}">${status(c.id)==='done'?'완성함':'복습 중'}</span>`:''}</div>`;}
const speakerIcon='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>';
function speakButton(c,sentence=false){return `<button class="speaker" data-speak="${esc(c.id)}" data-sentence="${sentence}" aria-label="${sentence?'예문':esc(c.en)} 듣기">${speakerIcon}</button>`;}
function cleanEx(c){return c.ex.replace(/[{}]/g,'');}
function example(c){
 const ex=c.ex.includes('{')?esc(c.ex).replace(/\{([^}]+)\}/g,'<mark>$1</mark>'):esc(c.ex);
 return `<div class="example" lang="en">${ex}</div><div class="example-actions">${speakButton(c,true)}${c.kr?'<button class="button small" data-trans aria-expanded="'+state.prefs.translate+'">해석 '+(state.prefs.translate?'접기':'보기')+'</button>':''}</div>${c.kr?`<p class="translation" ${state.prefs.translate?'':'hidden'}>${esc(c.kr)}</p>`:''}${c.note?`<details class="learning-note"><summary>표현·기억 메모</summary><p>${esc(c.note)}</p></details>`:''}`;
}
function miniProgress(value,max){return `<div class="progress" role="progressbar" aria-label="학습 진행" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${Math.min(max,value)}"><span style="width:${Math.min(100,max?value/max*100:0)}%"></span></div>`;}
function heading(kicker,title,description=''){return `<div class="intro"><div><div class="kicker">${esc(kicker)}</div><h1>${esc(title)}</h1>${description?`<p>${esc(description)}</p>`:''}</div></div>`;}
function filterControls(){return `<details class="filters"><summary>학습 설정 · ${esc(GRADES[state.prefs.grade])} / ${esc(TOPICS[state.prefs.topic])}</summary><div class="filter-grid"><label>단계<select data-pref="grade">${options(GRADES,state.prefs.grade)}</select></label><label>관심사<select data-pref="topic">${options(TOPICS,state.prefs.topic)}</select></label><label>출제 순서<select data-pref="order">${options({daily:'오늘 복습 + 새 단어',new:'새 단어만',repeat:'반복함만',done:'완성함 복습',star:'북마크만',all:'전체'},state.prefs.order)}</select></label><label>한 묶음<select data-pref="setSize">${options({5:'5장',10:'10장',20:'20장'},state.prefs.setSize)}</select></label><label>카드 방향<select data-pref="dir">${options({'en-ko':'영어 → 뜻','ko-en':'뜻 → 영어'},state.prefs.dir)}</select></label></div><p class="setting-help">단계는 난도별 묶음이며 특정 교과서의 수록 목록은 아닙니다. 변경한 범위는 새 묶음부터 적용됩니다.</p><button class="button small" data-action="new-study">이 설정으로 새 묶음</button></details>`;}
function studyView(){
 const c=counts(),t=todayRecord(),s=state.session;let card;
 if(!s){card=`<div class="note-card complete"><div class="stamp">Side A<br>Ready</div><h2>지우, 오늘은 어떤 단어?</h2><p>복습할 단어부터, 한 번에 ${state.prefs.setSize}장.<br>정답을 보기 전에 잠깐 떠올려 봐.</p><div class="topic-pills" style="justify-content:center">${['all','music','style','skin'].map(k=>`<button data-topic="${k}" class="${state.prefs.topic===k?'selected':''}">${TOPICS[k]}</button>`).join('')}</div><button class="button primary" data-action="start-study">${state.prefs.setSize}장 시작하기</button></div>`;}
 else if(!s.queue.length){card=`<div class="note-card empty"><h2>이 범위는 다 봤어요.</h2><p>다른 관심사나 출제 순서를 골라 새 묶음을 시작해 보세요.</p></div>`;}
 else if(s.idx>=s.queue.length){card=`<div class="note-card complete"><div class="stamp">Set<br>Complete</div><h2>${s.initial}장 묶음, 끝.</h2><p>기억함 ${s.good}회 · 다시 보기 ${s.retry}회<br>${s.stampEarned?'오늘의 노트에 스탬프를 남겼어요.':'건너뛴 카드는 다음에 다시 볼 수 있어요.'}</p><div class="action-row"><button class="button primary" data-action="start-study">다음 ${state.prefs.setSize}장</button><button class="button" data-tab="quiz">다르게 플레이</button></div><button class="text-link" data-action="undo" ${!transientUndo?'disabled':''}>방금 분류 되돌리기</button></div>`;}
 else {const x=index.get(s.queue[s.idx]);if(!x)return '<p>카드를 불러오지 못했습니다. 설정에서 백업 후 새로고침해 주세요.</p>';
 const reversed=state.prefs.dir==='ko-en';
 card=`<div class="note-card"><div class="card-top"><span>${esc(s.title)} · ${s.idx+1} / ${s.queue.length}${s.queue.length>s.initial?' · 재도전 포함':''}</span><strong>Side A</strong></div><div class="card-body">${tags(x)}<div class="word-row">${reversed?`<div class="meaning-question">${esc(x.ko)}</div>`:`<div class="word" lang="en">${esc(x.en)}</div>${speakButton(x)}`}</div>${!s.revealed?`<p class="recall">${reversed?'영어 표현':'뜻'}을 먼저 떠올려 봐.</p><button class="button primary wide" data-action="reveal">${reversed?'영어':'뜻'} 확인하기</button>`:`<div class="answer"><div class="meaning">${reversed?`<span lang="en">${esc(x.en)}</span> ${speakButton(x)}`:esc(x.ko)}</div>${example(x)}</div>`}</div>${s.revealed?'<div class="card-actions"><button class="button bad" data-mark="no">다시 볼래</button><button class="button good" data-mark="yes">기억했어</button></div>':''}<div class="card-bottom"><button class="plain-button" data-action="undo" ${!transientUndo?'disabled':''}>되돌리기</button><button class="plain-button bookmark" data-star="${x.id}" aria-pressed="${state.starred.includes(x.id)}">${state.starred.includes(x.id)?'북마크됨':'북마크'}</button><button class="plain-button" data-action="skip">건너뛰기</button></div></div>`;
 }
 return heading('A LITTLE, EVERY DAY',t.n>=t.goal?'오늘의 목표를 채웠어.':'오늘도, 한 장씩.','한 번에 많이 외우기보다, 기억나는 단어를 하나 더.')+`<div class="study-layout"><div class="study-main"><div class="today-strip"><span>오늘 <strong>${t.n} / ${t.goal}장</strong></span><span class="muted">${t.n>=t.goal?'오늘 목표 달성':`목표까지 ${t.goal-t.n}장`}</span></div><div style="margin-bottom:15px">${miniProgress(t.n,t.goal)}</div>${card}<p class="kbd-hint">Space 정답 보기 · 1 다시 볼래 · 2 기억했어 · S 발음 듣기</p>${filterControls()}</div><aside class="rail"><div class="challenge"><small>ONE TRACK CHALLENGE</small><h3>한 곡 듣는 기분으로<br>딱 5장.</h3><p>시간 제한 없이 짧게.<br>끝내고 쉬어도 좋아.</p><button class="button wide" data-action="challenge">5장 챌린지 시작</button></div><div class="rail-box"><div class="rail-title">Your collection</div><div class="rail-stats"><div><strong>${c.done}</strong><span>완성함</span></div><div><strong>${c.repeat}</strong><span>반복함</span></div><div><strong>${all().filter(isDue).length}</strong><span>복습할 때</span></div></div><div class="tiny-progress">${miniProgress(c.done,c.total)}</div><p>총 ${c.total.toLocaleString()}장 중 ${Math.round(c.done/c.total*100)}% 완성</p></div><div class="rail-box"><div class="rail-title">Pick your mood</div><p>오늘은 관심 가는 주제로.</p><div class="topic-pills">${['all','music','style','skin'].map(k=>`<button data-topic="${k}" class="${state.prefs.topic===k?'selected':''}">${TOPICS[k]}</button>`).join('')}</div></div></aside></div>`;
}
function weekStart(k){const d=new Date(k+'T12:00:00');return shift(k,-((d.getDay()+6)%7));}
function dayPoints(r){return r?Math.min(r.n,r.goal*2)*.5+(r.n>=r.goal?10:0):0;}
function weeks(){const groups={};for(const [k,r] of Object.entries(state.daily)){const w=weekStart(k);const a=groups[w]||(groups[w]={cards:0,hits:0,points:0});a.cards+=r.n;a.hits+=r.n>=r.goal?1:0;a.points+=dayPoints(r);}for(const w of Object.values(groups))if(w.hits>=5)w.points+=20;return groups;}
function earned(){return Object.values(weeks()).reduce((n,w)=>n+w.points,0);}
function balance(){return Math.max(0,earned()-state.paid.reduce((n,p)=>n+p.p,0));}
function money(points){return Math.round(points*state.prefs.rate).toLocaleString()+'원';}
function recordsView(){
 const t=todayRecord(),w=weeks()[weekStart(day())]||{cards:0,hits:0,points:0},c=rewardCounts();
 return heading('THE COLLECTION','쌓인 만큼, 나의 기록','지우의 완성함과 아빠와의 약속을 함께 기록해요.')+`<div class="summary-grid"><div class="stat"><span>이번 주 학습</span><strong>${w.cards}<small> 장</small></strong></div><div class="stat"><span>이번 주 포인트</span><strong>${w.points}<small> P</small></strong></div><div class="stat"><span>완주 스탬프</span><strong>${state.stamps.length}<small> 개</small></strong></div></div><section class="section-card"><h2>최근 7일</h2><div class="week">${Array.from({length:7},(_,i)=>{const k=shift(day(),i-6),r=state.daily[k],hit=r&&r.n>=r.goal;return `<div class="day ${hit?'hit':''} ${i===6?'today':''}"><small>${'일월화수목금토'[new Date(k+'T12:00:00').getDay()]}</small><strong>${r?.n||0}</strong><small>${hit?'달성':'장'}</small></div>`;}).join('')}</div><p class="muted small">하루 한 번, 학습 묶음이나 플레이를 끝내면 완주 스탬프 1개. ${state.stamps.length?`최근 완주: ${esc(state.stamps.at(-1))}`:'오늘의 첫 스탬프를 남겨 봐.'}</p><div class="stamp-line">${state.stamps.slice(-7).map(k=>`<span class="stamp-small">${esc(k.slice(5))} · Played</span>`).join('')}</div></section><section class="section-card"><h2>아빠와의 약속</h2><p class="muted small">첫 노트의 1,001장을 완성함에 모으면 선물이 열려요. 한 번 열린 선물은 그대로 유지됩니다.</p><div class="reward-list">${REWARDS.map(r=>{const need=Math.ceil(c.total*r.at),on=state.unlocked.includes(r.id)||c.done>=need;return `<div class="reward ${on?'unlocked':''}"><small>${Math.round(r.at*100)}% · ${on?'달성':'진행 중'}</small><strong>${r.name}</strong>${miniProgress(c.done,need)}<small>${on?'약속한 선물을 아빠와 확인해 봐.':`${need.toLocaleString()}장 중 ${c.done}장 · ${Math.max(0,need-c.done)}장 남음`}</small></div>`;}).join('')}</div><p class="setting-help">선물은 기존 ${c.total.toLocaleString()}장 기준 그대로. 추가 509장은 별도 확장 학습이며, 이미 열린 선물은 유지됩니다.</p></section><section class="section-card"><h2>용돈 포인트</h2><p>아직 받지 않은 포인트 <strong>${balance()}P · ${money(balance())}</strong></p><p class="muted small">오늘 처음 학습한 카드마다 0.5P · 하루 목표 달성 +10P · 한 주 5일 달성 +20P.<br>카드 포인트는 하루 목표의 두 배까지. 같은 카드를 같은 날 다시 풀어도 중복 적립되지 않아요.</p><details class="subtle"><summary>아빠와 함께 확인</summary><p class="setting-help">자동 결제 기능은 없으며, 실제 지급한 용돈을 기록합니다.</p><button class="button" data-action="payout" ${balance()<=0?'disabled':''}>용돈 지급 완료 기록</button><div class="storage-info">${state.paid.slice().sort((a,b)=>b.ts-a.ts).slice(0,5).map(p=>`${new Date(p.ts).toLocaleDateString('ko-KR')} · ${p.p}P · ${Math.round(p.p*p.rate).toLocaleString()}원 지급`).join('<br>')}</div></details></section><section class="section-card"><h2>주별 기록</h2><div class="table-wrap"><table><thead><tr><th>시작일</th><th>학습</th><th>달성</th><th>포인트</th></tr></thead><tbody>${Object.entries(weeks()).sort(([a],[b])=>b.localeCompare(a)).map(([k,x])=>`<tr><td>${k}</td><td>${x.cards}장</td><td>${x.hits}일</td><td>${x.points}P</td></tr>`).join('')||'<tr><td colspan="4">첫 학습 뒤 기록이 나타납니다.</td></tr>'}</tbody></table></div></section>`;
}
function chime(){if(!state.prefs.sound)return;try{audioContext||=new(window.AudioContext||window.webkitAudioContext)();audioContext.resume();[261.63,329.63,392].forEach((freq,i)=>{const o=audioContext.createOscillator(),g=audioContext.createGain(),at=audioContext.currentTime+i*.09;o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(.045,at+.02);g.gain.exponentialRampToValueAtTime(.001,at+.4);o.connect(g);g.connect(audioContext.destination);o.start(at);o.stop(at+.45);});}catch{}}
function speak(id,sentence){const c=index.get(id);if(!c)return;if(!('speechSynthesis'in window)){toast('이 브라우저에서는 음성 읽기를 지원하지 않습니다.');return;}speechSynthesis.cancel();const text=sentence?cleanEx(c):c.en;const utterance=new SpeechSynthesisUtterance(text);const voices=speechSynthesis.getVoices();voice=voices.find(v=>v.lang==='en-US')||voices.find(v=>/^en/.test(v.lang));if(voice)utterance.voice=voice;utterance.lang=voice?.lang||'en-US';utterance.rate=state.prefs.speechRate;utterance.onerror=e=>{if(!['interrupted','canceled'].includes(e.error))toast('음성을 재생하지 못했습니다. 기기의 영어 음성 설정을 확인해 주세요.');};speechSynthesis.speak(utterance);}
function shape(s){return s.split(/\s+/).map(w=>w[0]+'·'.repeat(Math.max(0,w.length-1))).join(' ');}
function answerForm(c){return c.ex.match(/\{([^}]+)\}/)?.[1]||c.en;}
function normalAnswer(s){return s.toLowerCase().trim().replace(/[’‘]/g,"'").replace(/\s+/g,' ').replace(/[.!?]+$/,'');}
function startGame(type){
 if(blocked)return;
 let pool=filtered().filter(c=>type==='cloze'?/\{[^}]+\}/.test(c.ex):c.g!==4);
 const usedMeanings=new Set();pool=shuffled(pool).filter(c=>{if(type!=='match')return true;if(usedMeanings.has(c.ko))return false;usedMeanings.add(c.ko);return true;});
 pool.sort((a,b)=>(status(a.id)==='done'?1:0)-(status(b.id)==='done'?1:0));
 const list=pool.slice(0,type==='match'?4:5).map(c=>c.id);
 if(list.length<(type==='match'?2:1)){toast('이 범위에는 문제가 부족해요. 다른 관심사나 단계를 골라 주세요.');return;}
 state.game={type,list,idx:0,correct:0,assisted:0,answered:false,answer:'',hinted:false,result:null,results:[],left:shuffled(list),right:shuffled(list),matched:[],missed:[],selected:null,feedback:'영어와 뜻을 하나씩 골라 연결해 봐.',complete:false};save();render();
}
function gameComplete(g){if(g.complete)return;g.complete=true;if(!state.stamps.includes(day()))state.stamps.push(day());save();chime();}
function submitAnswer(value){const g=state.game;if(!g||g.answered||blocked)return;const c=index.get(g.list[g.idx]);if(!c)return;const target=g.type==='cloze'?answerForm(c):c.en;
 const variants={color:['colour'],favorite:['favourite'],neighbor:['neighbour'],organize:['organise'],analyze:['analyse'],behavior:['behaviour'],gray:['grey'],center:['centre'],realize:['realise'],practice:['practise'],cancel:['cancel'],skincare:['skin care'],moisturizer:['moisturiser']};
 const accepted=[target,...(g.type==='spell'?(variants[c.en]||[]):[])].map(normalAnswer);
 g.answer=value;g.result=accepted.includes(normalAnswer(value));g.answered=true;save();render();
}
function nextQuestion(){const g=state.game;if(!g||!g.answered||blocked)return;const id=g.list[g.idx];const passed=g.result&&!g.hinted;
 review(id,passed,'quiz');g.correct+=passed?1:0;g.assisted+=g.result&&g.hinted?1:0;g.results.push({id,passed});g.idx++;g.answered=false;g.hinted=false;g.answer='';g.result=null;if(g.idx>=g.list.length)gameComplete(g);save();render();}
function match(side,id){const g=state.game;if(!g||g.type!=='match'||g.matched.includes(id)||g.complete||blocked)return;
 if(!g.selected){g.selected={side,id};g.feedback='이제 반대쪽에서 짝을 골라 봐.';}
 else if(g.selected.side===side){g.selected={side,id};g.feedback='선택을 바꿨어. 반대쪽에서 짝을 골라 봐.';}
 else {if(g.selected.id===id){g.matched.push(id);review(id,!g.missed.includes(id),'match');g.feedback=`맞았어. ${g.matched.length} / ${g.list.length}쌍 연결!`;if(g.matched.length===g.list.length)gameComplete(g);}else{g.missed=[...new Set([...g.missed,id,g.selected.id])];g.feedback=`다른 짝이야. ${index.get(g.selected.id).en} = ${index.get(g.selected.id).ko}. 다시 골라 봐.`;}g.selected=null;}
 save();render();
}
function quizView(){
 const g=state.game;
 if(!g)return heading('PLAY A LITTLE','단어와 노는 시간','5문제, 혹은 4쌍. 한 판만 끝내도 충분해.')+`<div class="section-card"><div class="filter-grid"><label>관심사<select data-pref="topic">${options(TOPICS,state.prefs.topic)}</select></label><label>단계<select data-pref="grade">${options(GRADES,state.prefs.grade)}</select></label></div><p class="setting-help">관심사와 단계는 학습 탭과 함께 사용합니다. 숙어 빈칸은 ‘전체 단계’ 또는 ‘숙어·표현’으로 선택하세요.</p></div><div class="mode-grid"><button class="mode-card" data-game="spell"><span class="number">01</span><strong>단어를 꺼내 봐</strong><p>뜻과 첫 글자를 보고 영어를 직접 입력해 보기.</p></button><button class="mode-card" data-game="cloze"><span class="number">02</span><strong>문장을 완성해</strong><p>표현을 문장에 맞게 바꾸어 빈칸 채우기.</p></button><button class="mode-card" data-game="match"><span class="number">03</span><strong>네 쌍을 찾아라</strong><p>영어와 뜻 연결하기. 틀리면 힌트를 보고 다시.</p></button></div><p class="preview-note">정답을 맞힌 카드는 복습 대상으로 남습니다. 다른 날에도 기억하면 완성함으로 이동해요.</p>`;
 const name={spell:'단어를 꺼내 봐',cloze:'문장을 완성해',match:'네 쌍을 찾아라'}[g.type];
 let inner;
 if(g.complete){inner=`<div class="note-card complete"><div class="stamp">Side B<br>Played</div><h2>오늘의 한 판, 완료.</h2><p>${g.type==='match'?`${g.list.length}쌍을 모두 찾았어.`:`도움 없이 ${g.correct} / ${g.list.length}개 · 힌트로 ${g.assisted}개`}<br>헷갈렸던 표현은 복습할 목록에 남겨 뒀어.</p>${g.type!=='match'?`<div class="storage-info">${g.results.map(r=>`${r.passed?'기억함':'다시 보기'} · ${esc(index.get(r.id).en)}`).join('<br>')}</div>`:''}<div class="action-row" style="margin-top:22px"><button class="button primary" data-game="${g.type}">한 판 더</button><button class="button" data-action="game-menu">다른 플레이</button></div></div>`;}
 else if(g.type==='match'){
 inner=`<div class="section-card"><div class="today-strip"><strong>${g.matched.length} / ${g.list.length}쌍</strong><span class="muted">시간 제한 없음</span></div><div class="match-grid">${g.left.map((id,i)=>[tile('left',id),tile('right',g.right[i])].join('')).join('')}</div><p class="match-feedback" role="status">${esc(g.feedback)}</p></div>`;
 }else{
 const c=index.get(g.list[g.idx]),target=g.type==='cloze'?answerForm(c):c.en;
 inner=`<div class="note-card"><div class="card-top"><span>${g.idx+1} / ${g.list.length}문제</span><strong>Side B</strong></div><div class="card-body">${tags(c)}${g.type==='spell'?`<div class="meaning-question">${esc(c.ko)}</div><p class="recall" lang="en">${esc(shape(c.en))}</p>`:`<div class="quiz-prompt" lang="en">${esc(c.ex).replace(/\{[^}]+\}/,'<span class="blank">&nbsp;?&nbsp;</span>')}</div><p class="muted small">기본 표현: <span lang="en">${esc(c.en)}</span> · 문장에 맞는 형태로 입력</p>`}
 ${!g.answered?`<form id="answer-form" style="width:100%"><label class="small" for="quiz-answer">${g.type==='spell'?'이 카드의 영어 단어':'빈칸에 들어갈 표현'}</label><input class="quiz-input" id="quiz-answer" name="answer" aria-label="정답 입력" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="200" placeholder="영어로 입력" value="${esc(g.answer)}"><button class="button primary wide" type="submit">정답과 비교</button></form><div class="action-row" style="margin-top:12px"><button class="plain-button" data-action="hint">힌트 보기</button><button class="plain-button" data-action="show-answer">모르겠어 · 답 보기</button></div>${g.hinted?`<p class="learning-note">${esc(shape(target))}${g.type==='cloze'&&c.kr?'<br>'+esc(c.kr):''}</p>`:''}`:`<div class="answer"><div class="quiz-verdict ${g.result?'':'wrong'}">${g.result?(g.hinted?'힌트를 보고 기억했어.':'기억에서 꺼냈어. 좋아!'):'이 카드의 답과 비교해 봐.'}<div class="quiz-answer" lang="en">${esc(target)}</div>${!g.result?`<span>입력한 답: ${esc(g.answer||'(답 보기)')}</span>`:''}</div>${example(c)}<p class="setting-help">${g.type==='cloze'?'뜻이 비슷한 다른 표현도 있을 수 있어요. 여기서는 제시한 기본 표현을 연습합니다.':'다른 뜻이 맞더라도 이 카드의 표제어와 비교합니다.'}</p><button class="button primary wide" style="margin-top:18px" data-action="next-question">${g.idx+1===g.list.length?'이번 판 마치기':'다음 문제'}</button></div>`}</div></div>`;
 }
 return heading('PLAY A LITTLE',name)+`<div class="quiz-area">${inner}${g.complete?'':'<button class="text-link" data-action="game-menu">플레이 선택으로</button>'}</div>`;
}
function tile(side,id){const g=state.game,c=index.get(id),matched=g.matched.includes(id),selected=g.selected?.side===side&&g.selected.id===id;return `<button class="match-tile ${matched?'matched':''} ${selected?'selected':''}" data-match="${id}" data-side="${side}" aria-pressed="${selected}" ${matched?'disabled':''}>${side==='left'?esc(c.en):esc(c.ko)}${matched?' · 완료':''}</button>`;}
function libraryView(){
 const q=library.q.toLowerCase().trim();let found=all().filter(c=>(!q||[c.en,c.ko,c.ex,c.kr].some(s=>s.toLowerCase().includes(q)))&&(library.grade==='all'||(library.grade==='custom'?state.custom.some(x=>x.id===c.id):String(c.g)===library.grade))&&(library.status==='all'||(library.status==='star'?state.starred.includes(c.id):library.status==='due'?isDue(c):status(c.id)===library.status)));
 const pages=Math.max(1,Math.ceil(found.length/30));library.page=Math.max(0,Math.min(library.page,pages-1));const items=found.slice(library.page*30,(library.page+1)*30);
 return heading('WORD ARCHIVE','나의 단어장',`단어 ${all().filter(c=>c.g!==4).length.toLocaleString()}개 · 숙어와 표현 ${all().filter(c=>c.g===4).length}개. 펼치면 예문과 해석까지.`)+`<div class="searchbar"><label>검색<input id="library-search" type="search" placeholder="단어·뜻·예문 검색" value="${esc(library.q)}"></label><label>모아 보기<select data-filter="status">${options({all:'전체',new:'새 단어',repeat:'반복함',done:'완성함',star:'북마크',due:'오늘 복습'},library.status)}</select></label><label>단계<select data-filter="grade">${options(GRADES,library.grade)}</select></label></div><p class="muted small" style="margin-bottom:12px">${found.length.toLocaleString()}개 검색됨 · ${library.page+1} / ${pages}페이지</p><div class="library-list">${items.map(c=>`<details class="library-item"><summary><strong lang="en">${esc(c.en)}</strong><span class="gloss">${esc(c.ko)}</span><span class="badge ${status(c.id)==='done'?'good':status(c.id)==='repeat'?'bad':''}">${status(c.id)==='new'?'새 단어':status(c.id)==='done'?'완성함':'반복함'}</span></summary><div class="library-detail"><p class="muted small" style="padding-top:12px">${esc(pos(c))} · ${esc(TOPICS[c.topic])}${state.reviews[c.id]?` · 다음 복습 ${esc(state.reviews[c.id].due)}`:''}</p>${example(c)}<div class="action-row"><button class="button small bookmark" data-star="${c.id}" aria-pressed="${state.starred.includes(c.id)}">${state.starred.includes(c.id)?'북마크됨':'북마크'}</button><button class="button small" data-open-card="${c.id}">이 카드 학습</button>${state.custom.some(x=>x.id===c.id)?`<button class="button small danger" data-delete="${c.id}">내 카드 삭제</button>`:''}</div></div></details>`).join('')||'<div class="empty">검색 결과가 없어요. 다른 단어나 범위를 골라 보세요.</div>'}</div><div class="pagination"><button class="button small" data-page="-1" ${library.page===0?'disabled':''}>이전</button><span class="small muted">${library.page+1} / ${pages}</span><button class="button small" data-page="1" ${library.page+1>=pages?'disabled':''}>다음</button></div><details class="section-card"><summary>내 카드 추가</summary><form id="add-card" class="form-grid" style="margin-top:18px"><label>영어<input name="en" required maxlength="150" placeholder="예: sketch"></label><label>뜻<input name="ko" required maxlength="500" placeholder="예: 스케치, 밑그림"></label><label>품사<select name="pos">${options({'':'선택',n:'명사',v:'동사',adj:'형용사',adv:'부사',prep:'전치사',phr:'표현'},'')}</select></label><label>단계<select name="g">${options({0:'내 카드',1:'1단계',2:'2단계',3:'3단계',4:'숙어·표현'},0)}</select></label><label class="full">예문<input name="ex" maxlength="1500" placeholder="문장 빈칸: I {am interested in} jazz."></label><label class="full">해석<input name="kr" maxlength="1500" placeholder="나는 재즈에 관심이 있다."></label><div class="full"><button class="button primary">카드 추가</button></div></form></details><details class="section-card"><summary>여러 장 한꺼번에 추가</summary><p class="setting-help">한 줄에 ‘단어, 뜻, 예문’. 엑셀에서 복사한 탭 구분도 가능합니다. 뜻에 쉼표가 들어가면 탭으로 구분하세요.</p><form id="bulk-add"><label>붙여넣기<textarea name="bulk" maxlength="200000" placeholder="sketch, 스케치, I drew a quick sketch."></textarea></label><button class="button" style="margin-top:12px">추가하기</button></form></details>`;
}
function settingsView(){return heading('MAKE IT YOURS','나에게 맞게','기록을 지키고, 편한 속도로 공부하기.')+`<section class="section-card"><h2>학습과 화면</h2><div class="form-grid"><label>하루 목표<select data-pref="goal">${options({5:'5장',10:'10장',15:'15장',20:'20장',30:'30장',40:'40장'},state.prefs.goal)}</select></label><label>화면<select data-pref="theme">${options({auto:'기기 설정 따르기',light:'밝은 종이',dark:'밤의 노트'},state.prefs.theme)}</select></label><label>발음 속도<select data-pref="speechRate">${options({'.65':'천천히','.85':'편안하게',1:'보통'},state.prefs.speechRate)}</select></label><label>1P의 용돈<input type="number" id="point-rate" min="0" max="100000" step="1" value="${state.prefs.rate}"></label><label class="check"><input type="checkbox" data-pref="translate" ${state.prefs.translate?'checked':''}>해석을 바로 표시</label><label class="check"><input type="checkbox" data-pref="sound" ${state.prefs.sound?'checked':''}>완주할 때 짧은 코드 소리</label></div><p class="setting-help">이미 공부한 날의 목표는 유지되고, 바꾼 목표는 다음 학습일에 적용돼요. 발음은 기기에서 제공하는 영어 음성입니다.</p></section><section class="section-card"><h2>백업과 기기 이동</h2><p class="storage-info">진도는 이 기기의 브라우저에만 저장됩니다. 기기를 바꾸기 전에는 백업 파일을 받아 새 기기에서 불러오세요. 브라우저 데이터 삭제 시 기록이 사라질 수 있습니다.</p><div class="action-row"><button class="button primary" data-action="backup">백업 파일 받기</button><label class="button">백업 불러오기<input type="file" id="restore-file" accept=".json,application/json" hidden></label><button class="button" data-action="raw-backup">저장 원본 받기</button></div><p class="setting-help">불러오기는 현재 미리보기 기록을 교체합니다. 먼저 현재 기록을 백업해 두세요.</p><details class="subtle"><summary>기존 지우 앱의 진도</summary><p class="storage-info">처음 미리보기를 열면 같은 브라우저에 있는 기존판 진도를 복사합니다. 이후 두 앱은 따로 저장되며, 기존판 기록은 수정하지 않습니다.</p><button class="button" data-action="legacy-import">기존판 진도 다시 가져오기</button><p class="setting-help">이 버튼은 현재 미리보기 진도를 기존판 기록으로 교체합니다.</p></details></section><section class="section-card"><h2>아빠의 편지</h2><div class="letter">지우야.<br>아빠가 지우를 위해 만들어봤다.<br>공부한다고 생각하지 말고<br>즐겁게 가지고 놀아.<br><br>— 아빠 —</div></section><section class="section-card"><h2>이 노트의 사용법</h2><p class="storage-info">‘기억했어’는 완성함으로, ‘다시 볼래’는 반복함으로 보냅니다. 반복함 카드는 같은 묶음에서 한 번 더 등장합니다. 잘 기억한 날이 쌓이면 복습 간격이 1·3·7·14·30·60일로 늘어납니다. 같은 날 반복해서 맞혀도 간격은 늘어나지 않습니다.</p><p class="storage-info">플레이에서 처음 맞힌 단어는 다음 날 다시 확인합니다. 직접 학습 카드에서 ‘기억했어’를 눌러 완성함으로 보낼 수도 있습니다.</p><p class="storage-info">단어 1,200개 · 숙어·생활 표현 310개. 단계는 학습 편의를 위한 묶음입니다. 표현 메모에는 자주 쓰는 말과 헷갈리기 쉬운 문법·발음 구분을 정리했습니다.</p><p class="storage-info">홈 화면 추가: 아이폰은 사파리의 공유 → 홈 화면에 추가. 갤럭시는 크롬 메뉴의 설치 또는 홈 화면에 추가. 미리보기는 기존판과 별도로 추가할 수 있습니다.</p></section><details class="section-card"><summary>미리보기 진도 초기화</summary><p class="setting-help">현재 미리보기의 분류·복습 일정·진행 중 묶음을 초기화합니다. 내 카드, 학습 일별 기록, 지급 내역, 열린 선물은 유지합니다.</p><button class="button danger" data-action="reset">분류와 복습 일정 초기화</button></details>`;}
function applyTheme(){const mode=state.prefs.theme==='auto'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):state.prefs.theme;document.documentElement.dataset.theme=mode;document.querySelector('meta[name="theme-color"]').content=mode==='dark'?'#151d1c':'#f4f1e9';}
function render(){applyTheme();document.querySelectorAll('[data-tab]').forEach(b=>{if(b.closest('nav')){if(b.dataset.tab===tab)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}});$('#main').innerHTML=({study:studyView,quiz:quizView,library:libraryView,records:recordsView,settings:settingsView}[tab])();}
function download(value,name){const blob=new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function backup(){download({app:'jiwoo-words',version:2,exportedAt:new Date().toISOString(),state},`jiwoo-words-backup-${day()}.json`);}
function importState(candidate){
 const s=normalize(candidate);s.session=null;s.game=null;
 if(!confirm(`카드 분류 ${Object.keys(s.status).length}개와 내 카드 ${s.custom.length}개를 불러옵니다. 현재 미리보기 기록을 교체할까요? 기존판은 바뀌지 않습니다.`))return;
 // Keep a rollback copy on disk before replacing valid current progress.
 backup();const previous=state;state=s;blocked=false;
 try{lastSaved=localStorage.getItem(KEY);}catch{state=previous;toast('저장소에 접근하지 못했습니다.');return;}
 if(!save()){state=previous;rebuild();toast('불러오기를 완료하지 못했습니다. 현재 기록은 유지됩니다.');return;}
 transientUndo=null;rebuild();$('#storage-alert').hidden=true;render();toast('백업을 불러왔어요. 교체 전 기록도 파일로 내려받았습니다.');
}
function setPref(key,value){if(blocked)return;state.prefs[key]=value;save();applyTheme();if(tab==='settings'||tab==='study'||tab==='quiz')render();}
function addCustom(en,ko,pos='',ex='',kr='',g=0){en=en.trim();ko=ko.trim();if(!en||!ko)return 'empty';if(all().some(c=>c.en.toLowerCase()===en.toLowerCase()))return 'duplicate';if(en.length>150||ko.length>500||ex.length>1500||kr.length>1500)return 'invalid';if(Number(g)===4&&((ex.match(/\{[^}]+\}/g)||[]).length!==1))return 'cloze';
 const c={id:'c-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),en,ko,pos,g:Number(g),ex,kr,note:'',topic:'daily'};state.custom.unshift(c);index.set(c.id,c);return 'added';
}
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b||b.disabled)return;
 if(b.dataset.tab){tab=b.dataset.tab;render();$('#main').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});return;}
 if(b.dataset.speak){speak(b.dataset.speak,b.dataset.sentence==='true');return;}
 if(b.hasAttribute('data-trans')){const container=b.closest('.answer,.library-detail');const p=container?.querySelector('.translation');if(p){p.hidden=!p.hidden;b.setAttribute('aria-expanded',!p.hidden);b.textContent=p.hidden?'해석 보기':'해석 접기';}return;}
 if(b.dataset.star){bookmark(b.dataset.star);return;}
 if(b.dataset.mark){mark(b.dataset.mark==='yes');return;}
 if(b.dataset.topic){if(blocked)return;state.prefs.topic=b.dataset.topic;save();render();toast('다음 묶음부터 선택한 관심사로 공부해요.');return;}
 if(b.dataset.game){if(state.game&&!state.game.complete&&!confirm('진행 중인 판을 마치고 새 판을 시작할까요? 이미 기록한 학습은 남습니다.'))return;startGame(b.dataset.game);return;}
 if(b.dataset.match){match(b.dataset.side,b.dataset.match);return;}
 if(b.dataset.page){library.page+=Number(b.dataset.page);render();window.scrollTo({top:0,behavior:'instant'});return;}
 if(b.dataset.openCard){if(blocked)return;if(state.session&&state.session.idx<state.session.queue.length&&!confirm('진행 중 묶음 대신 이 카드로 학습할까요? 학습 기록은 유지됩니다.'))return;state.session={queue:[b.dataset.openCard],idx:0,revealed:false,again:{},initial:1,good:0,retry:0,title:'단어장에서 고른 카드',startedDay:day(),completed:false,skipped:0,stampEarned:false};transientUndo=null;save();tab='study';render();window.scrollTo({top:0,behavior:'instant'});return;}
 if(b.dataset.delete){if(blocked||!confirm('이 추가 카드를 삭제할까요?'))return;const id=b.dataset.delete;state.custom=state.custom.filter(c=>c.id!==id);delete state.status[id];delete state.reviews[id];state.starred=state.starred.filter(x=>x!==id);state.session=null;state.game=null;transientUndo=null;rebuild();save();render();return;}
 const a=b.dataset.action;
 if(['start-study','new-study','challenge'].includes(a)){if(state.session&&state.session.idx<state.session.queue.length&&!confirm('새 묶음으로 바꿀까요? 지금까지 공부한 기록은 남습니다.'))return;startStudy(a==='challenge'?5:state.prefs.setSize,a==='challenge'?'한 곡 챌린지':'오늘의 학습');}
 else if(a==='reveal'){if(!state.session||blocked)return;state.session.revealed=true;save();render();}
 else if(a==='undo')undo();
 else if(a==='skip'){const s=state.session;if(!s||blocked)return;s.idx++;s.skipped=(s.skipped||0)+1;s.revealed=false;transientUndo=null;if(s.idx===s.queue.length){if(s.good+s.retry>0)finishSession(s);else s.completed=true;}save();render();}
 else if(a==='game-menu'){if(state.game&&!state.game.complete&&!confirm('진행 중인 판을 닫을까요? 다음 문제로 넘긴 기록은 유지됩니다.'))return;state.game=null;save();render();}
 else if(a==='hint'){if(!state.game||state.game.answered||blocked)return;state.game.hinted=true;state.game.answer=$('#quiz-answer')?.value||'';save();render();}
 else if(a==='show-answer')submitAnswer('');
 else if(a==='next-question')nextQuestion();
 else if(a==='backup')backup();
 else if(a==='raw-backup'){try{download(localStorage.getItem(KEY)||localStorage.getItem(LEGACY)||'{}',`jiwoo-raw-${day()}.json`);}catch{toast('저장 원본에 접근하지 못했습니다.');}}
 else if(a==='legacy-import'){try{const raw=localStorage.getItem(LEGACY);if(!raw){toast('이 브라우저에는 기존판 기록이 없습니다.');return;}importState(JSON.parse(raw));}catch(err){toast(err.message);}}
 else if(a==='payout'){if(blocked||balance()<=0)return;const p=balance();if(!confirm(`${money(p)} (${p}P)를 실제로 지급했나요? 지급 완료로 기록합니다.`))return;state.paid.push({ts:Date.now(),p,rate:state.prefs.rate});save();render();}
 else if(a==='reset'){if(blocked||!confirm('미리보기의 분류·복습 일정을 초기화할까요? 내 카드와 학습·선물 기록은 남습니다.'))return;backup();state.status={};state.reviews={};state.session=null;state.game=null;transientUndo=null;save();render();toast('초기화했어요. 초기화 전 백업도 내려받았습니다.');}
});
document.addEventListener('change',async e=>{
 const x=e.target;
 if(x.dataset.pref){const k=x.dataset.pref;let v=x.type==='checkbox'?x.checked:x.value;if(['goal','setSize','speechRate'].includes(k))v=Number(v);setPref(k,v);return;}
 if(x.dataset.filter){library[x.dataset.filter]=x.value;library.page=0;render();return;}
 if(x.id==='point-rate'){const v=Number(x.value);if(!Number.isInteger(v)||v<0||v>100000){toast('0~100,000 사이의 정수를 입력해 주세요.');render();return;}setPref('rate',v);return;}
 if(x.id==='restore-file'){
  const f=x.files[0];if(!f)return;if(f.size>10*1024*1024){toast('10MB 이하의 백업 파일을 선택해 주세요.');return;}
  try{const o=JSON.parse(await f.text());if(o.app&&o.app!=='jiwoo-words')throw Error('다른 앱의 백업 파일입니다.');if(o.version&&o.version>2)throw Error('더 최신 버전에서 만든 백업입니다.');importState(o.state||o);}catch(err){toast(err.message||'백업을 읽지 못했습니다.');}x.value='';
 }
});
document.addEventListener('input',e=>{if(e.isComposing)return;if(e.target.id==='library-search'){const at=e.target.selectionStart;library.q=e.target.value;library.page=0;render();const x=$('#library-search');x.focus();try{x.setSelectionRange(at,at);}catch{}}else if(e.target.id==='quiz-answer'&&state.game)state.game.answer=e.target.value;});
document.addEventListener('compositionend',e=>{if(e.target.id==='library-search')e.target.dispatchEvent(new Event('input',{bubbles:true}));});
document.addEventListener('submit',e=>{
 if(e.target.id==='answer-form'){e.preventDefault();submitAnswer(new FormData(e.target).get('answer'));return;}
 if(e.target.id==='add-card'){e.preventDefault();if(blocked)return;const f=new FormData(e.target),r=addCustom(f.get('en'),f.get('ko'),f.get('pos'),f.get('ex'),f.get('kr'),f.get('g'));if(r==='added'){save();library.q=f.get('en');library.page=0;render();toast('내 카드를 추가했어요.');}else toast({duplicate:'이미 있는 단어예요. 단어장에서 검색해 보세요.',empty:'영어와 뜻을 입력해 주세요.',invalid:'카드 내용이 너무 깁니다.',cloze:'숙어 예문에 빈칸으로 쓸 부분 한 곳을 {중괄호}로 표시해 주세요.'}[r]);return;}
 if(e.target.id==='bulk-add'){e.preventDefault();if(blocked)return;let added=0,skipped=0;const lines=new FormData(e.target).get('bulk').split(/\r?\n/).filter(s=>s.trim());for(const line of lines){const sep=line.includes('\t')?'\t':',',parts=line.split(sep).map(s=>s.trim());if(parts.length<2){skipped++;continue;}const r=addCustom(parts[0],parts[1],'',parts.slice(2).join(sep==='\t'?' ':', '));if(r==='added')added++;else skipped++;}save();render();toast(`${added}장 추가 · 중복 또는 형식 확인 필요 ${skipped}줄`);}
});
document.addEventListener('keydown',e=>{
 if(e.target.closest('input,textarea,select,button,a,summary,dialog')||e.ctrlKey||e.altKey||e.metaKey)return;
 if(tab==='study'&&state.session){if(e.code==='Space'){e.preventDefault();if(!state.session.revealed){state.session.revealed=true;save();render();}}else if(e.key==='1')mark(false);else if(e.key==='2')mark(true);else if(e.key.toLowerCase()==='s'){const id=state.session.queue[state.session.idx];if(id)speak(id,false);}}
});
window.addEventListener('storage',e=>{if(e.key===KEY&&localStorage.getItem(KEY)!==lastSaved){blocked=true;showAlert('다른 창에서 기록이 바뀌었습니다. 새로고침해서 최신 기록으로 이어가 주세요. 이 창은 덮어쓰지 않습니다.');}});
window.addEventListener('pagehide',()=>{if(!blocked)save();});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applyTheme);
if(!blocked&&lastSaved===null)save();render();
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
})();
