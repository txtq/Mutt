// Navigation hooks, filled in by the router (keeps views free of import cycles).

export const nav = {
  go: (url, opts) => { location.href = url; },
  openBlock: (id) => {},
  current: () => new URL(location.href),
};
