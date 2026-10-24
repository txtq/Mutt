// Navigation hooks, filled in by the router (keeps views free of import cycles).

export const nav = {
  go: (url, opts) => { location.href = url; },
  openBlock: (id) => {},
  current: () => new URL(location.href),
};

// Community drawers live under Community, wherever you reach them from.
export const drawerHref = (drawer) => (drawer.community ? `/c/${drawer.id}` : `/d/${drawer.id}`);
