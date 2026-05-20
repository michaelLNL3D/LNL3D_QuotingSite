# Combined Cost + Price + Tax View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing 2-column "Customer Charges (Tax Summary)" card and matching drawer section with a 3-column table that shows raw cost, customer price (× markup), and tax in one consolidated view.

**Architecture:** Extend `taxBreakdown` (computed at runtime in `calcFromQuoteData()`) to carry parallel `raw` and `price` sub-objects per group (taxable / nonTaxable). Rebuild the sidebar card body and drawer section to render a 3-column grid (label / cost / price). Anchoring rules preserved: `price.taxable.subtotal = taxableSubtotal`, `price.nonTaxable.subtotal = suggested − taxableSubtotal` (silently absorbs `min_fee` floor).

**Tech Stack:** Single-page HTML/JS/CSS (`LNL3D_Quote.html`), Docker deployment via `docker compose`, no test framework — verification is browser console + visual inspection.

**Spec:** `docs/superpowers/specs/2026-05-20-combined-tax-cost-view-design.md`

**Note on TDD:** This codebase has no automated test suite. Verification at each task is **manual console-based invariant checks** in DevTools using `calcFromQuoteData(getFormData())`. Each task ends with the operator opening the browser, running a console snippet, and confirming output. Frequent commits between tasks.

---

## File Map

All changes are to a single file: `/Users/michael/Documents/Claude_Projects/LNL3D_QuotingSite/LNL3D_Quote.html`

| Region | Approx. line | Responsibility |
|---|---|---|
| CSS block | ~L800-ish (find `.cost-row { ... }`) | Add `.cost-row-3col` and `.cost-row-3col-header` |
| Sidebar tax card | L1103–L1135 | Rebuild card body with 3-col rows |
| `calcFromQuoteData()` taxBreakdown | L2098–L2125 | Extend with `raw` + `price` sub-objects |
| `calcQuote()` populate | L2417–L2440 | Set new `*-raw` and `*-price` IDs |
| Drawer `showQuickView()` | L2733–L2750 | Use new `row3col()` helper for category rows |

Pattern file: `/Users/michael/.mex/patterns/add-custom-line-items-and-tax.md` — append updated breakdown gotcha.

ROUTER state: `/Users/michael/.mex/ROUTER.md` — update Tax Summary bullet.

---

## Task 1: Extend `taxBreakdown` data model

**Files:**
- Modify: `LNL3D_Quote.html:2098-2125` (the `taxBreakdown` construction)
- Modify: `LNL3D_Quote.html:~2690-2691` (exportCSV reader migration)

- [ ] **Step 1: Read current `taxBreakdown` construction**

Open `LNL3D_Quote.html` and locate the comment `// Tax breakdown — post-markup, customer-facing (bookkeeping view)` (~L2098). The block ends with the closing `};` after `grandTotal: suggestedWithTax,`.

- [ ] **Step 2: Replace the `taxBreakdown` construction**

Replace this block:

```js
  // Tax breakdown — post-markup, customer-facing (bookkeeping view)
  const customNonTaxable = customTotal - customTaxable;

  // Raw category totals (used to derive post-markup per-category lines)
  const _rawTaxMachine   = machinePP * qty;
  const _rawTaxFinishing = finishing;
  const _rawTaxShipping  = shipTaxable ? shipping : 0;
  const _rawTaxCustom    = customTaxable;
  const _rawNontaxLabor  = laborPP * qty;
  const _rawNontaxShip   = shipTaxable ? 0 : shipping;
  const _rawNontaxCustom = customNonTaxable;

  const taxBreakdown = {
    // What the customer is charged, per category (raw × markup)
    taxable: {
      machine:   _rawTaxMachine   * markup,
      finishing: _rawTaxFinishing * markup,
      shipping:  _rawTaxShipping  * markup,
      custom:    _rawTaxCustom    * markup,
      subtotal:  taxableSubtotal,                        // = taxableCostPP × qty × markup
    },
    nonTaxable: {
      labor:     _rawNontaxLabor  * markup,
      shipping:  _rawNontaxShip   * markup,
      custom:    _rawNontaxCustom * markup,
      subtotal:  suggested - taxableSubtotal,            // absorbs min_fee floor → non-taxable
    },
    tax:       taxAmount,
    grandTotal: suggestedWithTax,
  };
```

With this:

```js
  // Tax breakdown — both raw cost and post-markup price per category
  const customNonTaxable = customTotal - customTaxable;

  // Raw category totals (pre-markup)
  const _rawTaxMachine   = machinePP * qty;
  const _rawTaxFinishing = finishing;
  const _rawTaxShipping  = shipTaxable ? shipping : 0;
  const _rawTaxCustom    = customTaxable;
  const _rawNontaxLabor  = laborPP * qty;
  const _rawNontaxShip   = shipTaxable ? 0 : shipping;
  const _rawNontaxCustom = customNonTaxable;

  const _rawTaxSubtotal    = _rawTaxMachine + _rawTaxFinishing + _rawTaxShipping + _rawTaxCustom;
  const _rawNontaxSubtotal = _rawNontaxLabor + _rawNontaxShip + _rawNontaxCustom;

  const taxBreakdown = {
    taxable: {
      raw: {
        machine:   _rawTaxMachine,
        finishing: _rawTaxFinishing,
        shipping:  _rawTaxShipping,
        custom:    _rawTaxCustom,
        subtotal:  _rawTaxSubtotal,
      },
      price: {
        machine:   _rawTaxMachine   * markup,
        finishing: _rawTaxFinishing * markup,
        shipping:  _rawTaxShipping  * markup,
        custom:    _rawTaxCustom    * markup,
        subtotal:  taxableSubtotal,                      // = taxableCostPP × qty × markup (authoritative)
      },
    },
    nonTaxable: {
      raw: {
        labor:     _rawNontaxLabor,
        shipping:  _rawNontaxShip,
        custom:    _rawNontaxCustom,
        subtotal:  _rawNontaxSubtotal,
      },
      price: {
        labor:     _rawNontaxLabor  * markup,
        shipping:  _rawNontaxShip   * markup,
        custom:    _rawNontaxCustom * markup,
        subtotal:  suggested - taxableSubtotal,          // absorbs min_fee floor → non-taxable
      },
    },
    tax:       taxAmount,
    grandTotal: suggestedWithTax,
  };
```

- [ ] **Step 2b: Migrate exportCSV() reader**

In `exportCSV()` (~L2690), update the two lines that read `taxBreakdown` to use the new `.price.subtotal` paths:

```js
const taxableSales    = calc.taxBreakdown ? calc.taxBreakdown.taxable.price.subtotal.toFixed(2)    : '0.00';
const nonTaxableSales = calc.taxBreakdown ? calc.taxBreakdown.nonTaxable.price.subtotal.toFixed(2) : '0.00';
```

(Caught in code-quality review of commit 92e5253 — the old flat `.taxable.subtotal` path no longer exists after the raw/price refactor.)

- [ ] **Step 3: Verify the data model in browser console**

Build and run:

```bash
cd /Users/michael/Documents/Claude_Projects/LNL3D_QuotingSite && docker compose build && docker compose up -d
```

Open `http://localhost:3000`, open DevTools console, paste:

```js
const c = calcFromQuoteData(getFormData());
const tb = c.taxBreakdown;
console.log('Has raw paths?', !!tb.taxable.raw && !!tb.nonTaxable.raw);
console.log('Has price paths?', !!tb.taxable.price && !!tb.nonTaxable.price);
console.log('Raw × markup ≈ price (machine):',
  (tb.taxable.raw.machine * c.markup).toFixed(4), '===', tb.taxable.price.machine.toFixed(4));
console.log('Price subtotal = taxableSubtotal:',
  tb.taxable.price.subtotal.toFixed(4), '===', (c.taxableSubtotal ?? '(n/a)'));
```

Expected: all three lines log `true` / equal values. The card UI will be broken (existing populate code reads `tb.taxable.machine` which no longer exists) — that's expected and fixed in Task 4.

- [ ] **Step 4: Commit**

```bash
cd /Users/michael/Documents/Claude_Projects/LNL3D_QuotingSite
git add LNL3D_Quote.html
git commit -m "feat(tax): extend taxBreakdown with raw/price sub-objects

Prepares the data model for the combined cost+price+tax view.
Old flat paths (taxable.machine, etc.) replaced by nested
taxable.raw.machine / taxable.price.machine. UI populate code
updated in a later task — sidebar card is temporarily broken
between this commit and Task 4."
```

---

## Task 2: Add 3-column row CSS

**Files:**
- Modify: `LNL3D_Quote.html` (CSS block — search for `.cost-row {` and add new rules after that class definition)

- [ ] **Step 1: Locate the `.cost-row` CSS definition**

Search the file for `.cost-row {` (it's the existing 2-col grid for the sidebar cost cards). The match will look like:

```css
.cost-row { display:grid; grid-template-columns: 1fr auto; ... }
```

- [ ] **Step 2: Add new classes immediately after `.cost-row` (and its modifier classes like `.cost-row.total`, `.cost-row.highlight`)**

Insert this CSS block after the last `.cost-row*` rule:

```css
.cost-row-3col { display:grid; grid-template-columns: 1fr auto auto; gap:12px; align-items:center; padding:4px 12px; font-size:12px; }
.cost-row-3col .cost-row-value { text-align:right; min-width:60px; }
.cost-row-3col.total { font-weight:600; border-top:1px solid var(--border); padding-top:6px; margin-top:2px; }
.cost-row-3col-header { display:grid; grid-template-columns: 1fr auto auto; gap:12px; padding:4px 12px 2px; font-size:10px; color:var(--text3); text-transform:uppercase; letter-spacing:0.5px; }
.cost-row-3col-header span:nth-child(2), .cost-row-3col-header span:nth-child(3) { text-align:right; min-width:60px; }
```

- [ ] **Step 3: Verify CSS loads without breaking the rest of the page**

Reload `http://localhost:3000` (no docker rebuild needed — static file served directly by node), confirm the page renders normally (other cards still look right). Open DevTools, inspect `<head>` for any CSS parse errors in the console.

- [ ] **Step 4: Commit**

```bash
git add LNL3D_Quote.html
git commit -m "feat(tax): add 3-col CSS for combined tax/cost view"
```

---

## Task 3: Rebuild sidebar tax card HTML

**Files:**
- Modify: `LNL3D_Quote.html:1103-1135` (the `<div class="cost-preview" id="tax-breakdown-card">` block)

- [ ] **Step 1: Replace the entire tax breakdown card HTML**

Locate `<!-- Tax Breakdown (hidden when tax_rate = 0) -->` and replace the entire `<div class="cost-preview" id="tax-breakdown-card" ...>...</div>` block (through the closing `</div>` of that card) with:

```html
      <!-- Tax Breakdown (hidden when tax_rate = 0) -->
      <div class="cost-preview" id="tax-breakdown-card" style="display:none">
        <div class="cost-preview-header">Customer Charges (Tax Summary)</div>

        <!-- Column headers -->
        <div class="cost-row-3col-header">
          <span></span><span>Cost</span><span>Price</span>
        </div>

        <!-- Taxable group -->
        <div class="cost-row" style="background:var(--bg3)">
          <span class="cost-row-label" style="font-weight:700;text-transform:uppercase;font-size:10px;letter-spacing:.6px">Taxable</span>
          <span></span>
        </div>
        <div class="cost-row-3col"><span>Machine</span><span class="cost-row-value" id="b-tax-machine-raw">$0.00</span><span class="cost-row-value" id="b-tax-machine-price">$0.00</span></div>
        <div class="cost-row-3col"><span>Finishing</span><span class="cost-row-value" id="b-tax-fin-raw">$0.00</span><span class="cost-row-value" id="b-tax-fin-price">$0.00</span></div>
        <div class="cost-row-3col" id="b-tax-ship-row"><span>Shipping</span><span class="cost-row-value" id="b-tax-ship-raw">$0.00</span><span class="cost-row-value" id="b-tax-ship-price">$0.00</span></div>
        <div class="cost-row-3col" id="b-tax-custom-row"><span>Custom Items</span><span class="cost-row-value" id="b-tax-custom-raw">$0.00</span><span class="cost-row-value" id="b-tax-custom-price">$0.00</span></div>
        <div class="cost-row-3col total"><span>Taxable Subtotal</span><span class="cost-row-value" id="b-tax-total-raw">$0.00</span><span class="cost-row-value green" id="b-tax-total-price">$0.00</span></div>

        <!-- Non-Taxable group -->
        <div class="cost-row" style="background:var(--bg3);border-top:2px solid var(--border2)">
          <span class="cost-row-label" style="font-weight:700;text-transform:uppercase;font-size:10px;letter-spacing:.6px">Non-Taxable</span>
          <span></span>
        </div>
        <div class="cost-row-3col"><span>Labor</span><span class="cost-row-value" id="b-nontax-labor-raw">$0.00</span><span class="cost-row-value" id="b-nontax-labor-price">$0.00</span></div>
        <div class="cost-row-3col" id="b-nontax-ship-row"><span>Shipping</span><span class="cost-row-value" id="b-nontax-ship-raw">$0.00</span><span class="cost-row-value" id="b-nontax-ship-price">$0.00</span></div>
        <div class="cost-row-3col" id="b-nontax-custom-row"><span>Custom Items</span><span class="cost-row-value" id="b-nontax-custom-raw">$0.00</span><span class="cost-row-value" id="b-nontax-custom-price">$0.00</span></div>
        <div class="cost-row-3col total"><span>Non-Taxable Subtotal</span><span class="cost-row-value" id="b-nontax-total-raw">$0.00</span><span class="cost-row-value" id="b-nontax-total-price">$0.00</span></div>

        <!-- Tax + Grand Total (2-col, no raw equivalent) -->
        <div class="cost-row" style="border-top:2px solid var(--border2)">
          <span class="cost-row-label">Tax</span>
          <span class="cost-row-value" id="b-tax-collected">$0.00</span>
        </div>
        <div class="cost-row highlight" style="background:var(--green3)">
          <span class="cost-row-label" style="color:var(--green);font-weight:700">Grand Total</span>
          <span class="cost-row-value green" id="b-grand-total" style="font-size:14px;font-weight:700">$0.00</span>
        </div>
      </div>
```

Note: old IDs `b-tax-machine`, `b-tax-fin`, `b-tax-ship`, `b-tax-custom`, `b-tax-total`, `b-nontax-labor`, `b-nontax-ship`, `b-nontax-custom`, `b-nontax-total` are removed in this commit. They are replaced by `*-raw` / `*-price` pairs. Tax row keeps `b-tax-collected` and Grand Total keeps `b-grand-total` (these had no raw counterpart).

- [ ] **Step 2: Verify the markup renders structurally**

Reload `http://localhost:3000`. The card will still be hidden (`tax-breakdown-card` style `display:none` and existing JS only shows it when `tax > 0`). To force-show for visual inspection:

```js
document.getElementById('tax-breakdown-card').style.display = '';
```

Expected: three columns visible (label / Cost / Price), all values showing `$0.00` (because populate code in `calcQuote()` is still reading old IDs). Column headers "COST" and "PRICE" visible above the Taxable group.

- [ ] **Step 3: Commit**

```bash
git add LNL3D_Quote.html
git commit -m "feat(tax): rebuild sidebar tax card as 3-col cost+price table

Card body now shows label/cost/price per category. Old IDs
(b-tax-machine, b-nontax-labor, etc.) replaced by *-raw/*-price
pairs. Populate code wired up in next task."
```

---

## Task 4: Update `calcQuote()` populate logic

**Files:**
- Modify: `LNL3D_Quote.html:2417-2440` (the `if (tb) { ... }` block inside `calcQuote()`)

- [ ] **Step 1: Replace the populate block**

Locate the block starting `  const tb = c.taxBreakdown;` (~L2420). Replace it through the closing `}` (the line right before `setText('p-quoted', ...`) with:

```js
  const tb = c.taxBreakdown;
  if (tb) {
    // Taxable group: raw + price per category
    setText('b-tax-machine-raw',  cur(tb.taxable.raw.machine));
    setText('b-tax-machine-price',cur(tb.taxable.price.machine));
    setText('b-tax-fin-raw',      cur(tb.taxable.raw.finishing));
    setText('b-tax-fin-price',    cur(tb.taxable.price.finishing));
    setText('b-tax-ship-raw',     cur(tb.taxable.raw.shipping));
    setText('b-tax-ship-price',   cur(tb.taxable.price.shipping));
    setText('b-tax-custom-raw',   cur(tb.taxable.raw.custom));
    setText('b-tax-custom-price', cur(tb.taxable.price.custom));
    setText('b-tax-total-raw',    cur(tb.taxable.raw.subtotal));
    setText('b-tax-total-price',  cur(tb.taxable.price.subtotal));

    // Non-Taxable group: raw + price per category
    setText('b-nontax-labor-raw', cur(tb.nonTaxable.raw.labor));
    setText('b-nontax-labor-price',cur(tb.nonTaxable.price.labor));
    setText('b-nontax-ship-raw',  cur(tb.nonTaxable.raw.shipping));
    setText('b-nontax-ship-price',cur(tb.nonTaxable.price.shipping));
    setText('b-nontax-custom-raw',cur(tb.nonTaxable.raw.custom));
    setText('b-nontax-custom-price',cur(tb.nonTaxable.price.custom));
    setText('b-nontax-total-raw', cur(tb.nonTaxable.raw.subtotal));
    setText('b-nontax-total-price',cur(tb.nonTaxable.price.subtotal));

    // Tax + Grand Total (no raw counterpart)
    setText('b-tax-collected',    cur(tb.tax));
    setText('b-grand-total',      cur(tb.grandTotal));

    // Hide zero-value optional rows (gating on PRICE side; raw and price are zero together
    // since price = raw × markup and markup is non-zero)
    const toggle = (id, val) => { const el = document.getElementById(id); if (el) el.style.display = val > 0 ? '' : 'none'; };
    toggle('b-tax-ship-row',     tb.taxable.price.shipping);
    toggle('b-tax-custom-row',   tb.taxable.price.custom);
    toggle('b-nontax-ship-row',  tb.nonTaxable.price.shipping);
    toggle('b-nontax-custom-row',tb.nonTaxable.price.custom);
  }
```

Note: visibility toggle on `*-row` IDs hides via `display:none`. Because these rows now use `.cost-row-3col` (grid display), the `display:none` from inline style overrides the `display:grid` from CSS — works fine.

- [ ] **Step 2: Reload and verify against Sofie's quote**

Load Sofie's saved quote (Quote Log → click Cherry Quote → Edit). The sidebar card should populate. In console:

```js
const c = calcFromQuoteData(getFormData());
const tb = c.taxBreakdown;
console.table({
  'Machine':   { raw: tb.taxable.raw.machine,   price: tb.taxable.price.machine },
  'Finishing': { raw: tb.taxable.raw.finishing, price: tb.taxable.price.finishing },
  'TaxSub':    { raw: tb.taxable.raw.subtotal,  price: tb.taxable.price.subtotal },
  'Labor':     { raw: tb.nonTaxable.raw.labor,  price: tb.nonTaxable.price.labor },
  'NonTaxSub': { raw: tb.nonTaxable.raw.subtotal,price: tb.nonTaxable.price.subtotal },
  'Tax':       { raw: '—', price: tb.tax },
  'Grand':     { raw: '—', price: tb.grandTotal },
});
console.log('Invariant 1 (raw×markup=price machine):',
  (tb.taxable.raw.machine * c.markup).toFixed(2), '===', tb.taxable.price.machine.toFixed(2));
console.log('Invariant 2 (price subtotals sum to suggested):',
  (tb.taxable.price.subtotal + tb.nonTaxable.price.subtotal).toFixed(2), '===', c.suggested.toFixed(2));
console.log('Invariant 3 (grand = suggested + tax):',
  tb.grandTotal.toFixed(2), '===', (c.suggested + tb.tax).toFixed(2));
```

Expected output for Sofie:
- Machine raw $155.57, price $373.36
- Finishing raw $60.00, price $144.00
- TaxSub raw $215.57, price $517.36
- Labor raw $37.06, price $88.95
- NonTaxSub raw $37.06, price $88.95
- Tax $45.27, Grand $651.58
- All three invariants pass.

Also visually confirm: Shipping rows hidden (Sofie has no shipping), Custom rows hidden.

- [ ] **Step 3: Commit**

```bash
git add LNL3D_Quote.html
git commit -m "feat(tax): wire 3-col cost+price table to taxBreakdown

Sidebar card now displays raw cost and post-markup price
side-by-side per category, with subtotals, tax, and grand total.
Optional rows (shipping, custom) auto-hide at zero."
```

---

## Task 5: Update drawer view to 3-column

**Files:**
- Modify: `LNL3D_Quote.html:2733-2747` (the `${c.taxAmount > 0 && c.taxBreakdown ? ...}` block inside `showQuickView()`)
- Modify: `LNL3D_Quote.html` — find the `row()` helper inside `showQuickView` (a few lines above the section we're modifying) and add a new `row3col()` helper next to it

- [ ] **Step 1: Locate the `row()` helper inside `showQuickView()`**

Scroll up from L2733. There should be a definition like:

```js
const row = (label, value, cls='') => `<div class="drawer-row"><span class="drawer-row-label">${label}</span><span class="drawer-row-value ${cls}">${value}</span></div>`;
```

If the structure differs (e.g. it's a multi-line definition or uses different markup), preserve its style when adding `row3col`.

- [ ] **Step 2: Add `row3col()` helper next to `row()`**

Insert immediately after the `row()` definition:

```js
const row3col = (label, raw, price, priceCls='') => `<div class="drawer-row" style="display:grid;grid-template-columns:1fr auto auto;gap:12px;align-items:center"><span class="drawer-row-label">${label}</span><span class="drawer-row-value" style="min-width:60px;text-align:right">${raw}</span><span class="drawer-row-value ${priceCls}" style="min-width:60px;text-align:right">${price}</span></div>`;
```

- [ ] **Step 3: Replace the drawer tax breakdown block**

Replace this existing block (L2733–L2747):

```js
    ${c.taxAmount > 0 && c.taxBreakdown ? `
    <div class="drawer-section">
      <div class="drawer-section-label">Customer Charges (Tax Summary)</div>
      <div style="font-size:10px;color:var(--text3);padding:2px 0 6px;text-transform:uppercase;letter-spacing:.5px">Taxable</div>
      ${row('Machine',     cur2d(c.taxBreakdown.taxable.machine))}
      ${row('Finishing',   cur2d(c.taxBreakdown.taxable.finishing))}
      ${c.taxBreakdown.taxable.shipping > 0 ? row('Shipping', cur2d(c.taxBreakdown.taxable.shipping)) : ''}
      ${c.taxBreakdown.taxable.custom   > 0 ? row('Custom Items', cur2d(c.taxBreakdown.taxable.custom)) : ''}
      ${row('Taxable Subtotal', cur2d(c.taxBreakdown.taxable.subtotal), 'green')}
      <div style="font-size:10px;color:var(--text3);padding:8px 0 6px;text-transform:uppercase;letter-spacing:.5px;border-top:1px solid var(--border);margin-top:6px">Non-Taxable</div>
      ${row('Labor', cur2d(c.taxBreakdown.nonTaxable.labor))}
      ${c.taxBreakdown.nonTaxable.shipping > 0 ? row('Shipping', cur2d(c.taxBreakdown.nonTaxable.shipping)) : ''}
      ${c.taxBreakdown.nonTaxable.custom   > 0 ? row('Custom Items', cur2d(c.taxBreakdown.nonTaxable.custom)) : ''}
      ${row('Non-Taxable Subtotal', cur2d(c.taxBreakdown.nonTaxable.subtotal))}
      ${row(`Tax (${(c.taxRate*100).toFixed(1)}%)`, cur2d(c.taxBreakdown.tax))}
      ${row('Grand Total', cur2d(c.taxBreakdown.grandTotal), 'green')}
    </div>` : ''}
```

With this:

```js
    ${c.taxAmount > 0 && c.taxBreakdown ? `
    <div class="drawer-section">
      <div class="drawer-section-label">Customer Charges (Tax Summary)</div>
      <div style="display:grid;grid-template-columns:1fr auto auto;gap:12px;padding:2px 0;font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">
        <span></span><span style="text-align:right;min-width:60px">Cost</span><span style="text-align:right;min-width:60px">Price</span>
      </div>
      <div style="font-size:10px;color:var(--text3);padding:4px 0 4px;text-transform:uppercase;letter-spacing:.5px">Taxable</div>
      ${row3col('Machine',     cur2d(c.taxBreakdown.taxable.raw.machine),   cur2d(c.taxBreakdown.taxable.price.machine))}
      ${row3col('Finishing',   cur2d(c.taxBreakdown.taxable.raw.finishing), cur2d(c.taxBreakdown.taxable.price.finishing))}
      ${c.taxBreakdown.taxable.price.shipping > 0 ? row3col('Shipping',     cur2d(c.taxBreakdown.taxable.raw.shipping), cur2d(c.taxBreakdown.taxable.price.shipping)) : ''}
      ${c.taxBreakdown.taxable.price.custom   > 0 ? row3col('Custom Items', cur2d(c.taxBreakdown.taxable.raw.custom),   cur2d(c.taxBreakdown.taxable.price.custom))   : ''}
      ${row3col('Taxable Subtotal', cur2d(c.taxBreakdown.taxable.raw.subtotal), cur2d(c.taxBreakdown.taxable.price.subtotal), 'green')}
      <div style="font-size:10px;color:var(--text3);padding:8px 0 4px;text-transform:uppercase;letter-spacing:.5px;border-top:1px solid var(--border);margin-top:6px">Non-Taxable</div>
      ${row3col('Labor', cur2d(c.taxBreakdown.nonTaxable.raw.labor), cur2d(c.taxBreakdown.nonTaxable.price.labor))}
      ${c.taxBreakdown.nonTaxable.price.shipping > 0 ? row3col('Shipping',     cur2d(c.taxBreakdown.nonTaxable.raw.shipping), cur2d(c.taxBreakdown.nonTaxable.price.shipping)) : ''}
      ${c.taxBreakdown.nonTaxable.price.custom   > 0 ? row3col('Custom Items', cur2d(c.taxBreakdown.nonTaxable.raw.custom),   cur2d(c.taxBreakdown.nonTaxable.price.custom))   : ''}
      ${row3col('Non-Taxable Subtotal', cur2d(c.taxBreakdown.nonTaxable.raw.subtotal), cur2d(c.taxBreakdown.nonTaxable.price.subtotal))}
      ${row(`Tax (${(c.taxRate*100).toFixed(1)}%)`, cur2d(c.taxBreakdown.tax))}
      ${row('Grand Total', cur2d(c.taxBreakdown.grandTotal), 'green')}
    </div>` : ''}
```

- [ ] **Step 4: Verify drawer renders correctly**

Open the Quote Log tab → click "👁 Quick view" on Sofie's quote. Confirm the drawer "Customer Charges (Tax Summary)" section shows:
- Column headers "Cost" / "Price" right-aligned above
- Machine row: Cost $155.57, Price $373.36
- Finishing row: Cost $60.00, Price $144.00
- Taxable Subtotal: Cost $215.57, Price $517.36 (price in green)
- Labor row: Cost $37.06, Price $88.95
- Non-Taxable Subtotal: Cost $37.06, Price $88.95
- Tax (8.8%): $45.27 (2-col, value right-aligned)
- Grand Total: $651.58 in green

Numbers must match the sidebar exactly.

- [ ] **Step 5: Commit**

```bash
git add LNL3D_Quote.html
git commit -m "feat(tax): mirror 3-col cost+price view in drawer

Drawer Customer Charges section now shows raw cost and
post-markup price side-by-side, matching the sidebar."
```

---

## Task 6: Full deploy + invariant verification

**Files:** none (verification only)

- [ ] **Step 1: Rebuild and redeploy**

```bash
cd /Users/michael/Documents/Claude_Projects/LNL3D_QuotingSite && docker compose build && docker compose up -d
```

Verify container is running:

```bash
docker compose ps
```

Expected: `lnl3d-quotes` Up, port 3000 mapped.

- [ ] **Step 2: Math invariants (Sofie quote)**

Load Sofie's quote, run in console:

```js
const c = calcFromQuoteData(getFormData());
const tb = c.taxBreakdown;
const checks = [
  ['Machine raw × markup = price', (tb.taxable.raw.machine * c.markup).toFixed(4), tb.taxable.price.machine.toFixed(4)],
  ['Finishing raw × markup = price', (tb.taxable.raw.finishing * c.markup).toFixed(4), tb.taxable.price.finishing.toFixed(4)],
  ['Labor raw × markup = price', (tb.nonTaxable.raw.labor * c.markup).toFixed(4), tb.nonTaxable.price.labor.toFixed(4)],
  ['Taxable price subtotal = taxableSubtotal', tb.taxable.price.subtotal.toFixed(4), c.taxableSubtotal?.toFixed?.(4) ?? 'n/a'],
  ['Price subtotals sum to suggested', (tb.taxable.price.subtotal + tb.nonTaxable.price.subtotal).toFixed(4), c.suggested.toFixed(4)],
  ['Tax = taxable.price.subtotal × rate', (tb.taxable.price.subtotal * c.taxRate).toFixed(4), tb.tax.toFixed(4)],
  ['Grand = suggested + tax', tb.grandTotal.toFixed(4), (c.suggested + tb.tax).toFixed(4)],
];
checks.forEach(([name, a, b]) => console.log(a === b ? '✓' : '✗', name, ':', a, '===', b));
```

Expected: all 7 lines start with `✓`.

- [ ] **Step 3: Tax-off case**

Settings → set tax_rate to 0 → save. Return to a quote. Confirm:
- Sidebar `tax-breakdown-card` is hidden
- Drawer's "Customer Charges (Tax Summary)" section absent for any quote
- Set tax_rate back to 8.75%, save.

- [ ] **Step 4: Shipping toggle case**

Open a quote, add ship_cost=$15, markup will be 2.4× by default. With `ship_taxable=true` (Settings):
- Sidebar Taxable Shipping row visible: Cost $15.00, Price $36.00
- Sidebar Non-Taxable Shipping row hidden

Toggle `ship_taxable=false` in Settings, reload:
- Sidebar Taxable Shipping row hidden
- Sidebar Non-Taxable Shipping row visible: Cost $15.00, Price $36.00

Restore `ship_taxable=true`.

- [ ] **Step 5: Min-fee floor case**

Settings → set `min_fee=2000` → save. Use a small quote (e.g., the existing Sara Kim quote — costPP × qty × markup ≈ $14, well below $2000):
- `suggested` = $2000
- `taxableSubtotal` unchanged (computed from raw × markup, no floor)
- Non-Taxable Subtotal Price ≠ Labor Price (much larger — absorbs the floor)
- Tax = `taxableSubtotal × rate` (NOT bumped by floor)
- Grand Total = $2000 + tax

Console check:

```js
const c2 = calcFromQuoteData(getFormData());
const tb2 = c2.taxBreakdown;
const lineSum = (tb2.nonTaxable.price.labor + tb2.nonTaxable.price.shipping + tb2.nonTaxable.price.custom);
console.log('Non-tax subtotal differs from line sum (min_fee floor):',
  tb2.nonTaxable.price.subtotal.toFixed(2), '!=', lineSum.toFixed(2),
  '(diff:', (tb2.nonTaxable.price.subtotal - lineSum).toFixed(2), ')');
console.log('Suggested = min_fee:', c2.suggested.toFixed(2), '=== 2000.00');
```

Expected: subtotal much larger than line sum, suggested = 2000.00.

Restore `min_fee=5`.

- [ ] **Step 6: PDF + email regression check**

Open the PDF preview modal on Sofie's quote → confirm no "Cost / Price" columns leak into customer-facing pages (PDF Quote Summary should look identical to before).

Click "📧 Email" → confirm the copied email text has no raw-cost lines, no "Customer Charges (Tax Summary)" wording.

- [ ] **Step 7: Commit if any tweaks were needed during verification**

If any fixes happened during verification:

```bash
git add LNL3D_Quote.html
git commit -m "fix(tax): [describe the fix]"
```

Otherwise skip.

---

## Task 7: Update `.mex` pattern and ROUTER

**Files:**
- Modify: `/Users/michael/.mex/patterns/add-custom-line-items-and-tax.md`
- Modify: `/Users/michael/.mex/ROUTER.md`

- [ ] **Step 1: Update the pattern gotcha**

In `add-custom-line-items-and-tax.md`, find the existing "Breakdown pattern" gotcha (last bullet under "Key Gotchas"). Replace it with:

```markdown
- **Breakdown pattern**: operator-facing tax breakdowns go in sidebar as a `.cost-preview` card + drawer as a `drawer-section`. Both are gated on `c.taxAmount > 0`. The card uses a **3-column layout** (`.cost-row-3col`): label / raw cost / post-markup price. `taxBreakdown` returned by `calcFromQuoteData()` carries parallel `raw` and `price` sub-objects per group: `taxable.raw.machine` / `taxable.price.machine`, etc. Subtotals are anchored to authoritative computed values: `price.taxable.subtotal = taxableSubtotal` (= `taxableCostPP × qty × markup`), `price.nonTaxable.subtotal = suggested − taxableSubtotal` — NOT summed from per-category price lines, because that would miss the `min_fee` floor adjustment (which silently folds into non-taxable). `raw.*.subtotal` is summed from raw lines (no floor in raw cost world). The breakdown object also carries `tax` and `grandTotal`. Tax + Grand Total rows are 2-col (no raw counterpart). `taxBreakdown` is computed at runtime and never persisted. Optional rows (shipping, custom) hide at zero via `display:none` on `*-row` IDs (sidebar) or ternary omission (drawer). PDF/email surfaces skip breakdowns — they are customer-facing.
```

- [ ] **Step 2: Update ROUTER state bullet**

In `ROUTER.md`, replace the "Customer Charges (Tax Summary)" bullet under "Working:" with:

```markdown
- **Customer Charges (Tax Summary)**: operator-facing 3-column card in sidebar + matching section in drawer showing each category as label / raw cost / post-markup price; Taxable group (machine, finishing, shipping if enabled, taxable custom items) and Non-Taxable group (labor, non-taxable shipping, non-taxable custom items) each with subtotals, plus Tax and Grand Total rows; hidden when `taxRate=0`; optional rows (shipping, custom) auto-hide when zero; `taxBreakdown` returned from `calcFromQuoteData()` with parallel `raw`/`price` sub-objects (runtime only, not persisted); CSV exports include `Taxable Sales` and `Non-Taxable Sales` columns (price side only)
```

- [ ] **Step 3: Commit the .mex changes**

```bash
cd /Users/michael/.mex
git add patterns/add-custom-line-items-and-tax.md ROUTER.md 2>/dev/null || true
# If .mex is not a git repo, skip git commands silently.
git diff --cached --stat 2>/dev/null && git commit -m "docs(patterns): update tax breakdown pattern for 3-col cost+price view" 2>/dev/null || echo "(.mex not a git repo or no changes — skipping commit)"
```

---

## Self-Review Notes

**Spec coverage:**
- ✅ Data model with `raw`/`price` parallel sub-objects → Task 1
- ✅ CSS 3-col grid → Task 2
- ✅ Sidebar card rebuild → Task 3
- ✅ `calcQuote()` populate → Task 4
- ✅ Drawer mirror → Task 5
- ✅ Min-fee floor invariant preserved (anchor to `taxableSubtotal` / `suggested − taxableSubtotal`) → Task 1 code
- ✅ Tax-off, shipping toggle, min-fee verification → Task 6 Steps 3/4/5
- ✅ Pattern doc + ROUTER update → Task 7

**Placeholder scan:** no TBDs, no "implement appropriately", every code step has the exact code.

**Type consistency:** field paths used in Task 4 populate (`tb.taxable.raw.machine`, `tb.taxable.price.machine`, `tb.nonTaxable.raw.labor`, etc.) match the data model defined in Task 1. IDs in Task 3 HTML (`b-tax-machine-raw`, `b-tax-machine-price`) match Task 4 `setText` calls. Drawer paths in Task 5 also match. The `exportCSV()` reader (Task 1 Step 2b) was caught in code-quality review of commit 92e5253 and migrated from the old flat `.taxable.subtotal` / `.nonTaxable.subtotal` paths to `.taxable.price.subtotal` / `.nonTaxable.price.subtotal`.

**Risk note:** Task 1 leaves the sidebar UI broken (old IDs no longer populated) until Task 4 is committed. If executing in subagent mode, the build will technically run between tasks but the card will display `$0.00` everywhere — not a regression, just an in-flight state. The card is also gated on `tax > 0` so most quotes won't even show it.
