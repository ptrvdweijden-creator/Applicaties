"""Security audit regression tests.

Covers: no seed recreation, forced password change flow, rate limit,
admin user create/reset forcing password change, CORS restriction, role checks.
"""
import os
import time
import uuid
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else None
# Fall back to frontend .env since backend tests run server-side
if not BASE_URL:
    from pathlib import Path
    env = (Path(__file__).resolve().parents[2] / "frontend" / ".env").read_text()
    for line in env.splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL"):
            BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")

ADMIN = {"email": "test-admin@test.local", "password": "TestAdmin2026x"}
MONTEUR = {"email": "test-monteur@test.local", "password": "TestMonteur2026x"}
FORCED = {"email": "test-forced@test.local", "password": "TempForced2026x"}

MONGO = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
DB = MONGO[os.environ.get("DB_NAME", "test_database")]


def _clear_failures():
    DB.login_failures.delete_many({})


@pytest.fixture(autouse=True)
def _reset_rate_limit():
    _clear_failures()
    yield
    _clear_failures()


def _login(email, password):
    return requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)


# --- Deactivated accounts ---
class TestDeactivatedAccounts:
    def test_magazijn_default_password_fails(self):
        r = _login("magazijn@douchebeslag.nl", "Magazijn123!")
        assert r.status_code == 401, r.text

    def test_monteur_default_password_fails(self):
        r = _login("monteur@douchebeslag.nl", "Monteur123!")
        assert r.status_code == 401

    def test_accounts_exist_but_inactive(self):
        for e in ("magazijn@douchebeslag.nl", "monteur@douchebeslag.nl"):
            u = DB.users.find_one({"email": e})
            assert u is not None, f"{e} missing"
            assert u.get("active") is False


# --- Rate limiting ---
class TestRateLimit:
    def test_account_lockout_after_5_failures(self):
        _clear_failures()
        for i in range(5):
            r = _login(MONTEUR["email"], "WrongPassword!")
            assert r.status_code == 401, f"attempt {i}: {r.status_code}"
        # 6th with correct password: still blocked
        r = _login(MONTEUR["email"], MONTEUR["password"])
        assert r.status_code == 429, r.text
        assert "15 minuten" in r.json().get("detail", "")
        _clear_failures()
        r = _login(MONTEUR["email"], MONTEUR["password"])
        assert r.status_code == 200

    def test_unknown_email_returns_same_401(self):
        _clear_failures()
        r = _login(f"nonexistent-{uuid.uuid4().hex[:6]}@test.local", "whatever")
        assert r.status_code == 401
        assert "onjuist" in r.json().get("detail", "").lower()


# --- Forced password change flow ---
class TestForcedChange:
    def _ensure_forced_user(self):
        """Reset test-forced to known forced state."""
        from pwdlib import PasswordHash
        hasher = PasswordHash.recommended()
        DB.users.update_one(
            {"email": FORCED["email"]},
            {"$set": {"password_hash": hasher.hash(FORCED["password"]),
                      "must_change_password": True, "active": True, "role": "magazijn"},
             "$inc": {"token_version": 1}},
        )

    def test_forced_login_and_change_flow(self):
        self._ensure_forced_user()
        _clear_failures()
        r = _login(FORCED["email"], FORCED["password"])
        assert r.status_code == 200
        data = r.json()
        token = data["access_token"]
        assert data["user"]["must_change_password"] is True

        h = {"Authorization": f"Bearer {token}"}
        # /articles blocked
        r = requests.get(f"{BASE_URL}/api/articles", headers=h, timeout=10)
        assert r.status_code == 403
        # /auth/me allowed
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=h, timeout=10)
        assert r.status_code == 200
        assert r.json()["must_change_password"] is True

        # Wrong current -> 400
        r = requests.post(f"{BASE_URL}/api/auth/change-password", headers=h,
                          json={"current_password": "WrongCurrent1", "new_password": "NewValid2026x"}, timeout=10)
        assert r.status_code == 400

        # Weak <10 chars -> 422
        r = requests.post(f"{BASE_URL}/api/auth/change-password", headers=h,
                          json={"current_password": FORCED["password"], "new_password": "Short1!"}, timeout=10)
        assert r.status_code == 422

        # No digit -> 422
        r = requests.post(f"{BASE_URL}/api/auth/change-password", headers=h,
                          json={"current_password": FORCED["password"], "new_password": "NoDigitsHere!"}, timeout=10)
        assert r.status_code == 422

        # Default forbidden -> 422
        r = requests.post(f"{BASE_URL}/api/auth/change-password", headers=h,
                          json={"current_password": FORCED["password"], "new_password": "Admin123!"}, timeout=10)
        assert r.status_code == 422

        # Valid change
        new_pw = f"ChangedForced{uuid.uuid4().hex[:6]}1"
        r = requests.post(f"{BASE_URL}/api/auth/change-password", headers=h,
                          json={"current_password": FORCED["password"], "new_password": new_pw}, timeout=10)
        assert r.status_code == 200, r.text
        payload = r.json()
        new_token = payload["access_token"]
        assert new_token != token
        assert payload["user"]["must_change_password"] is False

        # Old token invalid
        r = requests.get(f"{BASE_URL}/api/articles", headers=h, timeout=10)
        assert r.status_code == 401

        # New token works
        r = requests.get(f"{BASE_URL}/api/articles", headers={"Authorization": f"Bearer {new_token}"}, timeout=10)
        assert r.status_code == 200

        # Restore for subsequent tests
        self._ensure_forced_user()


# --- Admin user management ---
class TestAdminUserMgmt:
    @pytest.fixture
    def admin_token(self):
        _clear_failures()
        r = _login(ADMIN["email"], ADMIN["password"])
        assert r.status_code == 200, r.text
        return r.json()["access_token"]

    def test_create_user_forces_change(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        email = f"test_{uuid.uuid4().hex[:6]}@test.local"
        temp_pw = f"TempNew{uuid.uuid4().hex[:4]}1"
        r = requests.post(f"{BASE_URL}/api/users", headers=h,
                          json={"email": email, "name": "Temp", "role": "monteur", "password": temp_pw}, timeout=10)
        assert r.status_code == 201, r.text
        created = r.json()
        assert created["must_change_password"] is True
        new_id = created["id"]

        # Login as new user -> must_change_password true
        _clear_failures()
        r = _login(email, temp_pw)
        assert r.status_code == 200
        target_token = r.json()["access_token"]
        assert r.json()["user"]["must_change_password"] is True

        # Admin resets password via PATCH -> must_change_password true, old token invalid
        reset_pw = f"ResetPw{uuid.uuid4().hex[:4]}1"
        r = requests.patch(f"{BASE_URL}/api/users/{new_id}", headers=h, json={"password": reset_pw}, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["must_change_password"] is True

        th = {"Authorization": f"Bearer {target_token}"}
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=th, timeout=10)
        assert r.status_code == 401, "old token should be invalidated after admin password reset"

        # Deactivation also invalidates token
        _clear_failures()
        r = _login(email, reset_pw)
        assert r.status_code == 200
        new_token = r.json()["access_token"]
        r = requests.patch(f"{BASE_URL}/api/users/{new_id}", headers=h, json={"active": False}, timeout=10)
        assert r.status_code == 200
        r = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {new_token}"}, timeout=10)
        assert r.status_code == 401

        # cleanup
        DB.users.delete_one({"email": email})


# --- CORS ---
class TestCORS:
    def test_evil_origin_blocked(self):
        r = requests.options(f"{BASE_URL}/api/auth/login",
                             headers={"Origin": "https://evil.example.com",
                                      "Access-Control-Request-Method": "POST",
                                      "Access-Control-Request-Headers": "content-type"}, timeout=10)
        assert r.headers.get("access-control-allow-origin") != "https://evil.example.com"
        assert "*" not in (r.headers.get("access-control-allow-origin") or "")

    def test_preview_origin_allowed(self):
        origin = BASE_URL
        r = requests.options(f"{BASE_URL}/api/auth/login",
                             headers={"Origin": origin,
                                      "Access-Control-Request-Method": "POST",
                                      "Access-Control-Request-Headers": "content-type"}, timeout=10)
        assert r.headers.get("access-control-allow-origin") == origin, dict(r.headers)


# --- Regression: roles ---
class TestRoleRegression:
    def test_monteur_cannot_create_article(self):
        _clear_failures()
        r = _login(MONTEUR["email"], MONTEUR["password"])
        assert r.status_code == 200
        h = {"Authorization": f"Bearer {r.json()['access_token']}"}
        r = requests.post(f"{BASE_URL}/api/articles", headers=h,
                          json={"article_number": f"TEST-{uuid.uuid4().hex[:6]}",
                                "description": "test", "category": "TEST"}, timeout=10)
        assert r.status_code == 403

    def test_admin_can_read_core_endpoints(self):
        _clear_failures()
        r = _login(ADMIN["email"], ADMIN["password"])
        assert r.status_code == 200
        h = {"Authorization": f"Bearer {r.json()['access_token']}"}
        for ep in ("/api/articles", "/api/mutations", "/api/projects", "/api/reservations", "/api/supplier-orders"):
            resp = requests.get(f"{BASE_URL}{ep}", headers=h, timeout=15)
            assert resp.status_code in (200,), f"{ep}: {resp.status_code} {resp.text[:200]}"
