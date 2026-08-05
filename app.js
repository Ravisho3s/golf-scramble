// ============================================================
// TOURNAMENT CONFIG — edit these to match your event
// ============================================================
const TEAMS = ["Team A", "Team B", "Team C"];

const TEAM_STYLE = {
  "Team A": { accent: "#E63946", label: "Red" },
  "Team B": { accent: "#2A9D8F", label: "Teal" },
  "Team C": { accent: "#E9C46A", label: "Gold" }
};

const PARS = [4,5,5,3,4,3,3,4,4, 4,3,4,5,4,3,4,4,4]; // holes 1-18
const HOLE_COUNT = PARS.length;
const TOTAL_PAR = PARS.reduce((a,b)=>a+b,0);

// ============================================================
// FIREBASE INIT
// ============================================================
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const scoresRef = db.ref("scores");

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
let currentScores = {};   // { "Team A": { "1": 4, "2": 5, ... }, ... }
let previousScores = {};  // used to detect newly-entered birdies
let myTeam = localStorage.getItem("myTeam") || null;
let firstLoad = true;

// ============================================================
// UTILITIES
// ============================================================
function teamTotals(team) {
  const holes = currentScores[team] || {};
  let strokes = 0, played = 0, toPar = 0;
  for (let h = 1; h <= HOLE_COUNT; h++) {
    const v = holes[h];
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

// ============================================================
// RENDER: LEADERBOARD
// ============================================================
function renderLeaderboard() {
  const el = document.getElementById("leaderboard");
  const rows = TEAMS.map(team => {
    const t = teamTotals(team);
    return { team, ...t };
  }).sort((a, b) => {
    // teams that have played more are ranked properly; ties broken by strokes
    if (a.toPar !== b.toPar) return a.toPar - b.toPar;
    return a.strokes - b.strokes;
  });

  el.innerHTML = rows.map((r, i) => {
    const style = TEAM_STYLE[r.team];
    const thru = r.played === HOLE_COUNT ? "F" : (r.played === 0 ? "—" : `${r.played}`);
    return `
      <div class="board-row" style="--accent:${style.accent}">
        <div class="board-pos">${i + 1}</div>
        <div class="board-team">
          <span class="dot"></span>${r.team}
        </div>
        <div class="board-thru">THRU ${thru}</div>
        <div class="board-score">${r.played === 0 ? "—" : fmtToPar(r.toPar)}</div>
      </div>
    `;
  }).join("");
}

// ============================================================
// RENDER: SCORECARD (all teams x all holes)
// ============================================================
function renderScorecard() {
  const el = document.getElementById("scorecard-wrap");
  const front = [...Array(9)].map((_, i) => i + 1);
  const back = [...Array(9)].map((_, i) => i + 10);

  function buildTable(holes, label) {
    let head = `<tr><th class="corner">${label}</th>${holes.map(h => `<th>${h}</th>`).join("")}<th class="tot">TOT</th></tr>`;
    let parRow = `<tr class="par-row"><td>Par</td>${holes.map(h => `<td>${PARS[h-1]}</td>`).join("")}<td>${holes.reduce((a,h)=>a+PARS[h-1],0)}</td></tr>`;
    let teamRows = TEAMS.map(team => {
      const style = TEAM_STYLE[team];
      const holesData = currentScores[team] || {};
      let subtotal = 0, any = false;
      const cells = holes.map(h => {
        const v = holesData[h];
        if (v !== undefined && v !== null) { subtotal += v; any = true; }
        const rel = relationToPar(v, PARS[h-1]);
        const cls = rel ? `cell-${rel}` : "";
        return `<td class="${cls}">${v !== undefined && v !== null ? v : ""}</td>`;
      }).join("");
      return `<tr><td class="team-label" style="--accent:${style.accent}"><span class="dot"></span>${team}</td>${cells}<td class="tot">${any ? subtotal : ""}</td></tr>`;
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
  teamPicker.innerHTML = TEAMS.map(t =>
    `<button class="team-pick-btn ${t === myTeam ? "active" : ""}" data-team="${t}" style="--accent:${TEAM_STYLE[t].accent}">${t}</button>`
  ).join("");

  const entryArea = document.getElementById("entry-area");
  if (!myTeam) {
    entryArea.innerHTML = `<p class="hint">Pick your team above to start entering scores.</p>`;
    return;
  }

  const holesData = currentScores[myTeam] || {};
  entryArea.innerHTML = [...Array(HOLE_COUNT)].map((_, i) => {
    const hole = i + 1;
    const par = PARS[i];
    const val = holesData[hole];
    return `
      <div class="entry-row">
        <div class="entry-hole">
          <span class="hole-num">${hole}</span>
          <span class="hole-par">Par ${par}</span>
        </div>
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
    saveScore(hole, val);
  }
});

document.addEventListener("change", (e) => {
  if (e.target.classList.contains("score-input")) {
    const hole = e.target.dataset.hole;
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val > 0) saveScore(hole, val);
  }
});

function saveScore(hole, strokes) {
  if (!myTeam) return;
  scoresRef.child(myTeam).child(hole).set(strokes);
}

// ============================================================
// REALTIME SYNC + BIRDIE ALERTS
// ============================================================
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
  TEAMS.forEach(team => {
    const prevHoles = prev[team] || {};
    const currHoles = curr[team] || {};
    for (let h = 1; h <= HOLE_COUNT; h++) {
      const before = prevHoles[h];
      const after = currHoles[h];
      if (after === undefined || after === null) continue;
      if (before === after) continue; // no change
      const rel = relationToPar(after, PARS[h-1]);
      if (rel === "birdie" || rel === "eagle") {
        announceGoodScore(team, h, rel);
      }
    }
  });
}

function announceGoodScore(team, hole, rel) {
  const label = rel === "eagle" ? "EAGLE" : "BIRDIE";
  showBanner(`${label}! ${team} on hole ${hole}`);
  playChime(rel);
  if (Notification.permission === "granted") {
    try {
      new Notification(`${label} 🐦`, { body: `${team} just carded a ${rel} on hole ${hole}`, icon: "icons/icon-192.png" });
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

// Register service worker for installability + background push
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(e => console.log("SW registration failed:", e.message));
  });
}

// Foreground push messages (when app open but not focused on this tab)
if (messaging) {
  messaging.onMessage((payload) => {
    const { title, body } = payload.notification || {};
    if (title) showBanner(`${title} — ${body || ""}`);
  });
}
