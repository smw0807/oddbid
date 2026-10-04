# OddBid 배포: EC2 게임 서버 + Vercel 웹

작성일: 2026-10-04

이 문서는 배포 준비 코드의 설치·운영 절차다. AWS 리소스, 도메인, Vercel 프로젝트, GitHub 배포 환경이 아직 없는 상태를 기준으로 한다. 문서와 예제 추가만으로 클라우드 리소스가 만들어지거나 배포되지는 않는다. 아래 설정은 사용할 계정·리전·도메인을 정한 뒤 진행한다.

## 1. 배포 흐름과 브랜치 규칙

```text
develop 작업 → main 대상 PR → CI 검증 → main 병합
                                         ↓
                              병합 커밋으로 CI 재검증
                                         ↓
                 GitHub production 환경 → AWS OIDC 인증
                                         ↓
                    Docker 이미지 빌드 → ECR push
                                         ↓
                     SSM → EC2 update-server.sh
                                         ↓
                 외부 HTTPS health/revision + origin 검증
                                         ↓
                        Vercel CLI production 배포
```

- `develop` 작업과 `main` 대상 PR은 검증만 한다. PR Preview 배포는 만들지 않는다.
- 운영 배포는 `main`에 반영된 커밋의 CI 성공 후에만 진행한다. `main` 직접 push도 같은 트리거이므로 GitHub 보호 규칙에서 PR 병합을 필수로 설정한다.
- backend 배포와 공개 HTTPS 상태, 운영 frontend origin의 matchmaking preflight 확인이 성공해야 frontend 배포가 시작된다. 서로 다른 시스템의 배포이므로 두 배포가 하나의 트랜잭션처럼 원자적으로 바뀌지는 않는다.
- Vercel은 Git 자동 배포를 사용하지 않는다. 저장소 루트 `vercel.json`의 `git.deploymentEnabled: false`를 유지한다. GitHub Actions의 CLI 배포가 유일한 자동 운영 배포 경로다.
- 서버는 **EC2 한 대, backend 프로세스 한 개**다. Caddy가 `80/443`을 받고 backend `2567`로 프록시한다. 방과 게임 기록은 메모리에 있으므로 배포·재시작·롤백 시 진행 중 게임이 사라질 수 있다. 무중단 배포는 지원하지 않는다.

## 2. 준비할 값

| 값                         | 예시 / 확인 방법                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------- |
| AWS 계정 ID, 리전          | 계정 ID 12자리, 예: `ap-northeast-2`                                                  |
| ECR repository             | 예: `oddbid-server`; URI가 아닌 이름                                                  |
| EC2 instance ID            | 생성 후 `i-...` 확인                                                                  |
| backend DNS                | 예: `api.example.com`; EC2 Elastic IP를 가리키는 DNS A 레코드                         |
| Caddy 연락 이메일          | 인증서 관련 연락을 받을 운영자 이메일                                                 |
| frontend Production origin | Vercel 프로젝트 Domains에서 확인한 고정 주소, 예: `https://oddbid-example.vercel.app` |
| Vercel org/project ID      | 프로젝트 연결 후 `.vercel/project.json`의 `orgId`, `projectId`                        |

`example.com`과 예제 프로젝트 주소는 실제 배포값이 아니다. frontend origin은 스킴·호스트·필요한 포트까지만 쓰며 경로·query·끝의 `/`를 넣지 않는다. 매 배포마다 달라지는 Vercel deployment URL을 허용 목록에 넣지 말고 프로젝트의 고정 Production domain을 사용한다.

EC2 실행 시간, EBS, 공인 IPv4/Elastic IP, ECR 이미지 저장, DNS 및 데이터 전송 비용이 발생할 수 있다. 크레딧이나 무료 범위는 계정마다 다르므로 생성 전 AWS 계산기와 계정의 예산 알림을 확인한다. 이 구성의 실제 용량·월 비용은 아직 측정하지 않았다. [AWS 요금 계산기](https://calculator.aws/)

## 3. Vercel 빈 프로젝트부터 준비

backend의 허용 origin을 정하려면 frontend의 고정 주소가 먼저 필요하다. **처음부터 Git 저장소를 Import해 배포하는 대신**, 빈 프로젝트를 만들고 저장소 루트에 연결한다. 아직 `main`에 배포 설정이 없는 시점의 자동 빌드도 발생시키지 않는 순서다.

운영자가 로컬 저장소 루트에서 실행한다. 다음은 프로젝트 생성·연결 명령이며 frontend 배포 명령이 아니다.

```sh
npx vercel@62.2.0 login
npx vercel@62.2.0 project add oddbid
npx vercel@62.2.0 link --project oddbid
```

여러 팀을 사용하면 사용할 팀을 명시적으로 선택하거나 해당 명령에 `--scope <TEAM_SLUG>`를 붙인다. 이름이 이미 있으면 새 프로젝트를 중복 생성하지 말고 기존 프로젝트를 확인한다. `.vercel/`과 인증정보는 Git에 커밋하지 않는다. [Vercel 프로젝트 CLI](https://vercel.com/docs/cli/project)

Vercel 프로젝트에서 다음을 설정한다.

| 설정                                   | 값                                        |
| -------------------------------------- | ----------------------------------------- |
| Git repository 연결                    | 연결하지 않음; Git 자동 배포 사용 안 함   |
| Root Directory                         | 저장소 루트; `apps/web`으로 변경하지 않음 |
| Node.js Version                        | `24.x`                                    |
| Install Command                        | `npm ci`                                  |
| Build Command                          | `npm run build -w @oddbid/web`            |
| Output Directory                       | `apps/web/dist`                           |
| Production 환경 변수 `VITE_SERVER_URL` | `wss://api.example.com`                   |

설정 파일과 대시보드 override가 충돌하지 않게 한다. `VITE_SERVER_URL`은 브라우저 번들에 포함되는 공개 주소이며 비밀값이 아니다. Vercel **Production**에 등록하고, 뒤의 GitHub `production` variable에도 같은 값을 넣는다. 정적 웹이므로 값 변경 후 새 빌드가 필요하다. [Vercel 환경 변수](https://vercel.com/docs/environment-variables), [프로젝트 Git 설정](https://vercel.com/docs/project-configuration/git-configuration)

프로젝트의 Domains 화면에서 실제 Production domain을 확인한다. 첫 배포 전에는 해당 주소에 웹이 뜨지 않아도 된다. 사용자 지정 frontend 도메인을 사용한다면 먼저 프로젝트에 연결하고 그 HTTPS origin을 EC2에 설정한다.

## 4. AWS 리소스와 EC2 접근

운영용 AWS 계정에서 다음 리소스를 생성한다. CI 역할은 인프라를 생성하는 역할이 아니므로 이 초기 설정은 운영자의 권한으로 진행한다.

1. **ECR private repository**: EC2와 같은 리전, tag immutability 활성화. 이미지는 `<Git SHA>-<Actions run ID>-<attempt>` 태그를 사용하므로 동일 커밋의 재실행도 기존 태그를 덮어쓰지 않는다. rollback용 최근 정상 이미지를 보관한다.
2. **EC2 instance role/profile**: 아래 EC2 trust 및 ECR pull 정책을 적용하고 AWS 관리형 `AmazonSSMManagedInstanceCore`를 연결한다. IAM profile을 EC2에 연결한다.
3. **EC2**: Ubuntu Server 24.04 LTS, `x86_64/amd64`, Docker를 실행할 수 있는 여유 RAM·디스크. 인터넷으로 나갈 수 있는 public subnet과 Internet Gateway 경로를 사용한다. 이 문서는 ARM 인스턴스를 대상으로 하지 않는다.
4. **보안 그룹**: 인터넷 inbound는 TCP `80`, `443`만 허용한다. SSH `22`, 게임 서버 `2567`, Docker 관리 포트를 열지 않는다. 필요하면 IPv6에도 같은 정책을 적용하되 DNS와 서버의 실제 IPv6 구성이 일치해야 한다.
5. **네트워크 outbound**: SSM, ECR/S3 이미지 레이어, Docker/OS 패키지 저장소, 인증서 발급기관에 접근해야 한다. HTTPS와 DNS 등 필요한 outbound 연결을 차단하지 않는다.
6. **Elastic IP + DNS**: EC2에 고정 IP를 연결하고 `api.example.com` A 레코드를 설정한다. IPv6를 구성하지 않았다면 잘못된 AAAA 레코드를 만들지 않는다.
7. **SSM**: EC2가 Systems Manager managed node에 `Online`으로 나타나는지 확인한다. SSM Agent가 없다면 AMI의 User Data 등 초기 설정 경로에서 설치한다. Session Manager로 접속하고 `sudo`를 쓸 수 있어야 한다.

SSM Agent는 AWS로 나가는 연결을 사용하므로 Session Manager를 위해 SSH 포트를 열 필요가 없다. 관리자의 Session Manager 권한은 CI 역할과 별도로 설정한다. [SSM Agent와 네트워크](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-prerequisites.html), [SSM EC2 역할](https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AmazonSSMManagedInstanceCore.html)

## 5. IAM 예제와 GitHub OIDC

`deploy/iam/*.json`은 **치환 전 예제**다. `<AWS_ACCOUNT_ID>`, `<AWS_REGION>`, `<ECR_REPOSITORY>`, `<EC2_INSTANCE_ID>`를 실제 리소스로 바꾼 별도 복사본으로 적용한다. GitHub 역할과 EC2 역할을 분리한다.

| 파일                            | 적용 대상                                                |
| ------------------------------- | -------------------------------------------------------- |
| `ec2-assume-role-policy.json`   | EC2 role의 trust relationship                            |
| `ec2-ecr-pull-policy.json`      | EC2 role에 연결할 inline/customer managed policy         |
| `github-oidc-trust-policy.json` | GitHub 배포 role의 trust relationship                    |
| `github-deploy-policy.json`     | GitHub 배포 role에 연결할 inline/customer managed policy |

EC2 역할에는 위 pull 정책과 `AmazonSSMManagedInstanceCore`를 붙인다. ECR 권한은 지정 repository의 pull에만 제한한다. GitHub 역할에는 지정 ECR repository push, 지정 EC2 한 대에 대한 `AWS-RunShellScript` 실행, 해당 리전의 command 결과 읽기만 부여한다. `GetAuthorizationToken`과 `GetCommandInvocation`의 `Resource: "*"`는 이 API들의 범위를 위한 예외이며 `ssm:*`, `ecr:*`, `AdministratorAccess`를 부여하지 않는다. `AWS-RunShellScript`는 AWS 관리 문서여서 ARN의 account 부분이 비어 있다. [ECR push 권한](https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-push-iam.html), [ECR pull 권한](https://docs.aws.amazon.com/AmazonECR/latest/userguide/repository-policy-examples.html), [SSM 정책 예제](https://docs.aws.amazon.com/systems-manager/latest/userguide/security_iam_id-based-policy-examples.html), [SSM 작업별 리소스 범위](https://docs.aws.amazon.com/service-authorization/latest/reference/list_ssm.html)

`ssm:SendCommand`는 해당 인스턴스에서 root 명령을 실행할 수 있는 권한이다. 배포 workflow와 `main`의 변경 권한을 운영 권한으로 취급한다. EC2 생성/삭제, IAM 변경, 다른 인스턴스 접근, Session Manager 접속 권한은 GitHub 배포 정책에 없다.

AWS IAM에 GitHub OIDC provider가 없다면 다음 값으로 등록하고, 배포 role에 예제 trust policy를 적용한다.

- Provider URL: `https://token.actions.githubusercontent.com`
- Audience: `sts.amazonaws.com`
- 정확한 production subject: `repo:smw0807@19834833/oddbid@1388574029:environment:production`

2026-10-04 GitHub API 읽기 조회로 확인한 저장소 정보:

```json
{
  "repository": "smw0807/oddbid",
  "created_at": "2026-09-26T05:21:10Z",
  "owner_id": 19834833,
  "repository_id": 1388574029,
  "use_default": true,
  "use_immutable_subject": true,
  "sub_claim_prefix": "repo:smw0807@19834833/oddbid@1388574029"
}
```

2026-07-15 이후 생성 저장소의 기본 subject에는 owner/repository의 고정 ID가 포함된다. 이 저장소는 실제 OIDC 설정에서도 immutable 형식임을 확인했다. 과거 형식인 `repo:smw0807/oddbid:environment:production`이나 `repo:smw0807/oddbid:*`로 바꾸지 않는다. fork·이름 변경·이전·OIDC 사용자 지정 시 다시 확인한다. [GitHub AWS OIDC 설정](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws), [OIDC subject 규칙](https://docs.github.com/en/actions/reference/security/oidc#immutable-subject-claims)

읽기 전용 재확인 명령은 다음과 같다. 인증 토큰이나 JWT 원문을 출력할 필요가 없다.

```sh
gh api repos/smw0807/oddbid --jq '{owner_id: .owner.id, repository_id: .id, created_at: .created_at}'
gh api repos/smw0807/oddbid/actions/oidc/customization/sub
```

## 6. GitHub 환경·보호 규칙

저장소 Settings → Environments에서 정확히 소문자 `production` 환경을 만든다. Deployment branches and tags는 **Selected branches and tags**를 선택하고 **branch `main`만** 허용한다. `develop`, PR ref, 모든 tag를 허용하지 않는다. OIDC subject는 환경 이름을 포함하므로 branch 제한은 이 환경 규칙으로 보완해야 한다. [GitHub 환경 배포 제한](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)

다음 항목은 **Repository-level이 아니라 production Environment의 Variables/Secrets**에 등록한다.

| 종류     | 이름                | 값                                                                                           |
| -------- | ------------------- | -------------------------------------------------------------------------------------------- |
| Variable | `AWS_REGION`        | EC2/ECR 리전                                                                                 |
| Variable | `AWS_ROLE_ARN`      | GitHub OIDC 배포 역할 ARN                                                                    |
| Variable | `ECR_REPOSITORY`    | ECR repository 이름                                                                          |
| Variable | `EC2_INSTANCE_ID`   | 배포 대상 EC2 ID                                                                             |
| Variable | `BACKEND_URL`       | `https://api.example.com`                                                                    |
| Variable | `VITE_SERVER_URL`   | `wss://api.example.com`; Vercel Production 값과 동일                                         |
| Variable | `FRONTEND_ORIGIN`   | `https://oddbid-example.vercel.app`; 고정 Production origin이며 EC2 `ALLOWED_ORIGINS`에 포함 |
| Variable | `VERCEL_ORG_ID`     | `.vercel/project.json`의 `orgId`                                                             |
| Variable | `VERCEL_PROJECT_ID` | `.vercel/project.json`의 `projectId`                                                         |
| Secret   | `VERCEL_TOKEN`      | 해당 Vercel 팀/프로젝트를 배포할 수 있는 토큰                                                |

AWS access key/secret key, SSH private key, GitHub PAT를 배포 secrets에 추가하지 않는다. AWS는 매 실행의 짧은 OIDC 세션을 사용하며 EC2는 instance profile을 사용한다. Vercel token은 만료와 회수 절차를 관리하고 로그·문서·Git에 넣지 않는다.

`main` ruleset/branch protection에서 PR 필수, CI required checks, force push 및 삭제 제한을 적용한다. 실제 CI가 한 번 실행된 뒤 표시된 check 이름을 선택한다. 관리자 bypass를 쓰면 PR 없이도 운영 배포가 가능하므로 운영 규칙에 맞게 제한한다. 설정이 저장되었는지 확인하고, 저장소 visibility/요금제에 따라 보호 기능을 사용할 수 없다면 해당 보장을 완료로 기록하지 않는다.

## 7. EC2 최초 설치

초기 bootstrap은 Ubuntu/Docker/Compose/AWS CLI와 설정 파일을 준비한다. 게임 이미지를 배포하는 단계는 다음 main workflow가 담당한다. script는 기존 `.env`와 `server.env`를 덮어쓰지 않으므로, 값 변경은 Session Manager에서 해당 파일을 검토하여 수정한다.

`deploy/bootstrap-ec2.sh` 파일 하나를 SSM Run Command로 전달한다. 운영자의 AWS CLI 로그인을 먼저 완료하고, **배포 준비 코드가 있는 로컬 저장소 루트**에서 아래 값을 실제 값으로 바꿔 실행한다. 로컬 파일을 전달하므로 EC2에 GitHub 토큰을 복사하거나 `main`의 미반영 파일을 다운로드할 필요가 없다.

```sh
export AWS_REGION='ap-northeast-2'
export EC2_INSTANCE_ID='i-REPLACE_ME'
export ODDBID_API_DOMAIN='api.example.com'
export ODDBID_CADDY_EMAIL='ops@example.com'
export ODDBID_FRONTEND_ORIGIN='https://oddbid-example.vercel.app'
export ODDBID_BOOTSTRAP_REQUEST="$(mktemp)"

python3 <<'PY'
import base64
import json
import os
import pathlib
import shlex

payload = base64.b64encode(pathlib.Path('deploy/bootstrap-ec2.sh').read_bytes()).decode()
arguments = ' '.join(shlex.quote(os.environ[key]) for key in (
    'ODDBID_API_DOMAIN', 'ODDBID_CADDY_EMAIL', 'ODDBID_FRONTEND_ORIGIN'
))
command = (
    "set -eu\n"
    "printf '%s' " + shlex.quote(payload) + " | base64 --decode > /tmp/oddbid-bootstrap.sh\n"
    "chmod 700 /tmp/oddbid-bootstrap.sh\n"
    "bash /tmp/oddbid-bootstrap.sh " + arguments
)
pathlib.Path(os.environ['ODDBID_BOOTSTRAP_REQUEST']).write_text(
    json.dumps({'commands': [command], 'executionTimeout': ['1800']})
)
PY

ODDBID_BOOTSTRAP_COMMAND_ID="$(aws ssm send-command \
  --region "$AWS_REGION" \
  --instance-ids "$EC2_INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --parameters "file://$ODDBID_BOOTSTRAP_REQUEST" \
  --timeout-seconds 1800 \
  --query 'Command.CommandId' --output text)"
rm -f "$ODDBID_BOOTSTRAP_REQUEST"

aws ssm get-command-invocation \
  --region "$AWS_REGION" \
  --instance-id "$EC2_INSTANCE_ID" \
  --command-id "$ODDBID_BOOTSTRAP_COMMAND_ID" \
  --query '{Status:Status,ExitCode:ResponseCode,Output:StandardOutputContent,Error:StandardErrorContent}'
```

설치에는 수 분 걸릴 수 있다. 마지막 조회가 `Pending`/`InProgress`라면 나중에 같은 command ID를 다시 조회하거나 SSM 콘솔에서 상태를 확인한다. 전송 직후의 `InvocationDoesNotExist`도 잠시 후 다시 확인한다. `Success` 및 exit code `0`이 되어야 다음 단계로 진행한다. `Failed`/`TimedOut`이면 로그를 확인하고 수정한 뒤 재실행한다. 위 요청 파일에는 코드와 공개 주소만 담고 인증정보를 넣지 않는다. [SSM Run Command](https://docs.aws.amazon.com/systems-manager/latest/userguide/run-command.html)

스크립트를 별도 방식으로 EC2에 전달했다면 root 실행 계약은 `bash bootstrap-ec2.sh API_DOMAIN CADDY_EMAIL FRONTEND_ORIGIN`이다. 설치 뒤 Docker가 실행 중인지, `docker compose version`, `aws --version`, SSM Agent 상태를 확인한다.

실행 결과의 파일 계약:

| EC2 경로                                    | 내용                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `/opt/oddbid/.env`                          | `API_DOMAIN`, `CADDY_EMAIL`; 첫 성공 배포 후 `ODDBID_IMAGE`, `APP_REVISION`, `ODDBID_RELEASE_DIR` 추가 |
| `/opt/oddbid/server.env`                    | backend 환경값. `ALLOWED_ORIGINS=https://oddbid-example.vercel.app`                                    |
| `/opt/oddbid/releases/<SHA-runid-attempt>/` | 해당 배포의 `compose.yaml`, `Caddyfile`, `update-server.sh`                                            |
| `/opt/oddbid/previous.env`                  | 직전 성공 배포 설정; rollback에 사용                                                                   |

`ALLOWED_ORIGINS`는 정확한 HTTPS origin을 쉼표로 구분한다. 예를 들어 frontend 고정 주소와 사용자 지정 도메인을 둘 다 쓴다면 `https://oddbid-example.vercel.app,https://play.example.com`이다. wildcard나 URL 경로, localhost를 운영 허용 목록에 넣지 않는다. 운영 서버는 유효한 허용 목록이 없으면 시작하지 않는다. origin 없는 health check와 Node SDK 연결은 허용하므로 이 기능이 사용자 인증·요청량 제한을 대신하지는 않는다.

GitHub `production`의 `FRONTEND_ORIGIN`은 이 목록에 반드시 포함해야 한다. workflow는 해당 origin으로 공개 backend의 `/matchmake/create/auction`에 `OPTIONS` 요청을 보내고 `Access-Control-Allow-Origin`이 정확히 일치해야 frontend 배포를 허용한다. frontend 고정 도메인을 바꾸면 EC2 허용 목록과 GitHub variable을 함께 갱신한다.

backend `2567`은 호스트의 `127.0.0.1`에만 노출하고 인터넷은 Caddy를 거친다. Caddy의 `/data`, `/config`는 named volume에 저장하므로 배포 시 `docker compose down -v`를 실행하지 않는다. DNS가 Elastic IP를 가리키고 `80/443`이 접근 가능해야 인증서 발급과 갱신이 동작한다. [Caddy 자동 HTTPS](https://caddyserver.com/docs/automatic-https)

## 8. 첫 main 배포와 완료 기준

1. Vercel 빈 프로젝트·Production 주소·환경변수, EC2/SSM/ECR/DNS/bootstrap, IAM 역할, GitHub `production` 설정을 완료한다.
2. `develop`의 배포 준비 코드를 `main` 대상으로 PR로 만든다. CI가 통과하며 AWS/Vercel 배포가 실행되지 않고 Preview URL도 생성되지 않는지 확인한다.
3. PR을 병합한다. `main`의 같은 커밋으로 검증이 다시 성공한 뒤 ECR → SSM → 공개 backend health/revision·frontend origin → Vercel 순서로 실행되어야 한다.
4. 실패하면 다음 단계로 넘어가지 않았는지 확인한다. CI 실패 시 push/deploy 없음, backend 실패 시 Vercel 배포 없음이 기준이다.
5. 아래 운영 확인을 끝낸 뒤 첫 배포 완료로 기록한다.

```sh
curl --fail --show-error --silent https://api.example.com/health
```

응답은 `ok: true`, `service: "oddbid"`, `revision: "<배포한 전체 Git SHA>"`를 포함해야 한다. 로컬 health만 통과하고 공개 HTTPS/TLS가 실패한 상태는 완료가 아니다.

Origin 허용 여부는 다음처럼 실제 고정 frontend origin으로도 확인할 수 있다. 정상 응답의 `Access-Control-Allow-Origin`이 요청한 origin과 같아야 한다.

```sh
curl --fail --show-error --silent --include --request OPTIONS \
  https://api.example.com/matchmake/create/auction \
  --header 'Origin: https://oddbid-example.vercel.app' \
  --header 'Access-Control-Request-Method: POST'
```

- Vercel의 고정 Production URL이 HTTPS로 열리고 frontend 빌드가 지정 backend의 `wss://` 주소를 사용한다.
- 서로 다른 브라우저/기기 3개에서 방 만들기 → 초대 → 준비 → 입찰 → 5라운드 → 결과 → 재경기를 완료한다.
- 새로고침/짧은 연결 끊김 복귀와 봇 연습방을 확인한다.
- frontend origin의 HTTP matchmaking과 WebSocket handshake가 허용되고 다른 브라우저 origin은 차단된다.
- 혼합 콘텐츠, 인증서, CORS, WebSocket 실패 및 브라우저 콘솔 오류가 없는지 확인한다.
- 서버 로그와 EC2 디스크/RAM 여유를 확인하고 배포 SHA·ECR 이미지 태그·Vercel 배포 URL을 기록한다.

로컬 테스트나 CI 통과는 AWS IAM, 실제 SSM, DNS 전파, 인증서 발급, Vercel 권한, 외부 WSS와 실제 iPhone/Safari 동작을 검증하지 않는다. 인프라가 없는 현재 상태에서는 이 항목을 **미검증**으로 둔다.

## 9. 배포 실패와 복구

backend update script는 후보 이미지와 해당 release 설정으로 기동한 뒤 로컬/HTTPS health와 revision을 확인한다. 검증에 성공해야 `/opt/oddbid/.env`를 확정한다. 이전 정상 배포가 있는 상태에서 실패하면 이전 image·revision·release의 compose 설정으로 복원을 시도한다. 최초 배포에는 되돌릴 정상 이미지가 없으므로 장애 원인을 수정한 후 main workflow를 재실행한다.

SSM 단계의 비정상 종료나 rollback 실패가 나면 workflow가 성공으로 보이지 않는지 확인하고 Session Manager에서 상태를 조사한다. EC2 update가 성공한 뒤 외부 health/origin 검사 또는 Vercel 단계만 실패하면 backend는 새 버전인 채로 남을 수 있다. frontend가 새 backend와 호환되면 원인을 수정하고 실패한 배포를 재시도한다. 계약이 호환되지 않으면 backend와 frontend를 같은 정상 버전으로 되돌린다.

수동 backend rollback은 Session Manager에서 root 셸로 직전 정상 설정을 확인한 후, 그 release의 스크립트를 실행한다. 아래 `<...>`는 실제 값으로 바꾸며 `.env` 파일 전체를 공개 채널에 붙이지 않는다.

```sh
sudo -i
grep -E '^(ODDBID_IMAGE|APP_REVISION|ODDBID_RELEASE_DIR)=' /opt/oddbid/previous.env
'/opt/oddbid/releases/<이전-release>/update-server.sh' '<이전-ECR-image-URI>' '<이전-전체-Git-SHA>' '<AWS_REGION>'
curl --fail --show-error --silent https://api.example.com/health
```

성공 후 `/health`의 revision이 목표 SHA인지 확인한다. 이전 release 디렉터리나 이미지가 삭제되었다면 이 절차로 복구할 수 없으므로 정상 release와 ECR 이미지를 함께 보관한다. `previous.env`는 성공한 배포마다 갱신되므로 반복 rollback 전에 대상 버전을 다시 확인한다.

frontend도 해당 Git SHA와 호환되는 Vercel Production 배포로 rollback한다. Vercel 프로젝트의 Deployments에서 기록해 둔 정상 배포를 선택하거나 공식 CLI rollback을 사용한 뒤, 고정 Production URL이 해당 배포를 가리키는지 확인한다. backend만 되돌리고 frontend는 그대로 두는 것은 메시지 계약이 호환되는 경우에만 허용한다. 복구 중에도 방·진행 중 게임은 보존되지 않는다. [Vercel rollback](https://vercel.com/docs/cli/rollback)

장애 복구 후 `develop`에서 원인을 수정하고 PR 검증 → `main` 병합으로 다시 배포한다. 장기 운영 전에는 실제 부하에 근거한 인스턴스 용량, 요청량 제한, 로그/디스크 보관, 게임 종료 후 배포, 프로토콜 호환 정책을 별도로 정한다.

## 10. 배포 준비 코드 검증 기록

2026-10-04, `aa25f9e`의 경매 식별자·재접속 수정까지 포함한 상태에서 확인했다.

- TypeScript 검사와 전체 빌드, 형식 검사.
- 게임·소켓·환경 설정 테스트 41개, Chromium/WebKit E2E 18개, 개발 모드 2개.
- 배포 helper 테스트 6개, 실제 update 스크립트의 격리된 mock 시나리오 7개. 새 배포 성공, revision 불일치, HTTPS 실패, 이미지 pull 실패, 동시 실행 거절, 최초 배포 성공·실패를 포함한다.
- Actionlint 1.7.12, Bash 구문 검사, Docker Compose 설정 및 실제 Caddy 이미지의 설정 검증.
- 로컬 ARM64 Docker 이미지 빌드와 비root 실행, health revision·CORS 및 실제 SDK/WebSocket 방 생성.
- Vercel 환경에서 backend URL 누락 시 빌드 실패, 명시한 WSS 주소로 빌드 성공.

로컬 Apple Silicon의 amd64 교차 빌드는 Docker의 QEMU 실행 중 `npm ci`가 SIGSEGV로 종료되어 완료하지 못했다. 운영 대상은 Ubuntu x86_64이며, CI의 native amd64 컨테이너 검사는 **첫 GitHub 실행에서 확인해야 한다**. 로컬 ARM64 성공을 x86_64 실행 검증으로 간주하지 않는다.

실제 GitHub Actions 실행, EC2 bootstrap/SSM 배포, AWS IAM 권한, DNS·공인 인증서·외부 WSS, Vercel 프로젝트 배포와 실제 모바일 기기는 아직 검증하지 않았다. 클라우드 리소스 생성·계정 설정과 운영 배포는 이 준비 작업에서 실행하지 않았다.
