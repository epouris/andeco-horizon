/**
 * HR Tools — Leave, Documents, Onboarding, Notes, Announcements
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'andeco_hr_tools';
  var bound = false;
  var editing = {
    leave: null,
    documents: null,
    onboarding: null,
    notes: null,
    announcements: null
  };

  function id(prefix) {
    return (prefix || 'hr') + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function persistAllIfFile() {
    try {
      if (window.AccountingData && window.AccountingData.persistAll) window.AccountingData.persistAll();
    } catch (e) {}
  }

  function emptyState() {
    return {
      leave: [],
      documents: [],
      onboarding: [],
      notes: [],
      announcements: []
    };
  }

  function normalize(data) {
    data = data && typeof data === 'object' ? data : {};
    return {
      leave: Array.isArray(data.leave) ? data.leave : [],
      documents: Array.isArray(data.documents) ? data.documents : [],
      onboarding: Array.isArray(data.onboarding) ? data.onboarding : [],
      notes: Array.isArray(data.notes) ? data.notes : [],
      announcements: Array.isArray(data.announcements) ? data.announcements : []
    };
  }

  function getData() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) {}
    return emptyState();
  }

  function saveData(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalize(data)));
    } catch (e) {}
    persistAllIfFile();
  }

  function getEmployees() {
    try {
      if (typeof window.getEmployeesList === 'function') return window.getEmployeesList() || [];
      var raw = localStorage.getItem('employees');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function employeeName(employeeId) {
    if (!employeeId) return '—';
    var list = getEmployees();
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e) continue;
      if (String(e.employeeId) === String(employeeId) || String(e.id) === String(employeeId)) {
        var n = ((e.firstName || '') + ' ' + (e.lastName || '')).trim();
        return n || String(employeeId);
      }
    }
    return String(employeeId);
  }

  function formatDate(val) {
    if (!val) return '—';
    if (window.AndecoDate && window.AndecoDate.formatDate) return window.AndecoDate.formatDate(val) || '—';
    try {
      var d = new Date(val);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) {
      return '—';
    }
  }

  function dayCount(start, end) {
    var a = new Date(start);
    var b = new Date(end);
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return '—';
    var diff = Math.round((b - a) / 86400000) + 1;
    return diff > 0 ? String(diff) : '—';
  }

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  function fillEmployeeSelect(selectId, selected) {
    var sel = document.getElementById(selectId);
    if (!sel) return;
    var list = getEmployees().slice().sort(function (a, b) {
      var an = ((a && a.firstName) || '') + ' ' + ((a && a.lastName) || '');
      var bn = ((b && b.firstName) || '') + ' ' + ((b && b.lastName) || '');
      return an.localeCompare(bn);
    });
    sel.innerHTML = '<option value="">-- Select employee --</option>';
    list.forEach(function (emp) {
      if (!emp || !emp.employeeId) return;
      var opt = document.createElement('option');
      opt.value = emp.employeeId;
      opt.textContent = ((emp.firstName || '') + ' ' + (emp.lastName || '')).trim() + ' (' + emp.employeeId + ')';
      sel.appendChild(opt);
    });
    if (selected) sel.value = selected;
  }

  function showForm(wrapId, show) {
    var el = document.getElementById(wrapId);
    if (el) el.style.display = show ? '' : 'none';
  }

  function statusBadge(text, kind) {
    return '<span class="hr-tool-badge hr-tool-badge--' + escapeHtml(kind || 'neutral') + '">' + escapeHtml(text) + '</span>';
  }

  function leaveThisWeekCount() {
    var items = getData().leave || [];
    var now = new Date();
    var start = new Date(now);
    start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    start.setHours(0, 0, 0, 0);
    var end = new Date(start);
    end.setDate(start.getDate() + 7);
    return items.filter(function (row) {
      if (!row || row.status === 'rejected') return false;
      var a = new Date(row.startDate);
      var b = new Date(row.endDate || row.startDate);
      if (isNaN(a.getTime()) || isNaN(b.getTime())) return false;
      return a < end && b >= start;
    }).length;
  }

  function refreshOverviewLeaveMetric() {
    var el = document.getElementById('hr-metric-leave');
    if (el) el.textContent = String(leaveThisWeekCount());
  }

  /* —— Leave —— */
  function renderLeave() {
    fillEmployeeSelect('hr-leave-employee', editing.leave && editing.leave.employeeId);
    var tbody = document.getElementById('hr-leave-tbody');
    if (!tbody) return;
    var rows = getData().leave.slice().sort(function (a, b) {
      return String(b.startDate || '').localeCompare(String(a.startDate || ''));
    });
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8">No leave records yet.</td></tr>';
      return;
    }
    var typeLabels = { annual: 'Annual', sick: 'Sick', unpaid: 'Unpaid', other: 'Other' };
    tbody.innerHTML = rows.map(function (row) {
      return '<tr data-id="' + escapeHtml(row.id) + '">' +
        '<td>' + escapeHtml(employeeName(row.employeeId)) + '</td>' +
        '<td>' + escapeHtml(typeLabels[row.type] || row.type || '—') + '</td>' +
        '<td>' + escapeHtml(formatDate(row.startDate)) + '</td>' +
        '<td>' + escapeHtml(formatDate(row.endDate)) + '</td>' +
        '<td>' + escapeHtml(dayCount(row.startDate, row.endDate)) + '</td>' +
        '<td>' + statusBadge(row.status || 'pending', row.status || 'pending') + '</td>' +
        '<td>' + escapeHtml(row.notes || '') + '</td>' +
        '<td class="hr-tool-actions">' +
          '<button type="button" class="btn btn-secondary btn-sm" data-hr-edit="leave">Edit</button> ' +
          '<button type="button" class="btn btn-ghost btn-sm" data-hr-del="leave">Delete</button>' +
        '</td></tr>';
    }).join('');
  }

  function openLeaveForm(row) {
    editing.leave = row || null;
    showForm('hr-leave-form-wrap', true);
    fillEmployeeSelect('hr-leave-employee', row && row.employeeId);
    document.getElementById('hr-leave-id').value = row ? row.id : '';
    document.getElementById('hr-leave-type').value = (row && row.type) || 'annual';
    document.getElementById('hr-leave-status').value = (row && row.status) || 'pending';
    document.getElementById('hr-leave-start').value = (row && row.startDate) || todayIso();
    document.getElementById('hr-leave-end').value = (row && row.endDate) || todayIso();
    document.getElementById('hr-leave-notes').value = (row && row.notes) || '';
  }

  function saveLeave(e) {
    e.preventDefault();
    var employeeId = document.getElementById('hr-leave-employee').value;
    var startDate = document.getElementById('hr-leave-start').value;
    var endDate = document.getElementById('hr-leave-end').value;
    if (!employeeId || !startDate || !endDate) return;
    var data = getData();
    var existingId = document.getElementById('hr-leave-id').value;
    var record = {
      id: existingId || id('leave'),
      employeeId: employeeId,
      type: document.getElementById('hr-leave-type').value,
      status: document.getElementById('hr-leave-status').value,
      startDate: startDate,
      endDate: endDate,
      notes: document.getElementById('hr-leave-notes').value.trim()
    };
    if (existingId) {
      data.leave = data.leave.map(function (r) { return r.id === existingId ? record : r; });
    } else {
      data.leave.push(record);
    }
    saveData(data);
    editing.leave = null;
    showForm('hr-leave-form-wrap', false);
    renderLeave();
    refreshOverviewLeaveMetric();
  }

  /* —— Documents —— */
  function renderDocuments() {
    fillEmployeeSelect('hr-doc-employee', editing.documents && editing.documents.employeeId);
    var tbody = document.getElementById('hr-doc-tbody');
    if (!tbody) return;
    var rows = getData().documents.slice().sort(function (a, b) {
      return String(a.employeeId || '').localeCompare(String(b.employeeId || ''));
    });
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6">No document checklist items yet.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (row) {
      return '<tr data-id="' + escapeHtml(row.id) + '">' +
        '<td>' + escapeHtml(employeeName(row.employeeId)) + '</td>' +
        '<td>' + escapeHtml(row.name || '') + '</td>' +
        '<td>' + statusBadge(row.status || 'missing', row.status || 'missing') + '</td>' +
        '<td>' + escapeHtml(formatDate(row.dueDate)) + '</td>' +
        '<td>' + escapeHtml(row.notes || '') + '</td>' +
        '<td class="hr-tool-actions">' +
          '<button type="button" class="btn btn-secondary btn-sm" data-hr-edit="documents">Edit</button> ' +
          '<button type="button" class="btn btn-ghost btn-sm" data-hr-del="documents">Delete</button>' +
        '</td></tr>';
    }).join('');
  }

  function openDocForm(row) {
    editing.documents = row || null;
    showForm('hr-doc-form-wrap', true);
    fillEmployeeSelect('hr-doc-employee', row && row.employeeId);
    document.getElementById('hr-doc-id').value = row ? row.id : '';
    document.getElementById('hr-doc-name').value = (row && row.name) || '';
    document.getElementById('hr-doc-status').value = (row && row.status) || 'missing';
    document.getElementById('hr-doc-due').value = (row && row.dueDate) || '';
    document.getElementById('hr-doc-notes').value = (row && row.notes) || '';
  }

  function saveDoc(e) {
    e.preventDefault();
    var employeeId = document.getElementById('hr-doc-employee').value;
    var name = document.getElementById('hr-doc-name').value.trim();
    if (!employeeId || !name) return;
    var data = getData();
    var existingId = document.getElementById('hr-doc-id').value;
    var record = {
      id: existingId || id('doc'),
      employeeId: employeeId,
      name: name,
      status: document.getElementById('hr-doc-status').value,
      dueDate: document.getElementById('hr-doc-due').value,
      notes: document.getElementById('hr-doc-notes').value.trim()
    };
    if (existingId) {
      data.documents = data.documents.map(function (r) { return r.id === existingId ? record : r; });
    } else {
      data.documents.push(record);
    }
    saveData(data);
    editing.documents = null;
    showForm('hr-doc-form-wrap', false);
    renderDocuments();
  }

  /* —— Onboarding —— */
  function renderOnboarding() {
    fillEmployeeSelect('hr-onboard-employee', editing.onboarding && editing.onboarding.employeeId);
    var tbody = document.getElementById('hr-onboard-tbody');
    if (!tbody) return;
    var rows = getData().onboarding.slice();
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6">No onboarding tasks yet.</td></tr>';
      return;
    }
    var statusLabels = { todo: 'To do', in_progress: 'In progress', done: 'Done' };
    tbody.innerHTML = rows.map(function (row) {
      return '<tr data-id="' + escapeHtml(row.id) + '">' +
        '<td>' + escapeHtml(employeeName(row.employeeId)) + '</td>' +
        '<td>' + escapeHtml(row.task || '') + '</td>' +
        '<td>' + statusBadge(statusLabels[row.status] || row.status || 'todo', row.status || 'todo') + '</td>' +
        '<td>' + escapeHtml(formatDate(row.dueDate)) + '</td>' +
        '<td>' + escapeHtml(row.owner || '') + '</td>' +
        '<td class="hr-tool-actions">' +
          '<button type="button" class="btn btn-secondary btn-sm" data-hr-edit="onboarding">Edit</button> ' +
          '<button type="button" class="btn btn-ghost btn-sm" data-hr-del="onboarding">Delete</button>' +
        '</td></tr>';
    }).join('');
  }

  function openOnboardForm(row) {
    editing.onboarding = row || null;
    showForm('hr-onboard-form-wrap', true);
    fillEmployeeSelect('hr-onboard-employee', row && row.employeeId);
    document.getElementById('hr-onboard-id').value = row ? row.id : '';
    document.getElementById('hr-onboard-task').value = (row && row.task) || '';
    document.getElementById('hr-onboard-status').value = (row && row.status) || 'todo';
    document.getElementById('hr-onboard-due').value = (row && row.dueDate) || '';
    document.getElementById('hr-onboard-owner').value = (row && row.owner) || '';
  }

  function saveOnboard(e) {
    e.preventDefault();
    var employeeId = document.getElementById('hr-onboard-employee').value;
    var task = document.getElementById('hr-onboard-task').value.trim();
    if (!employeeId || !task) return;
    var data = getData();
    var existingId = document.getElementById('hr-onboard-id').value;
    var record = {
      id: existingId || id('onb'),
      employeeId: employeeId,
      task: task,
      status: document.getElementById('hr-onboard-status').value,
      dueDate: document.getElementById('hr-onboard-due').value,
      owner: document.getElementById('hr-onboard-owner').value.trim()
    };
    if (existingId) {
      data.onboarding = data.onboarding.map(function (r) { return r.id === existingId ? record : r; });
    } else {
      data.onboarding.push(record);
    }
    saveData(data);
    editing.onboarding = null;
    showForm('hr-onboard-form-wrap', false);
    renderOnboarding();
  }

  /* —— Notes —— */
  function renderNotes() {
    fillEmployeeSelect('hr-note-employee', editing.notes && editing.notes.employeeId);
    var tbody = document.getElementById('hr-note-tbody');
    if (!tbody) return;
    var rows = getData().notes.slice().sort(function (a, b) {
      return String(b.date || '').localeCompare(String(a.date || ''));
    });
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5">No employee notes yet.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (row) {
      return '<tr data-id="' + escapeHtml(row.id) + '">' +
        '<td>' + escapeHtml(formatDate(row.date)) + '</td>' +
        '<td>' + escapeHtml(employeeName(row.employeeId)) + '</td>' +
        '<td>' + escapeHtml(row.category || 'general') + '</td>' +
        '<td>' + escapeHtml(row.text || '') + '</td>' +
        '<td class="hr-tool-actions">' +
          '<button type="button" class="btn btn-secondary btn-sm" data-hr-edit="notes">Edit</button> ' +
          '<button type="button" class="btn btn-ghost btn-sm" data-hr-del="notes">Delete</button>' +
        '</td></tr>';
    }).join('');
  }

  function openNoteForm(row) {
    editing.notes = row || null;
    showForm('hr-note-form-wrap', true);
    fillEmployeeSelect('hr-note-employee', row && row.employeeId);
    document.getElementById('hr-note-id').value = row ? row.id : '';
    document.getElementById('hr-note-category').value = (row && row.category) || 'general';
    document.getElementById('hr-note-date').value = (row && row.date) || todayIso();
    document.getElementById('hr-note-text').value = (row && row.text) || '';
  }

  function saveNote(e) {
    e.preventDefault();
    var employeeId = document.getElementById('hr-note-employee').value;
    var text = document.getElementById('hr-note-text').value.trim();
    if (!employeeId || !text) return;
    var data = getData();
    var existingId = document.getElementById('hr-note-id').value;
    var record = {
      id: existingId || id('note'),
      employeeId: employeeId,
      category: document.getElementById('hr-note-category').value,
      date: document.getElementById('hr-note-date').value || todayIso(),
      text: text
    };
    if (existingId) {
      data.notes = data.notes.map(function (r) { return r.id === existingId ? record : r; });
    } else {
      data.notes.push(record);
    }
    saveData(data);
    editing.notes = null;
    showForm('hr-note-form-wrap', false);
    renderNotes();
  }

  /* —— Announcements —— */
  function renderAnnouncements() {
    var tbody = document.getElementById('hr-announce-tbody');
    if (!tbody) return;
    var rows = getData().announcements.slice().sort(function (a, b) {
      return String(b.date || '').localeCompare(String(a.date || ''));
    });
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5">No announcements yet.</td></tr>';
      return;
    }
    var audienceLabels = { all: 'All staff', office: 'Office', operations: 'Operations', managers: 'Managers' };
    tbody.innerHTML = rows.map(function (row) {
      return '<tr data-id="' + escapeHtml(row.id) + '">' +
        '<td>' + escapeHtml(formatDate(row.date)) + '</td>' +
        '<td>' + escapeHtml(row.title || '') + '</td>' +
        '<td>' + escapeHtml(audienceLabels[row.audience] || row.audience || 'all') + '</td>' +
        '<td>' + escapeHtml(row.body || '') + '</td>' +
        '<td class="hr-tool-actions">' +
          '<button type="button" class="btn btn-secondary btn-sm" data-hr-edit="announcements">Edit</button> ' +
          '<button type="button" class="btn btn-ghost btn-sm" data-hr-del="announcements">Delete</button>' +
        '</td></tr>';
    }).join('');
  }

  function openAnnounceForm(row) {
    editing.announcements = row || null;
    showForm('hr-announce-form-wrap', true);
    document.getElementById('hr-announce-id').value = row ? row.id : '';
    document.getElementById('hr-announce-title').value = (row && row.title) || '';
    document.getElementById('hr-announce-date').value = (row && row.date) || todayIso();
    document.getElementById('hr-announce-audience').value = (row && row.audience) || 'all';
    document.getElementById('hr-announce-body').value = (row && row.body) || '';
  }

  function saveAnnounce(e) {
    e.preventDefault();
    var title = document.getElementById('hr-announce-title').value.trim();
    var body = document.getElementById('hr-announce-body').value.trim();
    if (!title || !body) return;
    var data = getData();
    var existingId = document.getElementById('hr-announce-id').value;
    var record = {
      id: existingId || id('ann'),
      title: title,
      date: document.getElementById('hr-announce-date').value || todayIso(),
      audience: document.getElementById('hr-announce-audience').value,
      body: body
    };
    if (existingId) {
      data.announcements = data.announcements.map(function (r) { return r.id === existingId ? record : r; });
    } else {
      data.announcements.push(record);
    }
    saveData(data);
    editing.announcements = null;
    showForm('hr-announce-form-wrap', false);
    renderAnnouncements();
  }

  function findById(collection, itemId) {
    var list = getData()[collection] || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === itemId) return list[i];
    }
    return null;
  }

  function deleteItem(collection, itemId) {
    if (!confirm('Delete this record?')) return;
    var data = getData();
    data[collection] = (data[collection] || []).filter(function (r) { return r.id !== itemId; });
    saveData(data);
    render(collection === 'leave' ? 'leave' : collection === 'documents' ? 'documents' : collection === 'onboarding' ? 'onboarding' : collection === 'notes' ? 'notes' : 'announcements');
    if (collection === 'leave') refreshOverviewLeaveMetric();
  }

  function bindEvents() {
    if (bound) return;
    bound = true;
    var page = document.getElementById('page-hr');
    if (!page) return;

    var addMap = {
      'hr-leave-add-btn': function () { openLeaveForm(null); },
      'hr-doc-add-btn': function () { openDocForm(null); },
      'hr-onboard-add-btn': function () { openOnboardForm(null); },
      'hr-note-add-btn': function () { openNoteForm(null); },
      'hr-announce-add-btn': function () { openAnnounceForm(null); }
    };
    var cancelMap = {
      'hr-leave-cancel-btn': function () { editing.leave = null; showForm('hr-leave-form-wrap', false); },
      'hr-doc-cancel-btn': function () { editing.documents = null; showForm('hr-doc-form-wrap', false); },
      'hr-onboard-cancel-btn': function () { editing.onboarding = null; showForm('hr-onboard-form-wrap', false); },
      'hr-note-cancel-btn': function () { editing.notes = null; showForm('hr-note-form-wrap', false); },
      'hr-announce-cancel-btn': function () { editing.announcements = null; showForm('hr-announce-form-wrap', false); }
    };

    page.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t) return;
      if (t.id && addMap[t.id]) { addMap[t.id](); return; }
      if (t.id && cancelMap[t.id]) { cancelMap[t.id](); return; }

      var editKind = t.getAttribute('data-hr-edit');
      var delKind = t.getAttribute('data-hr-del');
      var tr = t.closest('tr[data-id]');
      if (!tr) return;
      var itemId = tr.getAttribute('data-id');
      if (editKind) {
        var row = findById(editKind, itemId);
        if (editKind === 'leave') openLeaveForm(row);
        if (editKind === 'documents') openDocForm(row);
        if (editKind === 'onboarding') openOnboardForm(row);
        if (editKind === 'notes') openNoteForm(row);
        if (editKind === 'announcements') openAnnounceForm(row);
      }
      if (delKind) deleteItem(delKind, itemId);
    });

    var forms = [
      ['hr-leave-form', saveLeave],
      ['hr-doc-form', saveDoc],
      ['hr-onboard-form', saveOnboard],
      ['hr-note-form', saveNote],
      ['hr-announce-form', saveAnnounce]
    ];
    forms.forEach(function (pair) {
      var form = document.getElementById(pair[0]);
      if (form) form.addEventListener('submit', pair[1]);
    });
  }

  function render(sectionId) {
    bindEvents();
    refreshOverviewLeaveMetric();
    if (!sectionId || sectionId === 'leave') renderLeave();
    if (!sectionId || sectionId === 'documents') renderDocuments();
    if (!sectionId || sectionId === 'onboarding') renderOnboarding();
    if (!sectionId || sectionId === 'notes') renderNotes();
    if (!sectionId || sectionId === 'announcements') renderAnnouncements();
    if (sectionId === 'overview') refreshOverviewLeaveMetric();
  }

  function applyRemote(data) {
    saveData(normalize(data));
    render();
  }

  function getState() {
    return getData();
  }

  window.HrTools = {
    render: render,
    applyRemote: applyRemote,
    getState: getState,
    refreshOverviewLeaveMetric: refreshOverviewLeaveMetric
  };
})();
