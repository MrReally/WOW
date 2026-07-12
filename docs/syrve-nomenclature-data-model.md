# Syrve nomenclature model — research notes for SEVER

Status: working model based on Syrve HQ 2026 UI inspection and public
iiko/Syrve documentation. It separates business entities from the registry
views through which users work with them.

## 1. The essential distinction

Syrve does not use `Products`, `Items`, `Semi-Finished Products`, `Modifiers`
and `Stock list` as five equivalent entity types.

### Products

Raw stock goods: ingredients, beverages, consumables and other purchased or
stored material. A product normally has a base measurement unit, optional
packaging units, supplier mappings and stock transactions. It may be consumed
by a recipe but is not itself the prepared output of that recipe.

Examples: Rum, Cola, whole Lime.

### Items

Prepared or sold menu items. An item can have a technical card (recipe), sale
price, cooking parameters, places of sale/production, modifier scheme,
nutritional data and size scale. Its sale or outgoing document can cause the
write-off of recipe ingredients.

Example: Rum & Cola.

### Semi-Finished Products

Prepared intermediate outputs that can be produced from ingredients and then
consumed by other recipes. They need both an input recipe and an output/yield
unit and participate in cost roll-up.

Examples: lime cordial, simple syrup, pre-batched cocktail base.

### Modifiers

Optional or required choices attached to an item through a modifier scheme.
A modifier can carry its own recipe and therefore its own inventory write-off.
The scheme adds selection rules: minimum, default, maximum, required, free
quantity, hidden default quantity and other restrictions.

Example: Lime Wedge, consuming 0.125 pcs of whole Lime.

### Stock list

A consolidated operational projection, not another kind of nomenclature.
It answers “which nomenclature entries participate in stock/accounting work?”
across multiple underlying types. The same entity keeps its real type while
appearing in this common register.

This distinction matters for SEVER: entity type belongs to the domain model;
Products, Stock list, Purchasing assortment and Menu are task-specific views.

## 2. Shared nomenclature identity

Observed or documented common fields:

- immutable internal identifier;
- name and optional alternate/foreign names;
- stable stock-list code (SKU);
- POS quick code;
- nomenclature type;
- parent group in a hierarchical catalogue;
- accounting category;
- active/deleted state;
- base measurement unit;
- weighted/non-weighted behavior;
- description and preparation notes;
- image;
- tags/custom classifications;
- creation and change audit metadata.

SKU identifies an accounting object. A barcode identifies a physical
presentation of that object and may therefore belong to a packaging unit.
Supplier article/code is a counterpart-specific alias and must not replace SKU.

## 3. Units and packaging

Every stock-affecting entry has one base unit used for balances, recipes and
transactions. Common bases include kilograms, litres, pieces and servings.

A packaging unit is a named conversion to the base unit:

`package quantity × base-unit coefficient = stock quantity`

Packaging data can include:

- package name;
- coefficient/count of base units;
- barcode;
- supplier article or supplier-specific name;
- package weight/volume;
- availability for purchase, write-off or sale;
- display order and active state.

Example:

| Entity | Base unit | Packaging unit | Coefficient |
| --- | --- | --- | ---: |
| Rum | l | Bottle 0.7 l | 0.700 |
| Rum | l | Case 6 × 0.7 l | 4.200 |
| Cola | l | Can 0.33 l | 0.330 |
| Lime | pcs | Each | 1.000 |
| Lime | pcs | Case 12 | 12.000 |

Documents should store both the unit selected by the operator and the resolved
base-unit quantity. Otherwise history changes when a conversion is edited.

## 4. Type-specific facets

### Product facets

- supplier product mappings;
- purchase packages and barcodes;
- preferred/default supplier;
- accounting and tax categories;
- storage and expiry properties;
- allergens and nutritional properties where applicable;
- substitute/analogue relationships if enabled.

### Item facets

- one or more effective-dated technical cards;
- serving/output unit and yield;
- restaurant/internal prices and open-price behavior;
- cooking time and defaults;
- production place and places of sale;
- size scale;
- modifier scheme;
- nutritional value and allergens;
- POS-facing settings.

### Semi-finished product facets

- effective-dated production recipe;
- input gross/net quantities;
- expected output/yield;
- production and loss factors;
- cost derived from ingredients;
- use as an ingredient in downstream recipes.

### Modifier facets

- own recipe or direct stock write-off;
- permitted/default price;
- selection constraints supplied by the parent modifier scheme;
- compatibility with item sizes;
- visibility and POS behavior.

## 5. Technical card / recipe

A recipe is versioned and effective-dated. It must not be represented merely as
the current list of ingredients because historical documents need the recipe
that was effective when they were posted.

Recipe header:

- owner nomenclature ID;
- version and validity interval;
- output quantity and unit;
- preparation/technology text;
- production place;
- status and approval metadata.

Recipe line:

- ingredient nomenclature ID;
- ingredient type;
- selected unit;
- gross quantity;
- net quantity;
- loss/yield factors;
- resolved base-unit quantity;
- optional processing stage;
- calculated cost contribution.

Suggested demo recipes:

- Rum & Cola, output 1 serving:
  - Rum 0.050 l;
  - Cola 0.150 l.
- Lime Wedge, output 1 modifier serving:
  - Lime 0.125 pcs.

## 6. Modifier scheme

The scheme is a reusable constraint model between a parent item and possible
modifiers. Its line should contain:

- modifier ID;
- minimum quantity;
- default quantity;
- maximum quantity;
- required flag;
- hide-if-default flag;
- free quantity;
- size/context restrictions;
- display order.

Inventory write-off belongs to the selected modifier's recipe, while selection
rules belong to the scheme. Keeping those concerns separate allows the same
Lime Wedge recipe to be reused under different menu rules.

## 7. Documents, postings and movement

An inventory document has a business header and lines. Posting creates
immutable stock transactions; editing a draft does not.

Document header:

- document ID/number/type;
- organization and store scope;
- storage/from-storage/to-storage;
- supplier/customer/counterparty;
- business timestamp and posting timestamp;
- accounting concept;
- lifecycle state;
- author/poster/reversal references.

Document line:

- nomenclature ID and captured name/SKU;
- selected package/unit;
- package quantity;
- base-unit quantity;
- unit price, tax and total where relevant;
- recipe/version reference when an item expands into ingredients;
- stock before/after as a calculated presentation, not source data.

The transaction ledger is the accounting truth. `Inventory movement` is a
reporting projection over those postings, typically showing opening balance,
receipts, expenditure, internal transfers, recipe/production effects and
closing balance by storage and period.

## 8. Inventory reconciliation

Inventory reconciliation is a document workflow:

1. choose organization, storage and count moment;
2. freeze or calculate expected quantity from posted transactions;
3. enter actual quantity, preferably in any recognized package;
4. calculate shortage/surplus and value variance;
5. investigate differences;
6. post adjustment transactions;
7. retain count lines, expected snapshot, actor and posting audit.

Draft counts must not alter stock. Posting must create traceable adjustment
transactions rather than rewriting balances.

## 9. Proposed SEVER representation

Use one stable nomenclature identity plus explicit type-specific records.
Do not create separate disconnected identities for “purchasing product”,
“recipe ingredient” and “stock-list row”.

Recommended concepts:

- `CatalogItem` — stable identity, SKU, name, group, type and state;
- `MeasurementUnit` and immutable document-side `UnitConversionSnapshot`;
- `PackagingUnit`;
- `SupplierProductMapping`;
- `Recipe` and effective-dated `RecipeVersion`;
- `RecipeLine`;
- `KitDefinition` and effective-dated `KitVersion`;
- `KitLine`;
- `ModifierScheme` and `ModifierRule`;
- `InventoryDocument` and `InventoryDocumentLine`;
- append-only `StockTransaction`;
- `InventoryCount` and `InventoryCountLine`;
- saved projections/views such as Products, Items, Stock list and Movement.

Module boundaries still apply: catalogue, recipes, purchasing and inventory
should communicate through contracts and events, without cross-schema joins.

## 10. Kits / equipment sets

SEVER has an additional concept that Syrve only partially resembles: an
operational unit can be both a stock object and a kit made from smaller stock
objects.

This is close to a recipe/technical card, but it is not identical:

- a recipe transforms ingredients into a prepared output;
- a kit groups existing units into an operationally meaningful set;
- the kit may be reserved, issued, returned, transferred, repaired or counted
  as one unit;
- its components may still be inspected and operated separately when needed.

Examples:

| Kit | Components |
| --- | --- |
| DJ Set | 2 × player, 1 × mixer, 1 × case, cables |
| Wireless Mic Kit | 2 × microphone, 1 × receiver, 1 × charging case |
| Lighting Stand Kit | 1 × stand, 1 × T-bar, 4 × bolts |

Important modelling rules:

- a kit has its own SKU/identity if users operate it as a business object;
- components keep their own identities, serial numbers and condition history;
- a kit version is effective-dated, because the standard composition may
  change over time;
- document lines must capture the kit version used at the time of posting;
- stock transactions should preserve both the operator's selected object
  (`DJ Set`) and the expanded affected objects where the movement touches
  physical components;
- users can choose the working granularity: kit-level for fast operations,
  component-level for exceptions, repairs, substitutions and losses.

Suggested fields for `KitVersion`:

- owner `CatalogItem` / model ID;
- version and validity interval;
- output quantity, usually `1 kit`;
- assembly policy: virtual bundle, pre-assembled stock unit, or required
  physical assembly document;
- reservation policy: reserve whole kit only, reserve components, or allow
  substitution;
- shortage policy: block, warn, or create a Problem;
- status and approval metadata.

Suggested fields for `KitLine`:

- component model/catalog item ID;
- required quantity;
- selected unit and resolved base quantity;
- required/optional flag;
- substitutable flag and allowed substitute group;
- serial requirement: any unit, exact unit, or same unit as previous document;
- packing/display group;
- notes for picker/warehouse operator.

UI implication: the default register may show the kit as one row, with an
expandable “composition” section only when the user needs it. Documents should
support both modes:

- add `1 × DJ Set` as a compact line;
- expand it into component lines for picking, exceptions or audit;
- collapse back to kit-level after the operation is understood.

This keeps the backoffice dense and operational instead of forcing users to
stare at every cable and adapter all day.
