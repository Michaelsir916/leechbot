// GramJS engine: reads media from the source channel and sends it (caption-free) to the target.
require("dotenv").config();
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { Api } = require("telegram/tl");
const state = require("./state");

const apiId = parseInt(process.env.API_ID, 10);
const apiHash = process.env.API_HASH;
const sessionString = process.env.SESSION_STRING || "";

let client = null;

// Speed presets: delay (ms) between each sent item
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

// Text/plain document detection - these must NEVER be sent, even if "documents" filter is on.
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

  // Photo
  if (msg.media.className === "MessageMediaPhoto" && msg.photo) {
    return { type: "photo", sizeBytes: null };
  }

  // Document-based media: video, gif (animation), or generic document
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

// Fetch basic info (title, username) about a channel/chat.
async function getChannelInfo(idOrUsername) {
  const tg = await getClient();
  const entity = await tg.getEntity(idOrUsername);
  return {
    title: entity.title || entity.username || String(entity.id),
    username: entity.username ? "@" + entity.username : null,
    id: entity.id ? entity.id.toString() : null,
    participantsCount: entity.participantsCount || null,
  };
}

// Scan the source channel and build counts without sending anything (for preview).
async function getPreview(cfg) {
  const tg = await getClient();
  const counts = { photo: 0, video: 0, gif: 0, document: 0, textfile_excluded: 0, total: 0 };
  const info = await getChannelInfo(cfg.sourceChannel);
  counts.channelInfo = info;

  for await (const msg of tg.iterMessages(cfg.sourceChannel, { limit: 5000 })) {
    const classified = classifyMessage(msg);
    if (!classified) continue;
    counts.total++;
    if (classified.type === "textfile") {
      counts.textfile_excluded++;
    } else {
      counts[classified.type] = (counts[classified.type] || 0) + 1;
    }
  }
  return counts;
}

// Main transfer loop. Resumable via state.lastProcessedMsgId.
// hooks: { onProgress(stats), onDone(stats), onError(err) }
async function startTransfer(hooks = {}) {
  const cfg = state.load();
  const tg = await getClient();

  cfg.status = "running";
  if (!cfg.stats.startedAt) cfg.stats.startedAt = new Date().toISOString();
  state.save(cfg);

  const delay = SPEED_DELAYS[cfg.speed] || SPEED_DELAYS.normal;

  // Collect messages older than or equal to resume point, oldest-first for natural order
  const allMessages = [];
  const iterOpts = { limit: undefined, reverse: true }; // oldest to newest
  if (cfg.lastProcessedMsgId) iterOpts.minId = cfg.lastProcessedMsgId;

  for await (const msg of tg.iterMessages(cfg.sourceChannel, iterOpts)) {
    allMessages.push(msg);
  }

  for (const msg of allMessages) {
    // check pause/stop before each item
    const liveState = state.load();
    if (liveState.status === "stopped") {
      cfg.status = "stopped";
      state.save(cfg);
      hooks.onDone && hooks.onDone(cfg.stats);
      return;
    }
    if (liveState.status === "paused") {
      // wait loop until resumed or stopped
      while (true) {
        await sleep(2000);
        const check = state.load();
        if (check.status === "running") break;
        if (check.status === "stopped") {
          hooks.onDone && hooks.onDone(check.stats);
          return;
        }
      }
    }

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

    // Duplicate detection via document/photo unique id
    const uniqueId = getUniqueMediaId(msg);
    if (uniqueId && cfg.sentFileHashes.includes(uniqueId)) {
      cfg.stats.duplicates++;
      cfg.lastProcessedMsgId = msg.id;
      state.save(cfg);
      continue;
    }

    // Attempt send with FloodWait handling + retry
    try {
      await sendMediaCaptionFree(tg, cfg.targetChannel, msg);
      cfg.stats.sent++;
      if (uniqueId) cfg.sentFileHashes.push(uniqueId);
    } catch (err) {
      if (err.errorMessage === "FLOOD" || /FLOOD_WAIT/.test(err.message || "")) {
        const waitSec = err.seconds || 30;
        hooks.onLog && hooks.onLog(`⏳ FloodWait: sleeping ${waitSec}s`);
        await sleep((waitSec + 2) * 1000);
        // retry once after waiting
        try {
          await sendMediaCaptionFree(tg, cfg.targetChannel, msg);
          cfg.stats.sent++;
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
    hooks.onProgress && hooks.onProgress(cfg.stats, allMessages.length);

    await sleep(delay);
  }

  cfg.status = "done";
  cfg.stats.finishedAt = new Date().toISOString();
  state.save(cfg);
  hooks.onDone && hooks.onDone(cfg.stats);
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
  // Re-send using the message's media reference, with empty caption.
  // Using sendFile with the original media object avoids downloading to disk.
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

  for (const item of cfg.failedItems) {
    try {
      const [msg] = await tg.getMessages(cfg.sourceChannel, { ids: [item.msgId] });
      if (!msg) {
        stillFailed.push(item);
        continue;
      }
      await sendMediaCaptionFree(tg, cfg.targetChannel, msg);
      cfg.stats.sent++;
      cfg.stats.failed = Math.max(0, cfg.stats.failed - 1);
    } catch (err) {
      stillFailed.push({ msgId: item.msgId, reason: err.message });
    }
    await sleep(SPEED_DELAYS[cfg.speed] || SPEED_DELAYS.normal);
  }

  cfg.failedItems = stillFailed;
  state.save(cfg);
  hooks.onDone && hooks.onDone(cfg.stats);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { getClient, getChannelInfo, getPreview, startTransfer, retryFailed };
