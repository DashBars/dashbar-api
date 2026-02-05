import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { PricesService } from './prices.service';
import { CreatePriceDto, UpdatePriceDto } from './dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@prisma/client';

@Controller('events/:eventId/prices')
export class PricesController {
  constructor(private readonly pricesService: PricesService) {}

  @Post()
  upsert(
    @Param('eventId', ParseIntPipe) eventId: number,
    @CurrentUser() user: User,
    @Body() dto: CreatePriceDto,
  ) {
    return this.pricesService.upsert(eventId, user.id, dto);
  }

  @Post('bulk')
  bulkUpsert(
    @Param('eventId', ParseIntPipe) eventId: number,
    @CurrentUser() user: User,
    @Body() prices: CreatePriceDto[],
  ) {
    return this.pricesService.bulkUpsert(eventId, user.id, prices);
  }

  @Get()
  findAll(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Query('barId') barId?: string,
  ) {
    const barIdNum = barId ? parseInt(barId, 10) : undefined;
    if (barIdNum != null && !Number.isNaN(barIdNum)) {
      return this.pricesService.findAllByEventAndBar(eventId, barIdNum);
    }
    return this.pricesService.findAllByEvent(eventId);
  }

  @Get('cocktail/:cocktailId')
  findByCocktail(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('cocktailId', ParseIntPipe) cocktailId: number,
  ) {
    return this.pricesService.findByCocktail(eventId, cocktailId);
  }

  @Get(':priceId')
  findOne(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('priceId', ParseIntPipe) priceId: number,
  ) {
    return this.pricesService.findOne(eventId, priceId);
  }

  @Put(':priceId')
  update(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('priceId', ParseIntPipe) priceId: number,
    @CurrentUser() user: User,
    @Body() dto: UpdatePriceDto,
  ) {
    return this.pricesService.update(eventId, priceId, user.id, dto);
  }

  @Delete(':priceId')
  delete(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('priceId', ParseIntPipe) priceId: number,
    @CurrentUser() user: User,
  ) {
    return this.pricesService.delete(eventId, priceId, user.id);
  }
}
