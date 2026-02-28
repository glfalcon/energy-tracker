# ⚡ Energy Tracker

A single-page web application for monitoring daily household electricity usage.

## 🔗 Quick Links

- **Live App**: https://glfalcon.github.io/energy-tracker/
- **GitHub Repo**: https://github.com/glfalcon/energy-tracker
- **Full Documentation**: [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md)

## 🎯 Features

- ✅ Daily meter reading entry with validation
- ✅ Google Sheets sync for data persistence
- ✅ Bill estimation with projections
- ✅ Usage visualization with Chart.js
- ✅ Color-coded usage indicators (green/amber/red)
- ✅ 7-day rolling average statistics
- ✅ Countdown timer for next entry
- ✅ Responsive design

## 📊 User Settings

| Setting | Value |
|---------|-------|
| Location | London, UK |
| Tariff | British Gas |
| Unit Rate | £0.25/kWh |
| Standing Charge | £0.4482/day |
| Usage Target | 30 kWh/day |
| Billing Cycle | 17th to 17th |
| Solar Panels | Active from 6 Feb 2026 |

## 🛠️ Tech Stack

- Pure HTML/CSS/JavaScript
- Chart.js 4.4.1
- Google Sheets API
- Google OAuth 2.0
- GitHub Pages hosting

## 📁 Project Files

```
Energy Tracker/
├── README.md              # This file
├── PROJECT_CONTEXT.md     # Full project documentation
├── index.html             # Main application file
├── CHANGELOG.md           # Version history
└── devmate-rules.md       # AI assistant guidelines
```

## 🚀 Deployment

```bash
# Standard deploy
git add index.html
git commit -m "Description"
git push origin main

# UTF-8 safe deploy (for emojis)
git -c core.quotepath=false commit -m "Update"
git -c i18n.commitEncoding=utf-8 push origin main
```

## 📋 Backlog

1. ☀️ Solar Panel Indicator - badge for solar days
2. 📜 Scroll/Layout Refinement
3. 🌤️ Weather Integration
4. 🔋 Battery SoC Tracking
5. 📊 Export & Reporting

## 🐛 Known Issues

- ⚠️ Layout needs fine-tuning for 50+ entries
- ⚠️ OAuth token expires periodically

---

*Last Updated: 8 February 2026*
