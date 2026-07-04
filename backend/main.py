import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from psycopg2 import OperationalError

from models import (
    CancelOrderRequest,
    CancelOrderResponse,
    ChatRequest,
    ChatResponse,
    CompleteOrderRequest,
    CompleteOrderResponse,
    CreateOrderRequest,
    CreateOrderResponse,
    MenuAvailabilityResponse,
    NewTableRequest,
    NewTableResponse,
    OrderOut,
    OrdersPerHourResponse,
    PaymentMixResponse,
    SalesDailyResponse,
    SetAvailabilityRequest,
    TableOut,
    TopProductsResponse,
)
from queries import (
    OrderAlreadyTerminalError,
    OrderNotFoundError,
    TableAlreadyExistsError,
    cancel_order,
    complete_order,
    create_order,
    create_store_table,
    list_menu_availability,
    list_orders,
    list_store_tables,
    orders_per_hour,
    payment_mix,
    sales_daily,
    set_menu_availability,
    top_products,
    update_order,
)
from chat_service import answer_analytics_question
from openrouter_client import OpenRouterError

app = FastAPI(
    title='SliceMatic API',
    description='Order backend for SliceMatic — maps to sql/schema.sql',
    version='0.1.0',
)

# Comma-separated origins from env (add your Vercel domain in production);
# falls back to the local Vite dev origins.
_DEFAULT_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173'
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv('ALLOWED_ORIGINS', _DEFAULT_ORIGINS).split(',')
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.get('/health')
def health():
    return {'status': 'ok'}


@app.post('/api/orders', response_model=CreateOrderResponse, status_code=201)
def create_order_api(payload: CreateOrderRequest):
    try:
        result = create_order(payload)
    except OperationalError as exc:
        raise HTTPException(
            status_code=503,
            detail=f'Database unavailable: {exc}',
        ) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return CreateOrderResponse(**result)


@app.get('/api/orders', response_model=list[OrderOut])
def list_orders_api():
    try:
        return list_orders()
    except OperationalError as exc:
        raise HTTPException(
            status_code=503,
            detail=f'Database unavailable: {exc}',
        ) from exc


@app.post('/api/complete_order', response_model=CompleteOrderResponse)
def complete_order_api(payload: CompleteOrderRequest):
    try:
        return complete_order(payload.order_id)
    except OrderNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except OrderAlreadyTerminalError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except OperationalError as exc:
        raise HTTPException(
            status_code=503,
            detail=f'Database unavailable: {exc}',
        ) from exc


@app.post('/api/cancel_order', response_model=CancelOrderResponse)
def cancel_order_api(payload: CancelOrderRequest):
    try:
        return cancel_order(payload.order_id, payload.reason)
    except OrderNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except OrderAlreadyTerminalError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except OperationalError as exc:
        raise HTTPException(
            status_code=503,
            detail=f'Database unavailable: {exc}',
        ) from exc


@app.put('/api/orders/{order_id}', response_model=CreateOrderResponse)
def update_order_api(order_id: str, payload: CreateOrderRequest):
    try:
        return update_order(order_id, payload)
    except OrderNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except OrderAlreadyTerminalError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except OperationalError as exc:
        raise HTTPException(
            status_code=503,
            detail=f'Database unavailable: {exc}',
        ) from exc


@app.get('/api/tables', response_model=list[TableOut])
def list_tables_api():
    try:
        return list_store_tables()
    except OperationalError as exc:
        raise HTTPException(
            status_code=503,
            detail=f'Database unavailable: {exc}',
        ) from exc


@app.post('/api/new_table', response_model=NewTableResponse, status_code=201)
def new_table_api(payload: NewTableRequest):
    try:
        return create_store_table(payload.table_number)
    except TableAlreadyExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except OperationalError as exc:
        raise HTTPException(
            status_code=503,
            detail=f'Database unavailable: {exc}',
        ) from exc


@app.get('/api/menu/availability', response_model=MenuAvailabilityResponse)
def menu_availability_api(item_type: str = 'pizza'):
    try:
        return MenuAvailabilityResponse(items=list_menu_availability(item_type))
    except OperationalError as exc:
        raise HTTPException(
            status_code=503,
            detail=f'Database unavailable: {exc}',
        ) from exc


@app.post('/api/menu/set_availability', response_model=MenuAvailabilityResponse)
def set_menu_availability_api(payload: SetAvailabilityRequest):
    try:
        set_menu_availability(
            payload.item_id,
            payload.is_sold_out,
            payload.item_type,
            payload.item_name,
        )
        return MenuAvailabilityResponse(items=list_menu_availability(payload.item_type))
    except OperationalError as exc:
        raise HTTPException(
            status_code=503,
            detail=f'Database unavailable: {exc}',
        ) from exc


@app.get('/api/analytics/orders_per_hour', response_model=OrdersPerHourResponse)
def orders_per_hour_api():
    try:
        return orders_per_hour()
    except OperationalError as exc:
        raise HTTPException(
            status_code=503,
            detail=f'Database unavailable: {exc}',
        ) from exc


@app.get('/api/analytics/top_products', response_model=TopProductsResponse)
def top_products_api(limit: int = 8):
    try:
        return top_products(max(1, min(limit, 50)))
    except OperationalError as exc:
        raise HTTPException(status_code=503, detail=f'Database unavailable: {exc}') from exc


@app.get('/api/analytics/sales_daily', response_model=SalesDailyResponse)
def sales_daily_api(days: int = 7):
    try:
        return sales_daily(max(1, min(days, 90)))
    except OperationalError as exc:
        raise HTTPException(status_code=503, detail=f'Database unavailable: {exc}') from exc


@app.get('/api/analytics/payment_mix', response_model=PaymentMixResponse)
def payment_mix_api(days: int = 7):
    try:
        return payment_mix(max(1, min(days, 90)))
    except OperationalError as exc:
        raise HTTPException(status_code=503, detail=f'Database unavailable: {exc}') from exc


@app.post('/api/analytics/chat', response_model=ChatResponse)
def analytics_chat_api(payload: ChatRequest):
    try:
        result = answer_analytics_question(
            payload.message,
            [t.model_dump() for t in payload.history],
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except OpenRouterError as exc:
        code = exc.status_code or 502
        raise HTTPException(status_code=code, detail=str(exc)) from exc
    except OperationalError as exc:
        raise HTTPException(
            status_code=503,
            detail=f'Database unavailable: {exc}',
        ) from exc

    return ChatResponse(**result)
