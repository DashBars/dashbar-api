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
import { UpsertStockDto, BulkUpsertStockDto } from './dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@prisma/client';

@Controller('events/:eventId/bars/:barId/stock')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get()
  findAll(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
  ) {
    return this.stockService.findAllByBar(eventId, barId);
  }

  @Post()
  upsert(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
    @CurrentUser() user: User,
    @Body() dto: UpsertStockDto,
  ) {
    return this.stockService.upsert(eventId, barId, user.id, dto);
  }

  @Post('bulk')
  bulkUpsert(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
    @CurrentUser() user: User,
    @Body() dto: BulkUpsertStockDto,
  ) {
    return this.stockService.bulkUpsert(eventId, barId, user.id, dto);
  }

  @Delete(':drinkId')
  delete(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
    @Param('drinkId', ParseIntPipe) drinkId: number,
    @CurrentUser() user: User,
  ) {
    return this.stockService.delete(eventId, barId, drinkId, user.id);
  }
}
