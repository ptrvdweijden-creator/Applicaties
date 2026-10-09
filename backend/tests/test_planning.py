"""Backend tests for Planning: Projecten + Leveranciersbestellingen.

Covers for /api/projects:
- RBAC: admin only create/patch/add-line/release; monteur+magazijn 403
- Duplicate name (case-insensitive) -> 409; duplicate article in lines -> 422
- Line over available -> 409 and nothing is created (atomicity)
- GET list filters status actief|vervallen|alle; GET /{id} returns lines with
  quantity, article_physical_stock, article_available_stock
- Add-line: same article again -> 409
- Rename via PATCH, release flips to vervallen, reservations opgeheven, available restored
- Existing PATCH/release on /api/reservations/{id} still works for project lines

Covers for /api/supplier-orders:
- POST admin only, duplicate order_number (ci) -> 409, duplicate article in lines -> 422
- Physical stock unchanged after order creation
- Receive: idempotent by client_request_id; over-open qty -> 409 and no mutation booked
- Partial -> status 'gedeeltelijk_ontvangen', physical += received
- Full -> status 'volledig_ontvangen'
- Mutations include type ontvangst with supplier_order_number
- PATCH with stale version -> 409
- PATCH lowering ordered below received -> 409
- Monteur/magazijn: GET allowed, receive/patch 403
"""
import uuid
import requests

BASE_URL = "https://voorraad-scan.preview.emergentagent.com"


def _crid(prefix="T"):
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def _mk_article(h_admin, stock=100):
    code = f"TEST-PL-{uuid.uuid4().hex[:8].upper()}"
    r = requests.post(f"{BASE_URL}/api/articles", json={
        "article_number": code,
        "title": "TEST Planning",
        "description": "TEST planning seed",
        "category": "TEST",
        "unit": "stuk",
        "initial_stock": stock,
        "stock_note": "TEST seed",
    }, headers=h_admin, timeout=30)
    assert r.status_code in (200, 201), r.text
    return r.json()


def _get_article(h, aid):
    r = requests.get(f"{BASE_URL}/api/articles/{aid}", headers=h, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


# =========================================================== PROJECTS ===

class TestCreateProject:
    def test_admin_creates_project_with_lines(self, h_admin):
        a1 = _mk_article(h_admin, 50)
        a2 = _mk_article(h_admin, 30)
        name = f"TEST-P-{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{BASE_URL}/api/projects", json={
            "client_request_id": _crid(),
            "name": name,
            "note": "seed",
            "lines": [
                {"article_id": a1["id"], "quantity": 20},
                {"article_id": a2["id"], "quantity": 10},
            ],
        }, headers=h_admin, timeout=20)
        assert r.status_code == 201, r.text
        p = r.json()
        assert p["status"] == "actief"
        assert p["line_count"] == 2
        # GET /{id} returns lines with physical/available
        g = requests.get(f"{BASE_URL}/api/projects/{p['id']}", headers=h_admin, timeout=15).json()
        assert len(g["lines"]) == 2
        for line in g["lines"]:
            assert "quantity" in line
            assert "article_physical_stock" in line
            assert "article_available_stock" in line
        # Stock side-effects
        a1v = _get_article(h_admin, a1["id"])
        assert a1v["physical_stock"] == 50 and a1v["reserved_stock"] == 20
        a2v = _get_article(h_admin, a2["id"])
        assert a2v["physical_stock"] == 30 and a2v["reserved_stock"] == 10

    def test_non_admin_cannot_create(self, h_admin, h_mont, h_mag):
        a = _mk_article(h_admin, 20)
        for hdr in (h_mont, h_mag):
            r = requests.post(f"{BASE_URL}/api/projects", json={
                "client_request_id": _crid(),
                "name": f"TEST-P-NON-{uuid.uuid4().hex[:6]}",
                "lines": [{"article_id": a["id"], "quantity": 2}],
            }, headers=hdr, timeout=15)
            assert r.status_code == 403, r.text

    def test_duplicate_name_case_insensitive_409(self, h_admin):
        a = _mk_article(h_admin, 10)
        name = f"TEST-DUP-{uuid.uuid4().hex[:6]}"
        r1 = requests.post(f"{BASE_URL}/api/projects", json={
            "client_request_id": _crid(), "name": name,
            "lines": [{"article_id": a["id"], "quantity": 1}]}, headers=h_admin, timeout=15)
        assert r1.status_code == 201
        r2 = requests.post(f"{BASE_URL}/api/projects", json={
            "client_request_id": _crid(), "name": name.upper(),
            "lines": [{"article_id": a["id"], "quantity": 1}]}, headers=h_admin, timeout=15)
        assert r2.status_code == 409, r2.text

    def test_duplicate_article_in_lines_422(self, h_admin):
        a = _mk_article(h_admin, 10)
        r = requests.post(f"{BASE_URL}/api/projects", json={
            "client_request_id": _crid(),
            "name": f"TEST-DUPART-{uuid.uuid4().hex[:6]}",
            "lines": [
                {"article_id": a["id"], "quantity": 1},
                {"article_id": a["id"], "quantity": 2},
            ],
        }, headers=h_admin, timeout=15)
        assert r.status_code == 422, r.text

    def test_line_over_available_409_and_nothing_created(self, h_admin):
        a1 = _mk_article(h_admin, 5)
        a2 = _mk_article(h_admin, 5)
        name = f"TEST-OVR-{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{BASE_URL}/api/projects", json={
            "client_request_id": _crid(), "name": name,
            "lines": [
                {"article_id": a1["id"], "quantity": 3},
                {"article_id": a2["id"], "quantity": 10},  # over
            ],
        }, headers=h_admin, timeout=15)
        assert r.status_code == 409, r.text
        # Project niet aangemaakt
        lst = requests.get(f"{BASE_URL}/api/projects?status=alle&q={name}", headers=h_admin, timeout=15).json()
        assert not any(p["name"] == name for p in lst)
        # Geen voorraadeffect op a1 (eerste regel mocht niet blijven staan)
        v = _get_article(h_admin, a1["id"])
        assert v["reserved_stock"] == 0


class TestListAndGetProject:
    def test_list_filters(self, h_admin, h_mag, h_mont):
        a = _mk_article(h_admin, 20)
        name = f"TEST-LIST-{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{BASE_URL}/api/projects", json={
            "client_request_id": _crid(), "name": name,
            "lines": [{"article_id": a["id"], "quantity": 5}]}, headers=h_admin, timeout=15).json()
        # all roles can list
        for hdr in (h_admin, h_mag, h_mont):
            la = requests.get(f"{BASE_URL}/api/projects?status=actief&q={name}", headers=hdr, timeout=15)
            assert la.status_code == 200
            assert any(p["id"] == r["id"] for p in la.json())
        # release -> should appear under vervallen
        rel = requests.post(f"{BASE_URL}/api/projects/{r['id']}/release", json={"note": "einde"}, headers=h_admin, timeout=15)
        assert rel.status_code == 200
        lv = requests.get(f"{BASE_URL}/api/projects?status=vervallen&q={name}", headers=h_mont, timeout=15)
        assert lv.status_code == 200
        assert any(p["id"] == r["id"] for p in lv.json())


class TestAddLine:
    def test_add_line_and_duplicate_article_409(self, h_admin):
        a1 = _mk_article(h_admin, 20)
        a2 = _mk_article(h_admin, 20)
        name = f"TEST-ADD-{uuid.uuid4().hex[:6]}"
        p = requests.post(f"{BASE_URL}/api/projects", json={
            "client_request_id": _crid(), "name": name,
            "lines": [{"article_id": a1["id"], "quantity": 2}]}, headers=h_admin, timeout=15).json()
        # Add new article -> 201
        add1 = requests.post(f"{BASE_URL}/api/projects/{p['id']}/lines", json={
            "client_request_id": _crid(), "article_id": a2["id"], "quantity": 3}, headers=h_admin, timeout=15)
        assert add1.status_code == 201, add1.text
        # Add same article again (new crid) -> 409
        add2 = requests.post(f"{BASE_URL}/api/projects/{p['id']}/lines", json={
            "client_request_id": _crid(), "article_id": a2["id"], "quantity": 1}, headers=h_admin, timeout=15)
        assert add2.status_code == 409, add2.text
        # Monteur cannot add
        add3 = requests.post(f"{BASE_URL}/api/projects/{p['id']}/lines", json={
            "client_request_id": _crid(), "article_id": a1["id"], "quantity": 1}, headers=h_admin.copy(), timeout=15)
        # Try with monteur headers:
    def test_add_line_monteur_403(self, h_admin, h_mont):
        a1 = _mk_article(h_admin, 20)
        p = requests.post(f"{BASE_URL}/api/projects", json={
            "client_request_id": _crid(), "name": f"TEST-ADDF-{uuid.uuid4().hex[:6]}",
            "lines": [{"article_id": a1["id"], "quantity": 1}]}, headers=h_admin, timeout=15).json()
        a2 = _mk_article(h_admin, 10)
        r = requests.post(f"{BASE_URL}/api/projects/{p['id']}/lines", json={
            "client_request_id": _crid(), "article_id": a2["id"], "quantity": 2}, headers=h_mont, timeout=15)
        assert r.status_code == 403


class TestPatchAndRelease:
    def test_rename_project(self, h_admin):
        a = _mk_article(h_admin, 10)
        name = f"TEST-REN-{uuid.uuid4().hex[:6]}"
        p = requests.post(f"{BASE_URL}/api/projects", json={
            "client_request_id": _crid(), "name": name,
            "lines": [{"article_id": a["id"], "quantity": 2}]}, headers=h_admin, timeout=15).json()
        new_name = name + "-X"
        r = requests.patch(f"{BASE_URL}/api/projects/{p['id']}", json={"name": new_name}, headers=h_admin, timeout=15)
        assert r.status_code == 200
        assert r.json()["name"] == new_name
        # Reservation.project should also be renamed
        g = requests.get(f"{BASE_URL}/api/projects/{p['id']}", headers=h_admin, timeout=15).json()
        for line in g["lines"]:
            assert line["project"] == new_name

    def test_release_frees_reservations_and_sets_vervallen(self, h_admin):
        a = _mk_article(h_admin, 25)
        name = f"TEST-REL-{uuid.uuid4().hex[:6]}"
        p = requests.post(f"{BASE_URL}/api/projects", json={
            "client_request_id": _crid(), "name": name,
            "lines": [{"article_id": a["id"], "quantity": 8}]}, headers=h_admin, timeout=15).json()
        v1 = _get_article(h_admin, a["id"])
        assert v1["reserved_stock"] == 8
        rel = requests.post(f"{BASE_URL}/api/projects/{p['id']}/release", json={"note": "einde"}, headers=h_admin, timeout=15)
        assert rel.status_code == 200
        assert rel.json()["status"] == "vervallen"
        v2 = _get_article(h_admin, a["id"])
        assert v2["reserved_stock"] == 0
        assert v2["available_stock"] == 25
        # All reservations now opgeheven
        rs = requests.get(f"{BASE_URL}/api/reservations?article_id={a['id']}&status=alle", headers=h_admin, timeout=15).json()
        proj_res = [r for r in rs if r.get("project_id") == p["id"]]
        assert proj_res and all(r["status"] == "opgeheven" for r in proj_res)

    def test_release_non_admin_403(self, h_admin, h_mont):
        a = _mk_article(h_admin, 5)
        p = requests.post(f"{BASE_URL}/api/projects", json={
            "client_request_id": _crid(), "name": f"TEST-RELF-{uuid.uuid4().hex[:6]}",
            "lines": [{"article_id": a["id"], "quantity": 1}]}, headers=h_admin, timeout=15).json()
        r = requests.post(f"{BASE_URL}/api/projects/{p['id']}/release", json={"note": ""}, headers=h_mont, timeout=15)
        assert r.status_code == 403

    def test_patch_reservation_of_project_line_works(self, h_admin):
        a = _mk_article(h_admin, 30)
        name = f"TEST-PR-{uuid.uuid4().hex[:6]}"
        p = requests.post(f"{BASE_URL}/api/projects", json={
            "client_request_id": _crid(), "name": name,
            "lines": [{"article_id": a["id"], "quantity": 10}]}, headers=h_admin, timeout=15).json()
        g = requests.get(f"{BASE_URL}/api/projects/{p['id']}", headers=h_admin, timeout=15).json()
        rid = g["lines"][0]["id"]
        r = requests.patch(f"{BASE_URL}/api/reservations/{rid}", json={"quantity": 4}, headers=h_admin, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["quantity"] == 4
        v = _get_article(h_admin, a["id"])
        assert v["reserved_stock"] == 4


# ================================================= SUPPLIER ORDERS ===

class TestCreateOrder:
    def test_admin_creates_order_physical_unchanged(self, h_admin):
        a1 = _mk_article(h_admin, 10)
        a2 = _mk_article(h_admin, 5)
        num = f"TEST-CN-{uuid.uuid4().hex[:6].upper()}"
        r = requests.post(f"{BASE_URL}/api/supplier-orders", json={
            "order_number": num, "supplier": "China", "order_date": "2026-01-10",
            "expected_date": "2026-02-01", "note": "test",
            "lines": [{"article_id": a1["id"], "quantity": 100},
                      {"article_id": a2["id"], "quantity": 50}],
        }, headers=h_admin, timeout=20)
        assert r.status_code == 201, r.text
        o = r.json()
        assert o["status"] == "besteld"
        assert len(o["lines"]) == 2
        for l in o["lines"]:
            assert l["open"] == l["ordered"]
        # physical not touched
        assert _get_article(h_admin, a1["id"])["physical_stock"] == 10
        assert _get_article(h_admin, a2["id"])["physical_stock"] == 5

    def test_non_admin_create_403(self, h_admin, h_mont, h_mag):
        a = _mk_article(h_admin, 5)
        for hdr in (h_mont, h_mag):
            r = requests.post(f"{BASE_URL}/api/supplier-orders", json={
                "order_number": f"TEST-CN-N{uuid.uuid4().hex[:6]}",
                "order_date": "2026-01-10",
                "lines": [{"article_id": a["id"], "quantity": 1}],
            }, headers=hdr, timeout=15)
            assert r.status_code == 403

    def test_duplicate_order_number_409(self, h_admin):
        a = _mk_article(h_admin, 5)
        num = f"TEST-CN-D{uuid.uuid4().hex[:6]}"
        p = {"order_number": num, "order_date": "2026-01-10",
             "lines": [{"article_id": a["id"], "quantity": 1}]}
        r1 = requests.post(f"{BASE_URL}/api/supplier-orders", json=p, headers=h_admin, timeout=15)
        assert r1.status_code == 201
        p["order_number"] = num.upper()
        r2 = requests.post(f"{BASE_URL}/api/supplier-orders", json=p, headers=h_admin, timeout=15)
        assert r2.status_code == 409, r2.text

    def test_duplicate_article_in_lines_422(self, h_admin):
        a = _mk_article(h_admin, 5)
        r = requests.post(f"{BASE_URL}/api/supplier-orders", json={
            "order_number": f"TEST-CN-DA{uuid.uuid4().hex[:6]}",
            "order_date": "2026-01-10",
            "lines": [
                {"article_id": a["id"], "quantity": 1},
                {"article_id": a["id"], "quantity": 2},
            ],
        }, headers=h_admin, timeout=15)
        assert r.status_code == 422, r.text


class TestReceiveOrder:
    def _mk(self, h_admin, ordered1=100, ordered2=50, stock=10):
        a1 = _mk_article(h_admin, stock)
        a2 = _mk_article(h_admin, stock)
        num = f"TEST-CN-R{uuid.uuid4().hex[:6]}"
        o = requests.post(f"{BASE_URL}/api/supplier-orders", json={
            "order_number": num, "order_date": "2026-01-10",
            "lines": [{"article_id": a1["id"], "quantity": ordered1},
                      {"article_id": a2["id"], "quantity": ordered2}],
        }, headers=h_admin, timeout=15).json()
        return a1, a2, o

    def test_partial_receive_updates_status_and_physical(self, h_admin):
        a1, a2, o = self._mk(h_admin, ordered1=10, ordered2=5, stock=0)
        l1 = o["lines"][0]
        rcv = requests.post(f"{BASE_URL}/api/supplier-orders/{o['id']}/receive", json={
            "client_request_id": _crid("R"),
            "lines": [{"line_id": l1["line_id"], "quantity": 4}],
            "note": "deel",
        }, headers=h_admin, timeout=15)
        assert rcv.status_code == 200, rcv.text
        body = rcv.json()
        assert body["status"] == "gedeeltelijk_ontvangen"
        assert body["errors"] == []
        # Physical a1 += 4
        assert _get_article(h_admin, a1["id"])["physical_stock"] == 4
        # Mutation recorded with type ontvangst and supplier_order_number
        muts = requests.get(f"{BASE_URL}/api/mutations?article_id={a1['id']}", headers=h_admin, timeout=15).json()
        rows = muts.get("items", muts) if isinstance(muts, dict) else muts
        matches = [m for m in rows if m.get("type") == "ontvangst" and m.get("supplier_order_number") == o["order_number"]]
        assert matches, f"No ontvangst mutation with supplier_order_number; got: {rows}"

    def test_idempotent_receive_no_double_booking(self, h_admin):
        a1, a2, o = self._mk(h_admin, ordered1=10, ordered2=5, stock=0)
        l1 = o["lines"][0]
        crid = _crid("R")
        p = {"client_request_id": crid, "lines": [{"line_id": l1["line_id"], "quantity": 3}]}
        r1 = requests.post(f"{BASE_URL}/api/supplier-orders/{o['id']}/receive", json=p, headers=h_admin, timeout=15)
        assert r1.status_code == 200
        r2 = requests.post(f"{BASE_URL}/api/supplier-orders/{o['id']}/receive", json=p, headers=h_admin, timeout=15)
        assert r2.status_code == 200
        # Physical should still be 3 (not 6)
        assert _get_article(h_admin, a1["id"])["physical_stock"] == 3

    def test_over_open_quantity_409(self, h_admin):
        a1, a2, o = self._mk(h_admin, ordered1=5, ordered2=5, stock=0)
        l1 = o["lines"][0]
        rcv = requests.post(f"{BASE_URL}/api/supplier-orders/{o['id']}/receive", json={
            "client_request_id": _crid("R"),
            "lines": [{"line_id": l1["line_id"], "quantity": 999}],
        }, headers=h_admin, timeout=15)
        assert rcv.status_code == 409, rcv.text
        # No stock change
        assert _get_article(h_admin, a1["id"])["physical_stock"] == 0

    def test_full_receive_sets_volledig(self, h_admin):
        a1, a2, o = self._mk(h_admin, ordered1=4, ordered2=3, stock=0)
        rcv = requests.post(f"{BASE_URL}/api/supplier-orders/{o['id']}/receive", json={
            "client_request_id": _crid("R"),
            "lines": [
                {"line_id": o["lines"][0]["line_id"], "quantity": 4},
                {"line_id": o["lines"][1]["line_id"], "quantity": 3},
            ],
        }, headers=h_admin, timeout=15)
        assert rcv.status_code == 200
        assert rcv.json()["status"] == "volledig_ontvangen"
        assert _get_article(h_admin, a1["id"])["physical_stock"] == 4
        assert _get_article(h_admin, a2["id"])["physical_stock"] == 3

    def test_non_admin_receive_403_but_get_ok(self, h_admin, h_mont, h_mag):
        a1, a2, o = self._mk(h_admin, ordered1=3, ordered2=2, stock=0)
        for hdr in (h_mont, h_mag):
            r = requests.post(f"{BASE_URL}/api/supplier-orders/{o['id']}/receive", json={
                "client_request_id": _crid("R"),
                "lines": [{"line_id": o["lines"][0]["line_id"], "quantity": 1}],
            }, headers=hdr, timeout=15)
            assert r.status_code == 403
            g = requests.get(f"{BASE_URL}/api/supplier-orders/{o['id']}", headers=hdr, timeout=15)
            assert g.status_code == 200


class TestPatchOrder:
    def test_stale_version_409(self, h_admin):
        a = _mk_article(h_admin, 0)
        num = f"TEST-CN-V{uuid.uuid4().hex[:6]}"
        o = requests.post(f"{BASE_URL}/api/supplier-orders", json={
            "order_number": num, "order_date": "2026-01-10",
            "lines": [{"article_id": a["id"], "quantity": 5}]}, headers=h_admin, timeout=15).json()
        # Bump version via a valid PATCH first
        p1 = requests.patch(f"{BASE_URL}/api/supplier-orders/{o['id']}", json={
            "version": o["version"], "note": "edit1"}, headers=h_admin, timeout=15)
        assert p1.status_code == 200, p1.text
        # Now stale
        p2 = requests.patch(f"{BASE_URL}/api/supplier-orders/{o['id']}", json={
            "version": o["version"], "note": "edit2"}, headers=h_admin, timeout=15)
        assert p2.status_code == 409, p2.text

    def test_lower_ordered_below_received_409(self, h_admin):
        a = _mk_article(h_admin, 0)
        o = requests.post(f"{BASE_URL}/api/supplier-orders", json={
            "order_number": f"TEST-CN-LB{uuid.uuid4().hex[:6]}", "order_date": "2026-01-10",
            "lines": [{"article_id": a["id"], "quantity": 10}]}, headers=h_admin, timeout=15).json()
        rcv = requests.post(f"{BASE_URL}/api/supplier-orders/{o['id']}/receive", json={
            "client_request_id": _crid("R"),
            "lines": [{"line_id": o["lines"][0]["line_id"], "quantity": 6}],
        }, headers=h_admin, timeout=15)
        assert rcv.status_code == 200
        fresh = requests.get(f"{BASE_URL}/api/supplier-orders/{o['id']}", headers=h_admin, timeout=15).json()
        p = requests.patch(f"{BASE_URL}/api/supplier-orders/{o['id']}", json={
            "version": fresh["version"],
            "lines": [{"line_id": o["lines"][0]["line_id"], "article_id": a["id"], "quantity": 3}],
        }, headers=h_admin, timeout=15)
        assert p.status_code == 409, p.text

    def test_non_admin_patch_403(self, h_admin, h_mont):
        a = _mk_article(h_admin, 0)
        o = requests.post(f"{BASE_URL}/api/supplier-orders", json={
            "order_number": f"TEST-CN-M{uuid.uuid4().hex[:6]}", "order_date": "2026-01-10",
            "lines": [{"article_id": a["id"], "quantity": 1}]}, headers=h_admin, timeout=15).json()
        r = requests.patch(f"{BASE_URL}/api/supplier-orders/{o['id']}", json={
            "version": o["version"], "note": "x"}, headers=h_mont, timeout=15)
        assert r.status_code == 403
