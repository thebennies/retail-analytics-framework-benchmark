"""Enforces that /benchmark/full-summary runs sequentially (spec section 5).

The test asserts the source code of `full_summary` does NOT use
asyncio.gather / asyncio.wait / asyncio.TaskGroup on the query coroutines.
"""
import inspect
import re

import main


def test_full_summary_does_not_use_gather() -> None:
    src = inspect.getsource(main.full_summary)
    # Strip comments and docstrings to avoid false positives.
    lines = []
    in_docstring = False
    for line in src.split("\n"):
        stripped = line.strip()
        if '"""' in stripped:
            in_docstring = not in_docstring
            continue
        if in_docstring:
            continue
        if stripped.startswith('#'):
            continue
        lines.append(line)
    code_only = "\n".join(lines)
    forbidden = [
        r"asyncio\.gather",
        r"asyncio\.wait",
        r"asyncio\.as_completed",
        r"TaskGroup",
        r"create_task",
    ]
    for pat in forbidden:
        assert not re.search(pat, code_only), (
            f"full_summary must run sequentially (spec section 5); "
            f"found forbidden pattern: {pat}"
        )


def test_full_summary_iterates_all_8_query_keys() -> None:
    src = inspect.getsource(main.full_summary)
    assert "for path_name, query_key in ENDPOINT_TO_QUERY.items()" in src, (
        "full_summary must iterate ENDPOINT_TO_QUERY (so adding a new endpoint "
        "auto-extends full-summary)."
    )
    assert len(main.ENDPOINT_TO_QUERY) == 8, (
        f"Expected exactly 8 endpoints in ENDPOINT_TO_QUERY, "
        f"got {len(main.ENDPOINT_TO_QUERY)}."
    )
