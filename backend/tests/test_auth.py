import dataclasses
import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException

from app import auth

AUTHORITY = "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TEST"
CLIENT_ID = "test-client"

_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)


class FakeJwksClient:
    """Stands in for PyJWKClient: returns the test public key, no network."""

    def __init__(self, public_key):
        self._public_key = public_key

    def get_signing_key_from_jwt(self, token):
        jwt.get_unverified_header(token)  # garbage fails here, like the real client
        return jwt.PyJWK.from_dict(
            {**jwt.algorithms.RSAAlgorithm.to_jwk(self._public_key, as_dict=True),
             "alg": "RS256", "kid": "test"}
        )


@pytest.fixture(autouse=True)
def fake_cognito(monkeypatch):
    monkeypatch.setattr(
        auth,
        "settings",
        dataclasses.replace(
            auth.settings, cognito_authority=AUTHORITY, cognito_client_id=CLIENT_ID
        ),
    )
    monkeypatch.setattr(auth, "_jwks_client", FakeJwksClient(_key.public_key()))


def make_token(key=_key, **overrides):
    now = int(time.time())
    claims = {
        "sub": "user-123",
        "iss": AUTHORITY,
        "client_id": CLIENT_ID,
        "token_use": "access",
        "iat": now,
        "exp": now + 300,
    }
    claims.update(overrides)
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(claims, key, algorithm="RS256", headers={"kid": "test"})


def bearer(token):
    return f"Bearer {token}"


def test_valid_access_token():
    claims = auth.verify_cognito_token(bearer(make_token()))
    assert claims == auth.Claims(sub="user-123", email=None, token_use="access")


def test_lowercase_bearer_scheme_is_accepted():
    assert auth.verify_cognito_token(f"bearer {make_token()}").sub == "user-123"


def test_expired_token():
    past = int(time.time()) - 3600
    with pytest.raises(auth.AuthError):
        auth.verify_cognito_token(bearer(make_token(iat=past - 300, exp=past)))


def test_foreign_issuer():
    token = make_token(iss="https://cognito-idp.us-east-1.amazonaws.com/other")
    with pytest.raises(auth.AuthError):
        auth.verify_cognito_token(bearer(token))


def test_foreign_client_id():
    with pytest.raises(auth.AuthError):
        auth.verify_cognito_token(bearer(make_token(client_id="someone-else")))


def test_id_token_is_rejected():
    token = make_token(
        token_use="id", client_id=None, aud=CLIENT_ID, email="a@example.com"
    )
    with pytest.raises(auth.AuthError):
        auth.verify_cognito_token(bearer(token))


def test_signature_from_another_key():
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    with pytest.raises(auth.AuthError):
        auth.verify_cognito_token(bearer(make_token(key=other)))


def test_unconfigured_client_id_rejects_everything(monkeypatch):
    monkeypatch.setattr(
        auth, "settings", dataclasses.replace(auth.settings, cognito_client_id="")
    )
    with pytest.raises(auth.AuthError):
        auth.verify_cognito_token(bearer(make_token(client_id="")))


@pytest.mark.parametrize(
    "header", [None, "", make_token(), "Token abc", "Bearer", "Bearer   "]
)
def test_missing_bearer_scheme(header):
    with pytest.raises(auth.AuthError):
        auth.verify_cognito_token(header)


@pytest.mark.parametrize("token", ["garbage", "a.b.c", "eyJhbGciOi.x.y"])
def test_garbage_token(token):
    with pytest.raises(auth.AuthError):
        auth.verify_cognito_token(bearer(token))


def test_require_user_returns_claims():
    assert auth.require_user(bearer(make_token())).sub == "user-123"


def test_require_user_maps_auth_error_to_401():
    with pytest.raises(HTTPException) as exc:
        auth.require_user("Bearer garbage")
    assert exc.value.status_code == 401
    assert exc.value.headers == {"WWW-Authenticate": "Bearer"}

