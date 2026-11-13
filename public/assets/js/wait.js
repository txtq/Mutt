// Nothing to run. This file exists to be a plain (not module) script in index.html, placed after
// the stylesheets: a browser will not run such a script, or anything after it, until the
// stylesheets before it have arrived. The app reads its named values (speeds, curves, colours)
// from tokens.css as it starts (util.js), so it must not start first. Safari did, on a first visit
// with nothing cached: every scripted move took no time and the planets' cards had no colours.
// Found in design session 8. Do not remove it, inline it or mark it async, defer or module.
