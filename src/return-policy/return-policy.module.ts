import { Module } from '@nestjs/common';
import { ReturnPolicyController } from './return-policy.controller';
import { ReturnPolicyService } from './return-policy.service';
import { ReturnPolicyRepository } from './return-policy.repository';
import { PrismaModule } from '../prisma/prisma.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [PrismaModule, EventsModule],
  controllers: [ReturnPolicyController],
  providers: [ReturnPolicyService, ReturnPolicyRepository],
  exports: [ReturnPolicyService, ReturnPolicyRepository],
})
export class ReturnPolicyModule {}
