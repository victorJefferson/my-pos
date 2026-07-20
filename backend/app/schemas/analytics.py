from typing import Optional, List, Dict
from decimal import Decimal
from pydantic import BaseModel


class CategoryExpenseBreakdown(BaseModel):
    category: str
    amount: Decimal


class DailySummary(BaseModel):
    date: str
    gross_revenue: Decimal
    total_cogs: Decimal
    total_expenses: Decimal
    net_profit: Decimal  # gross_revenue - total_cogs - total_expenses
    bill_count: int
    avg_basket_size: Decimal
    cash_amount: Decimal
    upi_amount: Decimal
    card_amount: Decimal


class ChartPoint(BaseModel):
    label: str  # date string or month string
    revenue: Decimal
    profit: Decimal
    cost: Decimal
    expenses: Decimal


class PaymentBreakdown(BaseModel):
    cash: Decimal
    upi: Decimal
    card: Decimal
    cash_count: int
    upi_count: int
    card_count: int


class AnalyticsSummaryResponse(BaseModel):
    today: DailySummary
    payment_breakdown: PaymentBreakdown
    category_expenses: List[CategoryExpenseBreakdown]
    daily_chart: List[ChartPoint]
    monthly_chart: List[ChartPoint]


class DailyReportRow(BaseModel):
    date: str
    gross_revenue: Decimal
    total_cogs: Decimal
    total_expenses: Decimal
    net_profit: Decimal
    bill_count: int
    cash_amount: Decimal
    upi_amount: Decimal
    card_amount: Decimal


class AnalyticsReportResponse(BaseModel):
    store_name: str
    start_date: str
    end_date: str
    generated_at: str
    gross_revenue: Decimal
    total_cogs: Decimal
    total_expenses: Decimal
    net_profit: Decimal
    net_margin_pct: float
    total_bills: int
    avg_basket_size: Decimal
    payment_breakdown: PaymentBreakdown
    category_expenses: List[CategoryExpenseBreakdown]
    daily_rows: List[DailyReportRow]
