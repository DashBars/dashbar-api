import 'dotenv/config';
import { PrismaClient, BarType, BarStatus, UserRole, DrinkType, OwnershipMode, StockDepletionPolicy, MovementType } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding database...\n');

  // Hash password for all users
  const hashedPassword = await bcrypt.hash('password123', 10);

  // Clean existing data
  console.log('🧹 Cleaning existing data...');
  await prisma.eventReport.deleteMany();
  await prisma.stockTransfer.deleteMany();
  await prisma.stockAlert.deleteMany();
  await prisma.stockThreshold.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.barRecipeOverride.deleteMany();
  await prisma.consignmentReturn.deleteMany();
  await prisma.cocktailCategory.deleteMany();
  await prisma.category.deleteMany();
  await prisma.eventRecipe.deleteMany();
  await prisma.eventPrice.deleteMany();
  await prisma.stock.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.order.deleteMany();
  await prisma.posnet.deleteMany();
  await prisma.bar.deleteMany();
  await prisma.event.deleteMany();
  await prisma.product.deleteMany();
  await prisma.recipe.deleteMany();
  await prisma.cocktail.deleteMany();
  await prisma.drinkProvider.deleteMany();
  await prisma.drink.deleteMany();
  await prisma.provider.deleteMany();
  await prisma.venue.deleteMany();
  await prisma.user.deleteMany();

  // Reset all sequences to start from 1
  console.log('🔄 Resetting auto-increment sequences...');
  const sequences = [
    'User_id_seq',
    'Venue_id_seq',
    'Event_id_seq',
    'Bar_id_seq',
    'Drink_id_seq',
    'Provider_id_seq',
    'Cocktail_id_seq',
    'Product_id_seq',
    'recipe_id_seq', // @@map("recipe")
    'Posnet_id_seq',
    'Transaction_id_seq',
    'Order_id_seq',
    'supplier_id_seq', // @@map("supplier")
    'event_price_id_seq', // @@map("event_price")
    'event_recipe_id_seq', // @@map("event_recipe")
    'category_id_seq', // @@map("category")
    'consignment_return_id_seq', // @@map("consignment_return")
    'bar_recipe_override_id_seq', // @@map("bar_recipe_override")
    'inventory_movement_id_seq', // @@map("inventory_movement")
    'sale_id_seq', // @@map("sale")
    'stock_threshold_id_seq', // @@map("stock_threshold")
    'stock_alert_id_seq', // @@map("stock_alert")
    'stock_transfer_id_seq', // @@map("stock_transfer")
    'event_report_id_seq', // @@map("event_report")
    'AlarmConfig_id_seq',
  ];

  for (const sequence of sequences) {
    try {
      await pool.query(`ALTER SEQUENCE "${sequence}" RESTART WITH 1`);
    } catch (error: any) {
      // Ignore errors for sequences that don't exist (e.g., composite key tables)
      if (!error.message.includes('does not exist') && !error.message.includes('relation') && !error.message.includes('sequence')) {
        console.warn(`⚠️  Could not reset sequence ${sequence}: ${error.message}`);
      }
    }
  }

  // ============= USERS =============
  console.log('👤 Creating users...');
  const owner = await prisma.user.create({
    data: {
      email: 'owner@dashbar.com',
      password: hashedPassword,
      role: UserRole.manager,
    },
  });

  const cashier = await prisma.user.create({
    data: {
      email: 'cashier@dashbar.com',
      password: hashedPassword,
      role: UserRole.cashier,
    },
  });

  const cashier2 = await prisma.user.create({
    data: {
      email: 'cashier2@dashbar.com',
      password: hashedPassword,
      role: UserRole.cashier,
    },
  });

  const admin = await prisma.user.create({
    data: {
      email: 'admin@dashbar.com',
      password: hashedPassword,
      role: UserRole.admin,
    },
  });

  const manager2 = await prisma.user.create({
    data: {
      email: 'manager2@dashbar.com',
      password: hashedPassword,
      role: UserRole.manager,
    },
  });

  console.log(`   ✅ Created users: ${owner.email}, ${cashier.email}, ${cashier2.email}, ${admin.email}, ${manager2.email}`);

  // ============= VENUES =============
  console.log('🏟️  Creating venues...');
  const venue1 = await prisma.venue.create({
    data: {
      name: 'Estadio River Plate',
      address: 'Av. Figueroa Alcorta 7597',
      city: 'Buenos Aires',
      country: 'Argentina',
      capacity: 84567,
    },
  });

  const venue2 = await prisma.venue.create({
    data: {
      name: 'Luna Park',
      address: 'Av. Madero 420',
      city: 'Buenos Aires',
      country: 'Argentina',
      capacity: 8500,
    },
  });

  console.log(`   ✅ Created venues: ${venue1.name}, ${venue2.name}`);

  // ============= PROVIDERS =============
  console.log('🚚 Creating providers...');
  const provider1 = await prisma.provider.create({
    data: {
      name: 'Bebidas Premium S.A.',
      description: 'Distribuidor de bebidas premium',
      email: 'ventas@bebidaspremium.com',
      phone: '+54 11 4444-5555',
    },
  });

  const provider2 = await prisma.provider.create({
    data: {
      name: 'Jugos Naturales',
      description: 'Proveedor de jugos y bebidas sin alcohol',
      email: 'pedidos@jugosnaturales.com',
      phone: '+54 11 3333-2222',
    },
  });

  console.log(`   ✅ Created providers: ${provider1.name}, ${provider2.name}`);

  // ============= SUPPLIERS (tenant-scoped) =============
  console.log('📦 Creating suppliers...');
  const supplier1 = await prisma.supplier.create({
    data: {
      name: 'Bebidas Premium S.A.',
      description: 'Distribuidor de bebidas premium',
      email: 'ventas@bebidaspremium.com',
      phone: '+54 11 4444-5555',
      ownerId: owner.id,
    },
  });

  const supplier2 = await prisma.supplier.create({
    data: {
      name: 'Jugos Naturales',
      description: 'Proveedor de jugos y bebidas sin alcohol',
      email: 'pedidos@jugosnaturales.com',
      phone: '+54 11 3333-2222',
      ownerId: owner.id,
    },
  });

  const supplier3 = await prisma.supplier.create({
    data: {
      name: 'Licores del Sur',
      description: 'Distribuidor de licores en consignación',
      email: 'consignacion@licoresdelsur.com',
      phone: '+54 11 5555-6666',
      ownerId: owner.id,
    },
  });

  console.log(`   ✅ Created suppliers: ${supplier1.name}, ${supplier2.name}, ${supplier3.name}`);

  // ============= DRINKS =============
  console.log('🍺 Creating drinks...');
  const vodka = await prisma.drink.create({
    data: {
      name: 'Vodka',
      brand: 'Absolut',
      sku: 'DRINK-VODKA-001',
      drinkType: DrinkType.alcoholic,
      volume: 750,
    },
  });

  const ron = await prisma.drink.create({
    data: {
      name: 'Ron',
      brand: 'Havana Club',
      sku: 'DRINK-RON-001',
      drinkType: DrinkType.alcoholic,
      volume: 750,
    },
  });

  const tequila = await prisma.drink.create({
    data: {
      name: 'Tequila',
      brand: 'José Cuervo',
      sku: 'DRINK-TEQUILA-001',
      drinkType: DrinkType.alcoholic,
      volume: 750,
    },
  });

  const gin = await prisma.drink.create({
    data: {
      name: 'Gin',
      brand: 'Beefeater',
      sku: 'DRINK-GIN-001',
      drinkType: DrinkType.alcoholic,
      volume: 750,
    },
  });

  const whisky = await prisma.drink.create({
    data: {
      name: 'Whisky',
      brand: 'Johnnie Walker Black',
      sku: 'DRINK-WHISKY-001',
      drinkType: DrinkType.alcoholic,
      volume: 750,
    },
  });

  const jugoNaranja = await prisma.drink.create({
    data: {
      name: 'Jugo de Naranja',
      brand: 'Fresh',
      sku: 'DRINK-JUGO-NAR-001',
      drinkType: DrinkType.non_alcoholic,
      volume: 1000,
    },
  });

  const jugoLimon = await prisma.drink.create({
    data: {
      name: 'Jugo de Limón',
      brand: 'Fresh',
      sku: 'DRINK-JUGO-LIM-001',
      drinkType: DrinkType.non_alcoholic,
      volume: 500,
    },
  });

  const tonicWater = await prisma.drink.create({
    data: {
      name: 'Agua Tónica',
      brand: 'Schweppes',
      sku: 'DRINK-TONICA-001',
      drinkType: DrinkType.non_alcoholic,
      volume: 500,
    },
  });

  const cola = await prisma.drink.create({
    data: {
      name: 'Cola',
      brand: 'Coca-Cola',
      sku: 'DRINK-COLA-001',
      drinkType: DrinkType.non_alcoholic,
      volume: 500,
    },
  });

  console.log(`   ✅ Created ${9} drinks`);

  // ============= COCKTAILS =============
  console.log('🍹 Creating cocktails...');
  const screwdriver = await prisma.cocktail.create({
    data: {
      name: 'Screwdriver',
      description: 'Clásico vodka con jugo de naranja',
      sku: 'SCREW001',
      price: 1500,
      volume: 300,
      isActive: true,
      isCombo: false,
    },
  });

  const mojito = await prisma.cocktail.create({
    data: {
      name: 'Mojito',
      description: 'Ron, menta, lima y soda',
      sku: 'MOJ001',
      price: 1800,
      volume: 350,
      isActive: true,
      isCombo: false,
    },
  });

  const margarita = await prisma.cocktail.create({
    data: {
      name: 'Margarita',
      description: 'Tequila, triple sec y lima',
      sku: 'MARG001',
      price: 2000,
      volume: 300,
      isActive: true,
      isCombo: false,
    },
  });

  const ginTonic = await prisma.cocktail.create({
    data: {
      name: 'Gin Tonic',
      description: 'Gin premium con tónica',
      sku: 'GT001',
      price: 1600,
      volume: 400,
      isActive: true,
      isCombo: false,
    },
  });

  const cubaLibre = await prisma.cocktail.create({
    data: {
      name: 'Cuba Libre',
      description: 'Ron con coca cola y lima',
      sku: 'CUBA001',
      price: 1400,
      volume: 350,
      isActive: true,
      isCombo: false,
    },
  });

  const whiskyOnTheRocks = await prisma.cocktail.create({
    data: {
      name: 'Whisky on the Rocks',
      description: 'Whisky servido con hielo',
      sku: 'WHIS001',
      price: 2500,
      volume: 200,
      isActive: true,
      isCombo: false,
    },
  });

  // Additional cocktails for variety
  const tequilaSunrise = await prisma.cocktail.create({
    data: {
      name: 'Tequila Sunrise',
      description: 'Tequila con jugo de naranja y granadina',
      sku: 'TEQ001',
      price: 1900,
      volume: 350,
      isActive: true,
      isCombo: false,
    },
  });

  const vodkaTonic = await prisma.cocktail.create({
    data: {
      name: 'Vodka Tonic',
      description: 'Vodka con agua tónica',
      sku: 'VT001',
      price: 1500,
      volume: 350,
      isActive: true,
      isCombo: false,
    },
  });

  const ronCola = await prisma.cocktail.create({
    data: {
      name: 'Ron Cola',
      description: 'Ron con coca cola',
      sku: 'RC001',
      price: 1300,
      volume: 350,
      isActive: true,
      isCombo: false,
    },
  });

  const daiquiri = await prisma.cocktail.create({
    data: {
      name: 'Daiquiri',
      description: 'Ron con lima y azúcar',
      sku: 'DAI001',
      price: 1700,
      volume: 280,
      isActive: true,
      isCombo: false,
    },
  });

  const cosmopolitan = await prisma.cocktail.create({
    data: {
      name: 'Cosmopolitan',
      description: 'Vodka con cointreau, lima y arándano',
      sku: 'COS001',
      price: 2200,
      volume: 280,
      isActive: true,
      isCombo: false,
    },
  });

  // Non-alcoholic drinks
  const aguaMineral = await prisma.cocktail.create({
    data: {
      name: 'Agua Mineral',
      description: 'Agua mineral 500ml',
      sku: 'AGUA001',
      price: 500,
      volume: 500,
      isActive: true,
      isCombo: false,
    },
  });

  const jugoNaranjaVaso = await prisma.cocktail.create({
    data: {
      name: 'Jugo de Naranja',
      description: 'Jugo de naranja natural',
      sku: 'JN001',
      price: 800,
      volume: 350,
      isActive: true,
      isCombo: false,
    },
  });

  const gaseosa = await prisma.cocktail.create({
    data: {
      name: 'Gaseosa',
      description: 'Coca-Cola, Sprite o Fanta',
      sku: 'GAS001',
      price: 600,
      volume: 350,
      isActive: true,
      isCombo: false,
    },
  });

  const limonada = await prisma.cocktail.create({
    data: {
      name: 'Limonada',
      description: 'Limonada casera',
      sku: 'LIM001',
      price: 700,
      volume: 400,
      isActive: true,
      isCombo: false,
    },
  });

  // Combos
  const combo2x1 = await prisma.cocktail.create({
    data: {
      name: 'Combo 2x1 Gin Tonic',
      description: '2 Gin Tonics al precio de uno y medio',
      sku: 'COMBO001',
      price: 2800,
      volume: 800,
      isActive: true,
      isCombo: true,
    },
  });

  const comboFiesta = await prisma.cocktail.create({
    data: {
      name: 'Combo Fiesta',
      description: '4 tragos variados para compartir',
      sku: 'COMBO002',
      price: 5500,
      volume: 1400,
      isActive: true,
      isCombo: true,
    },
  });

  console.log(`   ✅ Created ${17} cocktails`);

  // ============= EVENTS =============
  console.log('🎉 Creating events...');
  
  // Evento futuro (permite modificar recetas y precios)
  const futureEvent = await prisma.event.create({
    data: {
      name: 'Rock Festival 2030',
      description: 'El festival de rock más grande de Argentina',
      startedAt: new Date('2030-06-15T18:00:00Z'),
      finishedAt: new Date('2030-06-16T04:00:00Z'),
      stockDepletionPolicy: StockDepletionPolicy.cheapest_first, // Optimize costs
      ownerId: owner.id,
      venueId: venue1.id,
    },
  });

  // Evento que ya inició (NO permite modificar recetas ni precios)
  const ongoingEvent = await prisma.event.create({
    data: {
      name: 'Fiesta de Año Nuevo 2026',
      description: 'Celebración de fin de año',
      startedAt: new Date('2026-01-01T00:00:00Z'),
      finishedAt: new Date('2026-01-01T06:00:00Z'),
      stockDepletionPolicy: StockDepletionPolicy.consignment_last, // Return consignment first
      ownerId: owner.id,
      venueId: venue2.id,
    },
  });

  console.log(`   ✅ Created events:`);
  console.log(`      - ${futureEvent.name} (ID: ${futureEvent.id}) - FUTURO ✏️ editable`);
  console.log(`      - ${ongoingEvent.name} (ID: ${ongoingEvent.id}) - INICIADO 🔒 locked`);

  // ============= BARS =============
  console.log('🍸 Creating bars...');
  
  // Bars para evento futuro
  const vipBar1 = await prisma.bar.create({
    data: {
      name: 'VIP Bar Norte',
      type: BarType.VIP,
      status: BarStatus.closed,
      eventId: futureEvent.id,
    },
  });

  const vipBar2 = await prisma.bar.create({
    data: {
      name: 'VIP Bar Sur',
      type: BarType.VIP,
      status: BarStatus.closed,
      eventId: futureEvent.id,
    },
  });

  const generalBar1 = await prisma.bar.create({
    data: {
      name: 'Bar General Este',
      type: BarType.general,
      status: BarStatus.closed,
      eventId: futureEvent.id,
    },
  });

  const generalBar2 = await prisma.bar.create({
    data: {
      name: 'Bar General Oeste',
      type: BarType.general,
      status: BarStatus.closed,
      eventId: futureEvent.id,
    },
  });

  const backstageBar = await prisma.bar.create({
    data: {
      name: 'Backstage Bar',
      type: BarType.backstage,
      status: BarStatus.closed,
      eventId: futureEvent.id,
    },
  });

  // Bars para evento en curso
  const ongoingBar = await prisma.bar.create({
    data: {
      name: 'Bar Principal',
      type: BarType.general,
      status: BarStatus.open,
      eventId: ongoingEvent.id,
    },
  });

  const ongoingBar2 = await prisma.bar.create({
    data: {
      name: 'Bar Terraza',
      type: BarType.VIP,
      status: BarStatus.open,
      eventId: ongoingEvent.id,
    },
  });

  console.log(`   ✅ Created ${7} bars across ${2} events`);

  // ============= STOCK (per bar) =============
  console.log('📦 Creating stock (independent per bar)...');
  
  // VIP Bar 1 tiene más stock premium (from supplier1 - purchased)
  await prisma.stock.createMany({
    data: [
      { barId: vipBar1.id, drinkId: vodka.id, supplierId: supplier1.id, quantity: 50, unitCost: 2500, currency: 'ARS', ownershipMode: OwnershipMode.purchased },
      { barId: vipBar1.id, drinkId: whisky.id, supplierId: supplier1.id, quantity: 30, unitCost: 4500, currency: 'ARS', ownershipMode: OwnershipMode.purchased },
      { barId: vipBar1.id, drinkId: gin.id, supplierId: supplier1.id, quantity: 40, unitCost: 3500, currency: 'ARS', ownershipMode: OwnershipMode.purchased },
      { barId: vipBar1.id, drinkId: jugoNaranja.id, supplierId: supplier2.id, quantity: 100, unitCost: 500, currency: 'ARS', ownershipMode: OwnershipMode.purchased },
      { barId: vipBar1.id, drinkId: tonicWater.id, supplierId: supplier2.id, quantity: 80, unitCost: 300, currency: 'ARS', ownershipMode: OwnershipMode.purchased },
    ],
  });

  // VIP Bar 2 tiene diferente stock (mix of suppliers, some consignment)
  await prisma.stock.createMany({
    data: [
      { barId: vipBar2.id, drinkId: vodka.id, supplierId: supplier1.id, quantity: 40, unitCost: 2500, currency: 'ARS', ownershipMode: OwnershipMode.purchased },
      { barId: vipBar2.id, drinkId: whisky.id, supplierId: supplier3.id, quantity: 25, unitCost: 4800, currency: 'ARS', ownershipMode: OwnershipMode.consignment },
      { barId: vipBar2.id, drinkId: tequila.id, supplierId: supplier3.id, quantity: 35, unitCost: 3800, currency: 'ARS', ownershipMode: OwnershipMode.consignment },
      { barId: vipBar2.id, drinkId: jugoLimon.id, supplierId: supplier2.id, quantity: 60, unitCost: 400, currency: 'ARS', ownershipMode: OwnershipMode.purchased },
    ],
  });

  // General Bar 1 (same product from different suppliers!)
  await prisma.stock.createMany({
    data: [
      { barId: generalBar1.id, drinkId: ron.id, supplierId: supplier1.id, quantity: 50, unitCost: 3000, currency: 'ARS', ownershipMode: OwnershipMode.purchased },
      { barId: generalBar1.id, drinkId: ron.id, supplierId: supplier3.id, quantity: 30, unitCost: 2800, currency: 'ARS', ownershipMode: OwnershipMode.consignment },
      { barId: generalBar1.id, drinkId: vodka.id, supplierId: supplier1.id, quantity: 70, unitCost: 2500, currency: 'ARS', ownershipMode: OwnershipMode.purchased },
      { barId: generalBar1.id, drinkId: cola.id, supplierId: supplier2.id, quantity: 200, unitCost: 200, currency: 'ARS', ownershipMode: OwnershipMode.purchased },
      { barId: generalBar1.id, drinkId: jugoNaranja.id, supplierId: supplier2.id, quantity: 150, unitCost: 500, currency: 'ARS', ownershipMode: OwnershipMode.purchased },
    ],
  });

  // General Bar 2
  await prisma.stock.createMany({
    data: [
      { barId: generalBar2.id, drinkId: ron.id, supplierId: supplier1.id, quantity: 60, unitCost: 3000, currency: 'ARS', ownershipMode: OwnershipMode.purchased },
      { barId: generalBar2.id, drinkId: vodka.id, supplierId: supplier1.id, quantity: 50, unitCost: 2500, currency: 'ARS', ownershipMode: OwnershipMode.purchased },
      { barId: generalBar2.id, drinkId: cola.id, supplierId: supplier2.id, quantity: 180, unitCost: 200, currency: 'ARS', ownershipMode: OwnershipMode.purchased },
    ],
  });

  // Backstage (stock exclusivo - mostly consignment)
  await prisma.stock.createMany({
    data: [
      { barId: backstageBar.id, drinkId: whisky.id, supplierId: supplier3.id, quantity: 20, unitCost: 4800, currency: 'ARS', ownershipMode: OwnershipMode.consignment },
      { barId: backstageBar.id, drinkId: gin.id, supplierId: supplier3.id, quantity: 15, unitCost: 3600, currency: 'ARS', ownershipMode: OwnershipMode.consignment },
      { barId: backstageBar.id, drinkId: tequila.id, supplierId: supplier3.id, quantity: 15, unitCost: 3800, currency: 'ARS', ownershipMode: OwnershipMode.consignment },
    ],
  });

  // Stock for ongoing event bars (enough for testing POS checkouts)
  await prisma.stock.createMany({
    data: [
      // Bar Principal - General
      { barId: ongoingBar.id, drinkId: ron.id, supplierId: supplier1.id, quantity: 100000, unitCost: 3000, currency: 'ARS', ownershipMode: OwnershipMode.purchased },
      { barId: ongoingBar.id, drinkId: vodka.id, supplierId: supplier1.id, quantity: 100000, unitCost: 2500, currency: 'ARS', ownershipMode: OwnershipMode.purchased },
      { barId: ongoingBar.id, drinkId: gin.id, supplierId: supplier1.id, quantity: 50000, unitCost: 3500, currency: 'ARS', ownershipMode: OwnershipMode.purchased },
      { barId: ongoingBar.id, drinkId: cola.id, supplierId: supplier2.id, quantity: 200000, unitCost: 200, currency: 'ARS', ownershipMode: OwnershipMode.purchased },
      { barId: ongoingBar.id, drinkId: jugoNaranja.id, supplierId: supplier2.id, quantity: 150000, unitCost: 500, currency: 'ARS', ownershipMode: OwnershipMode.purchased },
      { barId: ongoingBar.id, drinkId: tonicWater.id, supplierId: supplier2.id, quantity: 100000, unitCost: 300, currency: 'ARS', ownershipMode: OwnershipMode.purchased },
      // Bar Terraza - VIP
      { barId: ongoingBar2.id, drinkId: vodka.id, supplierId: supplier1.id, quantity: 80000, unitCost: 2500, currency: 'ARS', ownershipMode: OwnershipMode.purchased },
      { barId: ongoingBar2.id, drinkId: gin.id, supplierId: supplier1.id, quantity: 60000, unitCost: 3500, currency: 'ARS', ownershipMode: OwnershipMode.purchased },
      { barId: ongoingBar2.id, drinkId: ron.id, supplierId: supplier1.id, quantity: 70000, unitCost: 3000, currency: 'ARS', ownershipMode: OwnershipMode.purchased },
      { barId: ongoingBar2.id, drinkId: cola.id, supplierId: supplier2.id, quantity: 150000, unitCost: 200, currency: 'ARS', ownershipMode: OwnershipMode.purchased },
      { barId: ongoingBar2.id, drinkId: jugoNaranja.id, supplierId: supplier2.id, quantity: 100000, unitCost: 500, currency: 'ARS', ownershipMode: OwnershipMode.purchased },
      { barId: ongoingBar2.id, drinkId: tonicWater.id, supplierId: supplier2.id, quantity: 80000, unitCost: 300, currency: 'ARS', ownershipMode: OwnershipMode.purchased },
    ],
  });

  console.log(`   ✅ Created stock entries for all bars`);

  // ============= EVENT RECIPES (new structure) =============
  console.log('📝 Creating event recipes...');

  // Future Event Recipes
  const screwdriverRecipe = await prisma.eventRecipe.create({
    data: {
      eventId: futureEvent.id,
      cocktailName: 'Screwdriver',
      glassVolume: 250,
      hasIce: true,
      barTypes: {
        create: [
          { barType: BarType.VIP },
          { barType: BarType.general },
        ],
      },
      components: {
        create: [
          { drinkId: vodka.id, percentage: 35 },
          { drinkId: jugoNaranja.id, percentage: 65 },
        ],
      },
    },
  });

  const ginTonicRecipe = await prisma.eventRecipe.create({
    data: {
      eventId: futureEvent.id,
      cocktailName: 'Gin Tonic',
      glassVolume: 250,
      hasIce: true,
      barTypes: {
        create: [{ barType: BarType.VIP }],
      },
      components: {
        create: [
          { drinkId: gin.id, percentage: 35 },
          { drinkId: tonicWater.id, percentage: 65 },
        ],
      },
    },
  });

  const cubaLibreRecipe = await prisma.eventRecipe.create({
    data: {
      eventId: futureEvent.id,
      cocktailName: 'Cuba Libre',
      glassVolume: 250,
      hasIce: true,
      barTypes: {
        create: [{ barType: BarType.general }],
      },
      components: {
        create: [
          { drinkId: ron.id, percentage: 30 },
          { drinkId: cola.id, percentage: 70 },
        ],
      },
    },
  });

  const margaritaRecipe = await prisma.eventRecipe.create({
    data: {
      eventId: futureEvent.id,
      cocktailName: 'Margarita',
      glassVolume: 200,
      hasIce: true,
      barTypes: {
        create: [{ barType: BarType.backstage }],
      },
      components: {
        create: [
          { drinkId: tequila.id, percentage: 50 },
          { drinkId: jugoLimon.id, percentage: 50 },
        ],
      },
    },
  });

  const whiskyRecipe = await prisma.eventRecipe.create({
    data: {
      eventId: futureEvent.id,
      cocktailName: 'Whisky on the Rocks',
      glassVolume: 150,
      hasIce: true,
      barTypes: {
        create: [
          { barType: BarType.VIP },
          { barType: BarType.backstage },
        ],
      },
      components: {
        create: [{ drinkId: whisky.id, percentage: 100 }],
      },
    },
  });

  // Ongoing Event Recipes
  const ongoingCubaLibre = await prisma.eventRecipe.create({
    data: {
      eventId: ongoingEvent.id,
      cocktailName: 'Cuba Libre',
      glassVolume: 250,
      hasIce: true,
      barTypes: {
        create: [
          { barType: BarType.general },
          { barType: BarType.VIP },
        ],
      },
      components: {
        create: [
          { drinkId: ron.id, percentage: 35 },
          { drinkId: cola.id, percentage: 65 },
        ],
      },
    },
  });

  const ongoingScrewdriver = await prisma.eventRecipe.create({
    data: {
      eventId: ongoingEvent.id,
      cocktailName: 'Screwdriver',
      glassVolume: 250,
      hasIce: true,
      barTypes: {
        create: [
          { barType: BarType.general },
          { barType: BarType.VIP },
        ],
      },
      components: {
        create: [
          { drinkId: vodka.id, percentage: 35 },
          { drinkId: jugoNaranja.id, percentage: 65 },
        ],
      },
    },
  });

  const ongoingGinTonic = await prisma.eventRecipe.create({
    data: {
      eventId: ongoingEvent.id,
      cocktailName: 'Gin Tonic',
      glassVolume: 250,
      hasIce: true,
      barTypes: {
        create: [
          { barType: BarType.general },
          { barType: BarType.VIP },
        ],
      },
      components: {
        create: [
          { drinkId: gin.id, percentage: 35 },
          { drinkId: tonicWater.id, percentage: 65 },
        ],
      },
    },
  });

  const ongoingVodkaTonic = await prisma.eventRecipe.create({
    data: {
      eventId: ongoingEvent.id,
      cocktailName: 'Vodka Tonic',
      glassVolume: 250,
      hasIce: true,
      barTypes: {
        create: [
          { barType: BarType.general },
          { barType: BarType.VIP },
        ],
      },
      components: {
        create: [
          { drinkId: vodka.id, percentage: 35 },
          { drinkId: tonicWater.id, percentage: 65 },
        ],
      },
    },
  });

  const ongoingRonCola = await prisma.eventRecipe.create({
    data: {
      eventId: ongoingEvent.id,
      cocktailName: 'Ron Cola',
      glassVolume: 250,
      hasIce: true,
      barTypes: {
        create: [
          { barType: BarType.general },
          { barType: BarType.VIP },
        ],
      },
      components: {
        create: [
          { drinkId: ron.id, percentage: 35 },
          { drinkId: cola.id, percentage: 65 },
        ],
      },
    },
  });

  console.log(`   ✅ Created event recipes with bar types and components`);

  // ============= EVENT PRICES (shared across event) =============
  console.log('💰 Creating event prices (shared across all bars)...');

  await prisma.eventPrice.createMany({
    data: [
      // Alcoholic
      { eventId: futureEvent.id, cocktailId: screwdriver.id, price: 1800 },
      { eventId: futureEvent.id, cocktailId: ginTonic.id, price: 2000 },
      { eventId: futureEvent.id, cocktailId: cubaLibre.id, price: 1600 },
      { eventId: futureEvent.id, cocktailId: margarita.id, price: 2200 },
      { eventId: futureEvent.id, cocktailId: whiskyOnTheRocks.id, price: 3000 },
      { eventId: futureEvent.id, cocktailId: mojito.id, price: 2100 },
      { eventId: futureEvent.id, cocktailId: tequilaSunrise.id, price: 1900 },
      { eventId: futureEvent.id, cocktailId: vodkaTonic.id, price: 1500 },
      { eventId: futureEvent.id, cocktailId: ronCola.id, price: 1300 },
      { eventId: futureEvent.id, cocktailId: daiquiri.id, price: 1700 },
      { eventId: futureEvent.id, cocktailId: cosmopolitan.id, price: 2200 },
      // Non-alcoholic
      { eventId: futureEvent.id, cocktailId: aguaMineral.id, price: 500 },
      { eventId: futureEvent.id, cocktailId: jugoNaranjaVaso.id, price: 800 },
      { eventId: futureEvent.id, cocktailId: gaseosa.id, price: 600 },
      { eventId: futureEvent.id, cocktailId: limonada.id, price: 700 },
      // Combos
      { eventId: futureEvent.id, cocktailId: combo2x1.id, price: 2800 },
      { eventId: futureEvent.id, cocktailId: comboFiesta.id, price: 5500 },
    ],
  });

  // Precios para evento en curso (locked)
  await prisma.eventPrice.createMany({
    data: [
      { eventId: ongoingEvent.id, cocktailId: cubaLibre.id, price: 1500 },
      { eventId: ongoingEvent.id, cocktailId: screwdriver.id, price: 1700 },
      { eventId: ongoingEvent.id, cocktailId: ginTonic.id, price: 1900 },
      { eventId: ongoingEvent.id, cocktailId: vodkaTonic.id, price: 1400 },
      { eventId: ongoingEvent.id, cocktailId: ronCola.id, price: 1200 },
      { eventId: ongoingEvent.id, cocktailId: aguaMineral.id, price: 500 },
      { eventId: ongoingEvent.id, cocktailId: gaseosa.id, price: 600 },
    ],
  });

  console.log(`   ✅ Created prices for all cocktails`);

  // ============= CATEGORIES =============
  console.log('📂 Creating categories...');

  const alcoholicCategory = await prisma.category.create({
    data: {
      eventId: futureEvent.id,
      name: 'Alcoholic',
      description: 'Bebidas con alcohol',
      sortIndex: 0,
      isActive: true,
    },
  });

  const classicCategory = await prisma.category.create({
    data: {
      eventId: futureEvent.id,
      name: 'Classics',
      description: 'Tragos clásicos',
      sortIndex: 1,
      isActive: true,
    },
  });

  const premiumCategory = await prisma.category.create({
    data: {
      eventId: futureEvent.id,
      name: 'Premium',
      description: 'Bebidas premium',
      sortIndex: 2,
      isActive: true,
    },
  });

  const nonAlcoholicCategory = await prisma.category.create({
    data: {
      eventId: futureEvent.id,
      name: 'Sin Alcohol',
      description: 'Bebidas sin alcohol',
      sortIndex: 3,
      isActive: true,
    },
  });

  const combosCategory = await prisma.category.create({
    data: {
      eventId: futureEvent.id,
      name: 'Combos',
      description: 'Ofertas y combos especiales',
      sortIndex: 4,
      isActive: true,
    },
  });

  // Assign cocktails to categories
  await prisma.cocktailCategory.createMany({
    data: [
      // Alcoholic category
      { categoryId: alcoholicCategory.id, cocktailId: screwdriver.id, sortIndex: 0 },
      { categoryId: alcoholicCategory.id, cocktailId: mojito.id, sortIndex: 1 },
      { categoryId: alcoholicCategory.id, cocktailId: cubaLibre.id, sortIndex: 2 },
      { categoryId: alcoholicCategory.id, cocktailId: vodkaTonic.id, sortIndex: 3 },
      { categoryId: alcoholicCategory.id, cocktailId: ronCola.id, sortIndex: 4 },
      { categoryId: alcoholicCategory.id, cocktailId: tequilaSunrise.id, sortIndex: 5 },
      // Classics category
      { categoryId: classicCategory.id, cocktailId: ginTonic.id, sortIndex: 0 },
      { categoryId: classicCategory.id, cocktailId: margarita.id, sortIndex: 1 },
      { categoryId: classicCategory.id, cocktailId: daiquiri.id, sortIndex: 2 },
      { categoryId: classicCategory.id, cocktailId: cosmopolitan.id, sortIndex: 3 },
      // Premium category
      { categoryId: premiumCategory.id, cocktailId: whiskyOnTheRocks.id, sortIndex: 0 },
      // Non-alcoholic category
      { categoryId: nonAlcoholicCategory.id, cocktailId: aguaMineral.id, sortIndex: 0 },
      { categoryId: nonAlcoholicCategory.id, cocktailId: jugoNaranjaVaso.id, sortIndex: 1 },
      { categoryId: nonAlcoholicCategory.id, cocktailId: gaseosa.id, sortIndex: 2 },
      { categoryId: nonAlcoholicCategory.id, cocktailId: limonada.id, sortIndex: 3 },
      // Combos category
      { categoryId: combosCategory.id, cocktailId: combo2x1.id, sortIndex: 0 },
      { categoryId: combosCategory.id, cocktailId: comboFiesta.id, sortIndex: 1 },
    ],
  });

  // Categories for ongoing event
  const ongoingAlcoholicCategory = await prisma.category.create({
    data: {
      eventId: ongoingEvent.id,
      name: 'Tragos',
      description: 'Bebidas con alcohol',
      sortIndex: 0,
      isActive: true,
    },
  });

  const ongoingNonAlcoholicCategory = await prisma.category.create({
    data: {
      eventId: ongoingEvent.id,
      name: 'Sin Alcohol',
      description: 'Bebidas sin alcohol',
      sortIndex: 1,
      isActive: true,
    },
  });

  await prisma.cocktailCategory.createMany({
    data: [
      { categoryId: ongoingAlcoholicCategory.id, cocktailId: cubaLibre.id, sortIndex: 0 },
      { categoryId: ongoingAlcoholicCategory.id, cocktailId: screwdriver.id, sortIndex: 1 },
      { categoryId: ongoingAlcoholicCategory.id, cocktailId: ginTonic.id, sortIndex: 2 },
      { categoryId: ongoingAlcoholicCategory.id, cocktailId: vodkaTonic.id, sortIndex: 3 },
      { categoryId: ongoingAlcoholicCategory.id, cocktailId: ronCola.id, sortIndex: 4 },
      { categoryId: ongoingNonAlcoholicCategory.id, cocktailId: aguaMineral.id, sortIndex: 0 },
      { categoryId: ongoingNonAlcoholicCategory.id, cocktailId: gaseosa.id, sortIndex: 1 },
    ],
  });

  console.log(`   ✅ Created ${7} categories with cocktail assignments`);

  // ============= HISTORICAL SALES (for ongoing event) =============
  console.log('📈 Creating historical sales and inventory movements...');

  // Helper to create sale with inventory movement
  const createHistoricalSale = async (
    barId: number,
    cocktailId: number,
    quantity: number,
    createdAt: Date,
    drinkDepletions: { drinkId: number; supplierId: number; quantity: number }[],
  ) => {
    const sale = await prisma.sale.create({
      data: {
        barId,
        cocktailId,
        quantity,
        createdAt,
      },
    });

    // Create inventory movements for this sale
    for (const depletion of drinkDepletions) {
      await prisma.inventoryMovement.create({
        data: {
          barId,
          drinkId: depletion.drinkId,
          supplierId: depletion.supplierId,
          quantity: -depletion.quantity, // Negative for deduction
          type: MovementType.sale,
          referenceId: sale.id,
          createdAt,
        },
      });
    }

    return sale;
  };

  // Create 20 historical sales for ongoing event at different times
  const baseDate = new Date('2026-01-01T00:30:00Z');
  
  // Sales at Bar Principal (General)
  await createHistoricalSale(ongoingBar.id, cubaLibre.id, 2, new Date(baseDate.getTime() + 0 * 60000), [
    { drinkId: ron.id, supplierId: supplier1.id, quantity: 210 }, // 30% of 350ml * 2
    { drinkId: cola.id, supplierId: supplier2.id, quantity: 490 }, // 70% of 350ml * 2
  ]);
  
  await createHistoricalSale(ongoingBar.id, screwdriver.id, 3, new Date(baseDate.getTime() + 15 * 60000), [
    { drinkId: vodka.id, supplierId: supplier1.id, quantity: 270 }, // 30% of 300ml * 3
    { drinkId: jugoNaranja.id, supplierId: supplier2.id, quantity: 630 }, // 70% of 300ml * 3
  ]);

  await createHistoricalSale(ongoingBar.id, ginTonic.id, 1, new Date(baseDate.getTime() + 30 * 60000), [
    { drinkId: gin.id, supplierId: supplier1.id, quantity: 120 }, // 30% of 400ml
    { drinkId: tonicWater.id, supplierId: supplier2.id, quantity: 280 }, // 70% of 400ml
  ]);

  await createHistoricalSale(ongoingBar.id, cubaLibre.id, 4, new Date(baseDate.getTime() + 45 * 60000), [
    { drinkId: ron.id, supplierId: supplier1.id, quantity: 420 },
    { drinkId: cola.id, supplierId: supplier2.id, quantity: 980 },
  ]);

  await createHistoricalSale(ongoingBar.id, vodkaTonic.id, 2, new Date(baseDate.getTime() + 60 * 60000), [
    { drinkId: vodka.id, supplierId: supplier1.id, quantity: 210 },
    { drinkId: tonicWater.id, supplierId: supplier2.id, quantity: 490 },
  ]);

  await createHistoricalSale(ongoingBar.id, ronCola.id, 5, new Date(baseDate.getTime() + 75 * 60000), [
    { drinkId: ron.id, supplierId: supplier1.id, quantity: 525 },
    { drinkId: cola.id, supplierId: supplier2.id, quantity: 1225 },
  ]);

  await createHistoricalSale(ongoingBar.id, screwdriver.id, 2, new Date(baseDate.getTime() + 90 * 60000), [
    { drinkId: vodka.id, supplierId: supplier1.id, quantity: 180 },
    { drinkId: jugoNaranja.id, supplierId: supplier2.id, quantity: 420 },
  ]);

  await createHistoricalSale(ongoingBar.id, ginTonic.id, 3, new Date(baseDate.getTime() + 105 * 60000), [
    { drinkId: gin.id, supplierId: supplier1.id, quantity: 360 },
    { drinkId: tonicWater.id, supplierId: supplier2.id, quantity: 840 },
  ]);

  await createHistoricalSale(ongoingBar.id, cubaLibre.id, 2, new Date(baseDate.getTime() + 120 * 60000), [
    { drinkId: ron.id, supplierId: supplier1.id, quantity: 210 },
    { drinkId: cola.id, supplierId: supplier2.id, quantity: 490 },
  ]);

  await createHistoricalSale(ongoingBar.id, vodkaTonic.id, 1, new Date(baseDate.getTime() + 135 * 60000), [
    { drinkId: vodka.id, supplierId: supplier1.id, quantity: 105 },
    { drinkId: tonicWater.id, supplierId: supplier2.id, quantity: 245 },
  ]);

  // Sales at Bar Terraza (VIP) - slightly different times and proportions
  await createHistoricalSale(ongoingBar2.id, screwdriver.id, 2, new Date(baseDate.getTime() + 10 * 60000), [
    { drinkId: vodka.id, supplierId: supplier1.id, quantity: 240 }, // 40% of 300ml * 2 (VIP recipe)
    { drinkId: jugoNaranja.id, supplierId: supplier2.id, quantity: 360 }, // 60% of 300ml * 2
  ]);

  await createHistoricalSale(ongoingBar2.id, ginTonic.id, 4, new Date(baseDate.getTime() + 25 * 60000), [
    { drinkId: gin.id, supplierId: supplier1.id, quantity: 560 }, // 35% of 400ml * 4
    { drinkId: tonicWater.id, supplierId: supplier2.id, quantity: 1040 }, // 65% of 400ml * 4
  ]);

  await createHistoricalSale(ongoingBar2.id, cubaLibre.id, 3, new Date(baseDate.getTime() + 50 * 60000), [
    { drinkId: ron.id, supplierId: supplier1.id, quantity: 420 }, // 40% of 350ml * 3
    { drinkId: cola.id, supplierId: supplier2.id, quantity: 630 }, // 60% of 350ml * 3
  ]);

  await createHistoricalSale(ongoingBar2.id, vodkaTonic.id, 2, new Date(baseDate.getTime() + 70 * 60000), [
    { drinkId: vodka.id, supplierId: supplier1.id, quantity: 245 },
    { drinkId: tonicWater.id, supplierId: supplier2.id, quantity: 455 },
  ]);

  await createHistoricalSale(ongoingBar2.id, screwdriver.id, 1, new Date(baseDate.getTime() + 85 * 60000), [
    { drinkId: vodka.id, supplierId: supplier1.id, quantity: 120 },
    { drinkId: jugoNaranja.id, supplierId: supplier2.id, quantity: 180 },
  ]);

  await createHistoricalSale(ongoingBar2.id, ginTonic.id, 2, new Date(baseDate.getTime() + 100 * 60000), [
    { drinkId: gin.id, supplierId: supplier1.id, quantity: 280 },
    { drinkId: tonicWater.id, supplierId: supplier2.id, quantity: 520 },
  ]);

  await createHistoricalSale(ongoingBar2.id, cubaLibre.id, 5, new Date(baseDate.getTime() + 115 * 60000), [
    { drinkId: ron.id, supplierId: supplier1.id, quantity: 700 },
    { drinkId: cola.id, supplierId: supplier2.id, quantity: 1050 },
  ]);

  await createHistoricalSale(ongoingBar2.id, ronCola.id, 3, new Date(baseDate.getTime() + 130 * 60000), [
    { drinkId: ron.id, supplierId: supplier1.id, quantity: 420 },
    { drinkId: cola.id, supplierId: supplier2.id, quantity: 630 },
  ]);

  await createHistoricalSale(ongoingBar2.id, vodkaTonic.id, 4, new Date(baseDate.getTime() + 145 * 60000), [
    { drinkId: vodka.id, supplierId: supplier1.id, quantity: 490 },
    { drinkId: tonicWater.id, supplierId: supplier2.id, quantity: 910 },
  ]);

  await createHistoricalSale(ongoingBar2.id, screwdriver.id, 2, new Date(baseDate.getTime() + 160 * 60000), [
    { drinkId: vodka.id, supplierId: supplier1.id, quantity: 240 },
    { drinkId: jugoNaranja.id, supplierId: supplier2.id, quantity: 360 },
  ]);

  console.log(`   ✅ Created 20 historical sales with inventory movements`);

  // ============= SUMMARY =============
  console.log('\n' + '='.repeat(60));
  console.log('🎉 SEED COMPLETED SUCCESSFULLY!');
  console.log('='.repeat(60));
  console.log('\n📊 Summary:');
  console.log(`   👤 Users: 5`);
  console.log(`      - Owner/Manager: ${owner.email} (ID: ${owner.id})`);
  console.log(`      - Cashier: ${cashier.email} (ID: ${cashier.id})`);
  console.log(`      - Cashier 2: ${cashier2.email} (ID: ${cashier2.id})`);
  console.log(`      - Admin: ${admin.email} (ID: ${admin.id})`);
  console.log(`      - Manager 2: ${manager2.email} (ID: ${manager2.id})`);
  console.log(`   🏟️  Venues: 2`);
  console.log(`   🎉 Events: 2`);
  console.log(`      - Future Event ID: ${futureEvent.id} (editable ✏️)`);
  console.log(`      - Ongoing Event ID: ${ongoingEvent.id} (for POS testing 🛒)`);
  console.log(`   🍸 Bars: 7`);
  console.log(`   🍺 Drinks: 9`);
  console.log(`   🍹 Cocktails: 17`);
  console.log(`   📂 Categories: 7 (Alcoholic, Classics, Premium, Sin Alcohol, Combos + Ongoing)`);
  console.log(`   📝 Recipes: per bar type (VIP, General, Backstage)`);
  console.log(`   💰 Prices: ${17} for future event, ${7} for ongoing event`);
  console.log(`   📈 Historical Sales: 20 (for dashboard/reports testing)`);
  console.log('\n🔑 Login credentials (password: password123):');
  console.log(`   - ${owner.email} (manager - can modify)`);
  console.log(`   - ${cashier.email} (cashier - POS access)`);
  console.log(`   - ${cashier2.email} (cashier - POS access)`);
  console.log(`   - ${admin.email} (admin)`);
  console.log('\n📡 POS API endpoints (Ongoing Event):');
  console.log(`   GET  http://localhost:3000/events/${ongoingEvent.id}/pos/catalog`);
  console.log(`   POST http://localhost:3000/events/${ongoingEvent.id}/pos/checkout`);
  console.log('\n📡 Example checkout body:');
  console.log(`   {`);
  console.log(`     "barId": ${ongoingBar.id},`);
  console.log(`     "items": [`);
  console.log(`       { "cocktailId": ${cubaLibre.id}, "quantity": 2 },`);
  console.log(`       { "cocktailId": ${screwdriver.id}, "quantity": 1 }`);
  console.log(`     ]`);
  console.log(`   }`);
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
