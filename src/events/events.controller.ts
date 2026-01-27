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
import { EventsService } from './events.service';
import { CreateEventDto, UpdateEventDto, ActivateEventDto } from './dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { User, UserRole } from '@prisma/client';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @Roles(UserRole.manager, UserRole.admin)
  create(@CurrentUser() user: User, @Body() dto: CreateEventDto) {
    return this.eventsService.create(user.id, dto);
  }

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.eventsService.findAllByOwner(user.id);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.eventsService.findById(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventsService.update(id, user.id, dto);
  }

  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.eventsService.delete(id, user.id);
  }

  @Post(':id/start')
  @Roles(UserRole.manager, UserRole.admin)
  startEvent(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.eventsService.startEvent(id, user.id);
  }

  @Post(':id/activate')
  @Roles(UserRole.manager, UserRole.admin)
  activateEvent(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
    @Body() dto: ActivateEventDto,
  ) {
    return this.eventsService.activateEvent(id, user.id, dto);
  }

  @Post(':id/finish')
  @Roles(UserRole.manager, UserRole.admin)
  finishEvent(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.eventsService.finishEvent(id, user.id);
  }

  @Post(':id/archive')
  @Roles(UserRole.manager, UserRole.admin)
  archiveEvent(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.eventsService.archiveEvent(id, user.id);
  }
}
