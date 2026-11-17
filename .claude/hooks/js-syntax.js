// Run by check-edit.sh with the Mac's own JavaScriptCore (Safari's engine),
// since there is no Node here. Parses one script as a module; runs nothing.
const src = readFile(arguments[0]);
try {
  checkModuleSyntax(src);
  print("ok");
} catch (e) {
  print(String(e));
}
