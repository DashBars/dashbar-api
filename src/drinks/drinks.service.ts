import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { DrinksRepository, DrinkWithCounts } from './drinks.repository';
import { CreateDrinkDto, UpdateDrinkDto } from './dto';

@Injectable()
export class DrinksService {
  constructor(private readonly drinksRepository: DrinksRepository) {}

  /**
   * Get all drinks (with association counts)
   */
  async findAll(): Promise<DrinkWithCounts[]> {
    return this.drinksRepository.findAll();
  }

  /**
   * Search drinks by name, brand, or SKU
   */
  async search(query: string): Promise<DrinkWithCounts[]> {
    if (!query || query.trim().length === 0) {
      return this.findAll();
    }
    return this.drinksRepository.search(query.trim());
  }

  /**
   * Find a drink by ID
   */
  async findOne(id: number): Promise<DrinkWithCounts> {
    const drink = await this.drinksRepository.findById(id);
    if (!drink) {
      throw new NotFoundException(`Drink with ID ${id} not found`);
    }
    return drink;
  }

  /**
   * Create a new drink
   */
  async create(dto: CreateDrinkDto): Promise<DrinkWithCounts> {
    // Check if SKU already exists
    const existingBySku = await this.drinksRepository.findAll();
    const skuExists = existingBySku.some((d) => d.sku === dto.sku);
    
    if (skuExists) {
      throw new BadRequestException(`Ya existe un insumo con el SKU "${dto.sku}"`);
    }

    // Check for exact duplicate (name + brand + volume + type)
    const isDuplicate = existingBySku.some(
      (d) =>
        d.name.toLowerCase() === dto.name.toLowerCase().trim() &&
        d.brand.toLowerCase() === dto.brand.toLowerCase().trim() &&
        d.volume === dto.volume &&
        d.drinkType === dto.drinkType,
    );
    if (isDuplicate) {
      throw new BadRequestException(
        'Ya existe un insumo con el mismo nombre, marca, volumen y tipo.',
      );
    }

    return this.drinksRepository.create({
      name: dto.name,
      brand: dto.brand,
      sku: dto.sku,
      drinkType: dto.drinkType,
      volume: dto.volume,
    });
  }

  /**
   * Update a drink
   * - Only SKU can be changed if the drink has associations (stock, recipes, movements)
   * - All fields editable if no associations exist
   */
  async update(id: number, dto: UpdateDrinkDto): Promise<DrinkWithCounts> {
    const drink = await this.findOne(id);

    // Check SKU uniqueness if updating SKU
    if (dto.sku && dto.sku !== drink.sku) {
      const existing = await this.drinksRepository.findAll();
      const skuExists = existing.some((d) => d.id !== id && d.sku === dto.sku);
      
      if (skuExists) {
        throw new BadRequestException(`Ya existe un insumo con el SKU "${dto.sku}"`);
      }
    }

    // If the drink has associations, only SKU can be changed
    const isChangingName = dto.name !== undefined && dto.name !== drink.name;
    const isChangingBrand = dto.brand !== undefined && dto.brand !== drink.brand;
    const isChangingVolume = dto.volume !== undefined && dto.volume !== drink.volume;
    const isChangingType = dto.drinkType !== undefined && dto.drinkType !== drink.drinkType;

    if (isChangingName || isChangingBrand || isChangingVolume || isChangingType) {
      const hasAssoc = await this.drinksRepository.hasAssociations(id);
      if (hasAssoc) {
        const lockedFields: string[] = [];
        if (isChangingName) lockedFields.push('nombre');
        if (isChangingBrand) lockedFields.push('marca');
        if (isChangingVolume) lockedFields.push('volumen');
        if (isChangingType) lockedFields.push('tipo');
        throw new ConflictException(
          `No se puede modificar ${lockedFields.join(', ')} porque este insumo tiene stock, recetas o movimientos asociados. Solo se puede editar el SKU.`,
        );
      }
    }

    // Check for duplicates after edit (name + brand + volume + type) - only relevant if no associations
    const finalName = (dto.name ?? drink.name).toLowerCase().trim();
    const finalBrand = (dto.brand ?? drink.brand).toLowerCase().trim();
    const finalVolume = dto.volume ?? drink.volume;
    const finalType = dto.drinkType ?? drink.drinkType;

    const existing = await this.drinksRepository.findAll();
    const wouldDuplicate = existing.some(
      (d) =>
        d.id !== id &&
        d.name.toLowerCase() === finalName &&
        d.brand.toLowerCase() === finalBrand &&
        d.volume === finalVolume &&
        d.drinkType === finalType,
    );
    if (wouldDuplicate) {
      throw new BadRequestException(
        'Ya existe un insumo con el mismo nombre, marca, volumen y tipo.',
      );
    }

    return this.drinksRepository.update(id, dto);
  }

  /**
   * Delete a drink - blocked if it has associations
   */
  async delete(id: number): Promise<void> {
    await this.findOne(id);

    const hasAssoc = await this.drinksRepository.hasAssociations(id);
    if (hasAssoc) {
      throw new ConflictException(
        'No se puede eliminar este insumo porque tiene stock, recetas o movimientos asociados.',
      );
    }

    await this.drinksRepository.delete(id);
  }
}
