# tests/test_marketing_utils.py
# 마케팅 수신 동의자 이메일 추출(BCC 붙여넣기용)의 순수 함수 테스트.
#
# 검증의 중심은 하나다: **동의하지 않은 사람이 목록에 단 한 명도 섞이지 않는가.**
# 여기서 새는 것은 표가 이상해지는 문제가 아니라 정보통신망법 제50조 위반이다.
# 그 다음이 '한 사람에게 두 번 보내지 않는가'(중복)와 '주소가 아닌 값이 BCC 칸에
# 들어가지 않는가'(형식)다.
#
# Firestore에는 접근하지 않는다 — 입력은 (uid, 문서 dict) 튜플 목록뿐이다.
from datetime import datetime

import pandas as pd

from marketing_utils import (
    CONSENT_FIELD,
    EMAIL_SEPARATOR,
    MARKETING_AGREED_AT_FIELD,
    MARKETING_AGREED_FIELD,
    MARKETING_CONSENT_FIELD,
    MARKETING_STATE_AGREED_FIELD,
    MARKETING_STATE_UPDATED_AT_FIELD,
    RECIPIENT_COLUMNS,
    agreed_to_marketing,
    build_recipient_dataframe,
    demo_marketing_users,
    emails_to_line,
    extracted_at_label,
    marketing_agreed_at,
    marketing_recipients,
    normalize_email,
    opted_out_of_marketing,
    recipient_emails,
    recipient_filename,
    summarize_recipients,
)

def user(uid, email, agreed=True, agreed_at="2026-08-01T00:00:00Z", opted_out=None,
         opted_out_at="2026-08-17T05:00:00Z"):
    """실제 users/{uid} 문서 모양의 표본. 필드명은 useConsentStore.ts와 미러.

    ``opted_out``이 None이면 marketingConsent 칸 자체가 없는 문서다 — 이 칸을
    도입하기 전에 가입한 계정의 모양이며, 대부분의 실제 데이터가 그렇다.
    """
    doc = {
        "email": email,
        "displayName": "홍길동",
        CONSENT_FIELD: {
            "version": "1.0.0",
            "termsAgreedAt": "2026-08-01T00:00:00Z",
            "privacyAgreedAt": "2026-08-01T00:00:00Z",
            MARKETING_AGREED_FIELD: agreed,
            MARKETING_AGREED_AT_FIELD: agreed_at,
        },
    }
    if opted_out is not None:
        doc[MARKETING_CONSENT_FIELD] = {
            MARKETING_STATE_AGREED_FIELD: not opted_out,
            MARKETING_STATE_UPDATED_AT_FIELD: opted_out_at,
            "version": "1.0.0",
        }
    return (uid, doc)


# ── 동의 판정 ────────────────────────────────────────────────────

class Test동의_판정:
    def test_불리언_True만_동의로_본다(self):
        assert agreed_to_marketing({CONSENT_FIELD: {MARKETING_AGREED_FIELD: True}}) is True

    def test_False와_미설정은_동의가_아니다(self):
        assert agreed_to_marketing({CONSENT_FIELD: {MARKETING_AGREED_FIELD: False}}) is False
        assert agreed_to_marketing({CONSENT_FIELD: {}}) is False
        assert agreed_to_marketing({}) is False
        assert agreed_to_marketing(None) is False

    def test_문자열_true나_1은_동의로_접어_주지_않는다(self):
        # 관대하게 읽으면 데이터가 조금 이상한 문서 하나가 곧바로
        # '동의하지 않은 사람에게 광고 발송'이 된다.
        assert agreed_to_marketing({CONSENT_FIELD: {MARKETING_AGREED_FIELD: "true"}}) is False
        assert agreed_to_marketing({CONSENT_FIELD: {MARKETING_AGREED_FIELD: 1}}) is False
        assert agreed_to_marketing({CONSENT_FIELD: {MARKETING_AGREED_FIELD: "Y"}}) is False

    def test_termsConsent가_dict가_아니어도_터지지_않는다(self):
        assert agreed_to_marketing({CONSENT_FIELD: "yes"}) is False
        assert agreed_to_marketing({CONSENT_FIELD: None}) is False


# ── 수신 거부 반영 (마이페이지 창구) ─────────────────────────────
#
# 이 절이 막는 사고는 하나다: **철회 의사를 받고도 목록에 남는 것.**
# 마케팅 약관 제6조가 마이페이지를 수신 거부 창구로 지목하고 있으므로,
# 그 창구가 적은 marketingConsent를 보지 않으면 약관이 거짓말이 된다.

class Test수신거부_반영:
    def test_철회하면_가입_시_동의했어도_수신_대상이_아니다(self):
        _, doc = user("u1", "a@example.com", agreed=True, opted_out=True)

        assert agreed_to_marketing(doc) is False

    def test_증빙은_그대로_남아_있는_문서를_전제로_한다(self):
        # 철회해도 termsConsent는 불변이다 — 그래서 두 칸이 어긋나 보이는
        # 문서가 정상이며, 판정은 현재 상태 쪽이 이겨야 한다.
        _, doc = user("u1", "a@example.com", agreed=True, opted_out=True)

        assert doc[CONSENT_FIELD][MARKETING_AGREED_FIELD] is True
        assert agreed_to_marketing(doc) is False

    def test_가입_때_거부한_사람도_다시_켜면_수신_대상이_된다(self):
        _, doc = user("u1", "a@example.com", agreed=False, opted_out=False)

        assert agreed_to_marketing(doc) is True

    def test_marketingConsent가_없으면_가입_시_동의로_폴백한다(self):
        # 이 칸을 도입하기 전에 가입한 계정이 전부 여기 해당한다.
        # 폴백하지 않으면 기존 동의자 전원이 조용히 사라진다.
        _, agreed_doc = user("u1", "a@example.com", agreed=True)
        _, refused_doc = user("u2", "b@example.com", agreed=False)

        assert MARKETING_CONSENT_FIELD not in agreed_doc
        assert agreed_to_marketing(agreed_doc) is True
        assert agreed_to_marketing(refused_doc) is False

    def test_agreed_키가_없는_빈_맵은_덮어쓰지_않는다(self):
        # 시각만 적히고 값이 빠진 문서를 '거부'로 읽으면 동의자가 사라진다.
        base = {CONSENT_FIELD: {MARKETING_AGREED_FIELD: True}}

        assert agreed_to_marketing({**base, MARKETING_CONSENT_FIELD: {}}) is True
        assert agreed_to_marketing(
            {**base, MARKETING_CONSENT_FIELD: {MARKETING_STATE_UPDATED_AT_FIELD: "2026-08-17"}}
        ) is True

    def test_현재_상태도_불리언_True만_동의로_본다(self):
        # 값이 깨져 있으면 사람이 목록에서 빠지는 쪽으로 넘어져야 한다 —
        # 반대 방향의 실수는 이미 나간 메일이라 되돌릴 수 없다.
        base = {CONSENT_FIELD: {MARKETING_AGREED_FIELD: True}}

        for broken in ("true", 1, "Y", None, ""):
            assert agreed_to_marketing(
                {**base, MARKETING_CONSENT_FIELD: {MARKETING_STATE_AGREED_FIELD: broken}}
            ) is False

    def test_marketingConsent가_dict가_아니어도_터지지_않는다(self):
        base = {CONSENT_FIELD: {MARKETING_AGREED_FIELD: True}}

        assert agreed_to_marketing({**base, MARKETING_CONSENT_FIELD: "off"}) is True
        assert agreed_to_marketing({**base, MARKETING_CONSENT_FIELD: None}) is True

    def test_제외_인원_판정은_동의했다_철회한_사람만_센다(self):
        _, withdrew = user("u1", "a@example.com", agreed=True, opted_out=True)
        _, never = user("u2", "b@example.com", agreed=False)
        _, still_in = user("u3", "c@example.com", agreed=True)
        # 가입 때 거부했다가 켠 사람은 '제외'가 아니라 '추가'다
        _, opted_in = user("u4", "d@example.com", agreed=False, opted_out=False)

        assert opted_out_of_marketing(withdrew) is True
        assert opted_out_of_marketing(never) is False
        assert opted_out_of_marketing(still_in) is False
        assert opted_out_of_marketing(opted_in) is False


# ── 동의 시각의 근거 ─────────────────────────────────────────────

class Test동의_시각:
    def test_바꾼_적이_없으면_가입_시_동의_시각이다(self):
        _, doc = user("u1", "a@example.com", agreed_at="2026-08-01T00:00:00Z")

        assert marketing_agreed_at(doc) == "2026-08-01 09:00:00"

    def test_다시_켠_사람은_켠_시각이_근거다(self):
        # 가입 때 거부했다가 켠 경우 termsConsent에는 동의 시각이 없다.
        # 그대로 내보내면 '동의 시각이 빈' 수신자가 표에 남는다.
        _, doc = user("u1", "a@example.com", agreed=False, agreed_at=None,
                      opted_out=False, opted_out_at="2026-08-17T05:00:00Z")

        assert marketing_agreed_at(doc) == "2026-08-17 14:00:00"

    def test_다시_켰지만_시각이_비어_있으면_가입_시각으로_폴백한다(self):
        doc = {
            CONSENT_FIELD: {
                MARKETING_AGREED_FIELD: True,
                MARKETING_AGREED_AT_FIELD: "2026-08-01T00:00:00Z",
            },
            MARKETING_CONSENT_FIELD: {MARKETING_STATE_AGREED_FIELD: True},
        }

        assert marketing_agreed_at(doc) == "2026-08-01 09:00:00"


# ── 이메일 정규화 ────────────────────────────────────────────────

class Test이메일_정규화:
    def test_앞뒤_공백을_턴다(self):
        assert normalize_email("  a@example.com \n") == "a@example.com"

    def test_주소_모양이_아니면_버린다(self):
        # BCC 칸에 들어가면 클라이언트가 발송을 거부하거나 사내 도메인을 붙인다.
        assert normalize_email("") == ""
        assert normalize_email("   ") == ""
        assert normalize_email("Auth 없음(Firestore)") == ""
        assert normalize_email("@example.com") == ""
        assert normalize_email("noreply@") == ""
        assert normalize_email(None) == ""
        assert normalize_email(123) == ""


# ── 수신자 목록 ──────────────────────────────────────────────────

class Test수신자_목록:
    def test_동의한_사람만_뽑는다(self):
        users = [
            user("u1", "yes@example.com", agreed=True),
            user("u2", "no@example.com", agreed=False),
            user("u3", "also@example.com", agreed=True),
        ]

        assert recipient_emails(users) == ["also@example.com", "yes@example.com"]

    def test_동의했어도_이메일이_없으면_빠진다(self):
        users = [user("u1", "", agreed=True), user("u2", None, agreed=True)]

        assert recipient_emails(users) == []

    def test_같은_주소는_대소문자가_달라도_한_번만_나간다(self):
        # 한 사람이 두 계정을 갖고 있으면 같은 메일을 두 번 받는다.
        users = [user("u1", "dup@example.com"), user("u2", "DUP@example.com")]

        assert recipient_emails(users) == ["dup@example.com"]

    def test_이메일_오름차순으로_정렬된다(self):
        # 뽑을 때마다 순서가 달라지면 두 번 뽑은 결과를 눈으로 대조할 수 없다.
        users = [user("u1", "cha@example.com"), user("u2", "ahn@example.com"), user("u3", "bae@example.com")]

        assert recipient_emails(users) == [
            "ahn@example.com",
            "bae@example.com",
            "cha@example.com",
        ]

    def test_동의_시각을_KST로_함께_담는다(self):
        rows = marketing_recipients([user("u1", "a@example.com", agreed_at="2026-08-01T00:00:00Z")])

        assert rows[0]["uid"] == "u1"
        assert rows[0]["marketing_agreed_at"] == "2026-08-01 09:00:00"

    def test_유저가_없으면_빈_목록이다(self):
        assert marketing_recipients([]) == []
        assert recipient_emails([]) == []

    def test_동의하지_않은_사람은_어떤_형태로도_섞이지_않는다(self):
        # 이 테스트가 이 파일의 존재 이유다. 미동의 주소가 결과 어디에도
        # (한 줄·표·CSV) 남으면 안 된다.
        users = [
            user("u1", "agreed@example.com", agreed=True),
            user("u2", "refused@example.com", agreed=False),
            ("u3", {"email": "nodoc@example.com"}),
        ]

        line = emails_to_line(recipient_emails(users))
        csv_text = build_recipient_dataframe(users).to_csv(index=False)

        assert "refused@example.com" not in line
        assert "nodoc@example.com" not in line
        assert "refused@example.com" not in csv_text
        assert "nodoc@example.com" not in csv_text

    def test_수신을_거부한_사람은_어떤_형태로도_섞이지_않는다(self):
        # 위 테스트와 같은 무게다. 거부 의사를 받고도 보내는 것은 미동의자에게
        # 보내는 것과 똑같은 위반이며, 이쪽은 사용자가 직접 껐다는 점에서 더 나쁘다.
        users = [
            user("u1", "agreed@example.com", agreed=True),
            user("u2", "withdrew@example.com", agreed=True, opted_out=True),
        ]

        line = emails_to_line(recipient_emails(users))
        csv_text = build_recipient_dataframe(users).to_csv(index=False)

        assert recipient_emails(users) == ["agreed@example.com"]
        assert "withdrew@example.com" not in line
        assert "withdrew@example.com" not in csv_text


# ── 붙여넣기용 한 줄 ─────────────────────────────────────────────

class Test붙여넣기_한_줄:
    def test_쉼표와_공백으로_잇는다(self):
        assert emails_to_line(["a@example.com", "b@example.com"]) == "a@example.com, b@example.com"
        assert EMAIL_SEPARATOR == ", "

    def test_한_명이면_구분자가_붙지_않는다(self):
        assert emails_to_line(["a@example.com"]) == "a@example.com"

    def test_아무도_없으면_빈_문자열이다(self):
        assert emails_to_line([]) == ""

    def test_줄바꿈이_섞이지_않는다(self):
        # BCC 칸에 붙여 넣을 한 줄이다 — 개행이 들어가면 클라이언트가 끊어 읽는다.
        line = emails_to_line(recipient_emails(demo_marketing_users()))

        assert "\n" not in line


# ── 표 · CSV ────────────────────────────────────────────────────

class Test표와_CSV:
    def test_열_구성이_고정이다(self):
        df = build_recipient_dataframe([user("u1", "a@example.com")])

        assert list(df.columns) == list(RECIPIENT_COLUMNS)

    def test_동의자가_없어도_헤더는_나간다(self):
        # 빈 파일을 받았을 때 '조회 실패'인지 '동의자 0명'인지 구분할 수 있어야 한다.
        df = build_recipient_dataframe([])

        assert isinstance(df, pd.DataFrame)
        assert list(df.columns) == list(RECIPIENT_COLUMNS)
        assert df.empty

    def test_파일명에_시각이_박힌다(self):
        name = recipient_filename(now=datetime(2026, 8, 18, 21, 30))

        assert name == "syu-react-marketing-recipients-20260818-2130.csv"

    def test_추출_시각_표기에_KST를_밝힌다(self):
        label = extracted_at_label(now=datetime(2026, 8, 18, 21, 30))

        assert label == "2026-08-18 21:30 (KST)"


# ── 요약 숫자 ────────────────────────────────────────────────────

class Test요약_숫자:
    def test_동의자와_수신자가_다른_이유를_숫자로_밝힌다(self):
        users = [
            user("u1", "a@example.com", agreed=True),
            user("u2", "b@example.com", agreed=False),
            user("u3", "", agreed=True),          # 동의했지만 주소 없음
            user("u4", "A@example.com", agreed=True),  # u1과 같은 주소
        ]

        assert summarize_recipients(users) == {
            "total": 4,
            "agreed": 3,
            "recipients": 1,
            "missing_email": 1,
            "duplicates": 1,
            "opted_out": 0,
        }

    def test_유저가_없으면_전부_0이다(self):
        assert summarize_recipients([]) == {
            "total": 0,
            "agreed": 0,
            "recipients": 0,
            "missing_email": 0,
            "duplicates": 0,
            "opted_out": 0,
        }

    def test_수신거부로_빠진_인원을_따로_밝힌다(self):
        # 화면이 이 숫자를 감추면, 어제보다 목록이 줄어든 이유가 '철회'인지
        # '조회 누락'인지 알 수 없어 옛 목록을 다시 쓰는 쪽으로 기울게 된다.
        users = [
            user("u1", "a@example.com", agreed=True),
            user("u2", "b@example.com", agreed=True, opted_out=True),
            user("u3", "c@example.com", agreed=True, opted_out=True),
            user("u4", "d@example.com", agreed=False),
        ]

        assert summarize_recipients(users) == {
            "total": 4,
            "agreed": 1,
            "recipients": 1,
            "missing_email": 0,
            "duplicates": 0,
            "opted_out": 2,
        }

    def test_동의자_수는_철회자를_이미_뺀_수다(self):
        # 'agreed'로 보고해 놓고 철회자에게도 보내면 안 되므로, 이 숫자는
        # 처음부터 현재 수신 대상만 센다.
        users = [
            user("u1", "a@example.com", agreed=True),
            user("u2", "b@example.com", agreed=True, opted_out=True),
        ]
        summary = summarize_recipients(users)

        assert summary["agreed"] == 1
        assert summary["agreed"] == summary["recipients"]

    def test_다시_켠_사람은_제외가_아니라_동의자로_센다(self):
        users = [user("u1", "a@example.com", agreed=False, opted_out=False)]
        summary = summarize_recipients(users)

        assert summary["agreed"] == 1
        assert summary["opted_out"] == 0
        assert summary["recipients"] == 1

    def test_수신자_수는_한_줄의_주소_개수와_일치한다(self):
        users = demo_marketing_users()
        summary = summarize_recipients(users)

        assert summary["recipients"] == len(emails_to_line(recipient_emails(users)).split(", "))


# ── Mock 연습 데이터 ─────────────────────────────────────────────

class Test연습_데이터:
    def test_실제_도메인을_쓰지_않는다(self):
        # 연습하다 그대로 복사해 보내는 사고를 막는다.
        for _, data in demo_marketing_users():
            email = data.get("email") or ""
            assert email == "" or email.endswith("@example.com")

    def test_미동의_주소_없음_중복_수신거부를_한_건씩_담고_있다(self):
        # 화면의 요약 숫자가 무엇을 뜻하는지 예시만 봐도 알 수 있어야 한다.
        summary = summarize_recipients(demo_marketing_users())

        assert summary["agreed"] < summary["total"]
        assert summary["missing_email"] == 1
        assert summary["duplicates"] == 1
        assert summary["opted_out"] == 1
        assert summary["recipients"] == 2

    def test_수신을_거부한_표본이_목록에_나오지_않는다(self):
        # 연습 데이터에서도 제외가 실제로 일어나야, 운영팀이 절차를 밟아 볼 때
        # '거부하면 빠진다'를 눈으로 확인할 수 있다.
        emails = recipient_emails(demo_marketing_users())

        assert "haneul@example.com" not in emails
