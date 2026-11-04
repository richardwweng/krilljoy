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
