import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { CatalogService } from './catalog.service';

@Controller('events/:eventId/catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  /**
   * Get full catalog for POS (categories + products + prices)
   */
  @Get()
  getCatalog(@Param('eventId', ParseIntPipe) eventId: number) {
    return this.catalogService.getCatalog(eventId);
  }

  /**
   * Get catalog summary (counts only)
   */
  @Get('summary')
  getCatalogSummary(@Param('eventId', ParseIntPipe) eventId: number) {
    return this.catalogService.getCatalogSummary(eventId);
  }
}
