const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const store=require('../desktop/resources/app/knowledge-store.cjs');
const protocol=require('../desktop/resources/app/storage.cjs');
const {merge}=require('../desktop/resources/app/journal-merge.cjs');
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'zijian-test-'));
  fs.mkdirSync(path.join(root,'data'));fs.copyFileSync(path.join(__dirname,'../data/knowledge.json'),path.join(root,'data/knowledge.json'));
  fs.writeFileSync(path.join(root,'index.html'),'<meta content="__TOKEN__">');
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;
}

test('independent answers and grading merge while overlapping edits remain protected',()=>{
  const base={title:'Demo',body:'Question\nAnswer:\nCorrect: pending\n',richBody:'<div>Question</div><div>Answer:</div><div>Correct: pending</div>',images:[]};
  const mine={...base,body:base.body.replace('Answer:\n','Answer:\nB\n'),richBody:base.richBody.replace('Answer:</div>','Answer: B</div>')+'<div><img src="data:image/png;base64,eA=="></div>'};
  const theirs={...base,body:base.body.replace('pending','B'),richBody:base.richBody.replace('pending','B')};
  const result=merge(base,mine,theirs);assert(result);assert.equal(result.body,'Question\nAnswer:\nB\nCorrect: B\n');assert(result.richBody.includes('data:image/png'));assert(result.richBody.includes('Correct: B'));
  assert.equal(merge(base,{...base,title:'Mine'},{...base,title:'Theirs'}),null);
});

test('autosave merges stale edits and continued typing and backs up genuine conflicts',async t=>{
  const root=fixture(t),date='2026-09-09',base={title:'Demo',body:'Answer: pending\nCorrect: pending\n',richBody:'<div>Answer: pending</div><div>Correct: pending</div>',images:[],revision:1};
  const mine={...base,body:base.body.replace('Answer: pending','Answer: B'),richBody:base.richBody.replace('Answer: pending','Answer: B')};
  const theirs={...base,body:base.body.replace('Correct: pending','Correct: B'),richBody:base.richBody.replace('Correct: pending','Correct: B'),revision:2};
  const file=path.join(root,'data/journal.json');fs.writeFileSync(file,JSON.stringify({[date]:theirs,other:{body:'Keep',revision:1}}));fs.mkdirSync(path.join(root,'backups'));fs.writeFileSync(path.join(root,'backups/journal-before-test.json'),JSON.stringify({[date]:base}));
  const handle=protocol(root),page=await(await handle(new Request('zijian://notebook/'))).text(),token=page.match(/content="([^"]+)"/)[1];
  const post=value=>handle(new Request('zijian://notebook/api/journal',{method:'POST',headers:{'X-Notebook-Token':token},body:JSON.stringify({date,...value})}));
  let response=await post(mine);assert.equal(response.status,200);let saved=await response.json();assert.equal(saved.revision,3);assert(saved.merged);assert.equal(saved.body,'Answer: B\nCorrect: B\n');assert.equal(JSON.parse(fs.readFileSync(file)).other.body,'Keep');
  response=await post({...mine,body:mine.body+'More typing\n',richBody:mine.richBody+'<div>More typing</div>',revision:3,base:{...mine,revision:3}});assert.equal(response.status,200);saved=await response.json();assert(saved.body.includes('More typing'));assert(saved.body.includes('Correct: B'));
  fs.writeFileSync(file,JSON.stringify({[date]:{...saved,title:'Theirs',revision:5}}));response=await post({...saved,title:'Mine',base:saved});assert.equal(response.status,409);const error=await response.json();assert(fs.existsSync(error.draftPath));assert.equal(JSON.parse(fs.readFileSync(file))[date].title,'Theirs');
});
test('chapter updates back up the previous version and reject stale writes',t=>{
  const root=fixture(t),notes=store(root),before=notes.read(),chapter=before.chapters[0];
  notes.save({...chapter,content:'New notes'});
  assert.equal(notes.read().chapters[0].content,'New notes');
  assert.equal(notes.read().chapters.length,before.chapters.length);
  assert.throws(()=>notes.save({...chapter,content:'stale'}),e=>e.status===409);
  assert.equal(notes.read().chapters[0].content,'New notes');
  const backup=fs.readdirSync(path.join(root,'backups'))[0];
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'backups',backup),'utf8')),before);
  fs.writeFileSync(path.join(root,'data/knowledge.json.lock'),'');
  assert.throws(()=>notes.save({...chapter,revision:2}),e=>e.status===409);
});
test('journal writes require a token, survive reload and reject concurrent stale saves',async t=>{
  const root=fixture(t),handle=protocol(root);
  const page=await (await handle(new Request('zijian://notebook/'))).text(),token=page.match(/content="([^"]+)"/)[1];
  const post=(route,value,auth=token)=>handle(new Request('zijian://notebook'+route,{method:'POST',headers:{'X-Notebook-Token':auth},body:JSON.stringify(value)}));
  const entry={date:'2026-09-09',title:'Demo',body:'SELECT name FROM customers;',revision:0};
  assert.equal((await post('/api/journal',entry,'bad')).status,403);
  const results=await Promise.all([post('/api/journal',entry),post('/api/journal',{...entry,body:'stale'})]);
  assert.deepEqual(results.map(r=>r.status),[200,409]);
  const reloaded=await (await protocol(root)(new Request('zijian://notebook/api/notebook'))).json();
  assert.equal(reloaded.journal[entry.date].body,entry.body);
  assert.equal((await post('/api/journal',{...entry,revision:1,body:'Updated'})).status,200);
  assert.equal((await post('/api/journal',{...entry,date:'2026-02-30'})).status,400);
  const exported=await (await post('/api/export',{})).json();
  const backup=JSON.parse(fs.readFileSync(exported.path,'utf8'));
  assert.equal(backup.journal[entry.date].body,'Updated');
  assert.equal(backup.knowledge.chapters.length,7);
  assert.equal((await handle(new Request('zijian://notebook/desktop/resources/app/main.cjs'))).status,404);
});
