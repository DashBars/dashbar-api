import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post('events/:eventId/products')
  async createProduct(
    @Param('eventId', ParseIntPipe) eventId: number,
    @CurrentUser('id') userId: number,
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.create(eventId, userId, dto);
  }

  @Get('events/:eventId/products')
  async getEventProducts(@Param('eventId', ParseIntPipe) eventId: number) {
    return this.productsService.findAllByEvent(eventId);
  }

  @Get('events/:eventId/bars/:barId/products')
  async getBarProducts(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('barId', ParseIntPipe) barId: number,
  ) {
    return this.productsService.findAllByEventAndBar(eventId, barId);
  }

  @Get('events/:eventId/products/:productId')
  async getProduct(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    return this.productsService.findOne(eventId, productId);
  }

  @Put('events/:eventId/products/:productId')
  async updateProduct(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('productId', ParseIntPipe) productId: number,
    @CurrentUser('id') userId: number,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(eventId, productId, userId, dto);
  }

  @Delete('events/:eventId/products/:productId')
  async deleteProduct(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('productId', ParseIntPipe) productId: number,
    @CurrentUser('id') userId: number,
  ) {
    await this.productsService.delete(eventId, productId, userId);
    return { message: 'Product deleted successfully' };
  }
}
