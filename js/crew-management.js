/**
 * Crew Management — Central crew roster, documents with expiry reminders, vessel assignments.
 * Links with Fleet Management vessel Crew tab (assign crew to vessels).
 */
(function () {
  'use strict';

  var STORAGE_KEYS = {
    crewMembers: 'andeco_crew_members',
    crewDocuments: 'andeco_crew_documents',
    crewAssignments: 'andeco_crew_assignments',
    vessels: 'andeco_fleet_vessels'
  };

  function getCrewMembers() { try { var r = localStorage.getItem(STORAGE_KEYS.crewMembers); return r ? JSON.parse(r) : []; } catch (e) { return []; } }
  function saveCrewMembers(a) { try { localStorage.setItem(STORAGE_KEYS.crewMembers, JSON.stringify(a)); } catch (e) {} persistAllIfFile(); }
  function getCrewDocuments() { try { var r = localStorage.getItem(STORAGE_KEYS.crewDocuments); return r ? JSON.parse(r) : []; } catch (e) { return []; } }
  function saveCrewDocuments(a) { try { localStorage.setItem(STORAGE_KEYS.crewDocuments, JSON.stringify(a)); } catch (e) {} persistAllIfFile(); }
  function getCrewAssignments() { try { var r = localStorage.getItem(STORAGE_KEYS.crewAssignments); return r ? JSON.parse(r) : []; } catch (e) { return []; } }
  function saveCrewAssignments(a) { try { localStorage.setItem(STORAGE_KEYS.crewAssignments, JSON.stringify(a)); } catch (e) {} persistAllIfFile(); }
  function persistAllIfFile() { try { if (window.AccountingData && window.AccountingData.persistAll) window.AccountingData.persistAll(); } catch (e) {} }
  function getVessels() { try { var r = localStorage.getItem(STORAGE_KEYS.vessels); return r ? JSON.parse(r) : []; } catch (e) { return []; } }

  function escapeHtml(s) { if (s == null) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function id() { return 'c' + Date.now() + '-' + Math.random().toString(36).slice(2, 9); }
  function formatDateDDMMYYYY(dateString) {
    if (!dateString) return '';
    var d = new Date(dateString);
    if (isNaN(d.getTime())) return '';
    var day = ('0' + d.getDate()).slice(-2);
    var month = ('0' + (d.getMonth() + 1)).slice(-2);
    return day + '/' + month + '/' + d.getFullYear();
  }
  function toYyyyMmDd(val) {
    if (!val) return '';
    if (val.length === 10 && val.indexOf('-') === 4) return val;
    var d = new Date(val);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function daysToExpiry(expiryDate) {
    if (!expiryDate) return null;
    return Math.ceil((new Date(expiryDate) - new Date()) / (24 * 60 * 60 * 1000));
  }

  var selectedCrewId = null;

  function render() {
    var listWrap = document.getElementById('crew-list-wrap');
    var detailWrap = document.getElementById('crew-detail-wrap');
    var backBtn = document.getElementById('crew-back-to-list-btn');
    var titleEl = document.getElementById('crew-title');
    if (listWrap) listWrap.style.display = selectedCrewId ? 'none' : 'block';
    if (detailWrap) detailWrap.style.display = selectedCrewId ? 'block' : 'none';
    if (backBtn) backBtn.style.display = selectedCrewId ? '' : 'none';
    if (titleEl) {
      var crew = selectedCrewId ? getCrewMembers().filter(function (x) { return x.id === selectedCrewId; })[0] : null;
      titleEl.textContent = crew ? ('Crew / ' + (crew.name || 'Unnamed')) : 'Crew Management';
    }
    if (!selectedCrewId) {
      renderRoster();
      renderExpiryAlerts();
    } else {
      renderCrewDetail();
    }
  }

  function renderExpiryAlerts() {
    var alertsEl = document.getElementById('crew-expiry-alerts');
    if (!alertsEl) return;
    var docs = getCrewDocuments();
    var members = getCrewMembers();
    var expiring = [];
    docs.forEach(function (d) {
      var days = daysToExpiry(d.expiryDate);
      if (days !== null && days <= 90) {
        var member = members.filter(function (m) { return m.id === d.crewId; })[0];
        expiring.push({ doc: d, days: days, memberName: member ? member.name : '—' });
      }
    });
    expiring.sort(function (a, b) { return a.days - b.days; });
    if (expiring.length === 0) {
      alertsEl.innerHTML = '';
      alertsEl.style.display = 'none';
    } else {
      alertsEl.style.display = 'block';
      alertsEl.innerHTML = '<h4 class="panel-title">Document expiry reminders (next 90 days)</h4>' + expiring.slice(0, 15).map(function (x) {
        var cls = x.days < 0 ? 'crew-alert--expired' : (x.days <= 30 ? 'crew-alert--warn' : 'crew-alert--info');
        var msg = x.days < 0 ? 'Expired' : 'Expires in ' + x.days + ' days';
        return '<div class="crew-expiry-item ' + cls + '">' + escapeHtml(x.memberName) + ' — ' + escapeHtml(x.doc.name) + ' — ' + msg + '</div>';
      }).join('');
    }
  }

  function renderRoster() {
    var tbody = document.getElementById('crew-roster-tbody');
    var metricsEl = document.getElementById('crew-metrics');
    if (!tbody) return;
    var list = getCrewMembers();
    var docs = getCrewDocuments();
    var assignments = getCrewAssignments();
    if (metricsEl) {
      var onAssignment = assignments.length;
      metricsEl.innerHTML = '<span class="crew-metric">' + list.length + ' crew member(s)</span>' +
        (onAssignment > 0 ? '<span class="crew-metric">' + onAssignment + ' assignment(s)</span>' : '');
    }
    tbody.innerHTML = list.length ? list.map(function (m) {
      var crewDocs = docs.filter(function (d) { return d.crewId === m.id; });
      var nextExpiry = null;
      crewDocs.forEach(function (d) {
        var days = daysToExpiry(d.expiryDate);
        if (days !== null && (nextExpiry === null || days < nextExpiry)) nextExpiry = days;
      });
      var status = nextExpiry === null ? '—' : (nextExpiry < 0 ? 'Expired' : nextExpiry + ' days');
      var vesselCount = assignments.filter(function (a) { return a.crewMemberId === m.id; }).length;
      return '<tr data-id="' + escapeHtml(m.id) + '"><td>' + escapeHtml(m.name || '—') + '</td><td>' + escapeHtml(m.role || '—') + '</td><td>' + escapeHtml(m.contact || '—') + '</td><td>' + crewDocs.length + '</td><td>' + escapeHtml(String(status)) + '</td><td>' + vesselCount + '</td><td><button type="button" class="btn btn-ghost btn-sm crew-btn-docs" data-id="' + escapeHtml(m.id) + '">Documents</button> <button type="button" class="btn btn-ghost btn-sm crew-btn-edit" data-id="' + escapeHtml(m.id) + '">Edit</button> <button type="button" class="btn btn-ghost btn-sm crew-btn-delete" data-id="' + escapeHtml(m.id) + '">Delete</button></td></tr>';
    }).join('') : '<tr><td colspan="7">No crew members. Add your first crew member to get started.</td></tr>';
    tbody.querySelectorAll('tr[data-id]').forEach(function (row) {
      var mid = row.getAttribute('data-id');
      row.addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        selectedCrewId = mid;
        render();
      });
    });
    tbody.querySelectorAll('.crew-btn-docs').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); selectedCrewId = btn.getAttribute('data-id'); render(); });
    });
    tbody.querySelectorAll('.crew-btn-edit').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); openEditCrewModal(btn.getAttribute('data-id')); });
    });
    tbody.querySelectorAll('.crew-btn-delete').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!confirm('Delete this crew member? Their documents and assignments will also be removed.')) return;
        var mid = btn.getAttribute('data-id');
        saveCrewMembers(getCrewMembers().filter(function (x) { return x.id !== mid; }));
        saveCrewDocuments(getCrewDocuments().filter(function (x) { return x.crewId !== mid; }));
        saveCrewAssignments(getCrewAssignments().filter(function (x) { return x.crewMemberId !== mid; }));
        render();
      });
    });
  }

  function renderCrewDetail() {
    var crew = getCrewMembers().filter(function (x) { return x.id === selectedCrewId; })[0];
    if (!crew) { selectedCrewId = null; return render(); }
    var profileEl = document.getElementById('crew-detail-profile');
    if (profileEl) profileEl.innerHTML = '<p><strong>Name:</strong> ' + escapeHtml(crew.name || '—') + '</p><p><strong>Role / Rank:</strong> ' + escapeHtml(crew.role || '—') + '</p><p><strong>Contact:</strong> ' + escapeHtml(crew.contact || '—') + '</p><button type="button" class="btn btn-secondary" id="crew-detail-edit-btn">Edit profile</button>';
    var editBtn = document.getElementById('crew-detail-edit-btn');
    if (editBtn) editBtn.addEventListener('click', function () { openEditCrewModal(selectedCrewId); });
    renderCrewDocumentsPanel();
    renderCrewAssignmentsPanel();
  }

  function renderCrewDocumentsPanel() {
    var alertsEl = document.getElementById('crew-detail-expiry-alerts');
    var tbody = document.getElementById('crew-documents-tbody');
    if (!tbody) return;
    var list = getCrewDocuments().filter(function (d) { return d.crewId === selectedCrewId; });
    var expiring = [];
    list.forEach(function (d) { var days = daysToExpiry(d.expiryDate); if (days !== null && days <= 90) expiring.push({ doc: d, days: days }); });
    expiring.sort(function (a, b) { return a.days - b.days; });
    if (alertsEl) {
      if (expiring.length === 0) { alertsEl.innerHTML = ''; alertsEl.style.display = 'none'; }
      else {
        alertsEl.style.display = 'block';
        alertsEl.innerHTML = '<h4 class="panel-title">Expiry reminders</h4>' + expiring.map(function (x) {
          var cls = x.days < 0 ? 'crew-alert--expired' : (x.days <= 30 ? 'crew-alert--warn' : 'crew-alert--info');
          var msg = x.days < 0 ? 'Expired' : 'Expires in ' + x.days + ' days';
          return '<div class="crew-expiry-item ' + cls + '">' + escapeHtml(x.doc.name) + ' — ' + msg + '</div>';
        }).join('');
      }
    }
    tbody.innerHTML = list.length ? list.map(function (d) {
      var days = daysToExpiry(d.expiryDate);
      var status = '—';
      if (days !== null) { if (days < 0) status = '<span class="crew-doc-expired">Expired</span>'; else if (days <= 30) status = '<span class="crew-doc-warn">' + days + ' days</span>'; else if (days <= 90) status = '<span class="crew-doc-info">' + days + ' days</span>'; else status = 'OK'; }
      return '<tr data-id="' + escapeHtml(d.id) + '"><td>' + escapeHtml(d.name || '—') + '</td><td>' + escapeHtml(d.type || '—') + '</td><td>' + escapeHtml(formatDateDDMMYYYY(d.issueDate) || '—') + '</td><td>' + escapeHtml(formatDateDDMMYYYY(d.expiryDate) || '—') + '</td><td>' + status + '</td><td><button type="button" class="btn btn-ghost btn-sm crew-doc-edit" data-id="' + escapeHtml(d.id) + '">Edit</button> <button type="button" class="btn btn-ghost btn-sm crew-doc-del" data-id="' + escapeHtml(d.id) + '">Delete</button></td></tr>';
    }).join('') : '<tr><td colspan="6">No documents. Add certificates or licenses.</td></tr>';
    tbody.querySelectorAll('.crew-doc-edit').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var doc = getCrewDocuments().filter(function (x) { return x.id === btn.getAttribute('data-id'); })[0];
        if (!doc) return;
        openDocumentModal(d);
      });
    });
    tbody.querySelectorAll('.crew-doc-del').forEach(function (btn) {
      btn.addEventListener('click', function () {
        saveCrewDocuments(getCrewDocuments().filter(function (x) { return x.id !== btn.getAttribute('data-id'); }));
        renderCrewDocumentsPanel();
      });
    });
  }

  function renderCrewAssignmentsPanel() {
    var tbody = document.getElementById('crew-assignments-tbody');
    if (!tbody) return;
    var assignments = getCrewAssignments().filter(function (a) { return a.crewMemberId === selectedCrewId; });
    var vessels = getVessels();
    tbody.innerHTML = assignments.length ? assignments.map(function (a) {
      var vessel = vessels.filter(function (v) { return v.id === a.vesselId; })[0];
      return '<tr data-id="' + escapeHtml(a.id) + '"><td>' + escapeHtml(vessel ? vessel.name : a.vesselId) + '</td><td>' + escapeHtml(a.roleOnVessel || '—') + '</td><td>' + escapeHtml(formatDateDDMMYYYY(a.joiningDate) || '—') + '</td><td><button type="button" class="btn btn-ghost btn-sm crew-unassign" data-id="' + escapeHtml(a.id) + '">Unassign</button></td></tr>';
    }).join('') : '<tr><td colspan="4">Not assigned to any vessel.</td></tr>';
    tbody.querySelectorAll('.crew-unassign').forEach(function (btn) {
      btn.addEventListener('click', function () {
        saveCrewAssignments(getCrewAssignments().filter(function (x) { return x.id !== btn.getAttribute('data-id'); }));
        renderCrewAssignmentsPanel();
        if (typeof window.FleetManagement !== 'undefined' && window.FleetManagement.render) window.FleetManagement.render();
      });
    });
  }

  function openModal(title, fields, onSave) {
    var overlay = document.getElementById('crew-modal-overlay');
    var body = document.getElementById('crew-modal-body');
    var cancelBtn = document.getElementById('crew-modal-cancel');
    var saveBtn = document.getElementById('crew-modal-save');
    if (!overlay || !body) return;
    body.innerHTML = '<h3 class="crew-modal-title">' + escapeHtml(title) + '</h3>' + fields.map(function (f) {
      var val = f.value != null ? f.value : '';
      if (f.textarea) return '<div class="form-group full-width"><label>' + escapeHtml(f.label) + '</label><textarea class="crew-modal-field" data-key="' + escapeHtml(f.key) + '" rows="2">' + escapeHtml(val) + '</textarea></div>';
      return '<div class="form-group"><label>' + escapeHtml(f.label) + '</label><input type="' + (f.type || 'text') + '" class="crew-modal-field" data-key="' + escapeHtml(f.key) + '" value="' + escapeHtml(val) + '"' + (f.required ? ' required' : '') + '></div>';
    }).join('');
    overlay.style.display = 'flex';
    cancelBtn.onclick = function () { overlay.style.display = 'none'; };
    saveBtn.onclick = function () {
      var payload = {};
      body.querySelectorAll('.crew-modal-field').forEach(function (el) { payload[el.dataset.key] = el.value.trim(); });
      overlay.style.display = 'none';
      if (typeof onSave === 'function') onSave(payload);
    };
  }

  function openEditCrewModal(memberId) {
    var member = memberId ? getCrewMembers().filter(function (m) { return m.id === memberId; })[0] : null;
    var isEdit = !!member;
    openModal(isEdit ? 'Edit crew member' : 'Add crew member', [
      { key: 'name', label: 'Name', value: member ? member.name : '', required: true },
      { key: 'role', label: 'Role / Rank', value: member ? member.role : '' },
      { key: 'contact', label: 'Contact', value: member ? member.contact : '' }
    ], function (payload) {
      if (isEdit) {
        saveCrewMembers(getCrewMembers().map(function (m) {
          if (m.id !== memberId) return m;
          return { id: m.id, name: payload.name, role: payload.role, contact: payload.contact };
        }));
      } else {
        saveCrewMembers(getCrewMembers().concat({ id: id(), name: payload.name, role: payload.role, contact: payload.contact }));
      }
      render();
    });
  }

  function openDocumentModal(doc) {
    var isEdit = !!doc;
    openModal(isEdit ? 'Edit document' : 'Add document / certificate', [
      { key: 'name', label: 'Name', value: doc ? doc.name : '', required: true },
      { key: 'type', label: 'Type', value: doc ? doc.type : '' },
      { key: 'issueDate', label: 'Issue date', type: 'date', value: doc ? toYyyyMmDd(doc.issueDate) : '' },
      { key: 'expiryDate', label: 'Expiry date', type: 'date', value: doc ? toYyyyMmDd(doc.expiryDate) : '' }
    ], function (payload) {
      if (isEdit) {
        saveCrewDocuments(getCrewDocuments().map(function (x) {
          if (x.id !== doc.id) return x;
          return { id: x.id, crewId: x.crewId, name: payload.name, type: payload.type, issueDate: payload.issueDate, expiryDate: payload.expiryDate };
        }));
      } else {
        saveCrewDocuments(getCrewDocuments().concat({ id: id(), crewId: selectedCrewId, name: payload.name, type: payload.type, issueDate: payload.issueDate, expiryDate: payload.expiryDate }));
      }
      renderCrewDocumentsPanel();
      renderExpiryAlerts();
    });
  }

  function openAssignVesselModal() {
    var members = getCrewMembers();
    var assignments = getCrewAssignments().filter(function (a) { return a.crewMemberId === selectedCrewId; });
    var vessels = getVessels();
    var assignedVesselIds = assignments.map(function (a) { return a.vesselId; });
    var options = vessels.filter(function (v) { return assignedVesselIds.indexOf(v.id) === -1; });
    if (options.length === 0) {
      alert('This crew member is already assigned to all vessels, or there are no vessels.');
      return;
    }
    var vesselOptions = options.map(function (v) { return { value: v.id, label: v.name || v.id }; }).reduce(function (acc, o) { acc[o.value] = o.label; return acc; }, {});
    var field = { key: 'vesselId', label: 'Vessel', type: 'select', options: vesselOptions, value: options[0].id };
    var fields = [
      { key: 'vesselId', label: 'Vessel', value: options[0].id },
      { key: 'roleOnVessel', label: 'Role on vessel' },
      { key: 'joiningDate', label: 'Joining date', type: 'date' }
    ];
    var selectHtml = '<select class="crew-modal-field" data-key="vesselId">' + options.map(function (v) { return '<option value="' + escapeHtml(v.id) + '">' + escapeHtml(v.name || v.id) + '</option>'; }).join('') + '</select>';
    var overlay = document.getElementById('crew-modal-overlay');
    var body = document.getElementById('crew-modal-body');
    var cancelBtn = document.getElementById('crew-modal-cancel');
    var saveBtn = document.getElementById('crew-modal-save');
    if (!overlay || !body) return;
    body.innerHTML = '<h3 class="crew-modal-title">Assign to vessel</h3>' +
      '<div class="form-group"><label>Vessel</label>' + selectHtml + '</div>' +
      '<div class="form-group"><label>Role on vessel</label><input type="text" class="crew-modal-field" data-key="roleOnVessel" value=""></div>' +
      '<div class="form-group"><label>Joining date</label><input type="date" class="crew-modal-field" data-key="joiningDate" value="' + (new Date().toISOString().slice(0, 10)) + '"></div>';
    overlay.style.display = 'flex';
    cancelBtn.onclick = function () { overlay.style.display = 'none'; };
    saveBtn.onclick = function () {
      var vesselId = body.querySelector('[data-key="vesselId"]').value;
      var roleOnVessel = body.querySelector('[data-key="roleOnVessel"]').value.trim();
      var joiningDate = body.querySelector('[data-key="joiningDate"]').value;
      saveCrewAssignments(getCrewAssignments().concat({ id: id(), vesselId: vesselId, crewMemberId: selectedCrewId, roleOnVessel: roleOnVessel, joiningDate: joiningDate }));
      overlay.style.display = 'none';
      renderCrewAssignmentsPanel();
      if (typeof window.FleetManagement !== 'undefined' && window.FleetManagement.render) window.FleetManagement.render();
    };
  }

  function initCrew() {
    var backBtn = document.getElementById('crew-back-to-list-btn');
    if (backBtn) backBtn.addEventListener('click', function () { selectedCrewId = null; render(); });
    document.getElementById('crew-add-member') && document.getElementById('crew-add-member').addEventListener('click', function () { openEditCrewModal(null); });
    document.getElementById('crew-add-document') && document.getElementById('crew-add-document').addEventListener('click', function () { openDocumentModal(null); });
    document.getElementById('crew-assign-vessel') && document.getElementById('crew-assign-vessel').addEventListener('click', function () { openAssignVesselModal(); });
    render();
  }

  window.CrewManagement = {
    getCrewMembers: getCrewMembers,
    getCrewDocuments: getCrewDocuments,
    getCrewAssignments: getCrewAssignments,
    saveCrewMembers: saveCrewMembers,
    saveCrewDocuments: saveCrewDocuments,
    saveCrewAssignments: saveCrewAssignments,
    render: render,
    formatDateDDMMYYYY: formatDateDDMMYYYY
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initCrew);
  else initCrew();
})();
