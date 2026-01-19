import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Headers,
} from '@nestjs/common';
import { PricesService } from './prices.service';
import { CreatePriceDto, UpdatePriceDto } from './dto';

@Controller('events/:eventId/prices')
export class PricesController {
  constructor(private readonly pricesService: PricesService) {}

  @Post()
  upsert(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Headers('x-user-id') userId: string,
    @Body() dto: CreatePriceDto,
  ) {
    return this.pricesService.upsert(eventId, parseInt(userId, 10), dto);
  }

  @Post('bulk')
  bulkUpsert(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Headers('x-user-id') userId: string,
    @Body() prices: CreatePriceDto[],
  ) {
    return this.pricesService.bulkUpsert(eventId, parseInt(userId, 10), prices);
  }

  @Get()
  findAll(@Param('eventId', ParseIntPipe) eventId: number) {
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
    @Headers('x-user-id') userId: string,
    @Body() dto: UpdatePriceDto,
  ) {
    return this.pricesService.update(eventId, priceId, parseInt(userId, 10), dto);
  }

  @Delete(':priceId')
  delete(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('priceId', ParseIntPipe) priceId: number,
    @Headers('x-user-id') userId: string,
  ) {
    return this.pricesService.delete(eventId, priceId, parseInt(userId, 10));
  }
}
