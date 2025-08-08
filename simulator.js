/*
 HPA Configurable Scaling Behavior simulator
 Implements: scaling policies (Pods / Percent), selectPolicy (Max/Min/Disabled),
 stabilization window per direction, tolerance per direction (alpha in v1.33),
 and sync period aggregation across time.

 Reference: https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/#configurable-scaling-behavior
*/

/* global document, window */

(function () {
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => Array.from(document.querySelectorAll(sel));

    const state = {
        running: false,
        t: 0, // seconds
        timeStep: 1, // seconds per frame
        speed: 1,
        syncPeriod: 15, // seconds
        elapsedSinceSync: 0,
        minReplicas: 1,
        maxReplicas: 50,
        replicas: 3,
        target: 100, // target metric value
        metricScenario: "rise-and-fall",
        customFormula: "",
        desiredHistory: [], // for stabilization: array of {t, desired}
        data: [], // timeline for charts [{t, metric, replicas, desired, stabilized}]
        logs: [],
        behavior: {
            up: {
                stabilizationWindowSeconds: 0,
                tolerance: 0.1,
                selectPolicy: "Max",
                policies: [
                    { type: "Percent", value: 100, periodSeconds: 15 },
                    { type: "Pods", value: 4, periodSeconds: 15 },
                ],
            },
            down: {
                stabilizationWindowSeconds: 300,
                tolerance: 0.1,
                selectPolicy: "Max",
                policies: [
                    { type: "Percent", value: 100, periodSeconds: 15 },
                ],
            },
        },
    };

    // Metric scenarios
    const metricScenarios = [
        { id: "rise-and-fall", name: "Gradual rise then fall" },
        { id: "noisy", name: "Noisy around target" },
        { id: "burst", name: "Sudden burst" },
        { id: "sine", name: "Sine wave" },
        { id: "custom", name: "Custom f(t)" },
    ];

    function computeMetric(t) {
        const base = state.target;
        switch (state.metricScenario) {
            case "rise-and-fall": {
                if (t < 60) return base + (t / 60) * 100; // up to +100 over 1m
                if (t < 120) return base + 100 - ((t - 60) / 60) * 120; // down 120 in next minute
                return base + 20 * Math.sin((t - 120) / 20);
            }
            case "noisy": {
                const noise = (Math.random() - 0.5) * 30; // +/-15
                return base + noise;
            }
            case "burst": {
                if (t < 30) return base;
                if (t < 60) return base + 150; // burst
                if (t < 120) return base + 50; // elevated
                return base + 10 * Math.sin(t / 10);
            }
            case "sine": {
                return base + 80 * Math.sin(t / 20);
            }
            case "custom": {
                if (!state.customFormula) return base;
                try {
                    // eslint-disable-next-line no-new-func
                    const fn = new Function("t", `return ${state.customFormula};`);
                    const v = fn(t);
                    if (Number.isFinite(v)) return v;
                    return base;
                } catch (e) {
                    return base;
                }
            }
            default:
                return base;
        }
    }

    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    }

    // Calculate desired replicas based on classic metric ratio rule: desired = currentReplicas * (metric / target)
    function computeDesiredReplicas(currentReplicas, metric, target) {
        if (target <= 0) return currentReplicas;
        const ratio = metric / target;
        const desired = Math.ceil(currentReplicas * ratio);
        return Math.max(0, desired);
    }

    function withinTolerance(direction, metric, target) {
        const tol = direction === "up" ? state.behavior.up.tolerance : state.behavior.down.tolerance;
        if (tol == null) return false; // default cluster tolerance assumed 10% if unspecified; we explicitly set
        const ratio = metric / target;
        if (direction === "up") {
            return ratio <= 1 + tol; // not beyond tolerance threshold
        }
        // down: only scale down if ratio < 1 - tol
        return ratio >= 1 - tol;
    }

    // Stabilization: pick a historic desired within window (Max for down, Min for up as per docs)
    function applyStabilization(direction, desired) {
        const win = direction === "up" ? state.behavior.up.stabilizationWindowSeconds : state.behavior.down.stabilizationWindowSeconds;
        if (!win || win <= 0) return desired;
        const fromT = state.t - win;
        const desires = state.desiredHistory.filter((d) => d.t >= fromT).map((d) => d.desired);
        if (desires.length === 0) return desired;
        if (direction === "down") {
            // use highest desired (rolling max)
            return Math.max(desired, ...desires);
        }
        // up: use lowest desired (rolling min)
        return Math.min(desired, ...desires);
    }

    // Given direction and current replicas, compute how many replicas can be changed under policies in one sync period
    function computeAllowedChange(direction, currentReplicas) {
        const cfg = direction === "up" ? state.behavior.up : state.behavior.down;
        if (cfg.selectPolicy === "Disabled") return 0;
        if (!cfg.policies || cfg.policies.length === 0) return Infinity;

        const allowances = cfg.policies.map((p) => {
            const periods = Math.max(1, Math.floor(state.syncPeriod / Math.max(1, p.periodSeconds)));
            if (p.type === "Pods") {
                return p.value * periods;
            }
            // Percent
            const delta = Math.ceil((currentReplicas * p.value) / 100);
            return Math.max(delta, 1) * periods;
        });

        if (cfg.selectPolicy === "Max") return Math.max(...allowances);
        if (cfg.selectPolicy === "Min") return Math.min(...allowances);
        return Math.max(...allowances);
    }

    function addPolicyUI(container, direction, type) {
        const list = $(container);
        const item = document.createElement("div");
        item.className = "policy-item";
        item.innerHTML = `
      <select class="p-type">
        <option value="Pods" ${type === "Pods" ? "selected" : ""}>Pods</option>
        <option value="Percent" ${type === "Percent" ? "selected" : ""}>Percent</option>
      </select>
      <input type="number" class="p-value" min="1" value="${type === "Pods" ? 4 : 100}" />
      <input type="number" class="p-period" min="1" value="15" />
      <button class="btn small remove">Remove</button>
    `;
        list.appendChild(item);

        item.querySelector(".remove").addEventListener("click", () => {
            item.remove();
            syncPoliciesFromUI();
            updateYamlPreview();
        });

        [".p-type", ".p-value", ".p-period"].forEach((sel) => {
            item.querySelector(sel).addEventListener("change", () => {
                syncPoliciesFromUI();
                updateYamlPreview();
            });
            item.querySelector(sel).addEventListener("input", () => {
                syncPoliciesFromUI();
                updateYamlPreview();
            });
        });

        syncPoliciesFromUI();
        updateYamlPreview();
    }

    function clearPoliciesUI() {
        $("#upPolicies").innerHTML = "";
        $("#downPolicies").innerHTML = "";
    }

    function inflatePoliciesUI() {
        clearPoliciesUI();
        state.behavior.up.policies.forEach((p) => addPolicyUI("#upPolicies", "up", p.type));
        // After adding, set the values
        $$("#upPolicies .policy-item").forEach((el, i) => {
            el.querySelector(".p-type").value = state.behavior.up.policies[i].type;
            el.querySelector(".p-value").value = state.behavior.up.policies[i].value;
            el.querySelector(".p-period").value = state.behavior.up.policies[i].periodSeconds;
        });
        state.behavior.down.policies.forEach((p) => addPolicyUI("#downPolicies", "down", p.type));
        $$("#downPolicies .policy-item").forEach((el, i) => {
            el.querySelector(".p-type").value = state.behavior.down.policies[i].type;
            el.querySelector(".p-value").value = state.behavior.down.policies[i].value;
            el.querySelector(".p-period").value = state.behavior.down.policies[i].periodSeconds;
        });
    }

    function syncPoliciesFromUI() {
        const up = [];
        $$("#upPolicies .policy-item").forEach((el) => {
            up.push({
                type: el.querySelector(".p-type").value,
                value: Number(el.querySelector(".p-value").value || 0),
                periodSeconds: Number(el.querySelector(".p-period").value || 1),
            });
        });
        const down = [];
        $$("#downPolicies .policy-item").forEach((el) => {
            down.push({
                type: el.querySelector(".p-type").value,
                value: Number(el.querySelector(".p-value").value || 0),
                periodSeconds: Number(el.querySelector(".p-period").value || 1),
            });
        });
        state.behavior.up.policies = up;
        state.behavior.down.policies = down;
    }

    function toBehaviorYaml() {
        const indent = (n) => " ".repeat(n);
        const polToYaml = (pol, n) =>
            `${indent(n)}- type: ${pol.type}\n${indent(n + 2)}value: ${pol.value}\n${indent(n + 2)}periodSeconds: ${pol.periodSeconds}`;
        const upPols = state.behavior.up.policies.map((p) => polToYaml(p, 6)).join("\n");
        const downPols = state.behavior.down.policies.map((p) => polToYaml(p, 6)).join("\n");
        const tolDown = Number.isFinite(state.behavior.down.tolerance) ? `\n    tolerance: ${state.behavior.down.tolerance}` : "";
        const tolUp = Number.isFinite(state.behavior.up.tolerance) ? `\n    tolerance: ${state.behavior.up.tolerance}` : "";
        return `behavior:\n  scaleDown:\n    stabilizationWindowSeconds: ${state.behavior.down.stabilizationWindowSeconds}${tolDown}\n    ${state.behavior.down.policies.length ? "policies:\n" + downPols : "policies: []"}\n    selectPolicy: ${state.behavior.down.selectPolicy}\n  scaleUp:\n    stabilizationWindowSeconds: ${state.behavior.up.stabilizationWindowSeconds}${tolUp}\n    ${state.behavior.up.policies.length ? "policies:\n" + upPols : "policies: []"}\n    selectPolicy: ${state.behavior.up.selectPolicy}`;
    }

    function updateYamlPreview() {
        $("#yamlPreview").value = toBehaviorYaml();
    }

    // Rendering charts using lightweight SVG building
    function renderCharts() {
        const metricSvg = $("#metricChart");
        const replicaSvg = $("#replicaChart");
        const W = 1000;
        const H = 280;

        const data = state.data;
        if (data.length === 0) {
            metricSvg.innerHTML = "";
            replicaSvg.innerHTML = "";
            return;
        }
        const tMax = Math.max(...data.map((d) => d.t));
        const mVals = data.map((d) => d.metric).concat([state.target]);
        const mMin = Math.min(...mVals);
        const mMax = Math.max(...mVals);
        const rVals = data.map((d) => d.replicas).concat(data.map((d) => d.desired));
        const rMin = Math.min(...rVals, state.minReplicas);
        const rMax = Math.max(...rVals, state.maxReplicas);

        const sx = (t) => (tMax ? (t / tMax) * (W - 40) + 20 : 20);
        const syM = (v) => H - 20 - ((v - mMin) / (mMax - mMin || 1)) * (H - 40);
        const syR = (v) => H - 20 - ((v - rMin) / (rMax - rMin || 1)) * (H - 40);

        // metric chart
        const metricPath = pathFrom(data.map((d) => [sx(d.t), syM(d.metric)]));
        const targetPath = pathFrom(data.map((d) => [sx(d.t), syM(state.target)]));
        metricSvg.innerHTML = `
      ${axesSvg(W, H)}
      <g class="legend" transform="translate(16,16)">
        <rect x="0" y="-12" width="220" height="20" rx="6" ry="6" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.08)" />
        <circle cx="10" cy="-2" r="4" fill="#38bdf8" />
        <text x="20" y="2" fill="#9ca3af" font-size="12">metric</text>
        <circle cx="90" cy="-2" r="4" fill="#34d399" />
        <text x="100" y="2" fill="#9ca3af" font-size="12">target</text>
      </g>
      <path d="${metricPath}" stroke="#38bdf8" stroke-width="2" fill="none" />
      <path d="${targetPath}" stroke="#34d399" stroke-width="2" fill="none" stroke-dasharray="6 4" />
    `;

        // replicas chart
        const replicaPath = pathFrom(data.map((d) => [sx(d.t), syR(d.replicas)]));
        const desiredPath = pathFrom(data.map((d) => [sx(d.t), syR(d.desired)]));
        const stabilizedPath = pathFrom(data.map((d) => [sx(d.t), syR(d.stabilized)]));
        const minY = syR(state.minReplicas);
        const maxY = syR(state.maxReplicas);
        replicaSvg.innerHTML = `
      ${axesSvg(W, H)}
      <g class="legend" transform="translate(16,16)">
        <rect x="0" y="-12" width="340" height="20" rx="6" ry="6" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.08)" />
        <circle cx="10" cy="-2" r="4" fill="#a78bfa" />
        <text x="20" y="2" fill="#9ca3af" font-size="12">replicas</text>
        <circle cx="100" cy="-2" r="4" fill="#f472b6" />
        <text x="110" y="2" fill="#9ca3af" font-size="12">desired</text>
        <circle cx="180" cy="-2" r="4" fill="#22d3ee" />
        <text x="190" y="2" fill="#9ca3af" font-size="12">stabilized</text>
      </g>
      <line x1="20" x2="${W - 20}" y1="${minY}" y2="${minY}" stroke="rgba(255,255,255,0.15)" stroke-dasharray="4 4" />
      <line x1="20" x2="${W - 20}" y1="${maxY}" y2="${maxY}" stroke="rgba(255,255,255,0.15)" stroke-dasharray="4 4" />
      <path d="${replicaPath}" stroke="#a78bfa" stroke-width="2" fill="none" />
      <path d="${desiredPath}" stroke="#f472b6" stroke-width="2" fill="none" stroke-dasharray="6 4" />
      <path d="${stabilizedPath}" stroke="#22d3ee" stroke-width="2" fill="none" stroke-dasharray="2 4" />
    `;
    }

    function axesSvg(W, H) {
        const grid = [];
        for (let i = 0; i < 10; i += 1) {
            const x = 20 + (i / 9) * (W - 40);
            grid.push(`<line x1="${x}" y1="20" x2="${x}" y2="${H - 20}" stroke="rgba(255,255,255,0.06)" />`);
        }
        for (let i = 0; i < 6; i += 1) {
            const y = 20 + (i / 5) * (H - 40);
            grid.push(`<line x1="20" y1="${y}" x2="${W - 20}" y2="${y}" stroke="rgba(255,255,255,0.06)" />`);
        }
        return `<rect x="0" y="0" width="${W}" height="${H}" rx="12" ry="12" fill="#0b1220" stroke="rgba(255,255,255,0.06)" />${grid.join("")}`;
    }

    function pathFrom(points) {
        if (points.length === 0) return "";
        let d = `M ${points[0][0]} ${points[0][1]}`;
        for (let i = 1; i < points.length; i += 1) {
            d += ` L ${points[i][0]} ${points[i][1]}`;
        }
        return d;
    }

    function logDecision(row) {
        state.logs.push(row);
        const tr = document.createElement("tr");
        tr.innerHTML = [
            row.t.toFixed(0),
            row.metric.toFixed(1),
            row.ratio.toFixed(2),
            row.desired,
            row.stabilized,
            row.direction,
            row.allowed,
            row.appliedChange,
            row.replicas,
        ]
            .map((v) => `<td>${v}</td>`)
            .join("");
        $("#logBody").appendChild(tr);
    }

    function clearLog() {
        $("#logBody").innerHTML = "";
        state.logs = [];
    }

    function tick(dt) {
        state.t += dt;
        state.elapsedSinceSync += dt;
        const metric = computeMetric(state.t);
        const desiredRaw = computeDesiredReplicas(state.replicas, metric, state.target);
        // Determine direction
        const direction = desiredRaw > state.replicas ? "up" : desiredRaw < state.replicas ? "down" : "hold";

        // Tolerance gating
        let canScale = true;
        if (direction === "up") canScale = !withinTolerance("up", metric, state.target);
        else if (direction === "down") canScale = !withinTolerance("down", metric, state.target);

        // Stabilization window
        const stabilizedDesired = applyStabilization(direction, desiredRaw);

        // Record desired history every tick (for stabilization window)
        state.desiredHistory.push({ t: state.t, desired: desiredRaw });
        // Trim old history to max window
        const maxWindow = Math.max(
            state.behavior.up.stabilizationWindowSeconds || 0,
            state.behavior.down.stabilizationWindowSeconds || 0
        );
        const cutoff = state.t - maxWindow - 5;
        state.desiredHistory = state.desiredHistory.filter((d) => d.t >= cutoff);

        // Only apply changes on sync boundaries
        let appliedChange = 0;
        if (state.elapsedSinceSync >= state.syncPeriod - 1e-6) {
            state.elapsedSinceSync = 0;
            if (direction !== "hold" && canScale) {
                const cfgDir = direction;
                const allowed = computeAllowedChange(cfgDir, state.replicas);
                const delta = stabilizedDesired - state.replicas;
                const change = clamp(Math.abs(delta), 0, allowed);
                appliedChange = delta >= 0 ? change : -change;
                let next = state.replicas + appliedChange;
                next = clamp(Math.round(next), state.minReplicas, state.maxReplicas);
                state.replicas = next;
                logDecision({
                    t: state.t,
                    metric,
                    ratio: state.target > 0 ? metric / state.target : 1,
                    desired: desiredRaw,
                    stabilized: stabilizedDesired,
                    direction: cfgDir,
                    allowed: Number.isFinite(allowed) ? allowed : "∞",
                    appliedChange,
                    replicas: state.replicas,
                });
            } else {
                logDecision({
                    t: state.t,
                    metric,
                    ratio: state.target > 0 ? metric / state.target : 1,
                    desired: desiredRaw,
                    stabilized: stabilizedDesired,
                    direction: direction === "hold" ? "hold" : "gated",
                    allowed: 0,
                    appliedChange: 0,
                    replicas: state.replicas,
                });
            }
        }

        state.data.push({
            t: state.t,
            metric,
            replicas: state.replicas,
            desired: desiredRaw,
            stabilized: stabilizedDesired,
        });

        // Keep data length reasonable
        if (state.data.length > 2000) state.data.shift();

        renderCharts();
    }

    let rafId = 0;
    let lastTs = 0;
    function loop(ts) {
        if (!state.running) return;
        if (!lastTs) lastTs = ts;
        const elapsed = (ts - lastTs) / 1000;
        lastTs = ts;
        const scaled = elapsed * state.speed;
        // advance by timeStep chunks to keep physics stable
        let acc = scaled;
        while (acc > 0) {
            const dt = Math.min(state.timeStep, acc);
            tick(dt);
            acc -= dt;
        }
        rafId = requestAnimationFrame(loop);
    }

    function start() {
        if (state.running) return;
        state.running = true;
        lastTs = 0;
        rafId = requestAnimationFrame(loop);
    }
    function pause() {
        state.running = false;
        if (rafId) cancelAnimationFrame(rafId);
    }
    function step() {
        pause();
        tick(state.timeStep);
    }
    function clearSim() {
        pause();
        state.t = 0;
        state.elapsedSinceSync = 0;
        state.replicas = Number($("#initialReplicas").value || 1);
        state.data = [];
        state.desiredHistory = [];
        clearLog();
        renderCharts();
    }

    function applyParamsToUI(params) {
        $("#minReplicas").value = params.minReplicas;
        $("#maxReplicas").value = params.maxReplicas;
        $("#initialReplicas").value = params.initialReplicas;
        $("#targetValue").value = params.targetValue;
        $("#syncPeriod").value = params.syncPeriod;
        $("#upStabWindow").value = params.up.stabilizationWindowSeconds;
        $("#downStabWindow").value = params.down.stabilizationWindowSeconds;
        $("#upTolerance").value = params.up.tolerance;
        $("#downTolerance").value = params.down.tolerance;
        $("#upSelectPolicy").value = params.up.selectPolicy;
        $("#downSelectPolicy").value = params.down.selectPolicy;
        state.behavior.up = JSON.parse(JSON.stringify(params.up));
        state.behavior.down = JSON.parse(JSON.stringify(params.down));
        inflatePoliciesUI();
        updateYamlPreview();
        clearSim();
    }

    function captureUI() {
        state.minReplicas = Number($("#minReplicas").value || 0);
        state.maxReplicas = Number($("#maxReplicas").value || 1);
        state.target = Number($("#targetValue").value || 1);
        state.syncPeriod = Number($("#syncPeriod").value || 15);
        state.timeStep = Number($("#timeStep").value || 1);
        state.speed = Number($("#speedSlider").value || 1);
        state.behavior.up.stabilizationWindowSeconds = Number($("#upStabWindow").value || 0);
        state.behavior.down.stabilizationWindowSeconds = Number($("#downStabWindow").value || 0);
        state.behavior.up.tolerance = Number($("#upTolerance").value || 0);
        state.behavior.down.tolerance = Number($("#downTolerance").value || 0);
        state.behavior.up.selectPolicy = $("#upSelectPolicy").value;
        state.behavior.down.selectPolicy = $("#downSelectPolicy").value;
        syncPoliciesFromUI();
        updateYamlPreview();
    }

    function downloadCsv() {
        const headers = [
            "t", "metric", "replicas", "desired", "stabilized"
        ];
        const rows = state.data.map(d => [d.t, d.metric, d.replicas, d.desired, d.stabilized]);
        const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "hpa_simulation.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function copyYaml() {
        const text = $("#yamlPreview").value;
        navigator.clipboard.writeText(text).then(() => {
            $("#copyYamlBtn").textContent = "Copied";
            setTimeout(() => ($("#copyYamlBtn").textContent = "Copy YAML"), 1200);
        });
    }

    function loadTemplates() {
        const sel = $("#templateSelect");
        sel.innerHTML = window.HPA_EXAMPLES.map((e) => `<option value="${e.id}">${e.name}</option>`).join("");
        const first = window.HPA_EXAMPLES[0];
        $("#templateDescription").textContent = first.description;
        applyParamsToUI(first.params);
        sel.addEventListener("change", () => {
            const t = window.HPA_EXAMPLES.find((x) => x.id === sel.value);
            $("#templateDescription").textContent = t.description;
        });
        $("#applyTemplateBtn").addEventListener("click", () => {
            const t = window.HPA_EXAMPLES.find((x) => x.id === sel.value);
            applyParamsToUI(t.params);
        });
    }

    function bindUI() {
        loadTemplates();
        const metricSel = $("#metricScenario");
        metricSel.innerHTML = metricScenarios.map((m) => `<option value="${m.id}">${m.name}</option>`).join("");
        metricSel.value = state.metricScenario;
        metricSel.addEventListener("change", () => {
            state.metricScenario = metricSel.value;
            clearSim();
        });

        $("#customFormula").addEventListener("change", (e) => {
            state.customFormula = e.target.value;
            state.metricScenario = "custom";
            $("#metricScenario").value = "custom";
            clearSim();
        });

        $("#startBtn").addEventListener("click", () => {
            captureUI();
            start();
        });
        $("#pauseBtn").addEventListener("click", pause);
        $("#stepBtn").addEventListener("click", () => {
            captureUI();
            step();
        });
        $("#clearBtn").addEventListener("click", clearSim);
        $("#downloadBtn").addEventListener("click", downloadCsv);
        $("#copyYamlBtn").addEventListener("click", copyYaml);

        $("#speedSlider").addEventListener("input", () => {
            state.speed = Number($("#speedSlider").value || 1);
        });
        [
            "#minReplicas", "#maxReplicas", "#initialReplicas", "#targetValue", "#syncPeriod", "#timeStep", "#upStabWindow", "#downStabWindow", "#upTolerance", "#downTolerance", "#upSelectPolicy", "#downSelectPolicy"
        ].forEach((sel) => {
            $(sel).addEventListener("change", () => {
                captureUI();
            });
        });

        $("#addUpPodsPolicy").addEventListener("click", () => addPolicyUI("#upPolicies", "up", "Pods"));
        $("#addUpPercentPolicy").addEventListener("click", () => addPolicyUI("#upPolicies", "up", "Percent"));
        $("#addDownPodsPolicy").addEventListener("click", () => addPolicyUI("#downPolicies", "down", "Pods"));
        $("#addDownPercentPolicy").addEventListener("click", () => addPolicyUI("#downPolicies", "down", "Percent"));

        $("#resetBtn").addEventListener("click", () => {
            const t = window.HPA_EXAMPLES.find((x) => x.id === $("#templateSelect").value);
            applyParamsToUI(t.params);
        });
    }

    // Initialize
    bindUI();
    clearSim();
})();


