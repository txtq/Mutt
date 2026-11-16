#!/usr/bin/env python3
"""One-time: fetch the hidden browsers the browser checks use.

  python3 tests/get_browser.py            Chrome's headless shell (about 150 MB)
  python3 tests/get_browser.py --webkit   Safari's engine, hidden (about 500 MB)

Chrome: Google's "Chrome for Testing" (the headless shell and its driver, the
current stable pair) from Google's own servers. Used when Safari's engine isn't
fetched, or asked for with MUTT_BROWSER=chrome; with neither, the checks use Safari.

Safari's engine: WebKit as Playwright builds it, hidden like the Chrome one, for
`tests/run.sh browser`, their first choice. It is not Safari itself, but the same
engine (how pages lay out, paint and run), so it catches what only goes wrong in Safari. Playwright is a
Python package; it goes in a private Python folder (`webkit/`), never into the
system Python, and the browser into `ms-playwright/`.

Everything goes into ~/.cache/mutt-tests, outside the project so every worktree
shares it. Nothing is installed system-wide; delete that folder to remove it.
"""
import glob, io, json, os, platform, shutil, stat, subprocess, sys, zipfile

HOME = os.path.expanduser('~/.cache/mutt-tests')
INDEX = 'https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json'
WEBKIT = os.path.join(HOME, 'webkit')                  # the private Python folder with Playwright in it
WEBKIT_BROWSERS = os.path.join(HOME, 'ms-playwright')  # the WebKit build itself


def fetch(url):
    # curl, because it trusts the system's certificates (this Python may have none)
    return subprocess.run(['curl', '-fsSL', '--max-time', '600', url], check=True, capture_output=True).stdout


def paths():
    """-> (browser, driver) if both are there, else None."""
    for arch in ('mac-arm64', 'mac-x64', 'linux64'):
        browser = os.path.join(HOME, f'chrome-headless-shell-{arch}', 'chrome-headless-shell')
        driver = os.path.join(HOME, f'chromedriver-{arch}', 'chromedriver')
        if os.path.exists(browser) and os.path.exists(driver):
            return browser, driver
    return None


def webkit():
    """-> where to import Playwright from, if Safari's engine is fetched for this Python, else None."""
    site = os.path.join(WEBKIT, 'lib', f'python{sys.version_info[0]}.{sys.version_info[1]}', 'site-packages')
    if os.path.isdir(os.path.join(site, 'playwright')) and glob.glob(os.path.join(WEBKIT_BROWSERS, 'webkit-*')):
        return site
    return None


def fetch_webkit():
    # a fresh private folder made by this same Python, so what is in it can be imported by the checks
    subprocess.run([sys.executable, '-m', 'venv', '--clear', WEBKIT], check=True)
    py = os.path.join(WEBKIT, 'bin', 'python')
    print('  fetching Playwright...')
    subprocess.run([py, '-m', 'pip', 'install', '-q', '--disable-pip-version-check', 'playwright'], check=True)
    print('  fetching WebKit...')
    subprocess.run([py, '-m', 'playwright', 'install', 'webkit'], check=True, stdout=subprocess.DEVNULL,
                   env={**os.environ, 'PLAYWRIGHT_BROWSERS_PATH': WEBKIT_BROWSERS})
    print('Ready.' if webkit() else 'Something is missing after fetching.')


def main():
    if '--webkit' in sys.argv:
        return fetch_webkit()
    if sys.platform == 'darwin':
        arch = 'mac-arm64' if platform.machine() == 'arm64' else 'mac-x64'
    else:
        arch = 'linux64'
    stable = json.loads(fetch(INDEX))['channels']['Stable']
    print(f'Chrome for Testing {stable["version"]} ({arch})')
    os.makedirs(HOME, exist_ok=True)
    for part in ('chrome-headless-shell', 'chromedriver'):
        url = next(d['url'] for d in stable['downloads'][part] if d['platform'] == arch)
        if not url.startswith('https://storage.googleapis.com/chrome-for-testing-public/'):
            raise SystemExit(f'Unexpected download address, stopping: {url}')
        print(f'  fetching {part}...')
        data = fetch(url)
        shutil.rmtree(os.path.join(HOME, f'{part}-{arch}'), ignore_errors=True)
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            z.extractall(HOME)
            for info in z.infolist():          # zipfile drops the "can be run" marks; put them back
                mode = info.external_attr >> 16
                if mode & stat.S_IXUSR:
                    os.chmod(os.path.join(HOME, info.filename), mode & 0o777)
    print('Ready.' if paths() else 'Something is missing after unpacking.')


if __name__ == '__main__':
    main()
