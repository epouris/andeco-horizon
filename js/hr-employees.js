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

  function formatAmount(amount) {
    if (typeof window.formatMoney === 'function') return window.formatMoney(amount);
    if (typeof window.app !== 'undefined' && typeof window.app.formatCurrency === 'function') {
      return window.app.formatCurrency(amount);
    }
    var n = Number(amount);
    if (!isFinite(n)) n = 0;
    return n.toFixed(2);
  }

  function getPayrollYtdYear() {
    var yearEl = document.getElementById('hr-payroll-ytd-year');
    if (yearEl && yearEl.value) return yearEl.value;
    return String(new Date().getFullYear());
  }

  function ensurePayrollYtdYearDefault() {
    var yearEl = document.getElementById('hr-payroll-ytd-year');
    if (!yearEl) return;
    var current = String(new Date().getFullYear());
    var hasOption = Array.prototype.some.call(yearEl.options, function (opt) {
      return opt.value === current;
    });
    if (hasOption) yearEl.value = current;
  }

  function getYTDTotalsForEmployee(employeeId, year) {
    if (typeof window.getEmployeePayrollYTDTotals === 'function') {
      return window.getEmployeePayrollYTDTotals(employeeId, year);
    }
    return {
      grossSalary: 0,
      incomeTax: 0,
      socialInsurance: 0,
      holidayFund: 0,
      nhs: 0,
      netPay: 0
    };
  }

  function refreshOverviewMetrics() {
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
  }

  function refreshOverviewTeam() {
    var list = getEmployeesList();
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
        '<td>Active</td>' +
        '<td>' + escapeHtml(hire) + '</td></tr>';
    }).join('');
  }

  function refreshHrPayrollYTD() {
    ensurePayrollYtdYearDefault();
    var tbody = document.getElementById('hr-payroll-ytd-tbody');
    var tfoot = document.getElementById('hr-payroll-ytd-tfoot');
    if (!tbody) return;

    var list = getEmployeesList();
    var year = getPayrollYtdYear();
    var sorted = list.slice().sort(function (a, b) {
      var aName = ((a.lastName || '') + ' ' + (a.firstName || '')).toLowerCase();
      var bName = ((b.lastName || '') + ' ' + (b.firstName || '')).toLowerCase();
      return aName.localeCompare(bName);
    });

    if (!sorted.length) {
      tbody.innerHTML = '<tr><td colspan="7">No employees yet. Add staff under Employees.</td></tr>';
      if (tfoot) tfoot.innerHTML = '';
      return;
    }

    var sum = {
      grossSalary: 0,
      incomeTax: 0,
      socialInsurance: 0,
      holidayFund: 0,
      netPay: 0
    };

    tbody.innerHTML = sorted.map(function (emp) {
      var totals = getYTDTotalsForEmployee(emp.employeeId, year);
      sum.grossSalary += totals.grossSalary;
      sum.incomeTax += totals.incomeTax;
      sum.socialInsurance += totals.socialInsurance;
      sum.holidayFund += totals.holidayFund;
      sum.netPay += totals.netPay;
      var name = ((emp.firstName || '') + ' ' + (emp.lastName || '')).trim() || '—';
      var statusHint = emp.ceasedDate ? ' <span class="module-meta">(ceased)</span>' : '';
      return '<tr><td>' + escapeHtml(name) + statusHint + '</td>' +
        '<td>' + escapeHtml(emp.employeeId || '—') + '</td>' +
        '<td>' + escapeHtml(formatAmount(totals.grossSalary)) + '</td>' +
        '<td>' + escapeHtml(formatAmount(totals.incomeTax)) + '</td>' +
        '<td>' + escapeHtml(formatAmount(totals.socialInsurance)) + '</td>' +
        '<td>' + escapeHtml(formatAmount(totals.holidayFund)) + '</td>' +
        '<td>' + escapeHtml(formatAmount(totals.netPay)) + '</td></tr>';
    }).join('');

    if (tfoot) {
      tfoot.innerHTML = '<tr class="hr-overview-ytd-total-row">' +
        '<th scope="row" colspan="2">All employees (' + escapeHtml(year) + ')</th>' +
        '<td>' + escapeHtml(formatAmount(sum.grossSalary)) + '</td>' +
        '<td>' + escapeHtml(formatAmount(sum.incomeTax)) + '</td>' +
        '<td>' + escapeHtml(formatAmount(sum.socialInsurance)) + '</td>' +
        '<td>' + escapeHtml(formatAmount(sum.holidayFund)) + '</td>' +
        '<td>' + escapeHtml(formatAmount(sum.netPay)) + '</td></tr>';
    }
  }

  function refreshOverview() {
    refreshOverviewMetrics();
    refreshOverviewTeam();
    refreshHrPayrollYTD();
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
    var yearEl = document.getElementById('hr-payroll-ytd-year');
    if (yearEl) {
      yearEl.addEventListener('change', refreshHrPayrollYTD);
    }
    window.hrEmployeesRefreshOverview = refreshOverview;
    window.hrPayrollRefreshYTD = refreshHrPayrollYTD;
    window.hrEmployeesLoad = hrEmployeesLoad;
    ensurePayrollYtdYearDefault();
    refreshOverview();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
