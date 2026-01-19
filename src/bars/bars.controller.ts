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
import { BarsService } from './bars.service';
import { CreateBarDto, UpdateBarDto } from './dto';

@Controller('events/:eventId/bars')
export class BarsController {
  constructor(private readonly barsService: BarsService) {}

  @Post()
  create(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Headers('x-user-id') userId: string,
    @Body() dto: CreateBarDto,
  ) {
    return this.barsService.create(eventId, parseInt(userId, 10), dto);
  }

  @Get()
  findAll(@Param('eventId', ParseIntPipe) eventId: number) {
    return this.barsService.findAllByEvent(eventId);
  }

  @Get(':barId')
  findOne(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
  ) {
    return this.barsService.findOne(eventId, barId);
  }

  @Put(':barId')
  update(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
    @Headers('x-user-id') userId: string,
    @Body() dto: UpdateBarDto,
  ) {
    return this.barsService.update(eventId, barId, parseInt(userId, 10), dto);
  }

  @Delete(':barId')
  delete(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
    @Headers('x-user-id') userId: string,
  ) {
    return this.barsService.delete(eventId, barId, parseInt(userId, 10));
  }
}
