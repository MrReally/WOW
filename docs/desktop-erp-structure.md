# SEVER Backoffice — structural design principles

Status: research draft based on the SEVER codebase, Syrve Office 2026,
Syrve HQ 2026, public iiko/Syrve documentation, and Notion database interaction
patterns.

This document deliberately avoids colour, typography, shadows, and branding.
It defines information architecture and interaction rules.

## 1. Product modes are permission-driven

SEVER remains one web application with two shells:

- **Mobile shell** — the default for every authenticated user on every device.
- **Backoffice shell** — enabled only when the user has `backoffice.access`.

Screen width does not grant authority. A wide monitor without the permission
still shows the mobile product. A permitted user may use Backoffice on a tablet
or computer; on a narrow phone the application may fall back to the mobile
layout while keeping the same permissions.

Subject permissions remain independent:

- `backoffice.access` answers “may this person enter the operational desktop?”
- `warehouse.view`, `finance.view`, etc. answer “which data may they see?”
- manage/issue/resolve permissions answer “which actions may they perform?”

The shell must never manufacture access that the API does not grant.

## 2. Desktop is not a row of mobile workspaces

Mobile workspaces are optimized for role-specific moments and short tasks.
Backoffice is optimized for sustained work across related records.

Desktop navigation is therefore organized by business domains and object types:

1. Overview
2. Projects
3. Equipment
4. Operations
5. People
6. Contractors
7. Finance
8. Problems
9. Reports
10. Administration

Each domain expands into grouped destinations:

- **Reference data** — models, types, warehouses, people, roles.
- **Operations/documents** — issue, return, transfer, repair, inventory.
- **Planning** — projects, reservations, schedules, stage plans.
- **Reports** — saved and ad-hoc analytical views.
- **Administration** — configuration and permissions.

These group labels are non-clickable. Destinations are noun- or
process-specific and open into the shared workspace.

## 3. Persistent application frame

The Backoffice frame has four persistent regions:

### 3.1 Global context bar

Shows:

- current company/workspace;
- current operational scope (all warehouses, selected warehouse, project, etc.);
- global search / command launcher;
- problems and notifications;
- current user.

Changing a global scope must explicitly warn when it will invalidate open tabs.

### 3.2 Domain navigation

Collapsible left navigation. Only destinations allowed by permissions appear.
The navigation can be narrowed to icons on medium-width tablets.

### 3.3 Workspace tab strip

Registers, documents, reports, and full editors open as tabs. Tabs preserve:

- filter state;
- sorting/grouping;
- column widths and horizontal position;
- selected row;
- vertical scroll;
- unsaved-state marker.

The home/overview tab is pinned. Duplicate tabs for the same object should be
prevented unless the user explicitly chooses “Open another copy”.

### 3.4 Active workspace

One register, document, editor, or report occupies the remaining area. It owns
its toolbar and local context.

## 4. Five screen archetypes

Every Backoffice screen must be one of these types. New features should not
invent a sixth shape without a strong reason.

### 4.1 Register / journal

Used for projects, units, documents, transactions, people, contractors,
repairs, problems.

Order:

1. title and primary create action;
2. saved views;
3. period/scope/filter controls;
4. search, columns, grouping, export;
5. dense table;
6. aggregate footer;
7. bulk-action bar when rows are selected.

Required capabilities:

- stable sortable columns;
- hide/show/reorder/resize/freeze columns;
- filtering by column and advanced filters;
- optional grouping by dragged or selected fields;
- row selection and bulk actions;
- keyboard navigation;
- configurable density;
- explicit empty and error states;
- URL-encoded view state or saved named views.

### 4.2 Document editor

Used for issue, return, transfer, repair intake/completion, inventory, financial
transaction, and project invoice.

Order:

1. document identity and lifecycle state;
2. header properties;
3. line-item table;
4. calculations and validation messages;
5. sticky totals/status;
6. sticky lifecycle actions.

Document actions are verbs with lifecycle meaning:

- Save draft
- Post / Complete
- Reopen / Reverse
- Save and close
- Exit without saving

The UI must distinguish saving fields from committing a business event.

Documents that work with kits must support two levels of detail:

- compact operator line: `1 × DJ Set`;
- expanded component lines: players, mixer, case, cables, adapters.

The compact line is the user's business intent. The expanded lines are the
operational/accounting effect. The user should not be forced to see every
component during routine work, but the system must expose them for picking,
shortages, substitutions, repairs, inventory reconciliation and audit.

### 4.3 Entity editor

Used for equipment model/unit, project, person, contractor, warehouse, account.

Entity editors use a consistent header plus tabs:

- General
- Operational data
- Related records
- History
- Permissions/configuration where relevant

An entity is not a decorative card. Important properties stay visible, while
large related collections remain tables.

Equipment models and units can have composition tabs:

- **Kit composition** — standard required/optional components, effective dates,
  substitution rules and quantity.
- **Contained units** — actual physical/serial units currently attached to this
  specific kit.

This separates the standard kit recipe from the real assembled kit currently
moving through warehouses and projects.

### 4.4 Analytical report

Two levels:

- predefined report with a parameter strip and table/chart;
- configurable pivot/OLAP-like report.

Configurable reports support:

- categorized field palette;
- field search;
- row, column, value and filter zones;
- saved personal/shared formats;
- explicit period and scope;
- export;
- drill-down to source records.

### 4.5 Administration matrix/tree

Used for permissions, company structure, account hierarchy, equipment
classification, and other high-density configuration.

This archetype may combine tree + table or two searchable axes.

## 5. Opening records: browser-native window model

SEVER should keep Syrve's ability to work on several things while avoiding
separate operating-system windows.

Every row supports three open modes:

- **Center peek** — quick view or short edit without losing the register.
- **Side peek** — compare a record with the still-interactive table.
- **Workspace tab** — sustained editing or a complex document.

Rules:

- default mode is defined per register;
- `Enter` opens the default;
- modifier-click opens a workspace tab;
- center/side peek has “Open as tab”;
- `Esc` closes peek and restores focus to the originating row;
- browser Back closes the overlay before leaving the register;
- every open entity has a real URL;
- unsaved changes block accidental close with a clear choice.

Recommended defaults:

- simple reference entity → center peek;
- equipment unit / problem → side peek;
- project / plan / invoice / operational document → workspace tab.

## 6. Saved views are first-class

A saved view contains:

- scope;
- period preset;
- filters;
- sorting;
- grouping;
- visible columns and order;
- density;
- conditional markers;
- default open mode.

Views may be:

- system-provided;
- shared by administrators;
- personal.

Examples:

- “Projects starting in 14 days”
- “Equipment overdue for return”
- “Open repairs by contractor”
- “Client debts”
- “My unresolved problems”

Mobile tabs such as Active/Upcoming/Archive may become predefined saved views
on desktop rather than separate routes.

## 7. Permissions matrix

Adopt the strongest part of Syrve's permission model.

Rows:

- roles first;
- individual users below;
- search and optional grouping by team/status.

Columns:

- stable permission codes;
- grouped by domain;
- horizontally virtualized;
- separate searchable catalogue with human description.

Cell states must show provenance, not only boolean access:

- granted by role;
- granted directly;
- denied directly;
- unavailable because of scope/dependency;
- not granted.

Selecting a cell shows:

- permission name and code;
- explanation;
- source role/direct override;
- affected screens and actions;
- dependency warnings.

`backoffice.access` is a normal stable contract permission and is included in
this matrix. It should not silently imply financial, people, or administrative
access.

## 8. Scope model

Syrve HQ demonstrates that organizational scope is orthogonal to the current
screen. SEVER needs a smaller version:

- all warehouses / selected warehouses;
- all projects / selected project;
- optionally company/workspace when multi-company support exists.

Scope is shown globally when it affects most open registers. Local filters are
used when the restriction applies only to one view.

Permission and scope interact:

`visible rows = contract permission ∩ assigned organizational scope ∩ view filters`

The application must always make the active scope visible near the page title.

## 9. Auditability and document states

Operational ERP data must explain itself.

Registers may expose:

- created at/by;
- changed at/by;
- posted/completed state;
- deleted/archived toggle;
- change history;
- validation/problem indicators.

Document history is append-oriented. Reversals and corrections are explicit
events; history is not hidden behind silent mutation.

For SEVER specifically:

- equipment journal remains append-only;
- frozen FX values are shown as document facts;
- conflicts create visible Problems instead of blocking the workflow;
- every Problem links to its source record and resolution history.

## 10. Mapping current mobile workspaces to Backoffice

| Mobile workspace | Backoffice destination |
| --- | --- |
| Apex | Overview + Problems |
| Operations | Projects + Operations documents |
| Warehouse | Equipment + Operations |
| Planning | Projects + Planning views |
| Crew | People |
| Contractors | Contractors |
| Finance | Finance |
| Settings | Administration |

The underlying modules and contracts do not merge. This is a navigation and
presentation change only; backend boundaries stay intact.

## 11. Tablet rule

Backoffice availability is permission-driven. Layout is width-driven after
permission is granted:

- narrow phone: mobile shell;
- tablet: Backoffice with compact navigation and one primary pane;
- wide tablet/desktop: full navigation, register, and optional side peek.

Users without `backoffice.access` always receive the mobile shell regardless of
screen width.

## 12. Implementation sequence

1. Add `backoffice.access` to contracts, seed roles, and permission UI.
2. Add a shell resolver based on permission + usable viewport.
3. Build Backoffice frame and tab state without changing feature behavior.
4. Create reusable Register/Table and Peek primitives in the UI kit.
5. Convert Projects as the reference register.
6. Convert project detail into the reference entity/workspace editor.
7. Convert equipment units and operation documents.
8. Implement permission matrix.
9. Add saved views and configurable reports.
10. Convert remaining domains incrementally.

Each converted screen continues to use feature hooks for data/commands and
presentational components for layout.
