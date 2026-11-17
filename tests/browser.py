"""The essential paths, walked in a real browser by a script (no session needed).

Run with `tests/run.sh browser` (or as part of `tests/run.sh`).

Which browser: one, never two. Safari's engine, hidden (`SafariEngine`: WebKit as
Playwright builds it, fetched once by `python3 tests/get_browser.py --webkit`;
nothing appears on screen). Safari is what the owner uses and where plain web code
breaks first, so one run there covers both. Without it, Chrome's headless shell
(`python3 tests/get_browser.py`), else Safari itself (a window opens and must be
left alone; needs Settings > Developer > "Allow remote automation").
`MUTT_BROWSER=chrome` or `MUTT_BROWSER=safari tests/run.sh browser` picks one on
purpose. Chrome and Safari are driven over plain WebDriver with the standard library.

How it works: a fresh server with a made-up account (`seed`), then each function
in PATHS walks one path and raises Fail("plain sentence") if something is wrong.
`s.shot('name')` saves a picture to tests/shots/latest at that moment. Nothing
compares pictures; `tests/run.sh browser --keep` copies them to tests/shots/before
so a later run can be looked at side by side when someone asks.

Adding a path: write `def my_path(s, seeded): ...` and add it to PATHS. Keep to
one path per feature: get there, do the one thing, check the one result, shot.
Seed what it needs in `seed()` so it never leans on another path.
"""
import base64, http.cookiejar, json, os, shutil, subprocess, sys, tempfile, time, urllib.error, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
# This run's own ports (tests/ports.py): with fixed ones, a second session's run
# would drive the first one's server and browser driver.
from ports import free_ports
PORT, DRIVER_PORT = free_ports(2)
SITE = f'http://localhost:{PORT}'
SHOTS = os.path.join(HERE, 'shots', 'latest')
ELEMENT = 'element-6066-11e4-a52e-4f735466cecf'
NAME, CODE = 'tester', '482193'
DESK, PHONE = (1280, 800), (375, 812)
ENTER = '\ue007'
LOOKS = ('ocean', 'terran', 'gas', 'lava', 'ice', 'desert', 'pearl', 'storm')   # eight of a planet's twelve kinds (api.PLANET_LOOKS)


class Fail(Exception):
    pass


class Browser:
    def __init__(self):
        import get_browser
        hidden = None if os.environ.get('MUTT_BROWSER') == 'safari' else get_browser.paths()
        self.kind = 'the hidden browser' if hidden else 'Safari'
        if hidden:
            command = [hidden[1], f'--port={DRIVER_PORT}']
            wants = {'browserName': 'chrome', 'goog:chromeOptions': {'binary': hidden[0], 'args': [
                '--headless', '--hide-scrollbars', '--mute-audio', f'--window-size={DESK[0]},{DESK[1]}']}}
        else:
            command = ['/usr/bin/safaridriver', '-p', str(DRIVER_PORT)]
            wants = {'browserName': 'safari'}
        self.hidden = bool(hidden)
        self.driver = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.base = None
        for _ in range(40):
            try:
                urllib.request.urlopen(f'http://localhost:{DRIVER_PORT}/status', timeout=1).read()
                break
            except Exception:
                time.sleep(0.1)
        made = self.call('POST', '/session', {'capabilities': {'alwaysMatch': wants}}, raw=True)
        if 'sessionId' not in made:
            self.driver.terminate()
            raise Fail(made.get('message', 'the browser would not start'))
        self.base = '/session/' + made['sessionId']
        self.n = 0

    def call(self, method, path, body=None, raw=False):
        url = f'http://localhost:{DRIVER_PORT}{"" if raw else self.base}{path}'
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, method=method, data=data, headers={'Content-Type': 'application/json'})
        try:
            return json.load(urllib.request.urlopen(req, timeout=60))['value']
        except urllib.error.HTTPError as e:
            value = json.load(e)['value']
            if raw:
                return value
            raise Fail(f"the browser said: {(value.get('message') or value.get('error') or '').splitlines()[0]}")

    def quit(self):
        try:
            if self.base:
                self.call('DELETE', '')
        except Exception:
            pass
        self.driver.terminate()

    # --- moving about
    def size(self, wh):
        if self.hidden:   # the hidden browser has no window; set the page's size itself
            self.call('POST', '/goog/cdp/execute', {'cmd': 'Emulation.setDeviceMetricsOverride', 'params': {
                'width': wh[0], 'height': wh[1], 'deviceScaleFactor': 1, 'mobile': False}})
        else:
            self.call('POST', '/window/rect', {'x': 0, 'y': 0, 'width': wh[0], 'height': wh[1]})

    def go(self, path):
        self.call('POST', '/url', {'url': SITE + path})

    def js(self, script, *args):
        return self.call('POST', '/execute/sync', {'script': script, 'args': list(args)})

    def fetch(self, path):
        """GET a JSON address as the signed-in browser."""
        return self.call('POST', '/execute/async', {'args': [path], 'script':
            'const done = arguments[arguments.length - 1];'
            'fetch(arguments[0]).then((r) => r.json()).then(done, () => done(null));'})

    def path(self):
        return self.js('return location.pathname + location.search')

    def wait(self, script, sorry, seconds=8, args=()):
        """Until `script` returns something truthy; else Fail(sorry)."""
        end = time.time() + seconds
        while True:
            got = self.js(script, *args)
            if got:
                return got
            if time.time() > end:
                raise Fail(sorry)
            time.sleep(0.1)

    def see(self, css, sorry, seconds=8):
        """Wait for something matching `css` to be on the page and showing."""
        return self.wait(
            'const el = [...document.querySelectorAll(arguments[0])].find((e) => e.getClientRects().length'
            ' && getComputedStyle(e).visibility !== "hidden"); return el || null;', sorry, seconds, (css,))

    def gone(self, css, sorry, seconds=8):
        self.wait('return ![...document.querySelectorAll(arguments[0])].some((e) => e.getClientRects().length)',
                  sorry, seconds, (css,))

    def named(self, css, text, sorry, seconds=8):
        """The showing element matching `css` whose words are (or start with) `text`."""
        return self.wait(
            'const want = arguments[1].toLowerCase();'
            'return [...document.querySelectorAll(arguments[0])].find((e) => e.getClientRects().length'
            ' && e.textContent.trim().toLowerCase().startsWith(want)) || null;', sorry, seconds, (css, text))

    def click(self, el):
        """A real click. `el` is a css selector (best: it is found afresh if the page
        redraws under it) or what see()/named() gave back."""
        for attempt in range(4):
            target = self.see(el, f'nothing to click at {el}') if isinstance(el, str) else el
            try:
                self.call('POST', f'/element/{target[ELEMENT]}/click', {})
                return
            except Fail as e:
                redrawn = 'stale' in str(e)
                if redrawn and isinstance(el, str) and attempt < 3:
                    time.sleep(0.2)
                    continue
                if redrawn:
                    raise Fail(f'the page redrew just as it was clicked ({e})')
                # refused because something still gliding sits over it: press it directly
                self.js('arguments[0].click()', target)
                return

    def type(self, el, text):
        if isinstance(el, str):
            el = self.see(el, f'nowhere to type at {el}')
        self.call('POST', f'/element/{el[ELEMENT]}/value', {'text': text})

    def settle(self, seconds=0.6):
        time.sleep(seconds)

    def no_sideways_scroll(self, where):
        wide = self.js('return [document.documentElement.scrollWidth, document.body.scrollWidth, innerWidth]')
        if max(wide[0], wide[1]) > wide[2] + 1:
            raise Fail(f'{where} scrolls sideways at phone width ({max(wide[0], wide[1])}px of page in a {wide[2]}px screen)')

    def press(self, key):
        """One key on whatever has focus: 'Tab', 'Escape', 'Enter' or a plain one ('/')."""
        code = {'Tab': '\ue004', 'Escape': '\ue00c', 'Enter': '\ue007', 'ArrowDown': '\ue015'}.get(key, key)   # a plain key ("/") is itself
        self.call('POST', '/actions', {'actions': [{'type': 'key', 'id': 'kb', 'actions': [
            {'type': 'keyDown', 'value': code}, {'type': 'keyUp', 'value': code}]}]})

    def png(self):
        return base64.b64decode(self.call('GET', '/screenshot'))

    def shot(self, name):
        self.n += 1
        png = os.path.join(SHOTS, f'{self.n:02d}-{name}.png')
        with open(png, 'wb') as f:
            f.write(self.png())
        jpg = png[:-4] + '.jpg'   # a tenth of the size, plenty to look at
        done = subprocess.run(['sips', '-Z', '1400', '-s', 'format', 'jpeg', '-s', 'formatOptions', '70', png, '--out', jpg],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if done.returncode == 0:
            os.remove(png)

    def sign_out(self):
        self.call('DELETE', '/cookie')
        self.js('try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}')


class SafariEngine(Browser):
    """Safari's engine (WebKit as Playwright builds it), hidden: the browser paths' first choice.

    Playwright speaks its own language, not WebDriver, so this gives the paths the
    same moves as Browser: scripts are WebDriver-style bodies (`arguments`, `return`),
    an element comes back as something to click or type into, and a click is a real
    pointer press at the middle of the element, or a direct .click() when something
    still gliding sits over it (as Browser does when WebDriver refuses).
    """

    def __init__(self):
        import get_browser
        site = get_browser.webkit()
        if not site:
            raise Fail("Safari's engine is not fetched (python3 tests/get_browser.py --webkit)")
        os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', get_browser.WEBKIT_BROWSERS)
        sys.path.insert(0, site)
        from playwright.sync_api import sync_playwright, Error
        self.Error, self.kind, self.hidden, self.n = Error, "Safari's engine", True, 0
        self.pw = sync_playwright().start()
        try:
            self.browser = self.pw.webkit.launch(headless=True)
            self.context = self.browser.new_context(viewport={'width': DESK[0], 'height': DESK[1]})
        except Error as e:
            self.pw.stop()
            raise Fail(str(e).splitlines()[0])
        self.page = self.context.new_page()
        self.page.set_default_timeout(60000)

    def quit(self):
        for done in (self.context.close, self.browser.close, self.pw.stop):
            try:
                done()
            except Exception:
                pass

    def size(self, wh):
        self.page.set_viewport_size({'width': wh[0], 'height': wh[1]})

    def go(self, path):
        self.page.goto(SITE + path)

    def js(self, script, *args):
        try:
            got = self.page.evaluate_handle(f'(args) => (function () {{ {script} \n}}).apply(null, args)', list(args))
        except self.Error as e:
            raise Fail(f'the browser said: {str(e).splitlines()[0]}')
        el = got.as_element()
        if el:
            return el
        value = got.json_value()
        got.dispose()
        return value

    def fetch(self, path):
        return self.page.evaluate('(p) => fetch(p).then((r) => r.json()).catch(() => null)', path)

    def click(self, el):
        for attempt in range(4):
            target = self.see(el, f'nothing to click at {el}') if isinstance(el, str) else el
            # A real click lands where the thing was measured, so wait until it stops
            # moving (a menu still growing open would put the click on the next row).
            where = 'const r = arguments[0].isConnected && arguments[0].getBoundingClientRect(); return r ? [r.x, r.y, r.width, r.height] : null;'
            last = self.js(where, target)
            for _ in range(20):
                time.sleep(0.05)
                now = self.js(where, target)
                if now == last:
                    break
                last = now
            spot = self.js(
                'const el = arguments[0]; if (!el.isConnected) return "gone";'
                'let r = el.getBoundingClientRect();'
                'if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) {'
                '  el.scrollIntoView({ block: "center", inline: "center" }); r = el.getBoundingClientRect(); }'
                'const x = r.left + r.width / 2, y = r.top + r.height / 2, top = document.elementFromPoint(x, y);'
                'return top && (top === el || el.contains(top)) ? [x, y] : null;', target)
            if spot == 'gone':
                if isinstance(el, str) and attempt < 3:
                    time.sleep(0.2)
                    continue
                raise Fail('the page redrew just as it was clicked')
            if spot:
                self.page.mouse.click(*spot)
            else:
                self.js('arguments[0].click()', target)
            return

    def type(self, el, text):
        if isinstance(el, str):
            el = self.see(el, f'nowhere to type at {el}')
        el.focus()
        for i, part in enumerate(text.split(ENTER)):
            if i:
                self.page.keyboard.press('Enter')
            if part:
                self.page.keyboard.type(part)

    def press(self, key):
        self.page.keyboard.press(key)

    def png(self):
        return self.page.screenshot()

    def sign_out(self):
        self.context.clear_cookies()
        self.js('try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}')


# --- the made-up account every path starts from

LONG = ('The harbour was quiet that morning. Nobody had come down to the boats yet, and the gulls had the '
        'place to themselves. I walked along the wall to the end, where the light stands, and sat for a while. '
        + 'It was the kind of day that asks nothing of you. ' * 20)
RECIPE = ('Banana bread\nServes 8\n\nIngredients\n- 3 ripe bananas\n- 250 g flour\n- 1 tsp baking soda\n\n'
          'Method\n1. Mash the bananas.\n2. Fold in the flour.\n3. Bake 50 minutes at 180C.')


def seed(work):
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    def send(method, path, body=None, raw=None, kind='application/json'):
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        req = urllib.request.Request(SITE + path, method=method, data=data, headers={'Content-Type': kind, 'X-Mutt': '1'})
        return json.load(opener.open(req, timeout=20))

    send('POST', '/api/auth/signup', {'username': NAME, 'pin': CODE})
    ids = {}

    def planet(title, notes=()):
        ids[title] = send('POST', '/api/drawers', {'title': title})['drawer']['id']
        # the one-time tip isn't under test; and each planet is given its kind, so it is the same
        # sort of world on every run (its exact colours still come from its id, which is new each run)
        send('PATCH', f'/api/drawers/{ids[title]}', {'modes': {'shareTip': False}, 'look': LOOKS[(len(ids) - 1) % len(LOOKS)]})
        for text in notes:
            send('POST', '/api/blocks', {'content': text, 'drawer': ids[title]})
        return ids[title]

    planet('Postcards', ['wish you were here', 'the pier at dusk', 'https://example.com'])
    planet('Shopping', ['milk', 'eggs', 'bread', 'butter'])
    planet('Recipes to try', [RECIPE])
    planet('Essays', [LONG, LONG.replace('harbour', 'station')])
    books = tempfile.mkdtemp(prefix='mutt-books-')
    subprocess.run([sys.executable, os.path.join(HERE, 'make_books.py'), books], check=True, stdout=subprocess.DEVNULL)

    def upload(to):
        for name, kind in (('The Harbour Light.epub', 'application/epub+zip'), ('The Quiet Coast.pdf', 'application/pdf')):
            with open(os.path.join(books, name), 'rb') as f:
                send('POST', f'/api/upload?drawer={to}&name={urllib.request.quote(name)}', raw=f.read(), kind=kind)

    upload(planet('Shelf'))
    # Two planets already in a mode, so the paths that start there don't lean on another path
    planet('Drafts', [LONG, LONG.replace('harbour', 'station')])
    send('PATCH', f'/api/drawers/{ids["Drafts"]}', {'modes': {'documents': {'on': True, 'dismissed': False}}})
    library = planet('Library')
    upload(library)
    shutil.rmtree(books, ignore_errors=True)
    send('PATCH', f'/api/drawers/{library}', {'modes': {'reading': {'on': True, 'dismissed': False}}})
    # Files on more than one planet: two postcards are on Holiday too, and one of its notes on Walks,
    # so the galaxy has two threads (Postcards–Holiday carries 2 files, Holiday–Walks 1)
    holiday = planet('Holiday', ['ferry times', 'pack sun cream'])
    walks = planet('Walks', ['the coast path'])
    # a long note on a planet that isn't a desk, for opening one as a document from the file view
    ids['walk-essay'] = send('POST', '/api/blocks', {'content': LONG, 'drawer': walks})['block']['id']
    on = lambda drawer: {b['content']: b['id'] for b in send('GET', f'/api/drawers/{drawer}')['blocks']}
    for text in ('wish you were here', 'the pier at dusk'):
        send('POST', f'/api/blocks/{on(ids["Postcards"])[text]}/connections', {'drawer': holiday})
    send('POST', f'/api/blocks/{on(holiday)["ferry times"]}/connections', {'drawer': walks})
    # and a neighbour, for the universe
    other = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    other.open(urllib.request.Request(SITE + '/api/auth/signup', method='POST', headers={'Content-Type': 'application/json', 'X-Mutt': '1'},
                                      data=json.dumps({'username': 'neighbour', 'pin': '258093'}).encode()), timeout=20)
    # who leaves a comment on one of the postcards, for the note under the clock
    pier = next(b['id'] for b in send('GET', f'/api/drawers/{ids["Postcards"]}')['blocks'] if b['content'] == 'the pier at dusk')
    other.open(urllib.request.Request(SITE + f'/api/blocks/{pier}/comments', method='POST', headers={'Content-Type': 'application/json', 'X-Mutt': '1'},
                                      data=json.dumps({'body': 'I know this pier! Is it Brighton?'}).encode()), timeout=20)
    # ...and keeps a copy of it on a planet of their own, so the two galaxies share a file
    seaside = json.load(other.open(urllib.request.Request(SITE + '/api/drawers', method='POST', headers={'Content-Type': 'application/json', 'X-Mutt': '1'},
                                                          data=json.dumps({'title': 'Seaside'}).encode()), timeout=20))['drawer']['id']
    other.open(urllib.request.Request(SITE + f'/api/blocks/{pier}/save', method='POST', headers={'Content-Type': 'application/json', 'X-Mutt': '1'},
                                      data=json.dumps({'drawer': seaside}).encode()), timeout=20)

    ids['neighbour'] = other   # (the beam_file path beams you a file as them)

    # someone who will forget their code; their recovery key is kept for the path that uses it
    ids['key'] = json.load(urllib.request.build_opener().open(urllib.request.Request(
        SITE + '/api/auth/signup', method='POST', headers={'Content-Type': 'application/json', 'X-Mutt': '1'},
        data=json.dumps({'username': 'forgetter', 'pin': '304857'}).encode()), timeout=20))['recoveryKey']

    # someone whose account is from before recovery keys: theirs is taken away, as if never given
    urllib.request.build_opener().open(urllib.request.Request(
        SITE + '/api/auth/signup', method='POST', headers={'Content-Type': 'application/json', 'X-Mutt': '1'},
        data=json.dumps({'username': 'keyless', 'pin': '415926'}).encode()), timeout=20)
    import sqlite3
    with sqlite3.connect(os.path.join(work, 'data', 'mutt.db')) as c:
        c.execute("UPDATE users SET recovery_hash = NULL WHERE username = 'keyless'")

    # a postcard written twice, so it has a history (its first words kept)
    wish = next(b['id'] for b in send('GET', f'/api/drawers/{ids["Postcards"]}')['blocks'] if b['content'] == 'wish you were here')
    send('PATCH', f'/api/blocks/{wish}', {'content': 'wish you were here, love from the coast'})
    ids['wish'] = wish

    # two stars (files on no planet), for the constellation path to join
    ids['stars'] = [send('POST', '/api/blocks', {'content': text})['block']['id'] for text in ('sea glass', 'a smooth pebble')]

    # a planet arranged by hand a lot, on three different days, for the board path
    pin = planet('Pinboard', [f'{w} I keep coming back to this one when I think about the harbour and the week we spent there.'
                              for w in ('The blue door by the chandlery.', 'Tide tables pinned in the café window.', 'A gull on the rail, watching.',
                                        'Chips at noon on the sea wall.', 'The lighthouse keeper\'s cottage.', 'Rope and nets drying in the sun.',
                                        'The last ferry out at six.')])
    order = [b['id'] for b in send('GET', f'/api/drawers/{pin}')['blocks']]
    for _ in range(12):
        order = order[1:] + order[:1]
        send('PUT', f'/api/drawers/{pin}/order', {'ids': order, 'hand': True})
    with sqlite3.connect(os.path.join(work, 'data', 'mutt.db')) as c:
        moves = [r[0] for r in c.execute('SELECT rowid FROM hand_moves WHERE drawer_id = ? ORDER BY rowid', (pin,))]
        for n, row in enumerate(moves):
            c.execute('UPDATE hand_moves SET at = at - ? WHERE rowid = ?', ((n % 3) * 2 * 86400, row))

    # the seed itself is checked: each planet must be offered the mode its path expects
    for title, mode in (('Shopping', 'list'), ('Recipes to try', 'cookbook'), ('Essays', 'documents'), ('Shelf', 'reading'), ('Pinboard', 'board')):
        if not send('GET', f'/api/drawers/{ids[title]}/modes')[mode].get('fits'):
            raise Fail(f'the made-up "{title}" planet is no longer offered {mode} mode, so its path can\'t run')
    return ids


# --- the paths

def give_name(s, name):
    s.type('.login-name', name)
    s.wait('return document.querySelector(".login-name").value === arguments[0]', 'the name box did not take typing', 4, (name,))
    s.type('.login-name', ENTER)


def enter_code(s, code):
    s.type(s.see('.pin-input', 'the code box never appeared'), code)


def sign_up(s, seeded):
    s.go('/')
    s.see('.login-name', 'the sign-in page did not appear')
    s.settle(1.5)
    s.shot('login')
    give_name(s, 'newcomer')
    s.wait('return /free/i.test(document.querySelector(".login-prompt")?.textContent || "")',
           'a new name was not told it is free')
    enter_code(s, '739193')
    s.wait('return /once more/i.test(document.querySelector(".login-label:not(.login-about)")?.textContent || "")',
           'a new name was not asked for its code a second time')
    enter_code(s, '739193')
    s.wait('return location.pathname === "/" && !!document.querySelector(".void-core")',
           'picking a code did not land in the new galaxy', 12)
    s.wait('return /^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/.test(document.querySelector(".rk-key")?.value || "")',
           'a new account was not shown its recovery key')
    s.settle(1.5)
    s.shot('galaxy-new')


def sign_in(s, seeded):
    s.go('/')          # Safari can't clear storage before a page of the site is open
    s.sign_out()
    s.go('/')
    s.see('.login-name', 'signing out did not go back to the sign-in page')
    s.settle(1.5)
    give_name(s, NAME)
    s.wait('return /welcome back/i.test(document.querySelector(".login-prompt")?.textContent || "")',
           'a known name was not welcomed back')
    enter_code(s, '000093')
    s.wait('return (document.querySelector(".login-msg")?.textContent || "").trim().length > 0',
           'a wrong code gave no message')
    if s.path() != '/login':
        raise Fail('a wrong code let someone in')
    s.wait('const i = document.querySelector(".pin-input"); return i && !i.disabled && i.value === ""',
           'the code box did not clear after a wrong code')
    s.settle(1.2)
    enter_code(s, CODE)
    s.wait('return location.pathname === "/" && document.querySelectorAll(".planet").length >= 7',
           'the right code did not open the galaxy with its 7 planets', 12)
    s.settle(1.5)
    s.shot('galaxy')


def heard(s, ask='soundsHeard'):
    """The names of the sounds played lately (sound.js keeps the last 40). A browser driven by a test
    plays them into a silent end, so nobody at the computer hears them; `loudest` reads its meter."""
    s.js('window.__heard = null; const v = (document.querySelector("script[src*=\'main.js\']")?.src.match(/\\?v=[^&]+/) || [""])[0];'
         f'import("/assets/js/sound.js" + v).then((m) => {{ window.__heard = m.{ask}(); }});')
    s.wait('return window.__heard !== null', 'the sound module could not be asked what it played')
    return s.js('return window.__heard')


def loudest(s):
    """How loud the silent end got since last asked (0 to 1)."""
    return heard(s, 'soundsLoudest')


def sounds(s, seeded):
    """Sound is on from the start: signing in, a sheet and a choice in it, and diving into a planet each make
    their own sound, and once it's switched off nothing more plays."""
    s.go('/')
    s.sign_out()
    s.go('/')
    s.see('.login-name', 'the sign-in page did not appear')
    s.settle(1.5)
    give_name(s, NAME)
    s.wait('return /welcome back/i.test(document.querySelector(".login-prompt")?.textContent || "")', 'a known name was not welcomed back')
    enter_code(s, CODE)
    s.wait('return location.pathname === "/" && document.querySelectorAll(".planet").length >= 7', 'the right code did not open the galaxy', 12)
    s.settle(1.5)
    if 'hello' not in heard(s):
        raise Fail(f'signing in made no sound (heard {heard(s)})')
    if not loudest(s) > 0.001:
        raise Fail('signing in was counted as a sound, but nothing came out of the silent end')
    s.click(s.see('.sb-who', 'the account button is missing'))
    s.see('.sheet-settings.is-open', 'the account sheet did not open')
    s.settle(0.6)
    s.click(s.named('.sheet-settings .seg-btn', 'Calm', 'the Motion bar has no Calm'))
    s.settle(0.4)
    s.click(s.named('.sheet-settings .seg-btn', 'Lively', 'the Motion bar has no Lively'))
    s.settle(0.4)
    got = heard(s)
    for name in ('sheet', 'select'):
        if name not in got:
            raise Fail(f'no "{name}" sound (heard {got})')
    if 'press' in got[got.index('sheet'):]:
        raise Fail(f'a press with a sound of its own also clicked (heard {got})')
    s.press('Escape')
    s.settle(0.6)
    s.click(s.named('.planet', 'Postcards', 'the Postcards planet is not in the galaxy'))
    s.wait('return location.pathname.startsWith("/p/")', 'clicking a planet did not open it')
    s.settle(1)
    if 'dive' not in heard(s):
        raise Fail(f'opening a planet made no sound (heard {heard(s)})')
    # Switched off in the account sheet: after a reload nothing plays and the sounds aren't even fetched.
    s.click(s.see('.sb-who', 'the account button is missing'))
    s.see('.sheet-settings.is-open', 'the account sheet did not open')
    s.settle(0.6)
    off = s.js('const row = [...document.querySelectorAll(".sheet-settings .set-row")].find((r) => r.querySelector(".set-label")?.textContent === "Sounds");'
               'return row ? [...row.querySelectorAll(".seg-btn")].find((b) => b.textContent === "Off") : null')
    if not off:
        raise Fail('the account sheet has no Sounds row with Off')
    s.click(off)
    s.wait('return document.documentElement.dataset.sound === "off"', 'pressing Off did not switch Sounds off')
    s.settle(1)
    s.go('/')
    s.settle(1.5)
    s.click(s.see('.sb-who', 'the account button is missing'))
    s.settle(0.8)
    s.press('Escape')
    s.settle(0.5)
    if heard(s):
        raise Fail(f'sounds played with Sound off (heard {heard(s)})')
    if s.js('return performance.getEntriesByType("resource").some((e) => e.name.includes("soundbank"))'):
        raise Fail('the sounds were fetched with Sound off')


def forgot_code(s, seeded):
    """Two wrong codes offer a way back in; the recovery key picks a new code and gives a new key."""
    s.go('/')
    s.sign_out()
    s.go('/login?new=1')
    s.see('.login-name', 'the sign-in page did not appear')
    s.settle(1.5)
    give_name(s, 'forgetter')
    s.wait('return /welcome back/i.test(document.querySelector(".login-prompt")?.textContent || "")',
           'a known name was not welcomed back')
    for _ in range(2):
        enter_code(s, '000093')
        s.wait('return (document.querySelector(".login-msg")?.textContent || "").trim().length > 0', 'a wrong code gave no message')
        s.wait('const i = document.querySelector(".pin-input"); return i && !i.disabled && i.value === ""',
               'the code box did not clear after a wrong code')
        s.settle(1.2)
    s.click(s.named('.login-other', 'Can’t remember it', 'two wrong codes did not offer a way back in'))
    s.settle(0.8)
    s.shot('forgot-help')
    s.click(s.named('.login-other', 'Use my recovery key', 'there was no way to use a recovery key'))
    s.type('.login-key-input', seeded['key'].lower().replace('-', ' ') + ENTER)
    enter_code(s, '615283')
    s.wait('return /once more/i.test(document.querySelector(".login-label:not(.login-about)")?.textContent || "")',
           'the key did not lead to picking a new code')
    enter_code(s, '615283')
    s.wait('return location.pathname === "/" && /^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/.test(document.querySelector(".rk-key")?.value || "")'
           ' && document.querySelector(".rk-key").value !== arguments[0]',
           'the recovery key did not open the account and give a new key', 12, (seeded['key'],))
    s.settle(1)
    s.shot('forgot-new-key')


def comment_notes(s, seeded):
    """A comment left while you were away shows under the clock on your galaxy and opens its file."""
    s.go('/')
    s.wait('return document.querySelectorAll(".planet").length >= 7', 'the galaxy did not load')
    note = s.see('.cn-note', 'a new comment was not told under the clock')
    if 'neighbour' not in s.js('return arguments[0].textContent', note):
        raise Fail('the note under the clock does not say who commented')
    s.settle(1)
    s.shot('comment-note')
    s.size(PHONE)
    try:
        s.go('/')
        s.see('.cn-note', 'the note under the clock did not show at phone width')
        s.settle(1)
        s.no_sideways_scroll('The galaxy with a comment note')
        s.shot('phone-comment-note')
    finally:
        s.size(DESK)
    s.go('/')
    s.click('.cn-open')
    s.wait('return location.pathname === arguments[0] && new URL(location.href).searchParams.has("b")',
           'pressing the note did not open the file on its planet', 8, (f'/p/{seeded["Postcards"]}',))
    s.wait('return /Brighton/.test(document.querySelector(".vw-cm-list")?.textContent || "")',
           'the file opened from the note does not show the comment')
    s.settle(1)
    s.shot('comment-note-opened')
    s.go('/')
    s.wait('return document.querySelectorAll(".planet").length >= 7', 'the galaxy did not load')
    s.settle(1)
    s.gone('.cn-note', 'a comment already seen was told again')
    s.click('.sb-clock')
    s.wait('return /neighbour/.test(document.querySelector(".cn-note")?.textContent || "")',
           'pressing the clock did not bring back the last comments')
    s.settle(1)
    s.shot('clock-past-comments')
    s.click('.sb-clock')
    s.settle(1)
    s.gone('.cn-note', 'pressing the clock again did not put the comments away')


def note_history(s, seeded):
    """A note changed once shows its history; an earlier copy is marked against now and can be put back."""
    s.go(f'/p/{seeded["Postcards"]}')
    s.click(s.see(f'.cell[data-id="{seeded["wish"]}"] [data-act="more"]', 'the changed note has no ••• button'))
    s.click(s.named('.pop .menu-item', 'History', 'the menu of a note changed once has no "History"'))
    s.see('.vw-hist-row:not(.is-now)', 'a note changed once shows no history in the file view')
    s.wait('return /love from the coast/.test(document.querySelector(".vw-hist-text ins")?.textContent || "")',
           'the earlier copy does not mark the words added since')
    s.settle(1)
    s.shot('note-history')
    s.size(PHONE)
    try:
        s.settle(0.6)
        s.no_sideways_scroll('A note\'s earlier copy')
        s.shot('phone-note-history')
    finally:
        s.size(DESK)
    s.click(s.named('.vw-hist-bar button', 'Put this back', 'the earlier copy has no "Put this back"'))
    s.wait('return document.querySelector(".vw-text-body")?.textContent.trim() === "wish you were here"',
           'Put this back did not bring the earlier words back')
    s.wait('return /Before restoring/.test(document.querySelector(".vw-hist-list")?.textContent || "")',
           'the words it had before were not kept in its history')
    s.settle(1)
    s.shot('note-history-put-back')


def add_through_void(s, seeded):
    s.go('/')
    before = s.wait('return document.querySelectorAll(".planet").length >= 7 && 1', 'the galaxy did not load') and \
        s.fetch('/api/galaxy')['stats']['files']
    s.click('.void-core')
    s.see('.vf-input', 'clicking the void did not open the add box')
    s.type('.vf-input', 'a note dropped into the void')
    s.settle(0.4)
    s.shot('void-add-box')
    s.click('.vf-go')
    end = time.time() + 6
    while s.fetch('/api/galaxy')['stats']['files'] != before + 1:
        if time.time() > end:
            raise Fail(f'adding through the void should leave {before + 1} files, got {s.fetch("/api/galaxy")["stats"]["files"]}')
        time.sleep(0.2)


def open_planet(s, seeded):
    s.go('/')
    s.click(s.named('.planet', 'Postcards', 'the Postcards planet is not in the galaxy'))
    s.wait('return location.pathname.startsWith("/p/")', 'clicking a planet did not open it')
    s.wait('return document.querySelectorAll(".cell:not(.cell-entry)").length === 3',
           'Postcards should show 3 files')
    s.settle(1)
    s.shot('planet')
    # The Share button's icon is who can see the planet, and follows a change.
    icon = 'return document.querySelector(".liv-share-btn .ic").getAttribute("class")'
    if 'ic-globe' not in s.js(icon):
        raise Fail(f'a public planet\'s Share button should show the globe, got {s.js(icon)}')
    s.click(s.see('.liv-share-btn', 'the planet has no Share button'))
    s.click(s.named('.liv-seg [role=tab]', 'Private', 'the Share panel has no Private choice'))
    s.wait('return document.querySelector(".liv-share-btn .ic-lock")', 'Share kept its icon after making the planet private')
    s.click(s.named('.liv-seg [role=tab]', 'Public', 'the Share panel has no Public choice'))
    s.wait('return document.querySelector(".liv-share-btn .ic-globe")', 'Share kept the lock after making the planet public again')


def offer_then(s, seeded, title, yes, view, sorry):
    s.go(f'/p/{seeded[title]}')
    s.see('.lm-offer', f'{title} was not offered {sorry}')
    s.settle(0.8)
    s.shot(f'offer-{sorry.replace(" ", "-")}')
    s.click(s.named('.lm-offer .btn-main', yes, f'the {sorry} offer has no "{yes}" button'))
    s.see(view, f'taking up {sorry} did not show it')
    s.gone('.lm-offer', f'the {sorry} offer stayed after it was taken up')
    s.settle(1)
    s.shot(sorry.replace(' ', '-'))


def list_mode(s, seeded):
    offer_then(s, seeded, 'Shopping', '', '.lm-items .lm-item', 'list mode')
    n = s.js('return document.querySelectorAll(".lm-item").length')
    if n != 4:
        raise Fail(f'the Shopping list should have 4 items, got {n}')


def reading_mode(s, seeded):
    offer_then(s, seeded, 'Shelf', '', '.rp-shelf [role=listitem]', 'reading mode')


def cookbook_mode(s, seeded):
    offer_then(s, seeded, 'Recipes to try', '', '.cb-stack [role=listitem]', 'cookbook mode')


def documents_mode(s, seeded):
    offer_then(s, seeded, 'Essays', '', '.dk-doc', 'documents mode')
    n = s.js('return document.querySelectorAll(".dk-doc").length')
    if n != 2:
        raise Fail(f'the Essays desk should have 2 documents, got {n}')


def undo(s, seeded):
    s.go(f'/p/{seeded["Drafts"]}')
    s.see('.dk-doc', 'Drafts (already in documents mode) did not open as a desk')
    s.click(s.see('[aria-label="Planet options"]', 'the planet page has no ••• menu'))
    s.click(s.named('.pop button, .pop [role=menuitem]', 'Show as files again', 'the ••• menu has no "Show as files again"'))
    s.see('.cell:not(.cell-entry)', 'Show as files again did not bring the files back')
    s.click(s.named('.toast button', 'Undo', 'no Undo was offered after showing as files'))
    s.see('.dk-doc', 'Undo did not bring the desk back')


def document_editor(s, seeded):
    s.go(f'/p/{seeded["Drafts"]}')
    s.see('.dk-open', 'no document on the Drafts desk to open')
    s.click('.dk-open')
    s.see('.de', 'clicking a document did not open the editor')
    s.wait('return /[?&]doc=/.test(location.search)', 'an open document has no address of its own')
    s.wait('return /harbour|station/.test(document.querySelector(".de")?.textContent || "")',
           "the editor opened without the document's words")
    s.settle(1.2)
    s.shot('editor')
    s.click('.de-back')
    s.gone('.de', 'the editor did not close')
    s.see('.dk-doc', 'closing the editor did not return to the desk')


def note_as_document(s, seeded):
    """A long note on a plain planet opens as a document in place of the file view, the planet becomes a desk,
    and closing the document lands on the desk."""
    s.go(f'/p/{seeded["Walks"]}?b={seeded["walk-essay"]}')
    s.see('.viewer', 'the long note did not open in the file view')
    s.settle(1)   # its side is drawn again once the file's details are in
    s.click(s.named('.vw-actions button', 'Open as a document', 'the long note has no "Open as a document"'))
    s.see('.de', '"Open as a document" did not open the editor')
    s.wait('return /[?&]doc=/.test(location.search) && !/[?&]b=/.test(location.search)',
           'the document did not take the file view\'s place in the address')
    s.gone('.viewer', 'the file view stayed open under the document')
    s.settle(1)
    s.shot('note-as-document')
    s.click('.de-back')
    s.gone('.de', 'the editor did not close')
    s.wait('return location.pathname === arguments[0] && !location.search', 'closing the document did not land on the planet',
           8, (f'/p/{seeded["Walks"]}',))
    s.gone('.viewer', 'closing the document went back to the note')
    s.see(f'.dk-doc[data-id="{seeded["walk-essay"]}"], .dk-doc [data-id="{seeded["walk-essay"]}"]',
          'opening a note as a document did not make the planet a desk with it on')
    s.settle(1)
    s.shot('note-as-document-desk')


def open_book(s, seeded):
    s.go(f'/p/{seeded["Library"]}')
    s.see('.rp-open[aria-label="Read The Harbour Light"]', 'The Harbour Light is not on the shelf')
    s.click('.rp-open[aria-label="Read The Harbour Light"]')   # by its address: the shelf redraws once as it loads
    s.see('.rd', 'clicking a book did not open the reader')
    s.wait('return /Harbour Light/.test(document.querySelector(".rd-title")?.textContent || "")'
           ' && document.querySelector(".rd-flow")?.childElementCount > 0', 'the reader opened without the book in it (it starts on the cover)')
    s.settle(1.5)
    s.shot('reader')


def universe(s, seeded):
    s.go('/')
    s.wait('return document.querySelectorAll(".planet").length >= 7', 'the galaxy did not load')
    s.js('window.scrollTo(0, document.documentElement.scrollHeight)')
    s.wait('return document.querySelector(".world").classList.contains("is-out")', 'scrolling out did not reach the universe')
    s.wait('return /neighbour/.test(document.body.textContent)',
           'the universe does not show the other person (@neighbour)')
    # someone with no name is asked for one, at the top right, every time they go out
    tip = s.see('.name-tip', 'going out into the universe with no name did not ask for one', 6)
    s.settle(1.2)
    s.shot('universe')
    box = s.js('const r = arguments[0].getBoundingClientRect(); return [r.right, r.top]', tip)
    if box[0] < 1280 - 40 or box[1] > 120:
        raise Fail(f'the name tip is not at the top right (its right edge at {box[0]}, top at {box[1]})')
    s.size(PHONE)
    try:
        s.settle(0.6)
        s.no_sideways_scroll('The universe with the name tip')
        s.shot('phone-name-tip')
    finally:
        s.size(DESK)
    s.click(s.named('.name-tip button', 'Not now', 'the name tip had no Not now'))
    s.gone('.name-tip', 'Not now did not put the name tip away')
    s.js('window.scrollTo(0, 0)')
    s.wait('return !document.querySelector(".world").classList.contains("is-out")', 'scrolling back did not come home')
    s.settle(0.6)
    s.js('window.scrollTo(0, document.documentElement.scrollHeight)')
    s.type(s.see('.name-tip-field', 'going out again did not ask for a name again', 6), 'Sam Seed')
    s.click(s.named('.name-tip button', 'Save', 'the name tip had no Save'))
    s.gone('.name-tip', 'Save did not put the name tip away')
    if s.js('return fetch("/api/me").then((r) => r.json()).then((d) => (d.user || d).name)') != 'Sam Seed':
        raise Fail('Save in the name tip did not keep the name')
    # the paths after this one expect no name
    s.js('return fetch("/api/me/name", { method: "PUT", headers: { "Content-Type": "application/json", "X-Mutt": "1" }, body: JSON.stringify({ name: "" }) }).then((r) => r.ok)')
    s.js('window.scrollTo(0, 0)')
    s.wait('return !document.querySelector(".world").classList.contains("is-out")', 'scrolling back did not come home')


def search_gravity(s, seeded):
    """Search on the galaxy: what it finds lifts off its planets and gathers round the void, its planets
    stay lit, the arrow key reaches it, it opens, and closing the file brings search back."""
    s.go('/')
    s.wait('return document.querySelectorAll(".planet").length >= 7', 'the galaxy did not load')
    s.press('/')
    s.type(s.see('.sheet.is-open .search-input', 'pressing / did not open search'), 'pier')
    s.wait('return document.querySelectorAll(".gx-found:not([inert]) .gx-found-file").length === 1',
           'the postcard that says "pier" did not gather round the void')
    lit = s.js('return [...document.querySelectorAll(".planet.is-found")].map((p) => p.planet.title).sort()')
    if lit != ['Holiday', 'Postcards']:
        raise Fail(f'the planets lit while searching "pier" were {lit}, not the two it is on (Holiday, Postcards)')
    s.press('ArrowDown')
    s.wait('return document.activeElement?.classList.contains("gx-found-file")', 'the down arrow in the box did not reach the file')
    s.settle(1.0)
    s.shot('search-gravity')
    s.press('Enter')
    s.wait('return new URL(location.href).searchParams.has("b") && !!document.querySelector(".room")', 'pressing the file did not open it')
    s.press('Escape')
    s.wait('return !document.querySelector(".room") && !!document.querySelector(".sheet.is-open .search-input")?.value',
           'closing the file did not bring search back as it was')
    s.press('Escape')
    s.wait('return !document.querySelector(".gx-scene.is-seeking") && !document.querySelector(".gx-found:not([inert]) .gx-found-file")',
           'closing search did not send the file home')


def shared_files(s, seeded):
    """Files on more than one planet: threads on the galaxy, "also on" under the file box and in the file view."""
    s.go('/')
    s.wait('const c = document.querySelector(".gx-threads"); return document.querySelectorAll(".gx-thread-note").length === 2 && c && c.width > 0',
           'the two pairs of planets that share files were not joined by threads', 10)
    s.settle(1.5)
    s.shot('threads-rest')
    s.js('const p = [...document.querySelectorAll(".planet")].find((e) => e.planet?.title === "Holiday");'
         'p.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));')
    s.wait('return [...document.querySelectorAll(".gx-thread-note.is-on")]'
           '.map((n) => n.textContent).sort().join() === "1 file,2 files"', 'pointing at Holiday did not light its two threads with how many files each carries')
    s.settle(1)
    s.shot('threads')
    s.go(f'/p/{seeded["Postcards"]}')
    s.wait('return document.querySelectorAll(".cell .cell-also").length === 2', 'the two postcards also on Holiday showed no "also on" in their captions')
    s.settle(1)
    s.shot('also-on-boxes')
    s.click(s.named('.cell', 'the pier at dusk', 'the pier postcard is not on Postcards'))
    s.wait('return /^also on 1 planet$/i.test(document.querySelector(".vw-conn-label")?.textContent || "")',
           'the file view did not say the file is also on one other planet')
    s.click(s.named('.vw-conn', 'Holiday', 'the file view did not list Holiday'))
    s.wait('return location.pathname === arguments[0] && !!document.querySelector(".viewer")',
           'pressing Holiday did not open the same file on Holiday', 8, (f'/p/{seeded["Holiday"]}',))
    s.settle(1)
    s.shot('also-on-viewer')
    s.go('/universe')
    s.wait('return document.querySelector(".world")?.classList.contains("is-out") && /neighbour/.test(document.body.textContent)',
           'the universe did not open', 10)
    near = s.js('const els = [...document.querySelectorAll(".uvg")]; const at = (u) => els.find((e) => e.dataset.user === u)?.getBoundingClientRect();'
                'const a = at(arguments[0]); const b = at("neighbour"); return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null;', NAME)
    if near is None:
        raise Fail('the universe is missing your galaxy or the neighbour\'s')
    s.settle(1.2)
    s.shot('universe-shared')
    s.size(PHONE)
    try:
        s.go('/')
        s.wait('return document.querySelectorAll(".gx-thread-note").length === 2', 'the threads did not show at phone width', 10)
        s.settle(1.5)
        s.no_sideways_scroll('The galaxy with threads')
        s.shot('phone-threads')
        s.go(f'/p/{seeded["Postcards"]}')
        s.wait('return document.querySelectorAll(".cell .cell-also").length === 2', '"also on" did not show at phone width')
        s.settle(1)
        s.no_sideways_scroll('A planet with "also on"')
        s.shot('phone-also-on')
    finally:
        s.size(DESK)


def sample_page(s, seeded):
    """The hidden page of shared parts: it opens, a real menu opens from it, and it fits a phone."""
    s.go('/parts')
    s.see('.parts .stepper', 'the sample page of parts did not open')
    s.settle(0.8)
    s.shot('parts')
    s.click(s.named('.parts .btn', 'Open a menu', 'the sample page has no "Open a menu" button'))
    s.see('body > .pop .menu-item', 'a menu did not open from the sample page')
    s.js('document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))')
    s.size(PHONE)
    try:
        s.go('/parts')
        s.see('.parts .stepper', 'the sample page did not open at phone width')
        s.settle(0.6)
        s.no_sideways_scroll('The sample page of parts')
        s.shot('phone-parts')
    finally:
        s.size(DESK)


def phone(s, seeded):
    s.size(PHONE)
    try:
        s.go('/')
        s.wait('return document.querySelectorAll(".planet").length >= 7', 'the galaxy did not load at phone width')
        s.settle(1.2)
        s.no_sideways_scroll('The galaxy')
        s.shot('phone-galaxy')
        s.go(f'/p/{seeded["Postcards"]}')
        s.see('.cell-box', 'a planet did not open at phone width')
        s.settle(1)
        s.no_sideways_scroll('A planet page')
        s.shot('phone-planet')
        s.go(f'/p/{seeded["Drafts"]}')
        s.see('.dk-open', 'the desk did not show at phone width')
        s.settle(0.5)
        s.click('.dk-open')
        s.see('.de', 'the editor did not open at phone width')
        s.settle(1.2)
        s.no_sideways_scroll('The document editor')
        s.shot('phone-editor')
    finally:
        s.size(DESK)


def keyboard(s, seeded):
    """Tab stays inside whatever is open on top: here the account sheet (DESIGN.md, section 5 step 10)."""
    s.go('/')
    s.wait('return document.querySelectorAll(".planet").length >= 7', 'the galaxy did not load')
    s.click('.sb-who')
    s.see('.sheet.is-open', 'the account sheet did not open')
    s.settle(0.6)
    visited = set()
    for _ in range(24):
        s.press('Tab')
        where = s.js('const a = document.activeElement; if (!a || a === document.body) return "nowhere";'
                     'if (!a.closest(".sheet.is-open")) return a.getAttribute("aria-label") || a.className || a.tagName;'
                     'return "in:" + [...document.querySelectorAll("*")].indexOf(a);')
        if not where.startswith('in:'):
            raise Fail(f'with the account sheet open, Tab left it and landed on: {where}')
        visited.add(where)
    if len(visited) < 3:   # Safari's own Tab skips buttons; Mutt has to walk them itself
        raise Fail(f'with the account sheet open, Tab only ever reached {len(visited)} control(s)')
    s.shot('keyboard-in-sheet')
    # a door slides the sheet to its own page; Escape steps back first, then closes
    s.click(s.named('.sheet-door', 'Your files', 'the account sheet had no Your files door'))
    s.named('.sheet-settings button', 'Download everything', 'the Your files door did not open its page')
    s.wait('return document.activeElement?.classList.contains("sheet-back")', 'Back did not take the keyboard on the new page')
    s.settle(0.5)
    s.shot('sheet-page')
    s.press('Escape')
    s.named('.sheet-door', 'Your files', 'Escape on a page did not step back to the doors')
    if not s.js('return !!document.querySelector(".sheet-settings.is-open")'):
        raise Fail('Escape on a page closed the whole sheet instead of stepping back')
    s.press('Escape')
    s.gone('.sheet-settings.is-open', 'Escape on the first page did not close the sheet')


def constellation(s, seeded):
    """Carry one star onto another: they join into a constellation, which asks for its name."""
    s.go('/')
    s.wait('return document.querySelectorAll(".planet").length >= 7 && arguments[0].every((id) => document.querySelector(`.star[data-id="${id}"]`))',
           'the galaxy (or its two stars) did not load', args=(seeded['stars'],))
    s.settle(1)
    # a pointer pressed on the first star and carried over the second, as a mouse does it
    s.js('''const [a, b] = arguments[0].map((id) => document.querySelector(`.star[data-id="${id}"]`));
      const mid = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
      const p = mid(a); window.__over = mid(b);
      const ev = (type, at, el = document) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX: at.x, clientY: at.y }));
      ev('pointerdown', p, a); ev('pointermove', { x: p.x + 24, y: p.y }); ev('pointermove', window.__over);''', seeded['stars'])
    s.wait('return document.querySelector(".star.is-target") && /constellation/i.test(document.querySelector(".gx-join-tip")?.textContent || "")',
           'carrying a star over another did not light it with "New constellation"', 4)
    s.shot('constellation-joining')
    s.js('document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 7, pointerType: "mouse", isPrimary: true, button: 0, clientX: window.__over.x, clientY: window.__over.y }))')
    s.see('.gx-fig-namer input', 'two stars joined, but nothing asked for the constellation\'s name')
    s.type('.gx-fig-namer input', 'Beachcombing' + ENTER)
    end = time.time() + 6
    while [c['title'] for c in s.fetch('/api/galaxy').get('constellations', [])] != ['Beachcombing']:
        if time.time() > end:
            raise Fail(f'the constellation should be called Beachcombing, the server has {s.fetch("/api/galaxy").get("constellations")}')
        time.sleep(0.2)
    s.named('.gx-fig .planet-name', 'Beachcombing', 'the constellation\'s name did not show under it')
    s.settle(1)
    s.shot('constellation-named')


def comet(s, seeded):
    """A note made a comet (a reminder) crosses the sky tagged with what it is for and when, and can be
    dealt with (Done). Typing a day into an add box offers nothing (the user: "get rid of the comet nudge
    while typing"); a comet is made from a file's menu or its view."""
    s.go('/')
    s.wait('return document.querySelectorAll(".planet").length >= 7 && 1', 'the galaxy did not load')
    s.click('.void-core')
    s.see('.vf-input', 'clicking the void did not open the add box')
    s.type('.vf-input', 'Dentist tomorrow 3pm')
    s.settle(1.5)
    no_offer = 'return ![...document.querySelectorAll(".dk-hint-btn")].some((b) => b.offsetParent && /comet/i.test(b.textContent))'
    if not s.js(no_offer):
        raise Fail('typing a day into the void still offers a comet')
    s.press('Escape')
    s.js('''return (async () => {
        const send = (method, url, body) => fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-Mutt': '1' },
          body: JSON.stringify(body) }).then((r) => r.json());
        const { block } = await send('POST', '/api/blocks', { content: 'Dentist tomorrow 3pm' });
        await send('POST', `/api/blocks/${block.id}/comet`, { tz: -new Date().getTimezoneOffset() });
      })()''')
    s.go('/')
    s.wait('return document.querySelector(`.gx-comet-hit[aria-label^="Dentist, tomorrow"]`)', 'the note did not come as a comet', 10)
    s.named('.gx-comet-tag.is-shown .gx-comet-tag-name', 'Dentist', 'the comet\'s tag should name what it is for, without its day')
    s.settle(1)
    s.shot('comet')
    # pressed, it opens its note over the sky (not on its planet), where it can be dealt with
    s.js('arguments[0].click()', s.see('.gx-comet-hit[aria-label^="Dentist"]', 'no comet to press'))
    s.see('.vw-comet', "the comet's note did not open with its comet row", 10)
    s.wait('return location.pathname === "/" && 1', 'a comet opened on a planet, not over the sky')
    s.click(s.named('.vw-comet .btn', 'Done', "the comet's note has no Done"))
    s.named('.vw-comet-label', 'Done', 'Done did not say it was done', 6)
    s.shot('comet-done')
    s.press('Escape')
    made = s.fetch('/api/comets')['comets'][0]['id']
    s.js('return fetch(`/api/blocks/${arguments[0]}`, { method: "DELETE", headers: { "X-Mutt": "1" } }).then((r) => r.ok)', made)
    # every comet shows, however many and however far off: seven, one made today for a week from now
    many = s.js('''return (async () => {
        const send = (method, url, body) => fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-Mutt': '1' },
          body: JSON.stringify(body) }).then((r) => r.json());
        const ids = [];
        for (let i = 1; i <= 7; i++) {
          const { block } = await send('POST', '/api/blocks', { content: `Far comet ${i}` });
          const day = new Date(Date.now() + (i === 7 ? 7 : i) * 86400000).toISOString().slice(0, 10);
          await send('POST', `/api/blocks/${block.id}/comet`, { day, time: '12:00', tz: 0 });
          ids.push(block.id);
        }
        return ids;
      })()''')
    s.go('/')
    s.wait('return document.querySelectorAll(".gx-comet-hit").length === 7 && 1', 'not every comet showed in the sky', 10)
    far = s.js('return (() => { const c = [...document.querySelectorAll(".gx-comet")]; return Math.min(...c.map((x) => { const r = x.getBoundingClientRect(); return Math.hypot(r.width, r.height); })); })()')
    if far < 110:   # its box: the head's glow and the tail; a speck's is about 80 across
        raise Fail(f'a comet a week off showed as a speck ({far:.0f} wide)')
    s.shot('comet-many')
    for made in many:
        s.js('return fetch(`/api/blocks/${arguments[0]}`, { method: "DELETE", headers: { "X-Mutt": "1" } }).then((r) => r.ok)', made)
    # a list's items can be comets too: offered under its add box, marked at the item's end, in its menu
    errands = s.js('''return (async () => {
        const send = (method, url, body) => fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-Mutt': '1' },
          body: JSON.stringify(body) }).then((r) => r.json());
        const { drawer } = await send('POST', '/api/drawers', { title: 'Errands' });
        await send('PATCH', `/api/drawers/${drawer.id}`, { modes: { list: { on: true } } });
        for (const t of ['Milk', 'Return the library books Friday']) await send('POST', '/api/blocks', { content: t, drawer: drawer.id });
        return drawer.id;
      })()''')
    s.go(f'/p/{errands}')
    s.see('.lm-input', 'a list planet has no add box')
    s.type('.lm-input', 'Call the plumber tomorrow 9am')
    s.settle(1.5)
    if not s.js(no_offer):
        raise Fail("typing a day into a list's add box still offers a comet")
    s.press('Enter')
    s.wait('return [...document.querySelectorAll(".lm-item")].some((li) => /plumber/.test(li.querySelector(".lm-text")?.value))', 'the item was not added', 6)
    # made one from its menu instead: the box starts from the day it names
    plumber = s.js('return [...document.querySelectorAll(".lm-item")].find((li) => /plumber/.test(li.querySelector(".lm-text")?.value))')
    s.js('const r = arguments[0].getBoundingClientRect(); arguments[0].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 40, clientY: r.top + r.height / 2 }))', plumber)
    s.click(s.named('.menu button, .menu [role=menuitem]', 'Make it a comet…', "an item has no Make it a comet… in its menu"))
    s.click(s.see('.cm-ask .btn-main', 'the comet box did not open'))
    s.wait('return [...document.querySelectorAll(".lm-item")].some((li) => /plumber/.test(li.querySelector(".lm-text")?.value) && li.querySelector(".lm-comet"))',
           'the list item did not come back marked as a comet', 10)
    s.shot('comet-list')
    # anything can be a comet: an item with no day asks when, from its menu
    milk = s.js('return [...document.querySelectorAll(".lm-item")].find((li) => li.querySelector(".lm-text")?.value === "Milk")')
    s.js('const r = arguments[0].getBoundingClientRect(); arguments[0].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 40, clientY: r.top + r.height / 2 }))', milk)
    s.click(s.named('.menu button, .menu [role=menuitem]', 'Make it a comet…', "a file's menu has no Make it a comet…"))
    s.see('.cm-ask .cal-day[aria-selected="true"]', 'a file with no day did not ask when on a calendar')
    s.see('.cm-ask .wheel', 'the comet box has no time wheel')
    s.shot('comet-ask')
    s.click('.cm-ask .btn-main')
    s.wait('return [...document.querySelectorAll(".lm-item")].some((li) => li.querySelector(".lm-text")?.value === "Milk" && li.querySelector(".lm-comet"))',
           'the item given a day by hand did not become a comet', 10)
    # comets go to the top of the list, soonest first
    s.wait('return [...document.querySelectorAll(".lm-item")].slice(0, 2).every((li) => li.classList.contains("is-comet"))',
           'the comets did not move to the top of the list', 6)
    # the box reads what the item says: "Friday" is the first choice, pressed
    books = s.js('return [...document.querySelectorAll(".lm-item")].find((li) => /library/.test(li.querySelector(".lm-text")?.value))')
    s.js('const r = arguments[0].getBoundingClientRect(); arguments[0].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 40, clientY: r.top + r.height / 2 }))', books)
    s.click(s.named('.menu button, .menu [role=menuitem]', 'Make it a comet…', "a file's menu has no Make it a comet…"))
    s.named('.cm-ask-pick[aria-pressed="true"]', '“Friday', 'the comet box did not start from the day the item names')
    s.shot('comet-ask-read')
    s.click(s.named('.cm-ask .btn-quiet', 'Cancel', 'the comet box has no Cancel'))
    for c in s.fetch('/api/comets')['comets']:
        s.js('return fetch(`/api/blocks/${arguments[0]}`, { method: "DELETE", headers: { "X-Mutt": "1" } }).then((r) => r.ok)', c['id'])


def send_to_top(s, seeded):
    # a planet of its own, made here, so the others stay as seeded; last in PATHS for the same reason
    made = s.js('''return (async () => {
        const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Mutt': '1' },
          body: JSON.stringify(body) }).then((r) => r.json());
        const { drawer } = await post('/api/drawers', { title: 'Jottings' });
        for (let n = 1; n <= 13; n++) await post('/api/blocks', { content: `Thought number ${n}, written down so it is not lost.`, drawer: drawer.id });
        // the last is a file, not a note: every file can be sent
        await fetch(`/api/upload?drawer=${drawer.id}&name=photos.zip`, { method: 'POST', headers: { 'Content-Type': 'application/zip', 'X-Mutt': '1' },
          body: 'PK' });
        return drawer.id;
      })()''')
    s.go(f'/p/{made}')
    s.wait('return document.querySelectorAll(".cell[data-id]").length === 14', 'the new planet should show 14 notes')
    s.settle(1)
    menu = '''const cell = document.querySelectorAll(".cell[data-id]")[arguments[0]];
        const r = cell.getBoundingClientRect();
        cell.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 20 }));
        return cell.dataset.id;'''
    rows = 'return [...document.querySelectorAll(".menu [role=menuitem], .menu button")].map((b) => b.textContent.trim())'
    last = s.js(menu, 13)
    s.wait(f'{rows}.includes("Send to top")', 'the last file\'s right-click menu has no "Send to top"')
    s.shot('send-to-top-menu')
    s.click(s.named('.menu button, .menu [role=menuitem]', 'Send to top', 'no "Send to top" row to press'))
    s.wait('return document.querySelector(".cell[data-id]").dataset.id === arguments[0]',
           '"Send to top" did not move the note to the front', 4, (last,))
    s.js('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))')
    s.settle(0.6)
    s.js(menu, 0)
    s.wait(f'{rows}.includes("Send to bottom") && !{rows[7:]}.includes("Send to top")',
           'the first note\'s right-click menu should offer "Send to bottom" only')
    s.click(s.named('.menu button, .menu [role=menuitem]', 'Send to bottom', 'no "Send to bottom" row to press'))
    s.wait('const c = document.querySelectorAll(".cell[data-id]"); return c[c.length - 1].dataset.id === arguments[0]',
           '"Send to bottom" did not move the note to the end', 4, (last,))
    s.settle(0.6)
    s.go(f'/p/{made}')
    s.wait('const c = document.querySelectorAll(".cell[data-id]"); return c.length === 14 && c[13].dataset.id === arguments[0]',
           'the new order was not kept after a reload', 8, (last,))
    s.shot('send-to-bottom-kept')

def key_nudge(s, seeded):
    """An account with no recovery key is asked once, on its own galaxy, to make one; Not now is remembered."""
    s.go('/')
    s.sign_out()
    s.go('/login')
    s.see('.login-name', 'the sign-in page did not appear')
    s.settle(1.5)
    give_name(s, 'keyless')
    s.wait('return /welcome back/i.test(document.querySelector(".login-prompt")?.textContent || "")',
           'a known name was not welcomed back')
    enter_code(s, '415926')
    s.wait('return location.pathname === "/" && !!document.querySelector(".void-core")', 'signing in did not open the galaxy', 12)
    tip = s.see('.key-tip', 'an account with no recovery key was not asked to make one', 12)
    if 'recovery key' not in s.js('return arguments[0].textContent', tip):
        raise Fail('the tip does not say what a recovery key is for')
    s.settle(1)
    s.shot('key-tip')
    s.size(PHONE)
    try:
        s.settle(0.6)
        s.no_sideways_scroll('The galaxy with the key tip')
        s.shot('phone-key-tip')
    finally:
        s.size(DESK)
    s.click(s.named('.key-tip button', 'Not now', 'the tip had no Not now'))
    s.gone('.key-tip', 'Not now did not put the tip away')
    s.go('/')
    s.wait('return !!document.querySelector(".void-core")', 'the galaxy did not load again')
    s.settle(5.5)   # longer than the tip waits before it asks
    if s.js('return !!document.querySelector(".key-tip")'):
        raise Fail('the key tip came back right after Not now')
    # a week later it asks once more, and Make one gives the key
    s.js('localStorage.setItem("mutt:key-asked:keyless", JSON.stringify({ times: 1, at: Date.now() - 8 * 864e5 }))')
    s.go('/')
    s.click(s.named('.key-tip button', 'Make one', 'the tip did not ask again a week after Not now', 12))
    s.wait('return /^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/.test(document.querySelector(".rk-key")?.value || "")',
           'Make one did not give a recovery key')



def split_moons(s, seeded):
    """A planet of two clearly different things offers to split into moons once, in place; Not now
    keeps it in the ••• menu; splitting makes a moon for each and moves the files; Undo puts all back."""
    made = s.js('''return (async () => {
        const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Mutt': '1' },
          body: JSON.stringify(body) }).then((r) => r.json());
        const { drawer } = await post('/api/drawers', { title: 'Weekends' });
        await fetch(`/api/drawers/${drawer.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Mutt': '1' },
          body: JSON.stringify({ modes: { shareTip: false } }) });
        for (let n = 1; n <= 4; n++) {
          await post('/api/blocks', { content: `Bouldering session ${n} at the crag today. My fingers are sore from the crimps, and there was chalk everywhere by the end of it.`, drawer: drawer.id });
          await post('/api/blocks', { content: `Threw bowls on the wheel this evening (${n}). They need trimming before the glaze, and then they go in the kiln on Saturday.`, drawer: drawer.id });
        }
        await post('/api/blocks', { content: 'The tap in the kitchen is dripping again. I should ask someone to come and look at it next week.', drawer: drawer.id });
        return drawer.id;
      })()''')
    files = 'return document.querySelectorAll(".cell[data-id]").length'
    moons = 'return document.querySelectorAll(".liv-world .moon.is-beside").length'
    s.size(PHONE)
    try:
        s.go(f'/p/{made}')
        s.see('.lm-offer', 'a planet of climbing and pottery was not offered a split at phone width')
        s.settle(0.8)
        s.no_sideways_scroll('The split offer')
        s.shot('phone-split-offer')
    finally:
        s.size(DESK)
    s.go(f'/p/{made}')
    offer = s.see('.lm-offer', 'a planet of climbing and pottery was not offered a split')
    words = s.js('return arguments[0].textContent', offer)
    if 'two things' not in words or '4 files are about' not in words:
        raise Fail(f'the split offer should say it holds two things, with the counts; it says: {words}')
    s.settle(0.8)
    s.shot('split-offer')
    s.click(s.named('.lm-offer .btn-quiet', 'Not now', 'the split offer has no "Not now"'))
    s.gone('.lm-offer', '"Not now" did not put the split offer away')
    s.go(f'/p/{made}')
    s.wait(f'{files} === 9', 'the planet should show its 9 files')
    s.settle(1.5)
    if s.js('return !!document.querySelector(".lm-offer")'):
        raise Fail('the split offer came back after "Not now" and a reload')
    s.js('window.muttErrors = []; addEventListener("error", (e) => muttErrors.push(e.message));'
         'addEventListener("unhandledrejection", (e) => muttErrors.push(String(e.reason)));')
    s.click(s.see('[aria-label="Planet options"]', 'the planet page has no ••• menu'))
    s.click(s.named('.pop button, .pop [role=menuitem]', 'Split into moons', 'the ••• menu has no "Split into moons" after Not now'))
    s.wait(f'{moons} === 2 && {files[7:]} === 1', 'splitting did not make two moons and leave one file on the planet')
    s.settle(1.2)
    s.shot('split-done')
    got = sorted((m['title'], m['count']) for m in s.fetch(f'/api/drawers/{made}')['drawer']['moons'])
    if got != [('Climbing', 4), ('Pottery', 4)]:
        raise Fail(f'the moons should be Climbing and Pottery with 4 files each, got {got}')
    s.click(s.named('.toast button', 'Undo', 'no Undo was offered after splitting'))
    s.wait(f'{moons} === 0 && {files[7:]} === 9', 'Undo did not take the moons away and bring the 9 files back')
    s.settle(1)
    s.shot('split-undone')
    # Still: the moons and the files that stay are there at once, nothing left invisible
    s.js('document.documentElement.dataset.motion = "off"')
    s.click(s.see('[aria-label="Planet options"]', 'the planet page has no ••• menu'))
    s.click(s.named('.pop button, .pop [role=menuitem]', 'Split into moons', 'the ••• menu has no "Split into moons" after Undo'))
    s.wait(f'{moons} === 2 && {files[7:]} === 1', 'under Still, splitting did not make two moons')
    s.settle(0.3)
    faint = s.js('return [...document.querySelectorAll(".liv-world .moon.is-beside, .cell[data-id]")]'
                 '.filter((e) => +getComputedStyle(e).opacity < 0.99).length')
    if faint:
        raise Fail(f'under Still, {faint} moon(s) or file(s) were left faint after splitting')
    errors = s.js('return window.muttErrors')
    if errors:
        raise Fail(f'the page had errors while splitting: {errors[:3]}')

def board_mode(s, seeded):
    """A planet arranged by hand on three days is offered a board; taking it lays the files out freely;
    the keyboard moves one and it is kept; a reload opens on the board; Show as files again and Undo."""
    pin = seeded['Pinboard']
    items = 'return document.querySelectorAll(".bd-item.is-file").length'
    watch = ('window.muttErrors = []; addEventListener("error", (e) => muttErrors.push(e.message));'
             'addEventListener("unhandledrejection", (e) => muttErrors.push(String(e.reason)));')

    def no_errors(where):
        errors = s.js('return window.muttErrors || []')
        if errors:
            raise Fail(f'the page had errors {where}: {errors[:3]}')
    # a plain planet fetches none of the board's code
    s.go(f'/p/{seeded["Postcards"]}')
    s.wait('return document.querySelectorAll(".cell[data-id]").length === 3', 'Postcards should show 3 files')
    if s.js('return performance.getEntriesByType("resource").some((r) => /board\\.(js|css)/.test(r.name))'):
        raise Fail('a plain planet fetched the board\'s code')
    # ...but any planet with a few files can be made one from its ••• menu
    s.click(s.see('[aria-label="Planet options"]', 'the planet page has no ••• menu'))
    s.named('.pop button, .pop [role=menuitem]', 'Make it a board', 'a plain planet\'s ••• menu has no "Make it a board"')
    s.press('Escape')
    offer_then(s, seeded, 'Pinboard', 'Make it a board', '.bd-item.is-file', 'board mode')
    s.js(watch)
    s.wait(f'{items} === 7', 'the board should hold the 7 files')
    # the keyboard: the first file is reached, an arrow moves it, and the move is kept
    first = s.js('const e = document.querySelector(".bd-item[tabindex=\'0\']"); e.focus(); return [e.dataset.id, parseFloat(e.style.left)]')
    s.press('ArrowRight')
    s.press('ArrowRight')
    s.wait('return (async () => { const b = await fetch(`/api/drawers/${arguments[0]}/board`).then((r) => r.json());'
           ' const it = b.items.find((i) => String(i.id) === String(arguments[1])); return !!it && it.x === arguments[2]; })()',
           'moving a file with the keyboard was not saved', 6, (pin, first[0], first[1] + 16))
    # words written on the board can be taken away with their own button
    s.click(s.named('.bd-bar button', 'Words', 'the board\'s bar has no "Words"'))
    s.type(s.see('.bd-item.is-editing .bd-words', 'pressing Words gave nothing to write in'), 'Harbour')
    s.click(s.see('.bd-item.is-editing .bd-drop', 'words being written have no button to take them away'))
    s.wait('return !document.querySelector(".bd-item.is-words")', 'the words\' button did not take them away')
    no_errors('on the board')
    s.go(f'/p/{pin}')
    s.wait(f'{items} === 7', 'a reload did not open straight on the board')
    s.settle(1)
    s.shot('board')
    s.size(PHONE)
    try:
        s.go(f'/p/{pin}')
        s.wait(f'{items} === 7', 'the board did not open at phone width')
        s.settle(1)
        s.no_sideways_scroll('The board')
        s.shot('phone-board')
    finally:
        s.size(DESK)
    s.go(f'/p/{pin}')
    s.wait(f'{items} === 7', 'the board did not open again')
    s.js(watch)
    s.click(s.see('[aria-label="Planet options"]', 'the board has no ••• menu'))
    s.click(s.named('.pop button, .pop [role=menuitem]', 'Show as files again', 'the board\'s ••• menu has no "Show as files again"'))
    s.wait('return !document.querySelector(".bd") && document.querySelectorAll(".cell[data-id]").length === 7',
           '"Show as files again" did not bring back the 7 files')
    s.click(s.named('.toast button', 'Undo', 'no Undo was offered after showing as files'))
    s.wait(f'{items} === 7', 'Undo did not bring the board back')
    no_errors('showing as files and back')
    # Still: everything on the board is there at once
    s.js('document.documentElement.dataset.motion = "off"')
    s.go(f'/p/{pin}')
    s.wait(f'{items} === 7', 'under Still, the board did not open')
    s.settle(0.3)
    faint = s.js('return [...document.querySelectorAll(".bd-item")].filter((e) => +getComputedStyle(e).opacity < 0.99).length')
    s.js('delete document.documentElement.dataset.motion')
    if faint:
        raise Fail(f'under Still, {faint} thing(s) on the board were left faint')


def beam_file(s, seeded):
    """A file the neighbour beams you rests by the void; its box shows their words; Save as a star makes it your star."""
    def as_them(method, path, body=None):
        return json.load(seeded['neighbour'].open(urllib.request.Request(
            SITE + path, method=method, headers={'Content-Type': 'application/json', 'X-Mutt': '1'},
            data=json.dumps(body).encode() if body is not None else None), timeout=20))
    note = as_them('POST', '/api/blocks', {'content': 'tide times for Saturday'})['block']['id']
    as_them('POST', f'/api/blocks/{note}/beam', {'to': NAME, 'words': 'for the walk'})
    s.go('/')
    s.wait('return document.querySelectorAll(".planet").length >= 7', 'the galaxy did not load')
    s.see('.bm-star:not(.is-quiet)', 'a file beamed by someone you know did not rest by the void')
    s.settle(1)
    s.shot('beam-pile')
    s.click('.bm-star')
    said = s.see('.bm-dialog .bm-said', 'the box did not show their words')
    if 'for the walk' not in s.js('return arguments[0].textContent', said):
        raise Fail('the box shows the wrong words')
    s.settle(1)
    s.shot('beam-box')
    s.size(PHONE)
    s.settle(0.6)
    if s.js('return document.documentElement.scrollWidth > innerWidth'):
        raise Fail('the beam box scrolls sideways at 375 wide')
    s.shot('beam-box-phone')
    s.size(DESK)
    s.click('.bm-actions .btn-main')
    s.gone('.bm-star', 'the beamed file stayed by the void after Save as a star')
    s.wait('return [...document.querySelectorAll(".star")].some((e) => /tide times/.test(e.textContent))',
           'the kept file did not become one of your stars')
    # Beam to… lists everyone without typing: someone met first, by the name they go by, then the rest
    as_them('PUT', '/api/me/name', {'name': 'Nell Fisher'})
    s.js('const v = (document.querySelector("script[src*=\'main.js\']")?.src.match(/\\?v=[^&]+/) || [""])[0];'
         f'window.__beam = "";'
         f'import("/assets/js/beams.js" + v).then((m) => m.beamTo({{ id: {json.dumps(note)}, content: "tide times" }})).catch((e) => {{ window.__beam = String(e); }});')
    try:
        s.wait('return document.querySelectorAll(".bm-people .pp-row").length >= 3', 'no rows')
    except Fail:
        raise Fail(f'Beam to… did not list people before anything was typed {s.js("return window.__beam")!r} '
                   f'{s.js("return document.querySelector(\".bm-dialog\")?.textContent.slice(0, 200)")!r}')
    first = s.js('return document.querySelector(".bm-people .pp-row .pp-name").textContent')
    if not first.startswith('Nell Fisher'):
        raise Fail(f'Beam to… did not put someone you know first by their name: {first!r}')
    s.settle(0.5)
    s.shot('beam-to')
    s.press('Escape')


def drag_to_star(s, seeded):
    """Carry a file to the back arrow in the top-left corner: it comes off the planet and is a star again."""
    made = s.js('''return (async () => {
        const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Mutt': '1' },
          body: JSON.stringify(body) }).then((r) => r.json());
        const { drawer } = await post('/api/drawers', { title: 'Corner' });
        for (let n = 1; n <= 3; n++) await post('/api/blocks', { content: `Corner note ${n}`, drawer: drawer.id });
        return drawer.id;
      })()''')
    s.go(f'/p/{made}')
    s.wait('return document.querySelectorAll(".cell[data-id]").length === 3 && !document.querySelector(".home-back").hidden',
           'the planet (or its back arrow) did not show')
    s.settle(1)
    # its right-click menu says taking it off its only planet makes it a star
    s.js('''const cell = document.querySelectorAll(".cell[data-id]")[0]; const r = cell.getBoundingClientRect();
        cell.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 20 }));''')
    s.wait('return [...document.querySelectorAll(".menu .menu-hint")].some((e) => e.textContent === "Becomes a star")',
           '"Take off Corner" does not say the file becomes a star')
    s.js('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))')
    s.settle(0.6)
    gone = s.js('''return (async () => {
      const cell = document.querySelectorAll(".cell[data-id]")[2];
      const mid = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
      const from = mid(cell), to = mid(document.querySelector(".home-back"));
      const ev = (type, at, el = document) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 12,
        pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: at.x, clientY: at.y }));
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      ev('pointerdown', from, cell);
      for (let i = 1; i <= 20; i++) { await sleep(20); ev('pointermove', { x: from.x + (to.x - from.x) * i / 20, y: from.y + (to.y - from.y) * i / 20 }); }
      await sleep(300);
      window.__say = document.querySelector('.home-back.is-catching.is-target + .home-say')?.textContent || '';
      return cell.dataset.id;
    })()''')
    say = s.js('return window.__say')
    if say != 'Drop to make it a star':
        raise Fail(f'carried over the corner, the back arrow said "{say}", not "Drop to make it a star"')
    s.shot('drag-to-star')
    s.js('''const to = document.querySelector(".home-back").getBoundingClientRect();
        document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 12, pointerType: "mouse", isPrimary: true,
          button: 0, buttons: 0, clientX: to.left + to.width / 2, clientY: to.top + to.height / 2 }));''')
    s.wait('return /^Now a star/.test(document.querySelector(".toast")?.textContent || "")', 'letting go on the corner did not say "Now a star…"', 6)
    s.wait('return !document.querySelector(".home-back.is-catching") && document.querySelectorAll(".cell[data-id]").length === 2',
           'the file stayed on the planet, or the back arrow stayed a star')
    if s.fetch(f'/api/blocks/{gone}')['block'].get('connectionCount'):
        raise Fail('the file dropped on the corner is still on a planet')


def throw_star(s, seeded):
    """Flick a star at the nearest planet: it flies there and is put on it, with an Undo (fling.js)."""
    star = s.js('''return fetch('/api/blocks', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Mutt': '1' },
        body: JSON.stringify({ content: 'a thrown star' }) }).then((r) => r.json()).then((d) => d.block.id)''')
    s.go('/')
    s.wait('return document.querySelectorAll(".planet").length >= 7 && document.querySelector(`.star[data-id="${arguments[0]}"]`)',
           'the galaxy (or the new star) did not load', args=(star,))
    s.settle(1)
    # a quick flick toward the nearest planet, let go well short of it, as a hand does it
    title = s.js('''return (async () => {
      const a = document.querySelector(`.star[data-id="${arguments[0]}"]`);
      const mid = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
      const p = mid(a);
      const near = [...document.querySelectorAll('.gx-field .planet:not(.is-moon)')].map((el) => ({ el, c: mid(el) }))
        .sort((m, n) => Math.hypot(m.c.x - p.x, m.c.y - p.y) - Math.hypot(n.c.x - p.x, n.c.y - p.y))[0];
      const d = Math.hypot(near.c.x - p.x, near.c.y - p.y), ux = (near.c.x - p.x) / d, uy = (near.c.y - p.y) / d;
      const ev = (type, at, el = document) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 11, pointerType: 'mouse',
        isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: at.x, clientY: at.y }));
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      ev('pointerdown', p, a);
      let at = { x: p.x + ux * 10, y: p.y + uy * 10 };
      ev('pointermove', at);
      const step = Math.min(24, (d - 90) / 5);
      for (let i = 0; i < 4; i++) { await sleep(16); at = { x: at.x + ux * step, y: at.y + uy * step }; ev('pointermove', at); }
      ev('pointerup', at);
      return near.el.querySelector('.planet-name')?.textContent || '';
    })()''', star)
    s.wait('return /^Put on /.test(document.querySelector(".toast")?.textContent || "")', 'a star flicked at a planet did not say "Put on …"', 6)
    s.shot('throw-star')
    planet = next((d['id'] for d in s.fetch('/api/galaxy')['planets'] if d['title'] == title), None)
    end = time.time() + 6
    while not planet or star not in [b['id'] for b in s.fetch(f'/api/drawers/{planet}')['blocks']]:
        if time.time() > end:
            raise Fail(f'the thrown star is not on "{title}", the planet it was flicked at')
        time.sleep(0.2)


def live_updates(s, seeded):
    """A file added elsewhere (another device: a change sent without this page's id) shows on the open planet, no reload."""
    s.go('/')
    s.click(s.named('.planet', 'Postcards', 'the Postcards planet is not in the galaxy'))
    s.wait('return document.querySelectorAll(".cell:not(.cell-entry)").length === 3', 'Postcards should show 3 files')
    s.settle(1)
    elsewhere = """const id = location.pathname.split('/')[2];
      window.__live = null;
      fetch('/api/blocks', { method: 'POST', headers: { 'X-Mutt': '1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Written on another device', drawer: id }) })
        .then((r) => r.json()).then((d) => { window.__live = d.block.id; });"""
    s.js(elsewhere)
    s.wait('return window.__live && document.querySelector(`.cell[data-id="${window.__live}"]`)',
           'a file added on another device did not show on the open planet')
    s.shot('live-arrived')
    s.js("""fetch(`/api/blocks/${window.__live}?forever=1`, { method: 'DELETE', headers: { 'X-Mutt': '1' } })""")
    s.wait('return !document.querySelector(`.cell[data-id="${window.__live}"]:not(.is-leaving)`)',
           'a file deleted on another device stayed on the open planet')


PATHS = [sign_up, sign_in, comment_notes, note_history, add_through_void, open_planet, live_updates, list_mode, reading_mode, cookbook_mode,
         documents_mode, undo, document_editor, note_as_document, open_book, universe, search_gravity, shared_files, phone, sample_page, keyboard, constellation, throw_star, comet, send_to_top, drag_to_star,
         split_moons, board_mode, beam_file, sounds, forgot_code, key_nudge]


def run(start_server, stop_server, verbose=False, keep=False, only=()):
    """-> (passed, [failures], why it could not run at all)"""
    import get_browser
    webkit = os.environ.get('MUTT_BROWSER') not in ('chrome', 'safari') and get_browser.webkit()
    work = tempfile.mkdtemp(prefix='mutt-browser-')
    shutil.rmtree(SHOTS, ignore_errors=True)
    os.makedirs(SHOTS)
    server = start_server(work, PORT)
    s, passed, fails = None, 0, []
    try:
        seeded = seed(work)
        try:
            s = SafariEngine() if webkit else Browser()
        except Fail as e:
            if 'remote automation' in str(e).lower():
                return 0, [], ('Safari needs "Allow remote automation" switched on '
                               '(Safari > Settings > Developer). The API checks above still count.')
            return 0, [], f'The browser would not start: {e}. (python3 tests/get_browser.py fetches the hidden one.)'
        s.size(DESK)
        for path in [p for p in PATHS if not only or p is sign_in or p.__name__ in only]:
            name = path.__name__.replace('_', ' ')
            began = time.time()
            try:
                path(s, seeded)
                passed += 1
                if verbose:
                    print(f'  ✓ {name} ({time.time() - began:.1f}s)')
            except Fail as e:
                try:
                    s.shot('FAILED-' + path.__name__)
                except Exception:
                    pass
                fails.append(f'{name}: {e} (picture: tests/shots/latest/*FAILED-{path.__name__}*)')
            except Exception as e:   # the browser itself fell over; say so plainly
                fails.append(f'{name}: the test tripped ({type(e).__name__}: {e})')
            if fails and ('invalid session' in fails[-1] or 'tripped' in fails[-1]):
                fails.append('the browser stopped answering, so the paths after this were not run')
                break
    except Fail as e:
        fails.append(str(e))
    finally:
        if s:
            s.quit()
        crash = stop_server(server, work)
        shutil.rmtree(work, ignore_errors=True)
    if crash:
        fails.append('the server hit an error:\n' + crash)
    if keep and not fails:
        before = os.path.join(HERE, 'shots', 'before')
        shutil.rmtree(before, ignore_errors=True)
        shutil.copytree(SHOTS, before)
    return passed, fails, ''
