# tests/test_app_smoke.py
# 앱이 Mock 모드(secrets 없음)에서 예외 없이 기동하는지 확인하는 스모크.
#
# 로그인 화면은 st.stop()으로 끊기므로, 메뉴까지 들어가려면 session_state에
# password_correct를 미리 넣어 통과시킨다. Mock 모드에서 CSV 관리 메뉴가 실제로
# 열리는지까지 보는 이유는, 이 화면들이 예전에는 Firebase가 없으면 st.error로
# 통째로 막혀 있어서 자격증명 없이는 아무것도 확인할 수 없었기 때문이다.
import os

import pytest
from streamlit.testing.v1 import AppTest

APP_PATH = os.path.join(os.path.dirname(__file__), "..", "streamlit_app.py")

MENUS = [
    "대시보드 홈",
    "유저 관리",
    "검사 결과 분석",
    "문항 관리 (CSV)",
    "시나리오 관리 (CSV)",
    "약관·공지 관리",
]


def make_app(logged_in=True):
    os.environ.setdefault("ADMIN_PASSWORD", "test-password")
    # Mock 강제 — 개발 머신에는 실 secrets.toml이 있어서, 이 줄이 없으면
    # 이 파일의 "Mock 모드" 테스트 전부가 실 Firestore에 연결된 채 돈다.
    os.environ["ADMIN_FORCE_MOCK"] = "1"
    at = AppTest.from_file(APP_PATH, default_timeout=30)
    if logged_in:
        at.session_state["password_correct"] = True
    return at


def test_mock_모드에서_예외_없이_기동한다():
    at = make_app(logged_in=False)
    at.run()
    assert not at.exception


@pytest.mark.parametrize("menu", MENUS)
def test_모든_메뉴가_Mock_모드에서_예외_없이_열린다(menu):
    at = make_app()
    at.run()
    at.sidebar.radio[0].set_value(menu).run()
    assert not at.exception


def test_시나리오_메뉴에_요정_조언_종류가_있다():
    # scenarios/angels는 프론트가 읽지만 어드민에 관리 메뉴가 없던 문서다.
    at = make_app()
    at.run()
    at.sidebar.radio[0].set_value("시나리오 관리 (CSV)").run()
    assert "요정 조언·선택지" in at.radio[0].options


def test_검사_결과_분석에_마스킹_토글이_기본_ON으로_있다():
    at = make_app()
    at.run()
    at.sidebar.radio[0].set_value("검사 결과 분석").run()
    assert at.checkbox(key="export_mask").value is True


def test_마스킹을_끄면_반출_금지_경고가_뜬다():
    at = make_app()
    at.run()
    at.sidebar.radio[0].set_value("검사 결과 분석").run()
    at.checkbox(key="export_mask").set_value(False).run()
    assert any("반출 금지" in msg.value for msg in at.error)


def test_문항_메뉴가_Mock에서_로컬_CSV로_시드되고_내려받기가_뜬다():
    at = make_app()
    at.run()
    at.sidebar.radio[0].set_value("문항 관리 (CSV)").run()
    assert not at.exception
    # 세션 문서 저장소에 시드된다 (실 Firestore를 건드리지 않는다).
    assert "questions/adhd" in at.session_state["mock_csv_docs"]
    # AppTest는 download_button을 전용 속성으로 노출하지 않아 get()으로 받는다.
    assert any("내려받기" in element.label for element in at.get("download_button"))


def stored_doc(at, key):
    """Mock 문서 저장소를 **매번 새로 읽는다**.

    doc_set은 병합할 때 새 dict를 만들어 넣으므로, 한 번 잡아 둔 참조는
    되돌리기 직후 곧바로 낡은 값이 된다.
    """
    return at.session_state["mock_csv_docs"][key]["data"]


def open_rollback_dialog(at):
    [b for b in at.button if b.label.startswith("이전 버전으로 되돌리기")][0].click().run()


def click(at, label):
    [b for b in at.button if b.label == label][0].click().run()


def prepare_two_versions(at, menu, doc_key, first, second):
    """메뉴를 연 뒤 Mock 문서에 '이전/현재' 두 버전을 만들어 둔다."""
    from export_utils import CSV_TEXT_FIELD, build_upload_payload

    at.run()
    at.sidebar.radio[0].set_value(menu).run()
    at.session_state["mock_csv_docs"][doc_key] = {
        "data": {CSV_TEXT_FIELD: first},
        "updatedAt": "2026-08-01T00:00:00+00:00",
    }
    at.run()
    stored_doc(at, doc_key).update(build_upload_payload(second, first))
    at.run()


def test_Mock에서_업로드하면_직전_버전이_보관된다():
    from export_utils import CSV_TEXT_FIELD, PREVIOUS_CSV_TEXT_FIELD

    at = make_app()
    prepare_two_versions(at, "문항 관리 (CSV)", "questions/adhd", "id,part\n1,옛것\n", "id,part\n9,새것\n")

    doc = stored_doc(at, "questions/adhd")
    assert doc[CSV_TEXT_FIELD] == "id,part\n9,새것\n"
    assert doc[PREVIOUS_CSV_TEXT_FIELD] == "id,part\n1,옛것\n"
    # 보관본이 있을 때만 되돌리기 버튼이 나온다.
    assert any(b.label.startswith("이전 버전으로 되돌리기") for b in at.button)


def test_Mock에서_되돌리기를_두_번_누르면_원상복구된다():
    from export_utils import CSV_TEXT_FIELD, PREVIOUS_CSV_TEXT_FIELD

    at = make_app()
    prepare_two_versions(at, "시나리오 관리 (CSV)", "scenarios/visual", "v1", "v2")

    open_rollback_dialog(at)
    click(at, "네, 되돌립니다")
    doc = stored_doc(at, "scenarios/visual")
    assert (doc[CSV_TEXT_FIELD], doc[PREVIOUS_CSV_TEXT_FIELD]) == ("v1", "v2")
    assert not at.exception

    open_rollback_dialog(at)
    click(at, "네, 되돌립니다")
    doc = stored_doc(at, "scenarios/visual")
    assert (doc[CSV_TEXT_FIELD], doc[PREVIOUS_CSV_TEXT_FIELD]) == ("v2", "v1")


def test_Mock에서_되돌리기를_취소하면_아무것도_바뀌지_않는다():
    from export_utils import CSV_TEXT_FIELD

    at = make_app()
    prepare_two_versions(at, "시나리오 관리 (CSV)", "scenarios/visual", "v1", "v2")

    open_rollback_dialog(at)
    click(at, "취소하기")
    assert stored_doc(at, "scenarios/visual")[CSV_TEXT_FIELD] == "v2"
    assert at.session_state["rollback_open_scenarios_visual"] is False


# ─── 유저 상세 조회 · 진행도 정정 (NRQ-0094~0096) ────────────────────
# 판단 로직 자체는 tests/test_user_admin_utils.py가 덮는다. 여기서 확인하는 것은
# **화면이 그 판단을 실제로 강제하는가**다 — 확인 상자를 켜기 전에는 삭제 버튼이
# 열리지 않아야 하고, Mock 모드에서는 실 DB 대신 세션 사본만 바뀌어야 한다.

DEMO_UID = "demo-uid-0001"
MOCK_USER_DOCS = "mock_user_docs"


def open_user_menu():
    at = make_app()
    at.run()
    at.sidebar.radio[0].set_value("유저 관리").run()
    return at


def demo_doc(at):
    """세션 사본을 매번 새로 읽는다 — 정정은 dict를 통째로 갈아끼운다."""
    return at.session_state[MOCK_USER_DOCS][DEMO_UID]


def button_by_key(at, key):
    return [b for b in at.button if b.key == key][0]


def test_유저_관리에_Mock_연습용_문서의_상세가_열린다():
    at = open_user_menu()
    assert not at.exception
    # 프로필·검사·시나리오·정정 4개 탭.
    assert len(at.tabs) == 4
    assert DEMO_UID in at.session_state[MOCK_USER_DOCS]


@pytest.mark.parametrize(
    "key", ["apply_episode_daily-ep1", "apply_theme_workplace", "apply_test_adhd"]
)
def test_확인_상자를_켜기_전에는_삭제_버튼이_잠겨_있다(key):
    # 3단계(미리보기 → 확인 → 실행) 중 2단계를 건너뛸 수 없다는 것이 요점이다.
    at = open_user_menu()
    assert button_by_key(at, key).disabled is True


def test_확인_상자를_켜면_삭제_버튼이_열린다():
    at = open_user_menu()
    at.checkbox(key="confirm_episode_daily-ep1").set_value(True).run()
    assert button_by_key(at, "apply_episode_daily-ep1").disabled is False


def test_Mock에서_에피소드_삭제는_그_키_하나만_없앤다():
    at = open_user_menu()
    assert set(demo_doc(at)["scenarios"]) == {"workplace-ep1", "workplace-ep2", "daily-ep1"}

    at.checkbox(key="confirm_episode_daily-ep1").set_value(True).run()
    button_by_key(at, "apply_episode_daily-ep1").click().run()

    assert not at.exception
    assert set(demo_doc(at)["scenarios"]) == {"workplace-ep1", "workplace-ep2"}


def test_Mock에서_영역_리셋은_그_영역과_열람_기록만_지운다():
    at = open_user_menu()
    at.checkbox(key="confirm_theme_workplace").set_value(True).run()
    button_by_key(at, "apply_theme_workplace").click().run()

    doc = demo_doc(at)
    # 직장 2건은 사라지고 일상은 남는다.
    assert set(doc["scenarios"]) == {"daily-ep1"}
    # 열람 기록에서도 빠진다 (기본값 ON).
    assert doc["seenReports"] == []


def test_Mock에서_검사_결과_삭제는_그_필드만_없앤다():
    at = open_user_menu()
    at.checkbox(key="confirm_test_adhd").set_value(True).run()
    button_by_key(at, "apply_test_adhd").click().run()

    doc = demo_doc(at)
    assert "adhdResult" not in doc
    assert "stressResult" in doc
    assert doc["scenarios"]  # 시나리오는 그대로다


def test_Mock_정정은_시뮬레이션이라고_밝힌다():
    # Mock 모드의 정정이 실 DB 쓰기로 오해되면 안 된다는 약속을 고정한다.
    at = open_user_menu()
    at.checkbox(key="confirm_test_adhd").set_value(True).run()
    button_by_key(at, "apply_test_adhd").click().run()
    assert any("시뮬레이션" in msg.value for msg in at.success)


# ── 약관·공지 관리 ────────────────────────────────────────────────
# CSV 메뉴와 같은 이유로 Mock에서도 실제로 동작해야 한다 — 인수인계 대상인
# 팀이 자격증명 없이 저장·되돌리기 절차를 연습해 볼 수 있어야 한다.


def open_legal_menu(at):
    at.run()
    at.sidebar.radio[0].set_value("약관·공지 관리").run()
    return at


def test_약관_메뉴가_코드_기본값을_미리_채워_준다():
    # 빈 칸으로 두면 운영팀이 "지워진 건가?"로 읽고, 무심코 저장하면 실제로
    # 빈 값이 DB에 박힌다.
    at = open_legal_menu(make_app())

    assert at.text_input(key="legal_officer_name").value
    assert "@" in at.text_input(key="legal_contact_email").value
    assert not at.exception


def test_Mock에서_운영_정보를_저장하면_settings_legal에_쓰인다():
    from settings_utils import OFFICER_NAME_FIELD

    at = open_legal_menu(make_app())
    at.text_input(key="legal_officer_name").set_value("홍길동").run()
    click(at, "운영 정보 저장")

    assert stored_doc(at, "settings/legal")[OFFICER_NAME_FIELD] == "홍길동"
    assert not at.exception


def test_운영_정보를_비우면_저장되지_않는다():
    from settings_utils import OFFICER_NAME_FIELD

    at = open_legal_menu(make_app())
    at.text_input(key="legal_officer_name").set_value("").run()
    click(at, "운영 정보 저장")

    assert "settings/legal" not in at.session_state["mock_csv_docs"]
    assert any("성명" in msg.value for msg in at.error)


def test_Mock에서_두_번_저장하면_되돌리기가_생긴다():
    from settings_utils import OFFICER_NAME_FIELD, PREVIOUS_LEGAL_FIELD

    at = open_legal_menu(make_app())
    at.text_input(key="legal_officer_name").set_value("첫번째").run()
    click(at, "운영 정보 저장")
    at.text_input(key="legal_officer_name").set_value("두번째").run()
    click(at, "운영 정보 저장")

    doc = stored_doc(at, "settings/legal")
    assert doc[OFFICER_NAME_FIELD] == "두번째"
    assert doc[PREVIOUS_LEGAL_FIELD][OFFICER_NAME_FIELD] == "첫번째"

    click(at, "이전 버전으로 되돌리기")
    assert stored_doc(at, "settings/legal")[OFFICER_NAME_FIELD] == "첫번째"
    assert not at.exception


def test_Mock에서_공지를_켜고_저장하면_settings_notice에_쓰인다():
    from settings_utils import NOTICE_ACTIVE_FIELD, NOTICE_MESSAGE_FIELD

    at = open_legal_menu(make_app())
    at.toggle(key="notice_active").set_value(True).run()
    at.text_area(key="notice_message").set_value("9월 1일 점검이 있습니다.").run()
    click(at, "공지 저장")

    doc = stored_doc(at, "settings/notice")
    assert doc[NOTICE_ACTIVE_FIELD] is True
    assert doc[NOTICE_MESSAGE_FIELD] == "9월 1일 점검이 있습니다."
    assert not at.exception


# ── 마케팅 수신 동의 표시 스위치 ──────────────────────────────────
# 판단 규칙은 tests/test_settings_utils.py가 덮는다. 여기서 보는 것은
# **화면이 실제로 그 필드를 쓰는가**다 — 서비스에 마케팅 동의가 필요한지가
# 미정이라(2026-08-18) 운영팀이 개발자 없이 끄고 켤 수 있어야 한다.


def test_마케팅_항목_표시_스위치의_기본값은_켜짐이다():
    # 기존 동작이 표시 ON이므로, 시드 전 상태가 동작을 바꾸면 안 된다.
    at = open_legal_menu(make_app())

    assert at.toggle(key="legal_marketing_enabled").value is True
    assert not at.exception


def test_Mock에서_마케팅_항목을_끄면_settings_legal에_False로_쓰인다():
    from settings_utils import MARKETING_CONSENT_ENABLED_FIELD

    at = open_legal_menu(make_app())
    at.toggle(key="legal_marketing_enabled").set_value(False).run()
    click(at, "표시 설정 저장")

    assert stored_doc(at, "settings/legal")[MARKETING_CONSENT_ENABLED_FIELD] is False
    assert not at.exception


def test_마케팅_표시_설정_저장도_이력에_남는다():
    # 게시되는 동의 절차가 바뀌는 동작이다 — 문안이 그대로여도 증빙 대상이다.
    at = open_legal_menu(make_app())
    at.toggle(key="legal_marketing_enabled").set_value(False).run()
    click(at, "표시 설정 저장")

    assert len(history(at)) == 1


def test_마케팅_문안이_잔여_법무검토와_정합성_반영일을_함께_밝힌다():
    # 화면에서 경고하지 않으면 운영팀이 검토받은 문안으로 오해하고 게시한다.
    # 2026-08-26에 약관·처리방침과의 정합성은 맞췄으므로 "임의 초안"이라는
    # 통짜 경고는 과하다 — 무엇이 끝났고 무엇이 남았는지를 갈라 적는다.
    at = open_legal_menu(make_app())

    warnings = [msg.value for msg in at.warning]
    assert any("법무 검토" in text for text in warnings)
    assert any("2026-08-26" in text for text in warnings)


# ── 마케팅 동의자 이메일 일괄 추출 ────────────────────────────────
# 추출 규칙은 tests/test_marketing_utils.py가 덮는다. 여기서 보는 것은
# **화면이 BCC 경고를 반드시 함께 내는가**다 — 주소 목록만 덩그러니 뜨면
# 운영팀이 받는사람 칸에 붙여 넣어 동의자 전원의 주소를 서로 노출시킨다.


def test_마케팅_탭이_BCC_경고와_목적_외_사용_금지를_함께_낸다():
    at = open_legal_menu(make_app())

    assert any("숨은참조(BCC)" in msg.value for msg in at.error)
    assert any("목적 외 사용 금지" in msg.value for msg in at.warning)


def test_Mock에서_추출하면_동의자만_한_줄로_나온다():
    from marketing_utils import demo_marketing_users, emails_to_line, recipient_emails

    at = open_legal_menu(make_app())
    click(at, "동의자 이메일 추출하기")

    expected = emails_to_line(recipient_emails(demo_marketing_users()))
    assert any(block.value == expected for block in at.code)
    # 미동의 계정의 주소가 화면 어디에도 남으면 안 된다.
    assert all("baram@example.com" not in block.value for block in at.code)
    # 마이페이지에서 수신을 거부한 계정도 마찬가지다 (증빙은 남아 있지만
    # 현재 상태가 미수신이므로 목록에 들어가면 안 된다).
    assert all("haneul@example.com" not in block.value for block in at.code)
    assert not at.exception


def test_추출_요약이_수신거부로_제외된_인원을_밝힌다():
    # 목록이 어제보다 줄어든 이유가 '철회'인지 '조회 누락'인지 화면에서
    # 구분되지 않으면, 운영팀은 옛 목록을 다시 쓰는 쪽으로 기울게 된다.
    at = open_legal_menu(make_app())
    click(at, "동의자 이메일 추출하기")

    texts = [block.value for block in at.markdown]
    assert any("수신을 거부한" in text and "제외" in text for text in texts)


def test_추출_결과에_스냅샷임을_밝힌다():
    # 어제 뽑아 둔 줄을 오늘 붙여 넣으면 그 사이 철회한 사람에게도 나간다.
    at = open_legal_menu(make_app())
    click(at, "동의자 이메일 추출하기")

    assert any("스냅샷" in msg.value for msg in at.caption)


def test_공지를_켜고_본문을_비우면_경고가_뜬다():
    # 앱은 본문이 비면 배너를 띄우지 않는다 — 저장 전에 알려 준다.
    at = open_legal_menu(make_app())
    at.toggle(key="notice_active").set_value(True).run()

    assert any("비어 있습니다" in msg.value for msg in at.warning)


# ── 약관 저장 이력 (settings_history) ─────────────────────────────
# 판단 규칙은 tests/test_settings_utils.py가 덮는다. 여기서 보는 것은
# **화면이 실제로 append하는가** — 저장 지점이 네 곳이라 한 곳만 빠져도
# 이력에 조용히 구멍이 생긴다.

MOCK_HISTORY = "mock_settings_history"


def history(at):
    """세션 이력 목록. AppTest의 session_state는 .get()을 제공하지 않는다."""
    try:
        return at.session_state[MOCK_HISTORY]
    except (KeyError, AttributeError):
        return []


def test_운영_정보를_저장하면_이력이_한_건_쌓인다():
    from settings_utils import OFFICER_NAME_FIELD, SAVED_AT_FIELD

    at = open_legal_menu(make_app())
    at.text_input(key="legal_officer_name").set_value("홍길동").run()
    click(at, "운영 정보 저장")

    assert len(history(at)) == 1
    assert history(at)[0][OFFICER_NAME_FIELD] == "홍길동"
    assert history(at)[0][SAVED_AT_FIELD]
    assert not at.exception


def test_저장할_때마다_이력이_쌓인다():
    # 되돌리기는 1단계뿐이라 두 번 저장하면 첫 내용을 잃는다 — 이력은 잃지 않는다.
    at = open_legal_menu(make_app())
    at.text_input(key="legal_officer_name").set_value("첫번째").run()
    click(at, "운영 정보 저장")
    at.text_input(key="legal_officer_name").set_value("두번째").run()
    click(at, "운영 정보 저장")

    assert len(history(at)) == 2


def test_되돌리기도_이력에_남는다():
    # 게시되는 문안이 바뀌는 동작이므로 빼면 "그때 무엇이 걸려 있었나"에 구멍이 난다.
    at = open_legal_menu(make_app())
    at.text_input(key="legal_officer_name").set_value("첫번째").run()
    click(at, "운영 정보 저장")
    at.text_input(key="legal_officer_name").set_value("두번째").run()
    click(at, "운영 정보 저장")
    click(at, "이전 버전으로 되돌리기")

    assert len(history(at)) == 3
    assert not at.exception


def test_공지_저장은_이력에_남기지_않는다():
    # 증빙 대상이 아니고 자주 바뀌어서, 함께 쌓으면 약관 이력이 묻힌다.
    at = open_legal_menu(make_app())
    at.toggle(key="notice_active").set_value(True).run()
    at.text_area(key="notice_message").set_value("점검 공지").run()
    click(at, "공지 저장")

    assert history(at) == []


def test_이력이_없으면_안내만_남기고_터지지_않는다():
    at = open_legal_menu(make_app())
    assert not at.exception
    # 운영 정보 · 이용약관 · 처리방침 · 마케팅 수신 동의 · 공지 · 저장 이력.
    assert len(at.tabs) == 6


def test_Mock_이력은_시뮬레이션이라고_밝힌다():
    at = open_legal_menu(make_app())
    assert any("시뮬레이션" in msg.value for msg in at.info)


# ── 사이드바 상시 모드 배지 ───────────────────────────────────────
# init_firebase()의 'Mock 모드' 메시지는 @st.cache_resource 안이라 첫 실행에서
# 한 번만 뜨고 메뉴를 옮기면 사라진다. 배지는 **매 렌더**에 보여야 한다.


@pytest.mark.parametrize("menu", MENUS)
def test_사이드바_모드_배지가_모든_메뉴에서_보인다(menu):
    at = make_app()
    at.run()
    at.sidebar.radio[0].set_value(menu).run()
    assert any("Mock 모드" in msg.value for msg in at.sidebar.warning)


def test_모드_배지가_사이드바에_있다():
    # 본문이 아니라 사이드바여야 한다 — 본문은 스크롤하면 사라진다.
    at = make_app()
    at.run()
    assert any("Mock 모드" in msg.value for msg in at.sidebar.warning)
