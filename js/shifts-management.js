/**
 * Shifts — team scheduling, time off, sick days, monthly hours, conflict visibility.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'andeco_shifts_data';
  var ACTIVE_STAFF_KEY = 'andeco_shifts_active_staff';
  var CAL_MONTH_KEY = 'andeco_shifts_cal_month';

  var REQUEST_TYPES = {
    day_off: 'Day off',
    holiday: 'Holiday',
    sick: 'Sick leave',
    other: 'Other'
  };

  var defaultSettings = {
    standardHoursPerDay: 8,
    overtimeThresholdWeekly: 40,
    companyHolidays: []
  };

  function id() {
    return 'sh' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function persistAllIfFile() {
    try {
      if (window.AccountingData && window.AccountingData.persistAll) window.AccountingData.persistAll();
    } catch (e) {}
  }

  function getData() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var d = JSON.parse(raw);
        return normalizeData(d);
      }
    } catch (e) {}
    return normalizeData({});
  }

  function normalizeData(d) {
    return {
      staff: Array.isArray(d.staff) ? d.staff : [],
      shifts: Array.isArray(d.shifts) ? d.shifts : [],
      requests: Array.isArray(d.requests) ? d.requests : [],
      settings: Object.assign({}, defaultSettings, d.settings && typeof d.settings === 'object' ? d.settings : {})
    };
  }

  function saveData(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeData(data)));
    } catch (e) {}
    persistAllIfFile();
  }

  function getStaff() { return getData().staff; }
  function getShifts() { return getData().shifts; }
  function getRequests() { return getData().requests; }
  function getSettings() { return getData().settings; }

  function saveStaff(a) { var d = getData(); d.staff = a; saveData(d); }
  function saveShifts(a) { var d = getData(); d.shifts = a; saveData(d); }
  function saveRequests(a) { var d = getData(); d.requests = a; saveData(d); }
  function saveSettings(s) { var d = getData(); d.settings = Object.assign({}, defaultSettings, s); saveData(d); }

  function toYmd(val) {
    if (!val) return '';
    if (val.length === 10 && val.indexOf('-') === 4) return val;
    var d = new Date(val);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  function parseTimeToMinutes(t) {
    if (!t) return 0;
    var p = String(t).split(':');
    var h = parseInt(p[0], 10) || 0;
    var m = parseInt(p[1], 10) || 0;
    return h * 60 + m;
  }

  function formatHours(mins) {
    if (!mins || mins <= 0) return '0h';
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    return m ? h + 'h ' + m + 'm' : h + 'h';
  }

  function shiftDurationMinutes(shift) {
    var start = parseTimeToMinutes(shift.startTime);
    var end = parseTimeToMinutes(shift.endTime);
    var br = parseInt(shift.breakMinutes, 10) || 0;
    var mins = end - start - br;
    if (end <= start) mins = (24 * 60 - start + end) - br;
    return mins > 0 ? mins : 0;
  }

  function staffById(sid) {
    return getStaff().filter(function (s) { return s.id === sid; })[0];
  }

  function staffColor(staff) {
    if (staff && staff.color) return staff.color;
    var hues = ['#2563eb', '#059669', '#ea580c', '#7c3aed', '#0d9488', '#db2777'];
    var n = 0;
    if (staff && staff.id) {
      for (var i = 0; i < staff.id.length; i++) n += staff.id.charCodeAt(i);
    }
    return hues[n % hues.length];
  }

  function getActiveStaffId() {
    try {
      var s = localStorage.getItem(ACTIVE_STAFF_KEY);
      if (s && staffById(s)) return s;
    } catch (e) {}
    var list = getStaff();
    return list.length ? list[0].id : '';
  }

  function setActiveStaffId(sid) {
    try { localStorage.setItem(ACTIVE_STAFF_KEY, sid || ''); } catch (e) {}
  }

  function getSessionDisplayName() {
    try {
      var raw = localStorage.getItem('andeco_crm_session');
      if (!raw) return '';
      var sess = JSON.parse(raw);
      return (sess.displayName || sess.username || '').trim().toLowerCase();
    } catch (e) { return ''; }
  }

  function guessStaffFromSession() {
    var dn = getSessionDisplayName();
    if (!dn) return '';
    var list = getStaff();
    for (var i = 0; i < list.length; i++) {
      if ((list[i].name || '').trim().toLowerCase() === dn) return list[i].id;
    }
    return '';
  }

  function datesInRange(startYmd, endYmd) {
    var out = [];
    var cur = new Date(startYmd + 'T12:00:00');
    var end = new Date(endYmd + 'T12:00:00');
    if (isNaN(cur.getTime()) || isNaN(end.getTime())) return out;
    while (cur <= end) {
      out.push(toYmd(cur.toISOString()));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

  function requestCoversDate(req, ymd) {
    if (req.status === 'rejected') return false;
    var start = toYmd(req.startDate);
    var end = toYmd(req.endDate || req.startDate);
    var days = datesInRange(start, end);
    return days.indexOf(ymd) !== -1;
  }

  function shiftsOnDate(ymd, staffId) {
    return getShifts().filter(function (sh) {
      if (toYmd(sh.date) !== ymd) return false;
      if (staffId && sh.staffId !== staffId) return false;
      return true;
    });
  }

  function requestsOnDate(ymd, staffId) {
    return getRequests().filter(function (r) {
      if (staffId && r.staffId !== staffId) return false;
      return requestCoversDate(r, ymd);
    });
  }

  function shiftsOverlap(a, b) {
    if (toYmd(a.date) !== toYmd(b.date) || a.staffId !== b.staffId) return false;
    var a0 = parseTimeToMinutes(a.startTime);
    var a1 = parseTimeToMinutes(a.endTime);
    var b0 = parseTimeToMinutes(b.startTime);
    var b1 = parseTimeToMinutes(b.endTime);
    if (a1 <= a0) a1 += 24 * 60;
    if (b1 <= b0) b1 += 24 * 60;
    return a0 < b1 && b0 < a1;
  }

  function detectConflicts() {
    var issues = [];
    var shifts = getShifts();
    var requests = getRequests();
    shifts.forEach(function (sh, i) {
      var ymd = toYmd(sh.date);
      var staff = staffById(sh.staffId);
      var name = staff ? staff.name : 'Unknown';
      requests.forEach(function (r) {
        if (r.staffId !== sh.staffId || r.status === 'rejected') return;
        if (requestCoversDate(r, ymd)) {
          issues.push({
            type: 'shift_on_leave',
            message: name + ': shift on ' + ymd + ' conflicts with ' + (REQUEST_TYPES[r.type] || r.type) + ' (' + r.status + ')'
          });
        }
      });
      for (var j = i + 1; j < shifts.length; j++) {
        if (shiftsOverlap(sh, shifts[j])) {
          var staff2 = staffById(shifts[j].staffId);
          issues.push({
            type: 'overlap',
            message: (staff ? staff.name : '?') + ': overlapping shifts on ' + ymd
          });
        }
      }
    });
    requests.forEach(function (r) {
      if (r.status === 'rejected') return;
      var start = toYmd(r.startDate);
      var end = toYmd(r.endDate || r.startDate);
      datesInRange(start, end).forEach(function (ymd) {
        var others = requests.filter(function (o) {
          return o.id !== r.id && o.staffId === r.staffId && o.status !== 'rejected' && requestCoversDate(o, ymd);
        });
        if (others.length) {
          var staff = staffById(r.staffId);
          issues.push({
            type: 'duplicate_leave',
            message: (staff ? staff.name : '?') + ': multiple leave entries on ' + ymd
          });
        }
      });
    });
    var seen = {};
    return issues.filter(function (x) {
      if (seen[x.message]) return false;
      seen[x.message] = true;
      return true;
    });
  }

  function monthKeyFromDate(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
  }

  function getCalMonth() {
    try {
      var s = sessionStorage.getItem(CAL_MONTH_KEY);
      if (s && /^\d{4}-\d{2}$/.test(s)) return s;
    } catch (e) {}
    return monthKeyFromDate(new Date());
  }

  function setCalMonth(mk) {
    try { sessionStorage.setItem(CAL_MONTH_KEY, mk); } catch (e) {}
  }

  function isAdminSession() {
    try {
      var raw = localStorage.getItem('andeco_crm_session');
      if (!raw) return false;
      return JSON.parse(raw).isAdmin === true;
    } catch (e) { return false; }
  }

  var currentSection = 'dashboard';
  var modalMode = null;
  var modalEditId = null;
  var didInit = false;

  function setSection(sectionId) {
    currentSection = sectionId || 'dashboard';
    document.querySelectorAll('#page-shifts .shifts-section-panel').forEach(function (p) {
      p.classList.toggle('active', p.getAttribute('data-section') === currentSection);
    });
    render();
  }

  function render() {
    renderToolbarStaffSelect();
    if (currentSection === 'dashboard') renderDashboard();
    else if (currentSection === 'calendar') renderCalendar();
    else if (currentSection === 'log-shifts') renderShiftsTable();
    else if (currentSection === 'requests') renderRequests();
    else if (currentSection === 'hours') renderHours();
    else if (currentSection === 'availability') renderAvailability();
    else if (currentSection === 'settings') renderSettings();
  }

  function renderToolbarStaffSelect() {
    var sel = document.getElementById('shifts-staff-filter');
    if (!sel) return;
    var staff = getStaff();
    var active = getActiveStaffId();
    var guess = guessStaffFromSession();
    if (!active && guess) {
      active = guess;
      setActiveStaffId(guess);
    }
    sel.innerHTML = '<option value="">All team</option>' + staff.map(function (s) {
      return '<option value="' + escapeHtml(s.id) + '"' + (s.id === active ? ' selected' : '') + '>' + escapeHtml(s.name) + '</option>';
    }).join('');
  }

  function renderDashboard() {
    var metrics = document.getElementById('shifts-dashboard-metrics');
    var alerts = document.getElementById('shifts-dashboard-alerts');
    var offList = document.getElementById('shifts-off-today-list');
    var pendingList = document.getElementById('shifts-pending-list');
    if (!metrics) return;

    var today = toYmd(new Date().toISOString());
    var mk = monthKeyFromDate(new Date());
    var staff = getStaff();
    var shifts = getShifts();
    var requests = getRequests();
    var pending = requests.filter(function (r) { return r.status === 'pending'; });
    var sickMonth = requests.filter(function (r) {
      return r.type === 'sick' && r.status !== 'rejected' && toYmd(r.startDate).slice(0, 7) === mk;
    }).length;

    var monthMins = 0;
    shifts.forEach(function (sh) {
      if (toYmd(sh.date).slice(0, 7) !== mk) return;
      monthMins += shiftDurationMinutes(sh);
    });

    var offToday = [];
    staff.forEach(function (s) {
      var reqs = requestsOnDate(today, s.id).filter(function (r) { return r.status !== 'rejected'; });
      if (reqs.length) offToday.push({ staff: s, req: reqs[0] });
    });

    var conflicts = detectConflicts();

    metrics.innerHTML =
      '<span class="shifts-metric">' + staff.length + ' team member(s)</span>' +
      '<span class="shifts-metric">' + formatHours(monthMins) + ' logged this month</span>' +
      '<span class="shifts-metric' + (pending.length ? ' shifts-metric--warn' : '') + '">' + pending.length + ' pending request(s)</span>' +
      '<span class="shifts-metric">' + sickMonth + ' sick leave(s) this month</span>' +
      '<span class="shifts-metric' + (conflicts.length ? ' shifts-metric--warn' : ' shifts-metric--ok') + '">' + conflicts.length + ' conflict(s)</span>';

    if (alerts) {
      if (!staff.length) {
        alerts.innerHTML = '<strong>Get started</strong><p style="margin:0.35rem 0 0">Add team members under <strong>Settings</strong> (or <strong>Import from HR</strong>), then log shifts and time-off requests in the other tabs.</p>';
      } else if (conflicts.length) {
        alerts.innerHTML = '<strong>Scheduling conflicts</strong><ul style="margin:0.5rem 0 0 1rem;padding:0">' +
          conflicts.slice(0, 8).map(function (c) { return '<li>' + escapeHtml(c.message) + '</li>'; }).join('') +
          (conflicts.length > 8 ? '<li>…and ' + (conflicts.length - 8) + ' more</li>' : '') + '</ul>';
      } else {
        alerts.innerHTML = '';
      }
    }

    if (offList) {
      offList.innerHTML = offToday.length
        ? offToday.map(function (x) {
          return '<li><strong>' + escapeHtml(x.staff.name) + '</strong> — ' + escapeHtml(REQUEST_TYPES[x.req.type] || x.req.type) +
            (x.req.status === 'pending' ? ' <span class="shifts-status shifts-status--pending">pending</span>' : '') + '</li>';
        }).join('')
        : '<li>Everyone scheduled / no leave recorded today.</li>';
    }

    if (pendingList) {
      pendingList.innerHTML = pending.length
        ? pending.slice(0, 10).map(function (r) {
          var s = staffById(r.staffId);
          return '<li><strong>' + escapeHtml(s ? s.name : '?') + '</strong>: ' + escapeHtml(REQUEST_TYPES[r.type] || r.type) +
            ' ' + escapeHtml(toYmd(r.startDate)) + (r.endDate && toYmd(r.endDate) !== toYmd(r.startDate) ? ' → ' + escapeHtml(toYmd(r.endDate)) : '') +
            ' <button type="button" class="btn btn-ghost btn-sm shifts-approve-btn" data-id="' + escapeHtml(r.id) + '">Approve</button>' +
            ' <button type="button" class="btn btn-ghost btn-sm shifts-reject-btn" data-id="' + escapeHtml(r.id) + '">Reject</button></li>';
        }).join('')
        : '<li>No pending requests.</li>';
      bindRequestActions(pendingList);
    }
  }

  function bindRequestActions(container) {
    if (!container) return;
    container.querySelectorAll('.shifts-approve-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        updateRequestStatus(btn.getAttribute('data-id'), 'approved');
      });
    });
    container.querySelectorAll('.shifts-reject-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        updateRequestStatus(btn.getAttribute('data-id'), 'rejected');
      });
    });
  }

  function updateRequestStatus(rid, status) {
    if (!isAdminSession() && status !== 'pending') {
      if (!confirm('Approve or reject this request? (Managers should use an admin account for audit.)')) return;
    }
    var list = getRequests();
    var r = list.filter(function (x) { return x.id === rid; })[0];
    if (!r) return;
    r.status = status;
    r.reviewedAt = new Date().toISOString();
    saveRequests(list);
    render();
  }

  function renderCalendar() {
    var grid = document.getElementById('shifts-calendar-grid');
    var title = document.getElementById('shifts-cal-title');
    if (!grid) return;

    var mk = getCalMonth();
    var parts = mk.split('-');
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10) - 1;
    if (title) title.textContent = new Date(y, m, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    var filterStaff = (document.getElementById('shifts-staff-filter') || {}).value || '';
    var first = new Date(y, m, 1);
    var startPad = (first.getDay() + 6) % 7;
    var daysInMonth = new Date(y, m + 1, 0).getDate();
    var today = toYmd(new Date().toISOString());

    var html = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(function (d) {
      return '<div class="shifts-cal-head">' + d + '</div>';
    }).join('');

    var totalCells = Math.ceil((startPad + daysInMonth) / 7) * 7;
    for (var i = 0; i < totalCells; i++) {
      var dayNum = i - startPad + 1;
      var ymd = '';
      var cls = 'shifts-cal-day';
      if (dayNum < 1 || dayNum > daysInMonth) {
        cls += ' shifts-cal-day--other';
        html += '<div class="' + cls + '"></div>';
        continue;
      }
      ymd = y + '-' + ('0' + (m + 1)).slice(-2) + '-' + ('0' + dayNum).slice(-2);
      if (ymd === today) cls += ' shifts-cal-day--today';

      var events = '';
      var staffList = filterStaff ? [staffById(filterStaff)].filter(Boolean) : getStaff();
      staffList.forEach(function (st) {
        if (!st) return;
        requestsOnDate(ymd, st.id).forEach(function (r) {
          var t = r.type || 'other';
          var c = t === 'sick' ? 'sick' : (t === 'holiday' ? 'holiday' : (t === 'day_off' ? 'dayoff' : 'off'));
          events += '<span class="shifts-cal-event shifts-cal-event--' + c + '" title="' + escapeHtml(st.name) + '">' +
            escapeHtml(st.name.split(' ')[0]) + ' ' + escapeHtml(REQUEST_TYPES[t] || t) + '</span>';
        });
        shiftsOnDate(ymd, st.id).forEach(function (sh) {
          events += '<span class="shifts-cal-event" style="background:' + escapeHtml(staffColor(st)) + '" title="' +
            escapeHtml(st.name) + ' ' + escapeHtml(sh.startTime) + '–' + escapeHtml(sh.endTime) + '">' +
            escapeHtml(st.name.split(' ')[0]) + ' ' + escapeHtml(sh.startTime) + '</span>';
        });
      });

      html += '<div class="' + cls + '" data-date="' + escapeHtml(ymd) + '"><div class="shifts-cal-day-num">' + dayNum + '</div>' + events + '</div>';
    }

    grid.innerHTML = html;

    grid.querySelectorAll('.shifts-cal-day[data-date]').forEach(function (el) {
      el.addEventListener('click', function () {
        var d = el.getAttribute('data-date');
        if (d) openShiftModal(null, d);
      });
    });
  }

  function renderShiftsTable() {
    var tbody = document.getElementById('shifts-log-tbody');
    if (!tbody) return;
    var filterStaff = (document.getElementById('shifts-staff-filter') || {}).value || '';
    var monthInput = document.getElementById('shifts-hours-month');
    var mk = monthInput && monthInput.value ? monthInput.value : monthKeyFromDate(new Date());

    var list = getShifts().filter(function (sh) {
      if (toYmd(sh.date).slice(0, 7) !== mk) return false;
      if (filterStaff && sh.staffId !== filterStaff) return false;
      return true;
    }).sort(function (a, b) { return toYmd(a.date).localeCompare(toYmd(b.date)); });

    var conflicts = detectConflicts();
    var conflictMsgs = {};
    conflicts.forEach(function (c) { conflictMsgs[c.message] = true; });

    tbody.innerHTML = list.length ? list.map(function (sh) {
      var st = staffById(sh.staffId);
      var ymd = toYmd(sh.date);
      var rowConflict = requestsOnDate(ymd, sh.staffId).some(function (r) { return r.status !== 'rejected'; });
      return '<tr class="' + (rowConflict ? 'shifts-conflict-row' : '') + '">' +
        '<td>' + escapeHtml(ymd) + '</td>' +
        '<td>' + escapeHtml(st ? st.name : '—') + '</td>' +
        '<td>' + escapeHtml(sh.startTime || '') + ' – ' + escapeHtml(sh.endTime || '') + '</td>' +
        '<td>' + formatHours(shiftDurationMinutes(sh)) + '</td>' +
        '<td>' + escapeHtml(sh.notes || '') + '</td>' +
        '<td><button type="button" class="btn btn-ghost btn-sm shifts-edit-shift" data-id="' + escapeHtml(sh.id) + '">Edit</button> ' +
        '<button type="button" class="btn btn-danger btn-sm shifts-del-shift" data-id="' + escapeHtml(sh.id) + '">Delete</button></td></tr>';
    }).join('') : '<tr><td colspan="6">No shifts this month. Click + Log shift.</td></tr>';

    tbody.querySelectorAll('.shifts-edit-shift').forEach(function (btn) {
      btn.addEventListener('click', function () { openShiftModal(btn.getAttribute('data-id')); });
    });
    tbody.querySelectorAll('.shifts-del-shift').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!confirm('Delete this shift?')) return;
        saveShifts(getShifts().filter(function (x) { return x.id !== btn.getAttribute('data-id'); }));
        render();
      });
    });
  }

  function renderRequests() {
    var tbody = document.getElementById('shifts-requests-tbody');
    if (!tbody) return;
    var filterStaff = (document.getElementById('shifts-staff-filter') || {}).value || '';
    var list = getRequests().slice().sort(function (a, b) {
      return (b.requestedAt || '').localeCompare(a.requestedAt || '');
    });
    if (filterStaff) list = list.filter(function (r) { return r.staffId === filterStaff; });

    tbody.innerHTML = list.length ? list.map(function (r) {
      var st = staffById(r.staffId);
      var statusCls = 'shifts-status shifts-status--' + (r.status || 'pending');
      var adminBtns = (r.status === 'pending')
        ? ' <button type="button" class="btn btn-ghost btn-sm shifts-approve-btn" data-id="' + escapeHtml(r.id) + '">Approve</button>' +
          ' <button type="button" class="btn btn-ghost btn-sm shifts-reject-btn" data-id="' + escapeHtml(r.id) + '">Reject</button>'
        : '';
      return '<tr><td>' + escapeHtml(st ? st.name : '—') + '</td>' +
        '<td>' + escapeHtml(REQUEST_TYPES[r.type] || r.type) + '</td>' +
        '<td>' + escapeHtml(toYmd(r.startDate)) + '</td>' +
        '<td>' + escapeHtml(toYmd(r.endDate || r.startDate)) + '</td>' +
        '<td><span class="' + statusCls + '">' + escapeHtml(r.status || 'pending') + '</span></td>' +
        '<td>' + escapeHtml(r.notes || '') + '</td>' +
        '<td>' + adminBtns +
        ' <button type="button" class="btn btn-ghost btn-sm shifts-del-req" data-id="' + escapeHtml(r.id) + '">Delete</button></td></tr>';
    }).join('') : '<tr><td colspan="7">No requests yet.</td></tr>';

    bindRequestActions(tbody);
    tbody.querySelectorAll('.shifts-del-req').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!confirm('Delete this request?')) return;
        saveRequests(getRequests().filter(function (x) { return x.id !== btn.getAttribute('data-id'); }));
        render();
      });
    });
  }

  function renderHours() {
    var tbody = document.getElementById('shifts-hours-tbody');
    var summary = document.getElementById('shifts-hours-summary');
    if (!tbody) return;

    var monthInput = document.getElementById('shifts-hours-month');
    var mk = monthInput && monthInput.value ? monthInput.value : monthKeyFromDate(new Date());
    var settings = getSettings();
    var staff = getStaff();
    var shifts = getShifts();
    var requests = getRequests();

    var rows = staff.map(function (st) {
      var mins = 0;
      var shiftCount = 0;
      var sickDays = 0;
      var holidayDays = 0;
      var offDays = 0;

      shifts.forEach(function (sh) {
        if (sh.staffId !== st.id) return;
        if (toYmd(sh.date).slice(0, 7) !== mk) return;
        mins += shiftDurationMinutes(sh);
        shiftCount++;
      });

      requests.forEach(function (r) {
        if (r.staffId !== st.id || r.status === 'rejected') return;
        datesInRange(toYmd(r.startDate), toYmd(r.endDate || r.startDate)).forEach(function (ymd) {
          if (ymd.slice(0, 7) !== mk) return;
          if (r.type === 'sick') sickDays++;
          else if (r.type === 'holiday') holidayDays++;
          else if (r.type === 'day_off') offDays++;
        });
      });

      var standardMins = (settings.standardHoursPerDay || 8) * 60 * 22;
      var overtime = mins > standardMins ? mins - standardMins : 0;

      return {
        st: st,
        mins: mins,
        shiftCount: shiftCount,
        sickDays: sickDays,
        holidayDays: holidayDays,
        offDays: offDays,
        overtime: overtime
      };
    });

    tbody.innerHTML = rows.length ? rows.map(function (row) {
      return '<tr><td>' + escapeHtml(row.st.name) + '</td>' +
        '<td>' + row.shiftCount + '</td>' +
        '<td class="shifts-hours-total">' + formatHours(row.mins) + '</td>' +
        '<td>' + (row.overtime > 0 ? formatHours(row.overtime) + ' approx.' : '—') + '</td>' +
        '<td>' + row.sickDays + '</td>' +
        '<td>' + row.holidayDays + '</td>' +
        '<td>' + row.offDays + '</td></tr>';
    }).join('') : '<tr><td colspan="7">Add team members in Settings.</td></tr>';

    var totalMins = rows.reduce(function (s, r) { return s + r.mins; }, 0);
    if (summary) {
      summary.textContent = 'Team total for ' + mk + ': ' + formatHours(totalMins) + ' across ' + rows.length + ' member(s).';
    }
  }

  function renderAvailability() {
    var dateEl = document.getElementById('shifts-avail-date');
    var list = document.getElementById('shifts-avail-list');
    if (!list) return;
    var ymd = dateEl && dateEl.value ? toYmd(dateEl.value) : toYmd(new Date().toISOString());
    var staff = getStaff();

    list.innerHTML = staff.map(function (st) {
      var leave = requestsOnDate(ymd, st.id).filter(function (r) { return r.status !== 'rejected'; });
      var onShift = shiftsOnDate(ymd, st.id);
      var status;
      if (leave.length) status = 'Away — ' + (REQUEST_TYPES[leave[0].type] || leave[0].type) + (leave[0].status === 'pending' ? ' (pending)' : '');
      else if (onShift.length) status = 'Working — ' + onShift.map(function (s) { return s.startTime + '–' + s.endTime; }).join(', ');
      else status = 'No shift / available';
      return '<li><strong>' + escapeHtml(st.name) + '</strong>: ' + escapeHtml(status) + '</li>';
    }).join('') || '<li>Add team members in Settings.</li>';
  }

  function renderSettings() {
    var tbody = document.getElementById('shifts-staff-tbody');
    var hol = document.getElementById('shifts-company-holidays');
    var std = document.getElementById('shifts-settings-standard-hours');
    var ot = document.getElementById('shifts-settings-overtime');
    var settings = getSettings();

    if (std) std.value = settings.standardHoursPerDay != null ? settings.standardHoursPerDay : 8;
    if (ot) ot.value = settings.overtimeThresholdWeekly != null ? settings.overtimeThresholdWeekly : 40;
    if (hol) {
      hol.value = (settings.companyHolidays || []).join('\n');
    }

    if (!tbody) return;
    tbody.innerHTML = getStaff().map(function (s) {
      return '<tr><td>' + escapeHtml(s.name) + '</td><td>' + escapeHtml(s.department || '—') + '</td>' +
        '<td>' + escapeHtml(s.employeeId || '—') + '</td>' +
        '<td><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:' + escapeHtml(staffColor(s)) + '"></span></td>' +
        '<td><button type="button" class="btn btn-ghost btn-sm shifts-edit-staff" data-id="' + escapeHtml(s.id) + '">Edit</button> ' +
        '<button type="button" class="btn btn-danger btn-sm shifts-del-staff" data-id="' + escapeHtml(s.id) + '">Remove</button></td></tr>';
    }).join('') || '<tr><td colspan="5">No team members. Import from HR or add manually.</td></tr>';

    tbody.querySelectorAll('.shifts-edit-staff').forEach(function (btn) {
      btn.addEventListener('click', function () { openStaffModal(btn.getAttribute('data-id')); });
    });
    tbody.querySelectorAll('.shifts-del-staff').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var sid = btn.getAttribute('data-id');
        if (!confirm('Remove this team member? Their shifts and requests remain until deleted separately.')) return;
        saveStaff(getStaff().filter(function (x) { return x.id !== sid; }));
        render();
      });
    });
  }

  function openModal(title, fieldsHtml, onSave) {
    var overlay = document.getElementById('shifts-modal-overlay');
    var body = document.getElementById('shifts-modal-body');
    if (!overlay || !body) return;
    body.innerHTML = '<h3 class="panel-title" style="margin-bottom:1rem">' + escapeHtml(title) + '</h3>' + fieldsHtml;
    overlay.style.display = 'flex';
    var saveBtn = document.getElementById('shifts-modal-save');
    var cancelBtn = document.getElementById('shifts-modal-cancel');
    function close() { overlay.style.display = 'none'; }
    if (cancelBtn) cancelBtn.onclick = close;
    if (saveBtn) {
      saveBtn.onclick = function () {
        if (onSave(close)) close();
      };
    }
  }

  function staffOptionsHtml(selectedId) {
    return getStaff().map(function (s) {
      return '<option value="' + escapeHtml(s.id) + '"' + (s.id === selectedId ? ' selected' : '') + '>' + escapeHtml(s.name) + '</option>';
    }).join('');
  }

  function openShiftModal(editId, presetDate) {
    modalMode = 'shift';
    modalEditId = editId || null;
    var sh = editId ? getShifts().filter(function (x) { return x.id === editId; })[0] : null;
    var sid = sh ? sh.staffId : (getActiveStaffId() || (getStaff()[0] && getStaff()[0].id));
    var html =
      '<div class="form-group"><label>Team member</label><select id="shifts-f-staff">' + staffOptionsHtml(sid) + '</select></div>' +
      '<div class="form-row"><div class="form-group"><label>Date</label><input type="date" id="shifts-f-date" value="' + escapeHtml(sh ? toYmd(sh.date) : (presetDate || toYmd(new Date().toISOString()))) + '"></div>' +
      '<div class="form-group"><label>Break (minutes)</label><input type="number" id="shifts-f-break" min="0" value="' + (sh ? (sh.breakMinutes || 0) : 0) + '"></div></div>' +
      '<div class="form-row"><div class="form-group"><label>Start</label><input type="time" id="shifts-f-start" value="' + escapeHtml(sh ? sh.startTime || '09:00' : '09:00') + '"></div>' +
      '<div class="form-group"><label>End</label><input type="time" id="shifts-f-end" value="' + escapeHtml(sh ? sh.endTime || '17:00' : '17:00') + '"></div></div>' +
      '<div class="form-group"><label>Notes</label><textarea id="shifts-f-notes" rows="2">' + escapeHtml(sh ? sh.notes || '' : '') + '</textarea></div>';

    openModal(editId ? 'Edit shift' : 'Log shift', html, function () {
      var staffId = (document.getElementById('shifts-f-staff') || {}).value;
      var date = toYmd((document.getElementById('shifts-f-date') || {}).value);
      var startTime = (document.getElementById('shifts-f-start') || {}).value;
      var endTime = (document.getElementById('shifts-f-end') || {}).value;
      if (!staffId || !date || !startTime || !endTime) {
        alert('Please fill team member, date, start and end.');
        return false;
      }
      var list = getShifts();
      var rec = {
        id: modalEditId || id(),
        staffId: staffId,
        date: date,
        startTime: startTime,
        endTime: endTime,
        breakMinutes: parseInt((document.getElementById('shifts-f-break') || {}).value, 10) || 0,
        notes: (document.getElementById('shifts-f-notes') || {}).value.trim()
      };
      var idx = list.map(function (x) { return x.id; }).indexOf(rec.id);
      if (idx >= 0) list[idx] = rec; else list.push(rec);
      saveShifts(list);
      render();
      return true;
    });
  }

  function openRequestModal(editId) {
    modalEditId = editId || null;
    var r = editId ? getRequests().filter(function (x) { return x.id === editId; })[0] : null;
    var sid = r ? r.staffId : (getActiveStaffId() || (getStaff()[0] && getStaff()[0].id));
    var typeOpts = Object.keys(REQUEST_TYPES).map(function (k) {
      return '<option value="' + k + '"' + (r && r.type === k ? ' selected' : '') + '>' + escapeHtml(REQUEST_TYPES[k]) + '</option>';
    }).join('');
    var html =
      '<div class="form-group"><label>Team member</label><select id="shifts-f-staff">' + staffOptionsHtml(sid) + '</select></div>' +
      '<div class="form-group"><label>Type</label><select id="shifts-f-type">' + typeOpts + '</select></div>' +
      '<div class="form-row"><div class="form-group"><label>From</label><input type="date" id="shifts-f-from" value="' + escapeHtml(r ? toYmd(r.startDate) : toYmd(new Date().toISOString())) + '"></div>' +
      '<div class="form-group"><label>To</label><input type="date" id="shifts-f-to" value="' + escapeHtml(r ? toYmd(r.endDate || r.startDate) : toYmd(new Date().toISOString())) + '"></div></div>' +
      '<div class="form-group"><label>Notes</label><textarea id="shifts-f-notes" rows="2">' + escapeHtml(r ? r.notes || '' : '') + '</textarea></div>';

    openModal(editId ? 'Edit request' : 'New time-off request', html, function () {
      var staffId = (document.getElementById('shifts-f-staff') || {}).value;
      var type = (document.getElementById('shifts-f-type') || {}).value;
      var from = toYmd((document.getElementById('shifts-f-from') || {}).value);
      var to = toYmd((document.getElementById('shifts-f-to') || {}).value);
      if (!staffId || !from || !to) {
        alert('Please fill team member and dates.');
        return false;
      }
      if (to < from) {
        alert('End date must be on or after start date.');
        return false;
      }
      var list = getRequests();
      var rec = {
        id: modalEditId || id(),
        staffId: staffId,
        type: type,
        startDate: from,
        endDate: to,
        status: r ? r.status : 'pending',
        notes: (document.getElementById('shifts-f-notes') || {}).value.trim(),
        requestedAt: r ? r.requestedAt : new Date().toISOString()
      };
      var idx = list.map(function (x) { return x.id; }).indexOf(rec.id);
      if (idx >= 0) list[idx] = rec; else list.push(rec);
      saveRequests(list);
      render();
      return true;
    });
  }

  function openStaffModal(editId) {
    var s = editId ? getStaff().filter(function (x) { return x.id === editId; })[0] : null;
    var html =
      '<div class="form-group"><label>Name</label><input type="text" id="shifts-f-name" value="' + escapeHtml(s ? s.name : '') + '"></div>' +
      '<div class="form-group"><label>Department / role</label><input type="text" id="shifts-f-dept" value="' + escapeHtml(s ? s.department || '' : '') + '"></div>' +
      '<div class="form-group"><label>HR employee ID (optional)</label><input type="text" id="shifts-f-empid" value="' + escapeHtml(s ? s.employeeId || '' : '') + '"></div>' +
      '<div class="form-group"><label>Calendar colour</label><input type="color" id="shifts-f-color" value="' + escapeHtml(s ? s.color || staffColor(s) : '#2563eb') + '"></div>';
    openModal(editId ? 'Edit team member' : 'Add team member', html, function () {
      var name = (document.getElementById('shifts-f-name') || {}).value.trim();
      if (!name) { alert('Name is required.'); return false; }
      var list = getStaff();
      var rec = {
        id: editId || id(),
        name: name,
        department: (document.getElementById('shifts-f-dept') || {}).value.trim(),
        employeeId: (document.getElementById('shifts-f-empid') || {}).value.trim(),
        color: (document.getElementById('shifts-f-color') || {}).value
      };
      var idx = list.map(function (x) { return x.id; }).indexOf(rec.id);
      if (idx >= 0) list[idx] = rec; else list.push(rec);
      saveStaff(list);
      render();
      return true;
    });
  }

  function importFromHr() {
    try {
      var raw = localStorage.getItem('employees');
      var emps = raw ? JSON.parse(raw) : [];
      if (!emps.length) {
        alert('No HR employees found. Add employees under HR → Employees first.');
        return;
      }
      var staff = getStaff();
      var added = 0;
      emps.forEach(function (emp) {
        var name = ((emp.firstName || '') + ' ' + (emp.lastName || '')).trim();
        if (!name) return;
        var eid = emp.employeeId || '';
        if (staff.some(function (s) { return s.employeeId && s.employeeId === eid; })) return;
        if (staff.some(function (s) { return (s.name || '').toLowerCase() === name.toLowerCase(); })) return;
        staff.push({
          id: id(),
          name: name,
          department: '',
          employeeId: eid,
          color: staffColor({ id: name })
        });
        added++;
      });
      saveStaff(staff);
      alert(added ? 'Imported ' + added + ' team member(s) from HR.' : 'All HR employees are already in the team list.');
      render();
    } catch (e) {
      alert('Could not read HR employees.');
    }
  }

  function saveSettingsFromForm() {
    var hol = (document.getElementById('shifts-company-holidays') || {}).value || '';
    var dates = hol.split(/\r?\n/).map(function (l) { return toYmd(l.trim()); }).filter(Boolean);
    saveSettings({
      standardHoursPerDay: parseFloat((document.getElementById('shifts-settings-standard-hours') || {}).value) || 8,
      overtimeThresholdWeekly: parseFloat((document.getElementById('shifts-settings-overtime') || {}).value) || 40,
      companyHolidays: dates
    });
    alert('Settings saved.');
  }

  function exportHoursCsv() {
    var monthInput = document.getElementById('shifts-hours-month');
    var mk = monthInput && monthInput.value ? monthInput.value : monthKeyFromDate(new Date());
    var staff = getStaff();
    var lines = ['Name,Shifts,Hours,Sick days,Holiday days,Days off'];
    staff.forEach(function (st) {
      var mins = 0;
      var sc = 0;
      getShifts().forEach(function (sh) {
        if (sh.staffId !== st.id || toYmd(sh.date).slice(0, 7) !== mk) return;
        mins += shiftDurationMinutes(sh);
        sc++;
      });
      var sick = 0, hol = 0, off = 0;
      getRequests().forEach(function (r) {
        if (r.staffId !== st.id || r.status === 'rejected') return;
        datesInRange(toYmd(r.startDate), toYmd(r.endDate || r.startDate)).forEach(function (ymd) {
          if (ymd.slice(0, 7) !== mk) return;
          if (r.type === 'sick') sick++;
          else if (r.type === 'holiday') hol++;
          else if (r.type === 'day_off') off++;
        });
      });
      lines.push([
        '"' + (st.name || '').replace(/"/g, '""') + '"',
        sc,
        (mins / 60).toFixed(2),
        sick,
        hol,
        off
      ].join(','));
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'shifts-hours-' + mk + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function init() {
    var page = document.getElementById('page-shifts');
    if (!page) return;
    if (didInit) {
      render();
      return;
    }
    didInit = true;

    var monthInput = document.getElementById('shifts-hours-month');
    if (monthInput && !monthInput.value) monthInput.value = monthKeyFromDate(new Date());

    var availDate = document.getElementById('shifts-avail-date');
    if (availDate && !availDate.value) availDate.value = toYmd(new Date().toISOString());

    var staffFilter = document.getElementById('shifts-staff-filter');
    if (staffFilter) {
      staffFilter.addEventListener('change', function () {
        setActiveStaffId(staffFilter.value);
        render();
      });
    }
    if (monthInput) monthInput.addEventListener('change', render);
    if (availDate) availDate.addEventListener('change', render);

    function bindClick(id, fn) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    }
    bindClick('shifts-add-shift', function () { openShiftModal(); });
    bindClick('shifts-add-shift-2', function () { openShiftModal(); });
    bindClick('shifts-add-request', function () { openRequestModal(); });
    bindClick('shifts-add-request-2', function () { openRequestModal(); });
    var addStaff = document.getElementById('shifts-add-staff');
    if (addStaff) addStaff.addEventListener('click', function () { openStaffModal(); });
    var importHr = document.getElementById('shifts-import-hr');
    if (importHr) importHr.addEventListener('click', importFromHr);
    var saveSet = document.getElementById('shifts-save-settings');
    if (saveSet) saveSet.addEventListener('click', saveSettingsFromForm);
    var exportCsv = document.getElementById('shifts-export-csv');
    if (exportCsv) exportCsv.addEventListener('click', exportHoursCsv);

    var calPrev = document.getElementById('shifts-cal-prev');
    var calNext = document.getElementById('shifts-cal-next');
    if (calPrev) calPrev.addEventListener('click', function () {
      var p = getCalMonth().split('-');
      var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 2, 1);
      setCalMonth(monthKeyFromDate(d));
      renderCalendar();
    });
    if (calNext) calNext.addEventListener('click', function () {
      var p = getCalMonth().split('-');
      var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10), 1);
      setCalMonth(monthKeyFromDate(d));
      renderCalendar();
    });

    setSection(currentSection);
  }

  window.ShiftsManagement = {
    init: init,
    render: render,
    setSection: setSection
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
