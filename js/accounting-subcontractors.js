/**
 * Accounting — Subcontractors directory + Payment orders (create / print).
 */
(function () {
  'use strict';

  var currentSubId = null;
  var currentOrderId = null;
  var currentScSub = 'directory';

  function ds() {
    return window.AccountingData;
  }

  function generateId() {
    return 'sc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function formatMoney(amount, currency) {
    var store = ds();
    if (store && store.formatCurrency) return store.formatCurrency(amount);
    var n = parseFloat(amount) || 0;
    var cur = currency || ((store && store.getCompanySettings && store.getCompanySettings().currency) || 'EUR');
    try {
      return new Intl.NumberFormat('en-GB', { style: 'currency', currency: cur }).format(n);
    } catch (e) {
      return cur + ' ' + n.toFixed(2);
    }
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function setSubcontractorsSubsection(subId) {
    currentScSub = subId || 'directory';
    try { sessionStorage.setItem('andeco_sc_sub', currentScSub); } catch (e) {}
    document.querySelectorAll('#accounting-subcontractors-content .sc-sub-panel').forEach(function (p) {
      var match = p.getAttribute('data-sc-sub') === currentScSub;
      p.style.display = match ? 'block' : 'none';
    });
    render();
  }
  window.setSubcontractorsSubsection = setSubcontractorsSubsection;

  function showSubForm(editId) {
    currentSubId = editId || null;
    var formWrap = document.getElementById('sc-sub-form-wrap');
    var title = document.getElementById('sc-sub-form-title');
    var store = ds();
    var row = editId && store ? store.getSubcontractor(editId) : null;
    if (title) title.textContent = row ? 'Edit subcontractor' : 'Add subcontractor';
    document.getElementById('sc-sub-id').value = row ? row.id : '';
    document.getElementById('sc-sub-name').value = row ? (row.name || '') : '';
    document.getElementById('sc-sub-taxid').value = row ? (row.taxId || '') : '';
    document.getElementById('sc-sub-address').value = row ? (row.address || '') : '';
    document.getElementById('sc-sub-email').value = row ? (row.email || '') : '';
    document.getElementById('sc-sub-phone').value = row ? (row.phone || '') : '';
    document.getElementById('sc-sub-iban').value = row ? (row.bankIban || '') : '';
    document.getElementById('sc-sub-notes').value = row ? (row.notes || '') : '';
    if (formWrap) formWrap.classList.remove('hidden');
    var nameEl = document.getElementById('sc-sub-name');
    if (nameEl) nameEl.focus();
  }

  function hideSubForm() {
    var formWrap = document.getElementById('sc-sub-form-wrap');
    if (formWrap) formWrap.classList.add('hidden');
    currentSubId = null;
  }

  function renderSubcontractors() {
    var tbody = document.getElementById('sc-sub-table-body');
    if (!tbody) return;
    var store = ds();
    var list = store && store.getSubcontractors ? store.getSubcontractors() : [];
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="sc-empty">No subcontractors yet. Add one to create payment orders.</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(function (s) {
      return '<tr data-id="' + escapeHtml(s.id) + '">' +
        '<td>' + escapeHtml(s.name) + '</td>' +
        '<td>' + escapeHtml(s.taxId || '—') + '</td>' +
        '<td>' + escapeHtml(s.email || '—') + '</td>' +
        '<td>' + escapeHtml(s.phone || '—') + '</td>' +
        '<td class="sc-actions">' +
          '<button type="button" class="btn btn-ghost btn-sm" data-sc-action="edit-sub">Edit</button> ' +
          '<button type="button" class="btn btn-ghost btn-sm" data-sc-action="del-sub">Delete</button>' +
        '</td></tr>';
    }).join('');
  }

  function fillSubcontractorSelect(selectedId) {
    var sel = document.getElementById('sc-order-subcontractor');
    if (!sel) return;
    var store = ds();
    var list = store && store.getSubcontractors ? store.getSubcontractors() : [];
    var prev = selectedId || sel.value;
    sel.innerHTML = '<option value="">Select subcontractor…</option>' +
      list.map(function (s) {
        return '<option value="' + escapeHtml(s.id) + '">' + escapeHtml(s.name) + '</option>';
      }).join('');
    if (prev) sel.value = prev;
  }

  function showOrderForm(editId) {
    currentOrderId = editId || null;
    var formWrap = document.getElementById('sc-order-form-wrap');
    var title = document.getElementById('sc-order-form-title');
    var store = ds();
    var row = editId && store ? store.getPaymentOrder(editId) : null;
    fillSubcontractorSelect(row ? row.subcontractorId : '');
    if (title) title.textContent = row ? 'Edit payment order' : 'New payment order';
    document.getElementById('sc-order-id').value = row ? row.id : '';
    document.getElementById('sc-order-number').value = row
      ? (row.orderNumber || '')
      : (store.getNextPaymentOrderNumber ? store.getNextPaymentOrderNumber() : '');
    document.getElementById('sc-order-date').value = row ? (row.date || todayISO()) : todayISO();
    document.getElementById('sc-order-subcontractor').value = row ? (row.subcontractorId || '') : '';
    document.getElementById('sc-order-description').value = row ? (row.description || '') : '';
    document.getElementById('sc-order-amount').value = row ? (row.amount != null ? row.amount : '') : '';
    var cur = row && row.currency
      ? row.currency
      : ((store.getCompanySettings && store.getCompanySettings().currency) || 'EUR');
    document.getElementById('sc-order-currency').value = cur;
    document.getElementById('sc-order-status').value = row ? (row.status || 'draft') : 'draft';
    document.getElementById('sc-order-notes').value = row ? (row.notes || '') : '';
    if (formWrap) formWrap.classList.remove('hidden');
  }

  function hideOrderForm() {
    var formWrap = document.getElementById('sc-order-form-wrap');
    if (formWrap) formWrap.classList.add('hidden');
    currentOrderId = null;
  }

  function renderOrders() {
    var tbody = document.getElementById('sc-order-table-body');
    if (!tbody) return;
    var store = ds();
    var orders = store && store.getPaymentOrders ? store.getPaymentOrders().slice() : [];
    orders.sort(function (a, b) {
      return String(b.date || '').localeCompare(String(a.date || ''));
    });
    if (!orders.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="sc-empty">No payment orders yet.</td></tr>';
      return;
    }
    tbody.innerHTML = orders.map(function (o) {
      var sub = store.getSubcontractor(o.subcontractorId);
      var status = o.status || 'draft';
      return '<tr data-id="' + escapeHtml(o.id) + '">' +
        '<td>' + escapeHtml(o.orderNumber || '—') + '</td>' +
        '<td>' + escapeHtml(o.date || '—') + '</td>' +
        '<td>' + escapeHtml(sub ? sub.name : '—') + '</td>' +
        '<td>' + escapeHtml(formatMoney(o.amount, o.currency)) + '</td>' +
        '<td><span class="sc-status sc-status--' + escapeHtml(status) + '">' + escapeHtml(status) + '</span></td>' +
        '<td class="sc-actions">' +
          '<button type="button" class="btn btn-ghost btn-sm" data-sc-action="edit-order">Edit</button> ' +
          '<button type="button" class="btn btn-primary btn-sm" data-sc-action="print-order">Print</button> ' +
          '<button type="button" class="btn btn-ghost btn-sm" data-sc-action="del-order">Delete</button>' +
        '</td></tr>';
    }).join('');
  }

  function render() {
    renderSubcontractors();
    renderOrders();
    fillSubcontractorSelect();
  }

  function printPaymentOrder(orderId) {
    var store = ds();
    if (!store) return;
    var order = store.getPaymentOrder(orderId);
    if (!order) return;
    var sub = store.getSubcontractor(order.subcontractorId) || {};
    var settings = store.getCompanySettings() || {};
    var logoSrc = (store.getDocumentLogo && store.getDocumentLogo('paymentOrder')) || settings.logo || '';
    var logoHtml = logoSrc
      ? '<img src="' + logoSrc + '" alt="Logo" style="max-height:72px;max-width:180px;margin-bottom:10px;display:block;">'
      : '';
    var dateStr = order.date
      ? new Date(order.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '';
    var amountStr = formatMoney(order.amount, order.currency || settings.currency);
    var banks = Array.isArray(settings.banks) ? settings.banks : [];
    var bankHtml = banks.length
      ? banks.map(function (b) {
          return '<div>' + escapeHtml(b.name || '') +
            (b.iban ? ' — IBAN: ' + escapeHtml(b.iban) : '') +
            (b.swift ? ' — SWIFT: ' + escapeHtml(b.swift) : '') +
            '</div>';
        }).join('')
      : '<div>—</div>';

    var printWindow = window.open('', '_blank', 'width=840,height=900');
    if (!printWindow) {
      alert('Please allow pop-ups to print the payment order.');
      return;
    }
    printWindow.document.write(
      '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
      '<title>Payment Order ' + escapeHtml(order.orderNumber || '') + '</title>' +
      '<style>' +
      '@page{size:A4;margin:1.6cm}' +
      'body{font-family:Georgia,"Times New Roman",serif;color:#111;line-height:1.45}' +
      '.sheet{max-width:720px;margin:0 auto}' +
      '.top{display:flex;justify-content:space-between;gap:24px;margin-bottom:28px}' +
      '.brand h1{font-size:22px;margin:0 0 6px;letter-spacing:.02em}' +
      '.brand p{margin:0;font-size:13px;color:#444}' +
      '.meta{text-align:right}' +
      '.meta .label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#666}' +
      '.meta .value{font-size:20px;font-weight:700;margin:4px 0 10px}' +
      'h2{font-size:18px;margin:0 0 14px;border-bottom:2px solid #111;padding-bottom:8px}' +
      '.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:22px}' +
      '.box{border:1px solid #d1d5db;border-radius:8px;padding:14px}' +
      '.box h3{margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#555}' +
      '.box p{margin:0 0 4px;font-size:14px}' +
      'table{width:100%;border-collapse:collapse;margin:18px 0}' +
      'th,td{border:1px solid #d1d5db;padding:10px 12px;text-align:left;font-size:14px}' +
      'th{background:#f3f4f6;font-size:12px;text-transform:uppercase;letter-spacing:.04em}' +
      '.amount{font-size:18px;font-weight:700}' +
      '.notes{margin-top:18px;font-size:13px;color:#333}' +
      '.sign{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:48px}' +
      '.sign .line{border-top:1px solid #111;margin-top:56px;padding-top:8px;font-size:12px;color:#555}' +
      '@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}' +
      '</style></head><body><div class="sheet">' +
      '<div class="top"><div class="brand">' +
      logoHtml +
      '<h1>' + escapeHtml(settings.companyName || 'Company') + '</h1>' +
      '<p>' + escapeHtml(settings.companyAddress || '') + '</p>' +
      '<p>' + escapeHtml([settings.companyEmail, settings.companyPhone].filter(Boolean).join(' · ')) + '</p>' +
      '<p>' + escapeHtml(settings.companyTaxId ? ('Tax ID: ' + settings.companyTaxId) : '') + '</p>' +
      '</div><div class="meta">' +
      '<div class="label">Payment order</div>' +
      '<div class="value">' + escapeHtml(order.orderNumber || '') + '</div>' +
      '<div class="label">Date</div><div>' + escapeHtml(dateStr) + '</div>' +
      '<div class="label">Status</div><div>' + escapeHtml(order.status || 'draft') + '</div>' +
      '</div></div>' +
      '<h2>Instruction to pay subcontractor</h2>' +
      '<div class="grid"><div class="box"><h3>Pay to</h3>' +
      '<p><strong>' + escapeHtml(sub.name || '—') + '</strong></p>' +
      '<p>' + escapeHtml(sub.address || '') + '</p>' +
      '<p>' + escapeHtml(sub.taxId ? ('Tax ID: ' + sub.taxId) : '') + '</p>' +
      '<p>' + escapeHtml(sub.email || '') + '</p>' +
      '<p>' + escapeHtml(sub.phone || '') + '</p>' +
      '<p>' + escapeHtml(sub.bankIban ? ('IBAN: ' + sub.bankIban) : '') + '</p>' +
      '</div><div class="box"><h3>Our bank details</h3>' + bankHtml + '</div></div>' +
      '<table><thead><tr><th>Service / description</th><th>Amount</th></tr></thead><tbody>' +
      '<tr><td>' + escapeHtml(order.description || 'Subcontractor services') + '</td>' +
      '<td class="amount">' + escapeHtml(amountStr) + '</td></tr></tbody></table>' +
      (order.notes ? ('<div class="notes"><strong>Notes:</strong> ' + escapeHtml(order.notes) + '</div>') : '') +
      '<div class="sign"><div><div class="line">Prepared by</div></div>' +
      '<div><div class="line">Authorized signature</div></div></div>' +
      '</div><script>window.onload=function(){window.print();}<\/script></body></html>'
    );
    printWindow.document.close();
  }

  function bindEvents() {
    var root = document.getElementById('accounting-subcontractors-content');
    if (!root || root._scBound) return;
    root._scBound = true;

    var addSub = document.getElementById('sc-add-sub-btn');
    if (addSub) addSub.addEventListener('click', function () { showSubForm(null); });
    var cancelSub = document.getElementById('sc-sub-cancel-btn');
    if (cancelSub) cancelSub.addEventListener('click', hideSubForm);
    var subForm = document.getElementById('sc-sub-form');
    if (subForm) {
      subForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var store = ds();
        if (!store) return;
        var id = document.getElementById('sc-sub-id').value || generateId();
        var name = document.getElementById('sc-sub-name').value.trim();
        if (!name) return;
        store.saveSubcontractor({
          id: id,
          name: name,
          taxId: document.getElementById('sc-sub-taxid').value.trim(),
          address: document.getElementById('sc-sub-address').value.trim(),
          email: document.getElementById('sc-sub-email').value.trim(),
          phone: document.getElementById('sc-sub-phone').value.trim(),
          bankIban: document.getElementById('sc-sub-iban').value.trim(),
          notes: document.getElementById('sc-sub-notes').value.trim()
        });
        hideSubForm();
        render();
      });
    }

    var addOrder = document.getElementById('sc-add-order-btn');
    if (addOrder) addOrder.addEventListener('click', function () {
      var store = ds();
      if (!store.getSubcontractors().length) {
        alert('Add a subcontractor first.');
        setSubcontractorsSubsection('directory');
        return;
      }
      showOrderForm(null);
    });
    var cancelOrder = document.getElementById('sc-order-cancel-btn');
    if (cancelOrder) cancelOrder.addEventListener('click', hideOrderForm);
    var orderForm = document.getElementById('sc-order-form');
    if (orderForm) {
      orderForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var store = ds();
        if (!store) return;
        var id = document.getElementById('sc-order-id').value || generateId();
        var existing = store.getPaymentOrder(id);
        var subcontractorId = document.getElementById('sc-order-subcontractor').value;
        var description = document.getElementById('sc-order-description').value.trim();
        var amount = parseFloat(document.getElementById('sc-order-amount').value);
        if (!subcontractorId) {
          alert('Select a subcontractor.');
          return;
        }
        if (!description) {
          alert('Enter the service description.');
          return;
        }
        if (!(amount > 0)) {
          alert('Enter a valid amount.');
          return;
        }
        var status = document.getElementById('sc-order-status').value || 'draft';
        var orderNumber = document.getElementById('sc-order-number').value.trim();
        if (!existing && status !== 'draft') {
          orderNumber = store.getNextPaymentOrderNumber();
        } else if (!orderNumber) {
          orderNumber = store.getNextPaymentOrderNumber();
        }
        store.savePaymentOrder({
          id: id,
          orderNumber: orderNumber,
          date: document.getElementById('sc-order-date').value || todayISO(),
          subcontractorId: subcontractorId,
          description: description,
          amount: amount,
          currency: document.getElementById('sc-order-currency').value || 'EUR',
          status: status,
          notes: document.getElementById('sc-order-notes').value.trim(),
          createdAt: existing && existing.createdAt ? existing.createdAt : new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        hideOrderForm();
        render();
      });
    }

    root.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-sc-action]');
      if (!btn) return;
      var tr = btn.closest('tr[data-id]');
      var id = tr && tr.getAttribute('data-id');
      var action = btn.getAttribute('data-sc-action');
      var store = ds();
      if (action === 'edit-sub' && id) showSubForm(id);
      if (action === 'del-sub' && id) {
        var used = store.getPaymentOrders().some(function (o) { return o.subcontractorId === id; });
        if (used) {
          alert('This subcontractor has payment orders. Delete or reassign those orders first.');
          return;
        }
        if (confirm('Delete this subcontractor?')) {
          store.deleteSubcontractor(id);
          render();
        }
      }
      if (action === 'edit-order' && id) showOrderForm(id);
      if (action === 'print-order' && id) printPaymentOrder(id);
      if (action === 'del-order' && id) {
        if (confirm('Delete this payment order?')) {
          store.deletePaymentOrder(id);
          render();
        }
      }
    });
  }

  function init() {
    bindEvents();
    var saved = 'directory';
    try { saved = sessionStorage.getItem('andeco_sc_sub') || 'directory'; } catch (e) {}
    setSubcontractorsSubsection(saved);
  }

  window.AccountingSubcontractors = {
    render: render,
    init: init,
    printPaymentOrder: printPaymentOrder
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
