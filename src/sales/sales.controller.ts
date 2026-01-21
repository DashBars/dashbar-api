import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@prisma/client';

@Controller('events/:eventId/bars/:barId/sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  /**
   * Create a sale with automatic stock depletion
   */
  @Post()
  create(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
    @Body() dto: CreateSaleDto,
  ) {
    return this.salesService.createSale(eventId, barId, dto);
  }

  /**
   * Get all sales for a bar
   */
  @Get()
  findAll(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
    @CurrentUser() user: User,
  ) {
    return this.salesService.findAllByBar(eventId, barId, user.id);
  }

  /**
   * Get a specific sale
   */
  @Get(':saleId')
  findOne(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
    @Param('saleId', ParseIntPipe) saleId: number,
    @CurrentUser() user: User,
  ) {
    return this.salesService.findOne(eventId, barId, saleId, user.id);
  }

  /**
   * Get inventory movements for a specific sale
   */
  @Get(':saleId/movements')
  getSaleMovements(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
    @Param('saleId', ParseIntPipe) saleId: number,
    @CurrentUser() user: User,
  ) {
    return this.salesService.getSaleMovements(eventId, barId, saleId, user.id);
  }
}

@Controller('events/:eventId/bars/:barId/inventory-movements')
export class InventoryMovementsController {
  constructor(private readonly salesService: SalesService) {}

  /**
   * Get all inventory movements for a bar
   */
  @Get()
  findAll(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
    @CurrentUser() user: User,
  ) {
    return this.salesService.getInventoryMovements(eventId, barId, user.id);
  }
}
