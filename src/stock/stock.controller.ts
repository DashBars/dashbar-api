import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Headers,
} from '@nestjs/common';
import { StockService } from './stock.service';
import { UpsertStockDto, BulkUpsertStockDto } from './dto';

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
    @Headers('x-user-id') userId: string,
    @Body() dto: UpsertStockDto,
  ) {
    return this.stockService.upsert(eventId, barId, parseInt(userId, 10), dto);
  }

  @Post('bulk')
  bulkUpsert(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
    @Headers('x-user-id') userId: string,
    @Body() dto: BulkUpsertStockDto,
  ) {
    return this.stockService.bulkUpsert(eventId, barId, parseInt(userId, 10), dto);
  }

  @Delete(':drinkId')
  delete(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
    @Param('drinkId', ParseIntPipe) drinkId: number,
    @Headers('x-user-id') userId: string,
  ) {
    return this.stockService.delete(eventId, barId, drinkId, parseInt(userId, 10));
  }
}
