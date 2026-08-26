/**
 * Report Management — service operation reports with status workflow:
 * Pending → Scanned → Invoiced → Sent
 */
(function () {
  'use strict';

  var STATUS_ORDER = ['pending', 'scanned', 'invoiced', 'sent'];
  var STATUS_LABELS = {
    pending: 'Pending',
    scanned: 'Scanned',
    invoiced: 'Invoiced',
    sent: 'Sent'
  };
  var NEXT_ACTION_LABELS = {
    pending: 'Scanned',
    scanned: 'Invoiced',
    invoiced: 'Sent',
    sent: 'Sent'
  };

  var currentEditId = null;
  var listFilter = '';

  function getDataStore() {
    return window.DataStore || window.AccountingData;
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var div = document.createElement('div');
    div.textContent = String(s);
    return div.innerHTML;
  }

  function generateId() {
    return 'sr' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  function getReports() {
    var store = getDataStore();
    if (store && store.getServiceReports) return store.getServiceReports() || [];
    return [];
  }

  function normalizeStatus(status) {
    var s = String(status || 'pending').toLowerCase();
    return STATUS_ORDER.indexOf(s) !== -1 ? s : 'pending';
  }

  function nextStatus(status) {
    var idx = STATUS_ORDER.indexOf(normalizeStatus(status));
    if (idx < 0 || idx >= STATUS_ORDER.length - 1) return null;
    return STATUS_ORDER[idx + 1];
  }

  function getClientName(clientId) {
    var store = getDataStore();
    if (!store || !store.getClient || !clientId) return '—';
    var client = store.getClient(clientId);
    if (!client) return '—';
    if (store.getClientCompanyName) return store.getClientCompanyName(client) || '—';
    return client.name || client.company || '—';
  }

  function getEmployeeName(employeeId) {
    if (!employeeId) return '—';
    var employees = [];
    try {
      if (typeof window.getEmployeesList === 'function') {
        employees = window.getEmployeesList() || [];
      } else {
        var raw = localStorage.getItem('employees');
        employees = raw ? JSON.parse(raw) : [];
      }
    } catch (e) {
      employees = [];
    }
    if (!Array.isArray(employees)) return String(employeeId);
    for (var i = 0; i < employees.length; i++) {
      var emp = employees[i];
      if (!emp) continue;
      if (String(emp.employeeId) === String(employeeId) || String(emp.id) === String(employeeId)) {
        var name = ((emp.firstName || '') + ' ' + (emp.lastName || '')).trim();
        return name || String(employeeId);
      }
    }
    return String(employeeId);
  }

  function formatDate(value) {
    if (!value) return '—';
    try {
      var d = new Date(value);
      if (isNaN(d.getTime())) return '—';
      if (window.AndecoDate && window.AndecoDate.formatDate) return window.AndecoDate.formatDate(d);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) {
      return '—';
    }
  }

  function populateClientSelect(selectedId) {
    var select = document.getElementById('report-form-client');
    if (!select) return;
    var store = getDataStore();
    var clients = store && store.getClients ? store.getClients() : [];
    if (!Array.isArray(clients)) clients = [];
    select.innerHTML = '<option value="">-- Select client --</option>';
    clients.slice().sort(function (a, b) {
      var an = store && store.getClientCompanyName ? store.getClientCompanyName(a) : ((a && a.name) || '');
      var bn = store && store.getClientCompanyName ? store.getClientCompanyName(b) : ((b && b.name) || '');
      return String(an).localeCompare(String(bn));
    }).forEach(function (client) {
      if (!client || !client.id) return;
      var opt = document.createElement('option');
      opt.value = client.id;
      opt.textContent = store && store.getClientOptionLabel
        ? store.getClientOptionLabel(client)
        : (client.name || client.company || 'Client');
      select.appendChild(opt);
    });
    if (selectedId) select.value = selectedId;
  }

  function populateEmployeeSelect(selectedId) {
    var select = document.getElementById('report-form-employee');
    if (!select) return;
    var employees = [];
    try {
      if (typeof window.getEmployeesList === 'function') {
        employees = window.getEmployeesList() || [];
      } else {
        var raw = localStorage.getItem('employees');
        employees = raw ? JSON.parse(raw) : [];
      }
    } catch (e) {
      employees = [];
    }
    if (!Array.isArray(employees)) employees = [];
    select.innerHTML = '<option value="">-- Select employee --</option>';
    employees.slice().sort(function (a, b) {
      var an = ((a && a.firstName) || '') + ' ' + ((a && a.lastName) || '');
      var bn = ((b && b.firstName) || '') + ' ' + ((b && b.lastName) || '');
      return an.localeCompare(bn);
    }).forEach(function (emp) {
      if (!emp || !emp.employeeId) return;
      var opt = document.createElement('option');
      opt.value = emp.employeeId;
      opt.textContent = ((emp.firstName || '') + ' ' + (emp.lastName || '')).trim() +
        ' (' + emp.employeeId + ')';
      select.appendChild(opt);
    });
    if (selectedId) select.value = selectedId;
  }

  function populateVesselDatalist() {
    var list = document.getElementById('report-vessel-datalist');
    if (!list) return;
    var names = {};
    try {
      if (window.FleetManagement && typeof window.FleetManagement.getVessels === 'function') {
        (window.FleetManagement.getVessels() || []).forEach(function (v) {
          if (v && v.name) names[String(v.name).trim()] = true;
        });
      } else {
        var raw = localStorage.getItem('andeco_fleet_vessels');
        var vessels = raw ? JSON.parse(raw) : [];
        if (Array.isArray(vessels)) {
          vessels.forEach(function (v) {
            if (v && v.name) names[String(v.name).trim()] = true;
          });
        }
      }
    } catch (e) {}
    getReports().forEach(function (r) {
      if (r && r.vessel) names[String(r.vessel).trim()] = true;
    });
    list.innerHTML = Object.keys(names).filter(Boolean).sort(function (a, b) {
      return a.localeCompare(b);
    }).map(function (name) {
      return '<option value="' + escapeHtml(name) + '"></option>';
    }).join('');
  }

  function showList() {
    var listWrap = document.getElementById('reports-list-wrap');
    var formWrap = document.getElementById('reports-form-wrap');
    if (listWrap) listWrap.style.display = '';
    if (formWrap) formWrap.style.display = 'none';
    currentEditId = null;
    render();
  }

  function todayInputDate() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function showForm(reportId) {
    var listWrap = document.getElementById('reports-list-wrap');
    var formWrap = document.getElementById('reports-form-wrap');
    var titleEl = document.getElementById('reports-form-title');
    var form = document.getElementById('report-form');
    if (formWrap) formWrap.style.display = 'block';
    if (listWrap) listWrap.style.display = 'none';
    currentEditId = reportId || null;
    if (form) form.reset();
    populateClientSelect();
    populateEmployeeSelect();
    populateVesselDatalist();
    if (titleEl) titleEl.textContent = reportId ? 'Edit Report' : 'Add Report';
    if (reportId) {
      var store = getDataStore();
      var report = store && store.getServiceReport ? store.getServiceReport(reportId) : null;
      if (report) {
        var noEl = document.getElementById('report-form-number');
        var dateEl = document.getElementById('report-form-date');
        var vesselEl = document.getElementById('report-form-vessel');
        var berthEl = document.getElementById('report-form-berth');
        var notesEl = document.getElementById('report-form-notes');
        if (noEl) {
          noEl.value = report.reportNo || '';
          noEl.readOnly = false;
          noEl.removeAttribute('readonly');
        }
        if (dateEl) dateEl.value = report.reportDate || '';
        if (vesselEl) vesselEl.value = report.vessel || '';
        if (berthEl) berthEl.value = report.berth || '';
        if (notesEl) notesEl.value = report.notes || '';
        populateClientSelect(report.clientId || '');
        populateEmployeeSelect(report.employeeId || '');
      }
    } else {
      var nextNoEl = document.getElementById('report-form-number');
      var dateNewEl = document.getElementById('report-form-date');
      var vesselNewEl = document.getElementById('report-form-vessel');
      var berthNewEl = document.getElementById('report-form-berth');
      var storeNew = getDataStore();
      var nextNo = storeNew && storeNew.getNextServiceReportNumber
        ? storeNew.getNextServiceReportNumber()
        : ('AMS/SUR/' + new Date().getFullYear() + '/001');
      if (nextNoEl) {
        nextNoEl.value = nextNo;
        nextNoEl.readOnly = true;
        nextNoEl.setAttribute('readonly', 'readonly');
      }
      if (dateNewEl) dateNewEl.value = todayInputDate();
      if (vesselNewEl) vesselNewEl.value = '';
      if (berthNewEl) berthNewEl.value = '';
    }
  }

  function saveReport(e) {
    if (e) e.preventDefault();
    var store = getDataStore();
    if (!store || !store.saveServiceReport) {
      alert('Unable to save report. Data store is not ready.');
      return;
    }
    var reportNo = ((document.getElementById('report-form-number') || {}).value || '').trim();
    var reportDate = ((document.getElementById('report-form-date') || {}).value || '').trim();
    var clientId = ((document.getElementById('report-form-client') || {}).value || '').trim();
    var employeeId = ((document.getElementById('report-form-employee') || {}).value || '').trim();
    var vessel = ((document.getElementById('report-form-vessel') || {}).value || '').trim();
    var berth = ((document.getElementById('report-form-berth') || {}).value || '').trim();
    var notes = ((document.getElementById('report-form-notes') || {}).value || '').trim();
    if (!currentEditId && store.getNextServiceReportNumber) {
      // Always assign the latest sequence on create so concurrent adds stay ordered.
      reportNo = store.getNextServiceReportNumber();
      var noField = document.getElementById('report-form-number');
      if (noField) noField.value = reportNo;
    }
    if (!reportNo) {
      alert('Report No. is required.');
      return;
    }
    if (!reportDate) {
      alert('Report Date is required.');
      return;
    }
    if (!clientId) {
      alert('Please select a client.');
      return;
    }
    if (!employeeId) {
      alert('Please select the employee who did the job.');
      return;
    }
    var existing = currentEditId && store.getServiceReport ? store.getServiceReport(currentEditId) : null;
    var duplicate = getReports().some(function (r) {
      return r && r.reportNo && String(r.reportNo).toLowerCase() === reportNo.toLowerCase() &&
        (!existing || r.id !== existing.id);
    });
    if (duplicate) {
      alert('A report with this Report No. already exists.');
      return;
    }
    var report = {
      id: existing ? existing.id : generateId(),
      reportNo: reportNo,
      reportDate: reportDate,
      clientId: clientId,
      employeeId: employeeId,
      vessel: vessel,
      berth: berth,
      notes: notes,
      status: existing ? normalizeStatus(existing.status) : 'pending',
      createdAt: existing && existing.createdAt ? existing.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    store.saveServiceReport(report);
    showList();
    renderAccounting();
  }

  function advanceStatus(reportId) {
    var store = getDataStore();
    if (!store || !store.getServiceReport || !store.saveServiceReport) return;
    var report = store.getServiceReport(reportId);
    if (!report) return;
    var nxt = nextStatus(report.status);
    if (!nxt) return;
    var label = STATUS_LABELS[nxt] || nxt;
    if (!confirm('Change status of report ' + (report.reportNo || '') + ' to ' + label + '?')) return;
    report.status = nxt;
    report.updatedAt = new Date().toISOString();
    store.saveServiceReport(report);
    render();
    renderAccounting();
  }

  function deleteReport(reportId) {
    var store = getDataStore();
    if (!store || !store.deleteServiceReport) return;
    var report = store.getServiceReport ? store.getServiceReport(reportId) : null;
    var label = report && report.reportNo ? report.reportNo : 'this report';
    if (!confirm('Delete report ' + label + '?')) return;
    store.deleteServiceReport(reportId);
    render();
    renderAccounting();
  }

  function statusBadge(status) {
    var s = normalizeStatus(status);
    return '<span class="reports-status reports-status--' + escapeHtml(s) + '">' +
      escapeHtml(STATUS_LABELS[s] || s) + '</span>';
  }

  function actionButton(report, compact) {
    var s = normalizeStatus(report.status);
    var nxt = nextStatus(s);
    var cls = compact ? 'btn btn-primary btn-sm' : 'btn btn-primary btn-sm';
    if (!nxt) {
      return '<button type="button" class="btn btn-secondary btn-sm" disabled>' +
        escapeHtml(NEXT_ACTION_LABELS.sent) + '</button>';
    }
    return '<button type="button" class="' + cls + '" data-report-advance="' +
      escapeHtml(report.id) + '">' + escapeHtml(NEXT_ACTION_LABELS[s]) + '</button>';
  }

  function sortReports(list) {
    return list.slice().sort(function (a, b) {
      var da = a && a.reportDate ? String(a.reportDate) : '';
      var db = b && b.reportDate ? String(b.reportDate) : '';
      if (db !== da) return db.localeCompare(da);
      var ua = a && a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      var ub = b && b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      if (ub !== ua) return ub - ua;
      return String((a && a.reportNo) || '').localeCompare(String((b && b.reportNo) || ''));
    });
  }

  function filterReports(list, term, statusFilter) {
    var out = Array.isArray(list) ? list.slice() : [];
    if (statusFilter && statusFilter !== 'all') {
      out = out.filter(function (r) { return normalizeStatus(r.status) === statusFilter; });
    }
    if (term) {
      var t = term.toLowerCase();
      out = out.filter(function (r) {
        return String((r && r.reportNo) || '').toLowerCase().indexOf(t) !== -1 ||
          getClientName(r.clientId).toLowerCase().indexOf(t) !== -1 ||
          getEmployeeName(r.employeeId).toLowerCase().indexOf(t) !== -1 ||
          String((r && r.vessel) || '').toLowerCase().indexOf(t) !== -1 ||
          String((r && r.berth) || '').toLowerCase().indexOf(t) !== -1 ||
          String((r && r.status) || '').toLowerCase().indexOf(t) !== -1 ||
          String((r && r.notes) || '').toLowerCase().indexOf(t) !== -1;
      });
    }
    return sortReports(out);
  }

  function bindRowActions(container) {
    if (!container) return;
    container.querySelectorAll('[data-report-advance]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        advanceStatus(btn.getAttribute('data-report-advance'));
      });
    });
    container.querySelectorAll('[data-report-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        showForm(btn.getAttribute('data-report-edit'));
      });
    });
    container.querySelectorAll('[data-report-delete]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        deleteReport(btn.getAttribute('data-report-delete'));
      });
    });
  }

  function buildTableHtml(reports, options) {
    options = options || {};
    var showEdit = options.showEdit !== false;
    if (!reports.length) {
      return '<p style="text-align:center;padding:2rem;color:var(--text-secondary);">' +
        escapeHtml(options.emptyText || 'No reports found.') + '</p>';
    }
    return '<div class="table-wrap"><table class="data-table reports-directory-table">' +
      '<thead><tr>' +
      '<th>Report No.</th><th>Date</th><th>Client</th><th>Employee</th><th>Vessel</th><th>Berth</th><th>Status</th><th>Updated</th><th></th>' +
      '</tr></thead><tbody>' +
      reports.map(function (r) {
        var id = escapeHtml(r.id);
        return '<tr>' +
          '<td><strong>' + escapeHtml(r.reportNo || '—') + '</strong></td>' +
          '<td>' + escapeHtml(formatDate(r.reportDate)) + '</td>' +
          '<td>' + escapeHtml(getClientName(r.clientId)) + '</td>' +
          '<td>' + escapeHtml(getEmployeeName(r.employeeId)) + '</td>' +
          '<td>' + escapeHtml(r.vessel || '—') + '</td>' +
          '<td>' + escapeHtml(r.berth || '—') + '</td>' +
          '<td>' + statusBadge(r.status) + '</td>' +
          '<td>' + escapeHtml(formatDate(r.updatedAt || r.createdAt)) + '</td>' +
          '<td class="reports-row-actions">' +
          actionButton(r, true) + ' ' +
          (showEdit
            ? '<button type="button" class="btn btn-secondary btn-sm" data-report-edit="' + id + '">Edit</button> ' +
              '<button type="button" class="btn btn-danger btn-sm" data-report-delete="' + id + '">Delete</button>'
            : '') +
          '</td></tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function render() {
    var listEl = document.getElementById('reports-list');
    if (!listEl) return;
    var term = ((document.getElementById('reports-search') || {}).value || listFilter || '').trim();
    listFilter = term;
    var statusFilter = ((document.getElementById('reports-status-filter') || {}).value || 'all');
    var reports = filterReports(getReports(), term, statusFilter);
    listEl.innerHTML = buildTableHtml(reports, {
      emptyText: 'No reports yet. Add a report to start the log.'
    });
    bindRowActions(listEl);
  }

  function renderAccounting() {
    var listEl = document.getElementById('accounting-service-reports-list');
    if (!listEl) return;
    var term = ((document.getElementById('accounting-service-reports-search') || {}).value || '').trim();
    var statusFilter = ((document.getElementById('accounting-service-reports-filter') || {}).value || 'attention');
    var all = getReports();
    var scoped;
    if (statusFilter === 'attention') {
      scoped = all.filter(function (r) {
        var s = normalizeStatus(r.status);
        return s === 'scanned' || s === 'invoiced';
      });
    } else if (statusFilter === 'all') {
      scoped = all;
    } else {
      scoped = all.filter(function (r) { return normalizeStatus(r.status) === statusFilter; });
    }
    scoped = filterReports(scoped, term, 'all');
    var scannedCount = all.filter(function (r) { return normalizeStatus(r.status) === 'scanned'; }).length;
    var invoicedCount = all.filter(function (r) { return normalizeStatus(r.status) === 'invoiced'; }).length;
    var summaryEl = document.getElementById('accounting-service-reports-summary');
    if (summaryEl) {
      summaryEl.textContent = scannedCount + ' scanned awaiting invoice · ' +
        invoicedCount + ' invoiced awaiting send';
    }
    listEl.innerHTML = buildTableHtml(scoped, {
      showEdit: false,
      emptyText: statusFilter === 'attention'
        ? 'No scanned or invoiced reports waiting for accounting action.'
        : 'No reports match this filter.'
    });
    bindRowActions(listEl);
  }

  function init() {
    var addBtn = document.getElementById('reports-add-btn');
    if (addBtn) addBtn.addEventListener('click', function () { showForm(); });

    var backBtn = document.getElementById('reports-back-btn');
    if (backBtn) backBtn.addEventListener('click', showList);

    var cancelBtn = document.getElementById('reports-cancel-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', showList);

    var form = document.getElementById('report-form');
    if (form) form.addEventListener('submit', saveReport);

    var searchEl = document.getElementById('reports-search');
    if (searchEl) searchEl.addEventListener('input', function () { render(); });

    var filterEl = document.getElementById('reports-status-filter');
    if (filterEl) filterEl.addEventListener('change', function () { render(); });

    var accSearch = document.getElementById('accounting-service-reports-search');
    if (accSearch) accSearch.addEventListener('input', function () { renderAccounting(); });

    var accFilter = document.getElementById('accounting-service-reports-filter');
    if (accFilter) accFilter.addEventListener('change', function () { renderAccounting(); });
  }

  window.ReportsModule = {
    render: render,
    renderAccounting: renderAccounting,
    showList: showList,
    showForm: showForm,
    STATUS_LABELS: STATUS_LABELS,
    NEXT_ACTION_LABELS: NEXT_ACTION_LABELS
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
