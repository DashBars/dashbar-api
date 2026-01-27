import { Module } from '@nestjs/common';
import { GlobalInventoryController } from './global-inventory.controller';
import { GlobalInventoryService } from './global-inventory.service';
import { GlobalInventoryRepository } from './global-inventory.repository';
import { PrismaModule } from '../prisma/prisma.module';
import { DrinksModule } from '../drinks/drinks.module';
import { SuppliersModule } from '../suppliers/suppliers.module';

@Module({
  imports: [PrismaModule, DrinksModule, SuppliersModule],
  controllers: [GlobalInventoryController],
  providers: [GlobalInventoryService, GlobalInventoryRepository],
  exports: [GlobalInventoryService, GlobalInventoryRepository],
})
export class GlobalInventoryModule {}
