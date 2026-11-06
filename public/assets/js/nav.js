// Navigation hooks, filled in by the router (keeps views free of import cycles).

export const nav = {
  go: (url, opts) => { location.href = url; },
  openBlock: (id) => {},
  current: () => new URL(location.href),
  // Change the address without changing the page.
  rename: (path) => { history.replaceState(history.state, '', path + location.search); },
};

// Every drawer is a planet now, whoever's it is.
export const drawerHref = (drawer) => `/p/${drawer.id}`;
