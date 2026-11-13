"""The essential paths, walked in a real browser by a script (no session needed).

Run with `tests/run.sh browser` (or as part of `tests/run.sh`).

Which browser: the hidden one if `python3 tests/get_browser.py` has been run once
(Chrome's headless shell in ~/.cache/mutt-tests; nothing appears on screen), else
Safari (a window opens and must be left alone; needs Settings > Developer >
"Allow remote automation"). `MUTT_BROWSER=safari tests/run.sh browser` checks
Safari on purpose. Both are driven over plain WebDriver with the standard library.

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
PORT, DRIVER_PORT = 8098, 4498
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

    def shot(self, name):
        self.n += 1
        png = os.path.join(SHOTS, f'{self.n:02d}-{name}.png')
        with open(png, 'wb') as f:
            f.write(base64.b64decode(self.call('GET', '/screenshot')))
        jpg = png[:-4] + '.jpg'   # a tenth of the size, plenty to look at
        done = subprocess.run(['sips', '-Z', '1400', '-s', 'format', 'jpeg', '-s', 'formatOptions', '70', png, '--out', jpg],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if done.returncode == 0:
            os.remove(png)

    def sign_out(self):
        self.call('DELETE', '/cookie')
        self.js('try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}')


# --- the made-up account every path starts from

LONG = ('The harbour was quiet that morning. Nobody had come down to the boats yet, and the gulls had the '
        'place to themselves. I walked along the wall to the end, where the light stands, and sat for a while. '
        + 'It was the kind of day that asks nothing of you. ' * 20)
RECIPE = ('Banana bread\nServes 8\n\nIngredients\n- 3 ripe bananas\n- 250 g flour\n- 1 tsp baking soda\n\n'
          'Method\n1. Mash the bananas.\n2. Fold in the flour.\n3. Bake 50 minutes at 180C.')


def seed():
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
    # and a neighbour, for the universe
    other = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    other.open(urllib.request.Request(SITE + '/api/auth/signup', method='POST', headers={'Content-Type': 'application/json', 'X-Mutt': '1'},
                                      data=json.dumps({'username': 'neighbour', 'pin': '258093'}).encode()), timeout=20)

    # the seed itself is checked: each planet must be offered the mode its path expects
    for title, mode in (('Shopping', 'list'), ('Recipes to try', 'cookbook'), ('Essays', 'documents'), ('Shelf', 'reading')):
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
    s.wait('return /once more/i.test(document.querySelector(".login-label")?.textContent || "")',
           'a new name was not asked for its code a second time')
    enter_code(s, '739193')
    s.wait('return location.pathname === "/" && !!document.querySelector(".void-core")',
           'picking a code did not land in the new galaxy', 12)
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
    s.settle(1.2)
    s.shot('universe')


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


PATHS = [sign_up, sign_in, add_through_void, open_planet, list_mode, reading_mode, cookbook_mode,
         documents_mode, undo, document_editor, open_book, universe, phone, sample_page]


def run(start_server, stop_server, verbose=False, keep=False, only=()):
    """-> (passed, [failures], why it could not run at all)"""
    work = tempfile.mkdtemp(prefix='mutt-browser-')
    shutil.rmtree(SHOTS, ignore_errors=True)
    os.makedirs(SHOTS)
    server = start_server(work, PORT)
    s, passed, fails = None, 0, []
    try:
        seeded = seed()
        try:
            s = Browser()
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
