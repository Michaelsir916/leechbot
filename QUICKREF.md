# ⚡ Quick Reference - Advanced Bot v2

## 🎮 Bot Controls

```
/start        → Main menu
/menu         → Show menu again
/whereami     → Current status + settings
```

---

## 📋 Main Menu Options

| Button | Action |
|--------|--------|
| ⚙️ Filters | Choose: Photos, Videos, GIFs, Documents |
| 📡 Source | Set channel to copy FROM |
| 🎯 Target | Set channel to copy TO |
| 🚦 Speed | Choose: Slow (4s), Normal (2s), Fast (0.7s) |
| 📏 Max Size | Skip files larger than X MB |
| 🌙 Daily | Max items to send per day |
| ⚡ Rate Limit | **NEW: Advanced speed control** |
| 👁 Preview | See how many items will transfer |
| 📊 Status | Current transfer progress |
| 🚀 Start | Begin transfer |
| ⏸ Pause | Pause transfer (can resume) |
| ▶️ Resume | Resume paused transfer |
| ⏹ Stop | Stop transfer |

---

## ⚡ Rate Limit Menu (NEW)

```
⚡ Rate Limiting Settings
├─ ✅ ON / ❌ OFF      → Toggle rate limit
├─ 📊 Items/Window     → How many items per time window
├─ ⏱ Window           → Time window in minutes
├─ ⏸ Cooldown         → Wait seconds between items
└─ 📋 Info            → View current settings
```

### Example Configuration

**Safe Mode** (Recommended)
```
Items per Window: 5
Window: 10 minutes
Cooldown: 2 seconds
↓
Send max 5 items every 10 minutes, wait 2s between each
```

**Speed Mode** (Moderate Risk)
```
Items per Window: 10
Window: 10 minutes
Cooldown: 1 second
↓
Send max 10 items every 10 minutes, wait 1s between each
```

---

## 🔄 Transfer Workflow

### Step 1️⃣: Set Channels
```
Menu → 📡 Source → Type channel name
Menu → 🎯 Target → Type channel name
```

### Step 2️⃣: Configure Transfer
```
Menu → ⚡ Rate Limit → Enable & set values
      (or use default 🚦 Speed if not using rate limit)
```

### Step 3️⃣: Set Filters
```
Menu → ⚙️ Filters → Choose what to copy
```

### Step 4️⃣: Preview
```
Menu → 👁 Preview → See how many items
```

### Step 5️⃣: Start
```
Menu → 🚀 Start Transfer → Watch progress
```

### Step 6️⃣: Monitor
```
Send /whereami anytime to check status
```

---

## 📊 Status Display

### /whereami Shows:
```
📍 Where am I

Status: running
Last processed: message_id_123
Today's sent: 45/200

⚡ Rate Limit: 5/10m (cooldown: 2s)
  or
🚦 Speed: normal (legacy mode)

✅ Sent: 45
⏭ Skipped (type): 12
📏 Skipped (size): 3
📄 Skipped (text): 2
🔄 Duplicates: 0
❌ Failed: 0
```

---

## 🔑 Key Features

### ✅ Rate Limiting
- Control speed precisely
- Items per time window
- Cooldown between items
- Automatic window reset

### ✅ No PM Spam
- Status message EDITS instead of new messages
- Clean, organized updates
- Same message updates every 5 seconds

### ✅ Filters
- Photos only
- Videos only
- GIFs only
- Documents (except text files)
- Combinations of above

### ✅ Safety Features
- Daily limit (max items/day)
- Size limit (skip big files)
- Duplicate detection
- Flood wait handling
- Resumable progress

### ✅ Status Tracking
- Sent count
- Skipped count (by type, size, text)
- Failed count
- Duplicate count
- ETA calculation

---

## ⚙️ Configuration Examples

### Example 1: Safe Transfer
```
Rate Limit: ENABLED
Items/Window: 5
Window: 10 minutes
Cooldown: 2 seconds

Filters: Videos only
Max Size: 2000 MB
Daily Limit: 100 items

Result: Very safe, ~7.5 items/hour
```

### Example 2: Balanced Transfer
```
Rate Limit: ENABLED
Items/Window: 10
Window: 10 minutes
Cooldown: 1 second

Filters: Photos + Videos
Max Size: No limit
Daily Limit: 200 items

Result: Fast & safe, ~15 items/hour
```

### Example 3: Speed Mode
```
Rate Limit: DISABLED
Speed: Fast (0.7s delay)

Filters: Everything
Max Size: No limit
Daily Limit: No limit

Result: Fastest, but risky
Not recommended for large transfers
```

---

## 🚨 Error Handling

### "FLOOD_WAIT" Error
```
Problem: Sending too fast
Solution: 
  - Increase cooldown (→ 3-5s)
  - Reduce items/window (→ 3-5)
  - Extend window (→ 15m)
  Bot auto-waits, then retries
```

### "Message editing failed"
```
Problem: Can't update status message
Solution:
  - Make sure rate limit is ENABLED
  - Restart bot: pm2 restart leech-control
  - Check bot.js has onStatusUpdate hook
```

### Transfer Stuck on Scanning
```
Problem: Takes forever to scan
Solution:
  - Check if large channel (500k+ messages)
  - Preview works? (tests scanning)
  - Increase patience or use smaller channel
```

---

## 📱 Commands Summary

| Command | Purpose |
|---------|---------|
| `/start` | Show main menu |
| `/menu` | Show menu (if lost) |
| `/whereami` | Check status & settings |

---

## 💾 State File Locations

```
state.json          ← Current config + progress
state.json.tmp      ← Temporary (during save)
.env               ← API credentials (keep secret!)
```

**Backup before experiments:**
```bash
cp state.json state.json.backup
```

---

## 🎯 Rate Limit Math

### How to Calculate

**Items per Window = X**
**Window = Y minutes**
**Items per Hour = (X / Y) × 60**

Examples:
```
5 items / 10 min → (5/10) × 60 = 30 items/hour
10 items / 10 min → (10/10) × 60 = 60 items/hour
20 items / 5 min → (20/5) × 60 = 240 items/hour
```

### Safe Ranges
```
Conservative:  5-10 items/hour (very safe)
Normal:       15-30 items/hour (safe)
Moderate:     30-60 items/hour (monitor)
Aggressive:   60+ items/hour (risky)
```

---

## 🔐 Security Checklist

- [ ] .env file has correct API credentials
- [ ] SESSION_STRING is set (from login.js)
- [ ] Rate limiting is ENABLED
- [ ] Daily limit is set (200-500 recommended)
- [ ] First 50 items scanned without errors
- [ ] No "FLOOD_WAIT" messages
- [ ] State.json backs up automatically

---

## 📈 Monitoring During Transfer

### Check Every 30 Minutes
```
Send: /whereami

Look for:
✅ Status: running (not stuck)
✅ Sent count increasing
❌ Failed count not growing
❌ No FLOOD_WAIT errors
```

### If Problems Occur
```
1. Send: /whereami (check status)
2. Pause: Menu → ⏸ Pause
3. Investigate: Check logs
4. Resume: Menu → ▶️ Resume
```

### Safe Interrupt
```
To safely stop:
Menu → ⏹ Stop → ✅ Confirm

Progress is saved. Can resume later:
Menu → 🚀 Start Transfer (resumes from where it stopped)
```

---

## 🚀 Performance Tips

1. **Use Rate Limiting** - More stable
2. **Start Conservative** - Increase speed gradually
3. **Monitor First 100** - Check for errors early
4. **Set Daily Limit** - Extra safety
5. **Backup state.json** - Save progress
6. **Use Same Session** - Don't restart userbot

---

## 🆘 Quick Fixes

```
Bot not starting?
→ Check .env has all values
→ Run: node login.js
→ Copy SESSION_STRING to .env

No messages updating?
→ Restart: pm2 restart leech-control
→ Check rate limit is ON

Transfer too slow?
→ Increase items/window
→ Reduce cooldown
→ Extend time window

Transfer too fast (risk)?
→ Reduce items/window
→ Increase cooldown
→ Reduce window minutes
```

---

**Tip**: Keep rate limit ENABLED for the safest, most predictable transfers! ⚡
