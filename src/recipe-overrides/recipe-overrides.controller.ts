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
import { RecipeOverridesService } from './recipe-overrides.service';
import { CreateRecipeOverrideDto, UpdateRecipeOverrideDto } from './dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@prisma/client';

@Controller('events/:eventId/bars/:barId/recipe-overrides')
export class RecipeOverridesController {
  constructor(private readonly service: RecipeOverridesService) {}

  @Post()
  create(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
    @CurrentUser() user: User,
    @Body() dto: CreateRecipeOverrideDto,
  ) {
    return this.service.create(eventId, barId, user.id, dto);
  }

  @Get()
  findAll(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
    @CurrentUser() user: User,
  ) {
    return this.service.findAllByBar(eventId, barId, user.id);
  }

  @Get('cocktail/:cocktailId')
  findByCocktail(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
    @Param('cocktailId', ParseIntPipe) cocktailId: number,
    @CurrentUser() user: User,
  ) {
    return this.service.findByCocktail(eventId, barId, cocktailId, user.id);
  }

  @Get(':overrideId')
  findOne(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
    @Param('overrideId', ParseIntPipe) overrideId: number,
    @CurrentUser() user: User,
  ) {
    return this.service.findOne(eventId, barId, overrideId, user.id);
  }

  @Put(':overrideId')
  update(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
    @Param('overrideId', ParseIntPipe) overrideId: number,
    @CurrentUser() user: User,
    @Body() dto: UpdateRecipeOverrideDto,
  ) {
    return this.service.update(eventId, barId, overrideId, user.id, dto);
  }

  @Delete(':overrideId')
  delete(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
    @Param('overrideId', ParseIntPipe) overrideId: number,
    @CurrentUser() user: User,
  ) {
    return this.service.delete(eventId, barId, overrideId, user.id);
  }

  @Delete('cocktail/:cocktailId')
  deleteByCocktail(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
    @Param('cocktailId', ParseIntPipe) cocktailId: number,
    @CurrentUser() user: User,
  ) {
    return this.service.deleteByCocktail(eventId, barId, cocktailId, user.id);
  }
}
