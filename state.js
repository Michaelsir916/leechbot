// Simple JSON-backed state store. Handles config, filters, progress and resume data.
const fs = require("fs");
const path = require("path");

const STATE_FILE = path.join(__dirname, "state.json");

const DEFAULTS = {
  sourceChannel: null,      // string: username or numeric id (as string)
  targetChannel: null,      // string: username or numeric id (as string)
  filters: {
    photos: true,
    videos: true,
    gifs: true,
    documents: false,       // documents off by default (safer)
  },
  speed: "normal",          // "slow" | "normal" | "fast"
  maxSizeMB: null,          // null = no limit
  logChannelId: null,

  // run-time / resume data
  status: "idle",           // "idle" | "running" | "paused" | "stopped" | "done"
  lastProcessedMsgId: 0,    // resume pointer
  stats: {
    totalFound: 0,
    sent: 0,
    skippedByType: 0,
    skippedBySize: 0,
    skippedTextFile: 0,
    duplicates: 0,
    failed: 0,
    startedAt: null,
    finishedAt: null,
  },
  failedItems: [],          // [{msgId, reason}]
  sentFileHashes: [],       // for duplicate detection (approx, via file unique_id)
};

function load() {
  if (!fs.existsSync(STATE_FILE)) {
    save(DEFAULTS);
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    // merge with defaults so new fields don't break old state files
    return deepMerge(JSON.parse(JSON.stringify(DEFAULTS)), parsed);
  } catch (e) {
    console.error("⚠️ state.json corrupted, resetting to defaults:", e.message);
    save(DEFAULTS);
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
}

function save(state) {
  // atomic write to avoid corruption if process is killed mid-write
  const tmpFile = STATE_FILE + ".tmp";
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2));
  fs.renameSync(tmpFile, STATE_FILE);
}

function deepMerge(base, override) {
  for (const key of Object.keys(override)) {
    if (
      override[key] &&
      typeof override[key] === "object" &&
      !Array.isArray(override[key]) &&
      base[key] &&
      typeof base[key] === "object"
    ) {
      base[key] = deepMerge(base[key], override[key]);
    } else {
      base[key] = override[key];
    }
  }
  return base;
}

function resetProgress(state) {
  state.status = "idle";
  state.lastProcessedMsgId = 0;
  state.stats = JSON.parse(JSON.stringify(DEFAULTS.stats));
  state.failedItems = [];
  state.sentFileHashes = [];
  save(state);
  return state;
}

module.exports = { load, save, resetProgress, DEFAULTS };
