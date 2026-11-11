#!/usr/bin/env python3
"""One-time: fetch the hidden browser the browser checks use (about 150 MB).

  python3 tests/get_browser.py

Downloads Google's "Chrome for Testing" (the headless shell and its driver, the
current stable pair) from Google's own servers into ~/.cache/mutt-tests, outside
the project so every worktree shares it. Nothing is installed system-wide; delete
that folder to remove it. Without it, `tests/run.sh` falls back to Safari.
"""
import io, json, os, platform, shutil, stat, subprocess, sys, zipfile

HOME = os.path.expanduser('~/.cache/mutt-tests')
INDEX = 'https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json'


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


def main():
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
