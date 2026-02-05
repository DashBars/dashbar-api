import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { GlobalInventoryService } from './global-inventory.service';
import { CreateGlobalInventoryDto, UpdateGlobalInventoryDto } from './dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { User, UserRole } from '@prisma/client';

@Controller('global-inventory')
export class GlobalInventoryController {
  constructor(
    private readonly globalInventoryService: GlobalInventoryService,
  ) {}

  @Get()
  @Roles(UserRole.manager, UserRole.admin)
  findAll(@CurrentUser() user: User) {
    return this.globalInventoryService.findAllByOwner(user.id);
  }

  @Get(':id')
  @Roles(UserRole.manager, UserRole.admin)
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return this.globalInventoryService.findOne(id, user.id);
  }

  @Post()
  @Roles(UserRole.manager, UserRole.admin)
  create(
    @CurrentUser() user: User,
    @Body() dto: CreateGlobalInventoryDto,
  ) {
    return this.globalInventoryService.create(user.id, dto);
  }

  @Patch(':id')
  @Roles(UserRole.manager, UserRole.admin)
  update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
    @Body() dto: UpdateGlobalInventoryDto,
  ) {
    return this.globalInventoryService.update(id, user.id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.manager, UserRole.admin)
  delete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return this.globalInventoryService.delete(id, user.id);
  }
}
