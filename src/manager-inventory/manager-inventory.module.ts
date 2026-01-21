import { Module } from '@nestjs/common';
import { ManagerInventoryController } from './manager-inventory.controller';
import { ManagerInventoryService } from './manager-inventory.service';
import { ManagerInventoryRepository } from './manager-inventory.repository';
import { PrismaModule } from '../prisma/prisma.module';
import { EventsModule } from '../events/events.module';
import { BarsModule } from '../bars/bars.module';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { StockModule } from '../stock/stock.module';

@Module({
  imports: [
    PrismaModule,
    EventsModule,
    BarsModule,
    SuppliersModule,
    StockModule,
  ],
  controllers: [ManagerInventoryController],
  providers: [ManagerInventoryService, ManagerInventoryRepository],
  exports: [ManagerInventoryService],
})
export class ManagerInventoryModule {}
