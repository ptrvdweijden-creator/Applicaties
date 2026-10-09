"""Backend tests for project reservations (reserveringen).

Covers:
- POST/PATCH/GET /api/reservations with RBAC (admin only for mutations; all roles can list/get)
- POST /api/reservations/{id}/release and /complete
- Stock semantics: physical unchanged on reserve, reserved +qty, available = physical - reserved
- Idempotency via client_request_id
- 409 on quantity > available (both create and update)
- Afboeken (POST /api/mutations) with reservation_id reduces physical and reserves
- Free afboeken limited to available (409 when > available)
- Reservering voltooid when quantity reaches 0
- Concurrency: parallel create never makes available negative
"""
import time
import uuid
import threading
import requests

BASE_URL = "https://voorraad-scan.preview.emergentagent.com"


def _crid(prefix="T"):
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def _mk_article(h_admin, name="TEST Reservering", stock=100):
    code = f"TEST-RES-{uuid.uuid4().hex[:8].upper()}"
    r = requests.post(f"{BASE_URL}/api/articles", json={
        "article_number": code,
        "title": name,
        "description": "TEST reservation seed article",
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


# ---------- POST /api/reservations: RBAC + stock semantics + idempotency ----------
class TestCreateReservation:
    def test_create_as_admin_updates_reserved_and_available(self, h_admin):
        art = _mk_article(h_admin, stock=100)
        aid = art["id"]
        payload = {"client_request_id": _crid(), "article_id": aid,
                   "project": "TEST-Project-A", "quantity": 25, "note": "test note"}
        r = requests.post(f"{BASE_URL}/api/reservations", json=payload, headers=h_admin, timeout=15)
        assert r.status_code == 201, r.text
        res = r.json()
        assert res["quantity"] == 25
        assert res["status"] == "actief"
        assert res["project"] == "TEST-Project-A"
        # Verify stock: physical unchanged, reserved +25, available = 75
        a = _get_article(h_admin, aid)
        assert a["physical_stock"] == 100
        assert a["reserved_stock"] == 25
        assert a["available_stock"] == 75

    def test_monteur_and_magazijn_cannot_create(self, h_admin, h_mont, h_mag):
        art = _mk_article(h_admin, stock=50)
        for hdr in (h_mont, h_mag):
            r = requests.post(f"{BASE_URL}/api/reservations", json={
                "client_request_id": _crid(), "article_id": art["id"],
                "project": "TEST-Project-X", "quantity": 5}, headers=hdr, timeout=15)
            assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"

    def test_quantity_over_available_returns_409(self, h_admin):
        art = _mk_article(h_admin, stock=10)
        r = requests.post(f"{BASE_URL}/api/reservations", json={
            "client_request_id": _crid(), "article_id": art["id"],
            "project": "TEST-Over", "quantity": 11}, headers=h_admin, timeout=15)
        assert r.status_code == 409, r.text
        # Dutch message check (loose)
        assert "beschikbaar" in r.text.lower() or "onvoldoende" in r.text.lower()
        a = _get_article(h_admin, art["id"])
        assert a["reserved_stock"] == 0
        assert a["available_stock"] == 10

    def test_idempotent_client_request_id(self, h_admin):
        art = _mk_article(h_admin, stock=50)
        crid = _crid()
        payload = {"client_request_id": crid, "article_id": art["id"],
                   "project": "TEST-Idem", "quantity": 7}
        r1 = requests.post(f"{BASE_URL}/api/reservations", json=payload, headers=h_admin, timeout=15)
        assert r1.status_code == 201, r1.text
        r2 = requests.post(f"{BASE_URL}/api/reservations", json=payload, headers=h_admin, timeout=15)
        assert r2.status_code in (200, 201), r2.text
        assert r2.json()["id"] == r1.json()["id"]
        a = _get_article(h_admin, art["id"])
        assert a["reserved_stock"] == 7


# ---------- PATCH /api/reservations/{id} ----------
class TestUpdateReservation:
    def test_patch_admin_only(self, h_admin, h_mont):
        art = _mk_article(h_admin, stock=40)
        r = requests.post(f"{BASE_URL}/api/reservations", json={
            "client_request_id": _crid(), "article_id": art["id"],
            "project": "TEST-U", "quantity": 10}, headers=h_admin, timeout=15).json()
        rid = r["id"]
        r2 = requests.patch(f"{BASE_URL}/api/reservations/{rid}", json={"quantity": 12},
                            headers=h_mont, timeout=15)
        assert r2.status_code == 403, r2.text

    def test_increase_beyond_available_409(self, h_admin):
        art = _mk_article(h_admin, stock=20)
        r = requests.post(f"{BASE_URL}/api/reservations", json={
            "client_request_id": _crid(), "article_id": art["id"],
            "project": "TEST-U2", "quantity": 15}, headers=h_admin, timeout=15).json()
        r2 = requests.patch(f"{BASE_URL}/api/reservations/{r['id']}", json={"quantity": 25},
                            headers=h_admin, timeout=15)
        assert r2.status_code == 409, r2.text
        a = _get_article(h_admin, art["id"])
        assert a["reserved_stock"] == 15  # unchanged

    def test_decrease_frees_available(self, h_admin):
        art = _mk_article(h_admin, stock=30)
        r = requests.post(f"{BASE_URL}/api/reservations", json={
            "client_request_id": _crid(), "article_id": art["id"],
            "project": "TEST-U3", "quantity": 20}, headers=h_admin, timeout=15).json()
        r2 = requests.patch(f"{BASE_URL}/api/reservations/{r['id']}", json={"quantity": 8},
                            headers=h_admin, timeout=15)
        assert r2.status_code == 200, r2.text
        assert r2.json()["quantity"] == 8
        a = _get_article(h_admin, art["id"])
        assert a["reserved_stock"] == 8
        assert a["available_stock"] == 22

    def test_patch_closed_reservation_409(self, h_admin):
        art = _mk_article(h_admin, stock=10)
        r = requests.post(f"{BASE_URL}/api/reservations", json={
            "client_request_id": _crid(), "article_id": art["id"],
            "project": "TEST-C", "quantity": 3}, headers=h_admin, timeout=15).json()
        rel = requests.post(f"{BASE_URL}/api/reservations/{r['id']}/release",
                            json={"note": "test"}, headers=h_admin, timeout=15)
        assert rel.status_code == 200, rel.text
        r2 = requests.patch(f"{BASE_URL}/api/reservations/{r['id']}", json={"quantity": 5},
                            headers=h_admin, timeout=15)
        assert r2.status_code == 409, r2.text


# ---------- Release / Complete / History ----------
class TestCloseAndHistory:
    def test_release_admin_only_and_frees_available(self, h_admin, h_mont):
        art = _mk_article(h_admin, stock=20)
        r = requests.post(f"{BASE_URL}/api/reservations", json={
            "client_request_id": _crid(), "article_id": art["id"],
            "project": "TEST-R", "quantity": 8}, headers=h_admin, timeout=15).json()
        # monteur forbidden
        rm = requests.post(f"{BASE_URL}/api/reservations/{r['id']}/release",
                           json={"note": "x"}, headers=h_mont, timeout=15)
        assert rm.status_code == 403
        # admin ok
        rr = requests.post(f"{BASE_URL}/api/reservations/{r['id']}/release",
                           json={"note": "opgeheven"}, headers=h_admin, timeout=15)
        assert rr.status_code == 200
        assert rr.json()["status"] == "opgeheven"
        a = _get_article(h_admin, art["id"])
        assert a["reserved_stock"] == 0
        assert a["available_stock"] == 20

    def test_complete_admin_only(self, h_admin, h_mont):
        art = _mk_article(h_admin, stock=15)
        r = requests.post(f"{BASE_URL}/api/reservations", json={
            "client_request_id": _crid(), "article_id": art["id"],
            "project": "TEST-V", "quantity": 5}, headers=h_admin, timeout=15).json()
        rm = requests.post(f"{BASE_URL}/api/reservations/{r['id']}/complete",
                           json={"note": ""}, headers=h_mont, timeout=15)
        assert rm.status_code == 403
        rr = requests.post(f"{BASE_URL}/api/reservations/{r['id']}/complete",
                           json={"note": "handmatig voltooid"}, headers=h_admin, timeout=15)
        assert rr.status_code == 200
        assert rr.json()["status"] == "voltooid"

    def test_get_includes_events_history(self, h_admin):
        art = _mk_article(h_admin, stock=30)
        r = requests.post(f"{BASE_URL}/api/reservations", json={
            "client_request_id": _crid(), "article_id": art["id"],
            "project": "TEST-H", "quantity": 10}, headers=h_admin, timeout=15).json()
        requests.patch(f"{BASE_URL}/api/reservations/{r['id']}",
                       json={"quantity": 7}, headers=h_admin, timeout=15)
        requests.post(f"{BASE_URL}/api/reservations/{r['id']}/release",
                      json={"note": "end"}, headers=h_admin, timeout=15)
        g = requests.get(f"{BASE_URL}/api/reservations/{r['id']}", headers=h_admin, timeout=15)
        assert g.status_code == 200
        events = g.json().get("events", [])
        actions = [e["action"] for e in events]
        assert "aangemaakt" in actions
        assert "gewijzigd" in actions
        assert "opgeheven" in actions


# ---------- GET /api/reservations?article_id=&status= ----------
class TestListReservations:
    def test_list_visible_to_all_roles_with_filters(self, h_admin, h_mag, h_mont):
        art = _mk_article(h_admin, stock=30)
        aid = art["id"]
        r1 = requests.post(f"{BASE_URL}/api/reservations", json={
            "client_request_id": _crid(), "article_id": aid,
            "project": "TEST-L1", "quantity": 5}, headers=h_admin, timeout=15).json()
        r2 = requests.post(f"{BASE_URL}/api/reservations", json={
            "client_request_id": _crid(), "article_id": aid,
            "project": "TEST-L2", "quantity": 3}, headers=h_admin, timeout=15).json()
        # Close one
        requests.post(f"{BASE_URL}/api/reservations/{r2['id']}/complete",
                      json={"note": ""}, headers=h_admin, timeout=15)
        for hdr in (h_admin, h_mag, h_mont):
            # actief
            la = requests.get(f"{BASE_URL}/api/reservations?article_id={aid}&status=actief",
                              headers=hdr, timeout=15)
            assert la.status_code == 200, la.text
            ids = {x["id"] for x in la.json()}
            assert r1["id"] in ids and r2["id"] not in ids
            # afgesloten
            lc = requests.get(f"{BASE_URL}/api/reservations?article_id={aid}&status=afgesloten",
                              headers=hdr, timeout=15)
            assert lc.status_code == 200
            ids = {x["id"] for x in lc.json()}
            assert r2["id"] in ids and r1["id"] not in ids
            # alle
            lall = requests.get(f"{BASE_URL}/api/reservations?article_id={aid}&status=alle",
                                headers=hdr, timeout=15)
            assert lall.status_code == 200
            ids = {x["id"] for x in lall.json()}
            assert {r1["id"], r2["id"]}.issubset(ids)


# ---------- POST /api/mutations: afboeken with reservation_id ----------
class TestAfboekenOnReservation:
    def test_monteur_afboekt_op_reservering_physical_down_reserved_down_available_same(self, h_admin, h_mont):
        art = _mk_article(h_admin, stock=100)
        aid = art["id"]
        r = requests.post(f"{BASE_URL}/api/reservations", json={
            "client_request_id": _crid(), "article_id": aid,
            "project": "TEST-AF", "quantity": 25}, headers=h_admin, timeout=15).json()
        # Before: physical 100, reserved 25, available 75
        mut = requests.post(f"{BASE_URL}/api/mutations", json={
            "client_request_id": _crid("M"),
            "article_id": aid,
            "type": "afboeken",
            "quantity": 10,
            "note": "test",
            "reservation_id": r["id"],
        }, headers=h_mont, timeout=15)
        assert mut.status_code in (200, 201), mut.text
        a = _get_article(h_admin, aid)
        # physical -10 -> 90; reserved -10 -> 15; available = 90-15 = 75 (same)
        assert a["physical_stock"] == 90
        assert a["reserved_stock"] == 15
        assert a["available_stock"] == 75
        # Reservation remaining = 15
        g = requests.get(f"{BASE_URL}/api/reservations/{r['id']}", headers=h_admin, timeout=15).json()
        assert g["quantity"] == 15
        assert g["status"] == "actief"

    def test_full_afboeken_sets_reservation_to_voltooid(self, h_admin):
        art = _mk_article(h_admin, stock=30)
        r = requests.post(f"{BASE_URL}/api/reservations", json={
            "client_request_id": _crid(), "article_id": art["id"],
            "project": "TEST-FULL", "quantity": 10}, headers=h_admin, timeout=15).json()
        mut = requests.post(f"{BASE_URL}/api/mutations", json={
            "client_request_id": _crid("M"),
            "article_id": art["id"],
            "type": "afboeken",
            "quantity": 10,
            "reservation_id": r["id"],
        }, headers=h_admin, timeout=15)
        assert mut.status_code in (200, 201), mut.text
        g = requests.get(f"{BASE_URL}/api/reservations/{r['id']}", headers=h_admin, timeout=15).json()
        assert g["quantity"] == 0
        assert g["status"] == "voltooid"

    def test_free_afboeken_over_available_409(self, h_admin):
        art = _mk_article(h_admin, stock=20)
        # Reserve 15 -> available 5
        requests.post(f"{BASE_URL}/api/reservations", json={
            "client_request_id": _crid(), "article_id": art["id"],
            "project": "TEST-FREE", "quantity": 15}, headers=h_admin, timeout=15)
        # Try free afboeken of 10 (no reservation_id) -> should 409
        mut = requests.post(f"{BASE_URL}/api/mutations", json={
            "client_request_id": _crid("M"),
            "article_id": art["id"],
            "type": "afboeken",
            "quantity": 10,
        }, headers=h_admin, timeout=15)
        assert mut.status_code == 409, mut.text
        a = _get_article(h_admin, art["id"])
        assert a["physical_stock"] == 20
        assert a["reserved_stock"] == 15

    def test_ontvangst_retour_correctie_still_work(self, h_admin):
        art = _mk_article(h_admin, stock=50)
        aid = art["id"]
        # ontvangst
        r1 = requests.post(f"{BASE_URL}/api/mutations", json={
            "client_request_id": _crid("M"), "article_id": aid,
            "type": "ontvangst", "quantity": 5}, headers=h_admin, timeout=15)
        assert r1.status_code in (200, 201), r1.text
        # retour
        r2 = requests.post(f"{BASE_URL}/api/mutations", json={
            "client_request_id": _crid("M"), "article_id": aid,
            "type": "retour", "quantity": 2}, headers=h_admin, timeout=15)
        assert r2.status_code in (200, 201), r2.text
        # correctie to 60
        r3 = requests.post(f"{BASE_URL}/api/mutations", json={
            "client_request_id": _crid("M"), "article_id": aid,
            "type": "correctie", "quantity": 60}, headers=h_admin, timeout=15)
        assert r3.status_code in (200, 201), r3.text
        a = _get_article(h_admin, aid)
        assert a["physical_stock"] == 60


# ---------- Concurrency: parallel create must never make available negative ----------
class TestConcurrency:
    def test_parallel_reservations_never_overbook(self, h_admin):
        art = _mk_article(h_admin, stock=20)
        aid = art["id"]
        token_hdr = h_admin
        results = []
        lock = threading.Lock()

        def worker(i):
            try:
                r = requests.post(f"{BASE_URL}/api/reservations", json={
                    "client_request_id": _crid(f"C{i}"),
                    "article_id": aid, "project": f"TEST-CC-{i}",
                    "quantity": 3,
                }, headers=token_hdr, timeout=20)
                with lock:
                    results.append(r.status_code)
            except Exception as e:
                with lock:
                    results.append(f"err:{e}")

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(10)]
        for t in threads: t.start()
        for t in threads: t.join()
        # 10 workers * 3 = 30, but stock is 20 so max 6 should succeed (6*3=18 <= 20)
        ok = sum(1 for s in results if s == 201)
        conflict = sum(1 for s in results if s == 409)
        assert ok + conflict == 10, f"Unexpected results: {results}"
        a = _get_article(h_admin, aid)
        assert a["reserved_stock"] <= 20, f"Overbooked! reserved={a['reserved_stock']}"
        assert a["available_stock"] >= 0, f"Negative available! {a}"
        assert a["physical_stock"] == 20  # unchanged by reservations
