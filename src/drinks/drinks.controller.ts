import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Query,
  Param,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { DrinksService } from './drinks.service';
import { CreateDrinkDto, UpdateDrinkDto } from './dto';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('drinks')
export class DrinksController {
  constructor(private readonly drinksService: DrinksService) {}

  /**
   * Get all drinks
   */
  @Public()
  @Get()
  findAll() {
    return this.drinksService.findAll();
  }

  /**
   * Search drinks by name, brand, or SKU
   */
  @Public()
  @Get('search')
  search(@Query('q') query?: string) {
    return this.drinksService.search(query || '');
  }

  /**
   * Get a specific drink by ID
   */
  @Public()
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.drinksService.findOne(id);
  }

  /**
   * Create a new drink
   */
  @Post()
  @Roles(UserRole.manager, UserRole.admin)
  create(@Body() dto: CreateDrinkDto) {
    return this.drinksService.create(dto);
  }

  /**
   * Update a drink
   */
  @Patch(':id')
  @Roles(UserRole.manager, UserRole.admin)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDrinkDto,
  ) {
    return this.drinksService.update(id, dto);
  }

  /**
   * Delete a drink
   */
  @Delete(':id')
  @Roles(UserRole.manager, UserRole.admin)
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.drinksService.delete(id);
  }
}
