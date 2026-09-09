'use strict';
const $ = id => document.getElementById(id);
const token = document.querySelector('meta[name="notebook-token"]').content;
const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let data={coach:{},journal:{}}, current=today(), dates=[], dirty=false, saving=null, editVersion=0, timer, penTimer, penEnabled=true, ready=false;
const title=$('journalTitle'), body=$('journalBody');
function notice(text){$('notice').textContent=text;$('notice').hidden=!text;}
async function api(path,payload){
  const response=await fetch(path,payload===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json','X-Notebook-Token':token},body:JSON.stringify(payload)});
  const value=await response.json();if(!response.ok)throw Error(value.error||'操作失败');return value;
}
function allDates(){return [...new Set([...Object.keys(data.coach),...Object.keys(data.journal),current])].sort();}
function renderIndex(){
  dates=allDates();const q=$('search').value.trim().toLowerCase();$('dates').replaceChildren();let matches=0;
  for(const day of [...dates].reverse()){
    const coach=data.coach[day]||{},journal=data.journal[day]||{};
    if(q&&!JSON.stringify({day,coach,journal}).toLowerCase().includes(q))continue;
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
  $('datePicker').value=current;title.value=data.journal[current]?.title||'';body.value=data.journal[current]?.body||'';
  $('wordCount').textContent=`${body.value.length} 字`;renderCoach();renderIndex();$('status').textContent=data.journal[current]?'已保存到本机':'已打开 · 等你落笔';
}
async function refresh(){
  try{const incoming=await api('/api/notebook');
    // Never replace an active or unsaved user edit with an external update.
    data.coach=incoming.coach;
    if(!dirty&&!saving&&document.activeElement!==body&&document.activeElement!==title){data.journal=incoming.journal;if(ready){title.value=data.journal[current]?.title||'';body.value=data.journal[current]?.body||'';$('wordCount').textContent=`${body.value.length} 字`;}}
    if(!ready){data.journal=incoming.journal;const keys=allDates();current=keys.includes(today())?today():keys[keys.length-1];ready=true;render();}else{renderCoach();renderIndex();}
  }catch(error){notice(error.message||'无法读取记录，请重新打开紫笺笔记本。');$('status').textContent='读取未成功';}
}
async function save(){
  clearTimeout(timer);
  if(saving){await saving;if(dirty)return save();return true;}
  if(!dirty)return true;
  const version=editVersion,day=current,payload={date:day,title:title.value,body:body.value,revision:data.journal[day]?.revision||0};
  $('status').textContent='正在保存到本机…';
  saving=(async()=>{try{const entry=await api('/api/journal',payload);data.journal[day]=entry;if(version===editVersion)dirty=false;$('status').textContent=dirty?'还有新文字待保存':'已保存到本机';notice('');renderIndex();return true;}catch(error){notice(error.message);$('status').textContent='未保存 · 请保留当前页面';return false;}})();
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
document.addEventListener('focusin',event=>{if(event.target.matches?.('input,textarea,[contenteditable="true"]'))lastEditable=event.target;});
function selectedText(){const active=document.activeElement;if(active instanceof HTMLInputElement||active instanceof HTMLTextAreaElement)return active.value.slice(active.selectionStart??0,active.selectionEnd??0);return getSelection()?.toString()||'';}
async function copyText(text=selectedText()){
  if(!text){notice('请先选中要复制的文字。');return false;}
  try{await window.notebookClipboard.writeText(text);notice('已复制到剪贴板。');return true;}catch(error){notice('复制失败：'+error.message);return false;}
}
async function pasteText(){
  const target=lastEditable;if(!(target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement)){notice('请先点击要粘贴的输入位置。');return false;}
  try{const text=await window.notebookClipboard.readText(),start=target.selectionStart??target.value.length,end=target.selectionEnd??start;target.setRangeText(text,start,end,'end');target.focus();target.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertFromPaste',data:text}));notice('已粘贴。');return true;}catch(error){notice('粘贴失败：'+error.message);return false;}
}
$('copyText').onclick=()=>copyText();$('pasteText').onclick=pasteText;
window.copyNotebookText=copyText;
$('save').onclick=save;$('search').oninput=renderIndex;$('today').onclick=()=>go(today());$('datePicker').onchange=e=>{if(e.target.value)go(e.target.value);};
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
document.addEventListener('keydown',e=>{if(!$('coverScreen').hidden){if(e.repeat)return;if(e.target.closest?.('button')&&['Enter',' '].includes(e.key))return;e.preventDefault();$('coverEnter').click();return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveAll();}if(e.altKey&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const offset=e.key==='ArrowLeft'?-1:1;if(window.knowledgeIsOpen?.()){window.knowledgeTurn(offset);return;}const target=dates[dates.indexOf(current)+offset];if(target)go(target);}});
window.addEventListener('beforeunload',e=>{if(dirty||saving||window.knowledgeDirty?.()){e.preventDefault();e.returnValue='';}});
refresh();setInterval(refresh,10000);
