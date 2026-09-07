/**
 * Recovery pack for Distribution quotations / potential clients wiped from production.
 * Rebuilt from issued OlympicRibs PDF exports (ORQ-1001, 1002, 1009–1012).
 * Applied idempotently by DistributionModule when those quote numbers are missing.
 */
(function (global) {
  'use strict';

  function color(area, value) {
    return { area: area, value: value, code: '' };
  }

  const PACK = {
    id: 'pdf-restore-2026-09-07',
    minQuoteSequence: 1013,
    prospects: [
      {
        key: 'mikekombos@gmail.com',
        company: '',
        contactName: 'Michalis Kombos',
        email: 'mikekombos@gmail.com',
        phone: '+4407878186519',
        city: 'Protaras',
        country: 'Cyprus',
        source: 'other',
        status: 'quoted',
        interestNotes: 'OlympicRibs 45SRC — ORQ-1001 / OLR 8PLIJP94',
        notes: 'Restored from issued quotation PDF ORQ-1001.'
      },
      {
        key: 'eliaskikit@gmail.com',
        company: '',
        contactName: 'Elias Elia',
        email: 'eliaskikit@gmail.com',
        phone: '+35799533018',
        city: 'Larnaca',
        country: 'Cyprus',
        source: 'other',
        status: 'quoted',
        interestNotes: 'OlympicRibs 45SRC — ORQ-1002 / OLR Z0PCQC6K',
        notes: 'Restored from issued quotation PDF ORQ-1002. Phone last digit inferred from OCR.'
      },
      {
        key: 'ermisnicolaou3@gmail.com',
        company: '',
        contactName: 'Ermis Nicolaou',
        email: 'ermisnicolaou3@gmail.com',
        phone: '+35797820428',
        city: '',
        country: 'Cyprus',
        source: 'other',
        status: 'quoted',
        interestNotes: 'OlympicRibs 720 HL — ORQ-1009 / OLR Q0SD65IX',
        notes: 'Restored from issued quotation PDF ORQ-1009.'
      },
      {
        key: 'kavallaris96@gmail.com',
        company: '',
        contactName: 'Anastasis Kavallaris',
        email: 'kavallaris96@gmail.com',
        phone: '+35799881121',
        city: '',
        country: 'Cyprus',
        source: 'other',
        status: 'quoted',
        interestNotes: 'OlympicRibs 720 HL — ORQ-1010 / OLR SN04KS98',
        notes: 'Restored from issued quotation PDF ORQ-1010.'
      },
      {
        key: 'constantinosal@hotmail.co.uk',
        company: '',
        contactName: 'Constantinos Antoniou',
        email: 'constantinosal@hotmail.co.uk',
        phone: '+35799007005',
        city: 'Nicosia',
        country: 'Cyprus',
        source: 'other',
        status: 'quoted',
        interestNotes: 'OlympicRibs 30SR — ORQ-1011 / OLR BNPRJRMZ',
        notes: 'Restored from issued quotation PDF ORQ-1011.'
      },
      {
        key: 'solonas.heritage@gmail.com',
        company: '',
        contactName: 'Solonas Charalambous',
        email: 'solonas.heritage@gmail.com',
        phone: '+35799413740',
        city: 'Limassol',
        country: 'Cyprus',
        source: 'other',
        status: 'quoted',
        interestNotes: 'OlympicRibs 720 HL — ORQ-1012 / OLR ZW8DTVCW',
        notes: 'Restored from issued quotation PDF ORQ-1012.'
      }
    ],
    quotations: [
      {
        number: 'ORQ-1001',
        olrRef: '8PLIJP94',
        date: '2026-08-07',
        validUntil: '2026-09-06',
        status: 'sent',
        prospectEmail: 'mikekombos@gmail.com',
        modelMatch: /45SRC(?!\s*S)/i,
        modelLabel: '45SRC',
        currency: 'EUR',
        transportPackagingFee: 5000,
        packageLine: {
          description:
            'OlympicRibs 45SRC + MERCURY - Dual 600 V12 DTS CF (incl. standard equipment)',
          unitPrice: 734880
        },
        optionLines: [
          { description: 'Bow awning system with carbon poles', unitPrice: 6546 },
          { description: 'Aft awning system with carbon poles — for outboards version', unitPrice: 4600 },
          { description: 'Drawer refrigerator 35 ltrs', unitPrice: 1601 },
          { description: 'Drawer freezer 35 ltrs', unitPrice: 1733 },
          { description: 'Air Condition 10,000 BTU with 3000W Inverter/Charger', unitPrice: 9893 },
          { description: 'Water heater 20 ltrs', unitPrice: 2055 },
          { description: 'Electric fully flush aft tables (2 pcs)', unitPrice: 9088 },
          { description: 'Electric fully flush bow table', unitPrice: 4973 },
          { description: 'Additional Inverter/Battery charger 3000W/16A', unitPrice: 2880 },
          { description: 'Scanstrut wireless charger on console (per piece)', unitPrice: 456 },
          { description: '15Amp solar panels', unitPrice: 1360 },
          { description: 'Main plotter upgrade to Raymarine AXIOM PRO 16"', unitPrice: 3570 },
          {
            description:
              'Second plotter at the console, Raymarine AXIOM PRO 12" (outboard versions only)',
            unitPrice: 5897
          },
          { description: 'Radar Raymarine HD Color Radome Radar 4kW with base', unitPrice: 4769 },
          { description: 'FLIR night vision camera', unitPrice: 6863 },
          { description: 'Remotely operated search light', unitPrice: 632 },
          { description: 'Deck lights package upgrade (3 zones) single colour', unitPrice: 3588 },
          { description: 'Under water lights — single colour', unitPrice: 2700 },
          {
            description:
              'Premium RGB package with underwater lights and Sound to light module (SHADOW CASTER)',
            unitPrice: 13993
          },
          {
            description:
              'Ultra Soundsystem package JL Audio M6 — with LED RGB (16x speakers, 2x subwoofers, 4x amplifiers)',
            unitPrice: 8161
          },
          {
            description: '3KWA single cylinder generator — available only for outboards version',
            unitPrice: 13959
          },
          { description: 'Inox style removable modular shower head', unitPrice: 8280 },
          { description: 'Quick release system for fenders (10 pcs)', unitPrice: 2592 }
        ],
        colors: [
          color('Engine colour', 'Cold Fusion'),
          color('Main deck', 'Pure White'),
          color('Foam deck main colour', 'Teak'),
          color('Secondary colour', 'Black'),
          color('Upholstery', 'White'),
          color('Hull', 'Traffic White'),
          color('Tubes', 'Ice White Carbon'),
          color('Bimini top', 'Traffic White'),
          color('Fender', 'Military Grey'),
          color('Main upholstery colour', 'Maglia Artic')
        ],
        expectedFinal: 860069
      },
      {
        number: 'ORQ-1002',
        olrRef: 'Z0PCQC6K',
        date: '2026-08-07',
        validUntil: '2026-09-06',
        status: 'sent',
        prospectEmail: 'eliaskikit@gmail.com',
        modelMatch: /45SRC(?!\s*S)/i,
        modelLabel: '45SRC',
        currency: 'EUR',
        transportPackagingFee: 5000,
        packageLine: {
          description:
            'OlympicRibs 45SRC + MERCURY - Dual 600 V12 DTS CF (incl. standard equipment)',
          unitPrice: 734880
        },
        optionLines: [
          { description: 'Bow awning system with carbon poles', unitPrice: 6546 },
          { description: 'Aft awning system with carbon poles — for outboards version', unitPrice: 4600 },
          { description: 'Air Condition 10,000 BTU with 3000W Inverter/Charger', unitPrice: 9893 },
          { description: 'Dual electric hob', unitPrice: 1448 },
          { description: 'Sink with folding tap', unitPrice: 1241 },
          { description: 'Drawer refrigerator 90 ltrs', unitPrice: 1320 },
          { description: 'Electric fully flush bow table', unitPrice: 4973 },
          { description: 'Additional Inverter/Battery charger 3000W/16A', unitPrice: 2880 },
          { description: 'Scanstrut wireless charger on console (per piece)', unitPrice: 456 },
          { description: '15Amp solar panels', unitPrice: 1360 },
          {
            description:
              'Second plotter at the console, Raymarine AXIOM PRO 12" (outboard versions only)',
            unitPrice: 5897
          },
          { description: 'Radar Raymarine HD Color Radome Radar 4kW with base', unitPrice: 4769 },
          { description: 'FLIR night vision camera', unitPrice: 6863 },
          { description: 'Remotely operated search light', unitPrice: 632 },
          { description: 'Deck lights package upgrade (3 zones) single colour', unitPrice: 3588 },
          { description: 'Under water lights — single colour', unitPrice: 2700 },
          {
            description:
              'Premium RGB package with underwater lights and Sound to light module (SHADOW CASTER)',
            unitPrice: 13993
          },
          {
            description: '3KWA single cylinder generator — available only for outboards version',
            unitPrice: 13959
          },
          { description: 'Inox style removable modular shower head', unitPrice: 8280 },
          { description: 'Quick release system for fenders (10 pcs)', unitPrice: 2592 },
          { description: 'Synthetic TEAK Esthec — Outboards version', unitPrice: 18596 }
        ],
        colors: [],
        expectedFinal: 856466
      },
      {
        number: 'ORQ-1009',
        olrRef: 'Q0SD65IX',
        date: '2026-08-11',
        validUntil: '2026-09-10',
        status: 'sent',
        prospectEmail: 'ermisnicolaou3@gmail.com',
        modelMatch: /720/i,
        modelLabel: '720 HL',
        currency: 'EUR',
        transportPackagingFee: 2500,
        packageLine: {
          description:
            'OlympicRibs 720 HL + YAMAHA - F300XSB2 — Pearl White (incl. standard equipment)',
          unitPrice: 78579.41
        },
        optionLines: [{ description: 'Dromeas 670 Trailer with approval', unitPrice: 6800 }],
        colors: [
          color('Engine colour', 'Cold Fusion'),
          color('Engine colour', 'Pearl White'),
          color('Main deck', 'Pure White'),
          color('Foam deck main colour', 'Teak'),
          color('Foam deck main colour', 'Terra'),
          color('Secondary colour', 'White'),
          color('Hull', 'Pure White'),
          color('Tubes', 'Ice White Carbon'),
          color('Fender', 'Black'),
          color('Main upholstery colour', 'Silvertex Aluminium')
        ],
        expectedFinal: 87879.41
      },
      {
        number: 'ORQ-1010',
        olrRef: 'SN04KS98',
        date: '2026-08-11',
        validUntil: '2026-09-10',
        status: 'sent',
        prospectEmail: 'kavallaris96@gmail.com',
        modelMatch: /720/i,
        modelLabel: '720 HL',
        currency: 'EUR',
        transportPackagingFee: 2500,
        packageLine: {
          description:
            'OlympicRibs 720 HL + YAMAHA - F250NSB — Light Grey Metallic (incl. standard equipment)',
          unitPrice: 74865.68
        },
        optionLines: [
          { description: 'Full parking cover', unitPrice: 1436.5 },
          { description: 'Console cover', unitPrice: 450 },
          { description: 'Sun awning with INOX railings', unitPrice: 1434.51 },
          { description: 'Aft locker screen', unitPrice: 600 },
          { description: 'Service battery', unitPrice: 350 },
          { description: 'Sound Hertz, 4 speakers & amplifier', unitPrice: 1969.55 },
          { description: 'INOX anchor with swivel and 35m chain', unitPrice: 800 },
          { description: 'Painted INOX with electrostatic paint', unitPrice: 700 },
          { description: 'SeaDeck foam', unitPrice: 2450 },
          { description: 'ELXIS A200', unitPrice: 7850 }
        ],
        colors: [
          color('Engine colour', 'Light Grey Metallic'),
          color('Main deck', 'Tele Grey'),
          color('Deck finish', 'SeaDeck Foam Deck'),
          color('Foam deck main colour', 'Capuccino'),
          color('Secondary colour', 'Black'),
          color('Hull', 'Jet Black'),
          color('Tubes', 'Military Grey Carbon'),
          color('Fender', 'Black'),
          color('Main upholstery colour', 'Silvertex Aluminium')
        ],
        expectedFinal: 95406.24
      },
      {
        number: 'ORQ-1011',
        olrRef: 'BNPRJRMZ',
        date: '2026-08-18',
        validUntil: '2026-09-17',
        status: 'sent',
        prospectEmail: 'constantinosal@hotmail.co.uk',
        modelMatch: /^30SR$/i,
        modelLabel: '30SR',
        currency: 'EUR',
        transportPackagingFee: 5000,
        packageLine: {
          description:
            'OlympicRibs 30SR + MERCURY - Twin 200 V6 CMS DTS (El.Hy. Steering) (incl. standard equipment)',
          unitPrice: 222065
        },
        optionLines: [
          { description: 'Full parking cover for winterising', unitPrice: 2800 },
          { description: 'Underwater lights', unitPrice: 1342 },
          { description: 'Reverse sofa layout option', unitPrice: 3000 }
        ],
        colors: [
          color('Engine colour', 'Black'),
          color('Main deck', 'Jet Black'),
          color('Deck finish', 'SeaDeck Foam Deck'),
          color('Foam deck main colour', 'Moonrock'),
          color('Secondary colour', 'White'),
          color('Hull', 'Jet Black'),
          color('Tubes', 'Black Carbon'),
          color('Bimini top', 'Jet Black'),
          color('Fender', 'Black'),
          color('Main upholstery colour', 'Silvertex Cobre')
        ],
        expectedFinal: 234207
      },
      {
        number: 'ORQ-1012',
        olrRef: 'ZW8DTVCW',
        date: '2026-08-20',
        validUntil: '2026-09-19',
        status: 'sent',
        prospectEmail: 'solonas.heritage@gmail.com',
        modelMatch: /720/i,
        modelLabel: '720 HL',
        currency: 'EUR',
        transportPackagingFee: 2500,
        packageLine: {
          description:
            'OlympicRibs 720 HL + MERCURY - 300 AMS DTS EHPS (incl. standard equipment)',
          unitPrice: 76000
        },
        optionLines: [
          { description: 'Full parking cover', unitPrice: 1436.5 },
          { description: 'Console cover', unitPrice: 450 },
          { description: 'Sun awning with INOX railings', unitPrice: 1434.51 },
          { description: 'Service battery', unitPrice: 350 },
          { description: 'Raymarine Axiom 9" Plotter, transducer & map', unitPrice: 2350 },
          { description: 'Floor lighting', unitPrice: 800 },
          { description: 'INOX anchor with swivel and 35m chain', unitPrice: 800 },
          { description: 'Handles on the tube (per piece)', unitPrice: 180, qty: 4 },
          { description: 'SeaDeck foam', unitPrice: 2450 },
          { description: 'ELXIS A200', unitPrice: 7850 }
        ],
        colors: [
          color('Engine colour', 'Black'),
          color('Main deck', 'Jet Black'),
          color('Deck finish', 'SeaDeck Foam Deck'),
          color('Foam deck main colour', 'Capuccino'),
          color('Secondary colour', 'Black'),
          color('Hull', 'Jet Black'),
          color('Tubes', 'Black Carbon'),
          color('Fender', 'Black'),
          color('Main upholstery colour', 'Silvertex Macademia')
        ],
        expectedFinal: 97141.01
      }
    ]
  };

  global.DistributionRecoveryPack = PACK;
})(typeof window !== 'undefined' ? window : globalThis);
