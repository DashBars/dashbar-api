import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';
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

  // Clean existing users
  console.log('🧹 Cleaning existing users...');
  await prisma.user.deleteMany();

  // ============= USERS =============
  console.log('👤 Creating test users...');
  
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

  // ============= SUMMARY =============
  console.log('\n' + '='.repeat(50));
  console.log('🎉 SEED COMPLETED!');
  console.log('='.repeat(50));
  console.log('\n🔑 Test credentials (password: password123):');
  console.log(`   Manager: ${owner.email}`);
  console.log(`   Cashier: ${cashier.email}`);
  console.log(`   Admin:   ${admin.email}`);
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
