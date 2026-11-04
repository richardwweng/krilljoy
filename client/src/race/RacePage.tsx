import { useEffect } from "react";
import { navigate } from "../nav";
import { getSocket } from "./socket";
import { useRoom } from "./useRoom";
import RaceHome from "./RaceHome";
import RoomLobby from "./RoomLobby";
import RaceRun from "./RaceRun";
import RaceResults from "./RaceResults";

/** /race = the race page; /race/ABCD = that room (lobby, race or results). */
export default function RacePage({ path, onOcean }: { path: string; onOcean: (offset: number, chest: boolean) => void }) {
  const code = path.split("/")[2]?.toUpperCase();
  if (!code) return <RaceHome />;
  return <RoomScreen key={code} code={code} onOcean={onOcean} />;
}

function RoomScreen({ code, onOcean }: { code: string; onOcean: (offset: number, chest: boolean) => void }) {
  const { room, error, kicked, serverNow } = useRoom(code);
  const me = room?.players.find((p) => p.id === room.you);

  // The sea sinks with your depth toward the chest
  const racing = room && (room.phase === "racing" || room.phase === "countdown" || room.phase === "results");
  useEffect(() => {
    onOcean(racing && me ? Math.max(Math.min(me.depth / room.target, 1) * 0.97, 0.001) : 0.001, !!racing);
  }, [racing, me?.depth, room?.target, onOcean]);
  useEffect(() => () => onOcean(0, false), [onOcean]);

  if (kicked) return <Message text="The host removed you from this room." />;
  if (error) return <Message text={error} />;
  if (!room) return <Message text={getSocket().connected ? "Joining…" : "Connecting to the race server…"} quiet />;
  if (room.phase === "lobby") return <RoomLobby room={room} serverNow={serverNow} />;
  if (room.phase === "results") return <RaceResults room={room} serverNow={serverNow} />;
  return <RaceRun room={room} serverNow={serverNow} />;
}

function Message({ text, quiet }: { text: string; quiet?: boolean }) {
  return (
    <main className="home">
      <div className="panel race-message">
        <p>{text}</p>
        {!quiet && <button type="button" className="btn-red" onClick={() => navigate("/race")}>Back to races</button>}
      </div>
    </main>
  );
}
