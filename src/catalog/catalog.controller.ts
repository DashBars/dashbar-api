import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { CatalogService } from './catalog.service';

@Controller('events/:eventId/catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  /**
   * Get full catalog for POS (categories + products + prices).
   * Optional barId: resolves prices per bar (bar override > event default > base).
   */
  @Get()
  getCatalog(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Query('barId') barId?: string,
  ) {
    const barIdNum = barId ? parseInt(barId, 10) : undefined;
    return this.catalogService.getCatalog(
      eventId,
      barIdNum != null && !Number.isNaN(barIdNum) ? barIdNum : undefined,
    );
  }

  /**
   * Get catalog summary (counts only)
   */
  @Get('summary')
  getCatalogSummary(@Param('eventId', ParseIntPipe) eventId: number) {
    return this.catalogService.getCatalogSummary(eventId);
  }
}
