from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_validator

PaymentType = Literal['cash', 'card', 'upi']


class PizzaItem(BaseModel):
    pizza_type: str = Field(..., min_length=1, max_length=120)
    base: str = Field(..., min_length=1, max_length=120)
    toppings: list[str] = Field(default_factory=list)
    price_wo_gst: Decimal = Field(..., ge=0)
    line_discount: Decimal = Field(default=Decimal('0'), ge=0)
    gst: Decimal = Field(..., ge=0)
    quantity: int = Field(default=1, ge=1, le=99)

    @field_validator('toppings')
    @classmethod
    def strip_toppings(cls, values: list[str]) -> list[str]:
        return [t.strip() for t in values if t and t.strip()]


class CreateOrderRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=40)
    phone: str = Field(..., min_length=10, max_length=10)
    items: list[PizzaItem] = Field(..., min_length=1)
    payment_type: PaymentType
    table: str | None = Field(default=None, max_length=80)

    @field_validator('phone')
    @classmethod
    def validate_phone(cls, value: str) -> str:
        if not value.isdigit() or value[0] not in '6789':
            raise ValueError('Phone must be 10 digits starting with 6, 7, 8, or 9')
        return value

    @field_validator('name')
    @classmethod
    def validate_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not all(ch.isalpha() or ch.isspace() for ch in cleaned):
            raise ValueError('Name may only contain letters and spaces')
        return cleaned


class CreateOrderResponse(BaseModel):
    order_id: str
    order_code: str
    grand_total: Decimal


class OrderSelectionOut(BaseModel):
    role: str
    name: str
    unit_price: Decimal


class OrderItemOut(BaseModel):
    id: int | None = None
    line_no: int
    quantity: int
    line_subtotal: Decimal
    line_discount: Decimal = Decimal('0')
    line_tax: Decimal
    line_total: Decimal
    pizza_type: str | None = None
    base: str | None = None
    toppings: list[str] = Field(default_factory=list)
    status_code: str | None = None
    assigned_staff: str | None = None
    selections: list[OrderSelectionOut] = Field(default_factory=list)


class OrderOut(BaseModel):
    order_id: str
    order_code: str
    name: str | None
    phone: str | None
    table: str | None = None
    status: str = 'active'
    subtotal: Decimal
    discount: Decimal = Decimal('0')
    gst: Decimal
    grand_total: Decimal
    payment_type: str | None
    created_at: str
    items: list[OrderItemOut]


class CompleteOrderRequest(BaseModel):
    order_id: str = Field(..., min_length=36, max_length=36)


class CompleteOrderResponse(BaseModel):
    order_id: str
    order_code: str
    status: str
    table: str | None = None


class NewTableRequest(BaseModel):
    table_number: str = Field(..., min_length=1, max_length=20)

    @field_validator('table_number')
    @classmethod
    def validate_table_number(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned.isdigit() or int(cleaned) < 1:
            raise ValueError('Table number must be a positive whole number')
        return cleaned


class TableOut(BaseModel):
    id: int
    label: str


class NewTableResponse(BaseModel):
    id: int
    label: str


class HourlyOrderPoint(BaseModel):
    order_hour: str
    orders_count: int


class OrdersPerHourResponse(BaseModel):
    points: list[HourlyOrderPoint]
    timezone: str = 'Asia/Kolkata'


class CancelOrderRequest(BaseModel):
    order_id: str = Field(..., min_length=36, max_length=36)
    reason: str | None = Field(default=None, max_length=200)


class CancelOrderResponse(BaseModel):
    order_id: str
    order_code: str
    status: str
    table: str | None = None


class TopProduct(BaseModel):
    name: str
    units_sold: int
    revenue: Decimal


class TopProductsResponse(BaseModel):
    products: list[TopProduct]


class DailySalesPoint(BaseModel):
    business_date: str
    orders_count: int
    gross_sales: Decimal
    discounts: Decimal
    net_sales: Decimal


class SalesDailyResponse(BaseModel):
    days: list[DailySalesPoint]


class PaymentMixEntry(BaseModel):
    method: str
    payments_count: int
    amount: Decimal


class PaymentMixResponse(BaseModel):
    methods: list[PaymentMixEntry]


class MenuAvailabilityItem(BaseModel):
    item_id: str
    item_name: str | None = None
    is_sold_out: bool = False


class MenuAvailabilityResponse(BaseModel):
    items: list[MenuAvailabilityItem] = Field(default_factory=list)


class SetAvailabilityRequest(BaseModel):
    item_id: str = Field(..., min_length=1, max_length=120)
    is_sold_out: bool
    item_type: str = Field(default='pizza', max_length=20)
    item_name: str | None = Field(default=None, max_length=120)


StaffRole = Literal['staff', 'manager', 'admin']


class StaffOut(BaseModel):
    id: int
    full_name: str
    role: str
    has_pin: bool = False


class StaffAdminOut(StaffOut):
    is_active: bool = True


class VerifyStaffRequest(BaseModel):
    staff_id: int = Field(..., ge=1)
    pin: str = Field(..., min_length=4, max_length=4)

    @field_validator('pin')
    @classmethod
    def validate_pin(cls, value: str) -> str:
        if not value.isdigit():
            raise ValueError('PIN must be exactly 4 digits')
        return value


class CreateStaffRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=40)
    role: StaffRole = 'staff'
    pin: str | None = Field(default=None, min_length=4, max_length=4)

    @field_validator('full_name')
    @classmethod
    def validate_full_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not all(ch.isalpha() or ch.isspace() for ch in cleaned):
            raise ValueError('Name may only contain letters and spaces')
        return cleaned

    @field_validator('pin')
    @classmethod
    def validate_pin(cls, value: str | None) -> str | None:
        if value is None or value == '':
            return None
        if not value.isdigit():
            raise ValueError('PIN must be exactly 4 digits')
        return value


class UpdateStaffRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=40)
    role: StaffRole | None = None
    pin: str | None = Field(default=None, min_length=4, max_length=4)
    is_active: bool | None = None

    @field_validator('full_name')
    @classmethod
    def validate_full_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not all(ch.isalpha() or ch.isspace() for ch in cleaned):
            raise ValueError('Name may only contain letters and spaces')
        return cleaned

    @field_validator('pin')
    @classmethod
    def validate_pin(cls, value: str | None) -> str | None:
        if value is None or value == '':
            return None
        if not value.isdigit():
            raise ValueError('PIN must be exactly 4 digits')
        return value


class KitchenQueueItem(BaseModel):
    item_id: int
    line_no: int
    quantity: int
    status_code: str
    status_name: str
    order_code: str
    order_id: str
    table_label: str | None = None
    pizza_name: str | None = None
    base_name: str | None = None
    toppings: list[str] = Field(default_factory=list)
    assigned_staff_id: int | None = None
    assigned_staff: str | None = None
    queued_at: str | None = None
    elapsed_seconds: int | None = None


class AssignItemRequest(BaseModel):
    staff_id: int


class TransitionItemRequest(BaseModel):
    to_status: Literal['assigned', 'preparing', 'ready', 'served']
    staff_id: int


class CooChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=500)
    thread_id: str | None = None
    briefing_id: int | None = None


class CooChatResponse(BaseModel):
    thread_id: str
    reply: str
    sql: str | None = None
    rows_preview: list[dict] = Field(default_factory=list)
    row_count: int = 0
    model: str | None = None


class CooBriefingResponse(BaseModel):
    id: int
    business_date: str
    summary_text: str
    model: str | None = None
    kpi_snapshot: dict | None = None
    created_at: str


class SuggestionAction(BaseModel):
    type: Literal['add_topping', 'add_pizza', 'info']
    item_id: str | None = None
    item_name: str | None = None


class SuggestionOut(BaseModel):
    rule: str
    message: str
    action: SuggestionAction


class SuggestionsResponse(BaseModel):
    suggestions: list[SuggestionOut] = Field(default_factory=list)
