# tests/test_seed_uat_accounts.py
# UAT 계정 스크립트의 안전장치를 고정하는 테스트.
#
# 이 스크립트는 실행 한 번이 되돌릴 수 없는 삭제로 이어진다. 그래서 검증의
# 초점은 "기능이 도는가"가 아니라 **"안 돌아야 할 때 확실히 멈추는가"**다:
#   ① --apply 없이는 쓰기 함수가 한 번도 불리지 않는다
#   ② test@example.com은 어떤 경로로도 삭제 대상이 되지 않는다
#   ③ 유형별 시드가 프론트 판정 로직 기준으로 의도한 유형을 낸다
#
# Firebase는 전부 대역으로 바꾼다. "쓰지 않았다"는 부정 명제라 코드를 읽어서는
# 증명되지 않으므로, 대역이 모든 호출을 journal에 남기고 테스트가 그 목록에서
# 쓰기 계열(WRITE_CALLS)이 비었음을 확인하는 방식으로 세운다.

import re
import argparse
from unittest.mock import MagicMock

import pytest
from firebase_admin import auth as fb_auth

import seed_uat_accounts as seed


# ─────────────────────────────────────────────────────────────────────────────
# 대역
# ─────────────────────────────────────────────────────────────────────────────

class FakeUser:
    def __init__(self, uid, email, email_verified=True, disabled=False):
        self.uid = uid
        self.email = email
        self.email_verified = email_verified
        self.disabled = disabled


class FakeSnapshot:
    def __init__(self, exists):
        self.exists = exists


class FakeDocument:
    """users/{uid} 문서 대역. set/delete는 기록만 남긴다."""

    def __init__(self, uid, doc_exists, journal):
        self.uid = uid
        self._exists = doc_exists
        self._journal = journal

    def get(self):
        return FakeSnapshot(self._exists)

    def set(self, data, merge=False):
        self._journal.append(("doc.set", self.uid, data, merge))

    def delete(self):
        self._journal.append(("doc.delete", self.uid))


class FakeCollection:
    def __init__(self, existing_docs, journal):
        self._existing = existing_docs
        self._journal = journal

    def document(self, uid):
        return FakeDocument(uid, uid in self._existing, self._journal)


class FakeDb:
    def __init__(self, existing_docs, journal):
        self._existing = existing_docs
        self._journal = journal

    def collection(self, name):
        assert name == "users"
        return FakeCollection(self._existing, self._journal)


class FakeAuth:
    """firebase_admin.auth 대역.

    UserNotFoundError는 **진짜 클래스**를 던진다 — 스크립트가 그 타입으로
    잡기 때문에, 대역이 다른 예외를 던지면 테스트가 실제 동작과 갈린다.
    """

    def __init__(self, users, journal):
        self._users = {user.email: user for user in users}
        self._journal = journal

    def get_user_by_email(self, email):
        if email not in self._users:
            raise fb_auth.UserNotFoundError("없음")
        return self._users[email]

    def delete_user(self, uid):
        self._journal.append(("auth.delete_user", uid))

    def create_user(self, **kwargs):
        self._journal.append(("auth.create_user", kwargs))
        return FakeUser(uid=f"new-{kwargs['email']}", email=kwargs["email"])

    def update_user(self, uid, **kwargs):
        self._journal.append(("auth.update_user", uid, kwargs))


def make_clients(existing_emails=(), existing_docs=()):
    """모든 관리 대상이 존재하는 상태를 기본으로 만든다."""
    journal = []
    users = [
        FakeUser(uid=f"uid-{index}", email=email)
        for index, email in enumerate(existing_emails)
    ]
    docs = set(existing_docs)
    clients = seed.Clients(
        auth=FakeAuth(users, journal),
        db=FakeDb(docs, journal),
        server_timestamp="SERVER_TIMESTAMP",
    )
    return clients, journal


def all_managed_emails():
    return [spec.email for spec in seed.MANAGED_ACCOUNTS]


WRITE_CALLS = {"doc.set", "doc.delete", "auth.delete_user", "auth.create_user", "auth.update_user"}


def writes(journal):
    return [entry for entry in journal if entry[0] in WRITE_CALLS]


def make_args(**overrides):
    defaults = {"apply": False, "password": None, "with_consent": False}
    defaults.update(overrides)
    return argparse.Namespace(**defaults)


# ─────────────────────────────────────────────────────────────────────────────
# ① dry-run은 아무것도 쓰지 않는다
# ─────────────────────────────────────────────────────────────────────────────

class TestDryRunIsReadOnly:
    def test_delete_dry_run은_쓰기_함수를_한_번도_부르지_않는다(self, capsys):
        emails = all_managed_emails()
        clients, journal = make_clients(emails, existing_docs=[f"uid-{i}" for i in range(len(emails))])

        code = seed.cmd_delete(clients, make_args(apply=False))

        assert code == 0
        assert writes(journal) == []
        assert "dry-run" in capsys.readouterr().out

    def test_create_dry_run은_쓰기_함수를_한_번도_부르지_않는다(self, capsys):
        clients, journal = make_clients()  # 계정이 하나도 없는 상태

        code = seed.cmd_create(clients, make_args(apply=False, password="whatever"))

        assert code == 0
        assert writes(journal) == []
        assert "dry-run" in capsys.readouterr().out

    def test_create는_비밀번호_없이도_dry_run이_돈다(self, monkeypatch):
        """비밀번호는 --apply에서만 막는다.

        계획만 보려는데 비밀번호부터 요구하면 dry-run을 쓸 이유가 없어진다.
        """
        monkeypatch.delenv("UAT_PASSWORD", raising=False)
        clients, journal = make_clients()

        assert seed.cmd_create(clients, make_args(apply=False, password=None)) == 0
        assert writes(journal) == []

    def test_list는_읽기_전용이다(self):
        emails = all_managed_emails() + ["test@example.com"]
        clients, journal = make_clients(emails)

        assert seed.cmd_list(clients, make_args()) == 0
        assert writes(journal) == []

    def test_apply인데_비밀번호가_없으면_1로_끝나고_쓰지_않는다(self, monkeypatch):
        monkeypatch.delenv("UAT_PASSWORD", raising=False)
        clients, journal = make_clients()

        assert seed.cmd_create(clients, make_args(apply=True, password=None)) == 1
        assert writes(journal) == []

    def test_확인_입력이_틀리면_삭제하지_않는다(self, monkeypatch):
        emails = all_managed_emails()
        clients, journal = make_clients(emails)
        monkeypatch.setattr("builtins.input", lambda _: "yes")

        assert seed.cmd_delete(clients, make_args(apply=True)) == 0
        assert writes(journal) == []


# ─────────────────────────────────────────────────────────────────────────────
# ② 보호 계정은 어떤 경로로도 삭제되지 않는다
# ─────────────────────────────────────────────────────────────────────────────

class TestProtectedAccount:
    def test_보호_계정은_관리_목록에_없다(self):
        assert "test@example.com" in seed.PROTECTED_EMAILS
        assert "test@example.com" not in all_managed_emails()

    def test_삭제_대상_목록에_보호_계정이_없다(self):
        assert all(spec.email not in seed.PROTECTED_EMAILS for spec in seed.delete_targets())

    def test_관리_목록에_보호_계정이_섞여도_필터가_걸러낸다(self, monkeypatch):
        """목록에 한 줄 더 얹는 미래의 실수를 막는 그물.

        MANAGED_ACCOUNTS를 오염시킨 상태에서도 delete_targets가 보호 계정을
        빼는지 본다 — '지금 목록에 없다'는 사실만으로는 보호가 아니다.
        """
        polluted = seed.MANAGED_ACCOUNTS + (
            seed.AccountSpec(email="test@example.com", purpose="실수로 얹힌 줄"),
        )
        monkeypatch.setattr(seed, "MANAGED_ACCOUNTS", polluted)

        targets = [spec.email for spec in seed.delete_targets()]
        assert "test@example.com" not in targets

    def test_apply_삭제는_보호_계정을_건드리지_않는다(self, monkeypatch):
        emails = all_managed_emails() + ["test@example.com"]
        clients, journal = make_clients(emails, existing_docs=[f"uid-{i}" for i in range(len(emails))])
        monkeypatch.setattr("builtins.input", lambda _: "DELETE")

        assert seed.cmd_delete(clients, make_args(apply=True)) == 0

        protected_uid = clients.auth._users["test@example.com"].uid
        deleted_uids = {entry[1] for entry in journal if entry[0] in {"auth.delete_user", "doc.delete"}}
        assert protected_uid not in deleted_uids
        # 관리 대상 7개는 Auth·문서 모두 지워진다
        assert len([e for e in journal if e[0] == "auth.delete_user"]) == len(seed.MANAGED_ACCOUNTS)
        assert len([e for e in journal if e[0] == "doc.delete"]) == len(seed.MANAGED_ACCOUNTS)

    def test_보호_계정이_대상에_섞이면_오류로_끝난다(self, monkeypatch):
        """delete_targets가 뚫렸을 때 cmd_delete가 마지막으로 멈추는지."""
        monkeypatch.setattr(
            seed,
            "delete_targets",
            lambda: [seed.AccountSpec(email="test@example.com", purpose="뚫린 경우")],
        )
        clients, journal = make_clients(["test@example.com"])

        assert seed.cmd_delete(clients, make_args(apply=True)) == 1
        assert writes(journal) == []


# ─────────────────────────────────────────────────────────────────────────────
# ③ 유형별 시드가 의도한 유형을 낸다
# ─────────────────────────────────────────────────────────────────────────────

class TestStressClassificationMirror:
    """`classify_stress_result`는 src/constants/reactionType.ts의 미러다.

    아래 기대값은 프론트 함수의 규칙(단독 최고 → 단일형 / 2개 동률 → 혼합형 /
    3개 동률 → 균형형 / 전부 0·전부 만점 → 판별 불가)에서 직접 계산한 것이며,
    프론트의 reactionType.test.ts와 같은 사례를 겹쳐 둔다.
    """

    @pytest.mark.parametrize(
        "counts,expected",
        [
            ({"cognitive": 4, "emotional": 2, "behavioral": 1}, "cognitive"),
            ({"cognitive": 1, "emotional": 2, "behavioral": 4}, "behavioral"),
            ({"cognitive": 1, "emotional": 3, "behavioral": 3}, "emotional-behavioral"),
            ({"cognitive": 3, "emotional": 3, "behavioral": 1}, "cognitive-emotional"),
            ({"cognitive": 2, "emotional": 2, "behavioral": 2}, "balanced"),
            ({"cognitive": 0, "emotional": 0, "behavioral": 0}, "undetermined"),
            ({"cognitive": 4, "emotional": 4, "behavioral": 4}, "undetermined"),
        ],
    )
    def test_프론트_규칙대로_분류한다(self, counts, expected):
        assert seed.classify_stress_result(counts) == expected

    def test_혼합형_키는_인지_정서_행동_순서로_조합된다(self):
        """순서가 뒤집히면 프론트의 STRESS_RESULT_TYPE_LABEL에서 키를 못 찾는다."""
        assert seed.classify_stress_result({"cognitive": 3, "emotional": 1, "behavioral": 3}) == "cognitive-behavioral"


class TestSeedTypes:
    def test_모든_시드의_선언과_실제_유형이_일치한다(self):
        assert seed.verify_seed_types(list(seed.MANAGED_ACCOUNTS)) == []

    def test_유형별_계정_3개가_단일_혼합_균형을_모두_덮는다(self):
        types = [seed.classify_stress_result(spec.stress_counts) for spec in seed.UAT_TYPE_ACCOUNTS]
        single = [t for t in types if t in seed.REACTION_KEYS]
        mixed = [t for t in types if "-" in t]
        balanced = [t for t in types if t == "balanced"]
        assert len(single) == 1 and len(mixed) == 1 and len(balanced) == 1

    def test_세_계정의_1번_에피소드_버전이_모두_다르다(self):
        """C-15가 성립하기 위한 조건.

        1번 에피소드의 버전은 cycle[0]이다(useScenarioStore.ts:303,
        `cycle[idx % cycle.length]`). 세 계정의 cycle[0]이 겹치면 검수자는
        같은 대사를 두 번 보고 정상 동작을 F로 판정한다.
        """
        first_versions = [
            seed.reaction_type_cycle(seed.classify_stress_result(spec.stress_counts))[0]
            for spec in seed.UAT_TYPE_ACCOUNTS
        ]
        assert sorted(first_versions) == sorted(seed.REACTION_KEYS)

    def test_판별_불가_시드는_오류로_잡힌다(self):
        broken = [
            seed.AccountSpec(
                email="x@syu-react.test",
                purpose="전부 아니요",
                stress_counts={"cognitive": 0, "emotional": 0, "behavioral": 0},
            )
        ]
        assert seed.verify_seed_types(broken) != []

    def test_선언과_실제가_어긋나면_create가_1로_끝나고_쓰지_않는다(self, monkeypatch):
        broken = (
            seed.AccountSpec(
                email="x@syu-react.test",
                purpose="선언은 균형형인데 실제는 인지형",
                stress_counts={"cognitive": 4, "emotional": 1, "behavioral": 1},
                expected_type="balanced",
            ),
        )
        monkeypatch.setattr(seed, "MANAGED_ACCOUNTS", broken)
        clients, journal = make_clients()

        assert seed.cmd_create(clients, make_args(apply=True, password="password123")) == 1
        assert writes(journal) == []


# ─────────────────────────────────────────────────────────────────────────────
# 시드 문서 모양 — 프론트가 쓰는 것과 같은가
# ─────────────────────────────────────────────────────────────────────────────

class TestSeedDocument:
    def test_답안이_counts와_일관된다(self):
        counts = {"cognitive": 1, "emotional": 3, "behavioral": 3}
        answers = seed.build_stress_answers(counts)

        assert len(answers) == 12
        for key, question_ids in seed.STRESS_QUESTION_IDS.items():
            yes = sum(1 for qid in question_ids if answers[str(qid)] == seed.STRESS_YES_INDEX)
            assert yes == counts[key]

    def test_adhd_원점수와_환산점수가_프론트_공식과_같다(self):
        spec = next(s for s in seed.UAT_PERSONAL_ACCOUNTS if s.email == "uat-d@syu-react.test")
        document = seed.build_user_document(spec, server_timestamp="TS")

        assert document["adhdResult"]["rawScore"] == 12
        assert document["adhdResult"]["score"] == 50  # round(12/24*100)
        assert sum(document["adhdResult"]["answers"].values()) == 12

    def test_동의_기록은_기본으로_시드하지_않는다(self):
        spec = seed.UAT_TYPE_ACCOUNTS[0]
        assert "termsConsent" not in seed.build_user_document(spec, server_timestamp="TS")

    def test_with_consent면_필수_두_시각과_버전이_들어간다(self):
        spec = seed.UAT_TYPE_ACCOUNTS[0]
        document = seed.build_user_document(spec, with_consent=True, server_timestamp="TS")
        consent = document["termsConsent"]

        assert consent["termsAgreedAt"] == "TS"
        assert consent["privacyAgreedAt"] == "TS"
        assert consent["marketingAgreed"] is False
        assert consent["marketingAgreedAt"] is None
        assert consent["version"] == seed.LEGAL_VERSION

    def test_빈_계정은_캐릭터와_검사_결과를_시드하지_않는다(self):
        spec = next(s for s in seed.UAT_PERSONAL_ACCOUNTS if s.email == "uat-a@syu-react.test")
        document = seed.build_user_document(spec, server_timestamp="TS")

        assert "character" not in document
        assert "adhdResult" not in document
        assert "stressResult" not in document

    def test_시나리오_탭_전제인_검사_2종이_유형별_계정에_모두_있다(self):
        """ScenarioTab의 isTestCompleted = adhdResult && stressResult.

        스트레스만 시드하면 C-15 계정으로 시나리오에 들어갈 수 없다.
        """
        for spec in seed.UAT_TYPE_ACCOUNTS:
            document = seed.build_user_document(spec, server_timestamp="TS")
            assert "adhdResult" in document
            assert "stressResult" in document
            assert document["character"]["nickname"] == spec.nickname

    def test_js_round는_0_5를_위로_올린다(self):
        """파이썬 내장 round()는 은행가 반올림이라 프론트와 갈린다."""
        assert seed.js_round(2.5) == 3
        assert round(2.5) == 2  # 대조군


# ─────────────────────────────────────────────────────────────────────────────
# 생성 경로 — 실제로 쓸 때 무엇을 쓰는가
# ─────────────────────────────────────────────────────────────────────────────

class TestCreateApply:
    def test_계정이_없으면_인증된_상태로_만든다(self, monkeypatch):
        """@syu-react.test는 메일을 받을 수 없고 useAuthStore가 미인증 로그인을
        막으므로, email_verified=True가 아니면 만들어도 못 쓴다."""
        monkeypatch.setattr(seed, "MANAGED_ACCOUNTS", seed.UAT_TYPE_ACCOUNTS)
        clients, journal = make_clients()

        assert seed.cmd_create(clients, make_args(apply=True, password="password123")) == 0

        creates = [entry[1] for entry in journal if entry[0] == "auth.create_user"]
        assert len(creates) == 3
        assert all(kwargs["email_verified"] is True for kwargs in creates)
        assert all(kwargs["password"] == "password123" for kwargs in creates)

    def test_이미_있는_계정은_다시_만들지_않고_문서만_시드한다(self, monkeypatch):
        monkeypatch.setattr(seed, "MANAGED_ACCOUNTS", seed.UAT_TYPE_ACCOUNTS)
        emails = [spec.email for spec in seed.UAT_TYPE_ACCOUNTS]
        clients, journal = make_clients(emails)

        assert seed.cmd_create(clients, make_args(apply=True, password="password123")) == 0

        assert [entry for entry in journal if entry[0] == "auth.create_user"] == []
        assert len([entry for entry in journal if entry[0] == "doc.set"]) == 3

    def test_문서는_merge로_쓴다(self, monkeypatch):
        """setDoc(..., {merge:true})가 이 저장소의 users 쓰기 규약이다.
        덮어쓰기로 바뀌면 기존 진행도·동의 기록이 날아간다."""
        monkeypatch.setattr(seed, "MANAGED_ACCOUNTS", seed.UAT_TYPE_ACCOUNTS[:1])
        clients, journal = make_clients()

        seed.cmd_create(clients, make_args(apply=True, password="password123"))

        sets = [entry for entry in journal if entry[0] == "doc.set"]
        assert len(sets) == 1
        assert sets[0][3] is True  # merge

    def test_환경변수로도_비밀번호를_받는다(self, monkeypatch):
        monkeypatch.setattr(seed, "MANAGED_ACCOUNTS", seed.UAT_TYPE_ACCOUNTS[:1])
        monkeypatch.setenv("UAT_PASSWORD", "from-env-123")
        clients, journal = make_clients()

        assert seed.cmd_create(clients, make_args(apply=True, password=None)) == 0
        creates = [entry[1] for entry in journal if entry[0] == "auth.create_user"]
        assert creates[0]["password"] == "from-env-123"

    def test_비밀번호는_소스에_없다(self):
        """문서마다 비밀번호가 3종으로 갈린 전례가 있다 — 코드가 그 혼란을
        물려받지 않도록, 알려진 값들이 소스에 박히지 않았는지 본다."""
        source = seed.__file__.replace(".pyc", ".py")
        with open(source, encoding="utf-8") as handle:
            text = handle.read()
        # 과거에 문서에 떠돌던 실제 값들은 공개 저장소에 남기지 않는다 — 대표
        # 더미 하나와 "따옴표로 감싼 비밀번호 리터럴 대입" 패턴으로 대신 본다.
        assert "password123" not in text
        assert not re.search(r"""password\s*=\s*["'][^"']+["']""", text)


# ─────────────────────────────────────────────────────────────────────────────
# 조회
# ─────────────────────────────────────────────────────────────────────────────

class TestLookup:
    def test_없는_계정은_존재하지_않음으로_읽는다(self):
        clients, _ = make_clients()
        status = seed.lookup(clients, seed.MANAGED_ACCOUNTS[0])

        assert status.exists is False
        assert status.uid is None

    def test_있는_계정은_uid와_문서_유무를_함께_읽는다(self):
        spec = seed.MANAGED_ACCOUNTS[0]
        clients, _ = make_clients([spec.email], existing_docs=["uid-0"])
        status = seed.lookup(clients, spec)

        assert status.exists is True
        assert status.uid == "uid-0"
        assert status.doc_exists is True

    def test_list는_보호_계정도_함께_보여준다(self, capsys):
        clients, _ = make_clients(["test@example.com"])
        seed.cmd_list(clients, make_args())

        output = capsys.readouterr().out
        assert "test@example.com" in output
        assert "[보호]" in output
        assert "disable" in output or "비활성화" in output


# ─────────────────────────────────────────────────────────────────────────────
# CLI 배선
# ─────────────────────────────────────────────────────────────────────────────

class TestCli:
    def test_apply는_기본이_꺼져_있다(self):
        parser = seed.build_parser()
        assert parser.parse_args(["delete"]).apply is False
        assert parser.parse_args(["create"]).apply is False

    def test_secrets_기본_경로는_streamlit_규약을_따른다(self):
        from pathlib import Path

        assert seed.build_parser().parse_args(["list"]).secrets == Path(".streamlit/secrets.toml")

    def test_secrets_경로를_바꿀_수_있다(self):
        from pathlib import Path

        args = seed.build_parser().parse_args(["--secrets", "/tmp/x.toml", "list"])
        assert args.secrets == Path("/tmp/x.toml")

    def test_secrets는_서브커맨드_뒤에_붙여도_받는다(self):
        """`list --secrets ...` 순서가 손으로 치기 자연스럽다."""
        from pathlib import Path

        args = seed.build_parser().parse_args(["list", "--secrets", "/tmp/x.toml"])
        assert args.secrets == Path("/tmp/x.toml")

    def test_서브커맨드_뒤에_안_붙이면_기본값이_남는다(self):
        """서브파서 default가 최상위 기본값을 덮어쓰면 --secrets가 무력해진다."""
        assert seed.build_parser().parse_args(["delete"]).secrets == seed.DEFAULT_SECRETS

    def test_서브커맨드가_없으면_거부한다(self):
        with pytest.raises(SystemExit):
            seed.build_parser().parse_args([])

    def test_secrets가_없으면_1로_끝난다(self, monkeypatch, tmp_path):
        handler = MagicMock()
        monkeypatch.setitem(seed.HANDLERS, "list", handler)

        code = seed.main(["--secrets", str(tmp_path / "없음.toml"), "list"])

        assert code == 1
        handler.assert_not_called()
