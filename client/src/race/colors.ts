// One colour per diver, in join order, for the gauge and the leaderboard
export const DIVER_COLORS = ["#ff4655", "#5de3f9", "#f2c14e", "#c08cff", "#3fd1c4", "#ff8a5c", "#9be564", "#ff7ac6", "#e9dfc8", "#7aa2ff"];
export const colorFor = (index: number) => DIVER_COLORS[index % DIVER_COLORS.length];
