const state = {
  bosses: [],
  favorites: new Set(JSON.parse(localStorage.getItem("favoriteBosses") || "[]")),
  notified: new Set(),
  notificationReady: false,
  refreshTimer: null,
};

const appConfig = {
  apiRefreshSeconds: 10,
  soonBeforeSeconds: 300,
};

const els = {
  list: document.querySelector("#boss-list"),
  loading: document.querySelector("#loading"),
  error: document.querySelector("#error-box"),
  empty: document.querySelector("#empty-state"),
  search: document.querySelector("#search-input"),
  kind: document.querySelector("#kind-filter"),
  category: document.querySelector("#category-filter"),
  map: document.querySelector("#map-filter"),
  refresh: document.querySelector("#refresh-button"),
  lastUpdated: document.querySelector("#last-updated"),
  bossCount: document.querySelector("#boss-count"),
  spawningCount: document.querySelector("#spawning-count"),
  soonCount: document.querySelector("#soon-count"),
};

const DEFAULT_KIND_FILTER = "1229,1240,1241";
if (els.kind && !els.kind.value.trim()) {
  els.kind.value = DEFAULT_KIND_FILTER;
}

let audioContext;

function playNotificationSound() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  audioContext = audioContext || new AudioContext();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, audioContext.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.35);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.36);
}

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function getStatus(boss) {
  return getSpawnStatus(boss, true);
}

function parseApiDate(value) {
  if (!value || value === "-") return 0;
  const normalized = String(value).replace(" ", "T");
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function hasRegenAfterDeath(row) {
  return parseApiDate(row.lastRegen) > parseApiDate(row.lastDie);
}

function timeOnly(value) {
  const match = String(value || "").match(/(\d{2}:\d{2}:\d{2})/);
  return match ? match[1] : "-";
}

function getSpawnStatus(row, bossLabel = false) {
  const now = nowUnix();
  if (hasRegenAfterDeath(row)) {
    return { key: "spawning", icon: "✦", label: bossLabel ? "Boss กำลังเกิด" : "เกิด", className: "is-spawning" };
  }
  if (now >= row.nextRegenFrom - appConfig.soonBeforeSeconds && now <= row.nextRegenTo) {
    return { key: "soon", icon: "!", label: "ใกล้เกิด", className: "is-soon" };
  }
  return { key: "waiting", icon: "×", label: "ตาย", className: "is-waiting" };
}

function formatDuration(seconds) {
  if (seconds <= 0) return "00:00";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const base = `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${base}` : base;
}

function rangeCountdownText(channel) {
  const secondsLeft = channel.nextRegenTo - nowUnix();
  return secondsLeft > 0 ? formatDuration(secondsLeft) : "00:00";
}

function countdownText(boss) {
  const now = nowUnix();
  if (boss.nextRegenFrom <= now && now <= boss.nextRegenTo) {
    return `กำลังเกิด เหลือช่วงเวลา ${formatDuration(boss.nextRegenTo - now)}`;
  }
  if (boss.nextRegenFrom > now) {
    return `เกิดในอีก ${formatDuration(boss.nextRegenFrom - now)}`;
  }
  return "หมดช่วงเวลาเกิดแล้ว";
}

function channelHtml(channel) {
  const status = getSpawnStatus(channel);
  return `
    <div class="channel-row ${status.className}">
      <div class="channel-title">
        <strong>CH ${escapeHtml(channel.channelNum)}</strong>
        ${status.key === "soon" ? `<span class="channel-countdown">${rangeCountdownText(channel)}</span>` : ""}
      </div>
      <div class="channel-times">
        <span><span class="time-icon death-icon">×</span>ตาย: ${escapeHtml(timeOnly(channel.lastDie))}</span>
        <span><span class="time-icon regen-icon">✦</span>เกิด: ${escapeHtml(timeOnly(channel.lastRegen))}</span>
        <span><span class="time-icon next-icon">→</span>ถัดไป: ${escapeHtml(timeOnly(channel.nextRegenFromThai))} - ${escapeHtml(timeOnly(channel.nextRegenToThai))}</span>
      </div>
    </div>
  `;
}

function bossCardHtml(boss) {
  const status = getStatus(boss);
  const favorite = state.favorites.has(String(boss.kind));
  return `
    <article class="boss-card ${status.className}" data-kind="${escapeHtml(boss.kind)}">
      <div class="card-head">
        <div>
          <h2 class="boss-name">${escapeHtml(boss.name)}</h2>
          <span class="muted">${escapeHtml(boss.mapName)}</span>
        </div>
        <span class="badge">${status.label}</span>
      </div>
      <button class="favorite ${favorite ? "is-active" : ""}" type="button" data-favorite="${escapeHtml(boss.kind)}">${favorite ? "ติดตามแล้ว" : "ติดตาม"}</button>
      <div class="countdown" data-countdown="${escapeHtml(boss.kind)}">${escapeHtml(countdownText(boss))}</div>
      <div class="channel-list">${boss.channels.map(channelHtml).join("")}</div>
    </article>
  `;
}

function filteredBosses() {
  const query = els.search.value.trim().toLowerCase();
  const kinds = (els.kind?.value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const kindOrder = new Map(kinds.map((kind, index) => [kind, index]));
  const category = els.category.value;
  const map = els.map.value;

  return state.bosses
    .filter((boss) => !query || boss.name.toLowerCase().includes(query) || boss.mapName.toLowerCase().includes(query))
    .filter((boss) => kinds.length === 0 || kinds.includes(String(boss.kind)))
    .filter((boss) => !category || boss.category === category)
    .filter((boss) => !map || boss.mapName === map)
    .sort((a, b) => {
      if (kindOrder.size > 0) {
        const aOrder = kindOrder.has(String(a.kind)) ? kindOrder.get(String(a.kind)) : Number.MAX_SAFE_INTEGER;
        const bOrder = kindOrder.has(String(b.kind)) ? kindOrder.get(String(b.kind)) : Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder) return aOrder - bOrder;
      }
      const favDiff = Number(state.favorites.has(String(b.kind))) - Number(state.favorites.has(String(a.kind)));
      return favDiff || a.nextRegenFrom - b.nextRegenFrom;
    });
}

function renderFilters() {
  const categories = [...new Set(state.bosses.map((boss) => boss.category).filter(Boolean))].sort();
  const maps = [...new Set(state.bosses.map((boss) => boss.mapName).filter(Boolean))].sort();
  const selectedCategory = els.category.value;
  const selectedMap = els.map.value;

  els.category.innerHTML = `<option value="">ทุกประเภท</option>${categories.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("")}`;
  els.map.innerHTML = `<option value="">ทุกแผนที่</option>${maps.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("")}`;
  els.category.value = selectedCategory;
  els.map.value = selectedMap;
}

function render() {
  const bosses = filteredBosses();
  els.list.innerHTML = bosses.map(bossCardHtml).join("");
  els.empty.hidden = bosses.length > 0;
  els.bossCount.textContent = String(bosses.length);
  els.spawningCount.textContent = String(bosses.filter((boss) => getStatus(boss).key === "spawning").length);
  els.soonCount.textContent = String(bosses.filter((boss) => getStatus(boss).key === "soon").length);
}

function greenNotificationKey(boss, channel) {
  return `${boss.kind}:${channel.channelNum}:${channel.lastRegen}`;
}

function notifyGreenChannels({ silent = false } = {}) {
  let shouldPlay = false;

  for (const boss of filteredBosses()) {
    for (const channel of boss.channels) {
      if (!hasRegenAfterDeath(channel)) continue;

      const key = greenNotificationKey(boss, channel);
      if (state.notified.has(key)) continue;

      state.notified.add(key);
      shouldPlay = true;
    }
  }

  if (shouldPlay && !silent) {
    playNotificationSound();
  }
}

function tickCountdowns() {
  for (const boss of filteredBosses()) {
    const node = document.querySelector(`[data-countdown="${CSS.escape(String(boss.kind))}"]`);
    if (node) node.textContent = countdownText(boss);
  }
  render();
}

async function loadBosses() {
  els.loading.hidden = false;
  els.error.hidden = true;
  try {
    const response = await fetch("/api/bosses", { headers: { Accept: "application/json" } });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.message || "โหลดข้อมูลไม่สำเร็จ");
    state.bosses = payload.data;
    renderFilters();
    render();
    notifyGreenChannels({ silent: !state.notificationReady });
    state.notificationReady = true;
    els.lastUpdated.textContent = `อัปเดตล่าสุด ${new Date().toLocaleTimeString("th-TH")}`;
  } catch (error) {
    els.error.textContent = error.message || "เกิดข้อผิดพลาด";
    els.error.hidden = false;
  } finally {
    els.loading.hidden = true;
  }
}

async function loadConfig() {
  try {
    const response = await fetch("/api/config", { headers: { Accept: "application/json" } });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error("โหลด config ไม่สำเร็จ");

    appConfig.apiRefreshSeconds = Number(payload.data.apiRefreshSeconds || appConfig.apiRefreshSeconds);
    appConfig.soonBeforeSeconds = Number(payload.data.soonBeforeSeconds || appConfig.soonBeforeSeconds);
  } catch (error) {
    console.warn(error.message || "โหลด config ไม่สำเร็จ ใช้ค่า default");
  }
}

async function bootstrap() {
  await loadConfig();
  await loadBosses();
  state.refreshTimer = setInterval(loadBosses, appConfig.apiRefreshSeconds * 1000);
  setInterval(tickCountdowns, 1_000);
}

els.refresh.addEventListener("click", loadBosses);
els.search.addEventListener("input", render);
els.kind?.addEventListener("input", render);
els.category.addEventListener("change", render);
els.map.addEventListener("change", render);
els.list.addEventListener("click", (event) => {
  const button = event.target.closest("[data-favorite]");
  if (!button) return;
  const id = String(button.dataset.favorite);
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);
  localStorage.setItem("favoriteBosses", JSON.stringify([...state.favorites]));
  render();
});

bootstrap();
