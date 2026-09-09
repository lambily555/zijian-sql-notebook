const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const store=require('../desktop/resources/app/knowledge-store.cjs');
const protocol=require('../desktop/resources/app/storage.cjs');
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'zijian-test-'));
  fs.mkdirSync(path.join(root,'data'));fs.copyFileSync(path.join(__dirname,'../data/knowledge.json'),path.join(root,'data/knowledge.json'));
  fs.writeFileSync(path.join(root,'index.html'),'<meta content="__TOKEN__">');
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;
}
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
