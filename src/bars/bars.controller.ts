import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { BarsService } from './bars.service';
import { CreateBarDto, UpdateBarDto } from './dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@prisma/client';

@Controller('events/:eventId/bars')
export class BarsController {
  constructor(private readonly barsService: BarsService) {}

  @Post()
  create(
    @Param('eventId', ParseIntPipe) eventId: number,
    @CurrentUser() user: User,
    @Body() dto: CreateBarDto,
  ) {
    return this.barsService.create(eventId, user.id, dto);
  }

  @Get()
  findAll(
    @Param('eventId', ParseIntPipe) eventId: number,
    @CurrentUser() user: User,
  ) {
    return this.barsService.findAllByEvent(eventId, user.id);
  }

  @Get(':barId')
  findOne(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
    @CurrentUser() user: User,
  ) {
    return this.barsService.findOne(eventId, barId, user.id);
  }

  @Put(':barId')
  update(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
    @CurrentUser() user: User,
    @Body() dto: UpdateBarDto,
  ) {
    return this.barsService.update(eventId, barId, user.id, dto);
  }

  @Delete(':barId')
  delete(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
    @CurrentUser() user: User,
  ) {
    return this.barsService.delete(eventId, barId, user.id);
  }
}
