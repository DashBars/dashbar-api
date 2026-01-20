import { Module } from '@nestjs/common';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';
import { StockRepository } from './stock.repository';
import { BarsModule } from '../bars/bars.module';
import { EventsModule } from '../events/events.module';
import { SuppliersModule } from '../suppliers/suppliers.module';

@Module({
  imports: [BarsModule, EventsModule, SuppliersModule],
  controllers: [StockController],
  providers: [StockService, StockRepository],
  exports: [StockService],
})
export class StockModule {}
