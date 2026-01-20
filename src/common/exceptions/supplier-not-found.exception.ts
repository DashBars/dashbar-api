import { NotFoundException } from '@nestjs/common';

export class SupplierNotFoundException extends NotFoundException {
  constructor(supplierId: number) {
    super(`Supplier with ID ${supplierId} not found`);
  }
}
