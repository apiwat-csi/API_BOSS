const state = {
  bosses: [],
  favorites: new Set(JSON.parse(localStorage.getItem("favoriteBosses") || "[]")),
  expandedWorldBossKinds: new Set(),
  notified: new Set(),
  notificationReady: false,
  refreshTimer: null,
};

const TARGET_WORLD_BOSS_KINDS = [261, 267, 280];

const appConfig = {
  apiRefreshSeconds: 10,
  soonBeforeSeconds: 300,
  defaultKindFilter: "1240,1241,1246",
};

const els = {
  tabs: document.querySelectorAll("[data-tab-target]"),
  tabPanels: document.querySelectorAll("[data-tab-panel]"),
  list: document.querySelector("#boss-list"),
  results: document.querySelector(".results-panel"),
  loading: document.querySelector("#loading"),
  error: document.querySelector("#error-box"),
  empty: document.querySelector("#empty-state"),
  worldBossTable: document.querySelector("#world-boss-table-container"),
  worldBossEmpty: document.querySelector("#world-boss-empty"),
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

function earliestWaitingChannel(boss) {
  const now = nowUnix();
  return boss.channels
    .filter((channel) => getSpawnStatus(channel).key === "waiting" && channel.nextRegenFrom > now)
    .sort((a, b) => a.nextRegenFrom - b.nextRegenFrom)[0];
}

function countdownText(boss) {
  const now = nowUnix();
  if (boss.nextRegenFrom <= now && now <= boss.nextRegenTo) {
    return `กำลังเกิด เหลือช่วงเวลา ${formatDuration(boss.nextRegenTo - now)}`;
  }
  const nextWaitingChannel = earliestWaitingChannel(boss);
  if (nextWaitingChannel) {
    return `CH ${nextWaitingChannel.channelNum} จะเริ่มนับเวลาเกิดในอีก ${formatDuration(nextWaitingChannel.nextRegenFrom - now)}`;
  }
  return "";
}

function clearNode(node) {
  while (node?.firstChild) node.removeChild(node.firstChild);
}

function appendTextCell(row, text, className = "", label = "") {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  if (label) cell.dataset.label = label;
  cell.textContent = text;
  row.appendChild(cell);
  return cell;
}

function appendHeaderCell(row, text) {
  const cell = document.createElement("th");
  cell.scope = "col";
  cell.textContent = text;
  row.appendChild(cell);
  return cell;
}

function formatDateTime(value) {
  if (value === null || value === undefined || value === "" || value === "-" || value === 0) return "-";

  const raw = String(value).trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?$/);
  return match ? `${match[1]} ${match[2]}` : "-";
}

function parseBangkokDateToUnix(value) {
  const formatted = formatDateTime(value);
  if (formatted === "-") return 0;

  const match = formatted.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return 0;

  const [, year, month, day, hour, minute, second] = match.map(Number);
  return Math.floor(Date.UTC(year, month - 1, day, hour - 7, minute, second) / 1000);
}

function getNextSpawnUnix(row) {
  const nextByDate = parseBangkokDateToUnix(row.nextRegenDate);
  if (nextByDate) return nextByDate;
  return Number(row.nextRegenFrom || 0);
}

function formatNextSpawn(row) {
  const nextByDate = formatDateTime(row.nextRegenDate);
  if (nextByDate !== "-") return nextByDate;
  return Number(row.nextRegenFrom || 0) ? formatDateTime(row.nextRegenFromThai) : "-";
}

function getBossStatus(row) {
  const nextSpawn = getNextSpawnUnix(row);
  if (!nextSpawn) {
    return { key: "unknown", label: "No spawn information", className: "is-unknown" };
  }

  if (nowUnix() < nextSpawn) {
    return { key: "waiting", label: "Waiting to spawn", className: "is-world-waiting" };
  }

  return { key: "spawned", label: "Boss may have spawned", className: "is-world-spawned" };
}

function getCountdown(row) {
  const nextSpawn = getNextSpawnUnix(row);
  if (!nextSpawn) return "-";

  const secondsLeft = nextSpawn - nowUnix();
  if (secondsLeft <= 0) return "Spawn time reached";

  const days = Math.floor(secondsLeft / 86400);
  const hours = Math.floor((secondsLeft % 86400) / 3600);
  const minutes = Math.floor((secondsLeft % 3600) / 60);
  const seconds = secondsLeft % 60;
  const parts = [];

  if (days) parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  if (hours) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (minutes) parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);
  parts.push(`${seconds} ${seconds === 1 ? "second" : "seconds"}`);

  return parts.join(" ");
}

function worldBosses() {
  const kindOrder = new Map(TARGET_WORLD_BOSS_KINDS.map((kind, index) => [kind, index]));

  return state.bosses
    .filter((boss) => kindOrder.has(Number(boss.kind)))
    .sort((a, b) => kindOrder.get(Number(a.kind)) - kindOrder.get(Number(b.kind)));
}

function sortedChannels(boss) {
  return [...(boss.channels || [])].sort((a, b) => Number(a.channelNum || 0) - Number(b.channelNum || 0));
}

function channelSummary(boss) {
  const bossNextSpawn = formatNextSpawn(boss);
  const channels = sortedChannels(boss).filter((channel) => (
    bossNextSpawn !== "-" && formatNextSpawn(channel) === bossNextSpawn
  ));
  if (!channels.length) return "-";
  return channels.map((channel) => `CH ${channel.channelNum}`).join(", ");
}

function createStatusBadge(status) {
  const badge = document.createElement("span");
  badge.className = `world-status-badge ${status.className}`;
  badge.textContent = status.label;
  return badge;
}

function createBossRow(boss) {
  const status = getBossStatus(boss);
  const row = document.createElement("tr");
  row.className = `world-boss-row ${status.className}`;
  row.dataset.kind = String(boss.kind);

  const kindCell = appendTextCell(row, "", "world-kind-cell", "Kind");
  const kindBadge = document.createElement("span");
  kindBadge.className = "world-kind-badge";
  kindBadge.textContent = String(boss.kind);
  kindCell.appendChild(kindBadge);

  const nameCell = appendTextCell(row, boss.name || "-", "world-boss-name", "บอส");
  nameCell.title = boss.name || "";
  appendTextCell(row, boss.mapName || "-", "world-map-cell", "แผนที่");
  appendTextCell(row, formatNextSpawn(boss), "world-date-cell", "เกิดรอบถัดไป");
  appendTextCell(row, channelSummary(boss), "world-channel-summary", "Channel");

  const statusCell = appendTextCell(row, "", "", "Status");
  statusCell.appendChild(createStatusBadge(status));
  appendTextCell(row, getCountdown(boss), "world-countdown-cell", "Countdown");

  const detailsCell = appendTextCell(row, "", "world-details-cell", "Details");
  const button = document.createElement("button");
  const expanded = state.expandedWorldBossKinds.has(String(boss.kind));
  button.className = "world-details-button";
  button.type = "button";
  button.dataset.worldChannels = String(boss.kind);
  button.setAttribute("aria-expanded", expanded ? "true" : "false");
  button.textContent = expanded ? "Hide Channels" : "View Channels";
  detailsCell.appendChild(button);

  return row;
}

function createChannelDetailsRow(boss) {
  const row = document.createElement("tr");
  row.className = "world-channel-details-row";
  row.dataset.detailsFor = String(boss.kind);

  const cell = document.createElement("td");
  cell.colSpan = 8;
  row.appendChild(cell);

  const wrapper = document.createElement("div");
  wrapper.className = "world-channel-details";
  cell.appendChild(wrapper);

  const table = document.createElement("table");
  table.className = "world-channel-table";
  wrapper.appendChild(table);

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  ["Channel", "Last Death", "Last Spawn", "Next Spawn", "Status", "Countdown", "Total Deaths"].forEach((header) => appendHeaderCell(headerRow, header));
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  table.appendChild(tbody);

  const channels = sortedChannels(boss);
  if (!channels.length) {
    const emptyRow = document.createElement("tr");
    appendTextCell(emptyRow, "No channel information", "world-channel-empty");
    emptyRow.firstChild.colSpan = 7;
    tbody.appendChild(emptyRow);
    return row;
  }

  channels.forEach((channel) => {
    const channelStatus = getBossStatus(channel);
    const channelRow = document.createElement("tr");
    appendTextCell(channelRow, `CH ${channel.channelNum}`, "", "Channel");
    appendTextCell(channelRow, formatDateTime(channel.lastDie), "world-date-cell", "Last Death");
    appendTextCell(channelRow, formatDateTime(channel.lastRegen), "world-date-cell", "Last Spawn");
    appendTextCell(channelRow, formatNextSpawn(channel), "world-date-cell", "Next Spawn");

    const statusCell = appendTextCell(channelRow, "", "", "Status");
    statusCell.appendChild(createStatusBadge(channelStatus));

    appendTextCell(channelRow, getCountdown(channel), "world-countdown-cell", "Countdown");
    appendTextCell(channelRow, String(channel.totalDeath ?? boss.totalDeath ?? 0), "", "Total Deaths");
    tbody.appendChild(channelRow);
  });

  return row;
}

function renderBossStatusTable(bosses) {
  if (!els.worldBossTable || !els.worldBossEmpty) return;

  clearNode(els.worldBossTable);
  els.worldBossEmpty.hidden = bosses.length > 0;
  if (!bosses.length) return;

  const table = document.createElement("table");
  table.className = "world-boss-table";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  ["Kind", "บอส", "แผนที่", "เกิดรอบถัดไป", "Channel", "Status", "Countdown", "Details"].forEach((header) => appendHeaderCell(headerRow, header));
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  bosses.forEach((boss) => {
    tbody.appendChild(createBossRow(boss));
    if (state.expandedWorldBossKinds.has(String(boss.kind))) {
      tbody.appendChild(createChannelDetailsRow(boss));
    }
  });
  table.appendChild(tbody);
  els.worldBossTable.appendChild(table);
}

function toggleChannelDetails(kind) {
  const key = String(kind);
  if (state.expandedWorldBossKinds.has(key)) state.expandedWorldBossKinds.delete(key);
  else state.expandedWorldBossKinds.add(key);
  renderBossStatusTable(worldBosses());
}

function updateCountdowns() {
  renderBossStatusTable(worldBosses());
}

function activateTab(tabName) {
  els.tabs.forEach((tab) => {
    const isActive = tab.dataset.tabTarget === tabName;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  els.tabPanels.forEach((panel) => {
    const isActive = panel.dataset.tabPanel === tabName;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  });
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
  const countdown = countdownText(boss);
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
      ${countdown ? `<div class="countdown" data-countdown="${escapeHtml(boss.kind)}">${escapeHtml(countdown)}</div>` : ""}
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
  if (els.bossCount) els.bossCount.textContent = String(bosses.length);
  if (els.spawningCount) els.spawningCount.textContent = String(bosses.filter((boss) => getStatus(boss).key === "spawning").length);
  if (els.soonCount) els.soonCount.textContent = String(bosses.filter((boss) => getStatus(boss).key === "soon").length);
  renderBossStatusTable(worldBosses());
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
  els.results?.setAttribute("aria-busy", "true");
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
    els.results?.setAttribute("aria-busy", "false");
  }
}

async function loadConfig() {
  try {
    const response = await fetch("/api/config", { headers: { Accept: "application/json" } });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error("โหลด config ไม่สำเร็จ");

    appConfig.apiRefreshSeconds = Number(payload.data.apiRefreshSeconds || appConfig.apiRefreshSeconds);
    appConfig.soonBeforeSeconds = Number(payload.data.soonBeforeSeconds || appConfig.soonBeforeSeconds);
    appConfig.defaultKindFilter = String(payload.data.defaultKindFilter || appConfig.defaultKindFilter).trim();
  } catch (error) {
    console.warn(error.message || "โหลด config ไม่สำเร็จ ใช้ค่า default");
  } finally {
    if (els.kind && !els.kind.value.trim()) {
      els.kind.value = appConfig.defaultKindFilter;
    }
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
els.tabs.forEach((tab) => {
  tab.addEventListener("click", () => activateTab(tab.dataset.tabTarget));
});
els.list.addEventListener("click", (event) => {
  const button = event.target.closest("[data-favorite]");
  if (!button) return;
  const id = String(button.dataset.favorite);
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);
  localStorage.setItem("favoriteBosses", JSON.stringify([...state.favorites]));
  render();
});
els.worldBossTable?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-world-channels]");
  if (!button) return;
  toggleChannelDetails(button.dataset.worldChannels);
});

bootstrap();
