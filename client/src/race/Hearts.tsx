import Sprite from "../components/Sprite";
import { HEART } from "../components/sprites";

/** Pixel hearts: filled = lives left. Extra lives add hearts beyond the starting ones. */
export function Hearts({ lives, max, scale = 2 }: { lives: number; max: number; scale?: number }) {
  const slots = Math.max(lives, max); // extra lives add hearts beyond the starting two
  return (
    <span className="hearts" aria-label={`${lives} ${lives === 1 ? "life" : "lives"}`}>
      {Array.from({ length: slots }, (_, i) => (
        <Sprite key={i} rows={HEART} colors={{ X: i < lives ? "#ff4655" : "#2a3646" }} scale={scale} />
      ))}
    </span>
  );
}
