/**
 * Clients module — standalone client list and form using AccountingData (shared with Accounting).
 */
(function () {
  'use strict';

  var listWrap = null;
  var formWrap = null;
  var listEl = null;
  var currentEditId = null;

  function getDataStore() {
    return window.DataStore || window.AccountingData;
  }

  function getCompanyName(client) {
    var store = getDataStore();
    if (store && store.getClientCompanyName) return store.getClientCompanyName(client);
    return (client && (client.name || client.company)) || '';
  }

  function getContactPerson(client) {
    var store = getDataStore();
    if (store && store.getClientContactPerson) return store.getClientContactPerson(client);
    return (client && client.contactPerson) || '';
  }

  function normalizeForForm(client) {
    var store = getDataStore();
    if (store && store.normalizeClientForForm) return store.normalizeClientForForm(client);
    return { companyName: getCompanyName(client), contactPerson: getContactPerson(client) };
  }

  function showList() {
    if (listWrap) listWrap.style.display = '';
    if (formWrap) formWrap.style.display = 'none';
    currentEditId = null;
    render();
  }

  function showForm(clientId) {
    if (formWrap) formWrap.style.display = 'block';
    if (listWrap) listWrap.style.display = 'none';
    currentEditId = clientId || null;
    var form = document.getElementById('crm-client-form');
    var titleEl = document.getElementById('crm-client-form-title');
    if (titleEl) titleEl.textContent = clientId ? 'Edit Client' : 'Add New Client';
    if (form) form.reset();
    if (clientId) {
      var store = getDataStore();
      if (store && store.getClient) {
        var client = store.getClient(clientId);
        if (client) {
          var normalized = normalizeForForm(client);
          setEl('crm-client-customer-id', client.customerId);
          setEl('crm-client-name', normalized.companyName);
          setEl('crm-client-contact', normalized.contactPerson);
          setEl('crm-client-address', client.address);
          setEl('crm-client-email', client.email);
          setEl('crm-client-phone', client.phone);
          setEl('crm-client-tax-id', client.taxId);
          setEl('crm-client-website', client.website);
          setEl('crm-client-notes', client.notes);
        }
      }
    } else {
      var storeNew = getDataStore();
      var nextId = storeNew && storeNew.getNextCustomerId ? storeNew.getNextCustomerId() : 'CUST001';
      setEl('crm-client-customer-id', nextId);
    }
  }

  function setEl(id, val) {
    var el = document.getElementById(id);
    if (el) el.value = val || '';
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function saveClient() {
    var store = getDataStore();
    if (!store || !store.saveClient) return;
    var companyName = (document.getElementById('crm-client-name') || {}).value.trim();
    var contactPerson = (document.getElementById('crm-client-contact') || {}).value.trim();
    if (!companyName) {
      alert('Company name is required.');
      return;
    }
    var id = currentEditId || ('c' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9));
    var existing = currentEditId && store.getClient ? store.getClient(currentEditId) : null;
    var customerId = (document.getElementById('crm-client-customer-id') || {}).value.trim();
    if (!customerId && store.getNextCustomerId) customerId = store.getNextCustomerId();
    var client = {
      id: id,
      customerId: customerId,
      name: companyName,
      contactPerson: contactPerson,
      company: '',
      address: (document.getElementById('crm-client-address') || {}).value.trim(),
      email: (document.getElementById('crm-client-email') || {}).value.trim(),
      phone: (document.getElementById('crm-client-phone') || {}).value.trim(),
      taxId: (document.getElementById('crm-client-tax-id') || {}).value.trim(),
      website: (document.getElementById('crm-client-website') || {}).value.trim(),
      notes: (document.getElementById('crm-client-notes') || {}).value.trim(),
      createdAt: existing && existing.createdAt ? existing.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    store.saveClient(client);
    if (typeof window.app !== 'undefined' && typeof window.app.populateClientDropdown === 'function') {
      window.app.populateClientDropdown();
    }
    if (typeof window.app !== 'undefined' && typeof window.app.populateReceiptClientDropdown === 'function') {
      window.app.populateReceiptClientDropdown();
    }
    showList();
  }

  function sortClients(clients) {
    return clients.slice().sort(function (a, b) {
      var idA = String((a && a.customerId) || '');
      var idB = String((b && b.customerId) || '');
      var numA = parseInt((idA.match(/\d+$/) || [])[0], 10);
      var numB = parseInt((idB.match(/\d+$/) || [])[0], 10);
      if (!isNaN(numA) && !isNaN(numB) && numA !== numB) return numA - numB;
      if (idA && idB && idA !== idB) return idA.localeCompare(idB);
      return getCompanyName(a).localeCompare(getCompanyName(b));
    });
  }

  function render() {
    var store = getDataStore();
    if (!store || !store.getClients) return;
    listWrap = document.getElementById('crm-clients-list-wrap');
    formWrap = document.getElementById('crm-client-form-wrap');
    listEl = document.getElementById('crm-clients-list');
    if (!listEl) return;

    var term = ((document.getElementById('crm-client-search') || {}).value || '').toLowerCase();
    var clients = store.getClients();
    if (!Array.isArray(clients)) clients = [];
    if (term) {
      clients = clients.filter(function (c) {
        return getCompanyName(c).toLowerCase().indexOf(term) !== -1 ||
          getContactPerson(c).toLowerCase().indexOf(term) !== -1 ||
          String((c && c.company) || '').toLowerCase().indexOf(term) !== -1 ||
          String((c && c.email) || '').toLowerCase().indexOf(term) !== -1 ||
          String((c && c.customerId) || '').toLowerCase().indexOf(term) !== -1 ||
          String((c && c.phone) || '').toLowerCase().indexOf(term) !== -1;
      });
    }
    clients = sortClients(clients);

    if (clients.length === 0) {
      listEl.innerHTML = '<p style="text-align: center; padding: 2rem; color: var(--text-secondary);">No clients found. Add a client to use in Accounting (invoices, receipts).</p>';
      return;
    }

    listEl.innerHTML =
      '<div class="table-wrap"><table class="data-table clients-directory-table">' +
      '<thead><tr>' +
      '<th>Customer ID</th><th>Company</th><th>Contact</th><th>Email</th><th>Phone</th><th></th>' +
      '</tr></thead><tbody>' +
      clients.map(function (c) {
        var cid = escapeHtml(String(c.id != null ? c.id : ''));
        return '<tr>' +
          '<td><strong>' + escapeHtml(c.customerId || '—') + '</strong></td>' +
          '<td>' + escapeHtml(getCompanyName(c) || '—') + '</td>' +
          '<td>' + escapeHtml(getContactPerson(c) || '—') + '</td>' +
          '<td>' + escapeHtml(c.email || '—') + '</td>' +
          '<td>' + escapeHtml(c.phone || '—') + '</td>' +
          '<td class="clients-row-actions">' +
          '<button type="button" class="btn btn-primary btn-sm" data-crm-edit-client="' + cid + '">Edit</button> ' +
          '<button type="button" class="btn btn-danger btn-sm" data-crm-delete-client="' + cid + '">Delete</button>' +
          '</td></tr>';
      }).join('') +
      '</tbody></table></div>';

    listEl.querySelectorAll('[data-crm-edit-client]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        showForm(btn.getAttribute('data-crm-edit-client'));
      });
    });
    listEl.querySelectorAll('[data-crm-delete-client]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-crm-delete-client');
        if (id && confirm('Delete this client?')) {
          if (store.deleteClient) store.deleteClient(id);
          if (typeof window.app !== 'undefined' && typeof window.app.populateClientDropdown === 'function') {
            window.app.populateClientDropdown();
          }
          if (typeof window.app !== 'undefined' && typeof window.app.renderClients === 'function') {
            window.app.renderClients((document.getElementById('client-search') || {}).value || '');
          }
          render();
        }
      });
    });
  }

  function init() {
    listWrap = document.getElementById('crm-clients-list-wrap');
    formWrap = document.getElementById('crm-client-form-wrap');

    var addBtn = document.getElementById('crm-clients-add-btn');
    if (addBtn) addBtn.addEventListener('click', function () { showForm(); });

    var backBtn = document.getElementById('crm-clients-back-btn');
    if (backBtn) backBtn.addEventListener('click', showList);

    var cancelBtn = document.getElementById('crm-clients-cancel-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', showList);

    var form = document.getElementById('crm-client-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        saveClient();
      });
    }

    var searchEl = document.getElementById('crm-client-search');
    if (searchEl) {
      searchEl.addEventListener('input', function () { render(); });
    }
  }

  window.ClientsModule = {
    render: render,
    showList: showList,
    showForm: showForm
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
