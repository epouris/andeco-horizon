/**
 * One-shot PDF quotation restore into distribution_data (Postgres).
 * Temporary — remove after ORQ-1009 / ORQ-1010 (and any other missing) are confirmed.
 */
'use strict';

const PACK = {
  "id": "pdf-restore-2026-09-07-d",
  "minQuoteSequence": 1013,
  "prospects": [
    {
      "key": "mikekombos@gmail.com",
      "company": "",
      "contactName": "Michalis Kombos",
      "email": "mikekombos@gmail.com",
      "phone": "+4407878186519",
      "city": "Protaras",
      "country": "Cyprus",
      "source": "other",
      "status": "quoted",
      "interestNotes": "OlympicRibs 45SRC — ORQ-1001 / OLR 8PLIJP94",
      "notes": "Restored from issued quotation PDF ORQ-1001."
    },
    {
      "key": "eliaskikit@gmail.com",
      "company": "",
      "contactName": "Elias Elia",
      "email": "eliaskikit@gmail.com",
      "phone": "+35799533018",
      "city": "Larnaca",
      "country": "Cyprus",
      "source": "other",
      "status": "quoted",
      "interestNotes": "OlympicRibs 45SRC — ORQ-1002 / OLR Z0PCQC6K",
      "notes": "Restored from issued quotation PDF ORQ-1002. Phone last digit inferred from OCR."
    },
    {
      "key": "ermisnicolaou3@gmail.com",
      "company": "",
      "contactName": "Ermis Nicolaou",
      "email": "ermisnicolaou3@gmail.com",
      "phone": "+35797820428",
      "city": "",
      "country": "Cyprus",
      "source": "other",
      "status": "quoted",
      "interestNotes": "OlympicRibs 720 HL — ORQ-1009 / OLR Q0SD65IX",
      "notes": "Restored from issued quotation PDF ORQ-1009."
    },
    {
      "key": "kavallaris96@gmail.com",
      "company": "",
      "contactName": "Anastasis Kavallaris",
      "email": "kavallaris96@gmail.com",
      "phone": "+35799881121",
      "city": "",
      "country": "Cyprus",
      "source": "other",
      "status": "quoted",
      "interestNotes": "OlympicRibs 720 HL — ORQ-1010 / OLR SN04KS98",
      "notes": "Restored from issued quotation PDF ORQ-1010."
    },
    {
      "key": "constantinosal@hotmail.co.uk",
      "company": "",
      "contactName": "Constantinos Antoniou",
      "email": "constantinosal@hotmail.co.uk",
      "phone": "+35799007005",
      "city": "Nicosia",
      "country": "Cyprus",
      "source": "other",
      "status": "quoted",
      "interestNotes": "OlympicRibs 30SR — ORQ-1011 / OLR BNPRJRMZ",
      "notes": "Restored from issued quotation PDF ORQ-1011."
    },
    {
      "key": "solonas.heritage@gmail.com",
      "company": "",
      "contactName": "Solonas Charalambous",
      "email": "solonas.heritage@gmail.com",
      "phone": "+35799413740",
      "city": "Limassol",
      "country": "Cyprus",
      "source": "other",
      "status": "quoted",
      "interestNotes": "OlympicRibs 720 HL — ORQ-1012 / OLR ZW8DTVCW",
      "notes": "Restored from issued quotation PDF ORQ-1012."
    }
  ],
  "quotations": [
    {
      "number": "ORQ-1001",
      "olrRef": "8PLIJP94",
      "date": "2026-08-07",
      "validUntil": "2026-09-06",
      "status": "sent",
      "prospectEmail": "mikekombos@gmail.com",
      "modelLabel": "45SRC",
      "currency": "EUR",
      "transportPackagingFee": 5000,
      "packageLine": {
        "description": "OlympicRibs 45SRC + MERCURY - Dual 600 V12 DTS CF (incl. standard equipment)",
        "unitPrice": 734880
      },
      "optionLines": [
        {
          "description": "Bow awning system with carbon poles",
          "unitPrice": 6546
        },
        {
          "description": "Aft awning system with carbon poles — for outboards version",
          "unitPrice": 4600
        },
        {
          "description": "Drawer refrigerator 35 ltrs",
          "unitPrice": 1601
        },
        {
          "description": "Drawer freezer 35 ltrs",
          "unitPrice": 1733
        },
        {
          "description": "Air Condition 10,000 BTU with 3000W Inverter/Charger",
          "unitPrice": 9893
        },
        {
          "description": "Water heater 20 ltrs",
          "unitPrice": 2055
        },
        {
          "description": "Electric fully flush aft tables (2 pcs)",
          "unitPrice": 9088
        },
        {
          "description": "Electric fully flush bow table",
          "unitPrice": 4973
        },
        {
          "description": "Additional Inverter/Battery charger 3000W/16A",
          "unitPrice": 2880
        },
        {
          "description": "Scanstrut wireless charger on console (per piece)",
          "unitPrice": 456
        },
        {
          "description": "15Amp solar panels",
          "unitPrice": 1360
        },
        {
          "description": "Main plotter upgrade to Raymarine AXIOM PRO 16\"",
          "unitPrice": 3570
        },
        {
          "description": "Second plotter at the console, Raymarine AXIOM PRO 12\" (outboard versions only)",
          "unitPrice": 5897
        },
        {
          "description": "Radar Raymarine HD Color Radome Radar 4kW with base",
          "unitPrice": 4769
        },
        {
          "description": "FLIR night vision camera",
          "unitPrice": 6863
        },
        {
          "description": "Remotely operated search light",
          "unitPrice": 632
        },
        {
          "description": "Deck lights package upgrade (3 zones) single colour",
          "unitPrice": 3588
        },
        {
          "description": "Under water lights — single colour",
          "unitPrice": 2700
        },
        {
          "description": "Premium RGB package with underwater lights and Sound to light module (SHADOW CASTER)",
          "unitPrice": 13993
        },
        {
          "description": "Ultra Soundsystem package JL Audio M6 — with LED RGB (16x speakers, 2x subwoofers, 4x amplifiers)",
          "unitPrice": 8161
        },
        {
          "description": "3KWA single cylinder generator — available only for outboards version",
          "unitPrice": 13959
        },
        {
          "description": "Inox style removable modular shower head",
          "unitPrice": 8280
        },
        {
          "description": "Quick release system for fenders (10 pcs)",
          "unitPrice": 2592
        }
      ],
      "colors": [
        {
          "area": "Engine colour",
          "value": "Cold Fusion",
          "code": ""
        },
        {
          "area": "Main deck",
          "value": "Pure White",
          "code": ""
        },
        {
          "area": "Foam deck main colour",
          "value": "Teak",
          "code": ""
        },
        {
          "area": "Secondary colour",
          "value": "Black",
          "code": ""
        },
        {
          "area": "Upholstery",
          "value": "White",
          "code": ""
        },
        {
          "area": "Hull",
          "value": "Traffic White",
          "code": ""
        },
        {
          "area": "Tubes",
          "value": "Ice White Carbon",
          "code": ""
        },
        {
          "area": "Bimini top",
          "value": "Traffic White",
          "code": ""
        },
        {
          "area": "Fender",
          "value": "Military Grey",
          "code": ""
        },
        {
          "area": "Main upholstery colour",
          "value": "Maglia Artic",
          "code": ""
        }
      ],
      "expectedFinal": 860069,
      "modelNeedle": "45src"
    },
    {
      "number": "ORQ-1002",
      "olrRef": "Z0PCQC6K",
      "date": "2026-08-07",
      "validUntil": "2026-09-06",
      "status": "sent",
      "prospectEmail": "eliaskikit@gmail.com",
      "modelLabel": "45SRC",
      "currency": "EUR",
      "transportPackagingFee": 5000,
      "packageLine": {
        "description": "OlympicRibs 45SRC + MERCURY - Dual 600 V12 DTS CF (incl. standard equipment)",
        "unitPrice": 734880
      },
      "optionLines": [
        {
          "description": "Bow awning system with carbon poles",
          "unitPrice": 6546
        },
        {
          "description": "Aft awning system with carbon poles — for outboards version",
          "unitPrice": 4600
        },
        {
          "description": "Air Condition 10,000 BTU with 3000W Inverter/Charger",
          "unitPrice": 9893
        },
        {
          "description": "Dual electric hob",
          "unitPrice": 1448
        },
        {
          "description": "Sink with folding tap",
          "unitPrice": 1241
        },
        {
          "description": "Drawer refrigerator 90 ltrs",
          "unitPrice": 1320
        },
        {
          "description": "Electric fully flush bow table",
          "unitPrice": 4973
        },
        {
          "description": "Additional Inverter/Battery charger 3000W/16A",
          "unitPrice": 2880
        },
        {
          "description": "Scanstrut wireless charger on console (per piece)",
          "unitPrice": 456
        },
        {
          "description": "15Amp solar panels",
          "unitPrice": 1360
        },
        {
          "description": "Second plotter at the console, Raymarine AXIOM PRO 12\" (outboard versions only)",
          "unitPrice": 5897
        },
        {
          "description": "Radar Raymarine HD Color Radome Radar 4kW with base",
          "unitPrice": 4769
        },
        {
          "description": "FLIR night vision camera",
          "unitPrice": 6863
        },
        {
          "description": "Remotely operated search light",
          "unitPrice": 632
        },
        {
          "description": "Deck lights package upgrade (3 zones) single colour",
          "unitPrice": 3588
        },
        {
          "description": "Under water lights — single colour",
          "unitPrice": 2700
        },
        {
          "description": "Premium RGB package with underwater lights and Sound to light module (SHADOW CASTER)",
          "unitPrice": 13993
        },
        {
          "description": "3KWA single cylinder generator — available only for outboards version",
          "unitPrice": 13959
        },
        {
          "description": "Inox style removable modular shower head",
          "unitPrice": 8280
        },
        {
          "description": "Quick release system for fenders (10 pcs)",
          "unitPrice": 2592
        },
        {
          "description": "Synthetic TEAK Esthec — Outboards version",
          "unitPrice": 18596
        }
      ],
      "colors": [],
      "expectedFinal": 856466,
      "modelNeedle": "45src"
    },
    {
      "number": "ORQ-1009",
      "olrRef": "Q0SD65IX",
      "date": "2026-08-11",
      "validUntil": "2026-09-10",
      "status": "sent",
      "prospectEmail": "ermisnicolaou3@gmail.com",
      "modelLabel": "720 HL",
      "currency": "EUR",
      "transportPackagingFee": 2500,
      "packageLine": {
        "description": "OlympicRibs 720 HL + YAMAHA - F300XSB2 — Pearl White (incl. standard equipment)",
        "unitPrice": 78579.41
      },
      "optionLines": [
        {
          "description": "Dromeas 670 Trailer with approval",
          "unitPrice": 6800
        }
      ],
      "colors": [
        {
          "area": "Engine colour",
          "value": "Cold Fusion",
          "code": ""
        },
        {
          "area": "Engine colour",
          "value": "Pearl White",
          "code": ""
        },
        {
          "area": "Main deck",
          "value": "Pure White",
          "code": ""
        },
        {
          "area": "Foam deck main colour",
          "value": "Teak",
          "code": ""
        },
        {
          "area": "Foam deck main colour",
          "value": "Terra",
          "code": ""
        },
        {
          "area": "Secondary colour",
          "value": "White",
          "code": ""
        },
        {
          "area": "Hull",
          "value": "Pure White",
          "code": ""
        },
        {
          "area": "Tubes",
          "value": "Ice White Carbon",
          "code": ""
        },
        {
          "area": "Fender",
          "value": "Black",
          "code": ""
        },
        {
          "area": "Main upholstery colour",
          "value": "Silvertex Aluminium",
          "code": ""
        }
      ],
      "expectedFinal": 87879.41,
      "modelNeedle": "720"
    },
    {
      "number": "ORQ-1010",
      "olrRef": "SN04KS98",
      "date": "2026-08-11",
      "validUntil": "2026-09-10",
      "status": "sent",
      "prospectEmail": "kavallaris96@gmail.com",
      "modelLabel": "720 HL",
      "currency": "EUR",
      "transportPackagingFee": 2500,
      "packageLine": {
        "description": "OlympicRibs 720 HL + YAMAHA - F250NSB — Light Grey Metallic (incl. standard equipment)",
        "unitPrice": 74865.68
      },
      "optionLines": [
        {
          "description": "Full parking cover",
          "unitPrice": 1436.5
        },
        {
          "description": "Console cover",
          "unitPrice": 450
        },
        {
          "description": "Sun awning with INOX railings",
          "unitPrice": 1434.51
        },
        {
          "description": "Aft locker screen",
          "unitPrice": 600
        },
        {
          "description": "Service battery",
          "unitPrice": 350
        },
        {
          "description": "Sound Hertz, 4 speakers & amplifier",
          "unitPrice": 1969.55
        },
        {
          "description": "INOX anchor with swivel and 35m chain",
          "unitPrice": 800
        },
        {
          "description": "Painted INOX with electrostatic paint",
          "unitPrice": 700
        },
        {
          "description": "SeaDeck foam",
          "unitPrice": 2450
        },
        {
          "description": "ELXIS A200",
          "unitPrice": 7850
        }
      ],
      "colors": [
        {
          "area": "Engine colour",
          "value": "Light Grey Metallic",
          "code": ""
        },
        {
          "area": "Main deck",
          "value": "Tele Grey",
          "code": ""
        },
        {
          "area": "Deck finish",
          "value": "SeaDeck Foam Deck",
          "code": ""
        },
        {
          "area": "Foam deck main colour",
          "value": "Capuccino",
          "code": ""
        },
        {
          "area": "Secondary colour",
          "value": "Black",
          "code": ""
        },
        {
          "area": "Hull",
          "value": "Jet Black",
          "code": ""
        },
        {
          "area": "Tubes",
          "value": "Military Grey Carbon",
          "code": ""
        },
        {
          "area": "Fender",
          "value": "Black",
          "code": ""
        },
        {
          "area": "Main upholstery colour",
          "value": "Silvertex Aluminium",
          "code": ""
        }
      ],
      "expectedFinal": 95406.24,
      "modelNeedle": "720"
    },
    {
      "number": "ORQ-1011",
      "olrRef": "BNPRJRMZ",
      "date": "2026-08-18",
      "validUntil": "2026-09-17",
      "status": "sent",
      "prospectEmail": "constantinosal@hotmail.co.uk",
      "modelLabel": "30SR",
      "currency": "EUR",
      "transportPackagingFee": 5000,
      "packageLine": {
        "description": "OlympicRibs 30SR + MERCURY - Twin 200 V6 CMS DTS (El.Hy. Steering) (incl. standard equipment)",
        "unitPrice": 222065
      },
      "optionLines": [
        {
          "description": "Full parking cover for winterising",
          "unitPrice": 2800
        },
        {
          "description": "Underwater lights",
          "unitPrice": 1342
        },
        {
          "description": "Reverse sofa layout option",
          "unitPrice": 3000
        }
      ],
      "colors": [
        {
          "area": "Engine colour",
          "value": "Black",
          "code": ""
        },
        {
          "area": "Main deck",
          "value": "Jet Black",
          "code": ""
        },
        {
          "area": "Deck finish",
          "value": "SeaDeck Foam Deck",
          "code": ""
        },
        {
          "area": "Foam deck main colour",
          "value": "Moonrock",
          "code": ""
        },
        {
          "area": "Secondary colour",
          "value": "White",
          "code": ""
        },
        {
          "area": "Hull",
          "value": "Jet Black",
          "code": ""
        },
        {
          "area": "Tubes",
          "value": "Black Carbon",
          "code": ""
        },
        {
          "area": "Bimini top",
          "value": "Jet Black",
          "code": ""
        },
        {
          "area": "Fender",
          "value": "Black",
          "code": ""
        },
        {
          "area": "Main upholstery colour",
          "value": "Silvertex Cobre",
          "code": ""
        }
      ],
      "expectedFinal": 234207,
      "modelNeedle": "30sr"
    },
    {
      "number": "ORQ-1012",
      "olrRef": "ZW8DTVCW",
      "date": "2026-08-20",
      "validUntil": "2026-09-19",
      "status": "sent",
      "prospectEmail": "solonas.heritage@gmail.com",
      "modelLabel": "720 HL",
      "currency": "EUR",
      "transportPackagingFee": 2500,
      "packageLine": {
        "description": "OlympicRibs 720 HL + MERCURY - 300 AMS DTS EHPS (incl. standard equipment)",
        "unitPrice": 76000
      },
      "optionLines": [
        {
          "description": "Full parking cover",
          "unitPrice": 1436.5
        },
        {
          "description": "Console cover",
          "unitPrice": 450
        },
        {
          "description": "Sun awning with INOX railings",
          "unitPrice": 1434.51
        },
        {
          "description": "Service battery",
          "unitPrice": 350
        },
        {
          "description": "Raymarine Axiom 9\" Plotter, transducer & map",
          "unitPrice": 2350
        },
        {
          "description": "Floor lighting",
          "unitPrice": 800
        },
        {
          "description": "INOX anchor with swivel and 35m chain",
          "unitPrice": 800
        },
        {
          "description": "Handles on the tube (per piece)",
          "unitPrice": 180,
          "qty": 4
        },
        {
          "description": "SeaDeck foam",
          "unitPrice": 2450
        },
        {
          "description": "ELXIS A200",
          "unitPrice": 7850
        }
      ],
      "colors": [
        {
          "area": "Engine colour",
          "value": "Black",
          "code": ""
        },
        {
          "area": "Main deck",
          "value": "Jet Black",
          "code": ""
        },
        {
          "area": "Deck finish",
          "value": "SeaDeck Foam Deck",
          "code": ""
        },
        {
          "area": "Foam deck main colour",
          "value": "Capuccino",
          "code": ""
        },
        {
          "area": "Secondary colour",
          "value": "Black",
          "code": ""
        },
        {
          "area": "Hull",
          "value": "Jet Black",
          "code": ""
        },
        {
          "area": "Tubes",
          "value": "Black Carbon",
          "code": ""
        },
        {
          "area": "Fender",
          "value": "Black",
          "code": ""
        },
        {
          "area": "Main upholstery colour",
          "value": "Silvertex Macademia",
          "code": ""
        }
      ],
      "expectedFinal": 97141.01,
      "modelNeedle": "720"
    }
  ]
};


function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function emailKey(email) {
  return String(email || '').trim().toLowerCase();
}

function findModel(dist, spec) {
  const models = Array.isArray(dist.models) ? dist.models : [];
  const needle = String((spec && (spec.modelNeedle || spec.modelLabel)) || '')
    .trim()
    .toLowerCase()
    .replace(/\s+hl\b/, '')
    .trim();
  if (needle) {
    // Prefer exact-ish match first (avoid 45SRC S when looking for 45SRC).
    let hit = models.find((m) => {
      const name = String((m && m.name) || '').toLowerCase().trim();
      if (!name || m.active === false) return false;
      if (needle === '45src') return name === '45src' || (name.includes('45src') && !/\bs\b/.test(name.replace('45src', '')));
      if (needle === '30sr') return name === '30sr' || name.includes('30sr');
      if (needle === '720') return name.includes('720');
      return name.includes(needle);
    });
    if (hit) return hit;
    hit = models.find((m) => String((m && m.name) || '').toLowerCase().includes(needle) && m.active !== false);
    if (hit) return hit;
  }
  return models.find((m) => m && m.active !== false) || models[0] || null;
}

function lineMoney(qty, unit) {
  return Math.round((Number(qty) || 0) * (Number(unit) || 0) * 100) / 100;
}

function recalcQuote(q) {
  const lines = Array.isArray(q.lines) ? q.lines : [];
  let subtotal = 0;
  let total = 0;
  lines.forEach((ln) => {
    const qty = Number(ln.qty) || 0;
    const unit = Number(ln.unitPrice) || 0;
    const disc = Math.min(100, Math.max(0, Number(ln.discountPercent) || 0));
    ln.lineSubtotal = lineMoney(qty, unit);
    ln.lineTotal = Math.round(qty * unit * (1 - disc / 100) * 100) / 100;
    subtotal += ln.lineSubtotal;
    total += ln.lineTotal;
  });
  const fee = Number(q.transportPackagingFee) || 0;
  q.subtotal = Math.round(subtotal * 100) / 100;
  q.linesTotal = Math.round(total * 100) / 100;
  q.feesTotal = fee;
  q.transportFee = fee;
  q.packagingFee = 0;
  q.total = Math.round((total + fee) * 100) / 100;
  q.grandTotal = q.total;
  return q;
}

function defaultPaymentTerms(dist) {
  return (
    (dist.settings && dist.settings.defaultPaymentTerms) ||
    '40% upon order confirmation\n40% before completion / ready for delivery\n20% before delivery / shipment'
  );
}

function emptyPhotos() {
  return { hull: '', fore: '', aft: '', tubes: '', interior: '', electronics: '' };
}

function snapshotFromProspect(p) {
  if (!p) {
    return {
      name: '',
      contactName: '',
      email: '',
      phone: '',
      company: '',
      address: '',
      city: '',
      country: '',
      postalCode: '',
      taxId: ''
    };
  }
  const name = p.company || p.contactName || p.email || '';
  const addressParts = [p.address, p.postalCode, p.city, p.country].filter(Boolean);
  return {
    name,
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

function mergeRecoveryIntoDistribution(distRaw) {
  const dist = distRaw && typeof distRaw === 'object' ? Object.assign({}, distRaw) : {};
  if (!Array.isArray(dist.potentialClients)) dist.potentialClients = dist.potentialClients || [];
  else dist.potentialClients = dist.potentialClients.slice();
  if (!Array.isArray(dist.quotations)) dist.quotations = [];
  else dist.quotations = dist.quotations.slice();
  if (!dist.settings || typeof dist.settings !== 'object') dist.settings = {};
  else dist.settings = Object.assign({}, dist.settings);

  const result = {
    addedQuotes: 0,
    addedProspects: 0,
    skippedQuotes: 0,
    packId: PACK.id,
    ensuredNumbers: []
  };
  const brand = Array.isArray(dist.brands) ? dist.brands[0] : null;
  const emailToId = {};
  dist.potentialClients.forEach((p) => {
    const key = emailKey(p && p.email);
    if (key) emailToId[key] = p.id;
  });

  (PACK.prospects || []).forEach((raw) => {
    const key = emailKey(raw.key || raw.email);
    if (!key || emailToId[key]) return;
    const now = new Date().toISOString();
    const created = {
      id: uid('prospect'),
      company: raw.company || '',
      contactName: raw.contactName || '',
      email: raw.email || '',
      phone: raw.phone || '',
      mobile: '',
      address: '',
      city: raw.city || '',
      country: raw.country || '',
      postalCode: '',
      taxId: '',
      website: '',
      source: raw.source || 'other',
      status: raw.status || 'quoted',
      newsletterOptIn: true,
      interestNotes: raw.interestNotes || '',
      notes: raw.notes || '',
      convertedToClientId: null,
      convertedToClientCustomerId: null,
      convertedAt: null,
      createdAt: now,
      updatedAt: now
    };
    dist.potentialClients.unshift(created);
    emailToId[key] = created.id;
    result.addedProspects += 1;
  });

  const existingNumbers = new Set(
    dist.quotations.map((q) => String((q && q.number) || '').trim().toUpperCase())
  );

  (PACK.quotations || []).forEach((spec) => {
    const number = String(spec.number || '').trim();
    if (!number) return;
    // Only skip when the exact quotation number already exists. Do not skip on OLR
    // alone — a stray/imported row with the same OLR would block ORQ-1009/1010.
    if (existingNumbers.has(number.toUpperCase())) {
      result.skippedQuotes += 1;
      return;
    }
    const prospectId = emailToId[emailKey(spec.prospectEmail)] || '';
    const prospect = dist.potentialClients.find((p) => p.id === prospectId) || null;
    const model = findModel(dist, spec);
    const fee = Number(spec.transportPackagingFee) || 0;
    const lines = [];
    const pkg = spec.packageLine || {};
    lines.push({
      id: uid('line'),
      kind: 'model',
      refId: model ? model.id : '',
      description: pkg.description || (spec.modelLabel || ''),
      qty: 1,
      unit: 'pcs',
      unitPrice: Number(pkg.unitPrice) || 0,
      discountPercent: 0,
      categoryKey: 'hull'
    });
    (spec.optionLines || []).forEach((opt) => {
      const qty = Number(opt.qty) > 0 ? Number(opt.qty) : 1;
      lines.push({
        id: uid('line'),
        kind: 'custom',
        refId: '',
        description: opt.description || '',
        qty,
        unit: 'pcs',
        unitPrice: Number(opt.unitPrice) || 0,
        discountPercent: 0,
        categoryKey: 'options'
      });
    });
    const now = new Date().toISOString();
    const q = {
      id: uid('quote'),
      number,
      date: spec.date || now.slice(0, 10),
      status: spec.status || 'sent',
      prospectId: prospectId || '',
      clientId: '',
      clientSnapshot: snapshotFromProspect(prospect),
      brandId: brand ? brand.id : (model && model.brandId) || '',
      modelId: model ? model.id : '',
      currency: spec.currency || (model && model.currency) || 'EUR',
      olrRef: spec.olrRef || '',
      colors: Array.isArray(spec.colors)
        ? spec.colors.map((c) => ({
            id: uid('color'),
            area: c.area || '',
            value: c.value || '',
            code: c.code || ''
          }))
        : [],
      detailPhotos: emptyPhotos(),
      sisterDetailPhotos: emptyPhotos(),
      vesselPhoto: (model && model.photo) || '',
      paymentTerms: defaultPaymentTerms(dist),
      transportPackagingFee: fee,
      transportFee: fee,
      packagingFee: 0,
      lines,
      notes: [
        spec.validUntil ? 'Valid until ' + spec.validUntil + ' (from issued PDF).' : '',
        'Restored from PDF recovery pack ' + (PACK.id || '')
      ]
        .filter(Boolean)
        .join(' '),
      taxRate: 0,
      taxAmount: 0,
      convertedToProformaId: null,
      createdAt: now,
      updatedAt: now
    };
    if (!q.clientSnapshot.email && spec.prospectEmail) q.clientSnapshot.email = spec.prospectEmail;
    recalcQuote(q);
    dist.quotations.unshift(q);
    existingNumbers.add(number.toUpperCase());
    result.addedQuotes += 1;
    result.ensuredNumbers.push(number);
  });

  const minSeq = Number(PACK.minQuoteSequence) || 0;
  const curSeq = Number(dist.settings.quoteSequenceNumber) || 1000;
  if (minSeq > curSeq) dist.settings.quoteSequenceNumber = minSeq;
  dist.settings.pdfRestorePackId = PACK.id;

  // Clear stolen OLR refs on other quotation numbers (e.g. empty ORQ-1006/1007 drafts
  // that reused Q0SD65IX / SN04KS98 and previously blocked restore).
  const packOlrs = new Map();
  (PACK.quotations || []).forEach((spec) => {
    const num = String(spec.number || '').trim().toUpperCase();
    const olr = String(spec.olrRef || '').trim().toUpperCase();
    if (num && olr) packOlrs.set(olr, num);
  });
  result.clearedOlrs = [];
  dist.quotations.forEach((q) => {
    if (!q || typeof q !== 'object') return;
    const num = String(q.number || '').trim().toUpperCase();
    const olr = String(q.olrRef || '').trim().toUpperCase();
    const owner = olr ? packOlrs.get(olr) : null;
    if (owner && num && num !== owner) {
      q.olrRef = '';
      q.notes = String(q.notes || '')
        .replace(/\s*\[OLR cleared:[^\]]*\]\s*/g, ' ')
        .trim();
      q.notes = (q.notes ? q.notes + ' ' : '') + '[OLR cleared: belonged to ' + owner + ']';
      q.updatedAt = new Date().toISOString();
      result.clearedOlrs.push({ number: q.number, movedTo: owner, olr: olr });
    }
  });

  return { distribution: dist, result };
}

async function restoreMissingPdfQuotes(pool) {
  if (!pool) return { addedQuotes: 0, addedProspects: 0, skippedQuotes: 0, wrote: false };
  let existing = {};
  try {
    const row = await pool.query('SELECT data FROM distribution_data WHERE id = 1');
    existing = (row.rows[0] && row.rows[0].data && typeof row.rows[0].data === 'object')
      ? row.rows[0].data
      : {};
  } catch (e) {
    console.warn('PDF restore: could not read distribution_data:', e && e.message ? e.message : e);
    return { addedQuotes: 0, addedProspects: 0, skippedQuotes: 0, wrote: false, error: String(e && e.message || e) };
  }

  const beforeNums = (Array.isArray(existing.quotations) ? existing.quotations : [])
    .map((q) => String((q && q.number) || '').trim())
    .filter(Boolean);
  console.log('PDF restore: existing quotation numbers:', beforeNums.join(', ') || '(none)');

  const { distribution, result } = mergeRecoveryIntoDistribution(existing);
  const afterNums = (distribution.quotations || [])
    .map((q) => String((q && q.number) || '').trim())
    .filter(Boolean);
  console.log('PDF restore: quotation numbers after merge:', afterNums.join(', ') || '(none)');
  console.log('PDF restore: added', result.ensuredNumbers.join(', ') || '(none)');
  if (result.clearedOlrs && result.clearedOlrs.length) {
    console.log('PDF restore: cleared stolen OLRs on', JSON.stringify(result.clearedOlrs));
  }

  const shouldWrite =
    result.addedQuotes > 0 ||
    result.addedProspects > 0 ||
    (result.clearedOlrs && result.clearedOlrs.length > 0);
  if (!shouldWrite) {
    console.log('PDF restore: no missing quotes to add.');
    return Object.assign({ wrote: false }, result);
  }

  await pool.query(
    `INSERT INTO distribution_data (id, data, updated_at)
     VALUES (1, $1::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [JSON.stringify(distribution)]
  );
  console.log(
    'PDF restore: wrote ' +
      result.addedQuotes +
      ' quotation(s) and ' +
      result.addedProspects +
      ' potential client(s) to distribution_data.'
  );
  return Object.assign({ wrote: true }, result);
}

module.exports = {
  PACK,
  mergeRecoveryIntoDistribution,
  restoreMissingPdfQuotes
};

