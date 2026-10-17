# OAK ORIGIN 멤버 커뮤니티: 미리보기 설정

기존 사이트는 그대로 정적 페이지이며 `community.html`이 새 멤버 공간입니다. 가입 신청, 운영자 승인, 실시간 대화, 주제별 대화와 검색, AI 요약이 포함됩니다. 데이터는 기존 사이트나 카카오 오픈채팅에서 가져오지 않습니다. 카카오 오픈채팅 대화의 자동 동기화 기능은 제공하지 않습니다.

## 1. 전용 Supabase 프로젝트

1. **미리보기 전용** Supabase 프로젝트를 만들고 SQL Editor에서 `supabase/schema.sql`을 한 번 실행합니다.
2. Authentication에서 이메일 로그인을 사용하도록 설정합니다. 확인 메일을 사용한다면 미리보기 주소를 허용된 Redirect URL에 추가합니다.
3. Vercel의 `oakorigin` 프로젝트 **Preview** 환경에 다음 값을 설정합니다. 프로덕션 환경에는 아직 추가하지 않습니다.

| 변수 | 값 | 노출 범위 |
| --- | --- | --- |
| `SUPABASE_URL` | Supabase Project URL | 서버가 공개 설정 응답으로 브라우저에 전달 |
| `SUPABASE_ANON_KEY` | Supabase publishable/anon key | 브라우저에 전달, RLS가 접근 제어 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | 서버 전용 Secret |
| `AI_API_KEY` | OpenAI API key | 서버 전용 Secret |
| `AI_MODEL` | JSON 응답을 지원하는 모델 ID | 서버 전용 설정 |

4. 브랜치 미리보기에서 계정을 하나 가입합니다. 이메일 확인을 사용한다면 메일 링크를 완료합니다.
5. Supabase SQL Editor에서 해당 계정을 소유자로 승인합니다. 아래 이메일을 실제 가입 이메일로 바꿔 실행합니다.

```sql
update public.memberships
set status = 'active', role_id = (select id from public.roles where name = '소유자')
where user_id = (select id from auth.users where email = 'owner@example.com');
```

## 사용과 권한

- 새 계정은 기본적으로 승인 대기입니다. 소유자 또는 운영자는 `멤버 관리`에서 상태와 역할을 바꿉니다.
- 역할은 `roles` 테이블에 추가하거나 권한을 수정할 수 있습니다. 기본 역할은 멤버, 모더레이터, 운영자, 소유자입니다. 운영자는 자신 또는 동급·상위 역할을 바꿀 수 없습니다.
- 승인된 멤버만 대화방, 메시지, 주제에 접근할 수 있습니다. 이 제한은 Supabase RLS에서 강제합니다.
- AI 정리는 최근 메시지 80개를 최대 6개 주제로 분류하고 요약합니다. 모더레이터 이상에게만 버튼이 표시되며 서버에서도 권한을 확인합니다. 같은 방은 5분 간격으로 다시 정리할 수 있습니다.
- 검색은 현재 대화방의 최근 결과 200개를 조회합니다. 주제 선택 시 해당 주제에 답글을 이어갈 수 있습니다.

## 검증 후 출시

미리보기에서 회원 승인, 두 계정 간 메시지 수신, 검색, AI 정리, 모바일 화면을 확인한 다음 프로덕션용 Supabase 프로젝트와 환경 변수를 준비합니다. 실제 출시 전에는 개인정보 안내, 운영 정책, 신고·삭제 절차를 추가로 결정해야 합니다. 이 브랜치를 합치기 전까지 현재 운영 사이트에는 변화가 없습니다.
