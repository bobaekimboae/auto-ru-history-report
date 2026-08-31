const icons = {
  ok: "assets/icons/svgexport-31.svg",
  warning: "assets/icons/svgexport-32.svg",
  info: "assets/icons/svgexport-35.svg",
  shield: "assets/icons/svgexport-48.svg",
  accident: "assets/icons/svgexport-36.svg",
  lightAccident: "assets/icons/svgexport-60.svg",
  auction: "assets/icons/svgexport-40.svg",
  service: "assets/icons/svgexport-54.svg",
  camera: "assets/icons/svgexport-44.svg",
  warranty: "assets/icons/svgexport-51.svg"
};

const timelineEvents = [
  {
    date: "2020.04.15",
    title: "제조사 출고 완료",
    badge: "출고 정보",
    type: "register",
    icon: "warranty",
    body: "현대자동차 울산공장 출고, 신차 인도 준비 완료.",
    detail: "한국 구매 흐름에 맞춰 원본 보고서의 '차량 생산/제원' 정보를 출고 이벤트로 분리했습니다."
  },
  {
    date: "2020.04.29",
    title: "신규 등록",
    badge: "자동차등록원부",
    type: "register",
    icon: "shield",
    body: "서울 12가 3456으로 최초 등록. 용도는 자가용 승용.",
    detail: "최초 등록일, 차량번호, 차명, 배기량, 소유 구분을 자동차등록원부 기준으로 표시합니다."
  },
  {
    date: "2021.04.30",
    title: "정기검사 통과",
    badge: "정비·검사",
    type: "service",
    icon: "ok",
    body: "주행거리 24,108 km, 주요 항목 적합.",
    detail: "검사소 기록과 보험/정비 데이터가 서로 크게 어긋나지 않는지 확인하는 구간입니다."
  },
  {
    date: "2021.08.03",
    title: "이전 등록",
    badge: "소유자 변경",
    type: "register",
    icon: "info",
    body: "개인 소유자에서 개인 소유자로 이전등록 완료.",
    detail: "국내 매매에서는 이전등록 지연, 명의 불일치, 상품용 전환 여부가 핵심 확인 대상입니다."
  },
  {
    date: "2022.03.09",
    title: "정비 입고",
    badge: "오일·브레이크",
    type: "service",
    icon: "service",
    body: "엔진오일, 에어컨 필터, 브레이크 패드 점검. 주행거리 38,220 km.",
    detail: "정비 항목이 반복적으로 빠져 있으면 실차 점검에서 소모품 교환 주기를 확인해야 합니다."
  },
  {
    date: "2022.11.14",
    title: "보험 수리 기록",
    badge: "사고·보험",
    type: "risk",
    icon: "lightAccident",
    body: "후방 추돌로 뒤 범퍼 교환, 트렁크 리드 판금. 지급 보험금 1,860,000원.",
    detail: "외판 교환 수준의 경미 사고이나 후방 센서와 패널 간격 확인을 권장합니다."
  },
  {
    date: "2023.05.12",
    title: "과거 매물 등록",
    badge: "매물 이력",
    type: "market",
    icon: "camera",
    body: "온라인 매물 등록. 표기 주행거리 36,900 km로 전후 기록과 차이가 있습니다.",
    detail: "Auto.ru 원본의 과거 판매 이력을 국내 매물 등록 이력으로 재구성했습니다."
  },
  {
    date: "2023.06.01",
    title: "소유자 변경",
    badge: "상사 매입",
    type: "register",
    icon: "info",
    body: "상품용 차량으로 일시 이전. 번호판 변경 없음.",
    detail: "상품용 이전은 중고차 상사 매입 과정에서 흔히 발생하므로 기간과 주행거리 변화가 중요합니다."
  },
  {
    date: "2023.06.08",
    title: "번호판 변경 없음 확인",
    badge: "등록 정보",
    type: "register",
    icon: "shield",
    body: "소유 변경 후에도 동일 차량번호 유지.",
    detail: "번호 변경이 잦은 차량은 렌트, 법인, 지역 이전 이력을 함께 확인합니다."
  },
  {
    date: "2024.02.20",
    title: "리콜 조치 완료",
    badge: "제조사",
    type: "service",
    icon: "warranty",
    body: "에어백 인플레이터 리콜 캠페인 조치 완료.",
    detail: "원본 보고서의 제조사 인증/리콜 정보를 국내 리콜 조치 상태로 표현했습니다."
  },
  {
    date: "2024.06.12",
    title: "저당 말소",
    badge: "법적 상태",
    type: "risk",
    icon: "shield",
    body: "할부 저당 설정 후 정상 말소. 현재 이전등록 제한 없음.",
    detail: "계약 전 자동차등록원부 갑부·을부를 재발급해 현재 상태를 다시 확인하는 것이 안전합니다."
  },
  {
    date: "2024.09.02",
    title: "정비 입고",
    badge: "하체 점검",
    type: "service",
    icon: "service",
    body: "타이어 위치 교환, 냉각수 점검, 주행거리 65,780 km.",
    detail: "하체와 타이어 마모는 실제 시운전에서 소음, 쏠림, 떨림 여부를 같이 확인합니다."
  },
  {
    date: "2025.07.05",
    title: "성능·상태점검",
    badge: "국내 점검",
    type: "service",
    icon: "ok",
    body: "주요 골격 이상 없음, 외판 교환 1개소 표시.",
    detail: "보험 이력과 성능점검표의 판금·교환 부위가 일치하는지 확인하도록 구성했습니다."
  },
  {
    date: "2026.08.31",
    title: "현재 판매 등록",
    badge: "공개 매물",
    type: "market",
    icon: "auction",
    body: "현재 주행거리 82,430 km, 희망가 1,680만원.",
    detail: "가격 변동, 과거 판매 사진, 점검 결과를 함께 보며 협상 근거를 만들 수 있습니다."
  }
];

const timelineList = document.querySelector("#timelineList");
const timelineCount = document.querySelector("#timelineCount");

function renderTimeline(filter = "all") {
  const filtered = filter === "all" ? timelineEvents : timelineEvents.filter((item) => item.type === filter);
  timelineList.innerHTML = filtered
    .map(
      (item, index) => `
        <li class="timeline-item">
          <div class="timeline-icon"><span><img src="${icons[item.icon]}" alt="" /></span></div>
          <time class="timeline-date">${item.date}</time>
          <div class="timeline-body">
            <h3>${item.title}<span class="timeline-badge">${item.badge}</span></h3>
            <p>${item.body}</p>
            <div class="timeline-detail" id="timeline-detail-${index}">${item.detail}</div>
            <button class="timeline-more" type="button" data-toggle-event aria-expanded="false" aria-controls="timeline-detail-${index}">상세 보기</button>
          </div>
        </li>
      `
    )
    .join("");
  timelineCount.textContent = filtered.length;
}

renderTimeline();

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-filter]").forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
    renderTimeline(button.dataset.filter);
  });
});

timelineList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-toggle-event]");
  if (!button) return;
  const detail = document.getElementById(button.getAttribute("aria-controls"));
  const isOpen = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", String(!isOpen));
  button.textContent = isOpen ? "상세 보기" : "접기";
  detail.classList.toggle("is-open", !isOpen);
});

document.querySelectorAll("[data-scroll-target]").forEach((button) => {
  button.addEventListener("click", () => {
    const target = document.querySelector(button.dataset.scrollTarget);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

document.querySelectorAll(".lookup-tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".lookup-tab").forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
    const input = document.querySelector("#lookupInput");
    const mode = button.dataset.lookupMode;
    input.placeholder = mode === "plate" ? "12가 3456" : mode === "vin" ? "KMHEM42BPXA000000" : "차대번호 17자리";
    input.focus();
  });
});

document.querySelector("[data-fill-sample]").addEventListener("click", () => {
  const input = document.querySelector("#lookupInput");
  input.value = "12가 3456";
  document.querySelector("#formMessage").textContent = "샘플 번호가 입력되었습니다. 조회 버튼을 눌러 보고서를 확인하세요.";
});

document.querySelector("#lookupForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector("#lookupInput");
  const message = document.querySelector("#formMessage");
  const value = input.value.trim();
  if (!value) {
    message.textContent = "차량번호 또는 VIN을 입력하거나 샘플 번호를 사용하세요.";
    input.focus();
    return;
  }
  message.textContent = `${value} 기준 샘플 리포트를 불러왔습니다.`;
  document.querySelector("#report").scrollIntoView({ behavior: "smooth", block: "start" });
});

document.querySelector("[data-toggle-summary]").addEventListener("click", (event) => {
  const button = event.currentTarget;
  const summary = document.querySelector("#summaryMore");
  const isOpen = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", String(!isOpen));
  button.querySelector("span").textContent = isOpen ? "요약 더보기" : "요약 접기";
  summary.classList.toggle("is-open", !isOpen);
});

document.querySelector("[data-copy-vin]").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const original = button.textContent.trim();
  try {
    await navigator.clipboard.writeText("KMHEM42BPXA000000");
    button.textContent = "VIN 복사 완료";
  } catch {
    button.textContent = "VIN: KMHEM42BPXA000000";
  }
  window.setTimeout(() => {
    button.innerHTML = `<img src="assets/icons/svgexport-34.svg" alt="" /> ${original}`;
  }, 1500);
});

document.querySelectorAll("[data-mileage-view]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-mileage-view]").forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
    document.querySelectorAll("[data-mileage-panel]").forEach((panel) => {
      panel.classList.toggle("is-hidden", panel.dataset.mileagePanel !== button.dataset.mileageView);
    });
  });
});

document.querySelectorAll(".accordion-trigger").forEach((button) => {
  button.addEventListener("click", () => {
    const panel = button.nextElementSibling;
    const isOpen = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!isOpen));
    panel.hidden = isOpen;
  });
});

const galleryDialog = document.querySelector("#galleryDialog");

document.querySelectorAll("[data-open-gallery]").forEach((button) => {
  button.addEventListener("click", () => {
    if (typeof galleryDialog.showModal === "function") {
      galleryDialog.showModal();
    }
  });
});

document.querySelector("[data-close-gallery]").addEventListener("click", () => galleryDialog.close());

galleryDialog.addEventListener("click", (event) => {
  if (event.target === galleryDialog) {
    galleryDialog.close();
  }
});
