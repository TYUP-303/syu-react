# user_admin_utils.py
# 「유저 관리」 상세 조회·정정(NRQ-0094~0096)의 순수 함수 모듈.
#
# export_utils.py·csv_validation.py와 같은 계약이다 — Streamlit·firebase_admin
# 의존성이 없어 pytest로 직접 호출해 검증한다. streamlit_app.py는 화면과
# Firestore I/O만 맡고, "무엇이 지워지는가"·"지워도 되는가"의 판단은 전부
# 여기에 둔다.
#
# ── 왜 계획(plan)과 실행(payload)을 나눴나 ────────────────────────
# 정정은 되돌릴 수 없는 삭제다. 화면이 보여준 미리보기와 실제로 나가는 쓰기가
# 같다는 것을 보장하려면 둘이 같은 객체에서 나와야 한다. 그래서
# plan_*() 가 만든 CorrectionPlan 하나가 미리보기·차단 사유·쓰기 payload의
# 단일 출처이고, build_deletion_payload()는 그 plan 없이는 호출할 수 없다.
#
# ── users/{uid} 스키마 출처 ───────────────────────────────────────
# export_utils.py 머리말과 같다. 추측한 필드는 없으며 아래에서 확인했다:
#   adhdResult / stressResult → src/store/useTestStore.ts (TestResultData)
#   scenarios[episodeId]      → src/store/useScenarioStore.ts (EpisodeProgress)
#   termsConsent              → src/store/useConsentStore.ts (TermsConsentRecord)
#   seenReports               → src/store/useScenarioStore.ts (string[] of themeId)
#   epilogues                 → src/store/useScenarioStore.ts (themeId → {seenAt})
#   character / avatarId      → src/store/useCharacterStore.ts (CharacterInfo)

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import pandas as pd

from export_utils import (
    EPISODE_ID_SEPARATOR,
    SCENARIO_THEMES,
    STRATEGY_LABEL,
    STRESS_RESULT_TYPE_LABEL,
    format_timestamp,
    theme_id_of,
)

# ── 보호 계정 ────────────────────────────────────────────────────
# seed_uat_accounts.PROTECTED_EMAILS와 **같은 값이어야 한다**
# (tests/test_user_admin_utils.py가 두 목록이 어긋나면 실패시킨다).
#
# 여기서 보호하는 대상이 계정 삭제가 아니라 '진행도 정정'인 이유:
# test@example.com의 uid에는 디버그 해금 판별과 4영역 완주 시드가 묶여 있어,
# 시나리오 진행도를 리셋하면 계정을 지우지 않아도 그 시드가 사라진다.
PROTECTED_EMAILS = frozenset({"test@example.com"})

# ── 표시용 상수 ──────────────────────────────────────────────────
THEME_LABEL = dict(SCENARIO_THEMES)
THEME_IDS = tuple(theme_id for theme_id, _ in SCENARIO_THEMES)

#: 영역당 회차 수. scenario_visual.csv의 DOMAIN 열에서 확인한 값이며(4영역 모두 10),
#: **진행률 표시에만 쓴다**. '다음 미완료 회차' 계산은 이 값에 기대지 않으므로
#: 콘텐츠가 늘어도 조회는 깨지지 않는다.
EPISODES_PER_THEME = 10

TEST_FIELDS = {
    "adhd": ("adhdResult", "ADHD 경향성 검사"),
    "stress": ("stressResult", "스트레스 대처기제 검사"),
}

GENDER_LABEL = {"male": "남성", "female": "여성"}

CONSENT_FIELD_LABEL = (
    ("version", "약관 버전"),
    ("termsAgreedAt", "이용약관 동의 시각"),
    ("privacyAgreedAt", "개인정보 처리방침 동의 시각"),
    ("marketingAgreed", "마케팅 수신 동의"),
    ("marketingAgreedAt", "마케팅 동의 시각"),
)

EMPTY = "-"


def _as_dict(value) -> dict:
    return value if isinstance(value, dict) else {}


def _kv_frame(rows) -> pd.DataFrame:
    """항목/값 2열 표. 전 칸을 문자열로 만든다 — 혼합 타입 DataFrame이 Arrow
    직렬화에서 프로세스를 죽인 전례가 있다(streamlit_app.py 유저 표 주석)."""
    return pd.DataFrame([{"항목": k, "값": "" if v is None else str(v)} for k, v in rows])


# ═════════════════════════════════════════════════════════════════
# 조회 (NRQ-0094 · 0095 · 0096 앞단)
# ═════════════════════════════════════════════════════════════════

def build_profile_rows(uid: str, data) -> pd.DataFrame:
    """프로필 — 이메일·닉네임·성별·가입일·avatarId."""
    data = _as_dict(data)
    character = _as_dict(data.get("character"))

    gender = character.get("gender") or ""
    avatar_id = data.get("avatarId")

    return _kv_frame(
        [
            ("UID", uid),
            ("이메일", data.get("email") or EMPTY),
            ("이름 (Auth)", data.get("displayName") or EMPTY),
            ("캐릭터 닉네임", character.get("nickname") or EMPTY),
            ("성별", GENDER_LABEL.get(gender, gender or EMPTY)),
            ("캐릭터 생성일", format_timestamp(character.get("createdAt")) or EMPTY),
            ("가입일", format_timestamp(data.get("createdAt")) or EMPTY),
            # avatarId는 null이 '프리셋 아바타 해제'라는 의미를 갖는 값이라
            # 빈 문자열과 구분해서 적는다.
            ("avatarId", EMPTY if avatar_id in (None, "") else avatar_id),
        ]
    )


def build_consent_rows(data) -> pd.DataFrame:
    """동의 기록(termsConsent). 문서가 없으면 빈 표를 돌려준다.

    동의 시각은 serverTimestamp()로 기록되므로 Firestore Timestamp가 들어온다.
    """
    consent = _as_dict(_as_dict(data).get("termsConsent"))
    if not consent:
        return _kv_frame([])

    rows = []
    for key, label in CONSENT_FIELD_LABEL:
        value = consent.get(key)
        if key == "marketingAgreed":
            rows.append((label, "동의" if value else "미동의"))
        elif key.endswith("At"):
            rows.append((label, format_timestamp(value) or EMPTY))
        else:
            rows.append((label, value if value not in (None, "") else EMPTY))
    return _kv_frame(rows)


def has_consent(data) -> bool:
    return bool(_as_dict(_as_dict(data).get("termsConsent")))


def build_test_summary_rows(data, test_key: str) -> pd.DataFrame:
    """검사 결과 요약. adhdResult / stressResult의 핵심 필드만 편다.

    문항별 원응답(answers)은 별도 표(build_answer_rows)로 뺀다 — 12~20행이라
    요약과 같은 표에 넣으면 읽히지 않는다.
    """
    data = _as_dict(data)
    field_name, _ = TEST_FIELDS[test_key]
    result = _as_dict(data.get(field_name))
    if not result:
        return _kv_frame([])

    rows: list[tuple[str, Any]] = [("완료 시각", format_timestamp(result.get("completedAt")) or EMPTY)]

    if test_key == "adhd":
        raw = result.get("rawScore")
        rows.append(("원점수 (ASRS-6, 0~24)", EMPTY if raw is None else raw))
        rows.append(("환산점수 (0~100)", result.get("score", EMPTY)))
    else:
        counts = _as_dict(result.get("counts"))
        rows.append(("총점 ('예' 개수, 0~12)", result.get("score", EMPTY)))
        rows.append(("인지 (0~4)", counts.get("cognitive", EMPTY)))
        rows.append(("정서 (0~4)", counts.get("emotional", EMPTY)))
        rows.append(("행동 (0~4)", counts.get("behavioral", EMPTY)))
        result_type = result.get("resultType") or ""
        label = STRESS_RESULT_TYPE_LABEL.get(result_type, "")
        rows.append(("유형", f"{label} ({result_type})" if label else (result_type or EMPTY)))

    rows.append(("응답 문항 수", len(_as_dict(result.get("answers")))))
    return _kv_frame(rows)


def build_answer_rows(data, test_key: str) -> pd.DataFrame:
    """문항별 원응답(NRQ-0095). answers는 {문항id: 선택지 index} 맵이다.

    키가 문자열로 돌아오는 경우가 있어(JSON 왕복) 숫자로 바꿔 정렬한다.
    숫자가 아닌 키는 버리지 않고 뒤에 붙인다 — 조회 화면에서 데이터를 조용히
    감추는 것보다 이상한 값이 보이는 편이 낫다.
    """
    field_name, _ = TEST_FIELDS[test_key]
    answers = _as_dict(_as_dict(data).get(field_name)).get("answers")
    answers = _as_dict(answers)
    if not answers:
        return pd.DataFrame(columns=["문항 id", "선택지 index"])

    def sort_key(item):
        try:
            return (0, int(item[0]))
        except (TypeError, ValueError):
            return (1, 0)

    return pd.DataFrame(
        [
            {"문항 id": str(qid), "선택지 index": str(idx)}
            for qid, idx in sorted(answers.items(), key=sort_key)
        ]
    )


def episode_number_of(episode_id: str) -> int | None:
    """'job-prep-ep3' → 3. 형식을 벗어난 키는 None."""
    if EPISODE_ID_SEPARATOR not in episode_id:
        return None
    tail = episode_id.rsplit(EPISODE_ID_SEPARATOR, 1)[1]
    try:
        return int(tail)
    except ValueError:
        return None


def cleared_episode_ids(scenarios, theme_id: str) -> list:
    """해당 영역의 **완주 기록이 있는** 에피소드 키를 회차 순으로.

    cleared가 False인 기록도 포함한다 — 정정 대상은 '완주 여부'가 아니라
    '맵에 남아 있는 기록'이기 때문이다. 지울 것을 빠뜨리면 CS가 다시 들어온다.
    """
    scenarios = _as_dict(scenarios)
    matched = [eid for eid in scenarios if theme_id_of(str(eid)) == theme_id]
    return sorted(matched, key=lambda eid: (episode_number_of(str(eid)) is None, episode_number_of(str(eid)) or 0, str(eid)))


def next_unplayed_number(scenarios, theme_id: str) -> int:
    """'현재 진행 중인 위치'(Save point). 기록이 없는 가장 빠른 회차다.

    앱은 이어하기 지점을 따로 저장하지 않는다 — 완주 기록의 빈자리로 정해지므로
    여기서도 같은 방식으로 되짚는다. EPISODES_PER_THEME에 기대지 않아
    콘텐츠가 늘어도 값이 어긋나지 않는다.
    """
    played = {
        episode_number_of(str(eid))
        for eid in cleared_episode_ids(scenarios, theme_id)
        if episode_number_of(str(eid)) is not None
    }
    number = 1
    while number in played:
        number += 1
    return number


def build_theme_progress_rows(scenarios, seen_reports=None) -> pd.DataFrame:
    """영역별 완료 회차 집계 + 이어하기 위치."""
    scenarios = _as_dict(scenarios)
    seen = set(seen_reports or [])

    rows = []
    for theme_id, theme_label in SCENARIO_THEMES:
        episode_ids = cleared_episode_ids(scenarios, theme_id)
        cleared = sum(
            1 for eid in episode_ids if _as_dict(scenarios.get(eid)).get("cleared")
        )
        rows.append(
            {
                "영역": theme_label,
                "themeId": theme_id,
                "완주": f"{cleared} / {EPISODES_PER_THEME}",
                "기록 수": str(len(episode_ids)),
                "이어하기 위치": f"{next_unplayed_number(scenarios, theme_id)}회차",
                "보고서 열람": "O" if theme_id in seen else "-",
            }
        )
    return pd.DataFrame(rows)


def build_episode_rows(scenarios, theme_id: str | None = None) -> pd.DataFrame:
    """에피소드별 목록 — 선택 전략·도움 여부·선택 이유·갱신 시각.

    theme_id를 주면 그 영역만, 없으면 4영역 전체를 회차 순으로 돌려준다.
    형식을 벗어난 키(themeId가 4영역 밖)도 '(알 수 없음)'으로 **반드시 보여준다**
    — 정정 대상에서 빠지면 CS로 다시 들어오기 때문이다.
    """
    scenarios = _as_dict(scenarios)
    theme_ids = [theme_id] if theme_id else [tid for tid, _ in SCENARIO_THEMES]

    known: list = []
    for tid in theme_ids:
        known.extend(cleared_episode_ids(scenarios, tid))

    if theme_id is None:
        # 4영역 어디에도 붙지 않는 키를 뒤에 붙인다.
        known.extend(eid for eid in sorted(scenarios) if eid not in set(known))

    rows = []
    for episode_id in known:
        entry = _as_dict(scenarios.get(episode_id))
        tid = theme_id_of(str(episode_id))
        angel = entry.get("selectedAngel") or ""
        rows.append(
            {
                "episodeId": str(episode_id),
                "영역": THEME_LABEL.get(tid, "(알 수 없음)"),
                "회차": str(episode_number_of(str(episode_id)) or EMPTY),
                "완주": "O" if entry.get("cleared") else "-",
                "선택 전략": STRATEGY_LABEL.get(angel, angel or EMPTY),
                "도움 여부": "도움됨" if entry.get("wasHelpful") else "도움 안 됨",
                "선택 이유": str(entry.get("selectedReason") or EMPTY),
                "갱신 시각": format_timestamp(entry.get("updatedAt")) or EMPTY,
            }
        )

    columns = ["episodeId", "영역", "회차", "완주", "선택 전략", "도움 여부", "선택 이유", "갱신 시각"]
    return pd.DataFrame(rows, columns=columns)


def seen_report_labels(data) -> list:
    """seenReports(themeId 배열)를 사람이 읽는 영역명으로.

    필드가 없는 것(레거시)과 빈 배열(확인된 0건)은 화면에서 구분해야 하므로
    여기서는 목록만 돌려주고, 판단은 has_seen_reports_field가 맡는다.
    """
    raw = _as_dict(data).get("seenReports")
    if not isinstance(raw, list):
        return []
    return [THEME_LABEL.get(str(tid), str(tid)) for tid in raw]


def has_seen_reports_field(data) -> bool:
    return isinstance(_as_dict(data).get("seenReports"), list)


def epilogue_labels(data) -> list:
    """epilogues(themeId → {seenAt})를 '영역명 (열람 시각)' 줄로.

    진행도(scenarios)와 **다른 필드**다. 에필로그는 전략을 고르지도 평가하지도
    않는 읽기 전용 장면이라 EpisodeProgress에 담을 값이 없고, 같은 맵에 섞으면
    영역 완주 판정의 분모만 늘려 통계를 왜곡한다(프론트 firestoreKeys 주석).
    그래서 여기서도 진행 표(build_theme_progress_rows)와 섞지 않고 따로 낸다.

    seen_report_labels와 같은 규약이다: 목록만 돌려주고 "필드가 없다"와
    "본 것이 없다"의 구분은 has_epilogues_field가 맡는다.
    """
    raw = _as_dict(data).get("epilogues")
    if not isinstance(raw, dict):
        return []
    rows = []
    for theme_id in sorted(raw):
        seen_at = format_timestamp(_as_dict(raw.get(theme_id)).get("seenAt"))
        label = THEME_LABEL.get(str(theme_id), str(theme_id))
        rows.append(f"{label} ({seen_at})" if seen_at else label)
    return rows


def has_epilogues_field(data) -> bool:
    return isinstance(_as_dict(data).get("epilogues"), dict)


# ═════════════════════════════════════════════════════════════════
# 정정 (NRQ-0096)
# ═════════════════════════════════════════════════════════════════

@dataclass(frozen=True)
class CorrectionPlan:
    """정정 1건의 계획. 미리보기·차단 사유·쓰기 payload의 단일 출처다.

    deletes   : 삭제할 필드 경로. ('adhdResult',) 또는 ('scenarios', 'daily-ep2').
    overwrites: 통째로 다시 쓸 최상위 필드. 배열(seenReports)은 원소 하나만
                지울 수 없어 삭제가 아니라 덮어쓰기로 처리한다.
    """

    kind: str
    label: str
    deletes: tuple = ()
    overwrites: dict = field(default_factory=dict)
    preview: pd.DataFrame = field(default_factory=pd.DataFrame)
    blocked_reason: str | None = None

    @property
    def allowed(self) -> bool:
        """실행해도 되는가. 차단 사유가 없고 실제로 바뀌는 것이 있어야 한다."""
        return self.blocked_reason is None and bool(self.deletes or self.overwrites)


def matched_protected_email(email=None, data=None) -> str | None:
    """넘겨받은 후보들 중 보호 계정 이메일이 있으면 그 이메일을, 없으면 None.

    화면이 넘겨준 이메일(Auth 목록 기준)과 **문서에 적힌 이메일을 함께** 본다.
    Auth 레코드가 없는 유저는 화면 목록에서 이메일이 'Auth 없음'으로 표시되는데,
    그 값만 믿으면 보호 계정이 그물을 빠져나간다.

    판정을 이 한 곳에 모아 둔다 — 진행도 정정과 계정 정지·삭제가 서로 다른
    판별식을 쓰면 한쪽에만 그물이 생긴다(실제로 그랬다).
    """
    candidates = {
        str(value).strip().lower()
        for value in (email, _as_dict(data).get("email"))
        if value
    }
    matched = candidates & PROTECTED_EMAILS
    return sorted(matched)[0] if matched else None


def _protected_block(data, email=None) -> str | None:
    """진행도 정정에서 보호 계정이면 차단 사유를, 아니면 None."""
    matched = matched_protected_email(email, data)
    if matched:
        return (
            f"보호 계정({matched})입니다. 이 uid에는 디버그 해금 판별과 "
            "4영역 완주 시드가 묶여 있어 진행도를 정정하면 함께 사라집니다."
        )
    return None


def account_block_reason(email=None, data=None) -> str | None:
    """계정 **정지·삭제**를 막아야 하면 사유를, 아니면 None.

    진행도 정정(_protected_block)과 대상은 같고 사유 문구만 다르다 — 여기서
    잃는 것은 기록이 아니라 계정 자체이기 때문이다.

    정지까지 막는 이유: 보호 계정은 검수·디버그용 공용 계정이라 정지되면
    UAT가 그 자리에서 멈춘다. 삭제만큼 파괴적이지는 않지만 어드민 화면에서
    무심코 누를 수 있는 자리에 둘 이유가 없다.
    **활성화(Enable)는 막지 않는다** — 이미 정지된 보호 계정을 되살리는,
    유일하게 복구 방향인 동작이다.
    """
    matched = matched_protected_email(email, data)
    if matched:
        return (
            f"보호 계정({matched})이라 정지·삭제할 수 없습니다. 이 uid에는 디버그 해금 "
            "판별과 4영역 완주 시드가 묶여 있어, 정지하면 검수가 멈추고 삭제하면 "
            "되살릴 수 없습니다."
        )
    return None


def plan_episode_delete(data, episode_id: str, email=None) -> CorrectionPlan:
    """① 에피소드 진행 1건 삭제 — scenarios 맵에서 해당 키를 제거한다."""
    scenarios = _as_dict(_as_dict(data).get("scenarios"))
    label = f"에피소드 {episode_id}"

    blocked = _protected_block(data, email)
    if blocked is None and episode_id not in scenarios:
        blocked = f"scenarios에 '{episode_id}' 기록이 없습니다. 지울 것이 없습니다."

    preview = (
        build_episode_rows({episode_id: scenarios[episode_id]})
        if episode_id in scenarios
        else pd.DataFrame()
    )
    return CorrectionPlan(
        kind="episode",
        label=label,
        deletes=() if blocked else (("scenarios", episode_id),),
        preview=preview,
        blocked_reason=blocked,
    )


def plan_theme_reset(data, theme_id: str, email=None, clear_seen_report: bool = True) -> CorrectionPlan:
    """② 영역 전체 리셋 — 해당 영역 에피소드 키를 일괄 제거한다.

    clear_seen_report=True(기본)면 seenReports에서도 그 영역을 뺀다. 진행도만
    지우고 열람 기록을 남기면 유저가 그 영역을 다시 완주해도 완료 보고서가
    '이미 봤다'로 처리돼 뜨지 않는다 — 리셋을 요청한 CS 건이 그대로 재발한다.
    """
    data = _as_dict(data)
    scenarios = _as_dict(data.get("scenarios"))
    theme_label = THEME_LABEL.get(theme_id, theme_id)
    episode_ids = cleared_episode_ids(scenarios, theme_id)

    seen_raw = data.get("seenReports")
    seen_list = list(seen_raw) if isinstance(seen_raw, list) else []
    drop_seen = clear_seen_report and theme_id in seen_list

    blocked = _protected_block(data, email)
    if blocked is None and not episode_ids and not drop_seen:
        blocked = f"'{theme_label}' 영역에 지울 기록이 없습니다."

    overwrites = {}
    if not blocked and drop_seen:
        overwrites["seenReports"] = [t for t in seen_list if t != theme_id]

    return CorrectionPlan(
        kind="theme",
        label=f"{theme_label} 영역 전체",
        deletes=() if blocked else tuple(("scenarios", eid) for eid in episode_ids),
        overwrites=overwrites,
        preview=build_episode_rows(scenarios, theme_id) if episode_ids else pd.DataFrame(),
        blocked_reason=blocked,
    )


def plan_test_delete(data, test_key: str, email=None) -> CorrectionPlan:
    """③ 검사 결과 삭제 — adhdResult 또는 stressResult 필드를 통째로 제거한다."""
    if test_key not in TEST_FIELDS:
        raise ValueError(f"알 수 없는 검사 종류입니다: {test_key}")

    field_name, test_label = TEST_FIELDS[test_key]
    data = _as_dict(data)

    blocked = _protected_block(data, email)
    if blocked is None and not _as_dict(data.get(field_name)):
        blocked = f"{test_label} 결과가 없습니다. 지울 것이 없습니다."

    return CorrectionPlan(
        kind="test",
        label=f"{test_label} 결과",
        deletes=() if blocked else ((field_name,),),
        preview=build_test_summary_rows(data, test_key) if not blocked else pd.DataFrame(),
        blocked_reason=blocked,
    )


def describe_plan(plan: CorrectionPlan) -> list:
    """'무엇이 지워지는가'를 한 줄씩. 화면 미리보기의 문구 출처다."""
    if plan.blocked_reason:
        return [plan.blocked_reason]

    lines = [f"{'.'.join(path)} 필드를 삭제합니다." for path in plan.deletes]
    for key, value in plan.overwrites.items():
        lines.append(f"{key} 필드를 {value!r}로 다시 씁니다.")
    return lines


def build_deletion_payload(plan: CorrectionPlan, delete_sentinel) -> dict:
    """계획을 Firestore merge 쓰기 payload로 바꾼다.

    ⚠️ delete_sentinel은 반드시 `firestore.DELETE_FIELD`를 넘긴다. merge 쓰기는
    필드를 **지우지 못하고 덮어쓰기만** 하므로, 센티널 없이 빈 dict를 쓰면
    필드가 남아 있는 채로 CS가 종결된다(2026-08-13 탈퇴 버그와 같은 함정).
    중첩 맵 키는 {'scenarios': {'daily-ep2': DELETE_FIELD}} 형태로 넣으면
    update mask가 `scenarios.`daily-ep2``로 나가 그 키만 지워진다.

    차단된 계획은 payload를 만들지 않고 예외를 던진다 — 화면의 확인 절차를
    건너뛴 호출을 막는 마지막 그물이다(seed_uat_accounts의 assert와 같은 역할).
    """
    if not plan.allowed:
        raise ValueError(f"실행할 수 없는 정정입니다: {plan.blocked_reason or '변경할 내용이 없습니다.'}")

    payload: dict = dict(plan.overwrites)
    for path in plan.deletes:
        if len(path) == 1:
            payload[path[0]] = delete_sentinel
        elif len(path) == 2:
            payload.setdefault(path[0], {})[path[1]] = delete_sentinel
        else:
            raise ValueError(f"지원하지 않는 필드 경로 깊이입니다: {path}")
    return payload


def demo_user_document() -> tuple:
    """Mock 모드에서 정정 절차를 연습하기 위한 예시 문서. (uid, 문서 dict).

    CSV 관리 메뉴가 Mock 세션 문서 저장소를 두는 것과 같은 이유다 — 자격증명이
    없는 인수인계 대상이 **되돌릴 수 없는 삭제 절차**를 실 데이터 없이 한 번은
    밟아 봐야 한다. 이메일을 example.com으로 둬 실 계정과 헷갈리지 않게 한다.
    """
    return (
        "demo-uid-0001",
        {
            "email": "demo@example.com",
            "displayName": "예시 유저",
            "createdAt": "2026-08-01T00:00:00Z",
            "avatarId": "avatar-1",
            "character": {"nickname": "연습이", "gender": "female", "createdAt": "2026-08-01T01:00:00Z"},
            "adhdResult": {
                "testType": "adhd",
                "answers": {1: 3, 2: 2, 3: 4, 4: 1, 5: 3, 6: 2},
                "score": 63,
                "rawScore": 15,
                "completedAt": "2026-08-02T05:00:00Z",
            },
            "stressResult": {
                "testType": "stress",
                "answers": {i: (0 if i % 2 else 1) for i in range(1, 13)},
                "score": 6,
                "counts": {"cognitive": 2, "emotional": 2, "behavioral": 2},
                "resultType": "balanced",
                "completedAt": "2026-08-02T06:00:00Z",
            },
            "scenarios": {
                "workplace-ep1": {
                    "cleared": True,
                    "selectedAngel": "accept",
                    "wasHelpful": True,
                    "selectedReason": "마음이 조금 가벼워졌어요",
                    "updatedAt": "2026-08-03T02:00:00Z",
                },
                "workplace-ep2": {
                    "cleared": True,
                    "selectedAngel": "reappraisal",
                    "wasHelpful": False,
                    "selectedReason": "상황이 달라지지는 않았어요",
                    "updatedAt": "2026-08-04T02:00:00Z",
                },
                "daily-ep1": {
                    "cleared": True,
                    "selectedAngel": "refocus",
                    "wasHelpful": True,
                    "selectedReason": "다른 일에 집중할 수 있었어요",
                    "updatedAt": "2026-08-05T02:00:00Z",
                },
            },
            "seenReports": ["workplace"],
            "termsConsent": {
                "version": "1.0.0",
                "termsAgreedAt": "2026-08-01T00:00:00Z",
                "privacyAgreedAt": "2026-08-01T00:00:00Z",
                "marketingAgreed": True,
                "marketingAgreedAt": "2026-08-01T00:00:00Z",
            },
        },
    )


def apply_plan_to_snapshot(data, plan: CorrectionPlan) -> dict:
    """Mock 모드용 — 실제 쓰기 대신 문서 dict에 계획을 적용한 사본을 만든다.

    Firestore에 연결되지 않은 환경에서도 정정 절차를 끝까지 연습해 볼 수 있어야
    하고(CSV 관리 메뉴와 같은 방침), 테스트가 '계획대로 지워지는가'를 실 DB 없이
    확인하는 데도 쓴다.
    """
    if not plan.allowed:
        raise ValueError(f"실행할 수 없는 정정입니다: {plan.blocked_reason or '변경할 내용이 없습니다.'}")

    result = {k: (dict(v) if isinstance(v, dict) else v) for k, v in _as_dict(data).items()}
    result.update({k: list(v) if isinstance(v, list) else v for k, v in plan.overwrites.items()})

    for path in plan.deletes:
        if len(path) == 1:
            result.pop(path[0], None)
        else:
            parent = result.get(path[0])
            if isinstance(parent, dict):
                parent.pop(path[1], None)
    return result
