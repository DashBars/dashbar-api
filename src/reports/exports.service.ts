import { Injectable, NotFoundException } from '@nestjs/common';
import { ReportsRepository } from './reports.repository';
import { EventsService } from '../events/events.service';
import { NotOwnerException } from '../common/exceptions';
import { PrismaService } from '../prisma/prisma.service';
import * as PdfPrinter from 'pdfmake';
import { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces';
import { stringify } from 'csv-stringify/sync';
import * as fs from 'fs';
import * as path from 'path';
import {
  ReportData,
  TopProductEntry,
  PeakHourBucketEntry,
  BarBreakdown,
  PosBreakdown,
  StockValuationSummary,
} from './interfaces/report.interface';

// Define fonts for pdfmake (use built-in Roboto)
const fonts = {
  Roboto: {
    normal: 'node_modules/pdfmake/build/vfs_fonts.js',
    bold: 'node_modules/pdfmake/build/vfs_fonts.js',
    italics: 'node_modules/pdfmake/build/vfs_fonts.js',
    bolditalics: 'node_modules/pdfmake/build/vfs_fonts.js',
  },
};

@Injectable()
export class ExportsService {
  private readonly exportDir: string;

  constructor(
    private readonly repository: ReportsRepository,
    private readonly eventsService: EventsService,
    private readonly prisma: PrismaService,
  ) {
    // Create exports directory if it doesn't exist
    this.exportDir = path.join(process.cwd(), 'exports');
    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true });
    }
  }

  /**
   * Generate CSV export for an event report
   */
  async generateCSV(eventId: number, userId: number): Promise<string> {
    const event = await this.eventsService.findByIdWithOwner(eventId);
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    const report = await this.repository.findByEventId(eventId);
    if (!report) {
      throw new NotFoundException(`Report for event ${eventId} not found. Generate it first.`);
    }

    // Parse JSON fields
    const topProducts = report.topProducts as unknown as TopProductEntry[];
    const peakHours5min = (report.peakHours5min as unknown as PeakHourBucketEntry[]) || [];
    const peakHours15min = (report.peakHours15min as unknown as PeakHourBucketEntry[]) || [];
    const peakHours60min = (report.peakHours60min as unknown as PeakHourBucketEntry[]) || [];
    const barBreakdowns = (report.barBreakdowns as unknown as BarBreakdown[]) || [];
    const posBreakdowns = (report.posBreakdowns as unknown as PosBreakdown[]) || [];
    const stockValuation = report.stockValuation as unknown as StockValuationSummary;

    // Build CSV sections
    const sections: string[] = [];

    // Section 1: Summary
    sections.push('=== RESUMEN DEL EVENTO ===');
    sections.push(stringify([
      ['Métrica', 'Valor'],
      ['Evento', event.name],
      ['Fecha de generación', report.generatedAt.toISOString()],
      ['Ingresos totales', this.formatCurrency(report.totalRevenue)],
      ['Costo de ventas (COGS)', this.formatCurrency(report.totalCOGS)],
      ['Ganancia bruta', this.formatCurrency(report.grossProfit)],
      ['Margen (%)', `${this.calculateMargin(report.totalRevenue, report.grossProfit)}%`],
      ['Unidades vendidas', report.totalUnitsSold.toString()],
      ['Cantidad de órdenes', report.totalOrderCount.toString()],
      ['Ticket promedio', this.formatCurrency(report.totalOrderCount > 0 ? Math.round(report.totalRevenue / report.totalOrderCount) : 0)],
    ]));

    // Section 2: Top Products
    sections.push('\n=== PRODUCTOS MÁS VENDIDOS ===');
    const topProductsData = [['Producto', 'Unidades', 'Ingresos', '% del total']];
    for (const product of topProducts) {
      topProductsData.push([
        product.name,
        product.unitsSold.toString(),
        this.formatCurrency(product.revenue),
        `${product.sharePercent}%`,
      ]);
    }
    sections.push(stringify(topProductsData));

    // Section 3: Peak Hours (60-min)
    if (peakHours60min.length > 0) {
      sections.push('\n=== HORAS PICO (60 minutos) ===');
      const peakHoursData = [['Hora inicio', 'Hora fin', 'Ventas', 'Ingresos', 'Producto top']];
      for (const entry of peakHours60min.slice(0, 10)) {
        peakHoursData.push([
          this.formatDateTime(entry.startTime),
          this.formatDateTime(entry.endTime),
          entry.salesCount.toString(),
          this.formatCurrency(entry.revenue),
          entry.topProduct || '-',
        ]);
      }
      sections.push(stringify(peakHoursData));
    }

    // Section 4: Peak Hours (15-min)
    if (peakHours15min.length > 0) {
      sections.push('\n=== HORAS PICO (15 minutos) ===');
      const peakHoursData = [['Hora inicio', 'Hora fin', 'Ventas', 'Ingresos', 'Producto top']];
      for (const entry of peakHours15min.slice(0, 20)) {
        peakHoursData.push([
          this.formatDateTime(entry.startTime),
          this.formatDateTime(entry.endTime),
          entry.salesCount.toString(),
          this.formatCurrency(entry.revenue),
          entry.topProduct || '-',
        ]);
      }
      sections.push(stringify(peakHoursData));
    }

    // Section 5: Bar Breakdowns
    if (barBreakdowns.length > 0) {
      sections.push('\n=== DESGLOSE POR BARRA ===');
      const barData = [['Barra', 'Tipo', 'Ingresos', 'COGS', 'Ganancia', 'Margen %', 'Unidades', 'Órdenes', 'Ticket prom.']];
      for (const bar of barBreakdowns) {
        barData.push([
          bar.barName,
          bar.barType,
          this.formatCurrency(bar.totalRevenue),
          this.formatCurrency(bar.totalCOGS),
          this.formatCurrency(bar.grossProfit),
          `${bar.marginPercent}%`,
          bar.totalUnitsSold.toString(),
          bar.totalOrderCount.toString(),
          this.formatCurrency(bar.avgTicketSize),
        ]);
      }
      sections.push(stringify(barData));
    }

    // Section 6: POS Breakdowns
    if (posBreakdowns.length > 0) {
      sections.push('\n=== DESGLOSE POR TERMINAL POS ===');
      const posData = [['Código', 'Nombre', 'Barra', 'Ingresos', 'Transacciones', 'Unidades', 'Ticket prom.']];
      for (const pos of posBreakdowns) {
        posData.push([
          pos.posnetCode,
          pos.posnetName,
          pos.barName,
          this.formatCurrency(pos.totalRevenue),
          pos.totalTransactions.toString(),
          pos.totalUnitsSold.toString(),
          this.formatCurrency(pos.avgTicketSize),
        ]);
      }
      sections.push(stringify(posData));
    }

    // Section 7: Stock Valuation
    if (stockValuation) {
      sections.push('\n=== VALUACIÓN DE STOCK RESTANTE ===');
      sections.push(stringify([
        ['Tipo', 'Valor'],
        ['Valor total', this.formatCurrency(stockValuation.totalValue)],
        ['Stock comprado', this.formatCurrency(stockValuation.purchasedValue)],
        ['Consignación', this.formatCurrency(stockValuation.consignmentValue)],
      ]));

      for (const bar of stockValuation.byBar) {
        sections.push(`\nStock en ${bar.barName}:`);
        const stockData = [['Insumo', 'Cantidad', 'Costo unit.', 'Valor total', 'Tipo']];
        for (const item of bar.items) {
          stockData.push([
            item.drinkName,
            item.quantity.toString(),
            this.formatCurrency(item.unitCost),
            this.formatCurrency(item.value),
            item.ownershipMode === 'purchased' ? 'Comprado' : 'Consignación',
          ]);
        }
        sections.push(stringify(stockData));
      }
    }

    // Write CSV file
    const fileName = `reporte_${event.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.csv`;
    const filePath = path.join(this.exportDir, fileName);
    fs.writeFileSync(filePath, sections.join('\n'), 'utf-8');

    // Update report with CSV path
    await this.prisma.eventReport.update({
      where: { eventId },
      data: { csvPath: filePath },
    });

    return filePath;
  }

  /**
   * Generate PDF export for an event report
   */
  async generatePDF(eventId: number, userId: number): Promise<string> {
    const event = await this.eventsService.findByIdWithOwner(eventId);
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    const report = await this.repository.findByEventId(eventId);
    if (!report) {
      throw new NotFoundException(`Report for event ${eventId} not found. Generate it first.`);
    }

    // Parse JSON fields
    const topProducts = report.topProducts as unknown as TopProductEntry[];
    const barBreakdowns = (report.barBreakdowns as unknown as BarBreakdown[]) || [];
    const posBreakdowns = (report.posBreakdowns as unknown as PosBreakdown[]) || [];
    const stockValuation = report.stockValuation as unknown as StockValuationSummary;

    const marginPercent = this.calculateMargin(report.totalRevenue, report.grossProfit);
    const avgTicket = report.totalOrderCount > 0 
      ? Math.round(report.totalRevenue / report.totalOrderCount) 
      : 0;

    // Build PDF document
    const docDefinition: TDocumentDefinitions = {
      content: [
        // Title
        { text: `Reporte: ${event.name}`, style: 'header' },
        { text: `Generado: ${report.generatedAt.toLocaleDateString('es-AR')}`, style: 'subheader' },
        { text: '\n' },

        // Summary Section
        { text: 'Resumen Ejecutivo', style: 'sectionHeader' },
        {
          table: {
            widths: ['*', '*', '*', '*'],
            body: [
              [
                { text: 'Ingresos', style: 'tableHeader' },
                { text: 'COGS', style: 'tableHeader' },
                { text: 'Ganancia', style: 'tableHeader' },
                { text: 'Margen', style: 'tableHeader' },
              ],
              [
                this.formatCurrency(report.totalRevenue),
                this.formatCurrency(report.totalCOGS),
                this.formatCurrency(report.grossProfit),
                `${marginPercent}%`,
              ],
            ],
          },
          layout: 'lightHorizontalLines',
        } as Content,
        { text: '\n' },
        {
          table: {
            widths: ['*', '*', '*'],
            body: [
              [
                { text: 'Unidades vendidas', style: 'tableHeader' },
                { text: 'Órdenes', style: 'tableHeader' },
                { text: 'Ticket promedio', style: 'tableHeader' },
              ],
              [
                report.totalUnitsSold.toString(),
                report.totalOrderCount.toString(),
                this.formatCurrency(avgTicket),
              ],
            ],
          },
          layout: 'lightHorizontalLines',
        } as Content,
        { text: '\n\n' },

        // Top Products Section
        { text: 'Productos más vendidos', style: 'sectionHeader' },
        {
          table: {
            widths: ['*', 'auto', 'auto', 'auto'],
            body: [
              [
                { text: 'Producto', style: 'tableHeader' },
                { text: 'Unidades', style: 'tableHeader' },
                { text: 'Ingresos', style: 'tableHeader' },
                { text: '% Total', style: 'tableHeader' },
              ],
              ...topProducts.slice(0, 10).map((p) => [
                p.name,
                p.unitsSold.toString(),
                this.formatCurrency(p.revenue),
                `${p.sharePercent}%`,
              ]),
            ],
          },
          layout: 'lightHorizontalLines',
        } as Content,
        { text: '\n\n' },

        // Bar Breakdowns Section
        ...(barBreakdowns.length > 0 ? [
          { text: 'Rendimiento por Barra', style: 'sectionHeader' } as Content,
          {
            table: {
              widths: ['*', 'auto', 'auto', 'auto', 'auto'],
              body: [
                [
                  { text: 'Barra', style: 'tableHeader' },
                  { text: 'Ingresos', style: 'tableHeader' },
                  { text: 'Ganancia', style: 'tableHeader' },
                  { text: 'Margen', style: 'tableHeader' },
                  { text: 'Órdenes', style: 'tableHeader' },
                ],
                ...barBreakdowns.map((b) => [
                  b.barName,
                  this.formatCurrency(b.totalRevenue),
                  this.formatCurrency(b.grossProfit),
                  `${b.marginPercent}%`,
                  b.totalOrderCount.toString(),
                ]),
              ],
            },
            layout: 'lightHorizontalLines',
          } as Content,
          { text: '\n\n' } as Content,
        ] : []),

        // POS Breakdowns Section
        ...(posBreakdowns.length > 0 ? [
          { text: 'Rendimiento por Terminal POS', style: 'sectionHeader' } as Content,
          {
            table: {
              widths: ['auto', '*', 'auto', 'auto', 'auto'],
              body: [
                [
                  { text: 'Código', style: 'tableHeader' },
                  { text: 'Barra', style: 'tableHeader' },
                  { text: 'Ingresos', style: 'tableHeader' },
                  { text: 'Trans.', style: 'tableHeader' },
                  { text: 'Ticket', style: 'tableHeader' },
                ],
                ...posBreakdowns.map((p) => [
                  p.posnetCode,
                  p.barName,
                  this.formatCurrency(p.totalRevenue),
                  p.totalTransactions.toString(),
                  this.formatCurrency(p.avgTicketSize),
                ]),
              ],
            },
            layout: 'lightHorizontalLines',
          } as Content,
          { text: '\n\n' } as Content,
        ] : []),

        // Stock Valuation Section
        ...(stockValuation ? [
          { text: 'Valuación de Stock Restante', style: 'sectionHeader' } as Content,
          {
            table: {
              widths: ['*', '*', '*'],
              body: [
                [
                  { text: 'Valor total', style: 'tableHeader' },
                  { text: 'Comprado', style: 'tableHeader' },
                  { text: 'Consignación', style: 'tableHeader' },
                ],
                [
                  this.formatCurrency(stockValuation.totalValue),
                  this.formatCurrency(stockValuation.purchasedValue),
                  this.formatCurrency(stockValuation.consignmentValue),
                ],
              ],
            },
            layout: 'lightHorizontalLines',
          } as Content,
        ] : []),
      ],
      styles: {
        header: {
          fontSize: 22,
          bold: true,
          margin: [0, 0, 0, 10],
        },
        subheader: {
          fontSize: 12,
          color: 'gray',
          margin: [0, 0, 0, 5],
        },
        sectionHeader: {
          fontSize: 14,
          bold: true,
          margin: [0, 10, 0, 5],
          color: '#333',
        },
        tableHeader: {
          bold: true,
          fontSize: 10,
          color: '#444',
        },
      },
      defaultStyle: {
        fontSize: 10,
      },
    };

    // Generate PDF
    const fileName = `reporte_${event.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`;
    const filePath = path.join(this.exportDir, fileName);

    // Use pdfmake with virtual file system (no external fonts needed)
    const PdfMake = require('pdfmake');
    const pdfFonts = require('pdfmake/build/vfs_fonts');
    
    const printer = new PdfMake({
      Roboto: {
        normal: Buffer.from(pdfFonts.pdfMake.vfs['Roboto-Regular.ttf'], 'base64'),
        bold: Buffer.from(pdfFonts.pdfMake.vfs['Roboto-Medium.ttf'], 'base64'),
        italics: Buffer.from(pdfFonts.pdfMake.vfs['Roboto-Italic.ttf'], 'base64'),
        bolditalics: Buffer.from(pdfFonts.pdfMake.vfs['Roboto-MediumItalic.ttf'], 'base64'),
      },
    });

    return new Promise((resolve, reject) => {
      try {
        const pdfDoc = printer.createPdfKitDocument(docDefinition);
        const writeStream = fs.createWriteStream(filePath);
        
        pdfDoc.pipe(writeStream);
        pdfDoc.end();

        writeStream.on('finish', async () => {
          // Update report with PDF path
          await this.prisma.eventReport.update({
            where: { eventId },
            data: { pdfPath: filePath },
          });
          resolve(filePath);
        });

        writeStream.on('error', (err) => {
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Get the file path for CSV export
   */
  async getCSVPath(eventId: number, userId: number): Promise<string | null> {
    const event = await this.eventsService.findByIdWithOwner(eventId);
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    const report = await this.repository.findByEventId(eventId);
    if (!report) {
      throw new NotFoundException(`Report for event ${eventId} not found.`);
    }

    return report.csvPath;
  }

  /**
   * Get the file path for PDF export
   */
  async getPDFPath(eventId: number, userId: number): Promise<string | null> {
    const event = await this.eventsService.findByIdWithOwner(eventId);
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    const report = await this.repository.findByEventId(eventId);
    if (!report) {
      throw new NotFoundException(`Report for event ${eventId} not found.`);
    }

    return report.pdfPath;
  }

  // Helper methods
  private formatCurrency(cents: number): string {
    const dollars = cents / 100;
    return `$${dollars.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  private formatDateTime(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private calculateMargin(revenue: number, grossProfit: number): number {
    return revenue > 0 
      ? Math.round((grossProfit / revenue) * 10000) / 100 
      : 0;
  }
}
