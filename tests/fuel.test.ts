// Unit tests for the fuel margin engine. Run with `pnpm test:unit`
// (Node's built-in runner, no framework). Expected values are worked out by
// hand in the comments so a failure points at the formula, not the fixture.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  addDays,
  computeLedger,
  costPumpPrice,
  isIsoDate,
  marginRateTenths,
  parseDecimal,
  priceExclVat,
  rdiv,
  summarize,
} from '../convex/lib/fuel.ts'
import type { FuelEntry } from '../convex/lib/fuel.ts'

describe('rounding', () => {
  test('rdiv rounds half away from zero', () => {
    assert.equal(rdiv(5, 2), 3)
    assert.equal(rdiv(-5, 2), -3)
    assert.equal(rdiv(4, 3), 1)
    assert.equal(rdiv(7, 4), 2)
    assert.equal(rdiv(-7, 4), -2)
    assert.equal(rdiv(0, 7), 0)
  })

  test('pump price incl. VAT → excl. VAT', () => {
    assert.equal(priceExclVat(1869), 15575) // 1.869 / 1.2 = 1.5575 exactly
    assert.equal(priceExclVat(1789), 14908) // 1.49083… → 1.4908
    assert.equal(priceExclVat(1679), 13992) // 1.39916… → 1.3992
  })

  test('cost price is rounded up and never below the PMP', () => {
    assert.equal(costPumpPrice(14084), 1691) // 1.4084 × 1.2 = 1.69008 → 1.691
    assert.equal(costPumpPrice(15000), 1800) // exact, no rounding
    // Compared exactly (price / 1.2 vs PMP, both scaled to integers), not
    // through the rounded HT price: 0.125 TTC shows as 0.1042 HT but is
    // really 0.104166…, below a 0.1042 PMP.
    for (let pmp = 1000; pmp <= 50000; pmp += 7) {
      const price = costPumpPrice(pmp)
      assert.ok(price * 1000 >= pmp * 120, `pmp ${pmp}`)
      assert.ok((price - 1) * 1000 < pmp * 120, `pmp ${pmp} is not the lowest`)
    }
  })

  test('margin rate on cost', () => {
    assert.equal(marginRateTenths(700, 14000), 50) // 0.07 / 1.40 = 5.0 %
    assert.equal(marginRateTenths(-3, 14078), 0)
    assert.equal(marginRateTenths(10, 0), null)
  })
})

describe('parsing', () => {
  test('accepts French and English decimals', () => {
    assert.deepEqual(parseDecimal('1,4210', 4), { kind: 'ok', value: 14210 })
    assert.deepEqual(parseDecimal('1.421', 4), { kind: 'ok', value: 14210 })
    assert.deepEqual(parseDecimal('1 234', 0), { kind: 'ok', value: 1234 })
    assert.deepEqual(parseDecimal('12 000', 0), { kind: 'ok', value: 12000 })
    assert.deepEqual(parseDecimal('0,5', 3), { kind: 'ok', value: 500 })
  })

  test('rejects anything ambiguous', () => {
    assert.deepEqual(parseDecimal('', 3), { kind: 'empty' })
    assert.deepEqual(parseDecimal('1.23456', 4), { kind: 'too_many_decimals' })
    assert.deepEqual(parseDecimal('12,5', 0), { kind: 'too_many_decimals' })
    assert.deepEqual(parseDecimal('-1', 0), { kind: 'invalid' })
    assert.deepEqual(parseDecimal('1,2,3', 3), { kind: 'invalid' })
    assert.deepEqual(parseDecimal('abc', 3), { kind: 'invalid' })
  })
})

describe('dates', () => {
  test('addDays crosses months, years and DST', () => {
    assert.equal(addDays('2026-09-30', 1), '2026-10-01')
    assert.equal(addDays('2026-12-31', 1), '2027-01-01')
    assert.equal(addDays('2026-03-29', 1), '2026-03-30')
    assert.equal(addDays('2026-03-01', -1), '2026-02-28')
  })

  test('isIsoDate rejects impossible dates', () => {
    assert.ok(isIsoDate('2028-02-29'))
    assert.ok(!isIsoDate('2026-02-29'))
    assert.ok(!isIsoDate('2026-9-1'))
  })
})

describe('ledger', () => {
  // Day 1: 10 000 L at 1.4000 in the tank, 20 000 L delivered at 1.4300,
  // pump price 1.749, 5 000 L sold.
  const base: Array<FuelEntry> = [
    {
      date: '2026-09-01',
      fixStock: 10_000,
      fixPmp: 14_000,
      deliveries: [{ liters: 20_000, price: 14_300 }],
      price: 1_749,
      sold: 5_000,
    },
    { date: '2026-09-02', deliveries: [], sold: 6_000 },
  ]

  test('weighted average cost and margin of a day', () => {
    const [d1] = computeLedger(base, '2026-09-01')
    // PMP = (10 000 × 1.4000 + 20 000 × 1.4300) / 30 000 = 1.4200
    assert.equal(d1.pmp, 14_200)
    assert.equal(d1.available, 30_000)
    assert.equal(d1.priceHt, 14_575) // 1.749 / 1.2
    assert.equal(d1.margin, 375) // 1.4575 − 1.4200
    assert.equal(d1.marginCents, 18_750) // 0.0375 × 5 000 = 187.50 €
    assert.equal(d1.costCents, 710_000) // 1.42 × 5 000 = 7 100 €
    assert.equal(d1.closeStock, 25_000)
  })

  test('stock, PMP and price carry over to the next day', () => {
    const [, d2] = computeLedger(base, '2026-09-02')
    assert.equal(d2.openStock, 25_000)
    assert.equal(d2.pmp, 14_200)
    assert.equal(d2.price, 1_749)
    assert.ok(d2.priceCarried)
    assert.equal(d2.closeStock, 19_000)
  })

  test('a day with no entry is a row, and its missing volume blocks the stock', () => {
    const rows = computeLedger(
      [
        ...base,
        { date: '2026-09-04', deliveries: [{ liters: 5_000, price: 15_000 }] },
      ],
      '2026-09-05',
    )
    assert.deepEqual(
      rows.map((r) => r.date),
      ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'],
    )
    const [, , d3, d4] = rows
    assert.equal(d3.openStock, 19_000)
    assert.equal(d3.sold, null)
    assert.equal(d4.openStock, null) // 3rd has no volume sold
    assert.equal(d4.pmp, null) // cannot weight a delivery against an unknown stock
    assert.equal(d4.margin, null)
  })

  test('without a delivery, the PMP survives an unknown stock', () => {
    const rows = computeLedger(base.slice(0, 1), '2026-09-03')
    assert.equal(rows[2].openStock, null)
    assert.equal(rows[2].pmp, 14_200)
    assert.equal(rows[2].margin, 375)
  })

  test('a stock correction restarts the chain', () => {
    const rows = computeLedger(
      [
        ...base,
        {
          date: '2026-09-04',
          fixStock: 18_500,
          fixPmp: 14_200,
          deliveries: [],
        },
      ],
      '2026-09-04',
    )
    const d4 = rows[3]
    assert.ok(d4.fixed)
    assert.equal(d4.openStock, 18_500)
    assert.equal(d4.pmp, 14_200)
  })

  test('correcting a past delivery propagates to later days', () => {
    const edited = [
      { ...base[0], deliveries: [{ liters: 20_000, price: 14_600 }] },
      base[1],
    ]
    const [d1, d2] = computeLedger(edited, '2026-09-02')
    // (10 000 × 1.4000 + 20 000 × 1.4600) / 30 000 = 1.4400
    assert.equal(d1.pmp, 14_400)
    assert.equal(d2.pmp, 14_400)
    assert.equal(d2.margin, 14_575 - 14_400)
  })

  test('negative stock is flagged and never weighted', () => {
    const rows = computeLedger(
      [
        {
          date: '2026-09-01',
          fixStock: 1_000,
          fixPmp: 14_000,
          deliveries: [],
          sold: 1_500,
        },
        { date: '2026-09-02', deliveries: [{ liters: 10_000, price: 15_000 }] },
      ],
      '2026-09-02',
    )
    assert.equal(rows[1].openStock, -500)
    assert.ok(rows[1].negativeStock)
    assert.equal(rows[1].pmp, null)
  })

  test('entries before the starting stock are ignored', () => {
    const rows = computeLedger(
      [{ date: '2026-08-31', deliveries: [], sold: 99 }, ...base],
      '2026-09-01',
    )
    assert.equal(rows[0].date, '2026-09-01')
  })

  test('no starting stock, no ledger', () => {
    assert.deepEqual(
      computeLedger(
        [{ date: '2026-09-01', deliveries: [], sold: 10 }],
        '2026-09-02',
      ),
      [],
    )
  })

  describe('morning stock read on the gauge', () => {
    // Day 1: 10 000 L at 1.4000, 20 000 L delivered at 1.4300 (PMP 1.4200),
    // pump 1.749. Day 2 morning: 25 000 L in the tank → 5 000 L sold on day 1.
    const gauge: Array<FuelEntry> = [
      {
        date: '2026-09-01',
        fixStock: 10_000,
        fixPmp: 14_000,
        deliveries: [{ liters: 20_000, price: 14_300 }],
        price: 1_749,
      },
      { date: '2026-09-02', fixStock: 25_000, deliveries: [] },
    ]

    test("the volume sold is derived from the next morning's stock", () => {
      const [d1, d2] = computeLedger(gauge, '2026-09-02')
      assert.equal(d1.sold, 5_000) // 10 000 + 20 000 − 25 000
      assert.equal(d1.marginCents, 18_750) // 0.0375 × 5 000
      assert.equal(d1.closeStock, 25_000)
      assert.ok(!d1.negativeSold)
      assert.ok(d2.fixed)
      assert.equal(d2.openStock, 25_000)
      assert.equal(d2.sold, null) // day 3 not read yet
    })

    test('a stock typed without a PMP carries the PMP over', () => {
      const [, d2] = computeLedger(gauge, '2026-09-02')
      assert.equal(d2.openPmp, 14_200)
      assert.equal(d2.pmp, 14_200)
      assert.equal(d2.margin, 375)
    })

    test('a typed volume sold (legacy) wins over the derived one', () => {
      const legacy = [{ ...gauge[0], sold: 4_000 }, gauge[1]]
      const [d1] = computeLedger(legacy, '2026-09-02')
      assert.equal(d1.sold, 4_000)
    })

    test('a missed morning costs one day, not the rest of the chain', () => {
      const rows = computeLedger(
        [
          ...gauge,
          // 3rd: nobody read the gauge. 4th: 20 000 L.
          { date: '2026-09-04', fixStock: 20_000, deliveries: [] },
          { date: '2026-09-05', fixStock: 18_000, deliveries: [] },
        ],
        '2026-09-05',
      )
      const [, d2, d3, d4] = rows
      assert.equal(d2.sold, null) // no reading on the 3rd
      assert.equal(d3.openStock, null)
      assert.equal(d3.sold, null)
      assert.equal(d4.openStock, 20_000)
      assert.equal(d4.pmp, 14_200) // no delivery in the gap: PMP survives
      assert.equal(d4.sold, 2_000)
      assert.equal(d4.marginCents, 7_500) // 0.0375 × 2 000
    })

    test('a negative volume sold is flagged and kept out of the totals', () => {
      const rows = computeLedger(
        [gauge[0], { date: '2026-09-02', fixStock: 31_000, deliveries: [] }],
        '2026-09-02',
      )
      assert.equal(rows[0].sold, -1_000)
      assert.ok(rows[0].negativeSold)
      assert.equal(rows[0].marginCents, null)
      assert.equal(summarize(rows).sold, 0)
    })

    test('a stock without a PMP cannot start the ledger', () => {
      assert.deepEqual(
        computeLedger(
          [{ date: '2026-09-01', fixStock: 1_000, deliveries: [] }],
          '2026-09-01',
        ),
        [],
      )
    })
  })

  test('monthly totals are weighted by volume, not averaged', () => {
    const rows = computeLedger(
      [
        {
          date: '2026-09-01',
          fixStock: 100_000,
          fixPmp: 10_000,
          deliveries: [],
          price: 1_260,
          sold: 1_000,
        },
        { date: '2026-09-02', deliveries: [], price: 1_320, sold: 9_000 },
      ],
      '2026-09-02',
    )
    // Day 1: HT 1.0500, margin 0.0500 × 1 000 = 50 €
    // Day 2: HT 1.1000, margin 0.1000 × 9 000 = 900 €
    const t = summarize(rows)
    assert.equal(t.sold, 10_000)
    assert.equal(t.marginCents, 95_000)
    assert.equal(t.marginPerLiter, 950) // 950 € / 10 000 L, not (0.05 + 0.10) / 2
    assert.equal(t.marginRateTenths, 95) // 950 € / 10 000 € of cost = 9.5 %
  })
})
