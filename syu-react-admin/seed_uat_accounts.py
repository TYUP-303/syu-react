"""UAT 계정을 조회·생성·삭제한다 (기본은 전부 dry-run — 쓰기 0건).

프로덕션 공개 전에 **테스트 계정을 반드시 정리**해야 하는데(next-steps.md §3),
그 일을 하던 스크립트가 세션 스크래치패드에만 있다가 유실됐다(2026-08-13 확인).
계정 정리는 배포 순서에 고정된 단계라 손으로 다시 짜는 일이 반복되면 안 되므로
저장소에 둔다.

    cd syu-react-admin
    venv/bin/python seed_uat_accounts.py list                    # 읽기 전용
    venv/bin/python seed_uat_accounts.py delete                  # dry-run
    venv/bin/python seed_uat_accounts.py delete --apply          # 실제 삭제
    venv/bin/python seed_uat_accounts.py create --password '...' # dry-run

**`--apply`가 없으면 어떤 쓰기 함수도 호출하지 않는다.** 실행 계획만 출력한다.
`test@example.com`은 삭제 대상이 아니라 **비활성화(disable)** 대상이므로
(next-steps.md §3) 코드로 삭제에서 제외한다 — 실수로 지우면 uid에 묶인
디버그 해금 판별과 4영역 완주 데이터가 함께 사라진다.

종료 코드
    0  정상 (list 출력 완료 / dry-run 완료 / --apply 성공)
    1  오류 (secrets 없음 · 인증 실패 · 보호 계정이 대상에 섞임 ·
           --apply인데 비밀번호 없음 · 시드값이 선언한 유형과 불일치)
"""

from __future__ import annotations

import argparse
import math
import os
import sys
import tomllib
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import firebase_admin
from firebase_admin import auth as fb_auth
from firebase_admin import credentials, firestore

# ─────────────────────────────────────────────────────────────────────────────
# 프론트엔드와 공유하는 계약 (값을 바꾸면 프론트도 함께 고쳐야 한다)
# ─────────────────────────────────────────────────────────────────────────────

USERS_COLLECTION = "users"  # src/api/firestoreKeys.ts COLLECTIONS.USERS

#: 삭제 금지 계정. next-steps.md §3의 disable 대상이며 uid에 디버그 해금
#: 판별(isDevUser)과 4영역 완주 시드가 묶여 있다.
PROTECTED_EMAILS = frozenset({"test@example.com"})

#: 축 A(반응 기제) 3종. 표시 순서이자 **동점 시 우선순위**다.
#: src/constants/reactionType.ts REACTION_TYPE_KEYS의 미러.
REACTION_KEYS: tuple[str, str, str] = ("cognitive", "emotional", "behavioral")

#: 영역당 문항 수 = 영역별 '예'의 최댓값. classify의 '전부 예' 판정에 쓰인다.
MAX_PER_DOMAIN = 4

#: 스트레스 문항 id ↔ 영역. src/assets/data/stress_questions.csv의 part 열 그대로.
STRESS_QUESTION_IDS: dict[str, tuple[int, ...]] = {
    "cognitive": (1, 2, 3, 4),
    "emotional": (5, 6, 7, 8),
    "behavioral": (9, 10, 11, 12),
}

#: 스트레스 문항 선택지 인덱스. CSV의 options가 "예,아니요" 순서다.
STRESS_YES_INDEX = 0
STRESS_NO_INDEX = 1

#: ASRS-6. 환산점수의 분모는 문항 수가 아니라 이 고정 상수다
#: (src/utils/testScoring.ts ADHD_MAX_RAW_SCORE).
ADHD_QUESTION_IDS: tuple[int, ...] = (1, 2, 3, 4, 5, 6)
ADHD_MAX_RAW_SCORE = 24
ADHD_MAX_OPTION_INDEX = 4  # scale 0~4

#: src/constants/legal.ts LEGAL_VERSION. --with-consent 시드에 박히는 값이라
#: 법무 문서를 개정하면 여기도 함께 올려야 한다.
#:
#: ⚠️ 실제로 어긋난 전례가 있다 — 2026-08-16 개정 때 이 값만 "2026-08-09"에
#: 멈춰 있었고(2026-08-26 발견), 그동안 시드한 UAT 계정은 존재하지 않는 판의
#: 문서에 동의한 것으로 기록됐다. 미러가 조용히 낡는 자리이므로 개정할 때마다
#: legal.ts와 나란히 놓고 확인한다.
LEGAL_VERSION = "2026-08-26"

STRESS_TYPE_LABEL = {
    "cognitive": "인지형",
    "emotional": "정서형",
    "behavioral": "행동형",
    "cognitive-emotional": "인지·정서형",
    "cognitive-behavioral": "인지·행동형",
    "emotional-behavioral": "정서·행동형",
    "balanced": "균형형",
    "undetermined": "판별 불가",
}


# ─────────────────────────────────────────────────────────────────────────────
# 채점 로직 미러 — src/constants/reactionType.ts · src/utils/testScoring.ts
# ─────────────────────────────────────────────────────────────────────────────

def classify_stress_result(counts: dict[str, int], max_per_domain: int = MAX_PER_DOMAIN) -> str:
    """영역별 '예' 수 → 8유형.

    src/constants/reactionType.ts의 `classifyStressResult`를 **줄 단위로 옮긴
    것**이다. 파이썬으로 다시 쓴 이유는 이 스크립트가 만드는 시드가 프론트에서
    의도한 유형으로 읽히는지를 오프라인에서 검증하기 위해서다(create 실행 전
    자체 검사 + tests/test_seed_uat_accounts.py). 프론트 로직을 고치면 여기도
    함께 고쳐야 하며, 어긋나면 시드 계정이 엉뚱한 시나리오 버전을 받는다.

    규칙: 단독 최고 → 단일형 / 2개 동률 최고 → 혼합형 / 3개 동률 → 균형형 /
    전부 0 또는 전부 만점(변별력 없음) → 판별 불가.
    혼합형 키는 REACTION_KEYS 순서로 조합된다.
    """
    values = [counts[key] for key in REACTION_KEYS]
    if all(v == 0 for v in values) or all(v == max_per_domain for v in values):
        return "undetermined"
    top = [key for key in REACTION_KEYS if counts[key] == max(values)]
    if len(top) == 3:
        return "balanced"
    if len(top) == 2:
        return f"{top[0]}-{top[1]}"
    return top[0]


def reaction_type_cycle(result_type: str) -> list[str]:
    """유형 → 에피소드에 깔릴 반응 기제 순환 목록.

    src/constants/reactionType.ts의 `getReactionTypeCycle` 미러.
    i번째 에피소드의 버전은 `cycle[i % len(cycle)]`이므로(useScenarioStore.ts:303)
    **1번 에피소드는 항상 cycle[0]**이다 — C-15 계정을 고를 때 쓰는 근거다.
    """
    if result_type == "balanced":
        return list(REACTION_KEYS)
    if result_type == "undetermined":
        return ["cognitive"]
    if result_type in REACTION_KEYS:
        return [result_type]
    return result_type.split("-")


def js_round(value: float) -> int:
    """JS `Math.round` (0.5는 위로)를 흉내낸다.

    파이썬 내장 round()는 은행가 반올림이라 .5에서 프론트와 갈린다
    (round(2.5) == 2). 환산점수는 프론트가 계산한 값과 자릿수까지 같아야
    어드민 집계·검수 화면이 어긋나지 않는다.
    """
    return math.floor(value + 0.5)


def build_stress_answers(counts: dict[str, int]) -> dict[str, int]:
    """영역별 '예' 수 → 문항 답안 맵.

    counts만 저장하면 어드민 화면과 재채점이 근거를 잃는다. 실제 검사가 남기는
    것과 같은 모양(questionId → 선택지 인덱스)으로 채워 둔다. 영역 안에서는
    앞쪽 문항부터 '예'를 채우므로 counts와 항상 일관된다.

    Firestore 맵의 키는 문자열이다 — 프론트의 `Record<number, number>`도
    직렬화되면 문자열 키가 되므로 같은 모양이다.
    """
    answers: dict[str, int] = {}
    for key, question_ids in STRESS_QUESTION_IDS.items():
        yes_count = counts[key]
        for offset, question_id in enumerate(question_ids):
            answers[str(question_id)] = STRESS_YES_INDEX if offset < yes_count else STRESS_NO_INDEX
    return answers


def build_adhd_answers(raw_score: int) -> dict[str, int]:
    """원점수를 6문항에 고르게 분배한 답안 맵.

    ADHD 결과는 C-15의 검증 대상이 아니라 **시나리오 탭을 여는 전제**일 뿐이다
    (ScenarioTab의 isTestCompleted = adhdResult && stressResult). 그래서 값
    자체는 무의미해도 되지만, 합이 rawScore와 맞지 않으면 어드민 집계가
    이상해지므로 균등 분배 + 나머지를 앞 문항에 얹는다.
    """
    if not 0 <= raw_score <= ADHD_MAX_RAW_SCORE:
        raise ValueError(f"ADHD 원점수는 0~{ADHD_MAX_RAW_SCORE} 범위여야 합니다: {raw_score}")
    base, extra = divmod(raw_score, len(ADHD_QUESTION_IDS))
    if base + (1 if extra else 0) > ADHD_MAX_OPTION_INDEX:
        raise ValueError(f"문항당 배점이 {ADHD_MAX_OPTION_INDEX}를 넘습니다: {raw_score}")
    return {
        str(question_id): base + (1 if offset < extra else 0)
        for offset, question_id in enumerate(ADHD_QUESTION_IDS)
    }


# ─────────────────────────────────────────────────────────────────────────────
# 계정 정의
# ─────────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class AccountSpec:
    """관리 대상 계정 하나의 선언.

    stress_counts가 있으면 검사 완료 상태로, 없으면 빈 계정으로 시드한다.
    expected_type은 counts에서 나와야 하는 유형이며, create 실행 전에
    classify_stress_result로 대조한다 — 손으로 적은 counts가 조용히 다른
    유형으로 분류되는 것을 막는 자물쇠다.
    """

    email: str
    purpose: str
    nickname: str | None = None
    gender: str | None = None
    stress_counts: dict[str, int] | None = None
    expected_type: str | None = None
    adhd_raw_score: int | None = None

    @property
    def is_seeded(self) -> bool:
        return self.stress_counts is not None


#: 1차 UAT(8/9~11)에서 쓴 개인별 계정. docs/qa/2026-08-08-uat-checklist.md 0-2절.
#: uat-d만 캐릭터·검사 2종이 완료된 상태로 배포했다.
UAT_PERSONAL_ACCOUNTS: tuple[AccountSpec, ...] = (
    AccountSpec(email="uat-a@syu-react.test", purpose="개인 검수용 빈 계정"),
    AccountSpec(email="uat-b@syu-react.test", purpose="개인 검수용 빈 계정 (캐릭터 생성부터)"),
    AccountSpec(email="uat-c@syu-react.test", purpose="개인 검수용 빈 계정 (C-01 게이트 확인)"),
    AccountSpec(
        email="uat-d@syu-react.test",
        purpose="캐릭터·검사 2종 완료 (D 파트 즉시 진행)",
        nickname="명이",
        gender="female",
        # 인지 단독 최고 → 'cognitive'. 체크리스트에 적힌 "인지형"과 일치한다.
        stress_counts={"cognitive": 4, "emotional": 2, "behavioral": 1},
        expected_type="cognitive",
        adhd_raw_score=12,  # 환산 50/100
    ),
)

#: C-15 전용 유형별 계정 3개 (다음 회차 준비 항목).
#:
#: **유형 선정 근거** — C-15는 "같은 영역의 1번 에피소드를 세 계정으로 보고
#: 주인공 반응이 서로 다른가"를 본다. 1번 에피소드의 버전은 cycle[0]이므로
#: (useScenarioStore.ts:303) 세 계정의 cycle[0]이 전부 달라야 검수가 성립한다.
#:
#:   단일형 behavioral         → cycle ['behavioral']                        → 1편 행동
#:   혼합형 emotional-behavioral → cycle ['emotional','behavioral']            → 1편 정서
#:   균형형 balanced            → cycle ['cognitive','emotional','behavioral'] → 1편 인지
#:
#: 단일형에 cognitive를 고르면 균형형의 cycle[0]과 겹쳐 두 계정이 **같은 1번
#: 에피소드**를 보게 되고, 검수자는 정상 동작을 F로 판정한다. 유형 조합을
#: 바꿀 일이 생기면 cycle[0]이 셋 다 다른지부터 확인할 것
#: (tests/test_seed_uat_accounts.py가 이 조건을 지킨다).
UAT_TYPE_ACCOUNTS: tuple[AccountSpec, ...] = (
    AccountSpec(
        email="uat-type-single@syu-react.test",
        purpose="C-15 단일형 (행동형) — 1번 에피소드 '행동' 버전",
        nickname="단일이",
        gender="male",
        stress_counts={"cognitive": 1, "emotional": 2, "behavioral": 4},
        expected_type="behavioral",
        adhd_raw_score=12,
    ),
    AccountSpec(
        email="uat-type-mixed@syu-react.test",
        purpose="C-15 혼합형 (정서·행동형) — 1번 에피소드 '정서' 버전",
        nickname="혼합이",
        gender="female",
        stress_counts={"cognitive": 1, "emotional": 3, "behavioral": 3},
        expected_type="emotional-behavioral",
        adhd_raw_score=12,
    ),
    AccountSpec(
        email="uat-type-balanced@syu-react.test",
        purpose="C-15 균형형 — 1번 에피소드 '인지' 버전",
        nickname="균형이",
        gender="male",
        stress_counts={"cognitive": 2, "emotional": 2, "behavioral": 2},
        expected_type="balanced",
        adhd_raw_score=12,
    ),
)

#: create/delete의 대상. 보호 계정은 여기에 절대 들어가지 않는다.
MANAGED_ACCOUNTS: tuple[AccountSpec, ...] = UAT_PERSONAL_ACCOUNTS + UAT_TYPE_ACCOUNTS

#: list에만 참고로 얹는 계정 (삭제 대상 아님).
REFERENCE_ACCOUNTS: tuple[AccountSpec, ...] = (
    AccountSpec(email="test@example.com", purpose="공용 개발 계정 — 삭제가 아니라 disable 대상"),
)


def delete_targets() -> list[AccountSpec]:
    """삭제 대상 목록. 보호 계정을 코드로 걸러낸다.

    MANAGED_ACCOUNTS에 보호 계정이 없다는 것만으로는 부족하다 — 나중에 누가
    목록에 한 줄 더 얹을 때 걸릴 그물이 필요하다. 필터를 통과 못 한 항목이
    생기면 cmd_delete가 오류로 끝난다.
    """
    return [spec for spec in MANAGED_ACCOUNTS if spec.email not in PROTECTED_EMAILS]


# ─────────────────────────────────────────────────────────────────────────────
# 시드 문서 조립
# ─────────────────────────────────────────────────────────────────────────────

def now_iso() -> str:
    """프론트의 `new Date().toISOString()`과 같은 모양 (밀리초 + Z)."""
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def build_user_document(
    spec: AccountSpec,
    *,
    with_consent: bool = False,
    server_timestamp: Any = None,
    timestamp: str | None = None,
) -> dict[str, Any]:
    """users/{uid}에 쓸 문서를 만든다 (merge=True로 쓸 것).

    필드 구성은 src/api/firebase.ts(syncUserToFirestore) ·
    src/store/useCharacterStore.ts · useTestStore.ts가 실제로 쓰는 모양 그대로다.
    character.createdAt은 ISO 문자열이고 users/{uid}.createdAt은
    serverTimestamp라 **둘의 타입이 다르다** — 프론트가 그렇게 쓰고 있어서
    맞춘 것이지 실수가 아니다.
    """
    stamp = timestamp or now_iso()
    document: dict[str, Any] = {
        "email": spec.email,
        "displayName": spec.nickname or "",
        "photoURL": "",
        "createdAt": server_timestamp,
        "updatedAt": server_timestamp,
    }

    if spec.nickname:
        document["character"] = {
            "nickname": spec.nickname,
            "gender": spec.gender or "female",
            "createdAt": stamp,
        }

    if spec.adhd_raw_score is not None:
        raw = spec.adhd_raw_score
        document["adhdResult"] = {
            "testType": "adhd",
            "answers": build_adhd_answers(raw),
            "score": js_round(raw / ADHD_MAX_RAW_SCORE * 100),
            "rawScore": raw,
            "completedAt": stamp,
        }

    if spec.stress_counts is not None:
        counts = dict(spec.stress_counts)
        document["stressResult"] = {
            "testType": "stress",
            "answers": build_stress_answers(counts),
            "score": sum(counts[key] for key in REACTION_KEYS),
            "counts": counts,
            "resultType": classify_stress_result(counts),
            "completedAt": stamp,
        }

    if with_consent:
        # 기본으로 넣지 않는 이유: 검수자가 실사용자 경로로 동의 게이트를 통과하는
        # 것 자체가 검수 항목이다. 게이트 이후 화면만 보려는 회차에서만 켠다.
        document["termsConsent"] = {
            "termsAgreedAt": server_timestamp,
            "privacyAgreedAt": server_timestamp,
            "marketingAgreed": False,
            "marketingAgreedAt": None,
            "version": LEGAL_VERSION,
        }

    return document


def verify_seed_types(specs: list[AccountSpec]) -> list[str]:
    """선언한 expected_type이 실제 분류 결과와 맞는지 검사한다.

    counts를 손으로 적다 보면 동률이 하나 어긋나 유형이 조용히 바뀐다.
    그러면 C-15 계정 셋이 같은 시나리오를 보여주는데 아무도 이유를 모른다.
    create는 이 검사가 통과할 때만 진행한다.
    """
    problems: list[str] = []
    for spec in specs:
        if spec.stress_counts is None:
            continue
        actual = classify_stress_result(spec.stress_counts)
        if spec.expected_type and actual != spec.expected_type:
            problems.append(
                f"{spec.email}: 선언 {spec.expected_type} ≠ 실제 {actual} (counts={spec.stress_counts})"
            )
        if actual == "undetermined":
            problems.append(f"{spec.email}: 판별 불가 시드는 저장되지 않습니다 (counts={spec.stress_counts})")
    return problems


# ─────────────────────────────────────────────────────────────────────────────
# Firebase 연결
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class Clients:
    """Auth·Firestore 접근점을 한 곳에 모은다.

    모듈 전역에서 직접 firebase_admin을 부르지 않고 이 객체를 인자로 넘기는
    이유는 테스트에서 대역으로 갈아끼우기 위해서다 — dry-run이 정말로 아무것도
    쓰지 않는지는 대역의 호출 기록으로만 증명할 수 있다.
    """

    auth: Any
    db: Any
    server_timestamp: Any = None


def init_clients(secrets_path: Path) -> Clients:
    """secrets.toml의 [firebase] 섹션으로 Admin SDK를 초기화한다.

    check_csv_sync.py와 같은 경로다. Streamlit의 st.secrets가 아니라 파일을
    직접 읽는 이유는 이 스크립트가 Streamlit 런타임 밖에서 돌기 때문이다.
    """
    if not secrets_path.exists():
        raise FileNotFoundError(f"secrets.toml이 없습니다: {secrets_path}")

    with secrets_path.open("rb") as handle:
        data = tomllib.load(handle)
    if "firebase" not in data:
        raise KeyError(f"[firebase] 섹션이 없습니다: {secrets_path}")

    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(dict(data["firebase"])))

    return Clients(auth=fb_auth, db=firestore.client(), server_timestamp=firestore.SERVER_TIMESTAMP)


# ─────────────────────────────────────────────────────────────────────────────
# 조회
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class AccountStatus:
    spec: AccountSpec
    exists: bool
    uid: str | None = None
    email_verified: bool = False
    disabled: bool = False
    doc_exists: bool = False


def lookup(clients: Clients, spec: AccountSpec) -> AccountStatus:
    """Auth 계정과 users/{uid} 문서의 현재 상태를 읽는다 (읽기 전용)."""
    try:
        user = clients.auth.get_user_by_email(spec.email)
    except fb_auth.UserNotFoundError:
        return AccountStatus(spec=spec, exists=False)

    snapshot = clients.db.collection(USERS_COLLECTION).document(user.uid).get()
    return AccountStatus(
        spec=spec,
        exists=True,
        uid=user.uid,
        email_verified=bool(getattr(user, "email_verified", False)),
        disabled=bool(getattr(user, "disabled", False)),
        doc_exists=bool(getattr(snapshot, "exists", False)),
    )


def print_status_table(statuses: list[AccountStatus]) -> None:
    header = f"{'이메일':<32} {'Auth':<6} {'uid':<30} {'인증':<5} {'정지':<5} {'users/{uid}':<12} 용도"
    print(header)
    print("-" * len(header))
    for status in statuses:
        mark = "있음" if status.exists else "없음"
        uid = status.uid or "-"
        verified = ("O" if status.email_verified else "X") if status.exists else "-"
        disabled = ("정지" if status.disabled else "활성") if status.exists else "-"
        doc = ("있음" if status.doc_exists else "없음") if status.exists else "-"
        note = status.spec.purpose
        if status.spec.email in PROTECTED_EMAILS:
            note = f"[보호] {note}"
        print(f"{status.spec.email:<32} {mark:<6} {uid:<30} {verified:<5} {disabled:<5} {doc:<12} {note}")


# ─────────────────────────────────────────────────────────────────────────────
# 서브커맨드
# ─────────────────────────────────────────────────────────────────────────────

def cmd_list(clients: Clients, args: argparse.Namespace) -> int:
    statuses = [lookup(clients, spec) for spec in MANAGED_ACCOUNTS + REFERENCE_ACCOUNTS]
    print("■ 관리 대상 계정 현황 (읽기 전용)\n")
    print_status_table(statuses)

    live = [s for s in statuses if s.exists and s.spec.email not in PROTECTED_EMAILS]
    print(f"\n삭제 대상 후보: {len(live)}개 / 관리 대상 {len(MANAGED_ACCOUNTS)}개")
    print(
        "test@example.com은 삭제 대상이 아닙니다 — next-steps.md §3에 따라 "
        "`auth.update_user(uid, disabled=True)`로 **비활성화**할 계정입니다."
    )
    return 0


def cmd_delete(clients: Clients, args: argparse.Namespace) -> int:
    targets = delete_targets()

    leaked = [spec.email for spec in targets if spec.email in PROTECTED_EMAILS]
    if leaked:
        print(f"보호 계정이 삭제 대상에 섞였습니다: {', '.join(leaked)}", file=sys.stderr)
        return 1

    statuses = [lookup(clients, spec) for spec in targets]
    present = [s for s in statuses if s.exists]

    print("■ 삭제 대상\n")
    print_status_table(statuses)
    print(f"\n실재 계정 {len(present)}개 / 선언 {len(targets)}개")
    print("보호 계정(삭제 제외): " + ", ".join(sorted(PROTECTED_EMAILS)))

    if not args.apply:
        print("\n[dry-run] 아무것도 삭제하지 않았습니다. 실제로 지우려면 --apply를 붙이세요.")
        return 0

    if not present:
        print("\n지울 계정이 없습니다.")
        return 0

    print("\n위 계정의 Auth 레코드와 users/{uid} 문서를 삭제합니다. 되돌릴 수 없습니다.")
    answer = input("삭제하려면 DELETE 를 그대로 입력하세요: ").strip()
    if answer != "DELETE":
        print("입력이 일치하지 않아 중단했습니다. 아무것도 삭제하지 않았습니다.")
        return 0

    for status in present:
        assert status.spec.email not in PROTECTED_EMAILS  # 마지막 그물
        clients.db.collection(USERS_COLLECTION).document(status.uid).delete()
        clients.auth.delete_user(status.uid)
        print(f"  삭제 완료 {status.spec.email} ({status.uid})")

    print(f"\n{len(present)}개 계정을 삭제했습니다.")
    return 0


def cmd_create(clients: Clients, args: argparse.Namespace) -> int:
    specs = list(MANAGED_ACCOUNTS)

    problems = verify_seed_types(specs)
    if problems:
        print("시드 정의가 스스로 어긋납니다:", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        return 1

    password = args.password or os.getenv("UAT_PASSWORD")
    if args.apply and not password:
        print(
            "비밀번호가 없습니다. --password 또는 환경변수 UAT_PASSWORD로 넘기세요.\n"
            "(코드에 하드코딩하지 않습니다 — 문서마다 비밀번호가 갈린 전례가 있습니다.)",
            file=sys.stderr,
        )
        return 1
    if args.apply and len(password) < 6:
        print("Firebase 비밀번호는 6자 이상이어야 합니다.", file=sys.stderr)
        return 1

    statuses = [lookup(clients, spec) for spec in specs]

    print("■ 생성 계획\n")
    header = f"{'이메일':<32} {'현재':<6} {'유형':<14} {'1편 버전':<10} {'닉네임':<8} 용도"
    print(header)
    print("-" * len(header))
    for status in statuses:
        spec = status.spec
        if spec.stress_counts is None:
            type_label, first_episode = "-", "-"
        else:
            result_type = classify_stress_result(spec.stress_counts)
            type_label = STRESS_TYPE_LABEL[result_type]
            first_episode = reaction_type_cycle(result_type)[0]
        current = "존재" if status.exists else "없음"
        print(
            f"{spec.email:<32} {current:<6} {type_label:<14} {first_episode:<10} "
            f"{spec.nickname or '-':<8} {spec.purpose}"
        )

    print(f"\n동의 기록(termsConsent) 시드: {'함께 씀' if args.with_consent else '쓰지 않음 (기본)'}")
    if not args.with_consent:
        print("  → 검수자가 로그인 후 동의 게이트를 직접 통과하게 됩니다 (그 자체가 검수 항목).")
    print(f"비밀번호 출처: {'--password 인자' if args.password else ('환경변수 UAT_PASSWORD' if password else '미지정')}")
    print(
        "이메일 인증(email_verified)은 True로 만듭니다 — @syu-react.test는 실제 메일을 받을 수 "
        "없는 도메인이고, useAuthStore가 미인증 계정의 로그인을 막기 때문입니다."
    )

    if not args.apply:
        print("\n[dry-run] 아무것도 만들지 않았습니다. 실제로 만들려면 --apply를 붙이세요.")
        return 0

    created = 0
    for status in statuses:
        spec = status.spec
        if status.exists:
            print(f"  건너뜀 {spec.email} — 이미 존재 ({status.uid})")
            uid = status.uid
        else:
            user = clients.auth.create_user(
                email=spec.email,
                password=password,
                email_verified=True,
                display_name=spec.nickname or None,
            )
            uid = user.uid
            created += 1
            print(f"  생성 완료 {spec.email} ({uid})")

        document = build_user_document(
            spec,
            with_consent=args.with_consent,
            server_timestamp=clients.server_timestamp,
        )
        clients.db.collection(USERS_COLLECTION).document(uid).set(document, merge=True)

    print(f"\n신규 {created}개 생성, 문서 {len(statuses)}개 시드 완료.")
    return 0


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

DEFAULT_SECRETS = Path(".streamlit/secrets.toml")


def build_parser() -> argparse.ArgumentParser:
    # --secrets는 서브커맨드 앞뒤 어디에 붙여도 받는다. 손으로 치는 명령이라
    # `list --secrets ...` 순서로 쓰는 게 자연스러운데, 최상위에만 두면 그 순서가
    # "unrecognized arguments"로 튕긴다. 서브파서 쪽 default를 SUPPRESS로 두어
    # 사용자가 실제로 넘겼을 때만 최상위 값을 덮어쓰게 한다.
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument(
        "--secrets",
        type=Path,
        default=argparse.SUPPRESS,
        help="서비스 계정 키 파일 경로 (기본: cwd 기준 .streamlit/secrets.toml)",
    )

    parser = argparse.ArgumentParser(
        prog="seed_uat_accounts.py",
        description="UAT 계정 조회·생성·삭제 (기본 dry-run, 실제 실행은 --apply)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--secrets",
        type=Path,
        default=DEFAULT_SECRETS,
        help="서비스 계정 키 파일 경로 (기본: cwd 기준 .streamlit/secrets.toml)",
    )

    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser(
        "list",
        parents=[common],
        help="관리 대상 계정의 현재 상태를 출력한다 (읽기 전용)",
    )

    delete_parser = sub.add_parser("delete", parents=[common], help="UAT 계정과 users 문서를 삭제한다")
    delete_parser.add_argument("--apply", action="store_true", help="실제로 삭제한다 (확인 입력 필요)")

    create_parser = sub.add_parser("create", parents=[common], help="다음 회차용 UAT 계정을 만든다")
    create_parser.add_argument("--apply", action="store_true", help="실제로 생성한다")
    create_parser.add_argument("--password", help="계정 비밀번호 (없으면 환경변수 UAT_PASSWORD)")
    create_parser.add_argument(
        "--with-consent",
        action="store_true",
        help="termsConsent까지 시드한다 (기본은 미시드 — 동의 게이트 통과가 검수 항목)",
    )

    return parser


HANDLERS = {"list": cmd_list, "delete": cmd_delete, "create": cmd_create}


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    try:
        clients = init_clients(args.secrets)
    except Exception as error:  # 자격증명 문제는 전부 같은 처방(경로·키 확인)이다
        print(f"Firebase 연결 실패: {error}", file=sys.stderr)
        return 1

    return HANDLERS[args.command](clients, args)


if __name__ == "__main__":
    sys.exit(main())
