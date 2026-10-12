"""Chuẩn hóa parse tree (ANTLR) thành chuỗi token "trung tính" để đưa vào Winnowing.

Ý TƯỞNG (đọc trước khi đọc code)
================================
Đối thủ trong AST Bypass Challenge sẽ "ngụy trang" code đạo văn bằng 3 mức:

    Mức 1: đổi tên biến / hàm / tham số
    Mức 2: thêm / sửa comment, thêm khoảng trắng
    Mức 3: đảo thứ tự các hàm (method) trong class

Ta chặn từng mức bằng cách làm cho các thay đổi đó KHÔNG ảnh hưởng đầu ra:

    Mức 1 -> thay mọi tên bằng nhãn theo VAI TRÒ:   sum, total, s  ==>  VAR
                                                    tinhTong, calc ==>  FUNC
    Mức 2 -> comment/whitespace vốn không nằm trong parse tree (lexer đã bỏ qua)
             + literal gộp: 5, 99, "abc"  ==>  NUM, STR
    Mức 3 -> các "thành viên" của class (method, field, ...) được SẮP XẾP theo nội dung
             đã chuẩn hóa, nên đảo thứ tự hàm cho ra cùng một chuỗi.

Mức 4 (viết lại kiểu "AI") — chuẩn hóa các dạng viết TƯƠNG ĐƯƠNG về một dạng chuẩn
(xem mục CANONICAL FORMS bên dưới):

    i++ / ++i / i += 1 / i = i + 1        ==>  i += NUM
    for(init; cond; upd) body              ==>  init; while(cond) { body; upd; }
    if (c) x; / if (c) { x; }              ==>  cùng một dạng (thân 1 câu lệnh bỏ dấu {})
    a > b / a >= b                         ==>  b < a / b <= a
    public / private / protected           ==>  bỏ (chỉ đổi phạm vi truy cập, không đổi logic)

Sơ đồ:

    source ──ANTLR──▶ parse tree ──duyệt pre-order──▶ [compilationunit, classdeclaration,
                                                        CLASS, methoddeclaration, FUNC, ...]
                          │
                          ├─ bỏ import / package (không mang thông tin logic)
                          ├─ bỏ dấu câu ; , ( ) { } [ ] .  (cấu trúc đã nằm trong tree)
                          ├─ gộp nút chỉ có 1 con (nút bọc, không thêm thông tin)
                          └─ sắp xếp các thành viên độc lập trong class

Đầu ra: danh sách token (kèm số dòng để báo cáo đoạn trùng về sau).

Module này KHÔNG import ANTLR: nó duyệt cây theo "duck typing" (getChildren, parentCtx,
symbol...), nên chạy được với bất kỳ parser ANTLR4 sinh ra từ JavaParser.g4.
Tên luật lấy từ tên lớp context (MethodDeclarationContext -> "methoddeclaration")
và so khớp viết thường, để không phụ thuộc kiểu viết hoa/thường của grammar.
"""

from __future__ import annotations

import re
from typing import Any, Dict, FrozenSet, List, NamedTuple

# --------------------------------------------------------------------------- #
# Hằng số
# --------------------------------------------------------------------------- #

# Từ khóa "cứng" của Java (+ var). Không bao giờ là tên biến/hàm.
KEYWORDS: FrozenSet[str] = frozenset(
    """
    abstract assert boolean break byte case catch char class const continue default do
    double else enum extends final finally float for goto if implements import instanceof
    int interface long native new package private protected public return short static
    strictfp super switch synchronized this throw throws transient try void volatile while
    null var
    """.split()
)

# Từ khóa "theo ngữ cảnh": chỉ là từ khóa khi grammar dùng nó như một token riêng,
# còn nếu nằm trong luật `identifier` thì đó là tên do sinh viên đặt (vd: biến tên `record`).
CONTEXTUAL_KEYWORDS: FrozenSet[str] = frozenset(
    "record sealed permits yield module open requires exports opens to uses provides with transitive".split()
)

# Dấu câu chỉ mang tính cấu trúc — cây đã thể hiện rồi nên bỏ để bớt nhiễu.
_DROP_PUNCT: FrozenSet[str] = frozenset("{ } ( ) [ ] ; , .".split())

# Modifier truy cập: kẻ đạo văn chỉ cần đổi public <-> private là khác token; logic không đổi.
_DROP_KEYWORDS: FrozenSet[str] = frozenset({"public", "private", "protected"})

_NUM_RE = re.compile(r"^(?:\d|\.\d)")
_IDENT_RE = re.compile(r"^[^\W\d][\w$]*$", re.UNICODE)

# Luật cha bọc quanh token IDENTIFIER (grammar mới: identifier : IDENTIFIER | MODULE | ...)
_IDENT_WRAPPERS: FrozenSet[str] = frozenset({"identifier", "typeidentifier"})

# Không đưa vào chuỗi token (không mang thông tin logic của bài làm).
_SKIP_RULES: FrozenSet[str] = frozenset({"importdeclaration", "packagedeclaration"})

# Vai trò của định danh, suy ra từ luật cha.
_FUNC_OWNERS: FrozenSet[str] = frozenset(
    {
        "methoddeclaration",
        "constructordeclaration",
        "interfacecommonbodydeclaration",
        "annotationmethodrest",
        "methodcall",
        "explicitgenericinvocationsuffix",
    }
)
_CLASS_OWNERS: FrozenSet[str] = frozenset(
    {
        "classdeclaration",
        "interfacedeclaration",
        "enumdeclaration",
        "recorddeclaration",
        "annotationtypedeclaration",
    }
)
_TYPE_OWNERS: FrozenSet[str] = frozenset(
    {
        "classorinterfacetype",
        "createdname",
        "innercreator",
        "qualifiedname",
        "typeparameter",
    }
)
_PARAM_OWNERS: FrozenSet[str] = frozenset({"lambdaparameters"})
# variableDeclaratorId nằm dưới các luật này thì là THAM SỐ, ngược lại là BIẾN.
_PARAM_DECLARATOR_PARENTS: FrozenSet[str] = frozenset({"formalparameter", "lastformalparameter"})

# Container -> các luật con là "thành viên độc lập" (được phép sắp xếp lại).
_SORT_CONTAINERS: Dict[str, FrozenSet[str]] = {
    "compilationunit": frozenset({"typedeclaration"}),
    "classbody": frozenset({"classbodydeclaration"}),
    "interfacebody": frozenset({"interfacebodydeclaration"}),
    "enumbodydeclarations": frozenset({"classbodydeclaration"}),
    "recordbody": frozenset({"classbodydeclaration", "compactconstructordeclaration"}),
}


class NormToken(NamedTuple):
    """Một token đã chuẩn hóa + dòng nguồn (dòng đầu tiên của token/nút đó)."""

    value: str
    line: int


# --------------------------------------------------------------------------- #
# Tiện ích duyệt cây (duck typing)
# --------------------------------------------------------------------------- #

_rule_name_cache: Dict[type, str] = {}


def _is_terminal(node: Any) -> bool:
    return hasattr(node, "symbol")


def _is_error_node(node: Any) -> bool:
    return type(node).__name__ == "ErrorNodeImpl"


def _rule_name(node: Any) -> str:
    """MethodDeclarationContext -> 'methoddeclaration'."""
    if node is None:
        return ""
    cls = type(node)
    name = _rule_name_cache.get(cls)
    if name is None:
        name = cls.__name__
        if name.endswith("Context"):
            name = name[: -len("Context")]
        name = name.lower()
        _rule_name_cache[cls] = name
    return name


def _children(node: Any) -> List[Any]:
    kids = getattr(node, "children", None)
    return list(kids) if kids else []


def _start_line(node: Any) -> int:
    start = getattr(node, "start", None)
    return int(getattr(start, "line", 0) or 0)


# --------------------------------------------------------------------------- #
# Phân loại định danh / token
# --------------------------------------------------------------------------- #


def _identifier_role(node: Any) -> str:
    """Xác định vai trò của một IDENTIFIER: FUNC / CLASS / TYPE / PARAM / VAR."""
    parent = getattr(node, "parentCtx", None)
    pname = _rule_name(parent)
    if pname == "typeidentifier":
        return "TYPE"

    owner, oname = parent, pname
    if pname == "identifier":  # bóc lớp bọc để tìm luật thật sự sở hữu tên này
        owner = getattr(parent, "parentCtx", None)
        oname = _rule_name(owner)

    if oname in _FUNC_OWNERS:
        return "FUNC"
    if oname in _CLASS_OWNERS:
        return "CLASS"
    if oname in _TYPE_OWNERS:
        return "TYPE"
    if oname in _PARAM_OWNERS:
        return "PARAM"
    if oname == "variabledeclaratorid":
        grand = _rule_name(getattr(owner, "parentCtx", None))
        return "PARAM" if grand in _PARAM_DECLARATOR_PARENTS else "VAR"
    return "VAR"


def _terminal_token(node: Any, canonical: bool = True) -> NormToken | None:
    """Đổi một lá của cây thành token chuẩn hóa (hoặc None nếu nên bỏ)."""
    sym = node.symbol
    text = sym.text
    if text is None or text == "<EOF>" or text in _DROP_PUNCT:
        return None
    if canonical and text in _DROP_KEYWORDS:
        return None
    line = int(getattr(sym, "line", 0) or 0)

    if _NUM_RE.match(text):
        return NormToken("NUM", line)
    if text[0] in "\"'":  # chuỗi, text block, ký tự
        return NormToken("STR", line)
    if text in ("true", "false"):
        return NormToken("BOOL", line)

    parent_name = _rule_name(getattr(node, "parentCtx", None))
    if parent_name in _IDENT_WRAPPERS:  # chắc chắn là tên do sinh viên đặt
        return NormToken(_identifier_role(node), line)
    if text in KEYWORDS or text in CONTEXTUAL_KEYWORDS:
        return NormToken(text, line)
    if _IDENT_RE.match(text):  # grammar cũ: IDENTIFIER nằm trực tiếp trong luật
        return NormToken(_identifier_role(node), line)

    return NormToken(text, line)  # toán tử: giữ nguyên


# --------------------------------------------------------------------------- #
# CANONICAL FORMS — đưa các cách viết tương đương về một dạng
# --------------------------------------------------------------------------- #
#
# Hàm `_canonical_items` trả về danh sách "mục" để thay cho cách duyệt mặc định của một nút:
#   ("tok", NormToken)  -> ghi thẳng token này
#   ("node", nút_con)   -> duyệt nút con như bình thường (đệ quy qua ngăn xếp)
# Trả về None nghĩa là "không có luật nào áp dụng" -> duyệt mặc định.
#
# Mọi luật đều áp dụng GIỐNG NHAU cho cả hai bài khi so sánh, nên dù một luật có làm hai
# cách viết "gần giống nhưng không hẳn tương đương" trùng nhau thì cũng chỉ làm tăng nhẹ
# độ giống, không gây lệch giữa hai phía.

_ARITH_COMPOUND: FrozenSet[str] = frozenset({"+", "-", "*", "/", "%", "&", "|", "^"})
_CONTROL_KEYWORDS: FrozenSet[str] = frozenset({"if", "while", "for", "do"})


def _text(node: Any, limit: int = 40) -> str | None:
    """Chữ gốc của một nút (trước khi chuẩn hóa tên), duyệt KHÔNG đệ quy.

    Nút lớn hơn `limit` lá trả về None (coi như "không so được"): getText() của ANTLR đệ quy
    nên với biểu thức cực dài sẽ ném RecursionError — lại thành đường để né phân tích AST.
    """
    parts: List[str] = []
    todo = [node]
    while todo:
        cur = todo.pop()
        if _is_terminal(cur):
            parts.append(cur.symbol.text or "")
            if len(parts) > limit:
                return None
        else:
            todo.extend(reversed(_children(cur)))
    return "".join(parts)


def _same_operand(a: Any, b: Any) -> bool:
    ta, tb = _text(a), _text(b)
    return ta is not None and ta == tb


def _terminal_text(node: Any) -> str:
    return node.symbol.text if _is_terminal(node) and node.symbol.text else ""


def _tok(value: str, node: Any) -> tuple:
    return ("tok", NormToken(value, _start_line(node)))


def _unbrace(stmt: Any) -> List[Any]:
    """Thân của if/while/for -> danh sách câu lệnh bên trong, bỏ cặp { } nếu có."""
    kids = _children(stmt)
    if len(kids) == 1 and _rule_name(kids[0]) == "block":
        return [k for k in _children(kids[0]) if not _is_terminal(k)]
    return [stmt]


def _body_items(stmt: Any, extra: List[tuple] | None = None) -> List[tuple]:
    """Mục cho phần thân. 1 câu lệnh -> không bọc; 0 hoặc >= 2 câu lệnh -> thêm token `block`.

    `extra`: các mục thêm vào cuối thân (dùng khi chuyển for -> while: câu lệnh cập nhật).
    """
    nodes = [("node", n) for n in _unbrace(stmt)] + list(extra or [])
    if len(nodes) == 1:
        return nodes
    return [_tok("block", stmt)] + nodes


def _for_to_while(node: Any, kids: List[Any]) -> List[tuple] | None:
    """for(init; cond; upd) body  ->  init; while(cond) { body; upd; }  (chỉ for kiểu cổ điển)."""
    ctrl = kids[2]
    if _rule_name(ctrl) != "forcontrol":
        return None  # for-each (enhancedForControl) hoặc nút đã bị gộp -> giữ nguyên
    parts = _children(ctrl)
    # Cấu trúc: [forInit]? ';' [expression]? ';' [expressionList]?
    semis = [i for i, c in enumerate(parts) if _terminal_text(c) == ";"]
    if len(semis) != 2:
        return None
    init = parts[: semis[0]]
    cond = parts[semis[0] + 1 : semis[1]]
    upd = parts[semis[1] + 1 :]

    items: List[tuple] = []
    if init:
        init_node = init[0]
        inner = _children(init_node)
        if len(inner) == 1 and _rule_name(inner[0]) == "localvariabledeclaration":
            items += [_tok("blockstatement", init_node), ("node", inner[0])]
        else:  # forInit = expressionList
            exprs = [c for c in _children(init_node) if not _is_terminal(c)] or [init_node]
            if len(exprs) != 1:
                return None
            items += [_tok("statement", init_node), ("node", exprs[0])]

    items += [_tok("statement", node), _tok("while", node)]
    items += [("node", cond[0])] if cond else [_tok("BOOL", node)]

    extra: List[tuple] = []
    if upd:
        for e in [c for c in _children(upd[0]) if not _is_terminal(c)] or [upd[0]]:
            extra += [_tok("statement", e), ("node", e)]
    items += _body_items(kids[4], extra)
    return items


def _canonical_statement(node: Any, kids: List[Any]) -> List[tuple] | None:
    first = _terminal_text(kids[0]) if kids else ""
    if first not in _CONTROL_KEYWORDS:
        return None
    if first == "for" and len(kids) == 5:
        converted = _for_to_while(node, kids)
        if converted is not None:
            return converted
    items: List[tuple] = [_tok("statement", node), ("node", kids[0])]
    for kid in kids[1:]:
        if _is_terminal(kid):
            if _terminal_text(kid) not in _DROP_PUNCT:
                items.append(("node", kid))
        elif _rule_name(kid) == "statement":
            items += _body_items(kid)
        else:
            items.append(("node", kid))
    return items


def _canonical_expression(name: str, node: Any, kids: List[Any]) -> List[tuple] | None:
    # ---- i++ / i-- / ++i / --i  ->  i += NUM / i -= NUM
    if name == "postincrementdecrementoperatorexpression" and len(kids) == 2:
        op = _terminal_text(kids[1])
        if op in ("++", "--"):
            return [
                _tok("binaryoperatorexpression", node), ("node", kids[0]),
                _tok("+=" if op == "++" else "-=", kids[1]), _tok("NUM", kids[1]),
            ]
    if name == "unaryoperatorexpression" and len(kids) == 2:
        op = _terminal_text(kids[0])
        if op in ("++", "--"):
            return [
                _tok("binaryoperatorexpression", node), ("node", kids[1]),
                _tok("+=" if op == "++" else "-=", kids[0]), _tok("NUM", kids[0]),
            ]
    if name != "binaryoperatorexpression" or len(kids) != 3:
        return None
    op = _terminal_text(kids[1])
    # ---- x = x OP e  ->  x OP= e   (so khớp chữ gốc của x, trước khi tên bị gộp thành VAR)
    if op == "=" and _rule_name(kids[2]) == "binaryoperatorexpression":
        rhs = _children(kids[2])
        if len(rhs) == 3 and _terminal_text(rhs[1]) in _ARITH_COMPOUND and _same_operand(rhs[0], kids[0]):
            return [
                _tok("binaryoperatorexpression", node), ("node", kids[0]),
                _tok(_terminal_text(rhs[1]) + "=", rhs[1]), ("node", rhs[2]),
            ]
    # ---- a > b  ->  b < a ;  a >= b  ->  b <= a
    if op in (">", ">="):
        return [
            _tok("binaryoperatorexpression", node), ("node", kids[2]),
            _tok("<" if op == ">" else "<=", kids[1]), ("node", kids[0]),
        ]
    return None


_MODIFIER_HOLDERS: FrozenSet[str] = frozenset(
    {"classbodydeclaration", "interfacebodydeclaration", "typedeclaration"}
)


def _drop_access_modifiers(name: str, node: Any, kids: List[Any]) -> List[tuple] | None:
    """Bỏ public/private/protected KHỎI NÚT CHA (nếu chỉ bỏ lá thì nút bọc `classbodydeclaration`
    vẫn còn lại và hai cách viết vẫn lệch nhau một token)."""
    keep = [k for k in kids if _is_terminal(k) or _text(k, 3) not in _DROP_KEYWORDS]
    if len(keep) == len(kids):
        return None
    if len(keep) == 1:
        return [("node", keep[0])]
    return [_tok(name, node)] + [("node", k) for k in keep]


def _canonical_items(name: str, node: Any, kids: List[Any]) -> List[tuple] | None:
    if name in _MODIFIER_HOLDERS:
        return _drop_access_modifiers(name, node, kids)
    if name == "statement":
        return _canonical_statement(node, kids)
    return _canonical_expression(name, node, kids)


# --------------------------------------------------------------------------- #
# Duyệt cây
# --------------------------------------------------------------------------- #


def _visit(
    node: Any, out: List[NormToken], stack: list, sort_members: bool, canonical: bool = True
) -> None:
    """Xử lý MỘT nút: ghi token vào `out` và đẩy các con vào `stack` để duyệt sau.

    Dùng ngăn xếp tường minh thay vì đệ quy: biểu thức dài (a+a+a+... 1000 số hạng) tạo cây
    sâu cả nghìn tầng, nếu đệ quy sẽ vượt giới hạn của Python và làm bài rơi về chế độ "lex"
    dù không hề có lỗi cú pháp — một cách để kẻ đạo văn né phân tích AST.
    """
    # Nút bọc chỉ có 1 con: không thêm thông tin -> đi thẳng xuống (vòng lặp, không đệ quy)
    while True:
        if _is_terminal(node):
            if not _is_error_node(node):
                tok = _terminal_token(node, canonical)
                if tok is not None:
                    out.append(tok)
            return
        name = _rule_name(node)
        if name in _SKIP_RULES:
            return
        kids = _children(node)
        if len(kids) == 1:
            node = kids[0]
            continue
        break

    if canonical:
        items = _canonical_items(name, node, kids)
        if items is not None:
            for kind, payload in reversed(items):
                stack.append(("emit" if kind == "tok" else "visit", payload, out))
            return

    out.append(NormToken(name, _start_line(node)))

    unit_rules = _SORT_CONTAINERS.get(name) if sort_members else None
    if not unit_rules:
        for child in reversed(kids):  # đẩy ngược để con đầu tiên được lấy ra trước
            stack.append(("visit", child, out))
        return

    # Container: token của từng thành viên độc lập được gom vào bộ đệm riêng, rồi SẮP XẾP
    # theo nội dung khi tất cả con đã xử lý xong (mục "finish" được đẩy vào ngăn xếp TRƯỚC
    # các con nên sẽ được lấy ra SAU cùng) -> đảo thứ tự hàm/field không đổi kết quả.
    units: List[List[NormToken]] = []
    stack.append(("finish", units, out))
    plan = []
    for child in kids:
        if not _is_terminal(child) and _rule_name(child) in unit_rules:
            buf: List[NormToken] = []
            units.append(buf)
            plan.append((child, buf))
        else:
            plan.append((child, out))
    for child, target in reversed(plan):
        stack.append(("visit", child, target))


def normalize_tree_with_lines(
    tree: Any, *, sort_members: bool = True, canonical: bool = True
) -> List[NormToken]:
    """Duyệt parse tree, trả về danh sách NormToken (giá trị + dòng nguồn).

    sort_members=False: giữ nguyên thứ tự thành viên (dùng khi cần so sánh thứ tự thật).
    canonical=False: tắt chuẩn hóa dạng viết tương đương (for/while, i++, thân if...).
    Không đệ quy nên không bị giới hạn bởi độ sâu của cây.
    """
    result: List[NormToken] = []
    stack: list = [("visit", tree, result)]
    while stack:
        kind, payload, out = stack.pop()
        if kind == "visit":
            _visit(payload, out, stack, sort_members, canonical)
        elif kind == "emit":
            out.append(payload)
        else:  # "finish": sắp xếp các thành viên rồi nối vào đầu ra của container
            units = [u for u in payload if u]
            units.sort(key=lambda unit: tuple(t.value for t in unit))
            for unit in units:
                out.extend(unit)
    return result


def normalize_tree(tree: Any, *, sort_members: bool = True, canonical: bool = True) -> List[str]:
    """Như trên nhưng chỉ trả về chuỗi giá trị token (List[str]) — đầu vào của Winnowing."""
    return [
        t.value
        for t in normalize_tree_with_lines(tree, sort_members=sort_members, canonical=canonical)
    ]
