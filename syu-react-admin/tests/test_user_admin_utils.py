# tests/test_user_admin_utils.py
# 유저 상세 조회·정정(NRQ-0094~0096)의 안전장치를 고정하는 테스트.
#
# 정정은 되돌릴 수 없는 삭제라, 검증의 초점은 test_seed_uat_accounts.py와 같다 —
# "기능이 도는가"보다 **"안 지워야 할 때 확실히 멈추는가"**다:
#   ① 지울 것이 없거나 보호 계정이면 계획 단계에서 차단된다
#   ② 차단된 계획으로는 payload 자체를 만들 수 없다 (화면을 우회한 호출 방어)
#   ③ merge 쓰기가 **의도한 필드만** 지운다 — Firestore가 실제로 만드는
#      update mask로 확인한다. "merge로는 필드가 안 지워진다"는 함정이
#      이 기능의 존재 이유이므로, 계획서 수준이 아니라 프로토콜 수준에서 못 박는다.

import pytest

import user_admin_utils as uau
from user_admin_utils import (
    CorrectionPlan,
    apply_plan_to_snapshot,
    build_answer_rows,
    build_consent_rows,
    build_deletion_payload,
    build_episode_rows,
    build_profile_rows,
    build_test_summary_rows,
    build_theme_progress_rows,
    describe_plan,
    next_unplayed_number,
    plan_episode_delete,
    plan_test_delete,
    plan_theme_reset,
    epilogue_labels,
    seen_report_labels,
)


# ─────────────────────────────────────────────────────────────────────────────
# 표본 문서
# ─────────────────────────────────────────────────────────────────────────────

def episode(cleared=True, angel="accept", helpful=True, reason="해볼 만했어요", at="2026-08-10T01:00:00Z"):
    return {
        "cleared": cleared,
        "selectedAngel": angel,
        "wasHelpful": helpful,
        "selectedReason": reason,
        "updatedAt": at,
    }


def sample_user():
    """실제 스키마를 그대로 옮긴 표본 (프론트 스토어 기준)."""
    return {
        "email": "user@example.com",
        "displayName": "홍길동",
        "photoURL": "https://example.com/p.png",
        "createdAt": "2026-08-01T00:00:00Z",
        "avatarId": "avatar-3",
        "character": {"nickname": "길동이", "gender": "male", "createdAt": "2026-08-01T01:00:00Z"},
        "adhdResult": {
            "testType": "adhd",
            "answers": {1: 3, 2: 0, 3: 4},
            "score": 75,
            "rawScore": 18,
            "completedAt": "2026-08-02T00:00:00Z",
        },
        "stressResult": {
            "testType": "stress",
            "answers": {1: 0, 2: 1},
            "score": 7,
            "counts": {"cognitive": 3, "emotional": 2, "behavioral": 2},
            "resultType": "cognitive",
            "completedAt": "2026-08-03T00:00:00Z",
        },
        "scenarios": {
            "workplace-ep1": episode(),
            "workplace-ep2": episode(angel="refocus", helpful=False),
            "daily-ep1": episode(angel="reappraisal"),
        },
        "seenReports": ["workplace", "daily"],
        "termsConsent": {
            "version": "1.0.0",
            "termsAgreedAt": "2026-08-01T00:00:00Z",
            "privacyAgreedAt": "2026-08-01T00:00:00Z",
            "marketingAgreed": False,
            "marketingAgreedAt": None,
        },
    }


def value_of(frame, label):
    """항목/값 2열 표에서 한 항목의 값을 꺼낸다."""
    matched = frame[frame["항목"] == label]["값"]
    return matched.iloc[0] if len(matched) else None


# ─────────────────────────────────────────────────────────────────────────────
# 보호 계정 — 목록이 갈라지면 실패한다
# ─────────────────────────────────────────────────────────────────────────────

def test_보호_계정_목록이_계정_정리_스크립트와_같다():
    # 값을 복사해 둔 이유는 순수 모듈로 유지하기 위해서다(firebase_admin 미의존).
    # 복사본은 조용히 어긋나므로 그 드리프트를 여기서 잡는다.
    import seed_uat_accounts as seed

    assert uau.PROTECTED_EMAILS == seed.PROTECTED_EMAILS


PROTECTED = "test@example.com"


class Test보호_계정_판별:
    """진행도 정정과 계정 정지·삭제가 **같은 판별식**을 쓰는지 고정한다.

    둘이 갈라지면 한쪽에만 그물이 생긴다 — 실제로 그랬다(정정에는 가드가
    있었고 정지·삭제에는 없었다).
    """

    def test_화면이_넘긴_이메일로_잡는다(self):
        assert uau.matched_protected_email(PROTECTED) == PROTECTED

    def test_문서에_적힌_이메일로도_잡는다(self):
        # Auth 레코드가 없는 유저는 목록에 'Auth 없음'으로 뜬다 — 화면 값만
        # 믿으면 보호 계정이 그물을 빠져나간다.
        assert uau.matched_protected_email("Auth 없음", {"email": PROTECTED}) == PROTECTED

    def test_대소문자와_공백을_무시한다(self):
        assert uau.matched_protected_email("  TEST@Example.COM ") == PROTECTED

    def test_일반_계정은_통과시킨다(self):
        assert uau.matched_protected_email("user@example.com") is None
        assert uau.matched_protected_email(None, None) is None


class Test계정_정지_삭제_가드:
    def test_보호_계정이면_사유를_돌려준다(self):
        reason = uau.account_block_reason(PROTECTED)
        assert reason is not None
        assert PROTECTED in reason

    def test_문서_이메일로도_막는다(self):
        assert uau.account_block_reason("Auth 없음", {"email": PROTECTED}) is not None

    def test_일반_계정은_막지_않는다(self):
        assert uau.account_block_reason("user@example.com") is None
        assert uau.account_block_reason("user@example.com", {"email": "user@example.com"}) is None

    def test_진행도_정정_가드와_대상이_같다(self):
        # 사유 문구는 달라도(잃는 것이 기록이냐 계정이냐) 대상은 같아야 한다.
        for email in (PROTECTED, "user@example.com", None):
            blocked_correction = uau._protected_block({}, email) is not None
            blocked_account = uau.account_block_reason(email) is not None
            assert blocked_correction == blocked_account

    def test_사유가_정지와_삭제를_모두_언급한다(self):
        # 화면이 이 문자열을 그대로 안내문으로 쓴다 — 왜 눌리지 않는지가
        # 문구만 읽고 이해돼야 한다.
        reason = uau.account_block_reason(PROTECTED)
        assert "정지" in reason and "삭제" in reason


# ─────────────────────────────────────────────────────────────────────────────
# 조회
# ─────────────────────────────────────────────────────────────────────────────

def test_프로필에_이메일_닉네임_성별_가입일_아바타가_나온다():
    frame = build_profile_rows("uid-1", sample_user())
    assert value_of(frame, "UID") == "uid-1"
    assert value_of(frame, "이메일") == "user@example.com"
    assert value_of(frame, "캐릭터 닉네임") == "길동이"
    assert value_of(frame, "성별") == "남성"
    assert value_of(frame, "avatarId") == "avatar-3"
    # createdAt(UTC)은 KST로 환산돼 나온다.
    assert value_of(frame, "가입일") == "2026-08-01 09:00:00"


def test_빈_문서도_프로필_표가_깨지지_않는다():
    frame = build_profile_rows("uid-1", {})
    assert value_of(frame, "이메일") == "-"
    assert value_of(frame, "avatarId") == "-"


def test_동의_기록이_없으면_빈_표다():
    assert build_consent_rows({}).empty
    assert not uau.has_consent({})


def test_동의_기록의_각_필드가_나온다():
    frame = build_consent_rows(sample_user())
    assert value_of(frame, "약관 버전") == "1.0.0"
    assert value_of(frame, "마케팅 수신 동의") == "미동의"
    assert value_of(frame, "이용약관 동의 시각") == "2026-08-01 09:00:00"


def test_ADHD_요약에_원점수와_환산점수가_나온다():
    frame = build_test_summary_rows(sample_user(), "adhd")
    assert value_of(frame, "원점수 (ASRS-6, 0~24)") == "18"
    assert value_of(frame, "환산점수 (0~100)") == "75"
    assert value_of(frame, "응답 문항 수") == "3"


def test_스트레스_요약에_영역별_개수와_유형_라벨이_나온다():
    frame = build_test_summary_rows(sample_user(), "stress")
    assert value_of(frame, "총점 ('예' 개수, 0~12)") == "7"
    assert value_of(frame, "인지 (0~4)") == "3"
    assert value_of(frame, "유형") == "인지형 (cognitive)"


def test_검사_결과가_없으면_요약이_빈_표다():
    assert build_test_summary_rows({}, "adhd").empty


def test_문항별_응답이_문항_id_순으로_나온다():
    frame = build_answer_rows(sample_user(), "adhd")
    assert list(frame["문항 id"]) == ["1", "2", "3"]
    assert list(frame["선택지 index"]) == ["3", "0", "4"]


def test_문항_id가_문자열이어도_숫자순으로_정렬된다():
    # JSON 왕복을 거치면 맵 키가 문자열이 된다 — 사전순으로 밀리면 10이 2 앞에 온다.
    data = {"adhdResult": {"answers": {"10": 1, "2": 0}}}
    assert list(build_answer_rows(data, "adhd")["문항 id"]) == ["2", "10"]


def test_이어하기_위치는_기록이_없는_가장_빠른_회차다():
    scenarios = {"daily-ep1": episode(), "daily-ep2": episode()}
    assert next_unplayed_number(scenarios, "daily") == 3
    assert next_unplayed_number({}, "daily") == 1


def test_이어하기_위치는_중간에_빈_회차가_있으면_그곳을_가리킨다():
    # 2회차만 있는 상태는 CS 정정 후에 실제로 생긴다 — 최댓값+1로 계산하면
    # 이미 지운 1회차를 건너뛴 자리를 가리켜 오진으로 이어진다.
    scenarios = {"daily-ep2": episode()}
    assert next_unplayed_number(scenarios, "daily") == 1


def test_영역별_집계에_완주_수와_보고서_열람이_나온다():
    data = sample_user()
    frame = build_theme_progress_rows(data["scenarios"], data["seenReports"])
    workplace = frame[frame["themeId"] == "workplace"].iloc[0]
    assert workplace["완주"] == "2 / 10"
    assert workplace["이어하기 위치"] == "3회차"
    assert workplace["보고서 열람"] == "O"
    relationship = frame[frame["themeId"] == "relationship"].iloc[0]
    assert relationship["완주"] == "0 / 10"
    assert relationship["보고서 열람"] == "-"


def test_영역별_집계는_네_영역을_항상_모두_낸다():
    assert list(build_theme_progress_rows({}, [])["themeId"]) == [
        "workplace",
        "job-prep",
        "relationship",
        "daily",
    ]


def test_에피소드_목록에_선택_전략과_도움_여부가_나온다():
    frame = build_episode_rows(sample_user()["scenarios"], "workplace")
    assert list(frame["episodeId"]) == ["workplace-ep1", "workplace-ep2"]
    assert list(frame["선택 전략"]) == ["수용", "재초점"]
    assert list(frame["도움 여부"]) == ["도움됨", "도움 안 됨"]


def test_영역을_알_수_없는_키도_목록에_보인다():
    # 조용히 감추면 정정 대상에서 빠져 CS가 다시 들어온다.
    frame = build_episode_rows({"legacy-key": episode()})
    assert list(frame["episodeId"]) == ["legacy-key"]
    assert frame.iloc[0]["영역"] == "(알 수 없음)"


def test_보고서_열람_기록이_영역명으로_나온다():
    assert seen_report_labels(sample_user()) == ["직장", "일상"]
    assert seen_report_labels({}) == []
    # 필드 없음(레거시)과 빈 배열(확인된 0건)은 구분된다.
    assert uau.has_seen_reports_field({"seenReports": []}) is True
    assert uau.has_seen_reports_field({}) is False


def test_에필로그_열람_기록이_영역명과_시각으로_나온다():
    doc = {
        "epilogues": {
            "workplace": {"seenAt": "2026-08-26T01:00:00Z"},
            "daily": {"seenAt": "2026-08-26T02:00:00Z"},
        }
    }
    labels = epilogue_labels(doc)
    # 키 정렬이라 daily가 앞선다 — 표시가 문서 순서에 흔들리지 않게 한 것이다.
    assert len(labels) == 2
    assert labels[0].startswith("일상 (")
    assert labels[1].startswith("직장 (")


def test_에필로그_기록은_필드_없음과_0건을_구분한다():
    assert epilogue_labels({}) == []
    assert uau.has_epilogues_field({"epilogues": {}}) is True
    assert uau.has_epilogues_field({}) is False
    # 맵이 아닌 값(수기 편집·레거시)은 없는 것으로 본다.
    assert uau.has_epilogues_field({"epilogues": ["workplace"]}) is False
    assert epilogue_labels({"epilogues": ["workplace"]}) == []


def test_에필로그_기록은_시각이_없어도_영역명은_낸다():
    assert epilogue_labels({"epilogues": {"relationship": {}}}) == ["연인"]


# ─────────────────────────────────────────────────────────────────────────────
# 정정 ① 에피소드 1건 삭제
# ─────────────────────────────────────────────────────────────────────────────

def test_에피소드_삭제_계획은_그_키_하나만_지운다():
    plan = plan_episode_delete(sample_user(), "workplace-ep2")
    assert plan.allowed
    assert plan.deletes == (("scenarios", "workplace-ep2"),)
    assert list(plan.preview["episodeId"]) == ["workplace-ep2"]


def test_없는_에피소드는_계획_단계에서_차단된다():
    plan = plan_episode_delete(sample_user(), "daily-ep9")
    assert not plan.allowed
    assert "지울 것이 없습니다" in plan.blocked_reason
    assert plan.deletes == ()


def test_보호_계정은_에피소드_삭제가_차단된다():
    plan = plan_episode_delete(sample_user(), "workplace-ep1", email="test@example.com")
    assert not plan.allowed
    assert "보호 계정" in plan.blocked_reason
    assert plan.deletes == ()


def test_보호_계정_판정은_대소문자와_공백을_무시한다():
    plan = plan_episode_delete(sample_user(), "workplace-ep1", email="  TEST@Example.com ")
    assert not plan.allowed


def test_문서에_적힌_이메일만으로도_보호_계정이_걸린다():
    # Auth 레코드가 없는 유저는 화면 목록에서 이메일이 'Auth 없음(Firestore)'으로
    # 뜬다. 화면이 넘긴 값만 믿으면 보호 계정이 그물을 빠져나간다.
    data = sample_user()
    data["email"] = "test@example.com"
    plan = plan_episode_delete(data, "workplace-ep1", email="Auth 없음(Firestore)")
    assert not plan.allowed
    assert "보호 계정" in plan.blocked_reason


@pytest.mark.parametrize(
    "planner", [
        lambda d: plan_episode_delete(d, "workplace-ep1", email="test@example.com"),
        lambda d: plan_theme_reset(d, "workplace", email="test@example.com"),
        lambda d: plan_test_delete(d, "adhd", email="test@example.com"),
    ],
)
def test_보호_계정은_어느_정정_경로로도_payload를_만들_수_없다(planner):
    # 세 경로 전부에 마지막 그물이 걸려 있는지 한 자리에서 확인한다.
    with pytest.raises(ValueError):
        build_deletion_payload(planner(sample_user()), SENTINEL)


# ─────────────────────────────────────────────────────────────────────────────
# 정정 ② 영역 전체 리셋
# ─────────────────────────────────────────────────────────────────────────────

def test_영역_리셋은_그_영역_키만_일괄로_지운다():
    plan = plan_theme_reset(sample_user(), "workplace")
    assert plan.allowed
    assert plan.deletes == (
        ("scenarios", "workplace-ep1"),
        ("scenarios", "workplace-ep2"),
    )
    # 다른 영역(daily)은 건드리지 않는다.
    assert all(path[1].startswith("workplace") for path in plan.deletes)


def test_영역_리셋은_보고서_열람_기록에서도_그_영역을_뺀다():
    plan = plan_theme_reset(sample_user(), "workplace")
    assert plan.overwrites == {"seenReports": ["daily"]}


def test_보고서_열람_기록을_남기도록_고를_수_있다():
    plan = plan_theme_reset(sample_user(), "workplace", clear_seen_report=False)
    assert plan.overwrites == {}
    assert plan.deletes  # 진행도는 그대로 지운다


def test_기록이_없는_영역_리셋은_차단된다():
    plan = plan_theme_reset(sample_user(), "relationship")
    assert not plan.allowed
    assert "지울 기록이 없습니다" in plan.blocked_reason


def test_진행도는_없고_열람_기록만_있으면_리셋할_수_있다():
    data = {"scenarios": {}, "seenReports": ["daily"]}
    plan = plan_theme_reset(data, "daily")
    assert plan.allowed
    assert plan.deletes == ()
    assert plan.overwrites == {"seenReports": []}


def test_보호_계정은_영역_리셋이_차단된다():
    plan = plan_theme_reset(sample_user(), "workplace", email="test@example.com")
    assert not plan.allowed
    assert plan.deletes == ()
    assert plan.overwrites == {}


# ─────────────────────────────────────────────────────────────────────────────
# 정정 ③ 검사 결과 삭제
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("test_key,field_name", [("adhd", "adhdResult"), ("stress", "stressResult")])
def test_검사_결과_삭제_계획은_그_필드_하나만_지운다(test_key, field_name):
    plan = plan_test_delete(sample_user(), test_key)
    assert plan.allowed
    assert plan.deletes == ((field_name,),)


def test_결과가_없는_검사는_삭제가_차단된다():
    plan = plan_test_delete({"adhdResult": {"score": 1}}, "stress")
    assert not plan.allowed
    assert "지울 것이 없습니다" in plan.blocked_reason


def test_보호_계정은_검사_결과_삭제가_차단된다():
    plan = plan_test_delete(sample_user(), "adhd", email="test@example.com")
    assert not plan.allowed


def test_알_수_없는_검사_종류는_예외다():
    with pytest.raises(ValueError):
        plan_test_delete(sample_user(), "unknown")


# ─────────────────────────────────────────────────────────────────────────────
# payload — 차단된 계획은 만들 수 없다
# ─────────────────────────────────────────────────────────────────────────────

SENTINEL = "<<DELETE>>"


def test_payload가_최상위_필드에_센티널을_넣는다():
    plan = plan_test_delete(sample_user(), "adhd")
    assert build_deletion_payload(plan, SENTINEL) == {"adhdResult": SENTINEL}


def test_payload가_중첩_맵_키에_센티널을_넣는다():
    plan = plan_episode_delete(sample_user(), "workplace-ep1")
    assert build_deletion_payload(plan, SENTINEL) == {"scenarios": {"workplace-ep1": SENTINEL}}


def test_영역_리셋_payload는_삭제와_덮어쓰기를_함께_담는다():
    plan = plan_theme_reset(sample_user(), "workplace")
    assert build_deletion_payload(plan, SENTINEL) == {
        "seenReports": ["daily"],
        "scenarios": {"workplace-ep1": SENTINEL, "workplace-ep2": SENTINEL},
    }


def test_차단된_계획으로는_payload를_만들_수_없다():
    # 화면의 3단계 확인을 우회한 호출을 막는 마지막 그물이다.
    plan = plan_episode_delete(sample_user(), "daily-ep9")
    with pytest.raises(ValueError):
        build_deletion_payload(plan, SENTINEL)


def test_빈_계획으로는_payload를_만들_수_없다():
    with pytest.raises(ValueError):
        build_deletion_payload(CorrectionPlan(kind="test", label="빈 것"), SENTINEL)


def test_차단_사유가_미리보기_문구로_나온다():
    plan = plan_episode_delete(sample_user(), "daily-ep9")
    assert describe_plan(plan) == [plan.blocked_reason]


def test_미리보기_문구가_지워질_필드를_모두_밝힌다():
    lines = describe_plan(plan_theme_reset(sample_user(), "workplace"))
    assert "scenarios.workplace-ep1 필드를 삭제합니다." in lines
    assert "scenarios.workplace-ep2 필드를 삭제합니다." in lines
    assert any("seenReports" in line for line in lines)


# ─────────────────────────────────────────────────────────────────────────────
# Firestore 프로토콜 — merge 쓰기가 의도한 필드만 지우는가
# ─────────────────────────────────────────────────────────────────────────────

def write_protos(payload):
    """payload를 실제 Firestore 쓰기(proto)로 바꿔 update mask를 꺼낸다.

    firebase_admin이 감싸고 있는 google-cloud-firestore의 변환 경로를 그대로
    태운다. 네트워크는 타지 않는다 — 검증 대상은 서버 왕복이 아니라
    "merge + DELETE_FIELD가 삭제로 번역되는가"이기 때문이다.
    """
    from google.cloud.firestore_v1 import _helpers

    return _helpers.pbs_for_set_with_merge(
        "projects/p/databases/(default)/documents/users/u1", payload, merge=True
    )


def test_merge_쓰기가_중첩_맵_키_하나만_지운다():
    from google.cloud.firestore_v1.transforms import DELETE_FIELD

    plan = plan_episode_delete(sample_user(), "workplace-ep1")
    pbs = write_protos(build_deletion_payload(plan, DELETE_FIELD))

    masks = [path for pb in pbs for path in pb.update_mask.field_paths]
    # 하이픈이 든 키는 백틱으로 감싼 field path가 되어야 한다 —
    # 감싸지 않으면 Firestore가 경로를 파싱하지 못한다.
    assert masks == ["scenarios.`workplace-ep1`"]
    # 값은 하나도 쓰지 않는다. 남아 있으면 삭제가 아니라 덮어쓰기다.
    assert all(not dict(pb.update.fields) for pb in pbs)


def test_merge_쓰기가_검사_결과_필드를_지운다():
    from google.cloud.firestore_v1.transforms import DELETE_FIELD

    plan = plan_test_delete(sample_user(), "stress")
    pbs = write_protos(build_deletion_payload(plan, DELETE_FIELD))
    assert [path for pb in pbs for path in pb.update_mask.field_paths] == ["stressResult"]


def test_merge_쓰기가_영역_리셋에서_다른_영역을_건드리지_않는다():
    from google.cloud.firestore_v1.transforms import DELETE_FIELD

    plan = plan_theme_reset(sample_user(), "workplace")
    pbs = write_protos(build_deletion_payload(plan, DELETE_FIELD))
    masks = sorted(path for pb in pbs for path in pb.update_mask.field_paths)

    assert masks == [
        "scenarios.`workplace-ep1`",
        "scenarios.`workplace-ep2`",
        "seenReports",
    ]
    # daily-ep1은 마스크에 없으므로 서버에서 그대로 남는다.
    assert not any("daily" in path for path in masks)


# ─────────────────────────────────────────────────────────────────────────────
# Mock 모드 시뮬레이션
# ─────────────────────────────────────────────────────────────────────────────

def test_시뮬레이션이_계획대로_지우고_원본은_그대로_둔다():
    data = sample_user()
    plan = plan_theme_reset(data, "workplace")
    result = apply_plan_to_snapshot(data, plan)

    assert set(result["scenarios"]) == {"daily-ep1"}
    assert result["seenReports"] == ["daily"]
    # 원본 훼손 금지 — Mock 화면이 '미리보기'와 '실행'을 같은 dict로 돌린다.
    assert set(data["scenarios"]) == {"workplace-ep1", "workplace-ep2", "daily-ep1"}
    assert data["seenReports"] == ["workplace", "daily"]


def test_시뮬레이션이_검사_결과_필드를_없앤다():
    data = sample_user()
    result = apply_plan_to_snapshot(data, plan_test_delete(data, "adhd"))
    assert "adhdResult" not in result
    assert "stressResult" in result


def test_차단된_계획은_시뮬레이션도_거부한다():
    data = sample_user()
    with pytest.raises(ValueError):
        apply_plan_to_snapshot(data, plan_episode_delete(data, "daily-ep9"))
