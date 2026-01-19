import 'dotenv/config';
import { PrismaClient, BarType, BarStatus, UserRole, DrinkType, ProviderType } from '@prisma/client';
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
  await prisma.eventRecipe.deleteMany();
  await prisma.eventPrice.deleteMany();
  await prisma.stock.deleteMany();
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

  const admin = await prisma.user.create({
    data: {
      email: 'admin@dashbar.com',
      password: hashedPassword,
      role: UserRole.admin,
    },
  });

  console.log(`   ✅ Created users: ${owner.email}, ${cashier.email}, ${admin.email}`);

  // ============= VENUES =============
  console.log('🏟️  Creating venues...');
  const venue1 = await prisma.venue.create({
    data: {
      name: 'Estadio River Plate',
      description: 'El Monumental - Estadio de River Plate',
      address: 'Av. Figueroa Alcorta 7597',
      city: 'Buenos Aires',
      country: 'Argentina',
      capacity: 84567,
    },
  });

  const venue2 = await prisma.venue.create({
    data: {
      name: 'Luna Park',
      description: 'Estadio cubierto Luna Park',
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

  // ============= DRINKS =============
  console.log('🍺 Creating drinks...');
  const vodka = await prisma.drink.create({
    data: {
      name: 'Vodka',
      brand: 'Absolut',
      drinkType: DrinkType.alcoholic,
      providerType: ProviderType.in_,
      volume: 750,
      value: 2500,
    },
  });

  const ron = await prisma.drink.create({
    data: {
      name: 'Ron',
      brand: 'Havana Club',
      drinkType: DrinkType.alcoholic,
      providerType: ProviderType.in_,
      volume: 750,
      value: 3000,
    },
  });

  const tequila = await prisma.drink.create({
    data: {
      name: 'Tequila',
      brand: 'José Cuervo',
      drinkType: DrinkType.alcoholic,
      providerType: ProviderType.in_,
      volume: 750,
      value: 3500,
    },
  });

  const gin = await prisma.drink.create({
    data: {
      name: 'Gin',
      brand: 'Beefeater',
      drinkType: DrinkType.alcoholic,
      providerType: ProviderType.in_,
      volume: 750,
      value: 2800,
    },
  });

  const whisky = await prisma.drink.create({
    data: {
      name: 'Whisky',
      brand: 'Johnnie Walker Black',
      drinkType: DrinkType.alcoholic,
      providerType: ProviderType.in_,
      volume: 750,
      value: 5000,
    },
  });

  const jugoNaranja = await prisma.drink.create({
    data: {
      name: 'Jugo de Naranja',
      brand: 'Fresh',
      drinkType: DrinkType.non_alcoholic,
      providerType: ProviderType.in_,
      volume: 1000,
      value: 500,
    },
  });

  const jugoLimon = await prisma.drink.create({
    data: {
      name: 'Jugo de Limón',
      brand: 'Fresh',
      drinkType: DrinkType.non_alcoholic,
      providerType: ProviderType.in_,
      volume: 500,
      value: 400,
    },
  });

  const tonicWater = await prisma.drink.create({
    data: {
      name: 'Agua Tónica',
      brand: 'Schweppes',
      drinkType: DrinkType.non_alcoholic,
      providerType: ProviderType.in_,
      volume: 500,
      value: 300,
    },
  });

  const cola = await prisma.drink.create({
    data: {
      name: 'Cola',
      brand: 'Coca-Cola',
      drinkType: DrinkType.non_alcoholic,
      providerType: ProviderType.in_,
      volume: 500,
      value: 250,
    },
  });

  console.log(`   ✅ Created ${9} drinks`);

  // ============= COCKTAILS =============
  console.log('🍹 Creating cocktails...');
  const screwdriver = await prisma.cocktail.create({
    data: {
      name: 'Screwdriver',
      price: 1500,
      volume: 300,
    },
  });

  const mojito = await prisma.cocktail.create({
    data: {
      name: 'Mojito',
      price: 1800,
      volume: 350,
    },
  });

  const margarita = await prisma.cocktail.create({
    data: {
      name: 'Margarita',
      price: 2000,
      volume: 300,
    },
  });

  const ginTonic = await prisma.cocktail.create({
    data: {
      name: 'Gin Tonic',
      price: 1600,
      volume: 400,
    },
  });

  const cubaLibre = await prisma.cocktail.create({
    data: {
      name: 'Cuba Libre',
      price: 1400,
      volume: 350,
    },
  });

  const whiskyOnTheRocks = await prisma.cocktail.create({
    data: {
      name: 'Whisky on the Rocks',
      price: 2500,
      volume: 200,
    },
  });

  console.log(`   ✅ Created ${6} cocktails`);

  // ============= EVENTS =============
  console.log('🎉 Creating events...');
  
  // Evento futuro (permite modificar recetas y precios)
  const futureEvent = await prisma.event.create({
    data: {
      name: 'Rock Festival 2030',
      description: 'El festival de rock más grande de Argentina',
      startedAt: new Date('2030-06-15T18:00:00Z'),
      finishedAt: new Date('2030-06-16T04:00:00Z'),
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

  console.log(`   ✅ Created ${6} bars across ${2} events`);

  // ============= STOCK (per bar) =============
  console.log('📦 Creating stock (independent per bar)...');
  
  // VIP Bar 1 tiene más stock premium
  await prisma.stock.createMany({
    data: [
      { barId: vipBar1.id, drinkId: vodka.id, amount: 50 },
      { barId: vipBar1.id, drinkId: whisky.id, amount: 30 },
      { barId: vipBar1.id, drinkId: gin.id, amount: 40 },
      { barId: vipBar1.id, drinkId: jugoNaranja.id, amount: 100 },
      { barId: vipBar1.id, drinkId: tonicWater.id, amount: 80 },
    ],
  });

  // VIP Bar 2 tiene diferente stock
  await prisma.stock.createMany({
    data: [
      { barId: vipBar2.id, drinkId: vodka.id, amount: 40 },
      { barId: vipBar2.id, drinkId: whisky.id, amount: 25 },
      { barId: vipBar2.id, drinkId: tequila.id, amount: 35 },
      { barId: vipBar2.id, drinkId: jugoLimon.id, amount: 60 },
    ],
  });

  // General Bar 1
  await prisma.stock.createMany({
    data: [
      { barId: generalBar1.id, drinkId: ron.id, amount: 80 },
      { barId: generalBar1.id, drinkId: vodka.id, amount: 70 },
      { barId: generalBar1.id, drinkId: cola.id, amount: 200 },
      { barId: generalBar1.id, drinkId: jugoNaranja.id, amount: 150 },
    ],
  });

  // General Bar 2
  await prisma.stock.createMany({
    data: [
      { barId: generalBar2.id, drinkId: ron.id, amount: 60 },
      { barId: generalBar2.id, drinkId: vodka.id, amount: 50 },
      { barId: generalBar2.id, drinkId: cola.id, amount: 180 },
    ],
  });

  // Backstage (stock exclusivo)
  await prisma.stock.createMany({
    data: [
      { barId: backstageBar.id, drinkId: whisky.id, amount: 20 },
      { barId: backstageBar.id, drinkId: gin.id, amount: 15 },
      { barId: backstageBar.id, drinkId: tequila.id, amount: 15 },
    ],
  });

  console.log(`   ✅ Created stock entries for all bars`);

  // ============= EVENT RECIPES (per bar type) =============
  console.log('📝 Creating event recipes (per bar type)...');

  // Recetas VIP (más premium)
  await prisma.eventRecipe.createMany({
    data: [
      // Screwdriver VIP (40% vodka, 60% jugo naranja)
      { eventId: futureEvent.id, barType: BarType.VIP, cocktailId: screwdriver.id, drinkId: vodka.id, cocktailPercentage: 40 },
      { eventId: futureEvent.id, barType: BarType.VIP, cocktailId: screwdriver.id, drinkId: jugoNaranja.id, cocktailPercentage: 60 },
      // Gin Tonic VIP (35% gin, 65% tonica)
      { eventId: futureEvent.id, barType: BarType.VIP, cocktailId: ginTonic.id, drinkId: gin.id, cocktailPercentage: 35 },
      { eventId: futureEvent.id, barType: BarType.VIP, cocktailId: ginTonic.id, drinkId: tonicWater.id, cocktailPercentage: 65 },
      // Whisky VIP (100% whisky)
      { eventId: futureEvent.id, barType: BarType.VIP, cocktailId: whiskyOnTheRocks.id, drinkId: whisky.id, cocktailPercentage: 100 },
    ],
  });

  // Recetas General (menos premium, más diluido)
  await prisma.eventRecipe.createMany({
    data: [
      // Screwdriver General (30% vodka, 70% jugo naranja) - menos alcohol
      { eventId: futureEvent.id, barType: BarType.general, cocktailId: screwdriver.id, drinkId: vodka.id, cocktailPercentage: 30 },
      { eventId: futureEvent.id, barType: BarType.general, cocktailId: screwdriver.id, drinkId: jugoNaranja.id, cocktailPercentage: 70 },
      // Cuba Libre General
      { eventId: futureEvent.id, barType: BarType.general, cocktailId: cubaLibre.id, drinkId: ron.id, cocktailPercentage: 30 },
      { eventId: futureEvent.id, barType: BarType.general, cocktailId: cubaLibre.id, drinkId: cola.id, cocktailPercentage: 70 },
    ],
  });

  // Recetas Backstage (exclusivas)
  await prisma.eventRecipe.createMany({
    data: [
      // Margarita Backstage
      { eventId: futureEvent.id, barType: BarType.backstage, cocktailId: margarita.id, drinkId: tequila.id, cocktailPercentage: 50 },
      { eventId: futureEvent.id, barType: BarType.backstage, cocktailId: margarita.id, drinkId: jugoLimon.id, cocktailPercentage: 50 },
      // Whisky Backstage
      { eventId: futureEvent.id, barType: BarType.backstage, cocktailId: whiskyOnTheRocks.id, drinkId: whisky.id, cocktailPercentage: 100 },
    ],
  });

  console.log(`   ✅ Created recipes for VIP, General, and Backstage bar types`);

  // ============= EVENT PRICES (shared across event) =============
  console.log('💰 Creating event prices (shared across all bars)...');

  await prisma.eventPrice.createMany({
    data: [
      { eventId: futureEvent.id, cocktailId: screwdriver.id, price: 1800 },
      { eventId: futureEvent.id, cocktailId: ginTonic.id, price: 2000 },
      { eventId: futureEvent.id, cocktailId: cubaLibre.id, price: 1600 },
      { eventId: futureEvent.id, cocktailId: margarita.id, price: 2200 },
      { eventId: futureEvent.id, cocktailId: whiskyOnTheRocks.id, price: 3000 },
      { eventId: futureEvent.id, cocktailId: mojito.id, price: 2100 },
    ],
  });

  // Precios para evento en curso (locked)
  await prisma.eventPrice.createMany({
    data: [
      { eventId: ongoingEvent.id, cocktailId: cubaLibre.id, price: 1500 },
      { eventId: ongoingEvent.id, cocktailId: screwdriver.id, price: 1700 },
    ],
  });

  console.log(`   ✅ Created prices for all cocktails`);

  // ============= SUMMARY =============
  console.log('\n' + '='.repeat(60));
  console.log('🎉 SEED COMPLETED SUCCESSFULLY!');
  console.log('='.repeat(60));
  console.log('\n📊 Summary:');
  console.log(`   👤 Users: 3 (owner ID: ${owner.id}, cashier ID: ${cashier.id})`);
  console.log(`   🏟️  Venues: 2`);
  console.log(`   🎉 Events: 2`);
  console.log(`      - Future Event ID: ${futureEvent.id} (editable ✏️)`);
  console.log(`      - Ongoing Event ID: ${ongoingEvent.id} (locked 🔒)`);
  console.log(`   🍸 Bars: 6`);
  console.log(`   🍺 Drinks: 9`);
  console.log(`   🍹 Cocktails: 6`);
  console.log(`   📝 Recipes: per bar type (VIP, General, Backstage)`);
  console.log(`   💰 Prices: shared per event`);
  console.log('\n🔑 Test with these headers:');
  console.log(`   x-user-id: ${owner.id}  (owner - can modify)`);
  console.log(`   x-user-id: ${cashier.id}  (cashier - cannot modify)`);
  console.log('\n📡 Example API calls:');
  console.log(`   GET  http://localhost:3000/events/${futureEvent.id}/bars`);
  console.log(`   GET  http://localhost:3000/events/${futureEvent.id}/recipes?barType=VIP`);
  console.log(`   GET  http://localhost:3000/events/${futureEvent.id}/prices`);
  console.log(`   POST http://localhost:3000/events/${futureEvent.id}/bars -H "x-user-id: ${owner.id}"`);
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
