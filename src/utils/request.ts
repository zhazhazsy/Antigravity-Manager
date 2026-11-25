import { invoke } from '@tauri-apps/api/core';

export const isTauri = true;

export async function request<T>(cmd: string, args?: Record<string, any>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (error) {
    console.error(`Tauri Invoke Error [${cmd}]:`, error);
    throw error;
  }
}

export default request;
