# Devmate Rules - Energy Tracker

Guidelines for AI assistants working on this project.

## Project Overview

This is a **single-file HTML application** for tracking household electricity usage. Keep it simple - no build tools, no frameworks.

## Key Constraints

### Technical
- **Single file**: All code lives in `index.html` (HTML, CSS, JavaScript)
- **No frameworks**: Pure vanilla JavaScript only
- **ApexCharts**: Use version 3.45.1 from CDN
- **Google APIs**: OAuth 2.0 + Sheets API v4

### Data
- **Spreadsheet ID is hard-coded**: Never create new sheets
- **localStorage fallback**: Always handle offline gracefully
- **Date format**: ISO 8601 (`YYYY-MM-DD`)
- **Time format**: 24-hour (`HH:MM`)
- **Date display**: Day first (UK format, e.g., "25 Feb" not "Feb 25")
- **Billing period**: Dynamic, cycles on the 17th of each month
- **API key**: Removed — OAuth-only (no API key in client code)

### User Context
- **Location**: London, UK
- **Currency**: GBP (£) - ensure proper encoding
- **Tariff**: £0.25/kWh + £0.4482/day standing charge
- **Target**: 30 kWh/day
- **Solar**: Active from 2026-02-06

## Coding Standards

### JavaScript
```javascript
// Use clear function names
function addReading() { }
function calculateBill() { }
function renderChart() { }

// Always validate user input
if (newReading < previousReading) {
    alert('Reading must be >= previous');
    return;
}

// Handle errors gracefully
try {
    await syncToSheets(data);
} catch (error) {
    console.error('Sync failed:', error);
    // Fall back to localStorage
}
```

### CSS
```css
/* Use CSS variables for theming */
:root {
    --primary: #06b6d4;
    --success: #059669;
    --warning: #f59e0b;
    --danger: #dc2626;
}

/* Mobile-first responsive design */
@media (max-width: 1024px) {
    .grid-layout { grid-template-columns: 1fr; }
}
```

### HTML
```html
<!-- Always include UTF-8 meta -->
<meta charset="UTF-8">

<!-- Use semantic elements -->
<main>
    <section id="entry-form">...</section>
    <section id="history">...</section>
</main>
```

## Deployment Checklist

Before pushing to GitHub:

1. [ ] Test locally in browser
2. [ ] Verify emojis display correctly: ⚡📊☀️
3. [ ] Verify pound symbol: £25.50
4. [ ] Check Google Sheets sync works
5. [ ] Test on mobile viewport

## Common Pitfalls

### Character Encoding
❌ **Wrong**: Upload binary file via git
✅ **Right**: Create/edit in GitHub web interface for UTF-8 safety

### Infinite Scroll
❌ **Wrong**: Let history table grow unbounded
✅ **Right**: Use `max-height` with `overflow-y: auto`

### Date Comparison
❌ **Wrong**: `date === '2026-02-06'` (timezone issues)
✅ **Right**: `date >= '2026-02-06'` (string comparison works for ISO dates)

## File Locations

| File | Purpose |
|------|---------|
| `index.html` | Main application (deploy to GitHub) |
| `PROJECT_CONTEXT.md` | Full documentation |
| `CHANGELOG.md` | Version history |
| `devmate-rules.md` | This file |

## Quick Reference

### Google Cloud Config
- Project ID: `energy-tracker-486718`
- Client ID: `531203228430-94fbaf0bc30tkp211gvac6ihbk4cc1do.apps.googleusercontent.com`
- Spreadsheet ID: `1jVuwWya6E68qc3GnKiXRKnqwBD2wIpdVU-XE1KFPW-4`
- API Key: **Removed** (OAuth handles auth, no key needed)

### Color Coding
- 🟢 Green (`#059669`): ≤30 kWh (under target)
- 🟡 Amber (`#f59e0b`): 30-35 kWh (slightly over)
- 🔴 Red (`#dc2626`): >35 kWh (over target)

### Billing
- Period: 17th to 17th monthly
- Unit rate: £0.25/kWh
- Standing charge: £0.4482/day
