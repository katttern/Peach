# Spry: C4 container diagram (as deployed, 2026-10-29)

Level 2 (containers) of the **real** deployment, following `CLAUDE.md` → "Deployed reality".
Arrows **P1–P3** form the **parse** path (the model only suggests); **S1–S4** form the **save**
path (only a person's Save writes).

```mermaid
flowchart LR
    user(["Person<br/>meeting organizer"])

    subgraph browser["Browser"]
        spa["SPA<br/>React 18 + Vite<br/>meetings, agenda form,<br/>Paste an agenda"]
    end

    subgraph global["AWS global edge"]
        cf["CloudFront E37V7OK25PWZRX<br/>default → S3 via OAC<br/>/api/* → ALB, HTTP<br/>CloudFront Function peach-spa-rewrite"]
    end

    subgraph eun1["AWS eu-north-1"]
        s3["S3 peach-frontend-katttern<br/>static bundle<br/>index.html no-cache"]
        alb["ALB peach-alb<br/>HTTP :80"]
        subgraph task["ECS Fargate task peach-backend, service peach-service"]
            api["API container<br/>FastAPI + Uvicorn<br/>/api/meetings, /api/meetings/{id}/agenda<br/>require_user, owner_sub<br/>Alembic on start"]
            pg[("PostgreSQL 16 sidecar<br/>meetings, agendas<br/>NO volume: wiped on every rollout")]
        end
    end

    subgraph use1["AWS us-east-1"]
        cognito["Cognito user pool us-east-1_Mxjm62BAS<br/>Hosted UI, Google IdP<br/>JWKS"]
        subgraph ai["Stack peach-ai, outside any VPC"]
            parser["Lambda peach-agenda-parser<br/>Function URL, AuthType NONE<br/>checks the Cognito JWT, no DB<br/>app.ai.agenda_lambda.handler"]
            logs[("CloudWatch Logs<br/>one JSON line per parse<br/>7 days")]
            budget["AWS Budget peach-monthly<br/>$5/month, email alerts"]
        end
        bedrock["Amazon Bedrock<br/>Converse: Nova Pro, active<br/>Mantle Messages API: Claude,<br/>no account access"]
        subgraph reports["Stack peach-reports, Lab 5, VPC without NAT"]
            builder["Lambda report-builder<br/>in VPC"]
            rds[("RDS PostgreSQL<br/>report data")]
        end
    end

    user --> spa
    spa -- "load app" --> cf --> s3
    spa -- "sign in, OIDC code flow" --> cognito

    spa -- "P1 POST {text, today, tz}<br/>Bearer access token" --> parser
    parser -- "P2 converse + record_agenda tool<br/>IAM bedrock:InvokeModel" --> bedrock
    parser -. "verify JWT via JWKS" .-> cognito
    parser -- "P3 suggestion JSON → pre-filled form<br/>with 'suggested' badges" --> spa
    parser -. "agenda_parsed log" .-> logs

    spa -- "S1 PUT /api/meetings/{id}/agenda<br/>agenda + ai_suggestion, Bearer" --> cf
    cf -- "S2 /api/*" --> alb
    alb -- "S3" --> api
    api -. "verify JWT via JWKS" .-> cognito
    api -- "S4 upsert agenda, owner check<br/>SQL on localhost:5432" --> pg

    builder --> rds

    classDef parse stroke:#b45309,stroke-width:2px
    classDef save stroke:#1d4ed8,stroke-width:2px
    class parser,bedrock parse
    class api,pg save
```

## Notes

- **The parse path never touches a database.** The Lambda has no VPC config and no DB
  credentials, and its handler cannot import `app.db` (enforced by a test). Its IAM role allows
  Bedrock inference and its own log group only.
- **The save path is the only writer.** A person's Save goes through the regular validated API,
  which also stores `ai_suggestion`, `ai_model` and `ai_prompt_version` for later v1/v2 comparisons.
- **Regions:** the API and its data are in **eu-north-1**. Cognito, the parser, Bedrock and the
  Lab 5 reports are in **us-east-1**. The browser calls the parser's Function URL directly
  (cross-origin, CORS allows the CloudFront origin only), and calls the API same-origin through CloudFront.
- **The parser is outside the VPC on purpose.** The reports VPC has no NAT, so reaching Bedrock or Cognito
  from inside it would need interface endpoints at $7.30/month per AZ. See
  [ADR 0006](../adr/0006-llm-agenda-parsing.md).
- **Model switch:** the CloudFormation parameter `ParserModel`. `anthropic.*` goes through Mantle,
  anything else through Converse. The deployed value is `us.amazon.nova-pro-v1:0`.
- **Known risk:** the PostgreSQL sidecar has no volume. Every ECS rollout or task restart erases
  all meetings and agendas.
