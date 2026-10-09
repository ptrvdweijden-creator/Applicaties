import os
import pytest
import requests

BASE_URL = "https://voorraad-scan.preview.emergentagent.com"


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "admin@douchebeslag.nl", "password": "Admin123!"}, timeout=30)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def magazijn_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "magazijn@douchebeslag.nl", "password": "Magazijn123!"}, timeout=30)
    assert r.status_code == 200
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def monteur_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "monteur@douchebeslag.nl", "password": "Monteur123!"}, timeout=30)
    assert r.status_code == 200
    return r.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def h_admin(admin_token):
    return auth(admin_token)


@pytest.fixture
def h_mag(magazijn_token):
    return auth(magazijn_token)


@pytest.fixture
def h_mont(monteur_token):
    return auth(monteur_token)
