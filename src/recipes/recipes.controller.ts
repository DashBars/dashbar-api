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
} from '@nestjs/common';
import { RecipesService } from './recipes.service';
import { CreateRecipeDto, UpdateRecipeDto } from './dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, BarType } from '@prisma/client';

@Controller('events/:eventId/recipes')
export class RecipesController {
  constructor(private readonly recipesService: RecipesService) {}

  @Post()
  create(
    @Param('eventId', ParseIntPipe) eventId: number,
    @CurrentUser() user: User,
    @Body() dto: CreateRecipeDto,
  ) {
    return this.recipesService.create(eventId, user.id, dto);
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
    @CurrentUser() user: User,
    @Body() dto: UpdateRecipeDto,
  ) {
    return this.recipesService.update(eventId, recipeId, user.id, dto);
  }

  @Delete(':recipeId')
  delete(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('recipeId', ParseIntPipe) recipeId: number,
    @CurrentUser() user: User,
  ) {
    return this.recipesService.delete(eventId, recipeId, user.id);
  }

  @Post('copy')
  copyRecipes(
    @Param('eventId', ParseIntPipe) eventId: number,
    @CurrentUser() user: User,
    @Query('from') fromBarType: BarType,
    @Query('to') toBarType: BarType,
  ) {
    return this.recipesService.copyRecipes(eventId, user.id, fromBarType, toBarType);
  }
}
