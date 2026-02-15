import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { POSSalesService } from '../pos/pos-sales.service';
import { BarType, PosnetStatus, PaymentMethod } from '@prisma/client';

interface SimulationState {
  intervalId: NodeJS.Timeout;
  posnetIds: number[];
  cocktailIds: number[];
  consecutiveErrors: number;
  salesCount: number;
}

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);
  private simulations = new Map<number, SimulationState>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly posSalesService: POSSalesService,
  ) {}

  /**
   * Create a fully configured demo event ready for simulation.
   */
  async setupDemoEvent(userId: number) {
    this.logger.log(`Setting up demo event for user ${userId}`);

    // 1. Create drinks (upsert by sku)
    const drinks = await this.createDemoDrinks();

    // 2. Create supplier
    const supplier = await this.prisma.supplier.upsert({
      where: {
        // Use compound unique if exists, otherwise find by name+owner
        id: await this.findSupplierIdByName(userId, 'Demo Proveedor'),
      },
      create: {
        name: 'Demo Proveedor',
        description: 'Proveedor generado para demo',
        email: 'demo@proveedor.com',
        ownerId: userId,
      },
      update: {},
    });

    // 3. Create venue
    const venue = await this.prisma.venue.create({
      data: {
        name: `Demo Venue ${Date.now()}`,
        address: 'Av. Demo 1234',
        city: 'Buenos Aires',
        state: 'CABA',
        country: 'Argentina',
        capacity: 500,
        venueType: 'indoor',
        ownerId: userId,
      },
    });

    // 4. Create event
    const event = await this.prisma.event.create({
      data: {
        name: `Fiesta Demo ${new Date().toLocaleDateString('es-AR')}`,
        description: 'Evento de demostración con simulación de ventas',
        status: 'upcoming',
        ownerId: userId,
        venueId: venue.id,
        stockDepletionPolicy: 'cheapest_first',
      },
    });

    // 5. Create bars
    const barGeneral = await this.prisma.bar.create({
      data: {
        name: 'Barra General',
        type: 'general' as BarType,
        status: 'closed',
        eventId: event.id,
      },
    });

    const barVIP = await this.prisma.bar.create({
      data: {
        name: 'Barra VIP',
        type: 'VIP' as BarType,
        status: 'closed',
        eventId: event.id,
      },
    });

    const bars = [barGeneral, barVIP];

    // 6. Calculate total stock per drink IN UNITS (across all bars)
    //    Stock.quantity is in ml; GlobalInventory tracks units (bottles/cans).
    const stockConfig = this.getStockConfig(drinks);

    // Build a drinkId → volume lookup
    const drinkVolumeMap = new Map<number, number>();
    for (const d of Object.values(drinks)) {
      drinkVolumeMap.set((d as any).id, (d as any).volume);
    }

    // Sum up allocated units per drinkId
    const allocatedUnitsPerDrink = new Map<number, number>();
    for (const item of stockConfig) {
      const vol = drinkVolumeMap.get(item.drinkId)!;
      const units = Math.round(item.quantity / vol); // ml → units
      const prev = allocatedUnitsPerDrink.get(item.drinkId) ?? 0;
      // Each bar gets the same stock; multiply by number of bars
      allocatedUnitsPerDrink.set(item.drinkId, prev + units * bars.length);
    }

    // 7. Create global inventory entries with correct allocatedQuantity (in units)
    for (const drink of Object.values(drinks)) {
      const allocatedUnits = allocatedUnitsPerDrink.get((drink as any).id) ?? 0;
      const totalUnits = Math.max(allocatedUnits, 2000); // At least 2000 units
      await this.prisma.globalInventory.upsert({
        where: {
          ownerId_drinkId_supplierId: {
            ownerId: userId,
            drinkId: (drink as any).id,
            supplierId: supplier.id,
          },
        },
        create: {
          ownerId: userId,
          drinkId: (drink as any).id,
          supplierId: supplier.id,
          totalQuantity: totalUnits,
          allocatedQuantity: allocatedUnits,
          unitCost: 500_00, // $500 per unit
          currency: 'ARS',
        },
        update: {
          totalQuantity: { increment: totalUnits },
          allocatedQuantity: { increment: allocatedUnits },
        },
      });
    }

    // 8. Create stock for each bar
    for (const bar of bars) {
      for (const item of stockConfig) {
        await this.prisma.stock.create({
          data: {
            barId: bar.id,
            drinkId: item.drinkId,
            supplierId: supplier.id,
            quantity: item.quantity,
            unitCost: item.unitCost,
            currency: 'ARS',
            ownershipMode: 'purchased',
            sellAsWholeUnit: item.sellAsWholeUnit,
            salePrice: item.salePrice,
          },
        });
      }
    }

    // 9. Create cocktails (event-scoped)
    const cocktails = await this.createDemoCocktails(event.id, drinks);

    // 10. Create event recipes
    await this.createDemoRecipes(event.id, drinks, cocktails);

    // 11. Create event products with pricing
    await this.createDemoProducts(event.id, cocktails);

    // 12. Create POS terminals
    const posnet1 = await this.prisma.posnet.create({
      data: {
        code: `POS-DEMO-${event.id}-01`,
        name: 'POS General Demo',
        status: PosnetStatus.OPEN,
        enabled: true,
        eventId: event.id,
        barId: barGeneral.id,
        authToken: `demo-token-${event.id}-01`,
      },
    });

    const posnet2 = await this.prisma.posnet.create({
      data: {
        code: `POS-DEMO-${event.id}-02`,
        name: 'POS VIP Demo',
        status: PosnetStatus.OPEN,
        enabled: true,
        eventId: event.id,
        barId: barVIP.id,
        authToken: `demo-token-${event.id}-02`,
      },
    });

    // 13. Create POS sessions (needed for POS sales)
    await this.prisma.pOSSession.create({
      data: {
        posnetId: posnet1.id,
        openedByUserId: userId,
        openingFloat: 0,
      },
    });

    await this.prisma.pOSSession.create({
      data: {
        posnetId: posnet2.id,
        openedByUserId: userId,
        openingFloat: 0,
      },
    });

    // 14. Create stock thresholds for alarms
    await this.createDemoThresholds(event.id, drinks);

    // Event stays in 'upcoming' status so the user can review/configure
    // alarms and thresholds before starting the event manually.

    // Return complete event info
    const fullEvent = await this.prisma.event.findUnique({
      where: { id: event.id },
      include: {
        venue: true,
        bars: true,
        posnets: true,
      },
    });

    return {
      event: fullEvent,
      posnetIds: [posnet1.id, posnet2.id],
      cocktailIds: Object.values(cocktails).map((c) => c.id),
      message: 'Evento demo creado. Configurá las alarmas y arrancá el evento cuando estés listo.',
    };
  }

  /**
   * Start the sale simulation for a demo event.
   */
  async startSimulation(eventId: number, intervalMs = 6000) {
    if (this.simulations.has(eventId)) {
      throw new BadRequestException('Simulation already running for this event');
    }

    // Auto-activate event if still upcoming
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (event && event.status === 'upcoming') {
      await this.prisma.event.update({
        where: { id: eventId },
        data: { status: 'active', startedAt: new Date() },
      });
      // Open all bars
      await this.prisma.bar.updateMany({
        where: { eventId },
        data: { status: 'open' },
      });
      // Open all POS terminals
      await this.prisma.posnet.updateMany({
        where: { eventId, enabled: true },
        data: { status: PosnetStatus.OPEN },
      });
      this.logger.log(`[Demo ${eventId}] Auto-activated event and opened bars/POS`);
    }

    // Get posnet IDs and cocktail IDs for this event
    const posnets = await this.prisma.posnet.findMany({
      where: { eventId, enabled: true, status: PosnetStatus.OPEN },
      select: { id: true },
    });

    if (posnets.length === 0) {
      throw new BadRequestException('No active POS terminals found for this event');
    }

    const cocktails = await this.prisma.cocktail.findMany({
      where: { eventId, isActive: true },
      select: { id: true },
    });

    if (cocktails.length === 0) {
      throw new BadRequestException('No active cocktails found for this event');
    }

    const state: SimulationState = {
      intervalId: null as any,
      posnetIds: posnets.map((p) => p.id),
      cocktailIds: cocktails.map((c) => c.id),
      consecutiveErrors: 0,
      salesCount: 0,
    };

    // Create interval with random jitter
    const runSale = async () => {
      try {
        await this.simulateRandomSale(eventId, state);
        state.consecutiveErrors = 0;
        state.salesCount++;

        this.logger.log(
          `[Demo ${eventId}] Sale #${state.salesCount} completed`,
        );
      } catch (error: any) {
        state.consecutiveErrors++;
        this.logger.warn(
          `[Demo ${eventId}] Sale error (${state.consecutiveErrors}): ${error.message}`,
        );

        // After 30 consecutive errors, stop the simulation
        if (state.consecutiveErrors >= 30) {
          this.logger.warn(
            `[Demo ${eventId}] Too many consecutive errors. Stopping simulation.`,
          );
          this.stopSimulation(eventId);
        }
      }
    };

    state.intervalId = setInterval(runSale, intervalMs);
    this.simulations.set(eventId, state);

    // Run the first sale immediately
    runSale();

    return {
      message: 'Simulación iniciada',
      intervalMs,
      posnetCount: state.posnetIds.length,
      cocktailCount: state.cocktailIds.length,
    };
  }

  /**
   * Stop the sale simulation for a demo event.
   */
  stopSimulation(eventId: number) {
    const state = this.simulations.get(eventId);
    if (!state) {
      return { message: 'No hay simulación corriendo para este evento', running: false };
    }

    clearInterval(state.intervalId);
    this.simulations.delete(eventId);

    return {
      message: `Simulación detenida. Total ventas: ${state.salesCount}`,
      totalSales: state.salesCount,
      running: false,
    };
  }

  /**
   * Check if a simulation is currently running for an event.
   */
  isSimulating(eventId: number): boolean {
    return this.simulations.has(eventId);
  }

  getSimulationStats(eventId: number) {
    const state = this.simulations.get(eventId);
    if (!state) {
      return { running: false, salesCount: 0 };
    }
    return {
      running: true,
      salesCount: state.salesCount,
      consecutiveErrors: state.consecutiveErrors,
    };
  }

  // ─── Private helpers ──────────────────────────────────────

  private async simulateRandomSale(eventId: number, state: SimulationState) {
    const posnetId = state.posnetIds[Math.floor(Math.random() * state.posnetIds.length)];

    // Pick 1-3 random items
    const itemCount = Math.floor(Math.random() * 3) + 1;
    const items: Array<{ cocktailId: number; quantity: number }> = [];

    for (let i = 0; i < itemCount; i++) {
      const cocktailId =
        state.cocktailIds[Math.floor(Math.random() * state.cocktailIds.length)];
      const quantity = Math.floor(Math.random() * 3) + 1;

      // Avoid duplicate cocktailIds in the same sale
      const existing = items.find((it) => it.cocktailId === cocktailId);
      if (existing) {
        existing.quantity += quantity;
      } else {
        items.push({ cocktailId, quantity });
      }
    }

    // Random payment method
    const methods: PaymentMethod[] = ['cash', 'credit', 'debit'];
    const paymentMethod = methods[Math.floor(Math.random() * methods.length)];

    await this.posSalesService.createSale(posnetId, {
      items,
      paymentMethod,
      idempotencyKey: `demo-${eventId}-${Date.now()}-${Math.random()}`,
    });
  }

  private async createDemoDrinks() {
    const drinkDefs = [
      { name: 'Fernet Branca', brand: 'Branca', sku: 'DEMO-FERNET-750', drinkType: 'alcoholic' as const, volume: 750 },
      { name: 'Coca-Cola', brand: 'Coca-Cola', sku: 'DEMO-COCA-1500', drinkType: 'non_alcoholic' as const, volume: 1500 },
      { name: 'Vodka Absolut', brand: 'Absolut', sku: 'DEMO-VODKA-700', drinkType: 'alcoholic' as const, volume: 700 },
      { name: 'Jugo de Naranja', brand: 'Cepita', sku: 'DEMO-JUGO-1000', drinkType: 'non_alcoholic' as const, volume: 1000 },
      { name: 'Red Bull', brand: 'Red Bull', sku: 'DEMO-REDBULL-250', drinkType: 'non_alcoholic' as const, volume: 250 },
    ];

    const result: Record<string, any> = {};

    for (const def of drinkDefs) {
      const drink = await this.prisma.drink.upsert({
        where: { sku: def.sku },
        create: def,
        update: {},
      });
      result[def.sku] = drink;
    }

    return {
      fernet: result['DEMO-FERNET-750'],
      coca: result['DEMO-COCA-1500'],
      vodka: result['DEMO-VODKA-700'],
      jugo: result['DEMO-JUGO-1000'],
      redbull: result['DEMO-REDBULL-250'],
    };
  }

  private getStockConfig(drinks: Record<string, any>) {
    // Massive stock quantities (20x) for long-running demo sessions
    return [
      // Fernet for recipes (400 bottles * 750ml = 300000ml)
      { drinkId: drinks.fernet.id, quantity: 300_000, unitCost: 800_00, sellAsWholeUnit: false, salePrice: null },
      // Fernet for direct sale (200 bottles * 750ml = 150000ml)
      { drinkId: drinks.fernet.id, quantity: 150_000, unitCost: 800_00, sellAsWholeUnit: true, salePrice: 10000_00 },
      // Coca-Cola for recipes (600 bottles * 1500ml = 900000ml)
      { drinkId: drinks.coca.id, quantity: 900_000, unitCost: 200_00, sellAsWholeUnit: false, salePrice: null },
      // Vodka for recipes (300 bottles * 700ml = 210000ml)
      { drinkId: drinks.vodka.id, quantity: 210_000, unitCost: 1200_00, sellAsWholeUnit: false, salePrice: null },
      // Vodka for direct sale (100 bottles * 700ml = 70000ml)
      { drinkId: drinks.vodka.id, quantity: 70_000, unitCost: 1200_00, sellAsWholeUnit: true, salePrice: 8000_00 },
      // Jugo for recipes (400 bottles * 1000ml = 400000ml)
      { drinkId: drinks.jugo.id, quantity: 400_000, unitCost: 150_00, sellAsWholeUnit: false, salePrice: null },
      // Red Bull for direct sale (300 cans * 250ml = 75000ml)
      { drinkId: drinks.redbull.id, quantity: 75_000, unitCost: 300_00, sellAsWholeUnit: true, salePrice: 3500_00 },
    ];
  }

  private async createDemoCocktails(eventId: number, drinks: Record<string, any>) {
    const cocktailDefs = [
      { name: 'Fernet con Coca', volume: 350, price: 3500_00 },
      { name: 'Vodka Naranja', volume: 300, price: 3000_00 },
      { name: 'Fernet Botella', volume: drinks.fernet.volume, price: 10000_00 },
      { name: 'Vodka Botella', volume: drinks.vodka.volume, price: 8000_00 },
      { name: 'Red Bull Lata', volume: drinks.redbull.volume, price: 3500_00 },
    ];

    const result: Record<string, any> = {};

    for (const def of cocktailDefs) {
      const cocktail = await this.prisma.cocktail.create({
        data: {
          eventId,
          name: def.name,
          volume: def.volume,
          price: def.price,
          isActive: true,
          isCombo: false,
        },
      });
      result[def.name] = cocktail;
    }

    return result;
  }

  private async createDemoRecipes(
    eventId: number,
    drinks: Record<string, any>,
    cocktails: Record<string, any>,
  ) {
    const barTypes: BarType[] = ['general', 'VIP'];

    const recipeDefs = [
      {
        cocktailName: 'Fernet con Coca',
        glassVolume: 350,
        hasIce: true,
        components: [
          { drinkId: drinks.fernet.id, percentage: 40 },
          { drinkId: drinks.coca.id, percentage: 60 },
        ],
      },
      {
        cocktailName: 'Vodka Naranja',
        glassVolume: 300,
        hasIce: true,
        components: [
          { drinkId: drinks.vodka.id, percentage: 30 },
          { drinkId: drinks.jugo.id, percentage: 70 },
        ],
      },
      // Direct sale recipes (100% single component)
      {
        cocktailName: 'Fernet Botella',
        glassVolume: drinks.fernet.volume,
        hasIce: false,
        components: [{ drinkId: drinks.fernet.id, percentage: 100 }],
      },
      {
        cocktailName: 'Vodka Botella',
        glassVolume: drinks.vodka.volume,
        hasIce: false,
        components: [{ drinkId: drinks.vodka.id, percentage: 100 }],
      },
      {
        cocktailName: 'Red Bull Lata',
        glassVolume: drinks.redbull.volume,
        hasIce: false,
        components: [{ drinkId: drinks.redbull.id, percentage: 100 }],
      },
    ];

    for (const def of recipeDefs) {
      const recipe = await this.prisma.eventRecipe.create({
        data: {
          eventId,
          cocktailName: def.cocktailName,
          glassVolume: def.glassVolume,
          hasIce: def.hasIce,
          salePrice: cocktails[def.cocktailName]?.price || 0,
          barTypes: {
            create: barTypes.map((bt) => ({ barType: bt })),
          },
          components: {
            create: def.components.map((c) => ({
              drinkId: c.drinkId,
              percentage: c.percentage,
            })),
          },
        },
      });
    }
  }

  private async createDemoProducts(
    eventId: number,
    cocktails: Record<string, any>,
  ) {
    for (const [name, cocktail] of Object.entries(cocktails)) {
      const product = await this.prisma.eventProduct.create({
        data: {
          eventId,
          name,
          price: cocktail.price,
          isCombo: false,
          cocktails: {
            create: { cocktailId: cocktail.id },
          },
        },
      });
    }
  }

  private async createDemoThresholds(eventId: number, drinks: Record<string, any>) {
    // Build a drinkId → volume map from the drinks record
    const drinkVolumeMap = new Map<number, number>();
    for (const d of Object.values(drinks)) {
      drinkVolumeMap.set((d as any).id, (d as any).volume);
    }

    // Dynamically generate a threshold for every (drinkId, sellAsWholeUnit) pair
    // found in the stock config — guarantees 100% coverage.
    const stockConfig = this.getStockConfig(drinks);
    const seen = new Set<string>();

    for (const item of stockConfig) {
      const key = `${item.drinkId}-${item.sellAsWholeUnit}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const drinkVol = drinkVolumeMap.get(item.drinkId) ?? 1;
      const totalUnitsPerBar = Math.round(item.quantity / drinkVol);

      // Alarm at ~15% remaining stock, donation surplus above ~40%
      const lowerThreshold = Math.max(Math.round(totalUnitsPerBar * 0.15), 5);
      const donationThreshold = Math.max(Math.round(totalUnitsPerBar * 0.40), lowerThreshold + 10);

      await this.prisma.stockThreshold.create({
        data: {
          eventId,
          drinkId: item.drinkId,
          sellAsWholeUnit: item.sellAsWholeUnit,
          lowerThreshold,
          donationThreshold,
        },
      });
    }
  }

  private async findSupplierIdByName(userId: number, name: string): Promise<number> {
    const existing = await this.prisma.supplier.findFirst({
      where: { ownerId: userId, name },
      select: { id: true },
    });
    return existing?.id ?? 0; // 0 triggers create in upsert
  }
}
