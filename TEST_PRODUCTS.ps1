# Comandos para Probar Módulo de Productos

## Variables
$TOKEN = "tu_token_aqui"
$EVENT_ID = 1
$BASE_URL = "http://localhost:3000"

## 1. Crear Producto Simple (1 cocktail)
$body = @{
    name = "Fernet Solo"
    price = 4000
    cocktailIds = @(1)
} | ConvertTo-Json

Invoke-RestMethod -Uri "$BASE_URL/events/$EVENT_ID/products" `
    -Method POST `
    -Headers @{ Authorization = "Bearer $TOKEN" } `
    -ContentType "application/json" `
    -Body $body

## 2. Crear Combo (múltiples cocktails)
$body = @{
    name = "Combo Coca + Sprite"
    price = 5000
    cocktailIds = @(1, 2)
} | ConvertTo-Json

Invoke-RestMethod -Uri "$BASE_URL/events/$EVENT_ID/products" `
    -Method POST `
    -Headers @{ Authorization = "Bearer $TOKEN" } `
    -ContentType "application/json" `
    -Body $body

## 3. Listar Productos del Evento
Invoke-RestMethod -Uri "$BASE_URL/events/$EVENT_ID/products" `
    -Method GET `
    -Headers @{ Authorization = "Bearer $TOKEN" }

## 4. Obtener Producto Específico
$PRODUCT_ID = 1
Invoke-RestMethod -Uri "$BASE_URL/events/$EVENT_ID/products/$PRODUCT_ID" `
    -Method GET `
    -Headers @{ Authorization = "Bearer $TOKEN" }

## 5. Actualizar Producto
$PRODUCT_ID = 1
$body = @{
    name = "Combo Actualizado"
    price = 6000
    cocktailIds = @(1, 2, 3)
} | ConvertTo-Json

Invoke-RestMethod -Uri "$BASE_URL/events/$EVENT_ID/products/$PRODUCT_ID" `
    -Method PUT `
    -Headers @{ Authorization = "Bearer $TOKEN" } `
    -ContentType "application/json" `
    -Body $body

## 6. Eliminar Producto
$PRODUCT_ID = 1
Invoke-RestMethod -Uri "$BASE_URL/events/$EVENT_ID/products/$PRODUCT_ID" `
    -Method DELETE `
    -Headers @{ Authorization = "Bearer $TOKEN" }

## 7. Crear Producto de Barra Específica
$BAR_ID = 1
$body = @{
    name = "Combo VIP Barra 1"
    price = 12000
    cocktailIds = @(1, 2, 3, 4)
    barId = $BAR_ID
} | ConvertTo-Json

Invoke-RestMethod -Uri "$BASE_URL/events/$EVENT_ID/products" `
    -Method POST `
    -Headers @{ Authorization = "Bearer $TOKEN" } `
    -ContentType "application/json" `
    -Body $body

## 8. Listar Productos de una Barra
$BAR_ID = 1
Invoke-RestMethod -Uri "$BASE_URL/events/$EVENT_ID/bars/$BAR_ID/products" `
    -Method GET `
    -Headers @{ Authorization = "Bearer $TOKEN" }
