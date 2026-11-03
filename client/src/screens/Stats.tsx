import Modal from "../components/Modal";
import { loadHistory } from "../game/storage";
import { summarize } from "../game/stats";

export default function Stats({ today, onClose }: { today: string; onClose: () => void }) {
  const s = summarize(loadHistory(), today);
  const items: [string, string][] = [
    ["Dives", String(s.played)],
    ["Streak", String(s.streak)],
    ["Best", `${s.best.toLocaleString("en-US")} m`],
    ["Average", `${s.average.toLocaleString("en-US")} m`],
    ["Radiants", String(s.radiants)],
  ];
  return (
    <Modal title="Your stats" onClose={onClose}>
      <div className="stats-grid">
        {items.map(([k, v]) => (
          <div key={k} className="stat"><div className="stat-value">{v}</div><div className="label">{k}</div></div>
        ))}
      </div>
      <p className="muted">Saved in this browser only.</p>
    </Modal>
  );
}
