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
  let optionsDialogOpen = false;
  let localWriteGuardUntil = 0;
  let pendingCatalogPersist = false;

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
    if (window.AndecoDate) return window.AndecoDate.todayISO();
    return new Date().toISOString().slice(0, 10);
  }

  function formatDistDate(value) {
    if (!value) return '—';
    if (window.AndecoDate) return window.AndecoDate.formatDate(value) || '—';
    return String(value);
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

  function defaultPaymentTerms() {
    return (
      state?.settings?.defaultPaymentTerms ||
      '40% upon order confirmation\n40% before completion / ready for delivery\n20% before delivery / shipment'
    );
  }

  function feeAmount(q, key) {
    const n = Number(q && q[key]);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
  }

  /** Single fee covering transportation and packaging (migrates legacy split fields). */
  function transportPackagingFeeAmount(q) {
    if (!q || typeof q !== 'object') return 0;
    if (Object.prototype.hasOwnProperty.call(q, 'transportPackagingFee')) {
      return feeAmount(q, 'transportPackagingFee');
    }
    return Math.round((feeAmount(q, 'transportFee') + feeAmount(q, 'packagingFee')) * 100) / 100;
  }

  function normalizeQuoteFees(q) {
    if (!q || typeof q !== 'object') return q;
    const combined = transportPackagingFeeAmount(q);
    q.transportPackagingFee = combined;
    // Keep legacy keys aligned so older data stays consistent.
    q.transportFee = combined;
    q.packagingFee = 0;
    q.feesTotal = combined;
    return q;
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
    normalizeQuoteFees(q);
    q.subtotal = Math.round(subtotal * 100) / 100;
    q.discountAmount = Math.round((q.subtotal - total) * 100) / 100;
    q.linesTotal = Math.round(total * 100) / 100;
    q.total = Math.round((total + q.feesTotal) * 100) / 100;
    return q;
  }

  function readImageAsDataUrl(file, maxBytes) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error('No file selected'));
        return;
      }
      if (maxBytes && file.size > maxBytes) {
        reject(new Error('Image is too large (max 1.5 MB)'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read image'));
      reader.readAsDataURL(file);
    });
  }

  function resolveQuoteVesselPhoto(q, model) {
    if (q && q.vesselPhoto) return q.vesselPhoto;
    if (model && model.photo) return model.photo;
    return '';
  }

  function defaultCategories(brandId) {
    return [
      { id: uid('cat'), brandId, key: 'engines', label: 'Main engines', sortOrder: 10, subgroupBy: true },
      { id: uid('cat'), brandId, key: 'engine_options', label: 'Engine options', sortOrder: 20, subgroupBy: false },
      { id: uid('cat'), brandId, key: 'covers', label: 'Covers & awnings', sortOrder: 30, subgroupBy: false },
      { id: uid('cat'), brandId, key: 'cabin', label: 'Cabin options', sortOrder: 34, subgroupBy: false },
      { id: uid('cat'), brandId, key: 'wetbar', label: 'Wet bar options', sortOrder: 36, subgroupBy: false },
      { id: uid('cat'), brandId, key: 'electronics', label: 'Electronic & electrical', sortOrder: 40, subgroupBy: false },
      { id: uid('cat'), brandId, key: 'lights', label: 'Lights', sortOrder: 42, subgroupBy: false },
      { id: uid('cat'), brandId, key: 'sound', label: 'Sound systems', sortOrder: 44, subgroupBy: false },
      { id: uid('cat'), brandId, key: 'generators', label: 'Generators', sortOrder: 48, subgroupBy: false },
      { id: uid('cat'), brandId, key: 'other', label: 'Other equipment', sortOrder: 50, subgroupBy: false },
      { id: uid('cat'), brandId, key: 'exclusives', label: 'Exclusives', sortOrder: 55, subgroupBy: false },
      { id: uid('cat'), brandId, key: 'decking', label: 'Decking', sortOrder: 60, subgroupBy: false },
      { id: uid('cat'), brandId, key: 'trailer', label: 'Trailer', sortOrder: 70, subgroupBy: false }
    ];
  }

  function extraCategoryDefs() {
    return [
      { key: 'cabin', label: 'Cabin options', sortOrder: 34, subgroupBy: false },
      { key: 'wetbar', label: 'Wet bar options', sortOrder: 36, subgroupBy: false },
      { key: 'lights', label: 'Lights', sortOrder: 42, subgroupBy: false },
      { key: 'sound', label: 'Sound systems', sortOrder: 44, subgroupBy: false },
      { key: 'generators', label: 'Generators', sortOrder: 48, subgroupBy: false },
      { key: 'exclusives', label: 'Exclusives', sortOrder: 55, subgroupBy: false }
    ];
  }

  function ensureBrandCategories(state, brandId) {
    if (!state.optionCategories) state.optionCategories = [];
    const existing = new Set(
      state.optionCategories.filter((c) => c.brandId === brandId).map((c) => c.key)
    );
    extraCategoryDefs().forEach((def) => {
      if (existing.has(def.key)) return;
      state.optionCategories.push({
        id: uid('cat'),
        brandId,
        key: def.key,
        label: def.label,
        sortOrder: def.sortOrder,
        subgroupBy: !!def.subgroupBy
      });
    });
    return Object.fromEntries(
      state.optionCategories.filter((c) => c.brandId === brandId).map((c) => [c.key, c.id])
    );
  }

  /** OlympicRibs 45SRC / 45SRC S — from manufacturer Excel price list. */
  function build45SrcCatalog(brandId, byKey) {
    const outboardId = uid('model');
    const sternId = uid('model');
    const now = new Date().toISOString();

    const techSpecs = {
      loaOutboards: '14.5 m',
      loaSterndrives: '15 m',
      boa: '3.65 m',
      internalBeam: '2.5 m',
      tubeDiam: '55-65 cm',
      maxHp: '3x600 HP',
      minHp: '800 HP',
      suggestedHp: '2 x 600 HP',
      dryWeight: '6300 Kg (incl. engines)',
      fuelTank: '1200 ltrs',
      waterTank: '200 ltrs',
      ceCategory: 'B',
      pax: '14'
    };

    const standardEquipment = [
      {
        category: 'Seats',
        items: [
          'Three seater sofa & 2 single Ullman Echelon seats for driver / co-driver'
        ]
      },
      {
        category: 'Hull / Internal',
        items: [
          'Stainless steel fuel tanks 1200 ltrs (2×600 ltrs)',
          'Fresh water tank 200 ltrs',
          'Black water tank 40 ltrs with macerator',
          'Fresh water system',
          'Engine room bilge pumps (4)',
          'ZipWake interceptors with automatic operation',
          'Electric windlass 800W',
          'Ultra Marine 8kg anchor',
          'Stainless steel chain 6mm 60m',
          'Custom bow roller',
          'Chain counter',
          'Windlass remote control'
        ]
      },
      {
        category: 'Deck',
        items: [
          'Seadeck decking',
          'Seasmart anodized aluminum cleat with logo',
          'Stainless steel cupholder at console',
          'Premium branded steering wheel',
          'Bow sunlounge with stainless steel cup',
          'Aft sundeck',
          'Aft lounge passenger seats with electrically reclining backs',
          'Engine room hatch electric actuators',
          'Exterior upholstery with Silvertex fabrics',
          'Aft shower',
          'Swimming ladder with custom handrails'
        ]
      },
      {
        category: 'T-Top',
        items: [
          'T-Top with stainless steel frame and full carbon top',
          'Windshield with tempered glass',
          'Ambient lighting with LED tape',
          'Ceiling LED spot lights',
          'Navigation and anchor lights',
          'Electric horn',
          'Wiper with water sprayer'
        ]
      },
      {
        category: 'Wet Bar',
        items: [
          'Stainless steel cup holders',
          'Stainless steel custom upholstered handrails',
          'Scanstrut USB / USB-C charging station',
          'Storage cupboards and drawers'
        ]
      },
      {
        category: 'Cabin',
        items: [
          'Internal decoration made from wood and upholstered surfaces',
          'Furniture with storage space',
          'Laminate flooring',
          'King size bed convertible to “U” shape sofa with table',
          'Interior upholstery',
          'LED secret lighting',
          'Reading lights',
          'USB / USB-C / 220V charging plugs',
          '220V plugs',
          'Sliding door',
          'Retractable staircase with gas springs',
          'Under-deck storage space convertible to small cabin'
        ]
      },
      {
        category: 'WC',
        items: [
          'Wooden furniture interior with LED secret lighting and LED spot lights',
          'Full bathroom kit with glass sink',
          'Electric toilet',
          'Retractable shower head',
          'Grey water system'
        ]
      },
      {
        category: 'Electrical and electronic equipment',
        items: [
          '12V electrical installation',
          'Digital switching (CZONE)',
          'Custom interface',
          'Plotter Raymarine Axiom Pro 12s',
          'VHF RAY 90 with black box',
          'Depth sounder',
          'Standard JL Audio sound system M3 (8× speakers, 1× subwoofer, 2× amps)',
          'Service batteries',
          'Remotely operated battery switches',
          'ACR (automatic charging relay)',
          'Engine room standalone lights',
          'Battery charger 16A with 15m cable',
          '220V installation with 3000W inverter',
          'Standard deck light package (1 zone)'
        ]
      }
    ];

    const models = [
      {
        id: outboardId,
        brandId,
        name: '45SRC',
        basePrice: 511957,
        currency: 'EUR',
        active: true,
        techSpecs: Object.assign({}, techSpecs),
        standardEquipment: standardEquipment.slice(),
        notes:
          'Outboards version — deck setup with wetbar or reverse sofa (standard equipment without engines). Engine lines are package prices (vessel + engines).',
        createdAt: now
      },
      {
        id: sternId,
        brandId,
        name: '45SRC S',
        basePrice: 520511,
        currency: 'EUR',
        active: true,
        techSpecs: Object.assign({}, techSpecs),
        standardEquipment: standardEquipment.slice(),
        notes:
          'Stern drives version with aft platform — wetbar or reverse sofa (standard equipment without engines). Engine lines are package prices (vessel + stern drives).',
        createdAt: now
      }
    ];

    const mk = (categoryKey, subgroup, name, price, modelIds, notes) => ({
      id: uid('opt'),
      categoryId: byKey[categoryKey],
      brandId,
      modelIds: modelIds || [outboardId, sternId],
      subgroup: subgroup || '',
      name,
      price,
      unit: 'pcs',
      notes: notes || '',
      active: true
    });

    const options = [
      // Yamaha outboard packages (vessel + engines)
      mk('engines', 'YAMAHA', 'Triple F350NSA — Light Grey Metallic (Elect. ST)', 632420, [outboardId]),
      mk('engines', 'YAMAHA', 'Triple F350NSA2 — Pearl White (Elect. ST)', 637924, [outboardId]),
      mk('engines', 'YAMAHA', 'Twin XTO 450NSA — Light Grey Metallic (Elect. ST)', 643797, [outboardId]),
      mk('engines', 'YAMAHA', 'Twin XTO 450NSA2 — Pearl White (Elect. ST)', 648109, [outboardId]),
      mk('engines', 'YAMAHA', 'Triple XTO 450NSA — Light Grey Metallic (Elect. ST)', 707735, [outboardId]),
      mk('engines', 'YAMAHA', 'Triple XTO 450NSA2 — Pearl White (Elect. ST)', 714206, [outboardId]),

      // Mercury outboard packages
      mk('engines', 'MERCURY', 'Dual 400 V10 EHPS', 619255, [outboardId]),
      mk('engines', 'MERCURY', 'Dual 400 V10 EHPS White', 621340, [outboardId]),
      mk('engines', 'MERCURY', 'Dual 425 V10 EHPS', 622190, [outboardId]),
      mk('engines', 'MERCURY', 'Dual 425 V10 EHPS White', 624276, [outboardId]),
      mk('engines', 'MERCURY', 'Dual 600 V12 DTS BL', 731406, [outboardId]),
      mk('engines', 'MERCURY', 'Dual 600 V12 DTS CF', 734880, [outboardId]),
      mk('engines', 'MERCURY', 'Triple 400 V10 EHPS', 666982, [outboardId]),
      mk('engines', 'MERCURY', 'Triple 400 V10 EHPS White', 670109, [outboardId]),
      mk('engines', 'MERCURY', 'Triple 425 V10 EHPS', 671386, [outboardId]),
      mk('engines', 'MERCURY', 'Triple 425 V10 EHPS White', 674513, [outboardId]),
      mk('engines', 'MERCURY', 'Triple R500 R-Drive 1.60', 752297, [outboardId]),
      mk('engines', 'MERCURY', 'Triple R500 R-Drive 1.60 CF', 755424, [outboardId]),
      mk('engines', 'MERCURY', 'Triple R500 R-Drive SM 1.60 RT', 773065, [outboardId]),
      mk('engines', 'MERCURY', 'Triple R500 R-Drive SM 1.60 RT CF', 776192, [outboardId]),
      mk('engines', 'MERCURY', 'Triple 600 V12 DTS BL', 831634, [outboardId]),
      mk('engines', 'MERCURY', 'Triple 600 V12 DTS CF', 836845, [outboardId]),

      // Volvo Penta stern drive packages
      mk('engines', 'VOLVO PENTA', '2 × 440 DP6 Joystick', 691586, [sternId]),
      mk(
        'engines',
        'VOLVO PENTA',
        '2 × 440 DP6 Joystick & Dynamic Positioning',
        702086,
        [sternId]
      ),

      // Decking
      mk('decking', '', 'Synthetic TEAK Esthec — Outboards version', 18596, [outboardId]),
      mk('decking', '', 'Burma TEAK wood — Outboards version', 17457, [outboardId]),
      mk('decking', '', 'Synthetic TEAK Esthec — Stern drives version', 23546, [sternId]),
      mk('decking', '', 'Burma TEAK wood — Stern drives version', 20163, [sternId]),

      // Cabin
      mk('cabin', '', 'Drawer refrigerator 35 ltrs', 1601),
      mk('cabin', '', 'Drawer freezer 35 ltrs', 1733),
      mk('cabin', '', 'Air Condition 10,000 BTU with 3000W Inverter/Charger', 9893),
      mk('cabin', '', 'Water heater 20 ltrs', 2055),

      // Wet bar
      mk('wetbar', '', 'Dual electric hob', 1448),
      mk('wetbar', '', 'Sink with folding tap', 1241),
      mk('wetbar', '', 'Drawer refrigerator 90 ltrs', 1320),
      mk('wetbar', '', 'Drawer freezer 60 ltrs', 1980),
      mk('wetbar', '', 'Drawer freezer 35 ltrs', 1605),

      // Electric / electronics
      mk('electronics', '', 'Electric fully flush aft tables (2 pcs)', 9088),
      mk('electronics', '', 'Electric fully flush bow table', 4973),
      mk('electronics', '', 'Additional Inverter/Battery charger 3000W/16A', 2880),
      mk('electronics', '', 'Scanstrut wireless charger on console (per piece)', 456),
      mk('electronics', '', '15Amp solar panels', 1360),
      mk('electronics', '', 'Main plotter upgrade to Raymarine AXIOM PRO 16″', 3570),
      mk(
        'electronics',
        '',
        'Second plotter at the console, Raymarine AXIOM PRO 12″ (outboard versions only)',
        5897,
        [outboardId]
      ),
      mk('electronics', '', 'T-Top aft plotter screen Raymarine plotter RV+ 12″', 4789),
      mk('electronics', '', 'Radar Raymarine HD Color Radome Radar 4kW with base', 4769),
      mk('electronics', '', 'FLIR night vision camera', 6863),

      // Lights
      mk('lights', '', 'Remotely operated search light', 632),
      mk('lights', '', 'Deck lights package upgrade (3 zones) single colour', 3588),
      mk('lights', '', 'Under water lights — single colour', 2700),
      mk(
        'lights',
        '',
        'Premium RGB package with underwater lights and Sound to light module (SHADOW CASTER)',
        13993
      ),

      // Sound
      mk(
        'sound',
        '',
        'Premium Soundsystem package Upgrade, JL Audio M6 (10× speakers, 2× subwoofer, 2× amplifiers)',
        5266
      ),
      mk(
        'sound',
        '',
        'Ultra Soundsystem package JL Audio M6 — with LED RGB (16× speakers, 2× subwoofers, 4× amplifiers)',
        8161
      ),

      // Generators
      mk(
        'generators',
        '',
        '3KWA single cylinder generator — available only for outboards version',
        13959,
        [outboardId]
      ),

      // Covers & awnings
      mk('covers', '', 'Ullman Echelon seats passengers package (3 pcs)', 40800),
      mk('covers', '', 'Bow awning system with carbon poles', 6546),
      mk(
        'covers',
        '',
        'Aft awning system with carbon poles — for outboards version',
        4600,
        [outboardId]
      ),

      // Other
      mk('other', '', 'Inox style removable modular shower head', 8280),
      mk('other', '', 'Quick release system for fenders (10 pcs)', 2592),
      mk(
        'other',
        '',
        'Electric recessed platform with three steps — available only for stern drives',
        18240,
        [sternId]
      ),

      // Exclusives
      mk('exclusives', '', 'Corto Maltese Limited Edition Customization', 50000)
    ].filter((o) => !!o.categoryId);

    return { models, options, outboardId, sternId };
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

    const src45 = build45SrcCatalog(brandId, byKey);

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
          photo: '',
          notes: '',
          createdAt: new Date().toISOString()
        },
        ...src45.models
      ],
      optionCategories: cats,
      options: options.concat(more, src45.options),
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
        defaultPaymentTerms:
          '40% upon order confirmation\n40% before completion / ready for delivery\n20% before delivery / shipment',
        quoteFooter: 'Prices in EUR. Quotation valid for 30 days unless otherwise stated. Technical specifications subject to manufacturer updates.'
      }
    };
  }

  function ensure45SrcCatalog(state) {
    if (!state || !Array.isArray(state.brands) || !state.brands.length) return false;
    const brand =
      state.brands.find((b) => String(b.slug || '').toLowerCase() === 'olympicribs') ||
      state.brands.find((b) => /olympic\s*ribs/i.test(String(b.name || ''))) ||
      state.brands[0];
    if (!brand) return false;
    const models = Array.isArray(state.models) ? state.models : [];
    const already = models.some((m) => /^45\s*src\b/i.test(String(m.name || '').trim()));
    if (already) {
      // Still ensure newer option categories exist for the brand.
      const beforeCats = (state.optionCategories || []).length;
      ensureBrandCategories(state, brand.id);
      if ((state.optionCategories || []).length > beforeCats) pendingCatalogPersist = true;
      return false;
    }
    const byKey = ensureBrandCategories(state, brand.id);
    // Engines / decking / covers categories are required for 45SRC options.
    ['engines', 'covers', 'electronics', 'other', 'decking'].forEach((key) => {
      if (byKey[key]) return;
      const fallback = defaultCategories(brand.id).find((c) => c.key === key);
      if (!fallback) return;
      state.optionCategories.push(fallback);
      byKey[key] = fallback.id;
    });
    const built = build45SrcCatalog(brand.id, byKey);
    state.models = models.concat(built.models);
    state.options = (Array.isArray(state.options) ? state.options : []).concat(built.options);
    pendingCatalogPersist = true;
    return true;
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
    if (!s.settings.defaultPaymentTerms) {
      s.settings.defaultPaymentTerms = base.settings.defaultPaymentTerms;
    }
    s.models = (s.models || []).map((m) => {
      if (!m || typeof m !== 'object') return m;
      if (m.photo == null) m.photo = '';
      return m;
    });
    s.quotations = (s.quotations || []).map((q) => {
      if (!q || typeof q !== 'object') return q;
      if (q.olrRef == null) q.olrRef = '';
      if (q.vesselPhoto == null) q.vesselPhoto = '';
      if (q.paymentTerms == null) q.paymentTerms = s.settings.defaultPaymentTerms || '';
      normalizeQuoteFees(q);
      return q;
    });
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
    } else {
      ensure45SrcCatalog(s);
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

  function isBusy() {
    return (
      prospectEditorId !== null ||
      quoteEditorId != null ||
      optionsDialogOpen ||
      document.body.classList.contains('dist-quote-open') ||
      document.body.classList.contains('dist-modal-open')
    );
  }

  function touchLocalWriteGuard(ms) {
    const hold = typeof ms === 'number' ? ms : 8000;
    localWriteGuardUntil = Math.max(localWriteGuardUntil, Date.now() + hold);
  }

  function shouldAcceptRemote() {
    return !isBusy() && Date.now() >= localWriteGuardUntil;
  }

  function saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      console.error('Distribution local save failed', err);
      return false;
    }
  }

  function persistAllIfFile() {
    try {
      if (window.AccountingData && typeof window.AccountingData.persistAll === 'function') {
        window.AccountingData.persistAll();
      }
    } catch (_) { /* ignore */ }
  }

  function persist(immediate) {
    const ok = saveLocal();
    touchLocalWriteGuard(immediate ? 10000 : 8000);
    const run = () => persistAllIfFile();
    if (immediate) {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = null;
      run();
      return ok;
    }
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(run, 400);
    return ok;
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
                  <div class="dist-opt-subgroup-block">
                    <div class="dist-opt-subgroup-label">${esc(g)}</div>
                    <table class="dist-table dist-options-table">
                      <colgroup>
                        <col class="dist-col-option">
                        <col class="dist-col-price">
                        <col class="dist-col-actions">
                      </colgroup>
                      <thead><tr><th>Option</th><th class="dist-col-price">Price</th><th class="dist-col-actions"></th></tr></thead>
                      <tbody>${groups[g].map((o) => optionRow(o)).join('')}</tbody>
                    </table>
                  </div>`).join('')}
              </div>`;
            }
            return `<div class="dist-opt-group"><div class="dist-opt-group-title">${esc(cat.label)}</div>
              <table class="dist-table dist-options-table">
                <colgroup>
                  <col class="dist-col-option">
                  <col class="dist-col-price">
                  <col class="dist-col-actions">
                </colgroup>
                <thead><tr><th>Option</th><th class="dist-col-price">Price</th><th class="dist-col-actions"></th></tr></thead>
                <tbody>${opts.map((o) => optionRow(o)).join('')}</tbody>
              </table></div>`;
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
      <td class="dist-col-option">
        <div class="dist-opt-name">${esc(o.name)}</div>
        ${o.notes ? `<div class="dist-opt-notes">${esc(o.notes)}</div>` : ''}
      </td>
      <td class="dist-col-price dist-price">${money(o.price)}</td>
      <td class="dist-col-actions">
        <div class="dist-actions dist-opt-row-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-dist-edit-opt="${esc(o.id)}">Edit</button>
          <button type="button" class="btn btn-secondary btn-sm" data-dist-del-opt="${esc(o.id)}">Remove</button>
        </div>
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
        photo: '',
        notes: '',
        createdAt: new Date().toISOString()
      });
    }
    const photoUrl = prompt(
      'Vessel photo URL (optional — used on quotations):',
      existing?.photo || ''
    );
    if (photoUrl != null) {
      const target = existing || state.models[state.models.length - 1];
      if (target) target.photo = String(photoUrl || '').trim();
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
      try {
        const data = readForm();
        if (!data.company && !data.contactName) {
          toast('Enter a company or contact name', 'error');
          return;
        }
        if (!state) {
          toast('Distribution data is not loaded yet. Try again.', 'error');
          return;
        }
        if (!Array.isArray(state.potentialClients)) state.potentialClients = [];
        if (existing) {
          Object.assign(existing, data, { updatedAt: new Date().toISOString() });
          const ok = persist(true);
          if (!ok) {
            toast('Could not save potential client (storage full or unavailable)', 'error');
            return;
          }
          toast('Potential client updated');
          prospectEditorId = null;
        } else {
          const created = normalizeProspect(Object.assign(emptyProspect(), data));
          state.potentialClients.unshift(created);
          const ok = persist(true);
          if (!ok) {
            state.potentialClients = state.potentialClients.filter((p) => p.id !== created.id);
            toast('Could not save potential client (storage full or unavailable)', 'error');
            return;
          }
          toast('Potential client added');
          prospectEditorId = null;
        }
        renderProspects();
      } catch (err) {
        console.error(err);
        toast(err?.message || 'Could not save potential client', 'error');
      }
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
            <thead><tr><th>Number</th><th>OLR Ref</th><th>Date</th><th>Potential client</th><th>Model</th><th>Total</th><th>Status</th><th></th></tr></thead>
            <tbody>
              ${list.map((q) => {
                const m = modelById(q.modelId);
                return `<tr>
                  <td><strong>${esc(q.number)}</strong></td>
                  <td>${esc(q.olrRef || '—')}</td>
                  <td>${esc(formatDistDate(q.date))}</td>
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
      olrRef: '',
      vesselPhoto: model.photo || '',
      paymentTerms: defaultPaymentTerms(),
      transportPackagingFee: 0,
      transportFee: 0,
      packagingFee: 0,
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
    if (q.olrRef == null) q.olrRef = '';
    if (q.paymentTerms == null) q.paymentTerms = defaultPaymentTerms();
    normalizeQuoteFees(q);
    if (q.vesselPhoto == null) q.vesselPhoto = '';
    recalcQuote(q);
    if (!q.prospectId && q.clientId) q.prospectId = '';
    const brand = brandById(q.brandId);
    const model = modelById(q.modelId);
    const vesselPhoto = resolveQuoteVesselPhoto(q, model);
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
          <div class="dist-field"><label>OLR Ref:</label><input type="text" id="dq-olr" value="${esc(q.olrRef || '')}" placeholder="OlympicRibs configurator reference"></div>
          <div class="dist-field"><label>Brand</label>
            <select id="dq-brand">${state.brands.map((b) => `<option value="${esc(b.id)}" ${b.id === q.brandId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
          </div>
          <div class="dist-field"><label>Model</label>
            <select id="dq-model">${state.models.filter((m) => m.brandId === q.brandId).map((m) => `<option value="${esc(m.id)}" ${m.id === q.modelId ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
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
          <div class="dist-field"><label>Transportation &amp; packaging fee (€)</label><input type="number" min="0" step="0.01" id="dq-transport-packaging" value="${esc(q.transportPackagingFee || 0)}"></div>
          <div class="dist-field full"><label>Payment terms</label><textarea id="dq-payment" rows="3" placeholder="e.g. deposit / balance schedule">${esc(q.paymentTerms || '')}</textarea></div>
          <div class="dist-field full"><label>Notes (shown on quote)</label>
            <textarea id="dq-notes" rows="2">${esc(q.notes || '')}</textarea>
          </div>
          <div class="dist-field full">
            <label>Vessel photo</label>
            <div class="dist-photo-row">
              <div class="dist-photo-preview">${vesselPhoto ? `<img src="${esc(vesselPhoto)}" alt="Vessel">` : '<span>No photo yet</span>'}</div>
              <div class="dist-actions" style="flex-direction:column;align-items:stretch">
                <input type="file" id="dq-photo-file" accept="image/*">
                <input type="url" id="dq-photo-url" value="${esc(q.vesselPhoto && String(q.vesselPhoto).indexOf('data:') === 0 ? '' : (q.vesselPhoto || ''))}" placeholder="Or paste image URL">
                <button type="button" class="btn btn-secondary btn-sm" id="dq-photo-clear">Remove photo</button>
              </div>
            </div>
          </div>
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
          <div class="row"><span>Lines after discount</span><strong>${money(q.linesTotal != null ? q.linesTotal : (q.subtotal - q.discountAmount), q.currency)}</strong></div>
          <div class="row"><span>Transportation &amp; packaging</span><strong>${money(transportPackagingFeeAmount(q), q.currency)}</strong></div>
          <div class="row grand"><span>Final quote total</span><strong>${money(q.total, q.currency)}</strong></div>
          ${q.convertedToProformaId ? `<div class="row"><span>Proforma</span><strong>${esc(q.convertedToProformaNumber || q.convertedToProformaId)}</strong></div>` : ''}
        </div>
      </div>`;

    const saveFields = () => {
      q.date = el.querySelector('#dq-date')?.value || q.date;
      q.status = el.querySelector('#dq-status')?.value || q.status;
      q.olrRef = String(el.querySelector('#dq-olr')?.value || '').trim();
      q.notes = el.querySelector('#dq-notes')?.value || '';
      q.paymentTerms = String(el.querySelector('#dq-payment')?.value || '').trim();
      q.transportPackagingFee = Number(el.querySelector('#dq-transport-packaging')?.value) || 0;
      q.transportFee = q.transportPackagingFee;
      q.packagingFee = 0;
      const photoUrl = String(el.querySelector('#dq-photo-url')?.value || '').trim();
      if (photoUrl) q.vesselPhoto = photoUrl;
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
        if (!q.vesselPhoto && m.photo) q.vesselPhoto = m.photo;
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
    ['#dq-olr', '#dq-payment', '#dq-transport-packaging', '#dq-notes', '#dq-date', '#dq-status'].forEach((sel) => {
      el.querySelector(sel)?.addEventListener('change', () => {
        saveFields();
        persist();
        if (sel === '#dq-transport-packaging') renderQuoteEditor(el);
      });
    });
    el.querySelector('#dq-transport-packaging')?.addEventListener('input', () => {
      saveFields();
    });
    el.querySelector('#dq-photo-file')?.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        q.vesselPhoto = await readImageAsDataUrl(file, 1.5 * 1024 * 1024);
        q.updatedAt = new Date().toISOString();
        await persist(true);
        renderQuoteEditor(el);
      } catch (err) {
        console.error(err);
        toast(err?.message || 'Could not read that image', 'error');
      }
    });
    el.querySelector('#dq-photo-url')?.addEventListener('change', () => {
      const url = String(el.querySelector('#dq-photo-url')?.value || '').trim();
      q.vesselPhoto = url;
      q.updatedAt = new Date().toISOString();
      persist(true);
      renderQuoteEditor(el);
    });
    el.querySelector('#dq-photo-clear')?.addEventListener('click', () => {
      q.vesselPhoto = '';
      q.updatedAt = new Date().toISOString();
      persist(true);
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
      optionsDialogOpen = false;
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

    optionsDialogOpen = true;
    document.body.classList.add('dist-modal-open');
    document.body.appendChild(overlay);
    refreshSelectionUi();
  }

  function closeQuotePrintSheet() {
    document.querySelectorAll('.dist-quote-sheet').forEach((el) => el.remove());
    document.body.classList.remove('dist-quote-open');
  }

  function formatSpecLabel(key) {
    const map = {
      loa: 'LOA',
      loaOutboards: 'LOA (Outboards)',
      loaSterndrives: 'LOA (Sterndrives)',
      boa: 'BOA',
      internalBeam: 'Internal beam',
      tubeDiam: 'Tube diam.',
      maxHp: 'Max HP',
      minHp: 'Min HP',
      suggestedHp: 'Suggested HP',
      dryWeight: 'Dry weight',
      fuelTank: 'Fuel tank',
      waterTank: 'Water tank',
      ceCategory: 'CE category',
      pax: 'Passengers'
    };
    if (map[key]) return map[key];
    return String(key || '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function getQuoteLogoHtml() {
    try {
      if (window.DataStore && typeof window.DataStore.getDocumentLogoHtml === 'function') {
        return window.DataStore.getDocumentLogoHtml('proforma', 'dist-quote-logo') ||
          window.DataStore.getDocumentLogoHtml('invoice', 'dist-quote-logo') || '';
      }
    } catch (_) { /* ignore */ }
    return '';
  }

  function getCompanyContactBits() {
    try {
      if (window.DataStore && typeof window.DataStore.getCompanySettings === 'function') {
        const s = window.DataStore.getCompanySettings() || {};
        return {
          name: s.companyName || '',
          address: s.companyAddress || '',
          email: s.companyEmail || '',
          phone: s.companyPhone || '',
          website: s.companyWebsite || '',
          taxId: s.companyTaxId || ''
        };
      }
    } catch (_) { /* ignore */ }
    return { name: '', address: '', email: '', phone: '', website: '', taxId: '' };
  }

  function printQuote(id) {
    const q = quoteById(id);
    if (!q) {
      toast('Quotation not found', 'error');
      return;
    }
    recalcQuote(q);
    const brand = brandById(q.brandId);
    const model = modelById(q.modelId);
    const vesselPhoto = resolveQuoteVesselPhoto(q, model);
    const transportPackaging = transportPackagingFeeAmount(q);
    const paymentTerms = String(q.paymentTerms || '').trim() || defaultPaymentTerms();
    const olrRef = String(q.olrRef || '').trim();
    const companyBits = getCompanyContactBits();
    const company = state.settings.companyName || companyBits.name || 'OlympicRibs Distribution';
    const footer = state.settings.quoteFooter ||
      'Prices in EUR. Quotation valid for 30 days unless otherwise stated. Technical specifications subject to manufacturer updates.';
    const specs = model?.techSpecs || {};
    const std = model?.standardEquipment || [];
    const lines = Array.isArray(q.lines) ? q.lines : [];
    const optionLines = lines.filter((ln) => ln.kind === 'option');
    const optionalCount = optionLines.length;
    const logoHtml = getQuoteLogoHtml();
    const issued = q.date || todayISO();
    const validUntil = (() => {
      try {
        const d = new Date(issued + 'T12:00:00');
        if (Number.isNaN(d.getTime())) return '';
        d.setDate(d.getDate() + 30);
        return d.toISOString().slice(0, 10);
      } catch (_) {
        return '';
      }
    })();
    const companyContact = [
      companyBits.address,
      companyBits.phone,
      companyBits.email,
      companyBits.website
    ].filter(Boolean).join(' · ');
    const detailsText = (state.settings.companyDetails || '').trim() || companyContact;

    closeQuotePrintSheet();

    const hasDiscount = Number(q.discountAmount) > 0;
    const linesAfterDisc = q.linesTotal != null ? q.linesTotal : (q.subtotal - (q.discountAmount || 0));
    const clientBits = [
      q.clientSnapshot?.contactName,
      q.clientSnapshot?.email,
      q.clientSnapshot?.phone,
      q.clientSnapshot?.address
    ].filter(Boolean);

    const sheet = document.createElement('div');
    sheet.className = 'dist-quote-sheet';
    sheet.innerHTML = `
      <div class="dist-quote-toolbar no-print">
        <div class="dist-quote-toolbar-hint">Full quotation preview — scroll to see everything</div>
        <div class="dist-actions">
          <button type="button" class="btn btn-primary btn-sm" data-dist-print-run>Print / Save PDF</button>
          <button type="button" class="btn btn-secondary btn-sm" data-dist-print-close>Close</button>
        </div>
      </div>
      <div class="dist-quote-scroll">
      <article class="dist-quote-doc dist-quote-doc--portrait dist-quote-doc--compact">
        <div class="dist-quote-accent"></div>

        <header class="dist-quote-top">
          <div class="dist-quote-brand">
            ${logoHtml || `<div class="dist-quote-mark">${esc((brand?.name || 'OR').slice(0, 2).toUpperCase())}</div>`}
            <div>
              <div class="dist-quote-company">${esc(company)}</div>
              <div class="dist-quote-brand-sub">${esc(brand?.name || 'Distribution')} · Official quotation</div>
              ${detailsText ? `<div class="dist-quote-company-details">${esc(detailsText)}</div>` : ''}
            </div>
          </div>
          <div class="dist-quote-titleblock">
            <div class="dist-quote-kicker">Commercial offer</div>
            <div class="dist-quote-title">Quotation</div>
            <div class="dist-quote-number">${esc(q.number)}</div>
            <div class="dist-quote-title-meta">
              <span>Issued ${esc(formatDistDate(issued))}</span>
              ${validUntil ? `<span>Valid until ${esc(formatDistDate(validUntil))}</span>` : ''}
              ${olrRef ? `<span class="dist-quote-olr">OLR Ref: ${esc(olrRef)}</span>` : ''}
            </div>
          </div>
        </header>

        <section class="dist-quote-intro ${vesselPhoto ? 'has-photo' : ''}">
          <div class="dist-quote-card">
            <div class="dist-quote-card-label">Prepared for</div>
            <div class="dist-quote-card-name">${esc(q.clientSnapshot?.name || '—')}</div>
            ${clientBits.map((line) => `<div class="dist-quote-card-line">${esc(line)}</div>`).join('')}
          </div>
          <div class="dist-quote-card dist-quote-card--model">
            <div class="dist-quote-card-label">Vessel</div>
            <div class="dist-quote-card-name">${esc(brand?.name || '')} ${esc(model?.name || '')}</div>
            <div class="dist-quote-card-line">Currency: ${esc(q.currency || 'EUR')}</div>
            <div class="dist-quote-card-line dist-quote-card-final">Final price: ${money(q.total, q.currency)}</div>
            <div class="dist-quote-card-line">Optional selections: ${optionalCount}</div>
          </div>
          ${vesselPhoto ? `
            <div class="dist-quote-vessel-photo">
              <img src="${esc(vesselPhoto)}" alt="${esc((brand?.name || '') + ' ' + (model?.name || 'Vessel'))}">
            </div>` : ''}
        </section>

        <section class="dist-quote-section dist-quote-section--pricing">
          <div class="dist-quote-section-head">
            <h2>Pricing</h2>
            <span>${lines.length} line${lines.length === 1 ? '' : 's'}</span>
          </div>
          <table class="dist-quote-lines-print">
            <thead>
              <tr>
                <th class="desc">Description</th>
                <th class="num">Qty</th>
                <th class="num">Unit</th>
                <th class="num">Disc.</th>
                <th class="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${lines.length ? lines.map((ln) => `
                <tr class="${ln.categoryKey === 'engines' ? 'is-engine' : ''}">
                  <td class="desc">
                    <div class="dist-quote-line-name">${esc(ln.description || '')}</div>
                    ${ln.categoryKey === 'engines' ? '<div class="dist-quote-line-tag">Engine package · includes standard equipment</div>' : ''}
                    ${ln.categoryKey === 'hull' ? '<div class="dist-quote-line-tag">Standard equipment without engine</div>' : ''}
                  </td>
                  <td class="num">${esc(ln.qty)}</td>
                  <td class="num">${money(ln.unitPrice, q.currency)}</td>
                  <td class="num">${Number(ln.discountPercent) ? esc(Number(ln.discountPercent)) + '%' : '—'}</td>
                  <td class="num dist-quote-line-amount">${money(lineTotal(ln), q.currency)}</td>
                </tr>`).join('') : '<tr><td colspan="5">No line items on this quotation.</td></tr>'}
            </tbody>
          </table>

          <div class="dist-quote-totals-wrap">
            <div class="dist-quote-totals-print">
              <div class="row"><span>List total</span><span>${money(q.subtotal, q.currency)}</span></div>
              ${hasDiscount ? `<div class="row"><span>Discounts</span><span>− ${money(q.discountAmount, q.currency)}</span></div>
              <div class="row"><span>After discount</span><span>${money(linesAfterDisc, q.currency)}</span></div>` : ''}
              ${transportPackaging > 0 ? `<div class="row"><span>Transportation &amp; packaging</span><span>${money(transportPackaging, q.currency)}</span></div>` : ''}
              <div class="row grand">
                <span>Final total</span>
                <span>${money(q.total, q.currency)}</span>
              </div>
            </div>
          </div>
        </section>

        <section class="dist-quote-section dist-quote-section--terms">
          <div class="dist-quote-terms-grid">
            <div>
              <div class="dist-quote-section-head"><h2>Payment terms</h2></div>
              <div class="dist-quote-notes dist-quote-payment-terms">${esc(paymentTerms)}</div>
            </div>
            <div>
              <div class="dist-quote-section-head"><h2>Validity</h2></div>
              <div class="dist-quote-notes">
                Valid for 30 days from issue date${validUntil ? ` (until ${esc(validUntil)})` : ''}.
                Prices and availability are subject to confirmation at order.
                ${q.notes ? `\n\nNotes: ${esc(q.notes)}` : ''}
              </div>
            </div>
          </div>
        </section>

        ${Object.keys(specs).length ? `
          <section class="dist-quote-section dist-quote-section--specs">
            <div class="dist-quote-section-head">
              <h2>Technical specifications</h2>
              <span>${esc(model?.name || '')}</span>
            </div>
            <div class="dist-quote-spec-grid">
              ${Object.entries(specs).map(([k, v]) => `
                <div class="dist-quote-spec">
                  <div class="dist-quote-spec-label">${esc(formatSpecLabel(k))}</div>
                  <div class="dist-quote-spec-value">${esc(v)}</div>
                </div>`).join('')}
            </div>
          </section>` : ''}

        ${std.length ? `
          <section class="dist-quote-section dist-quote-section--std">
            <div class="dist-quote-section-head">
              <h2>Standard equipment</h2>
              <span>Included in base configuration</span>
            </div>
            <div class="dist-quote-std-grid">
              ${std.map((g) => `
                <div class="dist-quote-std-group">
                  <div class="dist-quote-std-title">${esc(g.category)}</div>
                  <p class="dist-quote-std-items">${(g.items || []).map((i) => esc(i)).join(' · ')}</p>
                </div>`).join('')}
            </div>
          </section>` : ''}

        <footer class="dist-quote-doc-footer">
          <div class="dist-quote-footer-note">${esc(footer)}</div>
          <div class="dist-quote-signoff">
            <div class="dist-quote-sign-line"></div>
            <div class="dist-quote-sign-caption">Authorized signature / stamp</div>
          </div>
        </footer>
      </article>
      </div>`;

    document.body.appendChild(sheet);
    document.body.classList.add('dist-quote-open');

    const scrollEl = sheet.querySelector('.dist-quote-scroll');
    if (scrollEl) scrollEl.scrollTop = 0;

    sheet.querySelector('[data-dist-print-close]')?.addEventListener('click', closeQuotePrintSheet);
    sheet.querySelector('[data-dist-print-run]')?.addEventListener('click', () => {
      window.print();
    });
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
    const transportPackaging = transportPackagingFeeAmount(q);
    if (transportPackaging > 0) {
      items.push({
        description: 'Transportation & packaging',
        quantity: 1,
        persons: 1,
        hours: 0,
        price: transportPackaging
      });
    }

    const subtotal = items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.price) || 0), 0);
    const taxRate = Number(q.taxRate) || 0;
    const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
    const total = Math.round((subtotal + taxAmount) * 100) / 100;
    const invoiceId = uid('inv');
    const olrRef = String(q.olrRef || '').trim();
    const paymentTerms = String(q.paymentTerms || '').trim();
    const noteParts = [
      `Converted from distribution quotation ${q.number}.`,
      olrRef ? `OLR Ref: ${olrRef}` : '',
      paymentTerms ? `Payment terms:\n${paymentTerms}` : '',
      q.notes || ''
    ].filter(Boolean);

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
      notes: noteParts.join('\n\n'),
      distributionQuoteId: q.id,
      distributionQuoteNumber: q.number,
      distributionProspectId: q.prospectId || '',
      distributionOlrRef: olrRef,
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
                  <td>${esc(formatDistDate(v.saleDate))}</td>
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

  function render(options) {
    options = options || {};
    if (!state) return;
    // Background shared-data polls must not wipe open Distribution forms.
    if (!options.force && isBusy()) return;
    if (section === 'dashboard') renderDashboard();
    else if (section === 'catalog') renderCatalog();
    else if (section === 'prospects') renderProspects();
    else if (section === 'quotations') renderQuotations();
    else if (section === 'sold') renderSold();
  }

  function applyRemote(data) {
    if (!data) return false;
    // Don't clobber an open editor, and briefly ignore stale poll payloads after a local save.
    if (!shouldAcceptRemote()) return false;
    state = normalizeState(data);
    if (pendingCatalogPersist) {
      pendingCatalogPersist = false;
      persist(true);
    } else {
      saveLocal();
    }
    render({ force: true });
    return true;
  }

  function init() {
    state = loadLocal();
    if (!Array.isArray(state.potentialClients)) state.potentialClients = [];
    if (pendingCatalogPersist) {
      pendingCatalogPersist = false;
      persist(true);
    }
    const page = document.getElementById('page-distribution');
    if (page && page.classList.contains('active')) {
      setSection(section, { keepEditor: true });
    } else {
      render({ force: true });
    }
  }

  window.DistributionModule = {
    init,
    render,
    setSection,
    getState: () => state,
    applyRemote,
    persist,
    isBusy,
    shouldAcceptRemote,
    SECTIONS
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('page-distribution')) init();
  });
})();
