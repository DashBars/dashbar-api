import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { CocktailsRepository } from './cocktails.repository';
import { CreateCocktailDto, UpdateCocktailDto } from './dto';
import { Cocktail } from '@prisma/client';

@Injectable()
export class CocktailsService {
  constructor(private readonly cocktailsRepository: CocktailsRepository) {}

  /**
   * Create a new cocktail
   */
  async create(dto: CreateCocktailDto): Promise<Cocktail> {
    // Check for duplicate SKU if provided
    if (dto.sku) {
      const existing = await this.cocktailsRepository.findBySku(dto.sku);
      if (existing) {
        throw new ConflictException(`Cocktail with SKU "${dto.sku}" already exists`);
      }
    }

    return this.cocktailsRepository.create({
      name: dto.name,
      description: dto.description,
      imageUrl: dto.imageUrl,
      sku: dto.sku,
      price: dto.price,
      volume: dto.volume,
      isActive: dto.isActive ?? true,
      isCombo: dto.isCombo ?? false,
    });
  }

  /**
   * Get all cocktails
   */
  async findAll(includeInactive: boolean = false): Promise<Cocktail[]> {
    return this.cocktailsRepository.findAll(includeInactive);
  }

  /**
   * Get a specific cocktail by ID
   */
  async findOne(id: number): Promise<Cocktail> {
    const cocktail = await this.cocktailsRepository.findById(id);

    if (!cocktail) {
      throw new NotFoundException(`Cocktail with ID ${id} not found`);
    }

    return cocktail;
  }

  /**
   * Get a cocktail by SKU
   */
  async findBySku(sku: string): Promise<Cocktail> {
    const cocktail = await this.cocktailsRepository.findBySku(sku);

    if (!cocktail) {
      throw new NotFoundException(`Cocktail with SKU "${sku}" not found`);
    }

    return cocktail;
  }

  /**
   * Update a cocktail
   */
  async update(id: number, dto: UpdateCocktailDto): Promise<Cocktail> {
    await this.findOne(id);

    // Check for duplicate SKU if updating
    if (dto.sku) {
      const existing = await this.cocktailsRepository.findBySku(dto.sku);
      if (existing && existing.id !== id) {
        throw new ConflictException(`Cocktail with SKU "${dto.sku}" already exists`);
      }
    }

    return this.cocktailsRepository.update(id, dto);
  }

  /**
   * Deactivate a cocktail (soft delete)
   */
  async deactivate(id: number): Promise<Cocktail> {
    await this.findOne(id);
    return this.cocktailsRepository.deactivate(id);
  }

  /**
   * Hard delete a cocktail (use with caution)
   */
  async delete(id: number): Promise<void> {
    await this.findOne(id);
    await this.cocktailsRepository.delete(id);
  }

  /**
   * Get cocktail with categories
   */
  async findWithCategories(id: number) {
    const cocktail = await this.cocktailsRepository.findWithCategories(id);

    if (!cocktail) {
      throw new NotFoundException(`Cocktail with ID ${id} not found`);
    }

    return cocktail;
  }

  /**
   * Search cocktails by name, description, or SKU
   */
  async search(query: string): Promise<Cocktail[]> {
    return this.cocktailsRepository.search(query);
  }
}
