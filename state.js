// Advanced JSON-backed state store with rate limiting
const fs = require("fs");
const path = require("path");

const STATE_FILE = path.join(__dirname, "state.json");

const DEFAULTS = {
  sourceChannel: null,
  targetChannel: null,
  filters: {
    photos: true,
    videos: true,
    gifs: true,
    documents: false,
  },
  
  // ============ ADVANCED: Rate Limiting ============
  // New rate limiting configuration (replaces simple speed presets)
  rateLimit: {
    enabled: false,              // enable/disable rate limiting
    itemsPerWindow: 5,           // send X items
    windowMinutes: 10,           // per X minutes
    cooldownSeconds: 2,          // cooldown between each send
  },
  
  // Legacy speed (kept for backward compatibility)
  speed: "normal",              // "slow" | "normal" | "fast"
  
  maxSizeMB: null,
  logChannelId: null,
  dailyLimit: null,
  dailyCount: 0,
  dailyDate: null,
  previewTotal: null,
  previewAt: null,

  // run-time / resume data
  status: "idle",
  lastProcessedMsgId: 0,
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
  
  // ============ ADVANCED: Rate Limiting Runtime ============
  rateLimitState: {
    lastSendTime: 0,            // timestamp of last send
    itemsInWindow: 0,           // items sent in current window
    windowStartTime: 0,         // when current window started
  },
  
  failedItems: [],
  sentFileHashes: [],
};

function load() {
  if (!fs.existsSync(STATE_FILE)) {
    save(DEFAULTS);
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return deepMerge(JSON.parse(JSON.stringify(DEFAULTS)), parsed);
  } catch (e) {
    console.error("⚠️ state.json corrupted, resetting:", e.message);
    save(DEFAULTS);
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
}

function save(state) {
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
  state.rateLimitState = JSON.parse(JSON.stringify(DEFAULTS.rateLimitState));
  state.failedItems = [];
  state.sentFileHashes = [];
  save(state);
  return state;
}

module.exports = { load, save, resetProgress, DEFAULTS };
