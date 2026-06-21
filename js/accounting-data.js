/**
 * Accounting data layer — invoices, receipts, clients, company settings.
 * Single-file mode: load from andeco_data.json, save via POST /api/save (when server runs).
 * Supabase: set ANDECO_SUPABASE_URL, ANDECO_SUPABASE_ANON_KEY, ANDECO_ORG_ID + sign in with Supabase Auth (see SUPABASE.md).
 * Fallback: localStorage (andeco_inv_*) when file/server not available.
 */
window.AccountingData = (function () {
  'use strict';
  var PREFIX = 'andeco_inv_';

  var DATA_FILE_URL = (typeof window !== 'undefined' && window.ANDECO_DATA_FILE_URL) || 'andeco_data.json';
  var SAVE_API_URL = (typeof window !== 'undefined' && window.ANDECO_SAVE_API_URL) || '/api/save';

  var useFileStorage = false;
  var useSupabase = false;
  var supabasePendingAuth = false;
  var sharedFileHandle = null;
  var memory = {
    invoices: [],
    receipts: [],
    clients: [],
    companySettings: null,
    products: []
  };

  var defaultSettings = {
    companyName: '',
    companyAddress: '',
    companyEmail: '',
    companyPhone: '',
    companyTaxId: '',
    companyRegistration: '',
    companyWebsite: '',
    banks: [],
    logo: '',
    currency: 'EUR',
    invoiceSequenceNumber: 1000,
    receiptSequenceNumber: 1000,
    defaultTaxRate: 0,
    defaultPaymentTerms: 30,
    defaultInvoiceNotes: ''
  };

  function getLocalStorage(key, def) {
    try {
      var r = localStorage.getItem(key);
      return r ? JSON.parse(r) : def;
    } catch (e) { return def; }
  }
  function setLocalStorage(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  function emptyRemotePayload() {
    return {
      invoices: [],
      receipts: [],
      clients: [],
      companySettings: Object.assign({}, defaultSettings),
      products: [],
      fleet: {
        vessels: [],
        vesselPhotos: [],
        documents: [],
        maintenance: [],
        drydock: [],
        inventory: [],
        logbooks: [],
        crew: []
      },
      crew: {
        crewMembers: [],
        crewDocuments: [],
        crewAssignments: []
      },
      shifts: { staff: [], shifts: [], requests: [], settings: {} },
      payroll: { employees: [], payrollData: {}, companySettings: {} },
      crm: { users: [] }
    };
  }

  function buildFullPayload() {
    return {
      version: '1.0',
      exportDate: new Date().toISOString(),
      invoices: memory.invoices,
      receipts: memory.receipts,
      clients: memory.clients,
      companySettings: memory.companySettings || defaultSettings,
      products: memory.products,
      fleet: {
        vessels: getLocalStorage('andeco_fleet_vessels', []),
        vesselPhotos: getLocalStorage('andeco_fleet_vessel_photos', []),
        documents: getLocalStorage('andeco_fleet_documents', []),
        maintenance: getLocalStorage('andeco_fleet_maintenance', []),
        drydock: getLocalStorage('andeco_fleet_drydock', []),
        inventory: getLocalStorage('andeco_fleet_inventory', []),
        logbooks: getLocalStorage('andeco_fleet_logbooks', []),
        crew: getLocalStorage('andeco_fleet_crew', [])
      },
      crew: {
        crewMembers: getLocalStorage('andeco_crew_members', []),
        crewDocuments: getLocalStorage('andeco_crew_documents', []),
        crewAssignments: getLocalStorage('andeco_crew_assignments', [])
      },
      shifts: (function () {
        try {
          var r = localStorage.getItem('andeco_shifts_data');
          return r ? JSON.parse(r) : { staff: [], shifts: [], requests: [], settings: {} };
        } catch (e) {
          return { staff: [], shifts: [], requests: [], settings: {} };
        }
      })(),
      payroll: {
        employees: getLocalStorage('employees', []),
        payrollData: getLocalStorage('payrollData', {}),
        companySettings: getLocalStorage('companySettings', {})
      },
      crm: {
        users: getLocalStorage('andeco_crm_users', [])
      }
    };
  }

  function notifyModulesDataLoaded() {
    if (typeof window.reloadPayrollFromStorage === 'function') {
      try { window.reloadPayrollFromStorage(); } catch (e) {}
    }
    if (typeof window.ShiftsManagement !== 'undefined' && window.ShiftsManagement.render) {
      try { window.ShiftsManagement.render(); } catch (e) {}
    }
    if (typeof window.FleetManagement !== 'undefined' && window.FleetManagement.render) {
      try { window.FleetManagement.render(); } catch (e) {}
    }
    if (typeof window.CrewManagement !== 'undefined' && window.CrewManagement.render) {
      try { window.CrewManagement.render(); } catch (e) {}
    }
    if (typeof window.hrEmployeesRefreshOverview === 'function') {
      try { window.hrEmployeesRefreshOverview(); } catch (e) {}
    }
    if (typeof window.app !== 'undefined' && window.app.refreshCurrentView) {
      try { window.app.refreshCurrentView(); } catch (e) {}
    }
  }

  function persistToSupabase() {
    if (!useSupabase || supabasePendingAuth) return Promise.resolve();
    var client = typeof window !== 'undefined' ? window.__andecoSupabaseClient : null;
    var orgId = typeof window !== 'undefined' && window.ANDECO_ORG_ID;
    if (!client || !orgId) return Promise.resolve();
    var payload = buildFullPayload();
    return client.from('organization_data').upsert({
      org_id: orgId,
      payload: payload,
      updated_at: new Date().toISOString()
    }, { onConflict: 'org_id' })
      .then(function (r) {
        if (r.error && typeof console !== 'undefined' && console.warn) {
          console.warn('Andeco Supabase save:', r.error.message);
        }
      })
      .catch(function () {});
  }

  function persistToFile() {
    if (supabasePendingAuth) return Promise.resolve();
    if (useSupabase) {
      return persistToSupabase();
    }
    if (sharedFileHandle) {
      var payload = buildFullPayload();
      return sharedFileHandle.createWritable()
        .then(function (w) {
          return w.write(JSON.stringify(payload, null, 2)).then(function () { return w.close(); });
        })
        .catch(function () {});
    }
    if (!useFileStorage) return Promise.resolve();
    return fetch(SAVE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildFullPayload())
    }).catch(function () {});
  }

  function getInvoices() {
    if (useFileStorage) return memory.invoices;
    try {
      var raw = localStorage.getItem(PREFIX + 'invoices');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {}
    return [];
  }

  function saveInvoices(invoices) {
    if (useFileStorage) {
      memory.invoices = invoices;
      persistToFile();
      return;
    }
    try {
      localStorage.setItem(PREFIX + 'invoices', JSON.stringify(invoices));
    } catch (e) {}
  }

  function getReceipts() {
    if (useFileStorage) return memory.receipts;
    try {
      var raw = localStorage.getItem(PREFIX + 'receipts');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {}
    return [];
  }

  function saveReceipts(receipts) {
    if (useFileStorage) {
      memory.receipts = receipts;
      persistToFile();
      return;
    }
    try {
      localStorage.setItem(PREFIX + 'receipts', JSON.stringify(receipts));
    } catch (e) {}
  }

  function getClients() {
    if (useFileStorage) {
      if (!Array.isArray(memory.clients)) memory.clients = [];
      if (memory.clients.length === 0) {
        try {
          var rawLocal = localStorage.getItem(PREFIX + 'clients');
          var parsedLocal = rawLocal ? JSON.parse(rawLocal) : [];
          if (Array.isArray(parsedLocal) && parsedLocal.length > 0) {
            memory.clients = parsedLocal;
            persistToFile();
          }
        } catch (e) {}
      }
      return memory.clients.slice();
    }
    try {
      var raw = localStorage.getItem(PREFIX + 'clients');
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {}
    return [];
  }

  function saveClients(clients) {
    if (useFileStorage) {
      memory.clients = clients;
      try {
        localStorage.setItem(PREFIX + 'clients', JSON.stringify(clients || []));
      } catch (e) {}
      persistToFile();
      return;
    }
    try {
      localStorage.setItem(PREFIX + 'clients', JSON.stringify(clients));
    } catch (e) {}
  }

  function getCompanySettings() {
    if (useFileStorage) return memory.companySettings || defaultSettings;
    try {
      var raw = localStorage.getItem(PREFIX + 'companySettings');
      return raw ? JSON.parse(raw) : {};
    } catch (e) {}
    return {};
  }

  function saveCompanySettings(settings) {
    if (useFileStorage) {
      memory.companySettings = settings && typeof settings === 'object' ? settings : defaultSettings;
      persistToFile();
      return;
    }
    try {
      localStorage.setItem(PREFIX + 'companySettings', JSON.stringify(settings || {}));
    } catch (e) {}
  }

  var CURRENCY_LOCALE_MAP = {
    USD: 'en-US',
    EUR: 'de-DE',
    GBP: 'en-GB',
    CAD: 'en-CA',
    AUD: 'en-AU',
    JPY: 'ja-JP',
    CHF: 'de-CH',
    CNY: 'zh-CN',
    INR: 'en-IN',
    BRL: 'pt-BR',
    MXN: 'es-MX',
    ZAR: 'en-ZA',
    SGD: 'en-SG',
    HKD: 'en-HK',
    NZD: 'en-NZ',
    SEK: 'sv-SE',
    NOK: 'nb-NO',
    DKK: 'da-DK',
    PLN: 'pl-PL',
    RUB: 'ru-RU',
    TRY: 'tr-TR',
    AED: 'ar-AE',
    SAR: 'ar-SA'
  };

  function formatCurrency(amount) {
    var settings = getCompanySettings();
    var currency = (settings && settings.currency) || defaultSettings.currency || 'EUR';
    var locale = CURRENCY_LOCALE_MAP[currency] || 'en-US';
    var n = Number(amount);
    if (!isFinite(n)) n = 0;
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency
    }).format(n);
  }

  function getProducts() {
    if (useFileStorage) return memory.products;
    try {
      var raw = localStorage.getItem(PREFIX + 'products');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {}
    return [];
  }

  function saveProducts(products) {
    if (useFileStorage) {
      memory.products = Array.isArray(products) ? products : [];
      persistToFile();
      return;
    }
    try {
      localStorage.setItem(PREFIX + 'products', JSON.stringify(products || []));
    } catch (e) {}
  }

  function initLocalStorage() {
    if (!localStorage.getItem(PREFIX + 'invoices')) saveInvoices([]);
    if (!localStorage.getItem(PREFIX + 'receipts')) saveReceipts([]);
    if (!localStorage.getItem(PREFIX + 'clients')) saveClients([]);
    if (!localStorage.getItem(PREFIX + 'companySettings')) saveCompanySettings(defaultSettings);
    if (!localStorage.getItem(PREFIX + 'products')) saveProducts([]);
  }

  function isServerPayloadAccountingEmpty(data) {
    if (!data || typeof data !== 'object') return true;
    var inv = Array.isArray(data.invoices) ? data.invoices.length : 0;
    var rec = Array.isArray(data.receipts) ? data.receipts.length : 0;
    var cli = Array.isArray(data.clients) ? data.clients.length : 0;
    return inv === 0 && rec === 0 && cli === 0;
  }

  function hasLocalAccountingData() {
    try {
      if (getLocalStorage(PREFIX + 'invoices', []).length > 0) return true;
      if (getLocalStorage(PREFIX + 'clients', []).length > 0) return true;
      if (getLocalStorage(PREFIX + 'receipts', []).length > 0) return true;
    } catch (e) {}
    return false;
  }

  function loadMemoryFromLocalInvKeys() {
    memory.invoices = getLocalStorage(PREFIX + 'invoices', []);
    memory.receipts = getLocalStorage(PREFIX + 'receipts', []);
    memory.clients = getLocalStorage(PREFIX + 'clients', []);
    memory.companySettings = getLocalStorage(PREFIX + 'companySettings', null) || defaultSettings;
    memory.products = getLocalStorage(PREFIX + 'products', []);
  }

  /** When shared file is empty but this browser still has old localStorage (e.g. after switching file:// → localhost). */
  function finishServerInit(data, useSupabaseBackend) {
    if (!useSupabaseBackend && isServerPayloadAccountingEmpty(data) && hasLocalAccountingData()) {
      loadMemoryFromLocalInvKeys();
      var saved = {
        invoices: memory.invoices,
        receipts: memory.receipts,
        clients: memory.clients,
        companySettings: memory.companySettings,
        products: memory.products
      };
      applyLoadedData(data);
      memory.invoices = saved.invoices;
      memory.receipts = saved.receipts;
      memory.clients = saved.clients;
      memory.companySettings = saved.companySettings;
      memory.products = saved.products;
      useFileStorage = true;
      useSupabase = !!useSupabaseBackend;
      persistToFile();
      if (typeof console !== 'undefined' && console.info) {
        console.info('Andeco: accounting data was restored from browser storage into the shared data file.');
      }
      return;
    }
    applyLoadedData(data);
    useFileStorage = true;
    useSupabase = !!useSupabaseBackend;
  }

  function applyLoadedData(data) {
        memory.invoices = Array.isArray(data.invoices) ? data.invoices : [];
        memory.receipts = Array.isArray(data.receipts) ? data.receipts : [];
        if (Array.isArray(data.clients)) {
          if (data.clients.length > 0 || memory.clients.length === 0) {
            memory.clients = data.clients;
          }
        }
        memory.companySettings = data.companySettings && typeof data.companySettings === 'object'
          ? data.companySettings
          : defaultSettings;
        memory.products = Array.isArray(data.products) ? data.products : [];
        if (memory.invoices.length === 0 && memory.receipts.length === 0 && memory.clients.length === 0) {
          memory.companySettings = Object.assign({}, defaultSettings, memory.companySettings);
        }
        if (data.fleet && typeof data.fleet === 'object') {
          if (Array.isArray(data.fleet.vessels)) setLocalStorage('andeco_fleet_vessels', data.fleet.vessels);
          if (Array.isArray(data.fleet.vesselPhotos)) setLocalStorage('andeco_fleet_vessel_photos', data.fleet.vesselPhotos);
          if (Array.isArray(data.fleet.documents)) setLocalStorage('andeco_fleet_documents', data.fleet.documents);
          if (Array.isArray(data.fleet.maintenance)) setLocalStorage('andeco_fleet_maintenance', data.fleet.maintenance);
          if (Array.isArray(data.fleet.drydock)) setLocalStorage('andeco_fleet_drydock', data.fleet.drydock);
          if (Array.isArray(data.fleet.inventory)) setLocalStorage('andeco_fleet_inventory', data.fleet.inventory);
          if (Array.isArray(data.fleet.logbooks)) setLocalStorage('andeco_fleet_logbooks', data.fleet.logbooks);
          if (Array.isArray(data.fleet.crew)) setLocalStorage('andeco_fleet_crew', data.fleet.crew);
        }
        if (data.crew && typeof data.crew === 'object') {
          if (Array.isArray(data.crew.crewMembers)) setLocalStorage('andeco_crew_members', data.crew.crewMembers);
          if (Array.isArray(data.crew.crewDocuments)) setLocalStorage('andeco_crew_documents', data.crew.crewDocuments);
          if (Array.isArray(data.crew.crewAssignments)) setLocalStorage('andeco_crew_assignments', data.crew.crewAssignments);
        }
        if (data.shifts && typeof data.shifts === 'object') {
          setLocalStorage('andeco_shifts_data', data.shifts);
        }
        if (data.payroll && typeof data.payroll === 'object') {
          if (Array.isArray(data.payroll.employees)) setLocalStorage('employees', data.payroll.employees);
          if (data.payroll.payrollData && typeof data.payroll.payrollData === 'object') {
            setLocalStorage('payrollData', data.payroll.payrollData);
          }
          if (data.payroll.companySettings && typeof data.payroll.companySettings === 'object') {
            setLocalStorage('companySettings', data.payroll.companySettings);
          }
        }
        if (data.crm && typeof data.crm === 'object') {
          if (Array.isArray(data.crm.users)) setLocalStorage('andeco_crm_users', data.crm.users);
        }
        notifyModulesDataLoaded();
  }

  function ensureSupabaseClient() {
    var w = typeof window !== 'undefined' ? window : null;
    if (!w) return null;
    var url = w.ANDECO_SUPABASE_URL;
    var key = w.ANDECO_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    if (typeof supabase === 'undefined' || !supabase.createClient) return null;
    if (!w.__andecoSupabaseClient) {
      w.__andecoSupabaseClient = supabase.createClient(url, key);
    }
    return w.__andecoSupabaseClient;
  }

  function isSupabaseConfigured() {
    var w = typeof window !== 'undefined' ? window : null;
    return !!(w && w.ANDECO_SUPABASE_URL && w.ANDECO_SUPABASE_ANON_KEY && w.ANDECO_ORG_ID);
  }

  function tryInitSupabase() {
    if (!isSupabaseConfigured()) return Promise.resolve(null);
    var client = ensureSupabaseClient();
    var orgId = typeof window !== 'undefined' && window.ANDECO_ORG_ID;
    if (!client || !orgId) return Promise.resolve(null);
    return client.auth.getSession().then(function (sessRes) {
      var session = sessRes.data && sessRes.data.session;
      if (!session) return null;
      return client.from('organization_data').select('payload').eq('org_id', orgId).maybeSingle();
    }).then(function (result) {
      if (result === null) return null;
      if (result.error) return null;
      if (!result.data) return emptyRemotePayload();
      var p = result.data.payload;
      if (!p || typeof p !== 'object' || Object.keys(p).length === 0) return emptyRemotePayload();
      return p;
    });
  }

  function init() {
    var isFileProtocol = typeof window !== 'undefined' && window.location && window.location.protocol === 'file:';
    if (isFileProtocol) {
      useFileStorage = false;
      useSupabase = false;
      initLocalStorage();
      return Promise.resolve();
    }
    return tryInitSupabase().then(function (payload) {
      if (payload !== null && typeof payload === 'object') {
        supabasePendingAuth = false;
        finishServerInit(payload, true);
        return;
      }
      if (isSupabaseConfigured()) {
        supabasePendingAuth = true;
        applyLoadedData(emptyRemotePayload());
        useFileStorage = true;
        useSupabase = false;
        var pendingClient = ensureSupabaseClient();
        if (pendingClient && pendingClient.auth && pendingClient.auth.onAuthStateChange) {
          pendingClient.auth.onAuthStateChange(function (event, session) {
            if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
              window.location.reload();
            }
          });
        }
        return;
      }
      return fetch(DATA_FILE_URL, { cache: 'no-store' })
        .then(function (res) { return res.ok ? res.json() : Promise.reject(); })
        .then(function (data) {
          finishServerInit(data, false);
        })
        .catch(function () {
          useFileStorage = false;
          useSupabase = false;
          initLocalStorage();
        });
    });
  }

  function getNextInvoiceNumber() {
    var settings = getCompanySettings();
    var start = settings.invoiceSequenceNumber || 1000;
    var invoices = getInvoices();
    var max = start - 1;
    invoices.forEach(function (inv) {
      if (inv.status === 'draft') return;
      if (inv.invoiceNumber) {
        var m = inv.invoiceNumber.match(/\d+/);
        if (m) {
          var n = parseInt(m[0], 10);
          if (n > max) max = n;
        }
      }
    });
    return (max + 1).toString().padStart(4, '0');
  }

  function getNextReceiptNumber() {
    var settings = getCompanySettings();
    var start = settings.receiptSequenceNumber || 1000;
    var receipts = getReceipts();
    var max = start - 1;
    receipts.forEach(function (r) {
      if (r.receiptNumber) {
        var m = r.receiptNumber.match(/\d+/);
        if (m) {
          var n = parseInt(m[0], 10);
          if (n > max) max = n;
        }
      }
    });
    return (max + 1).toString().padStart(4, '0');
  }

  function loadFromData(data) {
    if (!data) return;
    if (useFileStorage) {
      memory.invoices = Array.isArray(data.invoices) ? data.invoices : memory.invoices;
      memory.receipts = Array.isArray(data.receipts) ? data.receipts : memory.receipts;
      if (Array.isArray(data.clients)) {
        if (data.clients.length > 0 || !memory.clients || memory.clients.length === 0) {
          memory.clients = data.clients;
        }
      }
      if (data.companySettings && typeof data.companySettings === 'object') memory.companySettings = data.companySettings;
      memory.products = Array.isArray(data.products) ? data.products : memory.products;
    } else {
      if (Array.isArray(data.invoices)) saveInvoices(data.invoices);
      if (Array.isArray(data.receipts)) saveReceipts(data.receipts);
      if (Array.isArray(data.clients)) saveClients(data.clients);
      if (data.companySettings && typeof data.companySettings === 'object') saveCompanySettings(data.companySettings);
      if (Array.isArray(data.products)) saveProducts(data.products);
    }
  }

  function persistAll() {
    if (supabasePendingAuth) return;
    if (useFileStorage || sharedFileHandle || useSupabase) persistToFile();
  }

  function signInToSupabase(email, password) {
    var client = ensureSupabaseClient();
    if (!client) return Promise.reject(new Error('Supabase is not configured.'));
    return client.auth.signInWithPassword({ email: email, password: password });
  }

  function signOutFromSupabase() {
    var client = ensureSupabaseClient();
    if (!client || !client.auth) return Promise.resolve();
    return client.auth.signOut();
  }

  function getSupabaseSession() {
    var client = ensureSupabaseClient();
    if (!client || !client.auth) return Promise.resolve(null);
    return client.auth.getSession().then(function (res) {
      return res.data && res.data.session ? res.data.session : null;
    });
  }

  function fetchOrgMembership() {
    var client = ensureSupabaseClient();
    var orgId = typeof window !== 'undefined' && window.ANDECO_ORG_ID;
    if (!client || !orgId) return Promise.resolve(null);
    return getSupabaseSession().then(function (session) {
      if (!session) return null;
      return client.from('organization_members')
        .select('is_admin, allowed_modules')
        .eq('org_id', orgId)
        .eq('user_id', session.user.id)
        .maybeSingle()
        .then(function (r) {
          if (r.error || !r.data) return null;
          return {
            userId: session.user.id,
            email: (session.user.email || '').toLowerCase(),
            isAdmin: r.data.is_admin === true,
            allowedModules: Array.isArray(r.data.allowed_modules) ? r.data.allowed_modules : []
          };
        });
    });
  }

  function activateSupabaseBackend() {
    return tryInitSupabase().then(function (payload) {
      if (payload === null) return false;
      supabasePendingAuth = false;
      finishServerInit(payload, true);
      return true;
    });
  }

  function loadFromFileHandle(handle) {
    return handle.getFile()
      .then(function (file) { return file.text(); })
      .then(function (text) {
        var data = JSON.parse(text);
        applyLoadedData(data);
        useFileStorage = true;
        sharedFileHandle = handle;
      });
  }

  function openSharedFile() {
    if (typeof window === 'undefined' || !window.showOpenFilePicker) {
      return Promise.reject(new Error('Your browser does not support choosing a file. Use Import Data instead.'));
    }
    return window.showOpenFilePicker({
      types: [{ description: 'JSON data', accept: { 'application/json': ['.json'] } }],
      multiple: false
    }).then(function (handles) {
      return loadFromFileHandle(handles[0]);
    });
  }

  function refreshFromSupabase() {
    if (!useSupabase) return Promise.resolve(false);
    var client = typeof window !== 'undefined' ? window.__andecoSupabaseClient : null;
    var orgId = typeof window !== 'undefined' && window.ANDECO_ORG_ID;
    if (!client || !orgId) return Promise.resolve(false);
    return client.from('organization_data').select('payload').eq('org_id', orgId).maybeSingle()
      .then(function (result) {
        if (result.error || !result.data) return false;
        var p = result.data.payload;
        if (!p || typeof p !== 'object') return false;
        applyLoadedData(p);
        return true;
      })
      .catch(function () { return false; });
  }

  function refreshFromSharedFile() {
    if (useSupabase) {
      return refreshFromSupabase().then(function (ok) { if (!ok) return Promise.reject(new Error('Supabase refresh failed')); });
    }
    if (!sharedFileHandle) return Promise.reject(new Error('No shared file in use'));
    return sharedFileHandle.getFile()
      .then(function (file) { return file.text(); })
      .then(function (text) {
        var data = JSON.parse(text);
        applyLoadedData(data);
      });
  }

  function clearSharedFile() {
    sharedFileHandle = null;
    useFileStorage = false;
    useSupabase = false;
    if (typeof window !== 'undefined') window.__andecoSupabaseClient = null;
  }

  function hasSharedFile() {
    return !!sharedFileHandle || useSupabase;
  }

  function getSharedFileName() {
    if (useSupabase) return 'Supabase';
    return sharedFileHandle && sharedFileHandle.name ? sharedFileHandle.name : '';
  }

  function saveToFileAs() {
    if (typeof window === 'undefined' || !window.showSaveFilePicker) {
      return Promise.reject(new Error('Not supported'));
    }
    var payload = buildFullPayload();
    return window.showSaveFilePicker({
      suggestedName: 'andeco_data.json',
      types: [{ description: 'JSON data', accept: { 'application/json': ['.json'] } }]
    }).then(function (handle) {
      return handle.createWritable()
        .then(function (w) {
          return w.write(JSON.stringify(payload, null, 2)).then(function () { return w.close(); });
        });
    });
  }

  function getClientCompanyName(client) {
    if (!client) return '';
    if (client.contactPerson) return String(client.name || '').trim();
    if (client.company && client.company !== client.name) return String(client.company).trim();
    return String(client.name || client.company || '').trim();
  }

  function getClientContactPerson(client) {
    if (!client) return '';
    if (client.contactPerson) return String(client.contactPerson).trim();
    if (client.company && client.company !== client.name) return String(client.name || '').trim();
    return '';
  }

  function getClientOptionLabel(client) {
    var company = getClientCompanyName(client);
    var contact = getClientContactPerson(client);
    if (contact) return company + ' — ' + contact;
    return company;
  }

  function normalizeClientForForm(client) {
    if (!client) return { companyName: '', contactPerson: '' };
    if (client.contactPerson) {
      return { companyName: client.name || '', contactPerson: client.contactPerson };
    }
    if (client.company && client.company !== client.name) {
      return { companyName: client.company, contactPerson: client.name || '' };
    }
    return { companyName: client.name || client.company || '', contactPerson: '' };
  }

  return {
    init: init,
    loadFromData: loadFromData,
    persistAll: persistAll,
    isSupabaseMode: function () { return useSupabase; },
    isSupabaseConfigured: isSupabaseConfigured,
    isSupabasePendingAuth: function () { return supabasePendingAuth; },
    signInToSupabase: signInToSupabase,
    signOutFromSupabase: signOutFromSupabase,
    getSupabaseSession: getSupabaseSession,
    fetchOrgMembership: fetchOrgMembership,
    activateSupabaseBackend: activateSupabaseBackend,
    notifyModulesDataLoaded: notifyModulesDataLoaded,
    refreshFromSupabase: refreshFromSupabase,
    openSharedFile: openSharedFile,
    refreshFromSharedFile: refreshFromSharedFile,
    clearSharedFile: clearSharedFile,
    hasSharedFile: hasSharedFile,
    getSharedFileName: getSharedFileName,
    saveToFileAs: saveToFileAs,
    getInvoices: getInvoices,
    saveInvoices: saveInvoices,
    getReceipts: getReceipts,
    saveReceipts: saveReceipts,
    getClients: getClients,
    saveClients: saveClients,
    getCompanySettings: getCompanySettings,
    saveCompanySettings: saveCompanySettings,
    formatCurrency: formatCurrency,
    getNextInvoiceNumber: getNextInvoiceNumber,
    getNextReceiptNumber: getNextReceiptNumber,
    getInvoice: function (id) {
      return getInvoices().filter(function (inv) { return inv.id === id; })[0];
    },
    saveInvoice: function (invoice) {
      var list = getInvoices();
      var idx = list.map(function (i) { return i.id; }).indexOf(invoice.id);
      if (idx >= 0) list[idx] = invoice; else list.push(invoice);
      saveInvoices(list);
      return invoice;
    },
    deleteInvoice: function (id) {
      saveInvoices(getInvoices().filter(function (i) { return i.id !== id; }));
    },
    getReceipt: function (id) {
      return getReceipts().filter(function (r) { return r.id === id; })[0];
    },
    saveReceipt: function (receipt) {
      var list = getReceipts();
      var idx = list.map(function (r) { return r.id; }).indexOf(receipt.id);
      if (idx >= 0) list[idx] = receipt; else list.push(receipt);
      saveReceipts(list);
      return receipt;
    },
    deleteReceipt: function (id) {
      saveReceipts(getReceipts().filter(function (r) { return r.id !== id; }));
    },
    getClient: function (id) {
      return getClients().filter(function (c) { return c.id === id; })[0];
    },
    saveClient: function (client) {
      var list = getClients();
      var idx = list.map(function (c) { return c.id; }).indexOf(client.id);
      if (idx >= 0) list[idx] = client; else list.push(client);
      saveClients(list);
      return client;
    },
    deleteClient: function (id) {
      saveClients(getClients().filter(function (c) { return c.id !== id; }));
    },
    getClientCompanyName: getClientCompanyName,
    getClientContactPerson: getClientContactPerson,
    getClientOptionLabel: getClientOptionLabel,
    normalizeClientForForm: normalizeClientForForm,
    getProducts: getProducts,
    saveProducts: saveProducts,
    getProductByCode: function (code) {
      if (!code) return null;
      var c = String(code).trim().toUpperCase();
      return getProducts().filter(function (p) { return String(p.code || '').trim().toUpperCase() === c; })[0] || null;
    },
    saveProduct: function (product) {
      var list = getProducts();
      var idx = list.map(function (p) { return p.id; }).indexOf(product.id);
      if (idx >= 0) list[idx] = product; else list.push(product);
      saveProducts(list);
      return product;
    },
    deleteProduct: function (id) {
      saveProducts(getProducts().filter(function (p) { return p.id !== id; }));
    }
  };
})();

if (typeof window !== 'undefined') {
  window.DataStore = window.AccountingData;
}
