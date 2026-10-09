"""Backend tests for Douchebeslag inventory API."""
import asyncio
import uuid
import requests
import pytest
from concurrent.futures import ThreadPoolExecutor

BASE = "https://voorraad-scan.preview.emergentagent.com"


# ---------------- Auth ----------------
class TestAuth:
    def test_login_admin(self):
        r = requests.post(f"{BASE}/api/auth/login",
                          json={"email": "admin@douchebeslag.nl", "password": "Admin123!"})
        assert r.status_code == 200
        d = r.json()
        assert "access_token" in d
        assert d["user"]["role"] == "admin"
        assert d["user"]["email"] == "admin@douchebeslag.nl"

    def test_login_bad_credentials(self):
        r = requests.post(f"{BASE}/api/auth/login",
                          json={"email": "admin@douchebeslag.nl", "password": "wrong"})
        assert r.status_code == 401

    def test_login_bad_email(self):
        r = requests.post(f"{BASE}/api/auth/login",
                          json={"email": "nope@x.com", "password": "x"})
        assert r.status_code == 401

    def test_me_requires_token(self):
        r = requests.get(f"{BASE}/api/auth/me")
        assert r.status_code == 401

    def test_me_ok(self, h_admin):
        r = requests.get(f"{BASE}/api/auth/me", headers=h_admin)
        assert r.status_code == 200
        assert r.json()["role"] == "admin"


# ---------------- Role permissions ----------------
class TestRoles:
    def test_monteur_cannot_create_article(self, h_mont):
        r = requests.post(f"{BASE}/api/articles", headers=h_mont,
                          json={"article_number": "TEST-ROLE-1", "description": "x", "category": "c"})
        assert r.status_code == 403

    def test_monteur_cannot_ontvangst(self, h_mont):
        # pick any article
        arts = requests.get(f"{BASE}/api/articles", headers=h_mont).json()
        aid = arts[0]["id"]
        r = requests.post(f"{BASE}/api/mutations", headers=h_mont, json={
            "client_request_id": f"test-{uuid.uuid4()}",
            "article_id": aid, "type": "ontvangst", "quantity": 1, "note": ""
        })
        assert r.status_code == 403

    def test_monteur_cannot_correctie(self, h_mont):
        arts = requests.get(f"{BASE}/api/articles", headers=h_mont).json()
        aid = arts[0]["id"]
        r = requests.post(f"{BASE}/api/mutations", headers=h_mont, json={
            "client_request_id": f"test-{uuid.uuid4()}",
            "article_id": aid, "type": "correctie", "quantity": 10, "note": ""
        })
        assert r.status_code == 403

    def test_magazijn_can_ontvangst(self, h_mag):
        arts = requests.get(f"{BASE}/api/articles", headers=h_mag).json()
        aid = arts[0]["id"]
        r = requests.post(f"{BASE}/api/mutations", headers=h_mag, json={
            "client_request_id": f"test-mag-{uuid.uuid4()}",
            "article_id": aid, "type": "ontvangst", "quantity": 1, "note": "TEST"
        })
        assert r.status_code == 201, r.text

    def test_magazijn_cannot_create_article(self, h_mag):
        r = requests.post(f"{BASE}/api/articles", headers=h_mag,
                          json={"article_number": "TEST-ROLE-2", "description": "x", "category": "c"})
        assert r.status_code == 403


# ---------------- Articles ----------------
class TestArticles:
    def test_list_articles(self, h_admin):
        r = requests.get(f"{BASE}/api/articles", headers=h_admin)
        assert r.status_code == 200
        arts = r.json()
        assert len(arts) >= 20
        # response shape
        a = arts[0]
        for k in ("id", "article_number", "description", "physical_stock", "reserved_stock", "available_stock", "below_min"):
            assert k in a

    def test_search_q(self, h_admin):
        r = requests.get(f"{BASE}/api/articles", headers=h_admin, params={"q": "glasklem"})
        assert r.status_code == 200
        assert all("glasklem" in a["description"].lower() or "glasklem" in a["article_number"].lower()
                   for a in r.json())

    def test_filter_category(self, h_admin):
        r = requests.get(f"{BASE}/api/articles", headers=h_admin, params={"category": "Scharnieren"})
        assert r.status_code == 200
        assert all(a["category"] == "Scharnieren" for a in r.json())

    def test_below_min(self, h_admin):
        r = requests.get(f"{BASE}/api/articles", headers=h_admin, params={"below_min": "true"})
        assert r.status_code == 200
        for a in r.json():
            assert a["physical_stock"] < a["min_stock"]

    def test_by_barcode_known(self, h_admin):
        r = requests.get(f"{BASE}/api/articles/by-barcode/8712345000011", headers=h_admin)
        assert r.status_code == 200
        assert r.json()["article_number"] == "DB-1001"

    def test_by_barcode_unknown(self, h_admin):
        r = requests.get(f"{BASE}/api/articles/by-barcode/0000000000000", headers=h_admin)
        assert r.status_code == 404

    def test_create_duplicate_article_number(self, h_admin):
        r = requests.post(f"{BASE}/api/articles", headers=h_admin, json={
            "article_number": "DB-1001", "description": "dup", "category": "Glasklemmen"
        })
        assert r.status_code == 409

    def test_create_duplicate_barcode(self, h_admin):
        r = requests.post(f"{BASE}/api/articles", headers=h_admin, json={
            "article_number": "TEST-DUPBC-1", "description": "dup bc", "category": "Test",
            "barcodes": ["8712345000011"]
        })
        assert r.status_code == 409

    def test_create_article_with_initial_stock(self, h_admin):
        anum = f"TEST-CA-{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{BASE}/api/articles", headers=h_admin, json={
            "article_number": anum, "description": "TEST create", "category": "TestCat",
            "initial_stock": 7, "min_stock": 2
        })
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["physical_stock"] == 7
        aid = d["id"]
        # ontvangst mutation created
        muts = requests.get(f"{BASE}/api/mutations", headers=h_admin, params={"article_id": aid}).json()
        assert any(m["type"] == "ontvangst" and m["quantity"] == 7 for m in muts)

    def test_patch_cannot_change_article_number(self, h_admin):
        arts = requests.get(f"{BASE}/api/articles", headers=h_admin).json()
        aid = arts[0]["id"]
        orig_num = arts[0]["article_number"]
        r = requests.patch(f"{BASE}/api/articles/{aid}", headers=h_admin,
                           json={"article_number": "HACKED-123", "description": arts[0]["description"]})
        # Should either return 200 (ignored field) or 422; article_number must remain unchanged
        assert r.status_code in (200, 422)
        after = requests.get(f"{BASE}/api/articles/{aid}", headers=h_admin).json()
        assert after["article_number"] == orig_num

    def test_link_barcode_admin_only(self, h_mag, h_admin):
        arts = requests.get(f"{BASE}/api/articles", headers=h_admin).json()
        aid = arts[0]["id"]
        r = requests.post(f"{BASE}/api/articles/{aid}/barcodes", headers=h_mag,
                          json={"barcode": "9999000001"})
        assert r.status_code == 403

    def test_link_barcode_duplicate_rejected(self, h_admin):
        arts = requests.get(f"{BASE}/api/articles", headers=h_admin).json()
        aid = arts[1]["id"]
        # Try linking an existing barcode belonging to another article
        r = requests.post(f"{BASE}/api/articles/{aid}/barcodes", headers=h_admin,
                          json={"barcode": "8712345000011"})
        assert r.status_code == 409

    def test_link_barcode_success(self, h_admin):
        # create fresh article
        anum = f"TEST-LB-{uuid.uuid4().hex[:6]}"
        d = requests.post(f"{BASE}/api/articles", headers=h_admin, json={
            "article_number": anum, "description": "TEST link", "category": "TestCat"
        }).json()
        aid = d["id"]
        new_bc = f"TESTBC{uuid.uuid4().hex[:10]}"
        r = requests.post(f"{BASE}/api/articles/{aid}/barcodes", headers=h_admin,
                          json={"barcode": new_bc})
        assert r.status_code == 200
        assert new_bc in r.json()["barcodes"]


# ---------------- Mutations ----------------
class TestMutations:
    def test_afboeken_more_than_stock(self, h_admin):
        # Create isolated TEST article
        anum = f"TEST-AF-{uuid.uuid4().hex[:6]}"
        a = requests.post(f"{BASE}/api/articles", headers=h_admin, json={
            "article_number": anum, "description": "TEST af", "category": "TestCat",
            "initial_stock": 5
        }).json()
        aid = a["id"]
        r = requests.post(f"{BASE}/api/mutations", headers=h_admin, json={
            "client_request_id": f"test-{uuid.uuid4()}",
            "article_id": aid, "type": "afboeken", "quantity": 999, "note": ""
        })
        assert r.status_code == 409
        after = requests.get(f"{BASE}/api/articles/{aid}", headers=h_admin).json()
        assert after["physical_stock"] == 5

    def test_idempotent_client_request_id(self, h_admin):
        anum = f"TEST-ID-{uuid.uuid4().hex[:6]}"
        a = requests.post(f"{BASE}/api/articles", headers=h_admin, json={
            "article_number": anum, "description": "TEST idem", "category": "TestCat",
            "initial_stock": 10
        }).json()
        aid = a["id"]
        crid = f"test-idem-{uuid.uuid4()}"
        payload = {"client_request_id": crid, "article_id": aid, "type": "afboeken", "quantity": 3, "note": ""}
        r1 = requests.post(f"{BASE}/api/mutations", headers=h_admin, json=payload)
        r2 = requests.post(f"{BASE}/api/mutations", headers=h_admin, json=payload)
        assert r1.status_code == 201
        assert r2.status_code in (200, 201)
        after = requests.get(f"{BASE}/api/articles/{aid}", headers=h_admin).json()
        assert after["physical_stock"] == 7  # only one booking

    def test_correctie_sets_stock(self, h_admin):
        anum = f"TEST-CO-{uuid.uuid4().hex[:6]}"
        a = requests.post(f"{BASE}/api/articles", headers=h_admin, json={
            "article_number": anum, "description": "TEST corr", "category": "TestCat",
            "initial_stock": 10
        }).json()
        aid = a["id"]
        r = requests.post(f"{BASE}/api/mutations", headers=h_admin, json={
            "client_request_id": f"test-{uuid.uuid4()}",
            "article_id": aid, "type": "correctie", "quantity": 25, "note": "telling"
        })
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["stock_after"] == 25
        assert d["delta"] == 15

    def test_concurrency_no_negative_stock(self, h_admin):
        anum = f"TEST-CN-{uuid.uuid4().hex[:6]}"
        a = requests.post(f"{BASE}/api/articles", headers=h_admin, json={
            "article_number": anum, "description": "TEST conc", "category": "TestCat",
            "initial_stock": 10
        }).json()
        aid = a["id"]

        def fire():
            return requests.post(f"{BASE}/api/mutations", headers=h_admin, json={
                "client_request_id": f"conc-{uuid.uuid4()}",
                "article_id": aid, "type": "afboeken", "quantity": 2, "note": ""
            })

        with ThreadPoolExecutor(max_workers=10) as pool:
            results = list(pool.map(lambda _: fire(), range(10)))
        statuses = [r.status_code for r in results]
        after = requests.get(f"{BASE}/api/articles/{aid}", headers=h_admin).json()
        assert after["physical_stock"] >= 0
        assert after["physical_stock"] == 0  # exactly 5 should succeed (5*2=10)
        assert statuses.count(201) == 5
        assert statuses.count(409) == 5

    def test_list_mutations(self, h_admin):
        r = requests.get(f"{BASE}/api/mutations", headers=h_admin)
        assert r.status_code == 200
        muts = r.json()
        assert isinstance(muts, list)
        if muts:
            assert all(m["status"] == "geboekt" for m in muts)


# ---------------- Dashboard ----------------
class TestDashboard:
    def test_dashboard(self, h_admin):
        r = requests.get(f"{BASE}/api/dashboard", headers=h_admin)
        assert r.status_code == 200
        d = r.json()
        for k in ("active_articles", "below_min_count", "below_min", "mutations_24h", "recent_mutations"):
            assert k in d
        assert isinstance(d["recent_mutations"], list)


# ---------------- Users ----------------
class TestUsers:
    def test_list_users_admin_only(self, h_mag):
        r = requests.get(f"{BASE}/api/users", headers=h_mag)
        assert r.status_code == 403

    def test_list_users_admin(self, h_admin):
        r = requests.get(f"{BASE}/api/users", headers=h_admin)
        assert r.status_code == 200
        emails = [u["email"] for u in r.json()]
        assert "admin@douchebeslag.nl" in emails

    def test_create_and_deactivate_user_cannot_login(self, h_admin):
        email = f"test_{uuid.uuid4().hex[:6]}@test.local"
        r = requests.post(f"{BASE}/api/users", headers=h_admin, json={
            "email": email, "name": "TEST User", "role": "monteur", "password": "Password1!"
        })
        assert r.status_code == 201
        uid = r.json()["id"]
        # can login
        login = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": "Password1!"})
        assert login.status_code == 200
        # deactivate
        r2 = requests.patch(f"{BASE}/api/users/{uid}", headers=h_admin, json={"active": False})
        assert r2.status_code == 200
        # cannot login
        login2 = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": "Password1!"})
        assert login2.status_code == 401
