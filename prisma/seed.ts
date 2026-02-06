import 'dotenv/config';
import {
  PrismaClient,
  UserRole,
  BarType,
  BarStatus,
  DrinkType,
  OwnershipMode,
  EventStatus,
  PosnetStatus,
  POSSaleStatus,
  POSPaymentStatus,
  PaymentMethod,
  MovementType,
  StockMovementReason,
  VenueType,
} from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ===================== HELPERS =====================

function hoursAgo(hours: number, base: Date = new Date()): Date {
  return new Date(base.getTime() - hours * 3600000);
}
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86400000);
}
function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ===================== MAIN =====================

async function main() {
  console.log('🌱 Seeding database...\n');

  // ============= CLEAN =============
  console.log('🧹 Cleaning database...');
  await prisma.$executeRaw`TRUNCATE TABLE pos_payment, pos_sale_item, pos_sale, pos_session, metric_sample, event_report, stock_alert, stock_transfer, inventory_movement, consignment_return, stock_return, return_policy, manager_inventory_allocation, manager_inventory, global_inventory, "Stock", sale, bar_recipe_override, event_product_cocktail, event_product, event_recipe_component, event_recipe_bar_type, event_recipe, event_price, cocktail_category, category, posnet, "Bar", "Cocktail", "Event", "Venue", supplier, "Drink", "User" CASCADE`;
  console.log('   Done.');

  const hashedPassword = await bcrypt.hash('password123', 10);

  // ============= USERS =============
  console.log('👤 Creating users...');
  const owner = await prisma.user.create({
    data: { email: 'owner@dashbar.com', password: hashedPassword, role: UserRole.manager },
  });
  const cashier = await prisma.user.create({
    data: { email: 'cashier@dashbar.com', password: hashedPassword, role: UserRole.cashier },
  });
  const admin = await prisma.user.create({
    data: { email: 'admin@dashbar.com', password: hashedPassword, role: UserRole.admin },
  });

  // ============= SUPPLIERS =============
  console.log('🚚 Creating suppliers...');
  const supplierDiageo = await prisma.supplier.create({
    data: { name: 'Diageo', description: 'Bebidas espirituosas premium', email: 'ventas@diageo.com', ownerId: owner.id },
  });
  const supplierCoca = await prisma.supplier.create({
    data: { name: 'Coca-Cola FEMSA', description: 'Gaseosas y aguas', email: 'ventas@cocacola.com', ownerId: owner.id },
  });

  // ============= DRINKS =============
  console.log('🍹 Creating drinks...');
  const drinkData = [
    { name: 'Vodka Absolut',    brand: 'Absolut',     sku: 'ABS-VOD-750',  drinkType: DrinkType.alcoholic,     volume: 750 },
    { name: 'Gin Tanqueray',    brand: 'Tanqueray',    sku: 'TNQ-GIN-750',  drinkType: DrinkType.alcoholic,     volume: 750 },
    { name: 'Ron Havana Club',  brand: 'Havana Club',  sku: 'HC-RUM-750',   drinkType: DrinkType.alcoholic,     volume: 750 },
    { name: 'Fernet Branca',    brand: 'Branca',       sku: 'BRC-FRN-750',  drinkType: DrinkType.alcoholic,     volume: 750 },
    { name: 'Aperol',           brand: 'Aperol',       sku: 'APR-APR-750',  drinkType: DrinkType.alcoholic,     volume: 750 },
    { name: 'Prosecco Zonin',   brand: 'Zonin',        sku: 'ZON-PRO-750',  drinkType: DrinkType.alcoholic,     volume: 750 },
    { name: 'Coca-Cola',        brand: 'Coca-Cola',    sku: 'CC-COL-2250',  drinkType: DrinkType.non_alcoholic, volume: 2250 },
    { name: 'Tonica Schweppes', brand: 'Schweppes',    sku: 'SWP-TON-1500', drinkType: DrinkType.non_alcoholic, volume: 1500 },
    { name: 'Jugo de Limon',    brand: 'Minerva',      sku: 'MNV-LMN-1000', drinkType: DrinkType.non_alcoholic, volume: 1000 },
    { name: 'Soda',             brand: 'Ivess',        sku: 'IVS-SOD-1500', drinkType: DrinkType.non_alcoholic, volume: 1500 },
  ];
  const createdDrinks = await Promise.all(drinkData.map(d => prisma.drink.create({ data: d })));
  const drinkMap: Record<string, typeof createdDrinks[0]> = {};
  createdDrinks.forEach(d => { drinkMap[d.sku] = d; });
  const d = {
    vodka: drinkMap['ABS-VOD-750'], gin: drinkMap['TNQ-GIN-750'], rum: drinkMap['HC-RUM-750'],
    fernet: drinkMap['BRC-FRN-750'], aperol: drinkMap['APR-APR-750'], prosecco: drinkMap['ZON-PRO-750'],
    coca: drinkMap['CC-COL-2250'], tonica: drinkMap['SWP-TON-1500'], limon: drinkMap['MNV-LMN-1000'],
    soda: drinkMap['IVS-SOD-1500'],
  };

  // Cost per ml in cents
  const drinkCosts: Record<number, number> = {
    [d.vodka.id]: 20, [d.gin.id]: 27, [d.rum.id]: 18, [d.fernet.id]: 16,
    [d.aperol.id]: 24, [d.prosecco.id]: 20, [d.coca.id]: 2, [d.tonica.id]: 4,
    [d.limon.id]: 3, [d.soda.id]: 2,
  };

  // ============= VENUE =============
  console.log('🏟️  Creating venue...');
  const venue = await prisma.venue.create({
    data: { name: 'Estadio Luna Park', address: 'Av. Madero 420', city: 'Buenos Aires', state: 'CABA', country: 'Argentina', capacity: 5000, venueType: VenueType.indoor, ownerId: owner.id },
  });

  // ============= EVENTS =============
  console.log('📅 Creating events...');
  const ev1Start = hoursAgo(6, daysAgo(14));
  const ev1End = daysAgo(14);
  const ev2Start = hoursAgo(5, daysAgo(7));
  const ev2End = daysAgo(7);
  const ev3Start = hoursAgo(1);

  const event1 = await prisma.event.create({ data: { name: 'Noche Electrónica', description: 'Festival de música electrónica', status: EventStatus.finished, startedAt: ev1Start, finishedAt: ev1End, ownerId: owner.id, venueId: venue.id } });
  const event2 = await prisma.event.create({ data: { name: 'Rock en el Parque', description: 'Recital de bandas de rock', status: EventStatus.finished, startedAt: ev2Start, finishedAt: ev2End, ownerId: owner.id, venueId: venue.id } });
  const event3 = await prisma.event.create({ data: { name: 'Fiesta Tropical', description: 'Evento para testear WebSocket', status: EventStatus.active, startedAt: ev3Start, ownerId: owner.id, venueId: venue.id } });

  // Recipe definitions: cocktailName -> { glassVolume, price, components: [{drinkKey, pct}] }
  const recipeDefs = [
    { name: 'Gin Tonic',      vol: 350, price: 350000, comps: [{ dk: 'gin', pct: 30 }, { dk: 'tonica', pct: 70 }] },
    { name: 'Fernet con Coca', vol: 400, price: 300000, comps: [{ dk: 'fernet', pct: 30 }, { dk: 'coca', pct: 70 }] },
    { name: 'Vodka Lemon',    vol: 300, price: 320000, comps: [{ dk: 'vodka', pct: 40 }, { dk: 'limon', pct: 60 }] },
    { name: 'Aperol Spritz',  vol: 350, price: 400000, comps: [{ dk: 'aperol', pct: 30 }, { dk: 'prosecco', pct: 50 }, { dk: 'soda', pct: 20 }] },
    { name: 'Mojito',         vol: 350, price: 380000, comps: [{ dk: 'rum', pct: 30 }, { dk: 'limon', pct: 20 }, { dk: 'soda', pct: 50 }] },
  ];

  // Product popularity weights for weighted random selection
  const productWeights = [35, 30, 15, 10, 10]; // Fernet, GinTonic order differs per event

  // ===================== SEED PER EVENT =====================
  const eventConfigs = [
    { event: event1, start: ev1Start, end: ev1End, hours: 6, salesTarget: 80 },
    { event: event2, start: ev2Start, end: ev2End, hours: 5, salesTarget: 60 },
    { event: event3, start: ev3Start, end: undefined as Date | undefined, hours: 1, salesTarget: 8 },
  ];

  for (const cfg of eventConfigs) {
    const { event, start, end, hours, salesTarget } = cfg;
    const isActive = event.status === 'active';
    console.log(`\n🔧 Seeding: ${event.name}...`);

    // --- Bars ---
    const barGen = await prisma.bar.create({ data: { name: 'Barra General', type: BarType.general, status: isActive ? BarStatus.open : BarStatus.closed, eventId: event.id } });
    const barVIP = await prisma.bar.create({ data: { name: 'Barra VIP', type: BarType.VIP, status: isActive ? BarStatus.open : BarStatus.closed, eventId: event.id } });
    const bars = [barGen, barVIP];

    // --- Cocktails (event-scoped) ---
    const cocktails = await Promise.all(
      recipeDefs.map(r => prisma.cocktail.create({ data: { eventId: event.id, name: r.name, price: r.price, volume: r.vol, isActive: true } }))
    );

    // --- Recipes ---
    console.log('   📋 Recipes...');
    for (let i = 0; i < recipeDefs.length; i++) {
      const r = recipeDefs[i];
      const barTypes = r.name === 'Aperol Spritz' 
        ? [{ barType: BarType.VIP }]
        : [{ barType: BarType.general }, { barType: BarType.VIP }];
      await prisma.eventRecipe.create({
        data: {
          eventId: event.id, cocktailName: r.name, glassVolume: r.vol, hasIce: true, salePrice: r.price,
          barTypes: { create: barTypes },
          components: { create: r.comps.map(c => ({ drinkId: (d as any)[c.dk].id, percentage: c.pct })) },
        },
      });
    }

    // --- Products ---
    const products = await Promise.all(
      recipeDefs.map((r, i) =>
        prisma.eventProduct.create({
          data: { eventId: event.id, name: r.name, price: r.price, cocktails: { create: { cocktailId: cocktails[i].id } } },
        })
      )
    );

    // --- Posnets ---
    const pos1 = await prisma.posnet.create({ data: { code: `POS-${event.id}01`, name: 'POS General 1', status: isActive ? PosnetStatus.OPEN : PosnetStatus.CLOSED, eventId: event.id, barId: barGen.id } });
    const pos2 = await prisma.posnet.create({ data: { code: `POS-${event.id}02`, name: 'POS VIP', status: isActive ? PosnetStatus.OPEN : PosnetStatus.CLOSED, eventId: event.id, barId: barVIP.id } });
    const posnets = [pos1, pos2];

    // --- Stock (bulk assign to bars) ---
    console.log('   📦 Stock...');
    const allDrinks = Object.values(d);
    const stockData: any[] = [];
    const movInputData: any[] = [];
    for (const bar of bars) {
      for (const drink of allDrinks) {
        const sup = drink.drinkType === 'alcoholic' ? supplierDiageo : supplierCoca;
        const qty = bar.type === 'VIP' ? rand(8000, 12000) : rand(15000, 25000);
        stockData.push({ barId: bar.id, drinkId: drink.id, supplierId: sup.id, quantity: qty, unitCost: drinkCosts[drink.id], ownershipMode: OwnershipMode.purchased, sellAsWholeUnit: false });
        movInputData.push({ barId: bar.id, drinkId: drink.id, supplierId: sup.id, quantity: qty, type: MovementType.input, reason: StockMovementReason.ASSIGN_TO_BAR, toLocationType: 'BAR' as any, toLocationId: bar.id, performedById: owner.id });
      }
    }
    await prisma.stock.createMany({ data: stockData });
    await prisma.inventoryMovement.createMany({ data: movInputData });

    // --- Sessions ---
    const sess1 = await prisma.pOSSession.create({ data: { posnetId: pos1.id, openedByUserId: cashier.id, openedAt: start, closedAt: end || undefined, openingFloat: 50000 } });
    const sess2 = await prisma.pOSSession.create({ data: { posnetId: pos2.id, openedByUserId: cashier.id, openedAt: start, closedAt: end || undefined, openingFloat: 100000 } });

    // --- Generate sales data in memory, then bulk insert ---
    console.log(`   💰 Generating ${salesTarget} POS sales...`);
    const paymentMethods: PaymentMethod[] = ['cash', 'credit', 'debit'];

    // Pre-build all sales data
    interface SaleRow { posnetId: number; sessionId: number; eventId: number; barId: number; cashierUserId: number; status: POSSaleStatus; subtotal: number; tax: number; total: number; createdAt: Date; }
    interface SaleItemRow { saleId: number; productId: number; cocktailId: number; productNameSnapshot: string; unitPriceSnapshot: number; quantity: number; lineTotal: number; }
    interface PaymentRow { saleId: number; method: PaymentMethod; amount: number; status: POSPaymentStatus; createdAt: Date; }
    interface MovRow { barId: number; drinkId: number; supplierId: number; quantity: number; type: MovementType; reason: StockMovementReason; referenceId: number; fromLocationType: any; fromLocationId: number; createdAt: Date; }

    const saleRows: Omit<SaleRow, 'id'>[] = [];
    const itemsPerSale: Array<{ productIdx: number; qty: number }[]> = [];

    for (let i = 0; i < salesTarget; i++) {
      const progress = i / salesTarget;
      const hourOffset = progress * hours;
      const minuteJitter = rand(-10, 10);
      const saleTime = new Date(start.getTime() + (hourOffset * 60 + minuteJitter) * 60000);
      if (end && saleTime > end) continue;
      if (saleTime > new Date()) continue;

      const isVIP = Math.random() < 0.3;
      const bar = isVIP ? barVIP : barGen;
      const posnet = isVIP ? pos2 : pos1;
      const session = isVIP ? sess2 : sess1;

      // Pick 1-2 products
      const itemCount = Math.random() < 0.7 ? 1 : 2;
      const items: { productIdx: number; qty: number }[] = [];
      const usedIdx = new Set<number>();

      for (let j = 0; j < itemCount; j++) {
        // Weighted pick
        const totalW = productWeights.reduce((s, w) => s + w, 0);
        let r = Math.random() * totalW;
        let idx = 0;
        for (let k = 0; k < productWeights.length; k++) {
          r -= productWeights[k];
          if (r <= 0) { idx = k; break; }
        }
        if (usedIdx.has(idx)) continue;
        usedIdx.add(idx);
        items.push({ productIdx: idx, qty: 1 });
      }
      if (items.length === 0) continue;

      let subtotal = 0;
      for (const it of items) {
        subtotal += products[it.productIdx].price * it.qty;
      }

      saleRows.push({
        posnetId: posnet.id, sessionId: session.id, eventId: event.id, barId: bar.id,
        cashierUserId: cashier.id, status: POSSaleStatus.COMPLETED,
        subtotal, tax: 0, total: subtotal, createdAt: saleTime,
      });
      itemsPerSale.push(items);
    }

    // Create sales individually (need IDs), then bulk insert related records
    console.log('   📝 Inserting sales...');
    const allItemRows: Omit<SaleItemRow, 'id'>[] = [];
    const allPaymentRows: Omit<PaymentRow, 'id'>[] = [];
    const allMovRows: Omit<MovRow, 'id'>[] = [];
    const stockDecrements: Map<string, number> = new Map();

    // Create sales in small batches to avoid overwhelming the remote DB
    const BATCH = 10;
    for (let b = 0; b < saleRows.length; b += BATCH) {
      const batch = saleRows.slice(b, b + BATCH);
      const batchItems = itemsPerSale.slice(b, b + BATCH);
      const createdSales = await Promise.all(
        batch.map(sr => prisma.pOSSale.create({ data: sr as any }))
      );

      for (let j = 0; j < createdSales.length; j++) {
        const sale = createdSales[j];
        const items = batchItems[j];
        const sr = batch[j];

        for (const it of items) {
          const prod = products[it.productIdx];
          const cocktail = cocktails[it.productIdx];
          allItemRows.push({
            saleId: sale.id, productId: prod.id, cocktailId: cocktail.id,
            productNameSnapshot: prod.name, unitPriceSnapshot: prod.price,
            quantity: it.qty, lineTotal: prod.price * it.qty,
          });

          const recipe = recipeDefs[it.productIdx];
          for (const comp of recipe.comps) {
            const drink = (d as any)[comp.dk];
            const mlConsumed = Math.ceil((recipe.vol * comp.pct * it.qty) / 100);
            const sup = drink.drinkType === 'alcoholic' ? supplierDiageo : supplierCoca;

            allMovRows.push({
              barId: sr.barId, drinkId: drink.id, supplierId: sup.id, quantity: -mlConsumed,
              type: MovementType.sale, reason: StockMovementReason.SALE_DECREMENT,
              referenceId: sale.id, fromLocationType: 'BAR', fromLocationId: sr.barId,
              createdAt: sr.createdAt,
            });

            const key = `${sr.barId}-${drink.id}-${sup.id}`;
            stockDecrements.set(key, (stockDecrements.get(key) || 0) + mlConsumed);
          }
        }

        allPaymentRows.push({
          saleId: sale.id, method: pick(paymentMethods),
          amount: sr.total, status: POSPaymentStatus.SUCCESS,
          createdAt: sr.createdAt,
        });
      }
    }

    // Bulk insert items, payments, movements
    if (allItemRows.length > 0) {
      await prisma.pOSSaleItem.createMany({ data: allItemRows as any });
    }
    if (allPaymentRows.length > 0) {
      await prisma.pOSPayment.createMany({ data: allPaymentRows as any });
    }
    if (allMovRows.length > 0) {
      await prisma.inventoryMovement.createMany({ data: allMovRows as any });
    }

    // Decrement stock
    for (const [key, amount] of stockDecrements) {
      const [barId, drinkId, supplierId] = key.split('-').map(Number);
      await prisma.stock.updateMany({
        where: { barId, drinkId, supplierId, sellAsWholeUnit: false },
        data: { quantity: { decrement: amount } },
      });
    }

    console.log(`   ✅ ${saleRows.length} sales created with ${allItemRows.length} items.`);

    // --- Generate EventReport for finished events ---
    if (!isActive) {
      console.log(`   📊 Generating report...`);

      const salesTotals = await prisma.$queryRaw<Array<{ total_revenue: bigint; total_units: bigint; order_count: bigint }>>`
        SELECT COALESCE(SUM(ps.total), 0) as total_revenue, COALESCE(SUM(psi.quantity), 0) as total_units, COUNT(DISTINCT ps.id) as order_count
        FROM pos_sale ps LEFT JOIN pos_sale_item psi ON psi.sale_id = ps.id
        WHERE ps.event_id = ${event.id} AND ps.status = 'COMPLETED'
      `;
      const row = salesTotals[0] || { total_revenue: 0n, total_units: 0n, order_count: 0n };
      const totalRevenue = Number(row.total_revenue);
      const totalUnits = Number(row.total_units);
      const orderCount = Number(row.order_count);

      // Top products
      const topRaw = await prisma.$queryRaw<Array<{ product_name: string; units: bigint; revenue: bigint }>>`
        SELECT psi.product_name_snapshot as product_name, SUM(psi.quantity) as units, SUM(psi.line_total) as revenue
        FROM pos_sale ps JOIN pos_sale_item psi ON psi.sale_id = ps.id
        WHERE ps.event_id = ${event.id} AND ps.status = 'COMPLETED'
        GROUP BY psi.product_name_snapshot ORDER BY units DESC LIMIT 10
      `;
      const topProducts = topRaw.map(r => ({
        cocktailId: 0, name: r.product_name, unitsSold: Number(r.units), revenue: Number(r.revenue),
        sharePercent: totalUnits > 0 ? Math.round((Number(r.units) / totalUnits) * 10000) / 100 : 0,
      }));

      // Time series
      const tsRaw = await prisma.$queryRaw<Array<{ ts: Date; units: bigint; amount: bigint }>>`
        SELECT date_trunc('hour', ps.created_at) as ts, COALESCE(SUM(psi.quantity), 0) as units, SUM(ps.total) as amount
        FROM pos_sale ps LEFT JOIN pos_sale_item psi ON psi.sale_id = ps.id
        WHERE ps.event_id = ${event.id} AND ps.status = 'COMPLETED'
        GROUP BY date_trunc('hour', ps.created_at) ORDER BY ts ASC
      `;
      const timeSeries = tsRaw.map(r => ({ timestamp: r.ts, units: Number(r.units), amount: Number(r.amount) }));
      const peakHours = [...timeSeries].sort((a, b) => b.units - a.units).slice(0, 5)
        .map(p => ({ hour: p.timestamp.toISOString(), units: p.units, revenue: p.amount, orderCount: 0 }));
      const peakHours60min = peakHours.map(p => ({
        startTime: p.hour, endTime: new Date(new Date(p.hour).getTime() + 3600000).toISOString(),
        salesCount: p.units, revenue: p.revenue,
      }));

      // COGS
      const cogsRaw = await prisma.$queryRaw<Array<{ total_cogs: bigint }>>`
        SELECT COALESCE(SUM(ABS(im.quantity) * s.unit_cost), 0) as total_cogs
        FROM inventory_movement im
        JOIN "Stock" s ON s.bar_id = im.bar_id AND s.drink_id = im.drink_id AND s.supplier_id = im.supplier_id AND s.sell_as_whole_unit = false
        JOIN "Bar" b ON im.bar_id = b.id
        WHERE b."eventId" = ${event.id} AND im.type = 'sale'
      `;
      const totalCOGS = Number(cogsRaw[0]?.total_cogs || 0);
      const grossProfit = totalRevenue - totalCOGS;

      // Bar breakdowns
      const barBreakdowns = [];
      for (const bar of bars) {
        const bt = await prisma.$queryRaw<Array<{ rev: bigint; units: bigint; oc: bigint }>>`
          SELECT COALESCE(SUM(ps.total), 0) as rev, COALESCE(SUM(psi.quantity), 0) as units, COUNT(DISTINCT ps.id) as oc
          FROM pos_sale ps LEFT JOIN pos_sale_item psi ON psi.sale_id = ps.id
          WHERE ps.event_id = ${event.id} AND ps.bar_id = ${bar.id} AND ps.status = 'COMPLETED'
        `;
        const r = bt[0] || { rev: 0n, units: 0n, oc: 0n };
        const bRev = Number(r.rev); const bOrd = Number(r.oc);
        barBreakdowns.push({
          barId: bar.id, barName: bar.name, barType: bar.type,
          totalRevenue: bRev, totalCOGS: Math.round(bRev * 0.35), grossProfit: Math.round(bRev * 0.65), marginPercent: 65,
          totalUnitsSold: Number(r.units), totalOrderCount: bOrd,
          avgTicketSize: bOrd > 0 ? Math.round(bRev / bOrd) : 0,
          topProducts: [], peakHours: [],
        });
      }

      await prisma.eventReport.create({
        data: {
          eventId: event.id, totalRevenue, totalCOGS, grossProfit,
          totalUnitsSold: totalUnits, totalOrderCount: orderCount,
          topProducts: topProducts as any, peakHours: peakHours as any,
          timeSeries: timeSeries as any, remainingStock: { totalValue: 0, purchasedValue: 0, consignmentValue: 0, items: [] } as any,
          consumptionByDrink: [] as any,
          peakHours5min: [] as any, peakHours15min: [] as any, peakHours60min: peakHours60min as any,
          barBreakdowns: barBreakdowns as any, posBreakdowns: [] as any,
          cogsBreakdown: [] as any, warnings: [],
        },
      });
      console.log(`   📊 Report: revenue=${formatCurrency(totalRevenue)}, COGS=${formatCurrency(totalCOGS)}, profit=${formatCurrency(grossProfit)}, ${orderCount} orders`);
    }
  }

  // Return policies for finished events
  await prisma.returnPolicy.create({ data: { eventId: event1.id, ownerId: owner.id } });
  await prisma.returnPolicy.create({ data: { eventId: event2.id, ownerId: owner.id } });

  console.log('\n' + '='.repeat(60));
  console.log('🎉 SEED COMPLETED!');
  console.log('='.repeat(60));
  console.log('\n🔑 Credentials (password: password123):');
  console.log(`   Manager:  owner@dashbar.com`);
  console.log(`   Cashier:  cashier@dashbar.com`);
  console.log(`   Admin:    admin@dashbar.com`);
  console.log('\n📅 Events:');
  console.log(`   1. ${event1.name} (finished) - ID ${event1.id}`);
  console.log(`   2. ${event2.name} (finished) - ID ${event2.id}`);
  console.log(`   3. ${event3.name} (active)   - ID ${event3.id}`);
  console.log('');
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
}

main()
  .catch((e) => { console.error('❌ Error:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
