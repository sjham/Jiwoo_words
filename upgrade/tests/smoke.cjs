const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('fs');
const URL=process.argv[2]||'http://localhost:8766/upgrade/';
const KEY='jiwoo-words/upgrade/v2', OLD='mid-vocab-box/v1';
const path=require('path');
const dataText=fs.readFileSync(path.join(__dirname,'../data.js'),'utf8');
const cards=JSON.parse(dataText.slice(dataText.indexOf(' = ')+3).trim().replace(/;$/,''));
fs.mkdirSync(path.join(__dirname,'results'),{recursive:true});
const map=new Map(cards.map(c=>[c.id,c]));
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
const report=[];
(async()=>{
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Seoul',acceptDownloads:true});
const legacy={v:1,status:{'b-always':'done','b-answer':'repeat'},custom:[{id:'c-fixture',g:0,en:'testword',ko:'시험용 단어',pos:'n',ex:'This is a testword.'}],daily:{[today()]:{n:4,goal:20}},paid:[{ts:1700000000000,p:1,rate:100}],unlocked:['r1'],prefs:{goal:20,rate:100,grade:'all',dir:'en-ko'},updatedAt:1};
const oldText=JSON.stringify(legacy);
await ctx.addInitScript(({OLD,oldText})=>{if(!localStorage.getItem(OLD))localStorage.setItem(OLD,oldText);},{OLD,oldText});
const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
const state=()=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);
const nav=async name=>{await p.locator(`nav [data-tab="${name}"]`).click();};
await p.goto(URL);let s=await state();assert.deepEqual(s.status,legacy.status);assert.deepEqual(s.paid,legacy.paid);assert.deepEqual(s.unlocked,['r1']);assert.equal(s.custom[0].id,'c-fixture');assert.equal(s.daily[today()].n,4);report.push('Legacy status/custom/daily/payout/reward migration, original byte-for-byte preserved');
await p.locator('[data-action="start-study"]').click();s=await state();assert.equal(s.session.queue.length,5);
await p.locator('[data-action="reveal"]').click();const before=await state();
await p.locator('[data-mark="no"]').click();s=await state();assert.equal(s.session.queue.length,6);assert.equal(s.daily[today()].n,5);
await p.locator('[data-action="undo"]').click();s=await state();assert.deepEqual(s.status,before.status);assert.deepEqual(s.daily,before.daily);assert.deepEqual(s.reviews,before.reviews);assert.equal(s.session.idx,before.session.idx);
await p.locator('[data-mark="yes"]').click();s=await state();const classified=before.session.queue[before.session.idx];assert.equal(s.status[classified],'done');assert.equal(s.reviews[classified].stage,0);const once=s.daily[today()].n;
await p.reload();s=await state();assert.equal(s.session.idx,1);assert.equal(s.daily[today()].n,once);report.push('Study classify/requeue/undo/resume and 1-day review scheduling');
async function openCard(id){await nav('library');await p.locator('#library-search').fill(map.get(id)?.en||'testword');const detail=p.locator('.library-item').filter({has:p.locator(`[data-open-card="${id}"]`)});await detail.locator('summary').click();await p.locator(`[data-open-card="${id}"]`).click();}
await openCard(classified);await p.locator('[data-action="reveal"]').click();await p.locator('[data-mark="yes"]').click();s=await state();assert.equal(s.daily[today()].n,once);assert.equal(s.reviews[classified].stage,0);report.push('Repeated same-day answers do not duplicate points or advance review interval');
await nav('settings');await p.locator('[data-pref="goal"]').selectOption('5');s=await state();assert.equal(s.prefs.goal,5);assert.equal(s.daily[today()].goal,20);
const dl=await Promise.all([p.waitForEvent('download'),p.locator('[data-action="backup"]').click()]);await dl[0].saveAs(require('path').join(__dirname,'results/test-backup.json'));const exported=JSON.parse(fs.readFileSync(require('path').join(__dirname,'results/test-backup.json')));assert.equal(exported.app,'jiwoo-words');assert.deepEqual(exported.state.custom,s.custom);
await p.locator('#restore-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"invalid":true}')});await p.waitForTimeout(120);assert.deepEqual((await state()).status,s.status);
await p.locator('#restore-file').setInputFiles(require('path').join(__dirname,'results/test-backup.json'));await p.waitForTimeout(150);assert.deepEqual((await state()).daily,s.daily);assert.equal((await state()).session,null);report.push('Goal changes preserve earned history; valid backup round-trip; invalid backup leaves progress intact');
await nav('library');await p.locator('summary').filter({hasText:'내 카드 추가'}).click();await p.locator('#add-card [name="en"]').fill('satin-test');await p.locator('#add-card [name="ko"]').fill('새틴 시험 카드');await p.locator('#add-card [name="ex"]').fill('<script>alert(1)</script>');await p.locator('#add-card button').click();assert.ok((await state()).custom.some(c=>c.en==='satin-test'));assert.equal(await p.locator('main script').count(),0);report.push('Custom add/search and HTML escaping');
await nav('quiz');await p.locator('.game-options summary').click();await p.locator('[data-pref="grade"]').selectOption('all');assert.equal(await p.locator('[data-pref="topic"], [data-topic]').count(),0);await p.locator('[data-game="spell"]').click();s=await state();assert.equal(s.game.list.length,5);let target=map.get(s.game.list[0]);await p.locator('#quiz-answer').fill(target.en.toUpperCase());await p.locator('#answer-form button').click();await p.reload();s=await state();assert.equal(s.game.answered,true);assert.equal(s.game.result,true);await nav('quiz');await p.locator('[data-action="next-question"]').click();s=await state();if(s.game.idx!==1)console.log('GAME DEBUG',s.game,await p.locator('#storage-alert').textContent(),errors);assert.equal(s.game.idx,1);assert.equal(s.game.correct,1);assert.equal(s.status[target.id],'repeat');
for(let i=1;i<5;i++){await p.locator('[data-action="show-answer"]').click();await p.locator('[data-action="next-question"]').click();}
s=await state();assert.equal(s.game.complete,true);assert.equal(s.game.correct,1);assert.ok(s.stamps.includes(today()));report.push('Spelling quiz without exposed interest categories, case tolerance, reload-safe answer, first correct remains review, completion stamp');
await p.locator('[data-action="game-menu"]').click();await p.locator('[data-game="cloze"]').click();s=await state();let id=s.game.list[0],c=map.get(id);let form=c.ex.match(/\{([^}]+)\}/)[1];await p.locator('#quiz-answer').fill(form);await p.locator('#answer-form button').click();assert.equal((await state()).game.result,true);await p.locator('[data-action="next-question"]').click();await p.locator('[data-action="game-menu"]').click();report.push('Cloze answers use actual inflected sentence form');
await p.locator('[data-game="match"]').click();s=await state();const pairs=s.game.list;await p.locator(`[data-match="${pairs[0]}"][data-side="left"]`).click();await p.locator(`[data-match="${pairs[1]}"][data-side="right"]`).click();assert.equal((await state()).game.matched.length,0);assert.equal((await state()).game.missed.length,2);
for(const id of pairs){await p.locator(`[data-match="${id}"][data-side="left"]`).click();await p.locator(`[data-match="${id}"][data-side="right"]`).click();}
s=await state();assert.equal(s.game.complete,true);assert.equal(s.status[pairs[0]],'repeat');report.push('Matching game: wrong pair feedback, retry, completion and no false mastery');
// Mobile/desktop plus dark theme, all screens without document overflow.
for(const width of [320,390,1280]){await p.setViewportSize({width,height:900});for(const name of ['study','quiz','library','records','settings']){await nav(name);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${name} ${width}`);} }
await p.locator('[data-pref="theme"]').selectOption('dark');assert.equal(await p.locator('html').getAttribute('data-theme'),'dark');await nav('study');await p.screenshot({path:require('path').join(__dirname,'results/dark.png'),fullPage:true});report.push('320/390/1280px: all 5 screens fit; dark mode');
assert.equal(await p.evaluate(k=>localStorage.getItem(k),OLD),oldText);
await p.evaluate(async()=>{await navigator.serviceWorker.ready;await caches.open('unrelated-app-cache');});await p.reload();await ctx.setOffline(true);await p.reload();assert.match(await p.title(),/Jiwoo/);assert.ok(await p.evaluate(async()=>(await caches.keys()).includes('unrelated-app-cache')));await ctx.setOffline(false);report.push('Offline reload and sibling-cache preservation');
const other=await ctx.newPage();await other.goto(URL);await other.locator('nav [data-tab="settings"]').click();await other.locator('[data-pref="theme"]').selectOption('light');await p.waitForTimeout(100);assert.match(await p.locator('#storage-alert').innerText(),/다른 창/);const saved=await state();await nav('settings');await p.locator('[data-pref="theme"]').selectOption('light');assert.equal((await state()).revision,saved.revision);await other.close();report.push('Concurrent tabs stop stale writes');
assert.deepEqual(errors,[]);
await ctx.close();
const blockedCtx=await browser.newContext();await blockedCtx.addInitScript(()=>{const orig=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='jiwoo-words/upgrade/v2')throw new DOMException('full','QuotaExceededError');return orig.call(this,k,v);};});const bp=await blockedCtx.newPage();await bp.goto(URL);assert.match(await bp.locator('#storage-alert').innerText(),/保存|저장하지 못/);report.push('Storage-quota failure visibly reported');await blockedCtx.close();
const malformedCtx=await browser.newContext();await malformedCtx.addInitScript(()=>localStorage.setItem('jiwoo-words/upgrade/v2','{broken'));const mp=await malformedCtx.newPage();await mp.goto(URL);assert.equal(await mp.evaluate(k=>localStorage.getItem(k),KEY),'{broken');assert.match(await mp.locator('#storage-alert').innerText(),/덮어쓰지/);report.push('Malformed stored JSON is not overwritten');await malformedCtx.close();
await browser.close();fs.writeFileSync(require('path').join(__dirname,'results/test-results.json'),JSON.stringify({url:URL,passed:report,errors},null,2));console.log(report.join('\n'));console.log('PASS',report.length,'checks');
})().catch(e=>{console.error(e);process.exit(1)});
