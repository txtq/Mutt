#!/usr/bin/env python3
"""Runs Mutt's checks and prints a few lines: what passed, and details only for what didn't.

  tests/run.sh                 everything: the API suites, then the browser paths
  tests/run.sh api             only the API suites
  tests/run.sh browser         only the browser paths (Safari)
  tests/run.sh browser undo    only that path (after signing in); --keep saves the pictures as "before"
  tests/run.sh galaxy docs     only those API suites
  tests/run.sh --accept docs   the new answers are right: save them as the expected ones
  tests/run.sh -v galaxy       also print everything the suite said

An API suite is a curl script that prints one line per check ("label: answer").
The right answers are kept in tests/expected/<suite>.txt; a line that differs is a
failure, reported as: label, what it should be, what came back. Ids and times are
masked before comparing. A suite can also print "RULE BROKEN: ..." (tests/lib.sh).
"""
import difflib, os, re, shutil, subprocess, sys, tempfile, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
API = ['smoke', 'galaxy', 'preview', 'lockout', 'search', 'autosort', 'moons',
       'books', 'docs', 'cookbook', 'comments', 'modes']
PORT = 8099
MAX_SHOWN = 12   # failures printed per suite, so a broken run stays cheap to read

MASKS = [
    (re.compile(r'(?<![A-Za-z0-9_-])(?=[A-Za-z0-9_-]*[0-9A-Z_-])(?=[A-Za-z0-9_-]*[a-z])[A-Za-z0-9_-]{12}(?![A-Za-z0-9_-])'), '<id>'),
    (re.compile(r'\b1[6-9]\d{11}\b'), '<time>'),
    (re.compile(r'\bt_[0-9a-f]{6}\b'), 't_<v>'),
]


def mask(line):
    for rx, to in MASKS:
        line = rx.sub(to, line)
    return line.rstrip()


def label(line):
    head = line.split(': ', 1)[0]
    return head if len(head) <= 90 else head[:87] + '...'


def answer(line):
    parts = line.split(': ', 1)
    text = parts[1] if len(parts) > 1 else line
    return text if len(text) <= 220 else text[:217] + '...'


def start_server(work, port=PORT):
    env = dict(os.environ, MUTT_SEE='0', MUTT_TRUST_PROXY='1',
               MUTT_DATA_DIR=os.path.join(work, 'data'), PORT=str(port))
    log = open(os.path.join(work, 'server.log'), 'w')
    proc = subprocess.Popen([sys.executable, 'server.py'], cwd=ROOT, env=env, stdout=log, stderr=log)
    for _ in range(60):
        try:
            urllib.request.urlopen(f'http://localhost:{port}/api/health', timeout=1).read()
            return proc
        except Exception:
            time.sleep(0.1)
    proc.kill()
    raise SystemExit(f'The test server did not start on port {port} (is something else using it?)')


def stop_server(proc, work):
    proc.terminate()
    try:
        proc.wait(5)
    except subprocess.TimeoutExpired:
        proc.kill()
    with open(os.path.join(work, 'server.log')) as f:
        log = f.read()
    at = log.find('Traceback')
    return log[at:at + 1500] if at >= 0 else ''


def compare(want, got):
    """-> list of failure sentences."""
    fails = []
    for tag, a1, a2, b1, b2 in difflib.SequenceMatcher(None, want, got, autojunk=False).get_opcodes():
        if tag == 'equal':
            continue
        old, new = want[a1:a2], got[b1:b2]
        # pair lines by label first, then report what's left over
        for w in list(old):
            twin = next((g for g in new if label(g) == label(w)), None)
            if twin is not None:
                fails.append(f'"{label(w)}" should be: {answer(w)}\n      but got: {answer(twin)}')
                old.remove(w); new.remove(twin)
        fails += [f'"{label(w)}" is missing (should be: {answer(w)})' for w in old]
        fails += [f'"{label(g)}" is new, with no expected answer yet (got: {answer(g)})' for g in new]
    return fails


def run_api(name, accept=False, verbose=False):
    """-> (checks, failures)"""
    script = os.path.join(HERE, name + '.sh')
    if not os.path.exists(script):
        return 0, [f'there is no suite called {name}']
    work = tempfile.mkdtemp(prefix='mutt-test-')
    proc = start_server(work)
    try:
        out = subprocess.run(['bash', script, work], cwd=ROOT, capture_output=True, text=True, timeout=300)
    finally:
        crash = stop_server(proc, work)
        shutil.rmtree(work, ignore_errors=True)
    got = [mask(l) for l in out.stdout.splitlines() if l.strip()]
    if verbose:
        print('\n'.join(got))
    fails = [l.split('RULE BROKEN: ', 1)[1] for l in got if 'RULE BROKEN: ' in l]
    if crash:
        fails.append('the server hit an error:\n' + crash)
    if out.stderr.strip():
        fails.append('the suite itself tripped: ' + out.stderr.strip()[:400])
    path = os.path.join(HERE, 'expected', name + '.txt')
    if accept:
        if fails:
            return len(got), fails + ['not saved: fix the above before accepting']
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w') as f:
            f.write('\n'.join(got) + '\n')
        return len(got), []
    if not os.path.exists(path):
        return len(got), fails + [f'no expected answers yet: read `tests/run.sh -v {name}`, then `tests/run.sh --accept {name}`']
    with open(path) as f:
        want = [l.rstrip() for l in f if l.strip()]
    # a broken rule is already reported in its own words; don't report its line twice
    calm = [re.sub(r'^RULE BROKEN: (.*) \(got .*\)$', r'rule holds: \1 -> no', l) for l in got]
    return len(got), fails + compare(want, calm)


def argv_names(argv):
    return [a for a in argv if not a.startswith('-')]


def main(argv):
    flags = {a for a in argv if a.startswith('-')}
    names = [a for a in argv if not a.startswith('-')]
    accept, verbose = '--accept' in flags, '-v' in flags
    if accept and not names:
        raise SystemExit('Say which suite to accept, e.g. tests/run.sh --accept docs (after reading its changes).')
    browser = not names or 'browser' in names
    only = names[names.index('browser') + 1:] if 'browser' in names else []   # tests/run.sh browser undo
    names = names[:names.index('browser')] if 'browser' in names else names
    suites = API if 'api' in names or not (names or browser) or not argv_names(argv) else names
    began, bad = time.time(), False

    if suites:
        total, broken = 0, []
        for name in suites:
            n, fails = run_api(name, accept, verbose)
            total += n
            if fails:
                broken.append((name, fails))
        if broken:
            bad = True
            wrong = sum(len(f) for _, f in broken)
            print(f'API: FAILED, {wrong} wrong of {total} checks in {len(suites)} suites')
            for name, fails in broken:
                for f in fails[:MAX_SHOWN]:
                    print(f'  ✗ {name}: {f}')
                if len(fails) > MAX_SHOWN:
                    print(f'  … and {len(fails) - MAX_SHOWN} more in {name} (tests/run.sh {name})')
        else:
            print(f'API: {"saved" if accept else "passed"}, {total} checks in {len(suites)} suites')

    if browser and not accept:
        import browser as paths
        passed, fails, skipped = paths.run(start_server, stop_server, verbose, '--keep' in flags, only)
        if skipped:
            bad = True
            print(f'Browser: NOT RUN. {skipped}')
        elif fails:
            bad = True
            print(f'Browser: FAILED, {len(fails)} of {passed + len(fails)} paths')
            for f in fails:
                print(f'  ✗ {f}')
        else:
            print(f'Browser: passed, {passed} paths (pictures in tests/shots/latest)')

    print(f'{"FAILED" if bad else "ALL PASSED"} in {time.time() - began:.0f}s')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.path.insert(0, HERE)
    sys.exit(main(sys.argv[1:]))
