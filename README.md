# Auto.ru Inspired Korean Vehicle History Report

Auto.ru vehicle history sample report structure adapted into a Korean used-car history report demo.

## What is included

- Koreanized report terminology for 자동차등록원부, 신규등록, 이전등록, 소유자 변경, 보험 이력, 성능·상태점검, 정기검사, 압류·저당.
- Interactive vehicle lookup sample, timeline filters, expandable timeline details, mileage list/chart switch, accordion FAQ, VIN copy, and photo dialog.
- User-provided Auto.ru SVG icon assets under `assets/icons/`.
- Static GitHub Pages deployment through GitHub Actions.

## Source reference

- Auto.ru history page: https://auto.ru/history/
- Captured reference notes are local only and not published.

This is a public UI demo. It does not perform real vehicle-history lookup.

## 매물사진 배경지우개 (`bg-remover/`)

중고차 딜러용 매물 사진 배경 제거 도구입니다. `/bg-remover/` 경로로 열면 됩니다.

- 여러 장을 끌어다 놓으면 차례대로 AI가 배경을 지웁니다. 사진은 서버로 보내지 않고 브라우저 안에서만 처리합니다.
- 배경: 상사 쇼룸(화이트·블랙), 스튜디오, 그레이 쇼룸, 다크 쇼룸, 순백색, 단색, 내 배경 사진, 투명(PNG)
- 상사 쇼룸: 슬랫 벽에 상사명·로고·문구를 입체 간판으로 넣은 가상 스튜디오. 간판 자리를 고정해 모든 사진에서 같은 크기로 보입니다.
- 차량 아랫선을 따라 그리는 바닥 그림자와 바닥 반사, 4:3·1:1·16:9·원본 비율, 차량 크기와 바닥 높이 조절
- 지우개·복원 붓으로 남은 배경을 다듬고, 되돌리기와 원본 비교(스페이스 키)를 지원합니다.
- 실내·계기판 사진은 "배경 유지"로 두면 비율과 상사 정보만 맞춥니다.
- 상사명·연락처·로고를 하단 띠나 오른쪽 아래 라벨로 넣을 수 있고, 이 정보는 브라우저에 기억됩니다.
- 파일 이름 앞부분(예: 차량번호)을 정해 JPG/PNG로 한 장씩 또는 ZIP으로 한 번에 저장합니다.

AI 모델은 [onnx-community/ISNet-ONNX](https://huggingface.co/onnx-community/ISNet-ONNX)(AGPL-3.0)를 [Transformers.js](https://github.com/huggingface/transformers.js)로 실행합니다. 첫 실행 때 모델(약 42~84MB)을 내려받고 이후에는 브라우저 캐시를 씁니다. fp16을 지원하는 그래픽카드가 있으면 WebGPU로, 없으면 CPU로 처리합니다.

로컬에서 확인하려면 저장소 루트에서 `python3 -m http.server`를 실행하고 `http://localhost:8000/bg-remover/`를 엽니다. 모듈 워커를 쓰기 때문에 파일을 직접 여는 방식(`file://`)으로는 동작하지 않습니다.

## 매물 숏폼 스튜디오 (`shortform/`)

중고차 딜러가 매물 사진으로 릴스·쇼츠·틱톡용 숏폼 영상을 만드는 도구입니다. `/shortform/` 경로로 엽니다.

- 대시보드: 등록 차량·영상 완료·영상 대기 현황과 차량 카드 목록
- 차량 등록: 차량번호(관리번호), 제조사·모델·등급, 연식, 주행거리, 연료, 변속기, 사고 이력, 가격, 강조 포인트, 사진 업로드·순서 변경·대표 사진 지정
- 영상 만들기: 세로 9:16 / 정사각 1:1 / 가로 16:9, 템플릿 3종(클린·다이나믹·럭셔리), 15·30초, 가격 표시, 마지막 장면 문구, 실시간 미리보기
- 배경음악은 템플릿마다 Web Audio로 직접 합성해 저작권 걱정이 없습니다.
- 영상은 브라우저에서 녹화해 저장합니다. H.264를 지원하는 크롬·엣지에서는 MP4, 그렇지 않으면 WebM으로 저장됩니다.
- 게시 문구(차량 정보·강조 포인트·연락처·해시태그)를 자동으로 만들어 복사할 수 있습니다.
- 상사 설정(상사명·연락처·지역·브랜드 색·로고·기본 문구·해시태그)은 모든 영상에 적용됩니다.
- 차량과 사진은 서버가 아니라 이 브라우저(IndexedDB)에만 저장됩니다.
