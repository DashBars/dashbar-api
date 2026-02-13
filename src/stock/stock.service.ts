import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { StockRepository } from './stock.repository';
import { BarsService } from '../bars/bars.service';
import { EventsService } from '../events/events.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import {
  UpsertStockDto,
  BulkUpsertStockDto,
  CreateConsignmentReturnDto,
  AssignStockDto,
  MoveStockDto,
  ReturnStockDto,
} from './dto';
import { NotOwnerException } from '../common/exceptions';
import { Stock, ConsignmentReturn, OwnershipMode, StockLocationType, StockMovementReason, MovementType } from '@prisma/client';
import { BulkReturnStockDto, BulkReturnMode } from './dto/bulk-return-stock.dto';
import { PrismaService } from '../prisma/prisma.service';
import { GlobalInventoryService } from '../global-inventory/global-inventory.service';

@Injectable()
export class StockService {
  constructor(
    private readonly stockRepository: StockRepository,
    private readonly barsService: BarsService,
    private readonly eventsService: EventsService,
    private readonly suppliersService: SuppliersService,
    private readonly prisma: PrismaService,
    private readonly globalInventoryService: GlobalInventoryService,
  ) {}

  /**
   * Get all stock for a specific bar
   */
  async findAllByBar(eventId: number, barId: number, userId: number): Promise<Stock[]> {
    await this.barsService.findOne(eventId, barId, userId);
    return this.stockRepository.findByBarId(barId);
  }

  /**
   * Get unique drinks available in a bar's stock.
   * Returns drink info + total ml + unit count, useful for recipe ingredient selection.
   */
  async getStockDrinks(
    eventId: number,
    barId: number,
    userId: number,
  ): Promise<
    {
      drinkId: number;
      name: string;
      brand: string;
      volume: number;
      totalMl: number;
      unitCount: number;
    }[]
  > {
    await this.barsService.findOne(eventId, barId, userId);
    return this.stockRepository.getUniqueDrinksByBar(barId);
  }

  /**
   * Get unique drinks available across all bars of a given type in an event.
   * Only returns stock marked as "para recetas" (sellAsWholeUnit: false).
   */
  async getDrinksByBarType(
    eventId: number,
    barType: string,
    userId: number,
  ): Promise<
    {
      drinkId: number;
      name: string;
      brand: string;
      volume: number;
      totalMl: number;
      unitCount: number;
      costPerMl: number;
    }[]
  > {
    return this.stockRepository.getUniqueDrinksByBarType(eventId, barType);
  }

  /**
   * Get stock summary aggregated by product
   * Quantities are in ml; unitCount shows equivalent whole units (bottles/cans)
   */
  async getStockSummary(
    eventId: number,
    barId: number,
    userId: number,
  ): Promise<
    {
      drinkId: number;
      drinkName: string;
      drinkBrand: string;
      drinkVolume: number;
      totalQuantity: number;
      unitCount: number;
      supplierCount: number;
    }[]
  > {
    await this.barsService.findOne(eventId, barId, userId);
    return this.stockRepository.getStockSummaryByBar(barId);
  }

  /**
   * Get stock breakdown by supplier
   */
  async getStockBySupplier(eventId: number, barId: number, userId: number): Promise<Stock[]> {
    await this.barsService.findOne(eventId, barId, userId);
    return this.stockRepository.getStockBySupplier(barId);
  }

  /**
   * Get consignment stock available for return
   */
  async getConsignmentStock(eventId: number, barId: number, userId: number): Promise<Stock[]> {
    await this.barsService.findOne(eventId, barId, userId);
    return this.stockRepository.getConsignmentStock(barId);
  }

  /**
   * Upsert stock for a specific bar, drink, and supplier
   */
  async upsert(
    eventId: number,
    barId: number,
    userId: number,
    dto: UpsertStockDto,
  ): Promise<Stock> {
    const event = await this.eventsService.findByIdWithOwner(eventId);

    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    await this.barsService.findOne(eventId, barId, userId);

    // Verify drink exists
    const drink = await this.stockRepository.findDrinkById(dto.drinkId);
    if (!drink) {
      throw new NotFoundException(`Drink with ID ${dto.drinkId} not found`);
    }

    // Verify supplier belongs to this user (tenant isolation)
    await this.suppliersService.validateOwnership(dto.supplierId, userId);

    // Validate quantity
    if (dto.quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than 0');
    }

    return this.stockRepository.upsert(barId, dto.drinkId, dto.supplierId, {
      quantity: dto.quantity,
      unitCost: dto.unitCost,
      currency: dto.currency || 'ARS',
      ownershipMode: dto.ownershipMode,
    });
  }

  /**
   * Bulk upsert stock for a bar
   */
  async bulkUpsert(
    eventId: number,
    barId: number,
    userId: number,
    dto: BulkUpsertStockDto,
  ): Promise<Stock[]> {
    const event = await this.eventsService.findByIdWithOwner(eventId);

    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    await this.barsService.findOne(eventId, barId, userId);

    const results: Stock[] = [];
    for (const item of dto.items) {
      // Verify drink exists
      const drink = await this.stockRepository.findDrinkById(item.drinkId);
      if (!drink) {
        throw new NotFoundException(`Drink with ID ${item.drinkId} not found`);
      }

      // Verify supplier belongs to this user
      await this.suppliersService.validateOwnership(item.supplierId, userId);

      // Validate quantity
      if (item.quantity <= 0) {
        throw new BadRequestException('Quantity must be greater than 0');
      }

      const stock = await this.stockRepository.upsert(
        barId,
        item.drinkId,
        item.supplierId,
        {
          quantity: item.quantity,
          unitCost: item.unitCost,
          currency: item.currency || 'ARS',
          ownershipMode: item.ownershipMode,
        },
      );
      results.push(stock);
    }

    return results;
  }

  /**
   * Delete stock entry for a bar
   */
  async delete(
    eventId: number,
    barId: number,
    drinkId: number,
    supplierId: number,
    userId: number,
  ): Promise<void> {
    const event = await this.eventsService.findByIdWithOwner(eventId);

    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    await this.barsService.findOne(eventId, barId, userId);

    // Verify the stock entry exists
    const stock = await this.stockRepository.findByBarIdDrinkIdAndSupplierId(
      barId,
      drinkId,
      supplierId,
    );

    if (!stock) {
      throw new NotFoundException(
        `Stock entry not found for bar ${barId}, drink ${drinkId}, supplier ${supplierId}`,
      );
    }

    await this.stockRepository.delete(barId, drinkId, supplierId);
  }

  /**
   * Get stock for a specific drink across all bars in an event
   */
  async getStockByDrinkAcrossEvent(
    eventId: number,
    drinkId: number,
    userId: number,
  ): Promise<
    { barId: number; barName: string; supplierId: number; supplierName: string; quantity: number }[]
  > {
    const bars = await this.barsService.findAllByEvent(eventId, userId);
    const barIds = bars.map((b) => b.id);

    const stocks = await this.stockRepository.findByDrinkIdAndBarIds(drinkId, barIds);

    return stocks.map((s: any) => ({
      barId: s.bar.id,
      barName: s.bar.name,
      supplierId: s.supplier.id,
      supplierName: s.supplier.name,
      quantity: s.quantity,
    }));
  }

  /**
   * Create a consignment return
   */
  async createConsignmentReturn(
    eventId: number,
    barId: number,
    userId: number,
    dto: CreateConsignmentReturnDto,
  ): Promise<ConsignmentReturn> {
    const event = await this.eventsService.findByIdWithOwner(eventId);

    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    await this.barsService.findOne(eventId, barId, userId);

    // Verify supplier belongs to this user
    await this.suppliersService.validateOwnership(dto.supplierId, userId);

    // Get the stock entry
    const stock = await this.stockRepository.findByBarIdDrinkIdAndSupplierId(
      barId,
      dto.drinkId,
      dto.supplierId,
    );

    if (!stock) {
      throw new NotFoundException(
        `Stock entry not found for bar ${barId}, drink ${dto.drinkId}, supplier ${dto.supplierId}`,
      );
    }

    // Verify it's consignment stock
    if (stock.ownershipMode !== OwnershipMode.consignment) {
      throw new BadRequestException(
        'Only consignment stock can be returned. This stock is marked as purchased.',
      );
    }

    // Verify quantity is valid
    if (dto.quantityReturned <= 0) {
      throw new BadRequestException('Quantity to return must be greater than 0');
    }

    // Verify we're not returning more than available
    if (dto.quantityReturned > stock.quantity) {
      throw new BadRequestException(
        `Cannot return ${dto.quantityReturned} units. Only ${stock.quantity} units available in stock.`,
      );
    }

    // Update stock quantity
    const newQuantity = stock.quantity - dto.quantityReturned;
    await this.stockRepository.updateQuantity(barId, dto.drinkId, dto.supplierId, newQuantity);

    // Create return record
    // @deprecated: This manual return flow should be replaced with ConsignmentService.executeReturn
    return this.stockRepository.createConsignmentReturn({
      stockBarId: barId,
      stockDrinkId: dto.drinkId,
      stockSupplierId: dto.supplierId,
      supplierId: dto.supplierId,
      quantityReturned: dto.quantityReturned,
      performedById: userId,
      notes: dto.notes,
    });
  }

  /**
   * Get consignment returns for a bar
   */
  async getConsignmentReturns(
    eventId: number,
    barId: number,
    userId: number,
  ): Promise<ConsignmentReturn[]> {
    await this.barsService.findOne(eventId, barId, userId);
    return this.stockRepository.getConsignmentReturnsByBar(barId);
  }

  /**
   * Assign stock from global inventory to a bar
   */
  async assignStock(
    userId: number,
    dto: AssignStockDto,
  ): Promise<{ stock: Stock; movement: any; eventProduct?: any }> {
    // Verify event ownership
    const event = await this.eventsService.findByIdWithOwner(dto.eventId);
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    // Verify bar belongs to event and get bar info
    const bar = await this.barsService.findOne(dto.eventId, dto.barId, userId);

    // Get global inventory entry
    const globalInv = await this.globalInventoryService.findOne(
      dto.globalInventoryId,
      userId,
    );

    // Verify available quantity
    const availableQuantity =
      globalInv.totalQuantity - globalInv.allocatedQuantity;
    if (dto.quantity > availableQuantity) {
      throw new BadRequestException(
        `Cannot assign ${dto.quantity} units. Only ${availableQuantity} available.`,
      );
    }

    // Get drink details (needed for ml conversion and naming)
    const drink = await this.prisma.drink.findUnique({
      where: { id: globalInv.drinkId },
    });
    if (!drink) {
      throw new NotFoundException(`Drink with ID ${globalInv.drinkId} not found`);
    }

    // Convert units (bottles) to ml for unified stock storage
    const quantityInMl = dto.quantity * drink.volume;

    return this.prisma.$transaction(async (tx) => {
      // Update global inventory (still tracked in units)
      await tx.globalInventory.update({
        where: { id: dto.globalInventoryId },
        data: {
          allocatedQuantity: { increment: dto.quantity },
        },
      });

      // Handle null supplier - use 0 as placeholder if needed
      const supplierIdForStock = globalInv.supplierId ?? 0;

      // Stock is stored with quantity in ml. sellAsWholeUnit preserves the
      // user's intent (true = direct sale, false = recipe ingredient) for
      // UI categorisation. The depletion pipeline queries both types.
      const isDirectSale = !!(dto.sellAsWholeUnit && dto.salePrice);
      const stock = await tx.stock.upsert({
        where: {
          barId_drinkId_supplierId_sellAsWholeUnit: {
            barId: dto.barId,
            drinkId: globalInv.drinkId,
            supplierId: supplierIdForStock,
            sellAsWholeUnit: isDirectSale,
          },
        },
        create: {
          barId: dto.barId,
          drinkId: globalInv.drinkId,
          supplierId: supplierIdForStock,
          quantity: quantityInMl,
          unitCost: globalInv.unitCost,
          currency: globalInv.currency,
          ownershipMode: globalInv.ownershipMode,
          sellAsWholeUnit: isDirectSale,
          salePrice: isDirectSale ? dto.salePrice : null,
        },
        update: {
          quantity: { increment: quantityInMl },
        },
        include: { drink: true, supplier: true },
      });

      // Create inventory movement (quantity in original units for auditability)
      const movement = await tx.inventoryMovement.create({
        data: {
          fromLocationType: StockLocationType.GLOBAL,
          fromLocationId: null,
          toLocationType: StockLocationType.BAR,
          toLocationId: dto.barId,
          barId: dto.barId, // Keep for backward compatibility
          drinkId: globalInv.drinkId,
          supplierId: supplierIdForStock,
          quantity: dto.quantity,
          type: MovementType.transfer_in,
          reason: StockMovementReason.ASSIGN_TO_BAR,
          sellAsWholeUnit: isDirectSale,
          performedById: userId,
          globalInventoryId: dto.globalInventoryId,
          notes: dto.notes
            ? `${dto.notes} (${dto.quantity} unidades = ${quantityInMl} ml)`
            : `${dto.quantity} unidades = ${quantityInMl} ml`,
        },
      });

      // If sellAsWholeUnit is true, create product + auto-recipe for direct sale
      // This makes direct-sale items go through the same recipe-based depletion pipeline
      let eventProduct = null;
      if (dto.sellAsWholeUnit && dto.salePrice) {
        // Find or create Cocktail entry for the drink
        let cocktail = await tx.cocktail.findFirst({
          where: { name: drink.name, eventId: dto.eventId },
        });

        if (!cocktail) {
          // Try legacy global cocktail
          cocktail = await tx.cocktail.findFirst({
            where: { name: drink.name, eventId: null },
          });
        }

        if (!cocktail) {
          cocktail = await tx.cocktail.create({
            data: {
              name: drink.name,
              eventId: dto.eventId,
              price: dto.salePrice,
              volume: drink.volume,
              isActive: true,
            },
          });
        }

        // Create or update EventProduct for this bar
        const productName = drink.name;

        eventProduct = await tx.eventProduct.upsert({
          where: {
            eventId_name_barId: {
              eventId: dto.eventId,
              name: productName,
              barId: dto.barId,
            },
          },
          create: {
            eventId: dto.eventId,
            barId: dto.barId,
            name: productName,
            price: dto.salePrice,
            isCombo: false,
          },
          update: {
            price: dto.salePrice,
          },
        });

        // Link the EventProduct to the Cocktail via join table
        await tx.eventProductCocktail.upsert({
          where: {
            eventProductId_cocktailId: {
              eventProductId: eventProduct.id,
              cocktailId: cocktail.id,
            },
          },
          create: {
            eventProductId: eventProduct.id,
            cocktailId: cocktail.id,
          },
          update: {},
        });

        // Auto-create EventRecipe with 100% of this drink (implicit recipe)
        // This allows the depletion pipeline to resolve a recipe for direct-sale items
        const existingRecipe = await tx.eventRecipe.findFirst({
          where: {
            eventId: dto.eventId,
            cocktailName: drink.name,
          },
        });

        if (!existingRecipe) {
          const recipe = await tx.eventRecipe.create({
            data: {
              eventId: dto.eventId,
              cocktailName: drink.name,
              glassVolume: drink.volume, // 1 sale = 1 full unit (bottle/can)
              hasIce: false,
              salePrice: dto.salePrice,
              components: {
                create: {
                  drinkId: drink.id,
                  percentage: 100,
                },
              },
            },
          });

          // Assign the recipe to the bar's type so resolveRecipe() can find it
          await tx.eventRecipeBarType.create({
            data: {
              eventRecipeId: recipe.id,
              barType: bar.type,
            },
          });
        } else {
          // Ensure the existing recipe is also assigned to this bar's type
          await tx.eventRecipeBarType.upsert({
            where: {
              eventRecipeId_barType: {
                eventRecipeId: existingRecipe.id,
                barType: bar.type,
              },
            },
            create: {
              eventRecipeId: existingRecipe.id,
              barType: bar.type,
            },
            update: {},
          });
        }
      }

      return { stock, movement, eventProduct };
    });
  }

  /**
   * Move stock between bars in the same event.
   * dto.quantity is in UNITS (bottles/cans). Internally converts to ml.
   */
  async moveStock(
    userId: number,
    dto: MoveStockDto,
  ): Promise<{ fromStock: Stock; toStock: Stock; movement: any }> {
    // Verify event ownership
    const event = await this.eventsService.findByIdWithOwner(dto.eventId);
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    // Verify both bars belong to event
    await this.barsService.findOne(dto.eventId, dto.fromBarId, userId);
    await this.barsService.findOne(dto.eventId, dto.toBarId, userId);

    if (dto.fromBarId === dto.toBarId) {
      throw new BadRequestException('Cannot move stock to the same bar');
    }

    // Get drink details for unit <-> ml conversion
    const drink = await this.prisma.drink.findUnique({
      where: { id: dto.drinkId },
    });
    if (!drink) {
      throw new NotFoundException(`Drink with ID ${dto.drinkId} not found`);
    }

    // Convert units (bottles) to ml for bar stock operations
    const quantityInMl = dto.quantity * drink.volume;

    // Get source stock
    const sourceStock = await this.stockRepository.findByBarIdAndDrinkId(
      dto.fromBarId,
      dto.drinkId,
    );

    if (!sourceStock || sourceStock.length === 0) {
      throw new NotFoundException(
        `No stock found for drink ${dto.drinkId} in source bar`,
      );
    }

    // Find matching stock entry (by supplier if available)
    const stockToMove = sourceStock.find(
      (s) => s.quantity >= quantityInMl,
    ) || sourceStock[0];

    if (stockToMove.quantity < quantityInMl) {
      throw new BadRequestException(
        `Cannot move ${dto.quantity} units (${quantityInMl} ml). Only ${stockToMove.quantity} ml available in source bar.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Decrease source stock (in ml)
      const fromStock = await tx.stock.update({
        where: {
          barId_drinkId_supplierId_sellAsWholeUnit: {
            barId: dto.fromBarId,
            drinkId: dto.drinkId,
            supplierId: stockToMove.supplierId,
            sellAsWholeUnit: stockToMove.sellAsWholeUnit,
          },
        },
        data: {
          quantity: { decrement: quantityInMl },
        },
        include: { drink: true, supplier: true },
      });

      // If source stock reaches zero, delete the row to avoid clutter
      if (fromStock.quantity === 0) {
        await tx.stock.delete({
          where: {
            barId_drinkId_supplierId_sellAsWholeUnit: {
              barId: dto.fromBarId,
              drinkId: dto.drinkId,
              supplierId: stockToMove.supplierId,
              sellAsWholeUnit: stockToMove.sellAsWholeUnit,
            },
          },
        });
      }

      // Increase destination stock (in ml, preserving sellAsWholeUnit from source)
      const toStock = await tx.stock.upsert({
        where: {
          barId_drinkId_supplierId_sellAsWholeUnit: {
            barId: dto.toBarId,
            drinkId: dto.drinkId,
            supplierId: stockToMove.supplierId,
            sellAsWholeUnit: stockToMove.sellAsWholeUnit,
          },
        },
        create: {
          barId: dto.toBarId,
          drinkId: dto.drinkId,
          supplierId: stockToMove.supplierId,
          quantity: quantityInMl,
          unitCost: stockToMove.unitCost,
          currency: stockToMove.currency,
          ownershipMode: stockToMove.ownershipMode,
          sellAsWholeUnit: stockToMove.sellAsWholeUnit,
          salePrice: stockToMove.salePrice,
        },
        update: {
          quantity: { increment: quantityInMl },
        },
        include: { drink: true, supplier: true },
      });

      // Create inventory movement (quantity in original units for auditability)
      const movement = await tx.inventoryMovement.create({
        data: {
          fromLocationType: StockLocationType.BAR,
          fromLocationId: dto.fromBarId,
          toLocationType: StockLocationType.BAR,
          toLocationId: dto.toBarId,
          barId: dto.toBarId, // Keep for backward compatibility
          drinkId: dto.drinkId,
          supplierId: stockToMove.supplierId,
          quantity: dto.quantity, // Units (bottles) for audit
          type: MovementType.transfer_in,
          reason: StockMovementReason.MOVE_BETWEEN_BARS,
          sellAsWholeUnit: stockToMove.sellAsWholeUnit,
          performedById: userId,
          notes: dto.notes
            ? `${dto.notes} (${dto.quantity} unidades = ${quantityInMl} ml)`
            : `${dto.quantity} unidades = ${quantityInMl} ml`,
        },
      });

      return { fromStock, toStock, movement };
    });
  }

  /**
   * Return stock from bar to global inventory.
   * dto.quantity is in UNITS (bottles/cans), matching how assignStock works.
   * Internally converts to ml for bar stock operations.
   */
  async returnStock(
    userId: number,
    dto: ReturnStockDto,
  ): Promise<{ globalInventory: any; movement: any }> {
    // Verify event ownership
    const event = await this.eventsService.findByIdWithOwner(dto.eventId);
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    // Verify bar belongs to event
    await this.barsService.findOne(dto.eventId, dto.barId, userId);

    // Get drink details for unit <-> ml conversion
    const drink = await this.prisma.drink.findUnique({
      where: { id: dto.drinkId },
    });
    if (!drink) {
      throw new NotFoundException(`Drink with ID ${dto.drinkId} not found`);
    }

    // Convert units (bottles) to ml for bar stock operations
    const quantityInMl = dto.quantity * drink.volume;

    // Get the specific stock entry using the composite key
    const stockToReturn = await this.stockRepository.findByBarIdDrinkIdAndSupplierId(
      dto.barId,
      dto.drinkId,
      dto.supplierId,
      dto.sellAsWholeUnit,
    );

    if (!stockToReturn) {
      throw new NotFoundException(
        `No stock found for drink ${dto.drinkId} with supplier ${dto.supplierId} and sellAsWholeUnit=${dto.sellAsWholeUnit} in bar`,
      );
    }

    if (stockToReturn.quantity < quantityInMl) {
      throw new BadRequestException(
        `Cannot return ${dto.quantity} units (${quantityInMl} ml). Only ${stockToReturn.quantity} ml available in bar.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Decrease bar stock (in ml)
      const updatedStock = await tx.stock.update({
        where: {
          barId_drinkId_supplierId_sellAsWholeUnit: {
            barId: dto.barId,
            drinkId: dto.drinkId,
            supplierId: stockToReturn.supplierId,
            sellAsWholeUnit: stockToReturn.sellAsWholeUnit,
          },
        },
        data: {
          quantity: { decrement: quantityInMl },
        },
      });

      // If bar stock reaches zero, delete the row so it no longer appears in the UI
      if (updatedStock.quantity === 0) {
        await tx.stock.delete({
          where: {
            barId_drinkId_supplierId_sellAsWholeUnit: {
              barId: dto.barId,
              drinkId: dto.drinkId,
              supplierId: stockToReturn.supplierId,
              sellAsWholeUnit: stockToReturn.sellAsWholeUnit,
            },
          },
        });
      }

      // Find or create global inventory entry
      const supplierIdForGlobal = stockToReturn.supplierId || null;
      let globalInv = await tx.globalInventory.findFirst({
        where: {
          ownerId: userId,
          drinkId: dto.drinkId,
          supplierId: supplierIdForGlobal,
        },
      });

      let createdGlobalInv = false;
      if (!globalInv) {
        // Under the new rules, bar stock should always come from global inventory.
        // Still, keep this defensive path to avoid losing stock if legacy data exists.
        const created = await tx.globalInventory.create({
          data: {
            ownerId: userId,
            drinkId: dto.drinkId,
            supplierId: supplierIdForGlobal,
            // These units were not previously counted in global inventory.
            totalQuantity: dto.quantity,
            allocatedQuantity: 0,
            unitCost: stockToReturn.unitCost,
            currency: stockToReturn.currency,
            ownershipMode: stockToReturn.ownershipMode,
          },
        });
        globalInv = created;
        createdGlobalInv = true;
      }

      // Update global inventory (dto.quantity is in units, matching allocatedQuantity)
      // IMPORTANT: do NOT increment totalQuantity here.
      // totalQuantity already represents the physical stock owned in global inventory.
      // Assigning to bars increments allocatedQuantity; returning should only decrement allocatedQuantity.
      const updatedGlobalInv = createdGlobalInv
        ? globalInv
        : await (async () => {
            if (globalInv.allocatedQuantity < dto.quantity) {
              throw new BadRequestException(
                `Cannot return ${dto.quantity} units. Global inventory allocatedQuantity is ${globalInv.allocatedQuantity}.`,
              );
            }
            return tx.globalInventory.update({
              where: { id: globalInv.id },
              data: { allocatedQuantity: { decrement: dto.quantity } },
            });
          })();

      // Create inventory movement (quantity in original units for auditability)
      const movement = await tx.inventoryMovement.create({
        data: {
          fromLocationType: StockLocationType.BAR,
          fromLocationId: dto.barId,
          toLocationType: StockLocationType.GLOBAL,
          toLocationId: null,
          barId: dto.barId, // Keep for backward compatibility
          drinkId: dto.drinkId,
          supplierId: stockToReturn.supplierId,
          quantity: dto.quantity, // Units (bottles) for audit
          type: MovementType.transfer_in,
          reason: StockMovementReason.RETURN_TO_GLOBAL,
          sellAsWholeUnit: dto.sellAsWholeUnit,
          performedById: userId,
          globalInventoryId: globalInv.id,
          notes: dto.notes
            ? `${dto.notes} (${dto.quantity} unidades = ${quantityInMl} ml)`
            : `${dto.quantity} unidades = ${quantityInMl} ml`,
        },
      });

      return { globalInventory: updatedGlobalInv, movement };
    });
  }

  /**
   * Return stock from bar to supplier (consignment).
   * Unlike returnStock, this also decrements totalQuantity in global inventory
   * because the stock is physically leaving our possession.
   * dto.quantity is in UNITS (bottles/cans). Internally converts to ml for bar stock.
   */
  async returnToSupplier(
    userId: number,
    dto: ReturnStockDto,
  ): Promise<{ movement: any }> {
    const event = await this.eventsService.findByIdWithOwner(dto.eventId);
    if (!this.eventsService.isOwner(event, userId)) {
      throw new NotOwnerException();
    }

    await this.barsService.findOne(dto.eventId, dto.barId, userId);

    // Get drink details for unit <-> ml conversion
    const drink = await this.prisma.drink.findUnique({
      where: { id: dto.drinkId },
    });
    if (!drink) {
      throw new NotFoundException(`Drink with ID ${dto.drinkId} not found`);
    }

    // Convert units (bottles) to ml for bar stock operations
    const quantityInMl = dto.quantity * drink.volume;

    const stockToReturn = await this.stockRepository.findByBarIdDrinkIdAndSupplierId(
      dto.barId,
      dto.drinkId,
      dto.supplierId,
      dto.sellAsWholeUnit,
    );

    if (!stockToReturn) {
      throw new NotFoundException(
        `No stock found for drink ${dto.drinkId} with supplier ${dto.supplierId} in bar`,
      );
    }

    if (stockToReturn.ownershipMode !== OwnershipMode.consignment) {
      throw new BadRequestException(
        'Solo se puede devolver al proveedor stock en consignación.',
      );
    }

    if (stockToReturn.quantity < quantityInMl) {
      throw new BadRequestException(
        `Cannot return ${dto.quantity} units (${quantityInMl} ml). Only ${stockToReturn.quantity} ml available.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Decrease bar stock (in ml)
      const updatedStock = await tx.stock.update({
        where: {
          barId_drinkId_supplierId_sellAsWholeUnit: {
            barId: dto.barId,
            drinkId: dto.drinkId,
            supplierId: stockToReturn.supplierId,
            sellAsWholeUnit: stockToReturn.sellAsWholeUnit,
          },
        },
        data: { quantity: { decrement: quantityInMl } },
      });

      if (updatedStock.quantity === 0) {
        await tx.stock.delete({
          where: {
            barId_drinkId_supplierId_sellAsWholeUnit: {
              barId: dto.barId,
              drinkId: dto.drinkId,
              supplierId: stockToReturn.supplierId,
              sellAsWholeUnit: stockToReturn.sellAsWholeUnit,
            },
          },
        });
      }

      // Find global inventory and decrement BOTH totalQuantity and allocatedQuantity (in units)
      const globalInv = await tx.globalInventory.findFirst({
        where: {
          ownerId: userId,
          drinkId: dto.drinkId,
          supplierId: stockToReturn.supplierId,
        },
      });

      if (globalInv) {
        await tx.globalInventory.update({
          where: { id: globalInv.id },
          data: {
            totalQuantity: { decrement: Math.min(dto.quantity, globalInv.totalQuantity) },
            allocatedQuantity: { decrement: Math.min(dto.quantity, globalInv.allocatedQuantity) },
          },
        });
      }

      // Create inventory movement (quantity in original units for auditability)
      const movement = await tx.inventoryMovement.create({
        data: {
          fromLocationType: StockLocationType.BAR,
          fromLocationId: dto.barId,
          toLocationType: null,
          toLocationId: null,
          barId: dto.barId,
          drinkId: dto.drinkId,
          supplierId: stockToReturn.supplierId,
          quantity: dto.quantity, // Units (bottles) for audit
          type: MovementType.transfer_out,
          reason: StockMovementReason.RETURN_TO_PROVIDER,
          sellAsWholeUnit: dto.sellAsWholeUnit,
          performedById: userId,
          globalInventoryId: globalInv?.id || null,
          notes: dto.notes
            ? `${dto.notes} (${dto.quantity} unidades = ${quantityInMl} ml)`
            : `Devolución a proveedor (${dto.quantity} unidades = ${quantityInMl} ml)`,
        },
      });

      return { movement };
    });
  }

  /**
   * Bulk return stock from a bar.
   * Modes:
   *  - to_global: return all selected items to global inventory
   *  - to_supplier: return all selected consignment items to supplier
   *  - auto: purchased → global, consignment → supplier
   */
  async bulkReturnStock(
    userId: number,
    dto: BulkReturnStockDto,
  ): Promise<{ processed: number; toGlobal: number; toSupplier: number; errors: string[] }> {
    let toGlobal = 0;
    let toSupplier = 0;
    const errors: string[] = [];

    for (const item of dto.items) {
      try {
        if (dto.mode === BulkReturnMode.AUTO) {
          // Determine ownership from actual stock
          const stock = await this.stockRepository.findByBarIdDrinkIdAndSupplierId(
            item.barId,
            item.drinkId,
            item.supplierId,
            item.sellAsWholeUnit,
          );
          if (!stock) {
            errors.push(`Stock not found for drink ${item.drinkId}`);
            continue;
          }
          if (stock.ownershipMode === OwnershipMode.consignment) {
            await this.returnToSupplier(userId, { ...item, notes: dto.notes || item.notes });
            toSupplier++;
          } else {
            await this.returnStock(userId, { ...item, notes: dto.notes || item.notes });
            toGlobal++;
          }
        } else if (dto.mode === BulkReturnMode.TO_SUPPLIER) {
          await this.returnToSupplier(userId, { ...item, notes: dto.notes || item.notes });
          toSupplier++;
        } else {
          await this.returnStock(userId, { ...item, notes: dto.notes || item.notes });
          toGlobal++;
        }
      } catch (err: any) {
        errors.push(`Drink ${item.drinkId}: ${err.message}`);
      }
    }

    return { processed: toGlobal + toSupplier, toGlobal, toSupplier, errors };
  }
}
