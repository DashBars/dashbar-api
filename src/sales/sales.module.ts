import { Module } from '@nestjs/common';
import {
  SalesController,
  InventoryMovementsController,
  GlobalInventoryMovementsController,
} from './sales.controller';
import { SalesService } from './sales.service';
import { SalesRepository } from './sales.repository';
import { PrismaModule } from '../prisma/prisma.module';
import { BarsModule } from '../bars/bars.module';

@Module({
  imports: [PrismaModule, BarsModule],
  controllers: [SalesController, InventoryMovementsController, GlobalInventoryMovementsController],
  providers: [SalesService, SalesRepository],
  exports: [SalesService],
})
export class SalesModule {}
