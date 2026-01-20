import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { ConsignmentService } from './consignment.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { User, UserRole } from '@prisma/client';

class ExecuteReturnDto {
  notes?: string;
}

@Controller('events/:eventId')
export class ConsignmentController {
  constructor(private readonly consignmentService: ConsignmentService) {}

  /**
   * Get consignment return summary for a specific bar
   * Shows what can be returned (system-calculated, non-negotiable)
   */
  @Get('bars/:barId/consignment/summary')
  @Roles(UserRole.manager, UserRole.admin)
  getBarReturnSummary(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
    @CurrentUser() user: User,
  ) {
    return this.consignmentService.getReturnSummary(eventId, barId, user.id);
  }

  /**
   * Get event-wide consignment return summary grouped by supplier
   */
  @Get('consignment/summary')
  @Roles(UserRole.manager, UserRole.admin)
  getEventReturnSummary(
    @Param('eventId', ParseIntPipe) eventId: number,
    @CurrentUser() user: User,
  ) {
    return this.consignmentService.getEventReturnSummary(eventId, user.id);
  }

  /**
   * Execute a consignment return for a specific item
   * The quantity is system-determined (current stock) - manager cannot alter it
   */
  @Post('bars/:barId/consignment/returns/:drinkId/:supplierId/execute')
  @Roles(UserRole.manager, UserRole.admin)
  executeReturn(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
    @Param('drinkId', ParseIntPipe) drinkId: number,
    @Param('supplierId', ParseIntPipe) supplierId: number,
    @CurrentUser() user: User,
    @Body() dto: ExecuteReturnDto,
  ) {
    return this.consignmentService.executeReturn(
      eventId,
      barId,
      drinkId,
      supplierId,
      user.id,
      dto.notes,
    );
  }

  /**
   * Execute all pending consignment returns for a bar
   * Used at event close to return all remaining consignment stock
   */
  @Post('bars/:barId/consignment/returns/execute-all')
  @Roles(UserRole.manager, UserRole.admin)
  executeAllReturns(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
    @CurrentUser() user: User,
  ) {
    return this.consignmentService.executeAllReturns(eventId, barId, user.id);
  }
}
