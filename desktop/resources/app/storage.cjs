const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
module.exports=function(root){
  const knowledge=require('./knowledge-store.cjs')(root);
  const data=path.join(root,'data'),token=crypto.randomBytes(32).toString('hex');
  const read=(name)=>{const file=path.join(data,name+'.json');return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')):{};};
  function atomic(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';const fd=fs.openSync(temp,'wx');try{fs.writeFileSync(fd,JSON.stringify(value,null,2),'utf8');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,file);}
  const stamp=()=>new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex');
  const response=(code,value,mime='application/json; charset=utf-8')=>new Response(Buffer.isBuffer(value)?value:JSON.stringify(value),{status:code,headers:{'Content-Type':mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"}});
  let queue=Promise.resolve();
  async function handle(request){
    try{
      const url=new URL(request.url);if(url.host!=='notebook')return response(403,{error:'仅允许笔记本内部访问'});
      const route=url.pathname;
      if(request.method==='GET'){
        if(route==='/api/knowledge')return response(200,knowledge.read());
        if(route==='/api/notebook')return response(200,{coach:read('coach'),journal:read('journal')});
        const map={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/knowledge.js':['knowledge.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
        if(!map[route])return response(404,{error:'页面不存在'});
        const [file,mime]=map[route];let contents=fs.readFileSync(path.join(root,file));if(file==='index.html')contents=Buffer.from(contents.toString('utf8').replace('__TOKEN__',token));return response(200,contents,mime);
      }
      if(request.method!=='POST'||request.headers.get('X-Notebook-Token')!==token)return response(403,{error:'请重新打开应用后重试'});
      const raw=await request.text();if(raw.length>20000000)return response(413,{error:'记录或图片过大'});let entry;try{entry=JSON.parse(raw);}catch{return response(400,{error:'无效的记录格式'});}
      const job=queue.then(()=>{
        if(route==='/api/knowledge'){try{return response(200,knowledge.save(entry));}catch(e){return response(e.status||500,{error:e.message});}}
        if(route==='/api/export'){const output=path.join(root,'backups',stamp()+'.json');atomic(output,{coach:read('coach'),journal:read('journal'),knowledge:knowledge.read()});return response(200,{path:output});}
        if(route!=='/api/journal')return response(404,{error:'操作不存在'});
        const {date,title,body,revision}=entry||{},images=entry?.images||[],richBody=entry?.richBody||'';
        if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||typeof title!=='string'||typeof body!=='string'||typeof richBody!=='string'||title.length>120||body.length>100000||richBody.length>16000000||!Array.isArray(images)||images.length>12)return response(400,{error:'无效的记录格式'});
        const entries=read('journal');if(revision!==(entries[date]?.revision||0))return response(409,{error:'此页已更新，请先复制当前文字，再重新打开核对，避免覆盖。'});
        const file=path.join(data,'journal.json');if(fs.existsSync(file)){const backup=path.join(root,'backups','journal-before-'+stamp()+'.json');fs.mkdirSync(path.dirname(backup),{recursive:true});fs.copyFileSync(file,backup);}
        entries[date]={title,body,richBody,images,revision:revision+1,updatedAt:new Date().toISOString()};atomic(file,entries);return response(200,entries[date]);
      });queue=job.catch(()=>{});return await job;
    }catch{return response(500,{error:'读写失败，请保留窗口并检查本机空间或数据文件。原手记不会被静默清空。'});}
  }
  return handle;
};
