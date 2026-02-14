import { PrismaService } from '../prisma/prisma.service';
import type Anthropic from '@anthropic-ai/sdk';

// ── Tool definitions for Claude ──────────────────────────────────

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'list_events',
    description:
      'List all events owned by the current user. Optionally filter by status (upcoming, active, finished, archived).',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: ['upcoming', 'active', 'finished', 'archived'],
          description: 'Filter by event status',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_event_details',
    description:
      'Get full details of a specific event, including its bars with stock counts, POS counts, and event metadata.',
    input_schema: {
      type: 'object' as const,
      properties: {
        eventId: { type: 'number', description: 'The event ID' },
      },
      required: ['eventId'],
    },
  },
  {
    name: 'get_bar_stock',
    description:
      'Get all stock items for a specific bar, including drink name, brand, supplier, quantity, cost, and ownership mode.',
    input_schema: {
      type: 'object' as const,
      properties: {
        eventId: { type: 'number', description: 'The event ID' },
        barId: { type: 'number', description: 'The bar ID' },
      },
      required: ['eventId', 'barId'],
    },
  },
  {
    name: 'get_global_inventory',
    description:
      'Get the global inventory (warehouse) of the user, showing all drinks with total and allocated quantities.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_event_recipes',
    description:
      'Get all recipes configured for a specific event, including components with percentages and bar type assignments.',
    input_schema: {
      type: 'object' as const,
      properties: {
        eventId: { type: 'number', description: 'The event ID' },
      },
      required: ['eventId'],
    },
  },
  {
    name: 'get_event_products',
    description:
      'Get all products configured for a specific event, including price and associated cocktails.',
    input_schema: {
      type: 'object' as const,
      properties: {
        eventId: { type: 'number', description: 'The event ID' },
      },
      required: ['eventId'],
    },
  },
  {
    name: 'get_sales_summary',
    description:
      'Get a summary of POS sales for an event or a specific bar: total revenue, number of sales, average ticket, payment methods breakdown.',
    input_schema: {
      type: 'object' as const,
      properties: {
        eventId: { type: 'number', description: 'The event ID' },
        barId: {
          type: 'number',
          description: 'Optional bar ID to scope to a single bar',
        },
      },
      required: ['eventId'],
    },
  },
  {
    name: 'get_top_products',
    description:
      'Get the top-selling products for an event by quantity sold.',
    input_schema: {
      type: 'object' as const,
      properties: {
        eventId: { type: 'number', description: 'The event ID' },
        limit: {
          type: 'number',
          description: 'Number of top products to return (default 10)',
        },
      },
      required: ['eventId'],
    },
  },
  {
    name: 'get_event_report',
    description:
      'Get the generated post-event report with metrics like peak hours, stock valuation, best sellers, and P&L.',
    input_schema: {
      type: 'object' as const,
      properties: {
        eventId: { type: 'number', description: 'The event ID' },
      },
      required: ['eventId'],
    },
  },
  {
    name: 'get_stock_movements',
    description:
      'Get inventory movement history for a bar or the whole event. Shows assignments, returns, sales decrements, moves.',
    input_schema: {
      type: 'object' as const,
      properties: {
        eventId: { type: 'number', description: 'The event ID' },
        barId: {
          type: 'number',
          description: 'Optional bar ID to scope to a single bar',
        },
        limit: {
          type: 'number',
          description: 'Max number of movements to return (default 50)',
        },
      },
      required: ['eventId'],
    },
  },
  {
    name: 'get_suppliers',
    description:
      'List all suppliers registered by the user.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'search_drinks',
    description:
      'Search the drinks (insumos) catalog by name or brand.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search term for drink name or brand',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_pos_sessions',
    description:
      'Get POS terminal sessions for an event, showing which terminals were active and their sales counts.',
    input_schema: {
      type: 'object' as const,
      properties: {
        eventId: { type: 'number', description: 'The event ID' },
      },
      required: ['eventId'],
    },
  },
  {
    name: 'run_custom_query',
    description:
      'Run a read-only SQL SELECT query against the database. Use this for complex analytical queries that other tools cannot answer. IMPORTANT: Only SELECT statements are allowed. The query runs with a 5-second timeout. Available tables include: "event", "bar", "stock", "drink", "supplier", "event_recipe", "event_recipe_component", "event_product", "pos_sale", "pos_sale_item", "pos_payment", "pos_session", "posnet", "inventory_movement", "global_inventory", "event_report", "metric_sample", "venue". All event-scoped data should be filtered by user_id through the event table.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sql: {
          type: 'string',
          description:
            'A read-only SQL SELECT query. Must start with SELECT. No INSERT, UPDATE, DELETE, DROP, ALTER, etc.',
        },
      },
      required: ['sql'],
    },
  },
];

// ── Tool executor ────────────────────────────────────────────────

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  userId: number,
  prisma: PrismaService,
): Promise<string> {
  try {
    switch (toolName) {
      case 'list_events':
        return await listEvents(prisma, userId, input.status as string | undefined);
      case 'get_event_details':
        return await getEventDetails(prisma, userId, input.eventId as number);
      case 'get_bar_stock':
        return await getBarStock(prisma, userId, input.eventId as number, input.barId as number);
      case 'get_global_inventory':
        return await getGlobalInventory(prisma, userId);
      case 'get_event_recipes':
        return await getEventRecipes(prisma, userId, input.eventId as number);
      case 'get_event_products':
        return await getEventProducts(prisma, userId, input.eventId as number);
      case 'get_sales_summary':
        return await getSalesSummary(prisma, userId, input.eventId as number, input.barId as number | undefined);
      case 'get_top_products':
        return await getTopProducts(prisma, userId, input.eventId as number, input.limit as number | undefined);
      case 'get_event_report':
        return await getEventReport(prisma, userId, input.eventId as number);
      case 'get_stock_movements':
        return await getStockMovements(prisma, userId, input.eventId as number, input.barId as number | undefined, input.limit as number | undefined);
      case 'get_suppliers':
        return await getSuppliers(prisma, userId);
      case 'search_drinks':
        return await searchDrinks(prisma, input.query as string);
      case 'get_pos_sessions':
        return await getPosSessions(prisma, userId, input.eventId as number);
      case 'run_custom_query':
        return await runCustomQuery(prisma, userId, input.sql as string);
      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (err: any) {
    return JSON.stringify({ error: err.message || 'Tool execution failed' });
  }
}

// ── Helper: verify event ownership ──────────────────────────────

async function verifyEventOwnership(prisma: PrismaService, userId: number, eventId: number) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, ownerId: userId },
  });
  if (!event) throw new Error(`Event ${eventId} not found or not owned by you`);
  return event;
}

// ── Tool implementations ─────────────────────────────────────────

async function listEvents(prisma: PrismaService, userId: number, status?: string) {
  const where: any = { ownerId: userId };
  if (status) where.status = status;

  const events = await prisma.event.findMany({
    where,
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      venue: { select: { name: true, city: true } },
      _count: { select: { bars: true } },
    },
    orderBy: { id: 'desc' },
  });

  return JSON.stringify(events, null, 2);
}

async function getEventDetails(prisma: PrismaService, userId: number, eventId: number) {
  await verifyEventOwnership(prisma, userId, eventId);

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      venue: true,
      bars: {
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          _count: { select: { stocks: true, posnets: true } },
        },
      },
      _count: { select: { eventRecipes: true, eventProducts: true, posSales: true } },
    },
  });

  return JSON.stringify(event, null, 2);
}

async function getBarStock(prisma: PrismaService, userId: number, eventId: number, barId: number) {
  await verifyEventOwnership(prisma, userId, eventId);

  const stock = await prisma.stock.findMany({
    where: { barId, bar: { eventId } },
    include: {
      drink: { select: { id: true, name: true, brand: true, volume: true, drinkType: true } },
      supplier: { select: { id: true, name: true } },
    },
  });

  const formatted = stock.map((s) => ({
    drinkName: s.drink.name,
    brand: s.drink.brand,
    volume: s.drink.volume,
    supplier: s.supplier.name,
    quantity: s.quantity,
    unitCost: s.unitCost / 100,
    currency: s.currency,
    ownershipMode: s.ownershipMode,
    sellAsWholeUnit: s.sellAsWholeUnit,
  }));

  return JSON.stringify(formatted, null, 2);
}

async function getGlobalInventory(prisma: PrismaService, userId: number) {
  const inventory = await prisma.globalInventory.findMany({
    where: { ownerId: userId },
    include: {
      drink: { select: { name: true, brand: true, volume: true } },
      supplier: { select: { name: true } },
    },
  });

  const formatted = inventory.map((i: any) => ({
    id: i.id,
    drink: `${i.drink.name} (${i.drink.brand}) ${i.drink.volume}ml`,
    supplier: i.supplier?.name || 'N/A',
    totalQuantity: i.totalQuantity,
    allocatedQuantity: i.allocatedQuantity,
    available: i.totalQuantity - i.allocatedQuantity,
    unitCost: i.unitCost / 100,
    ownershipMode: i.ownershipMode,
  }));

  return JSON.stringify(formatted, null, 2);
}

async function getEventRecipes(prisma: PrismaService, userId: number, eventId: number) {
  await verifyEventOwnership(prisma, userId, eventId);

  const recipes = await prisma.eventRecipe.findMany({
    where: { eventId },
    include: {
      components: {
        include: { drink: { select: { name: true, brand: true } } },
      },
      barTypes: true,
    },
  });

  const formatted = recipes.map((r) => ({
    id: r.id,
    cocktailName: r.cocktailName,
    glassVolume: r.glassVolume,
    hasIce: r.hasIce,
    salePrice: r.salePrice / 100,
    barTypes: r.barTypes.map((bt: any) => bt.barType),
    components: r.components.map((c) => ({
      drink: `${c.drink.name} (${c.drink.brand})`,
      percentage: c.percentage,
    })),
  }));

  return JSON.stringify(formatted, null, 2);
}

async function getEventProducts(prisma: PrismaService, userId: number, eventId: number) {
  await verifyEventOwnership(prisma, userId, eventId);

  const products = await prisma.eventProduct.findMany({
    where: { eventId },
    include: {
      cocktails: {
        include: { cocktail: { select: { name: true } } },
      },
    },
  });

  const formatted = products.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price / 100,
    cocktails: p.cocktails.map((c: any) => c.cocktail.name),
  }));

  return JSON.stringify(formatted, null, 2);
}

async function getSalesSummary(prisma: PrismaService, userId: number, eventId: number, barId?: number) {
  await verifyEventOwnership(prisma, userId, eventId);

  const where: any = { eventId, status: 'COMPLETED' };
  if (barId) where.barId = barId;

  const sales = await prisma.pOSSale.findMany({
    where,
    include: {
      payments: true,
      bar: { select: { name: true } },
    },
  });

  const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);
  const paymentBreakdown: Record<string, number> = {};
  sales.forEach((s) => {
    s.payments.forEach((p: any) => {
      paymentBreakdown[p.method] = (paymentBreakdown[p.method] || 0) + p.amount;
    });
  });

  // Convert to dollars
  Object.keys(paymentBreakdown).forEach((k) => {
    paymentBreakdown[k] = paymentBreakdown[k] / 100;
  });

  return JSON.stringify(
    {
      totalSales: sales.length,
      totalRevenue: totalRevenue / 100,
      averageTicket: sales.length > 0 ? totalRevenue / 100 / sales.length : 0,
      paymentBreakdown,
    },
    null,
    2,
  );
}

async function getTopProducts(prisma: PrismaService, userId: number, eventId: number, limit?: number) {
  await verifyEventOwnership(prisma, userId, eventId);

  const items = await prisma.pOSSaleItem.findMany({
    where: {
      sale: { eventId, status: 'COMPLETED' },
    },
    select: {
      productNameSnapshot: true,
      quantity: true,
      lineTotal: true,
    },
  });

  const grouped: Record<string, { qty: number; revenue: number }> = {};
  items.forEach((item) => {
    const key = item.productNameSnapshot;
    if (!grouped[key]) grouped[key] = { qty: 0, revenue: 0 };
    grouped[key].qty += item.quantity;
    grouped[key].revenue += item.lineTotal;
  });

  const sorted = Object.entries(grouped)
    .map(([name, data]) => ({ name, quantitySold: data.qty, revenue: data.revenue / 100 }))
    .sort((a, b) => b.quantitySold - a.quantitySold)
    .slice(0, limit || 10);

  return JSON.stringify(sorted, null, 2);
}

async function getEventReport(prisma: PrismaService, userId: number, eventId: number) {
  await verifyEventOwnership(prisma, userId, eventId);

  const report = await prisma.eventReport.findUnique({
    where: { eventId },
  });

  if (!report) return JSON.stringify({ message: 'No report has been generated for this event yet.' });

  return JSON.stringify(
    {
      generatedAt: report.generatedAt,
      totalRevenue: Number(report.totalRevenue) / 100,
      totalCOGS: Number(report.totalCOGS) / 100,
      grossProfit: Number(report.grossProfit) / 100,
      totalUnitsSold: report.totalUnitsSold,
      totalOrderCount: report.totalOrderCount,
      peakHours: report.peakHours,
      barBreakdowns: report.barBreakdowns,
      posBreakdowns: report.posBreakdowns,
      topProducts: report.topProducts,
      stockValuation: report.stockValuation,
    },
    null,
    2,
  );
}

async function getStockMovements(
  prisma: PrismaService,
  userId: number,
  eventId: number,
  barId?: number,
  limit?: number,
) {
  await verifyEventOwnership(prisma, userId, eventId);

  const where: any = { bar: { eventId } };
  if (barId) where.barId = barId;

  const movements = await prisma.inventoryMovement.findMany({
    where,
    include: {
      drink: { select: { name: true, brand: true } },
      bar: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit || 50,
  });

  const formatted = movements.map((m: any) => ({
    date: m.createdAt,
    drink: `${m.drink.name} (${m.drink.brand})`,
    bar: m.bar?.name || null,
    reason: m.reason,
    quantity: m.quantity,
    notes: m.notes,
  }));

  return JSON.stringify(formatted, null, 2);
}

async function getSuppliers(prisma: PrismaService, userId: number) {
  const suppliers = await prisma.supplier.findMany({
    where: { ownerId: userId },
    select: { id: true, name: true, description: true, email: true, phone: true },
  });
  return JSON.stringify(suppliers, null, 2);
}

async function searchDrinks(prisma: PrismaService, query: string) {
  const drinks = await prisma.drink.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { brand: { contains: query, mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, brand: true, volume: true, drinkType: true, sku: true },
    take: 20,
  });
  return JSON.stringify(drinks, null, 2);
}

async function getPosSessions(prisma: PrismaService, userId: number, eventId: number) {
  await verifyEventOwnership(prisma, userId, eventId);

  const sessions = await prisma.pOSSession.findMany({
    where: { posnet: { eventId } },
    include: {
      posnet: { select: { name: true, barId: true, bar: { select: { name: true } } } },
      _count: { select: { sales: true } },
    },
    orderBy: { openedAt: 'desc' },
  });

  const formatted = sessions.map((s) => ({
    id: s.id,
    terminal: s.posnet.name,
    bar: s.posnet.bar.name,
    openedAt: s.openedAt,
    closedAt: s.closedAt,
    salesCount: s._count.sales,
  }));

  return JSON.stringify(formatted, null, 2);
}

async function runCustomQuery(prisma: PrismaService, userId: number, sql: string) {
  // Security: only allow SELECT
  const trimmed = sql.trim().toUpperCase();
  if (!trimmed.startsWith('SELECT')) {
    throw new Error('Only SELECT queries are allowed');
  }

  // Block dangerous keywords
  const forbidden = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'CREATE', 'GRANT', 'REVOKE', 'EXEC'];
  for (const kw of forbidden) {
    if (trimmed.includes(kw)) {
      throw new Error(`Forbidden keyword in query: ${kw}`);
    }
  }

  // Execute with timeout
  const result = await Promise.race([
    prisma.$queryRawUnsafe(sql) as Promise<any[]>,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Query timed out (5s limit)')), 5000),
    ),
  ]);

  // Limit result size
  const rows = Array.isArray(result) ? result.slice(0, 100) : result;
  return JSON.stringify(rows, null, 2);
}
