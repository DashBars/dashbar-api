import { Module } from '@nestjs/common';
import { POSController } from './pos.controller';
import { POSService } from './pos.service';
import { CatalogModule } from '../catalog/catalog.module';
import { SalesModule } from '../sales/sales.module';
import { BarsModule } from '../bars/bars.module';

@Module({
  imports: [CatalogModule, SalesModule, BarsModule],
  controllers: [POSController],
  providers: [POSService],
  exports: [POSService],
})
export class POSModule {}
