#!/usr/bin/env python3
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import DateRange, Dimension, Metric, RunReportRequest
from google.oauth2 import service_account

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "qa" / "most-read.json"

PROPERTY_ID = os.environ.get("GA_PROPERTY_ID", "").strip()
SERVICE_ACCOUNT_JSON = os.environ.get("GA_SERVICE_ACCOUNT_JSON", "").strip()

if not PROPERTY_ID:
    raise SystemExit("Missing GA_PROPERTY_ID.")
if not SERVICE_ACCOUNT_JSON:
    raise SystemExit("Missing GA_SERVICE_ACCOUNT_JSON.")

try:
    service_info = json.loads(SERVICE_ACCOUNT_JSON)
except json.JSONDecodeError as exc:
    raise SystemExit(f"GA_SERVICE_ACCOUNT_JSON is not valid JSON: {exc}") from exc

credentials = service_account.Credentials.from_service_account_info(
    service_info,
    scopes=["https://www.googleapis.com/auth/analytics.readonly"],
)
client = BetaAnalyticsDataClient(credentials=credentials)

request = RunReportRequest(
    property=f"properties/{PROPERTY_ID}",
    dimensions=[Dimension(name="pagePath")],
    metrics=[Metric(name="screenPageViews")],
    date_ranges=[DateRange(start_date="2020-01-01", end_date="today")],
    limit=100000,
)

response = client.run_report(request)

# Supports GitHub Pages subpaths such as:
# /al-seljuki-meditative-encyclopedia/qa/001.html
qa_path = re.compile(r"(?:^|/)qa/(\d{3,})\.html/?$", re.IGNORECASE)
views_by_id = {}

for row in response.rows:
    page_path = row.dimension_values[0].value.strip()
    match = qa_path.search(page_path)
    if not match:
        continue

    question_id = match.group(1)
    published_file = ROOT / "qa" / f"{question_id}.html"
    if not published_file.exists():
        continue

    try:
        views = int(float(row.metric_values[0].value or "0"))
    except ValueError:
        views = 0

    views_by_id[question_id] = views_by_id.get(question_id, 0) + views

items = [
    {"id": question_id, "views": views}
    for question_id, views in sorted(
        views_by_id.items(),
        key=lambda item: (-item[1], item[0])
    )
]

payload = {
    "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "source": "Google Analytics 4 Data API",
    "metric": "screenPageViews",
    "period": "all_time",
    "items": items,
}

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(
    json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)

print(f"Wrote {OUTPUT.relative_to(ROOT)} with {len(items)} published Q&A rows.")
