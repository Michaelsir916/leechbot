# 🚀 Advanced Bot v2 - Setup Guide

## 📦 Installation

### Step 1: Install Dependencies
```bash
cd leechbot-main-advanced
npm install
```

### Step 2: Create .env File
Copy or edit `.env`:
```bash
API_ID=your_api_id_here
API_HASH=your_api_hash_here
BOT_TOKEN=your_bot_token_here
OWNER_ID=your_telegram_user_id
SESSION_STRING=your_session_string
```

### Step 3: Get SESSION_STRING (First Time)
If you don't have a session string, run:
```bash
node login.js
```
Follow prompts, then copy the generated session string to `.env`.

### Step 4: Run the Bot

**Option A: Two Terminals**
```bash
# Terminal 1: Control Bot
node bot.js

# Terminal 2: Userbot Engine
node userbot.js
```

**Option B: Using PM2 (Recommended)**
```bash
npm install -g pm2

pm2 start bot.js --name "leech-control"
pm2 start userbot.js --name "leech-engine"

pm2 save
pm2 startup
```

Check status:
```bash
pm2 status
pm2 logs leech-control
pm2 logs leech-engine
```

---

## ⚡ Quick Start Guide

### 1. Start the Bot
```bash
pm2 start bot.js
```
Control bot is now running.

### 2. Start Userbot
```bash
pm2 start userbot.js
```
Engine is now ready.

### 3. Open Telegram
Send `/start` to your bot in private chat.

### 4. Configure Rate Limit
```
🎮 Menu → ⚡ Rate Limit → Toggle ON

Set:
- Items/Window: 5
- Window: 10 minutes
- Cooldown: 2 seconds
```

### 5. Set Channels
```
🎮 Menu → 📡 Source → @source_channel
🎮 Menu → 🎯 Target → @target_channel
```

### 6. Preview
```
🎮 Menu → 👁 Preview
```
See how many items will transfer.

### 7. Start Transfer
```
🎮 Menu → 🚀 Start Transfer
```
Watch the progress update (no spam).

---

## 🎯 Rate Limit Recommendations

### For Safety (Recommended)
```
Items per Window: 5
Window Duration: 10 minutes
Cooldown: 2 seconds
↓
Max 5 items every 10 minutes
Very safe for account
```

### For Speed (Moderate Risk)
```
Items per Window: 10
Window Duration: 10 minutes
Cooldown: 1 second
↓
Max 10 items every 10 minutes
Faster, but monitor for limits
```

### For Maximum Speed (High Risk)
```
Items per Window: 20
Window Duration: 5 minutes
Cooldown: 0 seconds
↓
Max 20 items every 5 minutes
Fast but may hit limits - not recommended
```

---

## 📊 Configuration File Locations

### state.json
```
leechbot-main-advanced/state.json
```
Contains all settings and progress. Backs up automatically.

### .env
```
leechbot-main-advanced/.env
```
Contains API credentials. Keep secret!

---

## 🔍 Checking Status

### Check Bot Logs
```bash
pm2 logs leech-control
```

### Check Engine Logs
```bash
pm2 logs leech-engine
```

### Check Configuration
Send `/whereami` to bot in Telegram.

Shows:
- Current status
- Rate limit settings
- Transfer stats
- Daily progress

---

## 🛑 Stopping/Restarting

### Stop Bot
```bash
pm2 stop leech-control
```

### Stop Userbot
```bash
pm2 stop leech-engine
```

### Stop All
```bash
pm2 stop all
```

### Restart Bot
```bash
pm2 restart leech-control
```

### View All Running Processes
```bash
pm2 status
```

---

## 💾 Backing Up Progress

Your progress is saved in `state.json`. To backup:
```bash
cp state.json state.json.backup
```

If something goes wrong:
```bash
cp state.json.backup state.json
pm2 restart leech-engine
```

---

## 🚨 Common Issues

### Issue: "Cannot find Telegram Client"
**Solution**: Make sure to run `node login.js` first and get SESSION_STRING.

### Issue: "Bot not responding"
**Solution**: 
```bash
pm2 restart leech-control
pm2 logs leech-control
```

### Issue: "Transfer stuck on scanning"
**Solution**: 
- Check userbot is running: `pm2 status`
- Restart: `pm2 restart leech-engine`

### Issue: "FloodWait errors"
**Solution**: 
- Increase cooldown to 3-5 seconds
- Reduce items per window to 3-5
- Extend window to 15-20 minutes

### Issue: "Message editing not working"
**Solution**:
- Make sure rate limiting is ENABLED
- Check bot.js has `onStatusUpdate` hook
- Restart bot: `pm2 restart leech-control`

---

## 🔒 Security Notes

1. **Keep .env secret** - Never share your API credentials
2. **Use rate limiting** - Protects your account from limits
3. **Set daily limit** - Extra safety against account bans
4. **Monitor progress** - Check logs regularly
5. **Backup state.json** - Keep your transfer progress safe

---

## 📱 Advanced: Termux Setup (Android)

If running on Termux (Android):

### 1. Install Node.js
```bash
pkg install nodejs
pkg install git
```

### 2. Clone or Extract Bot
```bash
cd /data/data/com.termux/files/home
unzip leechbot-main-advanced.zip
cd leechbot-main-advanced
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Get Session String
```bash
node login.js
```

### 5. Run in Background (Using screen)
```bash
pkg install screen

# Terminal 1
screen -S bot
node bot.js

# Press Ctrl+A then D to detach

# Terminal 2
screen -S engine
node userbot.js

# Press Ctrl+A then D to detach
```

### 6. Resume Sessions
```bash
screen -r bot      # Reattach to bot
screen -r engine   # Reattach to engine
```

---

## 🎓 Understanding Rate Limiting

### What is Rate Limiting?
Telegram restricts how fast you can send messages. Rate limiting prevents hitting these restrictions by:
1. Limiting items sent per time window
2. Adding cooldown between items
3. Automatically pausing if needed

### How It Works
```
Configuration: 5 items / 10 minutes + 2s cooldown

Timeline:
00:00 - Send item 1 (wait 2s)
00:02 - Send item 2 (wait 2s)
00:04 - Send item 3 (wait 2s)
00:06 - Send item 4 (wait 2s)
00:08 - Send item 5 (wait 10min - window expires)
10:08 - Window resets, send item 6
...
```

### Why It's Safe
- Telegram can't flag your account
- No ban risk
- Reliable, stable transfers
- Works for large transfers

---

## 📞 Troubleshooting Commands

### Debug Rate Limit
Check `state.json` → `rateLimitState`:
```json
{
  "rateLimitState": {
    "lastSendTime": 1234567890,
    "itemsInWindow": 2,
    "windowStartTime": 1234567890
  }
}
```

### Reset Progress (Start Over)
Edit `state.json`:
```json
{
  "lastProcessedMsgId": 0,
  "stats": {
    "sent": 0,
    "failed": 0,
    "skippedByType": 0,
    "skippedBySize": 0,
    "skippedTextFile": 0,
    "duplicates": 0
  }
}
```

### Check Rate Limit Status
Send `/whereami` to bot. Shows current rate limit settings.

---

## 🚀 Next Steps

1. ✅ Install bot
2. ✅ Configure .env
3. ✅ Run bot & engine
4. ✅ Set rate limiting
5. ✅ Configure channels
6. ✅ Start transfer
7. ✅ Monitor progress
8. ✅ Adjust if needed

---

**Happy transferring! 🎉**
