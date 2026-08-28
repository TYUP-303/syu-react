"""구글시트를 읽는다 (읽기 전용). 어드민 venv의 google-auth로 토큰만 받고 REST는 urllib로 친다.

    venv/bin/python read_sheet.py "<탭이름>" [시작행] [끝행]
"""

import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from google.oauth2 import service_account
import google.auth.transport.requests

# 팀 시트 ID 와 서비스 계정 키는 환경변수로 받는다 (공개 저장소에 식별자를 두지 않는다)
SHEET_ID = os.environ.get("TEAM_SHEET_ID", "")
KEY = Path(os.environ.get("GCP_SHEET_KEY", str(Path.home() / ".config/gcp/sheet-service-account.json")))
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]


def token() -> str:
    creds = service_account.Credentials.from_service_account_file(str(KEY), scopes=SCOPES)
    creds.refresh(google.auth.transport.requests.Request())
    return creds.token


def get(url: str) -> dict:
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token()}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


if __name__ == "__main__":
    if len(sys.argv) < 2:                      # 탭 목록만
        meta = get(f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}?fields=sheets.properties")
        for s in meta["sheets"]:
            p = s["properties"]
            g = p.get("gridProperties", {})
            print(f"{p['title']}  ({g.get('rowCount')}행 × {g.get('columnCount')}열)")
        sys.exit()

    title = sys.argv[1]
    rng = urllib.parse.quote(f"'{title}'")
    data = get(
        f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/{rng}"
        "?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE"
    )
    rows = data.get("values", [])
    start = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    end = int(sys.argv[3]) if len(sys.argv) > 3 else len(rows)
    print(f"# 총 {len(rows)}행, 최대 {max((len(r) for r in rows), default=0)}열\n")
    for i, row in enumerate(rows[start - 1 : end], start=start):
        cells = " | ".join(c.strip() for c in row)
        if cells.strip():
            print(f"{i:3d}  {cells}")
