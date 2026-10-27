(function () {
  "use strict";

  const clp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
  const clpUnit = (n) => clp.format(Number.isFinite(n) ? n : 0);

  function genId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "id_" + Date.now() + "_" + Math.random().toString(16).slice(2);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------- Local storage store ----------
  const STORE_KEYS = {
    printers: "taller3d_printers",
    materials: "taller3d_materials",
    tools: "taller3d_tools",
    quotes: "taller3d_quotes",
    jobs: "taller3d_jobs",
    theme: "taller3d_theme",
  };

  function loadArr(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("No se pudo leer", key, e);
      return [];
    }
  }

  function saveArr(key, arr) {
    try {
      localStorage.setItem(key, JSON.stringify(arr));
      return true;
    } catch (e) {
      console.error("No se pudo guardar", key, e);
      alert("No se pudo guardar. El almacenamiento del navegador podría estar lleno (esto pasa sobre todo con muchas fotos de impresoras).");
      return false;
    }
  }

  let printers = loadArr(STORE_KEYS.printers);
  let materials = loadArr(STORE_KEYS.materials);
  let toolsItems = loadArr(STORE_KEYS.tools);
  let quotes = loadArr(STORE_KEYS.quotes);
  let jobs = loadArr(STORE_KEYS.jobs);

  function formatHours(h) {
    const n = Number.isFinite(h) ? h : 0;
    return (Math.round(n * 10) / 10).toLocaleString("es-CL") + " h";
  }

  function statusForRatio(ratio) {
    if (ratio >= 1) return "critical";
    if (ratio >= 0.7) return "warning";
    return "good";
  }

  // ---------- Theme ----------
  const themeToggleBtn = document.getElementById("btn-theme-toggle");
  function applyStoredTheme() {
    const stored = localStorage.getItem(STORE_KEYS.theme);
    if (stored === "light" || stored === "dark") {
      document.documentElement.setAttribute("data-theme", stored);
      themeToggleBtn.textContent = stored === "dark" ? "☀" : "🌙";
    } else {
      themeToggleBtn.textContent = "🌙";
    }
  }
  themeToggleBtn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const effectiveDark = current ? current === "dark" : prefersDark;
    const next = effectiveDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(STORE_KEYS.theme, next);
    themeToggleBtn.textContent = next === "dark" ? "☀" : "🌙";
  });
  applyStoredTheme();

  // ---------- Tabs ----------
  const tabButtons = document.querySelectorAll(".tab-btn");
  const panels = document.querySelectorAll(".panel-view");
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabButtons.forEach((b) => { b.classList.remove("active"); b.setAttribute("aria-selected", "false"); });
      panels.forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      document.querySelector(`.panel-view[data-panel="${btn.dataset.tab}"]`).classList.add("active");
    });
  });
  function goToTab(name) {
    document.querySelector(`.tab-btn[data-tab="${name}"]`).click();
  }

  // ---------- Calculator ----------
  const CALC_FIELD_IDS = [
    "projectName", "materialType", "filamentWeight", "filamentPrice", "wastePercent",
    "printHours", "printMinutes", "printerPower", "electricityRate",
    "printerCost", "printerLifespan", "maintenanceMonthly", "monthlyHours",
    "laborHours", "laborRate", "failureRate", "extraCosts",
    "marginPercent", "platformFee",
  ];

  const form = document.getElementById("calc-form");
  const breakdownEl = document.getElementById("breakdown");
  let currentCalc = null;

  function num(id) {
    const v = parseFloat(document.getElementById(id).value);
    return Number.isFinite(v) ? v : 0;
  }

  function readCalcInputs() {
    const inputs = {};
    CALC_FIELD_IDS.forEach((id) => { inputs[id] = document.getElementById(id).value; });
    return inputs;
  }

  function setCalcInputs(inputs) {
    CALC_FIELD_IDS.forEach((id) => {
      if (inputs[id] !== undefined) document.getElementById(id).value = inputs[id];
    });
    applyMaterialType();
  }

  function computeFromInputs(inputs) {
    const filamentWeight = parseFloat(inputs.filamentWeight) || 0;
    const filamentPrice = parseFloat(inputs.filamentPrice) || 0;
    const wastePercent = parseFloat(inputs.wastePercent) || 0;
    const printHours = (parseFloat(inputs.printHours) || 0) + (parseFloat(inputs.printMinutes) || 0) / 60;
    const printerPower = parseFloat(inputs.printerPower) || 0;
    const electricityRate = parseFloat(inputs.electricityRate) || 0;
    const printerCost = parseFloat(inputs.printerCost) || 0;
    const printerLifespan = Math.max(parseFloat(inputs.printerLifespan) || 1, 1);
    const maintenanceMonthly = parseFloat(inputs.maintenanceMonthly) || 0;
    const monthlyHours = Math.max(parseFloat(inputs.monthlyHours) || 1, 1);
    const laborHours = parseFloat(inputs.laborHours) || 0;
    const laborRate = parseFloat(inputs.laborRate) || 0;
    const failureRate = Math.min(parseFloat(inputs.failureRate) || 0, 95);
    const extraCosts = parseFloat(inputs.extraCosts) || 0;
    const marginPercent = parseFloat(inputs.marginPercent) || 0;
    const platformFee = Math.min(parseFloat(inputs.platformFee) || 0, 90);
    const isResin = inputs.materialType === "resina";

    const materialCost = (filamentWeight * (1 + wastePercent / 100) / 1000) * filamentPrice;
    const electricityCost = (printerPower / 1000) * printHours * electricityRate;
    const depreciationCost = (printerCost / printerLifespan) * printHours;
    const maintenanceCost = (maintenanceMonthly / monthlyHours) * printHours;
    const laborCost = laborHours * laborRate;

    const directCost = materialCost + electricityCost + depreciationCost + maintenanceCost + laborCost;
    const failureAdjustedCost = directCost / (1 - failureRate / 100);
    const totalCost = failureAdjustedCost + extraCosts;

    const priceBeforeFee = totalCost * (1 + marginPercent / 100);
    const suggestedPrice = platformFee > 0 ? priceBeforeFee / (1 - platformFee / 100) : priceBeforeFee;
    const platformFeeAmount = suggestedPrice - priceBeforeFee;
    const netProfit = suggestedPrice - totalCost - platformFeeAmount;
    const profitPerHour = printHours > 0 ? netProfit / printHours : 0;
    const pricePerUnit = filamentWeight > 0 ? suggestedPrice / filamentWeight : 0;
    const pricePerHour = printHours > 0 ? suggestedPrice / printHours : 0;

    return {
      isResin, materialCost, electricityCost, depreciationCost, maintenanceCost, laborCost,
      directCost, failureAdjustedCost, totalCost, priceBeforeFee, suggestedPrice,
      platformFeeAmount, netProfit, profitPerHour, pricePerUnit, pricePerHour,
      printHours, failureRate, platformFee, extraCosts,
    };
  }

  function addLine(label, value) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = clpUnit(value);
    breakdownEl.append(dt, dd);
  }

  function applyMaterialType() {
    const isResin = document.getElementById("materialType").value === "resina";
    document.getElementById("weightLabel").textContent = isResin ? "Volumen de resina usado (ml)" : "Peso de filamento usado (g)";
    document.getElementById("priceLabel").textContent = isResin ? "Precio de la resina (CLP/L)" : "Precio del filamento (CLP/kg)";
    document.getElementById("wasteHint").textContent = isResin
      ? "Resina perdida en la cubeta, limpieza y piezas de soporte."
      : "Material perdido en purgas de nozzle, torres de purga, soportes y raft.";
    document.getElementById("perUnitLabel").textContent = isResin ? "Precio por ml" : "Precio por gramo";
  }

  function calculate() {
    const inputs = readCalcInputs();
    const r = computeFromInputs(inputs);
    currentCalc = { inputs, result: r };

    breakdownEl.innerHTML = "";
    addLine("Material + merma", r.materialCost);
    addLine("Electricidad", r.electricityCost);
    addLine("Depreciación de impresora", r.depreciationCost);
    addLine("Mantención prorrateada", r.maintenanceCost);
    addLine("Mano de obra", r.laborCost);
    addLine(`Ajuste por tasa de fallas (${r.failureRate}%)`, r.failureAdjustedCost - r.directCost);
    addLine("Embalaje / envío / otros", r.extraCosts);
    if (r.platformFee > 0) addLine(`Comisión de plataforma (${r.platformFee}%)`, r.platformFeeAmount);

    document.getElementById("totalCost").textContent = clpUnit(r.totalCost);
    document.getElementById("suggestedPrice").textContent = clpUnit(r.suggestedPrice);
    document.getElementById("netProfit").textContent = clpUnit(r.netProfit);
    document.getElementById("pricePerGram").textContent = clpUnit(r.pricePerUnit);
    document.getElementById("pricePerHour").textContent = clpUnit(r.pricePerHour);
    document.getElementById("profitPerHour").textContent = clpUnit(r.profitPerHour);
  }

  form.addEventListener("input", (e) => {
    if (e.target.id === "materialType") applyMaterialType();
    calculate();
  });

  document.getElementById("btn-reset").addEventListener("click", () => {
    form.reset();
    applyMaterialType();
    calculate();
  });

  function updateLogJobHint() {
    const ready = Boolean(calcPrinterSelect.value) && Boolean(calcMaterialSelect.value);
    document.getElementById("logJobHint").hidden = ready;
  }

  // ---------- Quick-fill from inventory ----------
  const calcPrinterSelect = document.getElementById("calcPrinterSelect");
  const calcMaterialSelect = document.getElementById("calcMaterialSelect");

  calcPrinterSelect.addEventListener("change", () => {
    const p = printers.find((x) => x.id === calcPrinterSelect.value);
    updateLogJobHint();
    if (!p) return;
    if (p.power_w != null) document.getElementById("printerPower").value = p.power_w;
    if (p.cost_clp != null) document.getElementById("printerCost").value = p.cost_clp;
    if (p.lifespan_hours != null) document.getElementById("printerLifespan").value = p.lifespan_hours;
    calculate();
  });

  calcMaterialSelect.addEventListener("change", () => {
    const m = materials.find((x) => x.id === calcMaterialSelect.value);
    updateLogJobHint();
    if (!m) return;
    document.getElementById("materialType").value = m.type === "resina" ? "resina" : "filamento";
    applyMaterialType();
    if (m.price != null) document.getElementById("filamentPrice").value = m.price;
    calculate();
  });

  function materialLabel(m) {
    return [m.material || "Material", m.colorName].filter(Boolean).join(" — ");
  }

  function refreshCalcSelects() {
    const prevPrinter = calcPrinterSelect.value;
    calcPrinterSelect.innerHTML = '<option value="">— Ninguna —</option>' +
      printers.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name || "Sin nombre")}</option>`).join("");
    if (printers.some((p) => p.id === prevPrinter)) calcPrinterSelect.value = prevPrinter;

    const prevMaterial = calcMaterialSelect.value;
    calcMaterialSelect.innerHTML = '<option value="">— Ninguno —</option>' +
      materials.map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(materialLabel(m))}</option>`).join("");
    if (materials.some((m) => m.id === prevMaterial)) calcMaterialSelect.value = prevMaterial;

    updateLogJobHint();
  }

  // ---------- Image compression (client-side, no server) ----------
  function compressImage(file, maxWidth, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("No se pudo leer la imagen"));
        img.onload = () => {
          const scale = Math.min(1, maxWidth / img.width);
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ---------- Printers ----------
  const printersGrid = document.getElementById("printersGrid");
  const printersEmpty = document.getElementById("printersEmpty");
  const printerDialog = document.getElementById("printerDialog");
  const printerForm = document.getElementById("printerForm");
  let editingPrinterId = null;
  let pendingPrinterImage = null;

  const MAINTENANCE_LABELS = { good: "Al día", warning: "Pronto", critical: "Atrasada" };

  function renderPrinters() {
    printersEmpty.hidden = printers.length > 0;
    printersGrid.innerHTML = printers.map((p) => {
      const interval = Math.max(p.maintenanceIntervalHours || 1, 1);
      const sinceMaint = p.hoursSinceMaintenance || 0;
      const mStatus = statusForRatio(sinceMaint / interval);
      return `
      <article class="card" data-id="${escapeHtml(p.id)}">
        <div class="card-media">
          ${p.image ? `<img src="${p.image}" alt="${escapeHtml(p.name || "")}">` : "sin foto"}
        </div>
        <div class="card-body">
          <h3>${escapeHtml(p.name || "Sin nombre")}</h3>
          <span class="badge ${p.type === "resin" ? "badge-resin" : "badge-fdm"}">${p.type === "resin" ? "Resina" : "FDM"}</span>
          ${p.brand ? `<div class="meta">${escapeHtml(p.brand)}</div>` : ""}
          <ul class="specs">
            <li>Potencia: <strong>${p.power_w ?? "—"} W</strong></li>
            <li>Valor: <strong>${p.cost_clp != null ? clpUnit(p.cost_clp) : "—"}</strong></li>
            <li>Vida útil: <strong>${p.lifespan_hours ?? "—"} h</strong></li>
            <li>Horas usadas: <strong>${formatHours(p.totalHours || 0)}</strong></li>
          </ul>
          <span class="status-chip status-${mStatus}">Mantención: ${MAINTENANCE_LABELS[mStatus]}</span>
          <div class="card-actions">
            <button class="btn btn-icon" data-action="edit-printer" data-id="${escapeHtml(p.id)}">Editar</button>
            <button class="btn btn-icon" data-action="maintain-printer" data-id="${escapeHtml(p.id)}">Registrar mantención</button>
            <button class="btn btn-icon btn-danger-ghost" data-action="delete-printer" data-id="${escapeHtml(p.id)}">Eliminar</button>
          </div>
        </div>
      </article>
    `;
    }).join("");
  }

  function renderImagePreview(elId, dataUrl) {
    document.getElementById(elId).innerHTML = dataUrl ? `<img src="${dataUrl}" alt="">` : "sin foto";
  }

  const DEFAULT_MAINTENANCE_INTERVAL = { fdm: 200, resin: 100 };

  function openPrinterDialog(printer) {
    editingPrinterId = printer ? printer.id : null;
    pendingPrinterImage = printer ? printer.image || null : null;
    document.getElementById("printerDialogTitle").textContent = printer ? "Editar impresora" : "Nueva impresora";
    document.getElementById("pName").value = printer?.name || "";
    document.getElementById("pBrand").value = printer?.brand || "";
    document.getElementById("pType").value = printer?.type || "fdm";
    document.getElementById("pPower").value = printer?.power_w ?? 200;
    document.getElementById("pCost").value = printer?.cost_clp ?? 350000;
    document.getElementById("pLifespan").value = printer?.lifespan_hours ?? 5000;
    document.getElementById("pDate").value = printer?.purchaseDate || "";
    document.getElementById("pTotalHours").value = printer?.totalHours ?? 0;
    document.getElementById("pMaintenanceInterval").value =
      printer?.maintenanceIntervalHours ?? DEFAULT_MAINTENANCE_INTERVAL[printer?.type || "fdm"];
    document.getElementById("pNotes").value = printer?.notes || "";
    document.getElementById("pImageInput").value = "";
    renderImagePreview("pImagePreview", pendingPrinterImage);
    printerDialog.showModal();
  }

  document.getElementById("btn-add-printer").addEventListener("click", () => openPrinterDialog(null));
  document.getElementById("printerCancel").addEventListener("click", () => printerDialog.close());

  document.getElementById("pType").addEventListener("change", (e) => {
    if (editingPrinterId) return;
    document.getElementById("pMaintenanceInterval").value = DEFAULT_MAINTENANCE_INTERVAL[e.target.value] ?? 200;
  });

  document.getElementById("pImageInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      pendingPrinterImage = await compressImage(file, 480, 0.72);
      renderImagePreview("pImagePreview", pendingPrinterImage);
    } catch (err) {
      console.error(err);
      alert("No se pudo procesar la imagen. Intenta con otra foto (JPG, PNG o WebP).");
    }
  });

  printerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const existing = editingPrinterId ? printers.find((x) => x.id === editingPrinterId) : null;
    const data = {
      id: editingPrinterId || genId(),
      name: document.getElementById("pName").value.trim(),
      brand: document.getElementById("pBrand").value.trim(),
      type: document.getElementById("pType").value,
      power_w: num("pPower"),
      cost_clp: num("pCost"),
      lifespan_hours: num("pLifespan"),
      purchaseDate: document.getElementById("pDate").value || null,
      totalHours: num("pTotalHours"),
      maintenanceIntervalHours: Math.max(num("pMaintenanceInterval"), 1),
      hoursSinceMaintenance: existing?.hoursSinceMaintenance || 0,
      lastMaintenanceAt: existing?.lastMaintenanceAt || null,
      notes: document.getElementById("pNotes").value.trim(),
      image: pendingPrinterImage || null,
    };
    if (editingPrinterId) {
      printers = printers.map((p) => (p.id === editingPrinterId ? data : p));
    } else {
      printers.push(data);
    }
    if (saveArr(STORE_KEYS.printers, printers)) {
      renderPrinters();
      refreshCalcSelects();
      renderDashboard();
      printerDialog.close();
    }
  });

  printersGrid.addEventListener("click", (e) => {
    const editBtn = e.target.closest('[data-action="edit-printer"]');
    const delBtn = e.target.closest('[data-action="delete-printer"]');
    const maintainBtn = e.target.closest('[data-action="maintain-printer"]');
    if (editBtn) {
      const p = printers.find((x) => x.id === editBtn.dataset.id);
      if (p) openPrinterDialog(p);
    }
    if (maintainBtn && confirm("¿Registrar que acabas de hacer mantención a esta impresora? Esto pone en cero las horas acumuladas desde la última mantención.")) {
      printers = printers.map((p) =>
        p.id === maintainBtn.dataset.id ? { ...p, hoursSinceMaintenance: 0, lastMaintenanceAt: new Date().toISOString() } : p
      );
      saveArr(STORE_KEYS.printers, printers);
      renderPrinters();
      renderDashboard();
    }
    if (delBtn && confirm("¿Eliminar esta impresora de tu inventario?")) {
      printers = printers.filter((x) => x.id !== delBtn.dataset.id);
      saveArr(STORE_KEYS.printers, printers);
      renderPrinters();
      refreshCalcSelects();
      renderDashboard();
    }
  });

  // ---------- Materials ----------
  const materialsList = document.getElementById("materialsList");
  const materialsEmpty = document.getElementById("materialsEmpty");
  const materialDialog = document.getElementById("materialDialog");
  const materialForm = document.getElementById("materialForm");
  let editingMaterialId = null;

  function renderMaterials() {
    materialsEmpty.hidden = materials.length > 0;
    materialsList.innerHTML = materials.map((m) => `
      <div class="list-row" data-id="${escapeHtml(m.id)}">
        <div class="swatch" style="background:${escapeHtml(m.colorSwatch || "#cccccc")}"></div>
        <div class="info">
          <h3>${escapeHtml(m.material || "Material")} ${m.colorName ? "— " + escapeHtml(m.colorName) : ""}</h3>
          <div class="meta">${escapeHtml(m.brand || "Sin marca")} · ${m.type === "resina" ? "Resina" : "Filamento"}</div>
        </div>
        <div class="stock">
          ${m.stock ?? 0} ${m.type === "resina" ? "ml" : "g"}<br>
          ${m.price != null ? clpUnit(m.price) + "/" + (m.type === "resina" ? "L" : "kg") : "—"}
        </div>
        <div class="row-actions">
          <button class="btn btn-icon" data-action="edit-material" data-id="${escapeHtml(m.id)}">Editar</button>
          <button class="btn btn-icon btn-danger-ghost" data-action="delete-material" data-id="${escapeHtml(m.id)}">Eliminar</button>
        </div>
      </div>
    `).join("");
  }

  function applyMaterialDialogType() {
    const isResin = document.getElementById("mType").value === "resina";
    document.getElementById("mStockLabel").textContent = isResin ? "Stock (ml)" : "Stock (g)";
    document.getElementById("mPriceLabel").textContent = isResin ? "Precio (CLP/L)" : "Precio (CLP/kg)";
  }
  document.getElementById("mType").addEventListener("change", applyMaterialDialogType);

  function openMaterialDialog(material) {
    editingMaterialId = material ? material.id : null;
    document.getElementById("materialDialogTitle").textContent = material ? "Editar material" : "Nuevo material";
    document.getElementById("mType").value = material?.type || "filamento";
    document.getElementById("mMaterial").value = material?.material || "";
    document.getElementById("mColorName").value = material?.colorName || "";
    document.getElementById("mColorSwatch").value = material?.colorSwatch || "#e15b17";
    document.getElementById("mBrand").value = material?.brand || "";
    document.getElementById("mStock").value = material?.stock ?? 1000;
    document.getElementById("mPrice").value = material?.price ?? 12000;
    document.getElementById("mNotes").value = material?.notes || "";
    applyMaterialDialogType();
    materialDialog.showModal();
  }

  document.getElementById("btn-add-material").addEventListener("click", () => openMaterialDialog(null));
  document.getElementById("materialCancel").addEventListener("click", () => materialDialog.close());

  materialForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = {
      id: editingMaterialId || genId(),
      type: document.getElementById("mType").value,
      material: document.getElementById("mMaterial").value.trim(),
      colorName: document.getElementById("mColorName").value.trim(),
      colorSwatch: document.getElementById("mColorSwatch").value,
      brand: document.getElementById("mBrand").value.trim(),
      stock: num("mStock"),
      price: num("mPrice"),
      notes: document.getElementById("mNotes").value.trim(),
    };
    if (editingMaterialId) {
      materials = materials.map((m) => (m.id === editingMaterialId ? data : m));
    } else {
      materials.push(data);
    }
    if (saveArr(STORE_KEYS.materials, materials)) {
      renderMaterials();
      refreshCalcSelects();
      renderDashboard();
      materialDialog.close();
    }
  });

  materialsList.addEventListener("click", (e) => {
    const editBtn = e.target.closest('[data-action="edit-material"]');
    const delBtn = e.target.closest('[data-action="delete-material"]');
    if (editBtn) {
      const m = materials.find((x) => x.id === editBtn.dataset.id);
      if (m) openMaterialDialog(m);
    }
    if (delBtn && confirm("¿Eliminar este material de tu inventario?")) {
      materials = materials.filter((x) => x.id !== delBtn.dataset.id);
      saveArr(STORE_KEYS.materials, materials);
      renderMaterials();
      refreshCalcSelects();
      renderDashboard();
    }
  });

  // ---------- Tools ----------
  const toolsListRows = document.getElementById("toolsListRows");
  const toolsEmpty = document.getElementById("toolsEmpty");
  const toolDialog = document.getElementById("toolDialog");
  const toolForm = document.getElementById("toolForm");
  let editingToolId = null;
  const categoryLabels = { herramienta: "Herramienta", accesorio: "Accesorio", repuesto: "Repuesto" };

  function renderTools() {
    toolsEmpty.hidden = toolsItems.length > 0;
    toolsListRows.innerHTML = toolsItems.map((t) => `
      <div class="list-row" data-id="${escapeHtml(t.id)}">
        <div class="info">
          <h3>${escapeHtml(t.name || "Sin nombre")}</h3>
          <div class="meta">${escapeHtml(categoryLabels[t.category] || "Herramienta")}${t.notes ? " · " + escapeHtml(t.notes) : ""}</div>
        </div>
        <div class="stock">${t.quantity ?? 0} u.</div>
        <div class="row-actions">
          <button class="btn btn-icon" data-action="edit-tool" data-id="${escapeHtml(t.id)}">Editar</button>
          <button class="btn btn-icon btn-danger-ghost" data-action="delete-tool" data-id="${escapeHtml(t.id)}">Eliminar</button>
        </div>
      </div>
    `).join("");
  }

  function openToolDialog(tool) {
    editingToolId = tool ? tool.id : null;
    document.getElementById("toolDialogTitle").textContent = tool ? "Editar herramienta" : "Nueva herramienta";
    document.getElementById("tName").value = tool?.name || "";
    document.getElementById("tCategory").value = tool?.category || "herramienta";
    document.getElementById("tQuantity").value = tool?.quantity ?? 1;
    document.getElementById("tNotes").value = tool?.notes || "";
    toolDialog.showModal();
  }

  document.getElementById("btn-add-tool").addEventListener("click", () => openToolDialog(null));
  document.getElementById("toolCancel").addEventListener("click", () => toolDialog.close());

  toolForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = {
      id: editingToolId || genId(),
      name: document.getElementById("tName").value.trim(),
      category: document.getElementById("tCategory").value,
      quantity: num("tQuantity"),
      notes: document.getElementById("tNotes").value.trim(),
    };
    if (editingToolId) {
      toolsItems = toolsItems.map((t) => (t.id === editingToolId ? data : t));
    } else {
      toolsItems.push(data);
    }
    if (saveArr(STORE_KEYS.tools, toolsItems)) {
      renderTools();
      toolDialog.close();
    }
  });

  toolsListRows.addEventListener("click", (e) => {
    const editBtn = e.target.closest('[data-action="edit-tool"]');
    const delBtn = e.target.closest('[data-action="delete-tool"]');
    if (editBtn) {
      const t = toolsItems.find((x) => x.id === editBtn.dataset.id);
      if (t) openToolDialog(t);
    }
    if (delBtn && confirm("¿Eliminar esta herramienta de tu inventario?")) {
      toolsItems = toolsItems.filter((x) => x.id !== delBtn.dataset.id);
      saveArr(STORE_KEYS.tools, toolsItems);
      renderTools();
    }
  });

  // ---------- Quotes ----------
  const quotesList = document.getElementById("quotesList");
  const quotesEmpty = document.getElementById("quotesEmpty");
  const quoteDialog = document.getElementById("quoteDialog");
  const quoteForm = document.getElementById("quoteForm");

  function renderQuotes() {
    quotesEmpty.hidden = quotes.length > 0;
    quotesList.innerHTML = quotes.slice().reverse().map((q) => `
      <div class="list-row" data-id="${escapeHtml(q.id)}">
        <div class="info">
          <h3>${escapeHtml(q.name)}</h3>
          <div class="meta">${new Date(q.createdAt).toLocaleDateString("es-CL")} · ${q.result.printHours.toFixed(1)} h de impresión</div>
        </div>
        <div class="quote-summary">
          Costo: <strong>${clpUnit(q.result.totalCost)}</strong><br>
          Venta: <strong>${clpUnit(q.result.suggestedPrice)}</strong>
        </div>
        <div class="row-actions">
          <button class="btn btn-icon" data-action="load-quote" data-id="${escapeHtml(q.id)}">Cargar</button>
          <button class="btn btn-icon" data-action="print-quote" data-id="${escapeHtml(q.id)}">Imprimir</button>
          <button class="btn btn-icon btn-danger-ghost" data-action="delete-quote" data-id="${escapeHtml(q.id)}">Eliminar</button>
        </div>
      </div>
    `).join("");
  }

  document.getElementById("btn-save-quote").addEventListener("click", () => {
    document.getElementById("qName").value = currentCalc?.inputs.projectName || "";
    quoteDialog.showModal();
  });
  document.getElementById("quoteCancel").addEventListener("click", () => quoteDialog.close());

  quoteForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("qName").value.trim();
    if (!name || !currentCalc) return;
    quotes.push({ id: genId(), name, createdAt: new Date().toISOString(), inputs: currentCalc.inputs, result: currentCalc.result });
    if (saveArr(STORE_KEYS.quotes, quotes)) {
      renderQuotes();
      quoteDialog.close();
    }
  });

  quotesList.addEventListener("click", (e) => {
    const loadBtn = e.target.closest('[data-action="load-quote"]');
    const printBtn = e.target.closest('[data-action="print-quote"]');
    const delBtn = e.target.closest('[data-action="delete-quote"]');
    if (loadBtn) {
      const q = quotes.find((x) => x.id === loadBtn.dataset.id);
      if (q) { setCalcInputs(q.inputs); calculate(); goToTab("calc"); }
    }
    if (printBtn) {
      const q = quotes.find((x) => x.id === printBtn.dataset.id);
      if (q) printQuote(q.inputs, q.result);
    }
    if (delBtn && confirm("¿Eliminar esta cotización guardada?")) {
      quotes = quotes.filter((x) => x.id !== delBtn.dataset.id);
      saveArr(STORE_KEYS.quotes, quotes);
      renderQuotes();
    }
  });

  // ---------- Jobs (historial de trabajos realizados) + Dashboard ----------
  const jobDialog = document.getElementById("jobDialog");
  const jobForm = document.getElementById("jobForm");
  const btnLogJob = document.getElementById("btn-log-job");

  const MAINTENANCE_NOTES = {
    fdm: "Revisión general sugerida: lubricar ejes y varillas, tensar correas, limpiar nozzle y raíles, verificar nivelación de la cama.",
    resin: "Revisión general sugerida: cambiar o limpiar el FEP/film de la cubeta, limpiar la pantalla LCD/MSLA, filtrar o reponer resina, verificar nivelación.",
  };

  btnLogJob.addEventListener("click", () => {
    const printer = printers.find((p) => p.id === calcPrinterSelect.value);
    const material = materials.find((m) => m.id === calcMaterialSelect.value);
    if (!printer || !material || !currentCalc) {
      alert("Elige primero una impresora y un material guardados en la calculadora (arriba, en \"Usar impresora/material guardado\").");
      return;
    }
    const unit = currentCalc.result.isResin ? "ml" : "g";
    document.getElementById("jobDialogSummary").textContent =
      `${printer.name} · ${materialLabel(material)} · ${currentCalc.inputs.filamentWeight} ${unit} · ${currentCalc.result.printHours.toFixed(1)} h`;
    document.getElementById("jName").value = currentCalc.inputs.projectName || "";
    document.getElementById("jDate").value = new Date().toISOString().slice(0, 10);
    document.getElementById("jNotes").value = "";
    jobDialog.showModal();
  });
  document.getElementById("jobCancel").addEventListener("click", () => jobDialog.close());

  jobForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const printer = printers.find((p) => p.id === calcPrinterSelect.value);
    const material = materials.find((m) => m.id === calcMaterialSelect.value);
    if (!printer || !material || !currentCalc) { jobDialog.close(); return; }

    const weightUsed = parseFloat(currentCalc.inputs.filamentWeight) || 0;
    const printHours = currentCalc.result.printHours;

    const job = {
      id: genId(),
      name: document.getElementById("jName").value.trim() || "Trabajo sin nombre",
      date: document.getElementById("jDate").value || new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
      notes: document.getElementById("jNotes").value.trim(),
      printerId: printer.id,
      printerName: printer.name,
      materialId: material.id,
      materialName: materialLabel(material),
      materialType: material.type,
      materialColorSwatch: material.colorSwatch,
      weightUsed,
      printHours,
      totalCost: currentCalc.result.totalCost,
      suggestedPrice: currentCalc.result.suggestedPrice,
      netProfit: currentCalc.result.netProfit,
    };
    jobs.push(job);

    printers = printers.map((p) => p.id === printer.id
      ? { ...p, totalHours: (p.totalHours || 0) + printHours, hoursSinceMaintenance: (p.hoursSinceMaintenance || 0) + printHours }
      : p);
    materials = materials.map((m) => m.id === material.id
      ? { ...m, stock: Math.max(0, (m.stock || 0) - weightUsed) }
      : m);

    saveArr(STORE_KEYS.jobs, jobs);
    saveArr(STORE_KEYS.printers, printers);
    saveArr(STORE_KEYS.materials, materials);
    renderPrinters();
    renderMaterials();
    refreshCalcSelects();
    renderDashboard();
    jobDialog.close();
    goToTab("dashboard");
  });

  function undoJobEffects(job) {
    printers = printers.map((p) => p.id === job.printerId
      ? { ...p, totalHours: Math.max(0, (p.totalHours || 0) - job.printHours), hoursSinceMaintenance: Math.max(0, (p.hoursSinceMaintenance || 0) - job.printHours) }
      : p);
    materials = materials.map((m) => m.id === job.materialId
      ? { ...m, stock: (m.stock || 0) + job.weightUsed }
      : m);
    saveArr(STORE_KEYS.printers, printers);
    saveArr(STORE_KEYS.materials, materials);
  }

  const jobsHistoryList = document.getElementById("jobsHistoryList");
  jobsHistoryList.addEventListener("click", (e) => {
    const delBtn = e.target.closest('[data-action="delete-job"]');
    if (!delBtn) return;
    const job = jobs.find((j) => j.id === delBtn.dataset.id);
    if (!job) return;
    if (!confirm("¿Eliminar este trabajo del historial? Esto también devuelve el stock de material y resta las horas a la impresora.")) return;
    undoJobEffects(job);
    jobs = jobs.filter((j) => j.id !== job.id);
    saveArr(STORE_KEYS.jobs, jobs);
    renderPrinters();
    renderMaterials();
    refreshCalcSelects();
    renderDashboard();
  });

  function renderDashboard() {
    const dashboardEmpty = document.getElementById("dashboardEmpty");
    const dashboardContent = document.getElementById("dashboardContent");
    dashboardEmpty.hidden = jobs.length > 0;
    dashboardContent.hidden = jobs.length === 0;
    if (jobs.length === 0) return;

    const totalHours = jobs.reduce((sum, j) => sum + j.printHours, 0);
    const totalRevenue = jobs.reduce((sum, j) => sum + j.suggestedPrice, 0);
    const totalProfit = jobs.reduce((sum, j) => sum + j.netProfit, 0);
    document.getElementById("statJobCount").textContent = jobs.length.toLocaleString("es-CL");
    document.getElementById("statTotalHours").textContent = formatHours(totalHours);
    document.getElementById("statTotalRevenue").textContent = clpUnit(totalRevenue);
    document.getElementById("statTotalProfit").textContent = clpUnit(totalProfit);

    // Material ranking
    const byMaterial = new Map();
    jobs.forEach((j) => {
      const key = j.materialId || j.materialName;
      const entry = byMaterial.get(key) || { name: j.materialName, swatch: j.materialColorSwatch, unit: j.materialType === "resina" ? "ml" : "g", total: 0 };
      entry.total += j.weightUsed;
      byMaterial.set(key, entry);
    });
    const ranked = [...byMaterial.values()].sort((a, b) => b.total - a.total).slice(0, 8);
    const maxTotal = ranked.length ? ranked[0].total : 1;
    const materialRanking = document.getElementById("materialRanking");
    materialRanking.innerHTML = ranked.map((entry) => `
      <div class="rank-row">
        <div class="rank-label">
          <span class="rank-swatch" style="background:${escapeHtml(entry.swatch || "#cccccc")}"></span>
          <span>${escapeHtml(entry.name)}</span>
        </div>
        <div class="rank-track"><div class="rank-fill" style="width:${maxTotal > 0 ? (entry.total / maxTotal) * 100 : 0}%"></div></div>
        <div class="rank-value">${Math.round(entry.total).toLocaleString("es-CL")} ${entry.unit}</div>
      </div>
    `).join("");

    // Printer usage + maintenance
    const printerUsageList = document.getElementById("printerUsageList");
    printerUsageList.innerHTML = printers.map((p) => {
      const lifespan = Math.max(p.lifespan_hours || 1, 1);
      const interval = Math.max(p.maintenanceIntervalHours || 1, 1);
      const totalH = p.totalHours || 0;
      const sinceMaint = p.hoursSinceMaintenance || 0;
      const lifeRatio = Math.min(totalH / lifespan, 1);
      const maintRatio = Math.min(sinceMaint / interval, 1);
      const lifeStatus = statusForRatio(totalH / lifespan);
      const maintStatus = statusForRatio(sinceMaint / interval);
      return `
        <div class="usage-card" data-id="${escapeHtml(p.id)}">
          <div class="usage-card-head">
            <h4>${escapeHtml(p.name || "Sin nombre")} <span class="badge ${p.type === "resin" ? "badge-resin" : "badge-fdm"}">${p.type === "resin" ? "Resina" : "FDM"}</span></h4>
            <span class="status-chip status-${maintStatus}">Mantención: ${MAINTENANCE_LABELS[maintStatus]}</span>
          </div>
          <div class="usage-meter">
            <div class="usage-meter-label"><span>Horas usadas vs. vida útil</span><strong>${formatHours(totalH)} / ${formatHours(lifespan)}</strong></div>
            <div class="usage-meter-track"><div class="usage-meter-fill status-${lifeStatus}" style="width:${lifeRatio * 100}%"></div></div>
          </div>
          <div class="usage-meter">
            <div class="usage-meter-label"><span>Desde la última mantención</span><strong>${formatHours(sinceMaint)} / ${formatHours(interval)}</strong></div>
            <div class="usage-meter-track"><div class="usage-meter-fill status-${maintStatus}" style="width:${maintRatio * 100}%"></div></div>
          </div>
          <p class="maintenance-note">${MAINTENANCE_NOTES[p.type] || MAINTENANCE_NOTES.fdm}</p>
          <div class="card-actions">
            <button class="btn btn-icon" data-action="maintain-printer" data-id="${escapeHtml(p.id)}">Registrar mantención</button>
          </div>
        </div>
      `;
    }).join("") || '<p class="inline-note">Agrega impresoras en la pestaña "Impresoras" para ver su uso aquí.</p>';

    // Jobs history
    jobsHistoryList.innerHTML = jobs.slice().reverse().map((j) => `
      <div class="list-row" data-id="${escapeHtml(j.id)}">
        <div class="info">
          <h3>${escapeHtml(j.name)}</h3>
          <div class="meta">${new Date(j.date).toLocaleDateString("es-CL")} · ${escapeHtml(j.printerName)} · ${escapeHtml(j.materialName)} · ${formatHours(j.printHours)}</div>
        </div>
        <div class="quote-summary">
          Costo: <strong>${clpUnit(j.totalCost)}</strong><br>
          Venta: <strong>${clpUnit(j.suggestedPrice)}</strong>
        </div>
        <div class="row-actions">
          <button class="btn btn-icon btn-danger-ghost" data-action="delete-job" data-id="${escapeHtml(j.id)}">Eliminar</button>
        </div>
      </div>
    `).join("");
  }

  document.getElementById("printerUsageList").addEventListener("click", (e) => {
    const maintainBtn = e.target.closest('[data-action="maintain-printer"]');
    if (!maintainBtn) return;
    if (!confirm("¿Registrar que acabas de hacer mantención a esta impresora? Esto pone en cero las horas acumuladas desde la última mantención.")) return;
    printers = printers.map((p) =>
      p.id === maintainBtn.dataset.id ? { ...p, hoursSinceMaintenance: 0, lastMaintenanceAt: new Date().toISOString() } : p
    );
    saveArr(STORE_KEYS.printers, printers);
    renderPrinters();
    renderDashboard();
  });

  // ---------- Print a client-facing quote ----------
  const printSheet = document.getElementById("printSheet");

  function printQuote(inputs, result) {
    const today = new Date().toLocaleDateString("es-CL");
    const unitLabel = result.isResin ? "ml" : "g";
    printSheet.innerHTML = `
      <h1>${escapeHtml(inputs.projectName || "Cotización de impresión 3D")}</h1>
      <div class="print-meta">Cotización generada el ${today} · Taller3D</div>
      <table>
        <tr><td>Tiempo de impresión</td><td>${result.printHours.toFixed(1)} h</td></tr>
        <tr><td>Material</td><td>${result.isResin ? "Resina" : "Filamento"} — ${inputs.filamentWeight} ${unitLabel}</td></tr>
      </table>
      <table>
        <tr><td>Material + merma</td><td>${clpUnit(result.materialCost)}</td></tr>
        <tr><td>Electricidad</td><td>${clpUnit(result.electricityCost)}</td></tr>
        <tr><td>Depreciación de impresora</td><td>${clpUnit(result.depreciationCost)}</td></tr>
        <tr><td>Mantención</td><td>${clpUnit(result.maintenanceCost)}</td></tr>
        <tr><td>Mano de obra</td><td>${clpUnit(result.laborCost)}</td></tr>
        <tr><td>Embalaje / envío / otros</td><td>${clpUnit(result.extraCosts)}</td></tr>
      </table>
      <div class="print-total"><span>Precio total</span><span>${clpUnit(result.suggestedPrice)}</span></div>
    `;
    printSheet.classList.add("active");
    window.print();
  }

  window.addEventListener("afterprint", () => {
    printSheet.classList.remove("active");
  });

  document.getElementById("btn-print-quote").addEventListener("click", () => {
    if (currentCalc) printQuote(currentCalc.inputs, currentCalc.result);
  });

  // ---------- Data backup (export / import / clear) ----------
  const dataDialog = document.getElementById("dataDialog");
  document.getElementById("btn-data-menu").addEventListener("click", () => dataDialog.showModal());
  document.getElementById("dataDialogClose").addEventListener("click", () => dataDialog.close());

  document.getElementById("btn-export-data").addEventListener("click", () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      app: "Taller3D",
      version: 1,
      printers, materials, tools: toolsItems, quotes, jobs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `taller3d-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  const importFileInput = document.getElementById("importFileInput");
  document.getElementById("btn-import-data").addEventListener("click", () => importFileInput.click());

  importFileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(reader.result);
        if (!confirm("Esto reemplazará tus impresoras, materiales, herramientas, cotizaciones y el historial de trabajos actuales en este navegador por los del archivo. ¿Continuar?")) return;
        printers = Array.isArray(payload.printers) ? payload.printers : [];
        materials = Array.isArray(payload.materials) ? payload.materials : [];
        toolsItems = Array.isArray(payload.tools) ? payload.tools : [];
        quotes = Array.isArray(payload.quotes) ? payload.quotes : [];
        jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
        saveArr(STORE_KEYS.printers, printers);
        saveArr(STORE_KEYS.materials, materials);
        saveArr(STORE_KEYS.tools, toolsItems);
        saveArr(STORE_KEYS.quotes, quotes);
        saveArr(STORE_KEYS.jobs, jobs);
        renderPrinters();
        renderMaterials();
        renderTools();
        renderQuotes();
        renderDashboard();
        refreshCalcSelects();
        dataDialog.close();
        alert("Datos importados correctamente.");
      } catch (err) {
        console.error(err);
        alert("El archivo no parece un respaldo válido de Taller3D.");
      }
    };
    reader.readAsText(file);
    importFileInput.value = "";
  });

  document.getElementById("btn-clear-data").addEventListener("click", () => {
    if (!confirm("Esto borra impresoras, materiales, herramientas, cotizaciones y el historial de trabajos de este navegador, sin poder deshacerlo. ¿Continuar?")) return;
    printers = []; materials = []; toolsItems = []; quotes = []; jobs = [];
    saveArr(STORE_KEYS.printers, printers);
    saveArr(STORE_KEYS.materials, materials);
    saveArr(STORE_KEYS.tools, toolsItems);
    saveArr(STORE_KEYS.quotes, quotes);
    saveArr(STORE_KEYS.jobs, jobs);
    renderPrinters();
    renderMaterials();
    renderTools();
    renderQuotes();
    renderDashboard();
    refreshCalcSelects();
    dataDialog.close();
  });

  // ---------- Init ----------
  applyMaterialType();
  calculate();
  renderPrinters();
  renderMaterials();
  renderTools();
  renderQuotes();
  refreshCalcSelects();
  renderDashboard();
})();
