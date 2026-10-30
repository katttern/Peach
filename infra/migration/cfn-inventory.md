# CloudFormation inventory before the Terraform migration

Collected on 2026-10-30 with read-only AWS CLI calls (plus `detect-stack-drift`, which only runs a check),
account `470115905916`, region **us-east-1**. Stack names come from the `Makefile`
(`AUTH_STACK`, `REPORTS_STACK`, `AI_STACK`; all three in us-east-1).

Values of `NoEcho` parameters are not recorded.

## Summary

| Stack | Purpose | Status | Last updated (UTC) | Resources | Deployed template vs repo | Drift |
|---|---|---|---|---|---|---|
| `peach-auth` | Lab 4: Cognito user pool, Google sign-in, hosted login | UPDATE_COMPLETE | 2026-10-28 12:30:25 | 5 | same (`infra/auth.yml`) | IN_SYNC |
| `peach-reports` | Lab 5: weekly report (SQS → builder Lambda in VPC → S3 → mailer Lambda) | UPDATE_COMPLETE | 2026-10-15 07:34:01 | 18 | **differs** (`infra/reports.yml`) | IN_SYNC |
| `peach-ai` | Lab 6: AI agenda parser (Lambda + Function URL, budget) | UPDATE_COMPLETE | 2026-10-29 10:20:53 | 7 | same (`infra/ai.yml`) | IN_SYNC |
| **Total** | | | | **30** | | |

## `peach-auth` (5 resources)

Lab 4: Cognito user pool, Google sign-in, hosted login. Template file: `infra/auth.yml`.

### Resources

| Logical ID | CFN Type | Physical ID |
|---|---|---|
| `GoogleProvider` | `AWS::Cognito::UserPoolIdentityProvider` | `Google` |
| `ManagedLoginBranding` | `AWS::Cognito::ManagedLoginBranding` | `us-east-1_Mxjm62BAS|ee024b8f-8c83-41ce-84c4-83f9764b2ccc` |
| `UserPool` | `AWS::Cognito::UserPool` | `us-east-1_Mxjm62BAS` |
| `UserPoolClient` | `AWS::Cognito::UserPoolClient` | `18a2au33rm9n9t9eck3g9ja3ve` |
| `UserPoolDomain` | `AWS::Cognito::UserPoolDomain` | `peach-katttern-demo` |

### Parameters

| Parameter | Value |
|---|---|
| `DomainPrefix` | `peach-katttern-demo` |
| `GoogleClientId` | `55456539910-81k1aim11cikvatisrmk4ltnrkhc0cdf.apps.googleusercontent.com` |
| `GoogleClientSecret` | *(NoEcho — not recorded)* |
| `ProjectName` | `peach` |
| `SiteUrl` | `https://d344hgmqfilirt.cloudfront.net` |

### Outputs

| Output | Value |
|---|---|
| `Authority` | `https://cognito-idp.us-east-1.amazonaws.com/us-east-1_Mxjm62BAS` |
| `ClientId` | `18a2au33rm9n9t9eck3g9ja3ve` |
| `HostedDomain` | `https://peach-katttern-demo.auth.us-east-1.amazoncognito.com` |
| `UserPoolId` | `us-east-1_Mxjm62BAS` |

### Deployed template vs repo

Identical to `infra/auth.yml` (the only difference is a trailing newline).

### Drift (`detect-stack-drift` + `describe-stack-resource-drifts`)

| Logical ID | Drift status |
|---|---|
| `GoogleProvider` | IN_SYNC |
| `ManagedLoginBranding` | IN_SYNC |
| `UserPool` | NOT_CHECKED (type not supported by drift detection) |
| `UserPoolClient` | IN_SYNC |
| `UserPoolDomain` | IN_SYNC |

## `peach-reports` (18 resources)

Lab 5: weekly report (SQS → builder Lambda in VPC → S3 → mailer Lambda). Template file: `infra/reports.yml`.

### Resources

| Logical ID | CFN Type | Physical ID |
|---|---|---|
| `Bucket` | `AWS::S3::Bucket` | `peach-reports-470115905916` |
| `BuilderFunction` | `AWS::Lambda::Function` | `peach-report-builder` |
| `BuilderLogGroup` | `AWS::Logs::LogGroup` | `/aws/lambda/peach-report-builder` |
| `BuilderQueueMapping` | `AWS::Lambda::EventSourceMapping` | `805e5568-29b9-435e-a157-f6420e80f69a` |
| `BuilderRole` | `AWS::IAM::Role` | `peach-reports-BuilderRole-r2xZOCb3QKeK` |
| `Db` | `AWS::RDS::DBInstance` | `peach-reports-db-rym4qinkxoy9` |
| `DbSg` | `AWS::EC2::SecurityGroup` | `sg-019d5695e862d3f94` |
| `DbSubnetGroup` | `AWS::RDS::DBSubnetGroup` | `peach-reports-dbsubnetgroup-hg7e3l3gpza4` |
| `Dlq` | `AWS::SQS::Queue` | `https://sqs.us-east-1.amazonaws.com/470115905916/report-requests-dlq` |
| `FunctionSg` | `AWS::EC2::SecurityGroup` | `sg-0a67cc72d8da38fba` |
| `MailerFunction` | `AWS::Lambda::Function` | `peach-report-mailer` |
| `MailerLogGroup` | `AWS::Logs::LogGroup` | `/aws/lambda/peach-report-mailer` |
| `MailerPermission` | `AWS::Lambda::Permission` | `peach-reports-MailerPermission-vMOOokPSMEMt` |
| `MailerRole` | `AWS::IAM::Role` | `peach-reports-MailerRole-4Go6vSe1od59` |
| `Queue` | `AWS::SQS::Queue` | `https://sqs.us-east-1.amazonaws.com/470115905916/report-requests` |
| `S3Endpoint` | `AWS::EC2::VPCEndpoint` | `vpce-045dd2665a5136698` |
| `SchedulerRole` | `AWS::IAM::Role` | `peach-reports-SchedulerRole-IEJ0zwiXZLfb` |
| `WeeklySchedule` | `AWS::Scheduler::Schedule` | `peach-weekly-report` |

### Parameters

| Parameter | Value |
|---|---|
| `DbPassword` | *(NoEcho — not recorded)* |
| `FailWeek` | `none` |
| `ImageUri` | `470115905916.dkr.ecr.us-east-1.amazonaws.com/peach-reports:v1` |
| `ProjectName` | `peach` |
| `RecipientEmail` | `katuskatus07@gmail.com` |
| `RouteTableIds` | `rtb-05ae09f34c8d6802f` |
| `ScheduleExpression` | `cron(0 7 ? * MON *)` |
| `SenderEmail` | `katuskatus07@gmail.com` |
| `SubnetIds` | `subnet-07adcde7a890009ea,subnet-05323c8f5e432f29c,subnet-0a9e602cf88bd5189,subnet-096418a535fd517a0,subnet-014c12f9ef54b598c,subnet-086444f97cc50394f` |
| `VpcId` | `vpc-0f9532b2001f7d04e` |

### Outputs

| Output | Value |
|---|---|
| `BucketName` | `peach-reports-470115905916` |
| `BuilderFunction` | `peach-report-builder` |
| `DlqUrl` | `https://sqs.us-east-1.amazonaws.com/470115905916/report-requests-dlq` |
| `QueueUrl` | `https://sqs.us-east-1.amazonaws.com/470115905916/report-requests` |

### Deployed template vs repo

The live stack does **not** match `infra/reports.yml`. The live template (`get-template --template-stage Original`):

- has **no** `DatabaseHost`, `DatabaseSecurityGroupId`, `SenderDomain` parameters;
- **creates its own database**: `DbSg` (security group), `DbSubnetGroup`, `Db` (RDS PostgreSQL db.t3.micro,
  20 GB gp2, private, single-AZ, `BackupRetentionPeriod: 0`, `DeletionProtection: false`) instead of the repo's
  `DatabaseIngress` rule into an existing Lab 4 Aurora security group;
- builds `DATABASE_URL` from `${Db.Endpoint.Address}` instead of `${DatabaseHost}`;
- has **no** SES identities (`SesSenderDomainIdentity`, `SesRecipientIdentity`) and no `SesDkimCname*` outputs.

For the migration the **live template is the source of truth**; the repo file must not be deployed over it.

<details><summary>Full diff (repo → deployed)</summary>

```diff
--- infra/reports.yml (repo)
+++ peach-reports (deployed, Original)
@@ -13,18 +13,9 @@
     Type: List<String>
   ImageUri:
     Type: String
-  DatabaseHost:
-    Type: String
-    Description: Private endpoint hostname of the Lab 4 Aurora cluster
-  DatabaseSecurityGroupId:
-    Type: AWS::EC2::SecurityGroup::Id
-    Description: Security group attached to the Lab 4 Aurora cluster
   DbPassword:
     Type: String
     NoEcho: true
-  SenderDomain:
-    Type: String
-    Description: Verified SES sending domain, without reports@ prefix
   SenderEmail:
     Type: String
   RecipientEmail:
@@ -37,7 +28,7 @@
     Default: none
 
 Resources:
-  # ---------- network and existing Lab 4 database ----------
+  # ---------- network and database ----------
   FunctionSg:
     Type: AWS::EC2::SecurityGroup
     Properties:
@@ -47,14 +38,48 @@
         - Key: PROJECT_NAME
           Value: !Ref ProjectName
 
-  DatabaseIngress:
-    Type: AWS::EC2::SecurityGroupIngress
+  DbSg:
+    Type: AWS::EC2::SecurityGroup
     Properties:
-      GroupId: !Ref DatabaseSecurityGroupId
-      IpProtocol: tcp
-      FromPort: 5432
-      ToPort: 5432
-      SourceSecurityGroupId: !Ref FunctionSg
+      GroupDescription: Aurora, reachable from the report builder only
+      VpcId: !Ref VpcId
+      SecurityGroupIngress:
+        - IpProtocol: tcp
+          FromPort: 5432
+          ToPort: 5432
+          SourceSecurityGroupId: !Ref FunctionSg
+      Tags:
+        - Key: PROJECT_NAME
+          Value: !Ref ProjectName
+
+  DbSubnetGroup:
+    Type: AWS::RDS::DBSubnetGroup
+    Properties:
+      DBSubnetGroupDescription: Reports database
+      SubnetIds: !Ref SubnetIds
+      Tags:
+        - Key: PROJECT_NAME
+          Value: !Ref ProjectName
+
+  Db:
+    Type: AWS::RDS::DBInstance
+    Properties:
+      Engine: postgres
+      DBInstanceClass: db.t3.micro
+      AllocatedStorage: "20"
+      StorageType: gp2
+      DBName: spry
+      MasterUsername: spry
+      MasterUserPassword: !Ref DbPassword
+      DBSubnetGroupName: !Ref DbSubnetGroup
+      VPCSecurityGroups: [!Ref DbSg]
+      PubliclyAccessible: false
+      MultiAZ: false
+      BackupRetentionPeriod: 0
+      DeletionProtection: false
+      Tags:
+        - Key: PROJECT_NAME
+          Value: !Ref ProjectName
 
   S3Endpoint:
     Type: AWS::EC2::VPCEndpoint
@@ -173,7 +198,7 @@
         SecurityGroupIds: [!Ref FunctionSg]
       Environment:
         Variables:
-          DATABASE_URL: !Sub postgresql+psycopg://spry:${DbPassword}@${DatabaseHost}:5432/spry
+          DATABASE_URL: !Sub postgresql+psycopg://spry:${DbPassword}@${Db.Endpoint.Address}:5432/spry
           REPORTS_BUCKET: !Sub ${ProjectName}-reports-${AWS::AccountId}
           FAIL_WEEK: !Ref FailWeek
       Tags:
@@ -321,16 +346,6 @@
       SourceArn: !Sub arn:aws:s3:::${ProjectName}-reports-${AWS::AccountId}
       SourceAccount: !Ref AWS::AccountId
 
-  SesSenderDomainIdentity:
-    Type: AWS::SES::EmailIdentity
-    Properties:
-      EmailIdentity: !Ref SenderDomain
-
-  SesRecipientIdentity:
-    Type: AWS::SES::EmailIdentity
-    Properties:
-      EmailIdentity: !Ref RecipientEmail
-
 Outputs:
   BucketName:
     Value: !Ref Bucket
@@ -340,15 +355,4 @@
     Value: !Ref Dlq
   BuilderFunction:
     Value: !Ref BuilderFunction
-  SesDkimCname1Name:
-    Value: !GetAtt SesSenderDomainIdentity.DkimDNSTokenName1
-  SesDkimCname1Value:
-    Value: !GetAtt SesSenderDomainIdentity.DkimDNSTokenValue1
-  SesDkimCname2Name:
-    Value: !GetAtt SesSenderDomainIdentity.DkimDNSTokenName2
-  SesDkimCname2Value:
-    Value: !GetAtt SesSenderDomainIdentity.DkimDNSTokenValue2
-  SesDkimCname3Name:
-    Value: !GetAtt SesSenderDomainIdentity.DkimDNSTokenName3
-  SesDkimCname3Value:
-    Value: !GetAtt SesSenderDomainIdentity.DkimDNSTokenValue3
+
```

</details>

### Drift (`detect-stack-drift` + `describe-stack-resource-drifts`)

| Logical ID | Drift status |
|---|---|
| `Bucket` | IN_SYNC |
| `BuilderFunction` | IN_SYNC |
| `BuilderLogGroup` | IN_SYNC |
| `BuilderQueueMapping` | NOT_CHECKED (type not supported by drift detection) |
| `BuilderRole` | IN_SYNC |
| `Db` | IN_SYNC |
| `DbSg` | IN_SYNC |
| `DbSubnetGroup` | IN_SYNC |
| `Dlq` | IN_SYNC |
| `FunctionSg` | IN_SYNC |
| `MailerFunction` | IN_SYNC |
| `MailerLogGroup` | IN_SYNC |
| `MailerPermission` | IN_SYNC |
| `MailerRole` | IN_SYNC |
| `Queue` | IN_SYNC |
| `S3Endpoint` | NOT_CHECKED (type not supported by drift detection) |
| `SchedulerRole` | IN_SYNC |
| `WeeklySchedule` | IN_SYNC |

## `peach-ai` (7 resources)

Lab 6: AI agenda parser (Lambda + Function URL, budget). Template file: `infra/ai.yml`.

### Resources

| Logical ID | CFN Type | Physical ID |
|---|---|---|
| `MonthlyBudget` | `AWS::Budgets::Budget` | `peach-monthly` |
| `ParserFunction` | `AWS::Lambda::Function` | `peach-agenda-parser` |
| `ParserInvokePermission` | `AWS::Lambda::Permission` | `peach-ai-ParserInvokePermission-89xH9X8Em6MK` |
| `ParserLogGroup` | `AWS::Logs::LogGroup` | `/aws/lambda/peach-agenda-parser` |
| `ParserRole` | `AWS::IAM::Role` | `peach-ai-ParserRole-XbH92tsbFUwc` |
| `ParserUrl` | `AWS::Lambda::Url` | `arn:aws:lambda:us-east-1:470115905916:function:peach-agenda-parser` |
| `ParserUrlPermission` | `AWS::Lambda::Permission` | `peach-ai-ParserUrlPermission-QdTCW31eNsNe` |

### Parameters

| Parameter | Value |
|---|---|
| `AlertEmail` | `katuskatus07@gmail.com` |
| `AllowedOrigins` | `https://d344hgmqfilirt.cloudfront.net,http://localhost:5173` |
| `CognitoAuthority` | `https://cognito-idp.us-east-1.amazonaws.com/us-east-1_Mxjm62BAS` |
| `CognitoClientId` | `18a2au33rm9n9t9eck3g9ja3ve` |
| `ImageUri` | `470115905916.dkr.ecr.us-east-1.amazonaws.com/peach-reports:1606fa4` |
| `ParserModel` | `us.amazon.nova-pro-v1:0` |
| `ProjectName` | `peach` |

### Outputs

| Output | Value |
|---|---|
| `FunctionName` | `peach-agenda-parser` |
| `ParserUrl` | `https://3rjvngayjd7zx2rt3osrso66dm0bpnkr.lambda-url.us-east-1.on.aws/` |

### Deployed template vs repo

Identical to `infra/ai.yml` (the only difference is a trailing newline).

### Drift (`detect-stack-drift` + `describe-stack-resource-drifts`)

| Logical ID | Drift status |
|---|---|
| `MonthlyBudget` | NOT_CHECKED (type not supported by drift detection) |
| `ParserFunction` | IN_SYNC |
| `ParserInvokePermission` | IN_SYNC |
| `ParserLogGroup` | IN_SYNC |
| `ParserRole` | IN_SYNC |
| `ParserUrl` | IN_SYNC |
| `ParserUrlPermission` | IN_SYNC |

## Notes for the migration

- **No drift** in any stack among the resources CloudFormation can check. Not checked (unsupported types):
  `UserPool` (peach-auth), `BuilderQueueMapping` and `S3Endpoint` (peach-reports), `MonthlyBudget` (peach-ai).
  Compare these by hand (`terraform plan` after import) during the migration.
- Drift detection compares only properties set in the template; it cannot see write-only values such as
  `GoogleProvider` `client_secret` or the RDS master password, and it compares the Lambda `ImageUri` string, not
  the image digest (`peach-reports:v1` lives in a MUTABLE ECR repo).
- `peach-ai` reuses the `peach-reports` ECR repository (`ImageUri` …`/peach-reports:1606fa4`); the ECR repositories
  themselves are not in any stack.
- `peach-ai` depends on `peach-auth` through parameters (`CognitoAuthority`, `CognitoClientId`), not through
  exports; `peach-reports` takes `VpcId`, `SubnetIds`, `RouteTableIds` as plain parameters.
- Secrets to supply to Terraform without committing them: `GoogleClientSecret` (peach-auth), `DbPassword` (peach-reports).

**Totals:** peach-auth 5, peach-reports 18, peach-ai 7 — **30 resources**.
