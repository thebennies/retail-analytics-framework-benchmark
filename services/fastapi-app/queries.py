"""Load SQL queries from shared/queries.sql into a dict keyed by @name comment."""
import re
from pathlib import Path

_SQL_PATH = Path(__file__).parent / "shared-queries.sql"
_NAME_RE = re.compile(r"^--\s*@name:\s*(\S+)\s*$", re.MULTILINE)


def load_queries() -> dict[str, str]:
    text = _SQL_PATH.read_text(encoding="utf-8")
    blocks: dict[str, str] = {}
    matches = list(_NAME_RE.finditer(text))
    for i, m in enumerate(matches):
        name = m.group(1)
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        sql = text[start:end].strip()
        if sql.endswith(";"):
            sql = sql[:-1].rstrip()
        blocks[name] = sql
    return blocks


QUERIES: dict[str, str] = load_queries()
