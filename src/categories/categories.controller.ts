import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto, AssignCocktailsDto } from './dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@prisma/client';

@Controller('events/:eventId/categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  create(
    @Param('eventId', ParseIntPipe) eventId: number,
    @CurrentUser() user: User,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.categoriesService.create(eventId, user.id, dto);
  }

  @Get()
  findAll(@Param('eventId', ParseIntPipe) eventId: number) {
    return this.categoriesService.findAllByEvent(eventId);
  }

  @Get(':categoryId')
  findOne(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('categoryId', ParseIntPipe) categoryId: number,
  ) {
    return this.categoriesService.findOne(eventId, categoryId);
  }

  @Put(':categoryId')
  update(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('categoryId', ParseIntPipe) categoryId: number,
    @CurrentUser() user: User,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(eventId, categoryId, user.id, dto);
  }

  @Delete(':categoryId')
  delete(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('categoryId', ParseIntPipe) categoryId: number,
    @CurrentUser() user: User,
  ) {
    return this.categoriesService.delete(eventId, categoryId, user.id);
  }

  @Post(':categoryId/cocktails')
  assignCocktails(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('categoryId', ParseIntPipe) categoryId: number,
    @CurrentUser() user: User,
    @Body() dto: AssignCocktailsDto,
  ) {
    return this.categoriesService.assignCocktails(eventId, categoryId, user.id, dto);
  }

  @Delete(':categoryId/cocktails/:cocktailId')
  removeCocktail(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('categoryId', ParseIntPipe) categoryId: number,
    @Param('cocktailId', ParseIntPipe) cocktailId: number,
    @CurrentUser() user: User,
  ) {
    return this.categoriesService.removeCocktail(eventId, categoryId, cocktailId, user.id);
  }
}
