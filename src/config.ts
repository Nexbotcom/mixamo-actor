// Where the files are. Files live in public/models/, served from /models/
export const MODEL_DIR = "/models/";

export const CHARACTERS: Record<string, { height: number }> = {
  woman_casual: { height: 1.68 },
  woman_suit: { height: 1.7 },
  man_suit: { height: 1.8 },
  kid_cartoon: { height: 1.25 },
};

export const ANIMATIONS = [
  "idle", "walk", "run", "jump", "sit_down", "sit_idle", "stand_up", "sit_talk", "sit_laugh", "sit",
  "talk", "talk2", "wave", "point", "shrug", "nod_yes", "shake_no", "think", "clap", "salute",
  "laugh", "cry", "angry", "happy", "sad", "scared", "cheer", "defeated",
  "dance1", "dance2", "fall", "sleep", "sleep_idle", "phone",
  "open_door_in", "open_door_out", "hand_shake", "drink",
];

// These play once and then return to idle. Everything else loops.
export const ONE_SHOT = new Set([
  "jump", "sit_down", "stand_up", "wave", "point", "shrug", "nod_yes", "shake_no", "salute",
  "fall", "open_door_in", "open_door_out", "hand_shake", "drink",
]);

export const WALK_SPEED = 1.4; // metres per second
export const RUN_SPEED = 3.8;
export const BODY_RADIUS = 0.3; // how much floor space a person takes
