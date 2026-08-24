/**
 * Project Management — Oil Terminal Operations Board
 * monday.com-style workspace for vessel calls / voyages.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'andeco_pm_terminal_data';

  var GROUPS = [
    { id: 'pre-arrival', label: 'Pre-Arrival & Berthing', css: 'pre', desc: 'Approaching or anchoring' },
    { id: 'active-cargo', label: 'Active Cargo Operations', css: 'active', desc: 'Fast alongside / transferring' },
    { id: 'post-loading', label: 'Post-Loading & Departure', css: 'post', desc: 'Paperwork, gauging, unberthing' }
  ];

  var PRODUCTS = ['Crude', 'ULSD', 'Jet A-1', 'Gasoline', 'Fuel Oil', 'Naphtha'];
  var UNITS = ['bbls', 'MT'];
  var BERTHS = ['Jetty 1', 'Jetty 2', 'Sea Berth', 'Unassigned'];

  var MILESTONES = [
    { id: 'eta-confirmed', label: 'ETA Confirmed', css: 'eta' },
    { id: 'moored', label: 'Moored', css: 'moored' },
    { id: 'hose-conn', label: 'Hose Conn', css: 'hose' },
    { id: 'pumping', label: 'Pumping', css: 'pump' },
    { id: 'stopped-gauging', label: 'Stopped/Gauging', css: 'gauge' },
    { id: 'completed', label: 'Completed', css: 'done' },
    { id: 'delayed', label: 'Delayed/Stuck', css: 'delay' }
  ];

  var ROLE_FIELDS = [
    { key: 'mooringMaster', label: 'Mooring Master', color: '#0284c7' },
    { key: 'loadingMaster', label: 'Loading Master', color: '#0d9488' },
    { key: 'marineSurveyor', label: 'Marine Surveyor', color: '#7c3aed' },
    { key: 'cargoSuperintendent', label: 'Cargo Superintendent', color: '#b45309' }
  ];

  var collapsed = {};
  var filterText = '';
  var filterMilestone = 'all';
  var bound = false;

  function id() {
    return 'vc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function persistAllIfFile() {
    try {
      if (window.AccountingData && window.AccountingData.persistAll) window.AccountingData.persistAll();
    } catch (e) {}
  }

  function defaultPeople() {
    return [
      { name: 'A. Costa', role: 'Mooring Master' },
      { name: 'M. Khan', role: 'Loading Master' },
      { name: 'S. Patel', role: 'Marine Surveyor' },
      { name: 'J. Ortega', role: 'Cargo Superintendent' },
      { name: 'L. Berg', role: 'Mooring Master' },
      { name: 'R. Silva', role: 'Loading Master' },
      { name: 'N. Okonkwo', role: 'Marine Surveyor' },
      { name: 'E. Vassiliou', role: 'Cargo Superintendent' }
    ];
  }

  function sampleCalls() {
    var now = new Date();
    function dt(dayOffset, hour) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hour, 0, 0);
      return toLocalInput(d);
    }
    return [
      {
        id: id(),
        group: 'pre-arrival',
        vesselName: 'MT Aegean Star',
        voyageId: 'VYG-2603-01',
        product: 'Crude',
        quantity: 420000,
        quantityUnit: 'bbls',
        berth: 'Jetty 1',
        mooringMaster: 'A. Costa',
        loadingMaster: 'M. Khan',
        marineSurveyor: 'S. Patel',
        cargoSuperintendent: 'J. Ortega',
        milestone: 'eta-confirmed',
        eta: dt(1, 6),
        norTendered: '',
        commencedLoading: '',
        completedLoading: '',
        checklistOpen: 4,
        bolSigned: false,
        notes: 'Waiting for pilot boarding window'
      },
      {
        id: id(),
        group: 'pre-arrival',
        vesselName: 'Nordic Horizon',
        voyageId: 'VYG-2603-04',
        product: 'ULSD',
        quantity: 18500,
        quantityUnit: 'MT',
        berth: 'Unassigned',
        mooringMaster: 'L. Berg',
        loadingMaster: '',
        marineSurveyor: '',
        cargoSuperintendent: 'E. Vassiliou',
        milestone: 'delayed',
        eta: dt(0, 18),
        norTendered: '',
        commencedLoading: '',
        completedLoading: '',
        checklistOpen: 2,
        bolSigned: false,
        notes: 'Weather delay — swell at anchorage'
      },
      {
        id: id(),
        group: 'active-cargo',
        vesselName: 'Pacific Trader',
        voyageId: 'VYG-2603-02',
        product: 'Jet A-1',
        quantity: 9800,
        quantityUnit: 'MT',
        berth: 'Jetty 2',
        mooringMaster: 'A. Costa',
        loadingMaster: 'R. Silva',
        marineSurveyor: 'N. Okonkwo',
        cargoSuperintendent: 'J. Ortega',
        milestone: 'pumping',
        eta: dt(-1, 8),
        norTendered: dt(-1, 10),
        commencedLoading: dt(-1, 14),
        completedLoading: '',
        checklistOpen: 1,
        bolSigned: false,
        notes: 'Shore tanks 3 & 4 online'
      },
      {
        id: id(),
        group: 'active-cargo',
        vesselName: 'Caspian Pearl',
        voyageId: 'VYG-2603-05',
        product: 'Gasoline',
        quantity: 12500,
        quantityUnit: 'MT',
        berth: 'Sea Berth',
        mooringMaster: 'L. Berg',
        loadingMaster: 'M. Khan',
        marineSurveyor: 'S. Patel',
        cargoSuperintendent: 'E. Vassiliou',
        milestone: 'hose-conn',
        eta: dt(0, 4),
        norTendered: dt(0, 6),
        commencedLoading: '',
        completedLoading: '',
        checklistOpen: 3,
        bolSigned: false,
        notes: 'Hose connection in progress'
      },
      {
        id: id(),
        group: 'post-loading',
        vesselName: 'Ionian Pride',
        voyageId: 'VYG-2602-18',
        product: 'Fuel Oil',
        quantity: 22000,
        quantityUnit: 'MT',
        berth: 'Jetty 1',
        mooringMaster: 'A. Costa',
        loadingMaster: 'R. Silva',
        marineSurveyor: 'N. Okonkwo',
        cargoSuperintendent: 'J. Ortega',
        milestone: 'stopped-gauging',
        eta: dt(-3, 9),
        norTendered: dt(-3, 11),
        commencedLoading: dt(-2, 8),
        completedLoading: dt(0, 2),
        checklistOpen: 0,
        bolSigned: false,
        notes: 'Independent gauging / BOL pending'
      },
      {
        id: id(),
        group: 'post-loading',
        vesselName: 'Black Sea Express',
        voyageId: 'VYG-2602-16',
        product: 'Naphtha',
        quantity: 7600,
        quantityUnit: 'MT',
        berth: 'Jetty 2',
        mooringMaster: 'L. Berg',
        loadingMaster: 'M. Khan',
        marineSurveyor: 'S. Patel',
        cargoSuperintendent: 'E. Vassiliou',
        milestone: 'completed',
        eta: dt(-5, 7),
        norTendered: dt(-5, 9),
        commencedLoading: dt(-4, 10),
        completedLoading: dt(-1, 16),
        checklistOpen: 0,
        bolSigned: true,
        notes: 'Cleared for departure'
      }
    ];
  }

  function normalizeCall(c) {
    c = c || {};
    return {
      id: c.id || id(),
      group: GROUPS.some(function (g) { return g.id === c.group; }) ? c.group : 'pre-arrival',
      vesselName: String(c.vesselName || ''),
      voyageId: String(c.voyageId || ''),
      product: PRODUCTS.indexOf(c.product) !== -1 ? c.product : 'Crude',
      quantity: Number(c.quantity) || 0,
      quantityUnit: UNITS.indexOf(c.quantityUnit) !== -1 ? c.quantityUnit : 'MT',
      berth: BERTHS.indexOf(c.berth) !== -1 ? c.berth : 'Unassigned',
      mooringMaster: String(c.mooringMaster || ''),
      loadingMaster: String(c.loadingMaster || ''),
      marineSurveyor: String(c.marineSurveyor || ''),
      cargoSuperintendent: String(c.cargoSuperintendent || ''),
      milestone: MILESTONES.some(function (m) { return m.id === c.milestone; }) ? c.milestone : 'eta-confirmed',
      eta: String(c.eta || ''),
      norTendered: String(c.norTendered || ''),
      commencedLoading: String(c.commencedLoading || ''),
      completedLoading: String(c.completedLoading || ''),
      checklistOpen: Math.max(0, parseInt(c.checklistOpen, 10) || 0),
      bolSigned: !!c.bolSigned,
      notes: String(c.notes || '')
    };
  }

  function normalizeData(d) {
    d = d || {};
    var calls = Array.isArray(d.calls) ? d.calls.map(normalizeCall) : [];
    var people = Array.isArray(d.people) && d.people.length ? d.people : defaultPeople();
    return { calls: calls, people: people, seeded: !!d.seeded };
  }

  function getData() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normalizeData(JSON.parse(raw));
    } catch (e) {}
    var seeded = normalizeData({ calls: sampleCalls(), people: defaultPeople(), seeded: true });
    saveData(seeded);
    return seeded;
  }

  function saveData(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeData(data)));
    } catch (e) {}
    persistAllIfFile();
  }

  function getCalls() { return getData().calls; }
  function getPeople() { return getData().people; }

  function saveCalls(calls) {
    var d = getData();
    d.calls = calls.map(normalizeCall);
    saveData(d);
  }

  function updateCall(callId, patch) {
    var calls = getCalls();
    var found = false;
    calls = calls.map(function (c) {
      if (c.id !== callId) return c;
      found = true;
      return normalizeCall(Object.assign({}, c, patch));
    });
    if (found) saveCalls(calls);
    return found;
  }

  function deleteCall(callId) {
    saveCalls(getCalls().filter(function (c) { return c.id !== callId; }));
  }

  function addCall(groupId) {
    var n = getCalls().length + 1;
    var call = normalizeCall({
      group: groupId || 'pre-arrival',
      vesselName: 'New vessel call',
      voyageId: 'VYG-' + new Date().getFullYear().toString().slice(-2) + String(n).padStart(3, '0'),
      product: 'Crude',
      quantity: 0,
      quantityUnit: 'MT',
      berth: 'Unassigned',
      milestone: 'eta-confirmed',
      checklistOpen: 5
    });
    var calls = getCalls();
    calls.push(call);
    saveCalls(calls);
    return call;
  }

  function toLocalInput(dateObj) {
    if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) return '';
    var y = dateObj.getFullYear();
    var m = ('0' + (dateObj.getMonth() + 1)).slice(-2);
    var d = ('0' + dateObj.getDate()).slice(-2);
    var h = ('0' + dateObj.getHours()).slice(-2);
    var mi = ('0' + dateObj.getMinutes()).slice(-2);
    return y + '-' + m + '-' + d + 'T' + h + ':' + mi;
  }

  function parseLocal(val) {
    if (!val) return null;
    var d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function milestoneMeta(idVal) {
    for (var i = 0; i < MILESTONES.length; i++) {
      if (MILESTONES[i].id === idVal) return MILESTONES[i];
    }
    return MILESTONES[0];
  }

  function berthClass(berth) {
    return 'pm-berth--' + String(berth || 'unassigned').toLowerCase().replace(/\s+/g, '-');
  }

  function filteredCalls() {
    var q = filterText.trim().toLowerCase();
    return getCalls().filter(function (c) {
      if (filterMilestone !== 'all' && c.milestone !== filterMilestone) return false;
      if (!q) return true;
      var blob = [c.vesselName, c.voyageId, c.product, c.berth, c.mooringMaster, c.loadingMaster, c.marineSurveyor, c.cargoSuperintendent, c.notes].join(' ').toLowerCase();
      return blob.indexOf(q) !== -1;
    });
  }

  function optionsHtml(list, selected) {
    return list.map(function (v) {
      return '<option value="' + escapeHtml(v) + '"' + (v === selected ? ' selected' : '') + '>' + escapeHtml(v) + '</option>';
    }).join('');
  }

  function milestoneOptions(selected) {
    return MILESTONES.map(function (m) {
      return '<option value="' + m.id + '"' + (m.id === selected ? ' selected' : '') + '>' + escapeHtml(m.label) + '</option>';
    }).join('');
  }

  function peopleOptions(selected, roleHint) {
    var people = getPeople();
    var opts = ['<option value="">— Unassigned —</option>'];
    people.forEach(function (p) {
      if (roleHint && p.role && p.role !== roleHint) return;
      opts.push('<option value="' + escapeHtml(p.name) + '"' + (p.name === selected ? ' selected' : '') + '>' + escapeHtml(p.name) + '</option>');
    });
    if (selected && !people.some(function (p) { return p.name === selected; })) {
      opts.push('<option value="' + escapeHtml(selected) + '" selected>' + escapeHtml(selected) + '</option>');
    }
    // Also include all people if role filter emptied options
    if (opts.length <= 1) {
      people.forEach(function (p) {
        opts.push('<option value="' + escapeHtml(p.name) + '"' + (p.name === selected ? ' selected' : '') + '>' + escapeHtml(p.name) + ' (' + escapeHtml(p.role || '') + ')</option>');
      });
    }
    return opts.join('');
  }

  function avatarHtml(name, color) {
    if (!name) {
      return '<span class="pm-avatar pm-avatar--empty" title="Unassigned">+</span>';
    }
    return '<span class="pm-avatar" title="' + escapeHtml(name) + '" style="background:' + color + '">' + escapeHtml(initials(name)) + '</span>';
  }

  function computeMetrics(calls) {
    var pumpingVol = 0;
    var checklist = 0;
    var berthSet = {};
    calls.forEach(function (c) {
      checklist += c.checklistOpen || 0;
      if (c.milestone === 'pumping') pumpingVol += Number(c.quantity) || 0;
      if (c.berth && c.berth !== 'Unassigned' && c.group !== 'post-loading' || (c.group === 'active-cargo')) {
        if (c.berth !== 'Unassigned' && c.milestone !== 'completed') berthSet[c.berth] = true;
      }
    });
    // Utilization: occupied named berths among Jetty 1, Jetty 2, Sea Berth
    var capacity = 3;
    var occupied = ['Jetty 1', 'Jetty 2', 'Sea Berth'].filter(function (b) {
      return calls.some(function (c) {
        return c.berth === b && c.milestone !== 'completed' && c.group !== 'pre-arrival';
      });
    }).length;
    // Also count pre-arrival assigned berths that are confirmed moored-ish
    occupied = ['Jetty 1', 'Jetty 2', 'Sea Berth'].filter(function (b) {
      return calls.some(function (c) {
        return c.berth === b && ['moored', 'hose-conn', 'pumping', 'stopped-gauging'].indexOf(c.milestone) !== -1;
      });
    }).length;
    var util = Math.round((occupied / capacity) * 100);
    return {
      pumpingVolume: pumpingVol,
      utilization: util,
      occupied: occupied,
      capacity: capacity,
      checklistOpen: checklist
    };
  }

  function formatVolume(n) {
    var x = Number(n) || 0;
    return x.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function renderMetrics() {
    var m = computeMetrics(getCalls());
    var vol = document.getElementById('pm-metric-volume');
    var util = document.getElementById('pm-metric-util');
    var check = document.getElementById('pm-metric-checklist');
    if (vol) vol.textContent = formatVolume(m.pumpingVolume);
    if (util) util.textContent = m.utilization + '%';
    if (check) check.textContent = String(m.checklistOpen);
  }

  function rowHtml(call) {
    var ms = milestoneMeta(call.milestone);
    return (
      '<tr data-call-id="' + escapeHtml(call.id) + '">' +
        '<td>' +
          '<input class="pm-cell-input pm-vessel-primary" data-field="vesselName" value="' + escapeHtml(call.vesselName) + '" placeholder="Vessel name">' +
          '<input class="pm-cell-input pm-voyage" data-field="voyageId" value="' + escapeHtml(call.voyageId) + '" placeholder="Voyage ID">' +
        '</td>' +
        '<td><div class="pm-product-wrap">' +
          '<select class="pm-cell-select" data-field="product">' + optionsHtml(PRODUCTS, call.product) + '</select>' +
          '<input class="pm-cell-input" type="number" min="0" step="1" data-field="quantity" value="' + escapeHtml(call.quantity) + '" title="Quantity">' +
          '<select class="pm-cell-select" data-field="quantityUnit">' + optionsHtml(UNITS, call.quantityUnit) + '</select>' +
        '</div></td>' +
        '<td>' +
          '<select class="pm-cell-select pm-berth ' + berthClass(call.berth) + '" data-field="berth">' + optionsHtml(BERTHS, call.berth) + '</select>' +
        '</td>' +
        '<td><div class="pm-people" title="Operational roles">' +
          ROLE_FIELDS.map(function (r) {
            return avatarHtml(call[r.key], r.color);
          }).join('') +
          '<button type="button" class="pm-icon-btn" data-action="edit-people" title="Assign roles">✎</button>' +
        '</div></td>' +
        '<td>' +
          '<select class="pm-cell-select pm-badge pm-badge--' + ms.css + '" data-field="milestone">' + milestoneOptions(call.milestone) + '</select>' +
        '</td>' +
        '<td><input class="pm-cell-input pm-ts" type="datetime-local" data-field="eta" value="' + escapeHtml(call.eta) + '"></td>' +
        '<td><input class="pm-cell-input pm-ts" type="datetime-local" data-field="norTendered" value="' + escapeHtml(call.norTendered) + '"></td>' +
        '<td><input class="pm-cell-input pm-ts" type="datetime-local" data-field="commencedLoading" value="' + escapeHtml(call.commencedLoading) + '"></td>' +
        '<td><input class="pm-cell-input pm-ts" type="datetime-local" data-field="completedLoading" value="' + escapeHtml(call.completedLoading) + '"></td>' +
        '<td><input class="pm-cell-input" type="number" min="0" step="1" data-field="checklistOpen" value="' + escapeHtml(call.checklistOpen) + '" title="Open safety checklist items" style="width:3.5rem"></td>' +
        '<td><div class="pm-row-actions">' +
          '<button type="button" class="pm-icon-btn" data-action="move-group" title="Move group">⇄</button>' +
          '<button type="button" class="pm-icon-btn pm-icon-btn--danger" data-action="delete" title="Delete">×</button>' +
        '</div></td>' +
      '</tr>'
    );
  }

  function renderBoard() {
    var root = document.getElementById('pm-board-root');
    if (!root) return;
    var calls = filteredCalls();
    root.innerHTML = GROUPS.map(function (g) {
      var rows = calls.filter(function (c) { return c.group === g.id; });
      var collapsedCls = collapsed[g.id] ? ' is-collapsed' : '';
      var body = rows.length
        ? (
          '<div class="pm-group-body"><table class="pm-table"><thead><tr>' +
            '<th>Vessel / Voyage</th><th>Product &amp; Qty</th><th>Berth</th><th>Roles</th><th>Milestone</th>' +
            '<th>ETA</th><th>NOR Tendered</th><th>Commenced Loading</th><th>Completed Loading</th><th>Safety CL</th><th></th>' +
          '</tr></thead><tbody>' + rows.map(rowHtml).join('') + '</tbody></table></div>'
        )
        : '<div class="pm-group-body"><p class="pm-empty">No vessel calls in this stage. Add one to begin.</p></div>';
      return (
        '<section class="pm-group pm-group--' + g.css + collapsedCls + '" data-group="' + g.id + '">' +
          '<div class="pm-group-header" data-action="toggle-group">' +
            '<button type="button" class="pm-group-toggle" aria-label="Collapse">' + (collapsed[g.id] ? '▸' : '▾') + '</button>' +
            '<h3 class="pm-group-title">' + escapeHtml(g.label) + '</h3>' +
            '<span class="pm-group-count">' + rows.length + '</span>' +
            '<button type="button" class="pm-group-add" data-action="add-call">+ Add vessel call</button>' +
          '</div>' +
          body +
        '</section>'
      );
    }).join('');
  }

  function startOfWeek(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var day = x.getDay();
    var diff = day === 0 ? -6 : 1 - day;
    x.setDate(x.getDate() + diff);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function renderTimeline() {
    var root = document.getElementById('pm-timeline-root');
    if (!root) return;
    var weekStart = startOfWeek(new Date());
    var days = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      days.push(d);
    }
    var weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    var dayLabels = days.map(function (d) {
      return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
    }).map(function (t) { return '<span>' + escapeHtml(t) + '</span>'; }).join('');

    var berths = ['Jetty 1', 'Jetty 2', 'Sea Berth'];
    var calls = getCalls().filter(function (c) { return c.berth && c.berth !== 'Unassigned'; });

    var tracks = berths.map(function (berth) {
      var bars = calls.filter(function (c) { return c.berth === berth; }).map(function (c) {
        var start = parseLocal(c.eta) || parseLocal(c.commencedLoading) || parseLocal(c.norTendered);
        var end = parseLocal(c.completedLoading) || parseLocal(c.commencedLoading) || start;
        if (!start) return '';
        if (!end || end < start) end = new Date(start.getTime() + 8 * 3600000);
        // Extend active pumping bars toward week end if still open
        if (!c.completedLoading && c.milestone === 'pumping') {
          end = new Date(Math.max(end.getTime(), Date.now() + 4 * 3600000));
        }
        var ws = weekStart.getTime();
        var we = weekEnd.getTime();
        var s = Math.max(start.getTime(), ws);
        var e = Math.min(end.getTime(), we);
        if (e <= ws || s >= we) return '';
        var left = ((s - ws) / (we - ws)) * 100;
        var width = Math.max(2.5, ((e - s) / (we - ws)) * 100);
        return '<div class="pm-gantt-bar ' + berthClass(berth) + '" style="left:' + left + '%;width:' + width + '%" title="' +
          escapeHtml(c.vesselName + ' · ' + c.voyageId) + '">' + escapeHtml(c.vesselName) + '</div>';
      }).join('');
      return '<div class="pm-gantt-label">' + escapeHtml(berth) + '</div><div class="pm-gantt-track">' + bars + '</div>';
    }).join('');

    root.innerHTML =
      '<div class="pm-gantt-wrap">' +
        '<div class="pm-gantt-head"><h3>Jetty occupancy — this week</h3>' +
          '<span class="module-meta">Bars use ETA → Completed Loading (or live pumping window)</span></div>' +
        '<div class="pm-gantt-scroll">' +
          '<div class="pm-gantt-days">' + dayLabels + '</div>' +
          '<div class="pm-gantt">' + tracks + '</div>' +
        '</div>' +
      '</div>';
  }

  function renderDashboard() {
    var root = document.getElementById('pm-dashboard-root');
    if (!root) return;
    var calls = getCalls();
    var m = computeMetrics(calls);
    var byMilestone = MILESTONES.map(function (ms) {
      var n = calls.filter(function (c) { return c.milestone === ms.id; }).length;
      return { ms: ms, n: n };
    }).filter(function (x) { return x.n > 0; });

    var pumping = calls.filter(function (c) { return c.milestone === 'pumping'; });
    var checklistRows = calls.filter(function (c) { return c.checklistOpen > 0; })
      .sort(function (a, b) { return b.checklistOpen - a.checklistOpen; })
      .slice(0, 8);

    root.innerHTML =
      '<div class="pm-dash-grid">' +
        '<div class="pm-card">' +
          '<h3>Jetty utilization</h3>' +
          '<div class="pm-metric-value">' + m.utilization + '%</div>' +
          '<div class="pm-util-bar"><div class="pm-util-fill" style="width:' + m.utilization + '%"></div></div>' +
          '<p class="module-meta">' + m.occupied + ' of ' + m.capacity + ' berths occupied (moored → gauging)</p>' +
          '<h3 style="margin-top:1.1rem">Active pumping volume</h3>' +
          '<div class="pm-metric-value">' + formatVolume(m.pumpingVolume) + '</div>' +
          '<p class="module-meta">Sum of product quantity on vessels currently pumping</p>' +
          (pumping.length
            ? '<ul class="pm-checklist-list" style="margin-top:0.75rem">' + pumping.map(function (c) {
                return '<li><span>' + escapeHtml(c.vesselName) + '</span><strong>' + formatVolume(c.quantity) + ' ' + escapeHtml(c.quantityUnit) + '</strong></li>';
              }).join('') + '</ul>'
            : '<p class="pm-empty">No vessels currently pumping.</p>') +
        '</div>' +
        '<div class="pm-card">' +
          '<h3>Safety compliance checklists</h3>' +
          '<div class="pm-metric-value">' + m.checklistOpen + '</div>' +
          '<p class="module-meta">Open checklist items across active vessel calls</p>' +
          (checklistRows.length
            ? '<ul class="pm-checklist-list" style="margin-top:0.75rem">' + checklistRows.map(function (c) {
                return '<li><span>' + escapeHtml(c.vesselName) + ' · ' + escapeHtml(c.voyageId) + '</span><strong>' + c.checklistOpen + ' open</strong></li>';
              }).join('') + '</ul>'
            : '<p class="pm-empty">All checklists clear.</p>') +
          '<div class="pm-status-legend">' + byMilestone.map(function (x) {
            return '<span class="pm-badge pm-badge--' + x.ms.css + '">' + escapeHtml(x.ms.label) + ' · ' + x.n + '</span>';
          }).join('') + '</div>' +
        '</div>' +
      '</div>';
  }

  function roleQueueCount(predicate) {
    return getCalls().filter(predicate).length;
  }

  function applyRoleAction(role, action) {
    var calls = getCalls();
    var target = null;
    if (role === 'mooring') {
      target = calls.find(function (c) { return c.group === 'pre-arrival' && c.milestone === 'eta-confirmed'; }) ||
        calls.find(function (c) { return c.group === 'pre-arrival'; });
      if (!target) return alert('No pre-arrival vessel available for Mooring Master actions.');
      if (action === 'confirm-eta') updateCall(target.id, { milestone: 'eta-confirmed' });
      if (action === 'mark-moored') {
        updateCall(target.id, {
          milestone: 'moored',
          group: 'active-cargo',
          norTendered: target.norTendered || toLocalInput(new Date())
        });
      }
    }
    if (role === 'loading') {
      target = calls.find(function (c) { return c.milestone === 'moored' || c.milestone === 'hose-conn'; });
      if (!target) return alert('No moored vessel ready for Loading Master actions.');
      if (action === 'hose') updateCall(target.id, { milestone: 'hose-conn', checklistOpen: Math.max(0, (target.checklistOpen || 1) - 1) });
      if (action === 'pump') {
        updateCall(target.id, {
          milestone: 'pumping',
          commencedLoading: target.commencedLoading || toLocalInput(new Date()),
          group: 'active-cargo'
        });
      }
    }
    if (role === 'surveyor') {
      target = calls.find(function (c) { return c.milestone === 'pumping' || c.milestone === 'stopped-gauging'; });
      if (!target) return alert('No pumping vessel available for Marine Surveyor actions.');
      if (action === 'gauge') {
        updateCall(target.id, {
          milestone: 'stopped-gauging',
          completedLoading: target.completedLoading || toLocalInput(new Date()),
          group: 'post-loading'
        });
      }
      if (action === 'bol') updateCall(target.id, { bolSigned: true, milestone: 'completed', checklistOpen: 0 });
    }
    if (role === 'cargo') {
      target = calls.find(function (c) { return c.milestone === 'pumping' || c.milestone === 'hose-conn'; });
      if (!target) return alert('No active cargo vessel for Superintendent review.');
      if (action === 'review-rate') {
        updateCall(target.id, { notes: (target.notes ? target.notes + ' · ' : '') + 'Loading rate reviewed ' + new Date().toLocaleString() });
        alert('Loading rate review logged on ' + target.vesselName);
      }
      if (action === 'inventory') {
        alert('Inventory check: active pumping volume is ' + formatVolume(computeMetrics(getCalls()).pumpingVolume) + ' across berths.');
      }
    }
    render();
  }

  function renderWorkflows() {
    var root = document.getElementById('pm-workflows-root');
    if (!root) return;
    var mooringQ = roleQueueCount(function (c) { return c.group === 'pre-arrival'; });
    var loadingQ = roleQueueCount(function (c) { return c.milestone === 'moored' || c.milestone === 'hose-conn'; });
    var surveyQ = roleQueueCount(function (c) { return c.milestone === 'pumping' || c.milestone === 'stopped-gauging'; });
    var cargoQ = roleQueueCount(function (c) { return c.group === 'active-cargo'; });

    root.innerHTML =
      '<div class="pm-roles-grid">' +
        '<article class="pm-role-card">' +
          '<h3>Mooring Master</h3>' +
          '<p>Tracks ETA, handles safe berthing, updates <strong>Moored</strong>, and logs when the vessel is fast alongside.</p>' +
          '<div class="pm-role-queue">Queue: <strong>' + mooringQ + '</strong> pre-arrival call(s)</div>' +
          '<div class="pm-role-actions">' +
            '<button type="button" class="btn btn-secondary" data-role="mooring" data-role-action="confirm-eta">Confirm ETA</button>' +
            '<button type="button" class="btn btn-primary" data-role="mooring" data-role-action="mark-moored">Mark Moored → Active</button>' +
          '</div>' +
        '</article>' +
        '<article class="pm-role-card">' +
          '<h3>Loading Master</h3>' +
          '<p>Oversees safety checklists, physical hose connection, updates <strong>Hose Conn</strong>, and coordinates pumping with shore side.</p>' +
          '<div class="pm-role-queue">Queue: <strong>' + loadingQ + '</strong> ready for connection / pump</div>' +
          '<div class="pm-role-actions">' +
            '<button type="button" class="btn btn-secondary" data-role="loading" data-role-action="hose">Hose Connected</button>' +
            '<button type="button" class="btn btn-primary" data-role="loading" data-role-action="pump">Start Pumping</button>' +
          '</div>' +
        '</article>' +
        '<article class="pm-role-card">' +
          '<h3>Marine Surveyor</h3>' +
          '<p>Independent tank gauging, updates <strong>Stopped/Gauging</strong>, and signs off Bill of Lading quantities.</p>' +
          '<div class="pm-role-queue">Queue: <strong>' + surveyQ + '</strong> pumping / gauging call(s)</div>' +
          '<div class="pm-role-actions">' +
            '<button type="button" class="btn btn-secondary" data-role="surveyor" data-role-action="gauge">Stop &amp; Gauge</button>' +
            '<button type="button" class="btn btn-primary" data-role="surveyor" data-role-action="bol">Sign BOL / Complete</button>' +
          '</div>' +
        '</article>' +
        '<article class="pm-role-card">' +
          '<h3>Cargo Superintendent</h3>' +
          '<p>Coordinates cargo logistics, monitors terminal inventory constraints, and reviews loading rates across the voyage.</p>' +
          '<div class="pm-role-queue">Active cargo: <strong>' + cargoQ + '</strong> vessel call(s)</div>' +
          '<div class="pm-role-actions">' +
            '<button type="button" class="btn btn-secondary" data-role="cargo" data-role-action="inventory">Inventory snapshot</button>' +
            '<button type="button" class="btn btn-primary" data-role="cargo" data-role-action="review-rate">Log rate review</button>' +
          '</div>' +
        '</article>' +
      '</div>';
  }

  function showPeopleModal(callId) {
    var call = getCalls().find(function (c) { return c.id === callId; });
    if (!call) return;
    var overlay = document.getElementById('pm-modal-overlay');
    var body = document.getElementById('pm-modal-body');
    if (!overlay || !body) return;
    body.innerHTML =
      '<h3>Assign operational roles</h3>' +
      '<p class="module-meta" style="margin-bottom:0.75rem">' + escapeHtml(call.vesselName) + ' · ' + escapeHtml(call.voyageId) + '</p>' +
      ROLE_FIELDS.map(function (r) {
        return '<div class="form-group"><label>' + escapeHtml(r.label) + '</label>' +
          '<select data-people-field="' + r.key + '">' + peopleOptions(call[r.key], r.label) + '</select></div>';
      }).join('') +
      '<div class="pm-modal-actions">' +
        '<button type="button" class="btn btn-secondary" id="pm-modal-cancel">Cancel</button>' +
        '<button type="button" class="btn btn-primary" id="pm-modal-save" data-call-id="' + escapeHtml(callId) + '">Save</button>' +
      '</div>';
    overlay.style.display = 'flex';
  }

  function hidePeopleModal() {
    var overlay = document.getElementById('pm-modal-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  function cycleGroup(callId) {
    var order = GROUPS.map(function (g) { return g.id; });
    var call = getCalls().find(function (c) { return c.id === callId; });
    if (!call) return;
    var idx = order.indexOf(call.group);
    var next = order[(idx + 1) % order.length];
    updateCall(callId, { group: next });
    render();
  }

  function bindEvents() {
    if (bound) return;
    bound = true;
    var page = document.getElementById('page-project-management');
    if (!page) return;

    page.addEventListener('click', function (e) {
      var viewBtn = e.target.closest('[data-pm-view]');
      if (viewBtn) {
        var view = viewBtn.getAttribute('data-pm-view');
        page.querySelectorAll('[data-pm-view]').forEach(function (b) {
          b.classList.toggle('is-active', b === viewBtn);
        });
        page.querySelectorAll('.pm-view-panel').forEach(function (p) {
          p.style.display = p.getAttribute('data-view') === view ? '' : 'none';
        });
        if (view === 'timeline') renderTimeline();
        if (view === 'dashboard') renderDashboard();
        if (view === 'workflows') renderWorkflows();
        if (view === 'board') renderBoard();
        return;
      }

      var toggle = e.target.closest('[data-action="toggle-group"]');
      if (toggle && !e.target.closest('[data-action="add-call"]')) {
        var groupEl = toggle.closest('[data-group]');
        if (groupEl) {
          var gid = groupEl.getAttribute('data-group');
          collapsed[gid] = !collapsed[gid];
          renderBoard();
        }
        return;
      }

      var addBtn = e.target.closest('[data-action="add-call"]');
      if (addBtn) {
        e.stopPropagation();
        var g = addBtn.closest('[data-group]');
        addCall(g ? g.getAttribute('data-group') : 'pre-arrival');
        render();
        return;
      }

      var roleBtn = e.target.closest('[data-role-action]');
      if (roleBtn) {
        applyRoleAction(roleBtn.getAttribute('data-role'), roleBtn.getAttribute('data-role-action'));
        return;
      }

      var row = e.target.closest('tr[data-call-id]');
      if (!row) return;
      var callId = row.getAttribute('data-call-id');
      if (e.target.closest('[data-action="delete"]')) {
        if (confirm('Delete this vessel call?')) {
          deleteCall(callId);
          render();
        }
        return;
      }
      if (e.target.closest('[data-action="move-group"]')) {
        cycleGroup(callId);
        return;
      }
      if (e.target.closest('[data-action="edit-people"]')) {
        showPeopleModal(callId);
      }
    });

    page.addEventListener('change', function (e) {
      var fieldEl = e.target.closest('[data-field]');
      if (!fieldEl) return;
      var row = fieldEl.closest('tr[data-call-id]');
      if (!row) return;
      var callId = row.getAttribute('data-call-id');
      var field = fieldEl.getAttribute('data-field');
      var val = fieldEl.type === 'number' ? Number(fieldEl.value) : fieldEl.value;
      var patch = {};
      patch[field] = val;
      // Auto-move groups based on milestone for smoother ops flow
      if (field === 'milestone') {
        if (val === 'moored' || val === 'hose-conn' || val === 'pumping') patch.group = 'active-cargo';
        if (val === 'stopped-gauging' || val === 'completed') patch.group = 'post-loading';
        if (val === 'eta-confirmed' || val === 'delayed') {
          var cur = getCalls().find(function (c) { return c.id === callId; });
          if (cur && cur.group === 'post-loading') patch.group = 'pre-arrival';
        }
      }
      updateCall(callId, patch);
      renderMetrics();
      // Re-render board when group may change
      if (field === 'milestone' || field === 'berth') renderBoard();
      else if (field === 'quantity' || field === 'checklistOpen') {
        /* metrics already updated */
      }
    });

    page.addEventListener('input', function (e) {
      if (e.target.id === 'pm-search') {
        filterText = e.target.value || '';
        renderBoard();
      }
    });

    var filterSel = document.getElementById('pm-filter-milestone');
    if (filterSel) {
      filterSel.addEventListener('change', function () {
        filterMilestone = filterSel.value || 'all';
        renderBoard();
      });
    }

    var addTop = document.getElementById('pm-add-call-btn');
    if (addTop) {
      addTop.addEventListener('click', function () {
        addCall('pre-arrival');
        render();
      });
    }

    var overlay = document.getElementById('pm-modal-overlay');
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay || e.target.id === 'pm-modal-cancel') hidePeopleModal();
        if (e.target.id === 'pm-modal-save') {
          var callId = e.target.getAttribute('data-call-id');
          var patch = {};
          overlay.querySelectorAll('[data-people-field]').forEach(function (sel) {
            patch[sel.getAttribute('data-people-field')] = sel.value;
          });
          updateCall(callId, patch);
          hidePeopleModal();
          renderBoard();
        }
      });
    }
  }

  function render() {
    bindEvents();
    renderMetrics();
    var page = document.getElementById('page-project-management');
    var activeView = 'board';
    if (page) {
      var activeBtn = page.querySelector('[data-pm-view].is-active');
      if (activeBtn) activeView = activeBtn.getAttribute('data-pm-view') || 'board';
    }
    if (activeView === 'board') renderBoard();
    if (activeView === 'timeline') renderTimeline();
    if (activeView === 'dashboard') renderDashboard();
    if (activeView === 'workflows') renderWorkflows();
  }

  function applyRemote(data) {
    if (!data || typeof data !== 'object') return;
    saveData(normalizeData(data));
    render();
  }

  function getState() {
    return getData();
  }

  window.ProjectManagement = {
    render: render,
    applyRemote: applyRemote,
    getState: getState
  };

  document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('page-project-management')) {
      // Ensure seed data exists without forcing render until module opens
      getData();
    }
  });
})();
