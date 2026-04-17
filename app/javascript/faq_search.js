import Fuse from "fuse.js";

const segmenter = new Intl.Segmenter("ja", { granularity: "word" });
const HIRAGANA = /^[\u3041-\u3096]+$/;

function tokenize(text) {
  return [...segmenter.segment(text)]
    .filter((s) => s.isWordLike && !(HIRAGANA.test(s.segment) && s.segment.length <= 2))
    .map((s) => s.segment)
    .join(" ");
}

function tokenizeForDisplay(text) {
  return [...segmenter.segment(text)]
    .filter((s) => s.isWordLike)
    .map((s) => s.segment);
}

let fuseRaw, fuseTok, augmentedData;

function buildFuses(data, opts) {
  augmentedData = data;

  fuseRaw = new Fuse(augmentedData, {
    ...opts,
    keys: [
      { name: "keywords", weight: 3 },
      { name: "question", weight: 2 },
      { name: "category", weight: 1 },
      { name: "answer", weight: 1 },
    ],
  });

  const indexed = augmentedData.map((item) => ({
    ...item,
    _k: item.keywords,
    _q: tokenize(item.question),
    _a: tokenize(item.answer),
    _c: tokenize(item.category),
  }));
  fuseTok = new Fuse(indexed, {
    ...opts,
    keys: [
      { name: "_k", weight: 3 },
      { name: "_q", weight: 2 },
      { name: "_c", weight: 1 },
      { name: "_a", weight: 1 },
    ],
  });
}

const MODES = [
  { label: "① トークン化なし", search: (q) => fuseRaw.search(q) },
  { label: "② 検索文のみトークン化", search: (q) => fuseRaw.search(tokenize(q)) },
  { label: "③ 両方トークン化", search: (q) => fuseTok.search(tokenize(q)) },
];

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Fuse.js の indices（[start, end][]）を使ってテキストをハイライト
function applyHighlight(text, indices) {
  if (!indices || !indices.length) return escapeHtml(text);
  const sorted = [...indices].sort((a, b) => a[0] - b[0]);
  let result = "";
  let cursor = 0;
  for (const [start, end] of sorted) {
    if (start > cursor) result += escapeHtml(text.slice(cursor, start));
    result += `<mark class="fuse-hl">${escapeHtml(text.slice(start, end + 1))}</mark>`;
    cursor = end + 1;
  }
  result += escapeHtml(text.slice(cursor));
  return result;
}

// matches は Fuse.js の hit.matches（includeMatches: true 時のみ存在）
// モード①②は question/answer/category キーでハイライト
// モード③は _q/_a/_c キーでハイライト（item に既に付与済み）
// トークン化フィールドはデモ用に常に表示し、存在しない場合はその場で生成
function renderCard(item, matches) {
  const byKey = {};
  if (matches) {
    for (const m of matches) {
      if (!byKey[m.key]) byKey[m.key] = m.indices;
    }
  }
  const hl = (key, text) => applyHighlight(text, byKey[key]);

  const tk = item._k ?? item.keywords ?? "";
  const tq = item._q ?? tokenize(item.question);
  const ta = item._a ?? tokenize(item.answer);
  const tc = item._c ?? tokenize(item.category);
  const hlK = (text) => applyHighlight(text, byKey["keywords"] ?? byKey["_k"]);

  return `<div class="faq-card">
    <span class="category-tag">${hl("category", item.category)}</span>
    <div class="question">Q. ${hl("question", item.question)}</div>
    <div class="answer">${hl("answer", item.answer)}</div>
    <div class="token-fields">
      <div class="token-field"><span class="token-field-key">keywords:</span> ${hlK(tk)}</div>
      <div class="token-field"><span class="token-field-key">_c:</span> ${hl("_c", tc)}</div>
      <div class="token-field"><span class="token-field-key">_q:</span> ${hl("_q", tq)}</div>
      <div class="token-field"><span class="token-field-key">_a:</span> ${hl("_a", ta)}</div>
    </div>
  </div>`;
}

document.addEventListener("DOMContentLoaded", () => {
  const rawData = JSON.parse(document.getElementById("faq-data").textContent);

  let currentOpts = {
    threshold: 0.5,
    distance: 1000,
    location: 0,
    minMatchCharLength: 2,
    ignoreLocation: true,
    isCaseSensitive: false,
    includeScore: true,
    includeMatches: true,
    findAllMatches: false,
    useTokenSearch: false,
    useExtendedSearch: false,
  };

  buildFuses(rawData, currentOpts);

  const faqContainer = document.querySelector(".faq-container");

  const o = currentOpts;
  const optsPanel = document.createElement("details");
  optsPanel.className = "fuse-opts-panel";
  optsPanel.innerHTML = `
    <summary>Fuse.js オプション設定</summary>
    <div class="fuse-opts-body">
      <div class="opts-section">
        <div class="opts-section-title">数値オプション</div>
        <div class="fuse-opt-row">
          <label>threshold <span class="opt-desc">（0.0=完全一致のみ、1.0=なんでもヒット）</span></label>
          <div class="fuse-opt-control">
            <input type="range" id="opt-threshold" min="0" max="1" step="0.05" value="${o.threshold}">
            <span id="opt-threshold-val" class="opt-val">${o.threshold.toFixed(2)}</span>
          </div>
        </div>
        <div class="fuse-opt-row">
          <label>distance <span class="opt-desc">（location からの有効検索距離）</span></label>
          <div class="fuse-opt-control">
            <input type="number" id="opt-distance" min="0" max="100000" step="100" value="${o.distance}" ${o.ignoreLocation ? "disabled" : ""}>
          </div>
        </div>
        <div class="fuse-opt-row">
          <label>location <span class="opt-desc">（マッチを期待するテキスト内の位置）</span></label>
          <div class="fuse-opt-control">
            <input type="number" id="opt-location" min="0" max="10000" step="1" value="${o.location}" ${o.ignoreLocation ? "disabled" : ""}>
          </div>
        </div>
        <div class="fuse-opt-row">
          <label>minMatchCharLength <span class="opt-desc">（マッチに必要な最小文字数）</span></label>
          <div class="fuse-opt-control">
            <input type="number" id="opt-minmatch" min="1" max="20" step="1" value="${o.minMatchCharLength}">
          </div>
        </div>
      </div>
      <div class="opts-section">
        <div class="opts-section-title">フラグオプション</div>
        <div class="opts-checks">
          <label><input type="checkbox" id="opt-ignoreLocation" ${o.ignoreLocation ? "checked" : ""}> ignoreLocation <span class="opt-desc">位置ペナルティを無効化</span></label>
          <label><input type="checkbox" id="opt-isCaseSensitive" ${o.isCaseSensitive ? "checked" : ""}> isCaseSensitive <span class="opt-desc">大文字・小文字を区別</span></label>
          <label><input type="checkbox" id="opt-includeScore" ${o.includeScore ? "checked" : ""}> includeScore <span class="opt-desc">スコアを結果に含める</span></label>
          <label><input type="checkbox" id="opt-includeMatches" ${o.includeMatches ? "checked" : ""}> includeMatches <span class="opt-desc">マッチ箇所をハイライト（①②のみ）</span></label>
          <label><input type="checkbox" id="opt-findAllMatches" ${o.findAllMatches ? "checked" : ""}> findAllMatches <span class="opt-desc">文字列末尾まで検索継続</span></label>
          <label><input type="checkbox" id="opt-useTokenSearch" ${o.useTokenSearch ? "checked" : ""}> useTokenSearch <span class="opt-desc">単語ごとに分割してファジー検索</span></label>
          <label><input type="checkbox" id="opt-useExtendedSearch" ${o.useExtendedSearch ? "checked" : ""}> useExtendedSearch <span class="opt-desc">演算子付き検索を有効化</span></label>
        </div>
      </div>
      <button id="apply-opts-btn" class="apply-btn">適用して再初期化</button>
    </div>
  `;
  faqContainer.insertBefore(optsPanel, faqContainer.querySelector(".search-area"));

  const thresholdInput = document.getElementById("opt-threshold");
  const thresholdVal = document.getElementById("opt-threshold-val");
  thresholdInput.addEventListener("input", () => {
    thresholdVal.textContent = parseFloat(thresholdInput.value).toFixed(2);
  });

  document.getElementById("opt-ignoreLocation").addEventListener("change", (e) => {
    const disabled = e.target.checked;
    document.getElementById("opt-distance").disabled = disabled;
    document.getElementById("opt-location").disabled = disabled;
  });

  document.getElementById("apply-opts-btn").addEventListener("click", () => {
    currentOpts = {
      threshold: parseFloat(thresholdInput.value),
      distance: parseInt(document.getElementById("opt-distance").value, 10),
      location: parseInt(document.getElementById("opt-location").value, 10),
      minMatchCharLength: parseInt(document.getElementById("opt-minmatch").value, 10),
      ignoreLocation: document.getElementById("opt-ignoreLocation").checked,
      isCaseSensitive: document.getElementById("opt-isCaseSensitive").checked,
      includeScore: document.getElementById("opt-includeScore").checked,
      includeMatches: document.getElementById("opt-includeMatches").checked,
      findAllMatches: document.getElementById("opt-findAllMatches").checked,
      useTokenSearch: document.getElementById("opt-useTokenSearch").checked,
      useExtendedSearch: document.getElementById("opt-useExtendedSearch").checked,
    };
    buildFuses(rawData, currentOpts);
    if (input.value.trim()) doSearch(input.value);
    const applyBtn = document.getElementById("apply-opts-btn");
    applyBtn.textContent = "✓ 再初期化完了";
    applyBtn.classList.add("apply-btn--done");
    setTimeout(() => {
      applyBtn.textContent = "適用して再初期化";
      applyBtn.classList.remove("apply-btn--done");
    }, 1500);
  });

  // モードタブ
  let currentMode = 2;

  const tabContainer = document.createElement("div");
  tabContainer.className = "mode-tabs";
  tabContainer.innerHTML = MODES.map(
    (m, i) =>
      `<button class="mode-tab${i === currentMode ? " active" : ""}" data-index="${i}">${m.label}</button>`,
  ).join("");
  faqContainer.insertBefore(tabContainer, faqContainer.querySelector(".search-area"));

  const input = document.getElementById("search-input");
  const btn = document.getElementById("search-btn");
  const suggestions = document.getElementById("suggestions");
  const results = document.getElementById("results");
  const tokenDebug = document.getElementById("token-debug");
  const tokenList = document.getElementById("token-list");

  tabContainer.querySelectorAll(".mode-tab").forEach((tabBtn) => {
    tabBtn.addEventListener("click", () => {
      currentMode = parseInt(tabBtn.dataset.index, 10);
      tabContainer
        .querySelectorAll(".mode-tab")
        .forEach((b, i) => b.classList.toggle("active", i === currentMode));
      if (input.value.trim()) doSearch(input.value);
    });
  });

  function doSearchHits(query) {
    return MODES[currentMode].search(query);
  }

  function renderAll() {
    results.innerHTML =
      `<p class="result-count">${augmentedData.length}件のFAQ</p>` +
      augmentedData.map((item) => renderCard(item)).join("");
  }

  renderAll();

  let activeIndex = -1;

  function showSuggestions(query) {
    if (!query.trim()) {
      suggestions.hidden = true;
      return;
    }
    const hits = doSearchHits(query).slice(0, 5);
    if (!hits.length) {
      suggestions.hidden = true;
      return;
    }

    suggestions.innerHTML = hits
      .map(
        (h, i) =>
          `<li data-index="${i}" data-id="${h.item.id}">
        <span class="category">[${h.item.category}]</span>${escapeHtml(h.item.question)}
      </li>`,
      )
      .join("");
    suggestions.hidden = false;
    activeIndex = -1;

    suggestions.querySelectorAll("li").forEach((li) => {
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        input.value = li.querySelector(".category").nextSibling.textContent.trim();
        suggestions.hidden = true;
        doSearch(input.value);
      });
    });
  }

  function doSearch(query) {
    suggestions.hidden = true;
    if (!query.trim()) {
      renderAll();
      return;
    }
    const hits = doSearchHits(query);
    if (!hits.length) {
      results.innerHTML = '<p class="no-results">該当するFAQが見つかりませんでした</p>';
      return;
    }
    results.innerHTML =
      `<p class="result-count">${hits.length}件見つかりました</p>` +
      hits.map((h) => renderCard(h.item, h.matches)).join("");
  }

  input.addEventListener("input", () => {
    const tokens = tokenizeForDisplay(input.value);
    if (tokens.length) {
      tokenList.innerHTML = tokens.map((t) => `<span class="token-chip">${escapeHtml(t)}</span>`).join("");
      tokenDebug.hidden = false;
    } else {
      tokenDebug.hidden = true;
    }
    showSuggestions(input.value);
  });

  input.addEventListener("keydown", (e) => {
    const items = suggestions.querySelectorAll("li");
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, -1);
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && items[activeIndex]) {
        input.value = items[activeIndex].querySelector(".category").nextSibling.textContent.trim();
        suggestions.hidden = true;
      }
      doSearch(input.value);
      return;
    } else if (e.key === "Escape") {
      suggestions.hidden = true;
      return;
    } else {
      return;
    }

    items.forEach((li, i) => li.classList.toggle("active", i === activeIndex));
    if (activeIndex >= 0 && items[activeIndex]) {
      input.value = items[activeIndex].querySelector(".category").nextSibling.textContent.trim();
    }
  });

  input.addEventListener("blur", () => {
    setTimeout(() => {
      suggestions.hidden = true;
    }, 150);
  });

  btn.addEventListener("click", () => doSearch(input.value));
});
