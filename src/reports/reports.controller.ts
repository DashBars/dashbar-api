import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  Res,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { ExportsService } from './exports.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@prisma/client';
import { GenerateComparisonDto, GenerateReportDto } from './dto';
import * as fs from 'fs';
import * as path from 'path';

@Controller()
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly exportsService: ExportsService,
  ) {}

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
    @Body() dto: GenerateReportDto,
    @CurrentUser() user: User,
  ) {
    return this.reportsService.generateReport(eventId, user.id, {
      bucketSize: dto.bucketSize,
    });
  }

  // ============= EXPORT ENDPOINTS =============

  /**
   * Generate and download CSV export
   */
  @Post('events/:eventId/report/csv')
  async generateCSV(
    @Param('eventId', ParseIntPipe) eventId: number,
    @CurrentUser() user: User,
  ) {
    const filePath = await this.exportsService.generateCSV(eventId, user.id);
    return { path: filePath, message: 'CSV generated successfully' };
  }

  /**
   * Download CSV export
   */
  @Get('events/:eventId/report/csv')
  async downloadCSV(
    @Param('eventId', ParseIntPipe) eventId: number,
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    let filePath = await this.exportsService.getCSVPath(eventId, user.id);
    
    // If no CSV exists, generate it
    if (!filePath || !fs.existsSync(filePath)) {
      filePath = await this.exportsService.generateCSV(eventId, user.id);
    }

    const fileName = path.basename(filePath);
    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    });

    const fileStream = fs.createReadStream(filePath);
    return new StreamableFile(fileStream);
  }

  /**
   * Generate and download PDF export
   */
  @Post('events/:eventId/report/pdf')
  async generatePDF(
    @Param('eventId', ParseIntPipe) eventId: number,
    @CurrentUser() user: User,
  ) {
    const filePath = await this.exportsService.generatePDF(eventId, user.id);
    return { path: filePath, message: 'PDF generated successfully' };
  }

  /**
   * Download PDF export
   */
  @Get('events/:eventId/report/pdf')
  async downloadPDF(
    @Param('eventId', ParseIntPipe) eventId: number,
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    let filePath = await this.exportsService.getPDFPath(eventId, user.id);
    
    // If no PDF exists, generate it
    if (!filePath || !fs.existsSync(filePath)) {
      filePath = await this.exportsService.generatePDF(eventId, user.id);
    }

    const fileName = path.basename(filePath);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    });

    const fileStream = fs.createReadStream(filePath);
    return new StreamableFile(fileStream);
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
