// src/constants/legal.test.ts
//
// 법무 3종(이용약관 · 개인정보 처리방침 · 마케팅 정보 수신 동의)의 **상호
// 정합성**을 고정한다. 조항 문장을 그대로 베껴 두는 스냅샷 테스트가 아니다 —
// 문안은 법무 검토로 계속 다듬어지므로, 여기서 잡는 것은 "세 문서가 서로
// 다른 말을 하고 있는가"뿐이다.
//
// 이 테스트가 생긴 이유(2026-08-26):
//   마케팅 수신 동의 항목을 켜고(MARKETING_CONSENT_ENABLED_DEFAULT) 어드민에
//   동의자 이메일 추출 기능까지 붙였는데(marketing_utils.py), 정작 약관은
//   "광고가 포함되어 있지 않습니다", 처리방침은 "광고성 정보 전송에 활용하지
//   않습니다"라고 못 박고 있었다. 게시된 문서가 서비스 동작을 부정하는 상태라
//   메일 한 통이 곧 약관 위반이 된다. 사람이 세 파일을 나란히 읽어야만 보이는
//   종류의 사고여서, 조건을 테스트로 옮겼다.

import { describe, it, expect } from 'vitest';
import {
  TERMS,
  PRIVACY,
  MARKETING,
  LEGAL_VERSION,
  MARKETING_CONSENT_ENABLED_DEFAULT,
  type LegalDocument,
} from './legal';

/** 조항 제목과 본문을 이어 붙인 문서 전문 — 조항 번호가 밀려도 검사가 살아남는다 */
const fullText = (doc: LegalDocument): string =>
  doc.sections.map((section) => `${section.heading}\n${section.body}`).join('\n\n');

/** 제목의 낱말로 조항을 찾는다 (isOfficerSection과 같은 이유로 번호를 쓰지 않는다) */
const sectionBody = (doc: LegalDocument, keyword: string): string => {
  const found = doc.sections.find((section) => section.heading.includes(keyword));
  if (!found) throw new Error(`'${keyword}'가 들어간 조항을 찾지 못했습니다`);
  return found.body;
};

describe('LEGAL_VERSION', () => {
  it('처리방침 변경 조항의 가장 최근 시행일과 같다', () => {
    // legal.ts의 규약이다 — 동의 기록에 남는 버전과 게시된 문서의 시행일이
    // 어긋나면 "무엇에 동의했는가"를 되짚을 수 없다. 조항을 고치고 상수만
    // 잊는(또는 그 반대) 실수를 여기서 잡는다.
    const body = sectionBody(PRIVACY, '처리방침의 변경');
    const dates = [...body.matchAll(/시행일:\s*(\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]);

    expect(dates.length).toBeGreaterThan(0);
    expect(dates[dates.length - 1]).toBe(LEGAL_VERSION);
  });
});

describe('이용약관 — 마케팅 발송과의 정합성', () => {
  it('광고가 일절 없다고 단정하지 않는다', () => {
    // 동의자에게 서비스 소식(광고성 정보)을 메일로 보내는 것이 현재 동작이다.
    expect(fullText(TERMS)).not.toContain('광고가 포함되어 있지 않습니다');
  });

  it('별도 동의한 회원에게 이메일로 소식을 보낼 수 있음을 밝힌다', () => {
    const text = fullText(TERMS);

    expect(text).toContain('마케팅 정보 수신');
    expect(text).toContain('전자우편');
    expect(text).toContain('철회');
  });

  it('유료 결제 기능이 없다는 사실은 그대로 유지한다', () => {
    // 정합성을 맞추다가 "무료 서비스"라는 사실까지 지워서는 안 된다.
    expect(fullText(TERMS)).toContain('무료로 제공');
  });
});

describe('개인정보 처리방침 — 마케팅 발송과의 정합성', () => {
  it('광고성 정보 전송에 전혀 활용하지 않는다고 단정하지 않는다', () => {
    expect(fullText(PRIVACY)).not.toContain(
      '수집된 개인정보는 광고성 정보 전송에 활용하지 않습니다'
    );
  });

  it('별도 동의한 경우에 한하여 이메일을 소식 안내에 쓴다고 밝힌다', () => {
    const body = sectionBody(PRIVACY, '수집 및 이용 목적');

    expect(body).toContain('별도');
    expect(body).toContain('이메일');
    expect(body).toContain('철회');
  });

  it('수집 항목에 동의 기록을 밝힌다', () => {
    // users/{uid}.termsConsent · marketingConsent가 실제로 저장된다.
    // 수집 항목에 없으면 "고지하지 않은 항목을 모으는" 상태가 된다.
    expect(sectionBody(PRIVACY, '수집 항목')).toContain('동의');
  });
});

describe('마케팅 정보 수신 동의 — 실제 발송 수단과의 정합성', () => {
  it('전송매체로 전자우편만 밝힌다', () => {
    const body = sectionBody(MARKETING, '전송 매체');

    expect(body).toContain('전자우편');
    expect(body).not.toContain('서비스 내 알림');
  });

  it('앱 푸시를 전송매체로도 이용 항목으로도 적지 않는다', () => {
    // 앱 푸시 토글은 발송 기능이 없어 2026-08-18에 숨겼다(MyPageView).
    // 있지도 않은 수단에 동의를 받으면 그 동의가 무엇에 대한 것인지 흐려진다.
    expect(fullText(MARKETING)).not.toContain('푸시');
  });

  it('전화·문자메시지를 쓰지 않는다는 고지는 유지한다', () => {
    expect(sectionBody(MARKETING, '전송 매체')).toContain('문자메시지(SMS)');
  });

  it('철회 창구로 마이페이지의 알림 설정을 지목한다', () => {
    // MyPageView의 마케팅 토글이 이 문장의 이행이다 — 창구 이름이 어긋나면
    // 사용자가 약관이 가리킨 자리에서 토글을 찾지 못한다.
    const body = sectionBody(MARKETING, '수신 거부');

    expect(body).toContain('마이페이지');
    expect(body).toContain('알림 설정');
  });
});

describe('동의 항목 표시 스위치와 문서의 관계', () => {
  it('마케팅 항목을 켜 둔 동안에는 처리방침이 광고성 정보 전송을 전면 금지하지 않는다', () => {
    // 두 값이 어긋나는 조합(스위치 on + 전면 금지 문장)이 2026-08-26 이전의
    // 상태였다. 스위치를 다시 켤 때 같은 조합으로 돌아가지 않게 묶어 둔다.
    if (!MARKETING_CONSENT_ENABLED_DEFAULT) return;

    expect(fullText(PRIVACY)).not.toContain('광고성 정보 전송에 활용하지 않습니다.');
  });
});
