require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const state = require("./state");
const engine = require("./userbot.js");

const BOT_TOKEN = process.env.BOT_TOKEN;
const OWNER_ID = parseInt(process.env.OWNER_ID, 10);

const bot = new Telegraf(BOT_TOKEN);

// Owner-only guard
bot.use((ctx, next) => {
  const isPrivate = ctx.chat && ctx.chat.type === "private";
  const isOwner = ctx.from && ctx.from.id === OWNER_ID;
  if (isPrivate && isOwner) return next();
  return;
});

let pendingInput = null;
// Holds a channel {id, title, username} awaiting a clear/resume decision
// from the user (via the confirm buttons), between the text handler and
// the button-click handlers below.
let pendingCandidate = null;

function recentChannelsKeyboard(list, prefix) {
  if (!list || !list.length) return {};
  const rows = list.map((c) => [
    Markup.button.callback(`🕘 ${c.name}${c.username ? " (" + c.username + ")" : ""}`, `${prefix}_${c.id}`),
  ]);
  return Markup.inlineKeyboard(rows);
}

// ============ MENUS ============

function mainMenu() {
  const cfg = state.load();
  const statusEmoji = { idle: "⚪", running: "🟢", paused: "🟡", stopped: "🔴", done: "✅" }[cfg.status] || "⚪";
  
  // Show rate limit or speed
  let speedBtn = "🚦 Speed: " + cfg.speed;
  if (cfg.rateLimit.enabled) {
    speedBtn = `🚦 Rate: ${cfg.rateLimit.itemsPerWindow}/${cfg.rateLimit.windowMinutes}m`;
  }
  
  return Markup.inlineKeyboard([
    [Markup.button.callback("⚙️ Filters", "menu_filters")],
    [Markup.button.callback("📡 Source", "set_source"), Markup.button.callback("🎯 Target", "set_target")],
    [Markup.button.callback(speedBtn, "menu_speed"), Markup.button.callback("📏 Max Size", "set_maxsize")],
    [Markup.button.callback("🌙 Daily: " + (cfg.dailyLimit ? cfg.dailyLimit : "off"), "set_dailylimit")],
    [Markup.button.callback("⚡ Rate Limit", "menu_ratelimit")],
    [Markup.button.callback("👁 Preview", "preview")],
    [Markup.button.callback(`${statusEmoji} Status`, "status")],
    [Markup.button.callback("🚀 Start", "start_transfer")],
    [Markup.button.callback("⏸ Pause", "pause_transfer"), Markup.button.callback("▶️ Resume", "resume_transfer")],
    [Markup.button.callback("⏹ Stop", "stop_transfer")],
  ]);
}

function filtersMenu() {
  const cfg = state.load();
  const f = cfg.filters;
  const tick = (v) => (v ? "✅" : "❌");
  return Markup.inlineKeyboard([
    [Markup.button.callback(`${tick(f.photos)} Photos`, "toggle_photos")],
    [Markup.button.callback(`${tick(f.videos)} Videos`, "toggle_videos")],
    [Markup.button.callback(`${tick(f.gifs)} GIFs`, "toggle_gifs")],
    [Markup.button.callback(`${tick(f.documents)} Documents`, "toggle_documents")],
    [Markup.button.callback("⬅️ Back", "back_main")],
  ]);
}

function speedMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🐢 Slow", "speed_slow")],
    [Markup.button.callback("🚶 Normal", "speed_normal")],
    [Markup.button.callback("🐇 Fast", "speed_fast")],
    [Markup.button.callback("⬅️ Back", "back_main")],
  ]);
}

function rateLimitMenu() {
  const cfg = state.load();
  const status = cfg.rateLimit.enabled ? "✅ ON" : "❌ OFF";
  return Markup.inlineKeyboard([
    [Markup.button.callback(`${status} Toggle`, "toggle_ratelimit")],
    [Markup.button.callback(`📊 Items/Window: ${cfg.rateLimit.itemsPerWindow}`, "set_items_per_window")],
    [Markup.button.callback(`⏱ Window: ${cfg.rateLimit.windowMinutes}m`, "set_window_minutes")],
    [Markup.button.callback(`⏸ Cooldown: ${cfg.rateLimit.cooldownSeconds}s`, "set_cooldown_seconds")],
    [Markup.button.callback("📋 Info", "ratelimit_info")],
    [Markup.button.callback("⬅️ Back", "back_main")],
  ]);
}

function fmtStats(stats) {
  return (
    `✅ Sent: ${stats.sent}\n` +
    `⏭ Skipped (type): ${stats.skippedByType}\n` +
    `📏 Skipped (size): ${stats.skippedBySize}\n` +
    `📄 Skipped (text): ${stats.skippedTextFile}\n` +
    `🔄 Duplicates: ${stats.duplicates}\n` +
    `❌ Failed: ${stats.failed}`
  );
}

// ============ COMMANDS ============

bot.start((ctx) => {
  ctx.reply(
    "👋 *Advanced Channel Recovery Bot v2*\n\n✨ Features:\n• Rate limiting (N items/M minutes)\n• Cooldown control\n• No PM spam\n• Resumable transfers",
    { parse_mode: "Markdown", ...mainMenu() }
  );
});

bot.command("menu", (ctx) => ctx.reply("📋 Main Menu", mainMenu()));

bot.command("faillog", async (ctx) => {
  const cfg = state.load();
  if (!cfg.failedItems || !cfg.failedItems.length) {
    return ctx.reply("✅ Failed items ഒന്നും ഇല്ല.");
  }
  const sample = cfg.failedItems
    .slice(-15)
    .map((f) => `• msg ${f.msgId}: ${f.reason}`)
    .join("\n");
  await ctx.reply(`🧾 *Failed items (last 15):*\n${sample}`, { parse_mode: "Markdown" });
});

bot.command("whereami", async (ctx) => {
  const cfg = state.load();
  const rateInfo = cfg.rateLimit.enabled 
    ? `\n⚡ *Rate Limit:* ${cfg.rateLimit.itemsPerWindow}/${cfg.rateLimit.windowMinutes}m (cooldown: ${cfg.rateLimit.cooldownSeconds}s)`
    : "\n⚡ *Rate Limit:* disabled (using legacy speed)";
  
  await ctx.reply(
    `📍 *Where am I*\n\n` +
      `Status: ${cfg.status}\n` +
      `Last processed: ${cfg.lastProcessedMsgId || "none"}\n` +
      `Today's sent: ${cfg.dailyCount}${cfg.dailyLimit ? "/" + cfg.dailyLimit : ""}\n` +
      rateInfo +
      `\n\n${fmtStats(cfg.stats)}`,
    { parse_mode: "Markdown" }
  );
});

// ============ CALLBACKS ============

bot.action("back_main", async (ctx) => {
  await ctx.editMessageText("📋 Main Menu", mainMenu());
});

bot.action("menu_filters", async (ctx) => {
  await ctx.editMessageText("⚙️ *Filters*", { parse_mode: "Markdown", ...filtersMenu() });
});

bot.action(/toggle_(photos|videos|gifs|documents)/, async (ctx) => {
  const key = ctx.match[1];
  const cfg = state.load();
  cfg.filters[key] = !cfg.filters[key];
  state.save(cfg);
  await ctx.editMessageText("⚙️ *Filters*", { parse_mode: "Markdown", ...filtersMenu() });
});

bot.action("menu_speed", async (ctx) => {
  await ctx.editMessageText("🚦 Choose transfer speed (legacy mode):", speedMenu());
});

bot.action(/speed_(slow|normal|fast)/, async (ctx) => {
  const cfg = state.load();
  cfg.speed = ctx.match[1];
  state.save(cfg);
  await ctx.editMessageText(`🚦 Speed: *${cfg.speed}*`, { parse_mode: "Markdown", ...mainMenu() });
});

// ============ RATE LIMIT MENUS ============

bot.action("menu_ratelimit", async (ctx) => {
  await ctx.editMessageText("⚡ *Rate Limiting Settings*", { parse_mode: "Markdown", ...rateLimitMenu() });
});

bot.action("toggle_ratelimit", async (ctx) => {
  const cfg = state.load();
  cfg.rateLimit.enabled = !cfg.rateLimit.enabled;
  state.save(cfg);
  const status = cfg.rateLimit.enabled ? "✅ Enabled" : "❌ Disabled";
  await ctx.reply(`Rate limiting ${status}`, { ...rateLimitMenu() });
});

bot.action("set_items_per_window", async (ctx) => {
  pendingInput = "items_per_window";
  await ctx.reply("📊 How many items per window? (e.g. 5)", { parse_mode: "Markdown" });
});

bot.action("set_window_minutes", async (ctx) => {
  pendingInput = "window_minutes";
  await ctx.reply("⏱ Window duration in minutes? (e.g. 10)", { parse_mode: "Markdown" });
});

bot.action("set_cooldown_seconds", async (ctx) => {
  pendingInput = "cooldown_seconds";
  await ctx.reply("⏸ Cooldown between items in seconds? (e.g. 2)", { parse_mode: "Markdown" });
});

bot.action("ratelimit_info", async (ctx) => {
  const cfg = state.load();
  const rl = cfg.rateLimit;
  await ctx.reply(
    `⚡ *Rate Limit Status*\n\n` +
    `Status: ${rl.enabled ? "✅ ON" : "❌ OFF"}\n` +
    `Items per window: ${rl.itemsPerWindow}\n` +
    `Window: ${rl.windowMinutes} minutes\n` +
    `Cooldown: ${rl.cooldownSeconds} seconds\n\n` +
    `Example: Will send max ${rl.itemsPerWindow} items every ${rl.windowMinutes} minutes, with ${rl.cooldownSeconds}s between each.`,
    { parse_mode: "Markdown", ...rateLimitMenu() }
  );
});

// ============ SOURCE/TARGET/SIZE SETTINGS ============

bot.action("set_source", async (ctx) => {
  pendingInput = "source";
  const cfg = state.load();
  await ctx.reply(
    "📡 Send source channel ID/@username, or pick a recent one:",
    { parse_mode: "Markdown", ...recentChannelsKeyboard(cfg.recentSourceChannels, "pick_src") }
  );
});

bot.action("set_target", async (ctx) => {
  pendingInput = "target";
  const cfg = state.load();
  await ctx.reply(
    "🎯 Send target group/channel ID/@username, or pick a recent one:",
    { parse_mode: "Markdown", ...recentChannelsKeyboard(cfg.recentTargetChannels, "pick_tgt") }
  );
});

// ============ RECENT CHANNEL PICKERS ============

bot.action(/pick_src_(.+)/, async (ctx) => {
  pendingInput = null;
  await ctx.answerCbQuery();
  const id = ctx.match[1];
  let info;
  try {
    info = await engine.getChannelInfo(id);
  } catch (err) {
    await ctx.reply(`❌ ഈ channel ഇപ്പോൾ access ചെയ്യാൻ പറ്റുന്നില്ല: ${err.message}`, mainMenu());
    return;
  }
  await handleSourceCandidate(ctx, info);
});

bot.action(/pick_tgt_(.+)/, async (ctx) => {
  pendingInput = null;
  await ctx.answerCbQuery();
  const id = ctx.match[1];
  let info;
  try {
    info = await engine.getChannelInfo(id);
  } catch (err) {
    await ctx.reply(`❌ ഈ channel ഇപ്പോൾ access ചെയ്യാൻ പറ്റുന്നില്ല: ${err.message}`, mainMenu());
    return;
  }
  await handleTargetCandidate(ctx, info);
});

bot.action("set_maxsize", async (ctx) => {
  pendingInput = "maxsize";
  await ctx.reply("📏 Max file size in MB (0 = no limit):", { parse_mode: "Markdown" });
});

bot.action("set_dailylimit", async (ctx) => {
  pendingInput = "dailylimit";
  await ctx.reply("🌙 Max items per day (0 = no limit):", { parse_mode: "Markdown" });
});

// ============ TEXT INPUT HANDLER ============

bot.on("text", async (ctx) => {
  if (!pendingInput) return;
  const cfg = state.load();
  const value = ctx.message.text.trim();

  // Rate limit inputs
  if (pendingInput === "items_per_window") {
    const n = parseInt(value, 10);
    if (n > 0) {
      cfg.rateLimit.itemsPerWindow = n;
      state.save(cfg);
      await ctx.reply(`✅ Items per window: ${n}`, rateLimitMenu());
    } else {
      await ctx.reply("❌ Must be > 0");
    }
    pendingInput = null;
    return;
  }

  if (pendingInput === "window_minutes") {
    const n = parseInt(value, 10);
    if (n > 0) {
      cfg.rateLimit.windowMinutes = n;
      state.save(cfg);
      await ctx.reply(`✅ Window: ${n} minutes`, rateLimitMenu());
    } else {
      await ctx.reply("❌ Must be > 0");
    }
    pendingInput = null;
    return;
  }

  if (pendingInput === "cooldown_seconds") {
    const n = parseInt(value, 10);
    if (n >= 0) {
      cfg.rateLimit.cooldownSeconds = n;
      state.save(cfg);
      await ctx.reply(`✅ Cooldown: ${n}s`, rateLimitMenu());
    } else {
      await ctx.reply("❌ Must be >= 0");
    }
    pendingInput = null;
    return;
  }

  // Original inputs
  if (pendingInput === "source") {
    pendingInput = null;
    await ctx.reply(`🔎 Verifying ${value}...`);
    let info;
    try {
      info = await engine.getChannelInfo(value);
    } catch (err) {
      // Validate BEFORE touching saved state — a bad ID should never
      // overwrite a working source channel.
      await ctx.reply(`❌ Access ചെയ്യാൻ പറ്റുന്നില്ല: ${err.message}\nID ശരിയാണോ എന്ന് നോക്കി വീണ്ടും ശ്രമിക്കൂ.`, mainMenu());
      return;
    }
    await handleSourceCandidate(ctx, info);
    return;
  }

  if (pendingInput === "target") {
    pendingInput = null;
    await ctx.reply(`🔎 Verifying ${value}...`);
    let info;
    try {
      info = await engine.getChannelInfo(value);
    } catch (err) {
      await ctx.reply(`❌ Access ചെയ്യാൻ പറ്റുന്നില്ല: ${err.message}\nID ശരിയാണോ എന്ന് നോക്കി വീണ്ടും ശ്രമിക്കൂ.`, mainMenu());
      return;
    }
    await handleTargetCandidate(ctx, info);
    return;
  }

  if (pendingInput === "maxsize") {
    const n = parseInt(value, 10);
    cfg.maxSizeMB = n > 0 ? n : null;
    state.save(cfg);
    await ctx.reply(
      `✅ Max size: ${cfg.maxSizeMB ? cfg.maxSizeMB + " MB" : "no limit"}`,
      mainMenu()
    );
    pendingInput = null;
    return;
  }

  if (pendingInput === "dailylimit") {
    const n = parseInt(value, 10);
    cfg.dailyLimit = n > 0 ? n : null;
    state.save(cfg);
    await ctx.reply(
      `✅ Daily limit: ${cfg.dailyLimit ? cfg.dailyLimit : "no limit"}`,
      mainMenu()
    );
    pendingInput = null;
    return;
  }

  pendingInput = null;
});

// ============ SOURCE/TARGET CHANGE FLOW ============
// Handles: validating a channel before saving it, asking whether to clear
// old progress when the source channel changes, and offering to resume
// from archived progress if the newly-picked channel was used before.

async function handleSourceCandidate(ctx, info) {
  const cfg = state.load();
  const detail =
    `📡 *${info.title}*${info.username ? " (" + info.username + ")" : ""}` +
    `${info.participantsCount ? "\n👥 " + info.participantsCount + " members" : ""}\n` +
    `ID: \`${info.id}\``;

  if (cfg.sourceChannel === info.id) {
    // Same channel re-selected — just refresh the cached name, no need to
    // ask about clearing anything.
    cfg.sourceChannelName = info.title;
    cfg.sourceChannelUsername = info.username;
    state.save(cfg);
    await ctx.reply(`✅ Source ഇത് തന്നെ ആണ് നിലവിൽ:\n\n${detail}`, { parse_mode: "Markdown", ...mainMenu() });
    return;
  }

  if (cfg.sourceChannel) {
    // Switching away from an existing source with live progress — ask
    // before touching it, and show what's about to be archived.
    pendingCandidate = { type: "source", id: info.id, title: info.title, username: info.username, participantsCount: info.participantsCount };
    const oldName = cfg.sourceChannelName || cfg.sourceChannel;
    await ctx.reply(
      `⚠️ *Source Channel മാറ്റുന്നു*\n\n` +
      `പഴയ Source: *${oldName}*\n` +
      fmtStats(cfg.stats) +
      `\n\nപുതിയ Source: *${info.title}*${info.username ? " (" + info.username + ")" : ""}\n\n` +
      `പഴയ channel-ന്റെ progress archive ചെയ്ത് (delete അല്ല) പുതിയ channel fresh ആയി തുടങ്ങണോ?`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("✅ അതെ, Fresh start", "clear_src_yes")],
          [Markup.button.callback("❌ വേണ്ട, Data carry over ചെയ്യൂ", "clear_src_no")],
        ]),
      }
    );
    return;
  }

  // No previous source configured — nothing to ask about, go straight in.
  await finalizeSourceChange(ctx, info, true);
}

async function finalizeSourceChange(ctx, info, resetFresh) {
  const cfg = state.load();
  const oldId = cfg.sourceChannel;

  if (resetFresh && oldId && oldId !== info.id) {
    state.archiveSourceProgress(cfg);
  }

  cfg.sourceChannel = info.id;
  cfg.sourceChannelName = info.title;
  cfg.sourceChannelUsername = info.username;
  cfg.sourceChannelAccessHash = info.accessHash;
  cfg.recentSourceChannels = state.pushRecent(cfg.recentSourceChannels, {
    id: info.id,
    name: info.title,
    username: info.username,
    accessHash: info.accessHash,
  });

  if (resetFresh) {
    const hist = cfg.channelHistory && cfg.channelHistory[info.id];
    if (hist) {
      // We've seen this exact channel before — offer to pick up where we
      // left off instead of silently resetting or silently resuming.
      state.save(cfg);
      await ctx.reply(
        `📦 ഈ channel-ന് മുൻപ് save ചെയ്ത progress ഉണ്ട് (✅ Sent: ${hist.stats.sent}, 🔄 Duplicates: ${hist.stats.duplicates}).\n` +
        `അവിടെ നിന്ന് തുടരണോ അതോ fresh ആയി തുടങ്ങണോ?`,
        Markup.inlineKeyboard([
          [Markup.button.callback("▶️ തുടരൂ (Resume)", "resume_src_yes")],
          [Markup.button.callback("🆕 Fresh Start", "resume_src_no")],
        ])
      );
      return;
    }
    state.resetSourceProgress(cfg);
  }

  state.save(cfg);
  const resumeNote = resetFresh ? "\n🆕 Fresh transfer ആയി തുടങ്ങും." : "\n📎 പഴയ progress data carry over ചെയ്തു.";
  await ctx.reply(
    `✅ *Source Confirmed:*\n\n📡 *${info.title}*${info.username ? " (" + info.username + ")" : ""}` +
    `${info.participantsCount ? "\n👥 " + info.participantsCount : ""}${resumeNote}`,
    { parse_mode: "Markdown", ...mainMenu() }
  );
}

bot.action("clear_src_yes", async (ctx) => {
  await ctx.answerCbQuery();
  if (!pendingCandidate || pendingCandidate.type !== "source") return;
  const info = pendingCandidate;
  pendingCandidate = null;
  await finalizeSourceChange(ctx, info, true);
});

bot.action("clear_src_no", async (ctx) => {
  await ctx.answerCbQuery();
  if (!pendingCandidate || pendingCandidate.type !== "source") return;
  const info = pendingCandidate;
  pendingCandidate = null;
  await finalizeSourceChange(ctx, info, false);
});

bot.action("resume_src_yes", async (ctx) => {
  await ctx.answerCbQuery();
  const cfg = state.load();
  state.restoreSourceProgress(cfg, cfg.sourceChannel);
  state.save(cfg);
  await ctx.reply("▶️ പഴയ progress restore ചെയ്തു. Resume ചെയ്യാൻ റെഡി.", mainMenu());
});

bot.action("resume_src_no", async (ctx) => {
  await ctx.answerCbQuery();
  const cfg = state.load();
  state.resetSourceProgress(cfg);
  state.save(cfg);
  await ctx.reply("🆕 Fresh ആയി തുടങ്ങും.", mainMenu());
});

async function handleTargetCandidate(ctx, info) {
  const cfg = state.load();
  const alreadySet = cfg.targetChannel === info.id;
  cfg.targetChannel = info.id;
  cfg.targetChannelName = info.title;
  cfg.targetChannelUsername = info.username;
  cfg.targetChannelAccessHash = info.accessHash;
  cfg.recentTargetChannels = state.pushRecent(cfg.recentTargetChannels, {
    id: info.id,
    name: info.title,
    username: info.username,
    accessHash: info.accessHash,
  });
  state.save(cfg);
  const detail = `🎯 *${info.title}*${info.username ? " (" + info.username + ")" : ""}\nID: \`${info.id}\``;
  await ctx.reply(
    `✅ *Target ${alreadySet ? "ഇത് തന്നെ ആണ്" : "Confirmed"}:*\n\n${detail}`,
    { parse_mode: "Markdown", ...mainMenu() }
  );
}

// ============ PREVIEW ============

bot.action("preview", async (ctx) => {
  const cfg = state.load();
  if (!cfg.sourceChannel) return ctx.reply("⚠️ Set source first.");
  await ctx.reply("🔍 Scanning...");
  try {
    const counts = await engine.getPreview(cfg);
    const info = counts.channelInfo;
    await ctx.reply(
      `👁 *Preview*\n\n` +
      `📡 *${info.title}*${info.username ? " (" + info.username + ")" : ""}\n\n` +
      `📸 Photos: ${counts.photo}\n` +
      `🎬 Videos: ${counts.video}\n` +
      `🎞 GIFs: ${counts.gif}\n` +
      `📄 Documents: ${counts.document}\n` +
      `🚫 Text (excluded): ${counts.textfile_excluded}\n\n` +
      `📊 Total: ${counts.total}`,
      { parse_mode: "Markdown", ...mainMenu() }
    );
  } catch (err) {
    await ctx.reply("❌ Preview failed: " + err.message);
  }
});

// ============ STATUS ============

function channelLabel(id, name, username) {
  if (!id) return "not set";
  if (!name) return id; // old state.json without a cached name yet
  return `${name}${username ? " (" + username + ")" : ""}`;
}

bot.action("status", async (ctx) => {
  const cfg = state.load();
  await ctx.reply(
    `📊 *Status: ${cfg.status}*\n\n` +
    `📡 Source: ${channelLabel(cfg.sourceChannel, cfg.sourceChannelName, cfg.sourceChannelUsername)}\n` +
    `🎯 Target: ${channelLabel(cfg.targetChannel, cfg.targetChannelName, cfg.targetChannelUsername)}\n\n` +
    fmtStats(cfg.stats),
    { parse_mode: "Markdown", ...mainMenu() }
  );
});

// ============ TRANSFER ============

let transferRunning = false;

bot.action("start_transfer", async (ctx) => {
  const cfg = state.load();
  if (!cfg.sourceChannel || !cfg.targetChannel) {
    return ctx.reply("⚠️ Set source and target first.");
  }
  if (transferRunning) return ctx.reply("🟢 Transfer already running.");

  // Names are cached at the time source/target were set, so no extra
  // MTProto call is needed here on every transfer start.
  const sourceLabel = channelLabel(cfg.sourceChannel, cfg.sourceChannelName, cfg.sourceChannelUsername);
  const targetLabel = channelLabel(cfg.targetChannel, cfg.targetChannelName, cfg.targetChannelUsername);

  const rlInfo = cfg.rateLimit.enabled
    ? `\n⚡ Rate: ${cfg.rateLimit.itemsPerWindow}/${cfg.rateLimit.windowMinutes}m`
    : `\n🚦 Speed: ${cfg.speed}`;

  await ctx.reply(
    `🚀 *Starting Transfer*\n\nSource: ${sourceLabel}\nTarget: ${targetLabel}${rlInfo}\n\nStarting...`,
    { parse_mode: "Markdown" }
  );

  transferRunning = true;
  cfg.status = "running";
  state.save(cfg);

  let lastStatusMsgId = null;
  let statusMsgChatId = ctx.chat.id;

  engine
    .startTransfer({
      onStatusSend: async (text) => {
        try {
          const sent = await ctx.telegram.sendMessage(statusMsgChatId, text, { parse_mode: "Markdown" });
          return sent.message_id;
        } catch (e) {
          return null;
        }
      },
      onStatusUpdate: async (text, msgId) => {
        try {
          await ctx.telegram.editMessageText(statusMsgChatId, msgId, undefined, text, { parse_mode: "Markdown" });
        } catch (e) {
          // ignore
        }
      },
      onProgress: async (stats, total, eta) => {
        const text = `⏳ *Transferring...*\n\n` +
          `✅ Sent: ${stats.sent}\n` +
          `⏭ Skipped: ${stats.skippedByType + stats.skippedBySize + stats.skippedTextFile}\n` +
          `❌ Failed: ${stats.failed}\n` +
          `🔄 Duplicates: ${stats.duplicates}${eta ? `\n⏱ ETA: ${eta}` : ""}`;
        try {
          if (lastStatusMsgId) {
            await ctx.telegram.editMessageText(statusMsgChatId, lastStatusMsgId, undefined, text, { parse_mode: "Markdown" });
          } else {
            const sent = await ctx.reply(text, { parse_mode: "Markdown" });
            lastStatusMsgId = sent.message_id;
          }
        } catch (e) {
          // ignore
        }
      },
      onLog: (msg) => ctx.reply(msg),
      onDone: (stats) => {
        transferRunning = false;
        const cfg2 = state.load();
        let failNote = "";
        if (cfg2.failedItems && cfg2.failedItems.length) {
          const sample = cfg2.failedItems
            .slice(-5)
            .map((f) => `• msg ${f.msgId}: ${f.reason}`)
            .join("\n");
          failNote = `\n\n🧾 *Recent failures* (/faillog for more):\n${sample}`;
        }
        ctx.reply(
          `✅ *Transfer Complete!*\n\n${fmtStats(stats)}${failNote}`,
          { parse_mode: "Markdown", ...mainMenu() }
        );
      },
    })
    .catch((err) => {
      transferRunning = false;
      const cfg2 = state.load();
      cfg2.status = "stopped";
      state.save(cfg2);
      ctx.reply("❌ Transfer failed: " + err.message);
    });
});

bot.action("pause_transfer", async (ctx) => {
  const cfg = state.load();
  if (cfg.status !== "running") return ctx.reply("⚠️ Nothing running.");
  cfg.status = "paused";
  state.save(cfg);
  await ctx.reply("⏸ Paused.", mainMenu());
});

bot.action("resume_transfer", async (ctx) => {
  const cfg = state.load();
  if (cfg.status !== "paused") return ctx.reply("⚠️ Nothing paused.");
  cfg.status = "running";
  state.save(cfg);
  await ctx.reply("▶️ Resumed.");
});

bot.action("stop_transfer", async (ctx) => {
  await ctx.reply(
    "⏹ Stop transfer?",
    Markup.inlineKeyboard([
      [Markup.button.callback("✅ Yes", "confirm_stop"), Markup.button.callback("❌ No", "back_main")],
    ])
  );
});

bot.action("confirm_stop", async (ctx) => {
  const cfg = state.load();
  cfg.status = "stopped";
  state.save(cfg);
  transferRunning = false;
  await ctx.reply("🔴 Stopped.", mainMenu());
});

// ============ ERROR ============

bot.catch((err, ctx) => {
  console.error("Bot error:", err);
});

bot.launch().then(() => console.log("✅ Advanced bot running."));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
