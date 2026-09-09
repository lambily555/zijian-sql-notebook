// Coach and GUI share revision checks, lock and atomic backups. Never touch the DOCX.
const fs=require('node:fs'),path=require('node:path');
const input=process.argv[2];if(!input){console.error('Usage: node knowledge_update.cjs chapter-update.json');process.exit(2);}
try{const patch=JSON.parse(fs.readFileSync(path.resolve(input),'utf8').replace(/^\uFEFF/,''));const result=require('./desktop/resources/app/knowledge-store.cjs')(__dirname).save(patch);console.log(JSON.stringify({updated:patch.id,bookRevision:result.revision}));}catch(e){console.error(e.message);process.exitCode=1;}
