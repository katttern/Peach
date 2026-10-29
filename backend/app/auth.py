"""Cognito JWT verification.

Only Cognito *access* tokens are accepted; the frontend sends
`auth.user.access_token`. Access tokens carry no `aud`, so the app client is
checked through the `client_id` claim instead. ID tokens are rejected.

Kept free of app.db so handlers without a database (agenda-parser) can import it.
"""

from dataclasses import dataclass

import jwt
from fastapi import Header, HTTPException, status

from app.settings import settings


class AuthError(Exception):
    pass


@dataclass(frozen=True)
class Claims:
    sub: str
    email: str | None
    token_use: str


# One client per process: PyJWKClient caches the fetched signing keys.
_jwks_client = jwt.PyJWKClient(
    f"{settings.cognito_authority}/.well-known/jwks.json", cache_keys=True
)


def verify_cognito_token(authorization_header: str | None) -> Claims:
    scheme, _, token = (authorization_header or "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise AuthError("expected 'Authorization: Bearer <token>'")
    token = token.strip()

    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=settings.cognito_authority,
            options={
                "require": ["exp", "iss", "sub", "token_use"],
                "verify_aud": False,
            },
        )
    except jwt.PyJWTError as exc:
        raise AuthError(str(exc)) from exc

    if payload["token_use"] != "access":
        raise AuthError("expected an access token")
    if not settings.cognito_client_id or (
        payload.get("client_id") != settings.cognito_client_id
    ):
        raise AuthError("token was issued for another client")

    return Claims(
        sub=payload["sub"],
        email=payload.get("email"),
        token_use=payload["token_use"],
    )


def require_user(authorization: str | None = Header(default=None)) -> Claims:
    try:
        return verify_cognito_token(authorization)
    except AuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid or missing token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
