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

    var client = {

      id: id,

      customerId: (document.getElementById('crm-client-customer-id') || {}).value.trim(),

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



  function render() {

    var store = getDataStore();

    if (!store || !store.getClients) return;

    listWrap = document.getElementById('crm-clients-list-wrap');

    formWrap = document.getElementById('crm-client-form-wrap');

    listEl = document.getElementById('crm-clients-list');

    if (!listEl) return;



    var term = (document.getElementById('crm-client-search') || {}).value || '';

    var clients = store.getClients();

    if (term) {

      var t = term.toLowerCase();

      clients = clients.filter(function (c) {

        return (c.name && c.name.toLowerCase().indexOf(t) !== -1) ||

          (c.contactPerson && c.contactPerson.toLowerCase().indexOf(t) !== -1) ||

          (c.company && c.company.toLowerCase().indexOf(t) !== -1) ||

          (c.email && c.email.toLowerCase().indexOf(t) !== -1);

      });

    }

    clients = clients.sort(function (a, b) {

      return getCompanyName(a).localeCompare(getCompanyName(b));

    });



    if (clients.length === 0) {

      listEl.innerHTML = '<p style="text-align: center; padding: 2rem; color: var(--text-secondary);">No clients found. Add a client to use in Accounting (invoices, receipts).</p>';

      return;

    }



    listEl.innerHTML = clients.map(function (c) {

      var company = escapeHtml(getCompanyName(c));

      var contact = escapeHtml(getContactPerson(c));

      var cid = escapeHtml(String(c.id != null ? c.id : ''));

      return '<div class="invoice-card">' +

        '<div class="invoice-info">' +

        '<h3>' + company + '</h3>' +

        (contact ? '<p><strong>Contact:</strong> ' + contact + '</p>' : '') +

        (c.email ? '<p><strong>Email:</strong> ' + escapeHtml(c.email || '') + '</p>' : '') +

        '</div>' +

        '<div class="invoice-meta">' +

        '<div class="invoice-actions">' +

        '<button type="button" class="btn btn-primary" data-crm-edit-client="' + cid + '">Edit</button> ' +

        '<button type="button" class="btn btn-danger" data-crm-delete-client="' + cid + '">Delete</button>' +

        '</div></div></div>';

    }).join('');



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


