# Judge0 Setup Guide

This project uses a private Judge0 instance for DSA code execution instead of the public Judge0 API.

## Requirements

- Docker Desktop installed and running
- Command Prompt or PowerShell
- Node/backend app configured to use the local Judge0 endpoint
- Free local port: `2358`

Judge0 does not run as one single dependency-free container. The Docker Compose setup starts multiple services:

- Judge0 API server
- Judge0 workers
- Redis
- PostgreSQL

## Local Run

In this project, the Judge0 folder is already present at:

```text
judge0\judge0-v1.13.1
```

So most developers do not need to download or install Judge0 again. From the project root, run:

```cmd
cd judge0\judge0-v1.13.1
docker compose up -d
```

Stop Judge0:

```cmd
docker compose down
```

Restart after config changes:

```cmd
docker compose down
docker compose up -d
```

## Fresh Installation Only If Missing

Use this section only if the `judge0` folder is not present in the project root.

```cmd
mkdir judge0
cd judge0
curl -L https://github.com/judge0/judge0/releases/download/v1.13.1/judge0-v1.13.1.zip -o judge0.zip
powershell -Command "Expand-Archive -Path judge0.zip -DestinationPath ."
cd judge0-v1.13.1
```

Edit `judge0.conf` before starting containers.

Required local settings:

```env
ENABLE_WAIT_RESULT=true
ENABLE_BATCHED_SUBMISSIONS=true

REDIS_PASSWORD=<strong-local-redis-password>
POSTGRES_PASSWORD=<strong-local-postgres-password>
```

Recommended DSA sandbox settings:

```env
CPU_TIME_LIMIT=2
MAX_CPU_TIME_LIMIT=5
CPU_EXTRA_TIME=0.5
MAX_CPU_EXTRA_TIME=2
WALL_TIME_LIMIT=5
MAX_WALL_TIME_LIMIT=8

MEMORY_LIMIT=256000
MAX_MEMORY_LIMIT=512000
STACK_LIMIT=64000
MAX_STACK_LIMIT=128000
MAX_FILE_SIZE=1024
MAX_MAX_FILE_SIZE=4096
MAX_PROCESSES_AND_OR_THREADS=60
MAX_MAX_PROCESSES_AND_OR_THREADS=120
```

## Verify Judge0

Open these URLs or call them with `curl`:

```cmd
curl http://127.0.0.1:2358/about
curl http://127.0.0.1:2358/version
curl http://127.0.0.1:2358/languages
curl http://127.0.0.1:2358/statuses
curl http://127.0.0.1:2358/config_info
curl http://127.0.0.1:2358/workers
```

Check containers:

```cmd
docker compose ps
```

## Backend Configuration

Set these in `server/.env`:

```env
JUDGE0_BASE_URL=http://127.0.0.1:2358
JUDGE0_USE_AUTH=false
JUDGE0_AUTH_TOKEN=
JUDGE0_SUBMISSION_MODE=batch_async
JUDGE0_TIMEOUT_MS=15000
JUDGE0_POLL_INTERVAL_MS=500
JUDGE0_MAX_POLL_ATTEMPTS=60

DSA_DEFAULT_TIMEOUT_MS=1200
JUDGE0_CPU_TIME_LIMIT_SECONDS=1.2
JUDGE0_WALL_TIME_LIMIT_SECONDS=3
JUDGE0_JAVA_TIME_MULTIPLIER=1.5
JUDGE0_PYTHON_TIME_MULTIPLIER=1.5
JUDGE0_JAVASCRIPT_TIME_MULTIPLIER=1.5

JUDGE0_MEMORY_LIMIT_KB=256000
JUDGE0_STACK_LIMIT_KB=64000
JUDGE0_MAX_FILE_SIZE_KB=1024
JUDGE0_MAX_PROCESSES_AND_THREADS=60
```

The app applies per-test runtime limits from the backend. Judge0 global limits are kept slightly higher so compilation, especially Java compilation, does not incorrectly fail as TLE or compilation timeout.

Effective default runtime limits:

- C/C++: `1.2s`
- Java: `1.8s`
- Python: `1.8s`
- JavaScript: `1.8s`

## Manual Submission Test

Example Java submission:

```cmd
curl -X POST "http://127.0.0.1:2358/submissions?base64_encoded=false&wait=true" ^
  -H "Content-Type: application/json" ^
  -d "{\"language_id\":62,\"source_code\":\"public class Main { public static void main(String[] args) { System.out.println(\\\"Hello Judge0\\\"); } }\",\"stdin\":\"\",\"cpu_time_limit\":1.8,\"wall_time_limit\":3,\"memory_limit\":256000}"
```

Expected status:

```json
{ "id": 3, "description": "Accepted" }
```

## Useful Language IDs

Common Judge0 CE language IDs used by the app:

- C: `50`
- C++: `54`
- Java: `62`
- Python: `71`
- JavaScript: `63`

Always confirm with:

```cmd
curl http://127.0.0.1:2358/languages
```

## Expected Product Statuses

Judge0 statuses are mapped by the backend into product-level statuses:

- `CORRECT_ANSWER`
- `WRONG_ANSWER`
- `TLE`
- `MLE`
- `OLE`
- `RUNTIME_ERROR`
- `COMPILE_ERROR`
- `INTERNAL_ERROR`

For MLE/OLE, Judge0 CE may not always return a direct status. The backend also checks stderr/message/sandbox signals such as memory allocation errors, file-size limits, and output-limit signals.

## Local DSA Verification

1. Start Judge0:

```cmd
cd judge0\judge0-v1.13.1
docker compose up -d
```

2. Start the backend.

3. Start the frontend.

4. Open the temporary local DSA route:

```text
http://localhost:8081/dsa-round
```

5. Test:

- Correct solution should show `Correct Answer`
- Wrong output should show `Wrong Answer`
- Infinite loop or very slow loop should show `Time Limit Exceeded`
- Invalid syntax should show `Compilation Error`
- Runtime crash should show `Runtime Error`
- Huge output should show `Output Limit Exceeded`
- Huge allocation should show `Memory Limit Exceeded`

## Production Notes

- Do not expose Judge0 directly to the public internet unless absolutely required.
- Prefer private networking: backend can reach Judge0, browsers cannot.
- If public exposure is required, put Judge0 behind HTTPS, a reverse proxy, strict rate limits, and `X-Auth-Token`.
- Store `JUDGE0_AUTH_TOKEN`, Redis password, and Postgres password in a secret manager.
- Scale workers independently when submission volume grows.
- Monitor:
  - `/workers`
  - `/config_info`
  - `/statuses`
  - container CPU/memory
  - queue size
  - worker failures
- Keep per-user and per-IP DSA submission rate limits enabled.
- Running untrusted code is risky. Keep Judge0 isolated, disable sandbox network access, restrict container privileges, and avoid sharing host-sensitive volumes.

## Troubleshooting

If valid Java code shows `Compilation time limit exceeded`, Judge0 global CPU limits are probably too low. Keep Judge0 global CPU at least `2s` and enforce stricter per-test limits from the backend.

If slow code is accepted, make sure the code is not optimized away. For TLE tests, use a changing value and print it.

If `/languages` works but submissions hang:

```cmd
docker compose logs workers
docker compose logs server
docker compose ps
```

If backend cannot connect, confirm:

```cmd
curl http://127.0.0.1:2358/about
```

Then verify `JUDGE0_BASE_URL` in `server/.env`.
