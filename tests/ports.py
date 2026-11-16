"""Ports for one test run, asked of the system so they are free right now.

Every worktree used to test on the same ports (8099 for the API suites, 8098 and
4498 for the browser). When two sessions tested at once, the second server could not
start, but the first one's answered its health check, so the second run quietly
tested the other worktree's code and data. Asking the system for free ports means
two runs never meet.
"""
import socket


def free_ports(n):
    """-> n different ports nothing is listening on (held open together so they differ)."""
    held = []
    try:
        for _ in range(n):
            s = socket.socket()
            s.bind(('127.0.0.1', 0))
            held.append(s)
        return [s.getsockname()[1] for s in held]
    finally:
        for s in held:
            s.close()


def answering(port):
    """True if something already answers on this port."""
    with socket.socket() as s:
        s.settimeout(0.3)
        return s.connect_ex(('127.0.0.1', port)) == 0
