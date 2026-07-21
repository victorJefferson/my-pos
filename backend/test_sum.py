from decimal import Decimal
items = [{"total_price": Decimal("100.5")}, {"total_price": Decimal("50.2")}]
calc_total = sum(i["total_price"] for i in items)
print("calc_total:", calc_total, type(calc_total))
