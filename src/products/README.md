# Módulo de Productos

Este módulo reemplaza el sistema anterior de precios (`EventPrice`) con un sistema más flexible que permite crear productos personalizados y combos.

## Características

- **Productos Personalizados**: Asigna nombres personalizados a productos (ej: "Combo Coca + Sprite")
- **Soporte de Combos**: Un producto puede contener múltiples cocktails
- **Precios Flexibles**: Un precio único por producto, independientemente de cuántos cocktails contenga
- **Niveles de Precio**:
  - Producto a nivel de evento (barId = null)
  - Producto específico por barra (barId = set)

## Modelo de Datos

### EventProduct
```typescript
{
  id: number;
  eventId: number;
  barId: number | null;  // null = evento, set = barra específica
  name: string;          // "Combo Coca + Sprite", "Fernet solo", etc.
  price: number;         // Precio en centavos
  isCombo: boolean;      // true si contiene múltiples cocktails
  cocktails: EventProductCocktail[];
}
```

### EventProductCocktail (Join Table)
```typescript
{
  eventProductId: number;
  cocktailId: number;
}
```

## API Endpoints

### Crear Producto
```http
POST /events/:eventId/products
Authorization: Bearer <token>

Body:
{
  "name": "Combo Coca + Sprite",
  "price": 5000,           // En centavos (50.00)
  "cocktailIds": [1, 2],   // IDs de los cocktails
  "barId": null            // Opcional, null = evento
}

Response:
{
  "id": 1,
  "eventId": 1,
  "barId": null,
  "name": "Combo Coca + Sprite",
  "price": 5000,
  "isCombo": true,
  "cocktails": [
    {
      "eventProductId": 1,
      "cocktailId": 1,
      "cocktail": {
        "id": 1,
        "name": "Coca Cola",
        "price": 3000
      }
    },
    {
      "eventProductId": 1,
      "cocktailId": 2,
      "cocktail": {
        "id": 2,
        "name": "Sprite",
        "price": 3000
      }
    }
  ]
}
```

### Listar Productos de un Evento
```http
GET /events/:eventId/products

Response:
[
  {
    "id": 1,
    "name": "Combo Coca + Sprite",
    "price": 5000,
    "isCombo": true,
    ...
  },
  ...
]
```

### Listar Productos de una Barra
```http
GET /events/:eventId/bars/:barId/products

Response: Array de productos específicos de esa barra
```

### Obtener un Producto
```http
GET /events/:eventId/products/:productId

Response:
{
  "id": 1,
  "name": "Combo Coca + Sprite",
  "price": 5000,
  "isCombo": true,
  "cocktails": [...]
}
```

### Actualizar Producto
```http
PUT /events/:eventId/products/:productId
Authorization: Bearer <token>

Body (todos los campos opcionales):
{
  "name": "Nuevo Nombre",
  "price": 6000,
  "cocktailIds": [1, 2, 3]  // Reemplaza los cocktails existentes
}

Response: Producto actualizado
```

### Eliminar Producto
```http
DELETE /events/:eventId/products/:productId
Authorization: Bearer <token>

Response:
{
  "message": "Product deleted successfully"
}
```

## Lógica de Negocio

### Detección Automática de Combos
- Si `cocktailIds.length > 1`, `isCombo` se establece automáticamente en `true`
- Si `cocktailIds.length === 1`, `isCombo` se establece en `false`

### Validaciones
- El usuario debe ser dueño del evento para crear/modificar productos
- Todos los cocktails especificados deben existir
- El nombre del producto es obligatorio
- El precio debe ser mayor a 0

### Jerarquía de Precios
1. **Producto de Barra** (barId set): Tiene prioridad sobre el producto del evento
2. **Producto de Evento** (barId null): Precio por defecto si no hay override de barra

## Migración desde EventPrice

El modelo anterior `EventPrice` está deprecado pero sigue funcionando. Para migrar:

1. Los datos de `EventPrice` no se eliminan automáticamente
2. Crear productos equivalentes usando la API de productos
3. El frontend debe migrar a usar `/products` en lugar de `/prices`

## Ejemplos de Uso

### Producto Simple (1 Cocktail)
```json
{
  "name": "Fernet solo",
  "price": 4000,
  "cocktailIds": [5]
}
```

### Combo (Múltiples Cocktails)
```json
{
  "name": "Promo 2x1 Cervezas",
  "price": 7000,
  "cocktailIds": [10, 11]
}
```

### Producto Específico de Barra
```json
{
  "name": "Combo VIP",
  "price": 12000,
  "cocktailIds": [1, 2, 3],
  "barId": 5
}
```

## Testing

Ejecutar tests:
```bash
npm test -- products.service.spec
```

## Arquitectura

```
products/
├── dto/
│   ├── create-product.dto.ts    # Validación para crear producto
│   ├── update-product.dto.ts    # Validación para actualizar producto
│   └── index.ts
├── products.controller.ts        # Endpoints REST
├── products.service.ts           # Lógica de negocio
├── products.repository.ts        # Acceso a datos (Prisma)
├── products.service.spec.ts      # Tests unitarios
└── products.module.ts            # Configuración del módulo
```
