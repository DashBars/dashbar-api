import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  Headers,
} from '@nestjs/common';
import { RecipesService } from './recipes.service';
import { CreateRecipeDto, UpdateRecipeDto } from './dto';
import { BarType } from '@prisma/client';

@Controller('events/:eventId/recipes')
export class RecipesController {
  constructor(private readonly recipesService: RecipesService) {}

  @Post()
  create(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Headers('x-user-id') userId: string,
    @Body() dto: CreateRecipeDto,
  ) {
    return this.recipesService.create(eventId, parseInt(userId, 10), dto);
  }

  @Get()
  findAll(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Query('barType') barType?: BarType,
  ) {
    if (barType) {
      return this.recipesService.findByBarType(eventId, barType);
    }
    return this.recipesService.findAllByEvent(eventId);
  }

  @Get(':recipeId')
  findOne(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('recipeId', ParseIntPipe) recipeId: number,
  ) {
    return this.recipesService.findOne(eventId, recipeId);
  }

  @Get('cocktail/:cocktailId')
  getRecipeForCocktail(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('cocktailId', ParseIntPipe) cocktailId: number,
    @Query('barType') barType: BarType,
  ) {
    return this.recipesService.getRecipeForCocktail(eventId, barType, cocktailId);
  }

  @Put(':recipeId')
  update(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('recipeId', ParseIntPipe) recipeId: number,
    @Headers('x-user-id') userId: string,
    @Body() dto: UpdateRecipeDto,
  ) {
    return this.recipesService.update(eventId, recipeId, parseInt(userId, 10), dto);
  }

  @Delete(':recipeId')
  delete(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('recipeId', ParseIntPipe) recipeId: number,
    @Headers('x-user-id') userId: string,
  ) {
    return this.recipesService.delete(eventId, recipeId, parseInt(userId, 10));
  }

  @Post('copy')
  copyRecipes(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Headers('x-user-id') userId: string,
    @Query('from') fromBarType: BarType,
    @Query('to') toBarType: BarType,
  ) {
    return this.recipesService.copyRecipes(
      eventId,
      parseInt(userId, 10),
      fromBarType,
      toBarType,
    );
  }
}
