import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { TransfersService } from './transfers.service';
import { CreateTransferDto } from './dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, TransferStatus } from '@prisma/client';

@Controller('events/:eventId/transfers')
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Post()
  createTransfer(
    @Param('eventId', ParseIntPipe) eventId: number,
    @CurrentUser() user: User,
    @Body() dto: CreateTransferDto,
  ) {
    return this.transfersService.createTransfer(eventId, user.id, dto);
  }

  @Get()
  findAllTransfers(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Query('status') status?: TransferStatus,
  ) {
    return this.transfersService.findAllTransfers(eventId, status);
  }

  @Get(':transferId')
  findTransfer(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('transferId', ParseIntPipe) transferId: number,
  ) {
    return this.transfersService.findTransfer(eventId, transferId);
  }

  @Patch(':transferId/approve')
  approveTransfer(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('transferId', ParseIntPipe) transferId: number,
    @CurrentUser() user: User,
  ) {
    return this.transfersService.approveTransfer(eventId, transferId, user.id);
  }

  @Patch(':transferId/reject')
  rejectTransfer(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('transferId', ParseIntPipe) transferId: number,
    @CurrentUser() user: User,
  ) {
    return this.transfersService.rejectTransfer(eventId, transferId, user.id);
  }

  @Patch(':transferId/complete')
  completeTransfer(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('transferId', ParseIntPipe) transferId: number,
    @CurrentUser() user: User,
  ) {
    return this.transfersService.completeTransfer(eventId, transferId, user.id);
  }

  @Patch(':transferId/cancel')
  cancelTransfer(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('transferId', ParseIntPipe) transferId: number,
    @CurrentUser() user: User,
  ) {
    return this.transfersService.cancelTransfer(eventId, transferId, user.id);
  }
}
