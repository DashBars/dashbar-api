import { Module } from '@nestjs/common';
import { ConsignmentController } from './consignment.controller';
import { ConsignmentService } from './consignment.service';
import { ConsignmentRepository } from './consignment.repository';
import { PrismaModule } from '../prisma/prisma.module';
import { BarsModule } from '../bars/bars.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [PrismaModule, BarsModule, EventsModule],
  controllers: [ConsignmentController],
  providers: [ConsignmentService, ConsignmentRepository],
  exports: [ConsignmentService],
})
export class ConsignmentModule {}
