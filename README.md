# 🚀 Advanced Telegram Channel Recovery Bot v2

Enhanced version with **Rate Limiting**, **No PM Spam**, and **Advanced Controls**.

## 🎯 What's New?

### 1. ⚡ Rate Limiting (Advanced Speed Control)
Instead of simple speed presets (slow/normal/fast), you can now set:
- **Items per Window** - How many items to send (e.g., 5 items)
- **Window Duration** - Time period in minutes (e.g., 10 minutes)
- **Cooldown** - Delay between each item in seconds (e.g., 2 seconds)

**Example**: 5 items per 10 minutes + 2s cooldown = Controlled, safe transfer

### 2. 🔕 No PM Spam (Message Updates)
- Status message (`🔍 Scanned x messages...`) now **EDITS** the previous message
- No more spam of repeated messages in your DM
- Clean, organized status tracking

### 3. ⚙️ Better Configuration
```
⚡ Rate Limit Menu:
├─ Toggle ON/OFF
├─ Items per Window (how many at once)
├─ Window Duration (time period)
├─ Cooldown Seconds (delay between items)
└─ Info (view current settings)
```

### 4. 📊 Enhanced Stats
- Same detailed tracking
- Rate limit status in `/whereami`
- Better ETA calculations

---

## 📋 Main Features (Original + Enhanced)

✅ **Source Channel Scanning** - Extract media from any channel  
✅ **Filter Control** - Photos, Videos, GIFs, Documents  
✅ **Size Limits** - Skip files over X MB  
✅ **Daily Quota** - Limit items/day for account safety  
✅ **Resumable** - Progress saved, resume anytime  
✅ **Duplicate Detection** - Don't send same file twice  
✅ **Flood Handling** - Auto-wait on rate limits  
✅ **⚡ Rate Limiting** - NEW: Custom speed control  
✅ **🔕 No Spam** - NEW: Message editing instead of new messages  

---

## 🎮 How to Use

### Initial Setup
```bash
npm install
# Configure .env with your API_ID, API_HASH, BOT_TOKEN, OWNER_ID
node bot.js &
node userbot.js  # In separate terminal (or PM2)
```

### Rate Limiting (Recommended)

1. **Start the bot and send `/menu`**

2. **Click "⚡ Rate Limit"**

3. **Configure:**
   - Click `Toggle` to enable rate limiting
   - Set items per window (e.g., `5`)
   - Set window minutes (e.g., `10`)
   - Set cooldown seconds (e.g., `2`)

4. **Example Setup:**
   ```
   Items/Window: 5
   Window: 10 minutes
   Cooldown: 2 seconds
   
   Result: Max 5 items every 10 minutes, with 2s between each
   Safe for avoiding Telegram rate limits
   ```

### Legacy Speed Mode (If Not Using Rate Limit)

If you disable rate limiting, the bot falls back to simple speed:
- 🐢 Slow: 4 seconds between items
- 🚶 Normal: 2 seconds between items
- 🐇 Fast: 0.7 seconds between items

---

## 📱 Commands

| Command | Description |
|---------|-------------|
| `/start` | Show main menu |
| `/menu` | Show menu again |
| `/whereami` | Current status + rate limit info |

---

## 🎯 Configuration Breakdown

### Rate Limiting in state.json
```json
{
  "rateLimit": {
    "enabled": true,
    "itemsPerWindow": 5,
    "windowMinutes": 10,
    "cooldownSeconds": 2
  },
  "rateLimitState": {
    "lastSendTime": 1234567890,
    "itemsInWindow": 2,
    "windowStartTime": 1234567890
  }
}
```

### What Each Setting Does:

**itemsPerWindow**: Maximum items sent in each time window
- Lower = safer (e.g., 3-5)
- Higher = faster (e.g., 10-20)

**windowMinutes**: Duration of the time window
- 10 minutes = window resets every 10 minutes
- 5 minutes = more frequent resets (can be riskier)

**cooldownSeconds**: Wait time between sending each item
- 0 = no wait (may hit rate limits)
- 2-5 = safe, normal transfers
- 10+ = very safe, slower but safer

---

## 🚨 Safety Tips

1. **Start Conservative**: 5 items / 10 minutes + 2s cooldown
2. **Monitor**: Watch first 10-20 items for Telegram limit errors
3. **Adjust**: If no errors after 1000+ items, can speed up
4. **Increase Gradually**: Bump items/window slowly (5 → 7 → 10)
5. **Daily Limit**: Use "🌙 Daily Limit" to cap items/day

### Recommended Presets:

**Super Safe** (New accounts, sensitive channels)
```
5 items / 15 minutes + 3s cooldown
```

**Safe** (Normal use)
```
5 items / 10 minutes + 2s cooldown
```

**Moderate** (Established accounts)
```
10 items / 10 minutes + 1s cooldown
```

**Fast** (At your own risk)
```
15 items / 10 minutes + 0.5s cooldown
```

---

## 🔧 Advanced: Manual state.json Edits

You can directly edit `state.json` to configure rate limits:

```json
{
  "rateLimit": {
    "enabled": true,
    "itemsPerWindow": 10,
    "windowMinutes": 5,
    "cooldownSeconds": 1
  }
}
```

Stop the bot, edit, restart. Changes take effect immediately.

---

## 📊 Status Message Updates

### Before (Original):
```
❌ Sent 10+ repeated "🔍 Scanned X messages..." messages
```

### Now (Advanced):
```
✅ Same message EDITS to show progress
No PM spam, clean interface
```

The bot sends the first scan message, then updates it every 5 seconds.

---

## 🐛 Troubleshooting

### "FloodWait" or Rate Limit Errors
- **Increase cooldown**: Try 3-5 seconds
- **Reduce items**: Use 3-5 items per window
- **Extend window**: Try 15-20 minutes instead of 10

### Messages Not Updating
- Make sure `onStatusUpdate` callback is wired in bot.js
- Check message isn't too old (Telegram has edit limits)

### Transfer Slow
- Check if rate limiting is ON (may be slowing things)
- Try the "🚦 Speed: Fast" option if rate limit is OFF
- Increase `itemsPerWindow` if using rate limit

---

## 📝 Code Changes (Summary)

### state.js
```javascript
// NEW: Rate limiting fields
rateLimit: {
  enabled: false,
  itemsPerWindow: 5,
  windowMinutes: 10,
  cooldownSeconds: 2
}

rateLimitState: {
  lastSendTime: 0,
  itemsInWindow: 0,
  windowStartTime: 0
}
```

### userbot.js
```javascript
// NEW: applyRateLimit() function
// Calculates delay based on rate limit config
// Handles window reset logic

// Enhanced: startTransfer()
// Uses onStatusUpdate/onStatusSend for message editing
// Calls applyRateLimit() instead of fixed delays
```

### bot.js
```javascript
// NEW: rateLimitMenu() for UI
// NEW: Rate limit configuration callbacks
// Enhanced: startTransfer() with message editing hooks
// NEW: /whereami shows rate limit status
```

---

## 🔄 Version Compatibility

| Version | Speed Control | Message Spam | Rate Limit |
|---------|---------------|-------------|-----------|
| Original | ✅ 3 presets | ❌ Sends many | ❌ No |
| Advanced v2 | ✅ 3 presets + ⚡ Custom | ✅ Message edit | ✅ Yes |

---

## 📌 Recommended Workflow

1. **Set source & target channels**
2. **Enable rate limiting** (⚡ menu)
3. **Configure conservatively** (5/10m/2s)
4. **Run preview** to see what will transfer
5. **Start transfer** and monitor first 50 items
6. **Check for errors** in bot logs
7. **Adjust rate limits if needed**
8. **Let it run** (can pause/resume anytime)

---

## 🆘 Need Help?

Check `/whereami` to see:
- Current status
- Last processed message
- Today's transfer count
- Rate limit settings
- Full stats

---

**Made with ❤️ for safe, controlled Telegram channel recovery**
