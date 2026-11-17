# Merging planets

Part of the map of how Mutt is built (`CLAUDE.md`, Architecture, lists every file). Keep it current when this feature changes.

- Merging planets (2026-11-16): right-click a planet on your galaxy, `Merge into…`, pick another (`mergeable`, `askMerge`, `merge`, `unmerge` in `views/galaxy.js`). `POST /api/drawers/<into>/merge` {from} (owner only; planets, not moons; neither kept together; moons must fit in `MAX_MOONS`): the files go to the end of `into` with their ticks (a file already there keeps its place; other people's files only if `into` takes them), its moons become `into`'s (following its sharing unless set by hand), and it is deleted. What it was is kept in `planet_merges` (one row per planet merged into, the last merge), which `POST …/merge/undo` puts back with the same id. Checks: the merge lines at the foot of `tests/moons.sh`, browser path `merge_planets`.
