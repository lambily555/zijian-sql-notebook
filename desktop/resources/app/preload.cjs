'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('notebookClipboard',Object.freeze({
  readText:()=>ipcRenderer.invoke('clipboard:read-text'),
  writeText:text=>ipcRenderer.invoke('clipboard:write-text',String(text??'')),
  readImage:()=>ipcRenderer.invoke('clipboard:read-image'),
  writeImage:dataUrl=>ipcRenderer.invoke('clipboard:write-image',String(dataUrl??''))
}));
