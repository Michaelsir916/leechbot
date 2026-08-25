# Channel Recovery Bot

Recover photos/videos/GIFs from a private channel you're still a **member** of (but no longer admin of) into a new channel/group you control — no captions, buttons-based control.

## How it works

- **Userbot (GramJS)** — logs in with your real account (the one that's a member of the source channel) and reads/sends the media. This is required because bots (Bot API) cannot read channel history without being admin, and can't read old history at all.
- **Control bot (Telegraf)** — a normal bot you chat with to configure filters, start/pause/stop, and see progress. It never needs to be added to the source channel.

## Setup (Termux)

```bash
cd channel-recovery-bot
npm install
cp .env.example .env
```

1. Get `API_ID` and `API_HASH` from https://my.telegram.org (login with the account that's a member of the source channel). Put them in `.env`.
2. Run the one-time login:
   ```bash
   node login.js
   ```
   Enter phone number, code, 2FA if asked. Copy the printed `SESSION_STRING` into `.env`.
3. Create a bot with @BotFather, put the token in `.env` as `BOT_TOKEN`.
4. Get your numeric user ID from @userinfobot, put it in `.env` as `OWNER_ID` (only you can control the bot).
5. (Optional) Set `LOG_CHANNEL_ID` to a channel/group where the bot is admin, for error logs.

## Run

```bash
node bot.js
```

Open a DM with your bot in Telegram and press **Start**.

## Usage flow

1. **Set Source Channel** — paste the channel username or ID (the one you lost admin on).
2. **Set Target** — paste your destination group/channel (you need posting rights here).
3. **Configure Filters** — toggle Photos / Videos / GIFs / Documents. Text files are always excluded, no toggle.
4. **Preview** — scans and shows counts before you commit to anything.
5. **Start Transfer** — sends a confirmation summary, then begins. Progress updates live in chat.
6. **Pause / Resume / Stop** — Stop asks for confirmation. Progress is saved either way; Start Transfer resumes from where it left off.
7. **Retry Failed** — after a run, retries any items that failed (not FloodWait — those auto-retry already).

## Notes

- Media is re-sent fresh (not forwarded), so no "Forwarded from" tag and no caption.
- Resume state lives in `state.json` (atomic writes, safe against Termux getting killed mid-run).
- Duplicate detection is per-run via each file's unique ID, so re-running the same range won't double-post.
- Keep `SESSION_STRING` and `.env` private — treat them like a password to your account.
