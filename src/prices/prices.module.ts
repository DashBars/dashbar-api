import { Module } from '@nestjs/common';
import { PricesController } from './prices.controller';
import { PricesService } from './prices.service';
import { PricesRepository } from './prices.repository';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  controllers: [PricesController],
  providers: [PricesService, PricesRepository],
  exports: [PricesService],
})
export class PricesModule {}
