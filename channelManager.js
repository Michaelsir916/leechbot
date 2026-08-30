/**
 * channelManager.js
 * Admin commands to add/remove/list source channels dynamically via bot,
 * instead of hardcoding IDs in code/.env.
 *
 * Usage in your main bot.js:
 *   const { registerChannelCommands, loadChannels } = require("./channelManager");
 *   registerChannelCommands(bot, gramClient, ADMIN_IDS);
 *
 * `gramClient` = your existing connected GramJS TelegramClient instance.
 * `ADMIN_IDS`  = array of admin Telegram user IDs (numbers or strings).
 */

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "source_channels.json");

function loadChannels() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ channels: [] }, null, 2));
  }
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  return JSON.parse(raw).channels;
}

function saveChannels(channels) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ channels }, null, 2));
}

function isAdmin(userId, ADMIN_IDS) {
  return ADMIN_IDS.map(String).includes(String(userId));
}

function registerChannelCommands(bot, gramClient, ADMIN_IDS) {
  // /addchannel <link_or_@username_or_-100ID>
  bot.command("addchannel", async (ctx) => {
    if (!isAdmin(ctx.from.id, ADMIN_IDS)) return;

    const input = ctx.message.text.split(" ").slice(1).join(" ").trim();
    if (!input) {
      return ctx.reply(
        "Usage:\n/addchannel <invite link, @username, or -100ID>"
      );
    }

    try {
      // getEntity() here also warms the GramJS access_hash cache,
      // which fixes the earlier "PeerUser not found" issue.
      const entity = await gramClient.getEntity(input);

      const channels = loadChannels();
      const idStr = entity.id.toString();

      if (channels.some((c) => c.id === idStr)) {
        return ctx.reply(`⚠️ Already added: ${entity.title || idStr}`);
      }

      channels.push({
        id: idStr,
        title: entity.title || "Unknown",
        addedAt: new Date().toISOString(),
      });
      saveChannels(channels);

      ctx.reply(`✅ Added channel: ${entity.title || idStr}\nID: ${idStr}`);
    } catch (err) {
      ctx.reply(`❌ Failed to resolve/add channel: ${err.message}`);
    }
  });

  // /removechannel <id>
  bot.command("removechannel", async (ctx) => {
    if (!isAdmin(ctx.from.id, ADMIN_IDS)) return;

    const id = ctx.message.text.split(" ")[1];
    if (!id) return ctx.reply("Usage:\n/removechannel <channel_id>");

    let channels = loadChannels();
    const before = channels.length;
    channels = channels.filter((c) => c.id !== id);

    if (channels.length === before) {
      return ctx.reply(`⚠️ No channel found with ID: ${id}`);
    }

    saveChannels(channels);
    ctx.reply(`✅ Removed channel: ${id}`);
  });

  // /listchannels
  bot.command("listchannels", async (ctx) => {
    if (!isAdmin(ctx.from.id, ADMIN_IDS)) return;

    const channels = loadChannels();
    if (!channels.length) return ctx.reply("No source channels added yet.");

    const text = channels
      .map((c, i) => `${i + 1}. ${c.title}\n   ID: ${c.id}`)
      .join("\n\n");

    ctx.reply(`📋 Source Channels:\n\n${text}`);
  });
}

module.exports = { registerChannelCommands, loadChannels, saveChannels };
