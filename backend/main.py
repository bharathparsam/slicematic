import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from psycopg2 import OperationalError

from ai.briefing import generate_and_store_briefing, get_latest_briefing
from ai.chat_graph import get_thread_messages, run_chat
from ai.llm import LLMError
from analytics_summary import analytics_summary
from kitchen import (
    InvalidTransitionError,
    ItemNotFoundError,
    StaffNotFoundError,
    assign_kitchen_item,
    get_kitchen_queue,
    list_staff,
    transition_kitchen_item,
    verify_staff_pin,
)
from models import (
    AssignItemRequest,
    CancelOrderRequest,
    CancelOrderResponse,
    CompleteOrderRequest,
    CompleteOrderResponse,
    CooBriefingResponse,
    CooChatRequest,
    CooChatResponse,
    CreateOrderRequest,
    CreateOrderResponse,
    KitchenQueueItem,
    MenuAvailabilityResponse,
    NewTableRequest,
    NewTableResponse,
    OrderOut,
    OrdersPerHourResponse,
    PaymentMixResponse,
    SalesDailyResponse,
    SetAvailabilityRequest,
    CreateStaffRequest,
    StaffAdminOut,
    StaffOut,
    TableOut,
    UpdateStaffRequest,
    VerifyStaffRequest,
    SuggestionsResponse,
    TopProductsResponse,
    TransitionItemRequest,
)
from queries import (
    OrderAlreadyTerminalError,
    OrderNotFoundError,
    StaffNotFoundError as AdminStaffNotFoundError,
    TableAlreadyExistsError,
    cancel_order,
    complete_order,
    create_order,
    create_staff,
    create_store_table,
    deactivate_staff,
    list_menu_availability,
    list_orders,
    list_staff_admin,
    list_store_tables,
    orders_per_hour,
    payment_mix,
    sales_daily,
    sales_range,
    set_menu_availability,
    top_products,
    update_order,
    update_staff,
)
from suggestions import build_menu_suggestions, build_suggestions

app = FastAPI(
    title='SliceMatic API',
    description='Order backend for SliceMatic — maps to sql/schema.sql',
    version='0.2.0',
)

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


def _db_unavailable(exc: OperationalError):
    raise HTTPException(status_code=503, detail=f'Database unavailable: {exc}') from exc


def _llm_error(exc: LLMError):
    code = exc.status_code or 502
    raise HTTPException(status_code=code, detail=str(exc)) from exc


@app.get('/health')
def health():
    return {'status': 'ok'}


@app.post('/api/orders', response_model=CreateOrderResponse, status_code=201)
def create_order_api(payload: CreateOrderRequest):
    try:
        result = create_order(payload)
    except OperationalError as exc:
        _db_unavailable(exc)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return CreateOrderResponse(**result)


@app.get('/api/orders', response_model=list[OrderOut])
def list_orders_api():
    try:
        return list_orders()
    except OperationalError as exc:
        _db_unavailable(exc)


@app.post('/api/complete_order', response_model=CompleteOrderResponse)
def complete_order_api(payload: CompleteOrderRequest):
    try:
        return complete_order(payload.order_id)
    except OrderNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except OrderAlreadyTerminalError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except OperationalError as exc:
        _db_unavailable(exc)


@app.post('/api/cancel_order', response_model=CancelOrderResponse)
def cancel_order_api(payload: CancelOrderRequest):
    try:
        return cancel_order(payload.order_id, payload.reason)
    except OrderNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except OrderAlreadyTerminalError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except OperationalError as exc:
        _db_unavailable(exc)


@app.put('/api/orders/{order_id}', response_model=CreateOrderResponse)
def update_order_api(order_id: str, payload: CreateOrderRequest):
    try:
        return update_order(order_id, payload)
    except OrderNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except OrderAlreadyTerminalError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except OperationalError as exc:
        _db_unavailable(exc)


@app.get('/api/tables', response_model=list[TableOut])
def list_tables_api():
    try:
        return list_store_tables()
    except OperationalError as exc:
        _db_unavailable(exc)


@app.post('/api/new_table', response_model=NewTableResponse, status_code=201)
def new_table_api(payload: NewTableRequest):
    try:
        return create_store_table(payload.table_number)
    except TableAlreadyExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except OperationalError as exc:
        _db_unavailable(exc)


@app.get('/api/staff', response_model=list[StaffOut])
def list_staff_api():
    try:
        return list_staff()
    except OperationalError as exc:
        _db_unavailable(exc)


@app.post('/api/staff/verify', response_model=StaffOut)
def verify_staff_api(payload: VerifyStaffRequest):
    try:
        row = verify_staff_pin(payload.staff_id, payload.pin)
    except OperationalError as exc:
        _db_unavailable(exc)
    if not row:
        raise HTTPException(status_code=401, detail='Invalid PIN or inactive staff')
    return StaffOut(**row)


@app.get('/api/admin/staff', response_model=list[StaffAdminOut])
def list_staff_admin_api(include_inactive: bool = True):
    try:
        return list_staff_admin(include_inactive=include_inactive)
    except OperationalError as exc:
        _db_unavailable(exc)


@app.post('/api/admin/staff', response_model=StaffAdminOut, status_code=201)
def create_staff_api(payload: CreateStaffRequest):
    try:
        return create_staff(payload.full_name, payload.role, payload.pin)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except OperationalError as exc:
        _db_unavailable(exc)


@app.patch('/api/admin/staff/{staff_id}', response_model=StaffAdminOut)
def update_staff_api(staff_id: int, payload: UpdateStaffRequest):
    fields = payload.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=422, detail='No fields to update')
    try:
        pin_set = 'pin' in fields
        return update_staff(
            staff_id,
            full_name=fields.get('full_name'),
            role=fields.get('role'),
            pin=fields.get('pin'),
            pin_set=pin_set,
            is_active=fields.get('is_active'),
        )
    except AdminStaffNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except OperationalError as exc:
        _db_unavailable(exc)


@app.delete('/api/admin/staff/{staff_id}', response_model=StaffAdminOut)
def deactivate_staff_api(staff_id: int):
    try:
        return deactivate_staff(staff_id)
    except AdminStaffNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except OperationalError as exc:
        _db_unavailable(exc)


@app.get('/api/kitchen/queue', response_model=list[KitchenQueueItem])
def kitchen_queue_api():
    try:
        return get_kitchen_queue()
    except OperationalError as exc:
        _db_unavailable(exc)


@app.post('/api/kitchen/items/{item_id}/assign')
def assign_item_api(item_id: int, payload: AssignItemRequest):
    try:
        return assign_kitchen_item(item_id, payload.staff_id)
    except ItemNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except StaffNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidTransitionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except OperationalError as exc:
        _db_unavailable(exc)


@app.post('/api/kitchen/items/{item_id}/transition')
def transition_item_api(item_id: int, payload: TransitionItemRequest):
    try:
        return transition_kitchen_item(item_id, payload.to_status, payload.staff_id)
    except ItemNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except StaffNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidTransitionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except OperationalError as exc:
        _db_unavailable(exc)


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
        _db_unavailable(exc)


@app.get('/api/analytics/top_products', response_model=TopProductsResponse)
def top_products_api(limit: int = 8):
    try:
        return top_products(max(1, min(limit, 50)))
    except OperationalError as exc:
        _db_unavailable(exc)


@app.get('/api/analytics/sales_daily', response_model=SalesDailyResponse)
def sales_daily_api(days: int = 7):
    try:
        return sales_daily(max(1, min(days, 90)))
    except OperationalError as exc:
        _db_unavailable(exc)


@app.get('/api/analytics/sales_range', response_model=SalesDailyResponse)
def sales_range_api(start: str, end: str):
    try:
        return sales_range(start, end)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except OperationalError as exc:
        raise HTTPException(status_code=503, detail=f'Database unavailable: {exc}') from exc


@app.get('/api/analytics/payment_mix', response_model=PaymentMixResponse)
def payment_mix_api(days: int = 7):
    try:
        return payment_mix(max(1, min(days, 90)))
    except OperationalError as exc:
        _db_unavailable(exc)


@app.get('/api/suggestions', response_model=SuggestionsResponse)
def suggestions_api(
    pizza_id: str,
    topping_ids: str = '',
    cart_qty: int = 0,
    pizza_name: str | None = None,
):
    try:
        selected = [t.strip() for t in topping_ids.split(',') if t.strip()]
        return build_suggestions(
            pizza_id=pizza_id,
            selected_topping_ids=selected,
            cart_qty=max(0, cart_qty),
            pizza_name=pizza_name,
        )
    except OperationalError as exc:
        _db_unavailable(exc)


@app.get('/api/suggestions/menu', response_model=SuggestionsResponse)
def menu_suggestions_api(
    cart_qty: int = 0,
    exclude_pizza_ids: str = '',
):
    try:
        excluded = [p.strip() for p in exclude_pizza_ids.split(',') if p.strip()]
        return build_menu_suggestions(
            cart_qty=max(0, cart_qty),
            exclude_pizza_ids=excluded,
        )
    except OperationalError as exc:
        _db_unavailable(exc)


@app.get('/api/analytics/summary')
def analytics_summary_api(days: int = 7):
    try:
        return analytics_summary(max(1, min(days, 90)))
    except OperationalError as exc:
        _db_unavailable(exc)


@app.get('/api/coo/briefing/latest', response_model=CooBriefingResponse | None)
def coo_briefing_latest_api():
    try:
        row = get_latest_briefing()
        if not row:
            return None
        return CooBriefingResponse(**row)
    except OperationalError as exc:
        _db_unavailable(exc)


@app.post('/api/coo/briefing/generate', response_model=CooBriefingResponse)
def coo_briefing_generate_api():
    try:
        return CooBriefingResponse(**generate_and_store_briefing())
    except LLMError as exc:
        _llm_error(exc)
    except OperationalError as exc:
        _db_unavailable(exc)


@app.post('/api/coo/chat', response_model=CooChatResponse)
def coo_chat_api(payload: CooChatRequest):
    try:
        result = run_chat(payload.message, payload.thread_id, payload.briefing_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except LLMError as exc:
        _llm_error(exc)
    except OperationalError as exc:
        _db_unavailable(exc)
    return CooChatResponse(**result)


@app.get('/api/coo/chat/threads/{thread_id}/messages')
def coo_chat_messages_api(thread_id: str):
    try:
        return get_thread_messages(thread_id)
    except OperationalError as exc:
        _db_unavailable(exc)
