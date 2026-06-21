/**
 * Andeco Horizon CRM — Login required. Users and module access managed by administrator.
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
    try {
      window.location.hash = pageId;
    } catch (err) {
      route(pageId);
    }
  }

  var MODULES = [
    { id: 'accounting', name: 'Accounting' },
    { id: 'clients', name: 'Clients' },
    { id: 'fleet', name: 'Fleet Management' },
    { id: 'hr', name: 'HR' },
    { id: 'crew', name: 'Crew Management' },
    { id: 'shifts', name: 'Shifts' },
    { id: 'documents', name: 'Document ISO' },
    { id: 'contacts', name: 'Contacts' },
    { id: 'settings', name: 'Settings' }
  ];

  var MODULE_IDS = MODULES.map(function (m) { return m.id; });

  var MODULE_SECTIONS = {
    accounting: [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'invoices', label: 'Invoices' },
      { id: 'receipts', label: 'Receipts' },
      { id: 'payroll', label: 'Payroll' },
      { id: 'social-insurance', label: 'Social Insurance' },
      { id: 'reports', label: 'Reports' }
    ],
    fleet: [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'vessels', label: 'Vessels' }
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
    settings: [
      { id: 'company', label: 'Company Information' },
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

  function hashPassword(password) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
      .then(function (buf) {
        return Array.from(new Uint8Array(buf))
          .map(function (b) { return b.toString(16).padStart(2, '0'); })
          .join('');
      });
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
      s.classList.toggle('hidden', s.id !== id);
    });
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
    if (currentModulePageId !== 'accounting' || !appEl || !placeholder) return;
    if (reportsContent) reportsContent.style.display = 'none';
    var siPanel = document.getElementById('accounting-social-insurance-content');
    if (sectionId === 'reports') {
      appEl.style.display = 'none';
      placeholder.style.display = 'none';
      if (reportsContent) reportsContent.style.display = 'block';
      if (document.getElementById('accounting-payroll-content')) document.getElementById('accounting-payroll-content').style.display = 'none';
      if (siPanel) siPanel.style.display = 'none';
      try { if (window.app && window.app.setupStatementForm) window.app.setupStatementForm(); } catch (err) {}
    } else if (sectionId === 'dashboard' || sectionId === 'invoices' || sectionId === 'receipts') {
      appEl.style.display = 'block';
      placeholder.style.display = 'none';
      if (document.getElementById('accounting-payroll-content')) document.getElementById('accounting-payroll-content').style.display = 'none';
      if (siPanel) siPanel.style.display = 'none';
      try { if (window.app && window.app.showPage) window.app.showPage(sectionId); } catch (err) {}
    } else if (sectionId === 'payroll') {
      appEl.style.display = 'none';
      placeholder.style.display = 'none';
      if (reportsContent) reportsContent.style.display = 'none';
      var payrollContent = document.getElementById('accounting-payroll-content');
      if (payrollContent) payrollContent.style.display = 'block';
      var siContentHide = document.getElementById('accounting-social-insurance-content');
      if (siContentHide) siContentHide.style.display = 'none';
    } else if (sectionId === 'social-insurance') {
      appEl.style.display = 'none';
      placeholder.style.display = 'none';
      if (reportsContent) reportsContent.style.display = 'none';
      if (document.getElementById('accounting-payroll-content')) document.getElementById('accounting-payroll-content').style.display = 'none';
      var siContent = document.getElementById('accounting-social-insurance-content');
      if (siContent) siContent.style.display = 'block';
    } else {
      appEl.style.display = 'none';
      placeholder.style.display = 'block';
      if (document.getElementById('accounting-payroll-content')) document.getElementById('accounting-payroll-content').style.display = 'none';
      var siContentOff = document.getElementById('accounting-social-insurance-content');
      if (siContentOff) siContentOff.style.display = 'none';
    }
    var overlay = document.getElementById('accounting-subsection-overlay');
    if (overlay) overlay.style.display = 'none';
    try { if (window.app && window.app.setupStatementForm) window.app.setupStatementForm(); } catch (e) {}
  }
  window.andecoRefreshAccountingSection = showAccountingSectionContent;

  function setGenericSectionPanels(pageSelector, panelSelector, sectionId) {
    document.querySelectorAll(pageSelector + ' ' + panelSelector).forEach(function (p) {
      var match = p.getAttribute('data-section') === sectionId;
      if (p.classList.contains('shifts-section-panel')) {
        p.classList.toggle('active', match);
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
    syncSettingsFormFields(sectionId);
    if (sectionId === 'payroll' && typeof window.loadCompanySettings === 'function') window.loadCompanySettings();
    if (window.AndecoModuleNav) {
      window.AndecoModuleNav.setActiveSectionOnSubtabs('settings', sectionId);
      window.AndecoModuleNav.activateSection('settings', sectionId);
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
      hr: 'HR',
      crew: 'Crew Management',
      shifts: 'Shifts',
      documents: 'Document ISO',
      contacts: 'Contacts',
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

  function route(forcedPageId) {
    var pageId = forcedPageId != null ? String(forcedPageId).toLowerCase() : getRoutePageId();
    if (!pageId) pageId = 'home';
    var session = getSession();
    if (!session) return;

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
    } else {
      showPage('home');
    }
  }

  function usesCloudLogin() {
    if (isFileProtocol()) return false;
    var ds = window.AccountingData;
    return !!(ds && typeof ds.isSupabaseConfigured === 'function' && ds.isSupabaseConfigured());
  }

  function configureUnifiedLoginUI(cloudAuth) {
    var loginSubtitle = document.querySelector('#login-screen .login-brand p');
    var usernameLabel = document.querySelector('label[for="login-username"]');
    var usernameInput = document.getElementById('login-username');
    var supabasePanel = document.getElementById('supabase-cloud-panel');
    var setupSupabasePanel = document.getElementById('setup-supabase-cloud-panel');
    if (cloudAuth) {
      if (loginSubtitle) loginSubtitle.textContent = 'Sign in with your company email';
      if (usernameLabel) usernameLabel.textContent = 'Email';
      if (usernameInput) {
        usernameInput.type = 'email';
        usernameInput.placeholder = 'you@company.com';
        usernameInput.autocomplete = 'email';
      }
      if (supabasePanel) supabasePanel.classList.add('hidden');
      if (setupSupabasePanel) setupSupabasePanel.classList.add('hidden');
    } else {
      if (loginSubtitle) loginSubtitle.textContent = 'Company CRM';
      if (usernameLabel) usernameLabel.textContent = 'Username';
      if (usernameInput) {
        usernameInput.type = 'text';
        usernameInput.placeholder = 'Enter username';
        usernameInput.autocomplete = 'username';
      }
    }
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
      });
    });
  }

  function startApp() {
    var session = getSession();
    if (!session) return;
    showScreen('app-screen');
    var badge = document.getElementById('user-badge');
    if (badge) badge.textContent = session.displayName || session.username;
    var initial = document.getElementById('avatar-initial');
    var name = session.displayName || session.username || '';
    if (initial) initial.textContent = name.charAt(0) ? name.charAt(0).toUpperCase() : 'U';
    applyVisibility(session);
    route();
  }

  function initLogout() {
    var btn = document.getElementById('logout-btn');
    if (btn) {
      btn.addEventListener('click', function () {
        var ds = window.AccountingData;
        var signOutPromise = (ds && typeof ds.signOutFromSupabase === 'function')
          ? ds.signOutFromSupabase()
          : Promise.resolve();
        signOutPromise.finally(function () {
          clearSession();
          document.body.classList.remove('home-view');
          if (usesCloudLogin()) {
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

  function initMenuToggle() {
    var toggle = document.getElementById('menu-toggle');
    var sidebar = document.getElementById('sidebar');
    if (toggle && sidebar) {
      toggle.addEventListener('click', function () {
        sidebar.classList.toggle('open');
      });
    }
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
    initLogout();
    initAdmin();
    initNavigation();
    initMenuToggle();
    initFileProtocolBanner();
    initEmbeddedFileBlocker();
    if (isEmbeddedPreview()) return;

    function showAuthScreen() {
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
})();
