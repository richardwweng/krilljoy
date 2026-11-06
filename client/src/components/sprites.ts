// Pixel art drawn for Krilljoy (original, not from any other game).
// Each string is one row; each letter is a color key used by <Sprite>, "." is empty.

export const GEM = ["..XXX..", ".XHXXX.", "XHXXXXX", "XXXXXXD", ".XXXXD.", "..XXD..", "...D..."];
export const X_MARK = ["X...X", ".X.X.", "..X..", ".X.X.", "X...X"];
export const SUB = ["....RR.....", "...RRRR....", ".WWWWWWWW..", "WWBWWBWWWWR", "WWWWWWWWWW.", ".DDDDDDDD.."];
export const BOAT = ["......R.........", "......RR........", "......RRR.......", "......M.........",
  "......M.........", "WWWWWWWWWWWWWWW.", ".WWNWWWWWNWWWWW.", "..WWWWWWWWWWWW.."];
export const FISH = [".XX..X", "XXXXXX", "XEXX.X", ".XX..."];
export const SPARK = ["..Y..", ".....", "Y...Y", ".....", "..Y.."];
export const KELP = [".G.", "G..", ".G.", "..G", ".G.", "G..", ".G.", "..G", ".G.", "G..", ".G.", "..G", ".GG", "GG."];

// A half sun sitting on the horizon
export const SUN = (() => {
  const r = 11;
  return Array.from({ length: r }, (_, y) => {
    const dy = r - y - 0.5;
    const half = Math.sqrt(r * r - dy * dy);
    return Array.from({ length: 2 * r }, (_, x) => (Math.abs(x - r + 0.5) < half ? "X" : ".")).join("");
  });
})();

// Speaker for the sound button (W), sound waves (S), mute cross (M)
export const SPEAKER_ON = ["...W.....", "..WW..S..", "WWWW...S.", "WWWW.S.S.", "WWWW.S.S.", "WWWW...S.", "..WW..S..", "...W....."];
export const SPEAKER_OFF = ["...W.....", "..WW.....", "WWWW.M.M.", "WWWW..M..", "WWWW..M..", "WWWW.M.M.", "..WW.....", "...W....."];

export const MINNOW = [".XX.X", "XXXXX", ".XX.X"];
// Original glowing jellyfish (Krilljoy's sea creature)
export const JELLY = ["...RRRR...", ".RRRRRRRR.", "RRPRRRRRRR", "RRRRRRRRRR", "RRRRRRRRRR",
  ".R.R..R.R.", ".R.R..R.R.", "R..R..R..R", "..R....R..", ".R......R."];

// Treasure chest for the race finish line (closed, and opened)
export const CHEST = [".OOOOOOO.", "OYYYYYYYO", "OOOOOOOOO", "OYYYKYYYO", "OYYYYYYYO", "OOOOOOOOO"];
export const OPEN_CHEST = [".OOOOOOOOO.", "O.........O", "OYYYYYYYYYO", "OOOOOOOOOOO", "OYYYYKYYYYO", "OYYYYYYYYYO", "OOOOOOOOOOO"];
export const CHEST_COLORS = { O: "#7a4a1e", Y: "#f2c14e", K: "#06101c" };

// Spike splash: an original pixel spike, a spiked sea mine with a glowing red core
export const SPIKE = [
  "......MM......",
  "......MM......",
  "..M...DD...M..",
  "...MDDDDDDM...",
  "...DDMMMMDD...",
  "..DDMRRRRMDD..",
  "MMDDMRWWRMDDMM",
  "MMDDMRWWRMDDMM",
  "..DDMRRRRMDD..",
  "...DDMMMMDD...",
  "...MDDDDDDM...",
  "..M...DD...M..",
  "......MM......",
  "......MM......",
];
export const SPIKE_COLORS = { M: "#8a9bb0", D: "#2a3646", R: "#ff4655", W: "#fff1f2" };
export const BOOM = [
  "....Y...Y....",
  ".Y...O.O...Y.",
  "...OOOROOO...",
  "..ORRRRRRRO..",
  "Y.ORRWWWRRO.Y",
  "..ORRWWWRRO..",
  "..ORRRRRRRO..",
  "...OOOROOO...",
  ".Y...O.O...Y.",
  "....Y...Y....",
];
export const BOOM_COLORS = { Y: "#f2c14e", O: "#ff8a3d", R: "#ff4655", W: "#fff1f2" };
export const HEART = [".XX.XX.", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..."];

// Spike splash: each player is a jellyfish (with eyes) on a rock. All original.
export const JELLY_FACE = ["...RRRR...", ".RRRRRRRR.", "RRPRRRRRRR", "RRKRRRRKRR", "RRRRRRRRRR",
  ".R.R..R.R.", ".R.R..R.R.", "R..R..R..R", "..R....R..", ".R......R."];
export const ROCKS = [
  ["....DDDDDD....", "..DDMMMMMMDD..", ".DMMLLMMMMMMD.", "DMMLMMMMMMMMMD", "DMMMMMMMMMMMMD", "DKMMMMMMMMMMKD", ".DKKMMMMMMKKD.", "..DDKKKKKKDD.."],
  ["...G...G..G...", "..GG.G.GG.G...", "..DDGDDDGDDD..", ".DMMMMMMMMMMD.", "DMLLMMMMMMMMMD", "DMMMMMMMMMMMKD", ".DKMMMMMMMMKD.", "..DDKKKKKKDD.."],
  [".....DDDD.....", "...DDLLMMDD...", "..DMLMMMMMMD..", ".DMMMMMMMMMMD.", "DMMMMMMMMMMMMD", "DMMMMMMMMMMMKD", "DKKMMMMMMMKKKD", ".DDDKKKKKKDDD."],
];
export const ROCK_COLORS = { D: "#14202f", M: "#34465e", L: "#56708f", K: "#223147", G: "#3f8a5a" };
