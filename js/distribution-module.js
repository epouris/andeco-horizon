/**
 * Distribution — boat brand catalog, quotations, sold vessels (OlympicRibs first).
 * Persisted via Railway/Postgres JSON blob (distribution_data), same pattern as LMS.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'andeco_distribution_data';
  const MODULE_ID = 'distribution';
  const SECTIONS = ['dashboard', 'catalog', 'prospects', 'quotations', 'sold'];
  const QUOTE_STATUSES = [
    { value: 'draft', label: 'Draft' },
    { value: 'sent', label: 'Sent' },
    { value: 'accepted', label: 'Accepted' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'converted', label: 'Converted to proforma' }
  ];
  const PROSPECT_STATUSES = [
    { value: 'lead', label: 'Lead' },
    { value: 'contacted', label: 'Contacted' },
    { value: 'quoted', label: 'Quoted' },
    { value: 'negotiating', label: 'Negotiating' },
    { value: 'won', label: 'Won / purchased' },
    { value: 'lost', label: 'Lost' }
  ];
  const PROSPECT_SOURCES = [
    { value: 'newsletter', label: 'Newsletter' },
    { value: 'exhibition', label: 'Exhibition / boat show' },
    { value: 'referral', label: 'Referral' },
    { value: 'website', label: 'Website' },
    { value: 'walk-in', label: 'Walk-in' },
    { value: 'other', label: 'Other' }
  ];

  let state = null;
  let section = 'dashboard';
  let saveTimer = null;
  let quoteEditorId = null;
  let prospectEditorId = null; // null = list, '' = new, id = edit
  let catalogBrandFilter = '';
  let catalogModelFilter = '';
  let prospectSearch = '';

  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function money(n, currency) {
    const v = Number(n) || 0;
    const cur = currency || 'EUR';
    try {
      return new Intl.NumberFormat('el-GR', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(v);
    } catch (_) {
      return `${v.toFixed(2)} ${cur}`;
    }
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function lineTotal(line) {
    const qty = Number(line.qty) || 0;
    const unit = Number(line.unitPrice) || 0;
    const disc = Math.min(100, Math.max(0, Number(line.discountPercent) || 0));
    return Math.round(qty * unit * (1 - disc / 100) * 100) / 100;
  }

  function lineSubtotal(line) {
    return Math.round((Number(line.qty) || 0) * (Number(line.unitPrice) || 0) * 100) / 100;
  }

  function recalcQuote(q) {
    const lines = Array.isArray(q.lines) ? q.lines : [];
    let subtotal = 0;
    let total = 0;
    lines.forEach((ln) => {
      ln.lineSubtotal = lineSubtotal(ln);
      ln.lineTotal = lineTotal(ln);
      subtotal += ln.lineSubtotal;
      total += ln.lineTotal;
    });
    q.subtotal = Math.round(subtotal * 100) / 100;
    q.total = Math.round(total * 100) / 100;
    q.discountAmount = Math.round((q.subtotal - q.total) * 100) / 100;
    return q;
  }

  function defaultCategories(brandId) {
    return [
      { id: uid('cat'), brandId, key: 'engines', label: 'Main engines', sortOrder: 10, subgroupBy: true },
      { id: uid('cat'), brandId, key: 'engine_options', label: 'Engine options', sortOrder: 20, subgroupBy: false },
      { id: uid('cat'), brandId, key: 'covers', label: 'Covers & awnings', sortOrder: 30, subgroupBy: false },
      { id: uid('cat'), brandId, key: 'electronics', label: 'Electronic & electrical', sortOrder: 40, subgroupBy: false },
      { id: uid('cat'), brandId, key: 'other', label: 'Other equipment', sortOrder: 50, subgroupBy: false },
      { id: uid('cat'), brandId, key: 'decking', label: 'Decking', sortOrder: 60, subgroupBy: false },
      { id: uid('cat'), brandId, key: 'trailer', label: 'Trailer', sortOrder: 70, subgroupBy: false }
    ];
  }

  function seedOlympicRibs() {
    const brandId = uid('brand');
    const cats = defaultCategories(brandId);
    const byKey = Object.fromEntries(cats.map((c) => [c.key, c.id]));
    const modelId = uid('model');

    const options = [
      // Yamaha
      { subgroup: 'YAMAHA', name: 'F250NSB — Light Grey Metallic', price: 74865.68 },
      { subgroup: 'YAMAHA', name: 'F250NSB2 — Pearl White', price: 76362.99 },
      { subgroup: 'YAMAHA', name: 'F300NSB — Light Grey Metallic', price: 77038.54 },
      { subgroup: 'YAMAHA', name: 'F300NSB2 — Pearl White', price: 78579.41 },
      { subgroup: 'YAMAHA', name: 'F300XSB2 — Pearl White', price: 78579.41 },
      // Mercury
      { subgroup: 'MERCURY', name: '250 AMS DTS EHPS', price: 73958.06 },
      { subgroup: 'MERCURY', name: '250 CXL AMS DTS', price: 75517.34 },
      { subgroup: 'MERCURY', name: '300 AMS DTS EHPS', price: 76000.0 },
      { subgroup: 'MERCURY', name: '300 CXL AMS DTS', price: 77500.0 },
      // Suzuki
      { subgroup: 'SUZUKI', name: '250 DF APX', price: 63450.0 },
      { subgroup: 'SUZUKI', name: '300 DF APX', price: 65200.0 },
      // Honda
      { subgroup: 'HONDA', name: 'BF250 XDU NEW', price: 65200.0 },
      { subgroup: 'HONDA', name: 'BF250 XRU NEW', price: 67500.0 },
      { subgroup: 'HONDA', name: 'BF300 XDU NEW', price: 70000.0 }
    ].map((o) => ({
      id: uid('opt'),
      categoryId: byKey.engines,
      brandId,
      modelIds: [modelId],
      subgroup: o.subgroup,
      name: o.name,
      price: o.price,
      unit: 'pcs',
      notes: '',
      active: true
    }));

    const more = [
      [byKey.engine_options, '', 'Hydraulic steering', 3069.84],
      [byKey.engine_options, '', 'Auxiliary engine mount', 813.06],
      [byKey.engine_options, '', 'Auxiliary engine Yamaha 9.9HP', 3928.06],
      [byKey.engine_options, '', 'Auxiliary engine Mercury 9.9HP', 3928.06],
      [byKey.engine_options, '', 'Auxiliary engine Suzuki 9.9HP', 3928.06],
      [byKey.engine_options, '', 'Auxiliary engine Honda 9.9HP', 3928.06],
      [byKey.covers, '', 'Full parking cover', 1436.5],
      [byKey.covers, '', 'Console cover', 450.0],
      [byKey.covers, '', 'Sun awning with INOX railings', 1434.51],
      [byKey.covers, '', 'Aft locker screen', 600.0],
      [byKey.electronics, '', 'Service battery', 350.0],
      [byKey.electronics, '', 'Sound Hertz source & 2 speakers', 909.93],
      [byKey.electronics, '', 'Sound Hertz, 4 speakers & amplifier', 1969.55],
      [byKey.electronics, '', 'Raymarine Axiom 7" Plotter, transducer & map', 2105.16],
      [byKey.electronics, '', 'Raymarine Axiom 9" Plotter, transducer & map', 2350.0],
      [byKey.electronics, '', 'Floor lighting', 800.0],
      [byKey.electronics, '', 'Windlass remote control', 750.0],
      [byKey.electronics, '', 'Underwater lights', 1268.34],
      [byKey.other, '', 'INOX anchor with swivel and 35m chain', 800.0],
      [byKey.other, '', 'Handles on the tube (per piece)', 180.0],
      [byKey.other, '', 'Painted INOX with electrostatic paint', 700.0],
      [byKey.decking, '', 'SeaDeck foam', 2450.0],
      [byKey.trailer, '', 'Dromeas 670 Trailer with approval', 6800.0],
      [byKey.trailer, '', 'ELXIS A200', 7850.0]
    ].map(([categoryId, subgroup, name, price]) => ({
      id: uid('opt'),
      categoryId,
      brandId,
      modelIds: [modelId],
      subgroup: subgroup || '',
      name,
      price,
      unit: 'pcs',
      notes: '',
      active: true
    }));

    return {
      brands: [
        {
          id: brandId,
          name: 'OlympicRibs',
          slug: 'olympicribs',
          logo: '',
          notes: 'Distribution brand — RIBs & leisure boats',
          active: true,
          createdAt: new Date().toISOString()
        }
      ],
      models: [
        {
          id: modelId,
          brandId,
          name: '720 Cruiser',
          basePrice: 36455.05,
          currency: 'EUR',
          active: true,
          techSpecs: {
            loa: '7.13 m',
            boa: '2.53 m',
            internalBeam: '1.46 m',
            tubeDiam: '50 cm',
            maxHp: '300 HP',
            minHp: '200 HP',
            suggestedHp: '250 HP',
            dryWeight: '900 Kg',
            fuelTank: '440 ltrs',
            ceCategory: 'C',
            pax: '8'
          },
          standardEquipment: [
            { category: 'Tubes', items: ['Orca 866 1670 DTEX fabric', 'Peripheral neoprene rubber'] },
            { category: 'Tanks', items: ['Fuel tank INOX 2×220 ltrs', 'Water tank 140 ltrs'] },
            {
              category: 'Deck',
              items: [
                'Cushion set',
                'Reclining bow sun deck',
                'Steering wheel',
                'Fresh water system with stern shower',
                'INOX latches and fasteners',
                'INOX hinges',
                'Fuel and water filler caps',
                'Console rail',
                'USB sockets',
                'Electric horn',
                'Heavy-duty trailer cleat',
                'Folding cleats',
                'Swim ladder',
                'INOX roll bar',
                'Bow pulpit with roller'
              ]
            },
            {
              category: 'Electrical',
              items: [
                'Digital switches with CZONE system',
                'Electric anchor windlass 500W',
                'Navigation lights',
                'Fresh water pump',
                'Bilge pump',
                'Main two-position switch with charging relay',
                '12V electrical installation with marine cables'
              ]
            }
          ],
          notes: '',
          createdAt: new Date().toISOString()
        }
      ],
      optionCategories: cats,
      options: options.concat(more),
      quotations: [],
      soldVessels: [],
      potentialClients: [],
      settings: {
        quotePrefix: 'ORQ',
        quoteSequenceNumber: 1000,
        defaultDiscountPercent: 0,
        defaultCurrency: 'EUR',
        companyName: 'Andeco / OlympicRibs Distribution',
        companyDetails: '',
        quoteFooter: 'Prices in EUR. Quotation valid for 30 days unless otherwise stated. Technical specifications subject to manufacturer updates.'
      }
    };
  }

  function emptyProspect() {
    return {
      id: uid('prospect'),
      company: '',
      contactName: '',
      email: '',
      phone: '',
      mobile: '',
      address: '',
      city: '',
      country: '',
      postalCode: '',
      taxId: '',
      website: '',
      source: 'other',
      status: 'lead',
      newsletterOptIn: true,
      interestNotes: '',
      notes: '',
      convertedToClientId: null,
      convertedToClientCustomerId: null,
      convertedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function normalizeProspect(raw) {
    const base = emptyProspect();
    if (!raw || typeof raw !== 'object') return base;
    return {
      id: raw.id || base.id,
      company: raw.company || '',
      contactName: raw.contactName || raw.name || '',
      email: raw.email || '',
      phone: raw.phone || '',
      mobile: raw.mobile || '',
      address: raw.address || '',
      city: raw.city || '',
      country: raw.country || '',
      postalCode: raw.postalCode || '',
      taxId: raw.taxId || '',
      website: raw.website || '',
      source: raw.source || 'other',
      status: raw.status || 'lead',
      newsletterOptIn: raw.newsletterOptIn !== false,
      interestNotes: raw.interestNotes || '',
      notes: raw.notes || '',
      convertedToClientId: raw.convertedToClientId || null,
      convertedToClientCustomerId: raw.convertedToClientCustomerId || null,
      convertedAt: raw.convertedAt || null,
      createdAt: raw.createdAt || base.createdAt,
      updatedAt: raw.updatedAt || base.updatedAt
    };
  }

  function emptyState() {
    return seedOlympicRibs();
  }

  function normalizeState(raw) {
    const base = emptyState();
    if (!raw || typeof raw !== 'object') return base;
    const s = {
      brands: Array.isArray(raw.brands) ? raw.brands : base.brands,
      models: Array.isArray(raw.models) ? raw.models : base.models,
      optionCategories: Array.isArray(raw.optionCategories) ? raw.optionCategories : base.optionCategories,
      options: Array.isArray(raw.options) ? raw.options : base.options,
      quotations: Array.isArray(raw.quotations) ? raw.quotations : [],
      soldVessels: Array.isArray(raw.soldVessels) ? raw.soldVessels : [],
      potentialClients: Array.isArray(raw.potentialClients)
        ? raw.potentialClients.map(normalizeProspect)
        : [],
      settings: Object.assign({}, base.settings, raw.settings || {})
    };
    // Discount is opt-in only. Clear the old Excel-seeded 25% default.
    if (
      s.settings.defaultDiscountPercent == null ||
      Number(s.settings.defaultDiscountPercent) === 25
    ) {
      s.settings.defaultDiscountPercent = 0;
    } else {
      s.settings.defaultDiscountPercent = Number(s.settings.defaultDiscountPercent) || 0;
    }
    if (!s.brands.length) {
      const seeded = seedOlympicRibs();
      s.brands = seeded.brands;
      s.models = seeded.models;
      s.optionCategories = seeded.optionCategories;
      s.options = seeded.options;
      s.settings = Object.assign({}, seeded.settings, s.settings, {
        defaultDiscountPercent: 0
      });
    }
    return s;
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      return normalizeState(JSON.parse(raw));
    } catch (_) {
      return emptyState();
    }
  }

  function saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) { /* ignore */ }
  }

  function persistAllIfFile() {
    try {
      if (window.AccountingData && typeof window.AccountingData.persistAll === 'function') {
        window.AccountingData.persistAll();
      }
    } catch (_) { /* ignore */ }
  }

  function persist(immediate) {
    saveLocal();
    const run = () => persistAllIfFile();
    if (immediate) {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = null;
      run();
      return;
    }
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(run, 400);
  }

  function brandById(id) {
    return (state.brands || []).find((b) => b.id === id) || null;
  }

  function modelById(id) {
    return (state.models || []).find((m) => m.id === id) || null;
  }

  function categoryById(id) {
    return (state.optionCategories || []).find((c) => c.id === id) || null;
  }

  function optionById(id) {
    if (!id) return null;
    return (state.options || []).find((o) => String(o.id) === String(id)) || null;
  }

  function optionsForQuote(q) {
    const brandId = q?.brandId;
    const modelId = q?.modelId;
    const brandCatIds = new Set(
      (state.optionCategories || [])
        .filter((c) => c.brandId === brandId)
        .map((c) => c.id)
    );
    return (state.options || []).filter((o) => {
      if (o.active === false) return false;
      const brandOk = o.brandId === brandId || brandCatIds.has(o.categoryId);
      if (!brandOk) return false;
      if (!o.modelIds || !o.modelIds.length) return true;
      return o.modelIds.indexOf(modelId) !== -1;
    });
  }

  function quoteById(id) {
    return (state.quotations || []).find((q) => q.id === id) || null;
  }

  function prospectById(id) {
    return (state.potentialClients || []).find((p) => p.id === id) || null;
  }

  function prospectLabel(p) {
    if (!p) return '';
    const company = (p.company || '').trim();
    const contact = (p.contactName || '').trim();
    if (company && contact) return `${company} — ${contact}`;
    return company || contact || p.email || 'Potential client';
  }

  function prospectDisplayName(p) {
    if (!p) return '';
    return (p.company || '').trim() || (p.contactName || '').trim() || p.email || '';
  }

  function snapshotFromProspect(p) {
    if (!p) {
      return { name: '', contactName: '', email: '', phone: '', company: '', address: '', city: '', country: '', postalCode: '', taxId: '' };
    }
    const addressParts = [p.address, p.postalCode, p.city, p.country].filter(Boolean);
    return {
      name: prospectDisplayName(p),
      contactName: p.contactName || '',
      email: p.email || '',
      phone: p.phone || p.mobile || '',
      company: p.company || '',
      address: addressParts.join(', '),
      city: p.city || '',
      country: p.country || '',
      postalCode: p.postalCode || '',
      taxId: p.taxId || ''
    };
  }

  function statusLabel(list, value) {
    const hit = list.find((s) => s.value === value);
    return hit ? hit.label : (value || '—');
  }

  function nextQuoteNumber() {
    const n = Number(state.settings.quoteSequenceNumber) || 1000;
    state.settings.quoteSequenceNumber = n + 1;
    const prefix = state.settings.quotePrefix || 'ORQ';
    return `${prefix}-${String(n).padStart(4, '0')}`;
  }

  function setSection(name, options) {
    if (!SECTIONS.includes(name)) name = 'dashboard';
    const keepEditor = options && options.keepEditor;
    section = name;
    if (!keepEditor) {
      quoteEditorId = null;
      if (name !== 'prospects') prospectEditorId = null;
    }
    document.querySelectorAll('#page-distribution .dist-section-panel').forEach((el) => {
      const match = el.getAttribute('data-section') === name;
      el.classList.toggle('active', match);
      el.style.display = match ? 'block' : 'none';
    });
    render();
  }

  function toast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type || 'success');
    else console.log(msg);
  }

  /* ─── Dashboard ─── */
  function renderDashboard() {
    const el = document.getElementById('dist-dashboard');
    if (!el) return;
    const brands = state.brands.length;
    const models = state.models.filter((m) => m.active !== false).length;
    const openQuotes = state.quotations.filter((q) => !['rejected', 'converted'].includes(q.status)).length;
    const prospects = (state.potentialClients || []).length;
    const sold = state.soldVessels.length;
    const recent = [...state.quotations].sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '')).slice(0, 6);
    const recentProspects = [...(state.potentialClients || [])]
      .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''))
      .slice(0, 5);

    el.innerHTML = `
      <div class="dist-metrics">
        <div class="dist-metric"><div class="label">Brands</div><div class="value">${brands}</div></div>
        <div class="dist-metric"><div class="label">Active models</div><div class="value">${models}</div></div>
        <div class="dist-metric"><div class="label">Potential clients</div><div class="value">${prospects}</div></div>
        <div class="dist-metric"><div class="label">Open quotations</div><div class="value">${openQuotes}</div></div>
        <div class="dist-metric"><div class="label">Sold vessels</div><div class="value">${sold}</div></div>
      </div>
      <div class="dist-card">
        <div class="dist-card-header">
          <h3>Recent quotations</h3>
          <button type="button" class="btn btn-primary btn-sm" data-dist-goto="quotations">New quote</button>
        </div>
        ${recent.length ? `
          <table class="dist-table">
            <thead><tr><th>Number</th><th>Potential client</th><th>Model</th><th>Total</th><th>Status</th><th></th></tr></thead>
            <tbody>
              ${recent.map((q) => {
                const m = modelById(q.modelId);
                return `<tr>
                  <td><strong>${esc(q.number)}</strong></td>
                  <td>${esc(q.clientSnapshot?.name || '—')}</td>
                  <td>${esc(m?.name || '—')}</td>
                  <td>${money(q.total, q.currency)}</td>
                  <td><span class="dist-badge ${esc(q.status)}">${esc(q.status)}</span></td>
                  <td><button type="button" class="btn btn-secondary btn-sm" data-dist-open-quote="${esc(q.id)}">Open</button></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>` : '<div class="dist-empty">No quotations yet. Create a model catalog, then build your first quote.</div>'}
      </div>
      <div class="dist-card" style="margin-top:1rem">
        <div class="dist-card-header">
          <h3>Potential clients</h3>
          <button type="button" class="btn btn-secondary btn-sm" data-dist-goto="prospects">Manage list</button>
        </div>
        ${recentProspects.length ? `
          <table class="dist-table">
            <thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Newsletter</th></tr></thead>
            <tbody>
              ${recentProspects.map((p) => `<tr>
                <td><strong>${esc(prospectLabel(p))}</strong></td>
                <td>${esc(p.email || '—')}</td>
                <td><span class="dist-badge ${esc(p.status)}">${esc(statusLabel(PROSPECT_STATUSES, p.status))}</span></td>
                <td>${p.newsletterOptIn ? 'Yes' : 'No'}</td>
              </tr>`).join('')}
            </tbody>
          </table>` : '<div class="dist-empty">No potential clients yet. Add leads here for quotations and future newsletters — separate from Accounting clients.</div>'}
      </div>
      <div class="dist-card" style="margin-top:1rem">
        <div class="dist-card-header"><h3>Distribution brands</h3>
          <button type="button" class="btn btn-secondary btn-sm" id="dist-add-brand">Add brand</button>
        </div>
        <div class="dist-list">
          ${state.brands.map((b) => `
            <div class="dist-list-item">
              <div>
                <strong>${esc(b.name)}</strong>
                <div class="meta">${esc(b.notes || '')} · ${(state.models.filter((m) => m.brandId === b.id).length)} models</div>
              </div>
              <button type="button" class="btn btn-secondary btn-sm" data-dist-edit-brand="${esc(b.id)}">Edit</button>
            </div>`).join('')}
        </div>
      </div>`;

    el.querySelector('[data-dist-goto="quotations"]')?.addEventListener('click', () => {
      if (typeof window.setDistributionSection === 'function') window.setDistributionSection('quotations');
      else setSection('quotations');
      createQuote();
    });
    el.querySelector('[data-dist-goto="prospects"]')?.addEventListener('click', () => {
      if (typeof window.setDistributionSection === 'function') window.setDistributionSection('prospects');
      else setSection('prospects');
    });
    el.querySelectorAll('[data-dist-open-quote]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (typeof window.setDistributionSection === 'function') window.setDistributionSection('quotations');
        else setSection('quotations');
        openQuoteEditor(btn.getAttribute('data-dist-open-quote'));
      });
    });
    el.querySelector('#dist-add-brand')?.addEventListener('click', () => editBrand(null));
    el.querySelectorAll('[data-dist-edit-brand]').forEach((btn) => {
      btn.addEventListener('click', () => editBrand(btn.getAttribute('data-dist-edit-brand')));
    });
  }

  function editBrand(id) {
    const existing = id ? brandById(id) : null;
    const name = prompt('Brand name:', existing?.name || '');
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const notes = prompt('Notes (optional):', existing?.notes || '') ?? (existing?.notes || '');
    if (existing) {
      existing.name = trimmed;
      existing.notes = notes;
    } else {
      const brandId = uid('brand');
      state.brands.push({
        id: brandId,
        name: trimmed,
        slug: trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        logo: '',
        notes,
        active: true,
        createdAt: new Date().toISOString()
      });
      state.optionCategories.push(...defaultCategories(brandId));
    }
    persist();
    render();
    toast(existing ? 'Brand updated' : 'Brand added');
  }

  /* ─── Catalog ─── */
  function renderCatalog() {
    const el = document.getElementById('dist-catalog');
    if (!el) return;
    if (!catalogBrandFilter && state.brands[0]) catalogBrandFilter = state.brands[0].id;
    const brandId = catalogBrandFilter;
    const models = state.models.filter((m) => m.brandId === brandId);
    if (!catalogModelFilter || !models.some((m) => m.id === catalogModelFilter)) {
      catalogModelFilter = models[0]?.id || '';
    }
    const model = modelById(catalogModelFilter);
    const cats = state.optionCategories
      .filter((c) => c.brandId === brandId)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    const optionsForModel = (catId) =>
      state.options.filter((o) => {
        if (o.categoryId !== catId || o.active === false) return false;
        if (!catalogModelFilter) return true;
        if (!o.modelIds || !o.modelIds.length) return true;
        return o.modelIds.includes(catalogModelFilter);
      });

    el.innerHTML = `
      <div class="dist-toolbar">
        <div class="dist-filters">
          <label>Brand
            <select id="dist-cat-brand">${state.brands.map((b) => `<option value="${esc(b.id)}" ${b.id === brandId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
          </label>
          <label>Model
            <select id="dist-cat-model">
              ${models.map((m) => `<option value="${esc(m.id)}" ${m.id === catalogModelFilter ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
              ${!models.length ? '<option value="">— No models —</option>' : ''}
            </select>
          </label>
        </div>
        <div class="dist-actions">
          <button type="button" class="btn btn-secondary btn-sm" id="dist-add-model">Add model</button>
          <button type="button" class="btn btn-secondary btn-sm" id="dist-edit-model" ${model ? '' : 'disabled'}>Edit model</button>
          <button type="button" class="btn btn-primary btn-sm" id="dist-add-option" ${model ? '' : 'disabled'}>Add option</button>
        </div>
      </div>
      ${model ? `
        <div class="dist-card">
          <div class="dist-card-header">
            <h3>${esc(model.name)} — standard equipment & specs</h3>
            <div class="dist-price">${money(model.basePrice, model.currency)} <span style="font-size:.75rem;font-weight:500;color:var(--text-muted)">standard equipment (without engine)</span></div>
          </div>
          <div class="dist-split">
            <div>
              <h4 style="margin:0 0 .5rem;font-size:.85rem;color:var(--text-muted)">Standard equipment</h4>
              ${(model.standardEquipment || []).map((g) => `
                <div class="dist-opt-group">
                  <div class="dist-opt-group-title">${esc(g.category)}</div>
                  <ul style="margin:0;padding-left:1.1rem;font-size:.88rem;color:var(--text-secondary)">
                    ${(g.items || []).map((it) => `<li>${esc(it)}</li>`).join('')}
                  </ul>
                </div>`).join('') || '<p class="dist-empty">No standard equipment listed.</p>'}
            </div>
            <div>
              <h4 style="margin:0 0 .5rem;font-size:.85rem;color:var(--text-muted)">Technical specifications</h4>
              <table class="dist-table">
                <tbody>
                  ${Object.entries(model.techSpecs || {}).map(([k, v]) => `
                    <tr><td style="text-transform:uppercase;font-size:.72rem;letter-spacing:.04em;color:var(--text-muted)">${esc(k)}</td><td><strong>${esc(v)}</strong></td></tr>`).join('') || '<tr><td colspan="2">No specs</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div class="dist-card" style="margin-top:1rem">
          <div class="dist-card-header"><h3>Options & prices</h3>
            <span class="dist-badge draft">${optionsForModel(cats[0]?.id).length >= 0 ? state.options.filter((o) => o.brandId === brandId && (!o.modelIds?.length || o.modelIds.includes(model.id))).length : 0} options</span>
          </div>
          ${cats.map((cat) => {
            const opts = optionsForModel(cat.id);
            if (!opts.length) {
              return `<div class="dist-opt-group"><div class="dist-opt-group-title">${esc(cat.label)}</div><p class="dist-empty" style="padding:.5rem 0">No options yet.</p></div>`;
            }
            if (cat.subgroupBy) {
              const groups = {};
              opts.forEach((o) => {
                const g = o.subgroup || 'Other';
                (groups[g] = groups[g] || []).push(o);
              });
              return `<div class="dist-opt-group"><div class="dist-opt-group-title">${esc(cat.label)}</div>
                ${Object.keys(groups).map((g) => `
                  <div style="margin-bottom:.75rem">
                    <div style="font-weight:700;font-size:.8rem;margin:.4rem 0;color:var(--accent)">${esc(g)}</div>
                    <table class="dist-table"><thead><tr><th>Option</th><th>Price</th><th></th></tr></thead>
                    <tbody>${groups[g].map((o) => optionRow(o)).join('')}</tbody></table>
                  </div>`).join('')}
              </div>`;
            }
            return `<div class="dist-opt-group"><div class="dist-opt-group-title">${esc(cat.label)}</div>
              <table class="dist-table"><thead><tr><th>Option</th><th>Price</th><th></th></tr></thead>
              <tbody>${opts.map((o) => optionRow(o)).join('')}</tbody></table></div>`;
          }).join('')}
        </div>` : '<div class="dist-empty">Add a boat model for this brand to manage options and prices.</div>'}`;

    el.querySelector('#dist-cat-brand')?.addEventListener('change', (e) => {
      catalogBrandFilter = e.target.value;
      catalogModelFilter = '';
      renderCatalog();
    });
    el.querySelector('#dist-cat-model')?.addEventListener('change', (e) => {
      catalogModelFilter = e.target.value;
      renderCatalog();
    });
    el.querySelector('#dist-add-model')?.addEventListener('click', () => editModel(null, brandId));
    el.querySelector('#dist-edit-model')?.addEventListener('click', () => model && editModel(model.id, brandId));
    el.querySelector('#dist-add-option')?.addEventListener('click', () => model && editOption(null, brandId, model.id));
    el.querySelectorAll('[data-dist-edit-opt]').forEach((btn) => {
      btn.addEventListener('click', () => editOption(btn.getAttribute('data-dist-edit-opt'), brandId, catalogModelFilter));
    });
    el.querySelectorAll('[data-dist-del-opt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!confirm('Deactivate this option?')) return;
        const o = optionById(btn.getAttribute('data-dist-del-opt'));
        if (o) { o.active = false; persist(); renderCatalog(); }
      });
    });
  }

  function optionRow(o) {
    return `<tr>
      <td>${esc(o.name)}${o.notes ? `<div class="meta" style="font-size:.75rem;color:var(--text-muted)">${esc(o.notes)}</div>` : ''}</td>
      <td class="dist-price" style="font-size:.95rem">${money(o.price)}</td>
      <td class="dist-actions">
        <button type="button" class="btn btn-secondary btn-sm" data-dist-edit-opt="${esc(o.id)}">Edit</button>
        <button type="button" class="btn btn-secondary btn-sm" data-dist-del-opt="${esc(o.id)}">Remove</button>
      </td>
    </tr>`;
  }

  function editModel(id, brandId) {
    const existing = id ? modelById(id) : null;
    const name = prompt('Model name:', existing?.name || '');
    if (name == null || !name.trim()) return;
    const priceStr = prompt('Standard equipment price without engine (EUR):', existing ? String(existing.basePrice) : '0');
    if (priceStr == null) return;
    const basePrice = Number(String(priceStr).replace(',', '.')) || 0;
    if (existing) {
      existing.name = name.trim();
      existing.basePrice = basePrice;
    } else {
      state.models.push({
        id: uid('model'),
        brandId,
        name: name.trim(),
        basePrice,
        currency: state.settings.defaultCurrency || 'EUR',
        active: true,
        techSpecs: {},
        standardEquipment: [],
        notes: '',
        createdAt: new Date().toISOString()
      });
    }
    persist();
    renderCatalog();
    toast(existing ? 'Model updated' : 'Model created');
  }

  function editOption(id, brandId, modelId) {
    const existing = id ? optionById(id) : null;
    const cats = state.optionCategories.filter((c) => c.brandId === brandId).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    if (!cats.length) {
      toast('No option categories for this brand', 'error');
      return;
    }
    const catLabels = cats.map((c, i) => `${i + 1}. ${c.label}`).join('\n');
    const catPick = prompt(`Category number:\n${catLabels}`, existing ? String(cats.findIndex((c) => c.id === existing.categoryId) + 1) : '1');
    if (catPick == null) return;
    const cat = cats[Number(catPick) - 1];
    if (!cat) { toast('Invalid category', 'error'); return; }
    const name = prompt('Option name:', existing?.name || '');
    if (name == null || !name.trim()) return;
    const priceStr = prompt('Unit price (EUR):', existing ? String(existing.price) : '0');
    if (priceStr == null) return;
    const price = Number(String(priceStr).replace(',', '.')) || 0;
    let subgroup = existing?.subgroup || '';
    if (cat.subgroupBy) {
      const sg = prompt('Subgroup (e.g. YAMAHA, MERCURY):', subgroup || '');
      if (sg == null) return;
      subgroup = sg.trim().toUpperCase();
    }
    if (existing) {
      existing.categoryId = cat.id;
      existing.name = name.trim();
      existing.price = price;
      existing.subgroup = subgroup;
      if (modelId && (!existing.modelIds || !existing.modelIds.includes(modelId))) {
        existing.modelIds = [...(existing.modelIds || []), modelId];
      }
      existing.active = true;
    } else {
      state.options.push({
        id: uid('opt'),
        categoryId: cat.id,
        brandId,
        modelIds: modelId ? [modelId] : [],
        subgroup,
        name: name.trim(),
        price,
        unit: 'pcs',
        notes: '',
        active: true
      });
    }
    persist();
    renderCatalog();
    toast(existing ? 'Option updated' : 'Option added');
  }

  /* ─── Potential clients ─── */
  function renderProspects() {
    const el = document.getElementById('dist-prospects');
    if (!el) return;
    if (prospectEditorId !== null) {
      renderProspectEditor(el);
      return;
    }
    const q = (prospectSearch || '').trim().toLowerCase();
    let list = [...(state.potentialClients || [])].sort((a, b) =>
      (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '')
    );
    if (q) {
      list = list.filter((p) => {
        const hay = [p.company, p.contactName, p.email, p.phone, p.mobile, p.city, p.country, p.notes, p.interestNotes]
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
    }
    const newsletterCount = (state.potentialClients || []).filter((p) => p.newsletterOptIn && p.email).length;

    el.innerHTML = `
      <div class="dist-toolbar">
        <div>
          <p style="margin:0;color:var(--text-secondary);font-size:.9rem">
            Leads and prospects for quotations and newsletters. Separate from Accounting clients — convert only after they buy.
          </p>
          <p style="margin:.35rem 0 0;color:var(--text-muted);font-size:.8rem">${newsletterCount} with newsletter opt-in + email</p>
        </div>
        <div class="dist-actions">
          <input type="search" id="dist-prospect-search" class="search-input" placeholder="Search…" value="${esc(prospectSearch)}" style="min-width:180px">
          <button type="button" class="btn btn-primary" id="dist-add-prospect">Add potential client</button>
        </div>
      </div>
      <div class="dist-card">
        ${list.length ? `
          <table class="dist-table">
            <thead>
              <tr>
                <th>Company / contact</th>
                <th>Email</th>
                <th>Phone</th>
                <th>City</th>
                <th>Source</th>
                <th>Status</th>
                <th>Newsletter</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${list.map((p) => `
                <tr>
                  <td>
                    <strong>${esc(prospectLabel(p))}</strong>
                    ${p.convertedToClientId ? `<div class="meta" style="font-size:.72rem;color:var(--dist-accent)">Accounting client ${esc(p.convertedToClientCustomerId || 'linked')}</div>` : ''}
                  </td>
                  <td>${esc(p.email || '—')}</td>
                  <td>${esc(p.phone || p.mobile || '—')}</td>
                  <td>${esc([p.city, p.country].filter(Boolean).join(', ') || '—')}</td>
                  <td>${esc(statusLabel(PROSPECT_SOURCES, p.source))}</td>
                  <td><span class="dist-badge ${esc(p.status)}">${esc(statusLabel(PROSPECT_STATUSES, p.status))}</span></td>
                  <td>${p.newsletterOptIn ? 'Yes' : 'No'}</td>
                  <td class="dist-actions">
                    <button type="button" class="btn btn-secondary btn-sm" data-dist-edit-prospect="${esc(p.id)}">Edit</button>
                    <button type="button" class="btn btn-secondary btn-sm" data-dist-quote-prospect="${esc(p.id)}">Quote</button>
                    ${!p.convertedToClientId ? `<button type="button" class="btn btn-secondary btn-sm" data-dist-convert-prospect="${esc(p.id)}">Add as client</button>` : ''}
                    <button type="button" class="btn btn-secondary btn-sm" data-dist-del-prospect="${esc(p.id)}">Delete</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>` : '<div class="dist-empty">No potential clients yet. Add someone before building a quotation, or create them from the quote screen.</div>'}
      </div>`;

    el.querySelector('#dist-prospect-search')?.addEventListener('input', (e) => {
      prospectSearch = e.target.value || '';
      renderProspects();
    });
    el.querySelector('#dist-add-prospect')?.addEventListener('click', () => {
      prospectEditorId = '';
      renderProspects();
    });
    el.querySelectorAll('[data-dist-edit-prospect]').forEach((btn) => {
      btn.addEventListener('click', () => {
        prospectEditorId = btn.getAttribute('data-dist-edit-prospect');
        renderProspects();
      });
    });
    el.querySelectorAll('[data-dist-quote-prospect]').forEach((btn) => {
      btn.addEventListener('click', () => createQuoteForProspect(btn.getAttribute('data-dist-quote-prospect')));
    });
    el.querySelectorAll('[data-dist-convert-prospect]').forEach((btn) => {
      btn.addEventListener('click', () => convertProspectToAccountingClient(btn.getAttribute('data-dist-convert-prospect')));
    });
    el.querySelectorAll('[data-dist-del-prospect]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!confirm('Delete this potential client?')) return;
        const id = btn.getAttribute('data-dist-del-prospect');
        state.potentialClients = (state.potentialClients || []).filter((p) => p.id !== id);
        persist(true);
        renderProspects();
        toast('Potential client deleted');
      });
    });
  }

  function renderProspectEditor(el) {
    const isNew = prospectEditorId === '';
    const existing = isNew ? null : prospectById(prospectEditorId);
    if (!isNew && !existing) {
      prospectEditorId = null;
      renderProspects();
      return;
    }
    const p = existing || emptyProspect();

    el.innerHTML = `
      <div class="dist-toolbar">
        <button type="button" class="btn btn-secondary btn-sm" id="dist-prospect-back">← Back to list</button>
        <div class="dist-actions">
          ${existing && !existing.convertedToClientId ? `<button type="button" class="btn btn-secondary btn-sm" id="dist-prospect-convert">Add as Accounting client</button>` : ''}
          <button type="button" class="btn btn-primary btn-sm" id="dist-prospect-save">Save</button>
        </div>
      </div>
      <div class="dist-card">
        <div class="dist-card-header">
          <h3>${isNew ? 'New potential client' : 'Edit potential client'}</h3>
          ${existing?.convertedToClientId ? `<span class="dist-badge converted">Accounting client linked</span>` : `<span class="dist-badge ${esc(p.status)}">${esc(statusLabel(PROSPECT_STATUSES, p.status))}</span>`}
        </div>
        <div class="dist-form-grid">
          <div class="dist-field"><label>Company</label><input type="text" id="dp-company" value="${esc(p.company)}" placeholder="Company name"></div>
          <div class="dist-field"><label>Contact person</label><input type="text" id="dp-contact" value="${esc(p.contactName)}" placeholder="Full name"></div>
          <div class="dist-field"><label>Email</label><input type="email" id="dp-email" value="${esc(p.email)}"></div>
          <div class="dist-field"><label>Phone</label><input type="text" id="dp-phone" value="${esc(p.phone)}"></div>
          <div class="dist-field"><label>Mobile</label><input type="text" id="dp-mobile" value="${esc(p.mobile)}"></div>
          <div class="dist-field"><label>Website</label><input type="text" id="dp-website" value="${esc(p.website)}"></div>
          <div class="dist-field full"><label>Address</label><input type="text" id="dp-address" value="${esc(p.address)}"></div>
          <div class="dist-field"><label>Postal code</label><input type="text" id="dp-postal" value="${esc(p.postalCode)}"></div>
          <div class="dist-field"><label>City</label><input type="text" id="dp-city" value="${esc(p.city)}"></div>
          <div class="dist-field"><label>Country</label><input type="text" id="dp-country" value="${esc(p.country)}"></div>
          <div class="dist-field"><label>Tax ID / VAT</label><input type="text" id="dp-tax" value="${esc(p.taxId)}"></div>
          <div class="dist-field"><label>Source</label>
            <select id="dp-source">${PROSPECT_SOURCES.map((s) => `<option value="${s.value}" ${p.source === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
          </div>
          <div class="dist-field"><label>Status</label>
            <select id="dp-status">${PROSPECT_STATUSES.map((s) => `<option value="${s.value}" ${p.status === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
          </div>
          <div class="dist-field">
            <label class="admin-check-label" style="margin-top:1.6rem">
              <input type="checkbox" id="dp-newsletter" ${p.newsletterOptIn ? 'checked' : ''}> Newsletter opt-in
            </label>
          </div>
          <div class="dist-field full"><label>Interest / models of interest</label><textarea id="dp-interest" rows="2" placeholder="e.g. 720 Cruiser, twin engines…">${esc(p.interestNotes)}</textarea></div>
          <div class="dist-field full"><label>Internal notes</label><textarea id="dp-notes" rows="2">${esc(p.notes)}</textarea></div>
        </div>
      </div>`;

    const readForm = () => ({
      company: el.querySelector('#dp-company')?.value.trim() || '',
      contactName: el.querySelector('#dp-contact')?.value.trim() || '',
      email: el.querySelector('#dp-email')?.value.trim() || '',
      phone: el.querySelector('#dp-phone')?.value.trim() || '',
      mobile: el.querySelector('#dp-mobile')?.value.trim() || '',
      website: el.querySelector('#dp-website')?.value.trim() || '',
      address: el.querySelector('#dp-address')?.value.trim() || '',
      postalCode: el.querySelector('#dp-postal')?.value.trim() || '',
      city: el.querySelector('#dp-city')?.value.trim() || '',
      country: el.querySelector('#dp-country')?.value.trim() || '',
      taxId: el.querySelector('#dp-tax')?.value.trim() || '',
      source: el.querySelector('#dp-source')?.value || 'other',
      status: el.querySelector('#dp-status')?.value || 'lead',
      newsletterOptIn: !!el.querySelector('#dp-newsletter')?.checked,
      interestNotes: el.querySelector('#dp-interest')?.value.trim() || '',
      notes: el.querySelector('#dp-notes')?.value.trim() || ''
    });

    el.querySelector('#dist-prospect-back')?.addEventListener('click', () => {
      prospectEditorId = null;
      renderProspects();
    });
    el.querySelector('#dist-prospect-save')?.addEventListener('click', () => {
      const data = readForm();
      if (!data.company && !data.contactName) {
        toast('Enter a company or contact name', 'error');
        return;
      }
      if (existing) {
        Object.assign(existing, data, { updatedAt: new Date().toISOString() });
        persist(true);
        toast('Potential client updated');
        prospectEditorId = null;
      } else {
        const created = normalizeProspect(Object.assign(emptyProspect(), data));
        state.potentialClients.unshift(created);
        persist(true);
        toast('Potential client added');
        prospectEditorId = null;
      }
      renderProspects();
    });
    el.querySelector('#dist-prospect-convert')?.addEventListener('click', () => {
      if (!existing) return;
      const data = readForm();
      Object.assign(existing, data, { updatedAt: new Date().toISOString() });
      persist(true);
      convertProspectToAccountingClient(existing.id);
    });
  }

  function convertProspectToAccountingClient(prospectId) {
    const p = prospectById(prospectId);
    if (!p) return;
    if (p.convertedToClientId) {
      toast('Already linked to an Accounting client', 'error');
      return;
    }
    if (!window.DataStore || typeof window.DataStore.saveClient !== 'function') {
      toast('Accounting module is not available', 'error');
      return;
    }
    const companyName = (p.company || '').trim() || (p.contactName || '').trim();
    if (!companyName) {
      toast('Company or contact name is required to create a client', 'error');
      return;
    }
    if (!confirm(`Create Accounting client for “${companyName}”? Use this after they purchase.`)) return;

    let customerId = '';
    try {
      if (typeof window.DataStore.getNextCustomerId === 'function') {
        customerId = window.DataStore.getNextCustomerId();
      }
    } catch (_) { /* ignore */ }

    const client = {
      id: uid('client'),
      customerId: customerId || '',
      name: companyName,
      contactPerson: p.company ? (p.contactName || '') : '',
      company: '',
      address: [p.address, p.postalCode, p.city, p.country].filter(Boolean).join(', '),
      email: p.email || '',
      phone: p.phone || p.mobile || '',
      taxId: p.taxId || '',
      website: p.website || '',
      notes: [
        'Converted from Distribution potential client.',
        p.interestNotes ? `Interest: ${p.interestNotes}` : '',
        p.notes || ''
      ].filter(Boolean).join('\n'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      window.DataStore.saveClient(client);
      p.convertedToClientId = client.id;
      p.convertedToClientCustomerId = client.customerId || client.id;
      p.convertedAt = new Date().toISOString();
      if (p.status !== 'won') p.status = 'won';
      p.updatedAt = new Date().toISOString();
      persist(true);
      toast(`Accounting client ${client.customerId || ''} created`);
      if (typeof window.ClientsModule !== 'undefined' && window.ClientsModule.render) {
        try { window.ClientsModule.render(); } catch (_) { /* ignore */ }
      }
      renderProspects();
    } catch (err) {
      console.error(err);
      toast(err?.message || 'Failed to create Accounting client', 'error');
    }
  }

  function createQuoteForProspect(prospectId) {
    if (typeof window.setDistributionSection === 'function') window.setDistributionSection('quotations');
    else setSection('quotations');
    createQuote(prospectId);
  }

  /* ─── Quotations ─── */
  function renderQuotations() {
    const el = document.getElementById('dist-quotations');
    if (!el) return;
    if (quoteEditorId) {
      renderQuoteEditor(el);
      return;
    }
    const list = [...state.quotations].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    el.innerHTML = `
      <div class="dist-toolbar">
        <p style="margin:0;color:var(--text-secondary);font-size:.9rem">Build quotations for potential clients from model options, apply line discounts, print, and convert to a proforma invoice.</p>
        <button type="button" class="btn btn-primary" id="dist-new-quote">New quotation</button>
      </div>
      <div class="dist-card">
        ${list.length ? `
          <table class="dist-table">
            <thead><tr><th>Number</th><th>Date</th><th>Potential client</th><th>Model</th><th>Total</th><th>Status</th><th></th></tr></thead>
            <tbody>
              ${list.map((q) => {
                const m = modelById(q.modelId);
                return `<tr>
                  <td><strong>${esc(q.number)}</strong></td>
                  <td>${esc(q.date || '—')}</td>
                  <td>${esc(q.clientSnapshot?.name || '—')}</td>
                  <td>${esc(m?.name || '—')}</td>
                  <td>${money(q.total, q.currency)}</td>
                  <td><span class="dist-badge ${esc(q.status)}">${esc(q.status)}</span>
                    ${q.convertedToProformaId ? `<div class="meta" style="font-size:.72rem">PF linked</div>` : ''}
                  </td>
                  <td class="dist-actions">
                    <button type="button" class="btn btn-secondary btn-sm" data-dist-open-quote="${esc(q.id)}">Open</button>
                    <button type="button" class="btn btn-secondary btn-sm" data-dist-print-quote="${esc(q.id)}">Print</button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>` : '<div class="dist-empty">No quotations yet.</div>'}
      </div>`;
    el.querySelector('#dist-new-quote')?.addEventListener('click', () => createQuote());
    el.querySelectorAll('[data-dist-open-quote]').forEach((btn) => {
      btn.addEventListener('click', () => openQuoteEditor(btn.getAttribute('data-dist-open-quote')));
    });
    el.querySelectorAll('[data-dist-print-quote]').forEach((btn) => {
      btn.addEventListener('click', () => printQuote(btn.getAttribute('data-dist-print-quote')));
    });
  }

  function isEngineOption(opt) {
    if (!opt) return false;
    const cat = categoryById(opt.categoryId);
    return !!(cat && cat.key === 'engines');
  }

  function hullLineDescription(brand, model) {
    return `${brand?.name || ''} ${model?.name || ''} — standard equipment (without engine)`.trim();
  }

  function enginePackageDescription(brand, model, engineOpt) {
    const eng = `${engineOpt.subgroup ? engineOpt.subgroup + ' · ' : ''}${engineOpt.name}`;
    return `${brand?.name || ''} ${model?.name || ''} + ${eng} (incl. standard equipment)`.trim();
  }

  function ensureHullOrEngineLine(q) {
    const brand = brandById(q.brandId);
    const model = modelById(q.modelId);
    const disc = Number(state.settings.defaultDiscountPercent) || 0;
    const hasEngine = (q.lines || []).some((ln) => ln.kind === 'option' && ln.categoryKey === 'engines');
    const hullIdx = (q.lines || []).findIndex((ln) => ln.kind === 'model' || ln.categoryKey === 'hull');
    if (hasEngine) {
      if (hullIdx >= 0) q.lines.splice(hullIdx, 1);
      return;
    }
    if (hullIdx >= 0) {
      const hull = q.lines[hullIdx];
      hull.refId = model?.id || hull.refId;
      hull.description = hullLineDescription(brand, model);
      hull.unitPrice = model?.basePrice || 0;
      hull.kind = 'model';
      hull.categoryKey = 'hull';
      return;
    }
    if (model) {
      q.lines.unshift({
        id: uid('line'),
        kind: 'model',
        refId: model.id,
        description: hullLineDescription(brand, model),
        qty: 1,
        unit: 'pcs',
        unitPrice: model.basePrice || 0,
        discountPercent: disc,
        categoryKey: 'hull'
      });
    }
  }

  function syncQuoteSelectedOptions(q, selectedIds) {
    const brand = brandById(q.brandId);
    const model = modelById(q.modelId);
    const disc = Number(state.settings.defaultDiscountPercent) || 0;
    const uniqueIds = [];
    (selectedIds || []).forEach((id) => {
      const sid = String(id || '');
      if (!sid || uniqueIds.indexOf(sid) !== -1) return;
      uniqueIds.push(sid);
    });
    const selected = uniqueIds.map((id) => optionById(id)).filter(Boolean);
    const engineOpts = selected.filter(isEngineOption);
    const otherOpts = selected.filter((o) => !isEngineOption(o));
    const engine = engineOpts[0] || null; // one engine package only
    const customLines = (q.lines || []).filter((ln) => ln.kind === 'custom');
    const prevByRef = {};
    (q.lines || []).forEach((ln) => {
      if (ln.kind === 'option' && ln.refId) prevByRef[String(ln.refId)] = ln;
    });

    const lines = [];
    if (engine) {
      const prev = prevByRef[String(engine.id)];
      lines.push({
        id: prev?.id || uid('line'),
        kind: 'option',
        refId: engine.id,
        description: enginePackageDescription(brand, model, engine),
        qty: prev?.qty != null ? prev.qty : 1,
        unit: engine.unit || 'pcs',
        unitPrice: Number(engine.price) || 0,
        discountPercent: prev?.discountPercent != null ? prev.discountPercent : disc,
        categoryKey: 'engines',
        includesStandardEquipment: true
      });
    } else if (model) {
      const prevHull = (q.lines || []).find((ln) => ln.kind === 'model' || ln.categoryKey === 'hull');
      lines.push({
        id: prevHull?.id || uid('line'),
        kind: 'model',
        refId: model.id,
        description: hullLineDescription(brand, model),
        qty: prevHull?.qty != null ? prevHull.qty : 1,
        unit: 'pcs',
        unitPrice: Number(model.basePrice) || 0,
        discountPercent: prevHull?.discountPercent != null ? prevHull.discountPercent : disc,
        categoryKey: 'hull'
      });
    }

    otherOpts.forEach((o) => {
      const cat = categoryById(o.categoryId);
      const prev = prevByRef[String(o.id)];
      lines.push({
        id: prev?.id || uid('line'),
        kind: 'option',
        refId: o.id,
        description: prev?.description || `${o.subgroup ? o.subgroup + ' · ' : ''}${o.name}`,
        qty: prev?.qty != null ? prev.qty : 1,
        unit: o.unit || 'pcs',
        unitPrice: Number(o.price) || 0,
        discountPercent: prev?.discountPercent != null ? prev.discountPercent : disc,
        categoryKey: cat?.key || ''
      });
    });

    q.lines = lines.concat(customLines);
    q.updatedAt = new Date().toISOString();
    recalcQuote(q);
    return q.lines.length;
  }

  function createQuote(prospectId) {
    const brand = state.brands[0];
    if (!brand) { toast('Add a brand first', 'error'); return; }
    const models = state.models.filter((m) => m.brandId === brand.id && m.active !== false);
    if (!models.length) { toast('Add a model first', 'error'); return; }
    const model = models[0];
    const disc = Number(state.settings.defaultDiscountPercent) || 0;
    const prospect = prospectId ? prospectById(prospectId) : null;
    const q = {
      id: uid('quote'),
      number: nextQuoteNumber(),
      date: todayISO(),
      status: 'draft',
      prospectId: prospect ? prospect.id : '',
      clientId: '', // legacy; quotations use potential clients only
      clientSnapshot: snapshotFromProspect(prospect),
      brandId: brand.id,
      modelId: model.id,
      currency: model.currency || 'EUR',
      lines: [
        {
          id: uid('line'),
          kind: 'model',
          refId: model.id,
          description: hullLineDescription(brand, model),
          qty: 1,
          unit: 'pcs',
          unitPrice: model.basePrice || 0,
          discountPercent: disc,
          categoryKey: 'hull'
        }
      ],
      notes: '',
      taxRate: 0,
      taxAmount: 0,
      convertedToProformaId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    recalcQuote(q);
    state.quotations.unshift(q);
    persist(true);
    openQuoteEditor(q.id);
  }

  function openQuoteEditor(id) {
    quoteEditorId = id;
    renderQuotations();
  }

  function renderQuoteEditor(el) {
    const q = quoteById(quoteEditorId);
    if (!q) {
      quoteEditorId = null;
      renderQuotations();
      return;
    }
    recalcQuote(q);
    if (!q.prospectId && q.clientId) q.prospectId = '';
    const brand = brandById(q.brandId);
    const model = modelById(q.modelId);
    const prospects = [...(state.potentialClients || [])].sort((a, b) =>
      prospectLabel(a).localeCompare(prospectLabel(b))
    );

    el.innerHTML = `
      <div class="dist-toolbar">
        <button type="button" class="btn btn-secondary btn-sm" id="dist-quote-back">← Back to list</button>
        <div class="dist-actions">
          <button type="button" class="btn btn-secondary btn-sm" id="dist-quote-print">Print / PDF</button>
          <button type="button" class="btn btn-secondary btn-sm" id="dist-quote-proforma" ${q.convertedToProformaId ? 'disabled' : ''}>Convert to proforma</button>
          <button type="button" class="btn btn-secondary btn-sm" id="dist-quote-sold">Mark as sold vessel</button>
          <button type="button" class="btn btn-primary btn-sm" id="dist-quote-save">Save</button>
        </div>
      </div>
      <div class="dist-card">
        <div class="dist-card-header">
          <h3>Quotation ${esc(q.number)}</h3>
          <span class="dist-badge ${esc(q.status)}">${esc(q.status)}</span>
        </div>
        <div class="dist-form-grid">
          <div class="dist-field"><label>Date</label><input type="date" id="dq-date" value="${esc(q.date || '')}"></div>
          <div class="dist-field"><label>Status</label>
            <select id="dq-status">${QUOTE_STATUSES.map((s) => `<option value="${s.value}" ${q.status === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
          </div>
          <div class="dist-field full"><label>Potential client</label>
            <div class="dist-actions" style="align-items:stretch">
              <select id="dq-prospect" style="flex:1;min-width:220px">
                <option value="">— Select potential client —</option>
                ${prospects.map((p) => `<option value="${esc(p.id)}" ${(q.prospectId || '') === p.id ? 'selected' : ''}>${esc(prospectLabel(p))}</option>`).join('')}
              </select>
              <button type="button" class="btn btn-secondary btn-sm" id="dq-new-prospect">New</button>
              <button type="button" class="btn btn-secondary btn-sm" id="dq-manage-prospects">Manage list</button>
            </div>
          </div>
          <div class="dist-field"><label>Company / name on quote</label><input type="text" id="dq-cname" value="${esc(q.clientSnapshot?.name || '')}" placeholder="Shown on quotation"></div>
          <div class="dist-field"><label>Contact person</label><input type="text" id="dq-ccontact" value="${esc(q.clientSnapshot?.contactName || '')}"></div>
          <div class="dist-field"><label>Email</label><input type="email" id="dq-cemail" value="${esc(q.clientSnapshot?.email || '')}"></div>
          <div class="dist-field"><label>Phone</label><input type="text" id="dq-cphone" value="${esc(q.clientSnapshot?.phone || '')}"></div>
          <div class="dist-field full"><label>Address</label><input type="text" id="dq-caddress" value="${esc(q.clientSnapshot?.address || '')}"></div>
          <div class="dist-field"><label>Brand</label>
            <select id="dq-brand">${state.brands.map((b) => `<option value="${esc(b.id)}" ${b.id === q.brandId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
          </div>
          <div class="dist-field"><label>Model</label>
            <select id="dq-model">${state.models.filter((m) => m.brandId === q.brandId).map((m) => `<option value="${esc(m.id)}" ${m.id === q.modelId ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
          </div>
        </div>
        <div class="dist-field" style="margin-top:.75rem"><label>Notes (shown on quote)</label>
          <textarea id="dq-notes" rows="2">${esc(q.notes || '')}</textarea>
        </div>
      </div>

      <div class="dist-card" style="margin-top:1rem">
        <div class="dist-card-header">
          <h3>Line items</h3>
          <div class="dist-actions">
            <button type="button" class="btn btn-primary btn-sm" id="dq-open-options">Select options…</button>
            <button type="button" class="btn btn-secondary btn-sm" id="dq-add-custom">Custom line</button>
          </div>
        </div>
        <p class="dist-hint" style="margin:0 0 .75rem">
          Standard equipment is the vessel without engine. A main engine price already includes standard equipment — selecting an engine replaces the without-engine line.
        </p>
        ${(() => {
          const selectedOpts = (q.lines || []).filter((ln) => ln.kind === 'option');
          if (!selectedOpts.length) {
            return '<div class="dist-selected-summary dist-selected-summary--empty">No catalog options selected yet. Use <strong>Select options…</strong> to add an engine and extras.</div>';
          }
          return `<div class="dist-selected-summary">
            <div class="dist-selected-summary-title">Selected options (${selectedOpts.length})</div>
            <div class="dist-chip-list">
              ${selectedOpts.map((ln) => `
                <span class="dist-chip ${ln.categoryKey === 'engines' ? 'dist-chip--engine' : ''}">
                  ${esc(ln.description)} · ${money(ln.unitPrice, q.currency)}
                </span>`).join('')}
            </div>
          </div>`;
        })()}
        <div style="overflow-x:auto">
          <table class="dist-table dist-quote-lines">
            <thead>
              <tr>
                <th>Description</th>
                <th>Qty</th>
                <th>Unit €</th>
                <th>Subtotal</th>
                <th>Disc. %</th>
                <th>Final €</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${(q.lines || []).length ? (q.lines || []).map((ln, idx) => `
                <tr data-line-idx="${idx}" class="${ln.kind === 'option' ? 'dist-line-option' : ''} ${ln.categoryKey === 'engines' ? 'dist-line-engine' : ''}">
                  <td><input type="text" data-f="description" value="${esc(ln.description)}"></td>
                  <td><input type="number" min="0" step="1" data-f="qty" value="${esc(ln.qty)}"></td>
                  <td><input type="number" min="0" step="0.01" data-f="unitPrice" value="${esc(ln.unitPrice)}"></td>
                  <td>${money(lineSubtotal(ln), q.currency)}</td>
                  <td><input type="number" min="0" max="100" step="1" data-f="discountPercent" value="${esc(ln.discountPercent)}"></td>
                  <td><strong>${money(lineTotal(ln), q.currency)}</strong></td>
                  <td><button type="button" class="btn btn-secondary btn-sm" data-del-line="${idx}">×</button></td>
                </tr>`).join('') : '<tr><td colspan="7" class="dist-empty">No line items.</td></tr>'}
            </tbody>
          </table>
        </div>
        <div class="dist-totals">
          <div class="row"><span>Quote total (list)</span><strong>${money(q.subtotal, q.currency)}</strong></div>
          <div class="row"><span>Discounts</span><strong>− ${money(q.discountAmount, q.currency)}</strong></div>
          <div class="row grand"><span>Final quote total</span><strong>${money(q.total, q.currency)}</strong></div>
          ${q.convertedToProformaId ? `<div class="row"><span>Proforma</span><strong>${esc(q.convertedToProformaNumber || q.convertedToProformaId)}</strong></div>` : ''}
        </div>
      </div>`;

    const saveFields = () => {
      q.date = el.querySelector('#dq-date')?.value || q.date;
      q.status = el.querySelector('#dq-status')?.value || q.status;
      q.notes = el.querySelector('#dq-notes')?.value || '';
      q.prospectId = el.querySelector('#dq-prospect')?.value || '';
      q.clientId = '';
      q.clientSnapshot = {
        name: el.querySelector('#dq-cname')?.value || '',
        contactName: el.querySelector('#dq-ccontact')?.value || '',
        email: el.querySelector('#dq-cemail')?.value || '',
        phone: el.querySelector('#dq-cphone')?.value || '',
        company: el.querySelector('#dq-cname')?.value || '',
        address: el.querySelector('#dq-caddress')?.value || '',
        city: q.clientSnapshot?.city || '',
        country: q.clientSnapshot?.country || '',
        postalCode: q.clientSnapshot?.postalCode || '',
        taxId: q.clientSnapshot?.taxId || ''
      };
      const newBrand = el.querySelector('#dq-brand')?.value;
      const newModel = el.querySelector('#dq-model')?.value;
      if (newBrand && newBrand !== q.brandId) {
        q.brandId = newBrand;
        const ms = state.models.filter((m) => m.brandId === newBrand);
        q.modelId = ms[0]?.id || '';
      } else if (newModel) {
        q.modelId = newModel;
      }
      el.querySelectorAll('.dist-quote-lines tbody tr').forEach((tr) => {
        const idx = Number(tr.getAttribute('data-line-idx'));
        const ln = q.lines[idx];
        if (!ln) return;
        tr.querySelectorAll('[data-f]').forEach((input) => {
          const f = input.getAttribute('data-f');
          if (f === 'description') ln.description = input.value;
          else ln[f] = Number(input.value) || 0;
        });
      });
      recalcQuote(q);
      q.updatedAt = new Date().toISOString();
    };

    const applyProspectToForm = (p) => {
      const snap = snapshotFromProspect(p);
      el.querySelector('#dq-cname').value = snap.name;
      el.querySelector('#dq-ccontact').value = snap.contactName;
      el.querySelector('#dq-cemail').value = snap.email;
      el.querySelector('#dq-cphone').value = snap.phone;
      el.querySelector('#dq-caddress').value = snap.address;
      q.clientSnapshot = snap;
    };

    el.querySelector('#dist-quote-back')?.addEventListener('click', () => {
      saveFields();
      persist(true);
      quoteEditorId = null;
      renderQuotations();
    });
    el.querySelector('#dist-quote-save')?.addEventListener('click', () => {
      saveFields();
      persist(true);
      toast('Quotation saved');
      renderQuoteEditor(el);
    });
    el.querySelector('#dist-quote-print')?.addEventListener('click', () => {
      saveFields();
      persist(true);
      printQuote(q.id);
    });
    el.querySelector('#dist-quote-proforma')?.addEventListener('click', () => {
      saveFields();
      convertToProforma(q);
    });
    el.querySelector('#dist-quote-sold')?.addEventListener('click', () => {
      saveFields();
      createSoldFromQuote(q);
    });
    el.querySelector('#dq-prospect')?.addEventListener('change', (e) => {
      const p = prospectById(e.target.value);
      if (!p) return;
      applyProspectToForm(p);
      q.prospectId = p.id;
      if (p.status === 'lead' || p.status === 'contacted') {
        p.status = 'quoted';
        p.updatedAt = new Date().toISOString();
      }
      persist();
    });
    el.querySelector('#dq-new-prospect')?.addEventListener('click', () => {
      saveFields();
      persist(true);
      const company = prompt('Company name (or leave blank):', '') ?? '';
      const contact = prompt('Contact person:', '') ?? '';
      if (!company.trim() && !contact.trim()) return;
      const email = prompt('Email:', '') ?? '';
      const phone = prompt('Phone:', '') ?? '';
      const created = normalizeProspect(Object.assign(emptyProspect(), {
        company: company.trim(),
        contactName: contact.trim(),
        email: email.trim(),
        phone: phone.trim(),
        status: 'quoted',
        source: 'other'
      }));
      state.potentialClients.unshift(created);
      q.prospectId = created.id;
      q.clientSnapshot = snapshotFromProspect(created);
      persist(true);
      toast('Potential client added');
      renderQuoteEditor(el);
    });
    el.querySelector('#dq-manage-prospects')?.addEventListener('click', () => {
      saveFields();
      persist(true);
      if (typeof window.setDistributionSection === 'function') window.setDistributionSection('prospects');
      else setSection('prospects');
    });
    el.querySelector('#dq-brand')?.addEventListener('change', () => {
      saveFields();
      persist();
      renderQuoteEditor(el);
    });
    el.querySelector('#dq-model')?.addEventListener('change', () => {
      saveFields();
      const m = modelById(el.querySelector('#dq-model').value);
      const b = brandById(q.brandId);
      if (m) {
        q.modelId = m.id;
        q.currency = m.currency || q.currency;
        const engineLine = (q.lines || []).find((l) => l.kind === 'option' && l.categoryKey === 'engines');
        if (engineLine) {
          const eng = optionById(engineLine.refId);
          if (eng) engineLine.description = enginePackageDescription(b, m, eng);
        } else {
          ensureHullOrEngineLine(q);
        }
      }
      persist();
      renderQuoteEditor(el);
    });
    el.querySelector('#dq-open-options')?.addEventListener('click', () => {
      saveFields();
      persist(true);
      openQuoteOptionsDialog(q.id, () => {
        const host = document.getElementById('dist-quotations') || el;
        renderQuoteEditor(host);
      });
    });
    el.querySelector('#dq-add-custom')?.addEventListener('click', () => {
      saveFields();
      q.lines.push({
        id: uid('line'),
        kind: 'custom',
        refId: '',
        description: 'Custom item',
        qty: 1,
        unit: 'pcs',
        unitPrice: 0,
        discountPercent: Number(state.settings.defaultDiscountPercent) || 0,
        categoryKey: 'custom'
      });
      persist();
      renderQuoteEditor(el);
    });
    el.querySelectorAll('[data-del-line]').forEach((btn) => {
      btn.addEventListener('click', () => {
        saveFields();
        const idx = Number(btn.getAttribute('data-del-line'));
        const removed = q.lines[idx];
        q.lines.splice(idx, 1);
        if (
          removed &&
          ((removed.kind === 'option' && removed.categoryKey === 'engines') ||
            removed.kind === 'model' ||
            removed.categoryKey === 'hull')
        ) {
          ensureHullOrEngineLine(q);
        }
        recalcQuote(q);
        persist();
        renderQuoteEditor(el);
      });
    });
    el.querySelectorAll('.dist-quote-lines [data-f]').forEach((input) => {
      input.addEventListener('change', () => {
        saveFields();
        persist();
        renderQuoteEditor(el);
      });
    });
  }

  function openQuoteOptionsDialog(quoteId, onDone) {
    const q = quoteById(quoteId);
    if (!q) {
      toast('Quotation not found', 'error');
      return;
    }
    const cats = state.optionCategories
      .filter((c) => c.brandId === q.brandId)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const optionChoices = optionsForQuote(q);
    const selected = new Set(
      (q.lines || [])
        .filter((ln) => ln.kind === 'option' && ln.refId)
        .map((ln) => String(ln.refId))
    );
    const currentEngineId = String(
      (q.lines || []).find((ln) => ln.kind === 'option' && ln.categoryKey === 'engines')?.refId || ''
    );
    const model = modelById(q.modelId);

    const renderOptRow = (o, isEngine) => {
      const checked = isEngine
        ? currentEngineId === String(o.id)
        : selected.has(String(o.id));
      return `<label class="dist-opt-check ${checked ? 'is-selected' : ''}">
        <input type="${isEngine ? 'radio' : 'checkbox'}"
          name="${isEngine ? 'dist-engine-opt' : 'dist-opt'}"
          value="${esc(o.id)}"
          ${checked ? 'checked' : ''}>
        <span class="dist-opt-check-mark" aria-hidden="true"></span>
        <span class="dist-opt-check-text">
          <span class="dist-opt-check-name">${esc(o.name)}</span>
          <span class="dist-opt-check-price">${money(o.price)}</span>
        </span>
      </label>`;
    };

    const overlay = document.createElement('div');
    overlay.className = 'dist-modal-overlay';
    overlay.innerHTML = `
      <div class="dist-modal" role="dialog" aria-modal="true" aria-labelledby="dist-opt-dialog-title">
        <div class="dist-modal-header">
          <div>
            <h3 id="dist-opt-dialog-title">Select options</h3>
            <p class="dist-hint">Tick options to include, then click <strong>Apply selection</strong>. Main engines are package prices (vessel + engine); only one engine can be selected.</p>
            <div class="dist-opt-selected-count" data-dist-opt-count>0 selected</div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" data-dist-opt-cancel aria-label="Close">✕</button>
        </div>
        <div class="dist-modal-body">
          ${cats.map((cat) => {
            const opts = optionChoices.filter((o) => o.categoryId === cat.id);
            if (!opts.length) return '';
            const isEngine = cat.key === 'engines';
            if (isEngine || cat.subgroupBy) {
              const groups = {};
              opts.forEach((o) => {
                const g = o.subgroup || 'Other';
                (groups[g] = groups[g] || []).push(o);
              });
              return `<div class="dist-option-group">
                <div class="dist-option-group-head">${esc(cat.label)}${isEngine ? ' — package price (incl. standard equipment)' : ''}</div>
                ${isEngine ? `
                  <div class="dist-opt-check-list">
                    <label class="dist-opt-check ${!currentEngineId ? 'is-selected' : ''}">
                      <input type="radio" name="dist-engine-opt" value="" ${!currentEngineId ? 'checked' : ''}>
                      <span class="dist-opt-check-mark" aria-hidden="true"></span>
                      <span class="dist-opt-check-text">
                        <span class="dist-opt-check-name">No engine — standard equipment only</span>
                        <span class="dist-opt-check-price">${money(model?.basePrice || 0)}</span>
                      </span>
                    </label>
                  </div>` : ''}
                ${Object.keys(groups).map((g) => `
                  <div class="dist-option-subgroup">${esc(g)}</div>
                  <div class="dist-opt-check-list">
                    ${groups[g].map((o) => renderOptRow(o, isEngine)).join('')}
                  </div>`).join('')}
              </div>`;
            }
            return `<div class="dist-option-group">
              <div class="dist-option-group-head">${esc(cat.label)}</div>
              <div class="dist-opt-check-list">
                ${opts.map((o) => renderOptRow(o, false)).join('')}
              </div>
            </div>`;
          }).join('') || '<div class="dist-empty">No catalog options for this model.</div>'}
        </div>
        <div class="dist-modal-footer">
          <button type="button" class="btn btn-secondary" data-dist-opt-cancel>Cancel</button>
          <button type="button" class="btn btn-primary" data-dist-opt-apply>Apply selection</button>
        </div>
      </div>`;

    const close = () => {
      overlay.remove();
      document.body.classList.remove('dist-modal-open');
    };

    const refreshSelectionUi = () => {
      overlay.querySelectorAll('.dist-opt-check').forEach((label) => {
        const input = label.querySelector('input');
        label.classList.toggle('is-selected', !!(input && input.checked));
      });
      let count = overlay.querySelectorAll('input[name="dist-opt"]:checked').length;
      const engine = overlay.querySelector('input[name="dist-engine-opt"]:checked');
      if (engine && engine.value) count += 1;
      const countEl = overlay.querySelector('[data-dist-opt-count]');
      if (countEl) countEl.textContent = `${count} selected`;
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    overlay.querySelectorAll('[data-dist-opt-cancel]').forEach((btn) => {
      btn.addEventListener('click', close);
    });
    overlay.addEventListener('change', (e) => {
      if (e.target && (e.target.name === 'dist-opt' || e.target.name === 'dist-engine-opt')) {
        refreshSelectionUi();
      }
    });
    overlay.querySelector('[data-dist-opt-apply]')?.addEventListener('click', () => {
      const ids = [];
      overlay.querySelectorAll('input[name="dist-opt"]:checked').forEach((input) => {
        if (input.value) ids.push(input.value);
      });
      const engine = overlay.querySelector('input[name="dist-engine-opt"]:checked');
      if (engine && engine.value) ids.push(engine.value);

      const target = quoteById(quoteId);
      if (!target) {
        toast('Quotation not found', 'error');
        close();
        return;
      }
      syncQuoteSelectedOptions(target, ids);
      quoteEditorId = target.id;
      persist(true);
      close();
      if (typeof onDone === 'function') onDone();
      else {
        const host = document.getElementById('dist-quotations');
        if (host) renderQuoteEditor(host);
      }
      const optCount = (target.lines || []).filter((ln) => ln.kind === 'option').length;
      toast(optCount ? `${optCount} option(s) on quotation` : 'Options cleared — standard equipment only');
    });

    document.body.classList.add('dist-modal-open');
    document.body.appendChild(overlay);
    refreshSelectionUi();
  }

  function printQuote(id) {
    const q = quoteById(id);
    if (!q) return;
    recalcQuote(q);
    const brand = brandById(q.brandId);
    const model = modelById(q.modelId);
    const company = state.settings.companyName || 'OlympicRibs Distribution';
    const footer = state.settings.quoteFooter || '';
    const specs = model?.techSpecs || {};
    const std = model?.standardEquipment || [];

    const win = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1000');
    if (!win) {
      toast('Allow pop-ups to print the quotation', 'error');
      return;
    }
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(q.number)}</title>
      <style>
        body{font-family:Georgia,'Times New Roman',serif;color:#0f172a;margin:32px;font-size:13px}
        h1{font-size:22px;margin:0 0 4px;letter-spacing:.04em}
        h2{font-size:14px;margin:24px 0 8px;text-transform:uppercase;letter-spacing:.08em;color:#334155;border-bottom:1px solid #cbd5e1;padding-bottom:4px}
        .muted{color:#64748b}
        .header{display:flex;justify-content:space-between;gap:24px;margin-bottom:20px}
        .meta td{padding:2px 12px 2px 0}
        table.lines{width:100%;border-collapse:collapse;margin-top:8px}
        table.lines th,table.lines td{border-bottom:1px solid #e2e8f0;padding:8px 6px;text-align:left}
        table.lines th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b}
        table.lines td.num,table.lines th.num{text-align:right}
        .totals{margin-top:16px;width:280px;margin-left:auto}
        .totals .row{display:flex;justify-content:space-between;padding:4px 0}
        .totals .grand{font-size:16px;font-weight:700;border-top:2px solid #0f172a;margin-top:6px;padding-top:8px}
        .highlight{background:#fef08a;padding:8px 12px;font-weight:700}
        ul{margin:4px 0 12px;padding-left:18px}
        @media print{body{margin:16px} .no-print{display:none}}
      </style></head><body>
      <div class="no-print" style="margin-bottom:16px">
        <button onclick="window.print()">Print / Save PDF</button>
        <button onclick="window.close()">Close</button>
      </div>
      <div class="header">
        <div>
          <h1>${esc(company)}</h1>
          <div class="muted">${esc(brand?.name || '')} · Distribution quotation</div>
          ${state.settings.companyDetails ? `<div class="muted" style="margin-top:6px;white-space:pre-line">${esc(state.settings.companyDetails)}</div>` : ''}
        </div>
        <div>
          <table class="meta">
            <tr><td class="muted">Quote</td><td><strong>${esc(q.number)}</strong></td></tr>
            <tr><td class="muted">Date</td><td>${esc(q.date || '')}</td></tr>
            <tr><td class="muted">Status</td><td>${esc(q.status)}</td></tr>
            <tr><td class="muted">Model</td><td>${esc(model?.name || '')}</td></tr>
          </table>
        </div>
      </div>
      <h2>Prepared for</h2>
      <div><strong>${esc(q.clientSnapshot?.name || '—')}</strong></div>
      ${q.clientSnapshot?.contactName ? `<div>${esc(q.clientSnapshot.contactName)}</div>` : ''}
      <div class="muted">${esc([q.clientSnapshot?.email, q.clientSnapshot?.phone].filter(Boolean).join(' · '))}</div>
      ${q.clientSnapshot?.address ? `<div class="muted">${esc(q.clientSnapshot.address)}</div>` : ''}

      ${Object.keys(specs).length ? `<h2>Technical specifications — ${esc(model?.name || '')}</h2>
        <table class="meta">${Object.entries(specs).map(([k, v]) => `<tr><td class="muted">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>` : ''}

      ${std.length ? `<h2>Standard equipment</h2>
        ${std.map((g) => `<div><strong>${esc(g.category)}</strong><ul>${(g.items || []).map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>`).join('')}` : ''}

      <h2>Quotation lines</h2>
      <table class="lines">
        <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Subtotal</th><th class="num">Disc.</th><th class="num">Final</th></tr></thead>
        <tbody>
          ${(q.lines || []).map((ln) => `<tr>
            <td>${esc(ln.description)}</td>
            <td class="num">${esc(ln.qty)}</td>
            <td class="num">${money(ln.unitPrice, q.currency)}</td>
            <td class="num">${money(lineSubtotal(ln), q.currency)}</td>
            <td class="num">${esc(ln.discountPercent || 0)}%</td>
            <td class="num">${money(lineTotal(ln), q.currency)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div class="totals">
        <div class="row"><span>List total</span><span>${money(q.subtotal, q.currency)}</span></div>
        <div class="row"><span>Discounts</span><span>− ${money(q.discountAmount, q.currency)}</span></div>
        <div class="row grand highlight"><span>Final total</span><span>${money(q.total, q.currency)}</span></div>
      </div>
      ${q.notes ? `<h2>Notes</h2><p>${esc(q.notes)}</p>` : ''}
      <p class="muted" style="margin-top:32px;font-size:11px">${esc(footer)}</p>
      </body></html>`);
    win.document.close();
  }

  function convertToProforma(q) {
    if (!window.DataStore || typeof window.DataStore.saveInvoice !== 'function') {
      toast('Accounting module is not available', 'error');
      return;
    }
    if (q.convertedToProformaId) {
      toast('Already converted to a proforma', 'error');
      return;
    }
    if (!confirm(`Create proforma invoice from quotation ${q.number}?`)) return;
    recalcQuote(q);

    let invoiceNumber = '';
    try {
      if (typeof window.DataStore.getNextProformaNumber === 'function') {
        invoiceNumber = window.DataStore.getNextProformaNumber();
      }
    } catch (_) { /* ignore */ }
    if (!invoiceNumber) invoiceNumber = 'PF-' + String(Date.now()).slice(-4);

    const items = (q.lines || []).map((ln) => {
      const qty = Number(ln.qty) || 1;
      const final = lineTotal(ln);
      const unitAfterDisc = qty ? Math.round((final / qty) * 100) / 100 : final;
      const disc = Number(ln.discountPercent) || 0;
      return {
        description: disc ? `${ln.description} (${disc}% discount)` : ln.description,
        quantity: qty,
        persons: 1,
        hours: 0,
        price: unitAfterDisc
      };
    });

    const subtotal = items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.price) || 0), 0);
    const taxRate = Number(q.taxRate) || 0;
    const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
    const total = Math.round((subtotal + taxAmount) * 100) / 100;
    const invoiceId = uid('inv');

    const invoice = {
      id: invoiceId,
      invoiceNumber,
      documentType: 'proforma',
      convertedToInvoiceId: '',
      sourceProformaId: '',
      status: 'draft',
      date: q.date || todayISO(),
      dueDate: '',
      clientCustomerId: '',
      clientId: '',
      clientName: q.clientSnapshot?.name || '',
      clientEmail: q.clientSnapshot?.email || '',
      clientPhone: q.clientSnapshot?.phone || '',
      clientAddress: q.clientSnapshot?.address || '',
      currency: q.currency || 'EUR',
      itemColumns: { code: true, qty: true, persons: false, hours: false },
      items,
      subtotal,
      taxRate,
      taxAmount,
      total,
      notes: `Converted from distribution quotation ${q.number}.${q.notes ? '\n' + q.notes : ''}`,
      distributionQuoteId: q.id,
      distributionQuoteNumber: q.number,
      distributionProspectId: q.prospectId || '',
      brandId: q.brandId,
      modelId: q.modelId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      window.DataStore.saveInvoice(invoice);
      q.convertedToProformaId = invoiceId;
      q.convertedToProformaNumber = invoiceNumber;
      q.status = 'converted';
      q.updatedAt = new Date().toISOString();
      persist(true);
      toast(`Proforma ${invoiceNumber} created in Accounting`);
      render();
    } catch (err) {
      console.error(err);
      toast(err?.message || 'Failed to create proforma', 'error');
    }
  }

  function createSoldFromQuote(q) {
    const model = modelById(q.modelId);
    const brand = brandById(q.brandId);
    const reg = prompt('Registration number:', '');
    if (reg == null) return;
    const hin = prompt('HIN number:', '') ?? '';
    const engine = prompt('Engine / propulsion summary:', engineSummaryFromQuote(q)) ?? '';
    const owner = q.clientSnapshot?.name || '';
    const vessel = {
      id: uid('vessel'),
      quoteId: q.id,
      quoteNumber: q.number,
      registration: reg.trim(),
      hin: hin.trim(),
      brandId: q.brandId,
      modelId: q.modelId,
      modelName: model?.name || '',
      brandName: brand?.name || '',
      engineSummary: engine.trim(),
      specs: Object.assign({}, model?.techSpecs || {}),
      ownerProspectId: q.prospectId || '',
      ownerClientId: '',
      ownerName: owner,
      ownerEmail: q.clientSnapshot?.email || '',
      ownerPhone: q.clientSnapshot?.phone || '',
      saleDate: todayISO(),
      saleTotal: q.total,
      currency: q.currency,
      notes: '',
      createdAt: new Date().toISOString()
    };
    state.soldVessels.unshift(vessel);
    if (q.status !== 'converted') q.status = 'accepted';
    const prospect = q.prospectId ? prospectById(q.prospectId) : null;
    if (prospect) {
      prospect.status = 'won';
      prospect.updatedAt = new Date().toISOString();
    }
    persist(true);
    toast('Sold vessel recorded');
    if (prospect && !prospect.convertedToClientId) {
      if (confirm('Add this potential client to Accounting clients now that they purchased?')) {
        convertProspectToAccountingClient(prospect.id);
      }
    }
    if (typeof window.setDistributionSection === 'function') window.setDistributionSection('sold');
    else setSection('sold');
  }

  function engineSummaryFromQuote(q) {
    const engineCat = state.optionCategories.find((c) => c.brandId === q.brandId && c.key === 'engines');
    if (!engineCat) return '';
    const engineOptIds = new Set(state.options.filter((o) => o.categoryId === engineCat.id).map((o) => o.id));
    const lines = (q.lines || []).filter((ln) => ln.kind === 'option' && engineOptIds.has(ln.refId));
    return lines.map((l) => l.description).join('; ');
  }

  /* ─── Sold vessels ─── */
  function renderSold() {
    const el = document.getElementById('dist-sold');
    if (!el) return;
    const list = state.soldVessels;
    el.innerHTML = `
      <div class="dist-toolbar">
        <p style="margin:0;color:var(--text-secondary);font-size:.9rem">Registry of vessels already sold — registration, HIN, engine, specs, and owner.</p>
        <button type="button" class="btn btn-primary" id="dist-add-vessel">Add sold vessel</button>
      </div>
      <div class="dist-card">
        ${list.length ? `
          <table class="dist-table">
            <thead>
              <tr><th>Registration</th><th>HIN</th><th>Model</th><th>Engine</th><th>Owner</th><th>Sale date</th><th></th></tr>
            </thead>
            <tbody>
              ${list.map((v) => `
                <tr>
                  <td><strong>${esc(v.registration || '—')}</strong></td>
                  <td>${esc(v.hin || '—')}</td>
                  <td>${esc(v.brandName || '')} ${esc(v.modelName || '')}</td>
                  <td>${esc(v.engineSummary || '—')}</td>
                  <td>${esc(v.ownerName || '—')}${v.ownerPhone ? `<div class="meta" style="font-size:.75rem">${esc(v.ownerPhone)}</div>` : ''}</td>
                  <td>${esc(v.saleDate || '—')}</td>
                  <td class="dist-actions">
                    <button type="button" class="btn btn-secondary btn-sm" data-dist-edit-vessel="${esc(v.id)}">Edit</button>
                    <button type="button" class="btn btn-secondary btn-sm" data-dist-del-vessel="${esc(v.id)}">Delete</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>` : '<div class="dist-empty">No sold vessels recorded yet. Convert an accepted quote or add manually.</div>'}
      </div>`;

    el.querySelector('#dist-add-vessel')?.addEventListener('click', () => editVessel(null));
    el.querySelectorAll('[data-dist-edit-vessel]').forEach((btn) => {
      btn.addEventListener('click', () => editVessel(btn.getAttribute('data-dist-edit-vessel')));
    });
    el.querySelectorAll('[data-dist-del-vessel]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!confirm('Delete this vessel record?')) return;
        state.soldVessels = state.soldVessels.filter((v) => v.id !== btn.getAttribute('data-dist-del-vessel'));
        persist(true);
        renderSold();
      });
    });
  }

  function editVessel(id) {
    const existing = id ? state.soldVessels.find((v) => v.id === id) : null;
    const brand = state.brands[0];
    const models = state.models.filter((m) => m.brandId === (existing?.brandId || brand?.id));
    const reg = prompt('Registration number:', existing?.registration || '');
    if (reg == null) return;
    const hin = prompt('HIN:', existing?.hin || '') ?? '';
    const modelNames = models.map((m, i) => `${i + 1}. ${m.name}`).join('\n');
    let model = existing ? modelById(existing.modelId) : models[0];
    if (models.length) {
      const pick = prompt(`Model number:\n${modelNames}`, String(models.findIndex((m) => m.id === model?.id) + 1 || 1));
      if (pick == null) return;
      model = models[Number(pick) - 1] || model;
    }
    const engine = prompt('Engine / specs summary:', existing?.engineSummary || '') ?? '';
    const owner = prompt('Owner name:', existing?.ownerName || '') ?? '';
    const phone = prompt('Owner phone:', existing?.ownerPhone || '') ?? '';
    const email = prompt('Owner email:', existing?.ownerEmail || '') ?? '';
    const saleDate = prompt('Sale date (YYYY-MM-DD):', existing?.saleDate || todayISO()) ?? todayISO();

    if (existing) {
      existing.registration = reg.trim();
      existing.hin = hin.trim();
      existing.modelId = model?.id || existing.modelId;
      existing.modelName = model?.name || existing.modelName;
      existing.brandId = model?.brandId || existing.brandId;
      existing.brandName = brandById(existing.brandId)?.name || existing.brandName;
      existing.engineSummary = engine.trim();
      existing.ownerName = owner.trim();
      existing.ownerPhone = phone.trim();
      existing.ownerEmail = email.trim();
      existing.saleDate = saleDate;
      existing.specs = Object.assign({}, model?.techSpecs || existing.specs || {});
    } else {
      state.soldVessels.unshift({
        id: uid('vessel'),
        quoteId: null,
        registration: reg.trim(),
        hin: hin.trim(),
        brandId: model?.brandId || brand?.id,
        modelId: model?.id || '',
        modelName: model?.name || '',
        brandName: brandById(model?.brandId || brand?.id)?.name || '',
        engineSummary: engine.trim(),
        specs: Object.assign({}, model?.techSpecs || {}),
        ownerClientId: '',
        ownerName: owner.trim(),
        ownerEmail: email.trim(),
        ownerPhone: phone.trim(),
        saleDate,
        saleTotal: null,
        currency: 'EUR',
        notes: '',
        createdAt: new Date().toISOString()
      });
    }
    persist(true);
    renderSold();
    toast(existing ? 'Vessel updated' : 'Vessel added');
  }

  function render() {
    if (!state) return;
    if (section === 'dashboard') renderDashboard();
    else if (section === 'catalog') renderCatalog();
    else if (section === 'prospects') renderProspects();
    else if (section === 'quotations') renderQuotations();
    else if (section === 'sold') renderSold();
  }

  function applyRemote(data) {
    if (!data) return;
    state = normalizeState(data);
    saveLocal();
    render();
  }

  function init() {
    state = loadLocal();
    const page = document.getElementById('page-distribution');
    if (page && page.classList.contains('active')) {
      setSection(section, { keepEditor: true });
    } else {
      render();
    }
  }

  window.DistributionModule = {
    init,
    render,
    setSection,
    getState: () => state,
    applyRemote,
    persist,
    SECTIONS
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('page-distribution')) init();
  });
})();
