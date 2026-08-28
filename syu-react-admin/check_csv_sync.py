"""로컬 CSV와 Firestore csvText가 어긋났는지 확인한다 (읽기 전용).

콘텐츠는 **저장소의 CSV**와 **Firestore 문서의 csvText** 두 곳에 산다.
프로덕션은 Firestore가 우선이고 로컬 CSV는 폴백이라, 어드민에서 업로드만 하고
저장소에 반영하지 않으면 **깃허브 쪽이 조용히 구형이 된다.** 그 상태를 눈으로
확인할 방법이 지금까지 없었다.

    cd syu-react-admin && venv/bin/python check_csv_sync.py

내용을 바꾸지 않는다. 어긋난 문서가 있으면 종료 코드 1을 돌려주므로
나중에 CI나 배포 전 점검에 그대로 걸 수 있다.
"""

from __future__ import annotations

import hashlib
import sys
import tomllib
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore

# 문서 ID → 저장소 CSV 파일명
TARGETS = {
    "questions": {
        "adhd": "adhd_questions.csv",
        "stress": "stress_questions.csv",
    },
    "scenarios": {
        "visual": "scenario_visual.csv",
        "dialogue": "scenario_dialogues.csv",
        "angels": "scenario_angels.csv",
        "epilogue": "scenario_epilogue.csv",
    },
}

DATA_DIR = Path(__file__).parent / "../syu-react-frontend/src/assets/data"
SECRETS = Path(__file__).parent / ".streamlit/secrets.toml"


def normalize(text: str) -> str:
    """비교 전 정규화.

    BOM·개행 방식·맨 끝 공백은 내용 차이가 아니다. 어드민 업로드와 로컬
    편집기가 서로 다른 관행을 쓰기 때문에 이걸 걸러내지 않으면 항상 불일치로 뜬다.
    """
    return text.lstrip("﻿").replace("\r\n", "\n").replace("\r", "\n").rstrip() + "\n"


def digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:8]


def main() -> int:
    if not SECRETS.exists():
        print(f"secrets.toml이 없습니다: {SECRETS}", file=sys.stderr)
        return 2

    with SECRETS.open("rb") as f:
        cert = tomllib.load(f)["firebase"]
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(dict(cert)))
    db = firestore.client()

    drifted = False
    for collection, mapping in TARGETS.items():
        print(f"\n[{collection}]")
        for doc_id, filename in mapping.items():
            local_path = DATA_DIR / filename
            snap = db.collection(collection).document(doc_id).get()

            if not local_path.exists():
                print(f"  {doc_id:10s} 로컬 파일 없음 ({filename})")
                drifted = True
                continue

            local = normalize(local_path.read_text(encoding="utf-8"))

            if not snap.exists:
                # 문서가 없으면 앱은 번들된 로컬 CSV를 쓴다 — 어긋남이 아니라 '아직 시드 전'이다.
                print(f"  {doc_id:10s} DB 문서 없음 → 로컬 폴백 사용 중 "
                      f"(로컬 {len(local.splitlines())}행)")
                continue

            remote = normalize(snap.to_dict().get("csvText", ""))
            updated = snap.update_time.strftime("%Y-%m-%d %H:%M") if snap.update_time else "?"

            if local == remote:
                print(f"  {doc_id:10s} ✅ 일치 ({len(local.splitlines())}행, "
                      f"{digest(local)}, DB 갱신 {updated})")
            else:
                drifted = True
                print(f"  {doc_id:10s} ⚠️  불일치 — DB 갱신 {updated}")
                print(f"  {'':10s}    로컬 {len(local.splitlines()):4d}행 {digest(local)}")
                print(f"  {'':10s}    DB   {len(remote.splitlines()):4d}행 {digest(remote)}")

    if drifted:
        print("\n어긋난 문서가 있습니다. 어느 쪽이 최신인지 확인한 뒤 맞추세요.")
        print("  DB가 최신이면 → 어드민에서 내려받아 저장소 CSV를 교체하고 커밋")
        print("  로컬이 최신이면 → 어드민 CSV 관리 메뉴로 업로드")
        return 1

    print("\n모든 문서가 저장소와 일치합니다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
