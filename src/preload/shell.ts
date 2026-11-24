// The shell window's only way to the main process: read the state, hear when it changes, send a command.

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { Command, CommandResult, ShellState } from '../shared/types';

const api = {
  state: (): Promise<ShellState> => ipcRenderer.invoke('hangar:state'),
  command: (cmd: Command): Promise<CommandResult> => ipcRenderer.invoke('hangar:command', cmd),
  onState: (fn: (s: ShellState) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, s: ShellState) => fn(s);
    ipcRenderer.on('hangar:state', listener);
    return () => ipcRenderer.off('hangar:state', listener);
  },
};

export type HangarApi = typeof api;

contextBridge.exposeInMainWorld('hangar', api);
