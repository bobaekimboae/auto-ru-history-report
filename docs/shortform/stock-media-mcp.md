# 무료 영상 스톡 MCP 연결 현황

작성: 서울오토갤러리 자동 영상 제작 코덱스 마스터 · 2026-11-15
용도: ③ 에이전트 편집 영상의 보조 화면(B-roll)·배경 소스. **매물 차량 화면은 실제 촬영본만 쓴다**(`listing-rules.md` 1번: 차 화면은 고치지 않는다). 스톡은 도로·도시·하늘 같은 분위기 컷, 끝 화면 배경에만 쓴다.

## 1. 결론

| 사이트 | MCP | 영상 | 연결 상태 | 해야 할 일 |
| --- | --- | --- | --- | --- |
| Pexels | `mcp-pexels@1.0.2` (npm, MIT, 로컬 실행형) | 예 — 세로 영상 검색 가능 | 저장소 `.mcp.json`에 등록 | 무료 API 키 발급 → `PEXELS_API_KEY` 설정 |
| Pixabay | `pixabay-mcp@0.3.0` (npm, MIT, 로컬 실행형) | 예 — 길이 필터 가능 | 저장소 `.mcp.json`에 등록 | 무료 API 키 발급 → `PIXABAY_API_KEY` 설정 |
| Unsplash | claude.ai 공식 커넥터 | **아니오 (사진만)** | 설치됨, 로그인 미완료 | claude.ai 커넥터 설정에서 연결 마무리 |
| Coverr · Mixkit · Videvo | 공식·검증된 MCP 없음 | — | 연결 불가 | 필요하면 API 래퍼를 따로 만들어야 함 |

claude.ai 커넥터 목록에는 Pexels·Pixabay가 없다(2026-11-15 검색). 그래서 두 곳은 로컬에서 실행하는 MCP로 연결했다. 로컬 실행형이라 claude.ai 웹 채팅에서는 쓸 수 없고, **Claude Code · Claude 데스크톱 · 코덱스**에서 쓴다.

## 2. 이미 연결돼 있고 스톡 검색이 되는 도구 (추가 설정 없음)

| 도구 | 기능 | 비고 |
| --- | --- | --- |
| Orshot | `orshot_search_stock_media` | **Pixabay 영상·사진 + Unsplash 사진을 키 없이 검색.** 2026-11-15 "highway driving night" 영상 검색 시험 통과(결과 500건, 1920×1080, 10~30초, 작가 출처 포함). 세로 결과는 없어서 가로로 대체됨 → 세로 컷은 9:16으로 잘라 쓴다 |
| AI Producer by OpusClip | `find_broll` | 프로젝트 안에서 B-roll 찾기 (프로젝트가 있어야 함, 미시험) |
| vidIQ | `vidiq_find_broll` | B-roll 찾기. **2026-11-15 크레딧 부족으로 실패** — 충전 전까지 사용 불가 |

따라서 **Pixabay 영상은 지금 Orshot으로 바로 쓸 수 있다.** 별도 키가 필요한 건 Pexels뿐이다.

## 3. API 키 발급 (무료)

- Pexels: https://www.pexels.com/api/ — 무료, 시간당 200회 · 월 2만 회
- Pixabay: https://pixabay.com/api/docs/ — 가입 후 문서 페이지에 키 표시

키는 저장소에 커밋하지 않는다. 각 PC의 환경 변수나 클라이언트 설정에만 넣는다.

## 4. 클라이언트별 설정

### Claude Code (이 저장소)

저장소 루트 `.mcp.json`이 이미 있다. 터미널 환경 변수만 설정하면 된다. 처음 실행할 때 프로젝트 MCP 사용 승인을 묻는다.

```bash
export PEXELS_API_KEY="발급받은 키"
export PIXABAY_API_KEY="발급받은 키"
```

### Claude 데스크톱 (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "pexels": { "command": "npx", "args": ["-y", "mcp-pexels@1.0.2"], "env": { "PEXELS_API_KEY": "발급받은 키" } },
    "pixabay": { "command": "npx", "args": ["-y", "pixabay-mcp@0.3.0"], "env": { "PIXABAY_API_KEY": "발급받은 키" } }
  }
}
```

### 코덱스 (`~/.codex/config.toml`)

```toml
[mcp_servers.pexels]
command = "npx"
args = ["-y", "mcp-pexels@1.0.2"]
env = { PEXELS_API_KEY = "발급받은 키" }

[mcp_servers.pixabay]
command = "npx"
args = ["-y", "pixabay-mcp@0.3.0"]
env = { PIXABAY_API_KEY = "발급받은 키" }
```

## 5. 도구 이름 (README 기준)

- Pexels: `pexels_search_videos`(검색어·방향·크기), `pexels_popular_videos`(길이·해상도 조건), `pexels_get_video`, 사진·컬렉션 도구 6개
- Pixabay: `search_pixabay_videos`(검색어·방향·길이), `search_pixabay_images`

## 6. 사용 규칙

1. 매물 차량 대신 스톡 차량 영상을 쓰지 않는다. 다른 차가 우리 매물처럼 보이면 허위 표시가 된다.
2. 다른 브랜드 로고·번호판이 보이는 스톡 컷은 쓰지 않는다.
3. 사람 얼굴이 나오는 컷은 딜러 광고에 넣지 않는다(초상권·추천처럼 보이는 문제).
4. Pexels·Pixabay 라이선스는 상업 이용 가능, 출처 표기 불필요다. 단, 원본을 그대로 재판매하거나 사람이 제품을 보증하는 것처럼 쓰는 건 금지다. 제작 기록에 사용한 스톡의 출처 URL을 남긴다.

## 7. 검증 상태

- npm 패키지 존재·버전 확인: 완료 (`mcp-pexels` 1.0.2, `pixabay-mcp` 0.3.0)
- API 서버 접속 확인: 완료 (api.pexels.com, pixabay.com 응답)
- 실제 검색 시험: **미실시**. 키가 없고, 이 클라우드 세션에서는 외부 패키지 실행이 승인되지 않았다. 키를 넣은 PC에서 "세로 도로 주행 영상 검색"으로 첫 시험을 한다.
