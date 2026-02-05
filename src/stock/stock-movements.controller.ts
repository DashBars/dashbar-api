import { Controller, Post, Body } from '@nestjs/common';
import { StockService } from './stock.service';
import { AssignStockDto, MoveStockDto, ReturnStockDto } from './dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { User, UserRole } from '@prisma/client';

@Controller('stock')
export class StockMovementsController {
  constructor(private readonly stockService: StockService) {}

  /**
   * Assign stock from global inventory to a bar
   */
  @Post('assign')
  @Roles(UserRole.manager, UserRole.admin)
  assignStock(@CurrentUser() user: User, @Body() dto: AssignStockDto) {
    return this.stockService.assignStock(user.id, dto);
  }

  /**
   * Move stock between bars in the same event
   */
  @Post('move')
  @Roles(UserRole.manager, UserRole.admin)
  moveStock(@CurrentUser() user: User, @Body() dto: MoveStockDto) {
    return this.stockService.moveStock(user.id, dto);
  }

  /**
   * Return stock from bar to global inventory
   */
  @Post('return')
  @Roles(UserRole.manager, UserRole.admin)
  returnStock(@CurrentUser() user: User, @Body() dto: ReturnStockDto) {
    return this.stockService.returnStock(user.id, dto);
  }
}
