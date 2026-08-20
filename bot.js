require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const state = require("./state");
const engine = require("./userbot.js");

const BOT_TOKEN = process.env.BOT_TOKEN;
const OWNER_ID = parseInt(process.env.OWNER_ID, 10);

const bot = new Telegraf(BOT_TOKEN);

// ---- Owner-only guard ----
// IMPORTANT: this bot must NEVER post into the source/target channel, even errors.
// So it only ever processes/replies in a private DM with the owner. Everything else
// (channel_post, group messages, other users) is silently ignored - no reply sent at all.
bot.use((ctx, next) => {
  const isPrivate = ctx.chat && ctx.chat.type === "private";
  const isOwner = ctx.from && ctx.from.id === OWNER_ID;
  if (isPrivate && isOwner) return next();
  return; // silent ignore, no message sent anywhere
});

// Track a "pending text input" per step (e.g. waiting for source channel input)
let pendingInput = null; // "source" | "target" | "maxsize" | null

// ---------------- Menus ----------------

function mainMenu() {
  const cfg = state.load();
  const statusEmoji = { idle: "⚪", running: "🟢", paused: "🟡", stopped: "🔴", done: "✅" }[cfg.status] || "⚪";
  return Markup.inlineKeyboard([
    [Markup.button.callback("⚙️ Configure Filters", "menu_filters")],
    [Markup.button.callback("📡 Set Source Channel", "set_source"), Markup.button.callback("🎯 Set Target", "set_target")],
    [Markup.button.callback("🚦 Speed: " + cfg.speed, "menu_speed"), Markup.button.callback("📏 Max Size", "set_maxsize")],
    [Markup.button.callback("👁 Preview", "preview")],
    [Markup.button.callback(`${statusEmoji} Status`, "status")],
    [Markup.button.callback("🚀 Start Transfer", "start_transfer")],
    [Markup.button.callback("⏸ Pause", "pause_transfer"), Markup.button.callback("▶️ Resume", "resume_transfer")],
    [Markup.button.callback("⏹ Stop", "stop_transfer")],
    [Markup.button.callback("🔁 Retry Failed", "retry_failed")],
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
    [Markup.button.callback(`${tick(f.documents)} Documents (non-text only)`, "toggle_documents")],
    [Markup.button.callback("⬅️ Back", "back_main")],
  ]);
}

function speedMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🐢 Slow (safest)", "speed_slow")],
    [Markup.button.callback("🚶 Normal", "speed_normal")],
    [Markup.button.callback("🐇 Fast (risk of limits)", "speed_fast")],
    [Markup.button.callback("⬅️ Back", "back_main")],
  ]);
}

function fmtStats(stats) {
  return (
    `Sent: ${stats.sent}\n` +
    `Skipped (type): ${stats.skippedByType}\n` +
    `Skipped (size): ${stats.skippedBySize}\n` +
    `Skipped (text files): ${stats.skippedTextFile}\n` +
    `Duplicates skipped: ${stats.duplicates}\n` +
    `Failed: ${stats.failed}`
  );
}

// ---------------- Commands ----------------

bot.start((ctx) => {
  ctx.reply(
    "👋 *Channel Recovery Bot*\n\nSet your source channel and target, configure filters, then hit Start.",
    { parse_mode: "Markdown", ...mainMenu() }
  );
});

bot.command("menu", (ctx) => ctx.reply("📋 Main Menu", mainMenu()));

// ---------------- Callback actions ----------------

bot.action("back_main", async (ctx) => {
  await ctx.editMessageText("📋 Main Menu", mainMenu());
});

bot.action("menu_filters", async (ctx) => {
  await ctx.editMessageText("⚙️ *Filters* — choose what gets transferred:", {
    parse_mode: "Markdown",
    ...filtersMenu(),
  });
});

bot.action(/toggle_(photos|videos|gifs|documents)/, async (ctx) => {
  const key = ctx.match[1];
  const cfg = state.load();
  cfg.filters[key] = !cfg.filters[key];
  state.save(cfg);
  await ctx.editMessageText("⚙️ *Filters* — choose what gets transferred:", {
    parse_mode: "Markdown",
    ...filtersMenu(),
  });
});

bot.action("menu_speed", async (ctx) => {
  await ctx.editMessageText("🚦 Choose transfer speed:", speedMenu());
});

bot.action(/speed_(slow|normal|fast)/, async (ctx) => {
  const cfg = state.load();
  cfg.speed = ctx.match[1];
  state.save(cfg);
  await ctx.editMessageText(`🚦 Speed set to *${cfg.speed}*`, { parse_mode: "Markdown", ...mainMenu() });
});

bot.action("set_source", async (ctx) => {
  pendingInput = "source";
  await ctx.reply("📡 Send the *source channel* username (e.g. @mychannel) or numeric ID:", { parse_mode: "Markdown" });
});

bot.action("set_target", async (ctx) => {
  pendingInput = "target";
  await ctx.reply("🎯 Send the *target group/channel* username or numeric ID:", { parse_mode: "Markdown" });
});

bot.action("set_maxsize", async (ctx) => {
  pendingInput = "maxsize";
  await ctx.reply("📏 Send max file size in MB (e.g. 2000), or send `0` for no limit:", { parse_mode: "Markdown" });
});

bot.on("text", async (ctx) => {
  if (!pendingInput) return; // ignore stray text
  const cfg = state.load();
  const value = ctx.message.text.trim();

  if (pendingInput === "source") {
    cfg.sourceChannel = value;
    state.save(cfg);
    await ctx.reply(`✅ Source channel set to: ${value}`, mainMenu());
  } else if (pendingInput === "target") {
    cfg.targetChannel = value;
    state.save(cfg);
    await ctx.reply(`✅ Target set to: ${value}`, mainMenu());
  } else if (pendingInput === "maxsize") {
    const n = parseInt(value, 10);
    cfg.maxSizeMB = n > 0 ? n : null;
    state.save(cfg);
    await ctx.reply(`✅ Max size set to: ${cfg.maxSizeMB ? cfg.maxSizeMB + " MB" : "no limit"}`, mainMenu());
  }
  pendingInput = null;
});

bot.action("preview", async (ctx) => {
  const cfg = state.load();
  if (!cfg.sourceChannel) return ctx.reply("⚠️ Set the source channel first.");
  await ctx.reply("🔍 Scanning source channel, this may take a moment...");
  try {
    const counts = await engine.getPreview(cfg);
    await ctx.reply(
      `👁 *Preview*\n\n` +
        `Photos: ${counts.photo}\n` +
        `Videos: ${counts.video}\n` +
        `GIFs: ${counts.gif}\n` +
        `Documents: ${counts.document}\n` +
        `Text files (always excluded): ${counts.textfile_excluded}\n\n` +
        `Total media messages: ${counts.total}`,
      { parse_mode: "Markdown", ...mainMenu() }
    );
  } catch (err) {
    await ctx.reply("❌ Preview failed: " + err.message);
  }
});

bot.action("status", async (ctx) => {
  const cfg = state.load();
  await ctx.reply(
    `📊 *Status*: ${cfg.status}\n` +
      `Source: ${cfg.sourceChannel || "not set"}\n` +
      `Target: ${cfg.targetChannel || "not set"}\n\n` +
      fmtStats(cfg.stats),
    { parse_mode: "Markdown", ...mainMenu() }
  );
});

let transferRunning = false;

bot.action("start_transfer", async (ctx) => {
  const cfg = state.load();
  if (!cfg.sourceChannel || !cfg.targetChannel) {
    return ctx.reply("⚠️ Set both source channel and target before starting.");
  }
  if (transferRunning) return ctx.reply("🟢 Transfer already running.");

  await ctx.reply(
    `🚀 *Confirm Transfer*\n\nSource: ${cfg.sourceChannel}\nTarget: ${cfg.targetChannel}\nSpeed: ${cfg.speed}\n\nStarting now...`,
    { parse_mode: "Markdown" }
  );

  transferRunning = true;
  cfg.status = "running";
  state.save(cfg);

  let lastEditMsg = null;

  engine
    .startTransfer({
      onProgress: async (stats, total) => {
        const text = `⏳ *Transferring...*\n\nSent: ${stats.sent}\nSkipped: ${
          stats.skippedByType + stats.skippedBySize + stats.skippedTextFile
        }\nFailed: ${stats.failed}\nDuplicates: ${stats.duplicates}`;
        try {
          if (lastEditMsg) {
            await ctx.telegram.editMessageText(ctx.chat.id, lastEditMsg, undefined, text, { parse_mode: "Markdown" });
          } else {
            const sent = await ctx.reply(text, { parse_mode: "Markdown" });
            lastEditMsg = sent.message_id;
          }
        } catch (e) {
          // ignore edit race conditions (e.g. "message not modified")
        }
      },
      onLog: (msg) => ctx.reply(msg),
      onDone: (stats) => {
        transferRunning = false;
        ctx.reply(`✅ *Transfer finished*\n\n${fmtStats(stats)}`, { parse_mode: "Markdown", ...mainMenu() });
      },
    })
    .catch((err) => {
      transferRunning = false;
      const cfg2 = state.load();
      cfg2.status = "stopped";
      state.save(cfg2);
      ctx.reply("❌ Transfer crashed: " + err.message);
    });
});

bot.action("pause_transfer", async (ctx) => {
  const cfg = state.load();
  if (cfg.status !== "running") return ctx.reply("⚠️ Nothing is running.");
  cfg.status = "paused";
  state.save(cfg);
  await ctx.reply("⏸ Paused. Press Resume to continue.");
});

bot.action("resume_transfer", async (ctx) => {
  const cfg = state.load();
  if (cfg.status !== "paused") return ctx.reply("⚠️ Nothing is paused.");
  cfg.status = "running";
  state.save(cfg);
  await ctx.reply("▶️ Resumed.");
});

// Stop with confirmation step
bot.action("stop_transfer", async (ctx) => {
  await ctx.reply(
    "⏹ Are you sure you want to stop the transfer?",
    Markup.inlineKeyboard([
      [Markup.button.callback("✅ Yes, stop", "confirm_stop"), Markup.button.callback("❌ Cancel", "back_main")],
    ])
  );
});

bot.action("confirm_stop", async (ctx) => {
  const cfg = state.load();
  cfg.status = "stopped";
  state.save(cfg);
  transferRunning = false;
  await ctx.reply("🔴 Stopped. Progress is saved — Start Transfer will resume from here.", mainMenu());
});

bot.action("retry_failed", async (ctx) => {
  const cfg = state.load();
  if (!cfg.failedItems.length) return ctx.reply("✅ No failed items.");
  await ctx.reply(`🔁 Retrying ${cfg.failedItems.length} failed item(s)...`);
  engine.retryFailed({
    onDone: (stats) => ctx.reply(`✅ Retry complete.\n\n${fmtStats(stats)}`, mainMenu()),
  }).catch((err) => ctx.reply("❌ Retry failed: " + err.message));
});

// ---------------- Error logging ----------------
bot.catch((err, ctx) => {
  console.error("Bot error:", err);
  const cfg = state.load();
  if (cfg.logChannelId) {
    ctx.telegram.sendMessage(cfg.logChannelId, `⚠️ Error: ${err.message}`).catch(() => {});
  }
});

bot.launch().then(() => console.log("✅ Control bot running."));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
