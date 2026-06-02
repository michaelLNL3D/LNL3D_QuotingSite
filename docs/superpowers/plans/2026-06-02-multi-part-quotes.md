# Multi-Part Quotes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one quote hold several printed parts — fill the print form, click "Add Part" to push it into a parts list (clearing the form for the next), and produce a combined quote whose total is the sum of each part's independently-calculated price plus shared shipping/custom items and tax.

**Architecture:** Approach B — a parts layer over the existing engine. Each part is the per-part subset of `getFormData()`. The quote total is computed by calling the existing `calcFromQuoteData()` once per part (with new opt-in flags that skip the quote-level min-fee floor, shipping, and custom items) and aggregating. Quotes with fewer than 2 parts call the existing unchanged single-part path, so all current quotes price identically. No data migration.

**Tech Stack:** Single-page HTML/JS/CSS (`LNL3D_Quote.html`), Docker via `docker compose`. No automated test framework.

**Spec:** `docs/superpowers/specs/2026-06-02-multi-part-quotes-design.md`

**Note on TDD:** This codebase has no automated JS test suite, and introducing one (the engine reads global `state.settings` and the DOM) is out of scope and risky for a live app. Per the established house pattern (see `2026-05-20-combined-tax-cost-view.md`), each task ends with **manual console-based invariant checks** in DevTools plus visual confirmation. Commit between tasks.

---

## ⚠️ Task 0: Confirm the one pricing-policy decision (no code)

Multi-part quotes (2+ parts) introduce one rule with no existing behavior to match: **how shipping and custom items are priced when they're shared across parts.**

- **This plan's choice:** shipping (`ship_pack + ship_cost`) and `custom_items` are added to the multi-part total **at face value (markup ×1.0)**. Their taxable portions still enter the tax base per the existing `ship_taxable` flag and each item's `taxable` flag. Each *part's* own price is still fully marked up by that part's markup as today.
- **Why:** shipping is a pass-through cost and custom items are explicit dollar charges the operator typed in; marking them up across a whole multi-part job is surprising. Single-part quotes are untouched (they keep today's behavior, where shipping/custom flow through the part markup).

- [ ] **Step 1:** Confirm with the user that face-value shipping/custom on multi-part quotes is acceptable. If they want shipping/custom marked up instead, adjust `calcQuoteParts()` in Task 3 to multiply `shipping`/`customTotal` by a chosen markup before summing. **Do not start Task 1 until confirmed.**

---

## File Map

All code changes are in one file:
`/Users/michael/Documents/Claude_Projects/LNL3D_QuotingSite/LNL3D_Quote.html`

| Region | Anchor | Responsibility |
|---|---|---|
| New constants + buffer | after `let customItemsBuffer = [];` (~L4423) | `PART_FIELDS`, `extractPart`, `getQuoteParts`, `partsBuffer`, `editingPartIndex` |
| `calcFromQuoteData(q)` | `function calcFromQuoteData(q)` (~L2047) | Add `opts` param: `noFloor`, `noShipping`, `noCustom` |
| New `calcQuoteParts` | after `calcFromQuoteData` returns (~L2218) | Aggregate per-part calcs into a quote total |
| HTML: Add-Part UI | after Notes group in print form (~L962) | "＋ Add Part" button + parts list container |
| Part buffer fns | near custom-items fns (~L4458) | `addPart`/`updatePart`/`editPart`/`removePart`/`renderPartsList` |
| `getFormData` / `setFormData` | ~L2301 / ~L2337 | Round-trip `parts` through the buffer |
| `clearQuoteForm` | ~L2432 | Clear parts buffer on new quote |
| `calcQuote` | ~L2447 | Show quote total from aggregate when multi-part |
| `logQuote` | ~L2556 | Persist `parts` on the saved quote |
| `showQuickView` (drawer) | ~L2764 | Itemized parts section |
| PDF render | `renderPDFModal` / price block (~L3580) | Itemized part lines + total |
| Email | `copyEmailQuote` (~L4004) | Itemized part lines + total |
| `exportCSV` | ~L2718 | Add `Parts` count column |

Docs to update at the end: `/Users/michael/.mex/ROUTER.md`, `/Users/michael/.mex/patterns/INDEX.md`, new `/Users/michael/.mex/patterns/add-multi-part-quotes.md`.

---

## Task 1: Part field constants, extraction, and buffer state

**Files:**
- Modify: `LNL3D_Quote.html` — after `let customItemsBuffer = [];` (~L4423)

- [ ] **Step 1: Add constants and helpers**

Find `let customItemsBuffer = [];` and insert directly below it:

```js
/* ── Multi-Part Quotes ───────────────────────────────────────── */
// Per-part fields: the subset of getFormData() that describes ONE printed part.
// Everything NOT listed here (customer, project, description, date, expiry,
// status, ship_pack, ship_cost, custom_items) is quote-level / shared.
const PART_FIELDS = [
  'printer','filament','weight_g','print_time','complexity','quality',
  'quantity','quoted_price','support_filament','support_weight_g',
  'prep_model','prep_slice','post_remove','post_support','post_extra',
  'fin_sand','fin_paint','fin_hardware','fin_other','consumables',
  'rush','notes','part_name'
];

let partsBuffer = [];        // array of part objects for the quote being edited
let editingPartIndex = null; // null = adding new; number = editing that part in place

// Pick only the per-part fields from a form/quote-shaped object.
function extractPart(src) {
  const p = {};
  PART_FIELDS.forEach(k => { p[k] = src[k]; });
  return p;
}

// Return the parts of a saved quote. Back-compat: a quote with no parts[]
// is read as a single implicit part synthesized from its flat fields.
function getQuoteParts(q) {
  if (Array.isArray(q.parts) && q.parts.length) return q.parts;
  return [extractPart(q)];
}

// Human label for a part in lists.
function partLabel(p, i) {
  return (p.part_name && p.part_name.trim())
    ? p.part_name.trim()
    : `Part ${i + 1}`;
}
```

- [ ] **Step 2: Verify in console**

Run the app (`docker compose up -d --build`, open the site), open DevTools console:

```js
extractPart({customer:'X', printer:'P', weight_g:5, ship_cost:9})
// Expected: object WITH printer & weight_g, WITHOUT customer or ship_cost
getQuoteParts({weight_g:5})
// Expected: array of length 1 (implicit single part)
getQuoteParts({parts:[{weight_g:1},{weight_g:2}]}).length
// Expected: 2
```

- [ ] **Step 3: Commit**

```bash
git add LNL3D_Quote.html
git commit -m "Add multi-part field constants and buffer state"
```

---

## Task 2: Add opt-in flags to `calcFromQuoteData`

Make the engine skippable on the three quote-level behaviors, with defaults that keep current behavior byte-identical.

**Files:**
- Modify: `LNL3D_Quote.html` — `function calcFromQuoteData(q)` (~L2047), the shipping line (~L2063), custom-items line (~L2095), and the `suggested` floor (~L2106).

- [ ] **Step 1: Add the opts parameter**

Change the signature:

```js
function calcFromQuoteData(q) {
```
to:
```js
function calcFromQuoteData(q, opts = {}) {
```

- [ ] **Step 2: Gate shipping**

Find:
```js
  const shipping   = (parseFloat(q.ship_pack||0) + parseFloat(q.ship_cost||0));
```
Replace with:
```js
  const shipping   = opts.noShipping ? 0 : (parseFloat(q.ship_pack||0) + parseFloat(q.ship_cost||0));
```

- [ ] **Step 3: Gate custom items**

Find:
```js
  const customItems   = Array.isArray(q.custom_items) ? q.custom_items : [];
```
Replace with:
```js
  const customItems   = (!opts.noCustom && Array.isArray(q.custom_items)) ? q.custom_items : [];
```

- [ ] **Step 4: Gate the min-fee floor**

Find:
```js
  const suggested = Math.max(costPP * qty * markup, s.min_fee);
```
Replace with:
```js
  const suggested = opts.noFloor ? (costPP * qty * markup) : Math.max(costPP * qty * markup, s.min_fee);
```

- [ ] **Step 5: Verify defaults are unchanged**

Console:
```js
const q = getFormData();
JSON.stringify(calcFromQuoteData(q)) === JSON.stringify(calcFromQuoteData(q, {}))
// Expected: true  (no-arg and empty-opts identical)
calcFromQuoteData(q, {noShipping:true}).shipping
// Expected: 0
```

- [ ] **Step 6: Commit**

```bash
git add LNL3D_Quote.html
git commit -m "Add noFloor/noShipping/noCustom opts to calcFromQuoteData"
```

---

## Task 3: `calcQuoteParts` aggregation function

**Files:**
- Modify: `LNL3D_Quote.html` — insert a new function immediately after `calcFromQuoteData`'s closing brace (~L2218, the line after `}` that follows `schedule, matComparison, qty, rush`).

- [ ] **Step 1: Add the aggregator**

```js
// Aggregate a multi-part quote. Returns a unified result object whose
// top-level price fields mirror calcFromQuoteData's shape so existing
// renderers can read .suggested / .taxAmount / .suggestedWithTax.
//
// quoteObj must carry quote-level fields (ship_pack, ship_cost, custom_items)
// and either a parts[] array or flat per-part fields (back-compat).
function calcQuoteParts(quoteObj) {
  const s = state.settings;
  const parts = getQuoteParts(quoteObj);

  // Single (or implicit single) part → exact existing behavior, untouched.
  if (parts.length < 2) {
    const merged = { ...quoteObj, ...parts[0] };   // part fields + quote-level fields
    const c = calcFromQuoteData(merged);
    return { multi: false, parts: [{ part: parts[0], calc: c, price: c.suggested }], calc: c };
  }

  // Multi-part: price each part with floor/shipping/custom suppressed.
  const perPart = parts.map((p, i) => {
    const c = calcFromQuoteData(p, { noFloor: true, noShipping: true, noCustom: true });
    return { part: p, index: i, calc: c, price: c.suggested };
  });

  const sumSuggested      = perPart.reduce((a, x) => a + x.calc.suggested, 0);
  const sumTaxableSubtotal= perPart.reduce((a, x) => a + x.calc.taxBreakdown.taxable.price.subtotal, 0);
  const sumCostTotal      = perPart.reduce((a, x) => a + x.calc.costTotal, 0);

  // Quote-level shipping + custom items, added at FACE VALUE (markup ×1.0).
  // See Task 0 for the policy rationale.
  const shipping    = parseFloat(quoteObj.ship_pack||0) + parseFloat(quoteObj.ship_cost||0);
  const customItems = Array.isArray(quoteObj.custom_items) ? quoteObj.custom_items : [];
  const customTotal   = customItems.reduce((a, it) => a + parseFloat(it.amount||0), 0);
  const customTaxable = customItems.reduce((a, it) => a + (it.taxable ? parseFloat(it.amount||0) : 0), 0);

  const taxRate     = parseFloat(s.tax_rate || 0);
  const shipTaxable = !!s.ship_taxable;

  // Floor applied ONCE at the quote level.
  const preTaxRaw = sumSuggested + shipping + customTotal;
  const suggested = Math.max(preTaxRaw, s.min_fee);

  // Tax base: per-part taxable subtotals + taxable shipping + taxable custom.
  const taxableSubtotal = sumTaxableSubtotal + (shipTaxable ? shipping : 0) + customTaxable;
  const taxAmount       = taxableSubtotal * taxRate;
  const suggestedWithTax= suggested + taxAmount;

  const quotedRaw = parseFloat(quoteObj.quoted_price || 0);
  const quoted    = quotedRaw > 0 ? quotedRaw : 0;
  const costTotal = sumCostTotal + shipping + customTotal;
  const totalProfit = (quoted > 0 ? quoted : suggested) - costTotal;

  return {
    multi: true,
    parts: perPart,
    calc: {
      suggested, taxRate, taxAmount, taxableSubtotal, suggestedWithTax,
      quoted, costTotal, totalProfit,
      shipping, customTotal, customTaxable,
    }
  };
}
```

- [ ] **Step 2: Verify aggregation math**

Console — build a 2-part quote and check the total equals the sum of independent part prices (no floor inflation), plus shipping:

```js
const base = getFormData();                       // current form as a part
const p1 = extractPart({ ...base, weight_g: 50, quantity: 1 });
const p2 = extractPart({ ...base, weight_g: 50, quantity: 1 });
const r  = calcQuoteParts({ ...base, ship_pack:0, ship_cost:10, custom_items:[], parts:[p1,p2] });
const solo = calcFromQuoteData({ ...base, ...p1, ship_pack:0, ship_cost:0, custom_items:[] }, {noFloor:true,noShipping:true,noCustom:true}).suggested;
Math.abs(r.calc.suggested - (Math.max(solo*2 + 10, state.settings.min_fee))) < 0.01
// Expected: true
r.multi
// Expected: true
calcQuoteParts(base).multi
// Expected: false  (single implicit part → legacy path)
```

- [ ] **Step 3: Commit**

```bash
git add LNL3D_Quote.html
git commit -m "Add calcQuoteParts multi-part aggregation"
```

---

## Task 4: Add-Part button + parts list HTML and CSS

**Files:**
- Modify: `LNL3D_Quote.html` — after the Notes form-group (`id="q-notes"` closes, ~L915) but the parts UI belongs after the full print form. Place it just before the `◉ Print Details` is fine, but cleanest is right after the Quantity/Quoted row (~L973). Use the anchor below.
- Modify: CSS block (search for `.form-row-custom-item`) to add part-row styling.

- [ ] **Step 1: Add the parts UI block**

Find the closing of the `form-row-2` that holds `q-qty` / `q-quoted` (the line `      </div>` immediately after the `q-quoted` hint at ~L973). Insert AFTER it:

```html
      <div class="form-section">▣ Parts in this Quote</div>
      <div id="parts-list-container"></div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button type="button" class="btn btn-secondary" id="add-part-btn" onclick="addPart()">＋ Add Part</button>
        <span class="form-hint" id="parts-hint" style="align-self:center">Add the part above to this quote, then enter the next one.</span>
      </div>
```

- [ ] **Step 2: Add CSS**

Find `.form-row-custom-item` in the `<style>` block and insert after its rule:

```css
.part-row { display:flex; align-items:center; gap:10px; padding:8px 10px; border:1px solid var(--border); border-radius:8px; margin-bottom:6px; background:var(--bg2); }
.part-row .part-row-name { font-weight:600; flex:1; }
.part-row .part-row-meta { color:var(--text3); font-size:12px; }
.part-row .part-row-price { font-variant-numeric:tabular-nums; font-weight:600; }
.part-row.editing { outline:2px solid var(--accent); }
```

- [ ] **Step 3: Verify**

Reload the app, open the Quote tab. Expected: a "Parts in this Quote" section with an empty list and a "＋ Add Part" button below the Quantity row. No console errors.

- [ ] **Step 4: Commit**

```bash
git add LNL3D_Quote.html
git commit -m "Add Add-Part button, parts list container, and CSS"
```

---

## Task 5: Part buffer functions (add / update / edit / remove / render)

**Files:**
- Modify: `LNL3D_Quote.html` — after `renderCustomItems()` closes (~L4458).

- [ ] **Step 1: Add the functions**

```js
function addPart() {
  const form = getFormData();
  // Validation: must have a printer and (weight or print time).
  const hasWeight = parseFloat(form.weight_g||0) > 0;
  const hasTime   = String(form.print_time||'').trim().length > 0;
  if (!form.printer || (!hasWeight && !hasTime)) {
    toast('Add a printer and a weight or print time before adding the part', 'error');
    return;
  }
  const part = extractPart(form);
  if (editingPartIndex !== null) {
    partsBuffer[editingPartIndex] = part;
    editingPartIndex = null;
  } else {
    partsBuffer.push(part);
  }
  clearPartFields();
  renderPartsList();
  calcQuote();
}

function editPart(i) {
  const p = partsBuffer[i];
  if (!p) return;
  editingPartIndex = i;
  // Load only the per-part fields into the form (keep quote-level fields intact).
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = (val ?? ''); };
  set('q-printer', p.printer); set('q-filament', p.filament);
  set('q-weight', p.weight_g||0); set('q-printtime', p.print_time);
  set('q-complexity', p.complexity||1); set('q-quality', p.quality||'Standard');
  set('q-qty', p.quantity||1); set('q-quoted', p.quoted_price||'');
  set('q-rush', p.rush||'1.0'); set('q-notes', p.notes);
  set('q-support-filament', p.support_filament||''); set('q-support-weight', p.support_weight_g||0);
  set('q-prep-model', p.prep_model||0); set('q-prep-slice', p.prep_slice||0);
  set('q-post-remove', p.post_remove!==undefined?p.post_remove:2);
  set('q-post-support', p.post_support!==undefined?p.post_support:5);
  set('q-post-extra', p.post_extra||0);
  set('q-fin-sand', p.fin_sand||0); set('q-fin-paint', p.fin_paint||0);
  set('q-fin-hardware', p.fin_hardware||0); set('q-fin-other', p.fin_other||0);
  set('q-consumables', p.consumables||0);
  renderPartsList();
  calcQuote();
}

function removePart(i) {
  partsBuffer.splice(i, 1);
  if (editingPartIndex === i) editingPartIndex = null;
  else if (editingPartIndex !== null && editingPartIndex > i) editingPartIndex--;
  renderPartsList();
  calcQuote();
}

// Clear only the per-part inputs (preserve customer/project/shipping/etc.).
function clearPartFields() {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  set('q-weight', 0); set('q-printtime', ''); set('q-complexity', 1);
  set('q-qty', 1); set('q-quoted', ''); set('q-rush', '1.0'); set('q-notes', '');
  set('q-support-filament', ''); set('q-support-weight', 0);
  set('q-prep-model', 0); set('q-prep-slice', 0);
  set('q-post-remove', 2); set('q-post-support', 5); set('q-post-extra', 0);
  set('q-fin-sand', 0); set('q-fin-paint', 0); set('q-fin-hardware', 0); set('q-fin-other', 0);
  set('q-consumables', 0);
  // printer/filament/quality keep their current selection for convenience.
}

function renderPartsList() {
  const container = document.getElementById('parts-list-container');
  if (!container) return;
  const btn = document.getElementById('add-part-btn');
  if (btn) btn.textContent = (editingPartIndex !== null) ? '✓ Update Part' : '＋ Add Part';
  if (!partsBuffer.length) { container.innerHTML = ''; return; }
  container.innerHTML = partsBuffer.map((p, i) => {
    const c = calcFromQuoteData(p, { noFloor:true, noShipping:true, noCustom:true });
    return `<div class="part-row ${editingPartIndex===i?'editing':''}">
      <span class="part-row-name">${escapeHtml(partLabel(p, i))}</span>
      <span class="part-row-meta">${escapeHtml(p.filament||'')} · ${p.weight_g||0}g · ×${p.quantity||1}</span>
      <span class="part-row-price">${cur(c.suggested)}</span>
      <button class="btn btn-ghost btn-sm" onclick="editPart(${i})">Edit</button>
      <button class="btn btn-danger btn-sm" onclick="removePart(${i})">✕</button>
    </div>`;
  }).join('');
}
```

- [ ] **Step 2: Verify**

Reload. Fill printer + weight, click **＋ Add Part** → part appears in list, form's weight/time clears. Add a second part. Click **Edit** on part 1 → its values load, button reads "✓ Update Part", row highlights; change weight, click → updates in place. Click **✕** → removes. No console errors.

- [ ] **Step 3: Commit**

```bash
git add LNL3D_Quote.html
git commit -m "Add part buffer functions: add/update/edit/remove/render"
```

---

## Task 6: Round-trip `parts` through getFormData / setFormData / clearQuoteForm

**Files:**
- Modify: `LNL3D_Quote.html` — `getFormData` (~L2333), `setFormData` (~L2355), `clearQuoteForm` (~L2432).

- [ ] **Step 1: Include parts in getFormData**

Find in `getFormData`:
```js
    custom_items:     customItemsBuffer.map(x => ({...x})),
  };
```
Replace with:
```js
    custom_items:     customItemsBuffer.map(x => ({...x})),
    parts:            partsBuffer.map(x => ({...x})),
  };
```

- [ ] **Step 2: Load parts in setFormData**

Find at the end of `setFormData`:
```js
  customItemsBuffer = Array.isArray(q.custom_items) ? q.custom_items.map(x => ({...x})) : [];
  renderCustomItems();
  calcQuote();
```
Replace with:
```js
  customItemsBuffer = Array.isArray(q.custom_items) ? q.custom_items.map(x => ({...x})) : [];
  renderCustomItems();
  partsBuffer = Array.isArray(q.parts) ? q.parts.map(x => ({...x})) : [];
  editingPartIndex = null;
  renderPartsList();
  calcQuote();
```

- [ ] **Step 3: Reset parts on new quote**

Find in `clearQuoteForm`, the line:
```js
  currentEditSerial = null;
```
Insert directly after it:
```js
  partsBuffer = [];
  editingPartIndex = null;
```

- [ ] **Step 4: Verify**

Console:
```js
partsBuffer = [{printer:'A',weight_g:10,quantity:1}];
getFormData().parts.length        // Expected: 1
setFormData({customer:'Z', parts:[{printer:'B',weight_g:5,quantity:2}]});
partsBuffer.length                // Expected: 1
document.getElementById('parts-list-container').children.length  // Expected: 1
clearQuoteForm(); partsBuffer.length  // Expected: 0
```

- [ ] **Step 5: Commit**

```bash
git add LNL3D_Quote.html
git commit -m "Round-trip parts[] through form get/set/clear"
```

---

## Task 7: Show the quote total in the sidebar when multi-part

When 2+ parts exist, the sidebar's suggested/total/tax should reflect the **aggregate**, not just the part currently in the form.

**Files:**
- Modify: `LNL3D_Quote.html` — `calcQuote()` (~L2447), near the top after `const c = calcFromQuoteData(q);`.

- [ ] **Step 1: Compute aggregate and override the headline figures**

Find:
```js
function calcQuote() {
  const q = getFormData();
  const c = calcFromQuoteData(q);
  const s = state.settings;
```
Replace with:
```js
function calcQuote() {
  const q = getFormData();
  const c = calcFromQuoteData(q);
  const s = state.settings;

  // Multi-part: override the headline price/tax/total with the quote aggregate.
  const agg = calcQuoteParts(q);
  const isMulti = agg.multi;
  const headline = isMulti ? agg.calc : c;
```

- [ ] **Step 2: Point the headline rows at `headline`**

Find these lines in `calcQuote`:
```js
  setText('p-suggested',   cur(c.suggested));
```
Replace with:
```js
  setText('p-suggested',   cur(headline.suggested));
```

Find:
```js
  if (taxRow) taxRow.style.display = c.taxAmount > 0 ? '' : 'none';
  if (totalTaxRow) totalTaxRow.style.display = c.taxAmount > 0 ? '' : 'none';
  setText('p-tax',         `${(c.taxRate*100).toFixed(1)}% — ${cur(c.taxAmount)}`);
  setText('p-total-tax',   cur(c.suggestedWithTax));
```
Replace with:
```js
  if (taxRow) taxRow.style.display = headline.taxAmount > 0 ? '' : 'none';
  if (totalTaxRow) totalTaxRow.style.display = headline.taxAmount > 0 ? '' : 'none';
  setText('p-tax',         `${(headline.taxRate*100).toFixed(1)}% — ${cur(headline.taxAmount)}`);
  setText('p-total-tax',   cur(headline.suggestedWithTax));
```

Find:
```js
  setText('p-quoted',      c.quoted > 0 ? cur(c.quoted) : '—');
  setText('p-profitpc',    cur(c.profitPP));
  setText('p-margin',      (c.margin*100).toFixed(1)+'%');
  setText('p-totalprofit', cur(c.totalProfit));
```
Replace with:
```js
  setText('p-quoted',      headline.quoted > 0 ? cur(headline.quoted) : '—');
  setText('p-profitpc',    cur(c.profitPP));
  setText('p-margin',      (c.margin*100).toFixed(1)+'%');
  setText('p-totalprofit', cur(headline.totalProfit));
```

- [ ] **Step 2b: Suppress the part-1 tax-breakdown card when multi-part**

The tax-breakdown card is populated from `c.taxBreakdown` (a single-part shape). On a multi-part quote it would show only the form part's breakdown, contradicting the aggregate headline. Hide it when multi.

Find:
```js
  const breakdownCard = document.getElementById('tax-breakdown-card');
  if (breakdownCard) breakdownCard.style.display = c.taxAmount > 0 ? '' : 'none';
```
Replace with:
```js
  const breakdownCard = document.getElementById('tax-breakdown-card');
  if (breakdownCard) breakdownCard.style.display = (!isMulti && c.taxAmount > 0) ? '' : 'none';
```

> Note: the per-part cost-breakdown rows (`p-filament`, `p-elec`, `p-prep`, pricing schedule, and material comparison) intentionally keep showing the **current form part** `c` — they are the working editor for the part you're entering. Only the headline price/total/tax reflect the whole quote, and the tax-breakdown card is hidden for multi-part (the itemized Parts list in the drawer/PDF carries the per-part detail instead).

- [ ] **Step 3: Verify**

Reload. Add 2 parts of known price. The **Suggested** and **Total w/ Tax** rows should show the combined quote total (sum of parts + shipping + tax), while the cost breakdown above still shows the part in the form. With 0–1 parts, figures match today's single-part behavior exactly.

Console cross-check:
```js
calcQuote();
document.getElementById('p-suggested').textContent
// Expected: equals cur(calcQuoteParts(getFormData()).calc.suggested)
```

- [ ] **Step 4: Commit**

```bash
git add LNL3D_Quote.html
git commit -m "Reflect multi-part quote total in sidebar headline"
```

---

## Task 8: Persist parts on save (`logQuote`)

`logQuote` already calls `getFormData()` (which now includes `parts`) and stores the result, so parts persist automatically. This task adds a safety mirror: when parts exist, copy part 1's per-part fields onto the flat quote object so any legacy reader still works, and store a `part_count`.

**Files:**
- Modify: `LNL3D_Quote.html` — `logQuote()` (~L2556), after `const c = calcFromQuoteData(q);`.

- [ ] **Step 1: Inspect how logQuote builds the stored object**

Read `logQuote` (~L2556–L2650). Locate where the new/updated quote object is assembled from `q` (the `getFormData()` result). Confirm `q` is spread into the stored quote (it carries `parts` now).

- [ ] **Step 2: Add the mirror + count just before the quote object is saved**

Immediately after `const c = calcFromQuoteData(q);` in `logQuote`, insert:

```js
  // Multi-part: mirror part 1's fields onto the flat quote for legacy readers,
  // and record the count. (No-op for single-part quotes.)
  if (Array.isArray(q.parts) && q.parts.length) {
    Object.assign(q, extractPart(q.parts[0]));
    q.part_count = q.parts.length;
  } else {
    q.part_count = 1;
  }
```

- [ ] **Step 3: Verify save + reload round-trip**

In the app: build a 2-part quote, fill customer + description, click **Log Quote**. Then in console:
```js
const saved = state.quotes[state.quotes.length-1];
saved.parts.length        // Expected: 2
saved.part_count          // Expected: 2
saved.weight_g            // Expected: equals saved.parts[0].weight_g (mirror)
```
Reload the page (server round-trip), reopen the quote via **Edit**, confirm `partsBuffer.length === 2` and the parts list shows both.

- [ ] **Step 4: Commit**

```bash
git add LNL3D_Quote.html
git commit -m "Persist parts[] and part_count on logged quotes"
```

---

## Task 9: Itemized parts in the quick-view drawer

The drawer's Financials block and tax-summary card read single-part fields
(`c.costPP`, `c.taxBreakdown`, `c.margin`, …). The aggregate shape omits those.
So: keep `c = calcFromQuoteData(q)` for all single-part detail rendering; drive
the Financials headline from a small adapter; suppress the per-part-shaped
sections when multi-part; add a Parts section.

**Files:**
- Modify: `LNL3D_Quote.html` — `showQuickView()` (~L2764–L2876).

- [ ] **Step 1: Compute aggregate + adapter at the top of showQuickView**

Find:
```js
  drawerSerial = serial;
  const c = calcFromQuoteData(q);
  const cur2d = v => cur(v);
```
Replace with:
```js
  drawerSerial = serial;
  const c = calcFromQuoteData(q);          // single-part shape (mirrored part 1) — drives detail rows
  const agg = calcQuoteParts(q);
  const isMulti = agg.multi;
  const quoteParts = getQuoteParts(q);
  const cur2d = v => cur(v);
  // Financials adapter: aggregate headline when multi, else the single-part calc.
  const fin = isMulti
    ? { costLabel:'Total Cost', cost:agg.calc.costTotal, suggested:agg.calc.suggested,
        taxAmount:agg.calc.taxAmount, taxRate:agg.calc.taxRate, suggestedWithTax:agg.calc.suggestedWithTax,
        margin: agg.calc.suggested>0 ? (agg.calc.suggested-agg.calc.costTotal)/agg.calc.suggested : 0,
        totalProfit:agg.calc.totalProfit }
    : { costLabel:'Cost / pc', cost:c.costPP, suggested:c.suggested,
        taxAmount:c.taxAmount, taxRate:c.taxRate, suggestedWithTax:c.suggestedWithTax,
        margin:c.margin, totalProfit:c.totalProfit };
```

- [ ] **Step 2: Point the Financials block at the adapter**

Find:
```js
      <div class="drawer-section-label">Financials</div>
      ${row('Cost / pc', cur2d(c.costPP))}
      ${row('Suggested', cur2d(c.suggested), 'green')}
      ${c.taxAmount > 0 ? row(`Tax (${(c.taxRate*100).toFixed(1)}%)`, cur2d(c.taxAmount)) : ''}
      ${c.taxAmount > 0 ? row('Total w/ Tax', cur2d(c.suggestedWithTax), 'green') : ''}
      ${row('Quoted Price', qprice > 0 ? cur2d(qprice) : '—', qprice > 0 ? 'orange' : '')}
      ${row('Margin', (c.margin*100).toFixed(1)+'%')}
      ${row('Profit', cur2d(c.totalProfit), c.totalProfit >= 0 ? 'green' : 'red')}
```
Replace with:
```js
      <div class="drawer-section-label">Financials</div>
      ${row(fin.costLabel, cur2d(fin.cost))}
      ${row('Suggested', cur2d(fin.suggested), 'green')}
      ${fin.taxAmount > 0 ? row(`Tax (${(fin.taxRate*100).toFixed(1)}%)`, cur2d(fin.taxAmount)) : ''}
      ${fin.taxAmount > 0 ? row('Total w/ Tax', cur2d(fin.suggestedWithTax), 'green') : ''}
      ${row('Quoted Price', qprice > 0 ? cur2d(qprice) : '—', qprice > 0 ? 'orange' : '')}
      ${row('Margin', (fin.margin*100).toFixed(1)+'%')}
      ${row('Profit', cur2d(fin.totalProfit), fin.totalProfit >= 0 ? 'green' : 'red')}
```

- [ ] **Step 3: Gate the part-1 tax-summary card on single-part only**

Find:
```js
    ${c.taxAmount > 0 && c.taxBreakdown ? `
    <div class="drawer-section">
      <div class="drawer-section-label">Customer Charges (Tax Summary)</div>
```
Replace the condition only:
```js
    ${!isMulti && c.taxAmount > 0 && c.taxBreakdown ? `
    <div class="drawer-section">
      <div class="drawer-section-label">Customer Charges (Tax Summary)</div>
```

- [ ] **Step 4: Add the Parts section + gate the single-part detail blocks**

Find the Print Details opening:
```js
    <div class="drawer-section">
      <div class="drawer-section-label">Print Details</div>
      ${row('Printer', q.printer||'—')}
```
Replace with (Parts section for multi; wrap Print Details so it only shows single-part):
```js
    ${isMulti ? `
    <div class="drawer-section">
      <div class="drawer-section-label">Parts (${quoteParts.length})</div>
      ${quoteParts.map((p, i) => {
        const pc = calcFromQuoteData(p, { noFloor:true, noShipping:true, noCustom:true });
        return `<div class="part-row">
          <span class="part-row-name">${escapeHtml(partLabel(p, i))}</span>
          <span class="part-row-meta">${escapeHtml(p.filament||'')} · ${p.weight_g||0}g · ×${p.quantity||1}</span>
          <span class="part-row-price">${cur(pc.suggested)}</span>
        </div>`;
      }).join('')}
    </div>` : `
    <div class="drawer-section">
      <div class="drawer-section-label">Print Details</div>
      ${row('Printer', q.printer||'—')}
```

Then find the end of the Labor section (the closing that precedes the Finishing block ~L2853):
```js
      ${row('Extra Post-Work', (q.post_extra||0)+'min')}
    </div>
```
Replace with (close the single-part ternary opened above):
```js
      ${row('Extra Post-Work', (q.post_extra||0)+'min')}
    </div>`}
```

> Result: single-part quotes render Print Details + Labor exactly as before; multi-part quotes show the itemized Parts list instead. Shipping, Custom Items, Notes, Status History, Revisions (all quote-level or shared) continue to render for both.

- [ ] **Step 5: Verify**

Open a 2-part quote's quick-view drawer. Expected: Financials shows aggregate Total Cost / Suggested / Tax / Total; a "Parts (2)" section lists each part with its price; no part-1 tax-summary card. Open a single-part (legacy) quote → renders exactly as before (Print Details, Labor, tax-summary card all present; no Parts section). No console errors / no `NaN`.

- [ ] **Step 6: Commit**

```bash
git add LNL3D_Quote.html
git commit -m "Show itemized parts + aggregate financials in quick-view drawer"
```

---

## Task 10: Itemized parts with prices on the PDF

`renderPDFModal` (~L3456) uses `const c = calcFromQuoteData(q);` and
`displayPrice = qp>0?qp:c.suggested` (~L3460), plus other `c.*` fields for the
summary. Use the **overlay-mutation** pattern: keep `c`, but when the quote is
multi-part, overwrite only its headline scalar fields with the aggregate. All
other `c.*` references (which describe the mirrored part 1) stay valid.

**Files:**
- Modify: `LNL3D_Quote.html` — `renderPDFModal()` (~L3456–L3460) and the Quote Summary price block.

- [ ] **Step 1: Overlay aggregate headline onto `c`**

Find (the first two lines of `renderPDFModal`):
```js
function renderPDFModal(q) {
  const c = calcFromQuoteData(q);
```
Replace with:
```js
function renderPDFModal(q) {
  const c = calcFromQuoteData(q);
  const _pdfParts = getQuoteParts(q);
  const _pdfAgg = calcQuoteParts(q);
  if (_pdfAgg.multi) {
    // Headline totals reflect the whole quote; detail fields keep part-1 values.
    c.suggested        = _pdfAgg.calc.suggested;
    c.taxAmount        = _pdfAgg.calc.taxAmount;
    c.suggestedWithTax = _pdfAgg.calc.suggestedWithTax;
    c.taxableSubtotal  = _pdfAgg.calc.taxableSubtotal;
  }
```

- [ ] **Step 2: Insert an itemized parts table into the Quote Summary page**

Read the Quote Summary HTML in `renderPDFModal` and find the price/total block (it uses `displayPrice` / `c.suggested`). Directly ABOVE that price block, insert (renders only for 2+ parts):
```js
  ${_pdfParts.length > 1 ? `
    <table class="pdf-parts-table" style="width:100%;border-collapse:collapse;margin:10px 0">
      <thead><tr>
        <th style="text-align:left;border-bottom:1px solid #ccc;padding:4px">Part</th>
        <th style="text-align:center;border-bottom:1px solid #ccc;padding:4px">Qty</th>
        <th style="text-align:right;border-bottom:1px solid #ccc;padding:4px">Price</th>
      </tr></thead>
      <tbody>
      ${_pdfParts.map((p, i) => {
        const pc = calcFromQuoteData(p, { noFloor:true, noShipping:true, noCustom:true });
        return `<tr>
          <td style="padding:4px">${escapeHtml(partLabel(p, i))}</td>
          <td style="text-align:center;padding:4px">${p.quantity||1}</td>
          <td style="text-align:right;padding:4px">${cur(pc.suggested)}</td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>` : ''}
```

> If shipping or custom items are present on a multi-part quote, they are already included in `c.suggested` (the aggregate total) shown in the price block below the table.

- [ ] **Step 4: Verify**

Open a 2-part quote → **PDF**. The Quote Summary page shows a Part / Qty / Price table with both parts, and the total below equals the sum + shipping + tax. Single-part quote PDF is unchanged. Generate the PDF via the print/Puppeteer path and confirm it renders (no layout break).

- [ ] **Step 5: Commit**

```bash
git add LNL3D_Quote.html
git commit -m "Add itemized parts table to PDF Quote Summary"
```

---

## Task 11: Itemized parts in the email quote

**Files:**
- Modify: `LNL3D_Quote.html` — `copyEmailQuote()` (~L4004).

- [ ] **Step 1: Overlay aggregate headline onto `c`**

Find (the calc call near the top of `copyEmailQuote`, ~L4007):
```js
  const c = calcFromQuoteData(q);
```
Replace with:
```js
  const c = calcFromQuoteData(q);
  const _emailParts = getQuoteParts(q);
  const _emailAgg = calcQuoteParts(q);
  if (_emailAgg.multi) {
    c.suggested        = _emailAgg.calc.suggested;
    c.taxAmount        = _emailAgg.calc.taxAmount;
    c.suggestedWithTax = _emailAgg.calc.suggestedWithTax;
  }
```

> This makes the existing `price = qp>0?qp:c.suggested` line (~L4009) and any tax/total lines pick up the aggregate automatically, while other `c.*` fields keep part-1 values.

- [ ] **Step 2: Inject part lines into the email body**

Find the custom-items spread block (the `...(c.customItems && ...` array around L4055) and insert BEFORE it, in the same array-building expression, a parts section:
```js
    ...(_emailParts.length > 1 ? [
      'Parts:',
      ..._emailParts.map((p, i) => {
        const pc = calcFromQuoteData(p, { noFloor:true, noShipping:true, noCustom:true });
        return `  ${partLabel(p, i)} (×${p.quantity||1}): ${cur(pc.suggested)}`;
      }),
      ''
    ] : []),
```

- [ ] **Step 3: Verify**

Open a 2-part quote → email/copy. Expected: a "Parts:" list with each part's price, and the quoted total equals the aggregate. Single-part email unchanged.

- [ ] **Step 4: Commit**

```bash
git add LNL3D_Quote.html
git commit -m "List itemized parts in email quote"
```

---

## Task 12: CSV — add Parts count, keep row-per-quote

**Files:**
- Modify: `LNL3D_Quote.html` — `exportCSV()` (~L2718).

- [ ] **Step 1: Add the header**

Find:
```js
  const headers = ['#','Date','Expiry','Customer','Description','Status','Qty','Filament','Weight (g)','Print Time','Printer','Quoted Price','Notes','Tax Rate (%)','Taxable Sales','Non-Taxable Sales','Tax Amount','Total w/ Tax'];
```
Replace with (insert `'Parts'` after `'Notes'`):
```js
  const headers = ['#','Date','Expiry','Customer','Description','Status','Qty','Filament','Weight (g)','Print Time','Printer','Quoted Price','Notes','Parts','Tax Rate (%)','Taxable Sales','Non-Taxable Sales','Tax Amount','Total w/ Tax'];
```

- [ ] **Step 2: Use the aggregate per row and emit the count**

Find:
```js
    const calc = calcFromQuoteData(q);
    const taxRatePct     = ((state.settings.tax_rate||0)*100).toFixed(2);
    const taxableSales    = calc.taxBreakdown ? calc.taxBreakdown.taxable.price.subtotal.toFixed(2)    : '0.00';
    const nonTaxableSales = calc.taxBreakdown ? calc.taxBreakdown.nonTaxable.price.subtotal.toFixed(2) : '0.00';
    const taxAmt          = calc.taxAmount.toFixed(2);
    const totalWithTax    = calc.suggestedWithTax.toFixed(2);
    return [...cols.map(c => escape(q[c]??'')), escape(taxRatePct), escape(taxableSales), escape(nonTaxableSales), escape(taxAmt), escape(totalWithTax)].join(',');
```
Replace with:
```js
    const agg = calcQuoteParts(q);
    const calc = agg.multi ? agg.calc : calcFromQuoteData(q);
    const partCount = getQuoteParts(q).length;
    const taxRatePct     = ((state.settings.tax_rate||0)*100).toFixed(2);
    // taxBreakdown exists only on the single-part calc shape; for multi-part use aggregate fields.
    const taxableSales    = agg.multi ? agg.calc.taxableSubtotal.toFixed(2)
                                      : (calc.taxBreakdown ? calc.taxBreakdown.taxable.price.subtotal.toFixed(2) : '0.00');
    const nonTaxableSales = agg.multi ? (agg.calc.suggested - agg.calc.taxableSubtotal).toFixed(2)
                                      : (calc.taxBreakdown ? calc.taxBreakdown.nonTaxable.price.subtotal.toFixed(2) : '0.00');
    const taxAmt          = calc.taxAmount.toFixed(2);
    const totalWithTax    = calc.suggestedWithTax.toFixed(2);
    return [...cols.map(c => escape(q[c]??'')), escape(partCount), escape(taxRatePct), escape(taxableSales), escape(nonTaxableSales), escape(taxAmt), escape(totalWithTax)].join(',');
```

- [ ] **Step 3: Verify**

Export CSV with at least one multi-part and one single-part quote. Open the file: a `Parts` column appears (2 for the multi-part, 1 for legacy), `Total w/ Tax` equals the aggregate, and the row count equals the quote count (still one row per quote). Import into Invoice Ninja to confirm no breakage.

- [ ] **Step 4: Commit**

```bash
git add LNL3D_Quote.html
git commit -m "Add Parts count column to CSV export"
```

---

## Task 13: Documentation + pattern

**Files:**
- Modify: `/Users/michael/.mex/ROUTER.md`
- Modify: `/Users/michael/.mex/patterns/INDEX.md`
- Create: `/Users/michael/.mex/patterns/add-multi-part-quotes.md`

- [ ] **Step 1: Update ROUTER project state**

Add a "Working" bullet to `/Users/michael/.mex/ROUTER.md`:
```
- **Multi-part quotes**: a quote holds a `parts[]` array; each part is the per-part subset of getFormData() (printer/filament/weight/time/labor/finishing/rush/price-override/notes). `calcQuoteParts()` aggregates per-part `calcFromQuoteData()` results (with noFloor/noShipping/noCustom opts) + shared shipping/custom-items (face value) + tax once. Quotes with <2 parts use the unchanged single-part path. Itemized in sidebar/drawer/PDF/email; CSV gains a `Parts` count column (row-per-quote preserved).
```

- [ ] **Step 2: Add pattern index row** (alphabetical) to `/Users/michael/.mex/patterns/INDEX.md`:
```
| [add-multi-part-quotes.md](add-multi-part-quotes.md) | Adding or changing per-part fields, or a new output surface that must itemize parts |
```

- [ ] **Step 3: Write the pattern** `/Users/michael/.mex/patterns/add-multi-part-quotes.md`:
```markdown
# Pattern: Multi-Part Quotes

## Model
- `quote.parts[]` — each entry is the per-part subset of getFormData() (PART_FIELDS).
- Quote-level (shared): customer, project, description, date, expiry, status, ship_pack, ship_cost, custom_items.
- Back-compat: a quote with no parts[] is read as one implicit part via getQuoteParts().

## Key functions
- PART_FIELDS / extractPart(src) / getQuoteParts(q) / partLabel(p,i)
- calcFromQuoteData(q, opts) — opts: noFloor, noShipping, noCustom (defaults preserve legacy behavior)
- calcQuoteParts(quoteObj) — returns { multi, parts:[{part,calc,price}], calc:{suggested,taxAmount,suggestedWithTax,...} }
- partsBuffer / editingPartIndex / addPart / editPart / removePart / renderPartsList

## Rules / gotchas
- min_fee floor + tax + shipping/custom apply ONCE at quote level (calcQuoteParts), never per part.
- Shipping + custom items are added at FACE VALUE (markup ×1.0) on multi-part quotes.
- Single-part quotes (<2 parts) MUST use the unchanged calcFromQuoteData(q) path — verify prices are penny-identical to pre-feature.
- taxBreakdown only exists on the single-part calc shape; multi-part renderers must use agg.calc fields.

## Adding a new per-part field
1. Add the input to the print form HTML.
2. Add the key to PART_FIELDS.
3. Add it to getFormData/setFormData and clearPartFields/editPart.
4. Ensure calcFromQuoteData reads it.

## Adding a new output surface
Itemize with: `getQuoteParts(q).map((p,i) => calcFromQuoteData(p,{noFloor:true,noShipping:true,noCustom:true}))`
and use `calcQuoteParts(q).calc` for the headline total.
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Document multi-part quotes in ROUTER and patterns"
```

---

## Task 14: Full-feature verification pass

- [ ] **Step 1: Single-part regression** — Open an existing pre-feature quote. Confirm sidebar price, drawer, PDF, email, and CSV total are penny-identical to before (compare against a CSV exported before the feature, if available). No Parts section appears.

- [ ] **Step 2: Multi-part round-trip** — New quote, add 3 parts with different materials/weights/rush. Confirm: sidebar total = sum of 3 part prices + shipping + tax (min_fee applied once); edit part 2 → total updates; delete part 1 → total updates; Log Quote; reload page; reopen → 3 parts restored.

- [ ] **Step 3: Outputs** — For the 3-part quote: drawer shows "Parts (3)"; PDF Quote Summary shows a 3-row Part/Qty/Price table + correct total; email lists 3 parts; CSV shows `Parts=3` and the correct `Total w/ Tax`.

- [ ] **Step 4: Tax parity** — Set a 2-part quote where part 2 is empty/zero so it behaves like a 1-part quote plus a trivial part; sanity-check tax equals the single-part tax for the non-trivial part (within rounding).

- [ ] **Step 5: Server sync** — After logging, `cat data/quotes.json` and confirm the quote has a `parts` array and `part_count`.

- [ ] **Step 6: Final commit / branch** — Ensure all work is committed on `feat/multi-part-quotes`. Hand off to finishing-a-development-branch.

---

## Self-Review Notes (author)

- **Spec coverage:** data model (T1, T6, T8) · per-part vs quote-level split (T1 PART_FIELDS) · Add/clear/edit workflow (T4, T5) · aggregation reusing calcFromQuoteData (T2, T3) · sidebar (T7) · drawer (T9) · PDF itemized w/ prices (T10) · email (T11) · CSV row-per-quote + Parts col (T12) · back-compat single-part path (T3 branch, T14 S1).
- **Open policy flag:** shipping/custom markup on multi-part (Task 0) — needs user OK before T3.
- **Type consistency:** `calcQuoteParts` returns `{multi, parts, calc}`; `calc` carries `suggested/taxAmount/suggestedWithTax/taxableSubtotal/quoted/costTotal/totalProfit`. Renderers (T7/T9/T10/T11/T12) read only those fields on the multi path; `taxBreakdown` is read only on the single path.
```
