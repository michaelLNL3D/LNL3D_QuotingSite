# Multi-Part Quotes — Design Spec

**Date:** 2026-06-02
**Status:** Approved (design), pending implementation plan
**File affected:** `LNL3D_Quote.html` (single-file app)

## Problem

Today the app models **one quote = one printed part**. The entire calculator form
(printer, filament, weight, print time, labor, finishing, rush, price override)
feeds a single price calculation. A real job often contains several different
parts. The user wants to: fill out the print form, click a button to add it as a
line item, have the form clear so they can enter another part, and accumulate
multiple parts into one quote with a combined total.

## Chosen approach — Approach B: Parts layer over the existing engine

The existing single-part calculator stays intact and becomes the "edit one part"
editor. A new `partsBuffer` accumulates parts; the quote total is computed by
calling the **existing** `calcFromQuoteData(part)` once per part and aggregating.
No rewrite of the proven per-part pricing math. No migration of existing quotes.

Rejected:
- **Approach A (full refactor):** parts become the only model; rewrite calc to
  always iterate; migrate every live quote. Cleanest end-state, highest risk on a
  live/distributed app.
- **Approach C (separate multi-part mode):** parallel flow; two UX paths to
  maintain forever.

## Field split: per-part vs. per-quote

Decided with the user.

| Per-part (in the Add-Part form)                                                                                                    | Per-quote (shared, set once) |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| printer, filament, weight_g, print_time, complexity, quality, quantity, **quoted_price (override)**, support_filament, support_weight_g, prep_model, prep_slice, post_remove, post_support, post_extra, fin_sand, fin_paint, fin_hardware, fin_other, consumables, **rush**, notes | customer, project, description, date, expiry, status, ship_pack, ship_cost, custom_items |

Rationale: the user chose **rush** and **quoted_price override** to be per-part
(each part can carry its own rush level and its own manual price). **Customer**
and **shipping** are shared across the whole quote.

## Data model

Each quote gains a `parts` array:

```js
quote.parts = [ { ...perPartFields }, ... ]
```

A part object is the per-part subset of `getFormData()`'s output.

**Back-compat (no migration):** a quote whose `parts` is missing/empty is read as
a single implicit part synthesized from its existing flat fields. Old quotes
render and calculate identically. New quotes write `parts`; the flat per-part
fields on the quote object mirror the *currently-loaded* part (or part 1) so any
legacy reader still works.

## UI / workflow

Mirror the existing `customItemsBuffer` pattern (`addCustomItem` /
`removeCustomItem` / `renderCustomItems`).

- New **"＋ Add Part"** button below the print form.
- Click → validate the form has at least a printer and weight or print time →
  snapshot per-part fields into `partsBuffer` → clear print fields (keep
  customer/project/shipping) → re-render the Parts list.
- **Parts list:** each row shows part name (or "Part N"), material, qty, and
  computed price, with **Edit** and **✕** buttons.
- **Edit** → `setFormData(part)` loads it into the form; the Add button becomes
  **"✓ Update Part"** and saves in place (tracked by an `editingPartIndex`).
- **✕** removes the part and re-renders.

## Calc aggregation

New `calcQuoteTotal()`:
1. For each part, call existing `calcFromQuoteData(part)` (each part carries its
   own rush + price override).
2. Sum per-part machine / labor / finishing / taxable bases.
3. Add shared `ship_cost` + `custom_items` once at the quote level.
4. Apply tax across the combined taxable base (reusing existing tax logic).

The proven per-part math in `calcFromQuoteData` is untouched. The live sidebar
shows a per-part price breakdown plus the grand total.

## Output rendering

- **Sidebar & drawer:** itemized parts list with per-part prices + total.
- **PDF & email:** **itemized with prices** — each part as its own line (name,
  qty, price), then the job total. (User's explicit choice.)
- **CSV (Invoice Ninja):** keep one row per quote; add a `Parts` count column and
  combined totals so the existing import does not break.

## Edge cases

- One-part quote behaves and renders exactly like today (no visual change).
- Empty parts buffer → fall back to reading the live form as the single implicit
  part, so the app never shows a $0 quote while the form has data.
- `parts` round-trips through localStorage + server like any other quote field.

## Testing (manual)

1. Add 3 parts → total equals the sum of three independent `calcFromQuoteData`
   results.
2. Edit part 2 → total updates correctly.
3. Delete part 1 → total updates correctly.
4. Save + reload (and server round-trip) → parts persist.
5. Open an **old single-part quote** → renders and prices identically.
6. PDF shows 3 itemized part lines + correct total; email matches.
7. CSV still imports into Invoice Ninja (row-per-quote preserved).
8. Spot-check tax: taxable base across parts + shared shipping/custom items
   matches the existing single-part tax behavior when there is only one part.

## Out of scope

- No per-part shipping or per-part customer.
- No PDF per-part deep detail pages (only itemized line + price).
- No change to settings, printers/materials CRUD, or server endpoints.
