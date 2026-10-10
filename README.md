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
- 배경: 스튜디오, 그레이 쇼룸, 다크 쇼룸, 순백색, 단색, 내 배경 사진, 투명(PNG)
- 차량 아랫선을 따라 그리는 바닥 그림자와 바닥 반사, 4:3·1:1·16:9·원본 비율, 차량 크기와 바닥 높이 조절
- 지우개·복원 붓으로 남은 배경을 다듬고, 되돌리기와 원본 비교(스페이스 키)를 지원합니다.
- 실내·계기판 사진은 "배경 유지"로 두면 비율과 상사 정보만 맞춥니다.
- 상사명·연락처·로고를 하단 띠나 오른쪽 아래 라벨로 넣을 수 있고, 이 정보는 브라우저에 기억됩니다.
- 파일 이름 앞부분(예: 차량번호)을 정해 JPG/PNG로 한 장씩 또는 ZIP으로 한 번에 저장합니다.

AI 모델은 [onnx-community/ISNet-ONNX](https://huggingface.co/onnx-community/ISNet-ONNX)(AGPL-3.0)를 [Transformers.js](https://github.com/huggingface/transformers.js)로 실행합니다. 첫 실행 때 모델(약 42~84MB)을 내려받고 이후에는 브라우저 캐시를 씁니다. fp16을 지원하는 그래픽카드가 있으면 WebGPU로, 없으면 CPU로 처리합니다.

로컬에서 확인하려면 저장소 루트에서 `python3 -m http.server`를 실행하고 `http://localhost:8000/bg-remover/`를 엽니다. 모듈 워커를 쓰기 때문에 파일을 직접 여는 방식(`file://`)으로는 동작하지 않습니다.

## 딜러 숏폼 메이커 (`shortform/`)

매물 사진 몇 장과 차량 정보로 릴스·쇼츠·틱톡용 중고차 숏폼 영상을 만드는 딜러용 도구입니다. `/shortform/` 경로로 열면 됩니다. [ReelsMotor](https://reelsmotor.com/create)의 "사진 → 상세 정보 → 스타일" 3단계 흐름을 따르되, 서버 없이 브라우저 안에서 영상을 녹화합니다.

- **1단계 사진**: 3~10장, 첫 사진이 첫 장면입니다. 끌어서 또는 ‹ › 버튼으로 순서를 바꾸고, 사진마다 부위 이름(측면·실내·엔진룸 등)을 자막으로 붙입니다. "번호판 가리기"로 네모를 그리면 그 부분을 모자이크합니다.
- **2단계 차량 정보**: 제조사·모델·연식(필수), 세부 등급, 주행거리, 가격(만원), 색상, 연료, 변속기, 차종, 특장점(최대 6개, 자주 쓰는 문구 버튼 제공). 첫 장면에 차량 이름·연식·가격이 크게 나오고, 이후 사진마다 사양과 특장점이 하나씩 강조됩니다.
- **3단계 스타일·만들기**: 강렬하게 / 깔끔하게 / 역동적으로 3가지 스타일, 9:16·1:1·16:9 비율, 전체 보기(흐린 배경)·꽉 채우기, 길이(자동·15초·30초).
- **배경음악**: 저작권 걱정 없도록 브라우저에서 직접 합성합니다. 차종·연료·가격으로 분위기를 자동 추천하고(SUV → 경쾌한, 전기차 → 미래적인, 5천만원 이상 세단 → 고급스러운 등), 장면 전환을 박자에 맞춥니다. 내 음악 파일을 쓰거나 끌 수도 있습니다.
- **상사 정보**: 상사명·연락처·로고·강조 색·마무리 문구가 위쪽과 마지막 화면에 들어가며 브라우저에 기억됩니다. 배경지우개에 입력해 둔 상사 정보가 있으면 처음에 불러옵니다.
- **완성**: 영상(MP4, 지원하지 않는 브라우저에서는 WebM)과 썸네일 JPG를 저장하고, 게시글 문구와 해시태그를 자동으로 만들어 복사할 수 있습니다. 휴대폰에서는 공유 버튼으로 바로 앱에 올릴 수 있고, 같은 내용으로 다른 비율 영상도 만들 수 있습니다.

영상은 `canvas` + `MediaRecorder`로 실시간 녹화하므로 영상 길이만큼 시간이 걸리고, 그동안 탭을 열어 두어야 합니다(다른 탭으로 가면 녹화를 잠시 멈췄다가 돌아오면 이어서 녹화합니다). 인스타그램용 H.264 MP4는 최신 Chrome·Edge·Safari에서 만들어집니다. 로컬에서는 저장소 루트에서 `python3 -m http.server`를 실행하고 `http://localhost:8000/shortform/`을 엽니다.
