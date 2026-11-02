"""Nightly copies of the database in DATA_DIR/backups, keeping the last 7.

Uses SQLite's backup API, which copies a consistent snapshot while the site
keeps reading and writing. Uploaded files aren't copied (they live in
DATA_DIR/files and never change once written).
"""
import os
import sqlite3
import threading
import time
import traceback

from . import db

BACKUP_DIR = os.path.join(db.DATA_DIR, 'backups')
KEEP = 7
HOUR = 3  # back up at the first check after 03:00 (server time) each day
CHECK_EVERY = 30 * 60


def backups():
    try:
        names = os.listdir(BACKUP_DIR)
    except FileNotFoundError:
        return []
    return sorted(n for n in names if n.startswith('mutt-') and n.endswith('.db'))


def run():
    """Write today's backup now (replacing one from earlier today) and prune old ones."""
    os.makedirs(BACKUP_DIR, exist_ok=True)
    name = time.strftime('mutt-%Y-%m-%d.db')
    path = os.path.join(BACKUP_DIR, name)
    tmp = path + '.part'
    src = db.connect()
    try:
        dst = sqlite3.connect(tmp)
        try:
            src.backup(dst, pages=1024, sleep=0.05)  # in steps, so writers aren't held up
        finally:
            dst.close()
        os.replace(tmp, path)
    finally:
        src.close()
        if os.path.exists(tmp):
            os.remove(tmp)
    for old in backups()[:-KEEP]:
        os.remove(os.path.join(BACKUP_DIR, old))
    return path


def due():
    today = time.strftime('mutt-%Y-%m-%d.db')
    have = backups()
    if today in have:
        return False
    return not have or time.localtime().tm_hour >= HOUR


def _loop():
    while True:
        try:
            if due():
                run()
        except Exception:
            traceback.print_exc()
        time.sleep(CHECK_EVERY)


def start():
    if os.environ.get('MUTT_BACKUPS', '1').lower() in ('0', 'false', 'no', 'off'):
        return
    threading.Thread(target=_loop, name='backup', daemon=True).start()
