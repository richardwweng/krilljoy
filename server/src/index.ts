// Krilljoy multiplayer server. Holds every room, runs the clocks, and is the referee:
// answers are checked here, so everyone plays by the same rules. Two modes share the
// rooms and lobbies: Treasure race (race.ts) and Spike splash (spike.ts).
//
//   npm run dev     (on your computer, restarts when you save)
//   npm start       (on Render)
import { createServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { randomUUID } from "node:crypto";
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity";
import { allAgents, allPrompts, getPrompt } from "./data.ts";
import {
  RACE_LENGTHS, SKIP_AFTER_MS, currentPrompt, isOver, skip, standings, startRace, submitAnswer,
  type Race, type RaceLength,
} from "./race.ts";
import {
  LIFE_EVERY, MAX_LIVES, SPIKE_LIVES, answerLimit, currentSpikePrompt, leaveSpike, spikeStandings, startSpike,
  submitSpike, tickSpike, type Spike, type SpikePace,
} from "./spike.ts";

import { CHAT_KEEP, EMOTES, QUICK_CHAT, allowChat, allowEmote, cleanChat, emoteVisible, type ChatLine } from "./chat.ts";

type Mode = "race" | "spike";
const MODES: Mode[] = ["race", "spike"];

type Person = {
  id: string; // public ID, safe to show everyone
  token: string; // secret ID from the player's browser, never sent to others
  name: string;
  socketId: string | null; // null while disconnected
  leaveTimer?: ReturnType<typeof setTimeout>;
  left: boolean; // gave up their seat mid-race (still shown in the results)
  lastAnswerAt: number;
  chatTimes: number[]; // recent chat messages, for the spam limit
  emote: { emoji: string; at: number } | null; // the emoji bubble above their seat
  avatar: string; // the agent they sit as in Spike splash (one per agent per room)
};

type Phase = "lobby" | "countdown" | "racing" | "results";

type Room = {
  code: string;
  mode: Mode;
  pace: SpikePace; // Spike splash: how long each question lasts
  spike: Spike | null;
  phase: Phase;
  isPublic: boolean; // listed on the race page; Quick play puts people here
  hostId: string | null;
  length: RaceLength;
  maxPlayers: number;
  players: Person[];
  race: Race | null;
  kicked: Set<string>; // tokens the host removed
  countdownEndsAt: number | null;
  autoStartAt: number | null; // public rooms start on their own
  returnAt: number | null; // public rooms go back to the lobby after the results
  timers: ReturnType<typeof setTimeout>[];
  autoTimer: ReturnType<typeof setTimeout> | null; // the public auto-start, kept apart so it can be cancelled alone
  createdAt: number;
  chat: ChatLine[];
  chatSeq: number;
};

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ"; // 4 letters like ABCD; no I/L/O to mix up
const MAX_PLAYERS: Record<Mode, number> = { race: 10, spike: 8 }; // Spike splash: 8 max (Richard's call)
const DEFAULT_PLAYERS: Record<Mode, number> = { race: 8, spike: 6 }; // also the Quick play room size
const COUNTDOWN_MS = 3_000; // "3, 2, 1, dive!"
const PUBLIC_START_MS = 30_000; // public lobby: starts 30 s after it fills up (Richard's call);
                                // before that, the host can press Start any time
const PUBLIC_RESULTS_MS = 45_000; // public rooms show the results, then go back to the lobby
const LOBBY_GRACE_MS = 30_000; // how long a lobby seat is held after disconnecting
const RACE_GRACE_MS = 90_000; // mid-race you have longer to reconnect and keep your progress
const MIN_ANSWER_GAP_MS = 150; // stops answer spam

const nameFilter = new RegExpMatcher({
  ...englishDataset.removePhrasesIf((p) => p.metadata?.originalWord === "dick").build(), // "Dick" is a real name
  ...englishRecommendedTransformers,
});

const rooms = new Map<string, Room>();

function makeCode(): string {
  let code = "";
  for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return rooms.has(code) ? makeCode() : code;
}

function makeRoom(isPublic: boolean, mode: Mode = "race", length: RaceLength = "normal", maxPlayers = DEFAULT_PLAYERS[mode], pace: SpikePace = "normal"): Room {
  const room: Room = {
    code: makeCode(), mode, pace, spike: null, phase: "lobby", isPublic, hostId: null, length, maxPlayers, players: [], race: null,
    kicked: new Set(), countdownEndsAt: null, autoStartAt: null, returnAt: null, timers: [], autoTimer: null, createdAt: Date.now(), chat: [], chatSeq: 0,
  };
  rooms.set(room.code, room);
  later(room, () => { if (!room.players.length) closeRoom(room); }, 5 * 60_000); // nobody came
  console.log("Room created:", room.code, mode, isPublic ? "(public)" : "");
  return room;
}

function say(room: Room, by: Person | null, text: string) {
  room.chat.push({ id: ++room.chatSeq, by: by?.id ?? null, name: by?.name ?? "", text, at: Date.now() });
  if (room.chat.length > CHAT_KEEP) room.chat.splice(0, room.chat.length - CHAT_KEEP);
}

function later(room: Room, fn: () => void, ms: number) {
  room.timers.push(setTimeout(fn, ms));
}
function clearTimers(room: Room) {
  room.timers.forEach(clearTimeout);
  room.timers = [];
  cancelAutoStart(room);
}
function closeRoom(room: Room) {
  clearTimers(room);
  rooms.delete(room.code);
  sendRoomList();
}

function cleanName(raw: unknown): string | { error: string } {
  const name = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 16);
  if (!name) return `Diver${Math.floor(1000 + Math.random() * 9000)}`;
  if (nameFilter.hasMatch(name)) return { error: "Please pick a different name." };
  return name;
}

// ---------- what each player sees ----------

function view(room: Room, me: Person) {
  const race = room.race;
  const now = Date.now();
  const place = new Map(race ? standings(race).map((r, i) => [r.id, i + 1]) : []);
  const players = room.players.map((p) => {
    const r = race?.racers.get(p.id);
    return {
      id: p.id, name: p.name, connected: !!p.socketId, left: p.left,
      emote: p.emote && emoteVisible(p.emote.at, now) ? p.emote : null, avatar: p.avatar,
      depth: r?.depth ?? 0, answered: r?.history.filter((h) => h.answerId).length ?? 0,
      skips: r?.skips ?? 0, finished: r?.finishedAt != null, place: place.get(p.id) ?? null,
    };
  });
  const mine = race?.racers.get(me.id);
  const prompt = race && mine && room.phase === "racing" ? currentPrompt(race, mine) : null;
  return {
    code: room.code, mode: room.mode, pace: room.pace, phase: room.phase, isPublic: room.isPublic, hostId: room.hostId, you: me.id,
    length: room.length, target: RACE_LENGTHS[room.length], maxPlayers: room.maxPlayers, now,
    countdownEndsAt: room.countdownEndsAt, autoStartAt: room.autoStartAt, returnAt: room.returnAt,
    lastCallEndsAt: race?.lastCallEndsAt ?? null,
    endReason: race?.endReason ?? null,
    firstFinisher: race?.firstFinisher ? room.players.find((p) => p.id === race.firstFinisher)?.name ?? null : null,
    players,
    question: prompt && mine ? {
      n: mine.index + 1, promptId: prompt.id, text: prompt.text, pool: prompt.pool,
      shownAt: mine.shownAt, skipAt: mine.shownAt + SKIP_AFTER_MS,
    } : null,
    results: room.phase === "results" && race ? standings(race).map((r, i) => ({
      id: r.id, place: i + 1, name: room.players.find((p) => p.id === r.id)?.name ?? "?",
      depth: r.depth, finished: r.finishedAt != null, timeMs: r.finishedAt != null ? r.finishedAt - race.startAt : null,
      skips: r.skips, misses: r.misses,
      history: r.history.map((h) => ({ ...h, text: getPrompt(h.promptId)?.text ?? h.promptId })),
    })) : null,
    spike: room.spike ? spikeView(room, room.spike) : null,
    chat: room.chat,
    quickChat: QUICK_CHAT,
    emotes: EMOTES,
  };
}

function spikeView(room: Room, s: Spike) {
  const prompt = currentSpikePrompt(s);
  const total = prompt?.answers.length ?? 0;
  const limit = answerLimit(total, s.pace);
  return {
    lives: SPIKE_LIVES,
    maxLives: MAX_LIVES,
    lifeEvery: LIFE_EVERY,
    lastLife: s.lastLife,
    qNumber: s.qNumber,
    question: prompt ? { text: prompt.text, pool: prompt.pool, total, limit: Number.isFinite(limit) ? limit : null } : null,
    said: s.said,
    turn: s.turn,
    turnStartsAt: s.turnStartsAt,
    turnEndsAt: s.turnEndsAt,
    seats: s.seats.map((id) => {
      const p = s.players.get(id)!;
      return { id, lives: p.lives, out: p.outAt !== null, points: p.points, answers: p.said.length, meter: p.meter, meterParts: p.meterParts, last: p.last };
    }),
    event: s.event,
    results: room.phase === "results" ? spikeStandings(s).map((p, i) => ({
      id: p.id, place: i + 1, name: room.players.find((x) => x.id === p.id)?.name ?? "?",
      lives: p.lives, out: p.outAt !== null, points: p.points, detonations: p.detonations, misses: p.misses, livesGained: p.livesGained,
      said: p.said.map((x) => ({ ...x, text: getPrompt(x.promptId)?.text ?? x.promptId })),
    })) : null,
  };
}

function sendRoom(room: Room) {
  for (const p of room.players) {
    if (p.socketId) io.to(p.socketId).emit("room", view(room, p));
  }
}

// Public rooms for the race page's list (refreshed on any change, at most twice a second)
let listTimer: ReturnType<typeof setTimeout> | null = null;
function sendRoomList() {
  if (listTimer) return;
  listTimer = setTimeout(() => {
    listTimer = null;
    io.to("room-list").emit("rooms", publicRooms());
  }, 500);
}
function publicRooms() {
  return [...rooms.values()]
    .filter((r) => r.isPublic && r.players.some((p) => !p.left))
    .map((r) => ({
      code: r.code, host: r.players.find((p) => p.id === r.hostId)?.name ?? r.players[0]?.name ?? "",
      players: r.players.filter((p) => !p.left).length, maxPlayers: r.maxPlayers, phase: r.phase, length: r.length,
      mode: r.mode, pace: r.pace,
    }))
    .sort((a, b) => Number(a.phase !== "lobby") - Number(b.phase !== "lobby") || b.players - a.players)
    .slice(0, 50);
}

// ---------- room flow ----------

function seated(room: Room) {
  return room.players.filter((p) => !p.left);
}

function cancelAutoStart(room: Room) {
  if (room.autoTimer) clearTimeout(room.autoTimer);
  room.autoTimer = null;
  room.autoStartAt = null;
}

/** Public lobbies start by themselves 30 s after they fill up. Call this whenever the
 *  room changes (someone joins or leaves, public/private, max players): the countdown
 *  runs only while the room is a FULL PUBLIC lobby, and starts again from 30 s each
 *  time it becomes one. A private room never starts on its own. */
function scheduleAutoStart(room: Room) {
  const full = seated(room).length >= room.maxPlayers;
  if (!room.isPublic || room.phase !== "lobby" || !full) return cancelAutoStart(room);
  if (room.autoTimer) return; // already counting down
  room.autoStartAt = Date.now() + PUBLIC_START_MS;
  room.autoTimer = setTimeout(() => {
    room.autoTimer = null;
    room.autoStartAt = null;
    // double-check: still a full public lobby
    if (room.isPublic && room.phase === "lobby" && seated(room).length >= room.maxPlayers) beginCountdown(room);
  }, PUBLIC_START_MS);
}

function beginCountdown(room: Room) {
  clearTimers(room);
  room.phase = "countdown";
  room.autoStartAt = null;
  room.returnAt = null;
  room.countdownEndsAt = Date.now() + COUNTDOWN_MS;
  const ids = seated(room).map((p) => p.id);
  if (room.mode === "spike") {
    room.race = null;
    room.spike = startSpike(ids, room.pace, room.countdownEndsAt);
  } else {
    room.spike = null;
    room.race = startRace(ids, room.length, room.countdownEndsAt);
  }
  room.players = seated(room); // people who left before the start don't take a lane
  later(room, () => {
    room.phase = "racing";
    room.countdownEndsAt = null;
    sendRoom(room);
    tick(room);
  }, COUNTDOWN_MS);
  sendRoom(room);
  sendRoomList();
}

// During a game: the race checks its last call once a second; Spike splash checks the
// turn clock five times a second so the spike goes off on time.
function tick(room: Room) {
  if (room.phase !== "racing") return;
  if (room.spike && tickSpike(room.spike, Date.now())) {
    if (!checkOver(room)) sendRoom(room);
  }
  if (checkOver(room)) return;
  later(room, () => tick(room), room.spike ? 200 : 1000);
}

function activeIds(room: Room) {
  return new Set(room.players.filter((p) => !p.left).map((p) => p.id));
}

function checkOver(room: Room): boolean {
  if (room.phase !== "racing") return false;
  const race = room.race;
  if (room.spike) {
    if (room.spike.endedAt === null) return false;
  } else {
    if (!race || !isOver(race, Date.now(), activeIds(room))) return false;
    race.endedAt = Date.now();
  }
  room.phase = "results";
  clearTimers(room);
  if (room.isPublic) {
    room.returnAt = Date.now() + PUBLIC_RESULTS_MS;
    later(room, () => backToLobby(room), PUBLIC_RESULTS_MS);
  }
  sendRoom(room);
  sendRoomList();
  if (race) console.log(`Race over in ${room.code}:`, standings(race).map((r) => `${r.depth}m`).join(", "));
  else console.log(`Spike splash over in ${room.code}`);
  return true;
}

function backToLobby(room: Room) {
  clearTimers(room);
  room.phase = "lobby";
  room.race = null;
  room.spike = null;
  room.returnAt = null;
  room.players = room.players.filter((p) => !p.left && p.socketId);
  if (!room.players.length) return closeRoom(room);
  if (!room.players.some((p) => p.id === room.hostId)) room.hostId = room.players[0].id;
  scheduleAutoStart(room);
  sendRoom(room);
  sendRoomList();
}

function removePlayer(room: Room, p: Person) {
  clearTimeout(p.leaveTimer);
  say(room, null, `${p.name} left`);
  if (room.phase === "racing" || room.phase === "countdown") {
    p.left = true; // keep their lane and depth for the results
    p.socketId = null;
    if (room.spike) leaveSpike(room.spike, p.id, Date.now()); // Spike splash: leaving = out
  } else {
    room.players = room.players.filter((x) => x !== p);
  }
  if (room.hostId === p.id) room.hostId = seated(room)[0]?.id ?? null;
  if (!seated(room).length) return closeRoom(room);
  scheduleAutoStart(room); // someone left: a full lobby isn't full any more
  if (!checkOver(room)) sendRoom(room);
  sendRoomList();
}

// ---------- server ----------

const PORT = Number(process.env.PORT) || 3001;
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173,http://localhost:4173").split(",").map((s) => s.trim());

const httpServer = createServer((req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  if (path === "/health" || path === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(`Krilljoy race server: ok. ${rooms.size} rooms, ${allPrompts().length} questions.`);
    return;
  }
  res.writeHead(404).end();
});

const io = new Server(httpServer, { cors: { origin: CLIENT_ORIGINS } });

// Which room each socket is in
const where = new Map<string, { room: Room; person: Person }>();

type Ack = (reply: Record<string, unknown>) => void;
const safeAck = (ack: unknown): Ack => (typeof ack === "function" ? (ack as Ack) : () => {});
// The reply callback is the last argument, whether or not anything was sent before it
const lastAck = (args: unknown[]): Ack => safeAck(args.findLast((a) => typeof a === "function"));

/** A random agent nobody in the room is using yet (new players start as one). */
function freeAgent(room: Room): string {
  const taken = new Set(seated(room).map((p) => p.avatar));
  const all = allAgents();
  if (!all.length) return "Jett"; // agent list missing: everyone still gets someone
  const free = all.filter((a) => !taken.has(a.name));
  const list = free.length ? free : all;
  return list[Math.floor(Math.random() * list.length)].name;
}

function seat(socket: Socket, room: Room, token: string, rawName: unknown, ack: Ack) {
  if (room.kicked.has(token)) return ack({ ok: false, error: "The host removed you from this room." });
  let person = room.players.find((p) => p.token === token);
  if (!person) {
    if (room.phase !== "lobby") return ack({ ok: false, error: "That race has already started. Try again when it ends, or join another room." });
    if (seated(room).length >= room.maxPlayers) return ack({ ok: false, error: "That room is full." });
    const name = cleanName(rawName);
    if (typeof name !== "string") return ack({ ok: false, error: name.error });
    person = { id: randomUUID().slice(0, 8), token, name, socketId: null, left: false, lastAnswerAt: 0, chatTimes: [], emote: null, avatar: freeAgent(room) };
    room.players.push(person);
    say(room, null, `${name} joined`);
  }
  // Coming back (or switching tabs): take the seat over
  leaveCurrent(socket, room);
  clearTimeout(person.leaveTimer);
  person.left = false;
  if (person.socketId && person.socketId !== socket.id) io.to(person.socketId).emit("replaced");
  person.socketId = socket.id;
  if (!room.hostId) room.hostId = person.id;
  where.set(socket.id, { room, person });
  socket.join(`room:${room.code}`);
  scheduleAutoStart(room);
  ack({ ok: true, code: room.code });
  sendRoom(room);
  sendRoomList();
}

function leaveCurrent(socket: Socket, except?: Room) {
  const at = where.get(socket.id);
  if (!at || at.room === except) return;
  where.delete(socket.id);
  socket.leave(`room:${at.room.code}`);
  removePlayer(at.room, at.person);
}

io.on("connection", (socket) => {
  // The race page's list of public rooms
  socket.on("watchRooms", (...args: unknown[]) => {
    socket.join("room-list");
    lastAck(args)({ ok: true, rooms: publicRooms() });
  });
  socket.on("unwatchRooms", () => socket.leave("room-list"));

  // Quick play: the fullest public lobby that has space, or a new one
  socket.on("quickplay", (msg: { token: string; name?: string; mode?: Mode }, ack) => {
    const reply = safeAck(ack);
    if (!msg?.token) return reply({ ok: false, error: "Missing player ID." });
    const mode: Mode = MODES.includes(msg.mode as Mode) ? (msg.mode as Mode) : "race";
    const open = [...rooms.values()]
      .filter((r) => r.isPublic && r.mode === mode && r.phase === "lobby" && seated(r).length < r.maxPlayers && !r.kicked.has(msg.token))
      .sort((a, b) => seated(b).length - seated(a).length)[0];
    seat(socket, open ?? makeRoom(true, mode), msg.token, msg.name, reply);
  });

  // Host a room (private by default: share the code)
  socket.on("host", (msg: { token: string; name?: string; mode?: Mode; length?: RaceLength; pace?: SpikePace; maxPlayers?: number; isPublic?: boolean }, ack) => {
    const reply = safeAck(ack);
    if (!msg?.token) return reply({ ok: false, error: "Missing player ID." });
    const mode: Mode = MODES.includes(msg.mode as Mode) ? (msg.mode as Mode) : "race";
    const length = msg.length && msg.length in RACE_LENGTHS ? msg.length : "normal";
    const pace: SpikePace = "normal"; // question length always follows the answer count (Richard's call; no host option)
    const max = Math.min(MAX_PLAYERS[mode], Math.max(2, Number(msg.maxPlayers) || DEFAULT_PLAYERS[mode]));
    const name = cleanName(msg.name);
    if (typeof name !== "string") return reply({ ok: false, error: name.error });
    const room = makeRoom(!!msg.isPublic, mode, length, max, pace);
    seat(socket, room, msg.token, name, reply);
  });

  // Join by code (or rejoin after a refresh)
  socket.on("join", (msg: { code: string; token: string; name?: string }, ack) => {
    const reply = safeAck(ack);
    const room = rooms.get(String(msg?.code ?? "").toUpperCase().trim());
    if (!room) return reply({ ok: false, error: "No room with that code. Check the letters and try again." });
    if (!msg.token) return reply({ ok: false, error: "Missing player ID." });
    seat(socket, room, msg.token, msg.name, reply);
  });

  socket.on("leave", () => leaveCurrent(socket));

  // Chat: public rooms send a preset message by number; private rooms send any text
  socket.on("chat", (msg: { text?: string; quick?: number }) => {
    const at = where.get(socket.id);
    if (!at || at.person.left) return;
    const { room, person } = at;
    let text: string | null;
    if (room.isPublic) text = QUICK_CHAT[Number(msg?.quick)] ?? null;
    else text = typeof msg?.quick === "number" ? QUICK_CHAT[msg.quick] ?? null : cleanChat(msg?.text);
    if (!text || !allowChat(person.chatTimes, Date.now())) return;
    say(room, person, text);
    sendRoom(room);
  });

  // Emoji bubble above your seat for a few seconds
  socket.on("emote", (i: number) => {
    const at = where.get(socket.id);
    const emoji = EMOTES[Number(i)];
    if (!at || at.person.left || !emoji) return;
    const now = Date.now();
    if (at.person.emote && !allowEmote(at.person.emote.at, now)) return;
    at.person.emote = { emoji, at: now };
    sendRoom(at.room);
    later(at.room, () => sendRoom(at.room), 3_100); // clears the bubble for everyone
  });

  // Pick your agent (lobby only; each agent once per room, like agent select)
  socket.on("avatar", (name: unknown, ...rest: unknown[]) => {
    const ack = lastAck([name, ...rest]);
    const at = where.get(socket.id);
    if (!at || at.room.phase !== "lobby") return ack({ ok: false, error: "You can only switch agents in the lobby." });
    const agent = allAgents().find((a) => a.name === name);
    if (!agent) return ack({ ok: false, error: "Unknown agent." });
    const holder = seated(at.room).find((p) => p.avatar === agent.name && p !== at.person);
    if (holder) return ack({ ok: false, error: `${holder.name} already has ${agent.name}.` });
    at.person.avatar = agent.name;
    ack({ ok: true });
    sendRoom(at.room);
  });

  // Host controls (lobby only)
  socket.on("settings", (msg: { mode?: Mode; length?: RaceLength; pace?: SpikePace; maxPlayers?: number; isPublic?: boolean }) => {
    const at = where.get(socket.id);
    if (!at || at.room.hostId !== at.person.id || at.room.phase !== "lobby") return;
    const room = at.room;
    // Switching game: Spike splash seats 8 at most, so only if everyone fits
    if (MODES.includes(msg.mode as Mode) && msg.mode !== room.mode && seated(room).length <= MAX_PLAYERS[msg.mode as Mode]) {
      room.mode = msg.mode as Mode;
      room.maxPlayers = Math.min(room.maxPlayers, MAX_PLAYERS[room.mode]);
    }
    if (msg.length && msg.length in RACE_LENGTHS) room.length = msg.length;
    if (msg.maxPlayers) room.maxPlayers = Math.min(MAX_PLAYERS[room.mode], Math.max(Math.max(2, seated(room).length), Number(msg.maxPlayers)));
    if (typeof msg.isPublic === "boolean" && msg.isPublic !== room.isPublic) {
      room.isPublic = msg.isPublic;
      cancelAutoStart(room); // private: no countdown; public again: it starts over from 30 s
    }
    scheduleAutoStart(room); // also covers max players changing so the room is (not) full
    sendRoom(room);
    sendRoomList();
  });
  socket.on("start", () => {
    const at = where.get(socket.id);
    if (!at || at.room.hostId !== at.person.id || at.room.phase !== "lobby") return;
    beginCountdown(at.room); // a host can start alone to practise
  });
  socket.on("kick", (playerId: string) => {
    const at = where.get(socket.id);
    if (!at || at.room.hostId !== at.person.id || at.room.phase !== "lobby") return;
    const target = at.room.players.find((p) => p.id === playerId && p !== at.person);
    if (!target) return;
    at.room.kicked.add(target.token);
    if (target.socketId) {
      io.to(target.socketId).emit("kicked");
      const s = io.sockets.sockets.get(target.socketId);
      if (s) { where.delete(s.id); s.leave(`room:${at.room.code}`); }
    }
    removePlayer(at.room, target);
  });
  socket.on("again", () => {
    const at = where.get(socket.id);
    if (!at || at.room.hostId !== at.person.id || at.room.phase !== "results") return;
    backToLobby(at.room);
  });

  // The race: answer the current question
  socket.on("answer", (text: string, ack) => {
    const reply = safeAck(ack);
    const at = where.get(socket.id);
    if (!at || at.room.phase !== "racing") return reply({ kind: "closed" });
    const now = Date.now();
    if (now - at.person.lastAnswerAt < MIN_ANSWER_GAP_MS) return reply({ kind: "slow" });
    at.person.lastAnswerAt = now;
    const spike = at.room.spike;
    if (spike) {
      const result = submitSpike(spike, at.person.id, String(text ?? ""), now);
      if (result.kind === "used") {
        const by = at.room.players.find((p) => p.id === result.by)?.name ?? "someone";
        return reply({ ...result, byName: by });
      }
      reply(result);
      if (result.kind === "ok") sendRoom(at.room);
      return;
    }
    const race = at.room.race;
    if (!race) return reply({ kind: "closed" });
    const racer = race.racers.get(at.person.id);
    if (!racer) return reply({ kind: "closed" });
    const result = submitAnswer(race, racer, String(text ?? ""), now);
    reply(result);
    if (result.kind === "ok") {
      if (!checkOver(at.room)) sendRoom(at.room);
    }
  });

  socket.on("skip", (...args: unknown[]) => {
    const reply = lastAck(args);
    const at = where.get(socket.id);
    const race = at?.room.race;
    const racer = race?.racers.get(at!.person.id);
    if (!at || !race || !racer || at.room.phase !== "racing") return reply({ ok: false });
    const ok = skip(race, racer, Date.now());
    reply({ ok });
    if (ok && !checkOver(at.room)) sendRoom(at.room);
  });

  socket.on("disconnect", () => {
    const at = where.get(socket.id);
    if (!at) return;
    where.delete(socket.id);
    const { room, person } = at;
    if (person.socketId !== socket.id) return; // they already reconnected on another socket
    person.socketId = null;
    const grace = room.phase === "racing" || room.phase === "countdown" ? RACE_GRACE_MS : LOBBY_GRACE_MS;
    person.leaveTimer = setTimeout(() => {
      if (!person.socketId && rooms.get(room.code) === room) removePlayer(room, person);
    }, grace);
    sendRoom(room);
    sendRoomList();
  });
});

httpServer.listen(PORT, () => {
  console.log(`Krilljoy race server on http://localhost:${PORT}  (${allPrompts().length} questions loaded)`);
  console.log(`Accepting games from: ${CLIENT_ORIGINS.join(", ")}`);
});

