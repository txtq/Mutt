#!/usr/bin/env python3
"""Stops the look drifting: counts the values typed by hand instead of taken from a name.

Every colour, text size, corner, shadow and speed has a name in public/assets/tokens.css
(DESIGN.md says what each is for). This counts how many are still typed as raw numbers in
the other stylesheets and in the scripts, and fails when any count is higher than the one
recorded in tests/expected/drift.txt. So new work can't add a raw value without someone
noticing, and each design session can only bring the numbers down.

  tests/run.sh drift            check (it also runs first in a plain tests/run.sh)
  tests/run.sh -v drift         also print every count, file by file
  tests/run.sh --accept drift   record today's counts, after a session has lowered them
                                (it refuses to record a higher one: see CLAUDE.md, Checks)
"""
import collections, glob, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(os.path.dirname(HERE), 'public', 'assets')
EXPECTED = os.path.join(HERE, 'expected', 'drift.txt')
NAMED = 'tokens.css'          # the one file where raw values belong
KINDS = ['colours', 'text sizes', 'corners', 'shadows', 'speeds']

HEX = r'(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b'
FUNC_COLOUR = r'\b(?:rgba?|hsla?)\('
LENGTH = r'(?<![\w.#-])\d*\.?\d+(?:px|em|rem|cqw|vw|%)'
TIME = r'(?<![\w.#-])\d*\.?\d+m?s\b'


def declarations(css, *props):
    names = '|'.join(re.escape(p) for p in props)
    return re.findall(r'(?<![\w-])(?:' + names + r')\s*:\s*([^;}]+)', css)


def count_css(css):
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    n = collections.Counter()
    n['colours'] = len(re.findall(HEX, css)) + len(re.findall(FUNC_COLOUR, css))
    n['text sizes'] = sum(1 for v in declarations(css, 'font-size') if re.search(LENGTH, v))
    # the size in a `font:` shorthand is the first length in it
    n['text sizes'] += sum(1 for v in declarations(css, 'font') if re.search(LENGTH, re.split(r'var\(--(?:sans|mono|serif)', v)[0].split('/')[0]))
    n['corners'] = sum(1 for v in declarations(css, 'border-radius') if re.search(LENGTH, v))
    n['shadows'] = sum(1 for v in declarations(css, 'box-shadow', 'text-shadow') if re.search(LENGTH, v))
    for v in declarations(css, 'transition', 'animation', 'transition-duration', 'animation-duration', 'transition-delay', 'animation-delay'):
        n['speeds'] += sum(1 for t in re.findall(TIME, v) if float(t.rstrip('ms')) != 0)   # no wait at all (0s) is not a speed
    n['speeds'] += len(re.findall(r'cubic-bezier\(', css))
    return n


def count_js(js):
    js = re.sub(r'/\*.*?\*/', '', js, flags=re.S)
    js = re.sub(r'(^|\s)//[^\n]*', r'\1', js)
    n = collections.Counter()
    n['colours'] = len(re.findall(HEX, js)) + len(re.findall(FUNC_COLOUR, js))
    n['text sizes'] = len(re.findall(r'''(?:fontSize\s*=|font-size:)\s*[`'"]?\s*\d''', js))
    n['corners'] = len(re.findall(r'''(?:borderRadius\s*=|border-radius:)\s*[`'"]?\s*\d''', js))
    n['shadows'] = len(re.findall(r'''(?:boxShadow\s*=|textShadow\s*=|box-shadow:|text-shadow:)\s*[`'"]?\s*(?:inset|\d)''', js))
    n['speeds'] = len(re.findall(r'\bduration:\s*\d', js)) + len(re.findall(r'cubic-bezier\(', js))
    return n


def measure():
    """-> {(where, kind): count}, {(file, kind): count}"""
    totals, files = collections.Counter(), collections.Counter()
    for path in sorted(glob.glob(os.path.join(ASSETS, '*.css'))):
        name = os.path.basename(path)
        if name == NAMED:
            continue
        with open(path, encoding='utf-8') as f:
            got = count_css(f.read())
        for kind in KINDS:
            totals[('styles', kind)] += got[kind]
            files[(name, kind)] = got[kind]
    for path in sorted(glob.glob(os.path.join(ASSETS, 'js', '**', '*.js'), recursive=True)):
        name = os.path.relpath(path, ASSETS)
        with open(path, encoding='utf-8') as f:
            got = count_js(f.read())
        for kind in KINDS:
            totals[('scripts', kind)] += got[kind]
            if got[kind]:
                files[(name, kind)] = got[kind]
    return totals, files


def recorded():
    """-> the recorded totals and per-file counts, or (None, None) when nothing is recorded yet."""
    if not os.path.exists(EXPECTED):
        return None, None
    totals, files = {}, {}
    with open(EXPECTED, encoding='utf-8') as f:
        for line in f:
            m = re.match(r'^(.+?) \| (.+?): (\d+)$', line.strip())
            if m:
                (totals if m.group(1) in ('styles', 'scripts') else files)[(m.group(1), m.group(2))] = int(m.group(3))
    return totals, files


def write(totals, files):
    os.makedirs(os.path.dirname(EXPECTED), exist_ok=True)
    with open(EXPECTED, 'w', encoding='utf-8') as f:
        f.write('# Values typed by hand instead of taken from a name in tokens.css (tests/drift.py).\n'
                '# The first ten lines are the limits; the rest only help find where a new one crept in.\n')
        for where in ('styles', 'scripts'):
            for kind in KINDS:
                f.write(f'{where} | {kind}: {totals[(where, kind)]}\n')
        for (name, kind), n in sorted(files.items()):
            if n:
                f.write(f'{name} | {kind}: {n}\n')


def run(accept=False, verbose=False):
    """-> (the one line to print, [failure sentences])"""
    totals, files = measure()
    want, want_files = recorded()
    summary = ', '.join(f'{sum(totals[(w, k)] for w in ("styles", "scripts"))} {k}' for k in KINDS)
    if verbose:
        for (name, kind), n in sorted(files.items()):
            if n:
                print(f'  {name} | {kind}: {n}')
    if want is None:
        if accept:
            write(totals, files)
            return f'Drift: recorded ({summary})', []
        return 'Drift: FAILED', ['nothing is recorded yet: run tests/run.sh --accept drift']
    up, down = [], []
    for where in ('styles', 'scripts'):
        for kind in KINDS:
            now, was = totals[(where, kind)], want.get((where, kind), 0)
            if now > was:
                gained = [f'{name} ({want_files.get((name, k), 0)} to {n})' for (name, k), n in sorted(files.items())
                          if k == kind and name.endswith('.css') == (where == 'styles') and n > want_files.get((name, k), 0)]
                up.append(f'{now - was} more hand-typed {kind} in the {where} ({was} to {now}): {", ".join(gained) or "see tests/run.sh -v drift"}.'
                          f' Use a name from public/assets/tokens.css (DESIGN.md, section 2).')
            elif now < was:
                down.append(f'{kind} in the {where} {was} to {now}')
    if accept:
        if up:
            return 'Drift: FAILED', up + ['not recorded: --accept only records lower numbers (CLAUDE.md, Checks, says what to do if a raw value is truly needed)']
        write(totals, files)
        return f'Drift: recorded ({summary})', []
    if up:
        return 'Drift: FAILED', up
    if down:
        return f'Drift: passed, and lower than recorded ({"; ".join(down)}): lock it in with tests/run.sh --accept drift', []
    return f'Drift: passed, no new hand-typed values ({summary})', []


if __name__ == '__main__':
    import sys
    line, fails = run('--accept' in sys.argv, '-v' in sys.argv)
    print(line)
    for f in fails:
        print(f'  ✗ {f}')
    sys.exit(1 if fails else 0)
