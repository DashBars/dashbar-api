import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { StockService } from './stock.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@prisma/client';

@Controller('events/:eventId/stock')
export class EventStockController {
  constructor(private readonly stockService: StockService) {}

  /**
   * Get unique drinks available across all bars of a given type in an event.
   * Used for recipe creation — aggregates stock (only non-direct-sale) from all bars of that type.
   */
  @Get('drinks-by-type/:barType')
  getDrinksByBarType(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barType') barType: string,
    @CurrentUser() user: User,
  ) {
    return this.stockService.getDrinksByBarType(eventId, barType, user.id);
  }
}
