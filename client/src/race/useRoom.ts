import { useEffect, useRef, useState } from "react";
import { ask, getSocket, playerToken, savedName } from "./socket";
import type { RoomView } from "./types";

/** Joins (or rejoins) a room by code and keeps its latest state. */
export function useRoom(code: string) {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kicked, setKicked] = useState(false);
  const offset = useRef(0); // server clock minus ours, so countdowns match for everyone

  useEffect(() => {
    const s = getSocket();
    const onRoom = (r: RoomView) => {
      offset.current = r.now - Date.now();
      setRoom(r);
    };
    const join = () =>
      ask<{ ok: boolean; error?: string }>("join", { code, token: playerToken, name: savedName() }).then((r) => {
        if (!r.ok) setError(r.error ?? "Couldn't join that room.");
      });
    s.on("room", onRoom);
    s.on("kicked", () => setKicked(true));
    s.on("connect", join); // also rejoins after a dropped connection
    if (s.connected) join();
    return () => {
      s.off("room", onRoom);
      s.off("connect", join);
      s.off("kicked");
    };
  }, [code]);

  const serverNow = () => Date.now() + offset.current;
  return { room, error, kicked, serverNow };
}

/** Re-render every `ms` (for countdowns). */
export function useTicker(ms = 250) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}
