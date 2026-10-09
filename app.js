'use strict';
const $ = id => document.getElementById(id);
const token = document.querySelector('meta[name="notebook-token"]').content;
const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let data={coach:{},journal:{}}, current=today(), dates=[], dirty=false, saving=null, editVersion=0, timer, penTimer, penEnabled=true, ready=false, journalImages=[], saveBase=null;
const title=$('journalTitle'), body=$('journalBody'),composer=$('journalComposer');let composerRange=null;
function notice(text){$('notice').textContent=text;$('notice').hidden=!text;}
async function api(path,payload){
  const response=await fetch(path,payload===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json','X-Notebook-Token':token},body:JSON.stringify(payload)});
  const value=await response.json();if(!response.ok){const error=Error(value.error||'操作失败');error.status=response.status;throw error;}return value;
}
function allDates(){return [...new Set([...Object.keys(data.coach),...Object.keys(data.journal),current])].sort();}
const searchAliases={
  '去重':['distinct'],'distinct':['去重'],'排序':['order by','orderby'],'order by':['排序'],'orderby':['排序'],
  '筛选':['where'],'where':['筛选'],'别名':['alias','aliases','as'],'alias':['别名'],'aliases':['别名'],
  '通配符':['wildcard','wildcards'],'wildcard':['通配符'],'wildcards':['通配符'],'模糊查询':['like'],'like':['模糊查询'],
  '平均值':['avg','average'],'avg':['平均值'],'average':['平均值'],'合计':['sum'],'sum':['合计'],
  '计数':['count'],'count':['计数'],'空值':['null'],'缺失值':['null'],'null':['空值','缺失值'],
  '插入':['insert into','insert'],'insert':['插入'],'更新':['update'],'update':['更新'],'删除':['delete'],'delete':['删除'],
  '范围':['between'],'between':['范围'],'列表筛选':['in'],'聚合':['aggregate','aggregation'],'aggregate':['聚合'],'aggregation':['聚合'],
  '连接':['join'],'多表查询':['join'],'join':['连接','多表查询'],'分组':['group by','groupby'],'group by':['分组'],'groupby':['分组']
};
function normalizeSearch(text){return String(text||'').normalize('NFKC').toLowerCase().replace(/[。．]/g,'.').replace(/[“”‘’]/g,"'").replace(/\s+/g,' ').trim();}
function compactSearch(text){return normalizeSearch(text).replace(/[\s._\-\/\\年月日:：,，;；()（）\[\]【】]/g,'');}
function searchTerms(query){
  const normalized=normalizeSearch(query),terms=[normalized,compactSearch(normalized)];
  for(const alias of searchAliases[normalized]||[])terms.push(normalizeSearch(alias),compactSearch(alias));
  return [...new Set(terms.filter(Boolean))];
}
function matchesSearch(haystack,query){
  if(!normalizeSearch(query))return true;
  const normal=normalizeSearch(haystack),compact=compactSearch(haystack);
  return searchTerms(query).some(term=>normal.includes(term)||compact.includes(compactSearch(term)));
}
window.notebookSearch={normalize:normalizeSearch,compact:compactSearch,terms:searchTerms,matches:matchesSearch};
function dateSearchTerms(day){
  const [year,month,date]=day.split('-'),m=Number(month),d=Number(date);
  return [day,`${year}.${month}.${date}`,`${month}.${date}`,`${m}.${d}`,`${year}/${month}/${date}`,`${month}/${date}`,`${m}/${d}`,`${month}-${date}`,`${m}-${d}`,`${year}年${m}月${d}日`,`${m}月${d}日`].join(' ');
}
function renderIndex(){
  dates=allDates();const q=normalizeSearch($('search').value);$('dates').replaceChildren();let matches=0;
  for(const day of [...dates].reverse()){
    const coach=data.coach[day]||{},journal=data.journal[day]||{};
    const searchable=`${dateSearchTerms(day)} ${JSON.stringify({coach,journal})}`;
    if(q&&!matchesSearch(searchable,q))continue;
    const b=document.createElement('button');b.className='date-item';b.setAttribute('aria-current',day===current?'page':'false');
    const strong=document.createElement('strong');strong.textContent=day.replaceAll('-',' . ');
    const small=document.createElement('small');small.textContent=journal.title||coach.title||'待书写的一页';b.append(strong,small);b.onclick=()=>go(day);$('dates').append(b);matches++;
  }
  $('emptySearch').hidden=matches!==0;$('entryCount').textContent=`${dates.length} 日`;
  const index=dates.indexOf(current);$('previous').disabled=index<=0;$('next').disabled=index>=dates.length-1;
  $('leftPageNo').textContent=String(index*2+1).padStart(2,'0');$('rightPageNo').textContent=String(index*2+2).padStart(2,'0');
}
let coachPage=0,coachDay='',coachPages=[];
function splitCoachPages(sections){
  return sections.flatMap(section=>{
    const chunks=[];let chars=Array.from(section.text);
    while(chars.length>320){
      let end=320;
      for(let i=319;i>=160;i--){if('。！？；\n'.includes(chars[i])){end=i+1;break;}}
      chunks.push(chars.slice(0,end).join(''));chars=chars.slice(end);
    }
    if(chars.length||!chunks.length)chunks.push(chars.join(''));
    return chunks.map((text,index)=>({label:section.label+(chunks.length>1?`（${index+1}/${chunks.length}）`:''),text}));
  });
}
function renderCoach(){
  const c=data.coach[current];$('coachTitle').textContent=c?.title||'今天，也从一点开始';
  $('source').textContent=c?`${c.source} / ${c.status}`:'尚无教练记录，右页可以先写下自己的收获。';
  if(coachDay!==current){coachDay=current;coachPage=0;document.querySelector('.coach-source').open=false;}
  const sections=c?.sections?.length?c.sections:[{label:'等待你的学习反馈',text:'把今天学了哪一节、遇到的问题或练习答案告诉 SQL 教练。确认过的进度会记录在这里，没做过的题不会变成成绩。'}];
  coachPages=splitCoachPages(sections);coachPage=Math.min(coachPage,coachPages.length-1);
  const picker=$('coachPageSelect');picker.replaceChildren();coachPages.forEach((page,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=`${index+1}. ${page.label}`;option.selected=index===coachPage;picker.append(option);});
  $('coachContent').replaceChildren();
  for(const section of [coachPages[coachPage]]){
    const block=document.createElement('section');block.className='coach-section';const heading=document.createElement('h2');heading.textContent=section.label;const p=document.createElement('p');p.textContent=section.text;block.append(heading,p);$('coachContent').append(block);
  }
  $('tags').replaceChildren();for(const text of c?.tags||['尚未提交学习反馈']){const tag=document.createElement('span');tag.textContent=text;$('tags').append(tag);}
  $('tags').hidden=coachPage!==0;
  $('coachPageStatus').textContent=`${coachPage+1} / ${coachPages.length}`;
  $('coachPrevious').disabled=coachPage===0;$('coachNext').disabled=coachPage===coachPages.length-1;
}
function changeCoachPage(index){if(!Number.isInteger(index)||index<0||index>=coachPages.length)return;coachPage=index;renderCoach();}
$('coachPrevious').onclick=()=>changeCoachPage(coachPage-1);
$('coachNext').onclick=()=>changeCoachPage(coachPage+1);
$('coachPageSelect').onchange=event=>changeCoachPage(Number(event.target.value));
function render(){
  const d=new Date(current+'T12:00:00+08:00');$('weekday').textContent=new Intl.DateTimeFormat('zh-CN',{weekday:'long',timeZone:'Asia/Shanghai'}).format(d);
  $('dayNumber').textContent=current.slice(8);$('yearMonth').textContent=current.slice(0,7).replace('-',' / ');
  $('monthCaption').textContent=new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'long',timeZone:'Asia/Shanghai'}).format(d)+'的书页';
  $('datePicker').value=current;title.value=data.journal[current]?.title||'';body.value=data.journal[current]?.body||'';composer.innerHTML=safeRich(data.journal[current]?.richBody,body.value);journalImages=[];composerRange=null;
  resetEditHistory(title);resetEditHistory(body);
  $('wordCount').textContent=`${body.value.length} 字`;renderCoach();renderIndex();$('status').textContent=data.journal[current]?'已保存到本机':'已打开 · 等你落笔';
}
async function refresh(manual=false){
  const button=$('refreshDaily');
  if(manual&&button){button.disabled=true;button.textContent='刷新中…';$('status').textContent='正在重新读取内容…';}
  try{const incoming=await api('/api/notebook');
    // Never replace an active or unsaved user edit with an external update.
    data.coach=incoming.coach;
    if(!dirty&&!saving&&document.activeElement!==body&&document.activeElement!==composer&&document.activeElement!==title){const changed=JSON.stringify(data.journal[current])!==JSON.stringify(incoming.journal[current]);data.journal=incoming.journal;if(ready&&changed){title.value=data.journal[current]?.title||'';body.value=data.journal[current]?.body||'';composer.innerHTML=safeRich(data.journal[current]?.richBody,body.value);composerRange=null;$('wordCount').textContent=`${body.value.length} 字`;}}
    if(!ready){data.journal=incoming.journal;const keys=allDates();current=keys.includes(today())?today():keys[keys.length-1];ready=true;render();}else{renderCoach();renderIndex();}
    if(manual){notice('');$('status').textContent=dirty?'内容已刷新 · 当前手记仍待保存':'内容已刷新';}
    return true;
  }catch(error){notice(error.message||'无法读取记录，请稍后重试。');$('status').textContent='刷新未成功';return false;}
  finally{if(manual&&button){button.disabled=false;button.textContent='刷新内容';}}
}
async function save(){
  clearTimeout(timer);
  if(saving){const ok=await saving;if(!ok)return false;if(dirty)return save();return true;}
  if(!dirty)return true;
  syncComposer();const version=editVersion,day=current,payload={date:day,title:title.value,body:body.value,richBody:safeRich(composer.innerHTML,body.value),images:[],revision:data.journal[day]?.revision||0,base:saveBase||data.journal[day]};
  $('status').textContent='正在保存到 本机…';
  saving=(async()=>{try{const entry=await api('/api/journal',payload);data.journal[day]=entry;saveBase=version===editVersion?null:{...payload,revision:entry.revision};if(version===editVersion){dirty=false;if(entry.merged){const scroll=composer.scrollTop;title.value=entry.title;body.value=entry.body;composer.innerHTML=safeRich(entry.richBody,entry.body);composerRange=null;composer.scrollTop=scroll;}}$('status').textContent=dirty?'还有新文字待保存':'已保存到 本机';notice('');renderIndex();return true;}catch(error){notice(error.message);$('status').textContent='未保存 · '+error.message;return false;}})();
  const ok=await saving;saving=null;if(ok&&dirty)return save();return ok;
}
async function saveAll(){if(!await save())return false;return window.knowledgeSave?window.knowledgeSave():true;}
// Page changes are intentionally immediate. The user disabled simulated turns.
window.paperIsTurning=()=>false;
window.paperTurn=async(_source,commit)=>commit();
async function go(day){
  if(!ready||!day||day===current)return;if(!await save())return;
  const forward=day>current;$('pen').classList.remove('visible');
  await window.paperTurn(document.querySelector(forward?'.right-page':'.left-page'),()=>{current=day;render();},forward?1:-1,()=>document.querySelector(forward?'.left-page':'.right-page'));
}
function edited(){dirty=true;editVersion++;$('wordCount').textContent=`${body.value.length} 字`;$('status').textContent='书写中 · 停笔后保存';clearTimeout(timer);timer=setTimeout(save,750);}
function plainToRich(text){const div=document.createElement('div');div.textContent=text||'';return div.innerHTML.replace(/\n/g,'<br>');}
function safeRich(html,fallback=''){
  const template=document.createElement('template');template.innerHTML=html||plainToRich(fallback);
  for(const element of [...template.content.querySelectorAll('*')]){
    if(element.tagName==='IMG'){
      if(!/^data:image\/(?:png|jpeg|webp);base64,/i.test(element.getAttribute('src')||'')){element.remove();continue;}
      for(const attribute of [...element.attributes])if(!['src','alt','class','contenteditable'].includes(attribute.name))element.removeAttribute(attribute.name);
      element.alt='手记图片';element.className='inline-journal-image';element.setAttribute('contenteditable','false');continue;
    }
    if(!['BR','DIV','P'].includes(element.tagName)){element.replaceWith(...element.childNodes);continue;}
    for(const attribute of [...element.attributes])element.removeAttribute(attribute.name);
  }
  return template.innerHTML;
}
function syncComposer(){body.value=composer.innerText.replace(/\n{3,}/g,'\n\n').trimEnd();}
function rememberComposerRange(){const selection=getSelection();if(selection?.rangeCount&&composer.contains(selection.anchorNode))composerRange=selection.getRangeAt(0).cloneRange();}
function insertAtComposerCursor(node){composer.focus();const selection=getSelection(),range=composerRange&&composer.contains(composerRange.commonAncestorContainer)?composerRange:document.createRange();if(!composerRange||!composer.contains(composerRange.commonAncestorContainer)){range.selectNodeContents(composer);range.collapse(false);}selection.removeAllRanges();selection.addRange(range);const inserted=node.nodeType===Node.TEXT_NODE?document.execCommand('insertText',false,node.data):document.execCommand('insertHTML',false,node.outerHTML+'\u200b');if(!inserted){notice('未能插入内容，请保留剪贴板再试。');return;}rememberComposerRange();syncComposer();edited();}
function insertImageAtCursor(src){const img=document.createElement('img');img.src=src;img.alt='手记图片';img.className='inline-journal-image';img.setAttribute('contenteditable','false');insertAtComposerCursor(img);}
function cleanCopiedText(text){return text.replace(/\u200b/g,'');}
function insertTextAtComposerCursor(text){insertAtComposerCursor(document.createTextNode(cleanCopiedText(text)));}
document.addEventListener('copy',event=>{
  const text=selectedText();if(!text.includes('\u200b')||!event.clipboardData)return;
  const selection=getSelection(),fragment=document.createElement('div');
  if(selection?.rangeCount){fragment.append(selection.getRangeAt(0).cloneContents());const walker=document.createTreeWalker(fragment,NodeFilter.SHOW_TEXT);while(walker.nextNode())walker.currentNode.data=cleanCopiedText(walker.currentNode.data);}
  event.preventDefault();event.clipboardData.setData('text/plain',cleanCopiedText(text));
  if(fragment.childNodes.length)event.clipboardData.setData('text/html',fragment.innerHTML);
});
async function imageData(file){if(file.size>8*1024*1024)throw Error('单张图片不能超过8MB');const source=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('图片读取失败'));reader.readAsDataURL(file);});const img=await new Promise((resolve,reject)=>{const value=new Image();value.onload=()=>resolve(value);value.onerror=()=>reject(Error('图片格式不受支持'));value.src=source;});const scale=Math.min(1,1600/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.86);}
$('addJournalImage').onclick=()=>$('journalImageInput').click();$('journalImageInput').onchange=async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;if(composer.querySelectorAll('img').length>=12){notice('每页最多放12张图片。');return;}try{insertImageAtCursor(await imageData(file));notice('图片已插入光标位置。');}catch(error){notice(error.message);}};
$('pasteJournalImage').onclick=async()=>{if(composer.querySelectorAll('img').length>=12){notice('每页最多放12张图片。');return;}try{const src=await window.notebookClipboard.readImage();if(!src){notice('剪贴板里没有图片。');return;}insertImageAtCursor(src);notice('图片已粘贴到光标位置。');}catch(error){notice('粘贴图片失败：'+error.message);}};
composer.addEventListener('keyup',rememberComposerRange);composer.addEventListener('mouseup',rememberComposerRange);composer.addEventListener('focus',rememberComposerRange);composer.addEventListener('input',()=>{syncComposer();rememberComposerRange();edited();});
composer.addEventListener('paste',async event=>{
  const image=[...event.clipboardData.items].find(item=>item.type.startsWith('image/'));
  event.preventDefault();rememberComposerRange();
  if(image){if(composer.querySelectorAll('img').length>=12){notice('每页最多放12张图片。');return;}try{insertImageAtCursor(await imageData(image.getAsFile()));notice('图片已粘贴到光标位置。');}catch(error){notice('粘贴图片失败：'+error.message);}return;}
  insertTextAtComposerCursor(event.clipboardData.getData('text/plain'));
});
let previewImageSource='',previewScrollTop=0;
function openImagePreview(src){previewImageSource=src;previewScrollTop=composer.scrollTop;rememberComposerRange();$('imagePreviewContent').src=src;$('imagePreview').hidden=false;$('closeImagePreview').focus({preventScroll:true});}
function closeImagePreview(){previewImageSource='';$('imagePreview').hidden=true;$('imagePreviewContent').removeAttribute('src');composer.focus({preventScroll:true});composer.scrollTop=previewScrollTop;requestAnimationFrame(()=>{composer.scrollTop=previewScrollTop;});}
composer.addEventListener('click',event=>{if(event.target.tagName!=='IMG')return;event.preventDefault();openImagePreview(event.target.src);});
$('closeImagePreview').onclick=closeImagePreview;
$('imagePreview').onclick=event=>{if(event.target===$('imagePreview'))closeImagePreview();};
$('copyPreviewImage').onclick=async()=>{if(!previewImageSource)return;try{await window.notebookClipboard.writeImage(previewImageSource);notice('图片已复制到剪贴板。');}catch(error){notice('复制图片失败：'+error.message);}};
function showPen(){
  if(!penEnabled||matchMedia('(prefers-reduced-motion: reduce)').matches||document.activeElement!==body)return;
  const style=getComputedStyle(body),mirror=document.createElement('div');
  for(const key of ['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','padding','border','boxSizing','wordSpacing','tabSize'])mirror.style[key]=style[key];
  Object.assign(mirror.style,{position:'fixed',visibility:'hidden',width:body.clientWidth+'px',whiteSpace:'pre-wrap',overflowWrap:'break-word',top:'0',left:'0'});
  mirror.textContent=body.value.slice(0,body.selectionStart);const cursor=document.createElement('span');cursor.textContent='\u200b';mirror.append(cursor);document.body.append(mirror);
  const r=body.getBoundingClientRect(),mr=mirror.getBoundingClientRect(),cr=cursor.getBoundingClientRect();const x=r.left+cr.left-mr.left-body.scrollLeft,y=r.top+cr.top-mr.top-body.scrollTop+25;mirror.remove();
  if(y<r.top||y>r.bottom||x>r.right)return;
  $('pen').style.transform=`translate(${Math.min(x+3,innerWidth-70)}px,${y}px)`;$('pen').classList.add('visible');clearTimeout(penTimer);penTimer=setTimeout(()=>$('pen').classList.remove('visible'),900);
}
title.addEventListener('input',edited);body.addEventListener('input',()=>{edited();showPen();});body.addEventListener('compositionupdate',()=>requestAnimationFrame(showPen));body.addEventListener('compositionend',showPen);body.addEventListener('blur',()=>$('pen').classList.remove('visible'));
let lastEditable=body;
const editHistory=new WeakMap();
const historyFields='#journalTitle,#journalBody,#chapterTitleInput,#chapterBodyInput';
function snapshot(target){return {value:target.value,start:target.selectionStart??target.value.length,end:target.selectionEnd??target.value.length};}
function resetEditHistory(target){editHistory.set(target,{undo:[],redo:[],current:snapshot(target)});}
document.addEventListener('focusin',event=>{
  if(event.target===composer){lastEditable=composer;rememberComposerRange();return;}
  if(!event.target.matches?.(historyFields))return;
  lastEditable=event.target;
  const state=editHistory.get(event.target);
  if(!state||state.current.value!==event.target.value)resetEditHistory(event.target);
});
document.addEventListener('beforeinput',event=>{
  const target=event.target;if(!target.matches?.(historyFields))return;
  if(event.inputType==='historyUndo'||event.inputType==='historyRedo')return;
  const state=editHistory.get(target)||{undo:[],redo:[],current:snapshot(target)};
  if(state.current.value!==target.value)state.current=snapshot(target);
  state.undo.push(state.current);if(state.undo.length>200)state.undo.shift();state.redo=[];editHistory.set(target,state);
});
document.addEventListener('input',event=>{const state=editHistory.get(event.target);if(state)state.current=snapshot(event.target);});
function restoreEdit(direction){
  if(lastEditable===composer){composer.focus();const restored=document.execCommand(direction==='undo'?'undo':'redo');if(!restored){notice(direction==='undo'?'当前没有可撤回的编辑。':'当前没有可恢复的编辑。');return;}syncComposer();rememberComposerRange();edited();notice(direction==='undo'?'已撤回上一步编辑。':'已恢复刚撤回的编辑。');return;}
  const target=lastEditable;if(!target?.matches?.(historyFields)){notice('请先点击手记或知识笔记编辑框。');return;}
  const state=editHistory.get(target)||{undo:[],redo:[],current:snapshot(target)};
  const source=direction==='undo'?state.undo:state.redo,targetStack=direction==='undo'?state.redo:state.undo;
  if(!source.length){notice(direction==='undo'?'已经没有可撤回的编辑。':'已经没有可恢复的编辑。');return;}
  targetStack.push(snapshot(target));const previous=source.pop();target.value=previous.value;target.focus();target.setSelectionRange(previous.start,previous.end);state.current=snapshot(target);editHistory.set(target,state);
  target.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:direction==='undo'?'historyUndo':'historyRedo'}));notice(direction==='undo'?'已撤回上一步编辑。':'已恢复刚撤回的编辑。');
}
function selectedText(){const active=document.activeElement;if(active instanceof HTMLInputElement||active instanceof HTMLTextAreaElement)return active.value.slice(active.selectionStart??0,active.selectionEnd??0);return getSelection()?.toString()||'';}
async function copyText(text=selectedText()){
  if(!text){notice('请先选中要复制的文字。');return false;}
  try{await window.notebookClipboard.writeText(cleanCopiedText(text));notice('已复制到剪贴板。');return true;}catch(error){notice('复制失败：'+error.message);return false;}
}
async function pasteText(){
  const target=lastEditable;if(target===composer){try{const image=await window.notebookClipboard.readImage();if(image){if(composer.querySelectorAll('img').length>=12){notice('每页最多放12张图片。');return false;}insertImageAtCursor(image);notice('图片已粘贴到光标位置。');return true;}const text=await window.notebookClipboard.readText();insertTextAtComposerCursor(text);notice('已粘贴到光标位置。');return true;}catch(error){notice('粘贴失败：'+error.message);return false;}}
  if(!(target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement)){notice('请先点击要粘贴的输入位置。');return false;}
  try{const text=await window.notebookClipboard.readText(),start=target.selectionStart??target.value.length,end=target.selectionEnd??start;target.setRangeText(text,start,end,'end');target.focus();target.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertFromPaste',data:text}));notice('已粘贴。');return true;}catch(error){notice('粘贴失败：'+error.message);return false;}
}
$('copyText').onclick=()=>copyText();$('pasteText').onclick=pasteText;
for(const id of ['undoEdit','redoEdit'])$(id).addEventListener('mousedown',event=>event.preventDefault());
$('undoEdit').onclick=()=>restoreEdit('undo');$('redoEdit').onclick=()=>restoreEdit('redo');
window.copyNotebookText=copyText;
$('save').onclick=save;$('refreshDaily').onclick=()=>refresh(true);$('search').oninput=renderIndex;$('today').onclick=()=>go(today());$('datePicker').onchange=e=>{if(e.target.value)go(e.target.value);};
$('previous').onclick=()=>go(dates[dates.indexOf(current)-1]);$('next').onclick=()=>go(dates[dates.indexOf(current)+1]);
$('penToggle').onclick=()=>{penEnabled=!penEnabled;$('penToggle').textContent=`钢笔动效：${penEnabled?'开':'关'}`;$('penToggle').setAttribute('aria-pressed',String(penEnabled));if(!penEnabled)$('pen').classList.remove('visible');};
$('backup').onclick=async()=>{if(!await saveAll())return;try{const result=await api('/api/export',{});notice('已备份到：'+result.path);}catch(error){notice(error.message);}};
let openingCover=false;
async function openCover(){if(openingCover||$('coverScreen').hidden)return;openingCover=true;await window.paperTurn(document.querySelector('.cover-masthead'),()=>{$('coverScreen').hidden=true;$('notebookApp').hidden=false;});openingCover=false;$('journalTitle').focus();}
$('coverEnter').onclick=async()=>{await openCover();$('dailyTab').click();};
$('coverEdition').textContent=new Intl.DateTimeFormat('en-GB',{year:'numeric',month:'long',timeZone:'Asia/Shanghai'}).format(new Date()).toUpperCase();
$('coverMotion').onclick=()=>{const paused=$('coverScreen').classList.toggle('motion-paused');$('coverMotion').setAttribute('aria-pressed',String(paused));$('coverMotion').textContent=paused?'继续动效':'暂停动效';};
document.querySelectorAll('[data-chapter]').forEach(button=>{button.onclick=async()=>{await openCover();await window.knowledgeOpenChapter(button.dataset.chapter);};});
$('showCover').onclick=async()=>{if(!await saveAll())return;$('notebookApp').hidden=true;$('coverScreen').hidden=false;$('coverScreen').scrollTop=0;$('coverScreen').focus();};
document.addEventListener('keydown',e=>{if(!$('imagePreview').hidden&&e.key==='Escape'){e.preventDefault();closeImagePreview();return;}if(!$('coverScreen').hidden){if(e.repeat)return;if(e.target.closest?.('button')&&['Enter',' '].includes(e.key))return;e.preventDefault();$('coverEnter').click();return;}const key=e.key.toLowerCase();if((e.ctrlKey||e.metaKey)&&key==='s'){e.preventDefault();saveAll();}if((e.ctrlKey||e.metaKey)&&key==='z'&&e.target.matches?.(historyFields)){e.preventDefault();restoreEdit(e.shiftKey?'redo':'undo');}if((e.ctrlKey||e.metaKey)&&key==='y'&&e.target.matches?.(historyFields)){e.preventDefault();restoreEdit('redo');}if(e.altKey&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const offset=e.key==='ArrowLeft'?-1:1;if(window.knowledgeIsOpen?.()){window.knowledgeTurn(offset);return;}const target=dates[dates.indexOf(current)+offset];if(target)go(target);}});
window.addEventListener('beforeunload',e=>{if(dirty||saving||window.knowledgeDirty?.()){e.preventDefault();e.returnValue='';}});
refresh();setInterval(refresh,10000);
