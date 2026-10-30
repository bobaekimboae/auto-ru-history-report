# 에이전트 안내

## 보배드림 기술 스택 (2026-10-30, 모든 에이전트 필수)

- 보배드림의 모든 저장소·키트·솔루션은 보배드림 리뉴얼 기술 스택으로 만든다. 원본은 노션 「리뉴얼 기술 스택」(https://app.notion.com/p/408ee9c4b60680c3be52caefde283895), 같은 내용이 `bobaekimboae/bobaedream` 저장소의 `docs/tech-stack.md`에 있다.
- 사용자 화면: Nuxt 4.6 · Vue 3.5 · TypeScript 6 · 일반 CSS와 CSS 변수 · `useState`/composable · Tiptap 3.
- 관리자 화면: Nuxt 4.5 · Vue 3.5 · Vuetify 3 · Pinia · SCSS · TypeScript 5.9 · Tiptap 2.
- 백엔드: Laravel 12 · PHP 8.4 (PHP-FPM) · PostgreSQL 15 · Redis 7 · Meilisearch. 패키지는 pnpm 10 · Composer. 런타임 Node.js 24.
- **새 화면·새 기능은 React로 만들지 않는다. Nuxt로 만든다.** 백엔드·API가 필요하면 Laravel 규칙(REST · JSON)으로 설계하고, Node 서버나 다른 언어로 새 백엔드를 만들지 않는다.
- 이 저장소의 기존 화면(`studio/`, `bg-remover/`, `shortform/` 등)은 라이브러리 없는 HTML·JavaScript 시안이다. 새로 만드는 기능은 Nuxt로 만들고, 기존 시안을 Nuxt로 옮기는 일정은 사용자가 정한다.
