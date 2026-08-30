const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const input = require("input");

const apiId = 12345; // my.telegram.org ൽ നിന്നുള്ള api_id
const apiHash = "your_api_hash_here";

(async () => {
  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await input.text("Phone number (+91...): "),
    password: async () => await input.text("2FA password (ഉണ്ടെങ്കിൽ): "),
    phoneCode: async () => await input.text("OTP code: "),
    onError: (err) => console.log(err),
  });

  console.log("\n✅ Session String:\n");
  console.log(client.session.save());
  process.exit(0);
})();
