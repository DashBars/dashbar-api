import { Module } from '@nestjs/common';
import { AlarmsController } from './alarms.controller';
import { AlarmsService } from './alarms.service';
import { AlarmsRepository } from './alarms.repository';
import { PrismaModule } from '../prisma/prisma.module';
import { EventsModule } from '../events/events.module';
import { BarsModule } from '../bars/bars.module';

@Module({
  imports: [PrismaModule, EventsModule, BarsModule],
  controllers: [AlarmsController],
  providers: [AlarmsService, AlarmsRepository],
  exports: [AlarmsService],
})
export class AlarmsModule {}
