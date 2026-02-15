import { Module } from '@nestjs/common';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';
import { PrismaModule } from '../prisma/prisma.module';
import { POSModule } from '../pos/pos.module';

@Module({
  imports: [PrismaModule, POSModule],
  controllers: [DemoController],
  providers: [DemoService],
})
export class DemoModule {}
