import { Controller, Get, Post, Body, Param, ParseIntPipe } from '@nestjs/common';
import { ReturnPolicyService } from './return-policy.service';
import { CreateReturnPolicyDto } from './dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { User, UserRole } from '@prisma/client';

@Controller('events/:eventId/return-policy')
export class ReturnPolicyController {
  constructor(private readonly returnPolicyService: ReturnPolicyService) {}

  @Get()
  @Roles(UserRole.manager, UserRole.admin)
  getPolicy(
    @Param('eventId', ParseIntPipe) eventId: number,
    @CurrentUser() user: User,
  ) {
    return this.returnPolicyService.findByEventId(eventId, user.id);
  }

  @Post()
  @Roles(UserRole.manager, UserRole.admin)
  upsertPolicy(
    @Param('eventId', ParseIntPipe) eventId: number,
    @CurrentUser() user: User,
    @Body() dto: CreateReturnPolicyDto,
  ) {
    return this.returnPolicyService.upsert(eventId, user.id, dto);
  }
}
