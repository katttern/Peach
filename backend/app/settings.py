"""Runtime settings read from the environment.

Kept free of app.db so handlers without a database (agenda-parser) can import it.
"""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    parser_model: str
    aws_region: str
    cognito_authority: str
    cognito_client_id: str
    cors_origins: tuple[str, ...]

    @classmethod
    def from_env(cls) -> "Settings":
        origins = os.environ.get("CORS_ORIGINS", "")
        return cls(
            parser_model=os.environ.get("PARSER_MODEL", "us.amazon.nova-pro-v1:0"),
            aws_region=os.environ.get("AWS_REGION", "us-east-1"),
            cognito_authority=os.environ.get(
                "COGNITO_AUTHORITY",
                "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_Mxjm62BAS",
            ).rstrip("/"),
            cognito_client_id=os.environ.get("COGNITO_CLIENT_ID", ""),
            cors_origins=tuple(o.strip() for o in origins.split(",") if o.strip()),
        )


settings = Settings.from_env()
