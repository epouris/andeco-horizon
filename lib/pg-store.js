/**
 * Relational Postgres store for Andeco Horizon Suite.
 * Assembles / disassembles the same JSON payload the browser already uses.
 */
'use strict';

const VESSEL_CORE = new Set([
  'id', 'name', 'imo', 'flag', 'type', 'buildYear', 'grossTonnage', 'length', 'beam', 'draft',
  'classification', 'owner', 'manager', 'callSign', 'mmsi', 'notes', 'photo'
]);

function str(v, fallback) {
  if (v == null) return fallback !== undefined ? fallback : '';
  return String(v);
}

function num(v, fallback) {
  if (v == null || v === '') return fallback !== undefined ? fallback : 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : (fallback !== undefined ? fallback : 0);
}

function ts(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function emptyPayload() {
  return {
    invoices: [],
    receipts: [],
    clients: [],
    companySettings: {},
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
    lms: {
      courses: [],
      enrollments: [],
      attempts: [],
      purchases: [],
      applicants: [],
      announcements: [],
      certificates: [],
      learnerProfiles: [],
      discussions: [],
      settings: {}
    },
    crm: { users: [] }
  };
}

function bankId(index, bank) {
  return str(bank && bank.id, 'bank-' + index);
}

function splitVessel(v) {
  const row = {
    id: str(v.id),
    name: str(v.name),
    imo: str(v.imo),
    flag: str(v.flag),
    type: str(v.type),
    build_year: str(v.buildYear),
    gross_tonnage: str(v.grossTonnage),
    length: str(v.length),
    beam: str(v.beam),
    draft: str(v.draft),
    classification: str(v.classification),
    owner: str(v.owner),
    manager: str(v.manager),
    call_sign: str(v.callSign),
    mmsi: str(v.mmsi),
    notes: str(v.notes),
    photo: str(v.photo),
    specs: {}
  };
  Object.keys(v || {}).forEach((k) => {
    if (!VESSEL_CORE.has(k)) row.specs[k] = v[k];
  });
  return row;
}

function joinVessel(row) {
  const specs = row.specs && typeof row.specs === 'object' ? row.specs : {};
  return Object.assign({}, specs, {
    id: row.id,
    name: row.name,
    imo: row.imo,
    flag: row.flag,
    type: row.type,
    buildYear: row.build_year,
    grossTonnage: row.gross_tonnage,
    length: row.length,
    beam: row.beam,
    draft: row.draft,
    classification: row.classification,
    owner: row.owner,
    manager: row.manager,
    callSign: row.call_sign,
    mmsi: row.mmsi,
    notes: row.notes,
    photo: row.photo
  });
}

async function replaceTable(client, table, columns, rows) {
  await client.query('DELETE FROM ' + table);
  if (!rows.length) return;
  const colList = columns.join(', ');
  const placeholders = columns.map((_, i) => '$' + (i + 1)).join(', ');
  const sql = 'INSERT INTO ' + table + ' (' + colList + ') VALUES (' + placeholders + ')';
  for (const row of rows) {
    await client.query(sql, row);
  }
}

async function loadPayload(pool) {
  const payload = emptyPayload();

  const users = await pool.query(
    `SELECT id, username, password_hash, display_name, is_admin, allowed_modules FROM users ORDER BY username`
  );
  payload.crm.users = users.rows.map((r) => ({
    id: r.id,
    username: r.username,
    passwordHash: r.password_hash,
    displayName: r.display_name || '',
    isAdmin: r.is_admin === true,
    allowedModules: Array.isArray(r.allowed_modules) ? r.allowed_modules : []
  }));

  const settings = await pool.query('SELECT * FROM company_settings WHERE id = 1');
  const s = settings.rows[0] || {};
  const banks = await pool.query('SELECT * FROM company_banks ORDER BY sort_order, id');
  payload.companySettings = {
    companyName: s.company_name || '',
    companyAddress: s.company_address || '',
    companyEmail: s.company_email || '',
    companyPhone: s.company_phone || '',
    companyTaxId: s.company_tax_id || '',
    companyRegistration: s.company_registration || '',
    companyWebsite: s.company_website || '',
    logo: s.logo || '',
    currency: s.currency || 'EUR',
    invoiceSequenceNumber: num(s.invoice_sequence_number, 1000),
    receiptSequenceNumber: num(s.receipt_sequence_number, 1000),
    defaultTaxRate: num(s.default_tax_rate, 0),
    defaultPaymentTerms: num(s.default_payment_terms, 30),
    defaultInvoiceNotes: s.default_invoice_notes || '',
    banks: banks.rows.map((b) => ({
      id: b.id,
      name: b.name || '',
      iban: b.iban || '',
      swift: b.swift || ''
    }))
  };

  const clients = await pool.query('SELECT * FROM clients ORDER BY name');
  payload.clients = clients.rows.map((c) => ({
    id: c.id,
    customerId: c.customer_id || '',
    name: c.name || '',
    contactPerson: c.contact_person || '',
    company: c.company || '',
    address: c.address || '',
    email: c.email || '',
    phone: c.phone || '',
    taxId: c.tax_id || '',
    website: c.website || '',
    notes: c.notes || '',
    createdAt: c.created_at ? new Date(c.created_at).toISOString() : undefined,
    updatedAt: c.updated_at ? new Date(c.updated_at).toISOString() : undefined
  }));

  const products = await pool.query('SELECT * FROM products ORDER BY code');
  payload.products = products.rows.map((p) => ({
    id: p.id,
    code: p.code || '',
    description: p.description || '',
    price: num(p.price, 0)
  }));

  const invoices = await pool.query('SELECT * FROM invoices ORDER BY created_at NULLS LAST, id');
  const items = await pool.query('SELECT * FROM invoice_items ORDER BY invoice_id, sort_order, id');
  const itemsByInvoice = {};
  items.rows.forEach((it) => {
    if (!itemsByInvoice[it.invoice_id]) itemsByInvoice[it.invoice_id] = [];
    if (it.is_header) {
      itemsByInvoice[it.invoice_id].push({ isHeader: true, description: it.description || '' });
    } else {
      itemsByInvoice[it.invoice_id].push({
        productCode: it.product_code || '',
        description: it.description || '',
        quantity: it.quantity == null ? undefined : num(it.quantity),
        hours: it.hours == null ? undefined : num(it.hours),
        price: it.price == null ? undefined : num(it.price)
      });
    }
  });
  payload.invoices = invoices.rows.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoice_number || '',
    date: inv.date || '',
    dueDate: inv.due_date || '',
    clientCustomerId: inv.client_customer_id || '',
    clientName: inv.client_name || '',
    clientAddress: inv.client_address || '',
    clientEmail: inv.client_email || '',
    clientPhone: inv.client_phone || '',
    items: itemsByInvoice[inv.id] || [],
    subtotal: num(inv.subtotal, 0),
    taxRate: num(inv.tax_rate, 0),
    taxAmount: num(inv.tax_amount, 0),
    total: num(inv.total, 0),
    notes: inv.notes || '',
    status: inv.status || 'draft',
    createdAt: inv.created_at ? new Date(inv.created_at).toISOString() : undefined,
    updatedAt: inv.updated_at ? new Date(inv.updated_at).toISOString() : undefined
  }));

  const receipts = await pool.query('SELECT * FROM receipts ORDER BY created_at NULLS LAST, id');
  const receiptLinks = await pool.query('SELECT * FROM receipt_invoices');
  const linksByReceipt = {};
  receiptLinks.rows.forEach((l) => {
    if (!linksByReceipt[l.receipt_id]) linksByReceipt[l.receipt_id] = [];
    linksByReceipt[l.receipt_id].push(l.invoice_id);
  });
  payload.receipts = receipts.rows.map((r) => ({
    id: r.id,
    receiptNumber: r.receipt_number || '',
    date: r.date || '',
    clientId: r.client_id || '',
    invoiceIds: linksByReceipt[r.id] || [],
    onAccountBalance: r.on_account_balance === true,
    amount: num(r.amount, 0),
    paymentMethod: r.payment_method || '',
    notes: r.notes || '',
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : undefined
  }));

  const vessels = await pool.query('SELECT * FROM vessels ORDER BY name');
  payload.fleet.vessels = vessels.rows.map(joinVessel);

  const vPhotos = await pool.query('SELECT * FROM vessel_photos');
  payload.fleet.vesselPhotos = vPhotos.rows.map((r) => ({
    id: r.id, vesselId: r.vessel_id, dataUrl: r.data_url, caption: r.caption, date: r.date
  }));
  const vDocs = await pool.query('SELECT * FROM vessel_documents');
  payload.fleet.documents = vDocs.rows.map((r) => ({
    id: r.id, vesselId: r.vessel_id, name: r.name, type: r.type,
    issueDate: r.issue_date, expiryDate: r.expiry_date
  }));
  const vMaint = await pool.query('SELECT * FROM vessel_maintenance');
  payload.fleet.maintenance = vMaint.rows.map((r) => ({
    id: r.id, vesselId: r.vessel_id, date: r.date, type: r.type, status: r.status, description: r.description
  }));
  const vDry = await pool.query('SELECT * FROM vessel_drydock');
  payload.fleet.drydock = vDry.rows.map((r) => ({
    id: r.id, vesselId: r.vessel_id, scheduledDate: r.scheduled_date,
    completedDate: r.completed_date, yard: r.yard, status: r.status
  }));
  const vInv = await pool.query('SELECT * FROM vessel_inventory');
  payload.fleet.inventory = vInv.rows.map((r) => ({
    id: r.id, vesselId: r.vessel_id, itemName: r.item_name, partNumber: r.part_number,
    quantity: r.quantity, minLevel: r.min_level, maxLevel: r.max_level,
    unit: r.unit, location: r.location, supplier: r.supplier
  }));
  const vLogs = await pool.query('SELECT * FROM vessel_logbooks');
  payload.fleet.logbooks = vLogs.rows.map((r) => ({
    id: r.id, vesselId: r.vessel_id, logDate: r.log_date, logType: r.log_type,
    entry: r.entry, author: r.author
  }));
  const vCrew = await pool.query('SELECT * FROM vessel_crew_legacy');
  payload.fleet.crew = vCrew.rows.map((r) => ({
    id: r.id, vesselId: r.vessel_id, name: r.name, role: r.role,
    certifications: r.certifications, joiningDate: r.joining_date, contact: r.contact
  }));

  const crewMembers = await pool.query('SELECT * FROM crew_members ORDER BY name');
  payload.crew.crewMembers = crewMembers.rows.map((r) => ({
    id: r.id, name: r.name, role: r.role, contact: r.contact
  }));
  const crewDocs = await pool.query('SELECT * FROM crew_documents');
  payload.crew.crewDocuments = crewDocs.rows.map((r) => ({
    id: r.id, crewId: r.crew_id, name: r.name, type: r.type,
    issueDate: r.issue_date, expiryDate: r.expiry_date
  }));
  const crewAssign = await pool.query('SELECT * FROM crew_assignments');
  payload.crew.crewAssignments = crewAssign.rows.map((r) => ({
    id: r.id, vesselId: r.vessel_id, crewMemberId: r.crew_member_id,
    roleOnVessel: r.role_on_vessel, joiningDate: r.joining_date
  }));

  const staff = await pool.query('SELECT * FROM shift_staff ORDER BY name');
  payload.shifts.staff = staff.rows.map((r) => ({
    id: r.id, name: r.name, department: r.department,
    employeeId: r.employee_id || undefined, color: r.color
  }));
  const shiftEntries = await pool.query('SELECT * FROM shift_entries');
  payload.shifts.shifts = shiftEntries.rows.map((r) => ({
    id: r.id, staffId: r.staff_id, date: r.date, startTime: r.start_time,
    endTime: r.end_time, breakMinutes: num(r.break_minutes, 0), notes: r.notes
  }));
  const shiftReqs = await pool.query('SELECT * FROM shift_requests');
  payload.shifts.requests = shiftReqs.rows.map((r) => ({
    id: r.id, staffId: r.staff_id, type: r.type, startDate: r.start_date,
    endDate: r.end_date, status: r.status, notes: r.notes, requestedAt: r.requested_at
  }));
  const shiftSet = await pool.query('SELECT * FROM shift_settings WHERE id = 1');
  const ss = shiftSet.rows[0] || {};
  payload.shifts.settings = {
    standardHoursPerDay: num(ss.standard_hours_per_day, 8),
    overtimeThresholdWeekly: num(ss.overtime_threshold_weekly, 40),
    companyHolidays: Array.isArray(ss.company_holidays) ? ss.company_holidays : []
  };

  const employees = await pool.query('SELECT * FROM hr_employees ORDER BY last_name, first_name');
  payload.payroll.employees = employees.rows.map((e) => ({
    employeeId: e.employee_id,
    firstName: e.first_name,
    lastName: e.last_name,
    email: e.email,
    phone: e.phone,
    hireDate: e.hire_date,
    ceasedDate: e.ceased_date,
    taxCode: e.tax_code,
    socialInsurance: e.social_insurance,
    residentialAddress: e.residential_address,
    taxId: e.tax_id,
    officerStatus: e.officer_status,
    paymentMethod: e.payment_method,
    bankName: e.bank_name,
    bankIBAN: e.bank_iban
  }));

  const payslips = await pool.query('SELECT * FROM payslips');
  payload.payroll.payrollData = {};
  payslips.rows.forEach((p) => {
    const data = p.data && typeof p.data === 'object' ? p.data : {};
    payload.payroll.payrollData[p.pay_key] = Object.assign({}, data, {
      employeeId: p.employee_id || data.employeeId,
      employeeName: p.employee_name || data.employeeName,
      month: p.month || data.month,
      year: p.year != null ? p.year : data.year,
      payDate: p.pay_date || data.payDate,
      payrollNumber: p.payroll_number || data.payrollNumber,
      savedAt: p.saved_at != null ? Number(p.saved_at) : data.savedAt
    });
  });

  const pcs = await pool.query('SELECT data FROM payroll_company_settings WHERE id = 1');
  payload.payroll.companySettings =
    pcs.rows[0] && pcs.rows[0].data && typeof pcs.rows[0].data === 'object'
      ? pcs.rows[0].data
      : {};

  try {
    const lmsRow = await pool.query('SELECT data FROM lms_data WHERE id = 1');
    const lmsData = lmsRow.rows[0] && lmsRow.rows[0].data;
    if (lmsData && typeof lmsData === 'object') {
      payload.lms = {
        courses: Array.isArray(lmsData.courses) ? lmsData.courses : [],
        enrollments: Array.isArray(lmsData.enrollments) ? lmsData.enrollments : [],
        attempts: Array.isArray(lmsData.attempts) ? lmsData.attempts : [],
        purchases: Array.isArray(lmsData.purchases) ? lmsData.purchases : [],
        applicants: Array.isArray(lmsData.applicants) ? lmsData.applicants : [],
        announcements: Array.isArray(lmsData.announcements) ? lmsData.announcements : [],
        certificates: Array.isArray(lmsData.certificates) ? lmsData.certificates : [],
        learnerProfiles: Array.isArray(lmsData.learnerProfiles) ? lmsData.learnerProfiles : [],
        discussions: Array.isArray(lmsData.discussions) ? lmsData.discussions : [],
        settings: lmsData.settings && typeof lmsData.settings === 'object' ? lmsData.settings : {}
      };
    }
  } catch (e) {
    // lms_data table may not exist until schema setup runs
  }

  payload.version = '1.0';
  payload.exportDate = new Date().toISOString();
  return payload;
}

async function savePayload(pool, data) {
  const d = data && typeof data === 'object' ? data : {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Users
    const users = d.crm && Array.isArray(d.crm.users) ? d.crm.users : [];
    if (users.length > 0) {
      await replaceTable(
        client,
        'users',
        ['id', 'username', 'password_hash', 'display_name', 'is_admin', 'allowed_modules'],
        users.filter((u) => u && u.username && u.passwordHash).map((u) => [
          str(u.id, 'u' + Date.now()),
          str(u.username).trim().toLowerCase(),
          str(u.passwordHash),
          str(u.displayName || u.username),
          u.isAdmin === true,
          JSON.stringify(Array.isArray(u.allowedModules) ? u.allowedModules : [])
        ])
      );
    }

    // Company settings
    const cs = d.companySettings && typeof d.companySettings === 'object' ? d.companySettings : {};
    await client.query(
      `INSERT INTO company_settings (
         id, company_name, company_address, company_email, company_phone,
         company_tax_id, company_registration, company_website, logo, currency,
         invoice_sequence_number, receipt_sequence_number, default_tax_rate,
         default_payment_terms, default_invoice_notes, updated_at
       ) VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now())
       ON CONFLICT (id) DO UPDATE SET
         company_name = EXCLUDED.company_name,
         company_address = EXCLUDED.company_address,
         company_email = EXCLUDED.company_email,
         company_phone = EXCLUDED.company_phone,
         company_tax_id = EXCLUDED.company_tax_id,
         company_registration = EXCLUDED.company_registration,
         company_website = EXCLUDED.company_website,
         logo = EXCLUDED.logo,
         currency = EXCLUDED.currency,
         invoice_sequence_number = EXCLUDED.invoice_sequence_number,
         receipt_sequence_number = EXCLUDED.receipt_sequence_number,
         default_tax_rate = EXCLUDED.default_tax_rate,
         default_payment_terms = EXCLUDED.default_payment_terms,
         default_invoice_notes = EXCLUDED.default_invoice_notes,
         updated_at = now()`,
      [
        str(cs.companyName), str(cs.companyAddress), str(cs.companyEmail), str(cs.companyPhone),
        str(cs.companyTaxId), str(cs.companyRegistration), str(cs.companyWebsite),
        str(cs.logo), str(cs.currency, 'EUR'),
        num(cs.invoiceSequenceNumber, 1000), num(cs.receiptSequenceNumber, 1000),
        num(cs.defaultTaxRate, 0), num(cs.defaultPaymentTerms, 30),
        str(cs.defaultInvoiceNotes)
      ]
    );
    const banks = Array.isArray(cs.banks) ? cs.banks : [];
    await replaceTable(
      client,
      'company_banks',
      ['id', 'name', 'iban', 'swift', 'sort_order'],
      banks.map((b, i) => [bankId(i, b), str(b.name), str(b.iban), str(b.swift), i])
    );

    // Clients / products
    await replaceTable(
      client,
      'clients',
      ['id', 'customer_id', 'name', 'contact_person', 'company', 'address', 'email', 'phone',
        'tax_id', 'website', 'notes', 'created_at', 'updated_at'],
      (Array.isArray(d.clients) ? d.clients : []).filter((c) => c && c.id).map((c) => [
        str(c.id), str(c.customerId), str(c.name), str(c.contactPerson), str(c.company),
        str(c.address), str(c.email), str(c.phone), str(c.taxId), str(c.website), str(c.notes),
        ts(c.createdAt), ts(c.updatedAt)
      ])
    );
    await replaceTable(
      client,
      'products',
      ['id', 'code', 'description', 'price'],
      (Array.isArray(d.products) ? d.products : []).filter((p) => p && p.id).map((p) => [
        str(p.id), str(p.code), str(p.description), num(p.price, 0)
      ])
    );

    // Invoices
    await client.query('DELETE FROM invoice_items');
    await client.query('DELETE FROM invoices');
    const invoices = Array.isArray(d.invoices) ? d.invoices : [];
    for (const inv of invoices) {
      if (!inv || !inv.id) continue;
      await client.query(
        `INSERT INTO invoices (
           id, invoice_number, date, due_date, client_customer_id, client_name, client_address,
           client_email, client_phone, subtotal, tax_rate, tax_amount, total, notes, status,
           created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          str(inv.id), str(inv.invoiceNumber), str(inv.date), str(inv.dueDate),
          str(inv.clientCustomerId), str(inv.clientName), str(inv.clientAddress),
          str(inv.clientEmail), str(inv.clientPhone),
          num(inv.subtotal), num(inv.taxRate), num(inv.taxAmount), num(inv.total),
          str(inv.notes), str(inv.status, 'draft'), ts(inv.createdAt), ts(inv.updatedAt)
        ]
      );
      const lineItems = Array.isArray(inv.items) ? inv.items : [];
      for (let i = 0; i < lineItems.length; i++) {
        const it = lineItems[i] || {};
        await client.query(
          `INSERT INTO invoice_items (
             invoice_id, sort_order, is_header, product_code, description, quantity, hours, price
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            str(inv.id), i, it.isHeader === true, str(it.productCode), str(it.description),
            it.isHeader ? null : (it.quantity == null ? null : num(it.quantity)),
            it.isHeader ? null : (it.hours == null ? null : num(it.hours)),
            it.isHeader ? null : (it.price == null ? null : num(it.price))
          ]
        );
      }
    }

    // Receipts
    await client.query('DELETE FROM receipt_invoices');
    await client.query('DELETE FROM receipts');
    const receipts = Array.isArray(d.receipts) ? d.receipts : [];
    for (const r of receipts) {
      if (!r || !r.id) continue;
      await client.query(
        `INSERT INTO receipts (
           id, receipt_number, date, client_id, on_account_balance, amount, payment_method,
           notes, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          str(r.id), str(r.receiptNumber), str(r.date), str(r.clientId),
          r.onAccountBalance === true, num(r.amount), str(r.paymentMethod), str(r.notes),
          ts(r.createdAt), ts(r.updatedAt)
        ]
      );
      const ids = Array.isArray(r.invoiceIds) ? r.invoiceIds : [];
      for (const invoiceId of ids) {
        if (!invoiceId) continue;
        await client.query(
          'INSERT INTO receipt_invoices (receipt_id, invoice_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [str(r.id), str(invoiceId)]
        );
      }
    }

    // Fleet
    const fleet = d.fleet && typeof d.fleet === 'object' ? d.fleet : {};
    await replaceTable(
      client,
      'vessels',
      ['id', 'name', 'imo', 'flag', 'type', 'build_year', 'gross_tonnage', 'length', 'beam', 'draft',
        'classification', 'owner', 'manager', 'call_sign', 'mmsi', 'notes', 'photo', 'specs'],
      (Array.isArray(fleet.vessels) ? fleet.vessels : []).filter((v) => v && v.id).map((v) => {
        const row = splitVessel(v);
        return [
          row.id, row.name, row.imo, row.flag, row.type, row.build_year, row.gross_tonnage,
          row.length, row.beam, row.draft, row.classification, row.owner, row.manager,
          row.call_sign, row.mmsi, row.notes, row.photo, JSON.stringify(row.specs)
        ];
      })
    );
    await replaceTable(
      client, 'vessel_photos',
      ['id', 'vessel_id', 'data_url', 'caption', 'date'],
      (Array.isArray(fleet.vesselPhotos) ? fleet.vesselPhotos : []).filter((x) => x && x.id).map((x) => [
        str(x.id), str(x.vesselId), str(x.dataUrl), str(x.caption), str(x.date)
      ])
    );
    await replaceTable(
      client, 'vessel_documents',
      ['id', 'vessel_id', 'name', 'type', 'issue_date', 'expiry_date'],
      (Array.isArray(fleet.documents) ? fleet.documents : []).filter((x) => x && x.id).map((x) => [
        str(x.id), str(x.vesselId), str(x.name), str(x.type), str(x.issueDate), str(x.expiryDate)
      ])
    );
    await replaceTable(
      client, 'vessel_maintenance',
      ['id', 'vessel_id', 'date', 'type', 'status', 'description'],
      (Array.isArray(fleet.maintenance) ? fleet.maintenance : []).filter((x) => x && x.id).map((x) => [
        str(x.id), str(x.vesselId), str(x.date), str(x.type), str(x.status), str(x.description)
      ])
    );
    await replaceTable(
      client, 'vessel_drydock',
      ['id', 'vessel_id', 'scheduled_date', 'completed_date', 'yard', 'status'],
      (Array.isArray(fleet.drydock) ? fleet.drydock : []).filter((x) => x && x.id).map((x) => [
        str(x.id), str(x.vesselId), str(x.scheduledDate), str(x.completedDate), str(x.yard), str(x.status)
      ])
    );
    await replaceTable(
      client, 'vessel_inventory',
      ['id', 'vessel_id', 'item_name', 'part_number', 'quantity', 'min_level', 'max_level', 'unit', 'location', 'supplier'],
      (Array.isArray(fleet.inventory) ? fleet.inventory : []).filter((x) => x && x.id).map((x) => [
        str(x.id), str(x.vesselId), str(x.itemName), str(x.partNumber), str(x.quantity),
        str(x.minLevel), str(x.maxLevel), str(x.unit), str(x.location), str(x.supplier)
      ])
    );
    await replaceTable(
      client, 'vessel_logbooks',
      ['id', 'vessel_id', 'log_date', 'log_type', 'entry', 'author'],
      (Array.isArray(fleet.logbooks) ? fleet.logbooks : []).filter((x) => x && x.id).map((x) => [
        str(x.id), str(x.vesselId), str(x.logDate), str(x.logType), str(x.entry), str(x.author)
      ])
    );
    await replaceTable(
      client, 'vessel_crew_legacy',
      ['id', 'vessel_id', 'name', 'role', 'certifications', 'joining_date', 'contact'],
      (Array.isArray(fleet.crew) ? fleet.crew : []).filter((x) => x && x.id).map((x) => [
        str(x.id), str(x.vesselId), str(x.name), str(x.role), str(x.certifications),
        str(x.joiningDate), str(x.contact)
      ])
    );

    // Crew
    const crew = d.crew && typeof d.crew === 'object' ? d.crew : {};
    await replaceTable(
      client, 'crew_members',
      ['id', 'name', 'role', 'contact'],
      (Array.isArray(crew.crewMembers) ? crew.crewMembers : []).filter((x) => x && x.id).map((x) => [
        str(x.id), str(x.name), str(x.role), str(x.contact)
      ])
    );
    await replaceTable(
      client, 'crew_documents',
      ['id', 'crew_id', 'name', 'type', 'issue_date', 'expiry_date'],
      (Array.isArray(crew.crewDocuments) ? crew.crewDocuments : []).filter((x) => x && x.id).map((x) => [
        str(x.id), str(x.crewId), str(x.name), str(x.type), str(x.issueDate), str(x.expiryDate)
      ])
    );
    await replaceTable(
      client, 'crew_assignments',
      ['id', 'vessel_id', 'crew_member_id', 'role_on_vessel', 'joining_date'],
      (Array.isArray(crew.crewAssignments) ? crew.crewAssignments : []).filter((x) => x && x.id).map((x) => [
        str(x.id), str(x.vesselId), str(x.crewMemberId), str(x.roleOnVessel), str(x.joiningDate)
      ])
    );

    // Shifts
    const shifts = d.shifts && typeof d.shifts === 'object' ? d.shifts : {};
    await replaceTable(
      client, 'shift_staff',
      ['id', 'name', 'department', 'employee_id', 'color'],
      (Array.isArray(shifts.staff) ? shifts.staff : []).filter((x) => x && x.id).map((x) => [
        str(x.id), str(x.name), str(x.department), str(x.employeeId), str(x.color)
      ])
    );
    await replaceTable(
      client, 'shift_entries',
      ['id', 'staff_id', 'date', 'start_time', 'end_time', 'break_minutes', 'notes'],
      (Array.isArray(shifts.shifts) ? shifts.shifts : []).filter((x) => x && x.id).map((x) => [
        str(x.id), str(x.staffId), str(x.date), str(x.startTime), str(x.endTime),
        num(x.breakMinutes, 0), str(x.notes)
      ])
    );
    await replaceTable(
      client, 'shift_requests',
      ['id', 'staff_id', 'type', 'start_date', 'end_date', 'status', 'notes', 'requested_at'],
      (Array.isArray(shifts.requests) ? shifts.requests : []).filter((x) => x && x.id).map((x) => [
        str(x.id), str(x.staffId), str(x.type), str(x.startDate), str(x.endDate),
        str(x.status, 'pending'), str(x.notes), str(x.requestedAt)
      ])
    );
    const sset = shifts.settings && typeof shifts.settings === 'object' ? shifts.settings : {};
    await client.query(
      `INSERT INTO shift_settings (id, standard_hours_per_day, overtime_threshold_weekly, company_holidays)
       VALUES (1,$1,$2,$3::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         standard_hours_per_day = EXCLUDED.standard_hours_per_day,
         overtime_threshold_weekly = EXCLUDED.overtime_threshold_weekly,
         company_holidays = EXCLUDED.company_holidays`,
      [
        num(sset.standardHoursPerDay, 8),
        num(sset.overtimeThresholdWeekly, 40),
        JSON.stringify(Array.isArray(sset.companyHolidays) ? sset.companyHolidays : [])
      ]
    );

    // Payroll
    const payroll = d.payroll && typeof d.payroll === 'object' ? d.payroll : {};
    await replaceTable(
      client, 'hr_employees',
      ['employee_id', 'first_name', 'last_name', 'email', 'phone', 'hire_date', 'ceased_date',
        'tax_code', 'social_insurance', 'residential_address', 'tax_id', 'officer_status',
        'payment_method', 'bank_name', 'bank_iban'],
      (Array.isArray(payroll.employees) ? payroll.employees : [])
        .filter((e) => e && e.employeeId)
        .map((e) => [
          str(e.employeeId), str(e.firstName), str(e.lastName), str(e.email), str(e.phone),
          str(e.hireDate), str(e.ceasedDate), str(e.taxCode), str(e.socialInsurance),
          str(e.residentialAddress), str(e.taxId), str(e.officerStatus),
          str(e.paymentMethod), str(e.bankName), str(e.bankIBAN)
        ])
    );

    const payrollData = payroll.payrollData && typeof payroll.payrollData === 'object'
      ? payroll.payrollData : {};
    const payRows = Object.keys(payrollData).map((key) => {
      const p = payrollData[key] || {};
      return [
        str(key),
        str(p.employeeId),
        str(p.employeeName),
        str(p.month),
        p.year == null || p.year === '' ? null : num(p.year),
        str(p.payDate),
        str(p.payrollNumber),
        p.savedAt == null || p.savedAt === '' ? null : num(p.savedAt),
        JSON.stringify(p)
      ];
    });
    await replaceTable(
      client, 'payslips',
      ['pay_key', 'employee_id', 'employee_name', 'month', 'year', 'pay_date', 'payroll_number', 'saved_at', 'data'],
      payRows
    );

    await client.query(
      `INSERT INTO payroll_company_settings (id, data, updated_at)
       VALUES (1, $1::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [JSON.stringify(payroll.companySettings && typeof payroll.companySettings === 'object'
        ? payroll.companySettings : {})]
    );

    // LMS (nested course/exam structure stored as JSON document)
    if (Object.prototype.hasOwnProperty.call(d, 'lms')) {
      const lms = d.lms && typeof d.lms === 'object' ? d.lms : {};
      const lmsPayload = {
        courses: Array.isArray(lms.courses) ? lms.courses : [],
        enrollments: Array.isArray(lms.enrollments) ? lms.enrollments : [],
        attempts: Array.isArray(lms.attempts) ? lms.attempts : [],
        purchases: Array.isArray(lms.purchases) ? lms.purchases : [],
        applicants: Array.isArray(lms.applicants) ? lms.applicants : [],
        announcements: Array.isArray(lms.announcements) ? lms.announcements : [],
        certificates: Array.isArray(lms.certificates) ? lms.certificates : [],
        learnerProfiles: Array.isArray(lms.learnerProfiles) ? lms.learnerProfiles : [],
        discussions: Array.isArray(lms.discussions) ? lms.discussions : [],
        settings: lms.settings && typeof lms.settings === 'object' ? lms.settings : {}
      };
      await client.query(
        `INSERT INTO lms_data (id, data, updated_at)
         VALUES (1, $1::jsonb, now())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [JSON.stringify(lmsPayload)]
      );
    }

    // Snapshot for backup / migration visibility
    await client.query(
      `INSERT INTO app_data (id, payload, updated_at)
       VALUES (1, $1::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
      [JSON.stringify(d)]
    );

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function countRows(pool, table) {
  const r = await pool.query('SELECT COUNT(*)::int AS n FROM ' + table);
  return r.rows[0].n;
}

async function migrateLegacyPayloadIfNeeded(pool) {
  const clientCount = await countRows(pool, 'clients');
  const invoiceCount = await countRows(pool, 'invoices');
  const vesselCount = await countRows(pool, 'vessels');
  const employeeCount = await countRows(pool, 'hr_employees');
  if (clientCount + invoiceCount + vesselCount + employeeCount > 0) return false;

  const r = await pool.query('SELECT payload FROM app_data WHERE id = 1');
  const payload = r.rows[0] && r.rows[0].payload;
  if (!payload || typeof payload !== 'object') return false;
  const keys = Object.keys(payload);
  if (keys.length === 0) return false;

  const hasData =
    (Array.isArray(payload.invoices) && payload.invoices.length) ||
    (Array.isArray(payload.clients) && payload.clients.length) ||
    (payload.fleet && Array.isArray(payload.fleet.vessels) && payload.fleet.vessels.length) ||
    (payload.payroll && Array.isArray(payload.payroll.employees) && payload.payroll.employees.length);
  if (!hasData) return false;

  await savePayload(pool, payload);
  console.log('Postgres: migrated legacy app_data.payload into relational tables');
  return true;
}

async function tableInventory(pool) {
  const tables = [
    'users', 'company_settings', 'company_banks', 'clients', 'products', 'invoices', 'invoice_items',
    'receipts', 'receipt_invoices', 'vessels', 'vessel_photos', 'vessel_documents', 'vessel_maintenance',
    'vessel_drydock', 'vessel_inventory', 'vessel_logbooks', 'vessel_crew_legacy',
    'crew_members', 'crew_documents', 'crew_assignments',
    'shift_staff', 'shift_entries', 'shift_requests', 'shift_settings',
    'hr_employees', 'payslips', 'payroll_company_settings', 'lms_data', 'app_data'
  ];
  const out = {};
  for (const t of tables) {
    try {
      out[t] = await countRows(pool, t);
    } catch (e) {
      out[t] = null;
    }
  }
  return out;
}

module.exports = {
  emptyPayload,
  loadPayload,
  savePayload,
  migrateLegacyPayloadIfNeeded,
  tableInventory
};
