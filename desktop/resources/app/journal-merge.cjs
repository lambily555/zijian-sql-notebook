// Merge independent edits against the version the editor originally loaded.
const fs=require('node:fs'),path=require('node:path');
function changes(base,value){
  if(base.join('')===value.join(''))return [];
  if(base.length*value.length>4000000)return [{start:0,end:base.length,lines:value}];
  const rows=Array.from({length:base.length+1},()=>new Uint32Array(value.length+1));
  for(let i=base.length-1;i>=0;i--)for(let j=value.length-1;j>=0;j--)rows[i][j]=base[i]===value[j]?rows[i+1][j+1]+1:Math.max(rows[i+1][j],rows[i][j+1]);
  const result=[];let i=0,j=0,change=null;
  while(i<base.length||j<value.length){
    if(i<base.length&&j<value.length&&base[i]===value[j]){if(change){result.push(change);change=null;}i++;j++;}
    else{if(!change)change={start:i,end:i,lines:[]};if(j<value.length&&(i===base.length||rows[i][j+1]>=rows[i+1][j]))change.lines.push(value[j++]);else{ i++;change.end=i;}}
  }
  if(change)result.push(change);return result;
}
function mergeText(base,mine,theirs,rich=false){
  if(mine===theirs||theirs===base)return {value:mine};
  if(mine===base)return {value:theirs};
  const split=s=>rich?s.match(/<[^>]*>|[^<]+/g)||[]:s.match(/[^\n]*\n|[^\n]+$/g)||[];
  const original=split(base),left=changes(original,split(mine)),right=changes(original,split(theirs)),edits=[...left];
  for(const r of right){
    const overlap=left.find(l=>l.start===l.end?(r.start===r.end?l.start===r.start:r.start<l.start&&l.start<r.end):r.start===r.end?l.start<r.start&&r.start<l.end:l.start<r.end&&r.start<l.end);
    if(overlap){if(overlap.start===r.start&&overlap.end===r.end&&overlap.lines.join('')===r.lines.join(''))continue;return {conflict:true};}
    edits.push(r);
  }
  edits.sort((a,b)=>b.start-a.start||b.end-a.end);for(const e of edits)original.splice(e.start,e.end-e.start,...e.lines);
  return {value:original.join('')};
}
function merge(base,mine,theirs){
  const result={};for(const field of ['title','body','richBody']){const value=mergeText(base[field]||'',mine[field]||'',theirs[field]||'',field==='richBody');if(value.conflict)return null;result[field]=value.value;}
  const b=JSON.stringify(base.images||[]),m=JSON.stringify(mine.images||[]),t=JSON.stringify(theirs.images||[]);
  if(m!==b&&t!==b&&m!==t)return null;
  result.images=m===b?theirs.images||[]:mine.images||[];return result;
}
function findBase(root,date,revision){
  const dir=path.join(root,'backups');if(!fs.existsSync(dir))return null;
  const files=fs.readdirSync(dir).filter(n=>/^journal-before-.*\.json$/.test(n)).map(n=>({file:path.join(dir,n),time:fs.statSync(path.join(dir,n)).mtimeMs})).sort((a,b)=>b.time-a.time);
  for(const {file}of files){try{const entry=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''))[date];if(entry?.revision===revision)return entry;}catch{}}
  return null;
}
module.exports={merge,findBase};
