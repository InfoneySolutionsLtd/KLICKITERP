# Academy integration API

This document is for the ERP integration implementation.

## Configuration

Configure the Academy gateway URL in the ERP server environment:

```env
ACADEMY_GATEWAY_URL=https://api.example.com
```

All requests must be made server-to-server. Never expose API keys in browser code.

## Onboard a school

The flow has two steps: submit the school code, then submit the OTP delivered to
the school administrator by email and SMS.

### 1. Start onboarding

```http
POST {ACADEMY_GATEWAY_URL}/schools/erp/onboarding/start
Content-Type: application/json

{
  "schoolCode": "ABC123"
}
```

School codes are case-insensitive and whitespace is ignored.

Example response:

```json
{
  "schoolId": "2f7d3b5e-1bb2-4f0c-8f5b-b8e23d7f9c40",
  "schoolName": "Example Academy",
  "schoolCode": "ABC123",
  "refId": "2c3ed7f1-8ac8-4e4d-a77a-2f08f3d4e41a",
  "expiresInMinutes": 10,
  "message": "Code sent successfully to your email and phone number",
  "email": "a***@example.com",
  "phoneNumber": "+254****42",
  "emailSent": true,
  "smsSent": true
}
```

Store `schoolId` and `refId`. Never store the OTP.

### 2. Verify onboarding

```http
POST {ACADEMY_GATEWAY_URL}/schools/erp/onboarding/verify
Content-Type: application/json

{
  "schoolId": "2f7d3b5e-1bb2-4f0c-8f5b-b8e23d7f9c40",
  "refId": "2c3ed7f1-8ac8-4e4d-a77a-2f08f3d4e41a",
  "code": "4821"
}
```

Example response:

```json
{
  "school": {
    "id": "2f7d3b5e-1bb2-4f0c-8f5b-b8e23d7f9c40",
    "schoolName": "Example Academy",
    "schoolCode": "ABC123",
    "schoolType": "SCHOOL",
    "schoolStatus": "ACTIVE",
    "countryId": "ke",
    "region": "Nairobi",
    "contactEmail": "admin@example.com",
    "contactPhone": "+254700000000",
    "configComplete": true
  },
  "administrator": {
    "id": "identity-user-uuid",
    "email": "admin@example.com",
    "firstName": "Jane",
    "lastName": "Doe"
  },
  "apiKey": "kfe_<key-id>_<secret>",
  "apiKeyWarning": "Store this key securely. It will not be shown again."
}
```

Store the returned `apiKey` encrypted in the ERP server configuration. The raw
key is returned only once. Do not log it, display it after setup, or send it to
the browser. Each key belongs to one school and one ERP deployment.

## Check subscription entitlement

```http
GET {ACADEMY_GATEWAY_URL}/erp/entitlement
X-ERP-API-Key: kfe_<key-id>_<secret>
Accept: application/json
```

The school is identified by the API key. Do not send a school ID.

Example active response:

```json
{
  "schoolId": "2f7d3b5e-1bb2-4f0c-8f5b-b8e23d7f9c40",
  "product": "ERP",
  "allowed": true,
  "status": "ACTIVE",
  "expiresAt": "2027-01-31T23:59:59.000Z",
  "subscriptionId": "subscription-uuid",
  "checkedAt": "2026-09-23T10:00:00.000Z"
}
```

When inactive, `allowed` is `false` and `status` is usually `EXPIRED` or `NONE`.

## ERP enforcement rules

- Check entitlement during ERP startup.
- Refresh it periodically; 15 minutes is recommended.
- Check again before billing-affecting mutations.
- `allowed: true` permits normal ERP billing operations.
- `allowed: false` blocks new billing-affecting mutations.
- If the Academy API is temporarily unavailable, use the last successful result
  only within a bounded grace period; 24 hours maximum is recommended.
- If no successful entitlement has ever been received, do not activate ERP
  billing.
- A successful expired response overrides any outage grace period.

When a school is deactivated, suspended, or closed, its API key is disabled and
requests using it return `401`.

## HTTP errors

| Status | Meaning | ERP action |
|---|---|---|
| `400` | Invalid request payload | Correct the request. |
| `401` | Invalid/expired OTP or invalid/revoked API key | Restart onboarding or request key rotation. |
| `404` | School code or school not found | Ask for a valid school code. |
| `429` | Too many requests | Apply backoff and retry. |
| `5xx` | Academy service unavailable | Retry with exponential backoff. |

Use exponential backoff for transient failures, for example 1s, 2s, 4s, and 8s.
Do not retry invalid OTPs or invalid API keys.

## Local ERP records

Store the Academy `school.id` as the external school reference in the ERP. The
ERP may copy school data into its own database, but must retain the Academy
school identifier on local records.
