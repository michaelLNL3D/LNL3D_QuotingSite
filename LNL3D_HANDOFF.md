# LNL3D Quote System — Claude Code Handoff Document

## Project Overview

This is a **3D printing quote management system** built for LNL3D Solutions. It started as an Excel workbook (`.xlsm`) and was rebuilt as a standalone single-file web app (`LNL3D_Quote.html`). Both versions exist and are maintained in parallel.

The web app is a self-contained HTML file (~1MB) with no external dependencies except Google Fonts. It uses vanilla JS, stores data in `localStorage`, and exports/imports JSON backups.

---

## Files in This Project

| File | Description |
|------|-------------|
| `LNL3D_Quote.html` | Main web app — single file, open in any browser |
| `LNL3D_Quote.xlsm` | Excel macro-enabled workbook (parallel version) |
| `LNL3D_Quotes_YYYY-MM-DD.json` | JSON data backup (exported from the app) |

---

## Web App Architecture

### Structure
Single HTML file containing:
- **CSS** (~500 lines) — dark navy theme using CSS variables, Google Fonts (Syne, DM Sans, DM Mono)
- **HTML** — 4 tab panels + modals
- **JavaScript** (~1200 lines) — all logic inline, no frameworks

### Color Palette (CSS variables)
```css
--bg: #0d1117        /* main background */
--bg2: #161b22       /* card background */
--bg3: #21262d       /* elevated surfaces */
--accent: #1a6fde    /* primary blue */
--accent2: #388bfd   /* lighter blue */
--green: #3fb950     /* profit/success */
--yellow: #d29922    /* warning */
--red: #f85149       /* danger/loss */
--navy: #1a1a2e      /* dark navy (matches Excel) */
--navy2: #0f3460     /* accent navy */
--orange: #ff9f43    /* quoted price highlight */
```

### Fonts
- **Syne** — headings, bold UI labels, logo text
- **DM Sans** — body text, form labels
- **DM Mono** — monetary values, serial numbers, code

### Tabs
1. **Dashboard** (`#tab-dashboard`) — stats cards, recent quotes, status breakdown, top materials
2. **New Quote** (`#tab-quote`) — full form with live sidebar calculation
3. **Quote Log** (`#tab-log`) — searchable/filterable table of all logged quotes
4. **Settings** (`#tab-settings`) — shop rates, discount tiers, printers, materials

---

## Data Model

### `state.settings` object
```json
{
  "company": "LNL3D",
  "energy": 0.26,
  "skilled_labor": 22.0,
  "postprocess_labor": 22.0,
  "base_fail": 0.10,
  "max_fail": 0.50,
  "min_markup": 1.20,
  "min_fee": 5.00,
  "currency": "$",
  "next_serial": 1,
  "discounts": [
    {"qty": 0,    "markup": 2.4},
    {"qty": 50,   "markup": 2.0},
    {"qty": 100,  "markup": 1.8},
    {"qty": 500,  "markup": 1.6},
    {"qty": 1000, "markup": 1.4},
    {"qty": 5000, "markup": 1.3}
  ],
  "printers": [
    {"name": "Tenlog TL-D3", "price": 600, "life": 4000, "service": 250, "energy": 0.11}
  ],
  "materials": [
    {"name": "PLA+", "complexity": 1, "spool_price": 20, "spool_kg": 1, "density": 1.24},
    {"name": "PETG", "complexity": 3, "spool_price": 25, "spool_kg": 1, "density": 1.19}
  ]
}
```

### Quote entry object (stored in `state.quotes[]`)
```json
{
  "serial": 1,
  "quote_id": "001-20260320-DAN",
  "logged_at": "2026-03-20T12:00:00.000Z",
  "customer": "Daniel Alvarez",
  "project": "Drone Frame v2",
  "description": "Fan Motor Mount",
  "date": "2026-03-20",
  "expiry": "2026-04-19",
  "status": "Quoting",
  "rush": "1.0",
  "notes": "",
  "printer": "Tenlog TL-D3",
  "filament": "PETG",
  "weight_g": 78.85,
  "print_time": "5:47",
  "complexity": 2,
  "quantity": 8,
  "quoted_price": 0,
  "support_filament": "",
  "support_weight_g": 0,
  "prep_model": 0,
  "prep_slice": 0,
  "post_remove": 2,
  "post_support": 5,
  "post_extra": 0,
  "fin_sand": 0,
  "fin_paint": 0,
  "fin_hardware": 0,
  "fin_other": 0,
  "ship_pack": 0,
  "ship_cost": 0,
  "consumables": 0,
  "calc_cost_pp": 9.50,
  "calc_suggested": 182.47,
  "calc_margin": 0.583,
  "calc_profit": 106.44
}
```

### localStorage keys
- `lnl3d_settings` — serialized settings object
- `lnl3d_quotes` — serialized quotes array

---

## Calculation Engine

The core function is `calcFromQuoteData(q)`. Here is the exact logic:

### Step 1 — Parse inputs
```js
const weightKg   = q.weight_g / 1000;
const printH     = parseTime(q.print_time);  // handles "5:47" and "5.78"
const complexity = parseFloat(q.complexity);
const qty        = Math.max(parseInt(q.quantity), 1);
const rush       = parseFloat(q.rush);
const prepMin    = parseFloat(q.prep_model) + parseFloat(q.prep_slice);
const postMin    = parseFloat(q.post_remove) + parseFloat(q.post_support) + parseFloat(q.post_extra);
const finishing  = fin_sand + fin_paint + fin_hardware + fin_other;
const shipping   = ship_pack + ship_cost;
```

### Step 2 — Material & machine costs
```js
const filamentCost = weightKg * (mat.spool_price / mat.spool_kg);
const suppCost     = suppWeightKg * (suppMat.spool_price / suppMat.spool_kg);
const deprRate     = (prt.price + prt.service) / prt.life;
const elecCost     = printH * prt.energy * settings.energy;
const deprCost     = printH * deprRate;
```

### Step 3 — Failure rate
```js
const fail = Math.min(
  settings.base_fail + ((complexity + mat.complexity) / 2) * settings.base_fail,
  settings.max_fail
);
// Example: PETG (complexity=3), model complexity=2
// fail = 0.10 + ((2+3)/2 * 0.10) = 0.35 (35%)
```

### Step 4 — Machine cost per piece (fail-adjusted)
```js
const machinePP = (filamentCost + suppCost + elecCost + deprCost + consumables) * (1 + fail);
```

### Step 5 — Labor cost per piece
```js
const prepLabor = (prepMin / 60) * settings.skilled_labor;
const postLabor = (postMin / 60) * settings.postprocess_labor;
const prepPP    = (prepLabor * (1 + fail/4)) / qty;  // amortized, lightly fail-adjusted
const postPP    = postLabor * (1 + fail);              // per-piece, fully fail-adjusted
const laborPP   = prepPP + postPP;
```

### Step 6 — Finishing & shipping (NOT fail-adjusted)
```js
const finPP  = finishing / qty;
const shipPP = shipping / qty;
```

### Step 7 — Cost per piece (NO min_fee floor here)
```js
const costPP = machinePP + laborPP + finPP + shipPP;
// IMPORTANT: do NOT apply min_fee to costPP — it's a price floor, not a cost floor
```

### Step 8 — Markup & suggested price
```js
const baseMarkup = getMarkupForQty(qty);
const markup     = baseMarkup * rush;
const suggested  = Math.max(costPP * qty * markup, settings.min_fee);
```

### Step 9 — Pricing schedule (per tier)
```js
const tCostPP  = machinePP + (prepLabor*(1+fail/4))/tQty + postPP + finishing/tQty + shipping/tQty;
const tTotal   = Math.max(tCostPP * tMkup * tQty, settings.min_fee);
const tPricePP = tTotal / tQty;
```

### Verified test case
```
Input:  PETG, Tenlog TL-D3, 78.85g, 5:47, complexity=2, qty=8, rush=1.0
        prep=0min, post=7min (2 remove + 5 support)
Output: cost/pc=$9.5039, suggested=$182.47, margin=58.3%, profit=$106.44
```

---

## Bugs Fixed — Do Not Re-introduce

### BUG 1: Min fee applied as cost floor (CRITICAL)
**Wrong:** `costPP = Math.max(costPP, min_fee / qty)`
**Right:** `costPP = machinePP + laborPP + finPP + shipPP` — no floor on cost
**Apply min_fee only to:** `suggested = Math.max(costPP * qty * markup, min_fee)`
This caused all material comparison prices to show the same value (e.g. all $12.00).

### BUG 2: Same bug in pricing schedule tiers
Fixed to: `tTotal = Math.max(tCostPP * tMkup * tQty, min_fee)`, then `tPricePP = tTotal / tQty`.

### BUG 3: Finishing/shipping missing from suggested price
`costPP` was only `machinePP + laborPP`. Fixed to include `+ finPP + shipPP`.

### BUG 4: Post-support default was 0 instead of 5
`setFormData` used `q.post_support || 0`. Changed to `q.post_support !== undefined ? q.post_support : 5`.

### BUG 5: JSON export not working in some browsers
Must append anchor to DOM before clicking:
```js
document.body.appendChild(a);
a.click();
setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 500);
```

---

## PDF / Customer Quote

### Shown to customer
- Logo + Quote ID + Date
- Customer, Project Title, Description
- Status, Valid Until, Rush, Quantity
- Material + Total Print Time (print_time × quantity)
- Pricing schedule (qty tiers, unit price, total — NO margin %)
- Material Options comparison (all materials at quoted qty)
- Final quoted/suggested price + per-unit price
- Expiry and tax disclaimer footer

### NOT in PDF (internal only)
- Cost to produce, profit margins, failure rates, cost breakdown

### PDF save
Sets `document.title` to quote ID before `window.print()` so browser uses it as default filename.

---

## Excel Workbook

### Sheets
| Sheet | Purpose |
|-------|---------|
| Quote | Main input/calculation |
| Quantity Discounts | Markup tier table |
| Printers | Printer specs |
| Materials | Material specs |
| General | Global settings + next serial (B12) |
| Customer Quote | Customer-facing printable quote |
| Quote Log | 37-column log (stores all inputs for reload) |

### VBA Macros (paste into Module1)
1. **LogQuote** — logs quote, increments serial, clears form
2. **ReloadQuote** — repopulates form from serial number
3. **UpdateQuote** — overwrites log row with current form values

### Critical Excel packaging fix
openpyxl writes colors as `00XXXXXX` (transparent alpha). Must fix after every save:
```python
re.sub(r'rgb="00([0-9A-Fa-f]{6})"', r'rgb="FF\1"', styles_xml)
```
Also fix relationship paths from `/xl/worksheets/` to `worksheets/`.

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Single HTML file | Zero install, shareable, works offline |
| localStorage | No backend needed |
| Finishing/shipping NOT fail-adjusted | Failed prints don't consume paint/packaging |
| Consumables ARE fail-adjusted | Used per print attempt |
| Prep amortized across qty | One-time setup cost |
| Post per-piece | Each piece needs individual processing |
| min_fee on total price only | Business floor, not a cost component |
| Rush on markup only | Doesn't increase material cost |
| All materials in comparison | Dynamic — pulls from settings |

---

## Suggested Next Steps

1. **Refactor to multi-file** — separate HTML/CSS/JS files
2. **Failure rate improvement** — current formula starts too high at low complexity. Better: `fail = base_fail + ((complexity + fil_complexity - 2) / 18) * (max_fail - base_fail)` gives 10% minimum instead of 20%
3. **Finishing/shipping pass-through option** — some shops prefer not to mark these up
4. **Inline status updates** — click status badge in log to change without reloading
5. **Backend/sync** — Express + SQLite for multi-user
6. **Email PDF** — open mail client with PDF attached
7. **Quote templates** — save common job types as templates

---

## Company Info

- **Company:** LNL3D Solutions™
- **Logo:** PNG with transparent background (black bg removed via luminance masking)
- **Brand colors:** Blue (#1a6fde), Yellow/Gold (#d29922), Cyan (#39d0d8), Grey

---

*Generated from a ~6 hour Claude.ai development session building the LNL3D quote system from scratch.*
