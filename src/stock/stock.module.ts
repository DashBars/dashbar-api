import { Module } from '@nestjs/common';
import { StockController } from './stock.controller';
import { StockMovementsController } from './stock-movements.controller';
import { EventStockController } from './event-stock.controller';
import { StockService } from './stock.service';
import { StockRepository } from './stock.repository';
import { PrismaModule } from '../prisma/prisma.module';
import { BarsModule } from '../bars/bars.module';
import { EventsModule } from '../events/events.module';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { GlobalInventoryModule } from '../global-inventory/global-inventory.module';

@Module({
  imports: [
    PrismaModule,
    BarsModule,
    EventsModule,
    SuppliersModule,
    GlobalInventoryModule,
  ],
  controllers: [StockController, StockMovementsController, EventStockController],
  providers: [StockService, StockRepository],
  exports: [StockService, StockRepository],
})
export class StockModule {}
