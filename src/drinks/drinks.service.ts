import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DrinksRepository } from './drinks.repository';
import { CreateDrinkDto, UpdateDrinkDto } from './dto';
import { Drink } from '@prisma/client';

@Injectable()
export class DrinksService {
  constructor(private readonly drinksRepository: DrinksRepository) {}

  /**
   * Get all drinks
   */
  async findAll(): Promise<Drink[]> {
    return this.drinksRepository.findAll();
  }

  /**
   * Search drinks by name, brand, or SKU
   */
  async search(query: string): Promise<Drink[]> {
    if (!query || query.trim().length === 0) {
      return this.findAll();
    }
    return this.drinksRepository.search(query.trim());
  }

  /**
   * Find a drink by ID
   */
  async findOne(id: number): Promise<Drink> {
    const drink = await this.drinksRepository.findById(id);
    if (!drink) {
      throw new NotFoundException(`Drink with ID ${id} not found`);
    }
    return drink;
  }

  /**
   * Create a new drink
   */
  async create(dto: CreateDrinkDto): Promise<Drink> {
    // Check if SKU already exists
    const existingBySku = await this.drinksRepository.findAll();
    const skuExists = existingBySku.some((d) => d.sku === dto.sku);
    
    if (skuExists) {
      throw new BadRequestException(`A drink with SKU "${dto.sku}" already exists`);
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
   */
  async update(id: number, dto: UpdateDrinkDto): Promise<Drink> {
    await this.findOne(id); // Ensure drink exists

    // Check SKU uniqueness if updating SKU
    if (dto.sku) {
      const existing = await this.drinksRepository.findAll();
      const skuExists = existing.some((d) => d.id !== id && d.sku === dto.sku);
      
      if (skuExists) {
        throw new BadRequestException(`A drink with SKU "${dto.sku}" already exists`);
      }
    }

    return this.drinksRepository.update(id, dto);
  }

  /**
   * Delete a drink
   */
  async delete(id: number): Promise<void> {
    await this.findOne(id); // Ensure drink exists
    await this.drinksRepository.delete(id);
  }
}
