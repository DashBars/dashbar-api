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
import { ManagerInventoryService } from './manager-inventory.service';
import {
  CreateManagerInventoryDto,
  UpdateManagerInventoryDto,
  TransferToBarDto,
} from './dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { User, UserRole } from '@prisma/client';

@Controller('manager-inventory')
export class ManagerInventoryController {
  constructor(
    private readonly managerInventoryService: ManagerInventoryService,
  ) {}

  @Post()
  @Roles(UserRole.manager, UserRole.admin)
  create(@CurrentUser() user: User, @Body() dto: CreateManagerInventoryDto) {
    return this.managerInventoryService.create(user.id, dto);
  }

  @Get()
  @Roles(UserRole.manager, UserRole.admin)
  findAll(@CurrentUser() user: User) {
    return this.managerInventoryService.findAllByOwner(user.id);
  }

  @Get(':id')
  @Roles(UserRole.manager, UserRole.admin)
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return this.managerInventoryService.findOne(id, user.id);
  }

  @Patch(':id')
  @Roles(UserRole.manager, UserRole.admin)
  update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
    @Body() dto: UpdateManagerInventoryDto,
  ) {
    return this.managerInventoryService.update(id, user.id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.manager, UserRole.admin)
  delete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return this.managerInventoryService.delete(id, user.id);
  }

  @Post(':id/transfer')
  @Roles(UserRole.manager, UserRole.admin)
  transferToBar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
    @Body() dto: TransferToBarDto,
  ) {
    return this.managerInventoryService.transferToBar(id, user.id, dto);
  }

  @Get(':id/allocations')
  @Roles(UserRole.manager, UserRole.admin)
  getAllocations(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return this.managerInventoryService.getAllocations(id, user.id);
  }
}
