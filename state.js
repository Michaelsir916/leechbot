// Advanced JSON-backed state store with rate limiting
const fs = require("fs");
const path = require("path");

const STATE_FILE = path.join(__dirname, "state.json");

const DEFAULTS = {
  sourceChannel: null,
  sourceChannelName: null,
  sourceChannelUsername: null,
  targetChannel: null,
  targetChannelName: null,
  targetChannelUsername: null,

  // Archived per-channel progress, keyed by normalized channel id.
  // Lets us "clear" the active source without losing history — if the
  // same source channel is picked again later we can offer to resume.
  channelHistory: {},

  // Recently used channels (id + display name) so the user can pick
  // instead of retyping an ID every time.
  recentSourceChannels: [],
  recentTargetChannels: [],

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

// ============ PER-CHANNEL HISTORY (source) ============
// The scan/dedup progress (lastProcessedMsgId, stats, sentFileHashes) only
// makes sense for ONE source channel at a time. When the user switches to a
// different source, we archive the current progress under the OLD channel's
// id instead of throwing it away — so if they come back to that channel
// later we can offer to resume exactly where they left off.

function archiveSourceProgress(cfg) {
  if (!cfg.sourceChannel) return;
  if (!cfg.channelHistory) cfg.channelHistory = {};
  cfg.channelHistory[cfg.sourceChannel] = {
    name: cfg.sourceChannelName,
    username: cfg.sourceChannelUsername,
    lastProcessedMsgId: cfg.lastProcessedMsgId,
    stats: JSON.parse(JSON.stringify(cfg.stats)),
    sentFileHashes: [...(cfg.sentFileHashes || [])],
    archivedAt: new Date().toISOString(),
  };
}

function restoreSourceProgress(cfg, channelId) {
  const rec = cfg.channelHistory && cfg.channelHistory[channelId];
  if (!rec) return false;
  cfg.lastProcessedMsgId = rec.lastProcessedMsgId || 0;
  cfg.stats = rec.stats
    ? JSON.parse(JSON.stringify(rec.stats))
    : JSON.parse(JSON.stringify(DEFAULTS.stats));
  cfg.sentFileHashes = rec.sentFileHashes ? [...rec.sentFileHashes] : [];
  return true;
}

function resetSourceProgress(cfg) {
  cfg.lastProcessedMsgId = 0;
  cfg.stats = JSON.parse(JSON.stringify(DEFAULTS.stats));
  cfg.rateLimitState = JSON.parse(JSON.stringify(DEFAULTS.rateLimitState));
  cfg.sentFileHashes = [];
}

// Push a { id, name, username } entry to the front of a recent-channels
// list, de-duping by id and capping the length.
function pushRecent(list, entry, max = 8) {
  const filtered = (list || []).filter((c) => c.id !== entry.id);
  filtered.unshift(entry);
  return filtered.slice(0, max);
}

module.exports = {
  load,
  save,
  resetProgress,
  archiveSourceProgress,
  restoreSourceProgress,
  resetSourceProgress,
  pushRecent,
  DEFAULTS,
};
