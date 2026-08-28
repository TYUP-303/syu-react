// src/api/firestoreKeys.ts
// Firestore 컬렉션 / 문서 ID / 필드명의 단일 출처.
//
// ⚠️ 이 값들은 syu-react-admin/streamlit_app.py와 공유되는 "계약"입니다.
//    TypeScript 컴파일러가 Python 쪽까지 검사해 주지 않으므로,
//    값을 변경하려면 반드시 어드민 코드도 함께 수정해야 합니다.
//
//    대응 지점 (라인 번호는 변할 수 있으므로 값으로 grep 하세요):
//      users        → db.collection('users'), .document(uid).delete()
//      createdAt    → data.get('createdAt')
//      adhdResult / stressResult → data.get(...)  (대시보드 점수 집계)
//      questions/{adhd|stress}   → 어드민 "문항 관리 (CSV)" 메뉴
//      scenarios/{visual|dialogue|angels|epilogue} → 어드민 "시나리오 관리 (CSV)" 메뉴
//      csvText      → 두 메뉴 모두 이 필드에 CSV 원문을 통째로 저장
//      settings/{legal|notice}   → 어드민 "약관·공지 관리" 메뉴 (settings_utils.py)
//      termsConsent / marketingConsent → 어드민 마케팅 수신자 추출 (marketing_utils.py)

export const COLLECTIONS = {
  USERS: 'users',
  QUESTIONS: 'questions',
  SCENARIOS: 'scenarios',
  /**
   * 법무 문서 전문 · 운영 정보 · 서비스 공지 (2026-08-16 추가).
   *
   * questions·scenarios와 같은 계약이다: 문서가 없거나 필드가 비면 프론트가
   * 코드 상수(constants/legal.ts)로 조용히 폴백하므로, 시드하지 않은 상태도
   * 정상 동작이다. 읽기는 firestore.rules에서 전체 공개(공지·약관은 로그인
   * 전에도 보여야 한다), 쓰기는 불허 — 어드민은 Admin SDK라 rules를 우회한다.
   */
  SETTINGS: 'settings',
} as const;

/** settings 컬렉션의 문서 ID */
export const SETTINGS_DOCS = {
  /** 약관·처리방침 전문 + 보호책임자/연락처 등 운영 정보 */
  LEGAL: 'legal',
  /** 서비스 내 공지 배너 (처리방침 제11조가 약속한 "서비스 내 공지" 수단) */
  NOTICE: 'notice',
} as const;

/**
 * settings/legal 문서의 필드.
 *
 * 전부 선택 필드다. 없는 필드는 constants/legal.ts의 같은 이름 상수로
 * 폴백하므로, 바꾸고 싶은 값 하나만 채워 넣어도 된다.
 *
 * {
 *   termsSections?:   [{ heading, body }],  // 이용약관 조항 배열
 *   privacySections?: [{ heading, body }],  // 처리방침 조항 배열
 *   marketingSections?: [{ heading, body }],// 마케팅 수신 동의 조항 배열
 *   officerName?:     string,               // 개인정보 보호책임자 성명
 *   contactEmail?:    string,               // 보호책임자 연락처 (법정 고지)
 *   inquiryEmail?:    string,               // 1:1 문의 창구 (일반 문의)
 *   version?:         string,               // 동의 기록에 남길 문서 버전
 *   marketingConsentEnabled?: boolean,      // 동의 화면의 마케팅 항목 표시 여부
 *   updatedAt?:       string,               // 어드민이 남기는 저장 시각 (ISO)
 * }
 */
export const SETTINGS_LEGAL_FIELDS = {
  TERMS_SECTIONS: 'termsSections',
  PRIVACY_SECTIONS: 'privacySections',
  /** 마케팅 정보 수신 동의 조항 배열 (2026-08-18 추가) */
  MARKETING_SECTIONS: 'marketingSections',
  OFFICER_NAME: 'officerName',
  CONTACT_EMAIL: 'contactEmail',
  INQUIRY_EMAIL: 'inquiryEmail',
  VERSION: 'version',
  /**
   * 동의 화면에 마케팅 수신 동의 항목을 표시할지 (2026-08-18 추가).
   *
   * 다른 필드와 달리 불리언이라 **false도 유효한 설정값**이다 — 값이 없을
   * 때만 코드 기본값(MARKETING_CONSENT_ENABLED_DEFAULT = true)으로 폴백한다.
   * 끄면 동의 화면에서 항목 행이 사라지고, 선택 항목이므로 필수 동의 판정에는
   * 영향이 없다. 이미 저장된 users/{uid}.termsConsent.marketingAgreed는
   * 건드리지 않는다.
   */
  MARKETING_CONSENT_ENABLED: 'marketingConsentEnabled',
  UPDATED_AT: 'updatedAt',
} as const;

/**
 * settings/notice 문서의 필드.
 *
 * { active: boolean, message: string, updatedAt?: string }
 *
 * active가 true이고 message가 비어 있지 않을 때만 배너가 뜬다 — 둘 중 하나만
 * 보면 "켜 뒀는데 빈 배너가 뜨는" 상태가 생긴다.
 */
export const SETTINGS_NOTICE_FIELDS = {
  ACTIVE: 'active',
  MESSAGE: 'message',
  UPDATED_AT: 'updatedAt',
} as const;

/** questions 컬렉션의 문서 ID. useTestStore의 testType 값과 동일해야 합니다. */
export const QUESTION_DOCS = {
  ADHD: 'adhd',
  STRESS: 'stress',
} as const;

/** scenarios 컬렉션의 문서 ID */
export const SCENARIO_DOCS = {
  VISUAL: 'visual',
  DIALOGUE: 'dialogue',
  /**
   * 에피소드별 요정 조언 3종 + 도움/비도움 요인 선택지 (scenario_angels.csv).
   *
   * 어드민 "시나리오 관리 (CSV)" 메뉴에서 업로드·내려받기·롤백을 지원한다
   * (2026-08-13 추가 — 그전에는 이 문서 종류가 어드민에 없었다). DB에 문서가
   * 없으면 프론트는 번들된 로컬 CSV로 조용히 폴백하므로 앱은 정상 동작한다 —
   * 원고 도착 전까지는 폴백 상태가 정상이다.
   */
  ANGELS: 'angels',
  /**
   * 영역별 에필로그 — 10편을 모두 마치면 열리는 11번째 카드 (scenario_epilogue.csv).
   *
   * 다른 세 문서와 같은 계약이다: 문서가 없으면 프론트가 번들된 로컬 CSV로
   * 조용히 폴백하므로, 시드하지 않은 상태도 정상 동작이다. 어드민 "시나리오
   * 관리 (CSV)" 메뉴에 업로드·내려받기·롤백이 함께 붙어 있다.
   */
  EPILOGUE: 'epilogue',
} as const;

/** users/{uid} 단일 문서에 누적되는 필드 이름 */
export const USER_FIELDS = {
  EMAIL: 'email',
  DISPLAY_NAME: 'displayName',
  /** Firebase Auth가 채우는 구글 프로필 사진. 앱은 읽기만 한다. */
  PHOTO_URL: 'photoURL',
  /** 프리셋 아바타 id (constants/avatarPresets.ts). photoURL보다 우선한다. */
  AVATAR_ID: 'avatarId',
  /** 업로드 아바타 URL — 2차 예정. 아직 어디서도 쓰이지 않는다. */
  AVATAR_URL: 'avatarUrl',
  CREATED_AT: 'createdAt',
  UPDATED_AT: 'updatedAt',
  CHARACTER: 'character',
  ADHD_RESULT: 'adhdResult',
  STRESS_RESULT: 'stressResult',
  SCENARIOS: 'scenarios',
  /**
   * 이미 열어 본 완주 보고서의 themeId 목록 (string[]).
   *
   * "최초 1회 보고서"를 판정하는 근거다. 예전에는 런타임 집계만 보고
   * "다른 영역이 이미 완주됐는가"로 대신 판정했는데, 데이터 초기화 없이
   * 재로그인하거나 두 번째 영역을 먼저 끝내면 보고서가 다시 뜨거나 아예
   * 못 뜨는 경우가 생겼다. 값이 없으면(구버전 데이터) 기존 런타임 판정으로
   * 폴백하므로 마이그레이션은 필요하지 않다.
   *
   * ⚠️ 어드민은 이 필드를 읽지 않는다 — 유저 관리·대시보드 집계 대상이
   * 아니므로 streamlit_app.py 수정은 불필요하다. 새 필드를 추가한 사실만
   * 계약 목록에 남긴다.
   */
  SEEN_REPORTS: 'seenReports',
  /**
   * 영역별 에필로그를 본 기록 (맵, 2026-08-26 추가).
   *
   * { [themeId]: { seenAt: string } }  예) { workplace: { seenAt: '2026-08-26T…Z' } }
   *
   * ⚠️ **scenarios 맵에 넣지 않는다.** 에피소드 진행도(EpisodeProgress)는
   * 전략 선택·도움 체감·요인이 붙어 있는 집계 대상이고, 그 집계가 엔딩 해금·
   * 회복 앨범 완주(computeAlbumProgress)·핵심 요인 Top3의 근거다. 에필로그는
   * 고를 것이 없는 읽기 전용 장면이라 같은 맵에 섞으면 분모만 늘려 통계를
   * 왜곡한다 — 그래서 필드를 따로 둔다. 이 필드는 어떤 집계에도 들어가지
   * 않으며, 목록 카드의 '봤어요' 배지 하나가 유일한 소비처다.
   *
   * 키를 CSV의 DOMAIN('직장')이 아니라 **themeId('workplace')**로 두는 이유:
   * seenReports가 이미 themeId 배열이고, 어드민이 THEME_LABEL로 같은 표를
   * 만들 수 있으며, 콘텐츠 표기가 바뀌어도 저장된 기록이 떠내려가지 않는다.
   *
   * ⚠️ 어드민이 읽는다 — 유저 상세의 시나리오 탭이 열람 기록을 표시한다
   * (user_admin_utils.epilogue_labels).
   */
  EPILOGUES: 'epilogues',
  /**
   * 약관·개인정보 처리방침 동의 기록 (맵).
   *
   * {
   *   termsAgreedAt:     Timestamp,        // 이용약관 동의 시각 (필수)
   *   privacyAgreedAt:   Timestamp,        // 개인정보 처리방침 동의 시각 (필수)
   *   marketingAgreed:   boolean,          // 마케팅 수신 동의 여부 (선택)
   *   marketingAgreedAt: Timestamp | null, // 동의하지 않았으면 null
   *   version:           string,           // constants/legal.ts의 LEGAL_VERSION
   * }
   *
   * 필수 두 시각이 모두 있어야 "동의 완료"로 본다(useConsentStore의
   * hasRequiredConsent). 값이 없는 계정은 로그인 직후 동의 게이트를 만난다 —
   * 구글 로그인이 동의 없이 홈까지 들어가던 구멍을 막기 위한 것이라,
   * 기존 사용자가 다음 로그인에서 한 번 게이트를 보는 것은 의도된 동작이다.
   *
   * ⚠️ **이 맵은 가입 시점의 증빙이며 이후 덮어쓰지 않는다.** 마케팅 수신을
   * 나중에 철회·재동의해도 여기의 marketingAgreed / marketingAgreedAt은
   * 그대로 둔다 — "언제 무엇에 동의했는가"를 증명하는 원본이라, 현재 상태로
   * 덮으면 동의를 받았다는 사실 자체가 사라진다. 현재 상태는 아래의
   * marketingConsent가 따로 들고 있다.
   *
   * ⚠️ 어드민이 읽는다 — marketing_utils.agreed_to_marketing()이 이 맵의
   * marketingAgreed를 **폴백**으로 본다(marketingConsent가 없을 때).
   */
  TERMS_CONSENT: 'termsConsent',
  /**
   * 마케팅 정보 수신의 **현재 상태** (맵, 2026-08-18 추가).
   *
   * {
   *   agreed:    boolean,   // 지금 광고성 정보를 받겠다고 되어 있는가
   *   updatedAt: Timestamp, // 마지막으로 바꾼 시각 (철회 시각 = 철회 증빙,
   *                         //   재동의 시각 = 새 동의 증빙)
   *   version:   string,    // 바꾼 시점의 법무 문서 버전 (settings/legal.version)
   * }
   *
   * ── 왜 termsConsent와 나누는가 ────────────────────────────────
   * termsConsent는 **가입 시점의 증빙**이고 이 맵은 **지금의 상태**다. 한
   * 칸에 합치면 철회할 때 "동의를 받았다"는 기록을 지우게 되는데, 그러면
   * 철회 전에 보낸 메일의 근거가 사라진다(정보통신망법 제50조는 동의를 받은
   * 사실의 증명을 요구한다). 마케팅 약관 제6조가 마이페이지를 수신 거부
   * 창구로 지목하고 있으므로, 그 창구가 쓰는 칸을 따로 둔다.
   *
   * ── 판정 규약 (프론트·어드민 공통) ─────────────────────────────
   * `agreed` 키가 **있으면** 그 값이 termsConsent.marketingAgreed를 덮는다
   * (엄격 비교 — true가 아니면 전부 미수신). 키 자체가 없으면 폴백한다.
   * 이 순서 덕분에 이 맵이 없는 기존 계정은 가입 시 동의 그대로 유지되고,
   * 값이 깨져 있어도 사람이 **빠질** 뿐 끼어들지는 않는다.
   *   프론트: useConsentStore.resolveMarketingSubscribed()
   *   어드민: marketing_utils.agreed_to_marketing()
   *
   * ⚠️ 어드민이 읽는다 — 수신자 추출에서 철회자를 빼는 근거가 이 필드다.
   * 필드명을 바꾸면 marketing_utils.py도 함께 고쳐야 한다.
   */
  MARKETING_CONSENT: 'marketingConsent',
} as const;

/**
 * users/{uid}.marketingConsent 맵의 하위 필드.
 *
 * 어드민(marketing_utils.py)이 같은 이름을 상수로 들고 있다 — 여기를 고치면
 * 그쪽도 고쳐야 한다.
 */
export const MARKETING_CONSENT_FIELDS = {
  AGREED: 'agreed',
  UPDATED_AT: 'updatedAt',
  VERSION: 'version',
} as const;

/** questions / scenarios 문서가 공통으로 갖는 CSV 원문 필드 */
export const CSV_TEXT_FIELD = 'csvText';
