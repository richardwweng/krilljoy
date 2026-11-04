// The connection to the race server, made only when someone opens the race pages.
import { useEffect, useSyncExternalStore } from "react";
import { io, type Socket } from "socket.io-client";

const SERVER = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) socket = io(SERVER, { autoConnect: true });
  return socket;
}

// Your secret player ID, so a refresh keeps your seat.
// On localhost each tab is its own player (sessionStorage) to make testing with several tabs easy.
function store(): Storage | null {
  try {
    return location.hostname === "localhost" ? sessionStorage : localStorage;
  } catch {
    return null;
  }
}
export const playerToken: string = (() => {
  const s = store();
  let t = s?.getItem("krilljoy:token") ?? null;
  if (!t) {
    t = crypto.randomUUID();
    s?.setItem("krilljoy:token", t);
  }
  return t;
})();

export function savedName(): string {
  try { return localStorage.getItem("krilljoy:name") ?? ""; } catch { return ""; }
}
export function saveName(name: string) {
  try { localStorage.setItem("krilljoy:name", name); } catch { /* fine */ }
}

/** Send a message and wait for the server's reply. */
export function ask<T>(event: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve) => getSocket().emit(event, ...args, resolve));
}

/** true while connected to the race server */
export function useConnected(): boolean {
  useEffect(() => { getSocket(); }, []);
  return useSyncExternalStore(
    (cb) => {
      const s = getSocket();
      s.on("connect", cb);
      s.on("disconnect", cb);
      return () => { s.off("connect", cb); s.off("disconnect", cb); };
    },
    () => getSocket().connected,
  );
}
