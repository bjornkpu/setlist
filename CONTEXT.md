# Context — setlist

Glossary of domain terms. No implementation details.

## Terms

**Schedule** — one conference program, a frab-compatible `schedule.json`. Loaded from a provider or URL, cached locally.

**Provider** — a URL hosting an `index.json` that lists schedules. Users add/remove providers.

**Event** — one entry in a schedule: a talk, workshop, or anchor. Has a time range (start + duration), a room, and identity (`guid`, falling back to `id`).

**Anchor** — an event that is shared logistics rather than a talk: registration, lunch, breaks, keynote, closing. Represented as an ordinary event, conventionally in room `Fellesareal`. Not a distinct type in data or code.

**Solo event** — an event that is the only thing running during its time range. A solo event is the destination for that time without needing a pick. Most anchors are solo events; the rule is about overlap, not about room name.

**Plan** — the user's choices across a schedule. Local only. One state per event.

**Plan state** — one of `pick`, `maybe`, `avoid`, or none.
- **Pick** — attending this. At most one pick among mutually overlapping events.
- **Maybe** — unordered fallback if the pick falls through.
- **Avoid** — actively rejected; never surfaced in glance.

**Overlap** — two events overlap when their time ranges intersect (pairwise). There is no global slot grid.

**Slot (of an event E)** — the set of events whose time ranges overlap E's. Derived, pairwise; not a fixed grid cell.

**Conflict** — a second pick overlapping an existing pick. The new pick replaces the old, with visible feedback.

**Active schedule** — the schedule driving the glance view. Auto-selected when a schedule's date range covers today; otherwise last used; manually switchable in the library.

**Library** — the list of locally cached schedules.

**Glance view** — the primary screen: where do I go now / next. Room name is the largest text.

**Browse view** — the full program: days, filters, detail.
