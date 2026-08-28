# marketing_utils.py
# 마케팅 수신 동의자 이메일 일괄 추출(BCC 붙여넣기용)의 순수 함수 모듈.
#
# export_utils.py·user_admin_utils.py와 같은 계약이다 — Streamlit·firebase_admin
# 의존성이 없어 pytest로 직접 호출해 검증한다. streamlit_app.py는 화면과
# Firestore 조회만 맡고, "누가 수신자인가"의 판단은 전부 여기에 둔다.
#
# ── 왜 별도 모듈인가 ─────────────────────────────────────────────
# 이 판단이 틀리면 결과가 '표가 이상하다'가 아니라 **동의하지 않은 사람에게
# 광고 메일이 나간다**이다(정보통신망법 제50조 위반). 화면 코드에 섞어 두면
# 조건 한 줄이 바뀌어도 아무도 알아채지 못하므로, 판정을 함수 하나로 모으고
# 테스트가 그 함수만 겨냥하게 한다.
#
# ── users/{uid} 스키마 출처 ───────────────────────────────────────
# 프론트엔드 src/store/useConsentStore.ts와 미러다. 마케팅 수신 여부는
# **두 칸**에 나뉘어 있으며, 나눈 이유가 곧 이 모듈의 판정 규칙이다.
#
#   users/{uid}.email
#
#   users/{uid}.termsConsent            ← 가입 시점의 **증빙** (불변)
#       .marketingAgreed    (bool)
#       .marketingAgreedAt  (Firestore Timestamp | ISO 문자열)
#
#   users/{uid}.marketingConsent        ← 그 뒤의 **현재 상태** (철회·재동의)
#       .agreed             (bool)
#       .updatedAt          (Firestore Timestamp | ISO 문자열)
#       .version            (str)
#
# 철회할 때 termsConsent를 덮지 않는 것이 요점이다. 덮으면 "동의를 받았다"는
# 기록이 사라져 철회 전에 보낸 메일의 근거까지 없어진다(정보통신망법 제50조는
# 동의를 받은 사실의 증명을 요구한다). 마케팅 약관 제6조가 마이페이지를 수신
# 거부 창구로 지목하고 있으므로, 그 창구는 marketingConsent만 갱신한다.

from __future__ import annotations

from datetime import datetime

import pandas as pd

from export_utils import KST, format_timestamp

# ── Firestore 필드명 (프론트 useConsentStore.ts / firestoreKeys.ts와 미러) ──
CONSENT_FIELD = "termsConsent"
MARKETING_AGREED_FIELD = "marketingAgreed"
MARKETING_AGREED_AT_FIELD = "marketingAgreedAt"

#: 수신 거부·재동의가 기록되는 칸 (users/{uid}.marketingConsent)
MARKETING_CONSENT_FIELD = "marketingConsent"
MARKETING_STATE_AGREED_FIELD = "agreed"
MARKETING_STATE_UPDATED_AT_FIELD = "updatedAt"

#: 추출 결과 표의 열 순서. 유저가 0명이어도 헤더는 나가야 한다.
RECIPIENT_COLUMNS = ("email", "marketing_agreed_at", "uid")

#: 붙여넣기용 한 줄의 구분자. 메일 클라이언트(Gmail·Outlook·네이버)가 모두
#: 받아들이는 형식이다. 세미콜론만 받는 구형 클라이언트가 있으나, 쉼표를
#: 못 읽는 것은 없으므로 하나로 고정한다.
EMAIL_SEPARATOR = ", "


def _as_dict(value) -> dict:
    return value if isinstance(value, dict) else {}


def agreed_to_marketing(data) -> bool:
    """**지금** 이 사람에게 광고성 정보를 보내도 되는가.

    가입 시 동의(termsConsent)만 보던 판정을 두 단계로 고쳤다. 마이페이지의
    수신 거부 창구가 marketingConsent에 철회를 적기 때문이며, 그 칸을 보지
    않으면 **거부 의사를 받고도 목록에 남는다.**

    규칙은 두 줄이다:
      1. marketingConsent에 `agreed` 키가 **있으면** 그 값이 이긴다.
      2. 키가 없으면 가입 시 동의로 폴백한다 — 이 칸을 도입하기 전에 가입한
         계정이 전부 여기 해당하므로 마이그레이션 없이 그대로 동작한다.

    어느 단계에서든 **진짜 불리언 True일 때만** 동의로 본다
    (settings_utils.resolve_marketing_enabled와 같은 방침). 문자열 "true"나
    1을 동의로 접어 주지 않는 것이 요점이다 — 여기서 관대하면 데이터가 조금
    이상한 문서 하나가 곧바로 '동의하지 않은 사람에게 광고 메일 발송'이 된다.
    덕분에 값이 깨져 있을 때 사람이 목록에서 **빠질** 뿐 끼어들지는 않는다.

    프론트 미러: useConsentStore.resolveMarketingSubscribed().
    """
    override = _as_dict(_as_dict(data).get(MARKETING_CONSENT_FIELD))
    if MARKETING_STATE_AGREED_FIELD in override:
        return override[MARKETING_STATE_AGREED_FIELD] is True
    return _as_dict(_as_dict(data).get(CONSENT_FIELD)).get(MARKETING_AGREED_FIELD) is True


def opted_out_of_marketing(data) -> bool:
    """가입 시 동의했지만 그 뒤에 수신을 거부한 사람인가.

    요약 숫자에서 '제외된 인원'을 밝히는 데 쓴다. 제외를 화면에서 감추면
    운영팀은 어제 뽑은 목록과 오늘 뽑은 목록의 인원이 왜 다른지 알 수 없고,
    최악의 경우 '조회가 덜 됐나?' 하고 옛 목록을 다시 쓴다.
    """
    consented = _as_dict(_as_dict(data).get(CONSENT_FIELD)).get(MARKETING_AGREED_FIELD) is True
    return consented and not agreed_to_marketing(data)


def marketing_agreed_at(data) -> str:
    """현재 수신 동의의 근거가 되는 시각 (KST 문자열).

    재동의한 사람은 **가입 시각이 아니라 다시 켠 시각**이 근거다. 가입 때
    거부했다가 마이페이지에서 켠 경우 termsConsent.marketingAgreedAt은
    비어 있으므로, 그 값을 그대로 내보내면 동의 시각이 없는 수신자가 된다.
    """
    doc = _as_dict(data)
    override = _as_dict(doc.get(MARKETING_CONSENT_FIELD))
    if override.get(MARKETING_STATE_AGREED_FIELD) is True:
        stamp = format_timestamp(override.get(MARKETING_STATE_UPDATED_AT_FIELD))
        if stamp:
            return stamp
    return format_timestamp(_as_dict(doc.get(CONSENT_FIELD)).get(MARKETING_AGREED_AT_FIELD))


def normalize_email(value) -> str:
    """앞뒤 공백을 턴 이메일 문자열. 주소 모양이 아니면 빈 문자열."""
    if not isinstance(value, str):
        return ""
    email = value.strip()
    # '@'가 없으면 메일 클라이언트가 그 자리에서 발송을 거부하거나, 더 나쁘게는
    # 사내 도메인을 붙여 엉뚱한 사람에게 보낸다. 주소가 아닌 값은 목록에서 뺀다.
    if "@" not in email or email.startswith("@") or email.endswith("@"):
        return ""
    return email


def marketing_recipients(users) -> list:
    """(uid, 문서 dict) 목록에서 **동의했고 주소가 있는** 수신자만 골라낸다.

    - 이메일 기준 중복 제거(대소문자 무시). 같은 사람이 두 계정을 갖고 있으면
      같은 메일을 두 번 받게 되므로 첫 계정만 남긴다.
    - 정렬은 이메일 오름차순(대소문자 무시). 추출할 때마다 순서가 달라지면
      두 번 뽑은 결과를 눈으로 대조할 수 없다.
    """
    rows = {}
    for uid, data in list(users):
        if not agreed_to_marketing(data):
            continue
        email = normalize_email(_as_dict(data).get("email"))
        if not email:
            continue
        key = email.lower()
        if key in rows:
            continue
        rows[key] = {
            "email": email,
            "marketing_agreed_at": marketing_agreed_at(data),
            "uid": str(uid),
        }
    return [rows[key] for key in sorted(rows)]


def recipient_emails(users) -> list:
    """수신자 이메일만 순서대로."""
    return [row["email"] for row in marketing_recipients(users)]


def emails_to_line(emails) -> str:
    """BCC 칸에 그대로 붙여 넣을 한 줄."""
    return EMAIL_SEPARATOR.join(emails)


def build_recipient_dataframe(users) -> pd.DataFrame:
    """수신자 표. 0명이어도 헤더만 있는 빈 표를 돌려준다 — 빈 파일을 받아도
    '조회가 실패한 것'인지 '동의자가 없는 것'인지 구분할 수 있어야 한다."""
    return pd.DataFrame(marketing_recipients(users), columns=list(RECIPIENT_COLUMNS))


def summarize_recipients(users) -> dict:
    """추출 결과 요약. 화면이 "몇 명 중 몇 명을 뽑았는지"를 밝히는 데 쓴다.

    동의자 수와 수신자 수가 다를 수 있다는 것을 화면에서 감추면, 운영팀은
    "동의자 12명"이라고 보고해 놓고 11명에게만 보내게 된다.

    ``agreed``는 **현재 수신 동의 상태인 사람** 수다 — 수신 거부자는 이미
    빠져 있다. 빠진 인원은 ``opted_out``으로 따로 밝힌다: 숫자가 줄어든 이유가
    '철회'인지 '조회 누락'인지 화면에서 구분되지 않으면, 운영팀은 옛 목록을
    다시 쓰는 쪽으로 기울고 그건 철회한 사람에게 광고를 보내는 일이 된다.
    """
    # 제너레이터로 들어와도 아래에서 여러 번 훑으므로 먼저 굳힌다.
    users = list(users)
    agreed = [(uid, data) for uid, data in users if agreed_to_marketing(data)]
    recipients = marketing_recipients(users)
    missing_email = sum(1 for _, data in agreed if not normalize_email(_as_dict(data).get("email")))
    return {
        "total": len(users),
        "agreed": len(agreed),
        "recipients": len(recipients),
        "missing_email": missing_email,
        "duplicates": len(agreed) - missing_email - len(recipients),
        "opted_out": sum(1 for _, data in users if opted_out_of_marketing(data)),
    }


def extracted_at_label(now=None) -> str:
    """추출 시각(KST). 동의 철회가 반영되지 않는 스냅샷이라 시각을 함께 적는다."""
    return (now or datetime.now(KST)).strftime("%Y-%m-%d %H:%M") + " (KST)"


def recipient_filename(now=None) -> str:
    """내려받기 파일명. 시각은 KST 기준 (export_filename과 같은 방식)."""
    stamp = (now or datetime.now(KST)).strftime("%Y%m%d-%H%M")
    return f"syu-react-marketing-recipients-{stamp}.csv"


def demo_marketing_users() -> list:
    """Mock 모드용 연습 데이터. 실제 주소가 아닌 example.com만 쓴다.

    자격증명이 없는 환경에서도 추출 절차를 끝까지 밟아 볼 수 있어야 한다
    (user_admin_utils.demo_user_document와 같은 방침). 표본에 일부러
    '미동의'·'동의했지만 이메일 없음'·'주소 중복'·'가입 후 수신 거부'를 한
    건씩 섞어, 요약 숫자가 무엇을 뜻하는지 화면에서 바로 보이게 했다.
    """
    return [
        (
            "demo-uid-1",
            {
                "email": "chorong@example.com",
                CONSENT_FIELD: {
                    MARKETING_AGREED_FIELD: True,
                    MARKETING_AGREED_AT_FIELD: "2026-08-01T00:00:00Z",
                },
            },
        ),
        (
            "demo-uid-2",
            {
                "email": "baram@example.com",
                CONSENT_FIELD: {
                    MARKETING_AGREED_FIELD: False,
                    MARKETING_AGREED_AT_FIELD: None,
                },
            },
        ),
        (
            "demo-uid-3",
            {
                "email": "dasom@example.com",
                CONSENT_FIELD: {
                    MARKETING_AGREED_FIELD: True,
                    MARKETING_AGREED_AT_FIELD: "2026-08-11T09:30:00Z",
                },
            },
        ),
        (
            # 동의는 했지만 users 문서에 이메일이 없는 계정 (Auth만 있는 상태 등)
            "demo-uid-4",
            {
                "email": "",
                CONSENT_FIELD: {
                    MARKETING_AGREED_FIELD: True,
                    MARKETING_AGREED_AT_FIELD: "2026-08-12T01:00:00Z",
                },
            },
        ),
        (
            # 같은 주소로 만든 두 번째 계정 — 한 번만 보내야 한다
            "demo-uid-5",
            {
                "email": "Chorong@example.com",
                CONSENT_FIELD: {
                    MARKETING_AGREED_FIELD: True,
                    MARKETING_AGREED_AT_FIELD: "2026-08-13T02:00:00Z",
                },
            },
        ),
        (
            # 가입 때는 동의했으나 마이페이지에서 수신을 거부한 계정.
            # 증빙(termsConsent)은 그대로 남아 있고 현재 상태만 꺼져 있다 —
            # 이 사람이 목록에 섞이면 정보통신망법 제50조 위반이다.
            "demo-uid-6",
            {
                "email": "haneul@example.com",
                CONSENT_FIELD: {
                    MARKETING_AGREED_FIELD: True,
                    MARKETING_AGREED_AT_FIELD: "2026-08-02T00:00:00Z",
                },
                MARKETING_CONSENT_FIELD: {
                    MARKETING_STATE_AGREED_FIELD: False,
                    MARKETING_STATE_UPDATED_AT_FIELD: "2026-08-17T05:00:00Z",
                    "version": "1.0.0",
                },
            },
        ),
    ]
