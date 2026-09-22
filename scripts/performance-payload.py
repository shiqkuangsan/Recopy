"""Compare list payloads using repository SQL and synthetic in-memory data only."""
import json
import pathlib
import re
import sqlite3
import statistics
import time

root = pathlib.Path(__file__).resolve().parents[1]
source = (root / "src-tauri/src/db/queries.rs").read_text()
query = next(
    sql for sql in re.findall(r'"(SELECT id, content_type, CASE[^\"]+)"', source)
    if "FROM clipboard_items ORDER BY" in sql
)
previous = query.replace(
    "CASE WHEN content_type IN ('plain_text', 'rich_text') "
    "THEN substr(plain_text, 1, 1024) ELSE plain_text END AS plain_text", "plain_text"
)
with sqlite3.connect(":memory:") as connection:
    for migration in sorted((root / "src-tauri/migrations").glob("*.sql")):
        connection.executescript(migration.read_text())
    text = "x" * (1024 * 1024)
    connection.executemany(
        "INSERT INTO clipboard_items(id,content_type,plain_text,content_size,content_hash) "
        "VALUES (?,'plain_text',?,?,?)",
        [(str(i), text, len(text), str(i)) for i in range(50)],
    )
    result = {}
    for label, sql in [("before", previous), ("after", query)]:
        durations = []
        for _ in range(5):
            start = time.perf_counter()
            rows = connection.execute(sql, (50, 0)).fetchall()
            payload = json.dumps(rows, ensure_ascii=False).encode()
            durations.append((time.perf_counter() - start) * 1000)
        result[label] = {
            "json_bytes": len(payload),
            "median_query_and_python_json_ms": round(statistics.median(durations), 2),
        }
    result["query_plan"] = [
        row[-1] for row in connection.execute("EXPLAIN QUERY PLAN " + query, (50, 0))
    ]
    print(json.dumps(result, indent=2))
