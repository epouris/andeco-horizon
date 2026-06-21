/**
 * Module navigation — sidebar = main sections, horizontal bar = subsections per section.
 * Extend MODULE_SUBSECTIONS in app.js when adding new screens.
 */
(function () {
  'use strict';

  var SUBSECTION_STORAGE_PREFIX = 'andeco_crm_subsection_';

  /** @type {Object<string, Object<string, Array<{id:string, label:string}>>>} */
  var MODULE_SUBSECTIONS = {
    accounting: {
      dashboard: [
        { id: 'overview', label: 'Overview' },
        { id: 'charts', label: 'Charts & KPIs' }
      ],
      invoices: [
        { id: 'list', label: 'Invoice list' },
        { id: 'drafts', label: 'Drafts' },
        { id: 'recurring', label: 'Recurring' }
      ],
      receipts: [
        { id: 'list', label: 'Receipt list' },
        { id: 'unmatched', label: 'Unmatched' }
      ],
      payroll: [
        { id: 'ytd', label: 'Year to date' },
        { id: 'payslip', label: 'Generate payslip' },
        { id: 'payslips', label: 'Payslip management' }
      ],
      'social-insurance': [
        { id: 'overview', label: 'Overview' },
        { id: 'monthly', label: 'Monthly return' }
      ],
      reports: [
        { id: 'statements', label: 'Statements' },
        { id: 'exports', label: 'Exports' }
      ]
    },
    clients: {
      list: [
        { id: 'directory', label: 'Client directory' },
        { id: 'segments', label: 'Segments' },
        { id: 'import', label: 'Import / export' }
      ]
    },
    fleet: {
      dashboard: [
        { id: 'summary', label: 'Summary' },
        { id: 'alerts', label: 'Alerts & compliance' }
      ],
      vessels: [
        { id: 'list', label: 'Vessel list' },
        { id: 'compare', label: 'Compare vessels' }
      ]
    },
    hr: {
      employees: [
        { id: 'list', label: 'Employee list' },
        { id: 'contracts', label: 'Employee contracts' },
        { id: 'cv', label: 'Employee CV' }
      ],
      overview: [
        { id: 'summary', label: 'Summary' },
        { id: 'metrics', label: 'Metrics' },
        { id: 'details', label: 'Details' }
      ],
      payroll: [
        { id: 'overview', label: 'Overview' },
        { id: 'ir63', label: 'IR63 Form' }
      ],
      history: [
        { id: 'audit', label: 'Audit trail' },
        { id: 'changes', label: 'Change log' }
      ]
    },
    crew: {
      roster: [
        { id: 'list', label: 'Crew roster' },
        { id: 'documents', label: 'Documents' },
        { id: 'assignments', label: 'Vessel assignments' }
      ]
    },
    shifts: {
      dashboard: [
        { id: 'summary', label: 'Summary' },
        { id: 'alerts', label: 'Conflicts & alerts' },
        { id: 'today', label: 'Away today' }
      ],
      calendar: [
        { id: 'month', label: 'Month view' },
        { id: 'week', label: 'Week view' }
      ],
      'log-shifts': [
        { id: 'log', label: 'Shift log' },
        { id: 'bulk', label: 'Bulk entry' }
      ],
      requests: [
        { id: 'all', label: 'All requests' },
        { id: 'pending', label: 'Pending approval' }
      ],
      hours: [
        { id: 'monthly', label: 'Monthly totals' },
        { id: 'export', label: 'Export' }
      ],
      availability: [
        { id: 'daily', label: 'Daily view' },
        { id: 'team', label: 'Team grid' }
      ],
      settings: [
        { id: 'team', label: 'Team members' },
        { id: 'policies', label: 'Policies & holidays' }
      ]
    },
    documents: {
      overview: [
        { id: 'summary', label: 'Summary' },
        { id: 'recent', label: 'Recent documents' }
      ],
      folders: [
        { id: 'tree', label: 'Folder tree' },
        { id: 'permissions', label: 'Permissions' }
      ],
      history: [
        { id: 'revisions', label: 'Revisions' },
        { id: 'audit', label: 'Audit log' }
      ]
    },
    contacts: {
      overview: [
        { id: 'profile', label: 'Contact profile' },
        { id: 'related', label: 'Related records' }
      ],
      activities: [
        { id: 'timeline', label: 'Activity timeline' },
        { id: 'tasks', label: 'Tasks' }
      ],
      history: [
        { id: 'log', label: 'History log' },
        { id: 'communications', label: 'Communications' }
      ]
    },
    settings: {
      company: [
        { id: 'profile', label: 'Company profile' },
        { id: 'branding', label: 'Branding' }
      ],
      accounting: [
        { id: 'defaults', label: 'Defaults' },
        { id: 'backup', label: 'Backup & restore' }
      ]
    }
  };

  var SECTION_PANEL_SELECTORS = {
    hr: '.hr-section-panel[data-section]',
    shifts: '.shifts-section-panel[data-section]',
    settings: '.settings-section-panel[data-section]',
    fleet: '.fleet-section-panel[data-section]',
    documents: '.docs-section-panel[data-section]',
    contacts: '.contacts-section-panel[data-section]',
    clients: '.clients-section-panel[data-section]',
    crew: '.crew-section-panel[data-section]',
    accounting: '.accounting-section-panel[data-section]'
  };

  function escapeHtml(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function getSubsections(moduleId, sectionId) {
    var mod = MODULE_SUBSECTIONS[moduleId];
    if (!mod || !mod[sectionId]) return [];
    return mod[sectionId].slice();
  }

  function subsectionStorageKey(moduleId, sectionId) {
    return SUBSECTION_STORAGE_PREFIX + moduleId + '_' + sectionId;
  }

  function getSavedSubsection(moduleId, sectionId) {
    try {
      return sessionStorage.getItem(subsectionStorageKey(moduleId, sectionId)) || '';
    } catch (e) {
      return '';
    }
  }

  function saveSubsection(moduleId, sectionId, subsectionId) {
    try {
      sessionStorage.setItem(subsectionStorageKey(moduleId, sectionId), subsectionId);
    } catch (e) {}
  }

  function getSectionPanel(page, moduleId, sectionId) {
    if (!page) return null;
    var sel = SECTION_PANEL_SELECTORS[moduleId];
    if (sel) {
      return page.querySelector(sel.replace('[data-section]', '[data-section="' + sectionId + '"]'));
    }
    return page.querySelector('[data-section="' + sectionId + '"]');
  }

  function placeholderHtml(label) {
    return '<div class="module-subsection-placeholder"><p><strong>' + escapeHtml(label) +
      '</strong></p><p class="module-meta">This subsection is reserved for future development.</p></div>';
  }

  function ensureSubsectionPanels(panel, moduleId, sectionId) {
    if (!panel || panel.getAttribute('data-subsections-ready') === '1') return;
    var subs = getSubsections(moduleId, sectionId);
    if (!subs.length) {
      panel.setAttribute('data-subsections-ready', '1');
      return;
    }

    var existing = panel.querySelectorAll(':scope > .module-subsection-panel');
    if (!existing.length) {
      var wrapper = document.createElement('div');
      wrapper.className = 'module-subsection-panel active';
      wrapper.setAttribute('data-subsection', subs[0].id);
      while (panel.firstChild) {
        wrapper.appendChild(panel.firstChild);
      }
      panel.appendChild(wrapper);
      for (var i = 1; i < subs.length; i++) {
        var ph = document.createElement('div');
        ph.className = 'module-subsection-panel';
        ph.setAttribute('data-subsection', subs[i].id);
        ph.innerHTML = placeholderHtml(subs[i].label);
        panel.appendChild(ph);
      }
    } else {
      subs.forEach(function (sub) {
        if (!panel.querySelector(':scope > .module-subsection-panel[data-subsection="' + sub.id + '"]')) {
          var el = document.createElement('div');
          el.className = 'module-subsection-panel';
          el.setAttribute('data-subsection', sub.id);
          el.innerHTML = placeholderHtml(sub.label);
          panel.appendChild(el);
        }
      });
    }
    panel.setAttribute('data-subsections-ready', '1');
  }

  function prepareModulePage(moduleId) {
    var page = document.getElementById('page-' + moduleId);
    if (!page || page.getAttribute('data-subsections-prepared') === '1') return;
    page.setAttribute('data-subsections-prepared', '1');
    var sel = SECTION_PANEL_SELECTORS[moduleId];
    if (!sel) return;
    page.querySelectorAll(sel).forEach(function (panel) {
      var sectionId = panel.getAttribute('data-section');
      if (sectionId) ensureSubsectionPanels(panel, moduleId, sectionId);
    });
  }

  function renderSubtabs(moduleId, sectionId) {
    var nav = document.getElementById('module-subtabs-' + moduleId);
    if (!nav) return '';
    prepareModulePage(moduleId);
    var subs = getSubsections(moduleId, sectionId);
    if (!subs.length) {
      nav.hidden = true;
      nav.innerHTML = '';
      return subs[0] ? subs[0].id : '';
    }
    nav.hidden = false;
    var saved = getSavedSubsection(moduleId, sectionId);
    var activeId = subs.some(function (s) { return s.id === saved; }) ? saved : subs[0].id;
    nav.innerHTML = subs.map(function (sub) {
      return '<a href="#" class="module-subtab' + (sub.id === activeId ? ' active' : '') +
        '" data-subsection="' + escapeHtml(sub.id) + '">' + escapeHtml(sub.label).toUpperCase() + '</a>';
    }).join('');
    return activeId;
  }

  function applySubsectionPanels(moduleId, sectionId, subsectionId) {
    var page = document.getElementById('page-' + moduleId);
    var panel = getSectionPanel(page, moduleId, sectionId);
    if (!panel) return;
    ensureSubsectionPanels(panel, moduleId, sectionId);
    panel.querySelectorAll(':scope > .module-subsection-panel').forEach(function (sp) {
      sp.classList.toggle('active', sp.getAttribute('data-subsection') === subsectionId);
    });
  }

  function syncSubtabUi(moduleId, subsectionId) {
    var nav = document.getElementById('module-subtabs-' + moduleId);
    if (!nav) return;
    nav.querySelectorAll('.module-subtab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-subsection') === subsectionId);
    });
  }

  function runSubsectionHooks(moduleId, sectionId, subsectionId) {
    if (moduleId === 'accounting' && sectionId === 'payroll') {
      if (typeof window.setPayrollSubsection === 'function') window.setPayrollSubsection(subsectionId);
    }
    if (moduleId === 'accounting' && sectionId === 'social-insurance') {
      if (typeof window.setSocialInsuranceSubsection === 'function') window.setSocialInsuranceSubsection(subsectionId);
    }
    if (moduleId === 'hr' && sectionId === 'employees' && subsectionId === 'list') {
      if (typeof window.hrEmployeesLoad === 'function') window.hrEmployeesLoad();
    }
    if (moduleId === 'hr' && sectionId === 'payroll' && subsectionId === 'ir63') {
      if (typeof window.updateEmployeeDropdowns === 'function') window.updateEmployeeDropdowns();
    }
    if (moduleId === 'shifts' && typeof window.ShiftsManagement !== 'undefined') {
      if (window.ShiftsManagement.onSubsectionChange) window.ShiftsManagement.onSubsectionChange(sectionId, subsectionId);
      if (window.ShiftsManagement.render) window.ShiftsManagement.render();
    }
    if (moduleId === 'clients' && typeof window.ClientsModule !== 'undefined' && window.ClientsModule.render) {
      window.ClientsModule.render();
    }
  }

  function setAccountingSubsectionOverlay(moduleId, sectionId, subsectionId) {
    if (moduleId !== 'accounting') return false;
    if (sectionId === 'payroll') return false;
    if (sectionId === 'social-insurance') return false;
    var subs = getSubsections('accounting', sectionId);
    if (!subs.length) return false;
    var primaryId = subs[0].id;
    var isPrimary = subsectionId === primaryId;
    var overlay = document.getElementById('accounting-subsection-overlay');
    if (!overlay) return false;
    overlay.style.display = isPrimary ? 'none' : 'block';
    if (!isPrimary) {
      var label = (subs.filter(function (s) { return s.id === subsectionId; })[0] || {}).label || subsectionId;
      overlay.innerHTML = placeholderHtml(label);
      hideAccountingMainBlocks();
    } else if (typeof window.andecoRefreshAccountingSection === 'function') {
      window.andecoRefreshAccountingSection(sectionId);
    }
    return !isPrimary;
  }

  function hideAccountingMainBlocks() {
    var appEl = document.getElementById('accounting-invoice-app');
    var placeholder = document.querySelector('#page-accounting .accounting-placeholder');
    var reportsContent = document.getElementById('accounting-reports-content');
    var payrollContent = document.getElementById('accounting-payroll-content');
    var siContent = document.getElementById('accounting-social-insurance-content');
    if (appEl) appEl.style.display = 'none';
    if (placeholder) placeholder.style.display = 'none';
    if (reportsContent) reportsContent.style.display = 'none';
    if (payrollContent) payrollContent.style.display = 'none';
    if (siContent) siContent.style.display = 'none';
  }

  function setSubsection(moduleId, sectionId, subsectionId, skipSave) {
    if (!subsectionId) return;
    prepareModulePage(moduleId);
    var subs = getSubsections(moduleId, sectionId);
    if (!subs.some(function (s) { return s.id === subsectionId; })) {
      subsectionId = subs.length ? subs[0].id : subsectionId;
    }
    var usingOverlay = setAccountingSubsectionOverlay(moduleId, sectionId, subsectionId);
    if (!usingOverlay) {
      applySubsectionPanels(moduleId, sectionId, subsectionId);
    }
    syncSubtabUi(moduleId, subsectionId);
    if (!skipSave) saveSubsection(moduleId, sectionId, subsectionId);
    runSubsectionHooks(moduleId, sectionId, subsectionId);
  }

  function activateSection(moduleId, sectionId) {
    prepareModulePage(moduleId);
    var activeSub = renderSubtabs(moduleId, sectionId);
    if (activeSub) setSubsection(moduleId, sectionId, activeSub, true);
  }

  function initClickHandlers() {
    document.addEventListener('click', function (e) {
      var tab = e.target.closest('.module-subtab[data-subsection]');
      if (!tab) return;
      e.preventDefault();
      var nav = tab.closest('.module-subtabs');
      if (!nav || !nav.id) return;
      var moduleId = nav.id.replace('module-subtabs-', '');
      var page = document.getElementById('page-' + moduleId);
      if (!page || !page.classList.contains('active')) return;
      var sectionId = nav.getAttribute('data-active-section') || '';
      if (!sectionId) return;
      setSubsection(moduleId, sectionId, tab.getAttribute('data-subsection'));
    });
  }

  window.AndecoModuleNav = {
    MODULE_SUBSECTIONS: MODULE_SUBSECTIONS,
    getSubsections: getSubsections,
    prepareModulePage: prepareModulePage,
    renderSubtabs: renderSubtabs,
    setSubsection: setSubsection,
    activateSection: activateSection,
    setActiveSectionOnSubtabs: function (moduleId, sectionId) {
      var nav = document.getElementById('module-subtabs-' + moduleId);
      if (nav) nav.setAttribute('data-active-section', sectionId || '');
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initClickHandlers);
  } else {
    initClickHandlers();
  }
})();
