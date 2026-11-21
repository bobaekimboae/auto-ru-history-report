# 에이전트 안내

## 보배드림 기술 스택 (2026-10-30, 모든 에이전트 필수)

- 보배드림의 모든 저장소·키트·솔루션은 보배드림 리뉴얼 기술 스택으로 만든다. 원본은 노션 「리뉴얼 기술 스택」(https://app.notion.com/p/408ee9c4b60680c3be52caefde283895), 같은 내용이 `bobaekimboae/bobaedream` 저장소의 `docs/tech-stack.md`에 있다.
- 사용자 화면: Nuxt 4.6 · Vue 3.5 · TypeScript 6 · 일반 CSS와 CSS 변수 · `useState`/composable · Tiptap 3.
- 관리자 화면: Nuxt 4.5 · Vue 3.5 · Vuetify 3 · Pinia · SCSS · TypeScript 5.9 · Tiptap 2.
- 백엔드: Laravel 12 · PHP 8.4 (PHP-FPM) · PostgreSQL 15 · Redis 7 · Meilisearch. 패키지는 pnpm 10 · Composer. 런타임 Node.js 24.
- **새 화면·새 기능은 React로 만들지 않는다. Nuxt로 만든다.** 백엔드·API가 필요하면 Laravel 규칙(REST · JSON)으로 설계하고, Node 서버나 다른 언어로 새 백엔드를 만들지 않는다.
- 이 저장소의 기존 화면(`studio/`, `bg-remover/`, `shortform/` 등)은 라이브러리 없는 HTML·JavaScript 시안이다. 새로 만드는 기능은 Nuxt로 만들고, 기존 시안을 Nuxt로 옮기는 일정은 사용자가 정한다.

## 보배드림 숏폼 4유형과 ③ 에이전트 편집 (2026-11-07, 모든 에이전트 필독)

- 숏폼은 4유형으로 나뉜다: ① 외부 상용 SaaS(비교 기준만) · ② 로컬 파이프라인(촬영키트 → 서버 자동, 무료 기본) · ③ 에이전트 MCP 편집(TTS·자막·포인터·음악, 유료 구독 1단계) · ④ 사람 편집(캡컷·프리미어, 프리미엄 촬영).
- 담당 역할: **서울오토갤러리 자동 영상 제작 코덱스 마스터**는 ③유형의 제작·규정·파이프라인을 맡는다. 다른 에이전트도 필요하면 직접 영상을 만들 수 있는 **제작자이자 컨설턴트**로 본다.
- 목표: 서울오토갤러리 딜러 **전원**이 인스타에 매물 릴스를 올리게 하는 것 (특정 딜러 한 명용이 아님).
- 영상 방향·결정·의견은 노션 「보배드림 영상 자동 제작 에이전트 의견」 DB에 남긴다: https://app.notion.com/p/411ee9c4b60680f38b96e5b036473a89 (새 장 제목 앞에 `[에이전트 이름]`과 날짜).
- 저장소 문서: `docs/shortform/dealer-reel-analysis.md`(딜러 릴스 분석) · `docs/shortform/listing-rules.md`(매물 숏폼 등록 규정) · `docs/shortform/type3-pipeline.md`(③ 파이프라인 설계) · `docs/shortform/stock-media-mcp.md`(무료 스톡 영상 MCP — Pexels·Pixabay는 루트 `.mcp.json`, 키는 환경 변수) · `docs/shortform/social-search-tools.md`(인스타·유튜브 검색·수집 도구).
- 원칙: 차 화면은 고치지 않는다(자르기·순서·흐림만). 자막·음성은 매물 사실표에 있는 값만. 개인 휴대폰 번호 금지(050 안심번호). 딜러 확인 전 게시 금지.
