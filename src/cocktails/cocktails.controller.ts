import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  ParseBoolPipe,
} from '@nestjs/common';
import { CocktailsService } from './cocktails.service';
import { CreateCocktailDto, UpdateCocktailDto } from './dto';

@Controller('cocktails')
export class CocktailsController {
  constructor(private readonly cocktailsService: CocktailsService) {}

  @Post()
  create(@Body() dto: CreateCocktailDto) {
    return this.cocktailsService.create(dto);
  }

  @Get()
  findAll(
    @Query('includeInactive', new ParseBoolPipe({ optional: true }))
    includeInactive?: boolean,
  ) {
    return this.cocktailsService.findAll(includeInactive ?? false);
  }

  @Get('search')
  search(@Query('q') query: string) {
    return this.cocktailsService.search(query || '');
  }

  @Get('sku/:sku')
  findBySku(@Param('sku') sku: string) {
    return this.cocktailsService.findBySku(sku);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.cocktailsService.findOne(id);
  }

  @Get(':id/categories')
  findWithCategories(@Param('id', ParseIntPipe) id: number) {
    return this.cocktailsService.findWithCategories(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCocktailDto,
  ) {
    return this.cocktailsService.update(id, dto);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id', ParseIntPipe) id: number) {
    return this.cocktailsService.deactivate(id);
  }

  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.cocktailsService.delete(id);
  }
}
