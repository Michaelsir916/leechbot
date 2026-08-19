// Run this ONCE to log in with the account that is a member of the source channel.
// It will ask for phone number, code, and (if enabled) 2FA password.
// At the end it prints a SESSION_STRING - copy it into your .env file.

require("dotenv").config();
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const input = require("input");

const apiId = parseInt(process.env.API_ID, 10);
const apiHash = process.env.API_HASH;

(async () => {
  if (!apiId || !apiHash) {
    console.log("❌ Please set API_ID and API_HASH in your .env file first.");
    process.exit(1);
  }

  console.log("🔐 Logging in to the account that is a MEMBER of your source channel...\n");

  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await input.text("📱 Phone number (with country code, e.g. +91...): "),
    password: async () => await input.text("🔑 2FA password (leave blank if none): "),
    phoneCode: async () => await input.text("💬 Code sent to your Telegram: "),
    onError: (err) => console.log(err),
  });

  console.log("\n✅ Logged in successfully!\n");
  console.log("Copy this into your .env file as SESSION_STRING:\n");
  console.log(client.session.save());
  console.log("\nKeep this string PRIVATE - it gives full access to that account.");

  await client.disconnect();
  process.exit(0);
})();
