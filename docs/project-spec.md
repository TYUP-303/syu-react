# 🦖 SYU-REACT 프로젝트 메인 백서 (최신본)

> 최종 갱신 2026-08-08 · 디자인 시스템: Serene Azure

ADHD 개선 및 스트레스 대처 기제 검사 서비스를 위한 초압축 5일 스프린트 공식 문서입니다. 개발 속도(1순위)를 극대화하기 위해 복잡한 국내 소셜 로그인 백엔드 레이어를 걷어내고, 네이티브 구글 로그인 기반의 React(프론트) + Firebase(인프라/DB) + Streamlit(어드민) 초경량 고속 구조를 채택했습니다.

---

## 🤝 협업 툴 (Collaboration Tools)

* **실시간 소통 (카카오톡):** 일상적인 빠른 소통, 긴급 공지 확인 및 즉각적인 피드백 교환.
* **프로젝트 관리 & 문서화 (Notion):** 프로젝트의 '모든 것'이 기록되는 중앙 저장소 (회의록, 기획서, 요구사항 정의서 관리).
* **시각화 & 유저 플로우 (Miro / Mermaid):** 서비스의 핵심 흐름(User Flow) 및 분기 로직을 시각적으로 설계하고 공유.

---

## 🛠️ 개발 및 디자인 툴 (Development & Design Tools)

* **버전 관리 (GitHub):** 코드의 변경 이력을 기록하고 안전하게 보관하는 저장소 (모노레포 구조 활용, 팀원 권한은 Collaborator로 지정).
* **IDE (코드 편집기) (Antigravity IDE):** AI 에이전트 기반의 지능형 개발 환경 (바이브 코딩 핵심 도구).
* **UI 디자인 & 프로토타입 (Stitch):** 자연어와 스크린샷(Lo-Fi)으로 UI를 디자인하고 즉시 Hi-Fi 코드로 변환하는 실험적 도구.
* **통합 플랫폼 (Google Firebase):** 서버리스 데이터베이스, 사용자 인증, 웹 호스팅을 한 번에 해결하는 통합 백엔드 인프라.

---

## 💻 기술 스택 (Tech Stack)

### 1. 언어 (Language)
* **TypeScript / JavaScript (ES6+):** 사용자 화면의 인터랙션 안정성 확보 및 프론트엔드 상태 관리 구현.
* **Python:** 관리자 대시보드(Streamlit) 환경 내에서 실시간 유저 DB 파싱, 통계 시각화 및 검사 문항 CSV 일괄 업로드 처리 담당.

### 2. 프론트엔드 (Frontend) - 클라이언트 웹 앱
* **React (Vite):** 빠르고 효율적인 사용자 인터페이스 제작을 위한 현대적 라이브러리 (TypeScript 기반 템플릿).
* **Tailwind CSS:** 다중 테마 및 일괄 디자인 시스템 변경을 고려하여 설계된 유틸리티 퍼스트 CSS 프레임워크 (Tailwind CSS v4 기반 테마 변수를 활용하며, 기본 시스템은 **Serene Azure** 디자인 시스템으로 구현됨).
* **Zustand:** 유저의 선택지 점수를 누적하고 시나리오 상태를 유지하기 위한 경량 상태 관리 라이브러리.

### 3. 어드민 대시보드 (Admin Dashboard)
* **Streamlit (Python):** 기획자 및 심리학부 팀원들이 직접 실시간 유저 DB를 모니터링하고, 검사 문항 CSV를 업로드하여 서비스를 조작할 수 있는 풀스택 파이썬 대시보드.

### 4. 데이터베이스 & 인프라 (DB & Infra)
* **Cloud Firestore (Firebase NoSQL):** 유저별 점수, 시나리오 진행도, 회복 일기 데이터를 실시간으로 저장하는 NoSQL 데이터베이스.
* **Firebase Auth:** 구글 네이티브 소셜 로그인(Google Login) 연동 및 안전한 유저 인증 시스템 구현.
* **Firebase Hosting:** 프론트엔드 정적 파일 호스팅 및 배포.

---

## 🏗️ 폴더 구조 및 배포 아키텍처 (Architecture)

프로젝트는 전반적인 맥락(Context)을 AI 에이전트가 한눈에 파악할 수 있도록 하나의 GitHub 저장소로 관리하는 모노레포(Monorepo) 구조를 채택합니다. 별도의 백엔드 API 서버가 없어 구조가 극도로 명확합니다.

### 📁 로컬 폴더 구조 (syu-react)
```text
syu-react/ (최상위 루트 저장소 - git init)
├── syu-react-frontend/     # React + Vite 웹 앱 (배포: Firebase Hosting)
└── syu-react-admin/        # Streamlit 대시보드 + Dockerfile (배포: Google Cloud Run)
```

### 🚀 호스팅 및 배포 방식
* **사용자 웹 화면:** 빌드된 프론트엔드 정적 파일(HTML/JS/CSS)을 Firebase Hosting에 업로드하여 서버리스로 초고속 배포.
* **관리자 대시보드:** 관리자용 Python 환경(Streamlit)을 도커 컨테이너(Docker)로 패키징하여 Google Cloud Run에 서버리스 인스턴스로 배포 (접속 발생 시에만 켜지는 구조로 비용 최적화).
* **데이터 파이프라인:** 중간 API 서버(FastAPI) 없이, 프론트엔드는 Firebase Web SDK로, 대시보드는 Firebase Admin Python SDK로 Firestore DB에 직접 동시 연결하여 통신 규격 최소화.

---

## 🌿 깃 및 브랜치 컨벤션 (Git Convention)

### 1. 브랜치 전략 (GitHub Flow 기반 Trunk-Based)
* 오직 main 브랜치 하나를 중심축으로 삼으며, 기능 개발 시 짧은 수명의 브랜치를 따서 빠르게 머지(Merge)합니다.
* **네이밍 규칙:** 접두사/기능명 (소문자와 대시만 사용)
    * `feat/` : 새로운 기능 구현 (예: `feat/google-login`, `feat/scenario-player`)
    * `fix/` : 버그 수정 (예: `fix/score-calculation`)
    * `refactor/` : 코드 구조 개선 (예: `refactor/design-system`)
    * `chore/` : 패키지 설치 및 빌드 세팅 (예: `chore/init-tailwind`)
    * `docs/` : 문서 수정 (예: `docs/update-readme`)
    * `test/` : 테스트 코드 작성 및 수정 (예: `test/e2e-scenarios`)

### 2. 커밋 메시지 규칙 (Conventional Commits)
AI 에이전트와 팀원 모두가 히스토리를 일관되고 명확하게 추적할 수 있도록 다음 규칙을 엄격히 준수합니다. (상세 내용은 [.agents/AGENTS.md](.agents/AGENTS.md) 파일에 정의되어 있습니다.)

#### **기본 포맷**
```text
<type>: <description>

[optional body]
```

* **허용되는 타입 (Allowed Types)**: 아래 7가지 카테고리만 허용합니다.
  - `feat`: 새로운 기능 구현 (e.g., 구글 로그인 연동, Zustand 스토어 구현 등)
  - `fix`: 버그 수정 (e.g., 새로고침 시 데이터 유실 버그 수정, 계산 오류 수정 등)
  - `chore`: 빌드 프로세스 변경, 패키지 설치, 초기 환경 설정 (e.g., Vite 초기화, Tailwind 설치 등)
  - `docs`: 문서 생성 및 수정 (e.g., 마크다운 문서 수정, 사양서 업데이트 등)
  - `style`: 코드 의미에 영향을 주지 않는 변경사항 (e.g., 공백, 포맷팅, 세미콜론 누락 수정 등)
  - `refactor`: 버그 수정이나 기능 추가가 없는 코드 구조 개선 (e.g., 함수 분리, 가독성 개선 등)
  - `test`: 테스트 코드 추가 및 수정 (e.g., E2E 테스트 검증, 단위 테스트 추가 등)
* **작성 언어**: 제목(Subject Line)과 본문(Body) 모두 **한글(Korean)**로 작성합니다. (영문 작성 금지)
* **제목 규칙**:
  - 제목은 50자 제한 및 마지막에 마침표(`.`)를 생략합니다.
  - 코드 변경 내용을 명확하고 간결하게 표현합니다.
* **본문 규칙 (선택 사항)**:
  - 제목과 본문 사이에는 반드시 빈 줄 하나를 둡니다.
  - 어떻게(How) 구현했는지보다는 **무엇을(What)**, **왜(Why)** 변경했는지에 집중합니다.
  - 터미널 가독성을 위해 한 줄에 최대 72자 제한을 두고 줄바꿈을 적용합니다.

#### **올바른 예시**
```text
chore: 프론트엔드 프로젝트 Vite 스캐폴딩 완료

프로젝트 루트 디렉토리에 syu-react-frontend 폴더를 생성하고 
Vite + React + TS 환경을 구축함. tailwindcss 및 zustand, firebase 
의존성 패키지 설치 완료.
```