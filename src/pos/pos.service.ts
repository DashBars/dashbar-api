import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CatalogService, CatalogResponse } from '../catalog/catalog.service';
import { SalesService } from '../sales/sales.service';
import { BarsService } from '../bars/bars.service';
import { CheckoutDto } from './dto';
import { Receipt, ReceiptLine } from './interfaces/receipt.interface';

@Injectable()
export class POSService {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly salesService: SalesService,
    private readonly barsService: BarsService,
  ) {}

  /**
   * Get catalog for POS (proxy to CatalogService)
   */
  async getCatalog(eventId: number): Promise<CatalogResponse> {
    return this.catalogService.getCatalog(eventId);
  }

  /**
   * Process checkout with multiple items
   * Creates individual sales for each item and returns a receipt
   */
  async checkout(eventId: number, userId: number, dto: CheckoutDto): Promise<Receipt> {
    // 1. Validate bar belongs to event
    const bar = await this.barsService.findOne(eventId, dto.barId, userId);

    // 2. Get catalog with resolved prices
    const catalog = await this.catalogService.getCatalog(eventId);

    // 3. Build price map from catalog
    const priceMap = this.buildPriceMap(catalog);

    // 4. Validate all cocktails exist and have prices
    const lines: ReceiptLine[] = [];
    for (const item of dto.items) {
      const cocktailInfo = priceMap.get(item.cocktailId);
      if (!cocktailInfo) {
        throw new BadRequestException(
          `Cocktail with ID ${item.cocktailId} not found in catalog for event ${eventId}`,
        );
      }

      lines.push({
        cocktailId: item.cocktailId,
        name: cocktailInfo.name,
        quantity: item.quantity,
        unitPrice: cocktailInfo.price,
        lineTotal: cocktailInfo.price * item.quantity,
      });
    }

    // 5. Create sales for each item (this handles stock depletion and events)
    const saleIds: number[] = [];
    for (const item of dto.items) {
      const sale = await this.salesService.createSale(eventId, dto.barId, {
        cocktailId: item.cocktailId,
        quantity: item.quantity,
      });
      saleIds.push(sale.id);
    }

    // 6. Calculate totals server-side
    const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
    const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
    const total = subtotal; // No taxes/fees for now

    // 7. Build and return receipt
    const receipt: Receipt = {
      orderId: `POS-${randomUUID().substring(0, 8).toUpperCase()}`,
      eventId,
      barId: bar.id,
      barName: bar.name,
      lines,
      itemCount,
      subtotal,
      total,
      createdAt: new Date(),
    };

    return receipt;
  }

  /**
   * Build a map of cocktailId -> {name, price} from catalog
   */
  private buildPriceMap(
    catalog: CatalogResponse,
  ): Map<number, { name: string; price: number }> {
    const priceMap = new Map<number, { name: string; price: number }>();

    // Add cocktails from categories
    for (const category of catalog.categories) {
      for (const cocktail of category.cocktails) {
        priceMap.set(cocktail.id, {
          name: cocktail.name,
          price: cocktail.price,
        });
      }
    }

    // Add uncategorized cocktails
    for (const cocktail of catalog.uncategorized) {
      priceMap.set(cocktail.id, {
        name: cocktail.name,
        price: cocktail.price,
      });
    }

    return priceMap;
  }
}
