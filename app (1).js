// ============================================================
// TOURNAMENT CONFIG
// Team IDs never change (scores are stored under these) — but
// the DISPLAY NAMES can be edited live from the /admin page.
// ============================================================
const TEAM_IDS = ["teamA", "teamB", "teamC"];

const DEFAULT_TEAM_NAMES = {
  teamA: "Team A",
  teamB: "Team B",
  teamC: "Team C"
};

const TEAM_STYLE = {
  teamA: { accent: "#E63946" },
  teamB: { accent: "#2A9D8F" },
  teamC: { accent: "#E9C46A" }
};

const PARS = [4,5,5,3,4,3,3,4,4, 4,3,4,5,4,3,4,4,4]; // holes 1-18
const HOLE_COUNT = PARS.length;

// ============================================================
// FIREBASE INIT
// ============================================================
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const scoresRef = db.ref("scores");
const teamNamesRef = db.ref("config/teamNames");

let messaging = null;
try {
  if (firebase.messaging.isSupported()) {
    messaging = firebase.messaging();
  }
} catch (e) {
  console.log("Messaging not available:", e.message);
}

// ============================================================
// STATE
// ============================================================
let currentScores = {};   // { teamA: { "1": {strokes, mulligan}, ... }, ... }
let previousScores = {};
let teamNames = { ...DEFAULT_TEAM_NAMES };
let myTeam = localStorage.getItem("myTeam") || null;
let firstLoad = true;

// ============================================================
// UTILITIES
// ============================================================
function teamTotals(teamId) {
  const holes = currentScores[teamId] || {};
  let strokes = 0, played = 0, toPar = 0;
  for (let h = 1; h <= HOLE_COUNT; h++) {
    const entry = holes[h];
    const v = entry && typeof entry === "object" ? entry.strokes : entry;
    if (v !== undefined && v !== null) {
      strokes += v;
      toPar += (v - PARS[h-1]);
      played++;
    }
  }
  return { strokes, played, toPar };
}

function fmtToPar(n) {
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : `${n}`;
}

function relationToPar(strokes, par) {
  if (strokes === undefined || strokes === null) return null;
  const diff = strokes - par;
  if (diff <= -2) return "eagle";
  if (diff === -1) return "birdie";
  if (diff === 0) return "par";
  if (diff === 1) return "bogey";
  return "over";
}

function holeEntry(teamId, hole) {
  const raw = (currentScores[teamId] || {})[hole];
  if (raw === undefined || raw === null) return { strokes: undefined, mulligan: false };
  if (typeof raw === "object") return { strokes: raw.strokes, mulligan: !!raw.mulligan };
  return { strokes: raw, mulligan: false }; // backwards compatibility w/ old plain-number format
}

function nameFor(teamId) {
  return teamNames[teamId] || DEFAULT_TEAM_NAMES[teamId];
}

// ============================================================
// RENDER: LEADERBOARD
// ============================================================
function renderLeaderboard() {
  const el = document.getElementById("leaderboard");
  const rows = TEAM_IDS.map(teamId => ({ teamId, ...teamTotals(teamId) }))
    .sort((a, b) => {
      if (a.toPar !== b.toPar) return a.toPar - b.toPar;
      return a.strokes - b.strokes;
    });

  el.innerHTML = rows.map((r, i) => {
    const style = TEAM_STYLE[r.teamId];
    const thru = r.played === HOLE_COUNT ? "F" : (r.played === 0 ? "—" : `${r.played}`);
    return `
      <div class="board-row" style="--accent:${style.accent}">
        <div class="board-pos">${i + 1}</div>
        <div class="board-team">
          <span class="dot"></span>${nameFor(r.teamId)}
        </div>
        <div class="board-thru">THRU ${thru}</div>
        <div class="board-score">${r.played === 0 ? "—" : fmtToPar(r.toPar)}</div>
      </div>
    `;
  }).join("");
}

// ============================================================
// RENDER: SCORECARD
// ============================================================
function renderScorecard() {
  const el = document.getElementById("scorecard-wrap");
  const front = [...Array(9)].map((_, i) => i + 1);
  const back = [...Array(9)].map((_, i) => i + 10);

  function buildTable(holes, label) {
    let head = `<tr><th class="corner">${label}</th>${holes.map(h => `<th>${h}</th>`).join("")}<th class="tot">TOT</th></tr>`;
    let parRow = `<tr class="par-row"><td>Par</td>${holes.map(h => `<td>${PARS[h-1]}</td>`).join("")}<td>${holes.reduce((a,h)=>a+PARS[h-1],0)}</td></tr>`;
    let teamRows = TEAM_IDS.map(teamId => {
      const style = TEAM_STYLE[teamId];
      let subtotal = 0, any = false;
      const cells = holes.map(h => {
        const { strokes: v, mulligan } = holeEntry(teamId, h);
        if (v !== undefined && v !== null) { subtotal += v; any = true; }
        const rel = relationToPar(v, PARS[h-1]);
        let cls = rel ? `cell-${rel}` : "";
        if (mulligan) cls += " cell-mulligan";
        const badge = mulligan ? `<sup class="m-badge">M</sup>` : "";
        return `<td class="${cls}">${v !== undefined && v !== null ? v : ""}${badge}</td>`;
      }).join("");
      return `<tr><td class="team-label" style="--accent:${style.accent}"><span class="dot"></span>${nameFor(teamId)}</td>${cells}<td class="tot">${any ? subtotal : ""}</td></tr>`;
    }).join("");
    return `<table class="scorecard">${head}${parRow}${teamRows}</table>`;
  }

  el.innerHTML = buildTable(front, "Front 9") + buildTable(back, "Back 9");
}

// ============================================================
// RENDER: ENTRY SCREEN
// ============================================================
function renderEntry() {
  const teamPicker = document.getElementById("team-picker");
  teamPicker.innerHTML = TEAM_IDS.map(teamId =>
    `<button class="team-pick-btn ${teamId === myTeam ? "active" : ""}" data-team="${teamId}" style="--accent:${TEAM_STYLE[teamId].accent}">${nameFor(teamId)}</button>`
  ).join("");

  const entryArea = document.getElementById("entry-area");
  if (!myTeam) {
    entryArea.innerHTML = `<p class="hint">Pick your team above to start entering scores.</p>`;
    return;
  }

  entryArea.innerHTML = [...Array(HOLE_COUNT)].map((_, i) => {
    const hole = i + 1;
    const par = PARS[i];
    const { strokes: val, mulligan } = holeEntry(myTeam, hole);
    return `
      <div class="entry-row">
        <div class="entry-hole">
          <span class="hole-num">${hole}</span>
          <span class="hole-par">Par ${par}</span>
        </div>
        <label class="mulligan-toggle ${mulligan ? "on" : ""}">
          <input type="checkbox" class="mulligan-check" data-hole="${hole}" ${mulligan ? "checked" : ""}>
          Mulligan
        </label>
        <div class="stepper">
          <button class="step-btn" data-hole="${hole}" data-dir="-1">–</button>
          <input class="score-input" type="number" inputmode="numeric" min="1" max="12"
                 data-hole="${hole}" value="${val !== undefined ? val : ""}" placeholder="–">
          <button class="step-btn" data-hole="${hole}" data-dir="1">+</button>
        </div>
      </div>
    `;
  }).join("");
}

// ============================================================
// EVENTS
// ============================================================
document.addEventListener("click", (e) => {
  const teamBtn = e.target.closest(".team-pick-btn");
  if (teamBtn) {
    myTeam = teamBtn.dataset.team;
    localStorage.setItem("myTeam", myTeam);
    renderEntry();
    return;
  }
  const stepBtn = e.target.closest(".step-btn");
  if (stepBtn) {
    const hole = stepBtn.dataset.hole;
    const dir = parseInt(stepBtn.dataset.dir, 10);
    const input = document.querySelector(`.score-input[data-hole="${hole}"]`);
    let val = parseInt(input.value, 10);
    if (isNaN(val)) val = PARS[hole - 1];
    else val += dir;
    if (val < 1) val = 1;
    if (val > 12) val = 12;
    input.value = val;
    saveScore(hole, val, currentMulliganState(hole));
  }
});

document.addEventListener("change", (e) => {
  if (e.target.classList.contains("score-input")) {
    const hole = e.target.dataset.hole;
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val > 0) saveScore(hole, val, currentMulliganState(hole));
  }
  if (e.target.classList.contains("mulligan-check")) {
    const hole = e.target.dataset.hole;
    const label = e.target.closest(".mulligan-toggle");
    label.classList.toggle("on", e.target.checked);
    const input = document.querySelector(`.score-input[data-hole="${hole}"]`);
    const val = parseInt(input.value, 10);
    if (!isNaN(val) && val > 0) saveScore(hole, val, e.target.checked);
  }
});

function currentMulliganState(hole) {
  const check = document.querySelector(`.mulligan-check[data-hole="${hole}"]`);
  return check ? check.checked : false;
}

function saveScore(hole, strokes, mulligan) {
  if (!myTeam) return;
  scoresRef.child(myTeam).child(hole).set({ strokes, mulligan: !!mulligan });
}

// ============================================================
// REALTIME SYNC + BIRDIE ALERTS
// ============================================================
teamNamesRef.on("value", (snap) => {
  const val = snap.val() || {};
  teamNames = { ...DEFAULT_TEAM_NAMES, ...val };
  renderLeaderboard();
  renderScorecard();
  renderEntry();
});

scoresRef.on("value", (snap) => {
  currentScores = snap.val() || {};

  if (!firstLoad) {
    checkForGoodScores(previousScores, currentScores);
  }
  previousScores = JSON.parse(JSON.stringify(currentScores));
  firstLoad = false;

  renderLeaderboard();
  renderScorecard();
  renderEntry();
});

function checkForGoodScores(prev, curr) {
  TEAM_IDS.forEach(teamId => {
    const prevHoles = prev[teamId] || {};
    const currHoles = curr[teamId] || {};
    for (let h = 1; h <= HOLE_COUNT; h++) {
      const beforeRaw = prevHoles[h];
      const afterRaw = currHoles[h];
      const before = beforeRaw && typeof beforeRaw === "object" ? beforeRaw.strokes : beforeRaw;
      const after = afterRaw && typeof afterRaw === "object" ? afterRaw.strokes : afterRaw;
      if (after === undefined || after === null) continue;
      if (before === after) continue;
      const rel = relationToPar(after, PARS[h-1]);
      if (rel === "birdie" || rel === "eagle") {
        announceGoodScore(nameFor(teamId), h, rel);
      }
    }
  });
}

function announceGoodScore(teamName, hole, rel) {
  const label = rel === "eagle" ? "EAGLE" : "BIRDIE";
  showBanner(`${label}! ${teamName} on hole ${hole}`);
  playChime(rel);
  if (Notification.permission === "granted") {
    try {
      new Notification(`${label} 🐦`, { body: `${teamName} just carded a ${rel} on hole ${hole}`, icon: "icons/icon-192.png" });
    } catch (e) { /* no-op if unsupported in this context */ }
  }
}

function showBanner(text) {
  const banner = document.getElementById("alert-banner");
  banner.textContent = text;
  banner.classList.add("show");
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => banner.classList.remove("show"), 4500);
}

let audioCtx = null;
function playChime(rel) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = rel === "eagle" ? [523.25, 659.25, 783.99, 1046.5] : [523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, audioCtx.currentTime + i * 0.14);
      gain.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + i * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + i * 0.14 + 0.4);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + i * 0.14);
      osc.stop(audioCtx.currentTime + i * 0.14 + 0.45);
    });
  } catch (e) { console.log("Audio not available:", e.message); }
}

// ============================================================
// TABS
// ============================================================
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

// ============================================================
// NOTIFICATION PERMISSION + PUSH SETUP
// ============================================================
const notifBtn = document.getElementById("notif-btn");

function updateNotifBtn() {
  if (!("Notification" in window)) {
    notifBtn.textContent = "Notifications not supported";
    notifBtn.disabled = true;
    return;
  }
  if (Notification.permission === "granted") {
    notifBtn.textContent = "🔔 Alerts on";
    notifBtn.classList.add("granted");
  } else {
    notifBtn.textContent = "🔕 Turn on alerts";
    notifBtn.classList.remove("granted");
  }
}

notifBtn.addEventListener("click", async () => {
  if (!("Notification" in window)) return;
  const perm = await Notification.requestPermission();
  updateNotifBtn();
  if (perm === "granted" && messaging) {
    try {
      const registration = await navigator.serviceWorker.ready;
      const token = await messaging.getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
      if (token) {
        await db.ref("pushTokens/" + token).set(true);
      }
    } catch (e) {
      console.log("Push token setup skipped:", e.message);
    }
  }
});

updateNotifBtn();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(e => console.log("SW registration failed:", e.message));
  });
}

if (messaging) {
  messaging.onMessage((payload) => {
    const { title, body } = payload.notification || {};
    if (title) showBanner(`${title} — ${body || ""}`);
  });
}
