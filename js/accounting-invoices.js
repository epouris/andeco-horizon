// Shared data file (e.g. OneDrive): set window.ANDECO_DATA_FILE_URL to enable auto-refresh from file
var ANDECO_DATA_FILE_URL = typeof window !== 'undefined' && window.ANDECO_DATA_FILE_URL
    ? window.ANDECO_DATA_FILE_URL
    : 'andeco_data.json';
var ANDECO_DATA_POLL_INTERVAL_MS = (typeof window !== 'undefined' && window.ANDECO_DATA_POLL_INTERVAL_MS) || 60000;

/** Shared accounting storage (set by accounting-data.js). */
var DataStore = (typeof window !== 'undefined' && (window.DataStore || window.AccountingData)) || null;

function getAccountingDataStore() {
    if (typeof window !== 'undefined') {
        DataStore = window.DataStore || window.AccountingData || DataStore;
    }
    return DataStore;
}

// Main Application
const app = {
    currentInvoiceId: null,
    currentClientId: null,
    currentReceiptId: null,
    _sharedDataPollTimer: null,

    init() {
        var self = this;
        var embedded = !!document.getElementById('accounting-invoice-app');
        var ds = getAccountingDataStore();
        if (!ds || typeof ds.init !== 'function') {
            console.error('Andeco Accounting: DataStore failed to load. Ensure js/accounting-data.js is included before accounting-invoices.js.');
            return;
        }
        DataStore = ds;
        Promise.resolve(ds.init()).then(function () {
            self.setupEventListeners();
            self.loadCompanySettings();
            if (typeof self.syncCompanySettingsToPayroll === 'function') {
                self.syncCompanySettingsToPayroll(ds.getCompanySettings());
            }
            if (!embedded) {
                self.showPage('dashboard');
                self.renderDashboard();
            }
            if (document.getElementById('invoice-subtotal') && typeof self.calculateTotals === 'function') {
                self.calculateTotals();
            }
            self.startSharedDataPolling();
            self.updateSharedFileStatus();
        });
    },

    updateSharedFileStatus() {
        var el = document.getElementById('shared-file-status');
        if (!el) return;
        if (typeof DataStore !== 'undefined' && DataStore.hasSharedFile && DataStore.hasSharedFile()) {
            el.textContent = 'Using shared file: ' + (DataStore.getSharedFileName() || 'andeco_data.json');
            el.style.display = '';
            var refreshEl = document.getElementById('shared-file-refresh-btn');
            var stopEl = document.getElementById('shared-file-stop-btn');
            if (refreshEl) refreshEl.style.display = '';
            if (stopEl) stopEl.style.display = '';
        } else {
            el.textContent = '';
            el.style.display = 'none';
            var refreshEl = document.getElementById('shared-file-refresh-btn');
            var stopEl = document.getElementById('shared-file-stop-btn');
            if (refreshEl) refreshEl.style.display = 'none';
            if (stopEl) stopEl.style.display = 'none';
        }
    },

    useSharedDataFile() {
        var self = this;
        if (typeof DataStore === 'undefined' || !DataStore.openSharedFile) {
            alert('Your browser does not support this. Use Import Data to load andeco_data.json from your folder, then Save data to file to share changes.');
            return;
        }
        DataStore.openSharedFile()
            .then(function () {
                alert('Data loaded from file. Page will reload.');
                window.location.reload();
            })
            .catch(function (err) {
                alert(err && err.message ? err.message : 'Could not open file. Use Import Data to load a backup file.');
            });
    },

    saveDataToFile() {
        if (typeof DataStore === 'undefined' || !DataStore.saveToFileAs) {
            document.getElementById('import-file-input').click();
            return;
        }
        DataStore.saveToFileAs()
            .then(function () { alert('Data saved to file.'); })
            .catch(function (err) {
                if (err && err.message && err.message.indexOf('Not supported') !== -1) {
                    if (typeof app !== 'undefined' && app.exportData) app.exportData();
                } else {
                    alert(err && err.message ? err.message : 'Could not save.');
                }
            });
    },

    clearSharedDataFile() {
        if (typeof DataStore !== 'undefined' && DataStore.clearSharedFile) DataStore.clearSharedFile();
        this.updateSharedFileStatus();
        window.location.reload();
    },

    refreshFromSharedFile() {
        if (typeof DataStore === 'undefined' || !DataStore.refreshFromSharedFile) {
            alert('No shared file in use.');
            return;
        }
        DataStore.refreshFromSharedFile()
            .then(function () {
                alert('Data refreshed from file. Page will reload.');
                window.location.reload();
            })
            .catch(function (err) {
                alert(err && err.message ? err.message : 'Could not refresh. The file may have been moved or permission was revoked.');
            });
    },

    /** Fetch shared data file and refresh UI so users see updates without reloading (e.g. when using single file in OneDrive). */
    refreshFromSharedFile() {
        if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') return;
        if (typeof DataStore !== 'undefined' && typeof DataStore.isSupabaseMode === 'function' && DataStore.isSupabaseMode() && typeof DataStore.refreshFromSupabase === 'function') {
            DataStore.refreshFromSupabase().then(function (ok) {
                if (ok && typeof DataStore.notifyModulesDataLoaded === 'function') DataStore.notifyModulesDataLoaded();
            });
            return;
        }
        var url = ANDECO_DATA_FILE_URL;
        fetch(url, { cache: 'no-store' })
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (data) {
                if (!data || typeof DataStore === 'undefined') return;
                if (typeof DataStore.loadFromData === 'function') DataStore.loadFromData(data);
                else {
                    if (Array.isArray(data.invoices)) DataStore.saveInvoices(data.invoices);
                    if (Array.isArray(data.receipts)) DataStore.saveReceipts(data.receipts);
                    if (Array.isArray(data.clients)) DataStore.saveClients(data.clients);
                    if (data.companySettings && typeof data.companySettings === 'object') DataStore.saveCompanySettings(data.companySettings);
                    if (Array.isArray(data.products) && DataStore.saveProducts) DataStore.saveProducts(data.products);
                }
                function setLocal(key, val) { try { if (val !== undefined) localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
                if (data.fleet && typeof data.fleet === 'object') {
                    if (Array.isArray(data.fleet.vessels)) setLocal('andeco_fleet_vessels', data.fleet.vessels);
                    if (Array.isArray(data.fleet.vesselPhotos)) setLocal('andeco_fleet_vessel_photos', data.fleet.vesselPhotos);
                    if (Array.isArray(data.fleet.documents)) setLocal('andeco_fleet_documents', data.fleet.documents);
                    if (Array.isArray(data.fleet.maintenance)) setLocal('andeco_fleet_maintenance', data.fleet.maintenance);
                    if (Array.isArray(data.fleet.drydock)) setLocal('andeco_fleet_drydock', data.fleet.drydock);
                    if (Array.isArray(data.fleet.inventory)) setLocal('andeco_fleet_inventory', data.fleet.inventory);
                    if (Array.isArray(data.fleet.logbooks)) setLocal('andeco_fleet_logbooks', data.fleet.logbooks);
                    if (Array.isArray(data.fleet.crew)) setLocal('andeco_fleet_crew', data.fleet.crew);
                }
                if (data.crew && typeof data.crew === 'object') {
                    if (Array.isArray(data.crew.crewMembers)) setLocal('andeco_crew_members', data.crew.crewMembers);
                    if (Array.isArray(data.crew.crewDocuments)) setLocal('andeco_crew_documents', data.crew.crewDocuments);
                    if (Array.isArray(data.crew.crewAssignments)) setLocal('andeco_crew_assignments', data.crew.crewAssignments);
                }
                if (data.shifts && typeof data.shifts === 'object') {
                    try { localStorage.setItem('andeco_shifts_data', JSON.stringify(data.shifts)); } catch (e) {}
                    if (typeof window.ShiftsManagement !== 'undefined' && window.ShiftsManagement.render) window.ShiftsManagement.render();
                }
                if (data.payroll && typeof data.payroll === 'object') {
                    if (Array.isArray(data.payroll.employees)) setLocal('employees', data.payroll.employees);
                    if (data.payroll.payrollData && typeof data.payroll.payrollData === 'object') setLocal('payrollData', data.payroll.payrollData);
                    if (data.payroll.companySettings && typeof data.payroll.companySettings === 'object') setLocal('companySettings', data.payroll.companySettings);
                }
                if (data.crm && typeof data.crm === 'object') {
                    if (Array.isArray(data.crm.users)) setLocal('andeco_crm_users', data.crm.users);
                }
                if (typeof window.reloadPayrollFromStorage === 'function') window.reloadPayrollFromStorage();
                if (typeof window.hrEmployeesRefreshOverview === 'function') window.hrEmployeesRefreshOverview();
                if (typeof app.refreshCurrentView === 'function') app.refreshCurrentView();
            })
            .catch(function () {});
    },

    /** Re-render visible lists after shared data was updated (no full page reload). */
    refreshCurrentView() {
        if (typeof this.renderDashboard === 'function') this.renderDashboard();
        var search = document.getElementById('invoice-search');
        if (typeof this.renderInvoices === 'function') this.renderInvoices(search ? search.value : '');
        if (typeof this.renderReceipts === 'function') this.renderReceipts();
        var clientSearch = document.getElementById('client-search');
        if (typeof this.renderClients === 'function') this.renderClients(clientSearch ? clientSearch.value : '');
    },

    startSharedDataPolling() {
        var self = this;
        if (self._sharedDataPollTimer) return;
        function poll() {
            if (document.visibilityState !== 'visible') return;
            self.refreshFromSharedFile();
        }
        self._sharedDataPollTimer = setInterval(poll, ANDECO_DATA_POLL_INTERVAL_MS);
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') poll();
        });
    },

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.getAttribute('data-page');
                this.showPage(page);
            });
        });

        // Invoice form
        const invoiceForm = document.getElementById('invoice-form');
        if (invoiceForm) {
            invoiceForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveInvoice();
            });
        }

        // When invoice Date changes, set Due Date to Date + 30 days (or company default payment terms)
        const invoiceDateEl = document.getElementById('invoice-date');
        if (invoiceDateEl) {
            invoiceDateEl.addEventListener('change', () => {
                const dateVal = invoiceDateEl.value;
                if (!dateVal) return;
                const settings = DataStore.getCompanySettings();
                const days = settings.defaultPaymentTerms != null ? settings.defaultPaymentTerms : 30;
                const d = new Date(dateVal + 'T12:00:00');
                d.setDate(d.getDate() + days);
                const dueEl = document.getElementById('invoice-due-date');
                if (dueEl) dueEl.value = d.toISOString().split('T')[0];
            });
        }

        // Settings form
        const settingsForm = document.getElementById('settings-form');
        if (settingsForm) {
            settingsForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveSettings();
            });
        }

        // Invoice item calculations
        document.addEventListener('input', (e) => {
            if (e.target.classList.contains('item-quantity') || 
                e.target.classList.contains('item-hours') ||
                e.target.classList.contains('item-price') ||
                e.target.classList.contains('item-description')) {
                this.updateItemTotal(e.target.closest('.invoice-item'));
                this.calculateTotals();
            }
        });
        document.addEventListener('input', (e) => {
            if (e.target.classList.contains('item-product-code')) {
                this.updateItemTotal(e.target.closest('.invoice-item'));
                this.calculateTotals();
            }
        });

        // Logo upload
        const logoUpload = document.getElementById('logo-upload');
        if (logoUpload) {
            logoUpload.addEventListener('change', (e) => {
                this.handleLogoUpload(e.target.files[0]);
            });
        }

        // Remove logo
        const removeLogo = document.getElementById('remove-logo');
        if (removeLogo) {
            removeLogo.addEventListener('click', () => {
                this.removeLogo();
            });
        }

        // Invoice search
        const invoiceSearch = document.getElementById('invoice-search');
        if (invoiceSearch) {
            invoiceSearch.addEventListener('input', (e) => {
                this.searchInvoices(e.target.value);
            });
        }

        // Client form
        const clientForm = document.getElementById('client-form');
        if (clientForm) {
            clientForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveClient();
            });
        }

        // Receipt form
        const receiptForm = document.getElementById('receipt-form');
        if (receiptForm) {
            receiptForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveReceipt();
            });
        }

        // Statement form (Reports > Customer Statement)
        const statementForm = document.getElementById('statement-form');
        if (statementForm) {
            statementForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.generateStatement();
            });
        }
        document.querySelectorAll('input[name="receipt-payment-type"]').forEach(radio => {
            radio.addEventListener('change', () => this.toggleReceiptPaymentType());
        });

        // Client search
        const clientSearch = document.getElementById('client-search');
        if (clientSearch) {
            clientSearch.addEventListener('input', (e) => {
                this.searchClients(e.target.value);
            });
        }

        // Add invoice item button (CRM uses id="btn-add-invoice-item")
        const addItemBtn = document.getElementById('btn-add-invoice-item');
        if (addItemBtn) {
            addItemBtn.addEventListener('click', () => this.addInvoiceItem());
        }
        const addHeaderBtn = document.getElementById('btn-add-section-header');
        if (addHeaderBtn) {
            addHeaderBtn.addEventListener('click', () => this.addInvoiceItemHeader());
        }
        const deleteDraftBtn = document.getElementById('btn-delete-draft-invoice');
        if (deleteDraftBtn) {
            deleteDraftBtn.addEventListener('click', () => this.deleteCurrentInvoiceIfDraft());
        }

        // Add product (Settings > Accounting)
        const addProductBtn = document.getElementById('btn-add-product');
        if (addProductBtn) {
            addProductBtn.addEventListener('click', () => this.addProductFromForm());
        }

        // Product code lookup on invoice items (delegated)
        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('item-product-code')) {
                this.fillProductInItem(e.target);
            }
        });
        document.addEventListener('blur', (e) => {
            if (e.target.classList.contains('item-product-code')) {
                this.fillProductInItem(e.target);
            }
        });
    },

    showPage(pageName) {
        if (!getAccountingDataStore()) return;
        DataStore = getAccountingDataStore();
        // When embedded in CRM, only touch pages inside #accounting-invoice-app
        const container = document.getElementById('accounting-invoice-app');
        const root = container || document.body;

        // Hide all pages (scoped to container when in CRM)
        root.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
            if (page.id !== 'client-form-section') {
                page.style.display = '';
            }
        });

        // Hide client form section if switching away from clients
        const clientFormSection = document.getElementById('client-form-section');
        if (clientFormSection && pageName !== 'clients') {
            clientFormSection.style.display = 'none';
            clientFormSection.classList.remove('active');
        }

        // Show selected page
        const page = document.getElementById(pageName);
        if (page) {
            page.classList.add('active');
        }

        // Update navigation (only if we have sidebar nav in same container)
        const navRoot = container ? container : document;
        navRoot.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('data-page') === pageName) {
                item.classList.add('active');
            }
        });

        // Load page-specific content - defer heavy rendering operations
        switch(pageName) {
            case 'dashboard':
                requestAnimationFrame(() => this.renderDashboard());
                break;
            case 'invoices':
                requestAnimationFrame(() => this.renderInvoices());
                break;
            case 'create-invoice':
                // When editing from view modal, _editingInvoiceId is set so we populate form once
                this.setupInvoiceForm(this._editingInvoiceId !== undefined ? this._editingInvoiceId : null);
                break;
            case 'clients':
                this.showClientsList();
                break;
            case 'receipts':
                requestAnimationFrame(() => this.renderReceipts());
                break;
            case 'create-receipt':
                this.setupReceiptForm();
                break;
            case 'reports':
                this.setupStatementForm();
                break;
            case 'customer-statement':
                this.setupStatementForm();
                break;
            case 'settings':
                this.loadSettingsForm();
                break;
        }
    },

    // Dashboard
    renderDashboard() {
        const invoices = DataStore.getInvoices();
        const stats = this.calculateStats(invoices);
        
        const totalInvoicesEl = document.getElementById('total-invoices');
        const totalRevenueEl = document.getElementById('total-revenue');
        const pendingInvoicesEl = document.getElementById('pending-invoices');
        const paidInvoicesEl = document.getElementById('paid-invoices');
        
        if (totalInvoicesEl) totalInvoicesEl.textContent = stats.total;
        if (totalRevenueEl) totalRevenueEl.textContent = this.formatCurrency(stats.totalRevenue);
        if (pendingInvoicesEl) pendingInvoicesEl.textContent = stats.pending;
        if (paidInvoicesEl) paidInvoicesEl.textContent = stats.paid;

        // Recent invoices (non-draft only; drafts are in Copilot)
        const recentInvoices = invoices
            .filter(inv => inv.status !== 'draft')
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 5);
        
        const recentList = document.getElementById('recent-invoices-list');
        if (recentList) {
            recentList.innerHTML = recentInvoices.length > 0
                ? recentInvoices.map(inv => this.createInvoiceCardHTML(inv)).join('')
                : '<p style="color: var(--text-secondary);">No invoices yet. Create your first invoice!</p>';
        }
        this.renderCopilotDrafts();
    },

    calculateStats(invoices) {
        return {
            total: invoices.length,
            totalRevenue: invoices.reduce((sum, inv) => sum + (parseFloat(inv.total) || 0), 0),
            pending: invoices.filter(inv => inv.status === 'pending').length,
            paid: invoices.filter(inv => inv.status === 'paid').length
        };
    },

    // Invoice Form
    setupInvoiceForm(invoiceId = null) {
        this.currentInvoiceId = invoiceId;
        const form = document.getElementById('invoice-form');
        
        if (invoiceId) {
            // Edit mode
            const invoice = DataStore.getInvoice(invoiceId);
            if (invoice) {
                this.populateInvoiceForm(invoice);
                document.getElementById('invoice-form-title').textContent = 'Edit Invoice';
                const deleteDraftBtn = document.getElementById('btn-delete-draft-invoice');
                if (deleteDraftBtn) deleteDraftBtn.style.display = invoice.status === 'draft' ? '' : 'none';
            }
        } else {
            // New invoice: do not assign invoice number until status is pending
            this._editingInvoiceId = undefined;
            form.reset();
            document.getElementById('invoice-number').value = '';
            document.getElementById('invoice-number').placeholder = 'Assigned when sent';
            document.getElementById('invoice-date').value = new Date().toISOString().split('T')[0];
            
            const settings = DataStore.getCompanySettings();
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + (settings.defaultPaymentTerms || 30));
            document.getElementById('invoice-due-date').value = dueDate.toISOString().split('T')[0];
            document.getElementById('tax-rate').value = settings.defaultTaxRate || 0;
            document.getElementById('invoice-notes').value = settings.defaultInvoiceNotes || '';
            
            document.getElementById('invoice-form-title').textContent = 'Create New Invoice';
            const deleteDraftBtn = document.getElementById('btn-delete-draft-invoice');
            if (deleteDraftBtn) deleteDraftBtn.style.display = 'none';

            // Reset items
            const itemsContainer = document.getElementById('invoice-items');
            itemsContainer.innerHTML = `
                <div class="invoice-item">
                    <input type="text" placeholder="Code" class="item-product-code" title="Enter preset product code to fill description and price">
                    <input type="text" placeholder="Description" class="item-description" required>
                    <input type="number" placeholder="Quantity" class="item-quantity" min="1" value="1" required>
                    <input type="number" placeholder="Hours" class="item-hours" min="0" step="0.01" value="0" required>
                    <input type="number" placeholder="Unit Price" class="item-price" min="0" step="0.01" required>
                    <div class="item-total">${this.formatCurrency(0)}</div>
                    <button type="button" class="btn-remove-item" onclick="app.removeItem(this)">×</button>
                </div>
            `;
            
            // Reset client fields
            document.getElementById('client-select').value = '';
            document.getElementById('client-customer-id').value = '';
            document.getElementById('client-name').value = '';
            document.getElementById('client-address').value = '';
            document.getElementById('client-email').value = '';
            document.getElementById('client-phone').value = '';
            
            this.calculateTotals();
        }
        
        // Populate client dropdown for both new and edit modes
        this.populateClientDropdown();
    },

    populateInvoiceForm(invoice) {
        const numEl = document.getElementById('invoice-number');
        numEl.value = invoice.invoiceNumber || '';
        numEl.placeholder = (invoice.status === 'draft' && !invoice.invoiceNumber) ? 'Assigned when sent' : '';
        document.getElementById('invoice-date').value = invoice.date || '';
        document.getElementById('invoice-due-date').value = invoice.dueDate || '';
        document.getElementById('invoice-notes').value = invoice.notes || '';
        document.getElementById('invoice-status').value = invoice.status || 'draft';
        document.getElementById('tax-rate').value = invoice.taxRate || 0;

        // Try to match client from dropdown
        const clients = DataStore.getClients();
        const matchedClient = clients.find(c => 
            c.name === invoice.clientName || 
            (c.email && c.email === invoice.clientEmail)
        );

        if (matchedClient) {
            document.getElementById('client-select').value = matchedClient.id;
            document.getElementById('client-customer-id').value = invoice.clientCustomerId || matchedClient.customerId || '';
            document.getElementById('client-name').value = invoice.clientName || '';
            document.getElementById('client-address').value = invoice.clientAddress || '';
            document.getElementById('client-email').value = invoice.clientEmail || '';
            document.getElementById('client-phone').value = invoice.clientPhone || '';
        } else {
            document.getElementById('client-select').value = '';
            document.getElementById('client-customer-id').value = invoice.clientCustomerId || '';
            document.getElementById('client-name').value = invoice.clientName || '';
            document.getElementById('client-address').value = invoice.clientAddress || '';
            document.getElementById('client-email').value = invoice.clientEmail || '';
            document.getElementById('client-phone').value = invoice.clientPhone || '';
        }

        // Populate items
        const itemsContainer = document.getElementById('invoice-items');
        const items = invoice.items && Array.isArray(invoice.items) ? invoice.items : [];
        if (items.length === 0) {
            itemsContainer.innerHTML = `
                <div class="invoice-item">
                    <input type="text" placeholder="Code" class="item-product-code" title="Enter preset product code to fill description and price">
                    <input type="text" placeholder="Description" class="item-description" required>
                    <input type="number" placeholder="Quantity" class="item-quantity" min="1" value="1" required>
                    <input type="number" placeholder="Hours" class="item-hours" min="0" step="0.01" value="0" required>
                    <input type="number" placeholder="Unit Price" class="item-price" min="0" step="0.01" required>
                    <div class="item-total">${this.formatCurrency(0)}</div>
                    <button type="button" class="btn-remove-item" onclick="app.removeItem(this)">×</button>
                </div>
            `;
        } else {
            itemsContainer.innerHTML = items.map(item => {
                if (item.isHeader) {
                    const desc = (item.description || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    return `<div class="invoice-item invoice-item--header">
                        <input type="text" placeholder="Section header (e.g. Labour, Parts)" class="item-header-text" value="${desc}">
                        <button type="button" class="btn-remove-item" onclick="app.removeItem(this)">×</button>
                    </div>`;
                }
                const desc = (item.description || '').replace(/"/g, '&quot;');
                return `<div class="invoice-item">
                    <input type="text" placeholder="Code" class="item-product-code" value="${(item.productCode || '').replace(/"/g, '&quot;')}" title="Enter preset product code to fill description and price">
                    <input type="text" placeholder="Description" class="item-description" value="${desc}" required>
                    <input type="number" placeholder="Quantity" class="item-quantity" min="1" value="${item.quantity || 1}" required>
                    <input type="number" placeholder="Hours" class="item-hours" min="0" step="0.01" value="${item.hours || 0}" required>
                    <input type="number" placeholder="Unit Price" class="item-price" min="0" step="0.01" value="${item.price || 0}" required>
                    <div class="item-total">${this.formatCurrency((item.quantity || 0) * (item.hours || 0) * (item.price || 0))}</div>
                    <button type="button" class="btn-remove-item" onclick="app.removeItem(this)">×</button>
                </div>`;
            }).join('');
        }
        this.calculateTotals();
    },

    addInvoiceItem() {
        const itemsContainer = document.getElementById('invoice-items');
        const newItem = document.createElement('div');
        newItem.className = 'invoice-item';
        newItem.innerHTML = `
            <input type="text" placeholder="Code" class="item-product-code" title="Enter preset product code to fill description and price">
            <input type="text" placeholder="Description" class="item-description" required>
            <input type="number" placeholder="Quantity" class="item-quantity" min="1" value="1" required>
            <input type="number" placeholder="Hours" class="item-hours" min="0" step="0.01" value="0" required>
            <input type="number" placeholder="Unit Price" class="item-price" min="0" step="0.01" required>
            <div class="item-total">${this.formatCurrency(0)}</div>
            <button type="button" class="btn-remove-item" onclick="app.removeItem(this)">×</button>
        `;
        itemsContainer.appendChild(newItem);
    },

    addInvoiceItemHeader() {
        const itemsContainer = document.getElementById('invoice-items');
        const newRow = document.createElement('div');
        newRow.className = 'invoice-item invoice-item--header';
        newRow.innerHTML = `
            <input type="text" placeholder="Section header (e.g. Labour, Parts)" class="item-header-text">
            <button type="button" class="btn-remove-item" onclick="app.removeItem(this)">×</button>
        `;
        itemsContainer.appendChild(newRow);
    },

    fillProductInItem(codeInput) {
        if (!codeInput || !DataStore.getProductByCode) return;
        const code = (codeInput.value || '').trim();
        if (!code) return;
        const product = DataStore.getProductByCode(code);
        if (!product) return;
        const row = codeInput.closest('.invoice-item');
        if (!row) return;
        const descEl = row.querySelector('.item-description');
        const priceEl = row.querySelector('.item-price');
        const hoursEl = row.querySelector('.item-hours');
        if (descEl) descEl.value = product.description || '';
        if (priceEl) priceEl.value = product.price != null ? product.price : '';
        if (hoursEl) hoursEl.value = '1';
        this.updateItemTotal(row);
        this.calculateTotals();
    },

    renderProductsList() {
        const container = document.getElementById('products-list');
        if (!container) return;
        const products = DataStore.getProducts ? DataStore.getProducts() : [];
        if (products.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.875rem; padding: 1rem;">No preset products. Add a product above.</p>';
            return;
        }
        container.innerHTML = `
            <table>
                <thead><tr><th>Code</th><th>Description</th><th class="product-price">Unit Price</th><th></th></tr></thead>
                <tbody>
                    ${products.map(p => `
                        <tr>
                            <td><strong>${(p.code || '').replace(/</g, '&lt;')}</strong></td>
                            <td>${(p.description || '').replace(/</g, '&lt;')}</td>
                            <td class="product-price">${this.formatCurrency(parseFloat(p.price) || 0)}</td>
                            <td><button type="button" class="btn btn-danger btn-delete-product" data-product-id="${p.id}">Delete</button></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        container.querySelectorAll('.btn-delete-product').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-product-id');
                if (id && confirm('Delete this product?')) {
                    DataStore.deleteProduct(id);
                    this.renderProductsList();
                }
            });
        });
    },

    addProductFromForm() {
        const codeEl = document.getElementById('product-code');
        const descEl = document.getElementById('product-description');
        const priceEl = document.getElementById('product-price');
        if (!codeEl || !DataStore.saveProduct) return;
        const code = (codeEl.value || '').trim();
        if (!code) {
            alert('Please enter a product code.');
            return;
        }
        const existing = DataStore.getProductByCode && DataStore.getProductByCode(code);
        const product = {
            id: existing ? existing.id : 'p' + Date.now(),
            code: code,
            description: (descEl && descEl.value) ? descEl.value.trim() : '',
            price: parseFloat(priceEl && priceEl.value) || 0
        };
        DataStore.saveProduct(product);
        if (codeEl) codeEl.value = '';
        if (descEl) descEl.value = '';
        if (priceEl) priceEl.value = '';
        this.renderProductsList();
    },

    removeItem(button) {
        const items = document.querySelectorAll('.invoice-item');
        if (items.length > 1) {
            button.closest('.invoice-item').remove();
            this.calculateTotals();
        } else {
            alert('Invoice must have at least one row (item or section header)');
        }
    },

    updateItemTotal(itemElement) {
        if (itemElement.classList.contains('invoice-item--header')) return;
        const quantityEl = itemElement.querySelector('.item-quantity');
        if (!quantityEl) return;
        const quantity = parseFloat(quantityEl.value) || 0;
        const hours = parseFloat(itemElement.querySelector('.item-hours').value) || 0;
        const price = parseFloat(itemElement.querySelector('.item-price').value) || 0;
        const total = quantity * hours * price;
        const totalEl = itemElement.querySelector('.item-total');
        if (totalEl) totalEl.textContent = this.formatCurrency(total);
    },

    calculateTotals() {
        const items = document.querySelectorAll('.invoice-item');
        let subtotal = 0;

        items.forEach(item => {
            if (item.classList.contains('invoice-item--header')) return;
            const qEl = item.querySelector('.item-quantity');
            if (!qEl) return;
            const quantity = parseFloat(qEl.value) || 0;
            const hours = parseFloat(item.querySelector('.item-hours').value) || 0;
            const price = parseFloat(item.querySelector('.item-price').value) || 0;
            subtotal += quantity * hours * price;
        });

        const taxRate = parseFloat(document.getElementById('tax-rate').value) || 0;
        const taxAmount = subtotal * (taxRate / 100);
        const total = subtotal + taxAmount;

        document.getElementById('invoice-subtotal').textContent = this.formatCurrency(subtotal);
        document.getElementById('tax-amount').textContent = this.formatCurrency(taxAmount);
        document.getElementById('invoice-total').textContent = this.formatCurrency(total);
    },

    saveInvoice() {
        const items = Array.from(document.querySelectorAll('.invoice-item')).map(item => {
            if (item.classList.contains('invoice-item--header')) {
                const textEl = item.querySelector('.item-header-text');
                return { isHeader: true, description: textEl ? (textEl.value || '').trim() : '' };
            }
            const codeEl = item.querySelector('.item-product-code');
            return {
                productCode: codeEl ? (codeEl.value || '').trim() : '',
                description: (item.querySelector('.item-description') || {}).value || '',
                quantity: parseFloat((item.querySelector('.item-quantity') || {}).value) || 0,
                hours: parseFloat((item.querySelector('.item-hours') || {}).value) || 0,
                price: parseFloat((item.querySelector('.item-price') || {}).value) || 0
            };
        });

        const subtotal = items.reduce((sum, item) => {
            if (item.isHeader) return sum;
            return sum + ((item.quantity || 0) * (item.hours || 0) * (item.price || 0));
        }, 0);
        const taxRate = parseFloat(document.getElementById('tax-rate').value) || 0;
        const taxAmount = subtotal * (taxRate / 100);
        const total = subtotal + taxAmount;

        let invoiceNumber = (document.getElementById('invoice-number').value || '').trim();
        const status = document.getElementById('invoice-status').value;
        if (status === 'draft') {
            invoiceNumber = invoiceNumber || '';
        } else {
            if (!invoiceNumber || invoiceNumber === 'Draft' || invoiceNumber === '—') {
                invoiceNumber = DataStore.getNextInvoiceNumber();
            }
        }

        const invoice = {
            id: this.currentInvoiceId || this.generateId(),
            invoiceNumber: invoiceNumber,
            date: document.getElementById('invoice-date').value,
            dueDate: document.getElementById('invoice-due-date').value,
            clientCustomerId: document.getElementById('client-customer-id').value,
            clientName: document.getElementById('client-name').value,
            clientAddress: document.getElementById('client-address').value,
            clientEmail: document.getElementById('client-email').value,
            clientPhone: document.getElementById('client-phone').value,
            items: items,
            subtotal: subtotal,
            taxRate: taxRate,
            taxAmount: taxAmount,
            total: total,
            notes: document.getElementById('invoice-notes').value,
            status: status,
            createdAt: this.currentInvoiceId ? DataStore.getInvoice(this.currentInvoiceId)?.createdAt || new Date().toISOString() : new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        DataStore.saveInvoice(invoice);
        alert('Invoice saved successfully!');
        this.showPage('invoices');
    },

    // Invoice List (excludes drafts; drafts appear in Copilot section)
    renderInvoices(searchTerm = '') {
        let invoices = DataStore.getInvoices().filter(inv => inv.status !== 'draft');
        
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            invoices = invoices.filter(inv => 
                (inv.invoiceNumber || '').toLowerCase().includes(term) ||
                (inv.clientName || '').toLowerCase().includes(term) ||
                (inv.status || '').toLowerCase().includes(term)
            );
        }

        invoices = invoices.sort((a, b) => {
            const numA = (a.invoiceNumber || '').match(/\d+/);
            const numB = (b.invoiceNumber || '').match(/\d+/);
            const nA = numA ? parseInt(numA[0], 10) : -1;
            const nB = numB ? parseInt(numB[0], 10) : -1;
            if (nA !== nB) return nB - nA;
            return new Date(b.date) - new Date(a.date);
        });
        
        const container = document.getElementById('invoices-list');
        if (!container) return;
        
        // Use document fragment for batch DOM operations
        const fragment = document.createDocumentFragment();
        const tempDiv = document.createElement('div');
        
        if (invoices.length > 0) {
            tempDiv.innerHTML = invoices.map(inv => this.createInvoiceCardHTML(inv)).join('');
            while (tempDiv.firstChild) {
                fragment.appendChild(tempDiv.firstChild);
            }
            container.innerHTML = '';
            container.appendChild(fragment);
        } else {
            container.innerHTML = '<p style="text-align: center; padding: 2rem; color: var(--text-secondary);">No invoices found.</p>';
        }
        this.renderCopilotDrafts();
    },

    searchInvoices(term) {
        this.renderInvoices(term);
    },

    renderCopilotDrafts() {
        const listEl = document.getElementById('copilot-drafts-list');
        if (!listEl) return;
        const drafts = DataStore.getInvoices().filter(inv => inv.status === 'draft');
        drafts.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
        if (drafts.length === 0) {
            listEl.innerHTML = '<p class="copilot-drafts-empty">No draft invoices.</p>';
            return;
        }
        listEl.innerHTML = drafts.map(inv => `
            <div class="copilot-draft-item">
                <div class="copilot-draft-item-main" onclick="app.showPage('create-invoice'); app.setupInvoiceForm('${inv.id}')">
                    <span class="copilot-draft-label">Draft</span>
                    <span class="copilot-draft-client">${(inv.clientName || 'No client').replace(/"/g, '&quot;')}</span>
                    <span class="copilot-draft-amount">${this.formatCurrency(inv.total)}</span>
                </div>
                <button type="button" class="btn-delete-draft" onclick="event.stopPropagation(); if(confirm('Delete this draft invoice?')) { DataStore.deleteInvoice('${inv.id}'); app.renderCopilotDrafts(); app.renderInvoices(); }" aria-label="Delete draft">×</button>
            </div>
        `).join('');
    },

    createInvoiceCardHTML(invoice) {
        const displayNumber = (invoice.status === 'draft' && !invoice.invoiceNumber) ? 'Draft' : (invoice.invoiceNumber || '—');
        return `
            <div class="invoice-card">
                <div class="invoice-info" onclick="app.viewInvoice('${invoice.id}')" style="flex: 1; cursor: pointer;">
                    <h3>${displayNumber}</h3>
                    <p><strong>Client:</strong> ${invoice.clientName}</p>
                    <p><strong>Date:</strong> ${this.formatDate(invoice.date)}</p>
                    <p><strong>Due Date:</strong> ${this.formatDate(invoice.dueDate)}</p>
                </div>
                <div class="invoice-meta">
                    <div class="invoice-amount">${this.formatCurrency(invoice.total)}</div>
                    <span class="invoice-status status-${invoice.status}">${invoice.status}</span>
                    <div class="invoice-actions" style="margin-top: 0.5rem;">
                        <button class="btn btn-secondary" style="padding: 0.375rem 0.75rem; font-size: 0.75rem;" onclick="event.stopPropagation(); app.viewInvoice('${invoice.id}')">View</button>
                        <button class="btn btn-primary" style="padding: 0.375rem 0.75rem; font-size: 0.75rem;" onclick="event.stopPropagation(); app.showPage('create-invoice'); app.setupInvoiceForm('${invoice.id}')">Edit</button>
                        <button class="btn btn-danger" style="padding: 0.375rem 0.75rem; font-size: 0.75rem;" onclick="event.stopPropagation(); if(confirm('Delete this invoice?')) { DataStore.deleteInvoice('${invoice.id}'); app.renderInvoices(document.getElementById('invoice-search')?.value || ''); }">Delete</button>
                    </div>
                </div>
            </div>
        `;
    },

    viewInvoice(id) {
        const invoice = DataStore.getInvoice(id);
        if (!invoice) return;

        // Store current invoice ID immediately for quick response
        this.currentInvoiceId = id;
        this.currentReceiptId = null;
        
        // Update modal for invoice
        const modalTitleEl = document.getElementById('modal-title');
        if (modalTitleEl) modalTitleEl.textContent = 'Invoice Preview';
        
        const editBtn = document.getElementById('modal-edit-btn');
        const printBtn = document.getElementById('modal-print-btn');
        const deleteBtn = document.getElementById('modal-delete-btn');
        
        if (editBtn) {
            editBtn.onclick = () => app.editCurrentInvoice();
            editBtn.textContent = '✏️ Edit';
        }
        if (printBtn) {
            printBtn.onclick = () => app.printInvoice();
            printBtn.textContent = '🖨️ Print';
        }
        if (deleteBtn) {
            deleteBtn.onclick = () => app.deleteCurrentInvoice();
            deleteBtn.textContent = '🗑️ Delete';
        }
        
        // Defer heavy rendering to next frame
        requestAnimationFrame(() => {
            const settings = DataStore.getCompanySettings();
            
            // Format date for invoice display
            const invoiceDate = new Date(invoice.date);
            const dueDate = new Date(invoice.dueDate);
            const formattedInvoiceDate = invoiceDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const formattedDueDate = dueDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

            const previewContent = document.getElementById('invoice-preview-content');
            previewContent.innerHTML = `
            <div class="invoice-preview">
                <div class="invoice-header-print">
                    <div class="company-logo-wrap">${settings.logo ? `<img src="${settings.logo}" alt="Logo" class="company-logo-print">` : ''}</div>
                    <div class="company-info-print">
                        <h1 class="company-name-print">${settings.companyName || 'Your Company'}</h1>
                        ${settings.companyAddress ? `<p class="company-contact-info">${settings.companyAddress.replace(/\n/g, ', ')}</p>` : ''}
                        ${settings.companyPhone ? `<p class="company-contact-info"><strong>Telephone:</strong> ${settings.companyPhone}</p>` : ''}
                        ${settings.companyEmail ? `<p class="company-contact-info"><strong>E-mail:</strong> ${settings.companyEmail}</p>` : ''}
                        ${settings.companyWebsite ? `<p class="company-contact-info"><strong>Web:</strong> ${settings.companyWebsite}</p>` : ''}
                    </div>
                    <div class="invoice-title-section">
                        <h2 class="invoice-title">Invoice</h2>
                        <table class="invoice-details-table">
                            <tr>
                                <td class="label-cell">Date:</td>
                                <td class="value-cell">${formattedInvoiceDate}</td>
                            </tr>
                            <tr>
                                <td class="label-cell">Invoice #:</td>
                                <td class="value-cell">${invoice.status === 'draft' && !invoice.invoiceNumber ? 'Draft' : (invoice.invoiceNumber || '—')}</td>
                            </tr>
                            ${invoice.clientCustomerId ? `
                            <tr>
                                <td class="label-cell">Customer ID:</td>
                                <td class="value-cell">${invoice.clientCustomerId}</td>
                            </tr>
                            ` : ''}
                            <tr>
                                <td class="label-cell">Payment Due by:</td>
                                <td class="value-cell">${formattedDueDate}</td>
                            </tr>
                            ${settings.companyTaxId ? `
                            <tr>
                                <td class="label-cell">V.A.T Registration No:</td>
                                <td class="value-cell">${settings.companyTaxId}</td>
                            </tr>
                            ` : ''}
                        </table>
                    </div>
                </div>

                <div class="bill-to-section-print">
                    <h3 class="section-title">Bill To</h3>
                    <div class="bill-to-content">
                        <p class="client-name">${invoice.clientName}</p>
                        ${invoice.clientAddress ? `<p class="client-address">${invoice.clientAddress.replace(/\n/g, '<br>')}</p>` : ''}
                    </div>
                </div>

                <table class="invoice-items-table-print">
                    <thead>
                        <tr>
                            <th>Description</th>
                            <th class="text-center">Quantity</th>
                            <th class="text-center">Hours</th>
                            <th class="text-center">Rate</th>
                            <th class="text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${invoice.items.map(item => {
                            if (item.isHeader) {
                                const text = (item.description || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                                return `<tr><td colspan="5" class="item-header-cell">${text || '&nbsp;'}</td></tr>`;
                            }
                            return `<tr>
                                <td>${(item.description || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
                                <td class="text-center">${item.quantity || ''}</td>
                                <td class="text-center">${item.hours || 0}</td>
                                <td class="text-center">${this.formatCurrency(item.price || 0)}</td>
                                <td class="text-right">${this.formatCurrency((item.quantity || 0) * (item.hours || 0) * (item.price || 0))}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>

                <div class="invoice-summary-section">
                    <div class="summary-notes-box">
                        ${invoice.notes ? `<div class="summary-notes-content">${invoice.notes.replace(/\n/g, '<br>')}</div>` : '<div class="summary-notes-placeholder">&nbsp;</div>'}
                    </div>
                    <table class="summary-table">
                        <tr>
                            <td class="summary-label">Subtotal:</td>
                            <td class="summary-value">${this.formatCurrency(invoice.subtotal)}</td>
                        </tr>
                        <tr>
                            <td class="summary-label">VAT Rate:</td>
                            <td class="summary-value">${invoice.taxRate.toFixed(2)} %</td>
                        </tr>
                        <tr>
                            <td class="summary-label">VAT:</td>
                            <td class="summary-value">${invoice.taxAmount > 0 ? this.formatCurrency(invoice.taxAmount) : this.formatCurrency(0)}</td>
                        </tr>
                        <tr>
                            <td class="summary-label">Total:</td>
                            <td class="summary-value summary-total">${this.formatCurrency(invoice.total)}</td>
                        </tr>
                    </table>
                </div>

                <div class="signatures-section">
                    <table class="signatures-table">
                        <tr>
                            <td class="signature-cell">
                                <div class="signature-wrapper">
                                    <div class="signature-line"></div>
                                    <div class="signature-label">ISSUED BY</div>
                                </div>
                            </td>
                            <td class="signature-cell">
                                <div class="signature-wrapper">
                                    <div class="signature-line"></div>
                                    <div class="signature-label">CHECKED BY</div>
                                </div>
                            </td>
                        </tr>
                    </table>
                </div>

                <div class="payment-instructions payment-instructions-small">
                    <p><strong>Make all checks payable to ${settings.companyName || 'Your Company'}</strong></p>
                </div>

                ${settings.banks && settings.banks.length > 0 ? `
                <div class="bank-details-section">
                    <h4 class="bank-title">Bank Account Details</h4>
                    <table class="bank-accounts-table">
                        <thead>
                            <tr>
                                <th class="bank-th">Bank</th>
                                <th class="bank-th">IBAN</th>
                                <th class="bank-th">SWIFT</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(function() {
                                const validBanks = settings.banks.filter(bank => bank.name || bank.iban || bank.swift);
                                return validBanks.map(bank => `
                                    <tr>
                                        <td class="bank-cell">${bank.name || '—'}</td>
                                        <td class="bank-cell">${bank.iban || '—'}</td>
                                        <td class="bank-cell">${bank.swift || '—'}</td>
                                    </tr>
                                `).join('');
                            })()}
                        </tbody>
                    </table>
                </div>
                ` : ''}

                <div class="thank-you-message">
                    <p>Thank you for your business!</p>
                </div>
            </div>
        `;

            document.getElementById('invoice-modal').classList.add('active');
        });
    },

    closeInvoiceModal() {
        document.getElementById('invoice-modal').classList.remove('active');
    },

    editCurrentInvoice() {
        if (!this.currentInvoiceId) return;
        const idToEdit = this.currentInvoiceId;
        this.closeInvoiceModal();
        this._editingInvoiceId = idToEdit;
        this.showPage('create-invoice');
        this._editingInvoiceId = undefined;
    },

    deleteCurrentInvoice() {
        if (!this.currentInvoiceId) return;
        
        if (confirm('Are you sure you want to delete this invoice? This action cannot be undone.')) {
            DataStore.deleteInvoice(this.currentInvoiceId);
            this.closeInvoiceModal();
            this.showPage('invoices');
            this.renderInvoices();
            alert('Invoice deleted successfully!');
        }
    },

    deleteCurrentInvoiceIfDraft() {
        if (!this.currentInvoiceId) return;
        const invoice = DataStore.getInvoice(this.currentInvoiceId);
        if (!invoice || invoice.status !== 'draft') return;
        if (confirm('Delete this draft invoice? This cannot be undone.')) {
            DataStore.deleteInvoice(this.currentInvoiceId);
            this.currentInvoiceId = null;
            this.showPage('invoices');
            this.renderInvoices();
        }
    },

    printInvoice() {
        if (!this.currentInvoiceId) return;
        
        const invoice = DataStore.getInvoice(this.currentInvoiceId);
        if (!invoice) return;
        
        const settings = DataStore.getCompanySettings();
        
        // Format dates
        const invoiceDate = new Date(invoice.date);
        const dueDate = new Date(invoice.dueDate);
        const formattedInvoiceDate = invoiceDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const formattedDueDate = dueDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        
        // Create print window
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Invoice ${invoice.status === 'draft' && !invoice.invoiceNumber ? 'Draft' : (invoice.invoiceNumber || '—')}</title>
                <style>
                    @page {
                        size: A4;
                        margin: 1.5cm;
                    }
                    
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }
                    
                    body {
                        font-family: Arial, Helvetica, sans-serif;
                        font-size: 11pt;
                        line-height: 1.4;
                        color: #000;
                        background: white;
                    }
                    
                    .invoice-container {
                        max-width: 210mm;
                        margin: 0 auto;
                        padding: 0;
                    }
                    
                    /* Header Section */
                    .invoice-header-print {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-start;
                        margin-bottom: 25px;
                        padding-bottom: 15px;
                        border-bottom: 2px solid #000;
                    }
                    
                    .company-logo-wrap {
                        flex: 0 0 auto;
                        margin-right: 1rem;
                    }
                    
                    .company-info-print {
                        flex: 1;
                    }
                    
                    .company-logo-print {
                        max-width: 120px;
                        max-height: 80px;
                        object-fit: contain;
                    }
                    
                    .company-name-print {
                        font-size: 18pt;
                        font-weight: bold;
                        margin: 5px 0 10px 0;
                        color: #000;
                    }
                    
                    .company-contact-info {
                        font-size: 8pt;
                        margin: 2px 0;
                        color: #333;
                        line-height: 1.3;
                    }
                    
                    .invoice-title-section {
                        text-align: right;
                        min-width: 200px;
                    }
                    
                    .invoice-title {
                        font-size: 18pt;
                        font-weight: bold;
                        margin: 0 0 8px 0;
                        color: #000;
                        text-transform: uppercase;
                    }
                    
                    .invoice-details-table {
                        border-collapse: collapse;
                        margin-top: 3px;
                        width: 100%;
                        font-size: 9pt;
                    }
                    
                    .invoice-details-table tr {
                        border-bottom: 1px solid #e0e0e0;
                    }
                    
                    .invoice-details-table tr:last-child {
                        border-bottom: none;
                    }
                    
                    .invoice-details-table .label-cell {
                        padding: 2px 8px 2px 0;
                        text-align: right;
                        font-weight: 600;
                        color: #333;
                        white-space: nowrap;
                        width: 50%;
                        font-size: 9pt;
                    }
                    
                    .invoice-details-table .value-cell {
                        padding: 2px 0;
                        text-align: left;
                        color: #000;
                        width: 50%;
                        font-size: 9pt;
                    }
                    
                    /* Bill To Section */
                    .bill-to-section-print {
                        margin-bottom: 12px;
                    }
                    
                    .section-title {
                        font-size: 9pt;
                        font-weight: 600;
                        margin-bottom: 8px;
                        color: #333;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    
                    .bill-to-content {
                        margin-left: 0;
                    }
                    
                    .client-name {
                        font-size: 11pt;
                        margin: 3px 0;
                        color: #000;
                        font-weight: bold;
                    }
                    
                    .client-address {
                        font-size: 9pt;
                        margin: 3px 0;
                        color: #333;
                        line-height: 1.5;
                    }
                    
                    /* Items Table - compact for one-page print */
                    .invoice-items-table-print {
                        width: 100%;
                        border-collapse: collapse;
                        margin-bottom: 10px;
                        border: 1px solid #ddd;
                        font-size: 7.5pt;
                        line-height: 1.15;
                    }
                    
                    .invoice-items-table-print thead {
                        background-color: #f5f5f5;
                    }
                    
                    .invoice-items-table-print th {
                        padding: 3px 5px;
                        text-align: left;
                        font-weight: 600;
                        font-size: 7pt;
                        color: #333;
                        text-transform: uppercase;
                        letter-spacing: 0.3px;
                        border-bottom: 1px solid #ddd;
                    }
                    
                    .invoice-items-table-print th.text-center {
                        text-align: center;
                    }
                    
                    .invoice-items-table-print td {
                        padding: 3px 5px;
                        border-bottom: 1px solid #e0e0e0;
                        font-size: 7.5pt;
                        line-height: 1.15;
                    }
                    
                    .invoice-items-table-print tbody tr:last-child td {
                        border-bottom: none;
                    }
                    
                    .invoice-items-table-print .item-header-cell {
                        font-weight: 600;
                        padding: 3px 5px;
                        background-color: #f0f0f0;
                        border-bottom: 1px solid #e0e0e0;
                        font-size: 7.5pt;
                    }
                    
                    .text-right {
                        text-align: right;
                    }
                    
                    .text-center {
                        text-align: center;
                    }
                    
                    /* Summary Section */
                    .invoice-summary-section {
                        margin-bottom: 12px;
                        display: flex;
                        justify-content: space-between;
                        gap: 20px;
                    }
                    
                    .summary-notes-box {
                        flex: 1;
                        min-height: 120px;
                        border: 1px solid #ddd;
                        padding: 10px;
                        font-size: 7.5pt;
                        color: #333;
                        background-color: #fafafa;
                    }
                    
                    .summary-notes-content {
                        line-height: 1.5;
                        white-space: pre-wrap;
                    }
                    
                    .summary-notes-placeholder {
                        min-height: 100px;
                    }
                    
                    .summary-table {
                        border-collapse: collapse;
                        width: 300px;
                        flex-shrink: 0;
                    }
                    
                    .summary-table tr {
                        border-bottom: 1px solid #e0e0e0;
                    }
                    
                    .summary-table tr:last-child {
                        border-bottom: 2px solid #000;
                    }
                    
                    .summary-label {
                        padding: 4px 15px 4px 0;
                        text-align: right;
                        font-weight: 600;
                        color: #333;
                        font-size: 8pt;
                    }
                    
                    .summary-value {
                        padding: 4px 0;
                        text-align: right;
                        color: #000;
                        font-size: 8pt;
                    }
                    
                    .summary-total {
                        font-size: 9pt;
                        font-weight: bold;
                        padding-top: 6px;
                    }
                    
                    /* Bank Details Section - same as view, after Make all checks */
                    .bank-details-section {
                        margin: 0.5rem 0 1rem;
                        padding: 0;
                        border: none;
                    }
                    
                    .bank-title {
                        font-size: 0.55rem;
                        font-weight: 600;
                        margin-bottom: 0.25rem;
                        color: #333;
                        text-transform: uppercase;
                    }
                    
                    .bank-accounts-table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 0.25rem;
                        font-size: 0.6rem;
                        border: 1px solid #e0e0e0;
                        border-radius: 0.35rem;
                        overflow: hidden;
                    }
                    
                    .bank-accounts-table .bank-th {
                        padding: 0.3rem 0.5rem;
                        text-align: left;
                        font-weight: 600;
                        font-size: 0.6rem;
                        color: #333;
                        background: #f5f5f5;
                        border-bottom: 1px solid #e0e0e0;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    
                    .bank-accounts-table .bank-cell {
                        padding: 0.3rem 0.5rem;
                        font-size: 0.6rem;
                        border-bottom: 1px solid #e0e0e0;
                        color: #000;
                    }
                    
                    .bank-accounts-table tbody tr:last-child .bank-cell {
                        border-bottom: none;
                    }
                    
                    .bank-accounts-table .bank-cell p {
                        margin: 0.1rem 0;
                    }
                    
                    /* Signatures Section - 8rem top margin for 16rem gap above signature line */
                    .signatures-section {
                        margin: 8rem 0 20px 0;
                        padding: 15px 0;
                    }
                    
                    .signatures-table {
                        width: 100%;
                        border-collapse: collapse;
                    }
                    
                    .signatures-table .signature-cell {
                        width: 50%;
                        padding: 0;
                        vertical-align: bottom;
                    }
                    
                    .signature-wrapper {
                        display: flex;
                        flex-direction: column;
                        gap: 0;
                    }
                    
                    .signature-line {
                        border-top: 1px solid #000;
                        margin: 0;
                        padding: 0;
                        height: 1rem;
                        flex-shrink: 0;
                    }
                    
                    .signature-label {
                        font-size: 8pt;
                        font-weight: 600;
                        color: #333;
                        text-transform: uppercase;
                        margin: 0;
                        padding: 0;
                        text-align: center;
                        line-height: 1;
                    }
                    
                    /* Special Notes */
                    .special-notes-section {
                        margin: 20px 0;
                        padding: 15px 0;
                        border-top: 1px solid #e0e0e0;
                    }
                    
                    .notes-title {
                        font-size: 7.5pt;
                        font-weight: 600;
                        margin-bottom: 8px;
                        color: #333;
                    }
                    
                    .notes-content {
                        font-size: 7.5pt;
                        color: #333;
                        white-space: pre-wrap;
                        margin: 0;
                    }
                    
                    /* Payment Instructions - 4rem bottom margin before signature line */
                    .payment-instructions {
                        margin: 6px 0 4rem 0;
                        padding: 6px 0;
                        border-top: 1px solid #e0e0e0;
                        font-size: 9pt;
                        color: #000;
                    }
                    
                    /* Thank You Message */
                    .thank-you-message {
                        margin: 20px 0;
                        text-align: center;
                        font-size: 11pt;
                        color: #333;
                        font-style: italic;
                    }
                    
                    /* Footer */
                    .invoice-footer {
                        margin-top: 30px;
                        padding-top: 15px;
                        border-top: 1px solid #e0e0e0;
                        font-size: 9pt;
                        color: #666;
                    }
                    
                    .footer-contact p {
                        margin: 3px 0;
                        line-height: 1.5;
                    }
                    
                    @media print {
                        body {
                            margin: 0;
                            padding: 0;
                        }
                        
                        .invoice-container {
                            margin: 0;
                            padding: 0;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="invoice-container">
                    <div class="invoice-header-print">
                        <div class="company-logo-wrap">${settings.logo ? `<img src="${settings.logo}" alt="Logo" class="company-logo-print">` : ''}</div>
                        <div class="company-info-print">
                            <h1 class="company-name-print">${settings.companyName || 'Your Company'}</h1>
                            ${settings.companyAddress ? `<p class="company-contact-info">${settings.companyAddress.replace(/\n/g, ', ')}</p>` : ''}
                            ${settings.companyPhone ? `<p class="company-contact-info"><strong>Telephone:</strong> ${settings.companyPhone}</p>` : ''}
                            ${settings.companyEmail ? `<p class="company-contact-info"><strong>E-mail:</strong> ${settings.companyEmail}</p>` : ''}
                            ${settings.companyWebsite ? `<p class="company-contact-info"><strong>Web:</strong> ${settings.companyWebsite}</p>` : ''}
                        </div>
                        <div class="invoice-title-section">
                            <h2 class="invoice-title">Invoice</h2>
                            <table class="invoice-details-table">
                                <tr>
                                    <td class="label-cell">Date:</td>
                                    <td class="value-cell">${formattedInvoiceDate}</td>
                                </tr>
                                <tr>
                                    <td class="label-cell">Invoice #:</td>
                                    <td class="value-cell">${invoice.status === 'draft' && !invoice.invoiceNumber ? 'Draft' : (invoice.invoiceNumber || '—')}</td>
                                </tr>
                                ${invoice.clientCustomerId ? `
                                <tr>
                                    <td class="label-cell">Customer ID:</td>
                                    <td class="value-cell">${invoice.clientCustomerId}</td>
                                </tr>
                                ` : ''}
                                <tr>
                                    <td class="label-cell">Payment Due by:</td>
                                    <td class="value-cell">${formattedDueDate}</td>
                                </tr>
                                ${settings.companyTaxId ? `
                                <tr>
                                    <td class="label-cell">V.A.T Registration No:</td>
                                    <td class="value-cell">${settings.companyTaxId}</td>
                                </tr>
                                ` : ''}
                            </table>
                        </div>
                    </div>

                    <div class="bill-to-section-print">
                        <h3 class="section-title">Bill To</h3>
                        <div class="bill-to-content">
                            <p class="client-name">${invoice.clientName}</p>
                            ${invoice.clientAddress ? `<p class="client-address">${invoice.clientAddress.replace(/\n/g, '<br>')}</p>` : ''}
                        </div>
                    </div>

                    <table class="invoice-items-table-print">
                        <thead>
                            <tr>
                                <th>Description</th>
                                <th class="text-center">Quantity</th>
                                <th class="text-center">Hours</th>
                                <th class="text-center">Rate</th>
                                <th class="text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${invoice.items.map(item => {
                                if (item.isHeader) {
                                    const text = (item.description || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                                    return `<tr><td colspan="5" class="item-header-cell">${text || '&nbsp;'}</td></tr>`;
                                }
                                return `<tr>
                                    <td>${(item.description || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
                                    <td class="text-center">${item.quantity || ''}</td>
                                    <td class="text-center">${item.hours || 0}</td>
                                    <td class="text-center">${this.formatCurrency(item.price || 0)}</td>
                                    <td class="text-right">${this.formatCurrency((item.quantity || 0) * (item.hours || 0) * (item.price || 0))}</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>

                    <div class="invoice-summary-section">
                        <div class="summary-notes-box">
                            ${invoice.notes ? `<div class="summary-notes-content">${invoice.notes.replace(/\n/g, '<br>')}</div>` : '<div class="summary-notes-placeholder">&nbsp;</div>'}
                        </div>
                        <table class="summary-table">
                            <tr>
                                <td class="summary-label">Subtotal:</td>
                                <td class="summary-value">${this.formatCurrency(invoice.subtotal)}</td>
                            </tr>
                            <tr>
                                <td class="summary-label">VAT Rate:</td>
                                <td class="summary-value">${invoice.taxRate.toFixed(2)} %</td>
                            </tr>
                            <tr>
                                <td class="summary-label">VAT:</td>
                                <td class="summary-value">${invoice.taxAmount > 0 ? this.formatCurrency(invoice.taxAmount) : this.formatCurrency(0)}</td>
                            </tr>
                            <tr>
                                <td class="summary-label">Total:</td>
                                <td class="summary-value summary-total">${this.formatCurrency(invoice.total)}</td>
                            </tr>
                        </table>
                    </div>

                <div class="signatures-section">
                        <table class="signatures-table">
                            <tr>
                                <td class="signature-cell">
                                    <div class="signature-wrapper">
                                        <div class="signature-line"></div>
                                        <div class="signature-label">ISSUED BY</div>
                                    </div>
                                </td>
                                <td class="signature-cell">
                                    <div class="signature-wrapper">
                                        <div class="signature-line"></div>
                                        <div class="signature-label">CHECKED BY</div>
                                    </div>
                                </td>
                            </tr>
                        </table>
                    </div>

                    <div class="payment-instructions payment-instructions-small">
                        <p><strong>Make all checks payable to ${settings.companyName || 'Your Company'}</strong></p>
                    </div>

                    ${settings.banks && settings.banks.length > 0 ? `
                    <div class="bank-details-section">
                        <h4 class="bank-title">Bank Account Details</h4>
                        <table class="bank-accounts-table">
                            <thead>
                                <tr>
                                    <th class="bank-th">Bank</th>
                                    <th class="bank-th">IBAN</th>
                                    <th class="bank-th">SWIFT</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(function() {
                                    const validBanks = settings.banks.filter(bank => bank.name || bank.iban || bank.swift);
                                    return validBanks.map(bank => `
                                        <tr>
                                            <td class="bank-cell">${bank.name || '—'}</td>
                                            <td class="bank-cell">${bank.iban || '—'}</td>
                                            <td class="bank-cell">${bank.swift || '—'}</td>
                                        </tr>
                                    `).join('');
                                })()}
                            </tbody>
                        </table>
                    </div>
                ` : ''}

                    <div class="thank-you-message">
                        <p>Thank you for your business!</p>
                    </div>

                </div>
                <script>
                    window.onload = function() {
                        window.print();
                    };
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    },

    // Receipts
    renderReceipts() {
        const receipts = DataStore.getReceipts();
        const container = document.getElementById('receipts-list');
        if (!container) return;
        
        container.innerHTML = receipts.length > 0
            ? receipts.map(receipt => this.createReceiptCardHTML(receipt)).join('')
            : '<p style="text-align: center; padding: 2rem; color: var(--text-secondary);">No receipts found. Create your first receipt!</p>';
    },

    createReceiptCardHTML(receipt) {
        const invoiceIds = receipt.invoiceIds || [];
        const invoices = invoiceIds.map(id => DataStore.getInvoice(id)).filter(inv => inv);
        const isOnAccount = !!receipt.onAccountBalance;
        const invoiceNumbers = invoices.map(inv => inv.invoiceNumber).join(', ');
        
        let clientName = 'N/A';
        if (receipt.clientId) {
            const client = DataStore.getClient(receipt.clientId);
            if (client) clientName = client.name;
        } else if (invoices.length > 0) {
            clientName = invoices[0].clientName;
        }
        
        return `
            <div class="invoice-card">
                <div class="invoice-info" onclick="app.viewReceipt('${receipt.id}')" style="flex: 1; cursor: pointer;">
                    <h3>${receipt.receiptNumber}</h3>
                    <p><strong>Client:</strong> ${clientName}</p>
                    <p><strong>Date:</strong> ${this.formatDate(receipt.date)}</p>
                    <p><strong>${isOnAccount ? 'Type:' : 'Invoices:'}</strong> ${isOnAccount ? 'On account balance' : (invoiceNumbers || 'N/A')}</p>
                    ${receipt.paymentMethod ? `<p><strong>Payment Method:</strong> ${receipt.paymentMethod}</p>` : ''}
                </div>
                <div class="invoice-meta">
                    <div class="invoice-amount">${this.formatCurrency(receipt.amount)}</div>
                    <div class="invoice-actions" style="margin-top: 0.5rem;">
                        <button class="btn btn-secondary" style="padding: 0.375rem 0.75rem; font-size: 0.75rem;" onclick="event.stopPropagation(); app.viewReceipt('${receipt.id}')">View</button>
                        <button class="btn btn-primary" style="padding: 0.375rem 0.75rem; font-size: 0.75rem;" onclick="event.stopPropagation(); app.showPage('create-receipt'); app.setupReceiptForm('${receipt.id}')">Edit</button>
                        <button class="btn btn-danger" style="padding: 0.375rem 0.75rem; font-size: 0.75rem;" onclick="event.stopPropagation(); if(confirm('Delete this receipt? The invoices will be changed back to pending status.')) { app.deleteReceiptAndUpdateInvoices('${receipt.id}'); app.renderReceipts(); }">Delete</button>
                    </div>
                </div>
            </div>
        `;
    },

    setupReceiptForm(receiptId = null) {
        this.currentReceiptId = receiptId;
        const form = document.getElementById('receipt-form');
        
        // Populate client dropdown
        this.populateReceiptClientDropdown();
        
        // Populate invoice selection list
        this.populateInvoiceSelectionList();
        
        if (receiptId) {
            // Edit mode
            const receipt = DataStore.getReceipt(receiptId);
            if (receipt) {
                this.populateReceiptForm(receipt);
                document.getElementById('receipt-form-title').textContent = 'Edit Receipt';
            }
        } else {
            // New receipt
            form.reset();
            document.getElementById('receipt-number').value = DataStore.getNextReceiptNumber();
            document.getElementById('receipt-date').value = new Date().toISOString().split('T')[0];
            document.getElementById('receipt-form-title').textContent = 'Create New Receipt';
            const invRadio = document.getElementById('receipt-type-invoices');
            if (invRadio) invRadio.checked = true;
            const accRadio = document.getElementById('receipt-type-on-account');
            if (accRadio) accRadio.checked = false;
            this.updateReceiptAmount();
        }
        this.toggleReceiptPaymentType();
    },

    populateReceiptClientDropdown() {
        const clients = DataStore.getClients();
        const select = document.getElementById('receipt-client-select');
        
        if (!select) return;
        
        const selectedId = select.value;
        select.innerHTML = '<option value="">-- Select a client --</option>';
        
        if (!Array.isArray(clients)) return;

        clients.slice().sort((a, b) => {
            const an = (DataStore.getClientCompanyName ? DataStore.getClientCompanyName(a) : (a && a.name) || '').toString();
            const bn = (DataStore.getClientCompanyName ? DataStore.getClientCompanyName(b) : (b && b.name) || '').toString();
            return an.localeCompare(bn);
        }).forEach(client => {
            if (!client || client.id == null || client.id === '') return;
            const option = document.createElement('option');
            option.value = client.id;
            option.textContent = DataStore.getClientOptionLabel ? DataStore.getClientOptionLabel(client) : client.name;
            select.appendChild(option);
        });

        if (selectedId && Array.from(select.options).some(function (o) { return o.value === selectedId; })) {
            select.value = selectedId;
        }
    },

    filterInvoicesByClient(clientId) {
        this.populateInvoiceSelectionList(clientId);
        this.updateReceiptAmount();
    },

    toggleReceiptPaymentType() {
        const onAccount = document.getElementById('receipt-type-on-account') && document.getElementById('receipt-type-on-account').checked;
        const section = document.getElementById('receipt-invoices-section');
        if (section) section.style.display = onAccount ? 'none' : '';
        if (!onAccount) {
            const clientId = document.getElementById('receipt-client-select') && document.getElementById('receipt-client-select').value;
            if (clientId) this.populateInvoiceSelectionList(clientId);
            this.updateReceiptAmount();
        }
    },

    populateInvoiceSelectionList(clientId = null) {
        const container = document.getElementById('invoice-selection-list');
        if (!container) return;
        
        if (!clientId) {
            container.innerHTML = '<p class="invoice-selection-empty">Please select a client first to see pending invoices.</p>';
            return;
        }
        
        let invoices = DataStore.getInvoices();
        const currentReceipt = this.currentReceiptId ? DataStore.getReceipt(this.currentReceiptId) : null;
        const receiptInvoiceIds = currentReceipt && currentReceipt.invoiceIds ? currentReceipt.invoiceIds : [];
        
        const client = DataStore.getClient(clientId);
        if (!client) {
            container.innerHTML = '<p class="invoice-selection-empty">No pending invoices found for the selected client.</p>';
            return;
        }
        
        invoices = invoices.filter(inv => {
            if (inv.status === 'draft') return false;
            const clientMatch = inv.clientName === client.name ||
                (client.email && inv.clientEmail === client.email);
            if (!clientMatch) return false;
            const isInThisReceipt = receiptInvoiceIds.includes(inv.id);
            return inv.status === 'pending' || isInThisReceipt;
        });
        
        if (invoices.length === 0) {
            container.innerHTML = '<p class="invoice-selection-empty">No pending invoices found for the selected client.</p>';
            return;
        }
        
        // Sort invoices by date - oldest first
        const sortedInvoices = invoices.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        container.innerHTML = sortedInvoices.map(invoice => {
            const isSelected = this.currentReceiptId 
                ? DataStore.getReceipt(this.currentReceiptId)?.invoiceIds.includes(invoice.id)
                : false;
            
            return `
                <label class="invoice-selection-item ${isSelected ? 'selected' : ''}">
                    <input type="checkbox" 
                           name="selected-invoices" 
                           value="${invoice.id}" 
                           ${isSelected ? 'checked' : ''}
                           onchange="app.updateReceiptAmount()"
                           class="invoice-selection-checkbox">
                    <div class="invoice-selection-content">
                        <div class="invoice-selection-compact">
                            <strong class="invoice-selection-number">${invoice.invoiceNumber}</strong>
                            <span class="invoice-selection-date">${this.formatDate(invoice.date)}</span>
                            <span class="invoice-selection-amount">${this.formatCurrency(invoice.total)}</span>
                            <span class="invoice-selection-status status-${invoice.status}">${invoice.status}</span>
                        </div>
                    </div>
                </label>
            `;
        }).join('');
    },

    populateReceiptForm(receipt) {
        document.getElementById('receipt-number').value = receipt.receiptNumber || '';
        document.getElementById('receipt-date').value = receipt.date || '';
        document.getElementById('receipt-amount').value = receipt.amount || 0;
        document.getElementById('receipt-payment-method').value = receipt.paymentMethod || '';
        document.getElementById('receipt-notes').value = receipt.notes || '';
        const onAccount = !!receipt.onAccountBalance;
        const invRadio = document.getElementById('receipt-type-invoices');
        const accRadio = document.getElementById('receipt-type-on-account');
        if (invRadio) invRadio.checked = !onAccount;
        if (accRadio) accRadio.checked = onAccount;
        
        // Set client dropdown if clientId exists
        if (receipt.clientId) {
            document.getElementById('receipt-client-select').value = receipt.clientId;
            // Filter invoices by client
            this.populateInvoiceSelectionList(receipt.clientId);
        } else {
            // Try to determine client from first invoice
            if (receipt.invoiceIds && receipt.invoiceIds.length > 0) {
                const firstInvoice = DataStore.getInvoice(receipt.invoiceIds[0]);
                if (firstInvoice) {
                    const clients = DataStore.getClients();
                    const matchedClient = clients.find(c => 
                        c.name === firstInvoice.clientName || 
                        (c.email && c.email === firstInvoice.clientEmail)
                    );
                    if (matchedClient) {
                        document.getElementById('receipt-client-select').value = matchedClient.id;
                        this.populateInvoiceSelectionList(matchedClient.id);
                    } else {
                        this.populateInvoiceSelectionList();
                    }
                } else {
                    this.populateInvoiceSelectionList();
                }
            } else {
                this.populateInvoiceSelectionList();
            }
        }
        this.toggleReceiptPaymentType();
    },

    updateReceiptAmount() {
        const onAccount = document.getElementById('receipt-type-on-account') && document.getElementById('receipt-type-on-account').checked;
        if (onAccount) return;
        const selectedCheckboxes = document.querySelectorAll('input[name="selected-invoices"]:checked');
        const selectedInvoiceIds = Array.from(selectedCheckboxes).map(cb => cb.value);
        const invoices = selectedInvoiceIds.map(id => DataStore.getInvoice(id)).filter(inv => inv);
        const totalAmount = invoices.reduce((sum, inv) => sum + (parseFloat(inv.total) || 0), 0);
        document.getElementById('receipt-amount').value = totalAmount.toFixed(2);
    },

    saveReceipt() {
        const onAccount = document.getElementById('receipt-type-on-account') && document.getElementById('receipt-type-on-account').checked;
        const selectedCheckboxes = document.querySelectorAll('input[name="selected-invoices"]:checked');
        const selectedInvoiceIds = onAccount ? [] : Array.from(selectedCheckboxes).map(cb => cb.value);
        
        if (!onAccount && selectedInvoiceIds.length === 0) {
            alert('Please select at least one invoice for this receipt, or choose "On account balance".');
            return;
        }
        
        const clientId = document.getElementById('receipt-client-select').value;
        if (!clientId) {
            alert('Please select a client for this receipt.');
            return;
        }
        
        const amount = parseFloat(document.getElementById('receipt-amount').value) || 0;
        if (amount <= 0) {
            alert('Please enter a payment amount.');
            return;
        }
        
        const isNewReceipt = !this.currentReceiptId;
        const existingReceipt = this.currentReceiptId ? DataStore.getReceipt(this.currentReceiptId) : null;
        const previousInvoiceIds = existingReceipt ? (existingReceipt.invoiceIds || []) : [];
        
        const receipt = {
            id: this.currentReceiptId || this.generateId(),
            receiptNumber: document.getElementById('receipt-number').value,
            date: document.getElementById('receipt-date').value,
            clientId: clientId,
            invoiceIds: selectedInvoiceIds,
            onAccountBalance: onAccount,
            amount: amount,
            paymentMethod: document.getElementById('receipt-payment-method').value,
            notes: document.getElementById('receipt-notes').value,
            createdAt: this.currentReceiptId ? DataStore.getReceipt(this.currentReceiptId)?.createdAt || new Date().toISOString() : new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (!onAccount) {
            // If editing: revert any unselected invoices (that were on the receipt) back to pending
            if (existingReceipt && previousInvoiceIds.length > 0) {
                const unselectedIds = previousInvoiceIds.filter(id => !selectedInvoiceIds.includes(id));
                unselectedIds.forEach(invoiceId => {
                    const invoice = DataStore.getInvoice(invoiceId);
                    if (invoice) {
                        invoice.status = 'pending';
                        invoice.updatedAt = new Date().toISOString();
                        DataStore.saveInvoice(invoice);
                    }
                });
            }
            selectedInvoiceIds.forEach(invoiceId => {
                const invoice = DataStore.getInvoice(invoiceId);
                if (invoice) {
                    invoice.status = 'paid';
                    invoice.updatedAt = new Date().toISOString();
                    DataStore.saveInvoice(invoice);
                }
            });
        }
        
        DataStore.saveReceipt(receipt);
        alert(onAccount ? 'Receipt saved successfully!' : 'Receipt saved successfully! Invoices have been marked as paid.');
        this.showPage('receipts');
    },

    viewReceipt(id) {
        const receipt = DataStore.getReceipt(id);
        if (!receipt) return;

        const isOnAccount = !!receipt.onAccountBalance;
        const invoices = (receipt.invoiceIds || []).map(invId => DataStore.getInvoice(invId)).filter(inv => inv);
        if (!isOnAccount && invoices.length === 0) {
            alert('Receipt references invoices that no longer exist.');
            return;
        }

        let clientName = '';
        let clientAddress = '';
        if (receipt.clientId) {
            const client = DataStore.getClient(receipt.clientId);
            if (client) {
                clientName = client.name;
                clientAddress = client.address || '';
            }
        }
        if (!clientName && invoices.length > 0) {
            clientName = invoices[0].clientName;
            clientAddress = invoices[0].clientAddress || '';
        }

        const settings = DataStore.getCompanySettings();
        const receiptDate = new Date(receipt.date);
        const formattedReceiptDate = receiptDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

        const totalAmount = isOnAccount ? (parseFloat(receipt.amount) || 0) : invoices.reduce((sum, inv) => sum + (parseFloat(inv.total) || 0), 0);
        const totalSubtotal = isOnAccount ? totalAmount : invoices.reduce((sum, inv) => sum + (parseFloat(inv.subtotal) || 0), 0);
        const totalTax = isOnAccount ? 0 : invoices.reduce((sum, inv) => sum + (parseFloat(inv.taxAmount) || 0), 0);

        // Store current receipt ID and clear invoice ID
        this.currentReceiptId = id;
        this.currentInvoiceId = null;

        // Update modal for receipt
        const modalTitleEl = document.getElementById('modal-title');
        if (modalTitleEl) modalTitleEl.textContent = 'Receipt Preview';
        
        const editBtn = document.getElementById('modal-edit-btn');
        const printBtn = document.getElementById('modal-print-btn');
        const deleteBtn = document.getElementById('modal-delete-btn');
        
        if (editBtn) {
            editBtn.onclick = () => app.editCurrentReceipt();
            editBtn.textContent = '✏️ Edit';
        }
        if (printBtn) {
            printBtn.onclick = () => app.printReceipt();
            printBtn.textContent = '🖨️ Print';
        }
        if (deleteBtn) {
            deleteBtn.onclick = () => app.deleteCurrentReceipt();
            deleteBtn.textContent = '🗑️ Delete';
        }

        const previewContent = document.getElementById('invoice-preview-content');
        previewContent.innerHTML = `
            <div class="invoice-preview">
                <div class="invoice-header-print">
                    <div class="company-logo-wrap">${settings.logo ? `<img src="${settings.logo}" alt="Logo" class="company-logo-print">` : ''}</div>
                    <div class="company-info-print">
                        <h1 class="company-name-print">${settings.companyName || 'Your Company'}</h1>
                        ${settings.companyAddress ? `<p class="company-contact-info">${settings.companyAddress.replace(/\n/g, ', ')}</p>` : ''}
                        ${settings.companyPhone ? `<p class="company-contact-info"><strong>Telephone:</strong> ${settings.companyPhone}</p>` : ''}
                        ${settings.companyEmail ? `<p class="company-contact-info"><strong>E-mail:</strong> ${settings.companyEmail}</p>` : ''}
                        ${settings.companyWebsite ? `<p class="company-contact-info"><strong>Web:</strong> ${settings.companyWebsite}</p>` : ''}
                    </div>
                    <div class="invoice-title-section">
                        <h2 class="invoice-title">Receipt</h2>
                        <table class="invoice-details-table">
                            <tr>
                                <td class="label-cell">Date:</td>
                                <td class="value-cell">${formattedReceiptDate}</td>
                            </tr>
                            <tr>
                                <td class="label-cell">Receipt #:</td>
                                <td class="value-cell">${receipt.receiptNumber}</td>
                            </tr>
                            ${settings.companyTaxId ? `
                            <tr>
                                <td class="label-cell">V.A.T Registration No:</td>
                                <td class="value-cell">${settings.companyTaxId}</td>
                            </tr>
                            ` : ''}
                        </table>
                    </div>
                </div>

                <div class="bill-to-section-print">
                    <h3 class="section-title">Payment Received From</h3>
                    <div class="bill-to-content">
                        <p class="client-name">${clientName}</p>
                        ${clientAddress ? `<p class="client-address">${clientAddress.replace(/\n/g, '<br>')}</p>` : ''}
                    </div>
                </div>

                <div style="margin-bottom: 20px;">
                    <h3 class="section-title">${isOnAccount ? 'Payment type' : 'Invoices Paid'}</h3>
                    ${isOnAccount ? `
                    <p class="bill-to-content" style="margin: 0.5rem 0;"><strong>On account balance</strong></p>
                    <p style="margin: 0.5rem 0; font-size: 1rem;">Amount: ${this.formatCurrency(totalAmount)}</p>
                    ` : `
                    <table class="invoice-items-table-print">
                        <thead>
                            <tr>
                                <th>Invoice #</th>
                                <th>Date</th>
                                <th class="text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${invoices.map(inv => `
                                <tr>
                                    <td>${inv.invoiceNumber}</td>
                                    <td>${new Date(inv.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                                    <td class="text-right">${this.formatCurrency(inv.total)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    `}
                </div>

                <div class="invoice-summary-section">
                    <div class="summary-notes-box">
                        ${receipt.notes ? `<div class="summary-notes-content">${receipt.notes.replace(/\n/g, '<br>')}</div>` : '<div class="summary-notes-placeholder">&nbsp;</div>'}
                    </div>
                    <table class="summary-table">
                        <tr>
                            <td class="summary-label">Subtotal:</td>
                            <td class="summary-value">${this.formatCurrency(totalSubtotal)}</td>
                        </tr>
                        <tr>
                            <td class="summary-label">VAT:</td>
                            <td class="summary-value">${this.formatCurrency(totalTax)}</td>
                        </tr>
                        <tr>
                            <td class="summary-label">Total Amount:</td>
                            <td class="summary-value summary-total">${this.formatCurrency(totalAmount)}</td>
                        </tr>
                        ${receipt.paymentMethod ? `
                        <tr>
                            <td class="summary-label">Payment Method:</td>
                            <td class="summary-value">${receipt.paymentMethod}</td>
                        </tr>
                        ` : ''}
                    </table>
                </div>

                <div class="thank-you-message">
                    <p>Thank you for your payment!</p>
                </div>
            </div>
        `;

        document.getElementById('invoice-modal').classList.add('active');
    },

    editCurrentReceipt() {
        if (this.currentReceiptId) {
            this.closeInvoiceModal();
            this.showPage('create-receipt');
            this.setupReceiptForm(this.currentReceiptId);
        }
    },

    deleteCurrentReceipt() {
        if (!this.currentReceiptId) return;
        
        if (confirm('Are you sure you want to delete this receipt? This action cannot be undone. The invoices will be changed back to pending status.')) {
            this.deleteReceiptAndUpdateInvoices(this.currentReceiptId);
            this.closeInvoiceModal();
            this.showPage('receipts');
            this.renderReceipts();
        }
    },

    deleteReceiptAndUpdateInvoices(receiptId) {
        const receipt = DataStore.getReceipt(receiptId);
        if (!receipt) return;
        
        // Update invoice statuses back to pending
        if (receipt.invoiceIds && receipt.invoiceIds.length > 0) {
            receipt.invoiceIds.forEach(invoiceId => {
                const invoice = DataStore.getInvoice(invoiceId);
                if (invoice) {
                    // Check if this invoice is in any other receipt
                    const allReceipts = DataStore.getReceipts();
                    const isInOtherReceipt = allReceipts.some(r => 
                        r.id !== receiptId && r.invoiceIds && r.invoiceIds.includes(invoiceId)
                    );
                    
                    // Only change to pending if not in another receipt
                    if (!isInOtherReceipt) {
                        invoice.status = 'pending';
                        invoice.updatedAt = new Date().toISOString();
                        DataStore.saveInvoice(invoice);
                    }
                }
            });
        }
        
        // Delete the receipt
        DataStore.deleteReceipt(receiptId);
        alert('Receipt deleted successfully! Invoice statuses have been updated.');
    },

    printReceipt() {
        if (!this.currentReceiptId) return;
        
        const receipt = DataStore.getReceipt(this.currentReceiptId);
        if (!receipt) return;
        
        const isOnAccount = !!receipt.onAccountBalance;
        const invoices = (receipt.invoiceIds || []).map(invId => DataStore.getInvoice(invId)).filter(inv => inv);
        if (!isOnAccount && invoices.length === 0) {
            alert('Receipt references invoices that no longer exist.');
            return;
        }
        
        let clientName = '';
        let clientAddress = '';
        if (receipt.clientId) {
            const client = DataStore.getClient(receipt.clientId);
            if (client) {
                clientName = client.name;
                clientAddress = client.address || '';
            }
        }
        if (!clientName && invoices.length > 0) {
            clientName = invoices[0].clientName;
            clientAddress = invoices[0].clientAddress || '';
        }
        
        const settings = DataStore.getCompanySettings();
        const receiptDate = new Date(receipt.date);
        const formattedReceiptDate = receiptDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        
        const totalAmount = isOnAccount ? (parseFloat(receipt.amount) || 0) : invoices.reduce((sum, inv) => sum + (parseFloat(inv.total) || 0), 0);
        const totalSubtotal = isOnAccount ? totalAmount : invoices.reduce((sum, inv) => sum + (parseFloat(inv.subtotal) || 0), 0);
        const totalTax = isOnAccount ? 0 : invoices.reduce((sum, inv) => sum + (parseFloat(inv.taxAmount) || 0), 0);
        
        // Create print window
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Receipt ${receipt.receiptNumber}</title>
                <style>
                    @page {
                        size: A4;
                        margin: 1.5cm;
                    }
                    
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }
                    
                    body {
                        font-family: Arial, Helvetica, sans-serif;
                        font-size: 11pt;
                        line-height: 1.4;
                        color: #000;
                        background: white;
                    }
                    
                    .invoice-container {
                        max-width: 210mm;
                        margin: 0 auto;
                        padding: 0;
                    }
                    
                    .invoice-header-print {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-start;
                        margin-bottom: 25px;
                        padding-bottom: 15px;
                        border-bottom: 2px solid #000;
                    }
                    
                    .company-logo-wrap {
                        flex: 0 0 auto;
                        margin-right: 1rem;
                    }
                    
                    .company-info-print {
                        flex: 1;
                    }
                    
                    .company-logo-print {
                        max-width: 120px;
                        max-height: 80px;
                        object-fit: contain;
                    }
                    
                    .company-name-print {
                        font-size: 18pt;
                        font-weight: bold;
                        margin: 5px 0 10px 0;
                        color: #000;
                    }
                    
                    .company-contact-info {
                        font-size: 8pt;
                        margin: 2px 0;
                        color: #333;
                        line-height: 1.3;
                    }
                    
                    .invoice-title-section {
                        text-align: right;
                        min-width: 200px;
                    }
                    
                    .invoice-title {
                        font-size: 18pt;
                        font-weight: bold;
                        margin: 0 0 8px 0;
                        color: #000;
                        text-transform: uppercase;
                    }
                    
                    .invoice-details-table {
                        border-collapse: collapse;
                        margin-top: 3px;
                        width: 100%;
                        font-size: 9pt;
                    }
                    
                    .invoice-details-table tr {
                        border-bottom: 1px solid #e0e0e0;
                    }
                    
                    .invoice-details-table tr:last-child {
                        border-bottom: none;
                    }
                    
                    .invoice-details-table .label-cell {
                        padding: 2px 8px 2px 0;
                        text-align: right;
                        font-weight: 600;
                        color: #333;
                        white-space: nowrap;
                        width: 50%;
                        font-size: 9pt;
                    }
                    
                    .invoice-details-table .value-cell {
                        padding: 2px 0;
                        text-align: left;
                        color: #000;
                        width: 50%;
                        font-size: 9pt;
                    }
                    
                    .bill-to-section-print {
                        margin-bottom: 12px;
                    }
                    
                    .section-title {
                        font-size: 9pt;
                        font-weight: 600;
                        margin-bottom: 8px;
                        color: #333;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    
                    .bill-to-content {
                        margin-left: 0;
                    }
                    
                    .client-name {
                        font-size: 11pt;
                        margin: 3px 0;
                        color: #000;
                        font-weight: bold;
                    }
                    
                    .client-address {
                        font-size: 9pt;
                        margin: 3px 0;
                        color: #333;
                        line-height: 1.5;
                    }
                    
                    .invoice-items-table-print {
                        width: 100%;
                        border-collapse: collapse;
                        margin-bottom: 10px;
                        border: 1px solid #ddd;
                        font-size: 7.5pt;
                        line-height: 1.15;
                    }
                    
                    .invoice-items-table-print thead {
                        background-color: #f5f5f5;
                    }
                    
                    .invoice-items-table-print th {
                        padding: 3px 5px;
                        text-align: left;
                        font-weight: 600;
                        font-size: 7pt;
                        color: #333;
                        text-transform: uppercase;
                        letter-spacing: 0.3px;
                        border-bottom: 1px solid #ddd;
                    }
                    
                    .invoice-items-table-print th.text-right {
                        text-align: right;
                    }
                    
                    .invoice-items-table-print td {
                        padding: 3px 5px;
                        border-bottom: 1px solid #e0e0e0;
                        font-size: 7.5pt;
                        line-height: 1.15;
                    }
                    
                    .invoice-items-table-print tbody tr:last-child td {
                        border-bottom: none;
                    }
                    
                    .invoice-items-table-print .item-header-cell {
                        font-weight: 600;
                        padding: 3px 5px;
                        background-color: #f0f0f0;
                        border-bottom: 1px solid #e0e0e0;
                        font-size: 7.5pt;
                    }
                    
                    .text-right {
                        text-align: right;
                    }
                    
                    .invoice-summary-section {
                        margin-bottom: 15px;
                        display: flex;
                        justify-content: space-between;
                        gap: 20px;
                    }
                    
                    .summary-notes-box {
                        flex: 1;
                        min-height: 120px;
                        border: 1px solid #ddd;
                        padding: 10px;
                        font-size: 7.5pt;
                        color: #333;
                        background-color: #fafafa;
                    }
                    
                    .summary-notes-content {
                        line-height: 1.5;
                        white-space: pre-wrap;
                    }
                    
                    .summary-notes-placeholder {
                        min-height: 100px;
                    }
                    
                    .summary-table {
                        border-collapse: collapse;
                        width: 300px;
                        flex-shrink: 0;
                    }
                    
                    .summary-table tr {
                        border-bottom: 1px solid #e0e0e0;
                    }
                    
                    .summary-table tr:last-child {
                        border-bottom: 2px solid #000;
                    }
                    
                    .summary-label {
                        padding: 4px 15px 4px 0;
                        text-align: right;
                        font-weight: 600;
                        color: #333;
                        font-size: 8pt;
                    }
                    
                    .summary-value {
                        padding: 4px 0;
                        text-align: right;
                        color: #000;
                        font-size: 8pt;
                    }
                    
                    .summary-total {
                        font-size: 9pt;
                        font-weight: bold;
                        padding-top: 6px;
                    }
                    
                    .thank-you-message {
                        margin: 20px 0;
                        text-align: center;
                        font-size: 11pt;
                        color: #333;
                        font-style: italic;
                    }
                </style>
            </head>
            <body>
                <div class="invoice-container">
                    <div class="invoice-header-print">
                        <div class="company-logo-wrap">${settings.logo ? `<img src="${settings.logo}" alt="Logo" class="company-logo-print">` : ''}</div>
                        <div class="company-info-print">
                            <h1 class="company-name-print">${settings.companyName || 'Your Company'}</h1>
                            ${settings.companyAddress ? `<p class="company-contact-info">${settings.companyAddress.replace(/\n/g, ', ')}</p>` : ''}
                            ${settings.companyPhone ? `<p class="company-contact-info"><strong>Telephone:</strong> ${settings.companyPhone}</p>` : ''}
                            ${settings.companyEmail ? `<p class="company-contact-info"><strong>E-mail:</strong> ${settings.companyEmail}</p>` : ''}
                            ${settings.companyWebsite ? `<p class="company-contact-info"><strong>Web:</strong> ${settings.companyWebsite}</p>` : ''}
                        </div>
                        <div class="invoice-title-section">
                            <h2 class="invoice-title">Receipt</h2>
                            <table class="invoice-details-table">
                                <tr>
                                    <td class="label-cell">Date:</td>
                                    <td class="value-cell">${formattedReceiptDate}</td>
                                </tr>
                                <tr>
                                    <td class="label-cell">Receipt #:</td>
                                    <td class="value-cell">${receipt.receiptNumber}</td>
                                </tr>
                                ${settings.companyTaxId ? `
                                <tr>
                                    <td class="label-cell">V.A.T Registration No:</td>
                                    <td class="value-cell">${settings.companyTaxId}</td>
                                </tr>
                                ` : ''}
                            </table>
                        </div>
                    </div>

                    <div class="bill-to-section-print">
                        <h3 class="section-title">Payment Received From</h3>
                        <div class="bill-to-content">
                            <p class="client-name">${clientName}</p>
                            ${clientAddress ? `<p class="client-address">${clientAddress.replace(/\n/g, '<br>')}</p>` : ''}
                        </div>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <h3 class="section-title">${isOnAccount ? 'Payment type' : 'Invoices Paid'}</h3>
                        ${isOnAccount ? `
                        <p style="margin: 0.5rem 0;"><strong>On account balance</strong></p>
                        <p style="margin: 0.5rem 0; font-size: 11pt;">Amount: ${this.formatCurrency(totalAmount)}</p>
                        ` : `
                        <table class="invoice-items-table-print">
                            <thead>
                                <tr>
                                    <th>Invoice #</th>
                                    <th>Date</th>
                                    <th class="text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${invoices.map(inv => `
                                    <tr>
                                        <td>${inv.invoiceNumber}</td>
                                        <td>${new Date(inv.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                                        <td class="text-right">${this.formatCurrency(inv.total)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        `}
                    </div>

                    <div class="invoice-summary-section">
                        <div class="summary-notes-box">
                            ${receipt.notes ? `<div class="summary-notes-content">${receipt.notes.replace(/\n/g, '<br>')}</div>` : '<div class="summary-notes-placeholder">&nbsp;</div>'}
                        </div>
                        <table class="summary-table">
                            <tr>
                                <td class="summary-label">Subtotal:</td>
                                <td class="summary-value">${this.formatCurrency(totalSubtotal)}</td>
                            </tr>
                            <tr>
                                <td class="summary-label">VAT:</td>
                                <td class="summary-value">${this.formatCurrency(totalTax)}</td>
                            </tr>
                            <tr>
                                <td class="summary-label">Total Amount:</td>
                                <td class="summary-value summary-total">${this.formatCurrency(totalAmount)}</td>
                            </tr>
                            ${receipt.paymentMethod ? `
                            <tr>
                                <td class="summary-label">Payment Method:</td>
                                <td class="summary-value">${receipt.paymentMethod}</td>
                            </tr>
                            ` : ''}
                        </table>
                    </div>

                    <div class="thank-you-message">
                        <p>Thank you for your payment!</p>
                    </div>
                </div>
                <script>
                    window.onload = function() {
                        window.print();
                    };
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    },

    // Client Management
    showClientsList() {
        // Hide client form, show clients list
        const clientsPage = document.getElementById('clients');
        const clientFormSection = document.getElementById('client-form-section');
        
        if (clientsPage) {
            clientsPage.style.display = 'block';
            clientsPage.classList.add('active');
        }
        if (clientFormSection) {
            clientFormSection.style.display = 'none';
            clientFormSection.classList.remove('active');
        }
        
        this.renderClients();
    },

    showClientForm(clientId = null) {
        // Hide clients list, show client form
        const clientsPage = document.getElementById('clients');
        const clientFormSection = document.getElementById('client-form-section');
        
        if (clientsPage) {
            clientsPage.classList.remove('active');
            clientsPage.style.display = 'none';
        }
        if (clientFormSection) {
            clientFormSection.style.display = 'block';
            clientFormSection.classList.add('active');
        }

        this.currentClientId = clientId;
        const form = document.getElementById('client-form');
        
        if (clientId) {
            // Edit mode
            const client = DataStore.getClient(clientId);
            if (client) {
                this.populateClientForm(client);
                document.getElementById('client-form-title').textContent = 'Edit Client';
            }
        } else {
            // New client
            form.reset();
            document.getElementById('client-form-title').textContent = 'Add New Client';
        }
    },

    populateClientForm(client) {
        const normalized = DataStore.normalizeClientForForm
            ? DataStore.normalizeClientForForm(client)
            : { companyName: client.name || '', contactPerson: client.contactPerson || '' };
        document.getElementById('client-form-customer-id').value = client.customerId || '';
        document.getElementById('client-form-name').value = normalized.companyName || '';
        document.getElementById('client-form-contact').value = normalized.contactPerson || '';
        document.getElementById('client-form-address').value = client.address || '';
        document.getElementById('client-form-email').value = client.email || '';
        document.getElementById('client-form-phone').value = client.phone || '';
        document.getElementById('client-form-tax-id').value = client.taxId || '';
        document.getElementById('client-form-website').value = client.website || '';
        document.getElementById('client-form-notes').value = client.notes || '';
    },

    saveClient() {
        const companyName = document.getElementById('client-form-name').value.trim();
        const contactPerson = document.getElementById('client-form-contact').value.trim();
        if (!companyName) {
            alert('Company name is required.');
            return;
        }
        const existing = this.currentClientId ? DataStore.getClient(this.currentClientId) : null;
        const client = {
            id: this.currentClientId || this.generateId(),
            customerId: document.getElementById('client-form-customer-id').value,
            name: companyName,
            contactPerson: contactPerson,
            company: '',
            address: document.getElementById('client-form-address').value,
            email: document.getElementById('client-form-email').value,
            phone: document.getElementById('client-form-phone').value,
            taxId: document.getElementById('client-form-tax-id').value,
            website: document.getElementById('client-form-website').value,
            notes: document.getElementById('client-form-notes').value,
            createdAt: existing?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        DataStore.saveClient(client);
        if (typeof this.populateClientDropdown === 'function') this.populateClientDropdown();
        if (typeof this.populateReceiptClientDropdown === 'function') this.populateReceiptClientDropdown();
        alert('Client saved successfully!');
        this.showClientsList();
    },

    renderClients(searchTerm = '') {
        let clients = DataStore.getClients();
        
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            clients = clients.filter(client => 
                client.name.toLowerCase().includes(term) ||
                (client.contactPerson && client.contactPerson.toLowerCase().includes(term)) ||
                (client.company && client.company.toLowerCase().includes(term)) ||
                (client.email && client.email.toLowerCase().includes(term))
            );
        }

        clients = clients.sort((a, b) => a.name.localeCompare(b.name));
        
        const container = document.getElementById('clients-list');
        if (!container) return;
        
        // Use document fragment for batch DOM operations
        const fragment = document.createDocumentFragment();
        const tempDiv = document.createElement('div');
        
        if (clients.length > 0) {
            tempDiv.innerHTML = clients.map(client => this.createClientCardHTML(client)).join('');
            while (tempDiv.firstChild) {
                fragment.appendChild(tempDiv.firstChild);
            }
            container.innerHTML = '';
            container.appendChild(fragment);
        } else {
            container.innerHTML = '<p style="text-align: center; padding: 2rem; color: var(--text-secondary);">No clients found. Add your first client!</p>';
        }
    },

    searchClients(term) {
        this.renderClients(term);
    },

    createClientCardHTML(client) {
        const companyName = DataStore.getClientCompanyName ? DataStore.getClientCompanyName(client) : (client.name || client.company || '');
        const contactPerson = DataStore.getClientContactPerson ? DataStore.getClientContactPerson(client) : (client.contactPerson || '');
        return `
            <div class="invoice-card">
                <div class="invoice-info" style="flex: 1;">
                    <h3>${companyName}</h3>
                    ${contactPerson ? `<p><strong>Contact:</strong> ${contactPerson}</p>` : ''}
                    ${client.email ? `<p><strong>Email:</strong> ${client.email}</p>` : ''}
                    ${client.phone ? `<p><strong>Phone:</strong> ${client.phone}</p>` : ''}
                    ${client.address ? `<p><strong>Address:</strong> ${client.address.split('\n')[0]}</p>` : ''}
                </div>
                <div class="invoice-meta">
                    <div class="invoice-actions" style="margin-top: 0;">
                        <button class="btn btn-primary" style="padding: 0.375rem 0.75rem; font-size: 0.75rem;" onclick="app.showClientForm('${client.id}')">Edit</button>
                        <button class="btn btn-danger" style="padding: 0.375rem 0.75rem; font-size: 0.75rem;" onclick="if(confirm('Delete this client?')) { DataStore.deleteClient('${client.id}'); app.renderClients(document.getElementById('client-search')?.value || ''); }">Delete</button>
                    </div>
                </div>
            </div>
        `;
    },

    populateClientDropdown() {
        const select = document.getElementById('client-select');
        if (!select || typeof DataStore === 'undefined' || !DataStore.getClients) return;

        let clients = DataStore.getClients();
        if (!Array.isArray(clients)) clients = [];

        const selectedId = select.value;
        select.innerHTML = '<option value="">-- Select a client or enter new --</option>';

        clients.slice().sort((a, b) => {
            const an = (DataStore.getClientCompanyName ? DataStore.getClientCompanyName(a) : (a && a.name) || '').toString();
            const bn = (DataStore.getClientCompanyName ? DataStore.getClientCompanyName(b) : (b && b.name) || '').toString();
            return an.localeCompare(bn);
        }).forEach(client => {
            if (!client || client.id == null || client.id === '') return;
            const option = document.createElement('option');
            option.value = client.id;
            option.textContent = DataStore.getClientOptionLabel
                ? DataStore.getClientOptionLabel(client)
                : ((client.name || client.company || 'Unnamed client').toString());
            select.appendChild(option);
        });

        if (selectedId && Array.from(select.options).some(function (o) { return o.value === selectedId; })) {
            select.value = selectedId;
        }
    },

    selectClient(clientId) {
        if (!clientId) {
            // Clear fields if no client selected
            document.getElementById('client-customer-id').value = '';
            document.getElementById('client-name').value = '';
            document.getElementById('client-address').value = '';
            document.getElementById('client-email').value = '';
            document.getElementById('client-phone').value = '';
            return;
        }

        const client = DataStore.getClient(clientId);
        if (client) {
            document.getElementById('client-customer-id').value = client.customerId || '';
            document.getElementById('client-name').value = client.name || '';
            document.getElementById('client-address').value = client.address || '';
            document.getElementById('client-email').value = client.email || '';
            document.getElementById('client-phone').value = client.phone || '';
        }
    },

    // Settings
    loadSettingsForm() {
        const settings = DataStore.getCompanySettings();
        
        document.getElementById('company-name').value = settings.companyName || '';
        document.getElementById('company-address').value = settings.companyAddress || '';
        document.getElementById('company-email').value = settings.companyEmail || '';
        document.getElementById('company-phone').value = settings.companyPhone || '';
        document.getElementById('company-tax-id').value = settings.companyTaxId || '';
        document.getElementById('company-registration').value = settings.companyRegistration || '';
        document.getElementById('company-website').value = settings.companyWebsite || '';
        document.getElementById('company-currency').value = settings.currency || 'EUR';
        
        // Load banks and products
        this.renderBanksList(settings.banks || []);
        this.renderProductsList();
        document.getElementById('invoice-sequence-number').value = settings.invoiceSequenceNumber || 1000;
        document.getElementById('receipt-sequence-number').value = settings.receiptSequenceNumber || 1000;
        document.getElementById('default-tax-rate').value = settings.defaultTaxRate || 0;
        document.getElementById('default-payment-terms').value = settings.defaultPaymentTerms || 30;
        document.getElementById('default-invoice-notes').value = settings.defaultInvoiceNotes || '';

        // Load logo
        if (settings.logo) {
            document.getElementById('logo-image').src = settings.logo;
            document.getElementById('logo-image').style.display = 'block';
            document.getElementById('logo-placeholder').style.display = 'none';
            document.getElementById('remove-logo').style.display = 'inline-block';
        } else {
            document.getElementById('logo-image').style.display = 'none';
            document.getElementById('logo-placeholder').style.display = 'block';
            document.getElementById('remove-logo').style.display = 'none';
        }
    },

    loadCompanySettings() {
        const settings = DataStore.getCompanySettings();
        // Settings are loaded when needed
    },

    handleLogoUpload(file) {
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            alert('Please select an image file');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const logoData = e.target.result;
            document.getElementById('logo-image').src = logoData;
            document.getElementById('logo-image').style.display = 'block';
            document.getElementById('logo-placeholder').style.display = 'none';
            document.getElementById('remove-logo').style.display = 'inline-block';
        };
        reader.readAsDataURL(file);
    },

    removeLogo() {
        document.getElementById('logo-image').src = '';
        document.getElementById('logo-image').style.display = 'none';
        document.getElementById('logo-placeholder').style.display = 'block';
        document.getElementById('remove-logo').style.display = 'none';
        document.getElementById('logo-upload').value = '';
    },

    saveSettings() {
        const companyName = (document.getElementById('company-name').value || '').trim();
        if (!companyName) {
            alert('Company name is required in Company Information.');
            return;
        }
        const settings = {
            companyName: companyName,
            companyAddress: document.getElementById('company-address').value,
            companyEmail: document.getElementById('company-email').value,
            companyPhone: document.getElementById('company-phone').value,
            companyTaxId: document.getElementById('company-tax-id').value,
            companyRegistration: document.getElementById('company-registration') ? document.getElementById('company-registration').value : '',
            companyWebsite: document.getElementById('company-website').value,
            banks: this.getBanksFromForm(),
            logo: document.getElementById('logo-image').src || '',
            currency: document.getElementById('company-currency').value || 'EUR',
            invoiceSequenceNumber: parseInt(document.getElementById('invoice-sequence-number').value) || 1000,
            receiptSequenceNumber: parseInt(document.getElementById('receipt-sequence-number').value) || 1000,
            defaultTaxRate: parseFloat(document.getElementById('default-tax-rate').value) || 0,
            defaultPaymentTerms: parseInt(document.getElementById('default-payment-terms').value) || 30,
            defaultInvoiceNotes: document.getElementById('default-invoice-notes').value
        };

        // Only save logo if it's a data URL (not empty)
        if (!settings.logo.startsWith('data:')) {
            const existingSettings = DataStore.getCompanySettings();
            settings.logo = existingSettings.logo || '';
        }

        DataStore.saveCompanySettings(settings);
        this.syncCompanySettingsToPayroll(settings);
        alert('Settings saved successfully!');
        this.refreshCurrencyDisplay();
    },

    /** Re-render monetary amounts after company currency changes. */
    refreshCurrencyDisplay() {
        this.refreshCurrentView();
        document.querySelectorAll('.invoice-item').forEach(function (item) {
            if (typeof app.updateItemTotal === 'function') app.updateItemTotal(item);
        });
        if (document.getElementById('invoice-subtotal') && typeof this.calculateTotals === 'function') {
            this.calculateTotals();
        }
        if (typeof window.updateAllTabs === 'function') window.updateAllTabs();
        var payslipEmployee = document.getElementById('payslipEmployee');
        if (payslipEmployee && payslipEmployee.value && typeof window.generatePayslip === 'function') {
            try { window.generatePayslip(); } catch (e) {}
        }
    },

    /** Sync main app company settings to Payroll localStorage so payslips and IR63 use the same data. */
    syncCompanySettingsToPayroll(settings) {
        if (!settings || typeof localStorage === 'undefined') return;
        const payrollCompany = {
            companyName: settings.companyName || '',
            companyAddress: settings.companyAddress || '',
            companyPhone: settings.companyPhone || '',
            companyEmail: settings.companyEmail || '',
            companyWebsite: settings.companyWebsite || '',
            companyTaxId: settings.companyTaxId || '',
            companyRegistration: settings.companyRegistration || '',
            logoData: (settings.logo && settings.logo.toString().startsWith('data:')) ? settings.logo : '',
            currency: settings.currency || 'EUR'
        };
        try {
            localStorage.setItem('companySettings', JSON.stringify(payrollCompany));
        } catch (e) {}
    },

    // Utility functions
    formatCurrency(amount) {
        if (typeof DataStore !== 'undefined' && typeof DataStore.formatCurrency === 'function') {
            return DataStore.formatCurrency(amount);
        }
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(amount) || 0);
    },

    formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    },

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    // Bank Account Management
    renderBanksList(banks) {
        const container = document.getElementById('banks-list');
        if (!container) return;
        
        if (banks.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 1rem;">No bank accounts added. Click "Add Bank Account" to add one.</p>';
            return;
        }
        
        container.innerHTML = banks.map((bank, index) => `
            <div class="bank-account-item" data-bank-index="${index}">
                <div class="bank-account-header">
                    <h4>Bank Account ${index + 1}${bank.name ? ` - ${bank.name}` : ''}</h4>
                    <button type="button" class="btn-remove-bank" onclick="app.removeBankAccount(${index})" title="Remove bank account">×</button>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Bank Name</label>
                        <input type="text" class="bank-name-input" data-index="${index}" value="${bank.name || ''}" placeholder="e.g., Bank Of Cyprus">
                    </div>
                    <div class="form-group">
                        <label>IBAN</label>
                        <input type="text" class="bank-iban-input" data-index="${index}" value="${bank.iban || ''}" placeholder="e.g., CY81 0020 0554 0000 0011 0038 7500">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>SWIFT Code</label>
                        <input type="text" class="bank-swift-input" data-index="${index}" value="${bank.swift || ''}" placeholder="e.g., BCYPCY2N">
                    </div>
                    <div class="form-group">
                        <!-- Empty for spacing -->
                    </div>
                </div>
            </div>
        `).join('');
    },

    addBankAccount() {
        // Get current banks from form (preserve any unsaved changes)
        const currentBanks = this.getBanksFromForm();
        // Add new empty bank
        currentBanks.push({ name: '', iban: '', swift: '' });
        // Re-render with the updated list
        this.renderBanksList(currentBanks);
    },

    removeBankAccount(index) {
        if (!confirm('Are you sure you want to remove this bank account?')) return;
        
        const settings = DataStore.getCompanySettings();
        const banks = settings.banks || [];
        banks.splice(index, 1);
        this.renderBanksList(banks);
    },

    getBanksFromForm() {
        const banks = [];
        const bankItems = document.querySelectorAll('.bank-account-item');
        
        bankItems.forEach((item, index) => {
            const nameInput = item.querySelector(`.bank-name-input[data-index="${index}"]`);
            const ibanInput = item.querySelector(`.bank-iban-input[data-index="${index}"]`);
            const swiftInput = item.querySelector(`.bank-swift-input[data-index="${index}"]`);
            
            if (nameInput || ibanInput || swiftInput) {
                banks.push({
                    name: nameInput ? nameInput.value.trim() : '',
                    iban: ibanInput ? ibanInput.value.trim() : '',
                    swift: swiftInput ? swiftInput.value.trim() : ''
                });
            }
        });
        
        return banks;
    },

    // Data Export/Import (all app data: accounting, fleet, crew)
    exportData() {
        function getLocal(key, def) {
            try {
                var r = localStorage.getItem(key);
                return r ? JSON.parse(r) : def;
            } catch (e) { return def; }
        }
        const data = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            invoices: DataStore.getInvoices(),
            receipts: DataStore.getReceipts(),
            clients: DataStore.getClients(),
            companySettings: DataStore.getCompanySettings(),
            products: DataStore.getProducts ? DataStore.getProducts() : [],
            fleet: {
                vessels: getLocal('andeco_fleet_vessels', []),
                vesselPhotos: getLocal('andeco_fleet_vessel_photos', []),
                documents: getLocal('andeco_fleet_documents', []),
                maintenance: getLocal('andeco_fleet_maintenance', []),
                drydock: getLocal('andeco_fleet_drydock', []),
                inventory: getLocal('andeco_fleet_inventory', []),
                logbooks: getLocal('andeco_fleet_logbooks', []),
                crew: getLocal('andeco_fleet_crew', [])
            },
            crew: {
                crewMembers: getLocal('andeco_crew_members', []),
                crewDocuments: getLocal('andeco_crew_documents', []),
                crewAssignments: getLocal('andeco_crew_assignments', [])
            }
        };

        const dataStr = JSON.stringify(data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `andeco-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        alert('Data exported successfully! (Accounting, Fleet, Crew)');
    },

    importData(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!confirm('⚠️ WARNING: Importing data will replace ALL existing data (invoices, receipts, clients, settings).\n\nAre you sure you want to continue? Make sure you have exported a backup first!')) {
            event.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                
                if (!importedData.invoices || !importedData.receipts || !importedData.clients || !importedData.companySettings) {
                    alert('Error: Invalid backup file format. The file does not contain all required data.');
                    event.target.value = '';
                    return;
                }

                DataStore.saveInvoices(importedData.invoices || []);
                DataStore.saveReceipts(importedData.receipts || []);
                DataStore.saveClients(importedData.clients || []);
                DataStore.saveCompanySettings(importedData.companySettings || {});
                if (DataStore.saveProducts && importedData.products) DataStore.saveProducts(importedData.products);

                function setLocal(key, val) {
                    try {
                        if (val === undefined) return;
                        localStorage.setItem(key, JSON.stringify(val));
                    } catch (err) {}
                }
                if (importedData.fleet && typeof importedData.fleet === 'object') {
                    if (Array.isArray(importedData.fleet.vessels)) setLocal('andeco_fleet_vessels', importedData.fleet.vessels);
                    if (Array.isArray(importedData.fleet.vesselPhotos)) setLocal('andeco_fleet_vessel_photos', importedData.fleet.vesselPhotos);
                    if (Array.isArray(importedData.fleet.documents)) setLocal('andeco_fleet_documents', importedData.fleet.documents);
                    if (Array.isArray(importedData.fleet.maintenance)) setLocal('andeco_fleet_maintenance', importedData.fleet.maintenance);
                    if (Array.isArray(importedData.fleet.drydock)) setLocal('andeco_fleet_drydock', importedData.fleet.drydock);
                    if (Array.isArray(importedData.fleet.inventory)) setLocal('andeco_fleet_inventory', importedData.fleet.inventory);
                    if (Array.isArray(importedData.fleet.logbooks)) setLocal('andeco_fleet_logbooks', importedData.fleet.logbooks);
                    if (Array.isArray(importedData.fleet.crew)) setLocal('andeco_fleet_crew', importedData.fleet.crew);
                }
                if (importedData.crew && typeof importedData.crew === 'object') {
                    if (Array.isArray(importedData.crew.crewMembers)) setLocal('andeco_crew_members', importedData.crew.crewMembers);
                    if (Array.isArray(importedData.crew.crewDocuments)) setLocal('andeco_crew_documents', importedData.crew.crewDocuments);
                    if (Array.isArray(importedData.crew.crewAssignments)) setLocal('andeco_crew_assignments', importedData.crew.crewAssignments);
                }

                alert('Data imported successfully! The page will reload to apply changes.');
                event.target.value = '';
                window.location.reload();
            } catch (error) {
                alert('Error importing data: ' + error.message + '\n\nPlease make sure the file is a valid JSON backup file.');
                event.target.value = '';
            }
        };
        reader.onerror = () => {
            alert('Error reading file. Please try again.');
            event.target.value = '';
        };
        reader.readAsText(file);
    },

    // Customer Statement (only when statement form exists in DOM, e.g. in Settings module)
    setupStatementForm() {
        const fromEl = document.getElementById('statement-from-date');
        const toEl = document.getElementById('statement-to-date');
        if (!fromEl || !toEl) return;
        this.populateStatementClientDropdown();
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);
        fromEl.value = thirtyDaysAgo.toISOString().split('T')[0];
        toEl.value = today.toISOString().split('T')[0];
        const contentEl = document.getElementById('statement-content');
        const printBtn = document.getElementById('print-statement-btn');
        if (contentEl) contentEl.style.display = 'none';
        if (printBtn) printBtn.style.display = 'none';
    },

    populateStatementClientDropdown() {
        const clients = DataStore.getClients();
        const select = document.getElementById('statement-client-select');
        
        if (!select) return;
        
        const selectedId = select.value;
        select.innerHTML = '<option value="">-- Select a customer --</option>';
        
        if (!Array.isArray(clients)) return;

        clients.slice().sort((a, b) => {
            const an = (DataStore.getClientCompanyName ? DataStore.getClientCompanyName(a) : (a && a.name) || '').toString();
            const bn = (DataStore.getClientCompanyName ? DataStore.getClientCompanyName(b) : (b && b.name) || '').toString();
            return an.localeCompare(bn);
        }).forEach(client => {
            if (!client || client.id == null || client.id === '') return;
            const option = document.createElement('option');
            option.value = client.id;
            option.textContent = DataStore.getClientOptionLabel ? DataStore.getClientOptionLabel(client) : client.name;
            select.appendChild(option);
        });

        if (selectedId && Array.from(select.options).some(function (o) { return o.value === selectedId; })) {
            select.value = selectedId;
        }
    },

    generateStatement() {
        const clientId = document.getElementById('statement-client-select').value;
        const fromDate = document.getElementById('statement-from-date').value;
        const toDate = document.getElementById('statement-to-date').value;
        
        if (!clientId) {
            alert('Please select a customer.');
            return;
        }
        
        if (!fromDate || !toDate) {
            alert('Please select both from and to dates.');
            return;
        }
        
        if (new Date(fromDate) > new Date(toDate)) {
            alert('From date must be before or equal to To date.');
            return;
        }
        
        const client = DataStore.getClient(clientId);
        if (!client) {
            alert('Customer not found.');
            return;
        }
        
        // Get all invoices for this client
        const allInvoices = DataStore.getInvoices();
        const clientInvoices = allInvoices.filter(inv => 
            inv.clientName === client.name || 
            (client.email && inv.clientEmail === client.email)
        );
        
        // Filter invoices by date range
        const from = new Date(fromDate);
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999); // Include the entire end date
        
        const invoicesInRange = clientInvoices.filter(inv => {
            const invDate = new Date(inv.date);
            return invDate >= from && invDate <= to;
        });
        
        // Get all receipts for this client
        const allReceipts = DataStore.getReceipts();
        const clientReceipts = allReceipts.filter(receipt => 
            receipt.clientId === clientId
        );
        
        // Filter receipts by date range
        const receiptsInRange = clientReceipts.filter(receipt => {
            const receiptDate = new Date(receipt.date);
            return receiptDate >= from && receiptDate <= to;
        });
        
        // Get all invoices (including those outside date range) for balance calculation
        const allClientInvoices = clientInvoices;
        
        // Calculate opening balance (unpaid invoices before from date)
        const openingInvoices = allClientInvoices.filter(inv => {
            const invDate = new Date(inv.date);
            return invDate < from;
        });
        
        // Get all receipts (including those outside date range) for payment tracking
        const allClientReceipts = allReceipts.filter(receipt => receipt.clientId === clientId);
        
        const openingBalance = openingInvoices.reduce((sum, inv) => {
            // Check if invoice is paid (either by status or by receipt)
            const isPaid = inv.status === 'paid' || 
                          allClientReceipts.some(r => r.invoiceIds.includes(inv.id));
            return isPaid ? sum : sum + (parseFloat(inv.total) || 0);
        }, 0);
        
        // Calculate transactions in period
        let totalInvoiced = 0;
        let totalPaid = 0;
        
        invoicesInRange.forEach(inv => {
            totalInvoiced += parseFloat(inv.total) || 0;
        });
        
        receiptsInRange.forEach(receipt => {
            totalPaid += parseFloat(receipt.amount) || 0;
        });
        
        // Calculate closing balance
        const closingBalance = openingBalance + totalInvoiced - totalPaid;
        
        // Calculate ageing
        const today = new Date();
        const ageing = {
            current: 0,      // 0-30 days
            days31_60: 0,    // 31-60 days
            days61_90: 0,    // 61-90 days
            over90: 0        // Over 90 days
        };
        
        allClientInvoices.forEach(inv => {
            if (inv.status !== 'paid') {
                const invDate = new Date(inv.dueDate || inv.date);
                const daysDiff = Math.floor((today - invDate) / (1000 * 60 * 60 * 24));
                const amount = parseFloat(inv.total) || 0;
                
                if (daysDiff <= 30) {
                    ageing.current += amount;
                } else if (daysDiff <= 60) {
                    ageing.days31_60 += amount;
                } else if (daysDiff <= 90) {
                    ageing.days61_90 += amount;
                } else {
                    ageing.over90 += amount;
                }
            }
        });
        
        // Combine invoices and receipts into a single array with type indicator
        const transactions = [];
        
        invoicesInRange.forEach(inv => {
            transactions.push({
                type: 'invoice',
                date: inv.date,
                reference: inv.invoiceNumber,
                description: `Invoice ${inv.invoiceNumber}`,
                amount: parseFloat(inv.total) || 0,
                payment: 0,
                dueDate: inv.dueDate,
                status: inv.status
            });
        });
        
        receiptsInRange.forEach(receipt => {
            transactions.push({
                type: 'receipt',
                date: receipt.date,
                reference: receipt.receiptNumber,
                description: `Receipt ${receipt.receiptNumber}`,
                amount: 0,
                payment: parseFloat(receipt.amount) || 0,
                paymentMethod: receipt.paymentMethod
            });
        });
        
        // Sort by date
        transactions.sort((a, b) => {
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            if (dateA.getTime() === dateB.getTime()) {
                // If same date, put receipts after invoices
                return a.type === 'receipt' ? 1 : -1;
            }
            return dateA - dateB;
        });
        
        // Calculate running balance for each transaction
        let runningBalance = openingBalance;
        transactions.forEach(trans => {
            runningBalance = runningBalance + trans.amount - trans.payment;
            trans.balance = runningBalance;
        });
        
        // Store statement data for printing
        this.currentStatementData = {
            client: client,
            fromDate: fromDate,
            toDate: toDate,
            openingBalance: openingBalance,
            totalInvoiced: totalInvoiced,
            totalPaid: totalPaid,
            closingBalance: closingBalance,
            transactions: transactions,
            ageing: ageing,
            allInvoices: allClientInvoices
        };
        
        this.renderStatement();
    },

    renderStatement() {
        if (!this.currentStatementData) return;
        
        const data = this.currentStatementData;
        const settings = DataStore.getCompanySettings();
        const container = document.getElementById('statement-content');
        
        // Format dates as dd/mm/yyyy
        const formatDateDDMMYYYY = (dateString) => {
            const date = new Date(dateString);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}/${month}/${year}`;
        };
        
        const fromDateFormatted = formatDateDDMMYYYY(data.fromDate);
        const toDateFormatted = formatDateDDMMYYYY(data.toDate);
        
        container.innerHTML = `
            <div class="statement-preview">
                <div class="invoice-header-print">
                    <div class="company-logo-wrap">${settings.logo ? `<img src="${settings.logo}" alt="Logo" class="company-logo-print">` : ''}</div>
                    <div class="company-info-print">
                        <h1 class="company-name-print">${settings.companyName || 'Your Company'}</h1>
                        ${settings.companyAddress ? `<p class="company-contact-info">${settings.companyAddress.replace(/\n/g, ', ')}</p>` : ''}
                        ${settings.companyPhone ? `<p class="company-contact-info"><strong>Telephone:</strong> ${settings.companyPhone}</p>` : ''}
                        ${settings.companyEmail ? `<p class="company-contact-info"><strong>E-mail:</strong> ${settings.companyEmail}</p>` : ''}
                    </div>
                    <div class="invoice-title-section">
                        <h2 class="invoice-title">Customer Statement</h2>
                        <table class="invoice-details-table">
                            <tr>
                                <td class="label-cell">Statement Period:</td>
                                <td class="value-cell">${fromDateFormatted} to ${toDateFormatted}</td>
                            </tr>
                            <tr>
                                <td class="label-cell">Statement Date:</td>
                                <td class="value-cell">${formatDateDDMMYYYY(new Date().toISOString().split('T')[0])}</td>
                            </tr>
                        </table>
                    </div>
                </div>

                <div class="bill-to-section-print">
                    <h3 class="section-title">Customer Information</h3>
                    <div class="bill-to-content">
                        <p class="client-name">${DataStore.getClientCompanyName ? DataStore.getClientCompanyName(data.client) : data.client.name}</p>
                        ${(DataStore.getClientContactPerson ? DataStore.getClientContactPerson(data.client) : data.client.contactPerson) ? `<p class="client-address"><strong>Contact:</strong> ${DataStore.getClientContactPerson ? DataStore.getClientContactPerson(data.client) : data.client.contactPerson}</p>` : ''}
                        ${data.client.address ? `<p class="client-address">${data.client.address.replace(/\n/g, '<br>')}</p>` : ''}
                        ${data.client.email ? `<p class="client-address"><strong>Email:</strong> ${data.client.email}</p>` : ''}
                        ${data.client.phone ? `<p class="client-address"><strong>Phone:</strong> ${data.client.phone}</p>` : ''}
                    </div>
                </div>

                <div style="margin-bottom: 20px;">
                    <h3 class="section-title">Transaction History (${fromDateFormatted} to ${toDateFormatted})</h3>
                    <table class="invoice-items-table-print">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Reference</th>
                                <th>Description</th>
                                <th class="text-right">Amount</th>
                                <th class="text-right">Payment</th>
                                <th class="text-right">Balance</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.transactions.length > 0 ? `
                                <tr style="background-color: #f5f5f5; font-weight: 600;">
                                    <td colspan="3" style="text-align: right; padding: 0.5rem;">Opening Balance:</td>
                                    <td colspan="2"></td>
                                    <td class="text-right" style="padding: 0.5rem;">${this.formatCurrency(data.openingBalance)}</td>
                                </tr>
                                ${data.transactions.map(trans => {
                                    const transDate = new Date(trans.date);
                                    return `
                                        <tr>
                                            <td>${transDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                                            <td>${trans.reference}</td>
                                            <td>${trans.description}${trans.type === 'invoice' && trans.dueDate ? ` (Due: ${new Date(trans.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })})` : ''}${trans.type === 'receipt' && trans.paymentMethod ? ` - ${trans.paymentMethod}` : ''}</td>
                                            <td class="text-right">${trans.amount > 0 ? this.formatCurrency(trans.amount) : '-'}</td>
                                            <td class="text-right">${trans.payment > 0 ? this.formatCurrency(trans.payment) : '-'}</td>
                                            <td class="text-right" style="font-weight: 600;">${this.formatCurrency(trans.balance)}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            ` : '<tr><td colspan="6" style="text-align: center; padding: 1rem;">No transactions in this period</td></tr>'}
                        </tbody>
                    </table>
                </div>

                <div style="margin-bottom: 20px;">
                    <h3 class="section-title">Account Summary</h3>
                    <table class="summary-table" style="width: 100%; margin-bottom: 20px;">
                        <tr>
                            <td class="summary-label">Opening Balance:</td>
                            <td class="summary-value">${this.formatCurrency(data.openingBalance)}</td>
                        </tr>
                        <tr>
                            <td class="summary-label">Total Invoiced (Period):</td>
                            <td class="summary-value">${this.formatCurrency(data.totalInvoiced)}</td>
                        </tr>
                        <tr>
                            <td class="summary-label">Total Paid (Period):</td>
                            <td class="summary-value">${this.formatCurrency(data.totalPaid)}</td>
                        </tr>
                        <tr style="border-top: 2px solid #000;">
                            <td class="summary-label"><strong>Closing Balance:</strong></td>
                            <td class="summary-value summary-total"><strong>${this.formatCurrency(data.closingBalance)}</strong></td>
                        </tr>
                    </table>
                </div>

                <div style="margin-bottom: 20px;">
                    <h3 class="section-title">Ageing Analysis</h3>
                    <table class="invoice-items-table-print" style="width: 100%; margin-bottom: 20px;">
                        <thead>
                            <tr>
                                <th class="text-center">Current<br>(0-30 days)</th>
                                <th class="text-center">31-60 days</th>
                                <th class="text-center">61-90 days</th>
                                <th class="text-center">Over 90 days</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td class="text-center" style="font-weight: 600;">${this.formatCurrency(data.ageing.current)}</td>
                                <td class="text-center" style="font-weight: 600;">${this.formatCurrency(data.ageing.days31_60)}</td>
                                <td class="text-center" style="font-weight: 600;">${this.formatCurrency(data.ageing.days61_90)}</td>
                                <td class="text-center" style="font-weight: 600;">${this.formatCurrency(data.ageing.over90)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="thank-you-message">
                    <p>This is a computer-generated statement. Please contact us if you have any questions.</p>
                </div>
            </div>
        `;
        
        container.style.display = 'block';
        document.getElementById('print-statement-btn').style.display = 'inline-block';
    },

    printStatement() {
        if (!this.currentStatementData) {
            alert('Please generate a statement first.');
            return;
        }
        
        const data = this.currentStatementData;
        const settings = DataStore.getCompanySettings();
        
        // Format dates as dd/mm/yyyy
        const formatDateDDMMYYYY = (dateString) => {
            const date = new Date(dateString);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}/${month}/${year}`;
        };
        
        const fromDateFormatted = formatDateDDMMYYYY(data.fromDate);
        const toDateFormatted = formatDateDDMMYYYY(data.toDate);
        
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Customer Statement - ${data.client.name}</title>
                <style>
                    @page {
                        size: A4;
                        margin: 1.5cm;
                    }
                    
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }
                    
                    body {
                        font-family: Arial, Helvetica, sans-serif;
                        font-size: 11pt;
                        line-height: 1.4;
                        color: #000;
                        background: white;
                    }
                    
                    .invoice-container {
                        max-width: 210mm;
                        margin: 0 auto;
                        padding: 0;
                    }
                    
                    .invoice-header-print {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-start;
                        margin-bottom: 25px;
                        padding-bottom: 15px;
                        border-bottom: 2px solid #000;
                    }
                    
                    .company-logo-wrap {
                        flex: 0 0 auto;
                        margin-right: 1rem;
                    }
                    
                    .company-info-print {
                        flex: 1;
                    }
                    
                    .company-logo-print {
                        max-width: 120px;
                        max-height: 80px;
                        object-fit: contain;
                    }
                    
                    .company-name-print {
                        font-size: 18pt;
                        font-weight: bold;
                        margin: 5px 0 10px 0;
                        color: #000;
                    }
                    
                    .company-contact-info {
                        font-size: 8pt;
                        margin: 2px 0;
                        color: #333;
                        line-height: 1.3;
                    }
                    
                    .invoice-title-section {
                        text-align: right;
                        min-width: 200px;
                    }
                    
                    .invoice-title {
                        font-size: 18pt;
                        font-weight: bold;
                        margin: 0 0 8px 0;
                        color: #000;
                        text-transform: uppercase;
                    }
                    
                    .invoice-details-table {
                        border-collapse: collapse;
                        margin-top: 3px;
                        width: 100%;
                        font-size: 9pt;
                    }
                    
                    .invoice-details-table tr {
                        border-bottom: 1px solid #e0e0e0;
                    }
                    
                    .invoice-details-table .label-cell {
                        padding: 2px 8px 2px 0;
                        text-align: right;
                        font-weight: 600;
                        color: #333;
                        white-space: nowrap;
                        width: 50%;
                        font-size: 9pt;
                    }
                    
                    .invoice-details-table .value-cell {
                        padding: 2px 0;
                        text-align: left;
                        color: #000;
                        width: 50%;
                        font-size: 9pt;
                    }
                    
                    .bill-to-section-print {
                        margin-bottom: 12px;
                    }
                    
                    .section-title {
                        font-size: 9pt;
                        font-weight: 600;
                        margin-bottom: 8px;
                        color: #333;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    
                    .client-name {
                        font-size: 11pt;
                        margin: 3px 0;
                        color: #000;
                        font-weight: bold;
                    }
                    
                    .client-address {
                        font-size: 9pt;
                        margin: 3px 0;
                        color: #333;
                        line-height: 1.5;
                    }
                    
                    .invoice-items-table-print {
                        width: 100%;
                        border-collapse: collapse;
                        margin-bottom: 10px;
                        border: 1px solid #ddd;
                        font-size: 7.5pt;
                        line-height: 1.15;
                    }
                    
                    .invoice-items-table-print thead {
                        background-color: #f5f5f5;
                    }
                    
                    .invoice-items-table-print th {
                        padding: 3px 5px;
                        text-align: left;
                        font-weight: 600;
                        font-size: 7pt;
                        color: #333;
                        text-transform: uppercase;
                        letter-spacing: 0.3px;
                        border-bottom: 1px solid #ddd;
                    }
                    
                    .invoice-items-table-print th.text-right {
                        text-align: right;
                    }
                    
                    .invoice-items-table-print td {
                        padding: 3px 5px;
                        border-bottom: 1px solid #e0e0e0;
                        font-size: 7.5pt;
                        line-height: 1.15;
                    }
                    
                    .text-right {
                        text-align: right;
                    }
                    
                    .summary-table {
                        border-collapse: collapse;
                        width: 100%;
                        margin-bottom: 20px;
                    }
                    
                    .summary-table tr {
                        border-bottom: 1px solid #e0e0e0;
                    }
                    
                    .summary-label {
                        padding: 4px 15px 4px 0;
                        text-align: right;
                        font-weight: 600;
                        color: #333;
                        width: 50%;
                        font-size: 8pt;
                    }
                    
                    .summary-value {
                        padding: 4px 0;
                        text-align: right;
                        color: #000;
                        width: 50%;
                        font-size: 8pt;
                    }
                    
                    .summary-total {
                        font-size: 9pt;
                        font-weight: bold;
                        padding-top: 6px;
                    }
                    
                    .thank-you-message {
                        margin: 20px 0;
                        text-align: center;
                        font-size: 11pt;
                        color: #333;
                        font-style: italic;
                    }
                </style>
            </head>
            <body>
                <div class="invoice-container">
                    <div class="invoice-header-print">
                        <div class="company-logo-wrap">${settings.logo ? `<img src="${settings.logo}" alt="Logo" class="company-logo-print">` : ''}</div>
                        <div class="company-info-print">
                            <h1 class="company-name-print">${settings.companyName || 'Your Company'}</h1>
                            ${settings.companyAddress ? `<p class="company-contact-info">${settings.companyAddress.replace(/\n/g, ', ')}</p>` : ''}
                            ${settings.companyPhone ? `<p class="company-contact-info"><strong>Telephone:</strong> ${settings.companyPhone}</p>` : ''}
                            ${settings.companyEmail ? `<p class="company-contact-info"><strong>E-mail:</strong> ${settings.companyEmail}</p>` : ''}
                        </div>
                        <div class="invoice-title-section">
                            <h2 class="invoice-title">Customer Statement</h2>
                            <table class="invoice-details-table">
                                <tr>
                                    <td class="label-cell">Statement Period:</td>
                                    <td class="value-cell">${fromDateFormatted} to ${toDateFormatted}</td>
                                </tr>
                                <tr>
                                    <td class="label-cell">Statement Date:</td>
                                    <td class="value-cell">${formatDateDDMMYYYY(new Date().toISOString().split('T')[0])}</td>
                                </tr>
                            </table>
                        </div>
                    </div>

                    <div class="bill-to-section-print">
                        <h3 class="section-title">Customer Information</h3>
                        <div class="bill-to-content">
                            <p class="client-name">${DataStore.getClientCompanyName ? DataStore.getClientCompanyName(data.client) : data.client.name}</p>
                            ${(DataStore.getClientContactPerson ? DataStore.getClientContactPerson(data.client) : data.client.contactPerson) ? `<p class="client-address"><strong>Contact:</strong> ${DataStore.getClientContactPerson ? DataStore.getClientContactPerson(data.client) : data.client.contactPerson}</p>` : ''}
                            ${data.client.address ? `<p class="client-address">${data.client.address.replace(/\n/g, '<br>')}</p>` : ''}
                            ${data.client.email ? `<p class="client-address"><strong>Email:</strong> ${data.client.email}</p>` : ''}
                            ${data.client.phone ? `<p class="client-address"><strong>Phone:</strong> ${data.client.phone}</p>` : ''}
                        </div>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <h3 class="section-title">Transaction History (${fromDateFormatted} to ${toDateFormatted})</h3>
                        <table class="invoice-items-table-print">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Reference</th>
                                    <th>Description</th>
                                    <th class="text-right">Amount</th>
                                    <th class="text-right">Payment</th>
                                    <th class="text-right">Balance</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${data.transactions.length > 0 ? `
                                    <tr style="background-color: #f5f5f5; font-weight: 600;">
                                        <td colspan="3" style="text-align: right; padding: 0.5rem;">Opening Balance:</td>
                                        <td colspan="2"></td>
                                        <td class="text-right" style="padding: 0.5rem;">${this.formatCurrency(data.openingBalance)}</td>
                                    </tr>
                                    ${data.transactions.map(trans => {
                                        const transDate = new Date(trans.date);
                                        return `
                                            <tr>
                                                <td>${transDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                                                <td>${trans.reference}</td>
                                                <td>${trans.description}${trans.type === 'invoice' && trans.dueDate ? ` (Due: ${new Date(trans.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })})` : ''}${trans.type === 'receipt' && trans.paymentMethod ? ` - ${trans.paymentMethod}` : ''}</td>
                                                <td class="text-right">${trans.amount > 0 ? this.formatCurrency(trans.amount) : '-'}</td>
                                                <td class="text-right">${trans.payment > 0 ? this.formatCurrency(trans.payment) : '-'}</td>
                                                <td class="text-right" style="font-weight: 600;">${this.formatCurrency(trans.balance)}</td>
                                            </tr>
                                        `;
                                    }).join('')}
                                ` : '<tr><td colspan="6" style="text-align: center; padding: 1rem;">No transactions in this period</td></tr>'}
                            </tbody>
                        </table>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <h3 class="section-title">Account Summary</h3>
                        <table class="summary-table">
                            <tr>
                                <td class="summary-label">Opening Balance:</td>
                                <td class="summary-value">${this.formatCurrency(data.openingBalance)}</td>
                            </tr>
                            <tr>
                                <td class="summary-label">Total Invoiced (Period):</td>
                                <td class="summary-value">${this.formatCurrency(data.totalInvoiced)}</td>
                            </tr>
                            <tr>
                                <td class="summary-label">Total Paid (Period):</td>
                                <td class="summary-value">${this.formatCurrency(data.totalPaid)}</td>
                            </tr>
                            <tr style="border-top: 2px solid #000;">
                                <td class="summary-label"><strong>Closing Balance:</strong></td>
                                <td class="summary-value summary-total"><strong>${this.formatCurrency(data.closingBalance)}</strong></td>
                            </tr>
                        </table>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <h3 class="section-title">Ageing Analysis</h3>
                        <table class="invoice-items-table-print" style="width: 100%; margin-bottom: 20px;">
                            <thead>
                                <tr>
                                    <th class="text-center">Current<br>(0-30 days)</th>
                                    <th class="text-center">31-60 days</th>
                                    <th class="text-center">61-90 days</th>
                                    <th class="text-center">Over 90 days</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td class="text-center" style="font-weight: 600;">${this.formatCurrency(data.ageing.current)}</td>
                                    <td class="text-center" style="font-weight: 600;">${this.formatCurrency(data.ageing.days31_60)}</td>
                                    <td class="text-center" style="font-weight: 600;">${this.formatCurrency(data.ageing.days61_90)}</td>
                                    <td class="text-center" style="font-weight: 600;">${this.formatCurrency(data.ageing.over90)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div class="thank-you-message">
                        <p>This is a computer-generated statement. Please contact us if you have any questions.</p>
                    </div>
                </div>
                <script>
                    window.onload = function() {
                        window.print();
                    };
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    },
};

// Expose globally for inline handlers (e.g. when embedded in Andeco Horizon CRM)
if (typeof window !== 'undefined') window.app = app;

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});

