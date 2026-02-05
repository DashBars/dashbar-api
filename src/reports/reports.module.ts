import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportsRepository } from './reports.repository';
import { ExportsService } from './exports.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [PrismaModule, EventsModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsRepository, ExportsService],
  exports: [ReportsService, ExportsService],
})
export class ReportsModule {}
