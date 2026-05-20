# Combined Cost + Price + Tax View

**Date:** 2026-05-20
**Status:** Approved, ready for implementation plan
**Scope:** Replace the "Customer Charges (Tax Summary)" card and matching drawer section with a three-column table showing raw cost, customer price (× markup), and tax all in one place. Sidebar and drawer only — PDF, email, and CSV unchanged.

## Motivation

The operator currently sees the same numbers in three different surfaces:

- **Live Cost Breakdown** card — per-piece raw cost lines (filament, electricity, depreciation, labor, etc.)
- **Customer Charges (Tax Summary)** card — post-markup totals split by taxable / non-taxable, plus tax and grand total
- **Mental math** — to compare raw to price line-by-line

The recent post-markup card answers the bookkeeping question ("what did I charge, how much was taxable") but loses the cost basis. Operators want to see both columns side by side: *what it cost me* and *what the customer pays* — so the markup transformation is visible per category, and the tax base is unambiguous.

## Visual Target

Sidebar card (using Sofie Cherry Quote as reference data: qty=1, markup=2.4×, tax=8.75%):

```
┌─ Customer Charges (Tax Summary) ─────────────────┐
│                          Cost         Price      │
│ TAXABLE                                          │
│   Machine              $155.57      $373.36      │
│   Finishing             $60.00      $144.00      │
│   Taxable Subtotal     $215.57      $517.36      │
│ NON-TAXABLE                                      │
│   Labor                 $37.06       $88.95      │
│   Non-Taxable Subtotal  $37.06       $88.95      │
│ ──────────────────────────────────────────────── │
│   Tax (8.75%)                        $45.27      │
│   Grand Total                       $651.58      │
└──────────────────────────────────────────────────┘
```

Drawer section mirrors the same structure (same numbers, slightly different chrome to match drawer styling).

## Data Model

Extend `taxBreakdown` returned by `calcFromQuoteData()` to expose both raw and post-markup figures:

```js
taxBreakdown = {
  taxable: {
    raw:   { machine, finishing, shipping, custom, subtotal },   // pre-markup
    price: { machine, finishing, shipping, custom, subtotal },   // × markup
  },
  nonTaxable: {
    raw:   { labor, shipping, custom, subtotal },
    price: { labor, shipping, custom, subtotal },
  },
  tax,         // = price.taxable.subtotal × taxRate
  grandTotal,  // = suggested + tax
}
```

**Anchoring rules (preserved from current implementation):**
- `price.taxable.subtotal` = authoritative `taxableSubtotal` from the tax computation (not summed from lines)
- `price.nonTaxable.subtotal` = `suggested − taxableSubtotal` (absorbs `min_fee` floor silently)
- `raw.*.subtotal` = sum of raw category lines (no min_fee in raw cost world)

**Min-fee floor consequence:** when `suggested == min_fee` because `costPP × qty × markup < min_fee`, `price.nonTaxable.subtotal` will be larger than the sum of `price.nonTaxable.{labor,shipping,custom}`. This is intentional — the bump is documented as folding into non-taxable. Operators reading the table will see the discrepancy in the non-taxable column as a signal that the floor kicked in.

**Backward compatibility:** Existing readers reference `taxBreakdown.taxable.machine`, `taxBreakdown.nonTaxable.labor`, etc. (flat post-markup paths). Per design decision: **clean break, no aliases.** Both readers (sidebar `setText` calls in `calcQuote()`, drawer template in `showQuickView()`) get migrated to the new `.price.machine` paths. There are only two reader sites and they are both updated in this same change.

## UI

### CSS

Add one new class:

```css
.cost-row-3col {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 12px;
  align-items: center;
}
.cost-row-3col-header {
  /* same grid as .cost-row-3col, smaller dim text */
  font-size: 10px;
  color: var(--text3);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 4px 12px;
}
```

The existing `.cost-row` (2-col) is unchanged — Live Cost Breakdown card and all other cards still use it.

### Sidebar (lines ~1103–1135 in `LNL3D_Quote.html`)

Rebuild the card body using `.cost-row-3col` rows. New element IDs:

| ID pattern | Purpose |
|---|---|
| `b-tax-{cat}-raw` | Raw cost cell for taxable category |
| `b-tax-{cat}-price` | Post-markup cell for taxable category |
| `b-tax-total-raw`, `b-tax-total-price` | Taxable subtotal cells |
| `b-nontax-{cat}-raw`, `b-nontax-{cat}-price` | Non-taxable category cells |
| `b-nontax-total-raw`, `b-nontax-total-price` | Non-taxable subtotal cells |
| `b-tax-collected` | Tax row value (unchanged ID) |
| `b-grand-total` | Grand Total row value (unchanged ID) |

Tax and Grand Total rows still use `.cost-row` (2-col) — their label spans wider, value sits in the right column. This visually keeps "Price" column alignment because the Cost column is empty for those rows.

### Drawer (lines ~2733–2747)

Add a new helper next to `row()`:

```js
const row3col = (label, raw, price, opts={}) => `
  <div class="drawer-row drawer-row-3col${opts.cls ? ' '+opts.cls : ''}">
    <span class="drawer-row-label">${label}</span>
    <span class="drawer-row-value">${raw}</span>
    <span class="drawer-row-value">${price}</span>
  </div>`;
```

Drawer's tax section uses `row3col()` for the category lines and subtotals, then `row()` for Tax and Grand Total.

### `calcQuote()` populate (lines ~2417–2437)

Update the populate block to set both `*-raw` and `*-price` IDs for each category, using the new `tb.taxable.raw.machine` / `tb.taxable.price.machine` paths. Optional-row hiding (`toggle()`) gates on `tb.taxable.price.shipping`, etc. — same gating logic, new path.

## What is NOT changing

- **Live Cost Breakdown card** — per-piece raw view, untouched
- **CSV export** — `Taxable Sales` and `Non-Taxable Sales` columns stay (price-side only; raw cost is not a bookkeeping artifact)
- **PDF generation** — no breakdowns surface on customer documents
- **Email quote text** — same
- **Pricing schedule table** — same
- **Filament comparison** — same
- **Schema / persistence** — `taxBreakdown` is computed at runtime and never persisted; expanding its shape has no migration cost

## Backward Compatibility

- `tax_rate = 0` → card and drawer section both hidden via existing `c.taxAmount > 0` gate
- Optional rows (shipping, custom) auto-hide when zero — gating logic preserved with new path
- No data-model persistence changes — every field is recomputed from inputs

## Verification

1. **Sofie quote** (qty=1, markup=2.4, tax=8.75%, fin_hardware=$60, no shipping)
   - Cost column: Machine $155.57, Finishing $60, Taxable Subtotal $215.57, Labor $37.06, Non-Taxable Subtotal $37.06
   - Price column: Machine $373.36, Finishing $144, Taxable Subtotal $517.36, Labor $88.95, Non-Taxable Subtotal $88.95
   - Tax: $45.27, Grand Total: $651.58
   - Cross-check: every (Cost × 2.4) cell equals its Price sibling exactly
   - Cross-check: Taxable Subtotal Price + Non-Taxable Subtotal Price = $606.31 = `suggested`

2. **Tax-off case** — `tax_rate=0` → card and drawer section both hidden

3. **Min-fee floor** — set `min_fee=$2000`, simple quote where `costPP × qty × markup` underflows:
   - Taxable Subtotal Price = `taxableSubtotal` (unchanged, no floor applied here)
   - Non-Taxable Subtotal Price > Labor Price + ... by exactly the floor bump
   - Tax Price = Taxable Subtotal Price × rate (NOT bumped by floor)
   - Grand Total = min_fee + tax

4. **Shipping toggle** — `ship_taxable=true` with shipping=$20, markup=2:
   - Taxable Shipping row visible: Cost $20, Price $40
   - Non-Taxable Shipping row hidden
   - Flip toggle → rows swap

5. **Drawer parity** — open the same quote in the drawer, confirm identical numbers to sidebar

6. **CSV export** — unchanged from current behavior; `Taxable Sales` = price.taxable.subtotal, `Non-Taxable Sales` = price.nonTaxable.subtotal

## Pattern Notes (for `.mex/patterns/add-custom-line-items-and-tax.md`)

Update the breakdown gotcha to record:
- `taxBreakdown` now has both `raw` and `price` sub-objects per group
- `price.taxable.subtotal` anchors to `taxableSubtotal`; `price.nonTaxable.subtotal` anchors to `suggested − taxableSubtotal`
- `raw.*.subtotal` is summed from raw category lines
- Visual divergence in non-taxable column under min_fee floor is documented expected behavior

## Out of Scope

- Splitting `fin_sand` / `fin_paint` from `fin_hardware` for per-type tax classification — separate question raised in conversation, not addressed here
- Persisting a raw snapshot per quote — `taxBreakdown` remains runtime-only
- Editable tax classification per quote — global `tax_rate` and `ship_taxable` settings drive everything
