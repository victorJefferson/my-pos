"""
Wren-inspired Text-to-SQL pipeline for POS analytics.

Flow: understanding → planning → generating → validating → executing
      → (optional) correcting → answering
"""

from __future__ import annotations

import json
import re
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

import sqlglot
from sqlglot import exp
from sqlalchemy import text
from sqlmodel import Session

ALLOWED_TABLES = frozenset({"products", "sales", "sale_items", "expenses"})
MAX_ROWS = 100
ROW_PREVIEW = 50

SCHEMA_PROMPT = """
You are generating PostgreSQL for a multi-tenant retail POS database.

Tables (all have tenant_id UUID — ALWAYS filter every table you use):

products(
  id UUID PK, tenant_id UUID, category TEXT, name TEXT,
  selling_price NUMERIC, cost_price NUMERIC, stock_quantity INT,
  is_active BOOLEAN, created_at TIMESTAMP
)

sales(
  id UUID PK, tenant_id UUID, invoice_number INT,
  total_amount NUMERIC,  -- bill revenue
  total_cost NUMERIC,    -- COGS for the bill
  total_profit NUMERIC,  -- revenue - COGS at bill level (excludes operating expenses)
  payment_mode TEXT,     -- 'CASH' | 'UPI' | 'CARD'
  cashier_id UUID NULL, created_at TIMESTAMP
)

sale_items(
  id UUID PK, tenant_id UUID, sale_id UUID → sales.id,
  product_id UUID → products.id, quantity INT,
  unit_selling_price NUMERIC, unit_cost_price NUMERIC,
  total_price NUMERIC,   -- line revenue
  total_profit NUMERIC   -- line profit
)

expenses(
  id UUID PK, tenant_id UUID, category TEXT, amount NUMERIC,
  payment_mode TEXT, description TEXT NULL, account_id UUID NULL,
  user_id UUID NULL, created_at TIMESTAMP
)

Joins allowed:
  sale_items.sale_id = sales.id
  sale_items.product_id = products.id
  NEVER join expenses to sales or sale_items (causes row explosion / fake losses).

Business rules:
  - Gross revenue: SUM(sales.total_amount) or SUM(sale_items.total_price)
  - Product/category performance: prefer SUM(sale_items.total_price) or SUM(quantity)
  - Net profit / "total profit" / "net profit today" MUST be exactly:
      revenue - COGS - operating expenses
    Prefer sales table:
      (SUM total_amount) - (SUM total_cost) - (SUM expenses.amount)
    Each of those three aggregates MUST be its own scalar subquery (or CTE).
    Omitting COGS (total_cost) is wrong. JOIN-ing expenses to sales is wrong.
  - Example (copy this pattern; substitute tenant_id and date):
      SELECT
        (SELECT COALESCE(SUM(total_amount),0) FROM sales
         WHERE tenant_id = '<tid>' AND created_at::date = CURRENT_DATE)
      - (SELECT COALESCE(SUM(total_cost),0) FROM sales
         WHERE tenant_id = '<tid>' AND created_at::date = CURRENT_DATE)
      - (SELECT COALESCE(SUM(amount),0) FROM expenses
         WHERE tenant_id = '<tid>' AND created_at::date = CURRENT_DATE)
      AS net_profit
  - Gross margin (sales only, no expenses): SUM(total_amount) - SUM(total_cost)
    or SUM(total_profit) on sales — never subtract expenses there.
  - "Least / worst performing product" = lowest revenue (or units) among products that HAVE sales in the window
  - "Today" means created_at::date = CURRENT_DATE (or the provided as_of_date)
  - Currency is INR; do not invent columns

SQL rules:
  - Return ONE read-only SELECT only (no UNION)
  - No INSERT/UPDATE/DELETE/DDL, no multiple statements
  - Filter tenant_id on EVERY referenced table (use the provided tenant_id literal)
  - Prefer LIMIT <= 100
  - For product performance, aggregate sale_items + products only unless expenses are explicitly asked alone
""".strip()


def _stage(name: str, status: str, detail: Optional[str] = None) -> dict[str, Any]:
    out: dict[str, Any] = {"name": name, "status": status}
    if detail:
        out["detail"] = detail[:500]
    return out


def _direct_from_join_tables(select_node: exp.Select) -> set[str]:
    """Table names in this SELECT's FROM/JOIN only (not nested subquery interiors)."""
    names: set[str] = set()
    from_ = select_node.args.get("from")
    if from_ is not None and isinstance(from_.this, exp.Table):
        names.add((from_.this.name or "").lower())
    for join in select_node.args.get("joins") or []:
        target = join.this
        if isinstance(target, exp.Table):
            names.add((target.name or "").lower())
    return {n for n in names if n}


def _reject_sales_expense_fanout(tree: exp.Expression) -> None:
    """
    Ban FROM/JOIN patterns that put expenses beside sales/sale_items in the same
    SELECT — that multiplies expense rows and invents huge losses.
    Scalar subqueries / separate CTEs that each touch one side are fine.
    """
    for select_node in tree.find_all(exp.Select):
        names = _direct_from_join_tables(select_node)
        sales_side = names & {"sales", "sale_items"}
        if sales_side and "expenses" in names:
            raise ValueError(
                "Invalid profit SQL: do not JOIN expenses to sales/sale_items "
                "(row explosion). Aggregate sales and expenses in separate "
                "subqueries or CTEs, then subtract."
            )


def _inject_tenant_into_select(select_node: exp.Select, tid: str) -> None:
    """AND tenant_id filters onto this SELECT's own FROM/JOIN tables only."""
    aliases: list[str] = []
    seen: set[str] = set()

    from_ = select_node.args.get("from")
    if from_ is not None and isinstance(from_.this, exp.Table):
        table = from_.this
        name = (table.name or "").lower()
        if name in ALLOWED_TABLES:
            alias = table.alias_or_name
            if alias not in seen:
                seen.add(alias)
                aliases.append(alias)

    for join in select_node.args.get("joins") or []:
        target = join.this
        if isinstance(target, exp.Table):
            name = (target.name or "").lower()
            if name in ALLOWED_TABLES:
                alias = target.alias_or_name
                if alias not in seen:
                    seen.add(alias)
                    aliases.append(alias)

    if not aliases:
        return

    preds: list[exp.Expression] = [
        exp.EQ(
            this=exp.Column(
                this=exp.to_identifier("tenant_id"),
                table=exp.to_identifier(alias),
            ),
            expression=exp.Literal.string(tid),
        )
        for alias in aliases
    ]
    combined: exp.Expression = preds[0]
    for p in preds[1:]:
        combined = exp.And(this=combined, expression=p)
    select_node.where(combined, copy=False)


def _extract_sql(text_out: str) -> str:
    cleaned = text_out.strip()
    fence = re.search(r"```(?:sql)?\s*([\s\S]*?)```", cleaned, re.IGNORECASE)
    if fence:
        cleaned = fence.group(1).strip()
    # Drop trailing commentary after semicolon-less blocks is fine; strip trailing ;
    if ";" in cleaned:
        cleaned = cleaned.split(";")[0].strip()
    return cleaned


def _serialize_cell(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, (bytes, memoryview)):
        return str(value)
    return value


class TextToSQLPipeline:
    def __init__(self, chat_fn, *, model_hint: str = ""):
        """
        chat_fn(system: str, user: str, *, temperature: float = 0.2, max_tokens: int = 1024) -> str
        """
        self._chat = chat_fn
        self._model_hint = model_hint

    def run(
        self,
        question: str,
        tenant_id: str,
        db: Session,
        history: Optional[list[dict[str, str]]] = None,
    ) -> dict[str, Any]:
        stages: list[dict[str, Any]] = []
        tid = str(uuid.UUID(str(tenant_id)))
        today = date.today().isoformat()
        history = history or []

        # 0) rephrasing — Wren-style standalone question from recent turns
        working_q = question
        rephrased_question: Optional[str] = None
        if history:
            try:
                working_q = self._rephrase_question(question, history)
                rephrased_question = working_q
                stages.append(
                    _stage(
                        "rephrasing",
                        "done",
                        working_q if working_q != question else "unchanged",
                    )
                )
            except Exception as exc:
                stages.append(_stage("rephrasing", "failed", str(exc)))
                working_q = question
                rephrased_question = None
        else:
            stages.append(_stage("rephrasing", "skipped", "no history"))

        # 1) understanding
        intent = self._classify_intent(working_q)
        stages.append(_stage("understanding", "done", f"intent={intent}"))

        if intent == "GENERAL":
            stages.append(_stage("planning", "skipped"))
            stages.append(_stage("generating", "skipped"))
            stages.append(_stage("validating", "skipped"))
            stages.append(_stage("correcting", "skipped"))
            stages.append(_stage("executing", "skipped"))
            answer = self._general_answer(working_q)
            stages.append(_stage("answering", "done", "general"))
            return {
                "question": question,
                "rephrased_question": rephrased_question,
                "answer": answer,
                "sql_used": None,
                "data": None,
                "is_mock": False,
                "stages": stages,
            }

        # 2) planning
        plan = self._plan_sql(working_q, today)
        stages.append(_stage("planning", "done", plan))

        # 3) generating
        try:
            sql = self._generate_sql(working_q, tid, today, plan)
            stages.append(_stage("generating", "done"))
        except Exception as exc:
            stages.append(_stage("generating", "failed", str(exc)))
            stages.extend(
                [
                    _stage("validating", "skipped"),
                    _stage("correcting", "skipped"),
                    _stage("executing", "skipped"),
                    _stage("answering", "failed"),
                ]
            )
            return self._fail(
                question,
                stages,
                f"Could not generate SQL: {exc}",
                rephrased_question=rephrased_question,
            )

        # 4) validating
        try:
            sql = self.validate_and_scope(sql, tid)
            stages.append(_stage("validating", "done", sql[:240]))
        except Exception as exc:
            stages.append(_stage("validating", "failed", str(exc)))
            try:
                sql = self._correct_sql(working_q, sql, str(exc), tid, today)
                sql = self.validate_and_scope(sql, tid)
                stages.append(_stage("correcting", "done", "fixed validation error"))
            except Exception as exc2:
                stages.append(_stage("correcting", "failed", str(exc2)))
                stages.extend([_stage("executing", "skipped"), _stage("answering", "failed")])
                return self._fail(
                    question,
                    stages,
                    f"SQL validation failed: {exc2}",
                    sql_used=sql if isinstance(sql, str) else None,
                    rephrased_question=rephrased_question,
                )

            return self._execute_and_answer(
                question,
                sql,
                db,
                stages,
                corrected=True,
                working_question=working_q,
                rephrased_question=rephrased_question,
            )

        stages.append(_stage("correcting", "skipped"))

        return self._execute_and_answer(
            question,
            sql,
            db,
            stages,
            corrected=False,
            working_question=working_q,
            rephrased_question=rephrased_question,
        )

    def _rephrase_question(self, question: str, history: list[dict[str, str]]) -> str:
        transcript = "\n".join(
            f"{m.get('role', 'user').upper()}: {m.get('content', '')}" for m in history[-6:]
        )
        raw = self._chat(
            "You rewrite follow-up analytics questions into a standalone question for Text-to-SQL. "
            "Use entities/facts only from the conversation history (product names, dates, metrics). "
            "Do not invent numbers or products. "
            "If the new message is already standalone, return it unchanged. "
            'Return ONLY JSON: {"rephrased": "..."}.',
            f"History:\n{transcript}\n\nNew message: {question}",
            temperature=0.1,
            max_tokens=250,
        )
        fence = re.search(r"\{[\s\S]*\}", raw)
        payload = json.loads(fence.group(0) if fence else raw)
        rephrased = str(payload.get("rephrased") or "").strip()
        if not rephrased:
            raise ValueError("Empty rephrase")
        return rephrased

    def _execute_and_answer(
        self,
        question: str,
        sql: str,
        db: Session,
        stages: list[dict[str, Any]],
        *,
        corrected: bool,
        working_question: Optional[str] = None,
        rephrased_question: Optional[str] = None,
    ) -> dict[str, Any]:
        ask_q = working_question or question
        try:
            rows = self.execute_sql(db, sql)
            stages.append(_stage("executing", "done", f"{len(rows)} rows"))
        except Exception as exc:
            if corrected:
                stages.append(_stage("executing", "failed", str(exc)))
                stages.append(_stage("answering", "failed"))
                return self._fail(
                    question,
                    stages,
                    f"Query failed: {exc}",
                    sql_used=sql,
                    rephrased_question=rephrased_question,
                )

            for i, s in enumerate(stages):
                if s["name"] == "correcting":
                    stages.pop(i)
                    break
            try:
                tid_match = re.search(
                    r"tenant_id\s*=\s*'([0-9a-fA-F-]{36})'",
                    sql,
                )
                tid = tid_match.group(1) if tid_match else None
                if not tid:
                    raise ValueError(str(exc))
                fixed = self._correct_sql(ask_q, sql, str(exc), tid, date.today().isoformat())
                fixed = self.validate_and_scope(fixed, tid)
                rows = self.execute_sql(db, fixed)
                sql = fixed
                stages.append(_stage("correcting", "done", str(exc)[:200]))
                stages.append(_stage("executing", "done", f"{len(rows)} rows after correction"))
            except Exception as exc2:
                stages.append(_stage("correcting", "failed", str(exc2)))
                stages.append(_stage("executing", "failed", str(exc)))
                stages.append(_stage("answering", "failed"))
                return self._fail(
                    question,
                    stages,
                    f"Query failed after correction: {exc2}",
                    sql_used=sql,
                    rephrased_question=rephrased_question,
                )

        preview = rows[:ROW_PREVIEW]
        try:
            answer = self._answer_from_rows(ask_q, sql, preview)
            stages.append(_stage("answering", "done"))
        except Exception as exc:
            stages.append(_stage("answering", "failed", str(exc)))
            answer = (
                f"Query succeeded ({len(rows)} rows) but answer synthesis failed: {exc}. "
                f"Raw preview: {json.dumps(preview[:5], ensure_ascii=False)}"
            )

        return {
            "question": question,
            "rephrased_question": rephrased_question,
            "answer": answer,
            "sql_used": sql,
            "data": preview,
            "is_mock": False,
            "stages": stages,
        }

    def _fail(
        self,
        question: str,
        stages: list[dict[str, Any]],
        message: str,
        sql_used: Optional[str] = None,
        rephrased_question: Optional[str] = None,
    ) -> dict[str, Any]:
        return {
            "question": question,
            "rephrased_question": rephrased_question,
            "answer": message,
            "sql_used": sql_used,
            "data": None,
            "is_mock": False,
            "stages": stages,
        }

    def _classify_intent(self, question: str) -> str:
        lower = question.lower().strip()
        general_hints = (
            "who are you",
            "what can you",
            "help me use",
            "how do i",
            "hello",
            "hi ",
            "thanks",
            "thank you",
        )
        if any(h in lower for h in general_hints) and not any(
            k in lower
            for k in ("revenue", "sales", "profit", "stock", "product", "category", "expense")
        ):
            return "GENERAL"

        try:
            raw = self._chat(
                "Classify the user message for a retail POS analytics assistant. "
                "Return ONLY JSON: {\"intent\": \"TEXT_TO_SQL\"} or {\"intent\": \"GENERAL\"}. "
                "TEXT_TO_SQL = needs store data (sales, products, stock, expenses, profit). "
                "GENERAL = greetings, product help, unrelated chat.",
                f"Message: {question}",
                temperature=0.0,
                max_tokens=80,
            )
            fence = re.search(r"\{[\s\S]*\}", raw)
            payload = json.loads(fence.group(0) if fence else raw)
            intent = str(payload.get("intent", "TEXT_TO_SQL")).upper()
            return "GENERAL" if intent == "GENERAL" else "TEXT_TO_SQL"
        except Exception:
            return "TEXT_TO_SQL"

    def _general_answer(self, question: str) -> str:
        return self._chat(
            "You are a helpful analytics assistant for a kirana/POS store app. "
            "Explain briefly how to ask about revenue, profit, stock, and product performance. "
            "Do not invent store numbers.",
            question,
            temperature=0.4,
            max_tokens=300,
        )

    def _plan_sql(self, question: str, today: str) -> str:
        return self._chat(
            "Produce a short SQL plan (3–6 bullet lines) for answering the analytics question "
            "against the POS schema (products, sales, sale_items, expenses). "
            "No SQL yet. Mention metrics, joins, and date window.",
            f"Today: {today}\nQuestion: {question}",
            temperature=0.2,
            max_tokens=350,
        )

    def _generate_sql(self, question: str, tenant_id: str, today: str, plan: str) -> str:
        raw = self._chat(
            SCHEMA_PROMPT
            + "\n\nReturn ONLY the SQL SELECT (optional markdown sql fence). No prose.",
            (
                f"tenant_id (REQUIRED literal): '{tenant_id}'\n"
                f"as_of_date: {today}\n"
                f"Plan:\n{plan}\n\n"
                f"Question: {question}"
            ),
            temperature=0.1,
            max_tokens=700,
        )
        sql = _extract_sql(raw)
        if not sql:
            raise ValueError("Empty SQL from model")
        return sql

    def _correct_sql(
        self,
        question: str,
        sql: str,
        error: str,
        tenant_id: str,
        today: str,
    ) -> str:
        raw = self._chat(
            SCHEMA_PROMPT
            + "\n\nFix the SQL so it runs on PostgreSQL. Return ONLY the corrected SELECT. "
            "If the error mentions JOIN expenses to sales/sale_items, rewrite net profit "
            "using separate scalar subqueries (never JOIN expenses to sales).",
            (
                f"tenant_id literal: '{tenant_id}'\n"
                f"as_of_date: {today}\n"
                f"Question: {question}\n"
                f"Broken SQL:\n{sql}\n"
                f"Error:\n{error}"
            ),
            temperature=0.1,
            max_tokens=700,
        )
        fixed = _extract_sql(raw)
        if not fixed:
            raise ValueError("Empty corrected SQL")
        return fixed

    def validate_and_scope(self, sql: str, tenant_id: str) -> str:
        tid = str(uuid.UUID(str(tenant_id)))
        cleaned = sql.strip().rstrip(";").strip()
        if not cleaned:
            raise ValueError("Empty SQL")

        lowered = cleaned.lower()
        if re.search(
            r"\b(insert|update|delete|drop|alter|truncate|grant|revoke|pg_sleep|dblink)\b",
            lowered,
        ):
            raise ValueError("Forbidden SQL keyword detected")
        if re.search(r"\bselect\s+into\b", lowered):
            raise ValueError("SELECT INTO is not allowed")
        if "information_schema" in lowered or "pg_catalog" in lowered:
            raise ValueError("System catalogs are not allowed")

        if ";" in cleaned:
            raise ValueError("Multiple statements are not allowed")

        try:
            trees = sqlglot.parse(cleaned, read="postgres")
        except Exception as exc:
            raise ValueError(f"SQL parse error: {exc}") from exc

        if len(trees) != 1 or trees[0] is None:
            raise ValueError("Expected exactly one SQL statement")

        tree = trees[0]
        if isinstance(tree, exp.Select):
            select_node = tree
        elif isinstance(tree, exp.With) and isinstance(tree.this, exp.Select):
            select_node = tree.this
        else:
            raise ValueError("Only a single SELECT query is allowed (no UNION/DML)")

        for node in tree.walk():
            if isinstance(
                node,
                (exp.Insert, exp.Update, exp.Delete, exp.Drop, exp.Create, exp.Command, exp.Union),
            ):
                raise ValueError("Only a single read-only SELECT is allowed")

        _reject_sales_expense_fanout(tree)

        tables: list[tuple[str, str]] = []
        for table in tree.find_all(exp.Table):
            name = (table.name or "").lower()
            if not name:
                continue
            if name not in ALLOWED_TABLES:
                raise ValueError(f"Table not allowed: {name}")
            alias = table.alias_or_name
            tables.append((name, alias))

        if not tables:
            raise ValueError("No allowlisted tables referenced")

        # Inject tenant_id on each SELECT that actually FROM/JOINs tables
        for sel in tree.find_all(exp.Select):
            _inject_tenant_into_select(sel, tid)

        # Enforce LIMIT on outermost SELECT only
        limit = select_node.args.get("limit")
        need_limit = limit is None
        if limit is not None:
            try:
                lim_exp = limit.expression if hasattr(limit, "expression") else limit
                lim_val = int(getattr(lim_exp, "this", lim_exp))
                need_limit = lim_val > MAX_ROWS
            except Exception:
                need_limit = True
        if need_limit:
            select_node = select_node.limit(MAX_ROWS, copy=False)
            if isinstance(tree, exp.With):
                tree.set("this", select_node)
            else:
                tree = select_node

        rendered = tree.sql(dialect="postgres")
        rendered = re.sub(
            r"(tenant_id\s*=\s*')([0-9a-fA-F-]{36})(')",
            rf"\g<1>{tid}\3",
            rendered,
            flags=re.IGNORECASE,
        )
        return rendered

    def execute_sql(self, db: Session, sql: str) -> list[dict[str, Any]]:
        try:
            result = db.execute(text(sql))
            keys = list(result.keys())
            rows: list[dict[str, Any]] = []
            for row in result.fetchmany(MAX_ROWS):
                mapping = row._mapping if hasattr(row, "_mapping") else dict(zip(keys, row))
                rows.append({k: _serialize_cell(mapping[k]) for k in mapping.keys()})
            return rows
        except Exception:
            db.rollback()
            raise

    def _answer_from_rows(self, question: str, sql: str, rows: list[dict[str, Any]]) -> str:
        payload = json.dumps(rows, ensure_ascii=False, default=str)
        return self._chat(
            "You are a retail analytics assistant for an Indian POS store. "
            "Answer the owner's question using ONLY the SQL result rows. "
            "Be specific (product names, categories, ₹ amounts). "
            "If rows are empty, say no matching data was found. "
            "2–5 sentences. Do not invent numbers.",
            f"Question: {question}\nSQL:\n{sql}\nRows JSON:\n{payload}",
            temperature=0.2,
            max_tokens=500,
        )
