import { BOAT, FISH, KELP, SUN } from "./sprites";
import Sprite from "./Sprite";

// The whole sea is one tall strip (sky at the top, seabed at the bottom).
// The game slides it up as you dive, so the screen literally sinks with your score.
const TRACK_VH = 500; // strip height, in screen heights
const SURFACE = 12;   // % of the strip where the sky ends

function mix(a: string, b: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
function bands(from: string, to: string, count: number, start: number, end: number) {
  const step = (end - start) / count;
  return Array.from({ length: count }, (_, i) => `${mix(from, to, i / (count - 1))} ${start + i * step}% ${start + (i + 1) * step}%`);
}
// Hard color steps (no smooth gradient) for the pixel look
const BACKGROUND = `linear-gradient(180deg, ${[
  ...bands("#141a35", "#c94450", 10, 0, SURFACE),      // dusk sky, Valorant red at the horizon
  ...bands("#1b4a72", "#0b2036", 12, SURFACE, 40),
  ...bands("#0a1d33", "#050c16", 16, 40, 97),
  "#1b2a3a 97% 100%",                                   // seabed
].join(",")})`;

const STARS = [[6, 0.8, 3], [18, 2.2, 2], [29, 0.6, 3], [68, 1.4, 3], [78, 2.6, 2], [90, 0.9, 3], [96, 3.4, 2], [48, 0.5, 2]];
const BUBBLES = [[8, 3, 10, 9], [11, 2, 6, 13], [86, 4, 9, 11], [88, 1, 5, 16], [22, 6, 7, 12], [70, 5, 8, 14], [54, 0, 5, 18], [94, 7, 6, 10]];
const FISHES = [[10, 38, "#2e86a8", 5, false, 34], [78, 30, "#3a5d88", 4, true, 41], [24, 72, "#2a4f7a", 4, false, 47], [66, 82, "#2e86a8", 5, true, 39]] as const;

/** offset: how far down we are, 0 = surface with sky, 1 = seabed */
export default function Ocean({ offset }: { offset: number }) {
  const START = 75; // just under the surface when the dive starts
  const shift = offset <= 0 ? 0 : START + Math.min(offset, 1) * (TRACK_VH - 100 - START);
  return (
    <div className="ocean" aria-hidden="true">
      <div className="ocean-track" style={{ height: `${TRACK_VH}vh`, background: BACKGROUND, transform: `translateY(-${shift}vh)` }}>
        {STARS.map(([x, y, s], i) => (
          <span key={i} className="star" style={{ left: `${x}%`, top: `${y}%`, width: s, height: s }} />
        ))}
        <div className="sun" style={{ top: `${SURFACE}%` }}>
          <Sprite rows={SUN} colors={{ X: "#ff8a5c" }} scale={7} />
        </div>
        <div className="waves" style={{ top: `${SURFACE}%` }} />
        <div className="boat" style={{ top: `${SURFACE}%` }}>
          <Sprite rows={BOAT} colors={{ R: "#ff4655", M: "#c9d6e6", W: "#e9dfc8", N: "#06101c" }} scale={4} />
        </div>
        <div className="rays" style={{ top: `${SURFACE}%` }}>
          {[12, 30, 52, 74, 88].map((x, i) => <span key={i} style={{ left: `${x}%`, width: 40 + (i % 3) * 25 }} />)}
        </div>
        {[[5, "#1f6b5a", 7], [9, "#174f45", 6], [90, "#1f6b5a", 7], [95, "#174f45", 5]].map(([x, c, s], i) => (
          <div key={i} className="kelp" style={{ left: `${x}%` }}>
            <Sprite rows={KELP} colors={{ G: c as string }} scale={s as number} />
          </div>
        ))}
      </div>
      {/* bubbles and fish float in front, wherever you are */}
      {BUBBLES.map(([x, delay, size, dur], i) => (
        <span key={i} className="bubble" style={{ left: `${x}%`, width: size, height: size, animationDelay: `${delay}s`, animationDuration: `${dur}s` }} />
      ))}
      {offset > 0 &&
        FISHES.map(([x, y, c, s, flip, dur], i) => (
          <div key={i} className={`fish${flip ? " flip" : ""}`} style={{ left: `${x}%`, top: `${y}%`, animationDuration: `${dur}s` }}>
            <Sprite rows={flip ? FISH.map((r) => [...r].reverse().join("")) : FISH} colors={{ X: c, E: "#06101c" }} scale={s} />
          </div>
        ))}
      <div className="scanlines" />
    </div>
  );
}
