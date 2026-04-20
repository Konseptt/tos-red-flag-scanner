const form = document.querySelector("#scan-form");
const urlInput = document.querySelector("#policy-url");
const fileInput = document.querySelector("#policy-file");
const textInput = document.querySelector("#policy-text");
const textLengthEl = document.querySelector("#text-length");
const textRecoEl = document.querySelector("#text-reco");
const statusEl = document.querySelector("#status");
const summaryEl = document.querySelector("#summary");
const readabilityEl = document.querySelector("#readability");
const resultsEl = document.querySelector("#results");
const scanBtn = document.querySelector("#scan-btn");
const cursorGlow = document.querySelector("#cursor-glow");
const sparkCanvas = document.querySelector("#spark-layer");
const sparkCtx = sparkCanvas.getContext("2d");
const template = document.querySelector("#flag-template");
const bgVideo = document.querySelector("#bg-video");
const brandLogo = document.querySelector(".brand-logo");
const MIN_RECOMMENDED_CHARS = 500;
const KONAMI_KEYS = [
  "arrowup",
  "arrowup",
  "arrowdown",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "arrowleft",
  "arrowright",
  "b",
  "a"
];
let konamiIndex = 0;
let logoTapCount = 0;
let logoTapResetTimer = null;

urlInput.addEventListener("input", () => {
  if (urlInput.value.trim() && fileInput.value) {
    fileInput.value = "";
  }
  if (urlInput.value.trim() && textInput.value.trim()) {
    textInput.value = "";
    updateTextCounter();
  }
});

fileInput.addEventListener("change", () => {
  if (fileInput.files?.length && urlInput.value.trim()) {
    urlInput.value = "";
  }
  if (fileInput.files?.length && textInput.value.trim()) {
    textInput.value = "";
    updateTextCounter();
  }
});

textInput.addEventListener("input", () => {
  if (textInput.value.trim() && urlInput.value.trim()) {
    urlInput.value = "";
  }
  if (textInput.value.trim() && fileInput.value) {
    fileInput.value = "";
  }
  updateTextCounter();
});

window.addEventListener("mousemove", (event) => {
  cursorGlow.style.left = `${event.clientX}px`;
  cursorGlow.style.top = `${event.clientY}px`;
});

window.addEventListener("resize", resizeSparkCanvas);
resizeSparkCanvas();
initBackgroundVideo();

updateTextCounter();
enableDragForExistingNotes();
initEasterEggs();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const url = urlInput.value.trim();
  const file = fileInput.files?.[0];
  const policyText = textInput.value.trim();
  const selectedCount = Number(Boolean(url)) + Number(Boolean(file)) + Number(Boolean(policyText));

  if (!selectedCount) {
    setLoading(false, "Add a URL, upload a PDF, or paste ToS text first.");
    return;
  }

  if (selectedCount > 1) {
    setLoading(false, "Choose exactly one input method: URL, PDF, or pasted text.");
    return;
  }

  setLoading(true, "Reading policy and ranking risky clauses...");
  clearResults();
  clearSummary();
  clearReadability();

  try {
    const scanMode = getSelectedScanMode();
    let response;
    if (file) {
      const formData = new FormData();
      formData.append("policyFile", file);
      formData.append("scanMode", scanMode);
      response = await fetch("/api/scan", {
        method: "POST",
        body: formData
      });
    } else {
      const payload = url ? { url, scanMode } : { policyText, scanMode };
      response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || "Scan failed");
    }

    await renderResults(data);
    setLoading(false, `Scan finished: ${data.flags.length} red flags found.`);
  } catch (error) {
    setLoading(false, error.message || "Unexpected error");
  }
});

async function renderResults(report) {
  renderSummary(report);
  renderReadability(report.readability);
  resultsEl.classList.remove("hidden");

  const header = document.createElement("header");
  header.className = "results-head";

  const left = document.createElement("div");
  left.innerHTML = `<strong>Source:</strong> ${escapeHtml(report.sourceUrl)}`;

  const risk = document.createElement("span");
  risk.className = "risk-pill";
  risk.textContent = `Overall Risk: ${report.overallRisk.toUpperCase()}`;

  header.append(left, risk);
  resultsEl.append(header);

  const board = document.createElement("div");
  board.className = "results-board";
  const line = document.createElement("div");
  line.className = "results-spine";
  board.append(line);
  resultsEl.append(board);

  const flags = report.flags || [];
  for (let i = 0; i < flags.length; i += 1) {
    const flag = flags[i];
    statusEl.textContent = `Streaming finding ${i + 1}/${flags.length}...`;

    const card = template.content.firstElementChild.cloneNode(true);
    card.querySelector(".flag-title").textContent = flag.title;
    card.querySelector(".clause-type").textContent = flag.clauseType || "Uncategorized";
    card.querySelector(".plain").textContent = `Plain English: ${flag.plainEnglish}`;
    card.querySelector(".impact").textContent = `Why it matters: ${flag.whyItMatters}`;
    card.querySelector(".quote").textContent = `“${flag.quote || "No direct quote provided."}”`;

    const badge = card.querySelector(".badge");
    badge.textContent = flag.severity;
    badge.classList.add(`severity-${flag.severity}`);

    const tilt = ((i % 3) - 1) * 0.8;
    card.style.transform = `rotate(${tilt}deg)`;
    wireReactionButtons(card);
    enableDrag(card);

    const node = document.createElement("article");
    node.className = `timeline-node ${i % 2 === 0 ? "side-left" : "side-right"}`;

    const pin = document.createElement("button");
    pin.type = "button";
    pin.className = "pin-node";
    pin.setAttribute("aria-label", `Focus finding ${i + 1}`);
    pin.textContent = String(i + 1);
    pin.addEventListener("click", (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      spark(rect.left + rect.width / 2, rect.top + rect.height / 2, 14);
    });

    node.append(pin, card);
    board.append(node);

    const pinRect = pin.getBoundingClientRect();
    spark(pinRect.left + pinRect.width / 2, pinRect.top + pinRect.height / 2, 10);
    await delay(180);
  }
}

function renderSummary(report) {
  summaryEl.classList.remove("hidden");
  const riskLevel = normalizeSeverity(report.overallRisk);
  const levelIndex = severityIndex(riskLevel);

  const severityCounts = report.flags.reduce(
    (acc, flag) => {
      const key = normalizeSeverity(flag.severity);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    { critical: 0, high: 0, medium: 0, low: 0 }
  );

  const strip = document.createElement("div");
  strip.className = "summary-strip";

  const label = document.createElement("div");
  label.className = "summary-label";
  const modeLabel = report.scanMode === "strict" ? "strict" : "broad";
  label.textContent = `Overall risk profile: ${riskLevel.toUpperCase()} (mode: ${modeLabel})`;

  const meter = document.createElement("div");
  meter.className = "meter";
  for (let i = 0; i < 4; i += 1) {
    const segment = document.createElement("span");
    segment.className = "meter-seg";
    if (i <= levelIndex) {
      segment.classList.add("active");
    }
    meter.append(segment);
  }

  strip.append(label, meter);
  summaryEl.append(strip);

  const counts = document.createElement("div");
  counts.className = "counts";
  for (const level of ["critical", "high", "medium", "low"]) {
    const pill = document.createElement("span");
    pill.className = "count-pill";
    pill.textContent = `${level}: ${severityCounts[level]}`;
    counts.append(pill);
  }
  summaryEl.append(counts);
}

function clearResults() {
  resultsEl.classList.add("hidden");
  resultsEl.innerHTML = "";
}

function clearSummary() {
  summaryEl.classList.add("hidden");
  summaryEl.innerHTML = "";
}

function clearReadability() {
  readabilityEl.classList.add("hidden");
  readabilityEl.innerHTML = "";
}

function setLoading(loading, message) {
  scanBtn.disabled = loading;
  scanBtn.textContent = loading ? "Scanning..." : "Scan document";
  statusEl.textContent = message;
}

function normalizeSeverity(value) {
  const normalized = String(value || "").toLowerCase().trim();
  return ["critical", "high", "medium", "low"].includes(normalized)
    ? normalized
    : "medium";
}

function severityIndex(severity) {
  if (severity === "critical") return 3;
  if (severity === "high") return 2;
  if (severity === "medium") return 1;
  return 0;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderReadability(readability) {
  if (!readability) return;

  readabilityEl.classList.remove("hidden");
  const strip = document.createElement("div");
  strip.className = "summary-strip";

  const label = document.createElement("div");
  label.className = "summary-label";
  label.innerHTML = `<strong>Legalese level:</strong> ${escapeHtml(readability.level)} (${readability.score}/100)`;

  const warning = document.createElement("div");
  warning.className = "summary-label";
  warning.textContent = readability.warning || "";

  strip.append(label, warning);
  readabilityEl.append(strip);
}

function updateTextCounter() {
  const length = textInput.value.trim().length;
  textLengthEl.textContent = `${length} characters`;

  if (length >= MIN_RECOMMENDED_CHARS) {
    textRecoEl.textContent = "Good length for a reliable scan";
    textRecoEl.classList.add("ok");
    textRecoEl.classList.remove("warn");
  } else {
    const remaining = MIN_RECOMMENDED_CHARS - length;
    textRecoEl.textContent = `Recommended: ${remaining} more characters`;
    textRecoEl.classList.add("warn");
    textRecoEl.classList.remove("ok");
  }
}

function initBackgroundVideo() {
  if (!bgVideo) {
    return;
  }

  const attemptPlay = () => {
    const playPromise = bgVideo.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  };

  bgVideo.muted = true;
  bgVideo.defaultMuted = true;
  bgVideo.volume = 0;

  if (bgVideo.readyState >= 2) {
    attemptPlay();
  } else {
    bgVideo.addEventListener("canplay", attemptPlay, { once: true });
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      attemptPlay();
    }
  });
}

function initEasterEggs() {
  setupKonamiEgg();
  setupLogoEgg();
  setupPhraseEgg();
  setupShortcutEgg();
}

function setupKonamiEgg() {
  window.addEventListener("keydown", (event) => {
    const pressed = String(event.key || "").toLowerCase();
    if (pressed === KONAMI_KEYS[konamiIndex]) {
      konamiIndex += 1;
      if (konamiIndex === KONAMI_KEYS.length) {
        document.body.classList.toggle("egg-night-vision");
        showEggToast(
          document.body.classList.contains("egg-night-vision")
            ? "Night Vision mode unlocked."
            : "Night Vision mode off."
        );
        spark(window.innerWidth / 2, window.innerHeight * 0.32, 22);
        konamiIndex = 0;
      }
      return;
    }

    konamiIndex = pressed === KONAMI_KEYS[0] ? 1 : 0;
  });
}

function setupLogoEgg() {
  if (!brandLogo) return;

  brandLogo.addEventListener("click", (event) => {
    logoTapCount += 1;
    clearTimeout(logoTapResetTimer);
    logoTapResetTimer = setTimeout(() => {
      logoTapCount = 0;
    }, 1200);

    if (logoTapCount < 5) {
      return;
    }

    logoTapCount = 0;
    document.body.classList.toggle("egg-party");
    const rect = event.currentTarget.getBoundingClientRect();
    spark(rect.left + rect.width / 2, rect.top + rect.height / 2, 30);
    showEggToast(
      document.body.classList.contains("egg-party")
        ? "Prism Pulse mode activated."
        : "Prism Pulse mode off."
    );
  });
}

function setupPhraseEgg() {
  const triggers = [
    { phrase: "i accept everything", message: "Skeptic mode suggested. Switched to strict." },
    { phrase: "no red flags", message: "Bold claim detected. Double-check every clause." }
  ];

  textInput.addEventListener("input", () => {
    const value = textInput.value.toLowerCase();
    for (const trigger of triggers) {
      if (!value.includes(trigger.phrase)) continue;
      if (textInput.dataset.lastEgg === trigger.phrase) continue;
      textInput.dataset.lastEgg = trigger.phrase;

      const strictRadio = document.querySelector('input[name="scanMode"][value="strict"]');
      if (strictRadio) {
        strictRadio.checked = true;
      }

      showEggToast(trigger.message);
      const rect = textInput.getBoundingClientRect();
      spark(rect.left + rect.width * 0.7, rect.top + 16, 18);
      return;
    }
  });
}

function setupShortcutEgg() {
  window.addEventListener("keydown", (event) => {
    const isPaletteShortcut =
      (event.metaKey || event.ctrlKey) &&
      event.shiftKey &&
      String(event.key || "").toLowerCase() === "l";
    if (!isPaletteShortcut) return;
    event.preventDefault();
    document.body.classList.toggle("egg-laser-lines");
    showEggToast(
      document.body.classList.contains("egg-laser-lines")
        ? "Laser Lines enabled."
        : "Laser Lines disabled."
    );
  });
}

function showEggToast(message) {
  const toast = document.createElement("div");
  toast.className = "egg-toast";
  toast.textContent = message;
  document.body.append(toast);
  requestAnimationFrame(() => {
    toast.classList.add("is-on");
  });
  setTimeout(() => {
    toast.classList.remove("is-on");
    setTimeout(() => toast.remove(), 320);
  }, 1800);
}

function getSelectedScanMode() {
  const checked = document.querySelector('input[name="scanMode"]:checked');
  return checked?.value === "strict" ? "strict" : "broad";
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function wireReactionButtons(card) {
  const buttons = card.querySelectorAll(".react-btn");
  buttons.forEach((button) => {
    button.addEventListener("click", (event) => {
      buttons.forEach((item) => item.classList.remove("is-on"));
      button.classList.add("is-on");
      const rect = event.currentTarget.getBoundingClientRect();
      spark(rect.left + rect.width / 2, rect.top + rect.height / 2, 10);
    });
  });
}

function enableDragForExistingNotes() {
  const notes = document.querySelectorAll(".note");
  notes.forEach((note) => enableDrag(note));
}

function enableDrag(element) {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let offsetX = Number(element.dataset.dx || 0);
  let offsetY = Number(element.dataset.dy || 0);

  element.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".react-btn")) {
      return;
    }
    dragging = true;
    element.classList.add("dragging");
    startX = event.clientX - offsetX;
    startY = event.clientY - offsetY;
    element.setPointerCapture(event.pointerId);
  });

  element.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    offsetX = event.clientX - startX;
    offsetY = event.clientY - startY;
    element.dataset.dx = String(offsetX);
    element.dataset.dy = String(offsetY);
    applyDragTransform(element, offsetX, offsetY);
  });

  const release = () => {
    dragging = false;
    element.classList.remove("dragging");
  };

  element.addEventListener("pointerup", release);
  element.addEventListener("pointercancel", release);
}

function applyDragTransform(element, x, y) {
  const hasRotate = /rotate\([^)]*\)/.test(element.style.transform);
  if (hasRotate) {
    element.style.transform = element.style.transform.replace(
      /translate\([^)]*\)/,
      ""
    );
    element.style.transform += ` translate(${x}px, ${y}px)`;
    return;
  }

  const rotate = element.classList.contains("note")
    ? element.style.transform || ""
    : "";
  element.style.transform = `${rotate} translate(${x}px, ${y}px)`.trim();
}

function resizeSparkCanvas() {
  sparkCanvas.width = window.innerWidth;
  sparkCanvas.height = window.innerHeight;
}

function spark(x, y, count = 16) {
  const particles = Array.from({ length: count }, () => ({
    x,
    y,
    vx: (Math.random() - 0.5) * 4,
    vy: (Math.random() - 0.5) * 4 - 1.8,
    life: 22 + Math.random() * 14,
    size: 1.8 + Math.random() * 2.4
  }));

  animateParticles(particles);
}

function animateParticles(particles) {
  function tick() {
    sparkCtx.clearRect(0, 0, sparkCanvas.width, sparkCanvas.height);
    let alive = 0;

    for (const p of particles) {
      if (p.life <= 0) continue;
      alive += 1;
      p.life -= 1;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.07;

      sparkCtx.beginPath();
      sparkCtx.fillStyle = `rgba(255, 255, 255, ${Math.max(p.life / 34, 0)})`;
      sparkCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      sparkCtx.fill();
    }

    if (alive > 0) {
      requestAnimationFrame(tick);
    } else {
      sparkCtx.clearRect(0, 0, sparkCanvas.width, sparkCanvas.height);
    }
  }

  requestAnimationFrame(tick);
}
