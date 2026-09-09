const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
module.exports=function(root){
  const file=path.join(root,'data','knowledge.json'),lock=file+'.lock';
  const read=()=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
  function save({id,title,content,revision}){
    if(typeof id!=='string'||!/^[-a-z0-9]{1,80}$/.test(id)||typeof title!=='string'||!title.trim()||title.length>180||typeof content!=='string'||content.length>300000||!Number.isInteger(revision))throw Object.assign(Error('标题、正文或版本信息无效'),{status:400});
    let fd;try{fd=fs.openSync(lock,'wx');}catch(e){if(e.code==='EEXIST')throw Object.assign(Error('另一个更新正在进行，请稍后重试。若持续出现，请联系教练检查更新锁。'),{status:409});throw e;}
    try{
      const notes=read(),chapter=notes.chapters.find(c=>c.id===id);
      if((chapter?.revision||0)!==revision)throw Object.assign(Error('这一章已被更新。请先复制当前修改，再重新载入核对，避免覆盖新内容。'),{status:409});
      const time=new Date().toISOString();const backup=path.join(root,'backups','knowledge-'+time.replace(/[:.]/g,'-')+'-'+crypto.randomBytes(4).toString('hex')+'.json');fs.mkdirSync(path.dirname(backup),{recursive:true});fs.copyFileSync(file,backup);
      const updated={id,title:title.trim(),content,revision:revision+1,updatedAt:time};
      if(chapter)Object.assign(chapter,updated);else notes.chapters.push(updated);
      notes.revision=(notes.revision||0)+1;notes.updatedAt=time;
      const temp=file+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';const out=fs.openSync(temp,'wx');try{fs.writeFileSync(out,JSON.stringify(notes,null,2),'utf8');fs.fsyncSync(out);}finally{fs.closeSync(out);}fs.renameSync(temp,file);return notes;
    }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
  }
  return {read,save};
};
