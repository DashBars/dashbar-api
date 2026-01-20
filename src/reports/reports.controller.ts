import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@prisma/client';
import { GenerateComparisonDto } from './dto';

@Controller()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * List all reports for the authenticated user's events
   */
  @Get('reports')
  findAllReports(@CurrentUser() user: User) {
    return this.reportsService.findAllByOwner(user.id);
  }

  /**
   * Get a report for a specific event
   */
  @Get('events/:eventId/report')
  findEventReport(
    @Param('eventId', ParseIntPipe) eventId: number,
    @CurrentUser() user: User,
  ) {
    return this.reportsService.findByEvent(eventId, user.id);
  }

  /**
   * Generate or regenerate a report for an event
   */
  @Post('events/:eventId/report/generate')
  generateReport(
    @Param('eventId', ParseIntPipe) eventId: number,
    @CurrentUser() user: User,
  ) {
    return this.reportsService.generateReport(eventId, user.id);
  }

  // ============= COMPARISON ENDPOINTS =============

  /**
   * List events eligible for comparison (finished events with reports)
   */
  @Get('reports/comparison/eligible')
  findEligibleForComparison(@CurrentUser() user: User) {
    return this.reportsService.findEligibleForComparison(user.id);
  }

  /**
   * Generate comparison report for selected events
   */
  @Post('reports/comparison')
  generateComparison(
    @Body() dto: GenerateComparisonDto,
    @CurrentUser() user: User,
  ) {
    return this.reportsService.generateComparison(dto.eventIds, user.id);
  }
}
