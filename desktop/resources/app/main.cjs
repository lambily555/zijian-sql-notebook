const {app,BrowserWindow,protocol,session,Menu,dialog,nativeImage,clipboard,ipcMain,Tray}=require('electron');
const path=require('node:path'),fs=require('node:fs');
app.disableHardwareAcceleration();
const override=process.argv.find(v=>v.startsWith('--notebook-root='));
const root=override?path.resolve(override.slice('--notebook-root='.length)):path.resolve(__dirname,'../../..');
const profile=path.join(root,'desktop-profile');fs.mkdirSync(profile,{recursive:true});
app.setPath('userData',profile);app.setPath('sessionData',profile);app.setPath('logs',path.join(profile,'logs'));app.setAppUserModelId('io.github.lambily555.zijian');app.setName('紫笺 SQL 学习笔记本');
protocol.registerSchemesAsPrivileged([{scheme:'zijian',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
let win,tray,closing=false,exitAction=null;
function showWindow(){if(win&&!win.isDestroyed()){if(win.isMinimized())win.restore();win.show();win.focus();}}
function requestExit(restart=false){exitAction=restart?'restart':'quit';if(win&&!win.isDestroyed())win.close();}
if(!app.requestSingleInstanceLock()){app.quit();}else{
  app.on('second-instance',(_event,argv)=>{if(argv.includes('--restart-notebook'))requestExit(true);else showWindow();});
  app.whenReady().then(async()=>{
    protocol.handle('zijian',require('./storage.cjs')(root));
    ipcMain.removeHandler('clipboard:read-text');ipcMain.removeHandler('clipboard:write-text');ipcMain.removeHandler('clipboard:read-image');ipcMain.removeHandler('clipboard:write-image');
    ipcMain.handle('clipboard:read-text',()=>clipboard.readText());
    ipcMain.handle('clipboard:write-text',(_event,text)=>{clipboard.writeText(String(text));return true;});
    ipcMain.handle('clipboard:read-image',()=>{const image=clipboard.readImage();return image.isEmpty()?'':image.toDataURL();});
    ipcMain.handle('clipboard:write-image',(_event,dataUrl)=>{const image=nativeImage.createFromDataURL(dataUrl);if(image.isEmpty())throw Error('图片为空');clipboard.writeImage(image);return true;});
    Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'编辑',submenu:[{role:'undo',label:'撤销'},{role:'redo',label:'重做'},{type:'separator'},{role:'cut',label:'剪切'},{role:'copy',label:'复制'},{role:'paste',label:'粘贴'},{role:'selectAll',label:'全选'}]}]));
    session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
    session.defaultSession.setPermissionCheckHandler(()=>false);
    session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('zijian://notebook/')&&!details.url.startsWith('devtools://')}));
    win=new BrowserWindow({width:1400,height:950,minWidth:860,minHeight:650,title:'紫笺 SQL 学习笔记本',backgroundColor:'#eeebf0',autoHideMenuBar:true,show:false,icon:path.join(root,'app-icon.ico'),webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,spellcheck:false,preload:path.join(__dirname,'preload.cjs')}});
    tray=new Tray(nativeImage.createFromPath(path.join(root,'app-icon.ico')).resize({width:24,height:24}));
    tray.setToolTip('紫笺 · SQL 学习笔记本');
    tray.setContextMenu(Menu.buildFromTemplate([
      {label:'打开学习笔记本',click:showWindow},
      {label:'保存并重新打开',click:()=>requestExit(true)},
      {type:'separator'},
      {label:'退出紫笺',click:()=>requestExit(false)}
    ]));
    tray.on('click',showWindow);
    tray.on('double-click',showWindow);
    win.webContents.on('context-menu',(_event,params)=>{
      const items=[];
      if(params.isEditable)items.push({role:'undo',label:'撤销',enabled:params.editFlags.canUndo},{role:'redo',label:'重做',enabled:params.editFlags.canRedo},{type:'separator'},{role:'cut',label:'剪切',enabled:params.editFlags.canCut},{role:'copy',label:'复制',enabled:params.editFlags.canCopy},{role:'paste',label:'粘贴',enabled:params.editFlags.canPaste},{type:'separator'},{role:'selectAll',label:'全选'});
      else if(params.selectionText)items.push({role:'copy',label:'复制'});
      if(items.length)Menu.buildFromTemplate(items).popup({window:win});
    });
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('zijian://notebook/'))event.preventDefault();});
    win.webContents.on('page-title-updated',event=>event.preventDefault());
    win.once('ready-to-show',()=>win.show());
    win.on('close',async event=>{
      if(closing)return;event.preventDefault();if(win._savingOnClose)return;win._savingOnClose=true;
      try{const saved=await win.webContents.executeJavaScript('typeof saveAll === "function" ? saveAll() : typeof save === "function" ? save() : false');if(!saved){exitAction=null;showWindow();await dialog.showMessageBox(win,{type:'warning',title:'笔记尚未保存',message:'保存未成功，已保留窗口。请先复制文字或重试保存。',buttons:['返回笔记']});return;}if(!exitAction){win.hide();return;}closing=true;if(exitAction==='restart')app.relaunch({args:process.argv.slice(1).filter(v=>v!=='--restart-notebook')});tray.destroy();win.destroy();app.quit();}
      catch{exitAction=null;showWindow();await dialog.showMessageBox(win,{type:'warning',message:'无法确认手记已保存，暂不关闭窗口。',buttons:['返回']});}
      finally{if(win&&!win.isDestroyed())win._savingOnClose=false;}
    });
    await win.loadURL('zijian://notebook/');
  }).catch(error=>{dialog.showErrorBox('紫笺启动失败',error.message);app.quit();});
  app.on('window-all-closed',()=>app.quit());
}
