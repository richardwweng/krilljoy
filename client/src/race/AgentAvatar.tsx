import { useState } from "react";
import { useAgents } from "./agents";

/** A player's agent: Riot's official icon in a ring of the player's colour (--c).
 *  If the icon can't load, the agent's initial stands in. */
export default function AgentAvatar({ name, size }: { name?: string; size?: number }) {
  const icon = useAgents().find((a) => a.name === name)?.icon ?? null;
  const [broken, setBroken] = useState<string | null>(null); // the icon that failed (a new pick gets a fresh try)
  return (
    <span className="agent-avatar" style={size ? { width: size, height: size } : undefined} title={name}>
      {icon && broken !== icon
        ? <img src={icon} alt={name} draggable={false} onError={() => setBroken(icon)} />
        : <span className="agent-initial">{name?.[0] ?? "?"}</span>}
    </span>
  );
}
