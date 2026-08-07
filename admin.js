// Change this to whatever PIN you want. This is NOT real security —
// the database itself is open read/write to anyone with the link —
// it just stops teammates from accidentally tapping "Reset."
const ADMIN_PIN = "1234";

const TEAM_IDS = ["teamA", "teamB", "teamC"];
const DEFAULT_TEAM_NAMES = { teamA: "Team A", teamB: "Team B", teamC: "Team C" };
const TEAM_ACCENT = { teamA: "#E63946", teamB: "#2A9D8F", teamC: "#E9C46A" };

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const teamNamesRef = db.ref("config/teamNames");
const scoresRef = db.ref("scores");

// ---------------- PIN lock ----------------
document.getElementById("pin-submit").addEventListener("click", unlock);
document.getElementById("pin-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") unlock();
});

function unlock() {
  const val = document.getElementById("pin-input").value;
  if (val === ADMIN_PIN) {
    document.getElementById("lock-screen").style.display = "none";
    document.getElementById("admin-panel").style.display = "block";
    initPanel();
  } else {
    document.getElementById("pin-status").textContent = "Wrong PIN, try again.";
  }
}

// ---------------- Panel ----------------
function initPanel() {
  let currentNames = { ...DEFAULT_TEAM_NAMES };

  teamNamesRef.on("value", (snap) => {
    currentNames = { ...DEFAULT_TEAM_NAMES, ...(snap.val() || {}) };
    renderNameFields(currentNames);
  });

  function renderNameFields(names) {
    const wrap = document.getElementById("name-fields");
    wrap.innerHTML = TEAM_IDS.map(id => `
      <div class="name-row">
        <span class="dot" style="background:${TEAM_ACCENT[id]}"></span>
        <input type="text" data-team="${id}" value="${names[id]}" maxlength="24">
      </div>
    `).join("");
  }

  document.getElementById("save-names").addEventListener("click", async () => {
    const updates = {};
    document.querySelectorAll("#name-fields input").forEach(input => {
      const val = input.value.trim();
      if (val) updates[input.dataset.team] = val;
    });
    const statusEl = document.getElementById("names-status");
    statusEl.textContent = "Saving...";
    try {
      await teamNamesRef.update(updates);
      statusEl.textContent = "Saved ✓";
      setTimeout(() => statusEl.textContent = "", 2000);
    } catch (e) {
      statusEl.textContent = "Error: " + e.message;
    }
  });

  document.getElementById("reset-scores").addEventListener("click", async () => {
    const first = confirm("Reset ALL scores for all three teams? This cannot be undone.");
    if (!first) return;
    const second = confirm("Really sure? Everyone's scores for every hole will be cleared right now.");
    if (!second) return;
    const statusEl = document.getElementById("reset-status");
    statusEl.textContent = "Resetting...";
    try {
      await scoresRef.remove();
      statusEl.textContent = "All scores cleared ✓";
      setTimeout(() => statusEl.textContent = "", 3000);
    } catch (e) {
      statusEl.textContent = "Error: " + e.message;
    }
  });
}
