/**
 * Fleet Management — Vessel database, documents, maintenance, inventory, logbooks, crew, photos.
 * Ensures onboard maintenance, data and operations are efficient; prevents downtime and protects the vessel.
 * Data in localStorage.
 */
(function () {
  'use strict';

  var STORAGE_KEYS = {
    vessels: 'andeco_fleet_vessels',
    vesselPhotos: 'andeco_fleet_vessel_photos',
    documents: 'andeco_fleet_documents',
    maintenance: 'andeco_fleet_maintenance',
    drydock: 'andeco_fleet_drydock',
    inventory: 'andeco_fleet_inventory',
    logbooks: 'andeco_fleet_logbooks',
    crew: 'andeco_fleet_crew'
  };

  var SPEC_FIELDS = [
    { key: 'name', label: 'Vessel name', required: true },
    { key: 'imo', label: 'IMO number' },
    { key: 'flag', label: 'Flag' },
    { key: 'type', label: 'Vessel type' },
    { key: 'buildYear', label: 'Build year' },
    { key: 'grossTonnage', label: 'Gross tonnage' },
    { key: 'length', label: 'Length (m)' },
    { key: 'beam', label: 'Beam (m)' },
    { key: 'draft', label: 'Draft (m)' },
    { key: 'classification', label: 'Classification society' },
    { key: 'owner', label: 'Owner' },
    { key: 'manager', label: 'Manager' },
    { key: 'callSign', label: 'Call sign' },
    { key: 'mmsi', label: 'MMSI' },
    { key: 'notes', label: 'Notes', textarea: true }
  ];

  /* Specification sheet sections (match reference layout for PDF) */
  var SPEC_SHEET_SECTIONS = [
    { section: 'Dimensions', fields: [
      { key: 'lengthOA', label: 'LENGTH O.A.' },
      { key: 'beamOA', label: 'BEAM O.A.' },
      { key: 'draught', label: 'DRAUGHT' },
      { key: 'cargoDeckAreaFwd', label: 'CARGO DECK AREA FWD' },
      { key: 'cargoDeckAreaAft', label: 'CARGO DECK AREA AFT' },
      { key: 'cargoLoadFwd', label: 'CARGO LOAD FWD' },
      { key: 'cargoLoadAft', label: 'CARGO LOAD AFT' },
      { key: 'maxDeckLoad', label: 'MAX DECK LOAD' }
    ]},
    { section: 'Tank capacities', fields: [
      { key: 'fuelOil', label: 'FUEL OIL' },
      { key: 'freshWater', label: 'FRESH WATER' },
      { key: 'blackWater', label: 'BLACK WATER' }
    ]},
    { section: 'Deck layout', fields: [
      { key: 'crane', label: 'CRANE' },
      { key: 'mounts', label: 'MOUNTS' },
      { key: 'fuelTransfer', label: 'FUEL TRANSFER' },
      { key: 'pressureWasher', label: 'PRESSURE WASHER' },
      { key: 'fendering', label: 'FENDERING' }
    ]},
    { section: 'Welfare', fields: [
      { key: 'seats', label: 'SEATS' },
      { key: 'deckHouse', label: 'DECK HOUSE' },
      { key: 'cabins', label: 'CABINS' },
      { key: 'heating', label: 'HEATING' },
      { key: 'entertainment', label: 'ENTERTAINMENT' }
    ]},
    { section: 'Safety equipment', fields: [
      { key: 'sart', label: 'SART' },
      { key: 'epirb', label: 'EPIRB' },
      { key: 'lifeRafts', label: 'LIFE RAFTS' },
      { key: 'mob', label: 'MOB' },
      { key: 'sarFinder', label: 'SAR FINDER' },
      { key: 'handheldVhf', label: 'HANDHELD VHF' },
      { key: 'searchlight', label: 'SEARCHLIGHT' },
      { key: 'engineRoomFireSystem', label: 'ENGINE ROOM FIRE SYSTEM' }
    ]},
    { section: 'Main engines', fields: [
      { key: 'mainEngineMake', label: 'MAKE' },
      { key: 'mainEngineType', label: 'TYPE' },
      { key: 'mainEngineMaxPower', label: 'MAX POWER' }
    ]},
    { section: 'Gearboxes', fields: [
      { key: 'gearboxMake', label: 'MAKE' },
      { key: 'gearboxModel', label: 'MODEL' }
    ]},
    { section: 'Propulsion', fields: [
      { key: 'propulsionType', label: 'TYPE' }
    ]},
    { section: 'Performance', fields: [
      { key: 'maxSpeed', label: 'MAX SPEED' },
      { key: 'serviceSpeed', label: 'SERVICE SPEED' }
    ]},
    { section: 'Generator', fields: [
      { key: 'electricalSystem', label: 'ELECTRICAL SYSTEM' },
      { key: 'generatorMake', label: 'MAKE' },
      { key: 'generatorType', label: 'TYPE' },
      { key: 'generatorOutput', label: 'OUTPUT' }
    ]},
    { section: 'Electronics', fields: [
      { key: 'mainRadar', label: 'MAIN RADAR' },
      { key: 'secondRadar', label: 'SECOND RADAR' },
      { key: 'ecdis', label: 'ECDIS' },
      { key: 'navtex', label: 'NAVTEX' },
      { key: 'gps', label: 'GPS' },
      { key: 'satelliteCompass', label: 'SATELLITE COMPASS' },
      { key: 'anemometer', label: 'ANEMOMETER' },
      { key: 'echoSounder', label: 'ECHO SOUNDER' },
      { key: 'autoPilot', label: 'AUTO PILOT' },
      { key: 'ais', label: 'AIS' },
      { key: 'vhf', label: 'VHF' },
      { key: 'hailer', label: 'HAILER' },
      { key: 'cctv', label: 'CCTV' },
      { key: 'broadband', label: 'BROADBAND' }
    ]}
  ];

  function getCompanySettings() {
    try {
      if (typeof window.AccountingData !== 'undefined' && window.AccountingData.getCompanySettings) {
        var s = window.AccountingData.getCompanySettings();
        if (s && typeof s === 'object') return s;
      }
      var raw = localStorage.getItem('andeco_inv_companySettings');
      if (raw) return JSON.parse(raw) || {};
    } catch (e) {}
    return {};
  }

  function getVessels() { try { var r = localStorage.getItem(STORAGE_KEYS.vessels); return r ? JSON.parse(r) : []; } catch (e) { return []; } }
  function saveVessels(a) { try { localStorage.setItem(STORAGE_KEYS.vessels, JSON.stringify(a)); } catch (e) {} persistAllIfFile(); }
  function getVesselPhotos() { try { var r = localStorage.getItem(STORAGE_KEYS.vesselPhotos); return r ? JSON.parse(r) : []; } catch (e) { return []; } }
  function saveVesselPhotos(a) { try { localStorage.setItem(STORAGE_KEYS.vesselPhotos, JSON.stringify(a)); } catch (e) {} persistAllIfFile(); }
  function getDocuments() { try { var r = localStorage.getItem(STORAGE_KEYS.documents); return r ? JSON.parse(r) : []; } catch (e) { return []; } }
  function saveDocuments(a) { try { localStorage.setItem(STORAGE_KEYS.documents, JSON.stringify(a)); } catch (e) {} persistAllIfFile(); }
  function getMaintenance() { try { var r = localStorage.getItem(STORAGE_KEYS.maintenance); return r ? JSON.parse(r) : []; } catch (e) { return []; } }
  function saveMaintenance(a) { try { localStorage.setItem(STORAGE_KEYS.maintenance, JSON.stringify(a)); } catch (e) {} persistAllIfFile(); }
  function getDrydock() { try { var r = localStorage.getItem(STORAGE_KEYS.drydock); return r ? JSON.parse(r) : []; } catch (e) { return []; } }
  function saveDrydock(a) { try { localStorage.setItem(STORAGE_KEYS.drydock, JSON.stringify(a)); } catch (e) {} persistAllIfFile(); }
  function getInventory() { try { var r = localStorage.getItem(STORAGE_KEYS.inventory); return r ? JSON.parse(r) : []; } catch (e) { return []; } }
  function saveInventory(a) { try { localStorage.setItem(STORAGE_KEYS.inventory, JSON.stringify(a)); } catch (e) {} persistAllIfFile(); }
  function getLogbooks() { try { var r = localStorage.getItem(STORAGE_KEYS.logbooks); return r ? JSON.parse(r) : []; } catch (e) { return []; } }
  function saveLogbooks(a) { try { localStorage.setItem(STORAGE_KEYS.logbooks, JSON.stringify(a)); } catch (e) {} persistAllIfFile(); }
  function getCrew() { try { var r = localStorage.getItem(STORAGE_KEYS.crew); return r ? JSON.parse(r) : []; } catch (e) { return []; } }
  function saveCrew(a) { try { localStorage.setItem(STORAGE_KEYS.crew, JSON.stringify(a)); } catch (e) {} persistAllIfFile(); }
  function persistAllIfFile() { try { if (window.AccountingData && window.AccountingData.persistAll) window.AccountingData.persistAll(); } catch (e) {} }

  function escapeHtml(s) { if (s == null) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function id() { return 'f' + Date.now() + '-' + Math.random().toString(36).slice(2, 9); }
  function formatDateDDMMYYYY(dateString) {
    if (!dateString) return '';
    var d = new Date(dateString);
    if (isNaN(d.getTime())) return '';
    var day = ('0' + d.getDate()).slice(-2);
    var month = ('0' + (d.getMonth() + 1)).slice(-2);
    return day + '/' + month + '/' + d.getFullYear();
  }

  var selectedVesselId = null;
  var currentFleetSection = 'vessels';
  var currentMaintenanceSub = 'history';

  function setSection(sectionId) {
    currentFleetSection = sectionId || 'vessels';
    if (currentFleetSection === 'vessels') selectedVesselId = null;
  }

  function render() {
    var dashboardWrap = document.getElementById('fleet-dashboard-wrap');
    var listWrap = document.getElementById('fleet-vessel-list-wrap');
    var detailWrap = document.getElementById('fleet-vessel-detail-wrap');
    var backBtn = document.getElementById('fleet-back-to-list-btn');
    var titleEl = document.getElementById('fleet-title');

    if (dashboardWrap) dashboardWrap.style.display = currentFleetSection === 'dashboard' ? 'block' : 'none';
    if (listWrap) listWrap.style.display = (currentFleetSection === 'vessels' && !selectedVesselId) ? 'block' : 'none';
    if (detailWrap) detailWrap.style.display = (currentFleetSection === 'vessels' && selectedVesselId) ? 'block' : 'none';
    if (backBtn) backBtn.style.display = selectedVesselId ? '' : 'none';
    if (titleEl) titleEl.textContent = selectedVesselId ? ('Fleet / ' + (getVessels().filter(function (x) { return x.id === selectedVesselId; })[0] || {}).name) : 'Fleet Management';

    if (currentFleetSection === 'dashboard') renderDashboard();
    else if (currentFleetSection === 'vessels' && !selectedVesselId) renderVesselList();
    else if (selectedVesselId) renderVesselDetail();
  }

  function renderDashboard() {
    var vessels = getVessels();
    var docs = getDocuments();
    var inv = getInventory();
    var now = new Date();
    var expiring = 0, expired = 0;
    docs.forEach(function (d) {
      if (!d.expiryDate) return;
      var days = Math.ceil((new Date(d.expiryDate) - now) / (24 * 60 * 60 * 1000));
      if (days < 0) expired++; else if (days <= 30) expiring++;
    });
    var lowStock = inv.filter(function (i) { var q = parseInt(i.quantity, 10) || 0; var min = parseInt(i.minLevel, 10) || 0; return min > 0 && q <= min; }).length;

    var metricsEl = document.getElementById('fleet-dashboard-metrics');
    if (metricsEl) {
      metricsEl.innerHTML = '<div class="metric-card metric--blue"><span class="metric-value">' + vessels.length + '</span><span class="metric-label">Vessels</span></div>' +
        '<div class="metric-card metric--orange"><span class="metric-value">' + (expired + expiring) + '</span><span class="metric-label">Docs expiring / expired (30d)</span></div>' +
        '<div class="metric-card metric--green"><span class="metric-value">' + lowStock + '</span><span class="metric-label">Low stock items</span></div>';
    }
    var alertsEl = document.getElementById('fleet-dashboard-alerts');
    if (alertsEl) {
      var items = [];
      docs.forEach(function (d) {
        if (!d.expiryDate) return;
        var days = Math.ceil((new Date(d.expiryDate) - now) / (24 * 60 * 60 * 1000));
        if (days <= 60) {
          var v = vessels.filter(function (x) { return x.id === d.vesselId; })[0];
          items.push({ vessel: v ? v.name : '—', doc: d.name, days: days });
        }
      });
      items.sort(function (a, b) { return a.days - b.days; });
      alertsEl.innerHTML = items.length ? '<h3 class="panel-title">Upcoming expiries</h3><ul class="fleet-alert-list">' + items.slice(0, 15).map(function (x) {
        var cls = x.days < 0 ? 'fleet-alert--expired' : (x.days <= 30 ? 'fleet-alert--warn' : '');
        return '<li class="' + cls + '">' + escapeHtml(x.vessel) + ' — ' + escapeHtml(x.doc) + (x.days < 0 ? ' (expired)' : ' in ' + x.days + ' days') + '</li>';
      }).join('') + '</ul>' : '<p class="fleet-empty">No upcoming document expiries.</p>';
    }
  }

  function renderVesselList() {
    var vessels = getVessels();
    var tbody = document.getElementById('fleet-vessels-tbody');
    var emptyMsg = document.getElementById('fleet-empty-msg');
    var metricsEl = document.getElementById('fleet-metrics');
    if (!tbody) return;
    if (vessels.length === 0) {
      tbody.innerHTML = '';
      if (emptyMsg) emptyMsg.style.display = 'block';
      if (metricsEl) metricsEl.innerHTML = '';
      return;
    }
    if (emptyMsg) emptyMsg.style.display = 'none';
    var docs = getDocuments();
    var in30 = docs.filter(function (d) {
      if (!d.expiryDate) return false;
      var days = Math.ceil((new Date(d.expiryDate) - new Date()) / (24 * 60 * 60 * 1000));
      return days >= 0 && days <= 30;
    }).length;
    if (metricsEl) metricsEl.innerHTML = '<span class="fleet-metric">' + vessels.length + ' vessel(s)</span>' + (in30 > 0 ? '<span class="fleet-metric fleet-metric--warn">' + in30 + ' doc(s) expire in 30 days</span>' : '');

    tbody.innerHTML = vessels.map(function (v) {
      var thumb = v.photo ? '<img src="' + escapeHtml(v.photo) + '" alt="" class="fleet-thumb">' : '<span class="fleet-thumb-placeholder">—</span>';
      return '<tr data-vessel-id="' + escapeHtml(v.id) + '">' +
        '<td class="fleet-thumb-cell">' + thumb + '</td>' +
        '<td><a href="#" class="fleet-vessel-link">' + escapeHtml(v.name || '—') + '</a></td>' +
        '<td>' + escapeHtml(v.imo || '—') + '</td><td>' + escapeHtml(v.flag || '—') + '</td>' +
        '<td>' + escapeHtml(v.type || '—') + '</td><td>' + escapeHtml(v.buildYear || '—') + '</td>' +
        '<td><button type="button" class="btn btn-ghost btn-sm fleet-edit-vessel" data-vessel-id="' + escapeHtml(v.id) + '">Open</button></td></tr>';
    }).join('');

    tbody.querySelectorAll('.fleet-vessel-link, .fleet-edit-vessel').forEach(function (el) {
      el.addEventListener('click', function (e) { e.preventDefault(); selectedVesselId = el.closest('tr').getAttribute('data-vessel-id'); render(); });
    });
  }

  function showFleetTab(tabId) {
    document.querySelectorAll('#page-fleet .fleet-vessel-panel').forEach(function (p) {
      p.style.display = p.getAttribute('data-fleet-tab') === tabId ? 'block' : 'none';
    });
    document.querySelectorAll('#page-fleet .fleet-vessel-tabs .module-tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-fleet-tab') === tabId);
    });
  }

  function showMaintenanceSub(subId) {
    currentMaintenanceSub = subId || 'history';
    document.querySelectorAll('#page-fleet [data-fleet-sub-panel]').forEach(function (p) {
      p.style.display = p.getAttribute('data-fleet-sub-panel') === currentMaintenanceSub ? 'block' : 'none';
    });
    document.querySelectorAll('#page-fleet .fleet-sub-tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-fleet-sub') === currentMaintenanceSub);
    });
  }

  function renderVesselDetail() {
    var v = getVessels().filter(function (x) { return x.id === selectedVesselId; })[0];
    if (!v) { selectedVesselId = null; return render(); }

    var img = document.getElementById('fleet-vessel-photo-img');
    var placeholder = document.getElementById('fleet-photo-placeholder');
    if (img && placeholder) {
      if (v.photo) { img.src = v.photo; img.style.display = ''; placeholder.style.display = 'none'; }
      else { img.src = ''; img.style.display = 'none'; placeholder.style.display = ''; }
    }

    var formEl = document.getElementById('fleet-specs-form');
    if (formEl) {
      formEl.innerHTML = SPEC_FIELDS.map(function (f) {
        var val = v[f.key] || '';
        if (f.textarea) return '<div class="form-group full-width"><label>' + escapeHtml(f.label) + '</label><textarea id="fleet-spec-' + f.key + '" rows="2">' + escapeHtml(val) + '</textarea></div>';
        return '<div class="form-group"><label>' + escapeHtml(f.label) + '</label><input type="text" id="fleet-spec-' + f.key + '" value="' + escapeHtml(val) + '"' + (f.required ? ' required' : '') + '></div>';
      }).join('');
    }

    var gallery = document.getElementById('fleet-photo-gallery');
    if (gallery) {
      var photos = getVesselPhotos().filter(function (p) { return p.vesselId === selectedVesselId; });
      gallery.innerHTML = photos.length ? photos.map(function (p) {
        return '<div class="fleet-gallery-item" data-id="' + escapeHtml(p.id) + '"><img src="' + escapeHtml(p.dataUrl || '') + '" alt=""><button type="button" class="btn btn-ghost btn-sm fleet-del-photo" data-id="' + escapeHtml(p.id) + '">Remove</button></div>';
      }).join('') : '';
      gallery.querySelectorAll('.fleet-del-photo').forEach(function (btn) {
        btn.addEventListener('click', function () {
          saveVesselPhotos(getVesselPhotos().filter(function (x) { return x.id !== btn.getAttribute('data-id'); }));
          renderVesselDetail();
        });
      });
    }

    renderSpecsheetForm();
    renderDocumentsPanel();
    renderMaintenanceTable();
    renderDrydockTable();
    renderInventoryPanel();
    renderLogbooksPanel();
    renderCrewPanel();
    showFleetTab('profile');
    showMaintenanceSub('history');
  }

  function renderSpecsheetForm() {
    var v = getVessels().filter(function (x) { return x.id === selectedVesselId; })[0];
    if (!v) return;
    var formEl = document.getElementById('fleet-specsheet-form');
    if (!formEl) return;
    var html = '';
    SPEC_SHEET_SECTIONS.forEach(function (sec) {
      html += '<div class="fleet-specsheet-section"><h4 class="fleet-specsheet-section-title">' + escapeHtml(sec.section) + '</h4>';
      sec.fields.forEach(function (f) {
        var val = v[f.key] || '';
        html += '<div class="form-group"><label>' + escapeHtml(f.label) + '</label><input type="text" id="fleet-specsheet-' + escapeHtml(f.key) + '" value="' + escapeHtml(val) + '"></div>';
      });
      html += '</div>';
    });
    formEl.innerHTML = html;
  }

  function saveVesselSpecsheet() {
    var all = getVessels();
    var v = all.filter(function (x) { return x.id === selectedVesselId; })[0];
    if (!v) return;
    SPEC_SHEET_SECTIONS.forEach(function (sec) {
      sec.fields.forEach(function (f) {
        var el = document.getElementById('fleet-specsheet-' + f.key);
        if (el) v[f.key] = el.value.trim();
      });
    });
    saveVessels(all.map(function (x) { return x.id === v.id ? v : x; }));
    renderSpecsheetForm();
  }

  function getImageFormatFromDataUrl(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return null;
    var m = dataUrl.match(/data:image\/(\w+);/);
    if (!m) return null;
    var fmt = (m[1] || '').toLowerCase();
    if (fmt === 'jpeg' || fmt === 'jpg') return 'JPEG';
    if (fmt === 'png') return 'PNG';
    return null;
  }

  /* Resize and compress image for PDF to reduce file size. Returns Promise<{ dataUrl, drawWmm, drawHmm }>. */
  function compressImageForPdf(dataUrl, maxWmm, maxHmm, jpegQuality) {
    return new Promise(function (resolve) {
      if (!dataUrl || typeof dataUrl !== 'string') {
        resolve({ dataUrl: null, drawWmm: 0, drawHmm: 0 });
        return;
      }
      var img = new Image();
      img.onerror = function () { resolve({ dataUrl: null, drawWmm: 0, drawHmm: 0 }); };
      img.onload = function () {
        var w = img.naturalWidth;
        var h = img.naturalHeight;
        if (!w || !h) {
          resolve({ dataUrl: null, drawWmm: 0, drawHmm: 0 });
          return;
        }
        var r = w / h;
        var drawWmm = maxWmm;
        var drawHmm = maxWmm / r;
        if (drawHmm > maxHmm) {
          drawHmm = maxHmm;
          drawWmm = maxHmm * r;
        }
        var scale = 2;
        var cw = Math.round((drawWmm / 25.4) * 96 * scale);
        var ch = Math.round((drawHmm / 25.4) * 96 * scale);
        cw = Math.min(cw, 400);
        ch = Math.min(ch, 400);
        if (cw < 1 || ch < 1) {
          resolve({ dataUrl: null, drawWmm: 0, drawHmm: 0 });
          return;
        }
        try {
          var canvas = document.createElement('canvas');
          canvas.width = cw;
          canvas.height = ch;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, cw, ch);
          ctx.drawImage(img, 0, 0, cw, ch);
          var compressed = canvas.toDataURL('image/jpeg', typeof jpegQuality === 'number' ? jpegQuality : 0.78);
          resolve({ dataUrl: compressed, drawWmm: drawWmm, drawHmm: drawHmm });
        } catch (e) {
          resolve({ dataUrl: null, drawWmm: 0, drawHmm: 0 });
        }
      };
      img.src = dataUrl;
    });
  }

  function downloadSpecPdf() {
    var v = getVessels().filter(function (x) { return x.id === selectedVesselId; })[0];
    if (!v) return;
    saveVesselSpecsheet();
    var company = getCompanySettings();
    var vesselName = (v.name || 'Vessel').toString();
    var typeDesc = (v.type || '').toString();
    var companyName = (company.companyName || 'Company').toString().toUpperCase();
    var companyLogo = (company.logo || '').toString();
    var vesselPhoto = (v.photo || '').toString();
    var contactE = (company.companyEmail || '').toString();
    var contactT = (company.companyPhone || '').toString();
    var contactP = (company.companyAddress || '').toString();
    var contactW = (company.companyWebsite || '').toString();
    var contactM = (company.companyMobile || company.companyPhone || '').toString();

    var JsPDF = (typeof window.jspdf !== 'undefined' && window.jspdf.jsPDF) ? window.jspdf.jsPDF : window.jsPDF;
    if (typeof JsPDF === 'undefined') {
      alert('PDF library not loaded. Please refresh the page.');
      return;
    }

    var doc = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    var pageW = doc.internal.pageSize.getWidth();
    var margin = 15;
    var colW = (pageW - margin * 2 - 5) / 2;
    var leftX = margin;
    var leftColEnd = leftX + colW;
    var rightX = margin + colW + 5;
    var rightColEnd = pageW - margin;
    var y = margin;
    var lineH = 4;
    var sectionGap = 3;
    var headerH = 20;
    var logoMaxW = 20;
    var logoMaxH = 12;
    var logoFormat = companyLogo ? getImageFormatFromDataUrl(companyLogo) : null;

    function buildPdfWithLogo(logoDrawW, logoDrawH, logoDataUrl, logoFormat, compressedVesselUrl) {
      var textStartX = leftX + (logoDrawW > 0 ? logoDrawW + 4 : 0);

      /* ----- HEADER (separate block): logo as original PNG (no conversion) ----- */
      if (logoDataUrl && logoFormat && logoDrawW > 0 && logoDrawH > 0) {
        try {
          doc.addImage(logoDataUrl, logoFormat, leftX, y + 2, logoDrawW, logoDrawH);
        } catch (e) {}
      }
      doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40, 40, 40);
    doc.text(companyName, textStartX, y + 10);
    doc.setFontSize(16);
    doc.setTextColor(30, 60, 90);
    doc.text('Specification Sheet', pageW - margin, y + 10, { align: 'right' });
    y += headerH;
    doc.setDrawColor(30, 60, 90);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageW - margin, y);
    y += 6;

    /* ----- VESSEL: photo left, name & type right of photo ----- */
    var photoW = 42;
    var photoH = 28;
    var vesselBlockX = leftX;
    if (compressedVesselUrl) {
      try {
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.2);
        doc.rect(vesselBlockX, y, photoW, photoH);
        doc.addImage(compressedVesselUrl, 'JPEG', vesselBlockX + 1, y + 1, photoW - 2, photoH - 2);
      } catch (e) {}
    }
    var nameX = vesselBlockX + photoW + 5;
    var nameW = pageW - margin - nameX;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text(vesselName, nameX, y + 10);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(typeDesc || '—', nameX, y + 16, { maxWidth: nameW });
    y += Math.max(photoH, 22) + 6;

    /* ----- SPECIFICATIONS section ----- */
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageW - margin, y);
    y += 5;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 60, 90);
    doc.text('TECHNICAL SPECIFICATIONS', leftX, y);
    y += 6;
    doc.setTextColor(0, 0, 0);

    function drawSection(doc, x, colEnd, startY, section, vessel) {
      var yy = startY;
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(50, 50, 50);
      doc.text(section.section.toUpperCase(), x, yy);
      yy += lineH;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      section.fields.forEach(function (f) {
        var val = (vessel[f.key] || '').toString().trim() || '—';
        if (val.length > 38) val = val.substring(0, 35) + '…';
        doc.text(f.label + ':', x, yy);
        doc.text(val, colEnd, yy, { align: 'right' });
        yy += lineH - 0.5;
      });
      return yy + sectionGap;
    }

    var leftSections = SPEC_SHEET_SECTIONS.slice(0, 6);
    var rightSections = SPEC_SHEET_SECTIONS.slice(6, 11);
    var yLeft = y;
    var yRight = y;
    leftSections.forEach(function (sec) {
      yLeft = drawSection(doc, leftX, leftColEnd, yLeft, sec, v);
    });
    rightSections.forEach(function (sec) {
      yRight = drawSection(doc, rightX, rightColEnd, yRight, sec, v);
    });

    var footerY = 277;
    doc.setDrawColor(30, 60, 90);
    doc.setLineWidth(0.3);
    doc.line(margin, footerY - 6, pageW - margin, footerY - 6);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40, 40, 40);
    doc.text('Contact us', leftX, footerY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    var contactParts = [];
    if (contactE) contactParts.push('E: ' + contactE);
    if (contactT) contactParts.push('T: ' + contactT);
    if (contactM) contactParts.push('M: ' + contactM);
    if (contactP) contactParts.push('P: ' + contactP);
    if (contactW) contactParts.push('W: ' + contactW);
    doc.text(contactParts.join('  |  ') || '—', leftX, footerY + 5, { maxWidth: pageW - margin * 2 });

      try {
        doc.save('Specification-Sheet-' + vesselName.replace(/[^a-zA-Z0-9]/g, '-') + '.pdf');
      } catch (err) {
        console.error('PDF save error', err);
        alert('Could not save PDF.');
      }
    }

    var logoPromise = (companyLogo && logoFormat)
      ? new Promise(function (resolve) {
          var img = new Image();
          img.onload = function () {
            var r = img.naturalWidth / img.naturalHeight;
            var logoDrawW = r >= logoMaxW / logoMaxH ? logoMaxW : logoMaxH * r;
            var logoDrawH = r >= logoMaxW / logoMaxH ? logoMaxW / r : logoMaxH;
            resolve({ drawWmm: logoDrawW, drawHmm: logoDrawH });
          };
          img.onerror = function () { resolve({ drawWmm: 0, drawHmm: 0 }); };
          img.src = companyLogo;
        })
      : Promise.resolve({ drawWmm: 0, drawHmm: 0 });
    var vesselPromise = (vesselPhoto && getImageFormatFromDataUrl(vesselPhoto))
      ? compressImageForPdf(vesselPhoto, 42, 28, 0.78)
      : Promise.resolve({ dataUrl: null });

    Promise.all([logoPromise, vesselPromise]).then(function (results) {
      var logo = results[0];
      var vessel = results[1];
      buildPdfWithLogo(logo.drawWmm, logo.drawHmm, companyLogo, logoFormat, vessel.dataUrl || null);
    });
  }

  function saveVesselSpecs() {
    var all = getVessels();
    var v = all.filter(function (x) { return x.id === selectedVesselId; })[0];
    if (!v) return;
    SPEC_FIELDS.forEach(function (f) {
      var el = document.getElementById('fleet-spec-' + f.key);
      if (el) v[f.key] = el.value.trim();
    });
    saveVessels(all.map(function (x) { return x.id === v.id ? v : x; }));
    renderVesselDetail();
  }

  function daysToExpiry(expiryDate) {
    if (!expiryDate) return null;
    return Math.ceil((new Date(expiryDate) - new Date()) / (24 * 60 * 60 * 1000));
  }

  function renderDocumentsPanel() {
    var alertsEl = document.getElementById('fleet-expiry-alerts');
    var tbody = document.getElementById('fleet-documents-tbody');
    if (!tbody) return;
    var list = getDocuments().filter(function (d) { return d.vesselId === selectedVesselId; });
    var expiring = [];
    list.forEach(function (d) { var days = daysToExpiry(d.expiryDate); if (days !== null && days <= 90) expiring.push({ doc: d, days: days }); });
    expiring.sort(function (a, b) { return a.days - b.days; });
    if (alertsEl) {
      if (expiring.length === 0) { alertsEl.innerHTML = ''; alertsEl.style.display = 'none'; }
      else {
        alertsEl.style.display = 'block';
        alertsEl.innerHTML = '<h4 class="panel-title">Expiry reminders</h4>' + expiring.slice(0, 10).map(function (x) {
          var cls = x.days < 0 ? 'fleet-alert--expired' : (x.days <= 30 ? 'fleet-alert--warn' : 'fleet-alert--info');
          var msg = x.days < 0 ? 'Expired' : 'Expires in ' + x.days + ' days';
          return '<div class="fleet-expiry-item ' + cls + '">' + escapeHtml(x.doc.name) + ' — ' + msg + '</div>';
        }).join('');
      }
    }
    tbody.innerHTML = list.length ? list.map(function (d) {
      var days = daysToExpiry(d.expiryDate);
      var status = '—';
      if (days !== null) { if (days < 0) status = '<span class="fleet-doc-expired">Expired</span>'; else if (days <= 30) status = '<span class="fleet-doc-warn">' + days + ' days</span>'; else if (days <= 90) status = '<span class="fleet-doc-info">' + days + ' days</span>'; else status = 'OK'; }
      return '<tr data-id="' + escapeHtml(d.id) + '"><td>' + escapeHtml(d.name || '—') + '</td><td>' + escapeHtml(d.type || '—') + '</td><td>' + escapeHtml(formatDateDDMMYYYY(d.issueDate) || '—') + '</td><td>' + escapeHtml(formatDateDDMMYYYY(d.expiryDate) || '—') + '</td><td>' + status + '</td><td><button type="button" class="btn btn-ghost btn-sm fleet-edit-doc" data-id="' + escapeHtml(d.id) + '" title="Edit / update dates (e.g. re-issue)">Edit</button> <button type="button" class="btn btn-ghost btn-sm fleet-del-doc" data-id="' + escapeHtml(d.id) + '">Delete</button></td></tr>';
    }).join('') : '<tr><td colspan="6">No documents or certificates.</td></tr>';
    tbody.querySelectorAll('.fleet-edit-doc').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var docId = btn.getAttribute('data-id');
        var doc = getDocuments().filter(function (x) { return x.id === docId; })[0];
        if (!doc) return;
        function toYyyyMmDd(val) {
          if (!val) return '';
          if (val.length === 10 && val.indexOf('-') === 4) return val;
          var d = new Date(val);
          if (isNaN(d.getTime())) return '';
          return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
        }
        openModal('Edit document / update dates (re-issue)', [
          { key: 'name', label: 'Name', value: doc.name || '', required: true },
          { key: 'type', label: 'Type', value: doc.type || '' },
          { key: 'issueDate', label: 'Issue date', type: 'date', value: toYyyyMmDd(doc.issueDate) },
          { key: 'expiryDate', label: 'Expiry date', type: 'date', value: toYyyyMmDd(doc.expiryDate) }
        ], function (payload) {
          var docs = getDocuments().map(function (x) {
            if (x.id !== docId) return x;
            return { id: x.id, vesselId: x.vesselId, name: payload.name, type: payload.type, issueDate: payload.issueDate, expiryDate: payload.expiryDate };
          });
          saveDocuments(docs);
          renderDocumentsPanel();
        });
      });
    });
    tbody.querySelectorAll('.fleet-del-doc').forEach(function (btn) {
      btn.addEventListener('click', function () { saveDocuments(getDocuments().filter(function (x) { return x.id !== btn.getAttribute('data-id'); })); renderDocumentsPanel(); });
    });
  }

  function renderMaintenanceTable() {
    var tbody = document.getElementById('fleet-maintenance-tbody');
    if (!tbody) return;
    var list = getMaintenance().filter(function (m) { return m.vesselId === selectedVesselId; }).sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    tbody.innerHTML = list.length ? list.map(function (m) {
      return '<tr data-id="' + escapeHtml(m.id) + '"><td>' + escapeHtml(formatDateDDMMYYYY(m.date) || '—') + '</td><td>' + escapeHtml(m.type || '—') + '</td><td>' + escapeHtml(m.status || '—') + '</td><td>' + escapeHtml(m.description || '—') + '</td><td><button type="button" class="btn btn-ghost btn-sm fleet-del-maintenance" data-id="' + escapeHtml(m.id) + '">Delete</button></td></tr>';
    }).join('') : '<tr><td colspan="5">No maintenance records.</td></tr>';
    tbody.querySelectorAll('.fleet-del-maintenance').forEach(function (btn) {
      btn.addEventListener('click', function () { saveMaintenance(getMaintenance().filter(function (x) { return x.id !== btn.getAttribute('data-id'); })); renderMaintenanceTable(); });
    });
  }

  function renderDrydockTable() {
    var tbody = document.getElementById('fleet-drydock-tbody');
    if (!tbody) return;
    var list = getDrydock().filter(function (d) { return d.vesselId === selectedVesselId; }).sort(function (a, b) { return (b.scheduledDate || '').localeCompare(a.scheduledDate || ''); });
    tbody.innerHTML = list.length ? list.map(function (d) {
      return '<tr data-id="' + escapeHtml(d.id) + '"><td>' + escapeHtml(formatDateDDMMYYYY(d.scheduledDate) || '—') + '</td><td>' + escapeHtml(formatDateDDMMYYYY(d.completedDate) || '—') + '</td><td>' + escapeHtml(d.yard || '—') + '</td><td>' + escapeHtml(d.status || '—') + '</td><td><button type="button" class="btn btn-ghost btn-sm fleet-del-drydock" data-id="' + escapeHtml(d.id) + '">Delete</button></td></tr>';
    }).join('') : '<tr><td colspan="5">No dry dock records.</td></tr>';
    tbody.querySelectorAll('.fleet-del-drydock').forEach(function (btn) {
      btn.addEventListener('click', function () { saveDrydock(getDrydock().filter(function (x) { return x.id !== btn.getAttribute('data-id'); })); renderDrydockTable(); });
    });
  }

  function renderInventoryPanel() {
    var alertsEl = document.getElementById('fleet-low-stock-alerts');
    var tbody = document.getElementById('fleet-inventory-tbody');
    if (!tbody) return;
    var list = getInventory().filter(function (i) { return i.vesselId === selectedVesselId; });
    var lowStock = list.filter(function (i) { var q = parseInt(i.quantity, 10) || 0; var min = parseInt(i.minLevel, 10) || 0; return min > 0 && q <= min; });
    if (alertsEl) {
      if (lowStock.length === 0) { alertsEl.innerHTML = ''; alertsEl.style.display = 'none'; }
      else { alertsEl.style.display = 'block'; alertsEl.innerHTML = '<h4 class="panel-title">Low stock</h4>' + lowStock.map(function (i) { return '<div class="fleet-expiry-item fleet-alert--warn">' + escapeHtml(i.itemName || i.partNumber || 'Item') + ' — ' + (i.quantity || 0) + ' (min: ' + (i.minLevel || '—') + ')</div>'; }).join(''); }
    }
    tbody.innerHTML = list.length ? list.map(function (i) {
      var q = parseInt(i.quantity, 10) || 0, min = parseInt(i.minLevel, 10) || 0, max = parseInt(i.maxLevel, 10) || '—';
      var low = min > 0 && q <= min ? ' fleet-row-low' : '';
      return '<tr data-id="' + escapeHtml(i.id) + '" class="' + low + '"><td>' + escapeHtml(i.itemName || '—') + '</td><td>' + escapeHtml(i.partNumber || '—') + '</td><td>' + q + ' ' + escapeHtml(i.unit || '') + '</td><td>' + min + ' / ' + (typeof max === 'number' ? max : escapeHtml(i.maxLevel || '—')) + '</td><td>' + escapeHtml(i.location || '—') + '</td><td><button type="button" class="btn btn-ghost btn-sm fleet-del-inventory" data-id="' + escapeHtml(i.id) + '">Delete</button></td></tr>';
    }).join('') : '<tr><td colspan="6">No inventory items.</td></tr>';
    tbody.querySelectorAll('.fleet-del-inventory').forEach(function (btn) {
      btn.addEventListener('click', function () { saveInventory(getInventory().filter(function (x) { return x.id !== btn.getAttribute('data-id'); })); renderInventoryPanel(); });
    });
  }

  function renderLogbooksPanel() {
    var tbody = document.getElementById('fleet-logbooks-tbody');
    var filterEl = document.getElementById('fleet-logbook-type-filter');
    if (!tbody) return;
    var typeFilter = filterEl ? filterEl.value : '';
    var list = getLogbooks().filter(function (l) { return l.vesselId === selectedVesselId && (!typeFilter || l.logType === typeFilter); }).sort(function (a, b) { return (b.logDate || '').localeCompare(a.logDate || ''); });
    tbody.innerHTML = list.length ? list.map(function (l) {
      return '<tr data-id="' + escapeHtml(l.id) + '"><td>' + escapeHtml(formatDateDDMMYYYY(l.logDate) || '—') + '</td><td>' + escapeHtml(l.logType || '—') + '</td><td>' + escapeHtml((l.entry || '').slice(0, 80)) + (l.entry && l.entry.length > 80 ? '…' : '') + '</td><td>' + escapeHtml(l.author || '—') + '</td><td><button type="button" class="btn btn-ghost btn-sm fleet-del-logbook" data-id="' + escapeHtml(l.id) + '">Delete</button></td></tr>';
    }).join('') : '<tr><td colspan="5">No log entries.</td></tr>';
    tbody.querySelectorAll('.fleet-del-logbook').forEach(function (btn) {
      btn.addEventListener('click', function () { saveLogbooks(getLogbooks().filter(function (x) { return x.id !== btn.getAttribute('data-id'); })); renderLogbooksPanel(); });
    });
  }

  function renderCrewPanel() {
    var tbody = document.getElementById('fleet-crew-tbody');
    if (!tbody) return;
    var legacyCrew = getCrew().filter(function (c) { return c.vesselId === selectedVesselId; });
    var cm = typeof window.CrewManagement !== 'undefined' ? window.CrewManagement : null;
    var rows = [];
    if (cm) {
      var assignments = cm.getCrewAssignments().filter(function (a) { return a.vesselId === selectedVesselId; });
      var members = cm.getCrewMembers();
      var docs = cm.getCrewDocuments();
      assignments.forEach(function (a) {
        var member = members.filter(function (m) { return m.id === a.crewMemberId; })[0];
        var crewDocs = docs.filter(function (d) { return d.crewId === a.crewMemberId; });
        var certs = crewDocs.length ? crewDocs.map(function (d) { return d.name || d.type; }).filter(Boolean).slice(0, 3).join(', ') : '—';
        if (crewDocs.length > 3) certs += ' …';
        var name = member ? (member.name || '—') : '—';
        var role = (a.roleOnVessel && a.roleOnVessel.trim()) ? a.roleOnVessel : (member ? member.role : '—');
        rows.push('<tr data-id="' + escapeHtml(a.id) + '" data-type="assignment"><td>' + escapeHtml(name) + '</td><td>' + escapeHtml(role) + '</td><td>' + escapeHtml(certs) + '</td><td>' + escapeHtml(formatDateDDMMYYYY(a.joiningDate) || '—') + '</td><td><button type="button" class="btn btn-ghost btn-sm fleet-unassign-crew" data-id="' + escapeHtml(a.id) + '">Unassign</button></td></tr>');
      });
    }
    legacyCrew.forEach(function (c) {
      rows.push('<tr data-id="' + escapeHtml(c.id) + '" data-type="legacy"><td>' + escapeHtml(c.name || '—') + '</td><td>' + escapeHtml(c.role || '—') + '</td><td>' + escapeHtml(c.certifications || '—') + '</td><td>' + escapeHtml(formatDateDDMMYYYY(c.joiningDate) || '—') + '</td><td><button type="button" class="btn btn-ghost btn-sm fleet-del-crew" data-id="' + escapeHtml(c.id) + '">Delete</button></td></tr>');
    });
    tbody.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="5">No crew on this vessel. Add crew in Crew Management and assign here, or add legacy crew below.</td></tr>';
    tbody.querySelectorAll('.fleet-unassign-crew').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!cm) return;
        var assignId = btn.getAttribute('data-id');
        cm.saveCrewAssignments(cm.getCrewAssignments().filter(function (x) { return x.id !== assignId; }));
        renderCrewPanel();
      });
    });
    tbody.querySelectorAll('.fleet-del-crew').forEach(function (btn) {
      btn.addEventListener('click', function () {
        saveCrew(getCrew().filter(function (x) { return x.id !== btn.getAttribute('data-id'); }));
        renderCrewPanel();
      });
    });
  }

  function openModal(title, fields, onSave) {
    var overlay = document.getElementById('fleet-modal-overlay');
    var body = document.getElementById('fleet-modal-body');
    var cancelBtn = document.getElementById('fleet-modal-cancel');
    var saveBtn = document.getElementById('fleet-modal-save');
    if (!overlay || !body) return;
    body.innerHTML = '<h3 class="fleet-modal-title">' + escapeHtml(title) + '</h3>' + fields.map(function (f) {
      var val = f.value != null ? f.value : '';
      if (f.textarea) return '<div class="form-group full-width"><label>' + escapeHtml(f.label) + '</label><textarea class="fleet-modal-field" data-key="' + escapeHtml(f.key) + '" rows="2">' + escapeHtml(val) + '</textarea></div>';
      return '<div class="form-group"><label>' + escapeHtml(f.label) + '</label><input type="' + (f.type || 'text') + '" class="fleet-modal-field" data-key="' + escapeHtml(f.key) + '" value="' + escapeHtml(val) + '"' + (f.required ? ' required' : '') + '></div>';
    }).join('');
    overlay.style.display = 'flex';
    cancelBtn.onclick = function () { overlay.style.display = 'none'; };
    saveBtn.onclick = function () {
      var payload = {};
      body.querySelectorAll('.fleet-modal-field').forEach(function (el) { payload[el.dataset.key] = el.value.trim(); });
      overlay.style.display = 'none';
      if (typeof onSave === 'function') onSave(payload);
    };
  }

  function initFleet() {
    var backBtn = document.getElementById('fleet-back-to-list-btn');
    if (backBtn) backBtn.addEventListener('click', function () { selectedVesselId = null; render(); });

    var photoInput = document.getElementById('fleet-vessel-photo-input');
    var photoBtn = document.getElementById('fleet-vessel-photo-btn');
    if (photoBtn && photoInput) {
      photoBtn.addEventListener('click', function () { photoInput.click(); });
      photoInput.addEventListener('change', function () {
        var file = photoInput.files && photoInput.files[0];
        if (!file || !selectedVesselId) return;
        var r = new FileReader();
        r.onload = function () {
          var all = getVessels();
          var vessels = all.map(function (x) {
            if (x.id === selectedVesselId) { x.photo = r.result; return x; }
            return x;
          });
          saveVessels(vessels);
          renderVesselDetail();
        };
        r.readAsDataURL(file);
        photoInput.value = '';
      });
    }

    var addGalleryPhoto = document.getElementById('fleet-add-gallery-photo');
    if (addGalleryPhoto) {
      addGalleryPhoto.addEventListener('click', function () {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = function () {
          var file = input.files && input.files[0];
          if (!file || !selectedVesselId) return;
          var reader = new FileReader();
          reader.onload = function () {
            var list = getVesselPhotos();
            list.push({ id: id(), vesselId: selectedVesselId, dataUrl: reader.result, caption: '', date: new Date().toISOString().slice(0, 10) });
            saveVesselPhotos(list);
            renderVesselDetail();
          };
          reader.readAsDataURL(file);
        };
        input.click();
      });
    }

    document.querySelectorAll('#page-fleet .fleet-vessel-tabs .module-tab[data-fleet-tab]').forEach(function (tab) {
      tab.addEventListener('click', function (e) { e.preventDefault(); showFleetTab(tab.getAttribute('data-fleet-tab')); });
    });
    document.querySelectorAll('#page-fleet .fleet-sub-tab[data-fleet-sub]').forEach(function (tab) {
      tab.addEventListener('click', function (e) { e.preventDefault(); showMaintenanceSub(tab.getAttribute('data-fleet-sub')); });
    });

    var specsForm = document.getElementById('fleet-specs-form');
    if (specsForm) { specsForm.addEventListener('change', function () { saveVesselSpecs(); }); specsForm.addEventListener('blur', function (e) { if (e.target.matches('input, textarea')) saveVesselSpecs(); }); }
    var saveSpecsBtn = document.getElementById('fleet-save-specs');
    if (saveSpecsBtn) saveSpecsBtn.addEventListener('click', function () { saveVesselSpecs(); });

    var saveSpecsheetBtn = document.getElementById('fleet-save-specsheet');
    if (saveSpecsheetBtn) saveSpecsheetBtn.addEventListener('click', function () { saveVesselSpecsheet(); });
    var downloadSpecPdfBtn = document.getElementById('fleet-download-spec-pdf');
    if (downloadSpecPdfBtn) downloadSpecPdfBtn.addEventListener('click', function () { downloadSpecPdf(); });

    document.getElementById('fleet-add-vessel') && document.getElementById('fleet-add-vessel').addEventListener('click', function () {
      openModal('Add vessel', SPEC_FIELDS.map(function (f) { return { key: f.key, label: f.label, required: !!f.required, textarea: !!f.textarea }; }), function (payload) {
        var newV = { id: id(), name: payload.name || 'Unnamed' };
        SPEC_FIELDS.forEach(function (f) { if (payload[f.key]) newV[f.key] = payload[f.key]; });
        saveVessels(getVessels().concat(newV));
        renderVesselList();
      });
    });

    document.getElementById('fleet-add-document') && document.getElementById('fleet-add-document').addEventListener('click', function () {
      openModal('Add document / certificate', [
        { key: 'name', label: 'Name', required: true },
        { key: 'type', label: 'Type' },
        { key: 'issueDate', label: 'Issue date', type: 'date' },
        { key: 'expiryDate', label: 'Expiry date', type: 'date' }
      ], function (payload) {
        saveDocuments(getDocuments().concat({ id: id(), vesselId: selectedVesselId, name: payload.name, type: payload.type, issueDate: payload.issueDate, expiryDate: payload.expiryDate }));
        renderDocumentsPanel();
      });
    });

    document.getElementById('fleet-add-maintenance') && document.getElementById('fleet-add-maintenance').addEventListener('click', function () {
      openModal('Add maintenance record', [
        { key: 'date', label: 'Date', value: new Date().toISOString().slice(0, 10), type: 'date' },
        { key: 'type', label: 'Type' },
        { key: 'status', label: 'Status', value: 'Completed' },
        { key: 'description', label: 'Description', textarea: true }
      ], function (payload) {
        saveMaintenance(getMaintenance().concat({ id: id(), vesselId: selectedVesselId, date: payload.date, type: payload.type, status: payload.status, description: payload.description }));
        renderMaintenanceTable();
      });
    });

    document.getElementById('fleet-add-drydock') && document.getElementById('fleet-add-drydock').addEventListener('click', function () {
      openModal('Schedule dry dock', [
        { key: 'scheduledDate', label: 'Scheduled date', type: 'date' },
        { key: 'completedDate', label: 'Completed date', type: 'date' },
        { key: 'yard', label: 'Yard / Location' },
        { key: 'status', label: 'Status', value: 'Scheduled' }
      ], function (payload) {
        saveDrydock(getDrydock().concat({ id: id(), vesselId: selectedVesselId, scheduledDate: payload.scheduledDate, completedDate: payload.completedDate, yard: payload.yard, status: payload.status }));
        renderDrydockTable();
      });
    });

    document.getElementById('fleet-add-inventory') && document.getElementById('fleet-add-inventory').addEventListener('click', function () {
      openModal('Add inventory item', [
        { key: 'itemName', label: 'Item name', required: true },
        { key: 'partNumber', label: 'Part number' },
        { key: 'quantity', label: 'Quantity', value: '0', type: 'number' },
        { key: 'minLevel', label: 'Min level', type: 'number' },
        { key: 'maxLevel', label: 'Max level', type: 'number' },
        { key: 'unit', label: 'Unit' },
        { key: 'location', label: 'Location' },
        { key: 'supplier', label: 'Supplier' }
      ], function (payload) {
        saveInventory(getInventory().concat({ id: id(), vesselId: selectedVesselId, itemName: payload.itemName, partNumber: payload.partNumber, quantity: payload.quantity || '0', minLevel: payload.minLevel, maxLevel: payload.maxLevel, unit: payload.unit, location: payload.location, supplier: payload.supplier }));
        renderInventoryPanel();
      });
    });

    document.getElementById('fleet-add-logbook') && document.getElementById('fleet-add-logbook').addEventListener('click', function () {
      openModal('Add log entry', [
        { key: 'logDate', label: 'Date', value: new Date().toISOString().slice(0, 10), type: 'date' },
        { key: 'logType', label: 'Type', value: 'general' },
        { key: 'entry', label: 'Entry', textarea: true, required: true },
        { key: 'author', label: 'Author' }
      ], function (payload) {
        saveLogbooks(getLogbooks().concat({ id: id(), vesselId: selectedVesselId, logDate: payload.logDate, logType: payload.logType || 'general', entry: payload.entry, author: payload.author }));
        renderLogbooksPanel();
      });
    });

    document.getElementById('fleet-add-crew') && document.getElementById('fleet-add-crew').addEventListener('click', function () {
      var cm = typeof window.CrewManagement !== 'undefined' ? window.CrewManagement : null;
      var alreadyAssigned = cm ? cm.getCrewAssignments().filter(function (a) { return a.vesselId === selectedVesselId; }).map(function (a) { return a.crewMemberId; }) : [];
      var allMembers = cm ? cm.getCrewMembers() : [];
      var available = allMembers.filter(function (m) { return alreadyAssigned.indexOf(m.id) === -1; });
      if (cm && available.length > 0) {
        var options = available.map(function (m) {
          var label = m.name || 'Unnamed';
          if (m.role) label += ' - ' + m.role;
          return { value: m.id, label: label };
        });
        var body = document.getElementById('fleet-modal-body');
        var overlay = document.getElementById('fleet-modal-overlay');
        var cancelBtn = document.getElementById('fleet-modal-cancel');
        var saveBtn = document.getElementById('fleet-modal-save');
        if (!body || !overlay) return;
        body.innerHTML = '<h3 class="fleet-modal-title">Assign crew to vessel</h3>' +
          '<div class="form-group full-width"><label>Crew member</label><select class="fleet-modal-field" data-key="crewMemberId" required>' +
          options.map(function (o) { return '<option value="' + escapeHtml(o.value) + '">' + escapeHtml(o.label) + '</option>'; }).join('') + '</select></div>' +
          '<div class="form-group"><label>Role on vessel</label><input type="text" class="fleet-modal-field" data-key="roleOnVessel" value=""></div>' +
          '<div class="form-group"><label>Joining date</label><input type="date" class="fleet-modal-field" data-key="joiningDate" value="' + (new Date().toISOString().slice(0, 10)) + '"></div>' +
          '<p class="fleet-modal-hint" style="grid-column:1/-1;font-size:0.85rem;color:#666;margin:0;">Or <button type="button" class="btn btn-ghost btn-sm" id="fleet-add-crew-legacy-btn">add crew to this vessel</button> (legacy, no central record)</p>';
        overlay.style.display = 'flex';
        cancelBtn.onclick = function () { overlay.style.display = 'none'; };
        saveBtn.onclick = function () {
          var crewMemberId = body.querySelector('[data-key="crewMemberId"]').value;
          var roleOnVessel = body.querySelector('[data-key="roleOnVessel"]').value.trim();
          var joiningDate = body.querySelector('[data-key="joiningDate"]').value;
          cm.saveCrewAssignments(cm.getCrewAssignments().concat({ id: id(), vesselId: selectedVesselId, crewMemberId: crewMemberId, roleOnVessel: roleOnVessel, joiningDate: joiningDate }));
          overlay.style.display = 'none';
          renderCrewPanel();
        };
        setTimeout(function () {
          var legacyBtn = document.getElementById('fleet-add-crew-legacy-btn');
          if (legacyBtn) legacyBtn.addEventListener('click', function () { overlay.style.display = 'none'; openModal('Add crew to vessel', [
            { key: 'name', label: 'Name', required: true },
            { key: 'role', label: 'Role / Rank' },
            { key: 'certifications', label: 'Certifications', textarea: true },
            { key: 'joiningDate', label: 'Joining date', type: 'date' },
            { key: 'contact', label: 'Contact' }
          ], function (payload) {
            saveCrew(getCrew().concat({ id: id(), vesselId: selectedVesselId, name: payload.name, role: payload.role, certifications: payload.certifications, joiningDate: payload.joiningDate, contact: payload.contact }));
            renderCrewPanel();
          }); });
        }, 0);
        return;
      }
      openModal('Add crew to vessel', [
        { key: 'name', label: 'Name', required: true },
        { key: 'role', label: 'Role / Rank' },
        { key: 'certifications', label: 'Certifications', textarea: true },
        { key: 'joiningDate', label: 'Joining date', type: 'date' },
        { key: 'contact', label: 'Contact' }
      ], function (payload) {
        saveCrew(getCrew().concat({ id: id(), vesselId: selectedVesselId, name: payload.name, role: payload.role, certifications: payload.certifications, joiningDate: payload.joiningDate, contact: payload.contact }));
        renderCrewPanel();
      });
    });

    var logFilter = document.getElementById('fleet-logbook-type-filter');
    if (logFilter) logFilter.addEventListener('change', function () { renderLogbooksPanel(); });
  }

  window.FleetManagement = {
    setSection: setSection,
    render: render,
    get selectedVesselId() { return selectedVesselId; },
    getVessels: getVessels,
    getDocuments: getDocuments,
    getMaintenance: getMaintenance,
    getDrydock: getDrydock,
    getInventory: getInventory,
    getLogbooks: getLogbooks,
    getCrew: getCrew
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initFleet);
  else initFleet();
})();
