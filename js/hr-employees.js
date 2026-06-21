(function () {
  'use strict';

  function escapeHtml(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function getEmployeesList() {
    try {
      var raw = localStorage.getItem('employees');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function refreshOverview() {
    var list = getEmployeesList();
    var metric = document.getElementById('hr-metric-employees');
    if (metric) metric.textContent = list.length;
    var active = list.filter(function (e) { return !e.ceasedDate; }).length;
    var newMonth = list.filter(function (e) {
      if (!e.hireDate) return false;
      var d = new Date(e.hireDate);
      var now = new Date();
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
    var openRoles = document.getElementById('hr-metric-open-roles');
    var newMonthEl = document.getElementById('hr-metric-new-month');
    if (openRoles) openRoles.textContent = String(active);
    if (newMonthEl) newMonthEl.textContent = String(newMonth);

    var tbody = document.getElementById('hr-overview-team-tbody');
    if (!tbody) return;
    var activeList = list.filter(function (e) { return !e.ceasedDate; }).slice(0, 12);
    if (!activeList.length) {
      tbody.innerHTML = '<tr><td colspan="4">No employees yet. Add staff under Employees.</td></tr>';
      return;
    }
    tbody.innerHTML = activeList.map(function (emp) {
      var hire = emp.hireDate ? new Date(emp.hireDate).toLocaleDateString('en-GB') : '—';
      return '<tr><td>' + escapeHtml((emp.firstName || '') + ' ' + (emp.lastName || '')) + '</td>' +
        '<td>' + escapeHtml(emp.employeeId || '—') + '</td>' +
        '<td>—</td>' +
        '<td>' + escapeHtml(hire) + '</td></tr>';
    }).join('');
  }

  function hrEmployeesLoad() {
    refreshOverview();
    if (typeof window.loadEmployees === 'function') window.loadEmployees();
  }

  function init() {
    var addBtn = document.getElementById('hr-employee-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        if (typeof window.clearForm === 'function') window.clearForm();
        var anchor = document.getElementById('payrollEmployeeFormAnchor');
        if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    window.hrEmployeesRefreshOverview = refreshOverview;
    window.hrEmployeesLoad = hrEmployeesLoad;
    refreshOverview();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
