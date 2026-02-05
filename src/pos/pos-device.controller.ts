import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
  Res,
  Header,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { POSSalesService, ReceiptData } from './pos-sales.service';
import { PosnetsService } from './posnets.service';
import { SessionsService } from './sessions.service';
import { CatalogService } from '../catalog/catalog.service';
import { CreatePOSSaleDto, RefundSaleDto, OpenSessionDto, CloseSessionDto } from './dto';
import { Public } from '../auth/decorators/public.decorator';
import { PosAuth, PosAuthGuard } from './guards/pos-auth.guard';
import { CurrentPosnet } from './decorators/current-posnet.decorator';
import { PosTokenPayload } from './posnets.service';

/**
 * Controller for POS device operations
 * All endpoints require POS authentication (not user JWT)
 */
@Controller('pos')
@UseGuards(PosAuthGuard)
export class PosDeviceController {
  constructor(
    private readonly salesService: POSSalesService,
    private readonly posnetsService: PosnetsService,
    private readonly sessionsService: SessionsService,
    private readonly catalogService: CatalogService,
  ) {}

  /**
   * Get POS config (products, pricing, current state)
   */
  @Get(':id/config')
  @Public()
  @PosAuth()
  async getConfig(@CurrentPosnet() posnet: PosTokenPayload) {
    const [posnetData, catalog, session] = await Promise.all([
      this.posnetsService.findById(posnet.posnetId),
      this.catalogService.getCatalog(posnet.eventId, posnet.barId),
      this.sessionsService.getActiveSession(posnet.posnetId),
    ]);

    return {
      posnet: {
        id: posnetData.id,
        code: posnetData.code,
        name: posnetData.name,
        status: posnetData.status,
        enabled: posnetData.enabled,
      },
      event: posnetData.event,
      bar: posnetData.bar,
      catalog,
      session: session
        ? {
            id: session.id,
            openedAt: session.openedAt,
            openingFloat: session.openingFloat,
          }
        : null,
    };
  }

  /**
   * Open a session from POS device
   */
  @Post(':id/sessions')
  @Public()
  @PosAuth()
  async openSession(
    @CurrentPosnet() posnet: PosTokenPayload,
    @Body() dto: OpenSessionDto,
  ) {
    // Use a system user ID for POS-initiated sessions
    // In production, you might want to handle this differently
    return this.sessionsService.openSession(posnet.posnetId, 0, dto);
  }

  /**
   * Close current session from POS device
   */
  @Post(':id/sessions/close')
  @Public()
  @PosAuth()
  async closeSession(
    @CurrentPosnet() posnet: PosTokenPayload,
    @Body() dto: CloseSessionDto,
  ) {
    const session = await this.sessionsService.getActiveSession(posnet.posnetId);
    if (!session) {
      return { error: 'No active session to close' };
    }
    return this.sessionsService.closeSession(posnet.posnetId, session.id, dto);
  }

  /**
   * Create a sale from POS device
   */
  @Post(':id/sales')
  @Public()
  @PosAuth()
  async createSale(
    @CurrentPosnet() posnet: PosTokenPayload,
    @Body() dto: CreatePOSSaleDto,
  ) {
    return this.salesService.createSale(posnet.posnetId, dto);
  }

  /**
   * Get recent sales for the POS
   */
  @Get(':id/sales')
  @Public()
  @PosAuth()
  async getSales(
    @CurrentPosnet() posnet: PosTokenPayload,
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ) {
    return this.salesService.getSales(posnet.posnetId, {
      since: since ? new Date(since) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /**
   * Get a specific sale
   */
  @Get(':id/sales/:saleId')
  @Public()
  @PosAuth()
  async getSale(
    @CurrentPosnet() posnet: PosTokenPayload,
    @Param('saleId', ParseIntPipe) saleId: number,
  ) {
    const sale = await this.salesService.getSaleById(saleId);
    if (sale.posnetId !== posnet.posnetId) {
      return { error: 'Sale not found for this POS' };
    }
    return sale;
  }

  /**
   * Refund a sale
   */
  @Post(':id/sales/:saleId/refund')
  @Public()
  @PosAuth()
  async refundSale(
    @CurrentPosnet() posnet: PosTokenPayload,
    @Param('saleId', ParseIntPipe) saleId: number,
    @Body() dto: RefundSaleDto,
  ) {
    return this.salesService.refundSale(posnet.posnetId, saleId, dto);
  }

  /**
   * Get receipt data for a sale (JSON)
   */
  @Get(':id/sales/:saleId/receipt')
  @Public()
  @PosAuth()
  async getReceipt(
    @CurrentPosnet() posnet: PosTokenPayload,
    @Param('saleId', ParseIntPipe) saleId: number,
  ) {
    const sale = await this.salesService.getSaleById(saleId);
    if (sale.posnetId !== posnet.posnetId) {
      return { error: 'Sale not found for this POS' };
    }
    return this.salesService.generateReceipt(saleId);
  }

  /**
   * Get receipt as HTML (printable)
   */
  @Get(':id/sales/:saleId/receipt/html')
  @Public()
  @PosAuth()
  @Header('Content-Type', 'text/html')
  async getReceiptHtml(
    @CurrentPosnet() posnet: PosTokenPayload,
    @Param('saleId', ParseIntPipe) saleId: number,
    @Res() res: Response,
  ) {
    const sale = await this.salesService.getSaleById(saleId);
    if (sale.posnetId !== posnet.posnetId) {
      res.status(404).send('Sale not found');
      return;
    }

    const receipt = await this.salesService.generateReceipt(saleId);
    const html = this.generateReceiptHtml(receipt);
    res.send(html);
  }

  /**
   * Send heartbeat to keep POS connection alive
   */
  @Post(':id/heartbeat')
  @Public()
  @PosAuth()
  async heartbeat(@CurrentPosnet() posnet: PosTokenPayload) {
    await this.posnetsService.recordHeartbeat(posnet.posnetId);
    return { success: true, timestamp: new Date() };
  }

  /**
   * Generate HTML receipt
   */
  private generateReceiptHtml(receipt: ReceiptData): string {
    const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;
    const formatDate = (date: Date) => {
      const d = new Date(date);
      return d.toLocaleString('es-AR', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
    };

    const itemRows = receipt.items
      .map(
        (item) => `
        <tr>
          <td>${item.name}</td>
          <td class="qty">${item.quantity}</td>
          <td class="price">${formatPrice(item.unitPrice)}</td>
          <td class="price">${formatPrice(item.lineTotal)}</td>
        </tr>
      `,
      )
      .join('');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Recibo ${receipt.receiptId}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', monospace;
      font-size: 12px;
      width: 80mm;
      padding: 10px;
      background: white;
    }
    .header { text-align: center; margin-bottom: 15px; }
    .header h1 { font-size: 18px; margin-bottom: 5px; }
    .header p { font-size: 10px; color: #666; }
    .info { margin-bottom: 15px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
    .info p { margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
    th { text-align: left; border-bottom: 1px solid #000; padding: 5px 0; }
    td { padding: 3px 0; }
    .qty, .price { text-align: right; }
    .totals { border-top: 1px dashed #000; padding-top: 10px; }
    .totals p { display: flex; justify-content: space-between; margin: 3px 0; }
    .totals .total { font-size: 16px; font-weight: bold; margin-top: 5px; }
    .footer { margin-top: 20px; text-align: center; font-size: 10px; color: #666; }
    @media print {
      body { width: 100%; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${receipt.eventName}</h1>
    <p>${receipt.barName} - ${receipt.posName}</p>
  </div>
  
  <div class="info">
    <p><strong>Recibo:</strong> ${receipt.receiptId}</p>
    <p><strong>Transacción:</strong> #${receipt.transactionId}</p>
    <p><strong>Fecha:</strong> ${formatDate(receipt.timestamp)}</p>
    <p><strong>POS:</strong> ${receipt.posCode}</p>
  </div>
  
  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th class="qty">Cant</th>
        <th class="price">P.Unit</th>
        <th class="price">Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>
  
  <div class="totals">
    <p><span>Subtotal:</span><span>${formatPrice(receipt.subtotal)}</span></p>
    ${receipt.tax > 0 ? `<p><span>Impuestos:</span><span>${formatPrice(receipt.tax)}</span></p>` : ''}
    <p class="total"><span>TOTAL:</span><span>${formatPrice(receipt.total)}</span></p>
    <p><span>Pago:</span><span>${receipt.paymentMethod.toUpperCase()}</span></p>
  </div>
  
  <div class="footer">
    <p>Gracias por su compra</p>
    <p>Estado: ${receipt.status}</p>
  </div>
  
  <div class="no-print" style="margin-top: 20px; text-align: center;">
    <button onclick="window.print()" style="padding: 10px 20px; font-size: 14px;">
      Imprimir
    </button>
  </div>
</body>
</html>
    `.trim();
  }
}
