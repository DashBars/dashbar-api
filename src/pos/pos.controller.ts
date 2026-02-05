import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { POSService } from './pos.service';
import { CheckoutDto } from './dto';
import { Roles } from '../auth/decorators';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '@prisma/client';

@Controller('events/:eventId/pos')
export class POSController {
  constructor(private readonly posService: POSService) {}

  /**
   * Get catalog for POS (categories + products + prices).
   * Optional barId: resolves prices for that bar (bar override > event default > base).
   */
  @Get('catalog')
  @Roles(UserRole.cashier, UserRole.manager, UserRole.admin)
  getCatalog(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Query('barId') barId?: string,
  ) {
    const barIdNum = barId ? parseInt(barId, 10) : undefined;
    return this.posService.getCatalog(
      eventId,
      barIdNum != null && !Number.isNaN(barIdNum) ? barIdNum : undefined,
    );
  }

  /**
   * Process checkout with multiple items
   * Returns a receipt with order details
   * Accessible by cashier, manager, and admin
   */
  @Post('checkout')
  @Roles(UserRole.cashier, UserRole.manager, UserRole.admin)
  checkout(
    @Param('eventId', ParseIntPipe) eventId: number,
    @CurrentUser() user: User,
    @Body() dto: CheckoutDto,
  ) {
    return this.posService.checkout(eventId, user.id, dto);
  }
}
