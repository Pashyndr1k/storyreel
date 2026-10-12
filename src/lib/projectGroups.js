// Projects that were split into other projects — a short-drama master split
// into episode projects (project.seriesPart on the children) or a project
// split into parts at Stage 3 (project.partInfo) — show on the Home page as
// one card that opens to reveal the projects inside it.
// An inline series (written inside one project, never split) carries a
// seriesPart that points at the project itself: that is not a parent.
export const parentIdOf = (p) => {
  const id = p?.seriesPart?.parentId || p?.partInfo?.parentId || null;
  return id && id !== p?.id ? id : null;
};

// Where a child sits in its parent: { kind: 'episodes' | 'scenes', from, to, index?, total }
export function childSpan(p) {
  if (p?.seriesPart) return { kind: 'episodes', from: p.seriesPart.from, to: p.seriesPart.to, total: p.seriesPart.total };
  if (p?.partInfo) return { kind: 'scenes', from: p.partInfo.from, to: p.partInfo.to, index: p.partInfo.index, total: p.partInfo.total };
  return null;
}

// The children of a project among `pool`, in story order.
export function childrenOf(pool, parentId) {
  return pool
    .filter((p) => parentIdOf(p) === parentId)
    .sort((a, b) => (childSpan(a)?.from || 0) - (childSpan(b)?.from || 0) || a.createdAt - b.createdAt);
}

// The cards to show: every project whose parent is not itself on the page,
// each with its children (empty for an ordinary project). `pool` is the set
// the children are taken from (the active projects); `visible` the sorted,
// filtered list the page would show flat.
export function groupProjects(visible, pool) {
  const visibleIds = new Set(visible.map((p) => p.id));
  return visible.filter((p) => !(parentIdOf(p) && visibleIds.has(parentIdOf(p)))).map((p) => ({ project: p, children: childrenOf(pool, p.id) }));
}
