// src/utils/mailto.ts
// mailto: URL 조립.
//
// 이 서비스에는 폼을 받아 줄 API 서버가 없다(프론트가 Firestore에 직접
// 붙는 구조라 "문의 저장" 컬렉션도 없다). 그래서 1:1 문의의 실제 전달
// 경로는 사용자의 메일 앱뿐이고, 제목·본문을 미리 채운 링크를 만들어야
// 한다.
//
// 한 줄짜리 문자열 결합처럼 보이지만 손으로 붙이면 틀리는 지점이 셋이라
// 함수로 격리하고 테스트를 걸어 둔다:
//   1. 제목·본문은 반드시 encodeURIComponent를 거친다. 특히 본문에 든
//      `&`와 `#`를 그대로 두면 뒤 내용이 잘려 나가거나 다른 파라미터로
//      해석된다 — 한글·줄바꿈보다 이쪽이 조용해서 더 위험하다.
//   2. 수신 주소는 인코딩하지 않는다. `@`가 %40으로 바뀌면 주소로
//      인식하지 못하는 메일 클라이언트가 있다.
//   3. 빈 값인 파라미터는 아예 붙이지 않는다 (`?subject=&body=` 같은
//      꼬리는 일부 클라이언트에서 빈 제목을 명시 지정한 것으로 처리된다).

export interface MailtoParts {
  /** 수신 주소. 인코딩하지 않고 그대로 쓴다 */
  to: string;
  /** 메일 제목 (선택) */
  subject?: string;
  /** 메일 본문 (선택). 줄바꿈은 \n 그대로 넘기면 된다 */
  body?: string;
}

/** 메일 앱을 여는 mailto: 링크를 만든다 */
export function buildMailtoHref({ to, subject, body }: MailtoParts): string {
  const params: string[] = [];
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
  if (body) params.push(`body=${encodeURIComponent(body)}`);

  return params.length > 0 ? `mailto:${to}?${params.join('&')}` : `mailto:${to}`;
}
