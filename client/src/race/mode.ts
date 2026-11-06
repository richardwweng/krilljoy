// Which multiplayer mode the page is showing, so the top bar's "How to play" opens the right rules.
import type { Mode } from "./types";

let current: Mode = "race";
export const howToMode = () => current;
export function setHowToMode(m: Mode) {
  current = m;
}
