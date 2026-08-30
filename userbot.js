// GramJS engine with advanced rate limiting
require("dotenv").config();
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { Api } = require("telegram/tl");
const state = require("./state");

const apiId = parseInt(process.env.API_ID, 10);
const apiHash = process.env.API_HASH;
const sessionString = process.env.SESSION_STRING || "";

let client = null;

// Legacy speed presets (fallback if rate limiting disabled)
const SPEED_DELAYS = {
  slow: 4000,
  normal: 2000,
  fast: 700,
};

async function getClient() {
  if (client && client.connected) return client;
  client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
    connectionRetries: 5,
  });
  await client.connect();
  return client;
}

// ============ RATE LIMITING ============
async function applyRateLimit(cfg) {
  if (!cfg.rateLimit.enabled) {
    // Use legacy speed delay
    return SPEED_DELAYS[cfg.speed] || SPEED_DELAYS.normal;
  }

  const now = Date.now();
  const windowMs = cfg.rateLimit.windowMinutes * 60 * 1000;
  const rateLimitState = cfg.rateLimitState;

  // Initialize window if first send
  if (rateLimitState.windowStartTime === 0) {
    rateLimitState.windowStartTime = now;
    rateLimitState.itemsInWindow = 0;
  }

  // Check if window expired
  if (now - rateLimitState.windowStartTime >= windowMs) {
    rateLimitState.windowStartTime = now;
    rateLimitState.itemsInWindow = 0;
  }

  // If we've hit the limit, wait until window resets
  if (rateLimitState.itemsInWindow >= cfg.rateLimit.itemsPerWindow) {
    const timeUntilReset = windowMs - (now - rateLimitState.windowStartTime);
    if (timeUntilReset > 0) {
      return timeUntilReset + 1000; // wait for window to reset
    }
  }

  // Mark this item as sent in window
  rateLimitState.itemsInWindow++;
  rateLimitState.lastSendTime = now;
  state.save(cfg);

  // Return cooldown delay between items
  return cfg.rateLimit.cooldownSeconds * 1000;
}

// Text file detection
function isTextFile(document) {
  if (!document) return false;
  const mime = document.mimeType || "";
  if (mime.startsWith("text/")) return true;
  const fileNameAttr = (document.attributes || []).find(
    (a) => a.className === "DocumentAttributeFilename"
  );
  const name = fileNameAttr ? fileNameAttr.fileName.toLowerCase() : "";
  return /\.(txt|log|csv|md|json|xml|ini|cfg)$/.test(name);
}

function classifyMessage(msg) {
  if (!msg || !msg.media) return null;

  if (msg.media.className === "MessageMediaPhoto" && msg.photo) {
    return { type: "photo", sizeBytes: null };
  }

  if (msg.media.className === "MessageMediaDocument" && msg.document) {
    const doc = msg.document;
    if (isTextFile(doc)) return { type: "textfile", sizeBytes: doc.size };

    const attrs = doc.attributes || [];
    const isAnimated = attrs.some((a) => a.className === "DocumentAttributeAnimated");
    const isVideo = attrs.some((a) => a.className === "DocumentAttributeVideo");

    if (isAnimated) return { type: "gif", sizeBytes: doc.size };
    if (isVideo) return { type: "video", sizeBytes: doc.size };
    return { type: "document", sizeBytes: doc.size };
  }

  return null;
}

function passesFilters(classified, cfg) {
  if (!classified) return false;
  if (classified.type === "textfile") return "skip_textfile";
  if (classified.type === "photo" && !cfg.filters.photos) return "skip_type";
  if (classified.type === "video" && !cfg.filters.videos) return "skip_type";
  if (classified.type === "gif" && !cfg.filters.gifs) return "skip_type";
  if (classified.type === "document" && !cfg.filters.documents) return "skip_type";

  if (cfg.maxSizeMB && classified.sizeBytes) {
    const sizeMB = classified.sizeBytes / (1024 * 1024);
    if (sizeMB > cfg.maxSizeMB) return "skip_size";
  }
  return "ok";
}

async function getChannelInfo(idOrUsername) {
  const tg = await getClient();
  let entity;
  try {
    entity = await tg.getEntity(idOrUsername);
  } catch (err) {
    // A bare numeric ID (no username/link) can only resolve if its
    // access_hash is already in GramJS's in-memory cache. Warm the
    // cache with getDialogs() and retry once before giving up.
    if (/^-?\d+$/.test(String(idOrUsername).trim())) {
      await tg.getDialogs({ limit: 300 });
      entity = await tg.getEntity(idOrUsername);
    } else {
      throw err;
    }
  }
  return {
    title: entity.title || entity.username || String(entity.id),
    username: entity.username ? "@" + entity.username : null,
    id: entity.id ? entity.id.toString() : null,
    // Save this alongside the id — it's what lets us resolve the channel
    // reliably later (e.g. after a bot restart) without depending on
    // GramJS's in-memory entity cache still being warm.
    accessHash: entity.accessHash ? entity.accessHash.toString() : null,
    participantsCount: entity.participantsCount || null,
  };
}

// Build a resolvable peer from saved id + accessHash instead of relying on
// the live entity cache. This is what actually fixes "all sends fail"
// after a restart / idle period — sendFile/iterMessages/getMessages can
// all take this InputPeerChannel directly, no getEntity() lookup needed.
function resolvedPeer(id, accessHash) {
  if (!id) return null;
  if (accessHash) {
    return new Api.InputPeerChannel({
      channelId: BigInt(id),
      accessHash: BigInt(accessHash),
    });
  }
  // No accessHash saved (old state from before this fix) — fall back to
  // the bare id, which only works if the entity is still cache-warm.
  return id;
}

async function getPreview(cfg) {
  const tg = await getClient();
  const counts = { photo: 0, video: 0, gif: 0, document: 0, textfile_excluded: 0, total: 0 };
  const info = await getChannelInfo(cfg.sourceChannel);
  counts.channelInfo = info;

  const sourcePeer = resolvedPeer(cfg.sourceChannel, cfg.sourceChannelAccessHash);
  for await (const msg of tg.iterMessages(sourcePeer, { limit: 5000 })) {
    const classified = classifyMessage(msg);
    if (!classified) continue;
    counts.total++;
    if (classified.type === "textfile") {
      counts.textfile_excluded++;
    } else {
      counts[classified.type] = (counts[classified.type] || 0) + 1;
    }
  }
  cfg.previewTotal = counts.total;
  cfg.previewAt = new Date().toISOString();
  state.save(cfg);
  return counts;
}

// ============ MAIN TRANSFER WITH ADVANCED LOGGING ============
async function startTransfer(hooks = {}) {
  const cfg = state.load();
  const tg = await getClient();

  cfg.status = "running";
  if (!cfg.stats.startedAt) cfg.stats.startedAt = new Date().toISOString();
  state.save(cfg);

  let lastStatusMsgId = null; // For updating the status message
  let scanned = 0;
  let lastHeartbeat = Date.now();
  let lastProgressEmit = Date.now();

  const iterOpts = { reverse: true };
  if (cfg.lastProcessedMsgId) iterOpts.minId = cfg.lastProcessedMsgId;

  const sourcePeer = resolvedPeer(cfg.sourceChannel, cfg.sourceChannelAccessHash);
  const targetPeer = resolvedPeer(cfg.targetChannel, cfg.targetChannelAccessHash);

  for await (const msg of tg.iterMessages(sourcePeer, iterOpts)) {
    scanned++;
    
    // ============ UPDATE STATUS MESSAGE (NO SPAM) ============
    if (Date.now() - lastHeartbeat > 5000) {
      const statusText = `🔍 *Scanned:* ${scanned} messages\n⏳ *Processing...*`;
      try {
        if (lastStatusMsgId) {
          // EDIT existing message
          await hooks.onStatusUpdate?.(statusText, lastStatusMsgId);
        } else {
          // Send new message and store ID
          const sent = await hooks.onStatusSend?.(statusText);
          if (sent) lastStatusMsgId = sent;
        }
      } catch (e) {
        // ignore edit race conditions
      }
      lastHeartbeat = Date.now();
    }

    // Check pause/stop
    const liveState = state.load();
    if (liveState.status === "stopped") {
      cfg.status = "stopped";
      state.save(cfg);
      hooks.onDone?.(cfg.stats);
      return;
    }
    if (liveState.status === "paused") {
      while (true) {
        await sleep(2000);
        const check = state.load();
        if (check.status === "running") break;
        if (check.status === "stopped") {
          hooks.onDone?.(check.stats);
          return;
        }
      }
    }

    // Classify and filter
    const classified = classifyMessage(msg);
    const verdict = classifyAndFilter(classified, cfg);

    if (verdict === "skip_none") {
      cfg.lastProcessedMsgId = msg.id;
      continue;
    }
    if (verdict === "skip_textfile") {
      cfg.stats.skippedTextFile++;
      cfg.lastProcessedMsgId = msg.id;
      state.save(cfg);
      continue;
    }
    if (verdict === "skip_type") {
      cfg.stats.skippedByType++;
      cfg.lastProcessedMsgId = msg.id;
      state.save(cfg);
      continue;
    }
    if (verdict === "skip_size") {
      cfg.stats.skippedBySize++;
      cfg.lastProcessedMsgId = msg.id;
      state.save(cfg);
      continue;
    }

    // Duplicate detection
    const uniqueId = getUniqueMediaId(msg);
    if (uniqueId && cfg.sentFileHashes.includes(uniqueId)) {
      cfg.stats.duplicates++;
      cfg.lastProcessedMsgId = msg.id;
      state.save(cfg);
      continue;
    }

    // Daily quota guard
    const today = new Date().toISOString().slice(0, 10);
    if (cfg.dailyDate !== today) {
      cfg.dailyDate = today;
      cfg.dailyCount = 0;
      state.save(cfg);
    }
    if (cfg.dailyLimit && cfg.dailyCount >= cfg.dailyLimit) {
      hooks.onLog?.(`🌙 Daily limit of ${cfg.dailyLimit} reached. Pausing...`);
      cfg.status = "paused";
      state.save(cfg);
      while (true) {
        await sleep(60 * 1000);
        const check = state.load();
        if (check.status === "stopped") {
          hooks.onDone?.(check.stats);
          return;
        }
        const nowDate = new Date().toISOString().slice(0, 10);
        if (nowDate !== check.dailyDate) {
          check.dailyDate = nowDate;
          check.dailyCount = 0;
          check.status = "running";
          state.save(check);
          hooks.onLog?.("🌅 New day - resuming automatically.");
          cfg.dailyDate = nowDate;
          cfg.dailyCount = 0;
          break;
        }
        if (check.status === "running") break;
      }
    }

    // Send with flood handling
    try {
      await sendMediaCaptionFree(tg, targetPeer, msg);
      cfg.stats.sent++;
      cfg.dailyCount++;
      if (uniqueId) cfg.sentFileHashes.push(uniqueId);
    } catch (err) {
      if (err.errorMessage === "FLOOD" || /FLOOD_WAIT/.test(err.message || "")) {
        const waitSec = err.seconds || 30;
        hooks.onLog?.(`⏳ FloodWait: sleeping ${waitSec}s`);
        await sleep((waitSec + 2) * 1000);
        try {
          await sendMediaCaptionFree(tg, targetPeer, msg);
          cfg.stats.sent++;
          cfg.dailyCount++;
          if (uniqueId) cfg.sentFileHashes.push(uniqueId);
        } catch (err2) {
          cfg.stats.failed++;
          cfg.failedItems.push({ msgId: msg.id, reason: err2.message });
        }
      } else {
        cfg.stats.failed++;
        cfg.failedItems.push({ msgId: msg.id, reason: err.message });
      }
    }

    cfg.lastProcessedMsgId = msg.id;
    state.save(cfg);

    // Progress emit
    if (Date.now() - lastProgressEmit >= 5000) {
      const eta = estimateEta(cfg);
      hooks.onProgress?.(cfg.stats, scanned, eta);
      lastProgressEmit = Date.now();
    }

    // ============ RATE LIMITING DELAY ============
    const delay = await applyRateLimit(cfg);
    await sleep(delay);
  }

  // Final status
  hooks.onProgress?.(cfg.stats, scanned);

  cfg.status = "done";
  cfg.stats.finishedAt = new Date().toISOString();
  state.save(cfg);
  hooks.onDone?.(cfg.stats);
}

function classifyAndFilter(classified, cfg) {
  if (!classified) return "skip_none";
  const verdict = passesFilters(classified, cfg);
  if (verdict === "ok") return "ok";
  return verdict;
}

function getUniqueMediaId(msg) {
  if (msg.photo) return "photo_" + msg.photo.id.toString();
  if (msg.document) return "doc_" + msg.document.id.toString();
  return null;
}

async function sendMediaCaptionFree(tg, target, msg) {
  await tg.sendFile(target, {
    file: msg.media,
    caption: "",
    forceDocument: false,
  });
}

async function retryFailed(hooks = {}) {
  const cfg = state.load();
  const tg = await getClient();
  const stillFailed = [];
  const sourcePeer = resolvedPeer(cfg.sourceChannel, cfg.sourceChannelAccessHash);
  const targetPeer = resolvedPeer(cfg.targetChannel, cfg.targetChannelAccessHash);

  for (const item of cfg.failedItems) {
    try {
      const [msg] = await tg.getMessages(sourcePeer, { ids: [item.msgId] });
      if (!msg) {
        stillFailed.push(item);
        continue;
      }
      await sendMediaCaptionFree(tg, targetPeer, msg);
      cfg.stats.sent++;
      cfg.stats.failed = Math.max(0, cfg.stats.failed - 1);
    } catch (err) {
      stillFailed.push({ msgId: item.msgId, reason: err.message });
    }
    const delay = await applyRateLimit(cfg);
    await sleep(delay);
  }

  cfg.failedItems = stillFailed;
  state.save(cfg);
  hooks.onDone?.(cfg.stats);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function estimateEta(cfg) {
  if (!cfg.stats.startedAt) return null;
  const elapsedMin = (Date.now() - new Date(cfg.stats.startedAt).getTime()) / 60000;
  if (elapsedMin < 0.2) return null;
  const doneCount = cfg.stats.sent + cfg.stats.skippedByType + cfg.stats.skippedBySize + cfg.stats.skippedTextFile + cfg.stats.duplicates;
  if (doneCount === 0) return null;
  const ratePerMin = doneCount / elapsedMin;
  if (!cfg.previewTotal || ratePerMin <= 0) return null;
  const remaining = Math.max(0, cfg.previewTotal - doneCount);
  const etaMin = remaining / ratePerMin;
  if (etaMin < 1) return "< 1 min";
  if (etaMin < 60) return `~${Math.round(etaMin)} min`;
  return `~${(etaMin / 60).toFixed(1)} hr`;
}

module.exports = { getClient, getChannelInfo, getPreview, startTransfer, retryFailed, applyRateLimit };
