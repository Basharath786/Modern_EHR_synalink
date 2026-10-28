from django.db import connection


def rows(sql, params=()):
    with connection.cursor() as c:
        c.execute(sql, params)
        cols = [x[0] for x in c.description]
        return [dict(zip(cols, r)) for r in c.fetchall()]


def one(sql, params=()):
    r = rows(sql, params)
    return r[0] if r else None


def run(sql, params=()):
    with connection.cursor() as c:
        c.execute(sql, params)
        return c.rowcount
