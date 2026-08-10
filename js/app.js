/**
 * Andeco Horizon Suite — Login required. Users and module access managed by administrator.
 * Data in localStorage. No installation required.
 */

(function () {
  'use strict';

  var STORAGE_KEYS = {
    users: 'andeco_crm_users',
    session: 'andeco_crm_session'
  };

  var ROUTE_STORAGE_KEY = 'andeco_crm_route';

  function isFileProtocol() {
    return typeof window !== 'undefined' && window.location && window.location.protocol === 'file:';
  }

  function isEmbeddedPreview() {
    try {
      return isFileProtocol() && window.self !== window.top;
    } catch (e) {
      return false;
    }
  }

  function getRoutePageId() {
    if (isFileProtocol()) {
      try {
        var stored = sessionStorage.getItem(ROUTE_STORAGE_KEY);
        if (stored) return String(stored).toLowerCase();
      } catch (e) {}
      var hashOnly = (window.location.hash || '').slice(1).toLowerCase();
      return hashOnly || 'home';
    }
    var hash = (window.location.hash || '').slice(1).toLowerCase();
    if (hash) return hash;
    try {
      var storedHttp = sessionStorage.getItem(ROUTE_STORAGE_KEY);
      if (storedHttp) return String(storedHttp).toLowerCase();
    } catch (e2) {}
    return 'home';
  }

  /** Navigate without relying on hash clicks (avoids file:// + iframe security errors). */
  function navigateTo(pageId) {
    pageId = (pageId || 'home').toLowerCase();
    try { sessionStorage.setItem(ROUTE_STORAGE_KEY, pageId); } catch (e) {}
    if (isFileProtocol()) {
      route(pageId);
      return;
    }
    // Auth/public screens must route immediately. Relying only on hashchange
    // can leave users stuck (e.g. public catalog → login).
    var directRoutePages = {
      login: true,
      setup: true,
      'lms-public': true,
      'lms-careers': true,
      'lms-portal': true
    };
    try {
      var nextHash = '#' + pageId;
      if (window.location.hash === nextHash || window.location.hash === pageId) {
        route(pageId);
        return;
      }
      window.location.hash = pageId;
      if (directRoutePages[pageId]) route(pageId);
    } catch (err) {
      route(pageId);
    }
  }
  window.navigateTo = navigateTo;

  var MODULES = [
    { id: 'accounting', name: 'Accounting' },
    { id: 'clients', name: 'Clients' },
    { id: 'fleet', name: 'Fleet Management' },
    { id: 'distribution', name: 'Distribution' },
    { id: 'hr', name: 'HR' },
    { id: 'crew', name: 'Crew Management' },
    { id: 'shifts', name: 'Shifts' },
    { id: 'documents', name: 'Document ISO' },
    { id: 'contacts', name: 'Contacts' },
    { id: 'lms', name: 'Learning (LMS)' },
    { id: 'settings', name: 'Settings' }
  ];

  var PUBLIC_PAGES = ['lms-public', 'lms-careers'];

  function isLmsOnlySession(session) {
    if (!session || session.isAdmin === true) return false;
    var mods = (session.allowedModules || []).filter(Boolean);
    if (!mods.length) return false;
    return mods.every(function (m) { return m === 'lms'; });
  }

  function openLmsPortal() {
    if (window.LmsPortal && typeof window.LmsPortal.open === 'function') {
      window.LmsPortal.open();
      return true;
    }
    return false;
  }

  /** Leave Learning Portal and restore CRM shell (admins / multi-module users). */
  function returnToCrmFromLmsPortal(pageId) {
    var session = getSession();
    if (!session) {
      showScreen('login-screen');
      return;
    }
    if (isLmsOnlySession(session)) {
      // LMS-only accounts stay in the portal.
      openLmsPortal();
      return;
    }
    pageId = (pageId || 'home').toLowerCase();
    document.body.classList.remove('lms-portal-active');
    var portal = document.getElementById('lms-portal-screen');
    if (portal) portal.classList.add('hidden');
    try { sessionStorage.setItem(ROUTE_STORAGE_KEY, pageId); } catch (e) {}
    if (!isFileProtocol()) {
      try { window.location.hash = pageId; } catch (e2) {}
    }
    showScreen('app-screen');
    refreshHeaderUser(session);
    applyVisibility(session);
    route(pageId);
  }
  window.returnToCrmFromLmsPortal = returnToCrmFromLmsPortal;
  window.isLmsOnlySession = isLmsOnlySession;

  var MODULE_IDS = MODULES.map(function (m) { return m.id; });

  var MODULE_SECTIONS = {
    accounting: [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'invoices', label: 'Invoices' },
      { id: 'receipts', label: 'Receipts' },
      { id: 'payroll', label: 'Payroll' },
      { id: 'subcontractors', label: 'Subcontractors' },
      { id: 'social-insurance', label: 'Social Insurance' },
      { id: 'reports', label: 'Reports' }
    ],
    fleet: [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'vessels', label: 'Vessels' }
    ],
    distribution: [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'catalog', label: 'Models & options' },
      { id: 'prospects', label: 'Potential clients' },
      { id: 'quotations', label: 'Quotations' },
      { id: 'sold', label: 'Sold vessels' }
    ],
    hr: [
      { id: 'overview', label: 'Overview' },
      { id: 'employees', label: 'Employees' },
      { id: 'payroll', label: 'Payroll' },
      { id: 'history', label: 'History' }
    ],
    crew: [
      { id: 'roster', label: 'Roster' }
    ],
    shifts: [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'calendar', label: 'Calendar' },
      { id: 'log-shifts', label: 'Log shifts' },
      { id: 'requests', label: 'Requests' },
      { id: 'hours', label: 'Monthly hours' },
      { id: 'availability', label: 'Availability' },
      { id: 'settings', label: 'Settings' }
    ],
    documents: [
      { id: 'overview', label: 'Overview' },
      { id: 'folders', label: 'Folders' },
      { id: 'history', label: 'History' }
    ],
    contacts: [
      { id: 'overview', label: 'Overview' },
      { id: 'activities', label: 'Activities' },
      { id: 'history', label: 'History' }
    ],
    clients: [
      { id: 'list', label: 'Clients' }
    ],
    lms: [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'my-learning', label: 'My learning' },
      { id: 'library', label: 'Course management' },
      { id: 'learners', label: 'User management' },
      { id: 'announcements', label: 'Communication' },
      { id: 'reports', label: 'Tracking & reports' },
      { id: 'certificates', label: 'Certification' },
      { id: 'purchases', label: 'Purchases' },
      { id: 'hiring', label: 'Hiring exams' },
      { id: 'settings', label: 'LMS settings' }
    ],
    settings: [
      { id: 'company', label: 'Company Information' },
      { id: 'document-logos', label: 'Document logos' },
      { id: 'quotation-header', label: 'Quotation Header' },
      { id: 'payroll', label: 'Payroll Settings' },
      { id: 'accounting', label: 'Accounting Settings' }
    ],
    admin: [
      { id: 'users', label: 'User management' }
    ]
  };

  function getUsers() {
    try {
      var raw = localStorage.getItem(STORAGE_KEYS.users);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [];
  }

  function saveUsers(users) {
    try {
      localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(users));
    } catch (e) {}
    try {
      if (window.AccountingData && window.AccountingData.persistAll) window.AccountingData.persistAll();
    } catch (e) {}
  }

  function getSession() {
    try {
      var raw = localStorage.getItem(STORAGE_KEYS.session);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  function setSession(session) {
    try {
      localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
    } catch (e) {}
  }

  function clearSession() {
    try {
      localStorage.removeItem(STORAGE_KEYS.session);
    } catch (e) {}
  }

  /** Pure-JS SHA-256 for contexts where crypto.subtle is unavailable (e.g. non-HTTPS). */
  function sha256HexFallback(message) {
    function rotr(n, x) { return (x >>> n) | (x << (32 - n)); }
    function ch(x, y, z) { return (x & y) ^ (~x & z); }
    function maj(x, y, z) { return (x & y) ^ (x & z) ^ (y & z); }
    function sigma0(x) { return rotr(2, x) ^ rotr(13, x) ^ rotr(22, x); }
    function sigma1(x) { return rotr(6, x) ^ rotr(11, x) ^ rotr(25, x); }
    function gamma0(x) { return rotr(7, x) ^ rotr(18, x) ^ (x >>> 3); }
    function gamma1(x) { return rotr(17, x) ^ rotr(19, x) ^ (x >>> 10); }

    var K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    var H = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ];

    var bytes = unescape(encodeURIComponent(String(message)));
    var len = bytes.length;
    var bitLenHi = Math.floor(len / 0x20000000);
    var bitLenLo = (len << 3) >>> 0;
    var withPad = bytes + String.fromCharCode(0x80);
    while ((withPad.length % 64) !== 56) withPad += String.fromCharCode(0);
    function u32be(n) {
      return String.fromCharCode((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
    }
    withPad += u32be(bitLenHi) + u32be(bitLenLo);

    for (var i = 0; i < withPad.length; i += 64) {
      var w = new Array(64);
      for (var j = 0; j < 16; j++) {
        var o = i + j * 4;
        w[j] = (
          (withPad.charCodeAt(o) << 24) |
          (withPad.charCodeAt(o + 1) << 16) |
          (withPad.charCodeAt(o + 2) << 8) |
          withPad.charCodeAt(o + 3)
        ) >>> 0;
      }
      for (j = 16; j < 64; j++) {
        w[j] = (gamma1(w[j - 2]) + w[j - 7] + gamma0(w[j - 15]) + w[j - 16]) >>> 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (j = 0; j < 64; j++) {
        var t1 = (h + sigma1(e) + ch(e, f, g) + K[j] + w[j]) >>> 0;
        var t2 = (sigma0(a) + maj(a, b, c)) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
      H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }

    return H.map(function (x) { return ('00000000' + x.toString(16)).slice(-8); }).join('');
  }

  function hashPassword(password) {
    var subtle = (window.crypto && crypto.subtle) || (window.crypto && crypto.webkitSubtle) || null;
    if (subtle && typeof subtle.digest === 'function') {
      return subtle.digest('SHA-256', new TextEncoder().encode(password))
        .then(function (buf) {
          return Array.from(new Uint8Array(buf))
            .map(function (b) { return b.toString(16).padStart(2, '0'); })
            .join('');
        })
        .catch(function () {
          return sha256HexFallback(password);
        });
    }
    return Promise.resolve(sha256HexFallback(password));
  }

  function canAccessModule(session, moduleId) {
    if (moduleId === 'admin' || moduleId === 'settings') return session.isAdmin === true;
    if (session.isAdmin) return true;
    return (session.allowedModules || []).indexOf(moduleId) !== -1;
  }

  function applyVisibility(session) {
    var isAdmin = session.isAdmin === true;
    MODULE_IDS.forEach(function (moduleId) {
      var allowed = canAccessModule(session, moduleId);
      document.querySelectorAll('[data-module="' + moduleId + '"]').forEach(function (el) {
        el.classList.toggle('hidden-module', !allowed);
      });
    });
    document.querySelectorAll('[data-module="admin"]').forEach(function (el) {
      el.classList.toggle('hidden-module', !isAdmin);
    });
    document.querySelectorAll('[data-module="settings"]').forEach(function (el) {
      el.classList.toggle('hidden-module', !isAdmin);
    });
  }

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(function (s) {
      var show = s.id === id;
      s.classList.toggle('hidden', !show);
      // Ensure public/portal screens cannot remain visible over login.
      if (!show) s.setAttribute('aria-hidden', 'true');
      else s.removeAttribute('aria-hidden');
    });
    document.body.classList.toggle('lms-portal-active', id === 'lms-portal-screen');
  }

  function showPage(pageId) {
    var appScreen = document.getElementById('app-screen');
    var isHome = pageId === 'home';
    if (appScreen) {
      appScreen.classList.toggle('home-view', isHome);
    }
    document.body.classList.toggle('home-view', isHome);
    document.querySelectorAll('.page').forEach(function (p) {
      p.classList.toggle('active', p.id === 'page-' + pageId);
    });
    updateSidebar(pageId);
  }

  var currentModulePageId = 'home';

  function showAccountingSectionContent(sectionId) {
    var appEl = document.getElementById('accounting-invoice-app');
    var placeholder = document.querySelector('#page-accounting .accounting-placeholder');
    var reportsContent = document.getElementById('accounting-reports-content');
    var payrollContent = document.getElementById('accounting-payroll-content');
    var scContent = document.getElementById('accounting-subcontractors-content');
    var siPanel = document.getElementById('accounting-social-insurance-content');
    if (currentModulePageId !== 'accounting' || !appEl || !placeholder) return;

    function hideAllAccountingHosts() {
      appEl.style.display = 'none';
      placeholder.style.display = 'none';
      if (reportsContent) reportsContent.style.display = 'none';
      if (payrollContent) payrollContent.style.display = 'none';
      if (scContent) scContent.style.display = 'none';
      if (siPanel) siPanel.style.display = 'none';
    }

    hideAllAccountingHosts();

    if (sectionId === 'reports') {
      if (reportsContent) reportsContent.style.display = 'block';
      try { if (window.app && window.app.setupStatementForm) window.app.setupStatementForm(); } catch (err) {}
    } else if (sectionId === 'dashboard' || sectionId === 'invoices' || sectionId === 'receipts') {
      appEl.style.display = 'block';
      try { if (window.app && window.app.showPage) window.app.showPage(sectionId); } catch (err) {}
    } else if (sectionId === 'payroll') {
      if (payrollContent) payrollContent.style.display = 'block';
    } else if (sectionId === 'subcontractors') {
      if (scContent) scContent.style.display = 'block';
      try {
        if (window.AccountingSubcontractors && window.AccountingSubcontractors.render) {
          window.AccountingSubcontractors.render();
        }
      } catch (err) {}
    } else if (sectionId === 'social-insurance') {
      if (siPanel) siPanel.style.display = 'block';
    } else {
      placeholder.style.display = 'block';
    }
    var overlay = document.getElementById('accounting-subsection-overlay');
    if (overlay) overlay.style.display = 'none';
    try { if (window.app && window.app.setupStatementForm) window.app.setupStatementForm(); } catch (e) {}
  }
  window.andecoRefreshAccountingSection = showAccountingSectionContent;

  function setGenericSectionPanels(pageSelector, panelSelector, sectionId) {
    document.querySelectorAll(pageSelector + ' ' + panelSelector).forEach(function (p) {
      var match = p.getAttribute('data-section') === sectionId;
      if (
        p.classList.contains('shifts-section-panel') ||
        p.classList.contains('lms-section-panel') ||
        p.classList.contains('dist-section-panel')
      ) {
        p.classList.toggle('active', match);
        p.style.display = match ? 'block' : 'none';
      } else {
        p.style.display = match ? '' : 'none';
      }
    });
  }

  function setAccountingSection(sectionId) {
    showAccountingSectionContent(sectionId);
    if (sectionId === 'payroll') {
      var payrollSub = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('andeco_payroll_sub')) || 'ytd';
      if (payrollSub === 'employees' || payrollSub === 'company') payrollSub = 'ytd';
      if (typeof window.setPayrollSubsection === 'function') window.setPayrollSubsection(payrollSub);
    }
    if (sectionId === 'social-insurance') {
      var siSub = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('andeco_si_sub')) || 'overview';
      if (siSub === 'submissions') siSub = 'monthly';
      if (typeof window.setSocialInsuranceSubsection === 'function') window.setSocialInsuranceSubsection(siSub);
    }
    if (sectionId === 'subcontractors') {
      var scSub = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('andeco_sc_sub')) || 'directory';
      if (typeof window.setSubcontractorsSubsection === 'function') window.setSubcontractorsSubsection(scSub);
    }
    if (window.AndecoModuleNav) {
      window.AndecoModuleNav.setActiveSectionOnSubtabs('accounting', sectionId);
      window.AndecoModuleNav.activateSection('accounting', sectionId);
    }
  }

  function syncSettingsFormFields(sectionId) {
    var settingsForm = document.getElementById('settings-form');
    if (settingsForm) {
      settingsForm.style.display = sectionId === 'payroll' ? 'none' : '';
      settingsForm.querySelectorAll('.settings-section-panel').forEach(function (panel) {
        var active = sectionId !== 'payroll' && panel.getAttribute('data-section') === sectionId;
        panel.querySelectorAll('input, textarea, select, button').forEach(function (el) {
          if (el.type === 'hidden') return;
          el.disabled = !active;
        });
      });
      var saveBar = document.getElementById('settings-form-save-bar');
      if (saveBar) saveBar.style.display = sectionId === 'payroll' ? 'none' : '';
    }
    var payrollPanel = document.querySelector('#page-settings .settings-section-panel[data-section="payroll"]');
    if (payrollPanel) {
      var payrollActive = sectionId === 'payroll';
      payrollPanel.querySelectorAll('input, textarea, select, button').forEach(function (el) {
        if (el.type === 'hidden') return;
        el.disabled = !payrollActive;
      });
    }
  }

  function setSettingsSection(sectionId) {
    if (currentModulePageId !== 'settings') return;
    setGenericSectionPanels('#page-settings', '.settings-section-panel', sectionId);
    if (window.AndecoModuleNav) {
      window.AndecoModuleNav.setActiveSectionOnSubtabs('settings', sectionId);
      window.AndecoModuleNav.activateSection('settings', sectionId);
    }
    syncSettingsFormFields(sectionId);
    if (sectionId === 'payroll' && typeof window.loadCompanySettings === 'function') window.loadCompanySettings();
    if (sectionId === 'quotation-header' && window.app) {
      try {
        if (typeof window.app.initQuotationHeaderUploads === 'function') {
          window.app.initQuotationHeaderUploads();
        }
        if (typeof window.app.loadQuotationHeaderForm === 'function' &&
            window.DataStore && typeof window.DataStore.getCompanySettings === 'function') {
          window.app.loadQuotationHeaderForm(window.DataStore.getCompanySettings());
        }
      } catch (err) { /* ignore */ }
      // Ensure upload controls are clickable after section switch / subsection wrap.
      document.querySelectorAll(
        '#quote-header-logos-grid button, #quote-header-logos-grid input[type="file"]'
      ).forEach(function (el) {
        el.disabled = false;
      });
    }
  }

  function setHRSection(sectionId) {
    if (currentModulePageId !== 'hr') return;
    setGenericSectionPanels('#page-hr', '.hr-section-panel', sectionId);
    if (sectionId === 'overview' && typeof window.hrEmployeesRefreshOverview === 'function') {
      window.hrEmployeesRefreshOverview();
    }
    if (sectionId === 'payroll' && typeof window.hrPayrollRefreshYTD === 'function') {
      window.hrPayrollRefreshYTD();
    }
    if (window.AndecoModuleNav) {
      window.AndecoModuleNav.setActiveSectionOnSubtabs('hr', sectionId);
      window.AndecoModuleNav.activateSection('hr', sectionId);
    }
  }

  function setShiftsSection(sectionId) {
    if (currentModulePageId !== 'shifts') return;
    if (typeof window.ShiftsManagement !== 'undefined' && window.ShiftsManagement.setSection) {
      window.ShiftsManagement.setSection(sectionId);
    }
    if (window.AndecoModuleNav) {
      window.AndecoModuleNav.setActiveSectionOnSubtabs('shifts', sectionId);
      window.AndecoModuleNav.activateSection('shifts', sectionId);
    }
  }

  function setFleetSection(sectionId) {
    if (currentModulePageId !== 'fleet') return;
    setGenericSectionPanels('#page-fleet', '.fleet-section-panel', sectionId);
    if (window.AndecoModuleNav) {
      window.AndecoModuleNav.setActiveSectionOnSubtabs('fleet', sectionId);
      window.AndecoModuleNav.activateSection('fleet', sectionId);
    }
    if (typeof window.FleetManagement !== 'undefined') {
      if (window.FleetManagement.setSection) window.FleetManagement.setSection(sectionId);
      if (window.FleetManagement.render) window.FleetManagement.render();
    }
  }
  window.setFleetSection = setFleetSection;

  function setDocumentsSection(sectionId) {
    if (currentModulePageId !== 'documents') return;
    setGenericSectionPanels('#page-documents', '.docs-section-panel', sectionId);
    if (window.AndecoModuleNav) {
      window.AndecoModuleNav.setActiveSectionOnSubtabs('documents', sectionId);
      window.AndecoModuleNav.activateSection('documents', sectionId);
    }
  }

  function setContactsSection(sectionId) {
    if (currentModulePageId !== 'contacts') return;
    setGenericSectionPanels('#page-contacts', '.contacts-section-panel', sectionId);
    if (window.AndecoModuleNav) {
      window.AndecoModuleNav.setActiveSectionOnSubtabs('contacts', sectionId);
      window.AndecoModuleNav.activateSection('contacts', sectionId);
    }
  }

  function setClientsSection(sectionId) {
    if (currentModulePageId !== 'clients') return;
    setGenericSectionPanels('#page-clients', '.clients-section-panel', sectionId);
    if (window.AndecoModuleNav) {
      window.AndecoModuleNav.setActiveSectionOnSubtabs('clients', sectionId);
      window.AndecoModuleNav.activateSection('clients', sectionId);
    }
  }

  function setCrewSection(sectionId) {
    if (currentModulePageId !== 'crew') return;
    setGenericSectionPanels('#page-crew', '.crew-section-panel', sectionId);
    if (window.AndecoModuleNav) {
      window.AndecoModuleNav.setActiveSectionOnSubtabs('crew', sectionId);
      window.AndecoModuleNav.activateSection('crew', sectionId);
    }
    if (typeof window.CrewManagement !== 'undefined' && window.CrewManagement.render) window.CrewManagement.render();
  }

  function setLmsSection(sectionId) {
    if (currentModulePageId !== 'lms') return;
    setGenericSectionPanels('#page-lms', '.lms-section-panel', sectionId);
    if (window.AndecoModuleNav) {
      window.AndecoModuleNav.setActiveSectionOnSubtabs('lms', sectionId);
      window.AndecoModuleNav.activateSection('lms', sectionId);
    }
    if (typeof window.LmsModule !== 'undefined') {
      if (window.LmsModule.setSection) window.LmsModule.setSection(sectionId);
      if (window.LmsModule.render) window.LmsModule.render();
    }
  }
  window.setLmsSection = setLmsSection;

  function setDistributionSection(sectionId) {
    if (currentModulePageId !== 'distribution') return;
    setGenericSectionPanels('#page-distribution', '.dist-section-panel', sectionId);
    if (window.AndecoModuleNav) {
      window.AndecoModuleNav.setActiveSectionOnSubtabs('distribution', sectionId);
      window.AndecoModuleNav.activateSection('distribution', sectionId);
    }
    if (typeof window.DistributionModule !== 'undefined') {
      if (window.DistributionModule.setSection) window.DistributionModule.setSection(sectionId);
      if (window.DistributionModule.render) window.DistributionModule.render();
    }
  }
  window.setDistributionSection = setDistributionSection;

  function setPayrollSubsection(subId) {
    if (subId === 'employees' || subId === 'company') subId = 'ytd';
    var container = document.getElementById('accounting-payroll-content');
    if (!container) return;
    try { sessionStorage.setItem('andeco_payroll_sub', subId); } catch (e) {}
    container.querySelectorAll('.payroll-sub-panel').forEach(function (p) {
      p.style.display = p.getAttribute('data-payroll-sub') === subId ? 'block' : 'none';
    });
    if (subId === 'ytd' && typeof window.updateYTDDisplay === 'function') window.updateYTDDisplay();
    if (subId === 'payslips' && typeof window.loadPayslips === 'function') window.loadPayslips();
  }
  window.setPayrollSubsection = setPayrollSubsection;

  function setSocialInsuranceSubsection(subId) {
    var container = document.getElementById('accounting-social-insurance-content');
    if (!container) return;
    if (subId === 'submissions') subId = 'monthly';
    try { sessionStorage.setItem('andeco_si_sub', subId); } catch (e) {}
    container.querySelectorAll('.si-sub-panel').forEach(function (p) {
      p.style.display = p.getAttribute('data-si-sub') === subId ? 'block' : 'none';
    });
    if (subId === 'overview' && typeof window.updateSocialInsuranceYTDDisplay === 'function') {
      window.updateSocialInsuranceYTDDisplay();
    }
    if (subId === 'monthly' && typeof window.updateSocialInsuranceMonthlyDisplay === 'function') {
      window.updateSocialInsuranceMonthlyDisplay();
    }
  }
  window.setSocialInsuranceSubsection = setSocialInsuranceSubsection;

  function activateSidebarSection(sectionId) {
    var pageId = currentModulePageId;
    if (pageId === 'accounting') {
      try { sessionStorage.setItem('andeco_crm_accounting_section', sectionId); } catch (e) {}
      setAccountingSection(sectionId);
    }
    if (pageId === 'settings') setSettingsSection(sectionId);
    if (pageId === 'hr') setHRSection(sectionId);
    if (pageId === 'fleet') setFleetSection(sectionId);
    if (pageId === 'shifts') setShiftsSection(sectionId);
    if (pageId === 'documents') setDocumentsSection(sectionId);
    if (pageId === 'contacts') setContactsSection(sectionId);
    if (pageId === 'clients') setClientsSection(sectionId);
    if (pageId === 'crew') setCrewSection(sectionId);
    if (pageId === 'lms') setLmsSection(sectionId);
    if (pageId === 'distribution') setDistributionSection(sectionId);
  }

  function initSidebarDelegation() {
    var container = document.getElementById('sidebar-module-sections');
    if (!container || container.getAttribute('data-delegated') === '1') return;
    container.setAttribute('data-delegated', '1');
    container.addEventListener('click', function (e) {
      var link = e.target.closest('.sidebar-section-link');
      if (!link) return;
      e.preventDefault();
      container.querySelectorAll('.sidebar-section-link').forEach(function (l) { l.classList.remove('active'); });
      link.classList.add('active');
      activateSidebarSection(link.getAttribute('data-section'));
    });
  }

  function updateSidebar(pageId) {
    var homeLink = document.getElementById('sidebar-home-link');
    var labelEl = document.getElementById('sidebar-label');
    var divider = document.getElementById('sidebar-divider');
    var container = document.getElementById('sidebar-module-sections');
    if (!container) return;

    if (pageId === 'home') {
      currentModulePageId = 'home';
      if (labelEl) labelEl.textContent = '';
      if (divider) divider.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    if (divider) divider.style.display = 'block';
    var sections = MODULE_SECTIONS[pageId];
    var sectionTitles = {
      accounting: 'Accounting',
      clients: 'Clients',
      fleet: 'Fleet Management',
      distribution: 'Distribution',
      hr: 'HR',
      crew: 'Crew Management',
      shifts: 'Shifts',
      documents: 'Document ISO',
      contacts: 'Contacts',
      lms: 'Learning (LMS)',
      settings: 'Settings',
      admin: 'Admin'
    };
    if (labelEl) labelEl.textContent = sectionTitles[pageId] || 'Sections';
    currentModulePageId = pageId;

    if (sections && sections.length) {
      container.innerHTML = sections.map(function (s, i) {
        return '<a href="#" class="nav-item sidebar-section-link" data-section="' + s.id + '">' +
          '<span class="nav-icon">' + (i + 1) + '</span><span>' + escapeHtml(s.label) + '</span></a>';
      }).join('');
      if (pageId === 'accounting') {
        var savedSection = '';
        try { savedSection = sessionStorage.getItem('andeco_crm_accounting_section') || ''; } catch (e) {}
        var validIds = sections.map(function (s) { return s.id; });
        var sectionId = validIds.indexOf(savedSection) !== -1 ? savedSection : (sections[0] ? sections[0].id : 'dashboard');
        var link = container.querySelector('.sidebar-section-link[data-section="' + sectionId + '"]');
        if (link) {
          container.querySelectorAll('.sidebar-section-link').forEach(function (l) { l.classList.remove('active'); });
          link.classList.add('active');
        }
        setAccountingSection(sectionId);
      } else if (sections[0]) {
        var first = container.querySelector('.sidebar-section-link[data-section="' + sections[0].id + '"]');
        if (first) first.classList.add('active');
        activateSidebarSection(sections[0].id);
      }
    } else {
      container.innerHTML = '';
    }
  }

  function isPublicPage(pageId) {
    return PUBLIC_PAGES.indexOf(pageId) !== -1;
  }

  function openPublicPage(pageId) {
    if (typeof window.LmsModule !== 'undefined' && window.LmsModule.showPublicScreen) {
      window.LmsModule.showPublicScreen(pageId === 'lms-careers' ? 'careers' : 'public');
      return;
    }
    var screenId = pageId === 'lms-careers' ? 'lms-careers-screen' : 'lms-public-screen';
    showScreen(screenId);
  }

  function route(forcedPageId) {
    var pageId = forcedPageId != null ? String(forcedPageId).toLowerCase() : getRoutePageId();
    if (!pageId) pageId = 'home';

    if (isPublicPage(pageId)) {
      openPublicPage(pageId);
      return;
    }

    if (pageId === 'login' || pageId === 'setup') {
      clearSession();
      document.body.classList.remove('lms-portal-active');
      try {
        if (window.LmsModule && typeof window.LmsModule.resetPublicViews === 'function') {
          window.LmsModule.resetPublicViews();
        }
      } catch (eLogin) {}
      var usersForAuth = getUsers();
      var authScreen = (pageId === 'setup' || usersForAuth.length === 0) ? 'setup-screen' : 'login-screen';
      showScreen(authScreen);
      // Force-hide public overlays in case a prior view left them open.
      ['lms-public-screen', 'lms-careers-screen', 'lms-portal-screen', 'app-screen'].forEach(function (sid) {
        var el = document.getElementById(sid);
        if (el) el.classList.add('hidden');
      });
      var authEl = document.getElementById(authScreen);
      if (authEl) authEl.classList.remove('hidden');
      return;
    }

    if (pageId === 'lms-portal') {
      var portalSession = getSession();
      if (!portalSession) {
        showScreen('login-screen');
        return;
      }
      if (isLmsOnlySession(portalSession) || canAccessModule(portalSession, 'lms') || portalSession.isAdmin) {
        openLmsPortal();
        return;
      }
      navigateTo('home');
      return;
    }

    var session = getSession();
    if (!session) return;

    if (isLmsOnlySession(session)) {
      openLmsPortal();
      return;
    }

    if (pageId === 'admin' || pageId === 'settings') {
      if (!session.isAdmin) {
        navigateTo('home');
        return;
      }
    } else if (MODULE_IDS.indexOf(pageId) !== -1) {
      if (!canAccessModule(session, pageId)) {
        navigateTo('home');
        return;
      }
    }

    if (pageId === 'home' || pageId === 'admin' || pageId === 'settings' || MODULE_IDS.indexOf(pageId) !== -1) {
      showPage(pageId);
      if (pageId === 'admin') renderAdminUserList();
      if (pageId === 'settings' && typeof window.app !== 'undefined' && window.app.loadSettingsForm) window.app.loadSettingsForm();
      if (pageId === 'clients' && typeof window.ClientsModule !== 'undefined' && window.ClientsModule.render) window.ClientsModule.render();
      if (pageId === 'fleet' && typeof window.FleetManagement !== 'undefined' && window.FleetManagement.render) window.FleetManagement.render();
      if (pageId === 'crew' && typeof window.CrewManagement !== 'undefined' && window.CrewManagement.render) window.CrewManagement.render();
      if (pageId === 'shifts' && typeof window.ShiftsManagement !== 'undefined' && window.ShiftsManagement.render) window.ShiftsManagement.render();
      if (pageId === 'lms' && typeof window.LmsModule !== 'undefined' && window.LmsModule.render) window.LmsModule.render();
      if (pageId === 'distribution' && typeof window.DistributionModule !== 'undefined' && window.DistributionModule.render) {
        window.DistributionModule.render();
      }
      // Offer modern portal entry from CRM Learning module for admins / multi-module users.
      var openPortalBtn = document.getElementById('lms-open-portal-btn');
      if (pageId === 'lms' && openPortalBtn && openPortalBtn.getAttribute('data-bound') !== '1') {
        openPortalBtn.setAttribute('data-bound', '1');
        openPortalBtn.addEventListener('click', function () {
          openLmsPortal();
        });
      }
    } else {
      showPage('home');
    }
  }

  function usesCloudLogin() {
    if (isFileProtocol()) return false;
    var ds = window.AccountingData;
    return !!(ds && typeof ds.isSupabaseConfigured === 'function' && ds.isSupabaseConfigured());
  }

  function usesServerAuth() {
    if (isFileProtocol()) return false;
    if (usesCloudLogin()) return false;
    var ds = window.AccountingData;
    if (ds && typeof ds.usesServerAuth === 'function') return !!ds.usesServerAuth();
    return !!(typeof window !== 'undefined' && window.ANDECO_SERVER_AUTH);
  }

  function fetchJson(url, options) {
    var opts = options ? Object.assign({}, options) : {};
    opts.credentials = 'same-origin';
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    return fetch(url, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        return { res: res, json: json };
      });
    });
  }

  function refreshUsersFromServer() {
    return fetchJson('/api/users', { method: 'GET', headers: {} }).then(function (out) {
      if (!out.res.ok || !out.json || !Array.isArray(out.json.users)) return getUsers();
      saveUsers(out.json.users);
      return out.json.users;
    }).catch(function () { return getUsers(); });
  }

  function configureUnifiedLoginUI(cloudAuth) {
    var loginSubtitle = document.querySelector('#login-screen .auth-tagline') ||
      document.querySelector('#login-screen .login-brand p.auth-tagline') ||
      document.querySelector('#login-screen .login-brand .auth-tagline');
    if (!loginSubtitle) {
      loginSubtitle = document.querySelector('#login-screen .auth-brand .auth-tagline');
    }
    var usernameLabel = document.querySelector('label[for="login-username"]');
    var usernameInput = document.getElementById('login-username');
    var supabasePanel = document.getElementById('supabase-cloud-panel');
    var setupSupabasePanel = document.getElementById('setup-supabase-cloud-panel');
    if (loginSubtitle) {
      loginSubtitle.textContent = 'Chase the horizon with courage, for every step forward reveals a brighter, limitless tomorrow ahead.';
    }
    if (cloudAuth) {
      if (usernameLabel) usernameLabel.textContent = 'Email';
      if (usernameInput) {
        usernameInput.type = 'email';
        usernameInput.placeholder = 'Email';
        usernameInput.autocomplete = 'email';
      }
      if (supabasePanel) supabasePanel.classList.add('hidden');
      if (setupSupabasePanel) setupSupabasePanel.classList.add('hidden');
    } else {
      if (usernameLabel) usernameLabel.textContent = 'Username';
      if (usernameInput) {
        usernameInput.type = 'text';
        usernameInput.placeholder = 'Username';
        usernameInput.autocomplete = 'username';
      }
    }
  }

  function initPasswordToggle() {
    var btn = document.getElementById('login-password-toggle');
    var input = document.getElementById('login-password');
    if (!btn || !input) return;
    btn.addEventListener('click', function () {
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      btn.title = show ? 'Hide password' : 'Show password';
    });
  }

  function createCrmSessionFromSupabase() {
    var ds = window.AccountingData;
    if (!ds || typeof ds.fetchOrgMembership !== 'function') return Promise.resolve(false);
    return ds.fetchOrgMembership().then(function (membership) {
      if (!membership) return false;
      var displayName = membership.email ? membership.email.split('@')[0] : 'User';
      setSession({
        userId: membership.userId,
        username: membership.email || membership.userId,
        displayName: displayName,
        isAdmin: membership.isAdmin,
        allowedModules: membership.allowedModules || []
      });
      return true;
    });
  }

  function initSetup() {
    var form = document.getElementById('setup-form');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var username = (document.getElementById('setup-username') || {}).value.trim().toLowerCase();
      var password = (document.getElementById('setup-password') || {}).value;
      var displayName = (document.getElementById('setup-displayname') || {}).value.trim();
      if (!username || !password || !displayName) return;
      if (usesServerAuth()) {
        fetchJson('/api/bootstrap', {
          method: 'POST',
          body: JSON.stringify({ username: username, password: password, displayName: displayName })
        }).then(function (out) {
          if (!out.res.ok || !out.json || !out.json.session) {
            alert((out.json && out.json.error) || 'Setup failed.');
            return null;
          }
          setSession(out.json.session);
          var ds = window.AccountingData;
          if (ds && typeof ds.loadWorkspace === 'function') {
            return ds.loadWorkspace().then(function () {
              if (typeof ds.notifyModulesDataLoaded === 'function') ds.notifyModulesDataLoaded();
              startApp();
            });
          }
          startApp();
          return null;
        }).catch(function () {
          alert('Setup failed. Please try again.');
        });
        return;
      }

      hashPassword(password).then(function (passwordHash) {
        var user = {
          id: 'u' + Date.now(),
          username: username,
          passwordHash: passwordHash,
          displayName: displayName,
          isAdmin: true,
          allowedModules: MODULE_IDS.slice()
        };
        var users = getUsers();
        users.push(user);
        saveUsers(users);
        setSession({
          userId: user.id,
          username: user.username,
          displayName: user.displayName,
          isAdmin: true,
          allowedModules: user.allowedModules
        });
        startApp();
      });
    });
  }

  function initLogin() {
    var form = document.getElementById('login-form');
    var errorEl = document.getElementById('login-error');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (errorEl) errorEl.classList.add('hidden');

      if (usesCloudLogin()) {
        var ds = window.AccountingData;
        var email = (document.getElementById('login-username') || {}).value.trim().toLowerCase();
        var password = (document.getElementById('login-password') || {}).value;
        if (!email || !password) return;
        if (!ds || typeof ds.signInToSupabase !== 'function') return;
        ds.signInToSupabase(email, password).then(function (result) {
          if (result.error) {
            if (errorEl) {
              errorEl.textContent = result.error.message || 'Invalid email or password.';
              errorEl.classList.remove('hidden');
            }
            return null;
          }
          if (typeof ds.activateSupabaseBackend !== 'function') return false;
          return ds.activateSupabaseBackend();
        }).then(function (activated) {
          if (activated === null) return;
          if (!activated) {
            if (errorEl) {
              errorEl.textContent = 'Signed in but could not load workspace data.';
              errorEl.classList.remove('hidden');
            }
            return false;
          }
          return createCrmSessionFromSupabase();
        }).then(function (ok) {
          if (ok) {
            startApp();
          } else if (ok === false) {
            if (errorEl) {
              errorEl.textContent = 'Your account is not linked to this organization. Contact your administrator.';
              errorEl.classList.remove('hidden');
            }
          }
        }).catch(function (err) {
          if (errorEl) {
            errorEl.textContent = (err && err.message) ? err.message : 'Sign in failed.';
            errorEl.classList.remove('hidden');
          }
        });
        return;
      }

      var username = (document.getElementById('login-username') || {}).value.trim().toLowerCase();
      var password = (document.getElementById('login-password') || {}).value;
      if (!username || !password) return;

      if (usesServerAuth()) {
        fetchJson('/api/login', {
          method: 'POST',
          body: JSON.stringify({ username: username, password: password })
        }).then(function (out) {
          if (!out.res.ok || !out.json || !out.json.session) {
            if (errorEl) {
              errorEl.textContent = (out.json && out.json.error) || 'Invalid username or password.';
              errorEl.classList.remove('hidden');
            }
            return null;
          }
          setSession(out.json.session);
          var ds = window.AccountingData;
          if (ds && typeof ds.loadWorkspace === 'function') {
            return ds.loadWorkspace().then(function () {
              if (typeof ds.notifyModulesDataLoaded === 'function') ds.notifyModulesDataLoaded();
              if (out.json.session.isAdmin) return refreshUsersFromServer();
            }).then(function () {
              startApp();
            });
          }
          startApp();
          return null;
        }).catch(function (err) {
          if (errorEl) {
            errorEl.textContent = (err && err.message) ? err.message : 'Login failed. Please try again.';
            errorEl.classList.remove('hidden');
          }
        });
        return;
      }

      hashPassword(password).then(function (passwordHash) {
        var users = getUsers();
        var user = users.filter(function (u) { return u.username === username; })[0];
        if (!user || user.passwordHash !== passwordHash) {
          if (errorEl) {
            errorEl.textContent = 'Invalid username or password.';
            errorEl.classList.remove('hidden');
          }
          return;
        }
        setSession({
          userId: user.id,
          username: user.username,
          displayName: user.displayName,
          isAdmin: user.isAdmin === true,
          allowedModules: user.allowedModules || []
        });
        startApp();
      }).catch(function (err) {
        if (errorEl) {
          errorEl.textContent = (err && err.message) ? err.message : 'Login failed. Please try again.';
          errorEl.classList.remove('hidden');
        }
      });
    });
  }

  function closeProfileModal() {
    var modal = document.getElementById('profile-modal');
    if (modal) modal.classList.add('hidden');
  }

  function openProfileModal() {
    var session = getSession();
    if (!session) return;
    var users = getUsers();
    var user = users.filter(function (u) { return u.id === session.userId; })[0];
    if (!user) {
      user = users.filter(function (u) { return u.username === session.username; })[0];
    }
    if (!user) return;

    var modal = document.getElementById('profile-modal');
    var usernameEl = document.getElementById('profile-username');
    var displayEl = document.getElementById('profile-displayname');
    var currentPw = document.getElementById('profile-current-password');
    var newPw = document.getElementById('profile-new-password');
    var confirmPw = document.getElementById('profile-confirm-password');
    var err = document.getElementById('profile-error');
    var ok = document.getElementById('profile-success');
    if (!modal) return;

    if (usernameEl) usernameEl.value = user.username || '';
    if (displayEl) displayEl.value = user.displayName || session.displayName || '';
    if (currentPw) currentPw.value = '';
    if (newPw) newPw.value = '';
    if (confirmPw) confirmPw.value = '';
    if (err) err.classList.add('hidden');
    if (ok) ok.classList.add('hidden');
    modal.classList.remove('hidden');
    if (displayEl) displayEl.focus();
  }

  function refreshHeaderUser(session) {
    session = session || getSession();
    if (!session) return;
    var badge = document.getElementById('user-badge');
    if (badge) badge.textContent = session.displayName || session.username;
    var initial = document.getElementById('avatar-initial');
    var name = session.displayName || session.username || '';
    if (initial) initial.textContent = name.charAt(0) ? name.charAt(0).toUpperCase() : 'U';
  }

  function initProfileMenu() {
    var trigger = document.getElementById('header-user-trigger');
    var dropdown = document.getElementById('header-user-dropdown');
    var editBtn = document.getElementById('header-edit-profile-btn');
    var modal = document.getElementById('profile-modal');
    var form = document.getElementById('profile-form');
    var closeBtn = document.getElementById('profile-modal-close');
    var cancelBtn = document.getElementById('profile-cancel-btn');

    function setMenuOpen(open) {
      if (!dropdown || !trigger) return;
      dropdown.classList.toggle('hidden', !open);
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    if (trigger && dropdown) {
      trigger.addEventListener('click', function (e) {
        e.stopPropagation();
        setMenuOpen(dropdown.classList.contains('hidden'));
      });
      document.addEventListener('click', function (e) {
        var menu = document.getElementById('header-user-menu');
        if (menu && !menu.contains(e.target)) setMenuOpen(false);
      });
    }

    if (editBtn) {
      editBtn.addEventListener('click', function () {
        setMenuOpen(false);
        openProfileModal();
      });
    }

    function hideModal() { closeProfileModal(); }
    if (closeBtn) closeBtn.addEventListener('click', hideModal);
    if (cancelBtn) cancelBtn.addEventListener('click', hideModal);
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) hideModal();
      });
    }

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var err = document.getElementById('profile-error');
        var ok = document.getElementById('profile-success');
        function showError(msg) {
          if (ok) ok.classList.add('hidden');
          if (err) {
            err.textContent = msg;
            err.classList.remove('hidden');
          }
        }
        function showOk() {
          if (err) err.classList.add('hidden');
          if (ok) ok.classList.remove('hidden');
        }

        var session = getSession();
        if (!session) return;
        var users = getUsers();
        var user = users.filter(function (u) { return u.id === session.userId; })[0]
          || users.filter(function (u) { return u.username === session.username; })[0];
        if (!user) {
          showError('Your account could not be found.');
          return;
        }

        var displayName = (document.getElementById('profile-displayname') || {}).value.trim();
        var currentPassword = (document.getElementById('profile-current-password') || {}).value;
        var newPassword = (document.getElementById('profile-new-password') || {}).value;
        var confirmPassword = (document.getElementById('profile-confirm-password') || {}).value;
        if (!displayName) {
          showError('Display name is required.');
          return;
        }

        var changingPassword = !!(currentPassword || newPassword || confirmPassword);
        if (changingPassword) {
          if (!currentPassword || !newPassword) {
            showError('Enter your current password and a new password.');
            return;
          }
          if (newPassword.length < 6) {
            showError('New password must be at least 6 characters.');
            return;
          }
          if (newPassword !== confirmPassword) {
            showError('New password and confirmation do not match.');
            return;
          }
        }

        function finishSave(passwordHash) {
          user.displayName = displayName;
          if (passwordHash) user.passwordHash = passwordHash;
          saveUsers(users);
          setSession({
            userId: user.id,
            username: user.username,
            displayName: user.displayName,
            isAdmin: user.isAdmin === true,
            allowedModules: user.allowedModules || []
          });
          refreshHeaderUser();
          showOk();
          if (document.getElementById('profile-current-password')) document.getElementById('profile-current-password').value = '';
          if (document.getElementById('profile-new-password')) document.getElementById('profile-new-password').value = '';
          if (document.getElementById('profile-confirm-password')) document.getElementById('profile-confirm-password').value = '';
        }

        if (usesServerAuth()) {
          var payload = { displayName: displayName };
          if (changingPassword) {
            payload.currentPassword = currentPassword;
            payload.newPassword = newPassword;
          }
          fetchJson('/api/change-password', {
            method: 'POST',
            body: JSON.stringify(payload)
          }).then(function (out) {
            if (!out.res.ok) {
              showError((out.json && out.json.error) || 'Could not update profile.');
              return;
            }
            if (out.json && out.json.session) setSession(out.json.session);
            else {
              session.displayName = displayName;
              setSession(session);
            }
            user.displayName = displayName;
            saveUsers(users);
            refreshHeaderUser();
            showOk();
            if (document.getElementById('profile-current-password')) document.getElementById('profile-current-password').value = '';
            if (document.getElementById('profile-new-password')) document.getElementById('profile-new-password').value = '';
            if (document.getElementById('profile-confirm-password')) document.getElementById('profile-confirm-password').value = '';
          }).catch(function () {
            showError('Could not update profile. Try again.');
          });
          return;
        }

        if (!changingPassword) {
          finishSave(null);
          return;
        }

        hashPassword(currentPassword).then(function (currentHash) {
          if (user.passwordHash !== currentHash) {
            showError('Current password is incorrect.');
            return null;
          }
          return hashPassword(newPassword);
        }).then(function (newHash) {
          if (!newHash) return;
          finishSave(newHash);
        }).catch(function () {
          showError('Could not update password. Try again.');
        });
      });
    }
  }

  function startApp() {
    var session = getSession();
    if (!session) return;

    // After login (or refresh with a session), never stay on auth routes —
    // route('login'|'setup') clears the session and leaves the user stuck on login
    // (common on mobile when the URL still has #login).
    var routeId = getRoutePageId();
    if (!routeId || routeId === 'login' || routeId === 'setup') {
      routeId = isLmsOnlySession(session) ? 'lms-portal' : 'home';
      try { sessionStorage.setItem(ROUTE_STORAGE_KEY, routeId); } catch (eRoute) {}
      try {
        if (!isFileProtocol()) history.replaceState(null, '', '#' + routeId);
      } catch (eHash) {}
    }

    // LMS-only users never enter the CRM shell — go straight to Learning Portal.
    // Admins/multi-module users only open the portal when the route is explicitly lms-portal.
    if (isLmsOnlySession(session)) {
      document.body.classList.remove('home-view');
      if (openLmsPortal()) return;
    } else if (routeId === 'lms-portal' && (canAccessModule(session, 'lms') || session.isAdmin)) {
      document.body.classList.remove('home-view');
      if (openLmsPortal()) return;
    }

    showScreen('app-screen');
    refreshHeaderUser(session);
    applyVisibility(session);
    route(routeId);
  }

  function initLogout() {
    var btn = document.getElementById('logout-btn');
    if (btn) {
      btn.addEventListener('click', function () {
        var ds = window.AccountingData;
        var signOutPromise = Promise.resolve();
        if (usesServerAuth()) {
          signOutPromise = fetchJson('/api/logout', { method: 'POST', body: '{}' }).catch(function () {});
        } else if (ds && typeof ds.signOutFromSupabase === 'function') {
          signOutPromise = ds.signOutFromSupabase();
        }
        signOutPromise.finally(function () {
          clearSession();
          document.body.classList.remove('home-view');
          document.body.classList.remove('lms-portal-active');
          if (usesCloudLogin()) {
            showScreen('login-screen');
            return;
          }
          if (usesServerAuth()) {
            showScreen('login-screen');
            return;
          }
          var users = getUsers();
          if (users.length === 0) showScreen('setup-screen');
          else showScreen('login-screen');
        });
      });
    }
  }

  function renderAdminUserList() {
    var container = document.getElementById('admin-user-list');
    if (!container) return;
    var users = getUsers();
    container.innerHTML = users.map(function (u) {
      var modulesStr = u.isAdmin ? 'All (administrator)' : (u.allowedModules || []).join(', ') || 'None';
      return '<div class="admin-user-row" data-user-id="' + escapeHtml(String(u.id != null ? u.id : '')) + '">' +
        '<span class="user-name">' + escapeHtml(u.displayName || u.username) + '</span>' +
        '<span class="user-username">' + escapeHtml(u.username) + '</span>' +
        (u.isAdmin ? '<span class="user-admin-badge">Admin</span>' : '') +
        '<span class="user-modules">' + escapeHtml(modulesStr) + '</span>' +
        '<button type="button" class="btn btn-ghost btn-edit">Edit</button>' +
        '</div>';
    }).join('') || '<p class="user-muted">No users yet. Add the first user above.</p>';

    container.querySelectorAll('.btn-edit').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var row = btn.closest('.admin-user-row');
        var userId = row && row.getAttribute('data-user-id');
        if (userId) openUserForm(userId);
      });
    });
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function openUserForm(userId) {
    var wrap = document.getElementById('admin-user-form-wrap');
    var form = document.getElementById('admin-user-form');
    var titleEl = document.getElementById('admin-form-title');
    var idEl = document.getElementById('admin-user-id');
    var passwordOptional = document.getElementById('admin-password-optional');
    var passwordInput = document.getElementById('admin-password');
    if (!wrap || !form) return;

    if (userId) {
      var users = getUsers();
      var user = users.filter(function (u) { return u.id === userId; })[0];
      if (!user) return;
      if (titleEl) titleEl.textContent = 'Edit user';
      if (idEl) idEl.value = user.id;
      if (document.getElementById('admin-username')) document.getElementById('admin-username').value = user.username;
      if (document.getElementById('admin-username')) document.getElementById('admin-username').readOnly = true;
      if (passwordInput) passwordInput.value = '';
      if (passwordOptional) passwordOptional.style.display = 'inline';
      if (document.getElementById('admin-displayname')) document.getElementById('admin-displayname').value = user.displayName || '';
      if (document.getElementById('admin-is-admin')) document.getElementById('admin-is-admin').checked = user.isAdmin === true;
      document.querySelectorAll('input[name="admin-module"]').forEach(function (cb) {
        cb.checked = user.isAdmin || (user.allowedModules || []).indexOf(cb.value) !== -1;
        cb.disabled = user.isAdmin;
      });
    } else {
      if (titleEl) titleEl.textContent = 'Add user';
      if (idEl) idEl.value = '';
      form.reset();
      if (document.getElementById('admin-username')) document.getElementById('admin-username').readOnly = false;
      if (passwordOptional) passwordOptional.style.display = 'none';
      document.querySelectorAll('input[name="admin-module"]').forEach(function (cb) { cb.disabled = false; });
    }
    toggleAdminModuleCheckboxes();
    wrap.classList.remove('hidden');
  }

  function toggleAdminModuleCheckboxes() {
    var isAdminCb = document.getElementById('admin-is-admin');
    var list = document.querySelectorAll('input[name="admin-module"]');
    if (!isAdminCb || !list.length) return;
    var disabled = isAdminCb.checked;
    list.forEach(function (cb) {
      cb.disabled = disabled;
      if (disabled) cb.checked = true;
    });
  }

  function initAdmin() {
    var addBtn = document.getElementById('admin-add-user-btn');
    var cancelBtn = document.getElementById('admin-cancel-btn');
    var form = document.getElementById('admin-user-form');
    var formWrap = document.getElementById('admin-user-form-wrap');

    if (addBtn) {
      addBtn.addEventListener('click', function () { openUserForm(null); });
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        if (formWrap) formWrap.classList.add('hidden');
      });
    }
    var isAdminCb = document.getElementById('admin-is-admin');
    if (isAdminCb) {
      isAdminCb.addEventListener('change', toggleAdminModuleCheckboxes);
    }
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var userId = (document.getElementById('admin-user-id') || {}).value.trim();
        var username = (document.getElementById('admin-username') || {}).value.trim().toLowerCase();
        var password = (document.getElementById('admin-password') || {}).value;
        var displayName = (document.getElementById('admin-displayname') || {}).value.trim();
        var isAdmin = (document.getElementById('admin-is-admin') || {}).checked;
        var allowedModules = [];
        document.querySelectorAll('input[name="admin-module"]:checked').forEach(function (cb) {
          if (!cb.disabled) allowedModules.push(cb.value);
        });

        if (!username || !displayName) return;
        var users = getUsers();

        if (usesServerAuth()) {
          if (!userId && !password) return;
          fetchJson('/api/users', {
            method: 'POST',
            body: JSON.stringify({
              id: userId || undefined,
              username: username,
              displayName: displayName,
              isAdmin: isAdmin,
              allowedModules: isAdmin ? MODULE_IDS.slice() : allowedModules,
              password: password || undefined
            })
          }).then(function (out) {
            if (!out.res.ok) {
              alert((out.json && out.json.error) || 'Could not save user.');
              return;
            }
            if (out.json && Array.isArray(out.json.users)) saveUsers(out.json.users);
            formWrap.classList.add('hidden');
            form.reset();
            renderAdminUserList();
          }).catch(function () {
            alert('Could not save user. Try again.');
          });
          return;
        }

        if (userId) {
          var user = users.filter(function (u) { return u.id === userId; })[0];
          if (!user) return;
          if (user.isAdmin && !isAdmin) {
            var otherAdmins = users.filter(function (u) { return u.isAdmin && u.id !== userId; });
            if (otherAdmins.length === 0) {
              alert('You cannot remove the last administrator. At least one admin is required.');
              return;
            }
          }
          user.displayName = displayName;
          user.isAdmin = isAdmin;
          user.allowedModules = isAdmin ? MODULE_IDS.slice() : allowedModules;
          if (password) {
            hashPassword(password).then(function (passwordHash) {
              user.passwordHash = passwordHash;
              saveUsers(users);
              formWrap.classList.add('hidden');
              renderAdminUserList();
            });
          } else {
            saveUsers(users);
            formWrap.classList.add('hidden');
            renderAdminUserList();
          }
        } else {
          if (!password) return;
          var existing = users.some(function (u) { return u.username === username; });
          if (existing) {
            alert('A user with this username already exists.');
            return;
          }
          hashPassword(password).then(function (passwordHash) {
            var newUser = {
              id: 'u' + Date.now(),
              username: username,
              passwordHash: passwordHash,
              displayName: displayName,
              isAdmin: isAdmin,
              allowedModules: isAdmin ? MODULE_IDS.slice() : allowedModules
            };
            users.push(newUser);
            saveUsers(users);
            formWrap.classList.add('hidden');
            form.reset();
            renderAdminUserList();
          });
        }
      });
    }
  }

  function initFileProtocolLinkGuard() {
    if (!isFileProtocol()) return;
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href]');
      if (!a) return;
      var href = a.getAttribute('href');
      if (href === '#' || (href && href.charAt(0) === '#')) {
        e.preventDefault();
      }
    }, true);
  }

  function initEmbeddedFileBlocker() {
    if (!isEmbeddedPreview()) return;
    var el = document.getElementById('embedded-file-blocker');
    if (el) el.classList.remove('hidden');
    document.body.classList.add('embedded-file-blocked');
  }

  function initNavigation() {
    if (!isFileProtocol()) {
      window.addEventListener('hashchange', function () { route(); });
    }
    initFileProtocolLinkGuard();

    document.addEventListener('click', function (e) {
      var loginBtn = e.target.closest('[data-go-login], #lms-public-login-btn, #lms-careers-login-btn');
      if (loginBtn) {
        e.preventDefault();
        navigateTo('login');
        return;
      }
      var publicLink = e.target.closest('a[href="#lms-public"], a[href="#lms-careers"], a[href="#login"], a[href="#lms-portal"]');
      if (!publicLink) return;
      e.preventDefault();
      var target = (publicLink.getAttribute('href') || '').slice(1).toLowerCase();
      navigateTo(target || 'login');
    });

    var appScreen = document.getElementById('app-screen');
    if (appScreen) {
      appScreen.addEventListener('click', function (e) {
        var link = e.target.closest('a[href="#home"]');
        if (link) {
          e.preventDefault();
          navigateTo('home');
        }
      });
    }

    document.querySelectorAll('.module-card').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        var href = el.getAttribute('href');
        if (!href || href.indexOf('#') !== 0) return;
        var targetModule = href.slice(1).toLowerCase();
        var session = getSession();
        if (!session) return;
        if (targetModule === 'admin' || targetModule === 'settings') {
          if (!session.isAdmin) return;
        } else if (MODULE_IDS.indexOf(targetModule) !== -1 && !canAccessModule(session, targetModule)) {
          return;
        }
        navigateTo(targetModule);
      });
    });

    document.getElementById('main-content').addEventListener('click', function (e) {
      var backLink = e.target.closest('a.module-back[href="#home"]');
      if (backLink) {
        e.preventDefault();
        navigateTo('home');
        return;
      }
      var payrollSubTab = e.target.closest('.payroll-sub-tab[data-payroll-sub]');
      if (payrollSubTab) {
        e.preventDefault();
        if (typeof window.setPayrollSubsection === 'function') window.setPayrollSubsection(payrollSubTab.getAttribute('data-payroll-sub'));
        return;
      }
    });

    initSidebarDelegation();
  }

  function setSidebarOpen(open) {
    var sidebar = document.getElementById('sidebar');
    var backdrop = document.getElementById('sidebar-backdrop');
    var toggle = document.getElementById('menu-toggle');
    if (!sidebar) return;
    sidebar.classList.toggle('open', !!open);
    document.body.classList.toggle('sidebar-open', !!open);
    if (backdrop) {
      if (open) backdrop.removeAttribute('hidden');
      else backdrop.setAttribute('hidden', '');
    }
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function initMenuToggle() {
    var toggle = document.getElementById('menu-toggle');
    var sidebar = document.getElementById('sidebar');
    var backdrop = document.getElementById('sidebar-backdrop');
    if (toggle && sidebar) {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.addEventListener('click', function () {
        setSidebarOpen(!sidebar.classList.contains('open'));
      });
    }
    if (backdrop) {
      backdrop.addEventListener('click', function () {
        setSidebarOpen(false);
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setSidebarOpen(false);
    });
    if (sidebar) {
      sidebar.addEventListener('click', function (e) {
        var link = e.target.closest('a.nav-item, a[href^="#"]');
        if (link) setSidebarOpen(false);
      });
    }
    window.addEventListener('hashchange', function () {
      setSidebarOpen(false);
    });
  }

  function initFileProtocolBanner() {
    if (!isFileProtocol()) return;
    var banner = document.getElementById('file-protocol-banner');
    if (!banner) return;
    banner.classList.remove('hidden');
    var dismiss = document.getElementById('file-protocol-banner-dismiss');
    if (dismiss) {
      dismiss.addEventListener('click', function () {
        banner.classList.add('hidden');
      });
    }
  }

  function init() {
    initSetup();
    initLogin();
    initPasswordToggle();
    initLogout();
    initProfileMenu();
    initAdmin();
    initNavigation();
    initMenuToggle();
    initFileProtocolBanner();
    initEmbeddedFileBlocker();
    if (isEmbeddedPreview()) return;

    function showAuthScreen() {
      var initialRoute = getRoutePageId();
      if (isPublicPage(initialRoute)) {
        openPublicPage(initialRoute);
        return;
      }

      var ds = window.AccountingData;
      var cloudAuth = usesCloudLogin();
      configureUnifiedLoginUI(cloudAuth);

      if (cloudAuth) {
        if (ds && ds.isSupabaseMode && ds.isSupabaseMode()) {
          if (getSession()) {
            startApp();
            return;
          }
          createCrmSessionFromSupabase().then(function (ok) {
            if (ok) startApp();
            else showScreen('login-screen');
          });
          return;
        }
        showScreen('login-screen');
        return;
      }

      if (usesServerAuth()) {
        fetchJson('/api/session', { method: 'GET', headers: {} }).then(function (out) {
          if (out.json && out.json.hasUsers === false) {
            clearSession();
            showScreen('setup-screen');
            return null;
          }
          var serverSession = out.json && out.json.session;
          if (!serverSession) {
            clearSession();
            showScreen('login-screen');
            return null;
          }
          setSession(serverSession);
          if (ds && typeof ds.loadWorkspace === 'function') {
            return ds.loadWorkspace().then(function () {
              if (typeof ds.notifyModulesDataLoaded === 'function') ds.notifyModulesDataLoaded();
              if (serverSession.isAdmin) return refreshUsersFromServer();
            }).then(function () {
              startApp();
            });
          }
          startApp();
          return null;
        }).catch(function () {
          clearSession();
          showScreen('login-screen');
        });
        return;
      }

      var users = getUsers();
      var session = getSession();
      if (users.length === 0) {
        showScreen('setup-screen');
      } else if (!session) {
        showScreen('login-screen');
      } else {
        startApp();
      }
    }

    if (window.AccountingData && typeof window.AccountingData.init === 'function') {
      Promise.resolve(window.AccountingData.init()).then(showAuthScreen).catch(showAuthScreen);
    } else {
      showAuthScreen();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.AndecoUsers = {
    getUsers: getUsers,
    saveUsers: saveUsers,
    hashPassword: hashPassword,
    modules: MODULES.filter(function (m) { return m.id !== 'settings'; }),
    allModuleIds: MODULE_IDS.slice(),
    syncSessionIfCurrent: function (user) {
      var session = getSession();
      if (!session || !user || session.userId !== user.id) return;
      session.displayName = user.displayName;
      session.username = user.username;
      session.isAdmin = user.isAdmin === true;
      session.allowedModules = user.isAdmin ? MODULE_IDS.slice() : (user.allowedModules || []).slice();
      setSession(session);
      refreshHeaderUser(session);
      applyVisibility(session);
    }
  };
})();
