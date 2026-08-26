/**
 * Payroll Excel (XLS/XLSX) template download + bulk import for past years.
 * Settings → Payroll Settings.
 */
(function () {
  'use strict';

  var TEMPLATE_HEADERS = [
    'Employee ID',
    'Employee Name',
    'Year',
    'Month',
    'Pay Date',
    'Payroll Number',
    'Basic Salary',
    'Standard Hours',
    'Overtime Hours',
    'Overtime Amount',
    'Other Hourly Hours',
    'Other Hourly Rate',
    'Other Hourly Amount',
    'Commission',
    'Bonus',
    'Sick Pay',
    'Expenses',
    'Gross Salary',
    'Income Tax',
    'Social Insurance',
    'Holiday Fund',
    'GESI (NHS)',
    'Total Deductions',
    'Net Pay',
    'Total Payable',
    'Employer Social Insurance',
    'Employer GESI',
    'Employer Social Cohesion',
    'Employer Redundancy',
    'Employer Industrial Training',
    'Exclude Holiday Fund',
    'Exclude Income Tax',
    'Is Holidays',
    'Is Pension',
    'Exclude Overtime From Deductions',
    'Exclude Other Hourly From Deductions'
  ];

  var HEADER_ALIASES = {
    'employee id': 'Employee ID',
    'employeeid': 'Employee ID',
    'emp id': 'Employee ID',
    'id': 'Employee ID',
    'employee name': 'Employee Name',
    'name': 'Employee Name',
    'year': 'Year',
    'month': 'Month',
    'pay date': 'Pay Date',
    'paydate': 'Pay Date',
    'payroll number': 'Payroll Number',
    'payroll #': 'Payroll Number',
    'payrollnumber': 'Payroll Number',
    'basic salary': 'Basic Salary',
    'basic': 'Basic Salary',
    'standard hours': 'Standard Hours',
    'overtime hours': 'Overtime Hours',
    'ot hours': 'Overtime Hours',
    'overtime amount': 'Overtime Amount',
    'overtime': 'Overtime Amount',
    'other hourly hours': 'Other Hourly Hours',
    'other hourly rate': 'Other Hourly Rate',
    'other hourly amount': 'Other Hourly Amount',
    'other hourly': 'Other Hourly Amount',
    'commission': 'Commission',
    'bonus': 'Bonus',
    'sick pay': 'Sick Pay',
    'expenses': 'Expenses',
    'gross salary': 'Gross Salary',
    'gross': 'Gross Salary',
    'income tax': 'Income Tax',
    'tax': 'Income Tax',
    'social insurance': 'Social Insurance',
    'si': 'Social Insurance',
    'holiday fund': 'Holiday Fund',
    'gesi (nhs)': 'GESI (NHS)',
    'gesi': 'GESI (NHS)',
    'nhs': 'GESI (NHS)',
    'total deductions': 'Total Deductions',
    'net pay': 'Net Pay',
    'net': 'Net Pay',
    'total payable': 'Total Payable',
    'employer social insurance': 'Employer Social Insurance',
    'employer gesi': 'Employer GESI',
    'employer social cohesion': 'Employer Social Cohesion',
    'employer redundancy': 'Employer Redundancy',
    'employer industrial training': 'Employer Industrial Training',
    'exclude holiday fund': 'Exclude Holiday Fund',
    'exclude income tax': 'Exclude Income Tax',
    'is holidays': 'Is Holidays',
    'is pension': 'Is Pension',
    'exclude overtime from deductions': 'Exclude Overtime From Deductions',
    'exclude other hourly from deductions': 'Exclude Other Hourly From Deductions'
  };

  var MONTH_NAMES = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12
  };

  function ensureXlsx() {
    return typeof window.XLSX !== 'undefined' && window.XLSX.utils;
  }

  function notify(message, type) {
    if (typeof window.showMessage === 'function') {
      window.showMessage(message, type || 'info');
      return;
    }
    var el = document.getElementById('payrollXlsImportStatus');
    if (el) {
      el.textContent = message;
      el.className = 'module-meta payroll-xls-status payroll-xls-status--' + (type || 'info');
    } else {
      window.alert(message);
    }
  }

  function setStatus(message, type) {
    var el = document.getElementById('payrollXlsImportStatus');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'module-meta payroll-xls-status' + (type ? ' payroll-xls-status--' + type : '');
  }

  function num(v, fallback) {
    if (v == null || v === '') return fallback != null ? fallback : 0;
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    var s = String(v).trim().replace(/\s/g, '').replace(/€/g, '');
    if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        s = s.replace(/,/g, '');
      }
    } else if (s.indexOf(',') >= 0) {
      s = s.replace(',', '.');
    }
    var n = parseFloat(s);
    return Number.isNaN(n) ? (fallback != null ? fallback : 0) : n;
  }

  function bool(v) {
    if (v === true || v === 1) return true;
    if (v === false || v === 0 || v == null || v === '') return false;
    var s = String(v).trim().toLowerCase();
    return s === '1' || s === 'y' || s === 'yes' || s === 'true' || s === 'x' || s === 'on';
  }

  function parseMonth(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number' && !Number.isNaN(v)) {
      var n = Math.floor(v);
      return n >= 1 && n <= 12 ? n : 0;
    }
    var s = String(v).trim().toLowerCase();
    if (/^\d{1,2}$/.test(s)) {
      var m = parseInt(s, 10);
      return m >= 1 && m <= 12 ? m : 0;
    }
    if (MONTH_NAMES[s]) return MONTH_NAMES[s];
    var abbr = s.slice(0, 3);
    if (MONTH_NAMES[abbr]) return MONTH_NAMES[abbr];
    return 0;
  }

  function parseYear(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number' && !Number.isNaN(v)) return Math.floor(v);
    var s = String(v).trim();
    var m = s.match(/(\d{4})/);
    return m ? parseInt(m[1], 10) : 0;
  }

  function excelDateToIso(v, year, month) {
    if (v == null || v === '') {
      var lastDay = new Date(year, month, 0).getDate();
      return year + '-' + String(month).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0');
    }
    if (typeof v === 'number' && ensureXlsx() && window.XLSX.SSF && typeof window.XLSX.SSF.parse_date_code === 'function') {
      var d = window.XLSX.SSF.parse_date_code(v);
      if (d) {
        return d.y + '-' + String(d.m).padStart(2, '0') + '-' + String(d.d).padStart(2, '0');
      }
    }
    var s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    // Prefer DD/MM/YYYY (Cyprus / EU)
    var eu = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
    if (eu) {
      return eu[3] + '-' + eu[2].padStart(2, '0') + '-' + eu[1].padStart(2, '0');
    }
    var last = new Date(year, month, 0).getDate();
    return year + '-' + String(month).padStart(2, '0') + '-' + String(last).padStart(2, '0');
  }

  function normalizeHeader(h) {
    var key = String(h == null ? '' : h).trim().toLowerCase().replace(/\s+/g, ' ');
    return HEADER_ALIASES[key] || String(h == null ? '' : h).trim();
  }

  function getEmployees() {
    try {
      if (typeof window.reloadPayrollFromStorageNow === 'function') {
        /* keep employees in sync before matching IDs */
      }
      var fromLs = JSON.parse(localStorage.getItem('employees') || '[]');
      if (Array.isArray(fromLs) && fromLs.length) return fromLs;
    } catch (e) {}
    return [];
  }

  function getPayrollMap() {
    if (typeof window.getPayrollDataMap === 'function') {
      return window.getPayrollDataMap() || {};
    }
    try {
      return JSON.parse(localStorage.getItem('payrollData') || '{}') || {};
    } catch (e) {
      return {};
    }
  }

  function findEmployee(employeeId) {
    var id = String(employeeId || '').trim();
    if (!id) return null;
    var list = getEmployees();
    var found = list.find(function (e) {
      return String(e.employeeId || '').trim() === id;
    });
    if (found) return found;
    return list.find(function (e) {
      return String(e.employeeId || '').trim().toLowerCase() === id.toLowerCase();
    }) || null;
  }

  function monthSeg(month) {
    if (typeof window.payrollMonthSegment === 'function') return window.payrollMonthSegment(month);
    var m = Number(month);
    if (Number.isNaN(m) || m < 1 || m > 12) return '00';
    return String(m).padStart(2, '0');
  }

  function canonKey(employeeId, year, month) {
    if (typeof window.canonicalPayrollKey === 'function') {
      return window.canonicalPayrollKey(employeeId, year, month);
    }
    return String(employeeId).trim() + '_' + String(year).trim() + '_' + monthSeg(month);
  }

  function nextPayrollNumber(year, month) {
    var seq = 1;
    if (typeof window.getNextPayrollSequence === 'function') {
      seq = window.getNextPayrollSequence(year, month);
    }
    if (typeof window.formatPayrollNumber === 'function') {
      return window.formatPayrollNumber(year, month, seq);
    }
    return 'SLR/' + year + '/' + monthSeg(month) + '/' + String(seq).padStart(3, '0');
  }

  function sampleRows() {
    var list = getEmployees().slice(0, 2);
    var year = new Date().getFullYear() - 1;
    if (!list.length) {
      return [
        ['EMP001', 'Example Employee', year, 1, year + '-01-31', '', 2000, 173, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2000, 0, 176, 160, 53, 389, 1611, 1611, 176, 58, 40, 24, 10, 'No', 'No', 'No', 'No', 'No', 'No']
      ];
    }
    return list.map(function (emp, i) {
      var month = i + 1;
      var lastDay = new Date(year, month, 0).getDate();
      var payDate = year + '-' + String(month).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0');
      return [
        emp.employeeId || '',
        ((emp.firstName || '') + ' ' + (emp.lastName || '')).trim(),
        year,
        month,
        payDate,
        '',
        2000,
        173,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        2000,
        0,
        176,
        160,
        53,
        389,
        1611,
        1611,
        176,
        58,
        40,
        24,
        10,
        'No',
        'No',
        'No',
        'No',
        'No',
        'No'
      ];
    });
  }

  function downloadPayrollXlsTemplate() {
    if (!ensureXlsx()) {
      notify('Excel library failed to load. Refresh the page and try again.', 'error');
      return;
    }
    var wb = window.XLSX.utils.book_new();
    var instructions = [
      ['Payroll import template — Andeco Horizon'],
      [''],
      ['How to use'],
      ['1. Keep the header row on the "Payroll" sheet unchanged.'],
      ['2. Add one row per employee per month (past years ok).'],
      ['3. Employee ID must match an existing employee in HR / Payroll.'],
      ['4. Month can be 1–12 or a month name (Jan, February, …).'],
      ['5. Enter final payslip amounts (Gross, Tax, SI, Net, employer contributions, etc.).'],
      ['6. Leave Payroll Number blank to auto-assign SLR/YYYY/MM/###.'],
      ['7. Yes/No columns: Yes, Y, 1, True — or leave blank for No.'],
      ['8. Save as .xlsx or .xls, then use Import payroll Excel in Settings → Payroll Settings.'],
      [''],
      ['Overwrite'],
      ['On import you can choose to overwrite existing payslips for the same employee/month, or skip them.'],
      [''],
      ['Sample rows on the Payroll sheet use your first employees (or an example ID). Replace values with real historical data.']
    ];
    var wsInfo = window.XLSX.utils.aoa_to_sheet(instructions);
    wsInfo['!cols'] = [{ wch: 100 }];
    window.XLSX.utils.book_append_sheet(wb, wsInfo, 'Instructions');

    var aoa = [TEMPLATE_HEADERS].concat(sampleRows());
    var ws = window.XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = TEMPLATE_HEADERS.map(function (h) {
      return { wch: Math.min(28, Math.max(12, String(h).length + 2)) };
    });
    window.XLSX.utils.book_append_sheet(wb, ws, 'Payroll');

    window.XLSX.writeFile(wb, 'payroll-import-template.xlsx');
    notify('Template downloaded.', 'success');
  }

  function rowToRecord(row, overwrite) {
    var employeeId = String(row['Employee ID'] != null ? row['Employee ID'] : '').trim();
    if (!employeeId) {
      return { error: 'Missing Employee ID' };
    }
    var employee = findEmployee(employeeId);
    if (!employee) {
      return { error: 'Unknown Employee ID: ' + employeeId };
    }
    employeeId = String(employee.employeeId).trim();

    var year = parseYear(row['Year']);
    var month = parseMonth(row['Month']);
    if (!year || year < 1990 || year > 2100) {
      return { error: 'Invalid Year for ' + employeeId };
    }
    if (!month) {
      return { error: 'Invalid Month for ' + employeeId + ' / ' + year };
    }

    var key = canonKey(employeeId, year, month);
    var existing = getPayrollMap()[key] || null;
    if (existing && !overwrite) {
      return { skipped: true, key: key, employeeId: employeeId, year: year, month: month };
    }

    var basicSalary = num(row['Basic Salary'], 0);
    var standardHours = num(row['Standard Hours'], 0);
    var overtimeHours = num(row['Overtime Hours'], 0);
    var overtime = num(row['Overtime Amount'], 0);
    var otherHourlyHours = num(row['Other Hourly Hours'], 0);
    var otherHourlyRate = num(row['Other Hourly Rate'], 0);
    var otherHourly = num(row['Other Hourly Amount'], otherHourlyHours * otherHourlyRate);
    var commission = num(row['Commission'], 0);
    var bonus = num(row['Bonus'], 0);
    var sickPay = num(row['Sick Pay'], 0);
    var expenses = num(row['Expenses'], 0);
    var additionalPay = overtime + otherHourly + commission + bonus + sickPay;
    var grossSalary = num(row['Gross Salary'], basicSalary + additionalPay);
    var incomeTax = num(row['Income Tax'], 0);
    var socialInsurance = num(row['Social Insurance'], 0);
    var holidayFund = num(row['Holiday Fund'], 0);
    var nhs = num(row['GESI (NHS)'], 0);
    var totalDeductions = num(row['Total Deductions'], incomeTax + socialInsurance + holidayFund + nhs);
    var netPay = num(row['Net Pay'], grossSalary - totalDeductions);
    var totalPayable = num(row['Total Payable'], netPay + expenses);

    var employerSI = num(row['Employer Social Insurance'], 0);
    var employerGesi = num(row['Employer GESI'], 0);
    var employerCohesion = num(row['Employer Social Cohesion'], 0);
    var employerRedundancy = num(row['Employer Redundancy'], 0);
    var employerTraining = num(row['Employer Industrial Training'], 0);

    var payrollNumber = String(row['Payroll Number'] != null ? row['Payroll Number'] : '').trim();
    if (!payrollNumber && existing && existing.payrollNumber) {
      payrollNumber = existing.payrollNumber;
    }

    var payDate = excelDateToIso(row['Pay Date'], year, month);
    var monthStr = monthSeg(month);
    var savedAt = existing && existing.savedAt != null ? existing.savedAt : Date.now();

    var record = {
      employeeId: employeeId,
      employeeName: ((employee.firstName || '') + ' ' + (employee.lastName || '')).trim() || String(row['Employee Name'] || '').trim(),
      month: monthStr,
      year: year,
      payDate: payDate,
      payrollNumber: payrollNumber,
      savedAt: savedAt,
      basicSalary: basicSalary,
      standardHours: standardHours,
      overtimeHours: overtimeHours,
      excludeHolidayFund: bool(row['Exclude Holiday Fund']),
      excludeIncomeTax: bool(row['Exclude Income Tax']),
      isHolidays: bool(row['Is Holidays']),
      isPension: bool(row['Is Pension']),
      excludeOvertimeFromDeductions: bool(row['Exclude Overtime From Deductions']),
      excludeOtherHourlyFromDeductions: bool(row['Exclude Other Hourly From Deductions']),
      contributionBasisGross: grossSalary,
      overtime: overtime,
      otherHourly: otherHourly,
      otherHourlyHours: otherHourlyHours,
      otherHourlyRate: otherHourlyRate,
      commission: commission,
      bonus: bonus,
      sickPay: sickPay,
      grossSalary: grossSalary,
      additionalPay: additionalPay,
      incomeTax: incomeTax,
      socialInsurance: socialInsurance,
      holidayFund: holidayFund,
      nhs: nhs,
      totalDeductions: totalDeductions,
      netPay: netPay,
      expenses: expenses,
      totalPayable: totalPayable,
      employerContributions: {
        socialInsurance: employerSI,
        nhs: employerGesi,
        socialCohesion: employerCohesion,
        redundancy: employerRedundancy,
        industrialTraining: employerTraining
      },
      importedFromXls: true,
      importedAt: Date.now()
    };

    return { key: key, record: record, employeeId: employeeId, year: year, month: month };
  }

  function sheetToObjects(sheet) {
    var rows = window.XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
    return rows.map(function (raw) {
      var out = {};
      Object.keys(raw).forEach(function (k) {
        var nk = normalizeHeader(k);
        if (nk) out[nk] = raw[k];
      });
      return out;
    });
  }

  function pickPayrollSheet(wb) {
    if (wb.Sheets.Payroll) return wb.Sheets.Payroll;
    var names = wb.SheetNames || [];
    for (var i = 0; i < names.length; i++) {
      if (String(names[i]).toLowerCase() === 'payroll') return wb.Sheets[names[i]];
    }
    for (var j = 0; j < names.length; j++) {
      if (String(names[j]).toLowerCase() === 'instructions') continue;
      return wb.Sheets[names[j]];
    }
    return null;
  }

  function importPayrollXlsFile(file, options) {
    var opts = options || {};
    var overwrite = !!opts.overwrite;
    if (!file) {
      notify('No file selected.', 'error');
      return;
    }
    if (!ensureXlsx()) {
      notify('Excel library failed to load. Refresh the page and try again.', 'error');
      return;
    }

    setStatus('Importing…', 'info');
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = new Uint8Array(e.target.result);
        var wb = window.XLSX.read(data, { type: 'array', cellDates: true });
        var sheet = pickPayrollSheet(wb);
        if (!sheet) {
          notify('No spreadsheet sheet found.', 'error');
          setStatus('Import failed: no sheet.', 'error');
          return;
        }
        var rows = sheetToObjects(sheet).filter(function (r) {
          return Object.keys(r).some(function (k) {
            var v = r[k];
            return v != null && String(v).trim() !== '';
          });
        });
        if (!rows.length) {
          notify('The file has no data rows.', 'error');
          setStatus('Import failed: empty file.', 'error');
          return;
        }

        if (typeof window.reloadPayrollFromStorageNow === 'function') {
          try {
            window.reloadPayrollFromStorageNow(true);
          } catch (err) {}
        }

        var toMerge = {};
        var imported = 0;
        var skipped = 0;
        var errors = [];
        var maxSeqByYm = {};

        function trackSeq(year, month, payrollNumber) {
          var ym = year + '-' + monthSeg(month);
          var m = String(payrollNumber || '').match(/\/(\d+)$/);
          if (!m) return;
          var seq = parseInt(m[1], 10);
          if (!maxSeqByYm[ym] || seq > maxSeqByYm[ym]) maxSeqByYm[ym] = seq;
        }

        Object.keys(getPayrollMap()).forEach(function (k) {
          var p = getPayrollMap()[k];
          if (p) trackSeq(p.year, p.month, p.payrollNumber);
        });

        rows.forEach(function (row, idx) {
          var result = rowToRecord(row, overwrite);
          if (result.error) {
            errors.push('Row ' + (idx + 2) + ': ' + result.error);
            return;
          }
          if (result.skipped) {
            skipped += 1;
            return;
          }
          var pn = String(result.record.payrollNumber || '').trim();
          if (!pn) {
            var ym = result.year + '-' + monthSeg(result.month);
            var nextSeq = (maxSeqByYm[ym] || 0) + 1;
            pn = typeof window.formatPayrollNumber === 'function'
              ? window.formatPayrollNumber(result.year, result.month, nextSeq)
              : nextPayrollNumber(result.year, result.month);
            result.record.payrollNumber = pn;
          }
          trackSeq(result.year, result.month, pn);
          toMerge[result.key] = result.record;
          imported += 1;
        });

        if (imported && typeof window.mergeImportedPayrollRecords === 'function') {
          window.mergeImportedPayrollRecords(toMerge);
        } else if (imported) {
          var map = getPayrollMap();
          Object.keys(toMerge).forEach(function (k) { map[k] = toMerge[k]; });
          localStorage.setItem('payrollData', JSON.stringify(map));
          if (typeof window.savePayrollData === 'function') window.savePayrollData();
          if (typeof window.updateAllTabs === 'function') window.updateAllTabs();
        }

        var msg = 'Imported ' + imported + ' payslip' + (imported === 1 ? '' : 's');
        if (skipped) msg += ', skipped ' + skipped + ' existing';
        if (errors.length) msg += ', ' + errors.length + ' error' + (errors.length === 1 ? '' : 's');
        msg += '.';
        if (errors.length) {
          var detail = errors.slice(0, 5).join(' · ');
          if (errors.length > 5) detail += ' · +' + (errors.length - 5) + ' more';
          msg += ' ' + detail;
        }
        notify(msg, errors.length && !imported ? 'error' : 'success');
        setStatus(msg, errors.length && !imported ? 'error' : 'success');
      } catch (err) {
        console.error(err);
        notify('Could not read the Excel file. Use the template format (.xlsx / .xls).', 'error');
        setStatus('Import failed.', 'error');
      }
    };
    reader.onerror = function () {
      notify('Could not read the selected file.', 'error');
      setStatus('Import failed.', 'error');
    };
    reader.readAsArrayBuffer(file);
  }

  function onImportClick() {
    var input = document.getElementById('payrollXlsImportFile');
    if (!input) return;
    input.value = '';
    input.click();
  }

  function onFileChange(ev) {
    var input = ev && ev.target ? ev.target : document.getElementById('payrollXlsImportFile');
    var file = input && input.files && input.files[0];
    if (!file) return;
    var overwriteEl = document.getElementById('payrollXlsOverwrite');
    var overwrite = overwriteEl ? !!overwriteEl.checked : false;
    importPayrollXlsFile(file, { overwrite: overwrite });
    input.value = '';
  }

  function bindUi() {
    var dl = document.getElementById('payrollXlsDownloadTemplateBtn');
    if (dl && !dl._payrollXlsBound) {
      dl._payrollXlsBound = true;
      dl.addEventListener('click', function (e) {
        e.preventDefault();
        downloadPayrollXlsTemplate();
      });
    }
    var imp = document.getElementById('payrollXlsImportBtn');
    if (imp && !imp._payrollXlsBound) {
      imp._payrollXlsBound = true;
      imp.addEventListener('click', function (e) {
        e.preventDefault();
        onImportClick();
      });
    }
    var file = document.getElementById('payrollXlsImportFile');
    if (file && !file._payrollXlsBound) {
      file._payrollXlsBound = true;
      file.addEventListener('change', onFileChange);
    }
  }

  window.downloadPayrollXlsTemplate = downloadPayrollXlsTemplate;
  window.importPayrollXlsFile = importPayrollXlsFile;
  window.bindPayrollXlsImportUi = bindUi;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindUi);
  } else {
    bindUi();
  }
})();
