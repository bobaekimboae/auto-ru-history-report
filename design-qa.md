# Design QA

final result: passed

## Source capture
- Auto.ru history page was opened after the regional consent screen.
- Captured landing/report structure: VIN/plate lookup, report benefits, report packages, report contents, example report, FAQ.
- Example report content observed after clicking `Пример отчёта`: vehicle identity, AI-style conclusion, report table of contents, PTS data, accident records, insurance cases, damaged-car auction, mileage history, owners, inspections, legal checks, ads, commercial use, fines, customs, service visits, recalls, policies, VIN options, certification, owner reviews, operation timeline, warranty programs, valuation, characteristics.

## Korean localization check
- Russian terms were localized into Korean purchase context: PTS -> 자동차등록원부, ГИБДД restrictions -> 압류·저당·도난·운행정지, ОСАГО/КАСКО -> 보험 이력, техосмотр -> 정기검사, сервис -> 정비 입고, регистрация -> 신규등록/이전등록/소유자 변경.
- Timeline includes the previously missing domestic events: 출고 정보, 신규 등록, 이전 등록, 소유자 변경, 번호판 변경 없음, 저당 말소.

## Visual and interaction QA
- Desktop render checked in the in-app browser at `http://localhost:8017/`.
- Headless Edge screenshots captured at desktop and 390px mobile widths.
- No sticky or fixed text elements are used, so section labels such as 핵심점검-style text cannot follow during scroll.
- Broken image check: passed. All 48 rendered images loaded.
- Console warnings/errors: none.
- Interactions checked: lookup submit, sample fill, timeline filter, timeline detail expand/collapse, mileage list/chart switch, gallery dialog, FAQ accordion.

## Assets
- User-provided Auto.ru SVG icons copied to `assets/icons/` and used across status, accident, legal, mileage, inspection, option, photo, and accordion controls.
- Vehicle frame image reused as a local visual asset, not hotlinked.

## Residual notes
- The public page is a static UI demo and does not perform real vehicle-history lookup.
