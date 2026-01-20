import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { StockService } from './stock.service';
import { UpsertStockDto, BulkUpsertStockDto, CreateConsignmentReturnDto } from './dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@prisma/client';

@Controller('events/:eventId/bars/:barId/stock')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  /**
   * Get all stock entries for a bar (detailed by supplier)
   */
  @Get()
  findAll(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
  ) {
    return this.stockService.findAllByBar(eventId, barId);
  }

  /**
   * Get stock summary aggregated by product (total across suppliers)
   */
  @Get('summary')
  getSummary(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
  ) {
    return this.stockService.getStockSummary(eventId, barId);
  }

  /**
   * Get stock breakdown by supplier
   */
  @Get('by-supplier')
  getBySupplier(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
  ) {
    return this.stockService.getStockBySupplier(eventId, barId);
  }

  /**
   * Get consignment stock available for return
   */
  @Get('consignment')
  getConsignmentStock(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
  ) {
    return this.stockService.getConsignmentStock(eventId, barId);
  }

  /**
   * Get consignment returns history
   */
  @Get('consignment-returns')
  getConsignmentReturns(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
  ) {
    return this.stockService.getConsignmentReturns(eventId, barId);
  }

  /**
   * Create or update stock entry
   */
  @Post()
  upsert(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
    @CurrentUser() user: User,
    @Body() dto: UpsertStockDto,
  ) {
    return this.stockService.upsert(eventId, barId, user.id, dto);
  }

  /**
   * Bulk create or update stock entries
   */
  @Post('bulk')
  bulkUpsert(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
    @CurrentUser() user: User,
    @Body() dto: BulkUpsertStockDto,
  ) {
    return this.stockService.bulkUpsert(eventId, barId, user.id, dto);
  }

  /**
   * Register a consignment return
   */
  @Post('consignment-return')
  createConsignmentReturn(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
    @CurrentUser() user: User,
    @Body() dto: CreateConsignmentReturnDto,
  ) {
    return this.stockService.createConsignmentReturn(eventId, barId, user.id, dto);
  }

  /**
   * Delete a stock entry
   */
  @Delete(':drinkId/supplier/:supplierId')
  delete(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
    @Param('drinkId', ParseIntPipe) drinkId: number,
    @Param('supplierId', ParseIntPipe) supplierId: number,
    @CurrentUser() user: User,
  ) {
    return this.stockService.delete(eventId, barId, drinkId, supplierId, user.id);
  }
}
