# Non-secret values only. google_client_secret and db_password are sensitive
# workspace variables in HCP Terraform (peach_katttern / peach-dev).
project_name = "peach"
region       = "us-east-1"

# ---------- auth ----------
domain_prefix    = "peach-katttern-demo"
site_url         = "https://d344hgmqfilirt.cloudfront.net"
google_client_id = "55456539910-81k1aim11cikvatisrmk4ltnrkhc0cdf.apps.googleusercontent.com"

# ---------- weekly report ----------
vpc_id = "vpc-0f9532b2001f7d04e"
subnet_ids = [
  "subnet-07adcde7a890009ea",
  "subnet-05323c8f5e432f29c",
  "subnet-0a9e602cf88bd5189",
  "subnet-096418a535fd517a0",
  "subnet-014c12f9ef54b598c",
  "subnet-086444f97cc50394f",
]
route_table_ids          = ["rtb-05ae09f34c8d6802f"]
report_builder_image_uri = "470115905916.dkr.ecr.us-east-1.amazonaws.com/peach-reports:v1"
sender_email             = "katuskatus07@gmail.com"
recipient_email          = "katuskatus07@gmail.com"
schedule_expression      = "cron(0 7 ? * MON *)"
fail_week                = "none"

# ---------- agenda parser ----------
parser_image_uri = "470115905916.dkr.ecr.us-east-1.amazonaws.com/peach-reports:1606fa4"
parser_model     = "us.amazon.nova-pro-v1:0"
allowed_origins  = ["https://d344hgmqfilirt.cloudfront.net", "http://localhost:5173"]
alert_email      = "katuskatus07@gmail.com"
