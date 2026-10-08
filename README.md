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
