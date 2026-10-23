# Open items and roadmap

Work that is **not** part of `IMPLEMENTATION_PLAN.md`'s phases. It is taken up after the initial implementation (phases 0 to 11 of the plan) is finished. Each entry says what is missing today, so it can be scheduled without re-reading the code.

## Open items (known gaps against Fiori elements)

### Tree tables

Tree tables work for reading (`Aggregation.RecursiveHierarchy`, expand/collapse, filters with their ancestors, `initialExpansionLevel`, paged children; see Phase 8 round 5 and Phase 10 of the plan). Still missing:

- **Create child / move node**: FE's tree table toolbar creates a node below the selected one and moves nodes (cut / paste, `Aggregation.RecursiveHierarchyActions`). Today a tree table is display-only.
- **Draft roots**: a tree whose entity is a draft root (nodes are edited as drafts) is not supported; the tree is read from the active data and only in display mode.

## Roadmap (future work, not scheduled)

Each item needs the preceding phases done; Custom Pages also needs a design first.

- **Frontend extensibility** (design doc §6): fragment templates + sanitizer, building blocks, all FE V4 manifest extension points, `hx-fiori` controller-extension façade + ExtensionAPI, server extension SPI, coverage entries (custom pages are the next item). Includes personalization: saved view variants and the UI5 flexibility features (saved views are browser-local today). Re-verify the parity matrix against the UI5 SDK first.
- **Custom Pages (non-standard FE floorplans)**: not started; needs a design and developer documentation first, then agreement, before any implementation. Scope to be defined in that design (what FE's flexible programming model calls custom pages / `sap.fe.core.fpm` targets, how they are registered, routed, composed from building blocks and extended).
