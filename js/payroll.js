// Cyprus Payroll Management System
// Tax rates and calculations — income tax: ≤2025 brackets in CYPRUS_TAX_RATES; 2026+ slices in buildIncomeTaxBandsCyprus2026

// Cyprus tax rates (SI/NHS/employer % — review yearly). Income tax bands are year-specific below.
const CYPRUS_TAX_RATES = {
    /** Income tax brackets (annual taxable income) — through tax year 2025 */
    incomeTaxBracketsThrough2025: [
        { min: 0, max: 19500, rate: 0 },
        { min: 19500, max: 28000, rate: 0.20 },
        { min: 28000, max: 36300, rate: 0.25 },
        { min: 36300, max: 60000, rate: 0.30 },
        { min: 60000, max: Infinity, rate: 0.35 }
    ],
    // Social Insurance Rates
    socialInsurance: {
        employee: 0.088, // 8.8% for employee
        employer: 0.088, // 8.8% for employer
        maxContribution: 1800 // Maximum monthly contribution
    },
    // NHS Rates
    nhs: {
        employee: 0.0265, // 2.65% for employee
        employer: 0.029 // 2.90% for employer
    },
    // Holiday Fund Rate
    holidayFund: 0.08, // 8% of gross salary
    // Employer Additional Contributions
    employerContributions: {
        socialCohesion: 0.02, // 2.0% Social Cohesion Fund
        redundancy: 0.012, // 1.2% Redundancy Fund
        industrialTraining: 0.005 // 0.5% Industrial Training Fund
    }
};

/** Annual taxable for income-tax brackets = monthly net (gross − SI − NHS) × this. */
const INCOME_TAX_BRACKET_ANNUAL_MULTIPLIER = 11;
/** Monthly income tax on payslip = annual income tax ÷ this. */
const INCOME_TAX_MONTHLY_DIVISOR = 12;

// Global variables
let employees = JSON.parse(localStorage.getItem('employees')) || [];
let payrollData = JSON.parse(localStorage.getItem('payrollData')) || {};
let companySettings = JSON.parse(localStorage.getItem('companySettings')) || {};
let editingPayslip = null; // Track if we're editing an existing payslip

function formatMoney(amount) {
    if (typeof window.AccountingData !== 'undefined' && typeof window.AccountingData.formatCurrency === 'function') {
        return window.AccountingData.formatCurrency(amount);
    }
    if (typeof window.DataStore !== 'undefined' && typeof window.DataStore.formatCurrency === 'function') {
        return window.DataStore.formatCurrency(amount);
    }
    var n = Number(amount);
    if (!isFinite(n)) n = 0;
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    loadEmployees();
    var empTable = document.getElementById('employeesTableBody');
    if (empTable) {
        empTable.addEventListener('click', function(e) {
            var editBtn = e.target.closest('.emp-edit-btn');
            var delBtn = e.target.closest('.emp-del-btn');
            if (editBtn) editEmployee(editBtn.getAttribute('data-id'));
            if (delBtn) deleteEmployee(delBtn.getAttribute('data-id'));
        });
    }
    loadCompanySettings();
    updateEmployeeDropdowns();
    updateYTDDisplay();
    var siYear = document.getElementById('siYtdYear');
    if (siYear) siYear.value = String(new Date().getFullYear());
    var siMonth = document.getElementById('siMonthlyPeriod');
    if (siMonth) {
        var now = new Date();
        siMonth.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    }
    setCurrentMonth();
    updatePayslipCompanyInfo();
    setDefaultPayDate();
    updatePayslipFilters();
    loadPayslips();
    
    // Clean up old sequence data
    cleanupOldSequenceData();
    
    if (window.PAYROLL_EMBEDDED) {
        try { openTab(null, 'payslip'); } catch (e) {}
    }
    
    // Add event listeners for pay date; clear payroll # override when period/employee changes (not while editing)
    function onPayslipMonthYearChange() {
        setDefaultPayDate();
        clearPayrollNumberOverrideIfNotEditing();
    }
    document.getElementById('payslipMonth').addEventListener('change', onPayslipMonthYearChange);
    document.getElementById('payslipYear').addEventListener('change', onPayslipMonthYearChange);
    const payslipEmployeeEl = document.getElementById('payslipEmployee');
    if (payslipEmployeeEl) {
        payslipEmployeeEl.addEventListener('change', clearPayrollNumberOverrideIfNotEditing);
    }
    
    // Add event listeners for payslip filters
    document.getElementById('payslipFilterEmployee').addEventListener('change', loadPayslips);
    document.getElementById('payslipFilterYear').addEventListener('change', loadPayslips);
    document.getElementById('payslipFilterMonth').addEventListener('change', loadPayslips);
});

function cleanupOldSequenceData() {
    // Remove old payrollSequences data from localStorage
    localStorage.removeItem('payrollSequences');
}

/** Month segment 01–12 for payroll numbers */
function payrollMonthSegment(month) {
    const m = typeof month === 'string' ? parseInt(month, 10) : Number(month);
    if (Number.isNaN(m) || m < 1 || m > 12) return '00';
    return m.toString().padStart(2, '0');
}

/** Payroll #: SLR/Year/Month/Sequence (sequence resets each month) */
function formatPayrollNumber(year, month, sequence) {
    const y = typeof year === 'string' ? parseInt(year, 10) : year;
    return `SLR/${y}/${payrollMonthSegment(month)}/${Number(sequence).toString().padStart(3, '0')}`;
}

/** If the Payroll # field has text, use it when saving; otherwise use the auto-generated value */
function resolvePayrollNumberForSave(autoPayrollNumber) {
    const inputEl = document.getElementById('payslipPayrollNumberInput');
    if (inputEl) {
        const raw = inputEl.value.trim();
        if (raw.length > 0) return raw;
    }
    return autoPayrollNumber;
}

function syncPayrollNumberInput(value) {
    const inputEl = document.getElementById('payslipPayrollNumberInput');
    if (inputEl) inputEl.value = value != null ? String(value) : '';
}

function clearPayrollNumberOverrideIfNotEditing() {
    if (editingPayslip) return;
    syncPayrollNumberInput('');
}

/** Last numeric segment of payroll # (…/004 → 4); used when renumbering without savedAt */
function payrollSequenceSortKey(payrollNumber) {
    if (!payrollNumber || typeof payrollNumber !== 'string') return 999999;
    const m = payrollNumber.match(/\/(\d{1,3})$/);
    return m ? parseInt(m[1], 10) : 999999;
}

/**
 * Highest sequence in payrollData for the same calendar month (by stored year/month).
 * Supports SLR/YYYY/MM/### and legacy SLR/YYYY/### for that month.
 */
function getMaxPayrollSequenceForMonth(year, month) {
    const y = typeof year === 'string' ? parseInt(year, 10) : year;
    const mo = typeof month === 'string' ? parseInt(month, 10) : Number(month);
    const mm = payrollMonthSegment(mo);
    let maxSeq = 0;
    Object.values(payrollData).forEach(p => {
        const py = typeof p.year === 'string' ? parseInt(p.year, 10) : p.year;
        const pm = typeof p.month === 'string' ? parseInt(p.month, 10) : p.month;
        if (py !== y || pm !== mo) return;
        const pn = p.payrollNumber;
        if (!pn) return;
        let m = pn.match(new RegExp(`^SLR/${y}/${mm}/(\\d+)$`));
        if (m) {
            const s = parseInt(m[1], 10);
            if (s > maxSeq) maxSeq = s;
            return;
        }
        m = pn.match(new RegExp(`^SLR/${y}/(\\d+)$`));
        if (m) {
            const s = parseInt(m[1], 10);
            if (s > maxSeq) maxSeq = s;
        }
    });
    return maxSeq;
}

// Function to fix sequence numbers for all payslips
function fixAllPayrollSequences() {
    console.log('Fixing all payroll sequences...');
    
    // Pad short sequence segments (legacy SLR/Year/Seq or SLR/Year/Month/Seq)
    Object.keys(payrollData).forEach(key => {
        const payslip = payrollData[key];
        if (!payslip.payrollNumber) return;
        const p = payslip.payrollNumber.split('/');
        if (p[0] !== 'SLR') return;
        if (p.length === 3) {
            const seq = p[2];
            if (/^\d+$/.test(seq) && seq.length < 3) {
                const newPayrollNumber = `SLR/${p[1]}/${seq.padStart(3, '0')}`;
                console.log(`Converting ${payslip.payrollNumber} to ${newPayrollNumber}`);
                payrollData[key].payrollNumber = newPayrollNumber;
            }
        } else if (p.length === 4) {
            const seq = p[3];
            if (/^\d+$/.test(seq) && seq.length < 3) {
                const newPayrollNumber = `SLR/${p[1]}/${p[2]}/${seq.padStart(3, '0')}`;
                console.log(`Converting ${payslip.payrollNumber} to ${newPayrollNumber}`);
                payrollData[key].payrollNumber = newPayrollNumber;
            }
        }
    });
    
    // Get all years that have payslips
    const years = [...new Set(Object.values(payrollData).map(payslip => payslip.year))];
    console.log('Years with payslips:', years);
    
    years.forEach(year => {
        console.log(`Fixing sequences for year ${year}`);
        renumberPayrollSequences(year);
    });
    
    // Save the updated data
    savePayrollData();
    updateAllTabs();
    
    console.log('All payroll sequences fixed!');
    showMessage('All payroll sequences have been fixed!', 'success');
}

// Tab Navigation
function openTab(evt, tabName) {
    // When embedded in Andeco Horizon: tab content is in panels with data-payroll-sub; switch via app handler
    if (typeof window.setPayrollSubsection === 'function') {
        const tabEl = document.getElementById(tabName);
        if (!tabEl) {
            window.setPayrollSubsection(tabName);
            return;
        }
    }
    // Hide all tab contents
    const tabContents = document.getElementsByClassName('tab-content');
    for (let i = 0; i < tabContents.length; i++) {
        tabContents[i].classList.remove('active');
    }
    
    // Remove active class from all tab buttons
    const tabButtons = document.getElementsByClassName('tab-button');
    for (let i = 0; i < tabButtons.length; i++) {
        tabButtons[i].classList.remove('active');
    }
    
    // Show the selected tab content
    const tabEl = document.getElementById(tabName);
    if (!tabEl) return;
    tabEl.classList.add('active');
    
    // Mark button as active only if evt is provided (click event)
    if (evt && evt.currentTarget) {
        evt.currentTarget.classList.add('active');
    } else {
        // If called programmatically, find and activate the corresponding tab button
        const tabButton = document.querySelector(`[onclick*="${tabName}"]`);
        if (tabButton) {
            tabButton.classList.add('active');
        }
    }
}

// Employee Management Functions
function escapeEmployeeHtml(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
}

function loadEmployees() {
    const tableBody = document.getElementById('employeesTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    const metric = document.getElementById('hr-metric-employees');
    if (metric) metric.textContent = employees.length;
    
    employees.forEach(employee => {
        const row = document.createElement('tr');
        const eid = escapeEmployeeHtml(employee.employeeId);
        const ceasedStr = employee.ceasedDate
            ? new Date(employee.ceasedDate).toLocaleDateString('en-GB')
            : '';
        row.innerHTML = `
            <td>${eid}</td>
            <td>${escapeEmployeeHtml(employee.firstName)} ${escapeEmployeeHtml(employee.lastName)}</td>
            <td>${escapeEmployeeHtml(employee.email || 'Not Set')}</td>
            <td>${escapeEmployeeHtml(employee.phone || 'Not Set')}</td>
            <td>${escapeEmployeeHtml(employee.taxCode || 'Not Set')}</td>
            <td>${escapeEmployeeHtml(employee.socialInsurance || 'Not Set')}</td>
            <td>${escapeEmployeeHtml(employee.taxId || 'Not Set')}</td>
            <td>${employee.hireDate ? escapeEmployeeHtml(new Date(employee.hireDate).toLocaleDateString('en-GB')) : 'Not Set'}</td>
            <td>${ceasedStr ? escapeEmployeeHtml(ceasedStr) : '—'}</td>
            <td>${escapeEmployeeHtml(employee.paymentMethod || 'Not Set')}</td>
            <td>
                <button type="button" class="btn btn-secondary btn-sm emp-edit-btn" data-id="${eid}">Edit</button>
                <button type="button" class="btn btn-danger btn-sm emp-del-btn" data-id="${eid}">Delete</button>
            </td>
        `;
        tableBody.appendChild(row);
    });
    if (typeof window.hrEmployeesRefreshOverview === 'function') window.hrEmployeesRefreshOverview();
}

function updateEmployeeDropdowns() {
    const dropdowns = ['payslipEmployee', 'ytdEmployee', 'ir63Employee', 'siYtdEmployee'];
    
    dropdowns.forEach(dropdownId => {
        const dropdown = document.getElementById(dropdownId);
        if (!dropdown) return;
        const currentValue = dropdown.value;
        dropdown.innerHTML = dropdownId === 'ytdEmployee' || dropdownId === 'ir63Employee' || dropdownId === 'siYtdEmployee'
            ? '<option value="">All Employees</option>' 
            : '<option value="">Select Employee</option>';
        
        employees.forEach(employee => {
            const option = document.createElement('option');
            option.value = employee.employeeId;
            option.textContent = `${employee.firstName} ${employee.lastName} (${employee.employeeId})`;
            dropdown.appendChild(option);
        });
        
        if (currentValue) {
            dropdown.value = currentValue;
        }
    });
}

// Employee Form Handling
var employeeFormEl = document.getElementById('employeeForm');
if (employeeFormEl) {
employeeFormEl.addEventListener('submit', function(e) {
    e.preventDefault();
    
    const formData = new FormData(this);
    const employee = {
        employeeId: formData.get('employeeId'),
        firstName: formData.get('firstName'),
        lastName: formData.get('lastName'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        hireDate: formData.get('hireDate'),
        ceasedDate: formData.get('ceasedDate'),
        taxCode: formData.get('taxCode'),
        socialInsurance: formData.get('socialInsurance'),
        residentialAddress: formData.get('residentialAddress'),
        taxId: formData.get('taxId'),
        officerStatus: formData.get('officerStatus'),
        paymentMethod: formData.get('paymentMethod'),
        bankName: formData.get('bankName'),
        bankIBAN: formData.get('bankIBAN')
    };
    
    // Check if employee already exists
    const existingIndex = employees.findIndex(emp => emp.employeeId === employee.employeeId);
    
    if (existingIndex >= 0) {
        employees[existingIndex] = { ...employees[existingIndex], ...employee };
        showMessage('Employee updated successfully!', 'success');
    } else {
        employees.push(employee);
        showMessage('Employee added successfully!', 'success');
    }
    
    saveEmployees();
    loadEmployees();
    updateAllTabs();
    clearForm();
});
}

function editEmployee(employeeId) {
    const employee = employees.find(emp => emp.employeeId === employeeId);
    if (employee) {
        document.getElementById('employeeId').value = employee.employeeId;
        document.getElementById('firstName').value = employee.firstName;
        document.getElementById('lastName').value = employee.lastName;
        document.getElementById('email').value = employee.email || '';
        document.getElementById('phone').value = employee.phone || '';
        document.getElementById('hireDate').value = employee.hireDate || '';
        document.getElementById('ceasedDate').value = employee.ceasedDate || '';
        document.getElementById('taxCode').value = employee.taxCode || '';
        document.getElementById('socialInsurance').value = employee.socialInsurance || '';
        document.getElementById('residentialAddress').value = employee.residentialAddress || '';
        document.getElementById('taxId').value = employee.taxId || '';
        document.getElementById('officerStatus').value = employee.officerStatus || '';
        document.getElementById('paymentMethod').value = employee.paymentMethod || '';
        document.getElementById('bankName').value = employee.bankName || '';
        document.getElementById('bankIBAN').value = employee.bankIBAN || '';
        
        const formAnchor = document.getElementById('payrollEmployeeFormAnchor');
        if (formAnchor) formAnchor.scrollIntoView({ behavior: 'smooth' });
    }
}

function deleteEmployee(employeeId) {
    if (confirm('Are you sure you want to delete this employee?')) {
        employees = employees.filter(emp => emp.employeeId !== employeeId);
        saveEmployees();
        loadEmployees();
        updateAllTabs();
        showMessage('Employee deleted successfully!', 'success');
    }
}

function clearForm() {
    var form = document.getElementById('employeeForm');
    if (form) form.reset();
}
window.clearForm = clearForm;
window.loadEmployees = loadEmployees;
window.editEmployee = editEmployee;
window.deleteEmployee = deleteEmployee;

/** Income tax bracket rows for tax years ≤2025 (`min` is cumulative floor of the slice). */
function getIncomeTaxBracketsForYear() {
    return CYPRUS_TAX_RATES.incomeTaxBracketsThrough2025;
}

/**
 * Human-readable bracket label (≤2025). `min` is cumulative floor; first euro at this rate is min+1.
 */
function formatIncomeTaxBandLabel(min, max, taxYear) {
    const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-CY');
    if (!isFinite(max) || max === Infinity) {
        return `Over €${fmt(min)}`;
    }
    const displayLow = min > 0 ? min + 1 : 0;
    return `€${fmt(displayLow)} – €${fmt(max)}`;
}

/**
 * Tax year 2026+: taxable slices €22,001–€32,000 etc. are 9,999 / 9,999 / 29,999 € when full (not 10,000 / 30,000).
 * Monthly column = annual band tax ÷ {@link INCOME_TAX_MONTHLY_DIVISOR}.
 */
function buildIncomeTaxBandsCyprus2026(annual) {
    const a = Math.max(0, Number(annual) || 0);
    const bands = [];
    let annualTaxBeforeCode = 0;
    const divM = INCOME_TAX_MONTHLY_DIVISOR;

    const pushBand = (label, rate, income) => {
        const taxAnnual = income * rate;
        annualTaxBeforeCode += taxAnnual;
        bands.push({
            bandLabel: label,
            rate,
            incomeInBandAnnual: income,
            taxAnnual,
            taxMonthly: taxAnnual / divM
        });
    };

    if (a > 0) {
        pushBand('€0 – €22,000', 0, Math.min(a, 22000));
    }
    if (a > 22000) {
        const inc = Math.max(0, Math.min(a, 31999) - 22000);
        if (inc > 0) pushBand('€22,001 – €32,000', 0.2, inc);
    }
    if (a > 31999) {
        const inc = Math.max(0, Math.min(a, 41998) - 31999);
        if (inc > 0) pushBand('€32,001 – €42,000', 0.25, inc);
    }
    if (a > 41998) {
        const inc = Math.max(0, Math.min(a, 71997) - 41998);
        if (inc > 0) pushBand('€42,001 – €72,000', 0.3, inc);
    }
    if (a > 71997) {
        const inc = Math.max(0, a - 71997);
        if (inc > 0) pushBand('€72,001 and above', 0.35, inc);
    }

    return { bands, annualTaxBeforeCode };
}

/**
 * Progressive income tax with per-band breakdown (annual amounts).
 * Monthly tax on payslip = annualTax ÷ INCOME_TAX_MONTHLY_DIVISOR (bracket annual uses × INCOME_TAX_BRACKET_ANNUAL_MULTIPLIER before this).
 */
function calculateIncomeTaxBreakdown(annualSalary, taxCode, taxYear) {
    const yRaw = typeof taxYear === 'string' ? parseInt(taxYear, 10) : Number(taxYear);
    const taxYearNum = Number.isNaN(yRaw) ? new Date().getFullYear() : yRaw;
    const annual = Math.max(0, Number(annualSalary) || 0);
    const divM = INCOME_TAX_MONTHLY_DIVISOR;
    let bands = [];
    let annualTaxBeforeCode = 0;

    if (taxYearNum >= 2026) {
        const built = buildIncomeTaxBandsCyprus2026(annual);
        bands = built.bands;
        annualTaxBeforeCode = built.annualTaxBeforeCode;
    } else {
        const brackets = getIncomeTaxBracketsForYear();
        for (const bracket of brackets) {
            if (annual > bracket.min) {
                const incomeInBandAnnual = Math.min(annual, bracket.max) - bracket.min;
                const taxAnnual = incomeInBandAnnual * bracket.rate;
                annualTaxBeforeCode += taxAnnual;
                bands.push({
                    bandLabel: formatIncomeTaxBandLabel(bracket.min, bracket.max, taxYearNum),
                    rate: bracket.rate,
                    incomeInBandAnnual,
                    taxAnnual,
                    taxMonthly: taxAnnual / divM
                });
            }
        }
    }

    let codeAdjustmentFactor = 1;
    let codeAdjustmentNote = null;
    if (taxCode === 'B') {
        codeAdjustmentFactor = 0.9;
        codeAdjustmentNote = 'Tax code B: 10% reduction on calculated tax';
    } else if (taxCode === 'C') {
        codeAdjustmentFactor = 0.85;
        codeAdjustmentNote = 'Tax code C: 15% reduction on calculated tax';
    }

    const annualTax = Math.max(0, annualTaxBeforeCode * codeAdjustmentFactor);
    const codeAdjustmentAnnual = annualTax - annualTaxBeforeCode;

    return {
        taxYear: taxYearNum,
        annualTaxableIncome: annual,
        bands,
        annualTaxBeforeCode,
        codeAdjustmentFactor,
        codeAdjustmentNote,
        codeAdjustmentAnnual,
        annualTax,
        monthlyTax: annualTax / INCOME_TAX_MONTHLY_DIVISOR,
        incomeTaxBracketAnnualMultiplier: INCOME_TAX_BRACKET_ANNUAL_MULTIPLIER,
        incomeTaxMonthlyDivisor: INCOME_TAX_MONTHLY_DIVISOR
    };
}

// Tax Calculation Functions
function calculateIncomeTax(annualSalary, taxCode, taxYear) {
    return calculateIncomeTaxBreakdown(annualSalary, taxCode, taxYear).annualTax;
}

/** Recomputed from saved payslip (gross basis, SI, NHS, year) and current employee tax code so rules stay current. */
function resolveIncomeTaxBreakdownForPayslip(payslip) {
    if (!payslip) return null;
    if (payslip.excludeIncomeTax || payslip.isHolidays || payslip.isPension) return null;
    const emp = employees.find((e) => e.employeeId === payslip.employeeId);
    const taxCode = emp ? emp.taxCode : '';
    let basis = payslip.siTaxableBasis != null ? Number(payslip.siTaxableBasis) : NaN;
    if (Number.isNaN(basis) || basis < 0) {
        basis = 0;
    }
    if (basis === 0) {
        basis = Number(payslip.grossSalary || 0) + Number(payslip.holidayFund || 0);
    }
    const si = Number(payslip.socialInsurance || 0);
    const nhs = Number(payslip.nhs || 0);
    const monthlyNet = Math.max(0, basis - si - nhs);
    const annual = monthlyNet * INCOME_TAX_BRACKET_ANNUAL_MULTIPLIER;
    const breakdown = calculateIncomeTaxBreakdown(annual, taxCode, payslip.year);
    return Object.assign({}, breakdown, {
        basisMonthlyGross: basis,
        basisMonthlySI: si,
        basisMonthlyNHS: nhs,
        basisMonthlyNet: monthlyNet
    });
}

function buildIncomeTaxBreakdownHtml(breakdown) {
    if (!breakdown || !breakdown.bands) return '';
    const bandsToShow = breakdown.bands.filter((b) => b.incomeInBandAnnual > 0.0005);
    if (bandsToShow.length === 0 && breakdown.annualTax <= 0) {
        return '<p class="payslip-tax-breakdown-muted">No income tax applies on this basis (zero annual taxable income).</p>';
    }
    const pct = (r) => `${(Number(r) * 100).toFixed(0)}%`;
    const rows = bandsToShow
        .map(
            (b) =>
                `<tr><td>${b.bandLabel}</td><td class="payslip-tax-breakdown-num">${pct(b.rate)}</td><td class="payslip-tax-breakdown-num">${formatMoney(b.incomeInBandAnnual)}</td><td class="payslip-tax-breakdown-num">${formatMoney(b.taxAnnual)}</td><td class="payslip-tax-breakdown-num">${formatMoney(b.taxMonthly)}</td></tr>`
        )
        .join('');
    let adj = '';
    if (breakdown.codeAdjustmentFactor !== 1 && breakdown.codeAdjustmentNote) {
        adj = `<tr class="payslip-tax-breakdown-adj"><td colspan="3">${breakdown.codeAdjustmentNote}</td><td class="payslip-tax-breakdown-num">${formatMoney(breakdown.codeAdjustmentAnnual)}</td><td class="payslip-tax-breakdown-num">${formatMoney((breakdown.codeAdjustmentAnnual / (breakdown.incomeTaxMonthlyDivisor || INCOME_TAX_MONTHLY_DIVISOR)))}</td></tr>`;
    }
    const totalRow = `<tr class="payslip-tax-breakdown-total"><td colspan="3"><strong>Total income tax</strong></td><td class="payslip-tax-breakdown-num"><strong>${formatMoney(breakdown.annualTax)}</strong></td><td class="payslip-tax-breakdown-num"><strong>${formatMoney(breakdown.monthlyTax)}</strong></td></tr>`;
    const multM = breakdown.incomeTaxBracketAnnualMultiplier || INCOME_TAX_BRACKET_ANNUAL_MULTIPLIER;
    const divM = breakdown.incomeTaxMonthlyDivisor || INCOME_TAX_MONTHLY_DIVISOR;
    const basisNote =
        breakdown.basisMonthlyGross != null &&
        breakdown.basisMonthlySI != null &&
        breakdown.basisMonthlyNHS != null &&
        breakdown.basisMonthlyNet != null
            ? `Annual amount taxed (for brackets): (<strong>${formatMoney(breakdown.basisMonthlyGross)}</strong> monthly gross − <strong>${formatMoney(breakdown.basisMonthlySI)}</strong> SI − <strong>${formatMoney(breakdown.basisMonthlyNHS)}</strong> NHS) × <strong>${multM}</strong> = <strong>${formatMoney(breakdown.annualTaxableIncome)}</strong>. Monthly income tax = annual tax ÷ <strong>${divM}</strong>.`
            : `Annual amount taxed: <strong>${formatMoney(breakdown.annualTaxableIncome)}</strong> (monthly income tax = annual ÷ ${divM}).`;
    return `
    <div class="payslip-tax-breakdown-title">Income tax calculation (tax year ${breakdown.taxYear})</div>
    <p class="payslip-tax-breakdown-note">${basisNote}</p>
    <table class="payslip-tax-breakdown-table">
      <thead><tr><th>Bracket</th><th>Rate</th><th>Taxable in bracket (annual)</th><th>Tax (annual)</th><th>Tax (this month)</th></tr></thead>
      <tbody>${rows}${adj}${totalRow}</tbody>
    </table>`;
}

function updateIncomeTaxBreakdownUI(breakdown, rootEl) {
    const root = rootEl || document;
    const row = root.querySelector('#payslipIncomeTaxBreakdownRow');
    const div = root.querySelector('#payslipIncomeTaxBreakdown');
    if (!row || !div) return;
    row.style.display = 'none';
    div.innerHTML = '';
}

/** Employee SI: 8.8% of taxable base (gross pay + holiday fund), capped at max monthly contribution. */
function calculateSocialInsuranceBreakdown(taxableAmount) {
    const rate = CYPRUS_TAX_RATES.socialInsurance.employee;
    const maxContribution = CYPRUS_TAX_RATES.socialInsurance.maxContribution;
    const base = Math.max(0, taxableAmount);
    const rawAmount = base * rate;
    const amount = Math.min(rawAmount, maxContribution);
    return {
        taxableBase: base,
        rate,
        ratePercent: (rate * 100).toFixed(1),
        rawAmount,
        maxContribution,
        capApplied: rawAmount > maxContribution + 1e-9,
        amount
    };
}

function calculateSocialInsurance(grossSalary) {
    return calculateSocialInsuranceBreakdown(grossSalary).amount;
}

function calculateHolidayFund(grossSalary) {
    return grossSalary * CYPRUS_TAX_RATES.holidayFund;
}

function calculateNHS(taxableAmount) {
    return {
        employee: taxableAmount * CYPRUS_TAX_RATES.nhs.employee,
        employer: taxableAmount * CYPRUS_TAX_RATES.nhs.employer
    };
}

function calculateEmployerContributions(grossSalary, taxableAmount) {
    return {
        socialInsurance: taxableAmount * CYPRUS_TAX_RATES.socialInsurance.employer,
        nhs: taxableAmount * CYPRUS_TAX_RATES.nhs.employer,
        socialCohesion: taxableAmount * CYPRUS_TAX_RATES.employerContributions.socialCohesion,
        redundancy: taxableAmount * CYPRUS_TAX_RATES.employerContributions.redundancy,
        industrialTraining: taxableAmount * CYPRUS_TAX_RATES.employerContributions.industrialTraining
    };
}

function calculatePayroll(grossSalary, taxCode, additionalEarnings = {}, expenses = 0, excludeHolidayFund = false, excludeIncomeTax = false, basisOptions = {}) {
    const {
        excludeOvertimeFromDeductions = false,
        excludeOtherHourlyFromDeductions = false,
        taxYear: taxYearRaw
    } = basisOptions;
    const taxYear = (() => {
        if (taxYearRaw === undefined || taxYearRaw === null || taxYearRaw === '') {
            return new Date().getFullYear();
        }
        const y = parseInt(taxYearRaw, 10);
        return Number.isNaN(y) ? new Date().getFullYear() : y;
    })();

    // Calculate total gross pay including additional earnings
    const overtime = additionalEarnings.overtime || 0;
    const commission = additionalEarnings.commission || 0;
    const bonus = additionalEarnings.bonus || 0;
    const sickPay = additionalEarnings.sickPay || 0;
    const otherHourly = additionalEarnings.otherHourly || 0;
    
    // Commission and bonus are excluded from gross pay (like expenses)
    const totalGrossPay = grossSalary + overtime + sickPay + otherHourly;
    const additionalPay = commission + bonus; // These are added to net pay but not included in gross
    
    // Gross used for holiday fund, income tax, SI, NHS, and other employer % contributions (may omit overtime / other hourly when checkboxes are set)
    let contributionBasisGross = totalGrossPay;
    if (excludeOvertimeFromDeductions) {
        contributionBasisGross -= overtime;
    }
    if (excludeOtherHourlyFromDeductions) {
        contributionBasisGross -= otherHourly;
    }
    contributionBasisGross = Math.max(0, contributionBasisGross);
    
    // Holiday fund is employer-only contribution, calculated on contribution basis gross
    const holidayFund = excludeHolidayFund ? 0 : calculateHolidayFund(contributionBasisGross);
    
    // SI and NHS on (contribution basis gross + holiday fund). Bracket annual = (monthly gross − SI − NHS) × 11; monthly IT = annual ÷ 12.
    const taxableAmount = contributionBasisGross + holidayFund;
    const socialInsuranceBreakdown = calculateSocialInsuranceBreakdown(taxableAmount);
    const socialInsurance = socialInsuranceBreakdown.amount;
    const nhs = calculateNHS(taxableAmount);
    const monthlyNetForIncomeTax = Math.max(0, taxableAmount - socialInsurance - nhs.employee);
    const annualTaxableAmount = monthlyNetForIncomeTax * INCOME_TAX_BRACKET_ANNUAL_MULTIPLIER;
    const incomeTaxBreakdown = excludeIncomeTax
        ? null
        : calculateIncomeTaxBreakdown(annualTaxableAmount, taxCode, taxYear);
    if (incomeTaxBreakdown) {
        incomeTaxBreakdown.basisMonthlyGross = taxableAmount;
        incomeTaxBreakdown.basisMonthlySI = socialInsurance;
        incomeTaxBreakdown.basisMonthlyNHS = nhs.employee;
        incomeTaxBreakdown.basisMonthlyNet = monthlyNetForIncomeTax;
        incomeTaxBreakdown.incomeTaxBracketAnnualMultiplier = INCOME_TAX_BRACKET_ANNUAL_MULTIPLIER;
        incomeTaxBreakdown.incomeTaxMonthlyDivisor = INCOME_TAX_MONTHLY_DIVISOR;
    }
    const annualTax = excludeIncomeTax ? 0 : incomeTaxBreakdown.annualTax;
    const monthlyTax = annualTax / INCOME_TAX_MONTHLY_DIVISOR;
    
    // Employer contributions (percentages use same taxableAmount as employee deductions)
    const employerContributions = calculateEmployerContributions(contributionBasisGross, taxableAmount);
    
    // Employee deductions (no holiday fund deduction from employee)
    const totalDeductions = monthlyTax + socialInsurance + nhs.employee;
    // Net pay should be calculated on actual gross pay (not including employer contributions)
    const netPay = totalGrossPay - totalDeductions;
    
    // Total payable includes additional pay (commission + bonus) and expenses (not part of gross pay)
    const totalPayable = netPay + additionalPay + expenses;
    
    return {
        basicSalary: grossSalary,
        overtime,
        otherHourly,
        commission,
        bonus,
        sickPay,
        grossSalary: totalGrossPay,
        contributionBasisGross,
        excludeOvertimeFromDeductions,
        excludeOtherHourlyFromDeductions,
        additionalPay: additionalPay,
        incomeTax: monthlyTax,
        incomeTaxBreakdown,
        socialInsurance,
        siTaxableBasis: taxableAmount,
        socialInsuranceBreakdown,
        holidayFund, // This is employer contribution only
        nhs: nhs.employee,
        totalDeductions,
        netPay,
        expenses,
        totalPayable,
        employerContributions
    };
}

/**
 * Pension mode: employee deductions = NHS (GESI) only; employer = NHS, redundancy, industrial training, social cohesion only.
 * Holiday fund and employer SI are zero. Call after calculatePayroll (with holiday already excluded if needed).
 */
function applyPensionMode(payroll) {
    const nhsEmp = payroll.nhs || 0;
    payroll.incomeTax = 0;
    payroll.incomeTaxBreakdown = null;
    payroll.socialInsurance = 0;
    const br = payroll.socialInsuranceBreakdown;
    payroll.socialInsuranceBreakdown = Object.assign({}, br, {
        amount: 0,
        rawAmount: 0,
        capApplied: false
    });
    payroll.nhs = nhsEmp;
    payroll.totalDeductions = nhsEmp;
    payroll.holidayFund = 0;
    const ec = payroll.employerContributions || {};
    payroll.employerContributions = {
        socialInsurance: 0,
        nhs: ec.nhs || 0,
        socialCohesion: ec.socialCohesion || 0,
        redundancy: ec.redundancy || 0,
        industrialTraining: ec.industrialTraining || 0
    };
    payroll.netPay = payroll.grossSalary - payroll.totalDeductions;
    payroll.totalPayable = payroll.netPay + payroll.additionalPay + payroll.expenses;
}

/**
 * Overtime hours & rate for payslip display from stored payslip (view / print / bulk).
 * Rate stays 0 when there is no overtime pay and no overtime hours — no "hypothetical" OT rate.
 */
function payslipOvertimeHoursAndRate(payslip) {
    const standardHours = payslip.standardHours || 170;
    const standardRate = standardHours > 0 ? ((payslip.basicSalary || 0) / standardHours) : 0;
    const overtimeAmount = payslip.overtime || 0;
    const overtimeHoursStored = payslip.overtimeHours != null ? Number(payslip.overtimeHours) : 0;

    let overtimeHours = 0;
    let overtimeRate = 0;

    if (overtimeHoursStored > 0 && overtimeAmount > 0) {
        overtimeHours = overtimeHoursStored;
        overtimeRate = overtimeAmount / overtimeHours;
    } else if (overtimeHoursStored > 0) {
        overtimeHours = overtimeHoursStored;
        overtimeRate = standardRate * 1.5;
    } else if (overtimeAmount > 0) {
        overtimeRate = standardRate * 1.5;
        overtimeHours = overtimeRate > 0 ? overtimeAmount / overtimeRate : 0;
    }

    overtimeHours = parseFloat(Number(overtimeHours).toFixed(2));
    overtimeRate = parseFloat(Number(overtimeRate).toFixed(2));
    return { overtimeHours, overtimeRate };
}

// Payslip Generation
function generatePayslip() {
    try {
        console.log('Starting payslip generation...');
        
        const employeeId = document.getElementById('payslipEmployee').value;
        const month = document.getElementById('payslipMonth').value;
        const year = document.getElementById('payslipYear').value;
        
        console.log('Form values:', { employeeId, month, year });
        console.log('Employees array:', employees);
        
        if (!employeeId) {
            showMessage('Please select an employee', 'error');
            return;
        }
    
    const employee = employees.find(emp => emp.employeeId === employeeId);
    if (!employee) {
        showMessage('Employee not found', 'error');
        return;
    }
    
    // Check if we're editing an existing payslip
    const isEditing = editingPayslip && 
                     editingPayslip.employeeId === employeeId && 
                     editingPayslip.year == year && 
                     editingPayslip.month == month;
    
    // Get basic salary from form
    const basicSalary = parseFloat(document.getElementById('payslipBasicSalary').value) || 0;
    
    // Get exclusion checkboxes
    const pensionEl = document.getElementById('payslipPension');
    const isPension = pensionEl ? pensionEl.checked : false;
    const excludeHolidayFund =
        document.getElementById('excludeHolidayFund').checked || isPension;
    const excludeIncomeTax = document.getElementById('excludeIncomeTax').checked;
    const isHolidays = document.getElementById('isHolidays').checked;
    const excludeOvertimeFromDeductionsEl = document.getElementById('excludeOvertimeFromDeductions');
    const excludeOtherHourlyFromDeductionsEl = document.getElementById('excludeOtherHourlyFromDeductions');
    const excludeOvertimeFromDeductions = excludeOvertimeFromDeductionsEl ? excludeOvertimeFromDeductionsEl.checked : false;
    const excludeOtherHourlyFromDeductions = excludeOtherHourlyFromDeductionsEl ? excludeOtherHourlyFromDeductionsEl.checked : false;
    
    // Get standard hours and calculate standard rate
    const standardHours = parseFloat(document.getElementById('payslipStandardHoursInput').value) || 0;
    const standardHoursValue = standardHours > 0 ? standardHours : 170; // Default to 170 hours if not set
    const standardRate = standardHoursValue > 0 ? (basicSalary / standardHoursValue) : 0;
    
    // Get overtime hours and overtime pay amount
    const overtimeHoursInput = parseFloat(document.getElementById('payslipOvertimeHoursInput').value) || 0;
    const overtimeAmountInput = parseFloat(document.getElementById('payslipOvertime').value) || 0;
    
    // Calculate overtime rate and pay
    let overtimeRate = 0;
    let overtimePay = 0;
    
    // If both overtime hours and overtime pay are provided, calculate rate from them
    if (overtimeHoursInput > 0 && overtimeAmountInput > 0) {
        overtimeRate = overtimeAmountInput / overtimeHoursInput;
        overtimePay = overtimeAmountInput;
    }
    // If only overtime hours are provided, use standard rate * 1.5
    else if (overtimeHoursInput > 0) {
        overtimeRate = standardRate * 1.5;
        overtimePay = overtimeHoursInput * overtimeRate;
    }
    // If only overtime amount is provided, calculate rate from standard rate * 1.5
    else if (overtimeAmountInput > 0) {
        overtimeRate = standardRate * 1.5;
        overtimePay = overtimeAmountInput;
    }
    // No overtime hours and no overtime pay: leave rate at 0 (do not show a hypothetical OT rate)
    
    const otherHourlyHoursInputEl = document.getElementById('payslipOtherHourlyHoursInput');
    const otherHourlyRateInputEl = document.getElementById('payslipOtherHourlyRateInput');
    const otherHourlyHoursInput = otherHourlyHoursInputEl ? parseFloat(otherHourlyHoursInputEl.value) || 0 : 0;
    const otherHourlyRateInput = otherHourlyRateInputEl ? parseFloat(otherHourlyRateInputEl.value) || 0 : 0;
    let otherHourlyPay = 0;
    if (otherHourlyHoursInput > 0 && otherHourlyRateInput > 0) {
        otherHourlyPay = otherHourlyHoursInput * otherHourlyRateInput;
    }
    const otherHourlyHours = parseFloat(otherHourlyHoursInput.toFixed(2));
    const otherHourlyRate = parseFloat(otherHourlyRateInput.toFixed(2));
    
    // Collect additional earnings and expenses
    const additionalEarnings = {
        overtime: overtimePay,
        commission: parseFloat(document.getElementById('payslipCommissionBonus').value) || 0,
        bonus: 0, // Combined with commission
        sickPay: parseFloat(document.getElementById('payslipSickPay').value) || 0,
        otherHourly: otherHourlyPay
    };
    
    const expenses = parseFloat(document.getElementById('payslipExpenses').value) || 0;
    
    const deductionBasisOptions = {
        excludeOvertimeFromDeductions,
        excludeOtherHourlyFromDeductions,
        taxYear: year
    };
    
    console.log('About to calculate payroll...');
    const payroll = calculatePayroll(basicSalary, employee.taxCode, additionalEarnings, expenses, excludeHolidayFund, excludeIncomeTax, deductionBasisOptions);
    console.log('Payroll calculated:', payroll);
    
    const siTaxableBasisBeforeHolidays = payroll.siTaxableBasis;
    const socialInsuranceBreakdownBeforeHolidays = payroll.socialInsuranceBreakdown;
    
    // If holidays checkbox is checked, set all contributions and deductions to zero
    if (isHolidays) {
        payroll.incomeTax = 0;
        payroll.incomeTaxBreakdown = null;
        payroll.socialInsurance = 0;
        payroll.nhs = 0;
        payroll.totalDeductions = 0;
        payroll.holidayFund = 0;
        payroll.employerContributions = {
            socialInsurance: 0,
            nhs: 0,
            socialCohesion: 0,
            redundancy: 0,
            industrialTraining: 0
        };
        // Recalculate net pay without deductions
        payroll.netPay = payroll.grossSalary;
        payroll.totalPayable = payroll.netPay + payroll.additionalPay + payroll.expenses;
        payroll.siTaxableBasis = siTaxableBasisBeforeHolidays;
        payroll.socialInsuranceBreakdown = socialInsuranceBreakdownBeforeHolidays;
    } else if (isPension) {
        applyPensionMode(payroll);
    }
    
    // Get pay date from form
    const payDate = document.getElementById('payslipPayDate').value;
    let payDateFormatted;
    
    if (payDate) {
        const date = new Date(payDate);
        const day = date.getDate().toString().padStart(2, '0');
        const monthNum = (date.getMonth() + 1).toString().padStart(2, '0');
        const yearNum = date.getFullYear();
        payDateFormatted = `${day}/${monthNum}/${yearNum}`;
    } else {
        payDateFormatted = `31/${month}/${year}`;
    }
    
    // Update payslip display
    updateElement('payslipEmployeeName', `${employee.firstName} ${employee.lastName}`);
    updateElement('payslipEmployeeId', employee.employeeId);
    updateElement('payslipPeriod', getMonthName(month).toUpperCase());
    updateElement('payslipPayDateDisplay', payDateFormatted);
    
    // Payroll #: auto SLR/Year/Month/Sequence, or override from form field when non-empty
    const monthNum = parseInt(month, 10);
    let autoPayrollNumber;
    if (isEditing) {
        const existingPayslip = findPayslip(employeeId, year, month);
        autoPayrollNumber = existingPayslip
            ? existingPayslip.payrollNumber
            : formatPayrollNumber(year, monthNum, 1);
        console.log(`Default payroll number (editing): ${autoPayrollNumber}`);
    } else {
        const sequenceNumber = getNextPayrollSequence(year, monthNum);
        autoPayrollNumber = formatPayrollNumber(year, monthNum, sequenceNumber);
        console.log(`Default payroll number (new): ${autoPayrollNumber} (sequence: ${sequenceNumber})`);
    }
    const payrollNumber = resolvePayrollNumberForSave(autoPayrollNumber);
    updateElement('payslipPayrollNumber', payrollNumber);
    syncPayrollNumberInput(payrollNumber);
    
    updateElement('payslipSocialInsuranceNo', employee.socialInsurance);
    updateElement('payslipEmployeePhone', employee.phone || 'N/A');
    
    // Update company information in payslip
    updatePayslipCompanyInfo();
    
    // Use the input overtime hours if provided, otherwise calculate from overtime pay
    let overtimeHours = 0;
    if (overtimeHoursInput > 0) {
        overtimeHours = overtimeHoursInput;
    } else if (payroll.overtime > 0 && overtimeRate > 0) {
        overtimeHours = payroll.overtime / overtimeRate;
    }
    // Round to 2 decimal places
    overtimeHours = parseFloat(overtimeHours.toFixed(2));
    // Round overtime rate to 2 decimal places
    overtimeRate = parseFloat(overtimeRate.toFixed(2));
    
    // Earnings section
    updateElement('payslipStandardHours', standardHoursValue.toFixed(2));
    updateElement('payslipStandardRate', standardRate.toFixed(2));
    updateElement('payslipStandardCurrent', `${formatMoney(payroll.basicSalary)}`);
    
    updateElement('payslipOvertimeHours', overtimeHours.toFixed(2));
    updateElement('payslipOvertimeRate', overtimeRate.toFixed(2));
    updateElement('payslipOvertimeCurrent', `${formatMoney(payroll.overtime)}`);
    
    updateElement('payslipOtherHourlyHours', otherHourlyHours.toFixed(2));
    updateElement('payslipOtherHourlyRate', otherHourlyRate.toFixed(2));
    updateElement('payslipOtherHourlyCurrent', `${formatMoney((payroll.otherHourly || 0))}`);
    
    updateElement('payslipCommissionCurrent', `${formatMoney((payroll.commission + payroll.bonus))}`);
    
    updateElement('payslipSickPayCurrent', `${formatMoney(payroll.sickPay)}`);
    
    updateElement('payslipExpensesCurrent', `${formatMoney(payroll.expenses)}`);
    
    updateElement('payslipGrossPayCurrent', `${formatMoney(payroll.grossSalary)}`);
    
    // Deductions section
    updateElement('payslipIncomeTaxCurrent', `${formatMoney(payroll.incomeTax)}`);
    updateIncomeTaxBreakdownUI(payroll.incomeTaxBreakdown);
    
    updateElement('payslipSocialInsuranceCurrent', `${formatMoney(payroll.socialInsurance)}`);
    
    updateElement('payslipGESICurrent', `${formatMoney(payroll.nhs)}`);
    
    updateElement('payslipTotalDeductionsCurrent', `${formatMoney(payroll.totalDeductions)}`);
    
    // Contributions section
    updateElement('payslipEmployerSocialInsuranceCurrent', `${formatMoney(payroll.employerContributions.socialInsurance)}`);
    
    updateElement('payslipHolidayFundCurrent', `${formatMoney(payroll.holidayFund)}`);
    
    updateElement('payslipRedundancyCurrent', `${formatMoney(payroll.employerContributions.redundancy)}`);
    
    updateElement('payslipIndustrialTrainingCurrent', `${formatMoney(payroll.employerContributions.industrialTraining)}`);
    
    updateElement('payslipSocialCohesionCurrent', `${formatMoney(payroll.employerContributions.socialCohesion)}`);
    
    updateElement('payslipEmployerGESICurrent', `${formatMoney(payroll.employerContributions.nhs)}`);
    
    const totalContributions = payroll.holidayFund + 
                             payroll.employerContributions.socialInsurance + 
                             payroll.employerContributions.nhs + 
                             payroll.employerContributions.socialCohesion + 
                             payroll.employerContributions.redundancy + 
                             payroll.employerContributions.industrialTraining;
    
    updateElement('payslipTotalContributionsCurrent', `${formatMoney(totalContributions)}`);
    
    // Net pay (including additional pay and expenses)
    const netPayWithAdditional = payroll.netPay + payroll.additionalPay + payroll.expenses;
    updateElement('payslipNetPayCurrent', `${formatMoney(netPayWithAdditional)}`);
    
    // Calculate YTD values (before saving current payslip, so we calculate up to previous month)
    // Then we'll recalculate after saving to include current month
    let ytd = calculateYTDForPayslip(employeeId, year, month);
    
    // Update YTD values in earnings section
    updateElement('payslipStandardYTD', `${formatMoney(ytd.basicSalary)}`);
    updateElement('payslipOvertimeYTD', `${formatMoney(ytd.overtime)}`);
    updateElement('payslipOtherHourlyYTD', `${formatMoney(ytd.otherHourly)}`);
    updateElement('payslipCommissionYTD', `${formatMoney((ytd.commission + ytd.bonus))}`);
    updateElement('payslipSickPayYTD', `${formatMoney(ytd.sickPay)}`);
    updateElement('payslipExpensesYTD', `${formatMoney(ytd.expenses)}`);
    updateElement('payslipGrossPayYTD', `${formatMoney(ytd.grossSalary)}`);
    
    // Update YTD values in deductions section
    updateElement('payslipIncomeTaxYTD', `${formatMoney(ytd.incomeTax)}`);
    updateElement('payslipSocialInsuranceYTD', `${formatMoney(ytd.socialInsurance)}`);
    updateElement('payslipGESITYD', `${formatMoney(ytd.nhs)}`);
    updateElement('payslipTotalDeductionsYTD', `${formatMoney(ytd.totalDeductions)}`);
    
    // Update YTD values in contributions section
    updateElement('payslipEmployerSocialInsuranceYTD', `${formatMoney(ytd.employerContributions.socialInsurance)}`);
    updateElement('payslipHolidayFundYTD', `${formatMoney(ytd.holidayFund)}`);
    updateElement('payslipRedundancyYTD', `${formatMoney(ytd.employerContributions.redundancy)}`);
    updateElement('payslipIndustrialTrainingYTD', `${formatMoney(ytd.employerContributions.industrialTraining)}`);
    updateElement('payslipSocialCohesionYTD', `${formatMoney(ytd.employerContributions.socialCohesion)}`);
    updateElement('payslipEmployerGESITYD', `${formatMoney(ytd.employerContributions.nhs)}`);
    
    const totalContributionsYTD = ytd.holidayFund + 
                                 ytd.employerContributions.socialInsurance + 
                                 ytd.employerContributions.nhs + 
                                 ytd.employerContributions.socialCohesion + 
                                 ytd.employerContributions.redundancy + 
                                 ytd.employerContributions.industrialTraining;
    updateElement('payslipTotalContributionsYTD', `${formatMoney(totalContributionsYTD)}`);
    
    // Update YTD net pay
    updateElement('payslipNetPayYTD', `${formatMoney(ytd.totalPayable)}`);
    
    // Payment details
    updateElement('payslipPaymentMethod', employee.paymentMethod || 'Bank Transfer');
    updateElement('payslipBankName', employee.bankName || 'Not Specified');
    updateElement('payslipBankIBAN', employee.bankIBAN || 'Not Specified');
    
    // Save payroll data (savedAt = first time this payslip was saved; kept on updates for stable sequence order)
    const payrollKey = `${employeeId}_${year}_${month}`;
    const priorRecord = payrollData[payrollKey];
    const savedAt =
        priorRecord && priorRecord.savedAt != null ? priorRecord.savedAt : Date.now();
    payrollData[payrollKey] = {
        employeeId,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        month,
        year,
        payDate: payDate,
        payrollNumber: payrollNumber,
        savedAt,
        basicSalary: basicSalary,
        standardHours: standardHours,
        overtimeHours: overtimeHours,
        excludeHolidayFund: excludeHolidayFund,
        excludeIncomeTax: excludeIncomeTax,
        isHolidays: isHolidays,
        isPension: isPension,
        excludeOvertimeFromDeductions,
        excludeOtherHourlyFromDeductions,
        contributionBasisGross: payroll.contributionBasisGross,
        overtime: payroll.overtime,
        otherHourly: payroll.otherHourly || 0,
        otherHourlyHours: otherHourlyHours,
        otherHourlyRate: otherHourlyRate,
        commission: payroll.commission,
        bonus: payroll.bonus,
        sickPay: payroll.sickPay,
        grossSalary: payroll.grossSalary,
        additionalPay: payroll.additionalPay,
        incomeTax: payroll.incomeTax,
        incomeTaxBreakdown: payroll.incomeTaxBreakdown,
        socialInsurance: payroll.socialInsurance,
        siTaxableBasis: payroll.siTaxableBasis,
        socialInsuranceBreakdown: payroll.socialInsuranceBreakdown,
        holidayFund: payroll.holidayFund,
        nhs: payroll.nhs,
        totalDeductions: payroll.totalDeductions,
        netPay: payroll.netPay,
        expenses: payroll.expenses,
        totalPayable: payroll.totalPayable,
        employerContributions: payroll.employerContributions
    };
    savePayrollData();
    
    // Recalculate YTD to include the current month that was just saved
    ytd = calculateYTDForPayslip(employeeId, year, month);
    
    // Update YTD values again with current month included
    updateElement('payslipStandardYTD', `${formatMoney(ytd.basicSalary)}`);
    updateElement('payslipOvertimeYTD', `${formatMoney(ytd.overtime)}`);
    updateElement('payslipOtherHourlyYTD', `${formatMoney(ytd.otherHourly)}`);
    updateElement('payslipCommissionYTD', `${formatMoney((ytd.commission + ytd.bonus))}`);
    updateElement('payslipSickPayYTD', `${formatMoney(ytd.sickPay)}`);
    updateElement('payslipExpensesYTD', `${formatMoney(ytd.expenses)}`);
    updateElement('payslipGrossPayYTD', `${formatMoney(ytd.grossSalary)}`);
    updateElement('payslipIncomeTaxYTD', `${formatMoney(ytd.incomeTax)}`);
    updateElement('payslipSocialInsuranceYTD', `${formatMoney(ytd.socialInsurance)}`);
    updateElement('payslipGESITYD', `${formatMoney(ytd.nhs)}`);
    updateElement('payslipTotalDeductionsYTD', `${formatMoney(ytd.totalDeductions)}`);
    updateElement('payslipEmployerSocialInsuranceYTD', `${formatMoney(ytd.employerContributions.socialInsurance)}`);
    updateElement('payslipHolidayFundYTD', `${formatMoney(ytd.holidayFund)}`);
    updateElement('payslipRedundancyYTD', `${formatMoney(ytd.employerContributions.redundancy)}`);
    updateElement('payslipIndustrialTrainingYTD', `${formatMoney(ytd.employerContributions.industrialTraining)}`);
    updateElement('payslipSocialCohesionYTD', `${formatMoney(ytd.employerContributions.socialCohesion)}`);
    updateElement('payslipEmployerGESITYD', `${formatMoney(ytd.employerContributions.nhs)}`);
    const totalContributionsYTDUpdated = ytd.holidayFund + 
                                         ytd.employerContributions.socialInsurance + 
                                         ytd.employerContributions.nhs + 
                                         ytd.employerContributions.socialCohesion + 
                                         ytd.employerContributions.redundancy + 
                                         ytd.employerContributions.industrialTraining;
    updateElement('payslipTotalContributionsYTD', `${formatMoney(totalContributionsYTDUpdated)}`);
    updateElement('payslipNetPayYTD', `${formatMoney(ytd.totalPayable)}`);
    
    // Update all tabs with new data
    updateAllTabs();
    
    // Clear editing flag and reset button text
    editingPayslip = null;
    document.getElementById('payslipButton').textContent = 'Generate Payslip';
    
    // Show success message
    if (isEditing) {
        showMessage('Payslip updated successfully!', 'success');
    } else {
        showMessage('Payslip generated successfully!', 'success');
    }
    
    // Show payslip
    document.getElementById('payslipResult').style.display = 'block';
    document.getElementById('payslipResult').scrollIntoView({ behavior: 'smooth' });
    
    } catch (error) {
        console.error('Error generating payslip:', error);
        showMessage('Error generating payslip: ' + error.message, 'error');
    }
}

function printPayslip() {
    // When embedded in Andeco Horizon, print from a dedicated window so output matches standalone Payroll app
    if (typeof window.setPayrollSubsection === 'function') {
        const payslipResult = document.getElementById('payslipResult');
        const container = payslipResult ? payslipResult.querySelector('.payslip-container') : null;
        if (!container) {
            window.print();
            return;
        }
        const printWin = window.open('', '_blank', 'width=800,height=600');
        if (!printWin) {
            window.print();
            return;
        }
        var baseHref = '';
        if (window.location.protocol === 'file:') {
            var path = window.location.pathname || '';
            baseHref = 'file://' + path.replace(/[^/]*$/, '');
        } else {
            baseHref = window.location.href.replace(/[#?].*$/, '').replace(/[^/]+$/, '') || window.location.origin + '/';
        }
        var inlineStyles = typeof window.PAYSLIP_PRINT_STYLES === 'string' ? window.PAYSLIP_PRINT_STYLES : '';
        printWin.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Payslip</title>');
        printWin.document.write('<base href="' + baseHref.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '">');
        if (inlineStyles) {
            printWin.document.write('<style>' + inlineStyles.replace(/<\/style/gi, '<\\/style') + '</style>');
        } else {
            printWin.document.write('<link rel="stylesheet" href="css/payslip-print.css">');
        }
        printWin.document.write('</head><body>');
        printWin.document.write(container.outerHTML);
        printWin.document.write('</body></html>');
        printWin.document.close();
        var printDone = false;
        function doPrint() {
            if (printDone || printWin.closed) return;
            printDone = true;
            printWin.focus();
            printWin.print();
            printWin.onafterprint = function () { if (!printWin.closed) printWin.close(); };
        }
        if (inlineStyles) {
            doPrint();
        } else {
            printWin.onload = function () { doPrint(); };
            setTimeout(function () { if (!printDone) doPrint(); }, 800);
        }
        return;
    }
    window.print();
}

// Helper function to safely update element text content
function updateElement(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    } else {
        console.warn(`Element with id '${id}' not found`);
    }
}

// (Removed) Cost to Company Calculation and UI

// Helper function to find payslip with flexible key matching
function findPayslip(employeeId, year, month) {
    const monthStr = month.toString().padStart(2, '0');
    const yearStr = year.toString();
    
    // Try different key formats
    const possibleKeys = [
        `${employeeId}_${yearStr}_${monthStr}`,
        `${employeeId}_${yearStr}_${month}`,
        `${employeeId}_${year}_${monthStr}`,
        `${employeeId}_${year}_${month}`
    ];
    
    for (const key of possibleKeys) {
        if (payrollData[key]) {
            return { key, payslip: payrollData[key] };
        }
    }
    
    return null;
}

// Function to update all tabs with real-time data
function updateAllTabs() {
    // Update employee dropdowns
    updateEmployeeDropdowns();
    
    // Update YTD display
    updateYTDDisplay();
    
    // Update payslip filters
    updatePayslipFilters();
    
    // Update payslip management table
    loadPayslips();
    
    // Update company info in payslip
    updatePayslipCompanyInfo();
}

// Payslip Management Functions
function loadPayslips() {
    const tableBody = document.getElementById('payslipsTableBody');
    tableBody.innerHTML = '';
    
    // Get filter values
    const employeeFilter = document.getElementById('payslipFilterEmployee').value;
    const yearFilter = document.getElementById('payslipFilterYear').value;
    const monthFilter = document.getElementById('payslipFilterMonth').value;
    
    // Filter payroll data
    const filteredPayslips = Object.values(payrollData).filter(payslip => {
        if (employeeFilter && payslip.employeeId !== employeeFilter) return false;
        if (yearFilter && payslip.year.toString() !== yearFilter) return false;
        if (monthFilter && payslip.month.toString() !== monthFilter) return false;
        return true;
    });
    
    // Sort by year, month, then sequence (descending — newest first)
    const trailingSequence = (payrollNumber) => {
        if (!payrollNumber) return 0;
        const m = payrollNumber.match(/\/(\d{1,3})$/);
        return m ? parseInt(m[1], 10) : 0;
    };
    filteredPayslips.sort((a, b) => {
        const yA = typeof a.year === 'string' ? parseInt(a.year, 10) : a.year;
        const yB = typeof b.year === 'string' ? parseInt(b.year, 10) : b.year;
        if (yB !== yA) return yB - yA;
        const mA = typeof a.month === 'string' ? parseInt(a.month, 10) : a.month;
        const mB = typeof b.month === 'string' ? parseInt(b.month, 10) : b.month;
        if (mB !== mA) return mB - mA;
        return trailingSequence(b.payrollNumber) - trailingSequence(a.payrollNumber);
    });
    
    filteredPayslips.forEach(payslip => {
        const row = document.createElement('tr');
        const period = `${getMonthName(payslip.month)} ${payslip.year}`;
        const payDate = payslip.payDate ? new Date(payslip.payDate).toLocaleDateString('en-GB') : 'N/A';
        
        console.log('Creating row for payslip:', payslip.employeeId, payslip.year, payslip.month);
        
        // Create table cells
        const payrollCell = document.createElement('td');
        payrollCell.textContent = payslip.payrollNumber || 'N/A';
        
        const employeeCell = document.createElement('td');
        employeeCell.textContent = payslip.employeeName;
        
        const periodCell = document.createElement('td');
        periodCell.textContent = period;
        
        const payDateCell = document.createElement('td');
        payDateCell.textContent = payDate;
        
        const grossCell = document.createElement('td');
        grossCell.textContent = formatMoney(payslip.grossSalary || 0);
        
        const netCell = document.createElement('td');
        netCell.textContent = formatMoney(payslip.netPay ? (payslip.netPay + (payslip.additionalPay || 0) + (payslip.expenses || 0)) : 0);
        
        const statusCell = document.createElement('td');
        const statusSpan = document.createElement('span');
        statusSpan.className = 'status-completed';
        statusSpan.textContent = 'Completed';
        statusCell.appendChild(statusSpan);
        
        const actionsCell = document.createElement('td');
        
        // Create buttons
        const viewButton = document.createElement('button');
        viewButton.className = 'secondary';
        viewButton.textContent = 'View';
        viewButton.onclick = () => viewPayslip(payslip.employeeId, payslip.year, payslip.month);
        
        const editButton = document.createElement('button');
        editButton.className = 'primary';
        editButton.textContent = 'Edit';
        editButton.onclick = () => editPayslip(payslip.employeeId, payslip.year, payslip.month);
        
        const deleteButton = document.createElement('button');
        deleteButton.className = 'danger';
        deleteButton.textContent = 'Delete';
        deleteButton.style.cssText = 'background: #dc3545; color: white; border: none; padding: 0.25rem 0.5rem; border-radius: 4px; cursor: pointer; margin-left: 5px;';
        deleteButton.onclick = () => deletePayslip(payslip.employeeId, payslip.year, payslip.month);
        
        // Append buttons to actions cell
        actionsCell.appendChild(viewButton);
        actionsCell.appendChild(editButton);
        actionsCell.appendChild(deleteButton);
        
        // Append all cells to row
        row.appendChild(payrollCell);
        row.appendChild(employeeCell);
        row.appendChild(periodCell);
        row.appendChild(payDateCell);
        row.appendChild(grossCell);
        row.appendChild(netCell);
        row.appendChild(statusCell);
        row.appendChild(actionsCell);
        tableBody.appendChild(row);
    });
    
    if (filteredPayslips.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px;">No payslips found</td></tr>';
    }
}

function clearPayslipFilters() {
    document.getElementById('payslipFilterEmployee').value = '';
    document.getElementById('payslipFilterYear').value = '';
    document.getElementById('payslipFilterMonth').value = '';
    loadPayslips();
}

function updatePayslipFilters() {
    // Update employee filter
    const employeeFilter = document.getElementById('payslipFilterEmployee');
    const currentEmployeeValue = employeeFilter.value;
    employeeFilter.innerHTML = '<option value="">All Employees</option>';
    
    employees.forEach(employee => {
        const option = document.createElement('option');
        option.value = employee.employeeId;
        option.textContent = `${employee.firstName} ${employee.lastName}`;
        employeeFilter.appendChild(option);
    });
    employeeFilter.value = currentEmployeeValue;
    
    // Update year filter
    const yearFilter = document.getElementById('payslipFilterYear');
    const currentYearValue = yearFilter.value;
    yearFilter.innerHTML = '<option value="">All Years</option>';
    
    const years = [...new Set(Object.values(payrollData).map(payslip => payslip.year))].sort((a, b) => b - a);
    years.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        yearFilter.appendChild(option);
    });
    yearFilter.value = currentYearValue;
}

function viewPayslip(employeeId, year, month) {
    console.log('viewPayslip called with:', { employeeId, year, month });
    console.log('Current payrollData:', payrollData);
    
    const result = findPayslip(employeeId, year, month);
    
    if (!result) {
        console.log('Payslip not found for employee:', employeeId, 'year:', year, 'month:', month);
        console.log('Available payroll keys:', Object.keys(payrollData));
        showMessage('Payslip not found', 'error');
        return;
    }
    
    const { payslip } = result;
    console.log('Found payslip:', payslip);
    
    // Populate payslip display with existing data
    populatePayslipDisplay(payslip);
    updatePayslipCompanyInfo();
    
    // Show payslip
    document.getElementById('payslipResult').style.display = 'block';
    document.getElementById('payslipResult').scrollIntoView({ behavior: 'smooth' });
    
    // Switch to payslip tab
    openTab(null, 'payslip');
}

function editPayslip(employeeId, year, month) {
    const result = findPayslip(employeeId, year, month);
    
    if (!result) {
        showMessage('Payslip not found', 'error');
        return;
    }
    
    const { payslip } = result;
    
    // Set editing flag
    editingPayslip = { employeeId, year, month };
    
    // Update button text
    document.getElementById('payslipButton').textContent = 'Update Payslip';
    
    // Switch to generate payslip tab
    openTab(null, 'payslip');
    
    // Populate form with existing data
    document.getElementById('payslipEmployee').value = payslip.employeeId;
    document.getElementById('payslipMonth').value = payslip.month.toString().padStart(2, '0');
    document.getElementById('payslipYear').value = payslip.year;
    document.getElementById('payslipPayDate').value = payslip.payDate || '';
    
    // Populate basic salary
    document.getElementById('payslipBasicSalary').value = payslip.basicSalary || 0;
    
    // Populate standard hours
    const hoursInputEl = document.getElementById('payslipStandardHoursInput');
    if (hoursInputEl) {
        hoursInputEl.value = (payslip.standardHours && payslip.standardHours > 0) ? payslip.standardHours : 170;
    }
    
    // Populate overtime hours
    const overtimeHoursInputEl = document.getElementById('payslipOvertimeHoursInput');
    if (overtimeHoursInputEl) {
        overtimeHoursInputEl.value = (payslip.overtimeHours && payslip.overtimeHours > 0) ? payslip.overtimeHours.toFixed(2) : 0;
    }
    
    // Populate exclusion checkboxes
    document.getElementById('excludeHolidayFund').checked =
        !!(payslip.excludeHolidayFund || payslip.isPension);
    document.getElementById('excludeIncomeTax').checked = payslip.excludeIncomeTax || false;
    document.getElementById('isHolidays').checked = payslip.isHolidays || false;
    const penEl = document.getElementById('payslipPension');
    if (penEl) penEl.checked = payslip.isPension || false;
    const exOt = document.getElementById('excludeOvertimeFromDeductions');
    if (exOt) exOt.checked = payslip.excludeOvertimeFromDeductions || false;
    const exOh = document.getElementById('excludeOtherHourlyFromDeductions');
    if (exOh) exOh.checked = payslip.excludeOtherHourlyFromDeductions || false;
    
    const ohh = document.getElementById('payslipOtherHourlyHoursInput');
    if (ohh) ohh.value = (payslip.otherHourlyHours != null && payslip.otherHourlyHours > 0) ? Number(payslip.otherHourlyHours).toFixed(2) : '';
    const ohr = document.getElementById('payslipOtherHourlyRateInput');
    if (ohr) ohr.value = (payslip.otherHourlyRate != null && payslip.otherHourlyRate > 0) ? Number(payslip.otherHourlyRate).toFixed(2) : '';
    
    // Populate additional earnings
    document.getElementById('payslipOvertime').value = payslip.overtime || 0;
    document.getElementById('payslipCommissionBonus').value = (payslip.commission || 0) + (payslip.bonus || 0);
    document.getElementById('payslipSickPay').value = payslip.sickPay || 0;
    document.getElementById('payslipExpenses').value = payslip.expenses || 0;
    
    syncPayrollNumberInput(payslip.payrollNumber || '');
    
    showMessage('Payslip loaded for editing. Click "Update Payslip" to save changes.', 'success');
}

function deletePayslip(employeeId, year, month) {
    if (confirm('Are you sure you want to delete this payslip? This action cannot be undone.')) {
        const result = findPayslip(employeeId, year, month);
        
        if (!result) {
            showMessage('Payslip not found', 'error');
            return;
        }
        
        const { key } = result;
        delete payrollData[key];
        
        // Renumber all payroll sequences for this year to ensure continuity
        renumberPayrollSequences(year);
        
        savePayrollData();
        updateAllTabs();
        showMessage('Payslip deleted successfully', 'success');
    }
}

function renumberPayrollSequences(year) {
    const yearPayslips = Object.values(payrollData).filter(payslip => payslip.year == year);
    if (yearPayslips.length === 0) return;

    const byMonth = {};
    yearPayslips.forEach(p => {
        const m = typeof p.month === 'string' ? parseInt(p.month, 10) : p.month;
        if (!byMonth[m]) byMonth[m] = [];
        byMonth[m].push(p);
    });

    Object.keys(byMonth)
        .map(k => parseInt(k, 10))
        .sort((a, b) => a - b)
        .forEach(monthNum => {
            const group = byMonth[monthNum];
            // Order by first-save time (generation order), not alphabetically by name.
            // Older payslips without savedAt: fall back to existing payroll # sequence, then employeeId.
            group.sort((a, b) => {
                const tA = a.savedAt != null ? Number(a.savedAt) : null;
                const tB = b.savedAt != null ? Number(b.savedAt) : null;
                if (tA != null && tB != null && tA !== tB) return tA - tB;
                if (tA != null && tB == null) return -1;
                if (tA == null && tB != null) return 1;
                const sA = payrollSequenceSortKey(a.payrollNumber);
                const sB = payrollSequenceSortKey(b.payrollNumber);
                if (sA !== sB) return sA - sB;
                return String(a.employeeId || '').localeCompare(String(b.employeeId || ''));
            });
            group.forEach((payslip, index) => {
                const newSequence = index + 1;
                const newPayrollNumber = formatPayrollNumber(year, monthNum, newSequence);
                const payrollKey = Object.keys(payrollData).find(key => {
                    const data = payrollData[key];
                    return data &&
                        data.employeeId === payslip.employeeId &&
                        data.year == payslip.year &&
                        data.month == payslip.month;
                });
                if (payrollKey) {
                    payrollData[payrollKey].payrollNumber = newPayrollNumber;
                    console.log(`Renumbered payslip: ${payrollKey} -> ${newPayrollNumber}`);
                }
            });
        });
}

function populatePayslipDisplay(payslip) {
    console.log('populatePayslipDisplay called with:', payslip);
    
    // Get employee data to access social insurance number
    const employee = employees.find(emp => emp.employeeId === payslip.employeeId);
    console.log('Employee found:', employee);
    console.log('Social Insurance Number:', employee ? employee.socialInsurance : 'Employee not found');
    
    // Update basic info
    updateElement('payslipEmployeeName', payslip.employeeName);
    updateElement('payslipEmployeeId', payslip.employeeId);
    
    // Handle month format conversion
    let monthForDisplay;
    try {
        // Convert month to number if it's a string
        const monthNum = typeof payslip.month === 'string' ? parseInt(payslip.month) : payslip.month;
        console.log('Month conversion:', { original: payslip.month, converted: monthNum, type: typeof monthNum });
        monthForDisplay = getMonthName(monthNum).toUpperCase();
        console.log('Month name result:', monthForDisplay);
    } catch (error) {
        console.error('Error getting month name:', error);
        console.error('Month value that caused error:', payslip.month);
        monthForDisplay = 'UNKNOWN';
    }
    updateElement('payslipPeriod', monthForDisplay);
    
    // Handle pay date formatting
    let payDateDisplay;
    try {
        payDateDisplay = payslip.payDate ? new Date(payslip.payDate).toLocaleDateString('en-GB') : 'N/A';
    } catch (error) {
        console.error('Error formatting pay date:', error);
        payDateDisplay = 'N/A';
    }
    updateElement('payslipPayDateDisplay', payDateDisplay);
    
    updateElement('payslipPayrollNumber', payslip.payrollNumber || 'N/A');
    syncPayrollNumberInput(payslip.payrollNumber || '');
    updateElement('payslipSocialInsuranceNo', employee ? employee.socialInsurance || 'N/A' : 'N/A');
    updateElement('payslipEmployeePhone', employee ? employee.phone || 'N/A' : 'N/A');
    
    // Update earnings with error handling
    try {
        const stdH = payslip.standardHours || 170;
        const stdR = stdH > 0 ? ((payslip.basicSalary || 0) / stdH) : 0;
        const { overtimeHours: otDispH, overtimeRate: otDispR } = payslipOvertimeHoursAndRate(payslip);
        updateElement('payslipStandardHours', stdH.toFixed(2));
        updateElement('payslipStandardRate', stdR.toFixed(2));
        updateElement('payslipStandardCurrent', `${formatMoney((payslip.basicSalary || 0))}`);
        updateElement('payslipOvertimeHours', otDispH.toFixed(2));
        updateElement('payslipOvertimeRate', otDispR.toFixed(2));
        updateElement('payslipOvertimeCurrent', `${formatMoney((payslip.overtime || 0))}`);
        updateElement('payslipOtherHourlyHours', (payslip.otherHourlyHours != null ? Number(payslip.otherHourlyHours) : 0).toFixed(2));
        updateElement('payslipOtherHourlyRate', (payslip.otherHourlyRate != null ? Number(payslip.otherHourlyRate) : 0).toFixed(2));
        updateElement('payslipOtherHourlyCurrent', `${formatMoney((payslip.otherHourly || 0))}`);
        updateElement('payslipCommissionCurrent', `${formatMoney(((payslip.commission || 0) + (payslip.bonus || 0)))}`);
        updateElement('payslipSickPayCurrent', `${formatMoney((payslip.sickPay || 0))}`);
        updateElement('payslipExpensesCurrent', `${formatMoney((payslip.expenses || 0))}`);
        updateElement('payslipGrossPayCurrent', `${formatMoney((payslip.grossSalary || 0))}`);
        
        // Update deductions
        const incomeTaxBreakdownView = resolveIncomeTaxBreakdownForPayslip(payslip);
        const incomeTaxMonthlyDisplay = incomeTaxBreakdownView
            ? incomeTaxBreakdownView.monthlyTax
            : (payslip.incomeTax || 0);
        updateElement('payslipIncomeTaxCurrent', `${formatMoney(incomeTaxMonthlyDisplay)}`);
        updateIncomeTaxBreakdownUI(incomeTaxBreakdownView);
        updateElement('payslipSocialInsuranceCurrent', `${formatMoney((payslip.socialInsurance || 0))}`);
        updateElement('payslipGESICurrent', `${formatMoney((payslip.nhs || 0))}`);
        updateElement(
            'payslipTotalDeductionsCurrent',
            `${formatMoney((incomeTaxMonthlyDisplay + (payslip.socialInsurance || 0) + (payslip.nhs || 0)))}`
        );
        
        // Update contributions
        updateElement('payslipEmployerSocialInsuranceCurrent', `${formatMoney((payslip.employerContributions?.socialInsurance || 0))}`);
        updateElement('payslipHolidayFundCurrent', `${formatMoney((payslip.holidayFund || 0))}`);
        updateElement('payslipRedundancyCurrent', `${formatMoney((payslip.employerContributions?.redundancy || 0))}`);
        updateElement('payslipIndustrialTrainingCurrent', `${formatMoney((payslip.employerContributions?.industrialTraining || 0))}`);
        updateElement('payslipSocialCohesionCurrent', `${formatMoney((payslip.employerContributions?.socialCohesion || 0))}`);
        updateElement('payslipEmployerGESICurrent', `${formatMoney((payslip.employerContributions?.nhs || 0))}`);
        
        // Calculate total contributions
        const totalContributions = (payslip.holidayFund || 0) + 
                                 (payslip.employerContributions?.socialInsurance || 0) + 
                                 (payslip.employerContributions?.nhs || 0) + 
                                 (payslip.employerContributions?.socialCohesion || 0) + 
                                 (payslip.employerContributions?.redundancy || 0) + 
                                 (payslip.employerContributions?.industrialTraining || 0);
        updateElement('payslipTotalContributionsCurrent', `${formatMoney(totalContributions)}`);
        
    // Update net pay (should include additional pay and expenses)
    const netPayWithAdditional = (payslip.netPay || 0) + (payslip.additionalPay || 0) + (payslip.expenses || 0);
    updateElement('payslipNetPayCurrent', `${formatMoney(netPayWithAdditional)}`);
    
    // Calculate and display YTD values
    const ytd = calculateYTDForPayslip(payslip.employeeId, payslip.year, payslip.month);
    
    // Update YTD values in earnings section
    updateElement('payslipStandardYTD', `${formatMoney(ytd.basicSalary)}`);
    updateElement('payslipOvertimeYTD', `${formatMoney(ytd.overtime)}`);
    updateElement('payslipOtherHourlyYTD', `${formatMoney(ytd.otherHourly)}`);
    updateElement('payslipCommissionYTD', `${formatMoney((ytd.commission + ytd.bonus))}`);
    updateElement('payslipSickPayYTD', `${formatMoney(ytd.sickPay)}`);
    updateElement('payslipExpensesYTD', `${formatMoney(ytd.expenses)}`);
    updateElement('payslipGrossPayYTD', `${formatMoney(ytd.grossSalary)}`);
    
    // Update YTD values in deductions section
    updateElement('payslipIncomeTaxYTD', `${formatMoney(ytd.incomeTax)}`);
    updateElement('payslipSocialInsuranceYTD', `${formatMoney(ytd.socialInsurance)}`);
    updateElement('payslipGESITYD', `${formatMoney(ytd.nhs)}`);
    updateElement('payslipTotalDeductionsYTD', `${formatMoney(ytd.totalDeductions)}`);
    
    // Update YTD values in contributions section
    updateElement('payslipEmployerSocialInsuranceYTD', `${formatMoney(ytd.employerContributions.socialInsurance)}`);
    updateElement('payslipHolidayFundYTD', `${formatMoney(ytd.holidayFund)}`);
    updateElement('payslipRedundancyYTD', `${formatMoney(ytd.employerContributions.redundancy)}`);
    updateElement('payslipIndustrialTrainingYTD', `${formatMoney(ytd.employerContributions.industrialTraining)}`);
    updateElement('payslipSocialCohesionYTD', `${formatMoney(ytd.employerContributions.socialCohesion)}`);
    updateElement('payslipEmployerGESITYD', `${formatMoney(ytd.employerContributions.nhs)}`);
    
    const totalContributionsYTD = ytd.holidayFund + 
                                 ytd.employerContributions.socialInsurance + 
                                 ytd.employerContributions.nhs + 
                                 ytd.employerContributions.socialCohesion + 
                                 ytd.employerContributions.redundancy + 
                                 ytd.employerContributions.industrialTraining;
    updateElement('payslipTotalContributionsYTD', `${formatMoney(totalContributionsYTD)}`);
    
    // Update YTD net pay
    updateElement('payslipNetPayYTD', `${formatMoney(ytd.totalPayable)}`);
        
        // Update payment details (if available)
        const employee = employees.find(emp => emp.employeeId === payslip.employeeId);
        if (employee) {
            updateElement('payslipPaymentMethod', employee.paymentMethod || 'Bank Transfer');
            updateElement('payslipBankName', employee.bankName || 'Not Specified');
            updateElement('payslipBankIBAN', employee.bankIBAN || 'Not Specified');
        }
    } catch (error) {
        console.error('Error updating payslip display:', error);
        showMessage('Error displaying payslip data', 'error');
    }
}

function savePayslip() {
    const employeeId = document.getElementById('payslipEmployee').value;
    const month = document.getElementById('payslipMonth').value;
    const year = document.getElementById('payslipYear').value;
    
    if (payrollData[`${employeeId}_${year}_${month}`]) {
        showMessage('Payslip saved successfully!', 'success');
    } else {
        showMessage('Please generate payslip first', 'error');
    }
}

function generatePayslipHTML(payslip) {
    const employee = employees.find(emp => emp.employeeId === payslip.employeeId);
    if (!employee) return '';
    
    // Calculate YTD
    const ytd = calculateYTDForPayslip(payslip.employeeId, payslip.year, payslip.month);
    
    // Format dates
    const monthName = getMonthName(parseInt(payslip.month)).toUpperCase();
    const payDate = payslip.payDate ? new Date(payslip.payDate).toLocaleDateString('en-GB') : 'N/A';
    
    // Calculate rates and hours
    const standardHours = payslip.standardHours || 170;
    const standardRate = standardHours > 0 ? ((payslip.basicSalary || 0) / standardHours) : 0;
    const { overtimeHours, overtimeRate } = payslipOvertimeHoursAndRate(payslip);
    
    const otherHourlyHoursVal = (payslip.otherHourlyHours != null && payslip.otherHourlyHours > 0) ? Number(payslip.otherHourlyHours) : 0;
    const otherHourlyRateVal = (payslip.otherHourlyRate != null && payslip.otherHourlyRate > 0) ? Number(payslip.otherHourlyRate) : 0;
    
    // Company info
    const companyName = companySettings.companyName || 'YOUR COMPANY NAME LTD';
    const companyAddress = companySettings.companyAddress || 'Your Company Address, City, Postal Code';
    const companyContact = `Phone: ${companySettings.companyPhone || '+357 XX XXX XXXX'}, Email: ${companySettings.companyEmail || 'info@yourcompany.com'}`;
    
    // Company logo
    let companyLogoHTML = '';
    if (companySettings.logoData) {
        companyLogoHTML = `<img id="payslipCompanyLogo" alt="Company Logo" class="company-logo-img" style="max-height: 90px; max-width: 180px;" src="${companySettings.logoData}">`;
    } else {
        companyLogoHTML = `<div id="payslipCompanyLogoText" class="company-logo-text" style="display: block;">${(companyName || 'COMPANY').substring(0, 10).toUpperCase()}</div>`;
    }
    
    // Calculate totals
    const netPayWithAdditional = (payslip.netPay || 0) + (payslip.additionalPay || 0) + (payslip.expenses || 0);
    const totalContributions = (payslip.holidayFund || 0) + 
                             (payslip.employerContributions?.socialInsurance || 0) + 
                             (payslip.employerContributions?.nhs || 0) + 
                             (payslip.employerContributions?.socialCohesion || 0) + 
                             (payslip.employerContributions?.redundancy || 0) + 
                             (payslip.employerContributions?.industrialTraining || 0);
    const totalContributionsYTD = ytd.holidayFund + 
                                 ytd.employerContributions.socialInsurance + 
                                 ytd.employerContributions.nhs + 
                                 ytd.employerContributions.socialCohesion + 
                                 ytd.employerContributions.redundancy + 
                                 ytd.employerContributions.industrialTraining;
    
    // Get the actual payslip HTML structure from the page
    const originalContainer = document.querySelector('.payslip-container');
    if (!originalContainer) return '';
    
    // Clone the structure
    const containerClone = originalContainer.cloneNode(true);
    
    // Update all the values in the cloned structure
    updateElementInNode(containerClone, 'payslipEmployeeName', payslip.employeeName);
    updateElementInNode(containerClone, 'payslipEmployeeId', payslip.employeeId);
    updateElementInNode(containerClone, 'payslipPeriod', monthName);
    updateElementInNode(containerClone, 'payslipPayDateDisplay', payDate);
    updateElementInNode(containerClone, 'payslipPayrollNumber', payslip.payrollNumber || 'N/A');
    updateElementInNode(containerClone, 'payslipSocialInsuranceNo', employee.socialInsurance || 'N/A');
    updateElementInNode(containerClone, 'payslipEmployeePhone', employee.phone || 'N/A');
    
    // Company info
    updateElementInNode(containerClone, 'payslipCompanyName', companyName);
    updateElementInNode(containerClone, 'payslipCompanyAddress', companyAddress);
    updateElementInNode(containerClone, 'payslipCompanyContact', companyContact);
    
    // Logo - handle both image and text properly
    const logoContainer = containerClone.querySelector('.company-logo');
    if (logoContainer) {
        if (companySettings.logoData) {
            // Show logo image, hide text
            const logoImg = containerClone.querySelector('#payslipCompanyLogo');
            const logoText = containerClone.querySelector('#payslipCompanyLogoText');
            if (logoImg) {
                logoImg.src = companySettings.logoData;
                logoImg.style.display = 'block';
                logoImg.style.visibility = 'visible';
            }
            if (logoText) {
                logoText.style.display = 'none';
                logoText.style.visibility = 'hidden';
            }
        } else {
            // Show text, hide image
            const logoImg = containerClone.querySelector('#payslipCompanyLogo');
            const logoText = containerClone.querySelector('#payslipCompanyLogoText');
            if (logoImg) {
                logoImg.style.display = 'none';
                logoImg.style.visibility = 'hidden';
            }
            if (logoText) {
                logoText.textContent = (companySettings.companyName || 'COMPANY').substring(0, 10).toUpperCase();
                logoText.style.display = 'block';
                logoText.style.visibility = 'visible';
            }
        }
    }
    
    // Earnings
    updateElementInNode(containerClone, 'payslipStandardHours', standardHours.toFixed(2));
    updateElementInNode(containerClone, 'payslipStandardRate', standardRate.toFixed(2));
    updateElementInNode(containerClone, 'payslipStandardCurrent', `${formatMoney((payslip.basicSalary || 0))}`);
    updateElementInNode(containerClone, 'payslipStandardYTD', `${formatMoney(ytd.basicSalary)}`);
    updateElementInNode(containerClone, 'payslipOvertimeHours', overtimeHours.toFixed(2));
    updateElementInNode(containerClone, 'payslipOvertimeRate', overtimeRate.toFixed(2));
    updateElementInNode(containerClone, 'payslipOvertimeCurrent', `${formatMoney((payslip.overtime || 0))}`);
    updateElementInNode(containerClone, 'payslipOvertimeYTD', `${formatMoney(ytd.overtime)}`);
    updateElementInNode(containerClone, 'payslipOtherHourlyHours', otherHourlyHoursVal.toFixed(2));
    updateElementInNode(containerClone, 'payslipOtherHourlyRate', otherHourlyRateVal.toFixed(2));
    updateElementInNode(containerClone, 'payslipOtherHourlyCurrent', `${formatMoney((payslip.otherHourly || 0))}`);
    updateElementInNode(containerClone, 'payslipOtherHourlyYTD', `${formatMoney(ytd.otherHourly)}`);
    updateElementInNode(containerClone, 'payslipCommissionCurrent', `${formatMoney(((payslip.commission || 0) + (payslip.bonus || 0)))}`);
    updateElementInNode(containerClone, 'payslipCommissionYTD', `${formatMoney((ytd.commission + ytd.bonus))}`);
    updateElementInNode(containerClone, 'payslipSickPayCurrent', `${formatMoney((payslip.sickPay || 0))}`);
    updateElementInNode(containerClone, 'payslipSickPayYTD', `${formatMoney(ytd.sickPay)}`);
    updateElementInNode(containerClone, 'payslipExpensesCurrent', `${formatMoney((payslip.expenses || 0))}`);
    updateElementInNode(containerClone, 'payslipExpensesYTD', `${formatMoney(ytd.expenses)}`);
    updateElementInNode(containerClone, 'payslipGrossPayCurrent', `${formatMoney((payslip.grossSalary || 0))}`);
    updateElementInNode(containerClone, 'payslipGrossPayYTD', `${formatMoney(ytd.grossSalary)}`);
    
    // Deductions
    const incomeTaxBreakdownClone = resolveIncomeTaxBreakdownForPayslip(payslip);
    const incomeTaxMonthlyClone = incomeTaxBreakdownClone
        ? incomeTaxBreakdownClone.monthlyTax
        : (payslip.incomeTax || 0);
    updateElementInNode(containerClone, 'payslipIncomeTaxCurrent', `${formatMoney(incomeTaxMonthlyClone)}`);
    updateIncomeTaxBreakdownUI(incomeTaxBreakdownClone, containerClone);
    updateElementInNode(containerClone, 'payslipIncomeTaxYTD', `${formatMoney(ytd.incomeTax)}`);
    updateElementInNode(containerClone, 'payslipSocialInsuranceCurrent', `${formatMoney((payslip.socialInsurance || 0))}`);
    updateElementInNode(containerClone, 'payslipSocialInsuranceYTD', `${formatMoney(ytd.socialInsurance)}`);
    updateElementInNode(containerClone, 'payslipGESICurrent', `${formatMoney((payslip.nhs || 0))}`);
    updateElementInNode(containerClone, 'payslipGESITYD', `${formatMoney(ytd.nhs)}`);
    updateElementInNode(
        containerClone,
        'payslipTotalDeductionsCurrent',
        `${formatMoney((incomeTaxMonthlyClone + (payslip.socialInsurance || 0) + (payslip.nhs || 0)))}`
    );
    updateElementInNode(containerClone, 'payslipTotalDeductionsYTD', `${formatMoney(ytd.totalDeductions)}`);
    
    // Contributions
    updateElementInNode(containerClone, 'payslipEmployerSocialInsuranceCurrent', `${formatMoney((payslip.employerContributions?.socialInsurance || 0))}`);
    updateElementInNode(containerClone, 'payslipEmployerSocialInsuranceYTD', `${formatMoney(ytd.employerContributions.socialInsurance)}`);
    updateElementInNode(containerClone, 'payslipHolidayFundCurrent', `${formatMoney((payslip.holidayFund || 0))}`);
    updateElementInNode(containerClone, 'payslipHolidayFundYTD', `${formatMoney(ytd.holidayFund)}`);
    updateElementInNode(containerClone, 'payslipRedundancyCurrent', `${formatMoney((payslip.employerContributions?.redundancy || 0))}`);
    updateElementInNode(containerClone, 'payslipRedundancyYTD', `${formatMoney(ytd.employerContributions.redundancy)}`);
    updateElementInNode(containerClone, 'payslipIndustrialTrainingCurrent', `${formatMoney((payslip.employerContributions?.industrialTraining || 0))}`);
    updateElementInNode(containerClone, 'payslipIndustrialTrainingYTD', `${formatMoney(ytd.employerContributions.industrialTraining)}`);
    updateElementInNode(containerClone, 'payslipSocialCohesionCurrent', `${formatMoney((payslip.employerContributions?.socialCohesion || 0))}`);
    updateElementInNode(containerClone, 'payslipSocialCohesionYTD', `${formatMoney(ytd.employerContributions.socialCohesion)}`);
    updateElementInNode(containerClone, 'payslipEmployerGESICurrent', `${formatMoney((payslip.employerContributions?.nhs || 0))}`);
    updateElementInNode(containerClone, 'payslipEmployerGESITYD', `${formatMoney(ytd.employerContributions.nhs)}`);
    updateElementInNode(containerClone, 'payslipTotalContributionsCurrent', `${formatMoney(totalContributions)}`);
    updateElementInNode(containerClone, 'payslipTotalContributionsYTD', `${formatMoney(totalContributionsYTD)}`);
    
    // Net Pay
    updateElementInNode(containerClone, 'payslipNetPayCurrent', `${formatMoney(netPayWithAdditional)}`);
    updateElementInNode(containerClone, 'payslipNetPayYTD', `${formatMoney(ytd.totalPayable)}`);
    
    // Payment details
    updateElementInNode(containerClone, 'payslipPaymentMethod', employee.paymentMethod || 'Bank Transfer');
    updateElementInNode(containerClone, 'payslipBankName', employee.bankName || 'Not Specified');
    updateElementInNode(containerClone, 'payslipBankIBAN', employee.bankIBAN || 'Not Specified');
    
    // Footer
    const footer = containerClone.querySelector('.payslip-footer p');
    if (footer) {
        footer.textContent = `If you have any questions about this payslip, please contact: [${companyName}, ${companySettings.companyPhone || ''}, ${companySettings.companyEmail || ''}]`;
    }
    
    return containerClone.outerHTML;
}

function updateElementInNode(node, id, value) {
    const element = node.querySelector(`#${id}`);
    if (element) {
        if (element.tagName === 'IMG' && id === 'payslipCompanyLogo') {
            element.src = value;
            element.style.display = value ? 'block' : 'none';
        } else if (element.tagName === 'DIV' && id === 'payslipCompanyLogoText') {
            element.textContent = value;
            element.style.display = value ? 'block' : 'none';
        } else {
            element.textContent = value;
        }
    }
}

function printBulkPayslips() {
    const yearFilter = document.getElementById('payslipFilterYear').value;
    const monthFilter = document.getElementById('payslipFilterMonth').value;
    
    if (!yearFilter || !monthFilter) {
        showMessage('Please select both Year and Month to print payslips', 'error');
        return;
    }
    
    // Get all payslips for the selected month/year
    const filteredPayslips = Object.values(payrollData).filter(payslip => {
        return payslip.year.toString() === yearFilter && payslip.month.toString() === monthFilter;
    });
    
    if (filteredPayslips.length === 0) {
        showMessage('No payslips found for the selected month', 'error');
        return;
    }
    
    // Sort by employee name for consistent ordering
    filteredPayslips.sort((a, b) => {
        return a.employeeName.localeCompare(b.employeeName);
    });
    
    // Get the original payslip container to use as template
    const originalContainer = document.querySelector('.payslip-container');
    if (!originalContainer) {
        showMessage('Payslip template not found. Please generate a payslip first.', 'error');
        return;
    }
    
    // Create a container for bulk printing
    let bulkPrintContainer = document.getElementById('bulkPrintContainer');
    if (!bulkPrintContainer) {
        bulkPrintContainer = document.createElement('div');
        bulkPrintContainer.id = 'bulkPrintContainer';
        bulkPrintContainer.style.display = 'none';
        document.body.appendChild(bulkPrintContainer);
    }
    
    // Clear previous content
    bulkPrintContainer.innerHTML = '';
    
    // Clone and populate each payslip
    filteredPayslips.forEach((payslip, index) => {
        const containerClone = originalContainer.cloneNode(true);
        containerClone.style.pageBreakAfter = index < filteredPayslips.length - 1 ? 'always' : 'auto';
        
        // Populate the cloned container with payslip data
        populatePayslipInContainer(containerClone, payslip);
        
        bulkPrintContainer.appendChild(containerClone);
    });
    
    // Show the bulk print container and hide everything else temporarily
    const originalDisplay = bulkPrintContainer.style.display;
    bulkPrintContainer.style.display = 'block';
    
    // Store original visibility of other elements
    const payslipResult = document.getElementById('payslipResult');
    const originalPayslipResultDisplay = payslipResult ? payslipResult.style.display : 'none';
    
    // Hide the main payslip result if visible
    if (payslipResult) {
        payslipResult.style.display = 'none';
    }
    
    // Print
    window.print();
    
    // Restore original state after a short delay
    setTimeout(() => {
        bulkPrintContainer.style.display = originalDisplay;
        if (payslipResult) {
            payslipResult.style.display = originalPayslipResultDisplay;
        }
    }, 100);
}

function populatePayslipInContainer(container, payslip) {
    const employee = employees.find(emp => emp.employeeId === payslip.employeeId);
    if (!employee) return;
    
    // Calculate YTD
    const ytd = calculateYTDForPayslip(payslip.employeeId, payslip.year, payslip.month);
    
    // Format dates
    const monthName = getMonthName(parseInt(payslip.month)).toUpperCase();
    const payDate = payslip.payDate ? new Date(payslip.payDate).toLocaleDateString('en-GB') : 'N/A';
    
    // Calculate rates and hours
    const standardHours = payslip.standardHours || 170;
    const standardRate = standardHours > 0 ? ((payslip.basicSalary || 0) / standardHours) : 0;
    const { overtimeHours, overtimeRate } = payslipOvertimeHoursAndRate(payslip);
    
    const otherHourlyHoursVal = (payslip.otherHourlyHours != null && payslip.otherHourlyHours > 0) ? Number(payslip.otherHourlyHours) : 0;
    const otherHourlyRateVal = (payslip.otherHourlyRate != null && payslip.otherHourlyRate > 0) ? Number(payslip.otherHourlyRate) : 0;
    
    // Calculate totals
    const netPayWithAdditional = (payslip.netPay || 0) + (payslip.additionalPay || 0) + (payslip.expenses || 0);
    const totalContributions = (payslip.holidayFund || 0) + 
                             (payslip.employerContributions?.socialInsurance || 0) + 
                             (payslip.employerContributions?.nhs || 0) + 
                             (payslip.employerContributions?.socialCohesion || 0) + 
                             (payslip.employerContributions?.redundancy || 0) + 
                             (payslip.employerContributions?.industrialTraining || 0);
    const totalContributionsYTD = ytd.holidayFund + 
                                 ytd.employerContributions.socialInsurance + 
                                 ytd.employerContributions.nhs + 
                                 ytd.employerContributions.socialCohesion + 
                                 ytd.employerContributions.redundancy + 
                                 ytd.employerContributions.industrialTraining;
    
    // Update all elements using the existing updateElement function logic
    updateElementInNode(container, 'payslipEmployeeName', payslip.employeeName);
    updateElementInNode(container, 'payslipEmployeeId', payslip.employeeId);
    updateElementInNode(container, 'payslipPeriod', monthName);
    updateElementInNode(container, 'payslipPayDateDisplay', payDate);
    updateElementInNode(container, 'payslipPayrollNumber', payslip.payrollNumber || 'N/A');
    updateElementInNode(container, 'payslipSocialInsuranceNo', employee.socialInsurance || 'N/A');
    updateElementInNode(container, 'payslipEmployeePhone', employee.phone || 'N/A');
    
    // Company info
    updateElementInNode(container, 'payslipCompanyName', companySettings.companyName || 'YOUR COMPANY NAME LTD');
    updateElementInNode(container, 'payslipCompanyAddress', companySettings.companyAddress || 'Your Company Address, City, Postal Code');
    updateElementInNode(container, 'payslipCompanyContact', `Phone: ${companySettings.companyPhone || '+357 XX XXX XXXX'}, Email: ${companySettings.companyEmail || 'info@yourcompany.com'}`);
    
    // Logo - ensure it's properly set up for printing
    const logoContainer = container.querySelector('.company-logo');
    if (logoContainer) {
        if (companySettings.logoData) {
            const logoImg = container.querySelector('#payslipCompanyLogo');
            if (logoImg) {
                logoImg.src = companySettings.logoData;
                logoImg.style.display = 'block';
                logoImg.style.visibility = 'visible';
                logoImg.style.maxHeight = '90px';
                logoImg.style.maxWidth = '180px';
                logoImg.setAttribute('data-logo-present', 'true');
            }
            const logoText = container.querySelector('#payslipCompanyLogoText');
            if (logoText) {
                logoText.style.display = 'none';
                logoText.style.visibility = 'hidden';
                logoText.style.opacity = '0';
                logoText.textContent = '';
            }
        } else {
            const logoImg = container.querySelector('#payslipCompanyLogo');
            if (logoImg) {
                logoImg.style.display = 'none';
                logoImg.style.visibility = 'hidden';
            }
            const logoText = container.querySelector('#payslipCompanyLogoText');
            if (logoText) {
                logoText.textContent = (companySettings.companyName || 'COMPANY').substring(0, 10).toUpperCase();
                logoText.style.display = 'block';
                logoText.style.visibility = 'visible';
            }
        }
        // Ensure logo container is visible
        logoContainer.style.display = 'flex';
        logoContainer.style.visibility = 'visible';
    }
    
    // Earnings
    updateElementInNode(container, 'payslipStandardHours', standardHours.toFixed(2));
    updateElementInNode(container, 'payslipStandardRate', standardRate.toFixed(2));
    updateElementInNode(container, 'payslipStandardCurrent', `${formatMoney((payslip.basicSalary || 0))}`);
    updateElementInNode(container, 'payslipStandardYTD', `${formatMoney(ytd.basicSalary)}`);
    updateElementInNode(container, 'payslipOvertimeHours', overtimeHours.toFixed(2));
    updateElementInNode(container, 'payslipOvertimeRate', overtimeRate.toFixed(2));
    updateElementInNode(container, 'payslipOvertimeCurrent', `${formatMoney((payslip.overtime || 0))}`);
    updateElementInNode(container, 'payslipOvertimeYTD', `${formatMoney(ytd.overtime)}`);
    updateElementInNode(container, 'payslipOtherHourlyHours', otherHourlyHoursVal.toFixed(2));
    updateElementInNode(container, 'payslipOtherHourlyRate', otherHourlyRateVal.toFixed(2));
    updateElementInNode(container, 'payslipOtherHourlyCurrent', `${formatMoney((payslip.otherHourly || 0))}`);
    updateElementInNode(container, 'payslipOtherHourlyYTD', `${formatMoney(ytd.otherHourly)}`);
    updateElementInNode(container, 'payslipCommissionCurrent', `${formatMoney(((payslip.commission || 0) + (payslip.bonus || 0)))}`);
    updateElementInNode(container, 'payslipCommissionYTD', `${formatMoney((ytd.commission + ytd.bonus))}`);
    updateElementInNode(container, 'payslipSickPayCurrent', `${formatMoney((payslip.sickPay || 0))}`);
    updateElementInNode(container, 'payslipSickPayYTD', `${formatMoney(ytd.sickPay)}`);
    updateElementInNode(container, 'payslipExpensesCurrent', `${formatMoney((payslip.expenses || 0))}`);
    updateElementInNode(container, 'payslipExpensesYTD', `${formatMoney(ytd.expenses)}`);
    updateElementInNode(container, 'payslipGrossPayCurrent', `${formatMoney((payslip.grossSalary || 0))}`);
    updateElementInNode(container, 'payslipGrossPayYTD', `${formatMoney(ytd.grossSalary)}`);
    
    // Deductions
    const incomeTaxBreakdownBulk = resolveIncomeTaxBreakdownForPayslip(payslip);
    const incomeTaxMonthlyBulk = incomeTaxBreakdownBulk
        ? incomeTaxBreakdownBulk.monthlyTax
        : (payslip.incomeTax || 0);
    updateElementInNode(container, 'payslipIncomeTaxCurrent', `${formatMoney(incomeTaxMonthlyBulk)}`);
    updateIncomeTaxBreakdownUI(incomeTaxBreakdownBulk, container);
    updateElementInNode(container, 'payslipIncomeTaxYTD', `${formatMoney(ytd.incomeTax)}`);
    updateElementInNode(container, 'payslipSocialInsuranceCurrent', `${formatMoney((payslip.socialInsurance || 0))}`);
    updateElementInNode(container, 'payslipSocialInsuranceYTD', `${formatMoney(ytd.socialInsurance)}`);
    updateElementInNode(container, 'payslipGESICurrent', `${formatMoney((payslip.nhs || 0))}`);
    updateElementInNode(container, 'payslipGESITYD', `${formatMoney(ytd.nhs)}`);
    updateElementInNode(
        container,
        'payslipTotalDeductionsCurrent',
        `${formatMoney((incomeTaxMonthlyBulk + (payslip.socialInsurance || 0) + (payslip.nhs || 0)))}`
    );
    updateElementInNode(container, 'payslipTotalDeductionsYTD', `${formatMoney(ytd.totalDeductions)}`);
    
    // Contributions
    updateElementInNode(container, 'payslipEmployerSocialInsuranceCurrent', `${formatMoney((payslip.employerContributions?.socialInsurance || 0))}`);
    updateElementInNode(container, 'payslipEmployerSocialInsuranceYTD', `${formatMoney(ytd.employerContributions.socialInsurance)}`);
    updateElementInNode(container, 'payslipHolidayFundCurrent', `${formatMoney((payslip.holidayFund || 0))}`);
    updateElementInNode(container, 'payslipHolidayFundYTD', `${formatMoney(ytd.holidayFund)}`);
    updateElementInNode(container, 'payslipRedundancyCurrent', `${formatMoney((payslip.employerContributions?.redundancy || 0))}`);
    updateElementInNode(container, 'payslipRedundancyYTD', `${formatMoney(ytd.employerContributions.redundancy)}`);
    updateElementInNode(container, 'payslipIndustrialTrainingCurrent', `${formatMoney((payslip.employerContributions?.industrialTraining || 0))}`);
    updateElementInNode(container, 'payslipIndustrialTrainingYTD', `${formatMoney(ytd.employerContributions.industrialTraining)}`);
    updateElementInNode(container, 'payslipSocialCohesionCurrent', `${formatMoney((payslip.employerContributions?.socialCohesion || 0))}`);
    updateElementInNode(container, 'payslipSocialCohesionYTD', `${formatMoney(ytd.employerContributions.socialCohesion)}`);
    updateElementInNode(container, 'payslipEmployerGESICurrent', `${formatMoney((payslip.employerContributions?.nhs || 0))}`);
    updateElementInNode(container, 'payslipEmployerGESITYD', `${formatMoney(ytd.employerContributions.nhs)}`);
    updateElementInNode(container, 'payslipTotalContributionsCurrent', `${formatMoney(totalContributions)}`);
    updateElementInNode(container, 'payslipTotalContributionsYTD', `${formatMoney(totalContributionsYTD)}`);
    
    // Net Pay
    updateElementInNode(container, 'payslipNetPayCurrent', `${formatMoney(netPayWithAdditional)}`);
    updateElementInNode(container, 'payslipNetPayYTD', `${formatMoney(ytd.totalPayable)}`);
    
    // Payment details
    updateElementInNode(container, 'payslipPaymentMethod', employee.paymentMethod || 'Bank Transfer');
    updateElementInNode(container, 'payslipBankName', employee.bankName || 'Not Specified');
    updateElementInNode(container, 'payslipBankIBAN', employee.bankIBAN || 'Not Specified');
    
    // Footer
    const footer = container.querySelector('.payslip-footer p');
    if (footer) {
        const companyName = companySettings.companyName || 'YOUR COMPANY NAME LTD';
        footer.textContent = `If you have any questions about this payslip, please contact: [${companyName}, ${companySettings.companyPhone || ''}, ${companySettings.companyEmail || ''}]`;
    }
}

// Year to Date Functions
function calculateYTDForPayslip(employeeId, year, month) {
    // Calculate YTD up to and including the specified month
    let ytd = {
        basicSalary: 0,
        overtime: 0,
        otherHourly: 0,
        commission: 0,
        bonus: 0,
        sickPay: 0,
        expenses: 0,
        grossSalary: 0,
        incomeTax: 0,
        socialInsurance: 0,
        nhs: 0,
        holidayFund: 0,
        totalDeductions: 0,
        netPay: 0,
        totalPayable: 0,
        employerContributions: {
            socialInsurance: 0,
            nhs: 0,
            socialCohesion: 0,
            redundancy: 0,
            industrialTraining: 0
        }
    };
    
    const monthNum = parseInt(month);
    
    // Sum all payslips from January (01) up to and including the specified month
    for (let m = 1; m <= monthNum; m++) {
        const monthStr = m.toString().padStart(2, '0');
        const payrollKey = `${employeeId}_${year}_${monthStr}`;
        
        if (payrollData[payrollKey]) {
            const data = payrollData[payrollKey];
            ytd.basicSalary += data.basicSalary || 0;
            ytd.overtime += data.overtime || 0;
            ytd.otherHourly += data.otherHourly || 0;
            ytd.commission += data.commission || 0;
            ytd.bonus += data.bonus || 0;
            ytd.sickPay += data.sickPay || 0;
            ytd.expenses += data.expenses || 0;
            ytd.grossSalary += data.grossSalary || 0;
            ytd.incomeTax += data.incomeTax || 0;
            ytd.socialInsurance += data.socialInsurance || 0;
            ytd.nhs += (data.nhs || 0);
            ytd.holidayFund += data.holidayFund || 0;
            ytd.totalDeductions += data.totalDeductions || 0;
            ytd.netPay += data.netPay || 0;
            // Calculate net pay with additional pay and expenses for this month
            // Calculate exactly as displayed: netPay + additionalPay + expenses, then round to 2 decimals
            const monthlyNetPay = (data.netPay || 0) + (data.additionalPay || 0) + (data.expenses || 0);
            // Round to 2 decimals to match displayed format, then add to YTD
            ytd.totalPayable += parseFloat(monthlyNetPay.toFixed(2));
            
            if (data.employerContributions) {
                ytd.employerContributions.socialInsurance += data.employerContributions.socialInsurance || 0;
                ytd.employerContributions.nhs += data.employerContributions.nhs || 0;
                ytd.employerContributions.socialCohesion += data.employerContributions.socialCohesion || 0;
                ytd.employerContributions.redundancy += data.employerContributions.redundancy || 0;
                ytd.employerContributions.industrialTraining += data.employerContributions.industrialTraining || 0;
            }
        }
    }
    
    return ytd;
}

function updateYTDDisplay() {
    const year = document.getElementById('ytdYear').value;
    const employeeId = document.getElementById('ytdEmployee').value;
    
    let totalGross = 0;
    let totalTax = 0;
    let totalSocialInsurance = 0;
    let totalHolidayFund = 0;
    
    const ytdTableBody = document.getElementById('ytdTableBody');
    ytdTableBody.innerHTML = '';
    
    const filteredEmployees = employeeId ? 
        employees.filter(emp => emp.employeeId === employeeId) : 
        employees;
    
    filteredEmployees.forEach(employee => {
        let employeeGross = 0;
        let employeeTax = 0;
        let employeeSocialInsurance = 0;
        let employeeHolidayFund = 0;
        let employeeNHS = 0;
        
        // Calculate year-to-date for this employee - only from actual payslip data
        for (let month = 1; month <= 12; month++) {
            const monthStr = month.toString().padStart(2, '0');
            const payrollKey = `${employee.employeeId}_${year}_${monthStr}`;
            
            if (payrollData[payrollKey]) {
                const data = payrollData[payrollKey];
                employeeGross += data.grossSalary;
                employeeTax += data.incomeTax;
                employeeSocialInsurance += data.socialInsurance;
                employeeHolidayFund += data.holidayFund;
                employeeNHS += data.nhs || 0;
            }
            // Only use actual payslip data - no estimates for missing months
        }
        
        const employeeNet = employeeGross - employeeTax - employeeSocialInsurance - employeeNHS;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${employee.firstName} ${employee.lastName}</td>
            <td>${formatMoney(employeeGross)}</td>
            <td>${formatMoney(employeeTax)}</td>
            <td>${formatMoney(employeeSocialInsurance)}</td>
            <td>${formatMoney(employeeHolidayFund)}</td>
            <td>${formatMoney(employeeNHS)}</td>
            <td>${formatMoney(employeeNet)}</td>
        `;
        ytdTableBody.appendChild(row);
        
        totalGross += employeeGross;
        totalTax += employeeTax;
        totalSocialInsurance += employeeSocialInsurance;
        totalHolidayFund += employeeHolidayFund;
    });
    
    // Update summary cards
    document.getElementById('totalGrossPay').textContent = `${formatMoney(totalGross)}`;
    document.getElementById('totalTaxDeducted').textContent = `${formatMoney(totalTax)}`;
    document.getElementById('totalSocialInsurance').textContent = `${formatMoney(totalSocialInsurance)}`;
    document.getElementById('totalHolidayFund').textContent = `${formatMoney(totalHolidayFund)}`;
}

function getEmployeePayrollYTDTotals(employeeId, year) {
    const y = String(year);
    const totals = {
        grossSalary: 0,
        incomeTax: 0,
        socialInsurance: 0,
        holidayFund: 0,
        nhs: 0,
        netPay: 0
    };
    for (let month = 1; month <= 12; month++) {
        const monthStr = month.toString().padStart(2, '0');
        const payrollKey = `${employeeId}_${y}_${monthStr}`;
        if (payrollData[payrollKey]) {
            const data = payrollData[payrollKey];
            totals.grossSalary += data.grossSalary || 0;
            totals.incomeTax += data.incomeTax || 0;
            totals.socialInsurance += data.socialInsurance || 0;
            totals.holidayFund += data.holidayFund || 0;
            totals.nhs += data.nhs || 0;
        }
    }
    totals.netPay = totals.grossSalary - totals.incomeTax - totals.socialInsurance - totals.nhs;
    return totals;
}
window.getEmployeePayrollYTDTotals = getEmployeePayrollYTDTotals;

function updateSocialInsuranceYTDDisplay() {
    const yearEl = document.getElementById('siYtdYear');
    const employeeEl = document.getElementById('siYtdEmployee');
    const tableBody = document.getElementById('siYtdTableBody');
    if (!yearEl || !tableBody) return;

    const year = yearEl.value;
    const employeeId = employeeEl ? employeeEl.value : '';

    let totalGross = 0;
    let totalEmployeeSI = 0;
    let totalEmployerSI = 0;

    tableBody.innerHTML = '';

    const filteredEmployees = employeeId
        ? employees.filter(emp => emp.employeeId === employeeId)
        : employees;

    filteredEmployees.forEach(employee => {
        let employeeGross = 0;
        let employeeSI = 0;
        let employerSI = 0;

        for (let month = 1; month <= 12; month++) {
            const monthStr = month.toString().padStart(2, '0');
            const payrollKey = `${employee.employeeId}_${year}_${monthStr}`;
            if (payrollData[payrollKey]) {
                const data = payrollData[payrollKey];
                employeeGross += data.grossSalary || 0;
                employeeSI += data.socialInsurance || 0;
                if (data.employerContributions) {
                    employerSI += data.employerContributions.socialInsurance || 0;
                }
            }
        }

        if (employeeGross <= 0 && employeeSI <= 0 && employerSI <= 0) return;

        const totalSI = employeeSI + employerSI;
        totalGross += employeeGross;
        totalEmployeeSI += employeeSI;
        totalEmployerSI += employerSI;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${employee.firstName} ${employee.lastName}</td>
            <td>${employee.socialInsurance || '—'}</td>
            <td>${formatMoney(employeeGross)}</td>
            <td>${formatMoney(employeeSI)}</td>
            <td>${formatMoney(employerSI)}</td>
            <td>${formatMoney(totalSI)}</td>
        `;
        tableBody.appendChild(row);
    });

    if (filteredEmployees.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:1.5rem;color:#666;">No employees found. Add employees in HR → Employees.</td></tr>';
    } else if (!tableBody.children.length) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:1.5rem;color:#666;">No payslip data for the selected year. Generate payslips in Accounting → Payroll.</td></tr>';
    }

    const setSummary = (id, amount) => {
        const el = document.getElementById(id);
        if (el) el.textContent = formatMoney(amount);
    };
    setSummary('siTotalEmployee', totalEmployeeSI);
    setSummary('siTotalEmployer', totalEmployerSI);
    setSummary('siTotalCombined', totalEmployeeSI + totalEmployerSI);
    setSummary('siTotalGross', totalGross);
}
window.updateSocialInsuranceYTDDisplay = updateSocialInsuranceYTDDisplay;

function collectMonthlyPayrollData(year, month) {
    const monthNorm = String(month).padStart(2, '0');
    const rows = [];
    const totals = {
        gross: 0,
        holidayFund: 0,
        employeeSI: 0,
        nhs: 0,
        expenses: 0,
        netPay: 0,
        tax: 0,
        employerSI: 0,
        employerNHS: 0,
        employerSocialCohesion: 0,
        employerRedundancy: 0,
        employerIndustrialTraining: 0,
        employerContributions: 0,
        employeeDeductions: 0,
        payrollCost: 0
    };

    employees.forEach(employee => {
        const found = findPayslip(employee.employeeId, year, monthNorm);
        if (!found) return;
        const payroll = found.payslip;
        const netPayWithExtras = (payroll.netPay || 0) + (payroll.additionalPay || 0) + (payroll.expenses || 0);

        rows.push({ employee, payroll, netPayWithExtras });

        totals.gross += payroll.grossSalary || 0;
        totals.holidayFund += payroll.holidayFund || 0;
        totals.employeeSI += payroll.socialInsurance || 0;
        totals.nhs += payroll.nhs || 0;
        totals.expenses += payroll.expenses || 0;
        totals.netPay += netPayWithExtras;
        totals.tax += payroll.incomeTax || 0;

        if (payroll.employerContributions) {
            totals.employerSI += payroll.employerContributions.socialInsurance || 0;
            totals.employerNHS += payroll.employerContributions.nhs || 0;
            totals.employerSocialCohesion += payroll.employerContributions.socialCohesion || 0;
            totals.employerRedundancy += payroll.employerContributions.redundancy || 0;
            totals.employerIndustrialTraining += payroll.employerContributions.industrialTraining || 0;
        }
    });

    totals.employerContributions = totals.employerSI + totals.employerNHS +
        totals.employerSocialCohesion + totals.employerRedundancy +
        totals.employerIndustrialTraining + totals.holidayFund;
    totals.employeeDeductions = totals.tax + totals.employeeSI + totals.nhs;
    totals.payrollCost = totals.gross + totals.employerContributions;

    return { rows, totals, monthNorm, year };
}

function getMergedCompanySettingsForReports() {
    try {
        var stored = localStorage.getItem('companySettings');
        if (stored) companySettings = Object.assign({}, companySettings, JSON.parse(stored));
    } catch (e) {}
    var cs = Object.assign({}, companySettings);
    if (typeof window.AccountingData !== 'undefined' && window.AccountingData.getCompanySettings) {
        var main = window.AccountingData.getCompanySettings();
        if (main) {
            cs.companyName = main.companyName || cs.companyName;
            cs.companyAddress = main.companyAddress || cs.companyAddress;
            cs.companyPhone = main.companyPhone || cs.companyPhone;
            cs.companyEmail = main.companyEmail || cs.companyEmail;
            cs.companyWebsite = main.companyWebsite || cs.companyWebsite;
            cs.companyTaxId = main.companyTaxId || cs.companyTaxId;
            cs.companyRegistration = main.companyRegistration || cs.companyRegistration;
            if (main.logo && main.logo.toString().startsWith('data:')) cs.logoData = main.logo;
        }
    }
    return cs;
}

function buildSocialInsuranceCompanyHeaderHtml(monthName, year) {
    const cs = getMergedCompanySettingsForReports();
    const name = cs.companyName || 'Company name';
    const addressLines = (cs.companyAddress || '').split('\n').filter(Boolean)
        .map(function (line) { return escapeEmployeeHtml(line); }).join('<br>');
    const contactParts = [];
    if (cs.companyPhone) contactParts.push('Tel: ' + escapeEmployeeHtml(cs.companyPhone));
    if (cs.companyEmail) contactParts.push('Email: ' + escapeEmployeeHtml(cs.companyEmail));
    if (cs.companyWebsite) contactParts.push('Web: ' + escapeEmployeeHtml(cs.companyWebsite));
    const taxParts = [];
    if (cs.companyTaxId) taxParts.push('TIN: ' + escapeEmployeeHtml(cs.companyTaxId));
    if (cs.companyRegistration) taxParts.push('Reg: ' + escapeEmployeeHtml(cs.companyRegistration));
    const logo = cs.logoData || '';
    const logoHtml = logo
        ? `<img src="${logo}" alt="" class="si-monthly-header-logo-img">`
        : `<div class="si-monthly-header-logo-text">${escapeEmployeeHtml((name || 'CO').substring(0, 12).toUpperCase())}</div>`;

    return `
        <header class="si-monthly-company-header">
            <div class="si-monthly-header-logo">${logoHtml}</div>
            <div class="si-monthly-header-info">
                <h1 class="si-monthly-header-name">${escapeEmployeeHtml(name)}</h1>
                ${addressLines ? `<p class="si-monthly-header-address">${addressLines}</p>` : ''}
                ${contactParts.length ? `<p class="si-monthly-header-contact">${contactParts.join(' · ')}</p>` : ''}
                ${taxParts.length ? `<p class="si-monthly-header-tax">${taxParts.join(' · ')}</p>` : ''}
            </div>
            <div class="si-monthly-header-doc">
                <div class="si-monthly-header-doc-title">Social insurance return</div>
                <div class="si-monthly-header-doc-period">${escapeEmployeeHtml(monthName)} ${escapeEmployeeHtml(year)}</div>
            </div>
        </header>`;
}

function buildSocialInsuranceMonthlyReportHtml(period) {
    if (!period || period.indexOf('-') === -1) {
        return '<p class="si-monthly-empty">Select a month to generate the return.</p>';
    }

    const parts = period.split('-');
    const year = parts[0];
    const month = parts[1];
    const data = collectMonthlyPayrollData(year, month);

    if (!data.rows.length) {
        return '<p class="si-monthly-empty">No payslips found for <strong>' + escapeEmployeeHtml(getMonthName(month)) + ' ' + escapeEmployeeHtml(year) + '</strong>. Generate payslips in Accounting → Payroll first.</p>';
    }

    const t = data.totals;
    let employeeRows = '';
    data.rows.forEach(({ employee, payroll, netPayWithExtras }) => {
        employeeRows += `
            <tr>
                <td>${escapeEmployeeHtml(employee.firstName + ' ' + employee.lastName)}</td>
                <td>${escapeEmployeeHtml(employee.employeeId || '—')}</td>
                <td>${escapeEmployeeHtml(employee.socialInsurance || '—')}</td>
                <td>${formatMoney(payroll.grossSalary || 0)}</td>
                <td>${formatMoney(payroll.holidayFund || 0)}</td>
                <td>${formatMoney(payroll.socialInsurance || 0)}</td>
                <td>${formatMoney(payroll.nhs || 0)}</td>
                <td>${formatMoney(payroll.expenses || 0)}</td>
                <td>${formatMoney(netPayWithExtras)}</td>
            </tr>`;
    });

    return `
        <div class="si-monthly-report-inner" id="siMonthlyReportPrintArea">
            ${buildSocialInsuranceCompanyHeaderHtml(getMonthName(month), year)}

            <h4 class="si-monthly-section-title">Employees</h4>
            <div class="si-monthly-table-wrap">
                <table class="table-container si-monthly-table si-monthly-table--employees">
                    <thead>
                        <tr>
                            <th>Employee name</th>
                            <th>Employee ID</th>
                            <th>Social insurance no.</th>
                            <th>Gross amount</th>
                            <th>Holiday funds</th>
                            <th>Social insurance (employee)</th>
                            <th>NHS (employee)</th>
                            <th>Expenses</th>
                            <th>Net pay</th>
                        </tr>
                    </thead>
                    <tbody>${employeeRows}</tbody>
                    <tfoot>
                        <tr class="si-monthly-total-row">
                            <td colspan="3"><strong>Total</strong></td>
                            <td>${formatMoney(t.gross)}</td>
                            <td>${formatMoney(t.holidayFund)}</td>
                            <td>${formatMoney(t.employeeSI)}</td>
                            <td>${formatMoney(t.nhs)}</td>
                            <td>${formatMoney(t.expenses)}</td>
                            <td>${formatMoney(t.netPay)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            <h4 class="si-monthly-section-title">Social insurance &amp; contributions</h4>
            <div class="si-monthly-table-wrap">
                <table class="table-container si-monthly-table si-monthly-table--contributions">
                    <thead>
                        <tr>
                            <th>Contribution type</th>
                            <th>Employee</th>
                            <th>Employer</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><strong>Social insurance</strong></td>
                            <td>${formatMoney(t.employeeSI)}</td>
                            <td>${formatMoney(t.employerSI)}</td>
                            <td><strong>${formatMoney(t.employeeSI + t.employerSI)}</strong></td>
                        </tr>
                        <tr>
                            <td><strong>NHS</strong></td>
                            <td>${formatMoney(t.nhs)}</td>
                            <td>${formatMoney(t.employerNHS)}</td>
                            <td><strong>${formatMoney(t.nhs + t.employerNHS)}</strong></td>
                        </tr>
                        <tr>
                            <td><strong>Holiday fund</strong></td>
                            <td>${formatMoney(0)}</td>
                            <td>${formatMoney(t.holidayFund)}</td>
                            <td><strong>${formatMoney(t.holidayFund)}</strong></td>
                        </tr>
                        <tr>
                            <td><strong>Redundancy fund</strong></td>
                            <td>${formatMoney(0)}</td>
                            <td>${formatMoney(t.employerRedundancy)}</td>
                            <td><strong>${formatMoney(t.employerRedundancy)}</strong></td>
                        </tr>
                        <tr>
                            <td><strong>Industrial training fund</strong></td>
                            <td>${formatMoney(0)}</td>
                            <td>${formatMoney(t.employerIndustrialTraining)}</td>
                            <td><strong>${formatMoney(t.employerIndustrialTraining)}</strong></td>
                        </tr>
                        <tr>
                            <td><strong>Social cohesion fund</strong></td>
                            <td>${formatMoney(0)}</td>
                            <td>${formatMoney(t.employerSocialCohesion)}</td>
                            <td><strong>${formatMoney(t.employerSocialCohesion)}</strong></td>
                        </tr>
                    </tbody>
                    <tfoot>
                        <tr class="si-monthly-grand-total-row">
                            <td><strong>Grand total</strong></td>
                            <td><strong>${formatMoney(t.employeeSI + t.nhs)}</strong></td>
                            <td><strong>${formatMoney(t.employerContributions)}</strong></td>
                            <td><strong>${formatMoney(t.employeeSI + t.nhs + t.employerContributions)}</strong></td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            <div class="si-monthly-summary">
                <h4 class="si-monthly-section-title">Summary</h4>
                <dl class="si-monthly-summary-list">
                    <div class="si-monthly-summary-item"><dt>Total gross pay</dt><dd>${formatMoney(t.gross)}</dd></div>
                    <div class="si-monthly-summary-item"><dt>Total employee deductions</dt><dd>${formatMoney(t.employeeDeductions)}</dd></div>
                    <div class="si-monthly-summary-item"><dt>Total net pay (including expenses)</dt><dd>${formatMoney(t.netPay)}</dd></div>
                    <div class="si-monthly-summary-item"><dt>Total employer contributions</dt><dd>${formatMoney(t.employerContributions)}</dd></div>
                    <div class="si-monthly-summary-item si-monthly-summary-item--highlight"><dt>Total payroll cost</dt><dd>${formatMoney(t.payrollCost)}</dd></div>
                </dl>
            </div>
        </div>`;
}

function updateSocialInsuranceMonthlyDisplay() {
    const periodEl = document.getElementById('siMonthlyPeriod');
    const contentEl = document.getElementById('siMonthlyReportContent');
    if (!contentEl) return;
    const period = periodEl ? periodEl.value : '';
    contentEl.innerHTML = buildSocialInsuranceMonthlyReportHtml(period);
}
window.updateSocialInsuranceMonthlyDisplay = updateSocialInsuranceMonthlyDisplay;

function printSocialInsuranceMonthlyReport() {
    const printArea = document.getElementById('siMonthlyReportPrintArea');
    if (!printArea) {
        showMessage('Generate the monthly return first by selecting a month.', 'error');
        return;
    }
    const periodEl = document.getElementById('siMonthlyPeriod');
    const title = periodEl && periodEl.value ? 'Social Insurance Return — ' + periodEl.value : 'Social Insurance Monthly Return';
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
        showMessage('Allow pop-ups to print this report.', 'error');
        return;
    }

    const printRoot = printArea.cloneNode(true);
    const empTable = printRoot.querySelector('.si-monthly-table--employees');
    if (empTable) {
        const shortHeaders = ['Name', 'ID', 'SI no.', 'Gross', 'Holiday', 'SI (emp.)', 'NHS (emp.)', 'Exp.', 'Net pay'];
        empTable.querySelectorAll('thead th').forEach(function (th, i) {
            if (shortHeaders[i]) th.textContent = shortHeaders[i];
        });
    }

    printWindow.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
        <style>
            @page { size: A4 landscape; margin: 8mm; }
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; font-size: 10px; color: #222; margin: 0; padding: 0; }
            h4 { margin: 10px 0 4px; font-size: 11px; }
            .si-monthly-company-header {
                display: flex;
                align-items: flex-start;
                gap: 12px;
                margin-bottom: 10px;
                padding-bottom: 8px;
                border-bottom: 2px solid #333;
            }
            .si-monthly-header-logo { flex: 0 0 72px; }
            .si-monthly-header-logo-img {
                display: block;
                max-width: 72px;
                max-height: 52px;
                object-fit: contain;
            }
            .si-monthly-header-logo-text {
                width: 72px;
                height: 52px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #eee;
                border: 1px solid #ccc;
                font-size: 8px;
                font-weight: 700;
                text-align: center;
                padding: 4px;
            }
            .si-monthly-header-info { flex: 1; min-width: 0; }
            .si-monthly-header-name {
                margin: 0 0 3px;
                font-size: 13px;
                font-weight: 700;
                line-height: 1.2;
            }
            .si-monthly-header-address,
            .si-monthly-header-contact,
            .si-monthly-header-tax {
                margin: 0 0 2px;
                font-size: 9px;
                line-height: 1.25;
                color: #333;
            }
            .si-monthly-header-doc {
                flex: 0 0 130px;
                text-align: right;
            }
            .si-monthly-header-doc-title {
                font-size: 11px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.02em;
            }
            .si-monthly-header-doc-period {
                margin-top: 4px;
                font-size: 10px;
                font-weight: 600;
            }
            table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
            th, td { border: 1px solid #bbb; text-align: left; vertical-align: top; }
            th { background: #eee; font-weight: 600; }
            tfoot td { font-weight: 600; background: #f5f5f5; }
            .si-monthly-grand-total-row td { background: #e2e6ea; }
            .si-monthly-summary { margin-top: 10px; padding: 8px 10px; border: 1px solid #ccc; }
            .si-monthly-summary-list { margin: 0; }
            .si-monthly-summary-item { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #ddd; }
            .si-monthly-summary-item dt, .si-monthly-summary-item dd { margin: 0; }
            .si-monthly-summary-item--highlight { border-top: 1px solid #999; margin-top: 2px; padding-top: 5px; }
            .si-monthly-table--employees {
                table-layout: fixed;
                font-size: 7.5px;
                line-height: 1.1;
            }
            .si-monthly-table--employees th,
            .si-monthly-table--employees td {
                padding: 2px 3px;
                word-wrap: break-word;
                overflow-wrap: anywhere;
            }
            .si-monthly-table--employees th:nth-child(1),
            .si-monthly-table--employees td:nth-child(1) { width: 14%; }
            .si-monthly-table--employees th:nth-child(2),
            .si-monthly-table--employees td:nth-child(2) { width: 7%; }
            .si-monthly-table--employees th:nth-child(3),
            .si-monthly-table--employees td:nth-child(3) { width: 9%; }
            .si-monthly-table--employees th:nth-child(n+4),
            .si-monthly-table--employees td:nth-child(n+4) {
                width: 8.75%;
                text-align: right;
                white-space: nowrap;
                word-wrap: normal;
                overflow-wrap: normal;
            }
            .si-monthly-table--employees tfoot td:nth-child(1) { text-align: left; white-space: normal; }
            .si-monthly-table--contributions { font-size: 9px; }
            .si-monthly-table--contributions th,
            .si-monthly-table--contributions td { padding: 4px 6px; }
            .si-monthly-table--contributions td:nth-child(n+2),
            .si-monthly-table--contributions th:nth-child(n+2) { text-align: right; }
            @media print {
                body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
        </style></head><body>${printRoot.outerHTML}</body></html>`);
    printWindow.document.close();
    printWindow.onload = function () {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
    };
}
window.printSocialInsuranceMonthlyReport = printSocialInsuranceMonthlyReport;

// IR63 Form Functions
function generateIR63() {
    const year = document.getElementById('ir63Year').value;
    const employeeId = document.getElementById('ir63Employee').value;
    
    const ir63Result = document.getElementById('ir63Result');
    ir63Result.innerHTML = '';
    
    const filteredEmployees = employeeId ? 
        employees.filter(emp => emp.employeeId === employeeId) : 
        employees;
    
    filteredEmployees.forEach(employee => {
        let annualGross = 0;
        let annualTax = 0;
        let annualSocialInsurance = 0;
        let annualHolidayFund = 0;
        let annualNHS = 0;
        let annualAdditionalPay = 0;
        
        // Calculate annual totals - only from actual payslip data
        for (let month = 1; month <= 12; month++) {
            const monthStr = month.toString().padStart(2, '0');
            const payrollKey = `${employee.employeeId}_${year}_${monthStr}`;
            
            if (payrollData[payrollKey]) {
                const data = payrollData[payrollKey];
                annualGross += data.grossSalary;
                annualTax += data.incomeTax;
                annualSocialInsurance += data.socialInsurance;
                annualHolidayFund += data.holidayFund;
                annualNHS += data.nhs || 0;
                annualAdditionalPay += (data.additionalPay || 0) + (data.expenses || 0);
            }
        }
        
        // For IR63 form, show the total taxable income (gross + holiday fund)
        const annualGrossWithHolidayFund = annualGross + annualHolidayFund;
        
        // Use the stored net pay which was already calculated correctly
        let annualNet = 0;
        for (let month = 1; month <= 12; month++) {
            const monthStr = month.toString().padStart(2, '0');
            const payrollKey = `${employee.employeeId}_${year}_${monthStr}`;
            
            if (payrollData[payrollKey]) {
                const data = payrollData[payrollKey];
                annualNet += (data.netPay || 0);
            }
        }
        
        // Generate official IR63 form template
        const ir63Form = generateIR63FormTemplate(employee, year, {
            annualGross: annualGross, // Gross pay without holiday fund
            annualAdditionalPay: annualAdditionalPay,
            annualTax: annualTax,
            annualSocialInsurance: annualSocialInsurance,
            annualHolidayFund: annualHolidayFund,
            annualNHS: annualNHS,
            annualNet: annualNet
        });
        
        ir63Result.innerHTML += ir63Form;
    });
}

function generateIR63FormTemplate(employee, year, data) {
    return `
        <div class="ir63-form">
            <div class="ir63-header">
                <div class="ir63-title-section">
                    <div class="ir63-main-title">
                        <h1>ΠΙΣΤΟΠΟΙΗΤΙΚΟ ΑΠΟΔΟΧΩΝ ΓΙΑ ΤΟ ΕΤΟΣ ${year}</h1>
                        <h1>EMOLUMENTS CERTIFICATE FOR THE YEAR ${year}</h1>
                    </div>
                </div>
                <div class="ir63-subtitle">
                    <p>Να επισυνάπτεται στη δήλωση εισοδήματος (Έντυπο Τ.Φ.1) του έτους - To be attached to the income tax return (Form T.D.1) of the year</p>
                </div>
            </div>
            
            <div class="ir63-content">
                <div class="ir63-section">
                    <h3>ΣΤΟΙΧΕΙΑ ΥΠΑΛΛΗΛΟΥ / EMPLOYEE DETAILS</h3>
                    <div class="ir63-details-grid">
                        <div class="ir63-detail-row">
                            <label>Αύξων Αριθμός Υπαλλήλου (όπως στο έντυπο Τ.Φ.7) / Employee Serial Number (as per T.D.7A return):</label>
                            <div class="ir63-line"></div>
                        </div>
                        <div class="ir63-detail-row">
                            <label>Πλήρες Όνομα / Full Name:</label>
                            <div class="ir63-line">${employee.firstName} ${employee.lastName}</div>
                        </div>
                        <div class="ir63-detail-row">
                            <label>Διεύθυνση Διαμονής / Residential Address:</label>
                            <div class="ir63-line">${employee.residentialAddress || ''}</div>
                        </div>
                        <div class="ir63-detail-row">
                            <label>Ημερ. Τερματισμού Υπηρεσιών / Employment Ceased on:</label>
                            <div class="ir63-line">${employee.ceasedDate ? new Date(employee.ceasedDate).toLocaleDateString('en-GB') : ''}</div>
                        </div>
                        <div class="ir63-detail-row">
                            <label>Ημερ. Πρόσληψης (για νεοπροσληφθέντες μόνο) / Commenced on (for new employees only):</label>
                            <div class="ir63-line">${employee.hireDate && new Date(employee.hireDate).getFullYear() == year ? new Date(employee.hireDate).toLocaleDateString('en-GB') : ''}</div>
                        </div>
                        <div class="ir63-detail-row">
                            <label>Αξιωματούχος (ΝΑΙ / ΟΧΙ) / Officer (YES / NOT):</label>
                            <div class="ir63-line">${employee.officerStatus === 'yes' ? 'ΝΑΙ / YES' : employee.officerStatus === 'no' ? 'ΟΧΙ / NO' : ''}</div>
                        </div>
                        <div class="ir63-detail-row">
                            <label>Αρ. Κοινωνικών Ασφαλίσεων / Social Insurance No:</label>
                            <div class="ir63-line">${employee.socialInsurance || ''}</div>
                        </div>
                        <div class="ir63-detail-row">
                            <label>Αρ. Φορολ. Ταυτότητας (ΑΦΤ) / Tax Identification Number (TIN):</label>
                            <div class="ir63-line">${employee.taxId || ''}</div>
                        </div>
                    </div>
                </div>
                
                <div class="ir63-section">
                    <h3>Α. ΕΙΣΟΔΗΜΑ / INCOME</h3>
                    <p class="ir63-note">Αναδρομικά καταχωρούνται σε ξεχωριστό έντυπο για το έτος που αναφέρονται. / Retrospective income must be entered in a separate form for the year they refer to.</p>
                    
                            <div class="ir63-income-section">
                                <h4>Ασφαλιστέα στο Τ.Κ.Α. / Insurable at S.I.F.</h4>
                                <div class="ir63-income-item">
                                    <label>Αποδοχές / Emoluments:</label>
                                    <div class="ir63-amount">${formatMoney(data.annualGross)}</div>
                                </div>
                                <div class="ir63-income-item">
                                    <label>Χορηγήματα, προμήθειες, οφέλη & παροχές σε είδος / Allowances, benefits, commissions & benefits in kind:</label>
                                    <div class="ir63-amount">${formatMoney(data.annualAdditionalPay)}</div>
                                </div>
                            </div>
                    
                    <div class="ir63-income-section">
                        <h4>Χωρίς εισφορές στο Τ.Κ.Α / Without contributions to S.I.F.</h4>
                        <div class="ir63-income-item">
                            <label>Σύνταξη / Pension:</label>
                            <div class="ir63-amount">${formatMoney(0)}</div>
                        </div>
                        <div class="ir63-income-item">
                            <label>Αντιμισθία και άλλα ωφελήματα / Remuneration and other benefits:</label>
                            <div class="ir63-amount">${formatMoney(0)}</div>
                        </div>
                    </div>
                    
                            <div class="ir63-income-section">
                                <h4>Αφορολόγητες παροχές σε είδος / Non Taxable benefits in kind</h4>
                                <div class="ir63-amount">${formatMoney(0)}</div>
                            </div>
                            
                            <div class="ir63-separator"></div>
                            
                            <div class="ir63-income-section">
                                <div class="ir63-income-item ir63-bold-item">
                                    <label>Εισόδημα Χωρίς Γε.Σ.Υ. / Income without G.H.S.:</label>
                                    <div class="ir63-amount">${formatMoney(0)}</div>
                                </div>
                            </div>
                        </div>
                
                <div class="ir63-section">
                    <h3>Β. ΑΠΟΚΟΠΕΣ Ή ΣΥΝΕΙΣΦΟΡΕΣ / DEDUCTIONS OR CONTRIBUTIONS</h3>
                    <p class="ir63-note">Ο συντελεστής παρακράτησης για ΓΕΣΥ είναι 2,65% / Rate for GHS deductions is 2,65%</p>
                    
                    <div class="ir63-deductions">
                        <div class="ir63-deduction-item">
                            <label>Ταμείο Κοινωνικών Ασφαλίσεων / Social Insurance fund:</label>
                            <div class="ir63-amount">${formatMoney(data.annualSocialInsurance)}</div>
                        </div>
                        <div class="ir63-deduction-item">
                            <label>Εγκεκριμένα Ταμεία Συντάξεων και Προνοίας / Approved Provident and Pension Fund:</label>
                            <div class="ir63-amount">${formatMoney(0)}</div>
                        </div>
                        <div class="ir63-deduction-item">
                            <label>ΑΦΜ Ταμείου / Fund TIC:</label>
                            <div class="ir63-amount">${formatMoney(0)}</div>
                        </div>
                        <div class="ir63-deduction-item">
                            <label>Συντεχνία / Trade Union:</label>
                            <div class="ir63-amount">${formatMoney(0)}</div>
                        </div>
                        <div class="ir63-deduction-item">
                            <label>Ταμείο Υγείας / Medical fund:</label>
                            <div class="ir63-amount">${formatMoney(0)}</div>
                        </div>
                        <div class="ir63-deduction-item">
                            <label>Εισφορά Γε.Σ.Υ σε ασφαλιστέες αποδοχές / G.H.S.on insurable earnings:</label>
                            <div class="ir63-amount">${formatMoney(data.annualNHS)}</div>
                        </div>
                        <div class="ir63-deduction-item">
                            <label>Εισφορά Γε.Σ.Υ. σε μη ασφαλιστέες αποδοχές / G.H.S. on non -insurable earnings:</label>
                            <div class="ir63-amount">${formatMoney(0)}</div>
                        </div>
                    </div>
                </div>
                
                        <div class="ir63-section">
                            <h3>ΦΟΡΟΣ ΠΟΥ ΠΑΡΑΚΡΑΤΗΘΗΚΕ / INCOME TAX WITHHELD</h3>
                            <div class="ir63-tax-section">
                                <div class="ir63-tax-item">
                                    <label>ΦΟΡΟΣ ΠΟΥ ΠΑΡΑΚΡΑΤΗΘΗΚΕ (α) από σύνταξη (β) από άλλα ποσά / INCOME TAX WITHELD (P.A.Υ.Ε.) (a) from pension (β) from other amounts:</label>
                                    <div class="ir63-tax-amounts">
                                        <div class="ir63-tax-amount">(α): ${formatMoney(0)}</div>
                                        <div class="ir63-tax-amount">(β): ${formatMoney(data.annualTax)}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                
                        <div class="ir63-section">
                            <h3>ΟΛΙΚΟ ΑΠΟΔΟΧΩΝ / TOTAL OF EMOLUMENTS</h3>
                            <div class="ir63-total">
                                <div class="ir63-amount">${formatMoney((data.annualGross + data.annualAdditionalPay))}</div>
                            </div>
                        </div>
                
                <div class="ir63-section">
                    <h3>Στοιχεία Εργοδότη / EMPLOYER'S DETAILS</h3>
                    <p class="ir63-note">(πρέπει να είναι εγγεγραμμένος στο Τ.Φ.) / (must be registered with T.D.)</p>
                    <div class="ir63-employer-details">
                        <div class="ir63-details-grid">
                            <div class="ir63-detail-row">
                                <label>Όνομα / Name:</label>
                                <div class="ir63-line">${companySettings.companyName || ''}</div>
                            </div>
                            <div class="ir63-detail-row">
                                <label>Αρ. Φορολογικής Ταυτότητας (ΑΦΤ) / Tax Identification Number (TIN):</label>
                                <div class="ir63-line">${companySettings.companyTaxId || companySettings.companyRegistration || ''}</div>
                            </div>
                        </div>
                        <div class="ir63-detail-row">
                            <label>Διεύθυνση / Address:</label>
                            <div class="ir63-line">${companySettings.companyAddress || ''}</div>
                        </div>
                    </div>
                </div>
                
                <div class="ir63-declaration">
                    <p>Δηλώνω ότι τα πιο πάνω στοιχεία είναι αληθή και ορθά και συμφωνούν με τα Αρχεία του Λογιστηρίου. / I declare that the above particulars are true and correct and they are in accordance with the records kept in the Accounts Department.</p>
                </div>
                
                <div class="ir63-signature">
                    <div class="ir63-signature-row">
                        <label>Υπογραφή / Signature:</label>
                        <div class="ir63-signature-line"></div>
                    </div>
                    <div class="ir63-signature-row">
                        <label>Όνομα / Name:</label>
                        <div class="ir63-signature-line"></div>
                    </div>
                    <div class="ir63-signature-row">
                        <label>Ημερομηνία / Date:</label>
                        <div class="ir63-signature-line"></div>
                    </div>
                    <div class="ir63-signature-row">
                        <label>Ιδιότητα* / Designation:</label>
                        <div class="ir63-signature-line"></div>
                    </div>
                    <p class="ir63-signature-note">* Αναγράψετε: "Εργοδότης", "Λογιστής", "Διευθυντής", "Γραμματέας" κλπ ανάλογα με την περίπτωση / Insert "Employer", "Accountant", "Director", "Secretary", etc. as the case may be</p>
                </div>
                
                <div class="ir63-footer">
                    <p>(Έντυπο Τ.Φ.63) ${year} / (Form T.D.63A) ${year}</p>
                </div>
            </div>
        </div>
    `;
}

function exportIR63() {
    const year = document.getElementById('ir63Year').value;
    const data = generateIR63Data(year);
    downloadCSV(data, `IR63_${year}.csv`);
    showMessage('IR63 data exported successfully!', 'success');
}

function printIR63() {
    const year = document.getElementById('ir63Year').value;
    const employeeId = document.getElementById('ir63Employee').value;
    
    // Get the IR63 form content
    const ir63Result = document.getElementById('ir63Result');
    const formContent = ir63Result.innerHTML;
    
    if (!formContent.trim()) {
        showMessage('Please generate IR63 forms first', 'error');
        return;
    }
    
    // Create a new window for printing
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>IR63 Forms - ${year}</title>
            <style>
                @page {
                    size: A4 portrait;
                    margin: 7mm 9mm;
                }
                
                body {
                    font-family: Arial, sans-serif;
                    font-size: 9px;
                    line-height: 1.2;
                    margin: 0;
                    padding: 0;
                }
                
                .ir63-form {
                    background: white;
                    border: 2px solid #000;
                    margin: 0 auto;
                    padding: 10px 12px;
                    font-family: Arial, sans-serif;
                    max-width: 800px;
                    page-break-inside: avoid;
                    break-inside: avoid;
                    page-break-after: auto;
                }
                
                .ir63-form + .ir63-form {
                    page-break-before: always;
                }
                
                .ir63-header {
                    text-align: center;
                    margin-bottom: 10px;
                }
                
                .ir63-title-section {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    margin-bottom: 8px;
                    width: 100%;
                }
                
                .ir63-main-title {
                    width: 100%;
                    text-align: center;
                }
                
                .ir63-tax-dept {
                    text-align: left;
                }
                
                .ir63-logo {
                    writing-mode: vertical-rl;
                    text-orientation: mixed;
                    font-weight: bold;
                    font-size: 14px;
                    border: 2px solid #000;
                    padding: 10px 5px;
                    border-radius: 50%;
                    width: 40px;
                    height: 40px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                
                .ir63-main-title h1 {
                    font-size: 14px;
                    font-weight: bold;
                    margin: 3px 0;
                    text-align: center;
                }
                
                .ir63-subtitle {
                    text-align: center;
                }
                
                .ir63-subtitle p {
                    font-size: 10px;
                    margin: 6px auto;
                    font-style: italic;
                    text-align: center;
                    max-width: 42rem;
                }
                
                .ir63-content {
                    margin-top: 6px;
                }
                
                .ir63-section {
                    margin-bottom: 10px;
                }
                
                .ir63-section h3 {
                    font-size: 11px;
                    font-weight: bold;
                    margin-bottom: 6px;
                    text-decoration: underline;
                }
                
                .ir63-section h4 {
                    font-size: 10px;
                    font-weight: bold;
                    margin: 6px 0 3px 0;
                }
                
                .ir63-note {
                    font-size: 9px;
                    font-style: italic;
                    margin-bottom: 8px;
                }
                
                .ir63-details-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 6px;
                }
                
                .ir63-detail-row {
                    display: flex;
                    flex-direction: column;
                    margin-bottom: 5px;
                }
                
                .ir63-detail-row label {
                    font-size: 9px;
                    font-weight: bold;
                    margin-bottom: 2px;
                }
                
                .ir63-line {
                    border-bottom: 1px solid #000;
                    min-height: 16px;
                    padding: 1px 4px;
                    font-size: 9px;
                }
                
                .ir63-income-section {
                    margin-bottom: 8px;
                }
                
                .ir63-income-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 4px;
                    padding: 3px 0;
                    border-bottom: 1px dotted #ccc;
                }
                
                .ir63-income-item label {
                    font-size: 9px;
                    flex: 1;
                }
                
                .ir63-amount {
                    font-size: 9px;
                    font-weight: bold;
                    min-width: 72px;
                    text-align: right;
                }
                
                .ir63-deductions {
                    margin-bottom: 10px;
                }
                
                .ir63-deduction-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 4px;
                    padding: 3px 0;
                    border-bottom: 1px dotted #ccc;
                }
                
                .ir63-deduction-item label {
                    font-size: 9px;
                    flex: 1;
                }
                
                .ir63-tax-section {
                    margin-bottom: 10px;
                }
                
                .ir63-tax-item {
                    margin-bottom: 6px;
                }
                
                .ir63-tax-item label {
                    font-size: 9px;
                    font-weight: bold;
                    display: block;
                    margin-bottom: 3px;
                }
                
                .ir63-tax-amounts {
                    display: flex;
                    gap: 12px;
                }
                
                .ir63-tax-amount {
                    font-size: 9px;
                    font-weight: bold;
                }
                
                .ir63-total {
                    text-align: center;
                    margin: 8px 0;
                    padding: 5px;
                    border: 2px solid #000;
                }
                
                .ir63-total .ir63-amount {
                    font-size: 11px;
                    font-weight: bold;
                }
                
                .ir63-employer-details {
                    margin-bottom: 10px;
                }
                
                .ir63-declaration {
                    margin: 8px 0;
                    padding: 6px;
                    border: 1px solid #000;
                    background: #f9f9f9;
                }
                
                .ir63-declaration p {
                    font-size: 8px;
                    margin: 0;
                    text-align: justify;
                    line-height: 1.2;
                }
                
                .ir63-signature {
                    margin: 10px 0;
                }
                
                .ir63-signature-row {
                    display: flex;
                    align-items: center;
                    margin-bottom: 6px;
                }
                
                .ir63-signature-row label {
                    font-size: 9px;
                    font-weight: bold;
                    min-width: 120px;
                }
                
                .ir63-signature-line {
                    border-bottom: 1px solid #000;
                    flex: 1;
                    margin-left: 8px;
                    min-height: 14px;
                }
                
                .ir63-signature-note {
                    font-size: 8px;
                    font-style: italic;
                    margin-top: 4px;
                }
                
                .ir63-footer {
                    text-align: center;
                    margin-top: 8px;
                    font-size: 9px;
                    font-weight: bold;
                }
                
                @media print {
                    @page {
                        size: A4 portrait;
                        margin: 7mm 9mm;
                    }
                    
                    .ir63-form {
                        margin: 0 !important;
                        padding: 4mm 5mm !important;
                        border: 1px solid #000 !important;
                        max-width: none !important;
                        page-break-inside: avoid;
                        break-inside: avoid;
                        page-break-after: auto;
                    }
                    
                    .ir63-title-section {
                        justify-content: center !important;
                        width: 100% !important;
                    }
                    
                    .ir63-main-title {
                        width: 100% !important;
                        text-align: center !important;
                    }
                    
                    .ir63-main-title h1 {
                        font-size: 11px !important;
                        text-align: center !important;
                        margin: 2px 0 !important;
                    }
                    
                    .ir63-subtitle,
                    .ir63-subtitle p {
                        text-align: center !important;
                    }
                    
                    .ir63-form * {
                        font-size: 8.5px !important;
                        line-height: 1.2 !important;
                    }
                    
                    .ir63-section h3 {
                        font-size: 9.5px !important;
                        margin-bottom: 5px !important;
                    }
                    
                    .ir63-section h4 {
                        font-size: 8.5px !important;
                        margin: 4px 0 2px 0 !important;
                    }
                    
                    .ir63-detail-row label,
                    .ir63-income-item label,
                    .ir63-deduction-item label {
                        font-size: 7.5px !important;
                    }
                    
                    .ir63-line,
                    .ir63-amount {
                        font-size: 7.5px !important;
                        min-height: 13px !important;
                        padding: 1px 3px !important;
                    }
                    
                    .ir63-signature-line {
                        min-height: 11px !important;
                    }
                    
                    .ir63-section {
                        margin-bottom: 7px !important;
                    }
                    
                    .ir63-income-item,
                    .ir63-deduction-item {
                        margin-bottom: 3px !important;
                        padding: 2px 0 !important;
                    }
                    
                    .ir63-details-grid {
                        gap: 4px !important;
                    }
                    
                    .ir63-detail-row {
                        margin-bottom: 4px !important;
                    }
                    
                    .ir63-header {
                        margin-bottom: 6px !important;
                    }
                    
                    .ir63-content {
                        margin-top: 4px !important;
                    }
                    
                    .ir63-note {
                        margin-bottom: 5px !important;
                    }
                    
                    .ir63-total {
                        margin: 6px 0 !important;
                        padding: 4px !important;
                    }
                    
                    .ir63-declaration {
                        margin: 5px 0 !important;
                        padding: 5px !important;
                    }
                    
                    .ir63-declaration p {
                        font-size: 7.5px !important;
                    }
                    
                    .ir63-signature {
                        margin: 7px 0 !important;
                    }
                    
                    .ir63-signature-row {
                        margin-bottom: 4px !important;
                    }
                    
                    .ir63-footer {
                        margin-top: 5px !important;
                    }
                }
            </style>
        </head>
        <body>
            ${formContent}
        </body>
        </html>
    `);
    
    printWindow.document.close();
    
    // Wait for content to load, then print
    printWindow.onload = function() {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
    };
}

// Reports Functions
function generateReport() {
    const reportType = document.getElementById('reportType').value;
    const reportPeriod = document.getElementById('reportPeriod').value;
    
    const reportResult = document.getElementById('reportResult');
    
    if (!reportPeriod && reportType !== 'employee') {
        showMessage('Please select a period for the report', 'error');
        return;
    }
    
    console.log(`Generating ${reportType} report for period: ${reportPeriod}`);
    
    switch (reportType) {
        case 'monthly':
            generateMonthlyReport(reportPeriod);
            break;
        case 'annual':
            generateAnnualReport(reportPeriod);
            break;
        case 'employee':
            generateEmployeeReport();
            break;
        case 'tax':
            generateTaxReport(reportPeriod);
            break;
        default:
            reportResult.innerHTML = '<p>Please select a report type</p>';
    }
}

function generateMonthlyReport(period) {
    const [year, month] = period.split('-');
    const reportResult = document.getElementById('reportResult');
    
    let totalGross = 0;
    let totalTax = 0;
    let totalSocialInsurance = 0;
    let totalHolidayFund = 0;
    let totalNHS = 0;
    let totalExpenses = 0;
    let totalNetPay = 0;
    
    // Employer contribution totals
    let totalEmployerSocialInsurance = 0;
    let totalEmployerNHS = 0;
    let totalEmployerSocialCohesion = 0;
    let totalEmployerRedundancy = 0;
    let totalEmployerIndustrialTraining = 0;
    let totalEmployerContributions = 0;
    
    let reportHTML = `
        <h3>Monthly Payroll Report - ${getMonthName(month)} ${year}</h3>
        
        <h4>Employee Earnings & Deductions</h4>
        <table class="table-container">
            <thead>
                <tr>
                    <th>Employee</th>
                    <th>Social Insurance No.</th>
                    <th>Gross Pay</th>
                    <th>Holiday Fund</th>
                    <th>Income Tax</th>
                    <th>Social Insurance</th>
                    <th>NHS</th>
                    <th>Total Deductions</th>
                    <th>Expenses</th>
                    <th>Net Pay</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    employees.forEach(employee => {
        const found = findPayslip(employee.employeeId, year, month);
        if (!found) return;
        const payroll = found.payslip;
            
            // Employee totals
            totalGross += payroll.grossSalary;
            totalTax += payroll.incomeTax;
            totalSocialInsurance += payroll.socialInsurance;
            totalNHS += payroll.nhs || 0;
            totalExpenses += payroll.expenses || 0;
            totalNetPay += (payroll.netPay || 0) + (payroll.additionalPay || 0) + (payroll.expenses || 0);
            
            // Employer contribution totals
            if (payroll.employerContributions) {
                totalEmployerSocialInsurance += payroll.employerContributions.socialInsurance || 0;
                totalEmployerNHS += payroll.employerContributions.nhs || 0;
                totalEmployerSocialCohesion += payroll.employerContributions.socialCohesion || 0;
                totalEmployerRedundancy += payroll.employerContributions.redundancy || 0;
                totalEmployerIndustrialTraining += payroll.employerContributions.industrialTraining || 0;
            }
            totalHolidayFund += payroll.holidayFund || 0;
            
            const totalDeductions = (payroll.incomeTax || 0) + (payroll.socialInsurance || 0) + (payroll.nhs || 0);
            
            reportHTML += `
                <tr>
                    <td>${employee.firstName} ${employee.lastName}</td>
                    <td>${employee.socialInsurance || 'N/A'}</td>
                    <td>${formatMoney((payroll.grossSalary || 0))}</td>
                    <td>${formatMoney((payroll.holidayFund || 0))}</td>
                    <td>${formatMoney((payroll.incomeTax || 0))}</td>
                    <td>${formatMoney((payroll.socialInsurance || 0))}</td>
                    <td>${formatMoney((payroll.nhs || 0))}</td>
                    <td>${formatMoney(totalDeductions)}</td>
                    <td>${formatMoney((payroll.expenses || 0))}</td>
                    <td>${formatMoney(((payroll.netPay || 0) + (payroll.additionalPay || 0) + (payroll.expenses || 0)))}</td>
                </tr>
            `;
    });
    
    // Calculate total employer contributions
    totalEmployerContributions = totalEmployerSocialInsurance + totalEmployerNHS + 
                                 totalEmployerSocialCohesion + totalEmployerRedundancy + 
                                 totalEmployerIndustrialTraining + totalHolidayFund;
    
    reportHTML += `
            </tbody>
            <tfoot>
                <tr style="font-weight: bold; background: #f8f9fa;">
                    <td>Total</td>
                    <td>-</td>
                    <td>${formatMoney(totalGross)}</td>
                    <td>${formatMoney(totalHolidayFund)}</td>
                    <td>${formatMoney(totalTax)}</td>
                    <td>${formatMoney(totalSocialInsurance)}</td>
                    <td>${formatMoney(totalNHS)}</td>
                    <td>${formatMoney((totalTax + totalSocialInsurance + totalNHS))}</td>
                    <td>${formatMoney(totalExpenses)}</td>
                    <td>${formatMoney(totalNetPay)}</td>
                </tr>
            </tfoot>
        </table>
        
        <h4>Employer Contributions</h4>
        <table class="table-container">
            <thead>
                <tr>
                    <th>Contribution Type</th>
                    <th>Amount</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Social Insurance (8.8%)</td>
                    <td>${formatMoney(totalEmployerSocialInsurance)}</td>
                </tr>
                <tr>
                    <td>NHS (2.90%)</td>
                    <td>${formatMoney(totalEmployerNHS)}</td>
                </tr>
                <tr>
                    <td>Social Cohesion Fund (2.0%)</td>
                    <td>${formatMoney(totalEmployerSocialCohesion)}</td>
                </tr>
                <tr>
                    <td>Redundancy Fund (1.2%)</td>
                    <td>${formatMoney(totalEmployerRedundancy)}</td>
                </tr>
                <tr>
                    <td>Industrial Training Fund (0.5%)</td>
                    <td>${formatMoney(totalEmployerIndustrialTraining)}</td>
                </tr>
                <tr>
                    <td>Holiday Fund</td>
                    <td>${formatMoney(totalHolidayFund)}</td>
                </tr>
            </tbody>
            <tfoot>
                <tr style="font-weight: bold; background: #f8f9fa;">
                    <td>Total Employer Contributions</td>
                    <td>${formatMoney(totalEmployerContributions)}</td>
                </tr>
            </tfoot>
        </table>
        
        <h4>Social Insurance & Contributions Totals</h4>
        <table class="table-container">
            <thead>
                <tr>
                    <th>Contribution Type</th>
                    <th>Employee</th>
                    <th>Employer</th>
                    <th>Total</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td><strong>Social Insurance</strong></td>
                    <td>${formatMoney(totalSocialInsurance)}</td>
                    <td>${formatMoney(totalEmployerSocialInsurance)}</td>
                    <td><strong>${formatMoney((totalSocialInsurance + totalEmployerSocialInsurance))}</strong></td>
                </tr>
                <tr>
                    <td><strong>NHS</strong></td>
                    <td>${formatMoney(totalNHS)}</td>
                    <td>${formatMoney(totalEmployerNHS)}</td>
                    <td><strong>${formatMoney((totalNHS + totalEmployerNHS))}</strong></td>
                </tr>
                <tr>
                    <td><strong>Holiday Fund</strong></td>
                    <td>${formatMoney(0)}</td>
                    <td>${formatMoney(totalHolidayFund)}</td>
                    <td><strong>${formatMoney(totalHolidayFund)}</strong></td>
                </tr>
                <tr>
                    <td><strong>Redundancy Fund</strong></td>
                    <td>${formatMoney(0)}</td>
                    <td>${formatMoney(totalEmployerRedundancy)}</td>
                    <td><strong>${formatMoney(totalEmployerRedundancy)}</strong></td>
                </tr>
                <tr>
                    <td><strong>Industrial Training Fund</strong></td>
                    <td>${formatMoney(0)}</td>
                    <td>${formatMoney(totalEmployerIndustrialTraining)}</td>
                    <td><strong>${formatMoney(totalEmployerIndustrialTraining)}</strong></td>
                </tr>
                <tr>
                    <td><strong>Social Cohesion Fund</strong></td>
                    <td>${formatMoney(0)}</td>
                    <td>${formatMoney(totalEmployerSocialCohesion)}</td>
                    <td><strong>${formatMoney(totalEmployerSocialCohesion)}</strong></td>
                </tr>
            </tbody>
            <tfoot>
                <tr style="font-weight: bold; background: #007bff; color: white;">
                    <td><strong>GRAND TOTAL</strong></td>
                    <td><strong>${formatMoney((totalSocialInsurance + totalNHS))}</strong></td>
                    <td><strong>${formatMoney(totalEmployerContributions)}</strong></td>
                    <td><strong>${formatMoney(((totalSocialInsurance + totalNHS) + totalEmployerContributions))}</strong></td>
                </tr>
            </tfoot>
        </table>
        
        <div style="margin-top: 2rem; padding: 1rem; background: #e9ecef; border-radius: 8px;">
            <h5>Summary</h5>
            <p><strong>Total Gross Pay:</strong> ${formatMoney(totalGross)}</p>
            <p><strong>Total Employee Deductions:</strong> ${formatMoney((totalTax + totalSocialInsurance + totalNHS))}</p>
            <p><strong>Total Net Pay (including expenses):</strong> ${formatMoney(totalNetPay)}</p>
            <p><strong>Total Employer Contributions:</strong> ${formatMoney(totalEmployerContributions)}</p>
            <p><strong>Total Payroll Cost:</strong> ${formatMoney((totalGross + totalEmployerContributions))}</p>
        </div>
        
        <div style="margin-top: 2rem; text-align: center;">
            <button onclick="printMonthlyReport()" class="print-button" style="background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; font-size: 16px;">
                🖨️ Print Report
            </button>
        </div>
    `;
    
    reportResult.innerHTML = reportHTML;
}

function printMonthlyReport() {
    // Get the report content
    const reportResult = document.getElementById('reportResult');
    const reportContent = reportResult.innerHTML;
    
    // Create a new window for printing
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Monthly Payroll Report</title>
            <style>
                @page {
                    size: A4 landscape;
                    margin: 0.5in;
                }
                
                body {
                    font-family: Arial, sans-serif;
                    font-size: 16px;
                    line-height: 1.4;
                    margin: 0;
                    padding: 0;
                }
                
                h3 {
                    font-size: 24px;
                    margin: 10px 0;
                    color: #333;
                    font-weight: bold;
                }
                
                h4 {
                    font-size: 20px;
                    margin: 12px 0 8px 0;
                    color: #555;
                    font-weight: bold;
                }
                
                h5 {
                    font-size: 18px;
                    margin: 8px 0;
                    color: #666;
                    font-weight: bold;
                }
                
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 10px 0;
                    font-size: 14px;
                }
                
                th, td {
                    border: 1px solid #333;
                    padding: 8px;
                    text-align: left;
                    font-size: 14px;
                }
                
                th {
                    background-color: #f0f0f0;
                    font-weight: bold;
                    font-size: 15px;
                }
                
                tfoot tr {
                    background-color: #e9ecef;
                    font-weight: bold;
                }
                
                tfoot td {
                    font-size: 15px;
                    font-weight: bold;
                }
                
                .summary-box {
                    background: #f8f9fa;
                    border: 1px solid #ddd;
                    padding: 12px;
                    margin: 10px 0;
                    font-size: 16px;
                }
                
                .summary-box p {
                    font-size: 16px;
                    margin: 5px 0;
                }
                
                .summary-box strong {
                    font-size: 16px;
                }
                
                p {
                    font-size: 16px;
                    margin: 5px 0;
                }
                
                .print-button {
                    display: none;
                }
                
                @media print {
                    @page {
                        size: A4 landscape;
                        margin: 0.5in;
                    }
                    
                    body {
                        font-size: 16px;
                    }
                    
                    h3 {
                        font-size: 24px;
                    }
                    
                    h4 {
                        font-size: 20px;
                    }
                    
                    h5 {
                        font-size: 18px;
                    }
                    
                    table {
                        font-size: 14px;
                    }
                    
                    th {
                        font-size: 15px;
                    }
                    
                    td {
                        font-size: 14px;
                    }
                    
                    tfoot td {
                        font-size: 15px;
                    }
                    
                    .summary-box {
                        font-size: 16px;
                    }
                    
                    th, td {
                        padding: 8px;
                    }
                }
            </style>
        </head>
        <body>
            ${reportContent}
        </body>
        </html>
    `);
    
    printWindow.document.close();
    
    // Wait for content to load, then print
    printWindow.onload = function() {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
    };
}

function generateAnnualReport(period) {
    const year = period.split('-')[0];
    const reportResult = document.getElementById('reportResult');
    
    // Get all payroll data for the year
    const yearData = Object.values(payrollData).filter(payslip => payslip.year == year);
    
    if (yearData.length === 0) {
        reportResult.innerHTML = `
            <h3>Annual Payroll Report - ${year}</h3>
            <p>No payroll data available for ${year}</p>
        `;
        return;
    }
    
    // Calculate annual totals
    let totalGross = 0;
    let totalTax = 0;
    let totalSocialInsurance = 0;
    let totalHolidayFund = 0;
    let totalNHS = 0;
    let totalNet = 0;
    
    const employeeTotals = {};
    
    yearData.forEach(payslip => {
        totalGross += payslip.grossSalary || 0;
        totalTax += payslip.incomeTax || 0;
        totalSocialInsurance += payslip.socialInsurance || 0;
        totalHolidayFund += payslip.holidayFund || 0;
        totalNHS += payslip.nhs || 0;
        totalNet += (payslip.netPay || 0) + (payslip.additionalPay || 0) + (payslip.expenses || 0);
        
        // Employee totals
        if (!employeeTotals[payslip.employeeId]) {
            employeeTotals[payslip.employeeId] = {
                name: payslip.employeeName,
                gross: 0,
                tax: 0,
                socialInsurance: 0,
                holidayFund: 0,
                nhs: 0,
                net: 0
            };
        }
        
        employeeTotals[payslip.employeeId].gross += payslip.grossSalary || 0;
        employeeTotals[payslip.employeeId].tax += payslip.incomeTax || 0;
        employeeTotals[payslip.employeeId].socialInsurance += payslip.socialInsurance || 0;
        employeeTotals[payslip.employeeId].holidayFund += payslip.holidayFund || 0;
        employeeTotals[payslip.employeeId].nhs += payslip.nhs || 0;
        employeeTotals[payslip.employeeId].net += (payslip.netPay || 0) + (payslip.additionalPay || 0) + (payslip.expenses || 0);
    });
    
    let reportHTML = `
        <h3>Annual Payroll Report - ${year}</h3>
        <div class="report-summary">
            <h4>Annual Summary</h4>
            <table class="report-table">
                <tr>
                    <th>Total Gross Pay</th>
                    <td>${formatMoney(totalGross)}</td>
                </tr>
                <tr>
                    <th>Total Income Tax</th>
                    <td>${formatMoney(totalTax)}</td>
                </tr>
                <tr>
                    <th>Total Social Insurance</th>
                    <td>${formatMoney(totalSocialInsurance)}</td>
                </tr>
                <tr>
                    <th>Total Holiday Fund</th>
                    <td>${formatMoney(totalHolidayFund)}</td>
                </tr>
                <tr>
                    <th>Total NHS</th>
                    <td>${formatMoney(totalNHS)}</td>
                </tr>
                <tr>
                    <th>Total Net Pay</th>
                    <td>${formatMoney(totalNet)}</td>
                </tr>
            </table>
        </div>
        <div class="report-details">
            <h4>Employee Breakdown</h4>
            <table class="report-table">
                <thead>
                    <tr>
                        <th>Employee</th>
                        <th>Gross Pay</th>
                        <th>Income Tax</th>
                        <th>Social Insurance</th>
                        <th>Holiday Fund</th>
                        <th>NHS</th>
                        <th>Net Pay</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    Object.values(employeeTotals).forEach(employee => {
        reportHTML += `
            <tr>
                <td>${employee.name}</td>
                <td>${formatMoney(employee.gross)}</td>
                <td>${formatMoney(employee.tax)}</td>
                <td>${formatMoney(employee.socialInsurance)}</td>
                <td>${formatMoney(employee.holidayFund)}</td>
                <td>${formatMoney(employee.nhs)}</td>
                <td>${formatMoney(employee.net)}</td>
            </tr>
        `;
    });
    
    reportHTML += `
                </tbody>
            </table>
        </div>
    `;
    
    reportResult.innerHTML = reportHTML;
}

function generateEmployeeReport() {
    const reportResult = document.getElementById('reportResult');
    
    if (employees.length === 0) {
        reportResult.innerHTML = `
            <h3>Employee History Report</h3>
            <p>No employees found</p>
        `;
        return;
    }
    
    let reportHTML = `
        <h3>Employee History Report</h3>
        <div class="report-details">
            <table class="report-table">
                <thead>
                    <tr>
                        <th>Employee ID</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Tax Code</th>
                        <th>Social Insurance</th>
                        <th>Hire Date</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    employees.forEach(employee => {
        const status = employee.ceasedDate ? 'Inactive' : 'Active';
        const hireDate = employee.hireDate ? new Date(employee.hireDate).toLocaleDateString('en-GB') : 'Not Set';
        
        reportHTML += `
            <tr>
                <td>${employee.employeeId}</td>
                <td>${employee.firstName} ${employee.lastName}</td>
                <td>${employee.email || 'Not Set'}</td>
                <td>${employee.phone || 'Not Set'}</td>
                <td>${employee.taxCode || 'Not Set'}</td>
                <td>${employee.socialInsurance || 'Not Set'}</td>
                <td>${hireDate}</td>
                <td>${status}</td>
            </tr>
        `;
    });
    
    reportHTML += `
                </tbody>
            </table>
        </div>
    `;
    
    reportResult.innerHTML = reportHTML;
}

function generateTaxReport(period) {
    const reportResult = document.getElementById('reportResult');
    
    // Get all payroll data for the period
    const periodData = Object.values(payrollData).filter(payslip => {
        const payslipPeriod = `${payslip.year}-${payslip.month.padStart(2, '0')}`;
        return payslipPeriod === period;
    });
    
    if (periodData.length === 0) {
        reportResult.innerHTML = `
            <h3>Tax Summary Report - ${period}</h3>
            <p>No payroll data available for ${period}</p>
        `;
        return;
    }
    
    // Calculate tax totals
    let totalIncomeTax = 0;
    let totalSocialInsurance = 0;
    let totalHolidayFund = 0;
    let totalNHS = 0;
    let totalGross = 0;
    
    const employeeTaxData = {};
    
    periodData.forEach(payslip => {
        totalIncomeTax += payslip.incomeTax || 0;
        totalSocialInsurance += payslip.socialInsurance || 0;
        totalHolidayFund += payslip.holidayFund || 0;
        totalNHS += payslip.nhs || 0;
        totalGross += payslip.grossSalary || 0;
        
        // Employee tax data
        if (!employeeTaxData[payslip.employeeId]) {
            employeeTaxData[payslip.employeeId] = {
                name: payslip.employeeName,
                gross: 0,
                incomeTax: 0,
                socialInsurance: 0,
                holidayFund: 0,
                nhs: 0,
                net: 0
            };
        }
        
        employeeTaxData[payslip.employeeId].gross += payslip.grossSalary || 0;
        employeeTaxData[payslip.employeeId].incomeTax += payslip.incomeTax || 0;
        employeeTaxData[payslip.employeeId].socialInsurance += payslip.socialInsurance || 0;
        employeeTaxData[payslip.employeeId].holidayFund += payslip.holidayFund || 0;
        employeeTaxData[payslip.employeeId].nhs += payslip.nhs || 0;
        employeeTaxData[payslip.employeeId].net += (payslip.netPay || 0) + (payslip.additionalPay || 0) + (payslip.expenses || 0);
    });
    
    let reportHTML = `
        <h3>Tax Summary Report - ${period}</h3>
        <div class="report-summary">
            <h4>Tax Summary</h4>
            <table class="report-table">
                <tr>
                    <th>Total Gross Pay</th>
                    <td>${formatMoney(totalGross)}</td>
                </tr>
                <tr>
                    <th>Total Income Tax</th>
                    <td>${formatMoney(totalIncomeTax)}</td>
                </tr>
                <tr>
                    <th>Total Social Insurance</th>
                    <td>${formatMoney(totalSocialInsurance)}</td>
                </tr>
                <tr>
                    <th>Total Holiday Fund</th>
                    <td>${formatMoney(totalHolidayFund)}</td>
                </tr>
                <tr>
                    <th>Total NHS</th>
                    <td>${formatMoney(totalNHS)}</td>
                </tr>
                <tr>
                    <th>Total Deductions</th>
                    <td>${formatMoney((totalIncomeTax + totalSocialInsurance + totalHolidayFund + totalNHS))}</td>
                </tr>
            </table>
        </div>
        <div class="report-details">
            <h4>Employee Tax Breakdown</h4>
            <table class="report-table">
                <thead>
                    <tr>
                        <th>Employee</th>
                        <th>Gross Pay</th>
                        <th>Income Tax</th>
                        <th>Social Insurance</th>
                        <th>Holiday Fund</th>
                        <th>NHS</th>
                        <th>Total Deductions</th>
                        <th>Net Pay</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    Object.values(employeeTaxData).forEach(employee => {
        const totalDeductions = employee.incomeTax + employee.socialInsurance + employee.holidayFund + employee.nhs;
        
        reportHTML += `
            <tr>
                <td>${employee.name}</td>
                <td>${formatMoney(employee.gross)}</td>
                <td>${formatMoney(employee.incomeTax)}</td>
                <td>${formatMoney(employee.socialInsurance)}</td>
                <td>${formatMoney(employee.holidayFund)}</td>
                <td>${formatMoney(employee.nhs)}</td>
                <td>${formatMoney(totalDeductions)}</td>
                <td>${formatMoney(employee.net)}</td>
            </tr>
        `;
    });
    
    reportHTML += `
                </tbody>
            </table>
        </div>
    `;
    
    reportResult.innerHTML = reportHTML;
}

// Utility Functions
function getMonthName(month) {
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[parseInt(month) - 1];
}

function setCurrentMonth() {
    const now = new Date();
    const currentMonth = (now.getMonth() + 1).toString().padStart(2, '0');
    const currentYear = now.getFullYear();
    
    document.getElementById('payslipMonth').value = currentMonth;
    document.getElementById('payslipYear').value = currentYear;
    document.getElementById('reportPeriod').value = `${currentYear}-${currentMonth}`;
}

function setDefaultPayDate() {
    const month = parseInt(document.getElementById('payslipMonth').value);
    const year = parseInt(document.getElementById('payslipYear').value);
    
    if (month && year) {
        // Set default pay date to the last day of the selected month
        const lastDay = new Date(year, month, 0).getDate();
        const defaultDate = `${year}-${month.toString().padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`;
        document.getElementById('payslipPayDate').value = defaultDate;
    }
}

function getNextPayrollSequence(year, month) {
    const maxSequence = getMaxPayrollSequenceForMonth(year, month);
    const nextSequence = maxSequence + 1;
    console.log(`Next payroll sequence for ${year}-${payrollMonthSegment(month)}: ${nextSequence} (max existing: ${maxSequence})`);
    return nextSequence;
}

function showMessage(message, type) {
    const existingMessages = document.querySelectorAll('.message');
    existingMessages.forEach(msg => msg.remove());

    const messageDiv = document.createElement('div');
    messageDiv.className = `payroll-message message ${type}`;
    messageDiv.textContent = message;

    const container = document.querySelector('.container');
    const tabNav = document.querySelector('.tab-navigation');
    if (container && tabNav) {
        container.insertBefore(messageDiv, tabNav);
    } else {
        messageDiv.style.cssText = 'position:fixed;top:1rem;left:50%;transform:translateX(-50%);z-index:10000;padding:0.75rem 1rem;border-radius:6px;font-size:0.9rem;max-width:90%;';
        if (type === 'success') messageDiv.style.background = '#d1fae5';
        else if (type === 'error') messageDiv.style.background = '#fee2e2';
        else messageDiv.style.background = '#e5e7eb';
        document.body.appendChild(messageDiv);
    }

    setTimeout(() => {
        messageDiv.remove();
    }, 5000);
}

function saveEmployees() {
    localStorage.setItem('employees', JSON.stringify(employees));
    try {
        if (typeof window.hrEmployeesRefreshOverview === 'function') window.hrEmployeesRefreshOverview();
    } catch (e) {}
    persistPayrollToCloud();
}

function savePayrollData() {
    localStorage.setItem('payrollData', JSON.stringify(payrollData));
    persistPayrollToCloud();
}

function persistPayrollToCloud() {
    try {
        if (window.AccountingData && window.AccountingData.persistAll) window.AccountingData.persistAll();
    } catch (e) {}
}

function reloadPayrollFromStorage() {
    try {
        employees = JSON.parse(localStorage.getItem('employees')) || [];
        payrollData = JSON.parse(localStorage.getItem('payrollData')) || {};
        companySettings = JSON.parse(localStorage.getItem('companySettings')) || {};
    } catch (e) {
        employees = [];
        payrollData = {};
        companySettings = {};
    }
    if (typeof loadEmployees === 'function') loadEmployees();
    if (typeof updateEmployeeDropdowns === 'function') updateEmployeeDropdowns();
    if (typeof updateYTDDisplay === 'function') updateYTDDisplay();
    if (typeof loadPayslips === 'function') loadPayslips();
    if (typeof updateSocialInsuranceYTDDisplay === 'function') updateSocialInsuranceYTDDisplay();
    if (typeof updateSocialInsuranceMonthlyDisplay === 'function') updateSocialInsuranceMonthlyDisplay();
    if (typeof updatePayslipCompanyInfo === 'function') updatePayslipCompanyInfo();
    if (typeof updateAllTabs === 'function') updateAllTabs();
}
window.reloadPayrollFromStorage = reloadPayrollFromStorage;

function downloadCSV(data, filename) {
    const csvContent = "data:text/csv;charset=utf-8," + data;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function generateIR63Data(year) {
    let csvData = "Employee Name,Annual Gross,Annual Tax,Social Insurance,Holiday Fund,NHS,Net Annual\n";
    
    employees.forEach(employee => {
        let annualGross = 0;
        let annualTax = 0;
        let annualSocialInsurance = 0;
        let annualHolidayFund = 0;
        let annualNHS = 0;
        let annualAdditionalPay = 0;
        
        for (let month = 1; month <= 12; month++) {
            const monthStr = month.toString().padStart(2, '0');
            const payrollKey = `${employee.employeeId}_${year}_${monthStr}`;
            
            if (payrollData[payrollKey]) {
                const data = payrollData[payrollKey];
                annualGross += data.grossSalary;
                annualTax += data.incomeTax;
                annualSocialInsurance += data.socialInsurance;
                annualHolidayFund += data.holidayFund;
                annualNHS += data.nhs || 0;
                annualAdditionalPay += (data.additionalPay || 0) + (data.expenses || 0);
            }
            // Only use actual payslip data - no estimates for missing months
        }
        
        // For IR63 form, show the total taxable income (gross + holiday fund)
        // The net pay stored is already correct (gross - deductions, where tax was calculated on gross + holiday fund)
        const annualGrossWithHolidayFund = annualGross + annualHolidayFund;
        
        // Use the stored net pay which was already calculated correctly
        let annualNet = 0;
        for (let month = 1; month <= 12; month++) {
            const monthStr = month.toString().padStart(2, '0');
            const payrollKey = `${employee.employeeId}_${year}_${monthStr}`;
            
            if (payrollData[payrollKey]) {
                const data = payrollData[payrollKey];
                annualNet += (data.netPay || 0);
            }
        }
        
        csvData += `${employee.firstName} ${employee.lastName},${annualGrossWithHolidayFund.toFixed(2)},${annualTax.toFixed(2)},${annualSocialInsurance.toFixed(2)},${annualHolidayFund.toFixed(2)},${annualNHS.toFixed(2)},${annualNet.toFixed(2)}\n`;
    });
    
    return csvData;
}

// Company Settings Functions
function loadCompanySettings() {
    try {
        var stored = localStorage.getItem('companySettings');
        if (stored) companySettings = JSON.parse(stored);
    } catch (e) {}
    var companyNameEl = document.getElementById('companyName');
    if (!companyNameEl) return;
    if (Object.keys(companySettings).length > 0) {
        companyNameEl.value = companySettings.companyName || '';
        document.getElementById('companyRegistration').value = companySettings.companyRegistration || '';
        document.getElementById('companyTaxId').value = companySettings.companyTaxId || '';
        document.getElementById('companyAddress').value = companySettings.companyAddress || '';
        document.getElementById('companyPhone').value = companySettings.companyPhone || '';
        document.getElementById('companyEmail').value = companySettings.companyEmail || '';
        document.getElementById('companyWebsite').value = companySettings.companyWebsite || '';
        
        // Load logo if exists
        if (companySettings.logoData) {
            const logoImg = document.getElementById('logoPreviewImg');
            logoImg.src = companySettings.logoData;
            document.getElementById('logoPreview').style.display = 'block';
        }
        
        updatePayslipPreview();
    }
}

function previewLogo() {
    const fileInput = document.getElementById('companyLogo');
    const file = fileInput.files[0];
    
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const logoImg = document.getElementById('logoPreviewImg');
            logoImg.src = e.target.result;
            document.getElementById('logoPreview').style.display = 'block';
            
            // Update preview
            updatePayslipPreview();
        };
        reader.readAsDataURL(file);
    }
}

function updatePayslipPreview() {
    const companyName = document.getElementById('companyName').value || 'Your Company Name';
    const companyAddress = document.getElementById('companyAddress').value || 'Your Address';
    const companyPhone = document.getElementById('companyPhone').value || 'Your Phone';
    const companyEmail = document.getElementById('companyEmail').value || 'Your Email';
    
    document.getElementById('previewCompanyName').textContent = companyName;
    document.getElementById('previewAddress').textContent = companyAddress;
    document.getElementById('previewContact').textContent = `Phone: ${companyPhone}, Email: ${companyEmail}`;
    
    // Update logo preview
    const logoImg = document.getElementById('logoPreviewImg');
    const logoText = document.getElementById('previewLogoText');
    
    if (logoImg.src && logoImg.src !== '') {
        logoImg.style.display = 'block';
        logoText.style.display = 'none';
    } else {
        logoImg.style.display = 'none';
        logoText.style.display = 'block';
        logoText.textContent = companyName.substring(0, 10).toUpperCase();
    }
}

// Company form handling
var companyFormEl = document.getElementById('companyForm');
if (companyFormEl) {
companyFormEl.addEventListener('submit', function(e) {
    e.preventDefault();
    
    const formData = new FormData(this);
    const logoFile = document.getElementById('companyLogo').files[0];
    
    // Save company settings
    companySettings = {
        companyName: formData.get('companyName'),
        companyRegistration: formData.get('companyRegistration'),
        companyTaxId: formData.get('companyTaxId'),
        companyAddress: formData.get('companyAddress'),
        companyPhone: formData.get('companyPhone'),
        companyEmail: formData.get('companyEmail'),
        companyWebsite: formData.get('companyWebsite')
    };
    
    // Handle logo
    if (logoFile) {
        const reader = new FileReader();
        reader.onload = function(e) {
            companySettings.logoData = e.target.result;
            saveCompanySettings();
        };
        reader.readAsDataURL(logoFile);
    } else {
        saveCompanySettings();
    }
    
    showMessage('Company settings saved successfully!', 'success');
});
}

function saveCompanySettings() {
    localStorage.setItem('companySettings', JSON.stringify(companySettings));
    updatePayslipWithCompanyInfo();
    updateAllTabs();
    persistPayrollToCloud();
}

function updatePayslipCompanyInfo() {
    // Use latest from localStorage (synced from main app Settings when embedded)
    try {
        const stored = localStorage.getItem('companySettings');
        if (stored) companySettings = JSON.parse(stored);
    } catch (e) {}
    // Update the payslip with company information from settings
    const companyLogo = document.getElementById('payslipCompanyLogo');
    const companyLogoText = document.getElementById('payslipCompanyLogoText');
    const companyName = document.getElementById('payslipCompanyName');
    const companyAddress = document.getElementById('payslipCompanyAddress');
    const companyContact = document.getElementById('payslipCompanyContact');
    
    if (companySettings.logoData) {
        if (companyLogo) {
            companyLogo.src = companySettings.logoData;
            companyLogo.style.display = 'block';
            companyLogo.style.visibility = 'visible';
        }
        if (companyLogoText) {
            companyLogoText.style.display = 'none';
            companyLogoText.style.visibility = 'hidden';
            companyLogoText.textContent = ''; // Clear the text content
        }
    } else {
        if (companyLogo) {
            companyLogo.style.display = 'none';
            companyLogo.style.visibility = 'hidden';
        }
        if (companyLogoText) {
            companyLogoText.textContent = (companySettings.companyName || 'COMPANY').substring(0, 10).toUpperCase();
            companyLogoText.style.display = 'block';
            companyLogoText.style.visibility = 'visible';
        }
    }
    
    if (companyName) {
        companyName.textContent = companySettings.companyName || 'YOUR COMPANY NAME LTD';
    }
    
    if (companyAddress) {
        companyAddress.textContent = companySettings.companyAddress || 'Your Company Address, City, Postal Code';
    }
    
    if (companyContact) {
        companyContact.textContent = `Phone: ${companySettings.companyPhone || '+357 XX XXX XXXX'}, Email: ${companySettings.companyEmail || 'info@yourcompany.com'}`;
    }
}

function updatePayslipWithCompanyInfo() {
    // This function is called when company settings are saved
    // It updates the payslip template for future use
    updatePayslipCompanyInfo();
}

function clearCompanyForm() {
    var form = document.getElementById('companyForm');
    if (!form) return;
    form.reset();
    document.getElementById('logoPreview').style.display = 'none';
    document.getElementById('logoPreviewImg').src = '';
    updatePayslipPreview();
}

// Data Management Functions
function exportAllData() {
    try {
        // Collect all data
        const exportData = {
            employees: employees,
            payrollData: payrollData,
            companySettings: companySettings,
            exportDate: new Date().toISOString(),
            version: '1.0'
        };
        
        // Create JSON string
        const jsonString = JSON.stringify(exportData, null, 2);
        
        // Create and download file
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `payroll-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showMessage('Data exported successfully!', 'success');
    } catch (error) {
        console.error('Export error:', error);
        showMessage('Error exporting data', 'error');
    }
}

function importAllData(input) {
    const file = input.files[0];
    if (!file) return;
    
    if (!confirm('This will replace all current data. Are you sure you want to continue?')) {
        input.value = '';
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importData = JSON.parse(e.target.result);
            
            // Validate data structure
            if (!importData.employees || !importData.payrollData || !importData.companySettings) {
                throw new Error('Invalid backup file format');
            }
            
            // Import data
            employees = importData.employees || [];
            payrollData = importData.payrollData || {};
            companySettings = importData.companySettings || {};
            
            // Save to localStorage
            saveEmployees();
            savePayrollData();
            saveCompanySettings();
            
            // Update all tabs
            updateAllTabs();
            
            showMessage('Data imported successfully!', 'success');
        } catch (error) {
            console.error('Import error:', error);
            showMessage('Error importing data. Please check the file format.', 'error');
        }
    };
    
    reader.readAsText(file);
    input.value = '';
}

function clearAllData() {
    if (!confirm('⚠️ WARNING: This will permanently delete ALL employees, payslips, and company settings. This action cannot be undone. Are you absolutely sure?')) {
        return;
    }
    
    if (!confirm('This is your final warning. Click OK to permanently delete ALL data.')) {
        return;
    }
    
    try {
        // Clear all data
        employees = [];
        payrollData = {};
        companySettings = {};
        
        // Clear localStorage
        localStorage.removeItem('employees');
        localStorage.removeItem('payrollData');
        localStorage.removeItem('companySettings');
        
        // Update all tabs
        updateAllTabs();
        
        // Clear forms
        document.getElementById('employeeForm').reset();
        document.getElementById('companyForm').reset();
        document.getElementById('logoPreview').style.display = 'none';
        document.getElementById('logoPreviewImg').src = '';
        
        showMessage('All data has been cleared', 'success');
    } catch (error) {
        console.error('Clear data error:', error);
        showMessage('Error clearing data', 'error');
    }
}

// Add event listeners for real-time preview updates
document.addEventListener('DOMContentLoaded', function() {
    const companyFields = ['companyName', 'companyAddress', 'companyPhone', 'companyEmail'];
    companyFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('input', updatePayslipPreview);
        }
    });
});

