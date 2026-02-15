import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
  ParseBoolPipe,
} from '@nestjs/common';
import { AlarmsService } from './alarms.service';
import { CreateThresholdDto, UpdateThresholdDto } from './dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, AlertStatus } from '@prisma/client';

@Controller('events/:eventId')
export class AlarmsController {
  constructor(private readonly alarmsService: AlarmsService) {}

  // ============= THRESHOLDS =============

  @Post('thresholds')
  createThreshold(
    @Param('eventId', ParseIntPipe) eventId: number,
    @CurrentUser() user: User,
    @Body() dto: CreateThresholdDto,
  ) {
    return this.alarmsService.createThreshold(eventId, user.id, dto);
  }

  @Get('thresholds')
  findAllThresholds(@Param('eventId', ParseIntPipe) eventId: number) {
    return this.alarmsService.findAllThresholds(eventId);
  }

  @Get('thresholds/:drinkId')
  findThreshold(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('drinkId', ParseIntPipe) drinkId: number,
    @Query('sellAsWholeUnit', ParseBoolPipe) sellAsWholeUnit: boolean,
  ) {
    return this.alarmsService.findThreshold(eventId, drinkId, sellAsWholeUnit);
  }

  @Put('thresholds/:drinkId')
  updateThreshold(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('drinkId', ParseIntPipe) drinkId: number,
    @Query('sellAsWholeUnit', ParseBoolPipe) sellAsWholeUnit: boolean,
    @CurrentUser() user: User,
    @Body() dto: UpdateThresholdDto,
  ) {
    return this.alarmsService.updateThreshold(
      eventId,
      drinkId,
      sellAsWholeUnit,
      user.id,
      dto,
    );
  }

  @Delete('thresholds/:drinkId')
  deleteThreshold(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('drinkId', ParseIntPipe) drinkId: number,
    @Query('sellAsWholeUnit', ParseBoolPipe) sellAsWholeUnit: boolean,
    @CurrentUser() user: User,
  ) {
    return this.alarmsService.deleteThreshold(
      eventId,
      drinkId,
      sellAsWholeUnit,
      user.id,
    );
  }

  // ============= ALERTS =============

  @Get('alerts')
  findAllAlerts(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Query('status') status?: AlertStatus,
  ) {
    return this.alarmsService.findAllAlerts(eventId, status);
  }

  @Get('alerts/:alertId')
  findAlert(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('alertId', ParseIntPipe) alertId: number,
  ) {
    return this.alarmsService.findAlert(eventId, alertId);
  }

  @Patch('alerts/:alertId/acknowledge')
  acknowledgeAlert(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('alertId', ParseIntPipe) alertId: number,
    @CurrentUser() user: User,
  ) {
    return this.alarmsService.acknowledgeAlert(eventId, alertId, user.id);
  }

  @Post('alerts/check')
  forceCheckThresholds(
    @Param('eventId', ParseIntPipe) eventId: number,
    @CurrentUser() user: User,
  ) {
    return this.alarmsService.forceCheckThresholds(eventId, user.id);
  }
}
