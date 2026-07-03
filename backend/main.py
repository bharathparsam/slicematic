from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from psycopg2 import OperationalError

from models import (
    CompleteOrderRequest,
    CompleteOrderResponse,
    CreateOrderRequest,
    CreateOrderResponse,
    NewTableRequest,
    NewTableResponse,
    OrderOut,
    OrdersPerHourResponse,
    TableOut,
)
from queries import (
    OrderAlreadyTerminalError,
    OrderNotFoundError,
    TableAlreadyExistsError,
    complete_order,
    create_order,
    create_store_table,
    list_orders,
    list_store_tables,
    orders_per_hour,
)

app = FastAPI(
    title='SliceMatic API',
    description='Order backend for SliceMatic — maps to sql/schema.sql',
    version='0.1.0',
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:5173', 'http://127.0.0.1:5173'],
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


@app.get('/api/analytics/orders_per_hour', response_model=OrdersPerHourResponse)
def orders_per_hour_api():
    try:
        return orders_per_hour()
    except OperationalError as exc:
        raise HTTPException(
            status_code=503,
            detail=f'Database unavailable: {exc}',
        ) from exc
