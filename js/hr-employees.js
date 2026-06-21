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

  function getOverviewYear() {
    var yearEl = document.getElementById('hr-overview-ytd-year');
    if (yearEl && yearEl.value) return yearEl.value;
    return String(new Date().getFullYear());
  }

  function ensureOverviewYearDefault() {
    var yearEl = document.getElementById('hr-overview-ytd-year');
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

  function refreshOverview() {
    ensureOverviewYearDefault();
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
    var tfoot = document.getElementById('hr-overview-ytd-tfoot');
    if (!tbody) return;

    var year = getOverviewYear();
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
    var yearEl = document.getElementById('hr-overview-ytd-year');
    if (yearEl) {
      yearEl.addEventListener('change', refreshOverview);
    }
    window.hrEmployeesRefreshOverview = refreshOverview;
    window.hrEmployeesLoad = hrEmployeesLoad;
    ensureOverviewYearDefault();
    refreshOverview();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
