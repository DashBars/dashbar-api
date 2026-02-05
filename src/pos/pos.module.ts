import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { POSController } from './pos.controller';
import { POSService } from './pos.service';
import { PosnetsController } from './posnets.controller';
import { PosnetsService } from './posnets.service';
import { PosnetsRepository } from './posnets.repository';
import { SessionsService } from './sessions.service';
import { SessionsRepository } from './sessions.repository';
import { POSSalesService } from './pos-sales.service';
import { POSSalesRepository } from './pos-sales.repository';
import { MetricsService } from './metrics.service';
import { PosDeviceController } from './pos-device.controller';
import { PosAuthGuard } from './guards/pos-auth.guard';
import { CatalogModule } from '../catalog/catalog.module';
import { SalesModule } from '../sales/sales.module';
import { BarsModule } from '../bars/bars.module';
import { EventsModule } from '../events/events.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    CatalogModule,
    SalesModule,
    BarsModule,
    EventsModule,
    PrismaModule,
    ScheduleModule.forRoot(),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('POS_JWT_SECRET') || 'pos-secret-key',
        signOptions: {
          expiresIn: '15m' as const,
        },
      }),
    }),
  ],
  controllers: [POSController, PosnetsController, PosDeviceController],
  providers: [
    POSService,
    PosnetsService,
    PosnetsRepository,
    SessionsService,
    SessionsRepository,
    POSSalesService,
    POSSalesRepository,
    MetricsService,
    PosAuthGuard,
  ],
  exports: [POSService, PosnetsService, SessionsService, POSSalesService, MetricsService, PosAuthGuard],
})
export class POSModule {}
