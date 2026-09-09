const fs=require('node:fs'),path=require('node:path');
if(process.platform!=='win32')throw Error('Build this portable package on Windows.');
const root=path.resolve(__dirname,'..');
const runtime=process.env.ZIJIAN_ELECTRON_DIST||path.join(root,'node_modules/electron/dist');
const output=path.join(root,'release','zijian-sql-notebook-win32-x64');
if(fs.existsSync(output))throw Error('Output already exists. Move it aside before building again.');
fs.mkdirSync(output,{recursive:true});
fs.cpSync(runtime,path.join(output,'desktop'),{recursive:true,filter:source=>!source.startsWith(path.join(runtime,'resources','app'))});
const exe=path.join(output,'desktop',fs.existsSync(path.join(runtime,'electron.exe'))?'electron.exe':'紫笺.exe');
fs.renameSync(exe,path.join(output,'desktop','zijian.exe'));
for(const name of ['index.html','style.css','app.js','knowledge.js','app-icon.ico','knowledge_update.cjs','README.md','LICENSE'])fs.copyFileSync(path.join(root,name),path.join(output,name));
fs.cpSync(path.join(root,'desktop/resources/app'),path.join(output,'desktop/resources/app'),{recursive:true});
fs.cpSync(path.join(root,'docs'),path.join(output,'docs'),{recursive:true});
// Only the committed, anonymous seed data is packaged, never the user's live notes.
const {execFileSync}=require('node:child_process');
fs.mkdirSync(path.join(output,'data'));
for(const name of ['knowledge','coach','journal'])fs.writeFileSync(path.join(output,'data',name+'.json'),execFileSync('git',['show','HEAD:data/'+name+'.json'],{cwd:root}));
fs.writeFileSync(path.join(output,'打开紫笺.cmd'),'@echo off\r\nstart "" "%~dp0desktop\\zijian.exe"\r\n','utf8');
console.log(output);
