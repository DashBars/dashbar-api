import { Module } from '@nestjs/common';
import { BarsController } from './bars.controller';
import { BarsService } from './bars.service';
import { BarsRepository } from './bars.repository';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  controllers: [BarsController],
  providers: [BarsService, BarsRepository],
  exports: [BarsService],
})
export class BarsModule {}
