import { Module } from '@nestjs/common';
import { VenuesService } from './venues.service';
import { VenuesRepository } from './venues.repository';
import { VenuesController } from './venues.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [VenuesController],
  providers: [VenuesService, VenuesRepository],
  exports: [VenuesService],
})
export class VenuesModule {}
