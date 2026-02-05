import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardRepository } from './dashboard.repository';
import { DashboardGateway } from './dashboard.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { EventsModule } from '../events/events.module';
import { AlarmsModule } from '../alarms/alarms.module';

@Module({
  imports: [
    PrismaModule,
    EventsModule,
    forwardRef(() => AlarmsModule),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1d' },
      }),
    }),
  ],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardRepository, DashboardGateway],
  exports: [DashboardService],
})
export class DashboardModule {}
