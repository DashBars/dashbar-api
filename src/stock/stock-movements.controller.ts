import { Controller, Post, Body } from '@nestjs/common';
import { StockService } from './stock.service';
import { AssignStockDto, MoveStockDto, ReturnStockDto, BulkReturnStockDto, DiscardStockDto, BulkDiscardStockDto } from './dto';
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

  /**
   * Return consignment stock from bar to supplier
   * (decrements both totalQuantity and allocatedQuantity in global inventory)
   */
  @Post('return-to-supplier')
  @Roles(UserRole.manager, UserRole.admin)
  returnToSupplier(@CurrentUser() user: User, @Body() dto: ReturnStockDto) {
    return this.stockService.returnToSupplier(user.id, dto);
  }

  /**
   * Bulk return stock from a bar.
   * Modes: to_global, to_supplier, auto (purchased→global, consignment→supplier)
   */
  @Post('bulk-return')
  @Roles(UserRole.manager, UserRole.admin)
  bulkReturnStock(@CurrentUser() user: User, @Body() dto: BulkReturnStockDto) {
    return this.stockService.bulkReturnStock(user.id, dto);
  }

  /**
   * Discard a partial stock remainder (less than 1 full unit).
   * Zeros out the stock and logs an adjustment movement.
   */
  @Post('discard')
  @Roles(UserRole.manager, UserRole.admin)
  discardStock(@CurrentUser() user: User, @Body() dto: DiscardStockDto) {
    return this.stockService.discardStock(user.id, dto);
  }

  /**
   * Bulk discard partial stock remainders.
   */
  @Post('bulk-discard')
  @Roles(UserRole.manager, UserRole.admin)
  bulkDiscardStock(@CurrentUser() user: User, @Body() dto: BulkDiscardStockDto) {
    return this.stockService.bulkDiscardStock(user.id, dto);
  }
}
