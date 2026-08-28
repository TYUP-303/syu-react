# -*- coding: utf-8 -*-
# 팀 배포용 Antigravity 작업 폴더 생성 (읽기 전용 소스: 구글시트 + Firestore)
import csv, io, json, os, shutil, urllib.parse, urllib.request

DEST_PARENT = os.environ.get(
    "ANGEL_WORKSPACE_DEST",
    os.path.expanduser("~/angel-workspace-dest"),
)  # 팀 공유 드라이브의 미팅 폴더 — 개인 경로라 환경변수로 받는다
DEST = os.path.join(DEST_PARENT, "angel-workspace")

# ── 1. 구글시트 '마. 요정 대사' 탭 → angels.csv (2행 헤더부터, 1행 안내문 제외) ──
from google.oauth2 import service_account
import google.auth.transport.requests

# 팀 시트 ID 와 서비스 계정 키는 환경변수로 받는다 (read_sheet.py 와 동일 규약)
KEY = os.environ.get("GCP_SHEET_KEY", os.path.expanduser("~/.config/gcp/sheet-service-account.json"))
SHEET_ID = os.environ.get("TEAM_SHEET_ID", "")
creds = service_account.Credentials.from_service_account_file(
    KEY, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"])
creds.refresh(google.auth.transport.requests.Request())
rng = urllib.parse.quote("'마. 요정 대사'!A2:Q43")
req = urllib.request.Request(
    "https://sheets.googleapis.com/v4/spreadsheets/%s/values/%s" % (SHEET_ID, rng))
req.add_header("Authorization", "Bearer " + creds.token)
with urllib.request.urlopen(req) as r:
    rows = json.loads(r.read().decode()).get("values", [])

header = rows[0]
ncols = len(header)
buf = io.StringIO()
w = csv.writer(buf, lineterminator="\n")
for row in rows:
    w.writerow(row + [""] * (ncols - len(row)))
angels_csv = buf.getvalue()

# ── 2. Firestore scenarios/dialogue → scenario.csv ──
import tomllib
import firebase_admin
from firebase_admin import credentials as fb_credentials, firestore

with open("/Users/taeyeop303/DEV_Mac/syu-react/syu-react-admin/.streamlit/secrets.toml", "rb") as f:
    cert = tomllib.load(f)["firebase"]
firebase_admin.initialize_app(fb_credentials.Certificate(dict(cert)))
doc = firestore.client().collection("scenarios").document("dialogue").get()
if not doc.exists:
    raise SystemExit("scenarios/dialogue 문서가 없습니다")
scenario_csv = doc.to_dict()["csvText"]

RESEARCH_MD = """# 선행연구 정리 (본인 작성)

가이드 ④ Step 1에서 정리한 내용을 아래에 채워 주세요.
노션 가이드 페이지 ⑤ 제출란에 올린 내용과 같아도 됩니다.

## 참고한 문헌

-

## 수용 (아코)

- 정의 :
- 행동 :
- 경계 (이 전략이 아닌 것) :

## 재평가 (포코)

- 정의 :
- 행동 :
- 경계 :

## 재초점 (리프)

- 정의 :
- 행동 :
- 경계 :
"""

# ── 3. 폴더 생성 + 파일 쓰기 + zip ──
os.makedirs(DEST, exist_ok=True)
for name, content in [("angels.csv", angels_csv),
                      ("scenario.csv", scenario_csv),
                      ("research.md", RESEARCH_MD)]:
    with open(os.path.join(DEST, name), "w", encoding="utf-8", newline="") as f:
        f.write(content)

zip_path = shutil.make_archive(os.path.join(DEST_PARENT, "angel-workspace"), "zip", DEST_PARENT, "angel-workspace")

print("폴더:", DEST)
for name in sorted(os.listdir(DEST)):
    p = os.path.join(DEST, name)
    print("  %-13s %6d bytes" % (name, os.path.getsize(p)))
print("zip :", zip_path, os.path.getsize(zip_path), "bytes")
print("angels.csv 행 수:", angels_csv.count("\n"), "/ scenario.csv 행 수:", scenario_csv.count("\n"))
