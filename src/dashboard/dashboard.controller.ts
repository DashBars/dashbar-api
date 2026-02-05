import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { TimeSeriesFiltersDto, TopProductsFiltersDto, TotalsFiltersDto } from './dto';

@Controller('events/:eventId')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * Get dashboard totals for an event
   */
  @Get('dashboard/totals')
  async getEventTotals(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Query() filters: TotalsFiltersDto,
  ) {
    return this.dashboardService.getTotals(
      eventId,
      null,
      filters.from ? new Date(filters.from) : null,
      filters.to ? new Date(filters.to) : null,
    );
  }

  /**
   * Get dashboard totals for a specific bar
   */
  @Get('bars/:barId/dashboard/totals')
  async getBarTotals(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
    @Query() filters: TotalsFiltersDto,
  ) {
    return this.dashboardService.getTotals(
      eventId,
      barId,
      filters.from ? new Date(filters.from) : null,
      filters.to ? new Date(filters.to) : null,
    );
  }

  /**
   * Get time-series data for an event
   */
  @Get('dashboard/time-series')
  async getEventTimeSeries(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Query() filters: TimeSeriesFiltersDto,
  ) {
    return this.dashboardService.getTimeSeries(
      eventId,
      null,
      filters.bucket,
      filters.from ? new Date(filters.from) : null,
      filters.to ? new Date(filters.to) : null,
      filters.cocktailId ?? null,
    );
  }

  /**
   * Get time-series data for a specific bar
   */
  @Get('bars/:barId/dashboard/time-series')
  async getBarTimeSeries(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
    @Query() filters: TimeSeriesFiltersDto,
  ) {
    return this.dashboardService.getTimeSeries(
      eventId,
      barId,
      filters.bucket,
      filters.from ? new Date(filters.from) : null,
      filters.to ? new Date(filters.to) : null,
      filters.cocktailId ?? null,
    );
  }

  /**
   * Get top products for an event
   */
  @Get('dashboard/top-products')
  async getEventTopProducts(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Query() filters: TopProductsFiltersDto,
  ) {
    return this.dashboardService.getTopProducts(
      eventId,
      null,
      filters.limit,
      filters.from ? new Date(filters.from) : null,
      filters.to ? new Date(filters.to) : null,
    );
  }

  /**
   * Get top products for a specific bar
   */
  @Get('bars/:barId/dashboard/top-products')
  async getBarTopProducts(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
    @Query() filters: TopProductsFiltersDto,
  ) {
    return this.dashboardService.getTopProducts(
      eventId,
      barId,
      filters.limit,
      filters.from ? new Date(filters.from) : null,
      filters.to ? new Date(filters.to) : null,
    );
  }
}
