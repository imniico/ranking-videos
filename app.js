// ===== Utilidades YouTube =====
function parseYouTubeId(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1) || null;
    if (u.hostname.includes("youtube.com")) {
      if (u.searchParams.get("v")) return u.searchParams.get("v");
      const m = u.pathname.match(/\/shorts\/([\w-]{6,})/);
      if (m) return m[1];
    }
  } catch {
    return null;
  }
  return null;
}
function thumbUrl(id) {
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}
function esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        m
      ])
  );
}

// === oEmbed: obtiene título e imagen (sin API key)
async function fetchOEmbed(url) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(
        url
      )}&format=json`
    );
    if (!res.ok) throw new Error("oembed fail");
    return await res.json(); // {title, thumbnail_url,...}
  } catch {
    const id = parseYouTubeId(url);
    return id ? { title: id, thumbnail_url: thumbUrl(id) } : null;
  }
}

// ===== Config dinámico =====
const VIDEOS_PER_PLAYER = 5;
function poolTarget() {
  return STATE.players.length * VIDEOS_PER_PLAYER;
}
function ensurePlayers(n) {
  const cur = STATE.players.length;
  if (n === cur) return;
  if (n > cur) {
    for (let i = cur; i < n; i++) {
      STATE.players.push({
        name: `Jugador ${i + 1}`,
        videos: Array.from({ length: VIDEOS_PER_PLAYER }, () => ""),
      });
    }
  } else {
    const removed = STATE.players.slice(n).map((p) => p.name);
    removed.forEach((name) => delete STATE.ballots[name]);
    STATE.players = STATE.players.slice(0, n);
  }
}

// ===== Estado =====
const STATE = {
  players: Array.from({ length: 5 }, (_, i) => ({
    name: `Jugador ${i + 1}`,
    videos: ["", "", "", "", ""],
  })),
  pool: [], // [{id, submitter, url}]
  ballots: {}, // {playerName: [ids]}
  meta: {}, // {id: {title, thumbnail}}
};

// ==== Helpers de reveal (agregar cerca de tu STATE) ====
if (!STATE.reveal) {
  STATE.reveal = { videos: {}, players: {} }; // videos por id, players por nombre
}
function isRevealed(type, key) {
  return !!STATE.reveal?.[type]?.[key];
}
function setRevealed(type, key, val) {
  if (!STATE.reveal) STATE.reveal = { videos: {}, players: {} };
  STATE.reveal[type] ||= {};
  STATE.reveal[type][key] = !!val;
  saveLS();
}

// ===== Persistencia =====
const LS_KEY = "TOP10STATE";
function loadLS() {
  try {
    const s = localStorage.getItem(LS_KEY);
    if (!s) return;
    const obj = JSON.parse(s);
    Object.assign(STATE, obj);
  } catch {}
}
let DISABLE_AUTOSAVE = false;

function saveLS() {
  if (DISABLE_AUTOSAVE) return; // ← corta el autosave si está apagado
  localStorage.setItem(LS_KEY, JSON.stringify(STATE));
}

window.addEventListener("beforeunload", saveLS);

// (opcional) no recargar desde storage si estamos reseteando
window.addEventListener("storage", (e) => {
  if (e.key === LS_KEY && !DISABLE_AUTOSAVE) loadLS();
});

// ===== DOM refs =====
const stepper = document.getElementById("stepper");
const step1 = document.getElementById("step1");
const step2 = document.getElementById("step2");
const step3 = document.getElementById("step3");
const playersForm = document.getElementById("playersForm");
const poolList = document.getElementById("poolList");
const top10 = document.getElementById("top10");
const playerPicker = document.getElementById("playerPicker");
const pickInfo = document.getElementById("pickInfo");
const savedState = document.getElementById("savedState");
const playerCountSel = document.getElementById("playerCount");

// Toolbar Step 1
const btnDemo = document.getElementById("btnDemo");
const btnExport = document.getElementById("btnExport");
const btnImport = document.getElementById("btnImport");
const importFile = document.getElementById("importFile");

// Step 3 toolbar
const btnReset = document.getElementById("btnReset");
const btnExportAll = document.getElementById("btnExportAll");
const btnImportAll = document.getElementById("btnImportAll");
const importAll = document.getElementById("importAll");

// ===== UI =====
function renderStepper(active) {
  const steps = [`Carga`, `Votación`, "Resultados"];
  stepper.innerHTML = steps
    .map(
      (s, i) =>
        `<span class="chip ${i === active ? "active" : ""}">${
          i + 1
        }. ${s}</span>`
    )
    .join("");
}

function previewHTML(url) {
  const id = parseYouTubeId(url);
  if (!id) return "";
  const meta = STATE.meta[id];
  const title = esc(meta?.title || id);
  const img = meta?.thumbnail || thumbUrl(id);
  return `<div class="url-preview"><img src="${img}" alt="thumb" loading="lazy"/><div class="t">${title}</div></div>`;
}

function renderPlayersForm() {
  playersForm.innerHTML = "";
  STATE.players.forEach((p, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "panel";
    wrap.innerHTML = `
      <div class="v-gap">
        <div class="row" style="justify-content:space-between;align-items:center">
          <h3 style="text-wrap: nowrap">🎮</h3>
          <input class="input" value="${esc(
            p.name
          )}" placeholder="Nombre del jugador" data-ptype="name" data-i="${idx}"/>
        </div>
        <div class="v-gap">
          ${Array.from({ length: VIDEOS_PER_PLAYER }, (_, v) => {
            const val = p.videos[v] || "";
            return `
              <div class="v-gap">
                <label>URL Video ${v + 1}</label>
                <input class="input url-input" placeholder="https://www.youtube.com/watch?v=…" value="${val}" data-ptype="url" data-i="${idx}" data-v="${v}"/>
                <div class="urlp" data-prev="${idx}-${v}">${
              val ? previewHTML(val) : ""
            }</div>
              </div>`;
          }).join("")}
        </div>
      </div>`;
    playersForm.appendChild(wrap);
  });

  // listeners
  playersForm.querySelectorAll('input[data-ptype="name"]').forEach((inp) => {
    inp.addEventListener("input", () => {
      const i = +inp.dataset.i;
      STATE.players[i].name = inp.value.trim() || `Jugador ${i + 1}`;
      saveLS();
      updateCounts();
    });
  });

  playersForm.querySelectorAll('input[data-ptype="url"]').forEach((inp) => {
    inp.addEventListener("drop", (e) => {
      e.preventDefault();
      const t = e.dataTransfer.getData("text");
      inp.value = t;
      inp.dispatchEvent(new Event("input"));
    });
    inp.addEventListener("dragover", (e) => e.preventDefault());

    let tId;
    inp.addEventListener("input", async () => {
      STATE.players[+inp.dataset.i].videos[+inp.dataset.v] = inp.value.trim();
      saveLS();
      updateCounts();

      clearTimeout(tId);
      tId = setTimeout(async () => {
        const url = inp.value.trim();
        const id = parseYouTubeId(url);
        const box = playersForm.querySelector(
          `.urlp[data-prev="${inp.dataset.i}-${inp.dataset.v}"]`
        );
        if (!id) {
          if (box) box.innerHTML = "";
          return;
        }
        if (!STATE.meta[id]) {
          const info = await fetchOEmbed(url);
          if (info)
            STATE.meta[id] = {
              title: info.title || id,
              thumbnail: info.thumbnail_url || thumbUrl(id),
            };
          saveLS();
        }
        if (box) box.innerHTML = previewHTML(url);
      }, 300);
    });
  });
}

function buildPool() {
  const entries = [];
  const seen = new Set();
  let duplicate = false;
  STATE.players.forEach((p) => {
    p.videos.forEach((url) => {
      const id = parseYouTubeId(url);
      if (id) {
        if (seen.has(id)) duplicate = true;
        else seen.add(id);
        entries.push({ id, submitter: p.name, url });
      }
    });
  });
  document.getElementById("dupWarn").style.display = duplicate
    ? "inline-flex"
    : "none";

  const target = poolTarget();
  STATE.pool = entries.slice(0, target);
  document.getElementById(
    "vCount"
  ).textContent = `${STATE.pool.length}/${target}`;

  return STATE.pool.length === target && !duplicate;
}
function updateCounts() {
  buildPool();
}

// Demo
function loadDemo() {
  const sampleIds = [
    "TqyfmFaZlqw",
    "XB2KAZNOTqQ",
    "dOVWGxU5YsU",
    "ZT47CtWGeyM",
    "K5hVDpq6SFA",
    "F9GXgPHeKfA",
    "udNgJUiBCRg",
    "tty54CzXZDg",
    "isY3rtuSsK8",
    "0NJCpJZ19n8",
    "N8wfYwSDTa4",
    "b4vc629T4b8",
    "C0ppulkmXPw",
    "XXV6oIory8s",
    "6ju-nnihCnQ",
    "W2_V7X6fJ18",
    "5RaU8K8sLTM",
    "65xX7zyr-fA",
    "jYDLbuxWIu0",
    "EJAEzPwcQPs",
    "d6NPs3OQIAU",
    "NMA_isZYsYQ",
    "m9SMT5ipbxk",
    "Jg73p9udbAQ",
    "8A0hgdWuRnI",
    "U4pM3yB9KtU",
    "f7IqLjwzOD8",
    "UpmSK1GPlBc",
    "MUQIQLsfGDY",
    "EqnuF2WyhbU",
    "N0ixzrZe--0",
    "EE63e2RJlpc",
    "e_1P-EX-mz8",
    "mJ1N7-HyH1A",
    "a_RcfZoBBo8",
    "2eNEQ0cQtkI",
    "gxp3R7l1iSk",
    "qpHvj5pvvhg",
    "8QPyFlJNmus",
    "zqKrpw36xnU",
    "wNjvuRZtQeI",
    "k0g04t7ZeSw",
    "9LW9DpmhrPE",
    "GA9Yw5t-Mto",
    "1zwaZkOXXqw",
    "pIZ_tApNslQ",
    "QLoyZcco8NQ",
    "y2gF6jK2NQ0",
    "7NF5hfJ7BBg",
    "4u4muFfkbJQ",
  ];
  const n = STATE.players.length;
  ensurePlayers(n);

  STATE.players.forEach((p, i) => {
    p.name = `Jugador ${i + 1}`;
    const sliceStart = i * VIDEOS_PER_PLAYER;
    const sliceEnd = sliceStart + VIDEOS_PER_PLAYER;
    p.videos = sampleIds
      .slice(sliceStart, sliceEnd)
      .map((id) => `https://youtu.be/${id}`);
  });
  renderPlayersForm();
  updateCounts();

  // precarga meta (best-effort)
  STATE.players
    .flatMap((p) => p.videos)
    .forEach(async (url) => {
      const id = parseYouTubeId(url);
      if (id && !STATE.meta[id]) {
        const info = await fetchOEmbed(url);
        if (info)
          STATE.meta[id] = {
            title: info.title || id,
            thumbnail: info.thumbnail_url || thumbUrl(id),
          };
      }
    });
}

// Export/Import setup
function safeArrayOfStrings(a, len) {
  return (
    Array.isArray(a) &&
    a.length === len &&
    a.every((x) => typeof x === "string")
  );
}
function exportSetup() {
  const data = JSON.stringify({ players: STATE.players }, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "setup_videos.json";
  a.click();
}
function importSetup(file) {
  file.text().then((txt) => {
    try {
      const obj = JSON.parse(txt);
      if (
        Array.isArray(obj.players) &&
        obj.players.length >= 2 &&
        obj.players.length <= 10 &&
        obj.players.every(
          (p) =>
            typeof p.name === "string" &&
            safeArrayOfStrings(p.videos, VIDEOS_PER_PLAYER)
        )
      ) {
        ensurePlayers(obj.players.length);
        STATE.players = obj.players;
        renderPlayersForm();
        updateCounts();
        if (playerCountSel) playerCountSel.value = String(STATE.players.length);
        saveLS();
      } else throw new Error();
    } catch {
      alert("Archivo inválido");
    }
  });
}

// ===== Step 2: Votación =====
function toStep2() {
  const target = poolTarget();
  if (!buildPool() || STATE.pool.length !== target) {
    alert(
      `Necesitás ${target} videos (${STATE.players.length} jugadores × ${VIDEOS_PER_PLAYER}) y sin duplicados.`
    );
    return;
  }
  step1.style.display = "none";
  step2.style.display = "block";
  step3.style.display = "none";
  renderStepper(1);

  // llenar select y pintar vistas iniciales
  playerPicker.innerHTML = STATE.players
    .map((p) => `<option>${esc(p.name)}</option>`)
    .join("");
  const name = playerPicker.value;
  renderPool(name);
  loadBallotFor(name);
}

// ===== grilla por jugador (filas) =====
function renderPool(viewPlayerName) {
  const currentPlayer =
    viewPlayerName || playerPicker.value || STATE.players[0]?.name || "";

  // asegurar meta (no bloqueante)
  STATE.pool.forEach(async (v) => {
    if (!STATE.meta[v.id]) {
      const info = await fetchOEmbed(v.url);
      if (info) {
        STATE.meta[v.id] = {
          title: info.title || v.id,
          thumbnail: info.thumbnail_url || thumbUrl(v.id),
        };
      }
    }
  });

  const byPlayer = {};
  STATE.players.forEach((p) => (byPlayer[p.name] = []));
  STATE.pool.forEach((v) => (byPlayer[v.submitter] ||= []).push(v));

  let html = `<div class="pool-rows">`;
  STATE.players.forEach((p) => {
    const vids = byPlayer[p.name] || [];
    html += `
      <div class="pool-row">
        <div class="pool-row-head">${esc(p.name)}</div>
        <div class="pool-row-videos">
          ${vids
            .map((v) => {
              const meta = STATE.meta[v.id] || {};
              const img = meta.thumbnail || thumbUrl(v.id);
              const title = esc(meta.title || v.id);

              // estado relativo al jugador visible
              const rankIdx = ballotOf(currentPlayer).indexOf(v.id);
              const isPicked = rankIdx !== -1;
              const rankNum = isPicked ? rankIdx + 1 : null;

              return `
              <div class="card ${isPicked ? "picked" : ""}"
                   draggable="true"
                   data-id="${v.id}"
                   ondragstart="onDragStart(event)"
                   title="Arrastrá a la derecha para agregar">
                <div class="media">
                  ${
                    isPicked ? `<div class="rank-overlay">${rankNum}</div>` : ""
                  }
                  <a href="${
                    v.url
                  }" target="_blank" rel="noopener noreferrer" title="Abrir en YouTube">
                    <img src="${img}" alt="thumb" loading="lazy">
                  </a>
                </div>
                <div class="content">
                  <div style="font-weight:700">${title}</div>
                  <div style="margin-top:8px; display:flex; justify-content:center">
                    ${
                      isPicked
                        ? `<button class="ok topten" disabled>En Top #${rankNum}</button>`
                        : `<button class="ghost topten" onclick="addToTop10('${v.id}')">Añadir al top</button>`
                    }
                  </div>
                </div>
              </div>`;
            })
            .join("")}
        </div>
      </div>`;
  });
  html += `</div>`;

  poolList.innerHTML = html; // rerender
}

// ===== Handlers: SIEMPRE refrescar pool del jugador visible =====
window.addToTop10 = function (id) {
  const name = playerPicker.value;
  const cur = ballotOf(name).slice();
  if (cur.length >= 10) {
    alert("Ya elegiste 10. Quitá alguno para agregar otro.");
    return;
  }
  if (cur.includes(id)) return;
  cur.push(id);
  setBallot(name, cur);
  renderTop10(name);
  renderPool(name); // ← pinta la card (verde + #)
};

window.removeFromTop10 = function (index) {
  const name = playerPicker.value;
  const cur = ballotOf(name).slice();
  cur.splice(index, 1);
  setBallot(name, cur);
  renderTop10(name);
  renderPool(name); // ← desmarca la card
};

window.moveItem = function (oldIndex, newIndex) {
  const name = playerPicker.value;
  const a = ballotOf(name).slice();
  if (newIndex < 0 || newIndex >= a.length) return;
  const [it] = a.splice(oldIndex, 1);
  a.splice(newIndex, 0, it);
  setBallot(name, a);
  renderTop10(name);
  renderPool(name); // ← actualiza el # en el overlay
};

// ===== Cambiar de jugador visible =====
playerPicker.addEventListener("change", () => {
  const name = playerPicker.value;
  loadBallotFor(name);
  renderPool(name); // ← importante
});

// ===== Botones de la toolbar del Paso 2 =====
document.getElementById("autoPick").addEventListener("click", () => {
  const name = playerPicker.value;
  setBallot(name, randomBallot());
  renderTop10(name);
  renderPool(name); // ← refleja picks al instante
});

document.getElementById("clearPick").addEventListener("click", () => {
  const name = playerPicker.value;
  setBallot(name, []);
  renderTop10(name);
  renderPool(name); // ← limpia estados en cards
});

function currentPlayerName() {
  return playerPicker?.value || STATE.players[0]?.name || "";
}

// Drag & drop handlers (scope global)
window.onDragStart = function (ev) {
  ev.dataTransfer.setData("text/plain", ev.currentTarget.dataset.id);
};
top10.addEventListener("dragover", (e) => {
  e.preventDefault();
  top10.classList.add("dragover");
});
top10.addEventListener("dragleave", () => top10.classList.remove("dragover"));
top10.addEventListener("drop", (e) => {
  e.preventDefault();
  top10.classList.remove("dragover");
  const id = e.dataTransfer.getData("text/plain");
  addToTop10(id);
});

function ballotOf(name) {
  return STATE.ballots[name] || [];
}
function setBallot(name, arr) {
  STATE.ballots[name] = arr.slice(0, 10);
  saveLS();
  updatePickInfo();
}
function inBallot(name, id) {
  return ballotOf(name).includes(id);
}

// ——— Añadir desde la card
window.addToTop10 = function (id) {
  const name = currentPlayerName();
  const cur = ballotOf(name).slice();

  if (cur.length >= 10) {
    alert("Ya elegiste 10. Quitá alguno para agregar otro.");
    return;
  }
  if (cur.includes(id)) return;

  cur.push(id);
  setBallot(name, cur);

  // repintar ambas vistas
  renderTop10(name);
  renderPool(name);
};

// ——— Quitar desde la lista (botón X)
window.removeFromTop10 = function (index) {
  const name = currentPlayerName();
  const cur = ballotOf(name).slice();

  if (index < 0 || index >= cur.length) return;
  cur.splice(index, 1);
  setBallot(name, cur);

  // repintar ambas vistas
  renderTop10(name);
  renderPool(name);
};

// ——— Reordenar (por si lo usás con ▲ / ▼ o drag&drop)
window.moveItem = function (oldIndex, newIndex) {
  const name = currentPlayerName();
  const arr = ballotOf(name).slice();

  if (newIndex < 0 || newIndex >= arr.length) return;
  const [it] = arr.splice(oldIndex, 1);
  arr.splice(newIndex, 0, it);
  setBallot(name, arr);

  // repintar ambas vistas
  renderTop10(name);
  renderPool(name);
};

function renderTop10(name) {
  top10.innerHTML = "";
  ballotOf(name).forEach((id, idx) => {
    const v = STATE.pool.find((x) => x.id === id);
    const meta = STATE.meta[id] || {};
    const title = esc(meta.title || id);
    const img = meta.thumbnail || thumbUrl(id);
    const row = document.createElement("div");
    row.className = "mini";
    row.draggable = true;
    row.dataset.index = idx;
    row.tabIndex = 0;
    row.innerHTML = `
      <div class="rank">${idx + 1}</div>
      <img src="${img}" alt="thumb">
      <div style="flex:1">
        <div class="title">${title}</div>
        <div class="muted" style="font-size:.8rem">propuesto por ${esc(
          v?.submitter || "?"
        )}</div>
      </div>
      <div class="row right">
        <button class="ghost" title="Subir" onclick="moveItem(${idx},${
      idx - 1
    })">▲</button>
        <button class="ghost" title="Bajar" onclick="moveItem(${idx},${
      idx + 1
    })">▼</button>
        <button class="warn" title="Quitar" onclick="removeFromTop10(${idx})">X</button>
      </div>`;
    row.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", idx);
    });
    row.addEventListener("dragover", (e) => e.preventDefault());
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      const from = +e.dataTransfer.getData("text/plain");
      const to = +row.dataset.index;
      if (!isNaN(from) && !isNaN(to) && from !== to) moveItem(from, to);
    });
    top10.appendChild(row);
  });
  updatePickInfo();
}

top10.addEventListener("keydown", (e) => {
  const row = e.target.closest(".mini");
  if (!row) return;
  const idx = +row.dataset.index;
  if (e.key === "ArrowUp") {
    window.moveItem(idx, idx - 1);
    e.preventDefault();
  }
  if (e.key === "ArrowDown") {
    window.moveItem(idx, idx + 1);
    e.preventDefault();
  }
  if (e.key === "Delete") {
    window.removeFromTop10(idx);
    e.preventDefault();
  }
});

function updatePickInfo() {
  const name = playerPicker.value;
  const n = ballotOf(name).length;
  pickInfo.textContent = `${n}/10 seleccionados`;
}
function loadBallotFor(name) {
  renderTop10(name);
  savedState.textContent = STATE.ballots[name] ? "Voto guardado." : "";
}
function randomBallot() {
  const ids = STATE.pool.map((v) => v.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, 10);
}

// ===== Step 3: Resultados =====
function toStep3() {
  const missing = STATE.players
    .filter((p) => (STATE.ballots[p.name] || []).length !== 10)
    .map((p) => p.name);
  if (missing.length) {
    if (
      !confirm(
        `Hay jugadores sin completar 10 picks:\n\n${missing.join(
          ", "
        )}\n\n¿Calcular igual?`
      )
    )
      return;
  }
  step1.style.display = "none";
  step2.style.display = "none";
  step3.style.display = "block";
  renderStepper(2);
  renderResults();
}
function scoreBallots() {
  const points = {},
    firsts = {},
    sumRanks = {},
    counts = {};
  const who = {};
  STATE.pool.forEach((v) => (who[v.id] = v.submitter));
  Object.values(STATE.ballots).forEach((arr) => {
    arr.forEach((id, idx) => {
      const pts = 10 - idx;
      points[id] = (points[id] || 0) + pts;
      sumRanks[id] = (sumRanks[id] || 0) + (idx + 1);
      counts[id] = (counts[id] || 0) + 1;
      if (idx === 0) firsts[id] = (firsts[id] || 0) + 1;
    });
  });
  STATE.pool.forEach((v) => {
    points[v.id] ||= 0;
    firsts[v.id] ||= 0;
    sumRanks[v.id] ||= 0;
    counts[v.id] ||= 0;
  });
  const rows = STATE.pool.map((v) => {
    const id = v.id,
      total = points[id],
      f = firsts[id],
      c = counts[id];
    const avg = c ? sumRanks[id] / c : Infinity;
    return {
      id,
      submitter: v.submitter,
      url: v.url,
      total,
      firsts: f,
      avg,
      votes: c,
    };
  });
  rows.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (b.firsts !== a.firsts) return b.firsts - a.firsts;
    if (a.avg !== b.avg) return a.avg - b.avg;
    return a.id.localeCompare(b.id);
  });
  return rows;
}
function renderResults() {
  const resultsDiv = document.getElementById("results");
  const rows = scoreBallots();

  // ===== TOP FINAL (videos) =====
  const minVideoPts = Math.min(...rows.map((r) => r.total));
  const maxVideoPts = Math.max(1, ...rows.map((r) => r.total));
  const spanVideos = Math.max(1, maxVideoPts - minVideoPts);

  const topVideosHTML = `
  <table class="table">
    <thead>
      <tr>
        <th></th><th>#</th><th>Video</th><th>Propuesto por</th><th>Puntos</th><th>#1</th><th>Prom. puesto</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map((r, i) => {
          const meta = STATE.meta[r.id] || {};
          const title = esc(meta.title || r.id);
          const img = meta.thumbnail || thumbUrl(r.id);

          const pct = Math.round(((r.total - minVideoPts) / spanVideos) * 100);
          const pctWithFloor = Math.max(6, pct);

          const revealed = isRevealed("videos", r.id);
          const trClass = revealed ? "" : "concealed";
          const btnText = revealed ? "Ocultar" : "Mostrar";

          return `
          <tr class="${trClass}">
            <td class="reveal-cell">
              <button class="ghost reveal-btn" data-type="videos" data-key="${
                r.id
              }">${btnText}</button>
            </td>

            <td><div class="concealable">${i + 1}</div></td>

            <td>
              <div class="concealable">
                <div class="row" style="gap:10px;align-items:center">
                  <img src="${img}" alt="t" style="width:96px;height:54px;border-radius:8px;object-fit:cover"/>
                  <div class="v-gap">
                    <a href="${
                      r.url
                    }" target="_blank" rel="noopener noreferrer" style="color:var(--text);text-decoration:none">${title}</a>
                    
                  </div>
                </div>
              </div>
            </td>

            <td><div class="concealable">${esc(r.submitter)}</div></td>

            <td style="min-width:240px">
              <div class="concealable">
                <div class="row" style="gap:10px;align-items:center">
                  <strong>${r.total}</strong>
                  <span class="muted"> · ${r.votes} votos</span>
                  <div class="track">
                    <div class="bar" style="width:${pctWithFloor}%"></div>
                  </div>
                </div>
              </div>
            </td>

            <td><div class="concealable">${r.firsts}</div></td>
            <td><div class="concealable">${
              r.avg === Infinity ? "—" : r.avg.toFixed(2)
            }</div></td>
          </tr>`;
        })
        .join("")}
    </tbody>
  </table>`;

  // ===== TOP DE JUGADORES =====
  const byPlayer = {};
  rows.forEach((r) => {
    const p = r.submitter || "—";
    if (!byPlayer[p])
      byPlayer[p] = {
        player: p,
        total: 0,
        firsts: 0,
        votes: 0,
        videosConVotos: 0,
      };
    byPlayer[p].total += r.total;
    byPlayer[p].firsts += r.firsts;
    byPlayer[p].votes += r.votes;
    if (r.votes > 0 || r.total > 0) byPlayer[p].videosConVotos += 1;
  });
  const players = Object.values(byPlayer).sort(
    (a, b) =>
      b.total - a.total ||
      b.firsts - a.firsts ||
      b.votes - a.votes ||
      a.player.localeCompare(b.player)
  );

  const minPlayerPts = Math.min(...players.map((p) => p.total));
  const maxPlayerPts = Math.max(1, ...players.map((p) => p.total));
  const spanPlayers = Math.max(1, maxPlayerPts - minPlayerPts);

  const topPlayersHTML = `
  <h3 style="margin-top:18px">Top de jugadores</h3>
  <table class="table">
    <thead>
      <tr>
        <th></th><th>#</th><th>Jugador</th><th>Puntos</th><th>#1</th><th>Videos con votos</th>
      </tr>
    </thead>
    <tbody>
      ${players
        .map((p, i) => {
          const pct = Math.round(
            ((p.total - minPlayerPts) / spanPlayers) * 100
          );
          const pctWithFloor = Math.max(6, pct);

          const revealed = isRevealed("players", p.player);
          const trClass = revealed ? "" : "concealed";
          const btnText = revealed ? "Ocultar" : "Mostrar";

          return `
        <tr class="${trClass}">
          <td class="reveal-cell">
            <button class="ghost reveal-btn" data-type="players" data-key="${
              p.player
            }">${btnText}</button>
          </td>

          <td><div class="concealable">${i + 1}</div></td>

          <td><div class="concealable">${esc(p.player)}</div></td>

          <td style="min-width:240px">
            <div class="concealable">
              <div class="row" style="gap:10px;align-items:center">
                <strong>${p.total}</strong>
                <div class="track">
                  <div class="bar" style="width:${pctWithFloor}%"></div>
                </div>
              </div>
            </div>
          </td>

          <td><div class="concealable">${p.firsts}</div></td>
          <td><div class="concealable">${p.videosConVotos}</div></td>
        </tr>`;
        })
        .join("")}
    </tbody>
  </table>`;

  // Render combinado de los dos tops
  resultsDiv.innerHTML = topVideosHTML + topPlayersHTML;

  // ===== VOTOS POR JUGADOR (grid 5 columnas) =====
  const ballotsDiv = document.getElementById("ballots");
  ballotsDiv.innerHTML = STATE.players
    .map((p) => {
      const arr = STATE.ballots[p.name] || [];
      const lis = arr
        .map((id, idx) => {
          const v = STATE.pool.find((x) => x.id === id);
          const meta = STATE.meta[id] || {};
          const title = esc(meta.title || id);
          const img = meta.thumbnail || thumbUrl(id);
          return `
          <div class="mini">
            <div class="rank">${idx + 1}</div>
            <img src="${img}" alt="thumb"/>
            <div style="flex:1">
              <div class="title">${title}</div>
              <div class="muted">de ${esc(v?.submitter || "?")} · 
                <a href="${
                  v?.url || "#"
                }" target="_blank" rel="noopener noreferrer">link</a>
              </div>
            </div>
          </div>`;
        })
        .join("");

      return `
        <div class="panel" style="margin:12px 0">
          <h3>${esc(p.name)}</h3>
          <div class="grid-votos" style="margin-top:8px">
            ${lis || '<span class="muted">Sin voto</span>'}
          </div>
        </div>`;
    })
    .join("");
}

// ==== Listener de revelar/ocultar (una sola vez, después de definir renderResults) ====
document.getElementById("results").addEventListener("click", (e) => {
  const btn = e.target.closest(".reveal-btn");
  if (!btn) return;

  const type = btn.dataset.type; // 'videos' | 'players'
  const key = btn.dataset.key; // id de video o nombre de jugador
  const tr = btn.closest("tr");
  const wasRevealed = isRevealed(type, key);
  const now = !wasRevealed;

  setRevealed(type, key, now);
  tr.classList.toggle("concealed", !now);
  btn.textContent = now ? "Ocultar" : "Mostrar";
});

// ===== Export/Import de partida completa =====
function exportAll() {
  const data = JSON.stringify(STATE, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "partida_top10.json";
  a.click();
}
function importAllFile(file) {
  file.text().then((txt) => {
    const obj = JSON.parse(txt);
    if (obj && Array.isArray(obj.players) && Array.isArray(obj.pool)) {
      ensurePlayers(obj.players.length);
      STATE.players = obj.players;
      STATE.pool = obj.pool;
      STATE.ballots = obj.ballots || {};
      STATE.meta = obj.meta || {};

      step1.style.display = "none";
      step2.style.display = "none";
      step3.style.display = "block";
      renderStepper(2);

      renderPlayersForm();
      fillPlayerPicker();
      renderPool();
      renderResults();

      if (playerCountSel) playerCountSel.value = String(STATE.players.length);
      if (!playerPicker.value && STATE.players.length) {
        playerPicker.value = STATE.players[0].name;
      }
      loadBallotFor(playerPicker.value);
      saveLS();
    } else alert("Archivo inválido.");
  });
}
function fillPlayerPicker() {
  playerPicker.innerHTML = STATE.players
    .map((p) => `<option>${esc(p.name)}</option>`)
    .join("");
}

// ===== Eventos =====
loadLS();

// Sincroniza el selector con estado (por si LS tenía otra cantidad)
if (playerCountSel) playerCountSel.value = String(STATE.players?.length || 5);

renderPlayersForm();
updateCounts();
renderStepper(0);

// Step 1 toolbar
btnDemo.addEventListener("click", loadDemo);
btnExport.addEventListener("click", exportSetup);
btnImport.addEventListener("click", () => importFile.click());
importFile.addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (f) importSetup(f);
  e.target.value = "";
});
document.getElementById("toStep2").addEventListener("click", toStep2);
const btnClearAll = document.getElementById("btnClearAll");
btnClearAll.addEventListener("click", () => {
  if (!confirm("¿Seguro que querés limpiar todos los videos cargados?")) return;
  STATE.players.forEach((p) => {
    p.videos = Array.from({ length: VIDEOS_PER_PLAYER }, () => "");
  });
  STATE.pool = [];
  updateCounts();
  renderPlayersForm();
  saveLS();
});

// Cambio de cantidad de jugadores
if (playerCountSel) {
  playerCountSel.addEventListener("change", () => {
    const n = Math.max(
      2,
      Math.min(10, parseInt(playerCountSel.value, 10) || 5)
    );
    ensurePlayers(n);
    renderPlayersForm();
    updateCounts();
    saveLS();
    renderStepper(0);
  });
}

// Step 2
playerPicker.addEventListener("change", () =>
  loadBallotFor(playerPicker.value)
);
document.getElementById("autoPick").addEventListener("click", () => {
  setBallot(playerPicker.value, randomBallot());
  renderTop10(playerPicker.value);
});
document.getElementById("clearPick").addEventListener("click", () => {
  setBallot(playerPicker.value, []);
  renderTop10(playerPicker.value);
});
document.getElementById("saveBallot").addEventListener("click", () => {
  savedState.textContent = "Voto guardado.";
  saveLS();
});
document.getElementById("toStep3").addEventListener("click", toStep3);
document.getElementById("back1").addEventListener("click", () => {
  step1.style.display = "block";
  step2.style.display = "none";
  step3.style.display = "none";
  renderStepper(0);
});

// Step 3
btnReset.addEventListener("click", () => {
  if (!confirm("¿Seguro que querés reiniciar todo?")) return;

  DISABLE_AUTOSAVE = true; // ← bloquea el autosave
  window.removeEventListener("beforeunload", saveLS); // ← quita el listener

  // Limpia estado in-memory
  STATE.players.forEach((p, i) => {
    p.name = p.name || `Jugador ${i + 1}`;
    p.videos = Array.from({ length: VIDEOS_PER_PLAYER }, () => "");
  });
  STATE.pool = [];
  STATE.ballots = {};
  STATE.meta = {};

  // Limpia LS y recarga
  localStorage.removeItem(LS_KEY);
  setTimeout(() => location.reload(), 0); // micro-tick para evitar saves “colgados”
});

btnExportAll.addEventListener("click", exportAll);
btnImportAll.addEventListener("click", () => importAll.click());
importAll.addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (f) importAllFile(f);
  e.target.value = "";
});
// ===== Botón Volver a votación =====
// ===== Botón Volver a votación =====
document.getElementById("back2").addEventListener("click", () => {
  // 1️⃣ Ocultar todas las filas nuevamente
  STATE.reveal = { videos: {}, players: {} };
  saveLS();

  // 2️⃣ Volver al paso 2 (votación)
  step1.style.display = "none";
  step2.style.display = "block";
  step3.style.display = "none";
  renderStepper(1);
  renderPool();
  fillPlayerPicker();
  loadBallotFor(playerPicker.value);
});
