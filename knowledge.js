/* App-native knowledge reader/editor. Render text with DOM APIs, never eval/HTML. */
(()=>{
  let notes=null,selected='',editing=false,changed=false,draftRevision=0,pending=null;
  const el=id=>document.getElementById(id),status=text=>el('knowledgeStatus').textContent=text;
  const inputTitle=el('chapterTitleInput'),inputBody=el('chapterBodyInput');
  const active=()=>!el('knowledgeView').hidden;
  const currentChapter=()=>notes?.chapters.find(c=>c.id===selected);
  function marked(node,text){
    const q=el('knowledgeSearch').value.trim();if(!q){node.append(document.createTextNode(text));return;}
    let start=0,index;while((index=text.toLowerCase().indexOf(q.toLowerCase(),start))!==-1){node.append(document.createTextNode(text.slice(start,index)));const mark=document.createElement('mark');mark.textContent=text.slice(index,index+q.length);node.append(mark);start=index+q.length;}node.append(document.createTextNode(text.slice(start)));
  }
  function tableCells(line){return line.trim().replace(/^\|/,'').replace(/\|$/,'').split(/(?<!\\)\|/).map(s=>s.trim().replace(/\\\|/g,'|').replace(/\\\\/g,'\\'));}
  function renderMarkdown(text,container){
    container.replaceChildren();const lines=text.split('\n');let i=0;
    while(i<lines.length){let line=lines[i];if(!line.trim()){i++;continue;}
      if(line.startsWith('```')){const code=[];i++;while(i<lines.length&&!lines[i].startsWith('```'))code.push(lines[i++]);if(i<lines.length)i++;
        const wrap=document.createElement('div');wrap.className='sql-example';const toolbar=document.createElement('div');toolbar.className='sql-toolbar';const label=document.createElement('span');label.textContent='SQL 示例';const copy=document.createElement('button');copy.textContent='复制代码';copy.onclick=async()=>{const ok=await window.copyNotebookText(code.join('\n'));copy.textContent=ok?'已复制':'复制失败';setTimeout(()=>copy.textContent='复制代码',1800);};toolbar.append(label,copy);const pre=document.createElement('pre');const c=document.createElement('code');marked(c,code.join('\n'));pre.append(c);wrap.append(toolbar,pre);container.append(wrap);continue;
      }
      if(line.trim().startsWith('|')&&i+1<lines.length&&/^\|?[\s:|\-]+\|?$/.test(lines[i+1].trim())){
        const box=document.createElement('div');box.className='knowledge-table-wrap';const table=document.createElement('table');let rowIndex=0;
        while(i<lines.length&&lines[i].trim().startsWith('|')){if(rowIndex===1){i++;rowIndex++;continue;}const row=document.createElement('tr');for(const cell of tableCells(lines[i])){const td=document.createElement(rowIndex===0?'th':'td');if(rowIndex===0)td.scope='col';cell.split('<br>').forEach((part,j)=>{if(j)td.append(document.createElement('br'));marked(td,part);});row.append(td);}table.append(row);i++;rowIndex++;}box.append(table);container.append(box);continue;
      }
      if(/^#{1,6} /.test(line)){const h=document.createElement('h2');marked(h,line.replace(/^#{1,6} /,''));container.append(h);i++;continue;}
      const p=document.createElement('p'),parts=[line];i++;while(i<lines.length&&lines[i].trim()&&!/^(#{1,6} |```|\|)/.test(lines[i]))parts.push(lines[i++]);marked(p,parts.join('\n'));container.append(p);
    }
  }
  function index(){
    const listScroll=el('chapterList').scrollTop;
    const q=el('knowledgeSearch').value.trim().toLowerCase();el('chapterList').replaceChildren();el('chapterSelect').replaceChildren();let count=0;
    for(const chapter of notes?.chapters||[]){const option=document.createElement('option');option.value=chapter.id;option.textContent=chapter.title;option.selected=chapter.id===selected;el('chapterSelect').append(option);
      if(q&&!(chapter.title+'\n'+chapter.content).toLowerCase().includes(q))continue;
      const button=document.createElement('button');button.className='chapter-link';button.textContent=chapter.title;button.setAttribute('aria-current',chapter.id===selected?'page':'false');button.onclick=()=>select(chapter.id);el('chapterList').append(button);count++;
    }
    el('chapterCount').textContent=`${count} / ${notes?.chapters.length||0}`;el('noChapters').hidden=count!==0;
    el('chapterList').scrollTop=listScroll;
  }
  function render(){
    const chapter=currentChapter();index();if(!chapter)return;el('chapterTitle').textContent=chapter.title;renderMarkdown(chapter.content,el('chapterContent'));
    const pos=notes.chapters.indexOf(chapter);el('chapterPosition').textContent=`第 ${pos+1} 节`;el('chapterPager').textContent=`${pos+1} / ${notes.chapters.length}`;el('previousChapter').disabled=pos===0;el('nextChapter').disabled=pos===notes.chapters.length-1;
    try{localStorage.setItem('knowledgeChapter',selected);}catch{}
  }
  async function load(manual=false){
    try{const incoming=await api('/api/knowledge');const different=notes&&notes.revision!==incoming.revision;notes=incoming;
      if(!selected||(!editing&&!currentChapter())){let saved;try{saved=localStorage.getItem('knowledgeChapter');}catch{}selected=notes.chapters.some(c=>c.id===saved)?saved:notes.chapters.find(c=>/^1\./.test(c.title))?.id||notes.chapters[0]?.id;}
      if(!editing){render();status(`共 ${notes.chapters.length} 节 · 内容保存在 本机`);}else if(different){status('笔记已有更新；当前编辑已保留，保存时将核对版本。');}else if(manual){status('已读取最新内容，当前编辑未被覆盖。');}
    }catch(error){status('笔记未能读取');if(manual||active())notice(error.message);}
  }
  function editor(on){editing=on;el('knowledgeEditor').hidden=!on;el('knowledgeReading').hidden=on;el('editChapter').disabled=on;el('newChapter').disabled=on;}
  async function saveChapter(){
    if(pending)return pending;if(!changed)return true;
    if(!inputTitle.value.trim()){notice('请填写章节标题。');inputTitle.focus();return false;}
    const payload={id:selected,title:inputTitle.value,content:inputBody.value,revision:draftRevision};inputTitle.readOnly=inputBody.readOnly=true;status('正在保存本章…');
    pending=(async()=>{try{notes=await api('/api/knowledge',payload);changed=false;editor(false);render();notice('');status('本章已保存到 本机，历史版本已备份。');return true;}catch(error){notice(error.message);status('尚未保存，请保留当前编辑');return false;}finally{inputTitle.readOnly=inputBody.readOnly=false;}})();const ok=await pending;pending=null;return ok;
  }
  async function select(id){if(!await saveChapter())return;editor(false);if(id===selected)return;selected=id;render();document.querySelector('.knowledge-paper').scrollTop=0;const list=el('chapterList'),item=list.querySelector('[aria-current="page"]');if(item&&list.clientHeight){const a=item.getBoundingClientRect(),b=list.getBoundingClientRect();if(a.top<b.top)list.scrollTop-=b.top-a.top;else if(a.bottom>b.bottom)list.scrollTop+=a.bottom-b.bottom;}if(innerWidth<=800)el('knowledgeView').scrollIntoView({block:'start'});}
  async function switchView(knowledge){if(!await saveAll())return;el('notebookApp').classList.toggle('knowledge-mode',knowledge);el('knowledgeView').hidden=!knowledge;el('knowledgeNav').hidden=!knowledge;for(const id of ['dailyView','dailyNav','dailyTools'])el(id).hidden=knowledge;el('dailyTab').setAttribute('aria-pressed',String(!knowledge));el('knowledgeTab').setAttribute('aria-pressed',String(knowledge));el('viewName').textContent=knowledge?'知识笔记':'每日学习记录';el('pen').classList.remove('visible');if(knowledge){window.scrollTo(0,0);await load();}}
  el('knowledgeTab').onclick=()=>switchView(true);el('dailyTab').onclick=()=>switchView(false);
  el('knowledgeSearch').oninput=()=>{index();if(!editing&&currentChapter())renderMarkdown(currentChapter().content,el('chapterContent'));};
  el('chapterSelect').onchange=e=>select(e.target.value);el('refreshKnowledge').onclick=()=>load(true);
  el('editChapter').onclick=()=>{const chapter=currentChapter();if(!chapter)return;inputTitle.value=chapter.title;inputBody.value=chapter.content;draftRevision=chapter.revision;changed=false;editor(true);status('编辑模式 · 保存后更新应用主笔记');inputBody.focus();};
  el('newChapter').onclick=()=>{selected='custom-'+Date.now();inputTitle.value='';inputBody.value='';draftRevision=0;changed=false;editor(true);status('新增章节 · 填写标题与正文后保存');inputTitle.focus();};
  el('cancelChapter').onclick=()=>{if(changed&&!confirm('放弃本章尚未保存的修改？'))return;changed=false;editor(false);if(!currentChapter())selected=notes.chapters[0].id;render();status('已返回阅读模式');notice('');};
  for(const input of [inputTitle,inputBody])input.oninput=()=>{changed=true;status('编辑中 · 请保存本章');};
  el('saveChapter').onclick=saveChapter;
  const turn=offset=>{const pos=notes?.chapters.findIndex(c=>c.id===selected);const next=notes?.chapters[pos+offset];if(next)select(next.id);};
  el('previousChapter').onclick=()=>turn(-1);el('nextChapter').onclick=()=>turn(1);
  window.knowledgeSave=saveChapter;window.knowledgeDirty=()=>changed||!!pending;window.knowledgeIsOpen=active;window.knowledgeTurn=turn;
  window.knowledgeOpenChapter=async id=>{await switchView(true);if(notes?.chapters.some(c=>c.id===id)){el('knowledgeSearch').value='';await select(id);el('chapterTitle').setAttribute('tabindex','-1');el('chapterTitle').focus();}};
  setInterval(()=>{if(active())load();},10000);
})();
