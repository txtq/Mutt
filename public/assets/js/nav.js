// Navigation hooks, filled in by the router (keeps views free of import cycles).

export const nav = {
  go: (url, opts) => { location.href = url; },
  openBlock: (id) => {},
  current: () => new URL(location.href),
};

// Every drawer is a planet now, whoever's it is.
export const drawerHref = (drawer) => `/p/${drawer.id}`;
