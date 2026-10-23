#!/usr/bin/env python3
"""Run Mutt.

    python3 server.py                      # http://127.0.0.1:8080
    python3 server.py --host 0.0.0.0 --port 80

Environment: PORT, HOST, MUTT_DATA_DIR, MUTT_ALLOW_SIGNUPS, MUTT_MAX_UPLOAD_MB,
MUTT_TRUST_PROXY, MUTT_SECRET. See README.md.
"""
import argparse
import os
import sys
from socketserver import ThreadingMixIn
from wsgiref.simple_server import WSGIRequestHandler, WSGIServer, make_server

from mutt import db
from mutt.app import application


class ThreadingWSGIServer(ThreadingMixIn, WSGIServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 64


class Handler(WSGIRequestHandler):
    def log_message(self, fmt, *args):
        if os.environ.get('MUTT_QUIET'):
            return
        sys.stderr.write('%s  %s\n' % (self.log_date_time_string(), fmt % args))

    def log_request(self, code='-', size='-'):
        # Skip the noise of thumbnails and assets; keep API calls and errors.
        path = self.path.split('?')[0]
        if str(code).startswith(('4', '5')) or path.startswith('/api/'):
            super().log_request(code, size)


def main():
    parser = argparse.ArgumentParser(description='Run the Mutt server.')
    parser.add_argument('--host', default=os.environ.get('HOST', '127.0.0.1'))
    parser.add_argument('--port', type=int, default=int(os.environ.get('PORT', '8080')))
    args = parser.parse_args()

    db.init()
    with make_server(args.host, args.port, application,
                     server_class=ThreadingWSGIServer, handler_class=Handler) as httpd:
        shown = 'localhost' if args.host in ('127.0.0.1', '0.0.0.0') else args.host
        print(f'Mutt is running at http://{shown}:{args.port}  (data in {db.DATA_DIR})', flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nStopped.')


if __name__ == '__main__':
    main()
