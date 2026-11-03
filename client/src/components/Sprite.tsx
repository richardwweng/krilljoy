import { useMemo, type CSSProperties } from "react";

interface Props {
  rows: string[];
  colors: Record<string, string>;
  scale?: number; // size of one pixel, in CSS pixels
  style?: CSSProperties;
  className?: string;
  label?: string; // leave empty for decoration
}

/** Draws pixel art with one tiny box and a box-shadow per pixel: crisp at any size, no image files. */
export default function Sprite({ rows, colors, scale = 3, style, className, label }: Props) {
  const shadow = useMemo(() => {
    const out: string[] = [];
    rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (colors[ch]) out.push(`${x * scale}px ${y * scale}px 0 0 ${colors[ch]}`);
      }),
    );
    return out.join(",");
  }, [rows, colors, scale]);
  return (
    <span
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ position: "relative", display: "inline-block", flex: "none", width: rows[0].length * scale, height: rows.length * scale, ...style }}
    >
      <span style={{ position: "absolute", left: 0, top: 0, width: scale, height: scale, boxShadow: shadow }} />
    </span>
  );
}
